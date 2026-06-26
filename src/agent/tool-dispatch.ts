import {
  applyPatchTool,
  gitDiffTool,
  listFilesTool,
  readFileTool,
  searchFilesTool,
  shellTool,
} from "../tools/index.js";
import { resolveToolPath } from "../tools/path.js";
import { truncateText } from "../tools/truncation.js";
import type { TextTruncation } from "../tools/types.js";
import type { OpenRouterMessage, OpenRouterToolCall } from "../openrouter/types.js";

export interface ToolDispatchOptions {
  cwd: string;
  signal?: AbortSignal;
  maxResultBytes?: number;
  maxResultLines?: number;
}

export interface ToolDispatchResult {
  toolCall: OpenRouterToolCall;
  message: OpenRouterMessage;
  output: unknown;
  ok: boolean;
  durationMs: number;
  truncation: TextTruncation;
}

const DEFAULT_TOOL_RESULT_BYTES = 48 * 1024;
const DEFAULT_TOOL_RESULT_LINES = 1_200;

export async function dispatchNativeToolCall(
  toolCall: OpenRouterToolCall,
  options: ToolDispatchOptions,
): Promise<ToolDispatchResult> {
  const startedAt = performance.now();
  const rawArguments = parseToolArguments(toolCall);
  let ok = false;
  let output: unknown;

  if (options.signal?.aborted) {
    output = abortedToolOutput();
  } else if (!rawArguments.ok) {
    output = {
      ok: false,
      error: rawArguments.error,
    };
  } else {
    try {
      output = await runNativeTool(
        toolCall.function.name,
        rawArguments.value,
        options.cwd,
        options.signal,
      );
    } catch (error) {
      output = {
        ok: false,
        error: {
          code: "TOOL_DISPATCH_ERROR",
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
    ok = resultOk(output);
  }

  const outputJson = JSON.stringify(output);
  const truncated = truncateText(outputJson, {
    maxBytes: options.maxResultBytes ?? DEFAULT_TOOL_RESULT_BYTES,
    maxLines: options.maxResultLines ?? DEFAULT_TOOL_RESULT_LINES,
  });
  const content = JSON.stringify({
    tool: toolCall.function.name,
    ok,
    output_format: "json",
    output: truncated.text,
    truncation: truncated.truncation,
  });

  return {
    toolCall,
    message: {
      role: "tool",
      tool_call_id: toolCall.id,
      content,
    },
    output,
    ok,
    durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    truncation: truncated.truncation,
  };
}

async function runNativeTool(
  name: string,
  args: Record<string, unknown>,
  cwd: string,
  signal: AbortSignal | undefined,
): Promise<unknown> {
  switch (name) {
    case "read_file":
      return readFileTool({
        cwd,
        path: requiredString(args.path, "path"),
        maxBytes: optionalInteger(args.maxBytes),
        maxLines: optionalInteger(args.maxLines),
      });

    case "list_files":
      return listFilesTool({
        cwd,
        path: optionalString(args.path) ?? ".",
        recursive: optionalBoolean(args.recursive),
        maxDepth: optionalInteger(args.maxDepth),
        maxEntries: optionalInteger(args.maxEntries),
      });

    case "search_files":
      return searchFilesTool({
        cwd,
        pattern: requiredString(args.pattern, "pattern"),
        path: optionalString(args.path),
        maxMatches: optionalInteger(args.maxMatches),
        useRipgrep: optionalBoolean(args.useRipgrep),
      });

    case "shell": {
      const requestedCwd = optionalString(args.cwd);
      return shellTool({
        cwd: requestedCwd ? resolveToolPath(requestedCwd, cwd) : cwd,
        command: requiredString(args.command, "command"),
        args: optionalStringArray(args.args),
        timeoutMs: optionalInteger(args.timeoutMs),
        maxBytes: optionalInteger(args.maxBytes),
        shell: optionalBoolean(args.shell),
        signal,
      });
    }

    case "git_diff":
      return gitDiffTool({
        cwd,
        paths: optionalStringArray(args.paths),
        maxBytes: optionalInteger(args.maxBytes),
      });

    case "apply_patch":
      return applyPatchTool({
        cwd,
        patch: requiredString(args.patch, "patch"),
      });

    default:
      return {
        ok: false,
        error: {
          code: "UNKNOWN_TOOL",
          message: `Unknown native tool: ${name}`,
        },
      };
  }
}

function abortedToolOutput(): { ok: false; error: { code: string; message: string } } {
  return {
    ok: false,
    error: {
      code: "ABORTED",
      message: "Tool execution aborted.",
    },
  };
}

function parseToolArguments(
  toolCall: OpenRouterToolCall,
): { ok: true; value: Record<string, unknown> } | { ok: false; error: { code: string; message: string } } {
  try {
    const parsed = toolCall.function.arguments.trim()
      ? (JSON.parse(toolCall.function.arguments) as unknown)
      : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        ok: false,
        error: {
          code: "INVALID_TOOL_ARGUMENTS",
          message: "Tool arguments must be a JSON object.",
        },
      };
    }

    return { ok: true, value: parsed as Record<string, unknown> };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: {
        code: "INVALID_TOOL_ARGUMENT_JSON",
        message,
      },
    };
  }
}

function resultOk(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && "ok" in value && value.ok === true);
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} must be a non-empty string.`);
  }

  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function optionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.filter((item): item is string => typeof item === "string");
}

function optionalInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}
