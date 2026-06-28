import { spawn } from "node:child_process";
import { DEFAULT_MAX_TEXT_BYTES, ByteAccumulator } from "./truncation.js";
import type { TextTruncation, TextTruncationOptions } from "./types.js";

export interface RunProcessOptions extends TextTruncationOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  inheritEnv?: boolean;
  timeoutMs?: number;
  shell?: boolean;
  stdin?: string;
  signal?: AbortSignal;
}

export interface RunProcessResult {
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
  error?: {
    code: string;
    message: string;
  };
}

export function runProcess(options: RunProcessOptions): Promise<RunProcessResult> {
  const startedAt = performance.now();
  const args = options.args ?? [];
  const cwd = options.cwd ?? process.cwd();
  const stdout = new ByteAccumulator(options.maxBytes ?? DEFAULT_MAX_TEXT_BYTES);
  const stderr = new ByteAccumulator(options.maxBytes ?? DEFAULT_MAX_TEXT_BYTES);
  const shell = options.shell ?? args.length === 0;
  let timedOut = false;
  let timeout: NodeJS.Timeout | undefined;
  let terminationKillTimeout: NodeJS.Timeout | undefined;
  let terminationRequested = false;
  let aborted = false;

  if (options.signal?.aborted) {
    return Promise.resolve(
      createProcessResult({
        options,
        args,
        cwd,
        stdout,
        stderr,
        startedAt,
        timedOut,
        exitCode: null,
        signal: null,
        error: abortedError("Process execution aborted before start."),
      }),
    );
  }

  if (
    options.timeoutMs !== undefined &&
    (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1)
  ) {
    return Promise.resolve(
      createProcessResult({
        options,
        args,
        cwd,
        stdout,
        stderr,
        startedAt,
        timedOut,
        exitCode: null,
        signal: null,
        error: {
          code: "EINVAL",
          message: "timeoutMs must be a positive integer.",
        },
      }),
    );
  }

  return new Promise((resolve) => {
    let settled = false;
    const shouldCreateProcessGroup =
      process.platform !== "win32" &&
      (options.signal !== undefined || options.timeoutMs !== undefined);
    const child = spawn(options.command, args, {
      cwd,
      env: options.inheritEnv === false ? { ...options.env } : { ...process.env, ...options.env },
      shell,
      detached: shouldCreateProcessGroup,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const terminateProcess = (signal: NodeJS.Signals) => {
      terminationRequested = true;
      killProcess(child.pid, child.kill.bind(child), signal);
      if (!terminationKillTimeout && signal !== "SIGKILL") {
        terminationKillTimeout = setTimeout(() => {
          killProcess(child.pid, child.kill.bind(child), "SIGKILL");
        }, 500);
      }
    };
    const abortProcess = () => {
      if (settled) {
        return;
      }

      aborted = true;
      terminateProcess("SIGTERM");
    };

    options.signal?.addEventListener("abort", abortProcess, { once: true });
    if (options.signal?.aborted) {
      abortProcess();
    }

    if (options.timeoutMs !== undefined) {
      timeout = setTimeout(() => {
        timedOut = true;
        terminateProcess("SIGTERM");
      }, options.timeoutMs);
    }

    child.stdout.on("data", (chunk: Buffer) => {
      stdout.append(chunk);
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr.append(chunk);
    });

    child.on("error", (error: NodeJS.ErrnoException) => {
      resolveResult({
        exitCode: null,
        signal: null,
        error: {
          code: error.code ?? "PROCESS_ERROR",
          message: error.message,
        },
      });
    });

    child.on("close", (exitCode, signal) => {
      resolveResult({
        exitCode,
        signal,
      });
    });

    if (options.stdin !== undefined) {
      child.stdin.end(options.stdin);
    } else {
      child.stdin.end();
    }

    function resolveResult(result: {
      exitCode: number | null;
      signal: NodeJS.Signals | null;
      error?: { code: string; message: string };
    }) {
      if (settled) {
        return;
      }
      settled = true;
      if (timeout) {
        clearTimeout(timeout);
      }
      if (terminationKillTimeout && !terminationRequested) {
        clearTimeout(terminationKillTimeout);
      }
      options.signal?.removeEventListener("abort", abortProcess);

      resolve(
        createProcessResult({
          options,
          args,
          cwd,
          stdout,
          stderr,
          startedAt,
          timedOut,
          exitCode: result.exitCode,
          signal: result.signal,
          error: aborted ? abortedError("Process execution aborted.") : result.error,
        }),
      );
    }
  });
}

function createProcessResult(options: {
  options: RunProcessOptions;
  args: string[];
  cwd: string;
  stdout: ByteAccumulator;
  stderr: ByteAccumulator;
  startedAt: number;
  timedOut: boolean;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  error?: { code: string; message: string };
}): RunProcessResult {
  const stdoutResult = options.stdout.toTruncatedText();
  const stderrResult = options.stderr.toTruncatedText();

  return {
    command: options.options.command,
    args: options.args,
    cwd: options.cwd,
    exitCode: options.exitCode,
    signal: options.signal,
    stdout: stdoutResult.text,
    stderr: stderrResult.text,
    stdoutTruncation: stdoutResult.truncation,
    stderrTruncation: stderrResult.truncation,
    durationMs: Math.max(0, Math.round(performance.now() - options.startedAt)),
    timedOut: options.timedOut,
    error: options.error,
  };
}

function killProcess(
  pid: number | undefined,
  killChild: (signal?: NodeJS.Signals | number) => boolean,
  signal: NodeJS.Signals,
): void {
  if (pid && process.platform === "win32") {
    try {
      const taskkill = spawn("taskkill", ["/pid", String(pid), "/t", "/f"], {
        stdio: "ignore",
        windowsHide: true,
      });
      taskkill.on("error", () => {
        killDirectChild(killChild, signal);
      });
      taskkill.on("close", (exitCode) => {
        if (exitCode !== 0) {
          killDirectChild(killChild, signal);
        }
      });
      return;
    } catch {
      // Fall back to killing the direct child below.
    }
  }

  if (pid && process.platform !== "win32") {
    try {
      process.kill(-pid, signal);
      return;
    } catch {
      // Fall back to killing the direct child below.
    }
  }

  killDirectChild(killChild, signal);
}

function killDirectChild(
  killChild: (signal?: NodeJS.Signals | number) => boolean,
  signal: NodeJS.Signals,
): void {
  try {
    killChild(signal);
  } catch {
    // The child may already have exited.
  }
}

function abortedError(message: string): { code: string; message: string } {
  return {
    code: "ABORTED",
    message,
  };
}
