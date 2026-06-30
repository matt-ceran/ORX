import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { redactSecrets } from "../mcp/audit.js";
import { truncateText } from "../tools/truncation.js";
import type { TextTruncation } from "../tools/types.js";

export const CODE_TREE_SITTER_USAGE = "Usage: orx code tree-sitter [parse|outline|calls] <file>";
export const CODE_TREE_SITTER_OUTLINE_USAGE = "Usage: orx code outline <file>";
export const SLASH_CODE_TREE_SITTER_USAGE = "Usage: /code tree-sitter [parse|outline|calls] <file>";
export const SLASH_CODE_TREE_SITTER_OUTLINE_USAGE = "Usage: /code outline <file>";

export interface CodeTreeSitterArgs {
  targetPath: string;
  mode?: CodeTreeSitterMode;
}

export type CodeTreeSitterMode = "parse" | "outline" | "calls";

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
  mode: CodeTreeSitterMode;
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
  outline?: CodeTreeSitterOutline;
  calls?: CodeTreeSitterCalls;
  message?: string;
}

export interface CodeTreeSitterOutline {
  entries: CodeTreeSitterOutlineEntry[];
  totalEntries: number;
  omittedEntries: number;
  truncated: boolean;
  warnings: string[];
}

export interface CodeTreeSitterOutlineEntry {
  kind: string;
  name?: string;
  line?: number;
  column?: number;
  depth: number;
}

export interface CodeTreeSitterCalls {
  edges: CodeTreeSitterCallEdge[];
  totalEdges: number;
  omittedEdges: number;
  truncated: boolean;
  warnings: string[];
}

export interface CodeTreeSitterCallEdge {
  caller?: CodeTreeSitterOutlineEntry;
  callee?: string;
  line?: number;
  column?: number;
  depth: number;
}

const TREE_SITTER_COMMAND = "tree-sitter";
const DEFAULT_TREE_SITTER_TIMEOUT_MS = 30_000;
const DEFAULT_TREE_SITTER_OUTPUT_BYTES = 128 * 1024;
const TREE_SITTER_DISCOVERY_TIMEOUT_MS = 5_000;
const TREE_SITTER_DISCOVERY_BYTES = 8 * 1024;
const DEFAULT_TREE_SITTER_OUTLINE_ENTRIES = 120;
const DEFAULT_TREE_SITTER_CALL_EDGES = 160;
const MAX_PATH_LENGTH = 4096;
const CONTROL_CHAR_PATTERN = /[\x00-\x1F\x7F]/;
const OUTPUT_CONTROL_CHAR_PATTERN = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;
const ANSI_PATTERN = /\x1B\[[0-?]*[ -/]*[@-~]/g;
const OSC_PATTERN = /\x1B\][^\x07]*(?:\x07|\x1B\\)/g;
const TREE_SITTER_RANGE_PATTERN = /\[(\d+),\s*(\d+)\]\s*-\s*\[(\d+),\s*(\d+)\]/;
const TREE_SITTER_NAME_RANGE_PATTERN =
  /(?:^|\s)name:\s*\((?:identifier|property_identifier|type_identifier|field_identifier)\s+(\[\d+,\s*\d+\]\s*-\s*\[\d+,\s*\d+\])/;
const TREE_SITTER_OUTLINE_NODE_KINDS = new Set([
  "arrow_function",
  "class_declaration",
  "class_definition",
  "class_item",
  "const_declaration",
  "enum_declaration",
  "enum_item",
  "function_declaration",
  "function_definition",
  "function_item",
  "interface_declaration",
  "method_declaration",
  "method_definition",
  "mod_item",
  "struct_item",
  "trait_item",
  "type_alias_declaration",
  "type_declaration",
  "variable_declarator",
]);

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
  options: { defaultMode?: CodeTreeSitterMode } = {},
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

  const first = positional[0]?.toLowerCase();
  const hasExplicitMode = first === "parse" || first === "outline" || first === "calls";
  const mode = hasExplicitMode ? first : options.defaultMode ?? "parse";
  const targetPath = hasExplicitMode ? positional[1] ?? "" : positional[0] ?? "";

  if ((hasExplicitMode ? positional.length !== 2 : positional.length !== 1) || !targetPath.trim()) {
    return { ok: false, message: usage };
  }
  if (isFlagLikeValue(targetPath)) {
    return { ok: false, message: `${usage}\nfile must not start with a dash.` };
  }
  const pathMessage = validateTreeSitterPath(targetPath);
  if (pathMessage) {
    return { ok: false, message: `${usage}\n${pathMessage}` };
  }
  return { ok: true, args: { targetPath, mode } };
}

export function parseCodeTreeSitterArgText(
  argText: string,
  usage = CODE_TREE_SITTER_USAGE,
  options: { defaultMode?: CodeTreeSitterMode } = {},
): CodeTreeSitterParseResult {
  const tokens = splitTreeSitterArgText(argText);
  if (typeof tokens === "string") {
    return { ok: false, message: `${usage}\n${tokens}` };
  }
  return parseCodeTreeSitterArgs(tokens, usage, options);
}

export function runCodeTreeSitter(options: RunCodeTreeSitterOptions): CodeTreeSitterResult {
  const root = resolve(options.cwd ?? process.cwd());
  const mode = options.mode ?? "parse";
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
      mode,
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
      mode,
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
  const source = mode === "outline" || mode === "calls"
    ? readTreeSitterSource(root, target.displayPath)
    : undefined;
  const outline = status === "ok" && mode === "outline"
    ? createTreeSitterOutline(stdout.text, source, {
        maxEntries: DEFAULT_TREE_SITTER_OUTLINE_ENTRIES,
        parseOutputTruncated: stdout.truncation.truncated,
      })
    : undefined;
  const calls = status === "ok" && mode === "calls"
    ? createTreeSitterCalls(stdout.text, source, {
        maxEdges: DEFAULT_TREE_SITTER_CALL_EDGES,
        parseOutputTruncated: stdout.truncation.truncated,
      })
    : undefined;

  return {
    ok: status === "ok",
    status,
    mode,
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
    outline,
    calls,
    message: result.error && !timedOut ? sanitizeInline(result.error.message) : undefined,
  };
}

export function renderCodeTreeSitterResult(
  result: CodeTreeSitterResult,
  usage = CODE_TREE_SITTER_USAGE,
): string {
  if (result.mode === "outline") {
    return renderCodeTreeSitterOutlineResult(result, usage);
  }
  if (result.mode === "calls") {
    return renderCodeTreeSitterCallsResult(result, usage);
  }

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

function renderCodeTreeSitterOutlineResult(
  result: CodeTreeSitterResult,
  usage: string,
): string {
  const lines = [
    "Code tree-sitter outline",
    `  status: ${result.status}`,
    `  root: ${sanitizeInline(result.root)}`,
    `  file: ${sanitizeInline(result.targetPath)}`,
    "  mode: AST-backed local outline via optional tree-sitter CLI",
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

  lines.push("  outline:");
  if (!result.outline || result.outline.entries.length === 0) {
    lines.push("    - none");
  } else {
    for (const entry of result.outline.entries) {
      lines.push(formatOutlineEntry(entry));
    }
    if (result.outline.omittedEntries > 0) {
      lines.push(`    - ${result.outline.omittedEntries} more AST outline entries omitted`);
    }
  }

  if (result.outline && result.outline.warnings.length > 0) {
    lines.push("  warnings:");
    for (const warning of result.outline.warnings) {
      lines.push(`    - ${sanitizeInline(warning)}`);
    }
  }

  if (result.status !== "ok") {
    lines.push("  stdout:");
    lines.push(...indentOutput(result.stdout));
    if (result.stdoutTruncation.truncated) {
      lines.push(`    - stdout truncated: ${result.stdoutTruncation.omittedBytes}B omitted`);
    }
  }

  lines.push("  stderr:");
  lines.push(...indentOutput(result.stderr));
  if (result.stderrTruncation.truncated) {
    lines.push(`    - stderr truncated: ${result.stderrTruncation.omittedBytes}B omitted`);
  }

  lines.push("  raw_parse: use tree-sitter parse mode for the full AST");
  lines.push("  fallback: lexical code-map, symbols, refs, imports, and calls remain available without tree-sitter");
  lines.push(`  usage: ${usage.replace(/^Usage:\s*/, "")}`);
  return lines.join("\n");
}

function renderCodeTreeSitterCallsResult(
  result: CodeTreeSitterResult,
  usage: string,
): string {
  const lines = [
    "Code tree-sitter calls",
    `  status: ${result.status}`,
    `  root: ${sanitizeInline(result.root)}`,
    `  file: ${sanitizeInline(result.targetPath)}`,
    "  mode: AST-backed local single-file call extraction via optional tree-sitter CLI",
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

  lines.push("  calls:");
  if (!result.calls || result.calls.edges.length === 0) {
    lines.push("    - none");
  } else {
    for (const edge of result.calls.edges) {
      lines.push(formatCallEdge(edge));
    }
    if (result.calls.omittedEdges > 0) {
      lines.push(`    - ${result.calls.omittedEdges} more AST call edges omitted`);
    }
  }

  if (result.calls && result.calls.warnings.length > 0) {
    lines.push("  warnings:");
    for (const warning of result.calls.warnings) {
      lines.push(`    - ${sanitizeInline(warning)}`);
    }
  }

  if (result.status !== "ok") {
    lines.push("  stdout:");
    lines.push(...indentOutput(result.stdout));
    if (result.stdoutTruncation.truncated) {
      lines.push(`    - stdout truncated: ${result.stdoutTruncation.omittedBytes}B omitted`);
    }
  }

  lines.push("  stderr:");
  lines.push(...indentOutput(result.stderr));
  if (result.stderrTruncation.truncated) {
    lines.push(`    - stderr truncated: ${result.stderrTruncation.omittedBytes}B omitted`);
  }

  lines.push("  raw_parse: use tree-sitter parse mode for the full AST");
  lines.push("  fallback: lexical code-map, symbols, refs, imports, and calls remain available without tree-sitter");
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

function createTreeSitterOutline(
  stdout: string,
  source: string | undefined,
  options: { maxEntries: number; parseOutputTruncated: boolean },
): CodeTreeSitterOutline {
  const sourceLines = source?.split(/\r\n|\r|\n/g);
  const parsedLines = stdout
    .replace(/\r\n|\r/g, "\n")
    .split("\n")
    .map(parseTreeSitterAstLine);
  const entries: CodeTreeSitterOutlineEntry[] = [];
  const warnings: string[] = [];
  let totalEntries = 0;

  for (let index = 0; index < parsedLines.length; index += 1) {
    const line = parsedLines[index];
    if (!line || !TREE_SITTER_OUTLINE_NODE_KINDS.has(line.kind)) {
      continue;
    }
    totalEntries += 1;
    if (entries.length >= options.maxEntries) {
      continue;
    }
    const nameRange =
      parseNamedRangeFromText(line.raw) ??
      findChildNameRange(parsedLines, index);
    const name = nameRange && sourceLines ? extractSourceRange(sourceLines, nameRange) : undefined;
    entries.push({
      kind: line.kind,
      name,
      line: line.range ? line.range.startLine + 1 : undefined,
      column: line.range ? line.range.startColumn + 1 : undefined,
      depth: Math.max(0, Math.floor(line.indent / 2)),
    });
  }

  if (totalEntries === 0 && stdout.trim()) {
    warnings.push("no outline-compatible AST definition nodes found; use parse mode for the raw tree");
  }
  if (options.parseOutputTruncated) {
    warnings.push("tree-sitter parse output was truncated before outline extraction; later AST entries may be omitted");
  }
  if (sourceLines === undefined && entries.some((entry) => entry.name === undefined)) {
    warnings.push("source file could not be read for AST name extraction");
  }

  return {
    entries,
    totalEntries,
    omittedEntries: Math.max(0, totalEntries - entries.length),
    truncated: totalEntries > entries.length || options.parseOutputTruncated,
    warnings,
  };
}

function createTreeSitterCalls(
  stdout: string,
  source: string | undefined,
  options: { maxEdges: number; parseOutputTruncated: boolean },
): CodeTreeSitterCalls {
  const sourceLines = source?.split(/\r\n|\r|\n/g);
  const parsedLines = stdout
    .replace(/\r\n|\r/g, "\n")
    .split("\n")
    .map(parseTreeSitterAstLine);
  const definitionByIndex = new Map<number, CodeTreeSitterOutlineEntry>();
  const stack: number[] = [];
  const edges: CodeTreeSitterCallEdge[] = [];
  const warnings: string[] = [];
  let totalEdges = 0;

  for (let index = 0; index < parsedLines.length; index += 1) {
    const line = parsedLines[index];
    if (!line) {
      continue;
    }
    while (stack.length > 0) {
      const parent = parsedLines[stack.at(-1) ?? -1];
      if (!parent || parent.indent < line.indent) {
        break;
      }
      stack.pop();
    }

    if (
      TREE_SITTER_OUTLINE_NODE_KINDS.has(line.kind) &&
      line.kind !== "arrow_function" &&
      line.kind !== "function_expression"
    ) {
      const nameRange = findDefinitionNameRangeForCalls(parsedLines, stack, index);
      definitionByIndex.set(index, {
        kind: line.kind,
        name: nameRange && sourceLines ? extractSourceRange(sourceLines, nameRange) : undefined,
        line: line.range ? line.range.startLine + 1 : undefined,
        column: line.range ? line.range.startColumn + 1 : undefined,
        depth: Math.max(0, Math.floor(line.indent / 2)),
      });
    }

    if (line.kind === "call_expression") {
      totalEdges += 1;
      if (edges.length < options.maxEdges) {
        const calleeRange = findCallFunctionRange(parsedLines, index);
        const callee = calleeRange && sourceLines ? extractSourceRange(sourceLines, calleeRange) : undefined;
        edges.push({
          caller: findNearestCaller(parsedLines, stack, definitionByIndex),
          callee,
          line: line.range ? line.range.startLine + 1 : undefined,
          column: line.range ? line.range.startColumn + 1 : undefined,
          depth: Math.max(0, Math.floor(line.indent / 2)),
        });
      }
    }

    stack.push(index);
  }

  if (totalEdges === 0 && stdout.trim()) {
    warnings.push("no call_expression AST nodes found; use parse mode for the raw tree");
  }
  if (options.parseOutputTruncated) {
    warnings.push("tree-sitter parse output was truncated before call extraction; later AST call edges may be omitted");
  }
  if (sourceLines === undefined && edges.some((edge) => !edge.callee || !edge.caller?.name)) {
    warnings.push("source file could not be read for AST call name extraction");
  }

  return {
    edges,
    totalEdges,
    omittedEdges: Math.max(0, totalEdges - edges.length),
    truncated: totalEdges > edges.length || options.parseOutputTruncated,
    warnings,
  };
}

interface ParsedTreeSitterAstLine {
  raw: string;
  indent: number;
  kind: string;
  range?: TreeSitterRange;
}

interface TreeSitterRange {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

function parseTreeSitterAstLine(raw: string): ParsedTreeSitterAstLine | undefined {
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }
  const nodeMatch = /^(?:(?:[A-Za-z_][\w-]*):\s*)?\(?([A-Za-z_][\w-]*)\b/.exec(trimmed);
  const kind = nodeMatch?.[1];
  if (!kind) {
    return undefined;
  }
  return {
    raw,
    indent: raw.length - raw.trimStart().length,
    kind,
    range: parseRangeFromText(trimmed),
  };
}

function parseNamedRangeFromText(text: string): TreeSitterRange | undefined {
  const match = TREE_SITTER_NAME_RANGE_PATTERN.exec(text);
  return match?.[1] ? parseRangeFromText(match[1]) : undefined;
}

function findChildNameRange(
  lines: Array<ParsedTreeSitterAstLine | undefined>,
  startIndex: number,
): TreeSitterRange | undefined {
  const parent = lines[startIndex];
  if (!parent) {
    return undefined;
  }
  for (let index = startIndex + 1; index < Math.min(lines.length, startIndex + 24); index += 1) {
    const line = lines[index];
    if (!line) {
      continue;
    }
    if (line.indent <= parent.indent) {
      break;
    }
    const range = parseNamedRangeFromText(line.raw);
    if (range) {
      return range;
    }
  }
  return undefined;
}

function findDefinitionNameRangeForCalls(
  lines: Array<ParsedTreeSitterAstLine | undefined>,
  stack: number[],
  startIndex: number,
): TreeSitterRange | undefined {
  const line = lines[startIndex];
  if (!line) {
    return undefined;
  }
  const ownNameRange = parseNamedRangeFromText(line.raw);
  if (ownNameRange) {
    return ownNameRange;
  }
  if (line.kind === "arrow_function" || line.kind === "function_expression") {
    for (let index = stack.length - 1; index >= 0; index -= 1) {
      const parentIndex = stack[index];
      const parent = parentIndex === undefined ? undefined : lines[parentIndex];
      if (!parent) {
        continue;
      }
      if (
        parent.kind === "variable_declarator" ||
        parent.kind === "assignment_expression" ||
        parent.kind === "pair" ||
        parent.kind === "method_definition" ||
        parent.kind === "field_definition" ||
        parent.kind === "public_field_definition"
      ) {
        return parseNamedRangeFromText(parent.raw) ?? findChildNameRange(lines, parentIndex);
      }
    }
    return undefined;
  }
  return findChildNameRange(lines, startIndex);
}

function findNearestCaller(
  lines: Array<ParsedTreeSitterAstLine | undefined>,
  stack: number[],
  definitionByIndex: Map<number, CodeTreeSitterOutlineEntry>,
): CodeTreeSitterOutlineEntry | undefined {
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    const lineIndex = stack[index];
    if (lineIndex === undefined || !lines[lineIndex]) {
      continue;
    }
    const definition = definitionByIndex.get(lineIndex);
    if (definition?.name) {
      return definition;
    }
  }
  return undefined;
}

function findCallFunctionRange(
  lines: Array<ParsedTreeSitterAstLine | undefined>,
  startIndex: number,
): TreeSitterRange | undefined {
  const parent = lines[startIndex];
  if (!parent) {
    return undefined;
  }
  let functionFieldRange: TreeSitterRange | undefined;
  let propertyRange: TreeSitterRange | undefined;
  let functionChildIndent: number | undefined;
  let functionChildKind: string | undefined;

  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) {
      continue;
    }
    if (line.indent <= parent.indent) {
      break;
    }
    if (line.kind === "arguments" && line.indent <= parent.indent + 4) {
      break;
    }
    const isDirectFunctionChild = /function:\s*\(/.test(line.raw);
    if (functionChildIndent === undefined && isDirectFunctionChild) {
      functionChildIndent = line.indent;
      functionChildKind = line.kind;
    }
    if (functionChildIndent !== undefined && line.indent < functionChildIndent) {
      break;
    }
    if (
      functionChildIndent !== undefined &&
      line.indent > functionChildIndent &&
      functionChildKind !== "member_expression"
    ) {
      continue;
    }
    if (line.kind === "property_identifier" && functionChildKind === "member_expression") {
      propertyRange = line.range;
    }
    if (/function:\s*\((?:identifier|property_identifier|field_identifier)\b/.test(line.raw)) {
      functionFieldRange = line.range;
    }
  }

  return propertyRange ?? functionFieldRange;
}

function parseRangeFromText(text: string): TreeSitterRange | undefined {
  const match = TREE_SITTER_RANGE_PATTERN.exec(text);
  if (!match) {
    return undefined;
  }
  return {
    startLine: Number.parseInt(match[1] ?? "0", 10),
    startColumn: Number.parseInt(match[2] ?? "0", 10),
    endLine: Number.parseInt(match[3] ?? "0", 10),
    endColumn: Number.parseInt(match[4] ?? "0", 10),
  };
}

function readTreeSitterSource(root: string, targetPath: string): string | undefined {
  try {
    return readFileSync(resolve(root, targetPath), "utf8");
  } catch {
    return undefined;
  }
}

function extractSourceRange(sourceLines: string[], range: TreeSitterRange): string | undefined {
  const startLine = sourceLines[range.startLine];
  if (startLine === undefined) {
    return undefined;
  }
  if (range.startLine === range.endLine) {
    return sanitizeInline(startLine.slice(range.startColumn, range.endColumn));
  }
  const parts = [
    startLine.slice(range.startColumn),
    ...sourceLines.slice(range.startLine + 1, range.endLine),
    sourceLines[range.endLine]?.slice(0, range.endColumn) ?? "",
  ];
  return sanitizeInline(parts.join("\n"));
}

function formatOutlineEntry(entry: CodeTreeSitterOutlineEntry): string {
  const parts = [
    `    - kind=${JSON.stringify(sanitizeInline(entry.kind))}`,
    entry.name ? `name=${JSON.stringify(sanitizeInline(entry.name))}` : undefined,
    entry.line !== undefined ? `line=${entry.line}` : undefined,
    entry.column !== undefined ? `column=${entry.column}` : undefined,
    `depth=${entry.depth}`,
  ];
  return parts.filter((part): part is string => typeof part === "string").join(" ");
}

function formatCallEdge(edge: CodeTreeSitterCallEdge): string {
  const callerName = edge.caller?.name ?? "[top-level]";
  const parts = [
    `    - caller=${JSON.stringify(sanitizeInline(callerName))}`,
    edge.caller?.kind ? `caller_kind=${JSON.stringify(sanitizeInline(edge.caller.kind))}` : undefined,
    edge.caller?.line !== undefined ? `caller_line=${edge.caller.line}` : undefined,
    edge.callee ? `callee=${JSON.stringify(sanitizeInline(edge.callee))}` : undefined,
    edge.line !== undefined ? `line=${edge.line}` : undefined,
    edge.column !== undefined ? `column=${edge.column}` : undefined,
    `depth=${edge.depth}`,
  ];
  return parts.filter((part): part is string => typeof part === "string").join(" ");
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
