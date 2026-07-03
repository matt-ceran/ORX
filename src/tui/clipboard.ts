import { spawn } from "node:child_process";
import type { OpenRouterMessage } from "../openrouter/types.js";

export interface ClipboardCommandOptions {
  input: string;
  timeoutMs: number;
}

export interface ClipboardCommandResult {
  code: number;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
}

export type ClipboardCommandRunner = (
  command: string,
  args: string[],
  options: ClipboardCommandOptions,
) => Promise<ClipboardCommandResult>;

export type ClipboardCopyResult =
  | {
      ok: true;
      charCount: number;
      command: string;
    }
  | {
      ok: false;
      reason: "empty" | "unsupported" | "failed";
      message: string;
      command?: string;
    };

export interface ClipboardCopyOptions {
  platform?: NodeJS.Platform;
  runner?: ClipboardCommandRunner;
  timeoutMs?: number;
}

const DEFAULT_CLIPBOARD_TIMEOUT_MS = 5_000;

export async function copyLatestAssistantMessageToClipboard(
  messages: OpenRouterMessage[],
  options: ClipboardCopyOptions = {},
): Promise<ClipboardCopyResult> {
  const text = latestAssistantText(messages);
  if (!text) {
    return {
      ok: false,
      reason: "empty",
      message: "No assistant output is available to copy.",
    };
  }

  return copyTextToClipboard(text, options);
}

export async function copyTextToClipboard(
  text: string,
  options: ClipboardCopyOptions = {},
): Promise<ClipboardCopyResult> {
  const target = clipboardTargetForPlatform(options.platform ?? process.platform);
  if (!target) {
    return {
      ok: false,
      reason: "unsupported",
      message: "Clipboard copy is not supported on this platform yet.",
    };
  }

  const runner = options.runner ?? defaultClipboardCommandRunner;
  const result = await runner(target.command, target.args, {
    input: text,
    timeoutMs: options.timeoutMs ?? DEFAULT_CLIPBOARD_TIMEOUT_MS,
  });

  if (result.code !== 0 || result.timedOut) {
    return {
      ok: false,
      reason: "failed",
      command: target.command,
      message: formatClipboardFailure(result),
    };
  }

  return {
    ok: true,
    charCount: text.length,
    command: target.command,
  };
}

export function latestAssistantText(messages: OpenRouterMessage[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "assistant" && typeof message.content === "string") {
      const text = message.content.trim();
      if (text.length > 0) {
        return text;
      }
    }
  }

  return undefined;
}

function clipboardTargetForPlatform(
  platform: NodeJS.Platform,
): { command: string; args: string[] } | undefined {
  if (platform === "darwin") {
    return { command: "/usr/bin/pbcopy", args: [] };
  }

  if (platform === "win32") {
    return { command: "clip.exe", args: [] };
  }

  return undefined;
}

function formatClipboardFailure(result: ClipboardCommandResult): string {
  if (result.timedOut) {
    return "clipboard command timed out.";
  }

  const detail = sanitizeClipboardDetail(result.stderr || result.stdout);
  if (detail) {
    return `clipboard command failed: ${detail}`;
  }

  return `clipboard command failed with exit code ${result.code}.`;
}

function sanitizeClipboardDetail(value: string): string {
  return value
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[\x00-\x1F\x7F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

function defaultClipboardCommandRunner(
  command: string,
  args: string[],
  options: ClipboardCommandOptions,
): Promise<ClipboardCommandResult> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const child = spawn(command, args, {
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const timer = setTimeout(() => {
      if (!settled) {
        child.kill("SIGTERM");
      }
    }, options.timeoutMs);

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({
        code: 1,
        stdout,
        stderr: error.message,
      });
    });

    child.on("close", (code, signal) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({
        code: code ?? (signal ? 1 : 0),
        stdout,
        stderr,
        timedOut: signal === "SIGTERM",
      });
    });

    child.stdin.end(options.input);
  });
}
