import { spawn } from "node:child_process";
import { DEFAULT_MAX_TEXT_BYTES, ByteAccumulator } from "./truncation.js";
import type { TextTruncation, TextTruncationOptions } from "./types.js";

export interface RunProcessOptions extends TextTruncationOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  shell?: boolean;
  stdin?: string;
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

  return new Promise((resolve) => {
    const child = spawn(options.command, args, {
      cwd,
      env: {
        ...process.env,
        ...options.env,
      },
      shell,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let settled = false;

    if (options.timeoutMs !== undefined) {
      if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1) {
        child.kill("SIGTERM");
        resolveResult({
          exitCode: null,
          signal: null,
          error: {
            code: "EINVAL",
            message: "timeoutMs must be a positive integer.",
          },
        });
        return;
      }

      timeout = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
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

      const stdoutResult = stdout.toTruncatedText();
      const stderrResult = stderr.toTruncatedText();

      resolve({
        command: options.command,
        args,
        cwd,
        exitCode: result.exitCode,
        signal: result.signal,
        stdout: stdoutResult.text,
        stderr: stderrResult.text,
        stdoutTruncation: stdoutResult.truncation,
        stderrTruncation: stderrResult.truncation,
        durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
        timedOut,
        error: result.error,
      });
    }
  });
}
