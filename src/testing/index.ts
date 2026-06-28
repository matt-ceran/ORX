import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";
import { redactSecrets } from "../mcp/audit.js";
import { runProcess, type RunProcessResult } from "../tools/process.js";

export type TestTargetKind = "package-script" | "node-test";
export type TestPackageManager = "npm" | "pnpm" | "yarn" | "bun";
export type TestFramework = "node" | "vitest" | "jest" | "playwright" | "unknown";
export type TestRunStatus = "ok" | "failed" | "timed_out" | "process_error" | "not_found" | "invalid_arguments";

export interface TestTarget {
  id: string;
  kind: TestTargetKind;
  framework: TestFramework;
  label: string;
  command: string;
  args: string[];
  cwd: string;
  packageManager?: TestPackageManager;
  scriptName?: string;
  reporter?: string;
  fileCount?: number;
}

export interface TestTargetOmission {
  path?: string;
  reason: string;
}

export interface TestDiscovery {
  targets: TestTarget[];
  defaultTargetId?: string;
  omissions: TestTargetOmission[];
  truncated: boolean;
}

export interface TestRunResult {
  ok: boolean;
  status: TestRunStatus;
  target?: TestTarget;
  message: string;
  command?: string;
  args: string[];
  cwd: string;
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
  timedOut?: boolean;
  durationMs?: number;
  stdout?: string;
  stderr?: string;
  stdoutTruncated?: boolean;
  stderrTruncated?: boolean;
}

export interface TestAdapterSummary {
  targetCount: number;
  packageScriptCount: number;
  nodeTestTargetCount: number;
  frameworkCounts: Record<TestFramework, number>;
  defaultTargetId?: string;
  truncated: boolean;
  omissionCount: number;
}

export interface RunTestOptions {
  cwd?: string;
  targetId?: string;
  extraArgs?: string[];
  timeoutMs?: number;
  maxBytes?: number;
  signal?: AbortSignal;
}

const MAX_SCRIPT_TARGETS = 32;
const MAX_TEST_FILES = 64;
const MAX_SCAN_ENTRIES = 4096;
const MAX_SCAN_DEPTH = 5;
const MAX_EXTRA_ARGS = 32;
const MAX_EXTRA_ARG_LENGTH = 512;
const DEFAULT_TEST_TIMEOUT_MS = 120_000;
const DEFAULT_TEST_OUTPUT_BYTES = 64 * 1024;
const SCRIPT_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._@+/-]{0,119}$/;
const TEST_FILE_PATTERN = /\.(?:test|spec)\.(?:js|mjs|cjs)$/;
const CONTROL_CHAR_PATTERN = /[\x00-\x1F\x7F]/;
const OUTPUT_CONTROL_CHAR_PATTERN = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;
const ANSI_PATTERN = /\x1B\[[0-?]*[ -/]*[@-~]/g;
const SECRET_LIKE_PATTERN =
  /\b(?:bearer\s+[A-Za-z0-9._~+/=-]{8,}|authorization:\s*bearer\s+[A-Za-z0-9._~+/=-]{8,}|(?:access[_-]?token|api[_-]?key|token|key|secret)\s*[=:]\s*[A-Za-z0-9._~+/=-]{4,}|sk-or-v1-[A-Za-z0-9_-]+|github_pat_[A-Za-z0-9_]+|ghp_[A-Za-z0-9_]+|glpat-[A-Za-z0-9_-]+|xox[baprs]-[A-Za-z0-9-]+)\b/i;

export function discoverTestTargets(cwd = process.cwd()): TestDiscovery {
  const root = resolve(cwd);
  const targets: TestTarget[] = [];
  const omissions: TestTargetOmission[] = [];
  let truncated = false;
  const packageJsonPath = join(root, "package.json");

  if (existsSync(packageJsonPath)) {
    try {
      const parsed = JSON.parse(readFileSync(packageJsonPath, "utf8")) as unknown;
      const scripts = sanitizePackageScripts(parsed, omissions);
      const packageManager = detectPackageManager(root, parsed);
      for (const [scriptName, scriptCommand] of scripts) {
        if (targets.length >= MAX_SCRIPT_TARGETS) {
          truncated = true;
          omissions.push({ path: "package.json", reason: "maximum package test script count reached" });
          break;
        }
        targets.push(createPackageScriptTarget(root, packageManager, scriptName, scriptCommand));
      }
    } catch (error) {
      omissions.push({
        path: "package.json",
        reason: error instanceof SyntaxError ? "package.json is invalid JSON" : "package.json could not be read",
      });
    }
  }

  if (!targets.some((target) => target.id === "script:test")) {
    const files = findNodeTestFiles(root);
    omissions.push(...files.omissions);
    truncated = truncated || files.truncated;
    if (files.files.length > 0) {
      targets.push(createNodeTestTarget(root, files.files));
    }
  }

  const sortedTargets = targets.sort((left, right) => sortTestTargets(left, right));
  return {
    targets: sortedTargets,
    defaultTargetId: chooseDefaultTestTargetId(sortedTargets),
    omissions,
    truncated,
  };
}

export function getTestAdapterSummary(cwd = process.cwd()): TestAdapterSummary {
  const discovery = discoverTestTargets(cwd);
  return {
    targetCount: discovery.targets.length,
    packageScriptCount: discovery.targets.filter((target) => target.kind === "package-script").length,
    nodeTestTargetCount: discovery.targets.filter((target) => target.kind === "node-test").length,
    frameworkCounts: countTestFrameworks(discovery.targets),
    defaultTargetId: discovery.defaultTargetId,
    truncated: discovery.truncated,
    omissionCount: discovery.omissions.length,
  };
}

export async function runTestTarget(options: RunTestOptions = {}): Promise<TestRunResult> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const discovery = discoverTestTargets(cwd);
  const targetId = options.targetId ?? discovery.defaultTargetId;
  if (!targetId) {
    return {
      ok: false,
      status: "not_found",
      message: "No test targets were discovered.",
      args: [],
      cwd,
    };
  }

  const target = discovery.targets.find((candidate) => candidate.id === targetId);
  if (!target) {
    return {
      ok: false,
      status: "not_found",
      message: `Unknown test target: ${formatTestTargetIdForMessage(targetId)}`,
      args: [],
      cwd,
    };
  }

  const extraArgs = sanitizeExtraArgs(options.extraArgs ?? []);
  if (typeof extraArgs === "string") {
    return {
      ok: false,
      status: "invalid_arguments",
      target,
      message: extraArgs,
      command: target.command,
      args: [],
      cwd,
    };
  }

  const args = [...target.args, ...formatExtraArgsForTarget(target, extraArgs)];
  const result = await runProcess({
    command: target.command,
    args,
    cwd: target.cwd,
    timeoutMs: options.timeoutMs ?? DEFAULT_TEST_TIMEOUT_MS,
    maxBytes: options.maxBytes ?? DEFAULT_TEST_OUTPUT_BYTES,
    shell: false,
    signal: options.signal,
  });

  return formatTestProcessResult(target, args, result);
}

export function renderTestTargets(discovery: TestDiscovery): string {
  const lines = [
    "Test Targets",
    `  discovered_targets: ${discovery.targets.length}${discovery.truncated ? " (truncated)" : ""}`,
    `  default_target: ${discovery.defaultTargetId ?? "none"}`,
    "  targets:",
  ];

  if (discovery.targets.length === 0) {
    lines.push("    - none");
  } else {
    for (const target of discovery.targets) {
      lines.push(
        [
          `    - id=${target.id}`,
          `kind=${target.kind}`,
          `framework=${target.framework}`,
          target.packageManager ? `manager=${target.packageManager}` : undefined,
          target.scriptName ? `script=${target.scriptName}` : undefined,
          target.reporter ? `reporter=${JSON.stringify(target.reporter)}` : undefined,
          target.fileCount !== undefined ? `files=${target.fileCount}` : undefined,
          `command=${JSON.stringify([target.command, ...target.args].join(" "))}`,
        ]
          .filter((part): part is string => typeof part === "string")
          .join(" "),
      );
    }
  }

  if (discovery.omissions.length > 0) {
    lines.push("  omitted:");
    for (const omission of discovery.omissions.slice(0, 10)) {
      lines.push(
        [
          `    - reason=${JSON.stringify(omission.reason)}`,
          omission.path ? `path=${JSON.stringify(sanitizeRenderedToken(omission.path))}` : undefined,
        ]
          .filter((part): part is string => typeof part === "string")
          .join(" "),
      );
    }
    if (discovery.omissions.length > 10) {
      lines.push(`    - ${discovery.omissions.length - 10} more omissions omitted`);
    }
  }

  lines.push("  usage: orx tests run [target-id] [-- args...]");
  return lines.join("\n");
}

export function renderTestRunResult(result: TestRunResult): string {
  const lines = [
    `Test run: ${result.target?.id ?? "unknown"}`,
    `  status: ${result.status}`,
    result.target ? `  kind: ${result.target.kind}` : undefined,
    result.target ? `  framework: ${result.target.framework}` : undefined,
    result.target?.reporter ? `  reporter: ${result.target.reporter}` : undefined,
    result.command ? `  command: ${JSON.stringify([result.command, ...result.args].join(" "))}` : undefined,
    `  cwd: ${result.cwd}`,
    result.exitCode !== undefined ? `  exit_code: ${result.exitCode}` : undefined,
    result.signal !== undefined && result.signal !== null ? `  signal: ${result.signal}` : undefined,
    result.timedOut !== undefined ? `  timed_out: ${result.timedOut ? "yes" : "no"}` : undefined,
    result.durationMs !== undefined ? `  duration_ms: ${result.durationMs}` : undefined,
    result.stdout !== undefined
      ? `  stdout${result.stdoutTruncated ? " (truncated)" : ""}: ${formatOutputBlock(result.stdout)}`
      : undefined,
    result.stderr !== undefined
      ? `  stderr${result.stderrTruncated ? " (truncated)" : ""}: ${formatOutputBlock(result.stderr)}`
      : undefined,
    `  message: ${result.message}`,
  ];

  return lines.filter((line): line is string => typeof line === "string").join("\n");
}

export function formatTestTargetIdForMessage(id: string): string {
  const trimmed = id.trim();
  if (!trimmed || trimmed.length > 160 || CONTROL_CHAR_PATTERN.test(trimmed) || SECRET_LIKE_PATTERN.test(trimmed)) {
    return "[invalid test target]";
  }
  return trimmed;
}

function sanitizePackageScripts(
  value: unknown,
  omissions: TestTargetOmission[],
): Array<[string, string]> {
  if (!isPlainObject(value) || !isPlainObject(value.scripts)) {
    return [];
  }

  const scripts: Array<[string, string]> = [];
  for (const [name, rawCommand] of Object.entries(value.scripts)) {
    if (!name.startsWith("test")) {
      continue;
    }
    if (typeof rawCommand !== "string") {
      omissions.push({ path: formatPackageScriptOmissionPath(name), reason: "test script command is not a string" });
      continue;
    }
    if (!SCRIPT_NAME_PATTERN.test(name) || CONTROL_CHAR_PATTERN.test(name) || SECRET_LIKE_PATTERN.test(name)) {
      omissions.push({ path: formatPackageScriptOmissionPath(name), reason: "test script name is unsafe" });
      continue;
    }
    if (CONTROL_CHAR_PATTERN.test(rawCommand) || SECRET_LIKE_PATTERN.test(rawCommand)) {
      omissions.push({ path: formatPackageScriptOmissionPath(name), reason: "test script command is unsafe" });
      continue;
    }
    scripts.push([name, rawCommand]);
  }

  return scripts.sort(([left], [right]) => left.localeCompare(right));
}

function detectPackageManager(root: string, packageJson: unknown): TestPackageManager {
  if (isPlainObject(packageJson) && typeof packageJson.packageManager === "string") {
    const packageManager = packageJson.packageManager.toLowerCase();
    if (packageManager.startsWith("pnpm@")) {
      return "pnpm";
    }
    if (packageManager.startsWith("yarn@")) {
      return "yarn";
    }
    if (packageManager.startsWith("bun@")) {
      return "bun";
    }
    if (packageManager.startsWith("npm@")) {
      return "npm";
    }
  }

  if (existsSync(join(root, "pnpm-lock.yaml"))) {
    return "pnpm";
  }
  if (existsSync(join(root, "yarn.lock"))) {
    return "yarn";
  }
  if (existsSync(join(root, "bun.lockb")) || existsSync(join(root, "bun.lock"))) {
    return "bun";
  }
  return "npm";
}

function createPackageScriptTarget(
  root: string,
  packageManager: TestPackageManager,
  scriptName: string,
  scriptCommand: string,
): TestTarget {
  const commandArgs = packageScriptArgs(packageManager, scriptName);
  const metadata = inferPackageScriptMetadata(scriptCommand);
  return {
    id: `script:${scriptName}`,
    kind: "package-script",
    framework: metadata.framework,
    label: `package script ${scriptName}`,
    command: packageManager,
    args: commandArgs,
    cwd: root,
    packageManager,
    scriptName,
    reporter: metadata.reporter,
  };
}

function packageScriptArgs(packageManager: TestPackageManager, scriptName: string): string[] {
  switch (packageManager) {
    case "npm":
    case "pnpm":
    case "bun":
      return ["run", scriptName];
    case "yarn":
      return ["run", scriptName];
  }
}

function createNodeTestTarget(root: string, files: string[]): TestTarget {
  return {
    id: "node:test",
    kind: "node-test",
    framework: "node",
    label: "Node.js test runner",
    command: process.execPath,
    args: ["--test", ...files.map((file) => formatNodeTestFileArg(root, file))],
    cwd: root,
    fileCount: files.length,
  };
}

function findNodeTestFiles(root: string): {
  files: string[];
  omissions: TestTargetOmission[];
  truncated: boolean;
} {
  const files: string[] = [];
  const omissions: TestTargetOmission[] = [];
  const queue: Array<{ path: string; depth: number }> = [{ path: root, depth: 0 }];
  let entriesSeen = 0;
  let truncated = false;

  while (queue.length > 0 && files.length < MAX_TEST_FILES) {
    const current = queue.shift();
    if (!current) {
      break;
    }
    let entries;
    try {
      entries = readdirSync(current.path, { withFileTypes: true });
    } catch {
      omissions.push({ path: relative(root, current.path), reason: "test file directory could not be read" });
      continue;
    }

    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      entriesSeen += 1;
      if (entriesSeen > MAX_SCAN_ENTRIES) {
        truncated = true;
        return { files, omissions, truncated };
      }

      const path = join(current.path, entry.name);
      if (entry.isDirectory()) {
        if (current.depth >= MAX_SCAN_DEPTH || shouldSkipTestDirectory(entry.name)) {
          continue;
        }
        queue.push({ path, depth: current.depth + 1 });
        continue;
      }

      if (!entry.isFile() || !TEST_FILE_PATTERN.test(entry.name)) {
        continue;
      }
      try {
        const stat = lstatSync(path);
        if (stat.size <= 0 || stat.size > 2 * 1024 * 1024) {
          omissions.push({ path: relative(root, path), reason: "test file size is outside adapter bounds" });
          continue;
        }
      } catch {
        omissions.push({ path: relative(root, path), reason: "test file could not be inspected" });
        continue;
      }
      files.push(path);
      if (files.length >= MAX_TEST_FILES) {
        truncated = true;
        break;
      }
    }
  }

  return { files: files.sort((left, right) => left.localeCompare(right)), omissions, truncated };
}

function shouldSkipTestDirectory(name: string): boolean {
  return new Set([".git", ".hg", ".svn", "node_modules", ".orx", "coverage", ".next"]).has(name);
}

function chooseDefaultTestTargetId(targets: TestTarget[]): string | undefined {
  return (
    targets.find((target) => target.id === "script:test") ??
    targets.find((target) => target.kind === "package-script") ??
    targets[0]
  )?.id;
}

function sortTestTargets(left: TestTarget, right: TestTarget): number {
  if (left.id === "script:test") {
    return -1;
  }
  if (right.id === "script:test") {
    return 1;
  }
  if (left.kind !== right.kind) {
    return left.kind === "package-script" ? -1 : 1;
  }
  return left.id.localeCompare(right.id);
}

function countTestFrameworks(targets: TestTarget[]): Record<TestFramework, number> {
  const counts: Record<TestFramework, number> = {
    node: 0,
    vitest: 0,
    jest: 0,
    playwright: 0,
    unknown: 0,
  };
  for (const target of targets) {
    counts[target.framework] += 1;
  }
  return counts;
}

function inferPackageScriptMetadata(scriptCommand: string): {
  framework: TestFramework;
  reporter?: string;
} {
  const segments = tokenizeScriptCommandSegments(scriptCommand);
  const tokens = segments.flat();
  return {
    framework: inferPackageScriptFramework(segments),
    reporter: inferPackageScriptReporter(tokens),
  };
}

function inferPackageScriptFramework(segments: string[][]): TestFramework {
  for (const tokens of segments) {
    for (const [index, rawToken] of tokens.entries()) {
      const token = normalizeScriptToken(rawToken);
      const next = normalizeScriptToken(tokens[index + 1] ?? "");
      if (token === "vitest") {
        return "vitest";
      }
      if (token === "jest" || (token === "react-scripts" && next === "test")) {
        return "jest";
      }
      if (token === "playwright" || token === "playwright-core" || token === "@playwright/test") {
        if (next === "test") {
          return "playwright";
        }
      }
      if (token === "node" && segmentRunsNodeTest(tokens, index)) {
        return "node";
      }
    }
  }
  return "unknown";
}

function segmentRunsNodeTest(tokens: string[], nodeIndex: number): boolean {
  for (let index = nodeIndex + 1; index < tokens.length; index += 1) {
    const rawToken = stripShellQuotes(tokens[index] ?? "");
    const token = normalizeScriptToken(rawToken);
    if (token === "--test") {
      return true;
    }
    if (rawToken === "--") {
      return false;
    }
    if (rawToken.startsWith("-")) {
      if (nodeOptionConsumesNextValue(rawToken) && index + 1 < tokens.length) {
        index += 1;
      }
      continue;
    }
    return false;
  }
  return false;
}

function nodeOptionConsumesNextValue(rawToken: string): boolean {
  const token = normalizeScriptToken(rawToken);
  if (token.includes("=")) {
    return false;
  }
  switch (token) {
    case "-c":
    case "-e":
    case "-r":
    case "--conditions":
    case "--env-file":
    case "--experimental-loader":
    case "--import":
    case "--loader":
    case "--require":
    case "--test-reporter":
    case "--test-reporter-destination":
      return true;
    default:
      return false;
  }
}

function tokenizeScriptCommandSegments(command: string): string[][] {
  const segments: string[][] = [];
  let tokens: string[] = [];
  let current = "";
  let quote: "'" | "\"" | undefined;
  let escaping = false;

  const finishToken = () => {
    if (current) {
      tokens.push(current);
      current = "";
    }
  };
  const finishSegment = () => {
    finishToken();
    if (tokens.length > 0) {
      segments.push(tokens);
      tokens = [];
    }
  };

  for (const char of command) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === "\\") {
      escaping = true;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = undefined;
      } else {
        current += char;
      }
      continue;
    }
    if (char === "'" || char === "\"") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      finishToken();
      continue;
    }
    if (char === ";" || char === "|" || char === "&") {
      finishSegment();
      continue;
    }
    current += char;
  }

  finishSegment();
  return segments;
}
function inferPackageScriptReporter(tokens: string[]): string | undefined {
  for (const [index, rawToken] of tokens.entries()) {
    const token = stripShellQuotes(rawToken);
    if (token === "--json") {
      return "json";
    }
    if (token === "--tap") {
      return "tap";
    }
    if (token === "--reporter" || token === "--reporters" || token === "--test-reporter") {
      return sanitizeReporterName(tokens[index + 1] ?? "");
    }
    if (
      token.startsWith("--reporter=") ||
      token.startsWith("--reporters=") ||
      token.startsWith("--test-reporter=")
    ) {
      return sanitizeReporterName(token.slice(token.indexOf("=") + 1));
    }
  }
  return undefined;
}

function normalizeScriptToken(token: string): string {
  const stripped = stripShellQuotes(token).replace(/\\/g, "/").toLowerCase();
  if (!stripped) {
    return "";
  }
  if (stripped.startsWith("--")) {
    return stripped;
  }
  if (stripped.includes("@playwright/test")) {
    return "@playwright/test";
  }
  return stripped.split("/").filter(Boolean).pop() ?? stripped;
}

function stripShellQuotes(token: string): string {
  return token.replace(/^['"]|['"]$/g, "");
}

function sanitizeReporterName(reporter: string): string | undefined {
  const normalized = stripShellQuotes(reporter).trim();
  if (
    normalized.length === 0 ||
    normalized.length > 80 ||
    CONTROL_CHAR_PATTERN.test(normalized) ||
    SECRET_LIKE_PATTERN.test(normalized) ||
    !/^[A-Za-z0-9_@./:,=-]+$/.test(normalized)
  ) {
    return undefined;
  }
  return sanitizeRenderedToken(normalized);
}

function sanitizeExtraArgs(args: string[]): string[] | string {
  if (args.length > MAX_EXTRA_ARGS) {
    return `Test arguments exceed the maximum count of ${MAX_EXTRA_ARGS}.`;
  }

  const sanitized: string[] = [];
  for (const [index, arg] of args.entries()) {
    if (arg.length > MAX_EXTRA_ARG_LENGTH) {
      return `Test argument ${index + 1} exceeds ${MAX_EXTRA_ARG_LENGTH} characters.`;
    }
    if (CONTROL_CHAR_PATTERN.test(arg)) {
      return `Test argument ${index + 1} contains a control character.`;
    }
    if (SECRET_LIKE_PATTERN.test(arg)) {
      return `Test argument ${index + 1} looks like a secret.`;
    }
    sanitized.push(arg);
  }

  return sanitized;
}

function formatExtraArgsForTarget(target: TestTarget, extraArgs: string[]): string[] {
  if (extraArgs.length === 0) {
    return [];
  }
  return target.kind === "package-script" && target.packageManager !== "yarn"
    ? ["--", ...extraArgs]
    : extraArgs;
}

function formatTestProcessResult(
  target: TestTarget,
  args: string[],
  result: RunProcessResult,
): TestRunResult {
  const status: TestRunStatus = result.error
    ? "process_error"
    : result.timedOut
      ? "timed_out"
      : result.exitCode === 0
        ? "ok"
        : "failed";
  const ok = status === "ok";

  return {
    ok,
    status,
    target,
    message: ok
      ? `Test target ${target.id} passed.`
      : `Test target ${target.id} ${status === "failed" ? `exited with code ${result.exitCode}` : status}.`,
    command: result.command,
    args,
    cwd: result.cwd,
    exitCode: result.exitCode,
    signal: result.signal,
    timedOut: result.timedOut,
    durationMs: result.durationMs,
    stdout: sanitizeRenderedText(result.stdout),
    stderr: sanitizeRenderedText(result.stderr || result.error?.message || ""),
    stdoutTruncated: result.stdoutTruncation.truncated,
    stderrTruncated: result.stderrTruncation.truncated,
  };
}

function formatPackageScriptOmissionPath(scriptName: string): string {
  return `package.json#scripts.${sanitizeRenderedToken(scriptName)}`;
}

function formatNodeTestFileArg(root: string, file: string): string {
  const path = relative(root, file).split(/[\\/]/g).join("/");
  return path.startsWith("-") ? file : path;
}

function sanitizeRenderedText(text: string): string {
  const redacted = redactSecrets(stripTerminalControls(text));
  return typeof redacted === "string" ? redacted : text;
}

function sanitizeRenderedToken(text: string): string {
  const withoutControls = stripTerminalControls(text).replace(CONTROL_CHAR_PATTERN, "");
  const redacted = redactSecrets(withoutControls);
  return typeof redacted === "string" && redacted.trim() ? redacted.trim() : "[redacted]";
}

function formatOutputBlock(text: string): string {
  if (!text) {
    return "none";
  }
  const contentBeforeFinalNewline = text.endsWith("\n") ? text.slice(0, -1) : text;
  if (!contentBeforeFinalNewline.includes("\n")) {
    return JSON.stringify(text);
  }
  return `\n${text
    .split("\n")
    .map((line) => `    ${line}`)
    .join("\n")}`;
}

function stripTerminalControls(text: string): string {
  return text.replace(ANSI_PATTERN, "").replace(OUTPUT_CONTROL_CHAR_PATTERN, "");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
