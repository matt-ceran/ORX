import { existsSync, realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { isAbsolute, relative, resolve } from "node:path";
import { redactSecrets } from "../mcp/audit.js";
import { truncateText } from "../tools/truncation.js";
import type { TextTruncation } from "../tools/types.js";

export const CODE_AST_GREP_USAGE =
  "Usage: orx code ast-grep <pattern> [path] [--lang <lang>] [--json] [--rewrite <template> [--preview]]";
export const SLASH_CODE_AST_GREP_USAGE =
  "Usage: /code ast-grep <pattern> [path] [--lang <lang>] [--json] [--rewrite <template> [--preview]]";

export interface CodeAstGrepArgs {
  pattern: string;
  targetPath?: string;
  lang?: string;
  json: boolean;
  rewrite?: string;
  preview: boolean;
}

export type CodeAstGrepParseResult =
  | { ok: true; args: CodeAstGrepArgs }
  | { ok: false; message: string };

export type CodeAstGrepStatus =
  | "ok"
  | "no_matches"
  | "tool_missing"
  | "invalid_arguments"
  | "failed"
  | "timed_out";

export interface AstGrepRunnerOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
  shell: false;
  encoding: "utf8";
  timeout: number;
  maxBuffer: number;
}

export interface AstGrepRunnerResult {
  status: number | null;
  signal: NodeJS.Signals | null;
  stdout?: string | Buffer;
  stderr?: string | Buffer;
  error?: Error & { code?: string };
}

export type AstGrepRunner = (
  command: string,
  args: string[],
  options: AstGrepRunnerOptions,
) => AstGrepRunnerResult;

export interface RunCodeAstGrepOptions extends CodeAstGrepArgs {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  runner?: AstGrepRunner;
  maxBytes?: number;
  timeoutMs?: number;
}

export interface CodeAstGrepResult {
  ok: boolean;
  status: CodeAstGrepStatus;
  root: string;
  targetPath: string;
  pattern: string;
  lang?: string;
  json: boolean;
  rewrite?: string;
  preview: boolean;
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

interface ResolvedAstGrepTarget {
  arg: string;
  displayPath: string;
}

interface ResolvedAstGrepCommand {
  ok: boolean;
  command?: string;
  message?: string;
}

const AST_GREP_COMMANDS = ["sg", "ast-grep"] as const;
const DEFAULT_AST_GREP_TIMEOUT_MS = 30_000;
const DEFAULT_AST_GREP_OUTPUT_BYTES = 128 * 1024;
const AST_GREP_DISCOVERY_TIMEOUT_MS = 5_000;
const AST_GREP_DISCOVERY_BYTES = 8 * 1024;
const MAX_PATTERN_LENGTH = 4096;
const MAX_REWRITE_LENGTH = 4096;
const MAX_LANG_LENGTH = 80;
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

export function parseCodeAstGrepArgs(args: string[], usage = CODE_AST_GREP_USAGE): CodeAstGrepParseResult {
  const positional: string[] = [];
  let lang: string | undefined;
  let rewrite: string | undefined;
  let json = false;
  let preview = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? "";
    if (arg === "--") {
      positional.push(...args.slice(index + 1));
      break;
    }
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--preview") {
      preview = true;
      continue;
    }
    if (arg === "--lang" || arg === "-l") {
      const value = args[index + 1];
      if (value === undefined) {
        return { ok: false, message: `${usage}\nMissing value for ${arg}.` };
      }
      lang = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--lang=")) {
      lang = arg.slice("--lang=".length);
      continue;
    }
    if (arg === "--rewrite" || arg === "-r") {
      const value = args[index + 1];
      if (value === undefined) {
        return { ok: false, message: `${usage}\nMissing value for ${arg}.` };
      }
      rewrite = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--rewrite=")) {
      rewrite = arg.slice("--rewrite=".length);
      continue;
    }
    if (arg.startsWith("-")) {
      return { ok: false, message: `${usage}\nUnknown ast-grep option: ${sanitizeInline(arg)}` };
    }
    positional.push(arg);
  }

  if (positional.length === 0 || !positional[0]?.trim()) {
    return { ok: false, message: usage };
  }
  if (positional.length > 2) {
    return { ok: false, message: `${usage}\nToo many positional arguments.` };
  }

  const pattern = positional[0] ?? "";
  const targetPath = positional[1];
  if (isFlagLikeValue(pattern)) {
    return { ok: false, message: `${usage}\npattern must not start with a dash.` };
  }
  const patternMessage = validateAstGrepField("pattern", pattern, MAX_PATTERN_LENGTH);
  if (patternMessage) {
    return { ok: false, message: `${usage}\n${patternMessage}` };
  }
  if (targetPath !== undefined) {
    if (isFlagLikeValue(targetPath)) {
      return { ok: false, message: `${usage}\npath must not start with a dash.` };
    }
    const pathMessage = validateAstGrepField("path", targetPath, MAX_PATH_LENGTH);
    if (pathMessage) {
      return { ok: false, message: `${usage}\n${pathMessage}` };
    }
  }
  if (lang !== undefined) {
    if (isFlagLikeValue(lang)) {
      return { ok: false, message: `${usage}\nlang must not start with a dash.` };
    }
    const langMessage = validateAstGrepField("lang", lang, MAX_LANG_LENGTH);
    if (langMessage) {
      return { ok: false, message: `${usage}\n${langMessage}` };
    }
  }
  if (rewrite !== undefined) {
    if (isFlagLikeValue(rewrite)) {
      return { ok: false, message: `${usage}\nrewrite must not start with a dash.` };
    }
    const rewriteMessage = validateAstGrepField("rewrite", rewrite, MAX_REWRITE_LENGTH);
    if (rewriteMessage) {
      return { ok: false, message: `${usage}\n${rewriteMessage}` };
    }
  }

  return {
    ok: true,
    args: {
      pattern,
      targetPath,
      lang,
      json,
      rewrite,
      preview,
    },
  };
}

export function parseCodeAstGrepArgText(argText: string, usage = CODE_AST_GREP_USAGE): CodeAstGrepParseResult {
  const tokens = splitAstGrepArgText(argText);
  if (typeof tokens === "string") {
    return { ok: false, message: `${usage}\n${tokens}` };
  }
  return parseCodeAstGrepArgs(tokens, usage);
}

export function runCodeAstGrep(options: RunCodeAstGrepOptions): CodeAstGrepResult {
  const root = resolve(options.cwd ?? process.cwd());
  const maxBytes = options.maxBytes ?? DEFAULT_AST_GREP_OUTPUT_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_AST_GREP_TIMEOUT_MS;
  const runner = options.runner ?? defaultAstGrepRunner;
  const env = createAstGrepEnv(options.env ?? process.env);
  const emptyText = emptyTruncatedText();

  const target = resolveAstGrepTarget(root, options.targetPath);
  if (!target.ok) {
    return {
      ok: false,
      status: "invalid_arguments",
      root,
      targetPath: options.targetPath ?? ".",
      pattern: options.pattern,
      lang: options.lang,
      json: options.json,
      rewrite: options.rewrite,
      preview: options.preview,
      args: [],
      timedOut: false,
      stdout: "",
      stderr: "",
      stdoutTruncation: emptyText.truncation,
      stderrTruncation: emptyText.truncation,
      message: target.message,
    };
  }

  const command = resolveAstGrepCommand(root, env, runner);
  if (!command.ok || !command.command) {
    return {
      ok: false,
      status: "tool_missing",
      root,
      targetPath: target.displayPath,
      pattern: options.pattern,
      lang: options.lang,
      json: options.json,
      rewrite: options.rewrite,
      preview: options.preview,
      args: [],
      timedOut: false,
      stdout: "",
      stderr: "",
      stdoutTruncation: emptyText.truncation,
      stderrTruncation: emptyText.truncation,
      message: command.message ?? astGrepMissingMessage(),
    };
  }

  const spawnArgs = buildAstGrepSpawnArgs(options, target.arg);
  const startedAt = performance.now();
  const result = runner(command.command, spawnArgs, {
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
  const status = classifyAstGrepRun(result, stdout.text, stderr.text, timedOut);

  return {
    ok: status === "ok" || status === "no_matches",
    status,
    root,
    targetPath: target.displayPath,
    pattern: options.pattern,
    lang: options.lang,
    json: options.json,
    rewrite: options.rewrite,
    preview: options.preview,
    command: command.command,
    args: spawnArgs,
    commandLine: formatCommandLine(command.command, spawnArgs),
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

export function renderCodeAstGrepResult(result: CodeAstGrepResult, usage = CODE_AST_GREP_USAGE): string {
  const lines = [
    "Code ast-grep",
    `  status: ${result.status}`,
    `  root: ${sanitizeInline(result.root)}`,
    `  path: ${sanitizeInline(result.targetPath)}`,
    `  mode: ${result.rewrite ? "rewrite_preview" : "search"}`,
    "  mutation: none",
  ];
  if (result.lang) {
    lines.push(`  lang: ${JSON.stringify(sanitizeInline(result.lang))}`);
  }
  if (result.json) {
    lines.push("  output_format: ast-grep_json");
  }
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
  if (result.message && result.status !== "tool_missing") {
    lines.push(`  message: ${sanitizeInline(result.message)}`);
  }
  if (result.status === "tool_missing") {
    lines.push(`  setup: ${astGrepMissingMessage()}`);
  }
  if (result.status === "invalid_arguments" && result.message) {
    lines.push(`  error: ${sanitizeInline(result.message)}`);
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

  lines.push(`  usage: ${usage.replace(/^Usage:\s*/, "")}`);
  return lines.join("\n");
}

function buildAstGrepSpawnArgs(options: CodeAstGrepArgs, targetArg: string): string[] {
  const args = ["run", "--pattern", options.pattern, "--color", "never", "--heading", "never"];
  if (options.lang) {
    args.push("--lang", options.lang);
  }
  if (options.rewrite) {
    args.push("--rewrite", options.rewrite);
  }
  if (options.json) {
    args.push("--json");
  }
  args.push(targetArg);
  return args;
}

function splitAstGrepArgText(text: string): string[] | string {
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
    return "Unterminated quoted ast-grep argument.";
  }
  if (tokenStarted) {
    tokens.push(current);
  }
  return tokens;
}

function resolveAstGrepCommand(
  cwd: string,
  env: NodeJS.ProcessEnv,
  runner: AstGrepRunner,
): ResolvedAstGrepCommand {
  for (const command of AST_GREP_COMMANDS) {
    const result = runner(command, ["--version"], {
      cwd,
      env,
      shell: false,
      encoding: "utf8",
      timeout: AST_GREP_DISCOVERY_TIMEOUT_MS,
      maxBuffer: AST_GREP_DISCOVERY_BYTES,
    });
    if (result.status === 0) {
      return { ok: true, command };
    }
    if (result.error && !isCommandMissingError(result.error)) {
      continue;
    }
  }
  return { ok: false, message: astGrepMissingMessage() };
}

function resolveAstGrepTarget(
  cwd: string,
  targetPath?: string,
): { ok: true; arg: string; displayPath: string } | { ok: false; message: string } {
  const targetInput = targetPath?.trim() || ".";
  const resolvedTarget = resolve(cwd, targetInput);
  if (!isPathInside(cwd, resolvedTarget)) {
    return {
      ok: false,
      message: "ast-grep path must stay inside the current working directory.",
    };
  }

  const realCwd = safeRealpath(cwd) ?? cwd;
  const realTarget = existsSync(resolvedTarget) ? safeRealpath(resolvedTarget) : undefined;
  if (realTarget && !isPathInside(realCwd, realTarget)) {
    return {
      ok: false,
      message: "ast-grep path resolves outside the current working directory.",
    };
  }

  const relativeTarget = relative(cwd, resolvedTarget).split(/[\\/]/g).join("/") || ".";
  if (isFlagLikeValue(relativeTarget)) {
    return {
      ok: false,
      message: "ast-grep path must not resolve to a dash-prefixed operand.",
    };
  }
  return {
    ok: true,
    arg: relativeTarget,
    displayPath: relativeTarget,
  };
}

function classifyAstGrepRun(
  result: AstGrepRunnerResult,
  stdout: string,
  stderr: string,
  timedOut: boolean,
): CodeAstGrepStatus {
  if (timedOut) {
    return "timed_out";
  }
  if (result.error) {
    return "failed";
  }
  if (result.status === 0) {
    return "ok";
  }
  if (result.status === 1 && !stdout.trim() && !stderr.trim()) {
    return "no_matches";
  }
  return "failed";
}

function createAstGrepEnv(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
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

function defaultAstGrepRunner(
  command: string,
  args: string[],
  options: AstGrepRunnerOptions,
): AstGrepRunnerResult {
  return spawnSync(command, args, options);
}

function validateAstGrepField(name: string, value: string, maxLength: number): string | undefined {
  if (!value.trim()) {
    return `${name} must not be empty.`;
  }
  if (value.length > maxLength) {
    return `${name} is too long.`;
  }
  if (CONTROL_CHAR_PATTERN.test(value)) {
    return `${name} contains unsupported control characters.`;
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

function astGrepMissingMessage(): string {
  return "ast-grep is not installed or not on PATH. Install it locally and ensure `sg` or `ast-grep` is available, then rerun the command.";
}

function isCommandMissingError(error: Error & { code?: string }): boolean {
  return error.code === "ENOENT" || error.code === "ENOTDIR";
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
