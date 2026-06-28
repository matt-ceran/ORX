import { DEFAULT_MAX_TEXT_BYTES } from "./truncation.js";
import { runProcess } from "./process.js";
import type { TextTruncation, ToolResult } from "./types.js";

export interface ShellOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  inheritEnv?: boolean;
  timeoutMs?: number;
  maxBytes?: number;
  shell?: boolean;
  signal?: AbortSignal;
}

export type ShellResult = ToolResult<{
  command: string;
  args: string[];
  cwd: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  stdoutTruncation: TextTruncation;
  stderrTruncation: TextTruncation;
  durationMs: number;
  timedOut: boolean;
}>;

export async function shellTool(options: ShellOptions): Promise<ShellResult> {
  const result = await runProcess({
    command: options.command,
    args: options.args,
    cwd: options.cwd,
    env: options.env,
    inheritEnv: options.inheritEnv,
    timeoutMs: options.timeoutMs,
    maxBytes: options.maxBytes ?? DEFAULT_MAX_TEXT_BYTES,
    shell: options.shell,
    signal: options.signal,
  });

  if (result.error) {
    return {
      ok: false,
      error: result.error,
    };
  }

  return {
    ok: true,
    command: result.command,
    args: result.args,
    cwd: result.cwd,
    exitCode: result.exitCode,
    signal: result.signal,
    stdout: result.stdout,
    stderr: result.stderr,
    stdoutTruncation: result.stdoutTruncation,
    stderrTruncation: result.stderrTruncation,
    durationMs: result.durationMs,
    timedOut: result.timedOut,
  };
}
