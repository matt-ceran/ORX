import { DEFAULT_MAX_TEXT_BYTES } from "./truncation.js";
import { runProcess } from "./process.js";
import type { TextTruncation, ToolResult } from "./types.js";

export interface GitDiffOptions {
  cwd?: string;
  paths?: string[];
  maxBytes?: number;
}

export type GitDiffResult = ToolResult<{
  cwd: string;
  diff: string;
  exitCode: number | null;
  stderr: string;
  truncation: TextTruncation;
}>;

export async function gitDiffTool(options: GitDiffOptions = {}): Promise<GitDiffResult> {
  const args = ["diff"];
  if (options.paths && options.paths.length > 0) {
    args.push("--", ...options.paths);
  }

  const result = await runProcess({
    command: "git",
    args,
    cwd: options.cwd,
    shell: false,
    maxBytes: options.maxBytes ?? DEFAULT_MAX_TEXT_BYTES,
  });

  if (result.error) {
    return {
      ok: false,
      error: result.error,
    };
  }

  if (result.exitCode !== 0) {
    return {
      ok: false,
      error: {
        code: "GIT_DIFF_ERROR",
        message: result.stderr.trim() || `git diff exited with code ${result.exitCode}.`,
      },
    };
  }

  return {
    ok: true,
    cwd: result.cwd,
    diff: result.stdout,
    exitCode: result.exitCode,
    stderr: result.stderr,
    truncation: result.stdoutTruncation,
  };
}
