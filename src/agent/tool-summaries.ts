import type { OpenRouterToolCall } from "../openrouter/types.js";
import { createTerminalRenderer, type TerminalRenderOptions } from "../terminal/render.js";
import type { TextTruncation } from "../tools/types.js";
import type { ToolDispatchResult } from "./tool-dispatch.js";

interface ToolSummaryOptions extends TerminalRenderOptions {
  maxStringLength?: number;
  maxListItems?: number;
}

type JsonObject = Record<string, unknown>;

const DEFAULT_MAX_STRING_LENGTH = 96;
const DEFAULT_MAX_LIST_ITEMS = 5;

export function formatToolCallStart(
  toolCall: OpenRouterToolCall,
  options: ToolSummaryOptions = {},
): string {
  const renderer = createTerminalRenderer(options);
  const argumentSummary = formatToolArguments(toolCall, options);
  return argumentSummary
    ? `${renderer.accent("[tool]")} ${toolCall.function.name} ${argumentSummary}`
    : `${renderer.accent("[tool]")} ${toolCall.function.name}`;
}

export function formatToolResult(
  result: ToolDispatchResult,
  options: ToolSummaryOptions = {},
): string {
  const renderer = createTerminalRenderer(options);
  const details = formatToolResultDetails(result, options);
  return [
    renderer.accent("[tool]"),
    result.toolCall.function.name,
    result.ok ? renderer.success("ok") : renderer.danger("failed"),
    `duration=${formatDuration(result.durationMs)}`,
    ...details,
  ].join(" ");
}

export function formatToolArguments(
  toolCall: OpenRouterToolCall,
  options: ToolSummaryOptions = {},
): string {
  const parsed = parseArguments(toolCall.function.arguments);
  if (!parsed.ok) {
    return `args=<invalid JSON, ${formatBytes(Buffer.byteLength(toolCall.function.arguments, "utf8"))}>`;
  }

  const entries = Object.entries(parsed.value).filter(([, value]) => value !== undefined);
  if (entries.length === 0) {
    return "";
  }

  return entries
    .map(([key, value]) => formatArgument(toolCall.function.name, key, value, options))
    .join(" ");
}

function formatToolResultDetails(
  result: ToolDispatchResult,
  options: ToolSummaryOptions,
): string[] {
  const details: string[] = [];
  const output = isObject(result.output) ? result.output : undefined;

  if (output && !result.ok) {
    const error = isObject(output.error) ? output.error : undefined;
    if (typeof error?.code === "string") {
      details.push(`error=${error.code}`);
    }
  }

  switch (result.toolCall.function.name) {
    case "apply_patch":
      details.push(...formatApplyPatchDetails(output, options));
      break;

    case "git_diff":
      details.push(...formatGitDiffDetails(output));
      break;

    case "read_file":
      pushTruncation(details, "content", getTruncation(output?.truncation));
      break;

    case "list_files":
      if (output?.truncated === true) {
        details.push("entries_truncated=true");
      }
      break;

    case "search_files":
      if (output?.truncated === true) {
        details.push("matches_truncated=true");
      }
      break;

    case "run_tests":
      details.push(...formatRunTestsDetails(output));
      break;

    case "shell":
      details.push(...formatShellDetails(output));
      break;

    case "mcp_call":
      details.push(...formatMcpCallDetails(output));
      break;
  }

  pushTruncation(details, "result", result.truncation);
  return details;
}

function formatApplyPatchDetails(
  output: JsonObject | undefined,
  options: ToolSummaryOptions,
): string[] {
  if (!Array.isArray(output?.changedFiles)) {
    return [];
  }

  return [`changed_files=${formatStringList(output.changedFiles, options)}`];
}

function formatGitDiffDetails(output: JsonObject | undefined): string[] {
  const truncation = getTruncation(output?.truncation);
  if (!truncation) {
    return [];
  }

  const details = [`diff=${formatReturnedTextSize(truncation)}`];
  pushTruncation(details, "diff", truncation);
  return details;
}

function formatShellDetails(output: JsonObject | undefined): string[] {
  if (!output) {
    return [];
  }

  const details: string[] = [];
  if (typeof output.exitCode === "number") {
    details.push(`exit=${output.exitCode}`);
  } else if (output.exitCode === null) {
    details.push("exit=null");
  }

  if (output.timedOut === true) {
    details.push("timed_out=true");
  }

  pushTruncation(details, "stdout", getTruncation(output.stdoutTruncation));
  pushTruncation(details, "stderr", getTruncation(output.stderrTruncation));
  return details;
}

function formatRunTestsDetails(output: JsonObject | undefined): string[] {
  if (!output) {
    return [];
  }

  const details: string[] = [];
  if (typeof output.status === "string") {
    details.push(`status=${output.status}`);
  }
  const target = isObject(output.target) ? output.target : undefined;
  if (typeof target?.id === "string") {
    details.push(`target=${JSON.stringify(target.id)}`);
  }
  if (typeof target?.framework === "string") {
    details.push(`framework=${target.framework}`);
  }
  if (typeof output.exitCode === "number") {
    details.push(`exit=${output.exitCode}`);
  } else if (output.exitCode === null) {
    details.push("exit=null");
  }
  if (output.timedOut === true) {
    details.push("timed_out=true");
  }
  if (output.stdoutTruncated === true) {
    details.push("stdout_truncated=true");
  }
  if (output.stderrTruncated === true) {
    details.push("stderr_truncated=true");
  }
  return details;
}

function formatMcpCallDetails(output: JsonObject | undefined): string[] {
  if (!output) {
    return [];
  }

  const details: string[] = [];
  if (typeof output.status === "string") {
    details.push(`status=${output.status}`);
  }
  if (typeof output.policyDecision === "string") {
    details.push(`policy=${output.policyDecision}`);
  }
  if (typeof output.networkAttempted === "boolean") {
    details.push(`network=${output.networkAttempted ? "attempted" : "not_attempted"}`);
  }
  if (typeof output.resultHash === "string") {
    details.push(`result_hash=${output.resultHash}`);
  }
  return details;
}

function formatArgument(
  toolName: string,
  key: string,
  value: unknown,
  options: ToolSummaryOptions,
): string {
  if (toolName === "apply_patch" && key === "patch" && typeof value === "string") {
    return `patch=<${formatTextSize(value)}>`;
  }

  if (Array.isArray(value)) {
    return `${key}=${formatValueList(value, options)}`;
  }

  if (typeof value === "string") {
    return `${key}=${formatStringValue(value, options)}`;
  }

  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return `${key}=${String(value)}`;
  }

  return `${key}=<object>`;
}

function formatValueList(values: unknown[], options: ToolSummaryOptions): string {
  const maxItems = options.maxListItems ?? DEFAULT_MAX_LIST_ITEMS;
  const shown = values
    .slice(0, maxItems)
    .map((value) =>
      typeof value === "string"
        ? formatStringValue(value, options)
        : typeof value === "number" || typeof value === "boolean" || value === null
          ? String(value)
          : "<object>",
    );

  if (values.length > maxItems) {
    shown.push(`+${values.length - maxItems} more`);
  }

  return `[${shown.join(", ")}]`;
}

function formatStringList(values: unknown[], options: ToolSummaryOptions): string {
  const strings = values.filter((value): value is string => typeof value === "string");
  if (strings.length === 0) {
    return "none";
  }

  return `${strings.length} ${formatValueList(strings, options)}`;
}

function formatStringValue(value: string, options: ToolSummaryOptions): string {
  const maxLength = options.maxStringLength ?? DEFAULT_MAX_STRING_LENGTH;
  const singleLine = value.replace(/\s+/g, " ").trim();
  const truncated =
    singleLine.length > maxLength
      ? `${singleLine.slice(0, Math.max(0, maxLength - 3))}...`
      : singleLine;
  const suffix = singleLine.length > maxLength ? `(${formatTextSize(value)})` : "";

  return `${JSON.stringify(truncated)}${suffix}`;
}

function parseArguments(
  rawArguments: string,
): { ok: true; value: JsonObject } | { ok: false } {
  try {
    const parsed = rawArguments.trim() ? (JSON.parse(rawArguments) as unknown) : {};
    return isObject(parsed) && !Array.isArray(parsed) ? { ok: true, value: parsed } : { ok: false };
  } catch {
    return { ok: false };
  }
}

function pushTruncation(
  details: string[],
  label: string,
  truncation: TextTruncation | undefined,
): void {
  if (!truncation?.truncated) {
    return;
  }

  details.push(`${label}_truncated=(${formatOmittedText(truncation)})`);
}

function getTruncation(value: unknown): TextTruncation | undefined {
  if (!isObject(value)) {
    return undefined;
  }

  const candidate = value as Partial<TextTruncation>;
  return typeof candidate.truncated === "boolean" &&
    typeof candidate.originalBytes === "number" &&
    typeof candidate.returnedBytes === "number" &&
    typeof candidate.originalLines === "number" &&
    typeof candidate.returnedLines === "number" &&
    typeof candidate.omittedBytes === "number" &&
    typeof candidate.omittedLines === "number"
    ? (candidate as TextTruncation)
    : undefined;
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1_000) {
    return `${durationMs}ms`;
  }

  return `${(durationMs / 1_000).toFixed(1)}s`;
}

function formatTextSize(text: string): string {
  return `${formatBytes(Buffer.byteLength(text, "utf8"))}, ${formatCount(countLines(text), "line")}`;
}

function formatReturnedTextSize(truncation: TextTruncation): string {
  return `${formatBytes(truncation.returnedBytes)}, ${formatCount(truncation.returnedLines, "line")}`;
}

function formatOmittedText(truncation: TextTruncation): string {
  const parts: string[] = [];
  if (truncation.omittedBytes > 0) {
    parts.push(`${formatBytes(truncation.omittedBytes)} omitted`);
  }
  if (truncation.omittedLines > 0) {
    parts.push(`${formatCount(truncation.omittedLines, "line")} omitted`);
  }

  return parts.length > 0 ? parts.join(", ") : "truncated";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes}B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)}KiB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)}MiB`;
}

function formatCount(value: number, noun: string): string {
  return `${value} ${noun}${value === 1 ? "" : "s"}`;
}

function countLines(text: string): number {
  if (text.length === 0) {
    return 0;
  }

  const normalized = text.replace(/\r\n|\r/g, "\n");
  const withoutTrailingNewline = normalized.endsWith("\n")
    ? normalized.slice(0, -1)
    : normalized;

  return withoutTrailingNewline.length === 0 ? 0 : withoutTrailingNewline.split("\n").length;
}
