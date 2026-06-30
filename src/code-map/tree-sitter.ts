import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { redactSecrets } from "../mcp/audit.js";
import { truncateText } from "../tools/truncation.js";
import type { TextTruncation } from "../tools/types.js";

export const CODE_TREE_SITTER_USAGE = "Usage: orx code tree-sitter <file>";
export const SLASH_CODE_TREE_SITTER_USAGE = "Usage: /code tree-sitter <file>";

export interface CodeTreeSitterArgs {
  targetPath: string;
}

export type CodeTreeSitterParseResult =
  | { ok: true; args: CodeTreeSitterArgs }
  | { ok: false; message: string };

export type CodeTreeSitterStatus =
  | "ok"
  | "tool_missing"
  | "invalid_arguments"
  | "failed"
  | "timed_out";

export interface TreeSitterRunnerOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
  shell: false;
  encoding: "utf8";
  timeout: number;
  maxBuffer: number;
}

export interface TreeSitterRunnerResult {
  status: number | null;
  signal: NodeJS.Signals | null;
  stdout?: string | Buffer;
  stderr?: string | Buffer;
  error?: Error & { code?: string };
}

export type TreeSitterRunner = (
  command: string,
  args: string[],
  options: TreeSitterRunnerOptions,
) => TreeSitterRunnerResult;

export interface RunCodeTreeSitterOptions extends CodeTreeSitterArgs {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  runner?: TreeSitterRunner;
  maxBytes?: number;
  timeoutMs?: number;
}

export interface CodeTreeSitterResult {
  ok: boolean;
  status: CodeTreeSitterStatus;
  root: string;
  targetPath: string;
  command?: string;
  args: string[];
  commandLine?: string;
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
  timedOut: boolean;
  durationMs?: number;
  stdout: string;
  stderr: string;
  stdoutTruncation: TextTruncation;
  stderrTruncation: TextTruncation;
  message?: string;
}

const TREE_SITTER_COMMAND = "tree-sitter";
const DEFAULT_TREE_SITTER_TIMEOUT_MS = 30_000;
const DEFAULT_TREE_SITTER_OUTPUT_BYTES = 128 * 1024;
const TREE_SITTER_DISCOVERY_TIMEOUT_MS = 5_000;
const TREE_SITTER_DISCOVERY_BYTES = 8 * 1024;
const MAX_PATH_LENGTH = 4096;
const CONTROL_CHAR_PATTERN = /[\x00-\x1F\x7F]/;
const OUTPUT_CONTROL_CHAR_PATTERN = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;
const ANSI_PATTERN = /\x1B\[[0-?]*[ -/]*[@-~]/g;
const OSC_PATTERN = /\x1B\][^\x07]*(?:\x07|\x1B\\)/g;

const EMPTY_TRUNCATION: TextTruncation = {
  truncated: false,
  originalBytes: 0,
  returnedBytes: 0,
  originalLines: 0,
  returnedLines: 0,
  omittedBytes: 0,
  omittedLines: 0,
};

export function parseCodeTreeSitterArgs(
  args: string[],
  usage = CODE_TREE_SITTER_USAGE,
): CodeTreeSitterParseResult {
  const positional: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? "";
    if (arg === "--") {
      positional.push(...args.slice(index + 1));
      break;
    }
    if (arg.startsWith("-")) {
      return { ok: false, message: `${usage}\nUnknown tree-sitter option: ${sanitizeInline(arg)}` };
    }
    positional.push(arg);
  }

  if (positional.length !== 1 || !positional[0]?.trim()) {
    return { ok: false, message: usage };
  }
  const targetPath = positional[0] ?? "";
  if (isFlagLikeValue(targetPath)) {
    return { ok: false, message: `${usage}\nfile must not start with a dash.` };
  }
  const pathMessage = validateTreeSitterPath(targetPath);
  if (pathMessage) {
    return { ok: false, message: `${usage}\n${pathMessage}` };
  }
  return { ok: true, args: { targetPath } };
}

export function parseCodeTreeSitterArgText(
  argText: string,
  usage = CODE_TREE_SITTER_USAGE,
): CodeTreeSitterParseResult {
  const tokens = splitTreeSitterArgText(argText);
  if (typeof tokens === "string") {
    return { ok: false, message: `${usage}\n${tokens}` };
  }
  return parseCodeTreeSitterArgs(tokens, usage);
}

export function runCodeTreeSitter(options: RunCodeTreeSitterOptions): CodeTreeSitterResult {
  const root = resolve(options.cwd ?? process.cwd());
  const maxBytes = options.maxBytes ?? DEFAULT_TREE_SITTER_OUTPUT_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TREE_SITTER_TIMEOUT_MS;
  const runner = options.runner ?? defaultTreeSitterRunner;
  const env = createTreeSitterEnv(options.env ?? process.env);
  const emptyText = emptyTruncatedText();

  const target = resolveTreeSitterTarget(root, options.targetPath);
  if (!target.ok) {
    return {
      ok: false,
      status: "invalid_arguments",
      root,
      targetPath: options.targetPath,
      args: [],
      timedOut: false,
      stdout: "",
      stderr: "",
      stdoutTruncation: emptyText.truncation,
      stderrTruncation: emptyText.truncation,
      message: target.message,
    };
  }

  const command = resolveTreeSitterCommand(root, env, runner);
  if (!command.ok) {
    return {
      ok: false,
      status: "tool_missing",
      root,
      targetPath: target.displayPath,
      args: [],
      timedOut: false,
      stdout: "",
      stderr: "",
      stdoutTruncation: emptyText.truncation,
      stderrTruncation: emptyText.truncation,
      message: command.message,
    };
  }

  const spawnArgs = ["parse", target.arg];
  const startedAt = performance.now();
  const result = runner(TREE_SITTER_COMMAND, spawnArgs, {
    cwd: root,
    env,
    shell: false,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: Math.max(maxBytes * 2, maxBytes + 4096),
  });
  const durationMs = Math.max(0, Math.round(performance.now() - startedAt));
  const stdout = truncateSanitizedOutput(result.stdout ?? "", maxBytes);
  const stderr = truncateSanitizedOutput(result.stderr ?? "", maxBytes);
  const timedOut = result.error?.code === "ETIMEDOUT";
  const status = classifyTreeSitterRun(result, timedOut);

  return {
    ok: status === "ok",
    status,
    root,
    targetPath: target.displayPath,
    command: TREE_SITTER_COMMAND,
    args: spawnArgs,
    commandLine: formatCommandLine(TREE_SITTER_COMMAND, spawnArgs),
    exitCode: result.status,
    signal: result.signal,
    timedOut,
    durationMs,
    stdout: stdout.text,
    stderr: stderr.text,
    stdoutTruncation: stdout.truncation,
    stderrTruncation: stderr.truncation,
    message: result.error && !timedOut ? sanitizeInline(result.error.message) : undefined,
  };
}

export function renderCodeTreeSitterResult(
  result: CodeTreeSitterResult,
  usage = CODE_TREE_SITTER_USAGE,
): string {
  const lines = [
    "Code tree-sitter",
    `  status: ${result.status}`,
    `  root: ${sanitizeInline(result.root)}`,
    `  file: ${sanitizeInline(result.targetPath)}`,
    "  mode: AST-backed local parse via optional tree-sitter CLI",
    "  mutation: none",
  ];
  if (result.commandLine) {
    lines.push(`  command: ${result.commandLine}`);
  }
  if (result.exitCode !== undefined) {
    lines.push(`  exit_code: ${result.exitCode ?? "none"}`);
  }
  if (result.signal) {
    lines.push(`  signal: ${sanitizeInline(result.signal)}`);
  }
  if (result.durationMs !== undefined) {
    lines.push(`  duration_ms: ${result.durationMs}`);
  }
  if (result.status === "tool_missing") {
    lines.push(`  setup: ${treeSitterMissingMessage()}`);
  }
  if (result.message && result.status !== "tool_missing") {
    lines.push(`  message: ${sanitizeInline(result.message)}`);
  }

  lines.push("  stdout:");
  lines.push(...indentOutput(result.stdout));
  if (result.stdoutTruncation.truncated) {
    lines.push(`    - stdout truncated: ${result.stdoutTruncation.omittedBytes}B omitted`);
  }

  lines.push("  stderr:");
  lines.push(...indentOutput(result.stderr));
  if (result.stderrTruncation.truncated) {
    lines.push(`    - stderr truncated: ${result.stderrTruncation.omittedBytes}B omitted`);
  }

  lines.push(`  fallback: lexical code-map, symbols, refs, imports, and calls remain available without tree-sitter`);
  lines.push(`  usage: ${usage.replace(/^Usage:\s*/, "")}`);
  return lines.join("\n");
}

function resolveTreeSitterCommand(
  cwd: string,
  env: NodeJS.ProcessEnv,
  runner: TreeSitterRunner,
): { ok: true } | { ok: false; message: string } {
  const result = runner(TREE_SITTER_COMMAND, ["--version"], {
    cwd,
    env,
    shell: false,
    encoding: "utf8",
    timeout: TREE_SITTER_DISCOVERY_TIMEOUT_MS,
    maxBuffer: TREE_SITTER_DISCOVERY_BYTES,
  });
  if (result.status === 0) {
    return { ok: true };
  }
  return { ok: false, message: treeSitterMissingMessage() };
}

function resolveTreeSitterTarget(
  cwd: string,
  targetPath: string,
): { ok: true; arg: string; displayPath: string } | { ok: false; message: string } {
  const targetInput = targetPath.trim();
  const resolvedTarget = resolve(cwd, targetInput);
  if (!isPathInside(cwd, resolvedTarget)) {
    return { ok: false, message: "tree-sitter file must stay inside the current working directory." };
  }
  if (!existsSync(resolvedTarget)) {
    return { ok: false, message: "tree-sitter file does not exist." };
  }

  let stat;
  try {
    stat = lstatSync(resolvedTarget);
  } catch {
    return { ok: false, message: "tree-sitter file could not be inspected." };
  }
  if (stat.isSymbolicLink()) {
    return { ok: false, message: "tree-sitter file must not be a symbolic link." };
  }
  if (!stat.isFile()) {
    return { ok: false, message: "tree-sitter target must be a file." };
  }

  const realCwd = safeRealpath(cwd) ?? cwd;
  const realTarget = safeRealpath(resolvedTarget);
  if (realTarget && !isPathInside(realCwd, realTarget)) {
    return { ok: false, message: "tree-sitter file resolves outside the current working directory." };
  }

  const relativeTarget = relative(cwd, resolvedTarget).split(/[\\/]/g).join("/") || ".";
  if (isFlagLikeValue(relativeTarget)) {
    return { ok: false, message: "tree-sitter file must not resolve to a dash-prefixed operand." };
  }
  return { ok: true, arg: relativeTarget, displayPath: relativeTarget };
}

function splitTreeSitterArgText(text: string): string[] | string {
  const tokens: string[] = [];
  let current = "";
  let quote: "\"" | "'" | undefined;
  let escaping = false;
  let tokenStarted = false;

  for (const char of text) {
    if (escaping) {
      current += char;
      tokenStarted = true;
      escaping = false;
      continue;
    }
    if (char === "\\" && quote !== "'") {
      escaping = true;
      tokenStarted = true;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = undefined;
      } else {
        current += char;
      }
      tokenStarted = true;
      continue;
    }
    if (char === "\"" || char === "'") {
      quote = char;
      tokenStarted = true;
      continue;
    }
    if (/\s/.test(char)) {
      if (tokenStarted) {
        tokens.push(current);
        current = "";
        tokenStarted = false;
      }
      continue;
    }
    current += char;
    tokenStarted = true;
  }

  if (escaping) {
    current += "\\";
  }
  if (quote) {
    return "Unterminated quoted tree-sitter argument.";
  }
  if (tokenStarted) {
    tokens.push(current);
  }
  return tokens;
}

function classifyTreeSitterRun(
  result: TreeSitterRunnerResult,
  timedOut: boolean,
): CodeTreeSitterStatus {
  if (timedOut) {
    return "timed_out";
  }
  if (result.error) {
    return "failed";
  }
  return result.status === 0 ? "ok" : "failed";
}

function createTreeSitterEnv(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const allowed = [
    "PATH",
    "HOME",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "TMPDIR",
    "TEMP",
    "TMP",
    "SystemRoot",
    "WINDIR",
    "ComSpec",
    "PATHEXT",
  ];
  const env: NodeJS.ProcessEnv = {};
  for (const key of allowed) {
    if (source[key] !== undefined) {
      env[key] = source[key];
    }
  }
  return env;
}

function defaultTreeSitterRunner(
  command: string,
  args: string[],
  options: TreeSitterRunnerOptions,
): TreeSitterRunnerResult {
  return spawnSync(command, args, options);
}

function validateTreeSitterPath(value: string): string | undefined {
  if (!value.trim()) {
    return "file must not be empty.";
  }
  if (value.length > MAX_PATH_LENGTH) {
    return "file path is too long.";
  }
  if (CONTROL_CHAR_PATTERN.test(value)) {
    return "file path contains unsupported control characters.";
  }
  return undefined;
}

function isFlagLikeValue(value: string): boolean {
  return value.trimStart().startsWith("-");
}

function truncateSanitizedOutput(value: string | Buffer, maxBytes: number): { text: string; truncation: TextTruncation } {
  const text = Buffer.isBuffer(value) ? value.toString("utf8") : value;
  const sanitized = sanitizeOutput(text);
  return truncateText(sanitized, { maxBytes });
}

function sanitizeOutput(value: string): string {
  const stripped = value
    .replace(OSC_PATTERN, "")
    .replace(ANSI_PATTERN, "")
    .replace(OUTPUT_CONTROL_CHAR_PATTERN, "");
  const redacted = redactSecrets(stripped);
  return typeof redacted === "string" ? redacted : stripped;
}

function sanitizeInline(value: string): string {
  const stripped = value
    .replace(OSC_PATTERN, "")
    .replace(ANSI_PATTERN, "")
    .replace(OUTPUT_CONTROL_CHAR_PATTERN, " ");
  const redacted = redactSecrets(stripped);
  const text = typeof redacted === "string" ? redacted : stripped;
  return text.trim().slice(0, 240) || "[redacted]";
}

function indentOutput(value: string): string[] {
  if (!value.trim()) {
    return ["    - none"];
  }
  return value.replace(/\r\n|\r/g, "\n").split("\n").map((line) => `    ${line}`);
}

function formatCommandLine(command: string, args: string[]): string {
  return [command, ...args].map((part) => JSON.stringify(sanitizeInline(part))).join(" ");
}

function treeSitterMissingMessage(): string {
  return "tree-sitter CLI is not installed or not on PATH. Install it locally with the grammars you need, then rerun the command; lexical code-map commands still work without it.";
}

function safeRealpath(path: string): string | undefined {
  try {
    return realpathSync(path);
  } catch {
    return undefined;
  }
}

function isPathInside(parent: string, child: string): boolean {
  const relativePath = relative(parent, child);
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

function emptyTruncatedText(): { text: string; truncation: TextTruncation } {
  return { text: "", truncation: { ...EMPTY_TRUNCATION } };
}
