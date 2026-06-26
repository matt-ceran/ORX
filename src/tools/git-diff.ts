import { DEFAULT_MAX_TEXT_BYTES, truncateText } from "./truncation.js";
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

const INTERNAL_GIT_DIFF_CAPTURE_BYTES = 16 * 1024 * 1024;

export async function gitDiffTool(options: GitDiffOptions = {}): Promise<GitDiffResult> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_TEXT_BYTES;
  const internalMaxBytes = Math.max(maxBytes, INTERNAL_GIT_DIFF_CAPTURE_BYTES);
  const args = ["diff"];
  if (options.paths && options.paths.length > 0) {
    args.push("--", ...options.paths);
  }

  const result = await runProcess({
    command: "git",
    args,
    cwd: options.cwd,
    shell: false,
    maxBytes: internalMaxBytes,
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

  if (result.stdoutTruncation.truncated) {
    return truncatedInternalOutputError("git diff", result.stdoutTruncation);
  }

  const untracked = await listUntrackedFiles(result.cwd, options.paths, internalMaxBytes);
  if (!untracked.ok) {
    return untracked;
  }

  const untrackedDiffs: string[] = [];
  for (const file of untracked.files) {
    const diff = await diffUntrackedFile(result.cwd, file, internalMaxBytes);
    if (!diff.ok) {
      return diff;
    }
    if (diff.diff.length > 0) {
      untrackedDiffs.push(diff.diff);
    }
  }

  const combined = combineDiffs([result.stdout, ...untrackedDiffs]);
  const truncated = truncateText(combined, { maxBytes });

  return {
    ok: true,
    cwd: result.cwd,
    diff: truncated.text,
    exitCode: result.exitCode,
    stderr: result.stderr,
    truncation: truncated.truncation,
  };
}

type InternalGitDiffResult = ToolResult<{
  diff: string;
}>;

type UntrackedFilesResult = ToolResult<{
  files: string[];
}>;

async function listUntrackedFiles(
  cwd: string,
  paths: string[] | undefined,
  internalMaxBytes: number,
): Promise<UntrackedFilesResult> {
  const args = ["ls-files", "--others", "--exclude-standard", "-z"];
  if (paths && paths.length > 0) {
    args.push("--", ...paths);
  }

  const result = await runProcess({
    command: "git",
    args,
    cwd,
    shell: false,
    maxBytes: internalMaxBytes,
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
        message: result.stderr.trim() || `git ls-files exited with code ${result.exitCode}.`,
      },
    };
  }

  if (result.stdoutTruncation.truncated) {
    return truncatedInternalOutputError("git ls-files", result.stdoutTruncation);
  }

  return {
    ok: true,
    files: result.stdout.split("\0").filter((file) => file.length > 0),
  };
}

async function diffUntrackedFile(
  cwd: string,
  file: string,
  internalMaxBytes: number,
): Promise<InternalGitDiffResult> {
  const result = await runProcess({
    command: "git",
    args: ["diff", "--no-index", "--", "/dev/null", file],
    cwd,
    shell: false,
    maxBytes: internalMaxBytes,
  });

  if (result.error) {
    return {
      ok: false,
      error: result.error,
    };
  }

  if (result.exitCode !== 0 && result.exitCode !== 1) {
    return {
      ok: false,
      error: {
        code: "GIT_DIFF_ERROR",
        message: result.stderr.trim() || `git diff --no-index exited with code ${result.exitCode}.`,
      },
    };
  }

  if (result.stdoutTruncation.truncated) {
    return truncatedInternalOutputError("git diff --no-index", result.stdoutTruncation);
  }

  return {
    ok: true,
    diff: result.stdout,
  };
}

function truncatedInternalOutputError<T>(
  command: string,
  truncation: TextTruncation,
): ToolResult<T> {
  return {
    ok: false,
    error: {
      code: "GIT_DIFF_OUTPUT_TRUNCATED",
      message: `${command} output exceeded internal capture limit (${truncation.returnedBytes}B returned, ${truncation.omittedBytes}B omitted).`,
    },
  };
}

function combineDiffs(diffs: string[]): string {
  return diffs
    .filter((diff) => diff.length > 0)
    .map((diff) => (diff.endsWith("\n") ? diff : `${diff}\n`))
    .join("");
}
