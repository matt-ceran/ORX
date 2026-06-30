import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import { redactSecrets } from "../mcp/audit.js";
import { truncateText } from "../tools/truncation.js";
import type { TextTruncation } from "../tools/types.js";

export const CODE_TREE_SITTER_USAGE = "Usage: orx code tree-sitter [parse|outline|imports|refs|calls|repo-refs|repo-calls|repo-imports] <file-or-query> [query-or-path]";
export const CODE_TREE_SITTER_OUTLINE_USAGE = "Usage: orx code outline <file>";
export const SLASH_CODE_TREE_SITTER_USAGE = "Usage: /code tree-sitter [parse|outline|imports|refs|calls|repo-refs|repo-calls|repo-imports] <file-or-query> [query-or-path]";
export const SLASH_CODE_TREE_SITTER_OUTLINE_USAGE = "Usage: /code outline <file>";

export interface CodeTreeSitterArgs {
  targetPath: string;
  mode?: CodeTreeSitterMode;
  query?: string;
}

export type CodeTreeSitterMode =
  | "parse"
  | "outline"
  | "imports"
  | "refs"
  | "calls"
  | "repo-refs"
  | "repo-calls"
  | "repo-imports";

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
  query?: string;
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
  imports?: CodeTreeSitterImports;
  repoImports?: CodeTreeSitterRepoImports;
  references?: CodeTreeSitterReferences;
  repoReferences?: CodeTreeSitterRepoReferences;
  calls?: CodeTreeSitterCalls;
  repoCalls?: CodeTreeSitterRepoCalls;
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

export interface CodeTreeSitterImports {
  edges: CodeTreeSitterImportEdge[];
  totalEdges: number;
  omittedEdges: number;
  truncated: boolean;
  warnings: string[];
}

export interface CodeTreeSitterImportEdge {
  kind: "import" | "reexport" | "require" | "dynamic_import";
  source?: string;
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

export interface CodeTreeSitterRepoImports {
  targetPath: string;
  edges: CodeTreeSitterRepoImportEdge[];
  totalEdges: number;
  omittedEdges: number;
  filesScanned: number;
  filesWithImports: number;
  omittedFiles: number;
  failedFiles: number;
  timedOutFiles: number;
  truncated: boolean;
  warnings: string[];
  omissions: CodeTreeSitterRepoOmission[];
}

export interface CodeTreeSitterReferences {
  query: string;
  matches: CodeTreeSitterReferenceMatch[];
  totalMatches: number;
  omittedMatches: number;
  truncated: boolean;
  warnings: string[];
}

export interface CodeTreeSitterRepoReferences {
  query: string;
  targetPath: string;
  matches: CodeTreeSitterRepoReferenceMatch[];
  totalMatches: number;
  omittedMatches: number;
  filesScanned: number;
  filesWithMatches: number;
  omittedFiles: number;
  failedFiles: number;
  timedOutFiles: number;
  truncated: boolean;
  warnings: string[];
  omissions: CodeTreeSitterRepoOmission[];
}

export interface CodeTreeSitterRepoCalls {
  targetPath: string;
  edges: CodeTreeSitterRepoCallEdge[];
  totalEdges: number;
  omittedEdges: number;
  filesScanned: number;
  filesWithCalls: number;
  omittedFiles: number;
  failedFiles: number;
  timedOutFiles: number;
  truncated: boolean;
  warnings: string[];
  omissions: CodeTreeSitterRepoOmission[];
}

export interface CodeTreeSitterReferenceMatch {
  name: string;
  kind: string;
  role: string;
  line?: number;
  column?: number;
  depth: number;
}

export interface CodeTreeSitterRepoReferenceMatch extends CodeTreeSitterReferenceMatch {
  path: string;
}

export interface CodeTreeSitterRepoCallEdge extends CodeTreeSitterCallEdge {
  path: string;
}

export interface CodeTreeSitterRepoImportEdge extends CodeTreeSitterImportEdge {
  path: string;
}

export interface CodeTreeSitterRepoOmission {
  path?: string;
  reason: string;
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
const DEFAULT_TREE_SITTER_IMPORT_EDGES = 160;
const DEFAULT_TREE_SITTER_REFERENCE_MATCHES = 200;
const DEFAULT_TREE_SITTER_CALL_EDGES = 160;
const DEFAULT_TREE_SITTER_REPO_FILES = 80;
const DEFAULT_TREE_SITTER_REPO_MATCHES = 400;
const DEFAULT_TREE_SITTER_REPO_CALL_EDGES = 400;
const DEFAULT_TREE_SITTER_REPO_IMPORT_EDGES = 400;
const MAX_TREE_SITTER_REPO_DEPTH = 8;
const MAX_TREE_SITTER_REPO_SOURCE_BYTES = 512 * 1024;
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
const TREE_SITTER_REFERENCE_NODE_KINDS = new Set([
  "identifier",
  "field_identifier",
  "private_property_identifier",
  "property_identifier",
  "shorthand_property_identifier",
  "type_identifier",
]);
const TREE_SITTER_REFERENCE_QUERY_PATTERN = /^[A-Za-z_$][\w$]*$/;
const TREE_SITTER_REPO_SOURCE_EXTENSIONS = new Set([
  ".c",
  ".cc",
  ".cpp",
  ".cjs",
  ".cs",
  ".cts",
  ".go",
  ".h",
  ".hpp",
  ".java",
  ".js",
  ".jsx",
  ".mjs",
  ".mts",
  ".php",
  ".py",
  ".rb",
  ".rs",
  ".swift",
  ".ts",
  ".tsx",
]);
const TREE_SITTER_REPO_SKIPPED_DIRECTORIES = new Set([
  ".cache",
  ".git",
  ".hg",
  ".next",
  ".nuxt",
  ".orx",
  ".svn",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "target",
  "vendor",
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
  const explicitMode = normalizeTreeSitterMode(first);
  const hasExplicitMode = explicitMode !== undefined;
  const mode = hasExplicitMode ? explicitMode : options.defaultMode ?? "parse";
  const isRepoRefs = mode === "repo-refs";
  const isRepoCalls = mode === "repo-calls";
  const isRepoImports = mode === "repo-imports";
  const isRepoNoQuery = isRepoCalls || isRepoImports;
  const targetPath = isRepoRefs
    ? hasExplicitMode ? positional[2] ?? "." : positional[1] ?? "."
    : isRepoNoQuery
      ? hasExplicitMode ? positional[1] ?? "." : positional[0] ?? "."
    : hasExplicitMode ? positional[1] ?? "" : positional[0] ?? "";
  const query = isRepoRefs
    ? hasExplicitMode ? positional[1] ?? "" : positional[0] ?? ""
    : hasExplicitMode ? positional[2] ?? "" : positional[1] ?? "";
  const validLength = isRepoRefs
    ? hasExplicitMode
      ? positional.length === 2 || positional.length === 3
      : positional.length === 1 || positional.length === 2
    : isRepoNoQuery
      ? hasExplicitMode
        ? positional.length === 1 || positional.length === 2
        : positional.length === 0 || positional.length === 1
    : mode === "refs"
      ? positional.length === (hasExplicitMode ? 3 : 2)
      : positional.length === (hasExplicitMode ? 2 : 1);

  if (!validLength || !targetPath.trim()) {
    return { ok: false, message: usage };
  }
  if (isFlagLikeValue(targetPath)) {
    return { ok: false, message: `${usage}\nfile must not start with a dash.` };
  }
  const pathMessage = validateTreeSitterPath(targetPath);
  if (pathMessage) {
    return { ok: false, message: `${usage}\n${pathMessage}` };
  }
  if (mode === "refs" || isRepoRefs) {
    const queryMessage = validateTreeSitterReferenceQuery(query);
    if (queryMessage) {
      return { ok: false, message: `${usage}\n${queryMessage}` };
    }
  }
  return { ok: true, args: { targetPath, mode, ...(mode === "refs" || isRepoRefs ? { query: query.trim() } : {}) } };
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
  const query = mode === "refs" || mode === "repo-refs" ? options.query?.trim() ?? "" : undefined;
  const queryMessage = mode === "refs" || mode === "repo-refs"
    ? validateTreeSitterReferenceQuery(query ?? "")
    : undefined;
  if (queryMessage) {
    return {
      ok: false,
      status: "invalid_arguments",
      mode,
      query,
      root,
      targetPath: options.targetPath,
      args: [],
      timedOut: false,
      stdout: "",
      stderr: "",
      stdoutTruncation: emptyText.truncation,
      stderrTruncation: emptyText.truncation,
      message: queryMessage,
    };
  }

  if (mode === "repo-refs") {
    return runCodeTreeSitterRepoReferences({
      root,
      targetPath: options.targetPath,
      query: query ?? "",
      env,
      runner,
      maxBytes,
      timeoutMs,
      emptyText,
    });
  }

  if (mode === "repo-imports") {
    return runCodeTreeSitterRepoImports({
      root,
      targetPath: options.targetPath,
      env,
      runner,
      maxBytes,
      timeoutMs,
      emptyText,
    });
  }

  if (mode === "repo-calls") {
    return runCodeTreeSitterRepoCalls({
      root,
      targetPath: options.targetPath,
      env,
      runner,
      maxBytes,
      timeoutMs,
      emptyText,
    });
  }

  const target = resolveTreeSitterTarget(root, options.targetPath);
  if (!target.ok) {
    return {
      ok: false,
      status: "invalid_arguments",
      mode,
      query,
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
      query,
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
  const source = mode === "outline" || mode === "imports" || mode === "refs" || mode === "calls"
    ? readTreeSitterSource(root, target.displayPath)
    : undefined;
  const outline = status === "ok" && mode === "outline"
    ? createTreeSitterOutline(stdout.text, source, {
        maxEntries: DEFAULT_TREE_SITTER_OUTLINE_ENTRIES,
        parseOutputTruncated: stdout.truncation.truncated,
      })
    : undefined;
  const imports = status === "ok" && mode === "imports"
    ? createTreeSitterImports(stdout.text, source, {
        maxEdges: DEFAULT_TREE_SITTER_IMPORT_EDGES,
        parseOutputTruncated: stdout.truncation.truncated,
      })
    : undefined;
  const references = status === "ok" && mode === "refs"
    ? createTreeSitterReferences(stdout.text, source, query ?? "", {
        maxMatches: DEFAULT_TREE_SITTER_REFERENCE_MATCHES,
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
    query,
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
    imports,
    references,
    calls,
    message: result.error && !timedOut ? sanitizeInline(result.error.message) : undefined,
  };
}

function runCodeTreeSitterRepoReferences(options: {
  root: string;
  targetPath: string;
  query: string;
  env: NodeJS.ProcessEnv;
  runner: TreeSitterRunner;
  maxBytes: number;
  timeoutMs: number;
  emptyText: { text: string; truncation: TextTruncation };
}): CodeTreeSitterResult {
  const target = resolveTreeSitterRepoTarget(options.root, options.targetPath);
  if (!target.ok) {
    return {
      ok: false,
      status: "invalid_arguments",
      mode: "repo-refs",
      query: options.query,
      root: options.root,
      targetPath: options.targetPath,
      args: [],
      timedOut: false,
      stdout: "",
      stderr: "",
      stdoutTruncation: options.emptyText.truncation,
      stderrTruncation: options.emptyText.truncation,
      message: target.message,
    };
  }

  const command = resolveTreeSitterCommand(options.root, options.env, options.runner);
  if (!command.ok) {
    return {
      ok: false,
      status: "tool_missing",
      mode: "repo-refs",
      query: options.query,
      root: options.root,
      targetPath: target.displayPath,
      args: [],
      timedOut: false,
      stdout: "",
      stderr: "",
      stdoutTruncation: options.emptyText.truncation,
      stderrTruncation: options.emptyText.truncation,
      message: command.message,
    };
  }

  const discovered = discoverTreeSitterRepoFiles(options.root, target.resolvedPath);
  const startedAt = performance.now();
  const matches: CodeTreeSitterRepoReferenceMatch[] = [];
  const warnings: string[] = [];
  const omissions = [...discovered.omissions];
  const failureLines: string[] = [];
  let totalMatches = 0;
  let filesWithMatches = 0;
  let failedFiles = 0;
  let timedOutFiles = 0;
  let referencesTruncated = false;

  for (const filePath of discovered.files) {
    const result = options.runner(TREE_SITTER_COMMAND, ["parse", filePath], {
      cwd: options.root,
      env: options.env,
      shell: false,
      encoding: "utf8",
      timeout: options.timeoutMs,
      maxBuffer: Math.max(options.maxBytes * 2, options.maxBytes + 4096),
    });
    const timedOut = result.error?.code === "ETIMEDOUT";
    const status = classifyTreeSitterRun(result, timedOut);
    if (status !== "ok") {
      failedFiles += 1;
      if (timedOut) {
        timedOutFiles += 1;
      }
      const reason = timedOut ? "tree-sitter parse timed out" : "tree-sitter parse failed";
      omissions.push({ path: filePath, reason });
      const stderr = truncateSanitizedOutput(result.stderr ?? result.error?.message ?? "", 512).text.trim();
      failureLines.push(`${filePath}: ${reason}${stderr ? `: ${stderr}` : ""}`);
      continue;
    }

    const stdout = truncateSanitizedOutput(result.stdout ?? "", options.maxBytes);
    const source = readTreeSitterSource(options.root, filePath);
    const references = createTreeSitterReferences(stdout.text, source, options.query, {
      maxMatches: DEFAULT_TREE_SITTER_REFERENCE_MATCHES,
      parseOutputTruncated: stdout.truncation.truncated,
    });
    if (references.totalMatches > 0) {
      filesWithMatches += 1;
    }
    totalMatches += references.totalMatches;
    for (const match of references.matches) {
      if (matches.length >= DEFAULT_TREE_SITTER_REPO_MATCHES) {
        continue;
      }
      matches.push({ ...match, path: filePath });
    }
    if (references.truncated) {
      referencesTruncated = true;
      omissions.push({ path: filePath, reason: "AST references exceeded per-file bounds" });
    }
  }

  if (discovered.files.length === 0) {
    warnings.push("no source files found for bounded tree-sitter repo refs");
  }
  if (discovered.truncated) {
    warnings.push("tree-sitter repo file scan hit bounds; later files were omitted");
  }
  if (totalMatches > matches.length) {
    warnings.push("tree-sitter repo reference matches hit bounds; later matches were omitted");
  }
  if (failedFiles > 0) {
    warnings.push("some files could not be parsed by tree-sitter; omissions list includes file-level failures");
  }

  const stderr = truncateSanitizedOutput(failureLines.join("\n"), options.maxBytes);
  return {
    ok: true,
    status: "ok",
    mode: "repo-refs",
    query: options.query,
    root: options.root,
    targetPath: target.displayPath,
    command: TREE_SITTER_COMMAND,
    args: ["parse", "<bounded repo source files>"],
    commandLine: `${JSON.stringify(TREE_SITTER_COMMAND)} "parse" "<bounded repo source files>"`,
    timedOut: timedOutFiles > 0,
    durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    stdout: "",
    stderr: stderr.text,
    stdoutTruncation: options.emptyText.truncation,
    stderrTruncation: stderr.truncation,
    repoReferences: {
      query: options.query,
      targetPath: target.displayPath,
      matches,
      totalMatches,
      omittedMatches: Math.max(0, totalMatches - matches.length),
      filesScanned: discovered.files.length,
      filesWithMatches,
      omittedFiles: discovered.omittedFiles + failedFiles,
      failedFiles,
      timedOutFiles,
      truncated: discovered.truncated || totalMatches > matches.length || referencesTruncated,
      warnings,
      omissions,
    },
  };
}

function runCodeTreeSitterRepoImports(options: {
  root: string;
  targetPath: string;
  env: NodeJS.ProcessEnv;
  runner: TreeSitterRunner;
  maxBytes: number;
  timeoutMs: number;
  emptyText: { text: string; truncation: TextTruncation };
}): CodeTreeSitterResult {
  const target = resolveTreeSitterRepoTarget(options.root, options.targetPath);
  if (!target.ok) {
    return {
      ok: false,
      status: "invalid_arguments",
      mode: "repo-imports",
      root: options.root,
      targetPath: options.targetPath,
      args: [],
      timedOut: false,
      stdout: "",
      stderr: "",
      stdoutTruncation: options.emptyText.truncation,
      stderrTruncation: options.emptyText.truncation,
      message: target.message,
    };
  }

  const command = resolveTreeSitterCommand(options.root, options.env, options.runner);
  if (!command.ok) {
    return {
      ok: false,
      status: "tool_missing",
      mode: "repo-imports",
      root: options.root,
      targetPath: target.displayPath,
      args: [],
      timedOut: false,
      stdout: "",
      stderr: "",
      stdoutTruncation: options.emptyText.truncation,
      stderrTruncation: options.emptyText.truncation,
      message: command.message,
    };
  }

  const discovered = discoverTreeSitterRepoFiles(options.root, target.resolvedPath);
  const startedAt = performance.now();
  const edges: CodeTreeSitterRepoImportEdge[] = [];
  const warnings: string[] = [];
  const omissions = [...discovered.omissions];
  const failureLines: string[] = [];
  let totalEdges = 0;
  let filesWithImports = 0;
  let failedFiles = 0;
  let timedOutFiles = 0;
  let importsTruncated = false;

  for (const filePath of discovered.files) {
    const result = options.runner(TREE_SITTER_COMMAND, ["parse", filePath], {
      cwd: options.root,
      env: options.env,
      shell: false,
      encoding: "utf8",
      timeout: options.timeoutMs,
      maxBuffer: Math.max(options.maxBytes * 2, options.maxBytes + 4096),
    });
    const timedOut = result.error?.code === "ETIMEDOUT";
    const status = classifyTreeSitterRun(result, timedOut);
    if (status !== "ok") {
      failedFiles += 1;
      if (timedOut) {
        timedOutFiles += 1;
      }
      const reason = timedOut ? "tree-sitter parse timed out" : "tree-sitter parse failed";
      omissions.push({ path: filePath, reason });
      const stderr = truncateSanitizedOutput(result.stderr ?? result.error?.message ?? "", 512).text.trim();
      failureLines.push(`${filePath}: ${reason}${stderr ? `: ${stderr}` : ""}`);
      continue;
    }

    const stdout = truncateSanitizedOutput(result.stdout ?? "", options.maxBytes);
    const source = readTreeSitterSource(options.root, filePath);
    const imports = createTreeSitterImports(stdout.text, source, {
      maxEdges: DEFAULT_TREE_SITTER_IMPORT_EDGES,
      parseOutputTruncated: stdout.truncation.truncated,
    });
    if (imports.totalEdges > 0) {
      filesWithImports += 1;
    }
    totalEdges += imports.totalEdges;
    for (const edge of imports.edges) {
      if (edges.length >= DEFAULT_TREE_SITTER_REPO_IMPORT_EDGES) {
        continue;
      }
      edges.push({ ...edge, path: filePath });
    }
    if (imports.truncated) {
      importsTruncated = true;
      omissions.push({ path: filePath, reason: "AST import edges exceeded per-file bounds" });
    }
  }

  if (discovered.files.length === 0) {
    warnings.push("no source files found for bounded tree-sitter repo imports");
  }
  if (discovered.truncated) {
    warnings.push("tree-sitter repo file scan hit bounds; later files were omitted");
  }
  if (totalEdges > edges.length) {
    warnings.push("tree-sitter repo import edges hit bounds; later imports were omitted");
  }
  if (failedFiles > 0) {
    warnings.push("some files could not be parsed by tree-sitter; omissions list includes file-level failures");
  }

  const stderr = truncateSanitizedOutput(failureLines.join("\n"), options.maxBytes);
  return {
    ok: true,
    status: "ok",
    mode: "repo-imports",
    root: options.root,
    targetPath: target.displayPath,
    command: TREE_SITTER_COMMAND,
    args: ["parse", "<bounded repo source files>"],
    commandLine: `${JSON.stringify(TREE_SITTER_COMMAND)} "parse" "<bounded repo source files>"`,
    timedOut: timedOutFiles > 0,
    durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    stdout: "",
    stderr: stderr.text,
    stdoutTruncation: options.emptyText.truncation,
    stderrTruncation: stderr.truncation,
    repoImports: {
      targetPath: target.displayPath,
      edges,
      totalEdges,
      omittedEdges: Math.max(0, totalEdges - edges.length),
      filesScanned: discovered.files.length,
      filesWithImports,
      omittedFiles: discovered.omittedFiles + failedFiles,
      failedFiles,
      timedOutFiles,
      truncated: discovered.truncated || totalEdges > edges.length || importsTruncated,
      warnings,
      omissions,
    },
  };
}

function runCodeTreeSitterRepoCalls(options: {
  root: string;
  targetPath: string;
  env: NodeJS.ProcessEnv;
  runner: TreeSitterRunner;
  maxBytes: number;
  timeoutMs: number;
  emptyText: { text: string; truncation: TextTruncation };
}): CodeTreeSitterResult {
  const target = resolveTreeSitterRepoTarget(options.root, options.targetPath);
  if (!target.ok) {
    return {
      ok: false,
      status: "invalid_arguments",
      mode: "repo-calls",
      root: options.root,
      targetPath: options.targetPath,
      args: [],
      timedOut: false,
      stdout: "",
      stderr: "",
      stdoutTruncation: options.emptyText.truncation,
      stderrTruncation: options.emptyText.truncation,
      message: target.message,
    };
  }

  const command = resolveTreeSitterCommand(options.root, options.env, options.runner);
  if (!command.ok) {
    return {
      ok: false,
      status: "tool_missing",
      mode: "repo-calls",
      root: options.root,
      targetPath: target.displayPath,
      args: [],
      timedOut: false,
      stdout: "",
      stderr: "",
      stdoutTruncation: options.emptyText.truncation,
      stderrTruncation: options.emptyText.truncation,
      message: command.message,
    };
  }

  const discovered = discoverTreeSitterRepoFiles(options.root, target.resolvedPath);
  const startedAt = performance.now();
  const edges: CodeTreeSitterRepoCallEdge[] = [];
  const warnings: string[] = [];
  const omissions = [...discovered.omissions];
  const failureLines: string[] = [];
  let totalEdges = 0;
  let filesWithCalls = 0;
  let failedFiles = 0;
  let timedOutFiles = 0;
  let callsTruncated = false;

  for (const filePath of discovered.files) {
    const result = options.runner(TREE_SITTER_COMMAND, ["parse", filePath], {
      cwd: options.root,
      env: options.env,
      shell: false,
      encoding: "utf8",
      timeout: options.timeoutMs,
      maxBuffer: Math.max(options.maxBytes * 2, options.maxBytes + 4096),
    });
    const timedOut = result.error?.code === "ETIMEDOUT";
    const status = classifyTreeSitterRun(result, timedOut);
    if (status !== "ok") {
      failedFiles += 1;
      if (timedOut) {
        timedOutFiles += 1;
      }
      const reason = timedOut ? "tree-sitter parse timed out" : "tree-sitter parse failed";
      omissions.push({ path: filePath, reason });
      const stderr = truncateSanitizedOutput(result.stderr ?? result.error?.message ?? "", 512).text.trim();
      failureLines.push(`${filePath}: ${reason}${stderr ? `: ${stderr}` : ""}`);
      continue;
    }

    const stdout = truncateSanitizedOutput(result.stdout ?? "", options.maxBytes);
    const source = readTreeSitterSource(options.root, filePath);
    const calls = createTreeSitterCalls(stdout.text, source, {
      maxEdges: DEFAULT_TREE_SITTER_CALL_EDGES,
      parseOutputTruncated: stdout.truncation.truncated,
    });
    if (calls.totalEdges > 0) {
      filesWithCalls += 1;
    }
    totalEdges += calls.totalEdges;
    for (const edge of calls.edges) {
      if (edges.length >= DEFAULT_TREE_SITTER_REPO_CALL_EDGES) {
        continue;
      }
      edges.push({ ...edge, path: filePath });
    }
    if (calls.truncated) {
      callsTruncated = true;
      omissions.push({ path: filePath, reason: "AST call edges exceeded per-file bounds" });
    }
  }

  if (discovered.files.length === 0) {
    warnings.push("no source files found for bounded tree-sitter repo calls");
  }
  if (discovered.truncated) {
    warnings.push("tree-sitter repo file scan hit bounds; later files were omitted");
  }
  if (totalEdges > edges.length) {
    warnings.push("tree-sitter repo call edges hit bounds; later calls were omitted");
  }
  if (failedFiles > 0) {
    warnings.push("some files could not be parsed by tree-sitter; omissions list includes file-level failures");
  }

  const stderr = truncateSanitizedOutput(failureLines.join("\n"), options.maxBytes);
  return {
    ok: true,
    status: "ok",
    mode: "repo-calls",
    root: options.root,
    targetPath: target.displayPath,
    command: TREE_SITTER_COMMAND,
    args: ["parse", "<bounded repo source files>"],
    commandLine: `${JSON.stringify(TREE_SITTER_COMMAND)} "parse" "<bounded repo source files>"`,
    timedOut: timedOutFiles > 0,
    durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    stdout: "",
    stderr: stderr.text,
    stdoutTruncation: options.emptyText.truncation,
    stderrTruncation: stderr.truncation,
    repoCalls: {
      targetPath: target.displayPath,
      edges,
      totalEdges,
      omittedEdges: Math.max(0, totalEdges - edges.length),
      filesScanned: discovered.files.length,
      filesWithCalls,
      omittedFiles: discovered.omittedFiles + failedFiles,
      failedFiles,
      timedOutFiles,
      truncated: discovered.truncated || totalEdges > edges.length || callsTruncated,
      warnings,
      omissions,
    },
  };
}

export function renderCodeTreeSitterResult(
  result: CodeTreeSitterResult,
  usage = CODE_TREE_SITTER_USAGE,
): string {
  if (result.mode === "outline") {
    return renderCodeTreeSitterOutlineResult(result, usage);
  }
  if (result.mode === "imports") {
    return renderCodeTreeSitterImportsResult(result, usage);
  }
  if (result.mode === "repo-imports") {
    return renderCodeTreeSitterRepoImportsResult(result, usage);
  }
  if (result.mode === "refs") {
    return renderCodeTreeSitterReferencesResult(result, usage);
  }
  if (result.mode === "repo-refs") {
    return renderCodeTreeSitterRepoReferencesResult(result, usage);
  }
  if (result.mode === "repo-calls") {
    return renderCodeTreeSitterRepoCallsResult(result, usage);
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

function renderCodeTreeSitterImportsResult(
  result: CodeTreeSitterResult,
  usage: string,
): string {
  const lines = [
    "Code tree-sitter imports",
    `  status: ${result.status}`,
    `  root: ${sanitizeInline(result.root)}`,
    `  file: ${sanitizeInline(result.targetPath)}`,
    "  mode: AST-backed local single-file import extraction via optional tree-sitter CLI",
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

  lines.push("  imports:");
  if (!result.imports || result.imports.edges.length === 0) {
    lines.push("    - none");
  } else {
    for (const edge of result.imports.edges) {
      lines.push(formatImportEdge(edge));
    }
    if (result.imports.omittedEdges > 0) {
      lines.push(`    - ${result.imports.omittedEdges} more AST import edges omitted`);
    }
  }

  if (result.imports && result.imports.warnings.length > 0) {
    lines.push("  warnings:");
    for (const warning of result.imports.warnings) {
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

function renderCodeTreeSitterRepoImportsResult(
  result: CodeTreeSitterResult,
  usage: string,
): string {
  const lines = [
    "Code tree-sitter repo imports",
    `  status: ${result.status}`,
    `  root: ${sanitizeInline(result.root)}`,
    `  path: ${sanitizeInline(result.targetPath)}`,
    "  mode: AST-backed bounded repo import-source previews via optional tree-sitter CLI (not dependency resolution)",
    "  mutation: none",
  ];
  if (result.commandLine) {
    lines.push(`  command: ${result.commandLine}`);
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

  const repoImports = result.repoImports;
  lines.push(`  files_scanned: ${repoImports?.filesScanned ?? 0}`);
  lines.push(`  files_with_imports: ${repoImports?.filesWithImports ?? 0}`);
  lines.push(`  imports: ${repoImports?.totalEdges ?? 0}${repoImports?.truncated ? " (truncated)" : ""}`);
  if (repoImports && repoImports.omittedFiles > 0) {
    lines.push(`  omitted_files: ${repoImports.omittedFiles}`);
  }

  lines.push("  import_edges:");
  if (!repoImports || repoImports.edges.length === 0) {
    lines.push("    - none");
  } else {
    for (const edge of repoImports.edges) {
      lines.push(formatRepoImportEdge(edge));
    }
    if (repoImports.omittedEdges > 0) {
      lines.push(`    - ${repoImports.omittedEdges} more AST import edges omitted`);
    }
  }

  if (repoImports && repoImports.omissions.length > 0) {
    lines.push("  omissions:");
    for (const omission of repoImports.omissions.slice(0, 12)) {
      lines.push(formatRepoOmission(omission));
    }
    if (repoImports.omissions.length > 12) {
      lines.push(`    - ${repoImports.omissions.length - 12} more omissions omitted`);
    }
  }

  if (repoImports && repoImports.warnings.length > 0) {
    lines.push("  warnings:");
    for (const warning of repoImports.warnings) {
      lines.push(`    - ${sanitizeInline(warning)}`);
    }
  }

  lines.push("  stderr:");
  lines.push(...indentOutput(result.stderr));
  if (result.stderrTruncation.truncated) {
    lines.push(`    - stderr truncated: ${result.stderrTruncation.omittedBytes}B omitted`);
  }

  lines.push("  raw_parse: use tree-sitter parse mode for a single-file raw AST");
  lines.push("  fallback: lexical code-map, symbols, refs, imports, and calls remain available without tree-sitter");
  lines.push(`  usage: ${usage.replace(/^Usage:\s*/, "")}`);
  return lines.join("\n");
}

function renderCodeTreeSitterReferencesResult(
  result: CodeTreeSitterResult,
  usage: string,
): string {
  const lines = [
    "Code tree-sitter refs",
    `  status: ${result.status}`,
    `  root: ${sanitizeInline(result.root)}`,
    `  file: ${sanitizeInline(result.targetPath)}`,
    `  query: ${JSON.stringify(sanitizeInline(result.references?.query ?? result.query ?? ""))}`,
    "  mode: AST-backed local single-file identifier matches via optional tree-sitter CLI (not semantic resolution)",
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

  lines.push("  refs:");
  if (!result.references || result.references.matches.length === 0) {
    lines.push("    - none");
  } else {
    for (const match of result.references.matches) {
      lines.push(formatReferenceMatch(match));
    }
    if (result.references.omittedMatches > 0) {
      lines.push(`    - ${result.references.omittedMatches} more AST identifier matches omitted`);
    }
  }

  if (result.references && result.references.warnings.length > 0) {
    lines.push("  warnings:");
    for (const warning of result.references.warnings) {
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

function renderCodeTreeSitterRepoReferencesResult(
  result: CodeTreeSitterResult,
  usage: string,
): string {
  const lines = [
    "Code tree-sitter repo refs",
    `  status: ${result.status}`,
    `  root: ${sanitizeInline(result.root)}`,
    `  path: ${sanitizeInline(result.targetPath)}`,
    `  query: ${JSON.stringify(sanitizeInline(result.repoReferences?.query ?? result.query ?? ""))}`,
    "  mode: AST-backed bounded repo identifier matches via optional tree-sitter CLI (not semantic resolution)",
    "  mutation: none",
  ];
  if (result.commandLine) {
    lines.push(`  command: ${result.commandLine}`);
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

  const repoRefs = result.repoReferences;
  lines.push(`  files_scanned: ${repoRefs?.filesScanned ?? 0}`);
  lines.push(`  files_with_matches: ${repoRefs?.filesWithMatches ?? 0}`);
  lines.push(`  matches: ${repoRefs?.totalMatches ?? 0}${repoRefs?.truncated ? " (truncated)" : ""}`);
  if (repoRefs && repoRefs.omittedFiles > 0) {
    lines.push(`  omitted_files: ${repoRefs.omittedFiles}`);
  }

  lines.push("  refs:");
  if (!repoRefs || repoRefs.matches.length === 0) {
    lines.push("    - none");
  } else {
    for (const match of repoRefs.matches) {
      lines.push(formatRepoReferenceMatch(match));
    }
    if (repoRefs.omittedMatches > 0) {
      lines.push(`    - ${repoRefs.omittedMatches} more AST identifier matches omitted`);
    }
  }

  if (repoRefs && repoRefs.omissions.length > 0) {
    lines.push("  omissions:");
    for (const omission of repoRefs.omissions.slice(0, 12)) {
      lines.push(formatRepoOmission(omission));
    }
    if (repoRefs.omissions.length > 12) {
      lines.push(`    - ${repoRefs.omissions.length - 12} more omissions omitted`);
    }
  }

  if (repoRefs && repoRefs.warnings.length > 0) {
    lines.push("  warnings:");
    for (const warning of repoRefs.warnings) {
      lines.push(`    - ${sanitizeInline(warning)}`);
    }
  }

  lines.push("  stderr:");
  lines.push(...indentOutput(result.stderr));
  if (result.stderrTruncation.truncated) {
    lines.push(`    - stderr truncated: ${result.stderrTruncation.omittedBytes}B omitted`);
  }

  lines.push("  raw_parse: use tree-sitter parse mode for a single-file raw AST");
  lines.push("  fallback: lexical code-map, symbols, refs, imports, and calls remain available without tree-sitter");
  lines.push(`  usage: ${usage.replace(/^Usage:\s*/, "")}`);
  return lines.join("\n");
}

function renderCodeTreeSitterRepoCallsResult(
  result: CodeTreeSitterResult,
  usage: string,
): string {
  const lines = [
    "Code tree-sitter repo calls",
    `  status: ${result.status}`,
    `  root: ${sanitizeInline(result.root)}`,
    `  path: ${sanitizeInline(result.targetPath)}`,
    "  mode: AST-backed bounded repo call-expression previews via optional tree-sitter CLI (not semantic call resolution)",
    "  mutation: none",
  ];
  if (result.commandLine) {
    lines.push(`  command: ${result.commandLine}`);
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

  const repoCalls = result.repoCalls;
  lines.push(`  files_scanned: ${repoCalls?.filesScanned ?? 0}`);
  lines.push(`  files_with_calls: ${repoCalls?.filesWithCalls ?? 0}`);
  lines.push(`  calls: ${repoCalls?.totalEdges ?? 0}${repoCalls?.truncated ? " (truncated)" : ""}`);
  if (repoCalls && repoCalls.omittedFiles > 0) {
    lines.push(`  omitted_files: ${repoCalls.omittedFiles}`);
  }

  lines.push("  call_edges:");
  if (!repoCalls || repoCalls.edges.length === 0) {
    lines.push("    - none");
  } else {
    for (const edge of repoCalls.edges) {
      lines.push(formatRepoCallEdge(edge));
    }
    if (repoCalls.omittedEdges > 0) {
      lines.push(`    - ${repoCalls.omittedEdges} more AST call edges omitted`);
    }
  }

  if (repoCalls && repoCalls.omissions.length > 0) {
    lines.push("  omissions:");
    for (const omission of repoCalls.omissions.slice(0, 12)) {
      lines.push(formatRepoOmission(omission));
    }
    if (repoCalls.omissions.length > 12) {
      lines.push(`    - ${repoCalls.omissions.length - 12} more omissions omitted`);
    }
  }

  if (repoCalls && repoCalls.warnings.length > 0) {
    lines.push("  warnings:");
    for (const warning of repoCalls.warnings) {
      lines.push(`    - ${sanitizeInline(warning)}`);
    }
  }

  lines.push("  stderr:");
  lines.push(...indentOutput(result.stderr));
  if (result.stderrTruncation.truncated) {
    lines.push(`    - stderr truncated: ${result.stderrTruncation.omittedBytes}B omitted`);
  }

  lines.push("  raw_parse: use tree-sitter parse mode for a single-file raw AST");
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

function resolveTreeSitterRepoTarget(
  cwd: string,
  targetPath: string,
): { ok: true; resolvedPath: string; displayPath: string } | { ok: false; message: string } {
  const targetInput = targetPath.trim() || ".";
  const resolvedTarget = resolve(cwd, targetInput);
  if (!isPathInside(cwd, resolvedTarget)) {
    return { ok: false, message: "tree-sitter repo path must stay inside the current working directory." };
  }
  if (!existsSync(resolvedTarget)) {
    return { ok: false, message: "tree-sitter repo path does not exist." };
  }

  let stat;
  try {
    stat = lstatSync(resolvedTarget);
  } catch {
    return { ok: false, message: "tree-sitter repo path could not be inspected." };
  }
  if (stat.isSymbolicLink()) {
    return { ok: false, message: "tree-sitter repo path must not be a symbolic link." };
  }
  if (!stat.isFile() && !stat.isDirectory()) {
    return { ok: false, message: "tree-sitter repo path must be a file or directory." };
  }

  const realCwd = safeRealpath(cwd) ?? cwd;
  const realTarget = safeRealpath(resolvedTarget);
  if (realTarget && !isPathInside(realCwd, realTarget)) {
    return { ok: false, message: "tree-sitter repo path resolves outside the current working directory." };
  }

  const relativeTarget = relative(cwd, resolvedTarget).split(/[\\/]/g).join("/") || ".";
  if (isFlagLikeValue(relativeTarget)) {
    return { ok: false, message: "tree-sitter repo path must not resolve to a dash-prefixed operand." };
  }
  if (pathHasSkippedRepoComponent(relativeTarget)) {
    return { ok: false, message: "tree-sitter repo path must not target generated or vendor directories." };
  }
  return { ok: true, resolvedPath: resolvedTarget, displayPath: relativeTarget };
}

function discoverTreeSitterRepoFiles(
  root: string,
  targetPath: string,
): {
  files: string[];
  omissions: CodeTreeSitterRepoOmission[];
  omittedFiles: number;
  truncated: boolean;
} {
  const files: string[] = [];
  const omissions: CodeTreeSitterRepoOmission[] = [];
  let omittedFiles = 0;
  let truncated = false;

  const addFile = (absolutePath: string): void => {
    const relativePath = relative(root, absolutePath).split(/[\\/]/g).join("/") || ".";
    if (pathHasSkippedRepoComponent(relativePath)) {
      omittedFiles += 1;
      omissions.push({ path: relativePath, reason: "source file is inside a generated or vendor directory" });
      return;
    }
    if (!TREE_SITTER_REPO_SOURCE_EXTENSIONS.has(extname(relativePath).toLowerCase())) {
      omittedFiles += 1;
      omissions.push({ path: relativePath, reason: "source file extension is not supported for tree-sitter repo scan" });
      return;
    }
    if (files.length >= DEFAULT_TREE_SITTER_REPO_FILES) {
      omittedFiles += 1;
      truncated = true;
      if (!omissions.some((omission) => omission.reason === "tree-sitter repo file scan hit bounds")) {
        omissions.push({ path: relativePath, reason: "tree-sitter repo file scan hit bounds" });
      }
      return;
    }
    let stat;
    try {
      stat = lstatSync(absolutePath);
    } catch {
      omittedFiles += 1;
      omissions.push({ path: relativePath, reason: "source file could not be inspected" });
      return;
    }
    if (!stat.isFile()) {
      return;
    }
    if (stat.size > MAX_TREE_SITTER_REPO_SOURCE_BYTES) {
      omittedFiles += 1;
      omissions.push({ path: relativePath, reason: "source file exceeded tree-sitter repo bounds" });
      return;
    }
    files.push(relativePath);
  };

  const walk = (directory: string, depth: number): void => {
    if (files.length >= DEFAULT_TREE_SITTER_REPO_FILES) {
      truncated = true;
      return;
    }
    if (depth > MAX_TREE_SITTER_REPO_DEPTH) {
      omittedFiles += 1;
      omissions.push({
        path: relative(root, directory).split(/[\\/]/g).join("/") || ".",
        reason: "tree-sitter repo scan exceeded max depth",
      });
      return;
    }

    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      omittedFiles += 1;
      omissions.push({
        path: relative(root, directory).split(/[\\/]/g).join("/") || ".",
        reason: "directory could not be read for tree-sitter repo scan",
      });
      return;
    }

    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (files.length >= DEFAULT_TREE_SITTER_REPO_FILES) {
        truncated = true;
        break;
      }
      const absolutePath = join(directory, entry.name);
      const relativePath = relative(root, absolutePath).split(/[\\/]/g).join("/");
      if (entry.isSymbolicLink()) {
        continue;
      }
      if (entry.isDirectory()) {
        if (TREE_SITTER_REPO_SKIPPED_DIRECTORIES.has(entry.name)) {
          continue;
        }
        walk(absolutePath, depth + 1);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      if (!TREE_SITTER_REPO_SOURCE_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
        continue;
      }
      if (isFlagLikeValue(relativePath)) {
        omittedFiles += 1;
        omissions.push({ path: relativePath, reason: "source file resolved to a dash-prefixed operand" });
        continue;
      }
      addFile(absolutePath);
    }
  };

  const stat = lstatSync(targetPath);
  if (stat.isFile()) {
    addFile(targetPath);
  } else {
    walk(targetPath, 0);
  }

  return { files, omissions, omittedFiles, truncated };
}

function pathHasSkippedRepoComponent(path: string): boolean {
  return path.split("/").some((component) => TREE_SITTER_REPO_SKIPPED_DIRECTORIES.has(component));
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

function normalizeTreeSitterMode(value: string | undefined): CodeTreeSitterMode | undefined {
  if (
    value === "parse" ||
    value === "outline" ||
    value === "imports" ||
    value === "refs" ||
    value === "calls" ||
    value === "repo-refs" ||
    value === "repo-calls" ||
    value === "repo-imports"
  ) {
    return value;
  }
  if (value === "reference" || value === "references") {
    return "refs";
  }
  if (value === "repo-ref" || value === "repo-references" || value === "refs-all" || value === "references-all") {
    return "repo-refs";
  }
  if (value === "repo-call" || value === "repo-call-graph" || value === "calls-all" || value === "call-graph-all") {
    return "repo-calls";
  }
  if (value === "repo-import" || value === "imports-all" || value === "dependencies" || value === "deps") {
    return "repo-imports";
  }
  return undefined;
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

function validateTreeSitterReferenceQuery(value: string): string | undefined {
  const query = value.trim();
  if (!query) {
    return "query must not be empty.";
  }
  if (query.length > 256) {
    return "query is too long.";
  }
  if (isFlagLikeValue(query)) {
    return "query must not start with a dash.";
  }
  if (CONTROL_CHAR_PATTERN.test(query)) {
    return "query contains unsupported control characters.";
  }
  if (!TREE_SITTER_REFERENCE_QUERY_PATTERN.test(query)) {
    return "query must be an identifier-like name.";
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

function createTreeSitterImports(
  stdout: string,
  source: string | undefined,
  options: { maxEdges: number; parseOutputTruncated: boolean },
): CodeTreeSitterImports {
  const sourceLines = source?.split(/\r\n|\r|\n/g);
  const parsedLines = stdout
    .replace(/\r\n|\r/g, "\n")
    .split("\n")
    .map(parseTreeSitterAstLine);
  const edges: CodeTreeSitterImportEdge[] = [];
  const warnings: string[] = [];
  let totalEdges = 0;

  for (let index = 0; index < parsedLines.length; index += 1) {
    const line = parsedLines[index];
    if (!line) {
      continue;
    }
    let edgeKind: CodeTreeSitterImportEdge["kind"] | undefined;
    let sourceRange: TreeSitterRange | undefined;

    if (line.kind === "import_statement" || line.kind === "import_declaration") {
      edgeKind = "import";
      sourceRange = findTreeSitterSourceStringRange(parsedLines, index);
    } else if (line.kind === "export_statement" || line.kind === "export_declaration") {
      sourceRange = findTreeSitterSourceStringRange(parsedLines, index);
      edgeKind = sourceRange ? "reexport" : undefined;
    } else if (line.kind === "call_expression") {
      const functionName = findDirectCallFunctionName(parsedLines, index, sourceLines);
      if (functionName === "require") {
        edgeKind = "require";
        sourceRange = findFirstArgumentStringRange(parsedLines, index);
      } else if (functionName === "import") {
        edgeKind = "dynamic_import";
        sourceRange = findFirstArgumentStringRange(parsedLines, index);
      }
    }

    if (!edgeKind) {
      continue;
    }
    if (!sourceRange) {
      continue;
    }
    totalEdges += 1;
    if (edges.length < options.maxEdges) {
      const sourceText = sourceRange && sourceLines
        ? normalizeModuleSpecifier(extractSourceRange(sourceLines, sourceRange))
        : undefined;
      edges.push({
        kind: edgeKind,
        source: sourceText,
        line: line.range ? line.range.startLine + 1 : undefined,
        column: line.range ? line.range.startColumn + 1 : undefined,
        depth: Math.max(0, Math.floor(line.indent / 2)),
      });
    }
  }

  if (totalEdges === 0 && stdout.trim()) {
    warnings.push("no import-like AST nodes found; use parse mode for the raw tree");
  }
  if (options.parseOutputTruncated) {
    warnings.push("tree-sitter parse output was truncated before import extraction; later AST import edges may be omitted");
  }
  if (sourceLines === undefined && edges.some((edge) => !edge.source)) {
    warnings.push("source file could not be read for AST import source extraction");
  }

  return {
    edges,
    totalEdges,
    omittedEdges: Math.max(0, totalEdges - edges.length),
    truncated: totalEdges > edges.length || options.parseOutputTruncated,
    warnings,
  };
}

function createTreeSitterReferences(
  stdout: string,
  source: string | undefined,
  query: string,
  options: { maxMatches: number; parseOutputTruncated: boolean },
): CodeTreeSitterReferences {
  const sourceLines = source?.split(/\r\n|\r|\n/g);
  const parsedLines = stdout
    .replace(/\r\n|\r/g, "\n")
    .split("\n")
    .map(parseTreeSitterAstLine);
  const matches: CodeTreeSitterReferenceMatch[] = [];
  const warnings: string[] = [];
  let totalMatches = 0;

  for (const line of parsedLines) {
    if (!line || !line.range || !TREE_SITTER_REFERENCE_NODE_KINDS.has(line.kind) || !sourceLines) {
      continue;
    }
    const name = extractSourceRange(sourceLines, line.range);
    if (name !== query) {
      continue;
    }
    totalMatches += 1;
    if (matches.length < options.maxMatches) {
      matches.push({
        name,
        kind: line.kind,
        role: findTreeSitterFieldRole(line.raw),
        line: line.range.startLine + 1,
        column: line.range.startColumn + 1,
        depth: Math.max(0, Math.floor(line.indent / 2)),
      });
    }
  }

  if (totalMatches === 0 && stdout.trim() && sourceLines !== undefined) {
    warnings.push("no identifier AST matches found for query; this is single-file AST matching, not semantic resolution");
  }
  if (options.parseOutputTruncated) {
    warnings.push("tree-sitter parse output was truncated before reference extraction; later AST identifier matches may be omitted");
  }
  if (sourceLines === undefined) {
    warnings.push("source file could not be read for AST reference extraction");
  }

  return {
    query,
    matches,
    totalMatches,
    omittedMatches: Math.max(0, totalMatches - matches.length),
    truncated: totalMatches > matches.length || options.parseOutputTruncated,
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

function findTreeSitterFieldRole(raw: string): string {
  const match = /^\s*([A-Za-z_][\w-]*):\s*\(/.exec(raw);
  return match?.[1] ? sanitizeInline(match[1]) : "identifier";
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

function findTreeSitterSourceStringRange(
  lines: Array<ParsedTreeSitterAstLine | undefined>,
  startIndex: number,
): TreeSitterRange | undefined {
  const parent = lines[startIndex];
  if (!parent) {
    return undefined;
  }
  let sourceIndent: number | undefined;
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) {
      continue;
    }
    if (line.indent <= parent.indent) {
      break;
    }
    if (sourceIndent !== undefined && line.indent <= sourceIndent) {
      break;
    }
    if (/source:\s*\(/.test(line.raw)) {
      sourceIndent = line.indent;
      const sameLineRange = parseStringFragmentRangeFromText(line.raw) ?? line.range;
      if (sameLineRange) {
        return sameLineRange;
      }
      continue;
    }
    if (sourceIndent !== undefined && line.kind === "string_fragment") {
      return line.range;
    }
    if (sourceIndent !== undefined && line.kind === "string") {
      return parseStringFragmentRangeFromText(line.raw) ?? line.range;
    }
  }
  return undefined;
}

function findFirstArgumentStringRange(
  lines: Array<ParsedTreeSitterAstLine | undefined>,
  startIndex: number,
): TreeSitterRange | undefined {
  const parent = lines[startIndex];
  if (!parent) {
    return undefined;
  }
  let argumentsIndent: number | undefined;
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) {
      continue;
    }
    if (line.indent <= parent.indent) {
      break;
    }
    if (argumentsIndent === undefined) {
      if (line.kind === "arguments" && line.indent <= parent.indent + 4) {
        argumentsIndent = line.indent;
        const sameLineRange = parseStringFragmentRangeFromText(line.raw);
        if (sameLineRange) {
          return sameLineRange;
        }
      }
      continue;
    }
    if (line.indent <= argumentsIndent) {
      break;
    }
    if (line.kind === "string") {
      return parseStringFragmentRangeFromText(line.raw) ?? line.range;
    }
    if (line.kind === "string_fragment") {
      return line.range;
    }
    return undefined;
  }
  return undefined;
}

function findDirectCallFunctionName(
  lines: Array<ParsedTreeSitterAstLine | undefined>,
  startIndex: number,
  sourceLines: string[] | undefined,
): string | undefined {
  const parent = lines[startIndex];
  if (!parent) {
    return undefined;
  }
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
    if (/function:\s*\((?:identifier|import)\b/.test(line.raw)) {
      return line.range && sourceLines ? extractSourceRange(sourceLines, line.range) : undefined;
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

function parseStringFragmentRangeFromText(text: string): TreeSitterRange | undefined {
  const match = /(?:string_fragment|escape_sequence)\s+(\[\d+,\s*\d+\]\s*-\s*\[\d+,\s*\d+\])/.exec(text);
  return match?.[1] ? parseRangeFromText(match[1]) : undefined;
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

function normalizeModuleSpecifier(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === "\"" || first === "'" || first === "`") && first === last) {
      return sanitizeInline(trimmed.slice(1, -1));
    }
  }
  return sanitizeInline(trimmed);
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

function formatImportEdge(edge: CodeTreeSitterImportEdge): string {
  const parts = [
    `    - kind=${JSON.stringify(sanitizeInline(edge.kind))}`,
    edge.source ? `source=${JSON.stringify(sanitizeInline(edge.source))}` : undefined,
    edge.line !== undefined ? `line=${edge.line}` : undefined,
    edge.column !== undefined ? `column=${edge.column}` : undefined,
    `depth=${edge.depth}`,
  ];
  return parts.filter((part): part is string => typeof part === "string").join(" ");
}

function formatRepoImportEdge(edge: CodeTreeSitterRepoImportEdge): string {
  const parts = [
    `    - path=${JSON.stringify(sanitizeInline(edge.path))}`,
    `kind=${JSON.stringify(sanitizeInline(edge.kind))}`,
    edge.source ? `source=${JSON.stringify(sanitizeInline(edge.source))}` : undefined,
    edge.line !== undefined ? `line=${edge.line}` : undefined,
    edge.column !== undefined ? `column=${edge.column}` : undefined,
    `depth=${edge.depth}`,
  ];
  return parts.filter((part): part is string => typeof part === "string").join(" ");
}

function formatReferenceMatch(match: CodeTreeSitterReferenceMatch): string {
  const parts = [
    `    - role=${JSON.stringify(sanitizeInline(match.role))}`,
    `kind=${JSON.stringify(sanitizeInline(match.kind))}`,
    `name=${JSON.stringify(sanitizeInline(match.name))}`,
    match.line !== undefined ? `line=${match.line}` : undefined,
    match.column !== undefined ? `column=${match.column}` : undefined,
    `depth=${match.depth}`,
  ];
  return parts.filter((part): part is string => typeof part === "string").join(" ");
}

function formatRepoReferenceMatch(match: CodeTreeSitterRepoReferenceMatch): string {
  const parts = [
    `    - path=${JSON.stringify(sanitizeInline(match.path))}`,
    `role=${JSON.stringify(sanitizeInline(match.role))}`,
    `kind=${JSON.stringify(sanitizeInline(match.kind))}`,
    `name=${JSON.stringify(sanitizeInline(match.name))}`,
    match.line !== undefined ? `line=${match.line}` : undefined,
    match.column !== undefined ? `column=${match.column}` : undefined,
    `depth=${match.depth}`,
  ];
  return parts.filter((part): part is string => typeof part === "string").join(" ");
}

function formatRepoOmission(omission: CodeTreeSitterRepoOmission): string {
  const parts = [
    "    -",
    omission.path ? `path=${JSON.stringify(sanitizeInline(omission.path))}` : undefined,
    `reason=${JSON.stringify(sanitizeInline(omission.reason))}`,
  ];
  return parts.filter((part): part is string => typeof part === "string").join(" ");
}

function formatRepoCallEdge(edge: CodeTreeSitterRepoCallEdge): string {
  const callerName = edge.caller?.name ?? "[top-level]";
  const parts = [
    `    - path=${JSON.stringify(sanitizeInline(edge.path))}`,
    `caller=${JSON.stringify(sanitizeInline(callerName))}`,
    edge.caller?.kind ? `caller_kind=${JSON.stringify(sanitizeInline(edge.caller.kind))}` : undefined,
    edge.caller?.line !== undefined ? `caller_line=${edge.caller.line}` : undefined,
    edge.callee ? `callee=${JSON.stringify(sanitizeInline(edge.callee))}` : undefined,
    edge.line !== undefined ? `line=${edge.line}` : undefined,
    edge.column !== undefined ? `column=${edge.column}` : undefined,
    `depth=${edge.depth}`,
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
