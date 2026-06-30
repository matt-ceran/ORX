import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
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
  reporterDeclared?: boolean;
  jsonReporter?: boolean;
  reportOutputFile?: boolean;
  reportOutputPath?: string;
  reportArgsForwardable?: boolean;
  defaultReportArgsForwardable?: boolean;
  configJsonReporter?: boolean;
  configReportOutputPath?: string;
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
  report?: TestReportSummary;
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

export interface TestReportSummary {
  framework: TestFramework;
  source: TestFramework | "generic" | "tap" | "mocha" | "node-junit" | "jest-json" | "vitest-json" | "playwright-json";
  total?: number;
  passed?: number;
  failed?: number;
  skipped?: number;
  todo?: number;
  flaky?: number;
  files?: number;
  suites?: number;
  durationMs?: number;
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
const MAX_REPORT_OUTPUT_PATH_LENGTH = 512;
const MAX_TEST_CONFIG_BYTES = 64 * 1024;
const DEFAULT_TEST_TIMEOUT_MS = 120_000;
const DEFAULT_TEST_OUTPUT_BYTES = 64 * 1024;
const MAX_REPORT_PARSE_BYTES = 32 * 1024;
const MAX_STRUCTURED_REPORT_BYTES = 256 * 1024;
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

  const reportRequest = createStructuredReportRequest(target, extraArgs);
  const args = formatTargetRunArgs(target, reportRequest, extraArgs);

  try {
    const result = await runProcess({
      command: target.command,
      args,
      cwd: target.cwd,
      env: createTestProcessEnv(reportRequest?.env),
      inheritEnv: false,
      timeoutMs: options.timeoutMs ?? DEFAULT_TEST_TIMEOUT_MS,
      maxBytes: options.maxBytes ?? DEFAULT_TEST_OUTPUT_BYTES,
      shell: false,
      signal: options.signal,
    });

    const structuredReportText = reportRequest
      ? readStructuredReportFile(reportRequest.path, reportRequest.previousState, reportRequest.root)
      : undefined;
    return formatTestProcessResult(target, args, result, structuredReportText);
  } finally {
    if (reportRequest?.directory) {
      rmSync(reportRequest.directory, { recursive: true, force: true });
    }
  }
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
    result.report ? `  report: ${formatTestReportSummary(result.report)}` : undefined,
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

export function parseTestReportSummary(
  target: TestTarget,
  stdout: string,
  stderr = "",
  structuredReportText?: string,
): TestReportSummary | undefined {
  const structuredReport = parseStructuredTestReportSummary(target, structuredReportText);
  if (structuredReport && hasReportCounts(structuredReport)) {
    return structuredReport;
  }

  const text = limitReportText(`${stdout}\n${stderr}`);
  const jsonReport =
    parseFrameworkJsonReportSummary(limitReportText(stdout), target.framework) ??
    parseFrameworkJsonReportSummary(limitReportText(stderr), target.framework);
  if (jsonReport && hasReportCounts(jsonReport)) {
    return jsonReport;
  }

  const parsers = orderedReportParsers(target.framework);
  for (const parser of parsers) {
    const report = parser(text, target.framework);
    if (report && hasReportCounts(report)) {
      return report;
    }
  }
  return undefined;
}

export function parseStructuredTestReportSummary(
  target: TestTarget,
  reportText: string | undefined,
): TestReportSummary | undefined {
  if (!reportText) {
    return undefined;
  }
  if (target.framework === "node") {
    return parseNodeJunitReportSummary(limitReportText(reportText), target.framework);
  }
  if (target.kind === "package-script" && isFrameworkJsonReportTarget(target)) {
    return parseFrameworkJsonReportSummary(limitReportText(reportText), target.framework);
  }
  return undefined;
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
  const configReport = inferFrameworkConfigReport(root, metadata.framework);
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
    reporterDeclared: metadata.reporterDeclared,
    jsonReporter: metadata.jsonReporter,
    reportOutputFile: metadata.reportOutputFile,
    reportOutputPath: metadata.reportOutputPath,
    reportArgsForwardable: metadata.reportArgsForwardable,
    defaultReportArgsForwardable: metadata.defaultReportArgsForwardable,
    configJsonReporter: configReport?.jsonReporter,
    configReportOutputPath: configReport?.outputPath,
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

function inferFrameworkConfigReport(
  root: string,
  framework: TestFramework,
): { jsonReporter: boolean; outputPath?: string } | undefined {
  if (!isFrameworkJsonReportFramework(framework)) {
    return undefined;
  }
  for (const fileName of frameworkConfigFileNames(framework)) {
    const text = readBoundedTestConfigFile(join(root, fileName));
    if (text === undefined) {
      continue;
    }
    const outputPath = parseFrameworkConfigJsonOutputPath(text, framework);
    if (outputPath) {
      return { jsonReporter: true, outputPath };
    }
  }
  return undefined;
}

function frameworkConfigFileNames(framework: TestFramework): string[] {
  switch (framework) {
    case "jest":
      return [
        "jest.config.js",
        "jest.config.cjs",
        "jest.config.mjs",
        "jest.config.ts",
        "jest.config.json",
      ];
    case "vitest":
      return [
        "vitest.config.js",
        "vitest.config.cjs",
        "vitest.config.mjs",
        "vitest.config.ts",
        "vitest.config.mts",
        "vitest.config.cts",
      ];
    case "playwright":
      return [
        "playwright.config.js",
        "playwright.config.cjs",
        "playwright.config.mjs",
        "playwright.config.ts",
        "playwright.config.mts",
        "playwright.config.cts",
      ];
    default:
      return [];
  }
}

function readBoundedTestConfigFile(path: string): string | undefined {
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_TEST_CONFIG_BYTES) {
      return undefined;
    }
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}

function parseFrameworkConfigJsonOutputPath(text: string, framework: TestFramework): string | undefined {
  const outputPath = parseConfigOutputFileValue(text);
  if (!outputPath) {
    return undefined;
  }
  if (framework === "jest") {
    return /\bjson\s*:\s*true\b/.test(text) ? outputPath : undefined;
  }
  if (framework === "vitest") {
    return configReporterIncludesJson(text) ? outputPath : undefined;
  }
  if (framework === "playwright") {
    return configReporterIncludesJson(text) ? outputPath : undefined;
  }
  return undefined;
}

function configReporterIncludesJson(text: string): boolean {
  return /\breporters?\s*:\s*(?:["']json["']|\[[\s\S]{0,2000}?["']json["'])/.test(text);
}

function parseConfigOutputFileValue(text: string): string | undefined {
  const keyedOutput = /\boutputFile\s*:\s*\{[\s\S]{0,1000}?\bjson\s*:\s*(["'])([^"'\r\n]{1,512})\1/.exec(text);
  if (keyedOutput?.[2]) {
    return keyedOutput[2];
  }
  const output = /\boutputFile\s*:\s*(["'])([^"'\r\n]{1,512})\1/.exec(text);
  return output?.[2];
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

type ReportParser = (text: string, framework: TestFramework) => TestReportSummary | undefined;

function orderedReportParsers(framework: TestFramework): ReportParser[] {
  const parsers: Record<TestFramework, ReportParser> = {
    node: parseNodeReportSummary,
    vitest: parseVitestReportSummary,
    jest: parseJestReportSummary,
    playwright: parsePlaywrightReportSummary,
    unknown: parseGenericReportSummary,
  };
  if (framework === "node") {
    return [parseTapReportSummary, parseNodeReportSummary, parseGenericReportSummary];
  }
  return framework === "unknown"
    ? [parseJestReportSummary, parseVitestReportSummary, parseTapReportSummary, parseNodeReportSummary, parsePlaywrightReportSummary, parseMochaReportSummary, parseGenericReportSummary]
    : [parsers[framework], parseTapReportSummary, parseMochaReportSummary, parseGenericReportSummary];
}

function parseFrameworkJsonReportSummary(text: string, framework: TestFramework): TestReportSummary | undefined {
  const value = parseJsonObjectReport(text);
  if (!value) {
    return undefined;
  }

  if (framework === "jest") {
    return parseJestLikeJsonReportSummary(value, framework, "jest-json");
  }
  if (framework === "vitest") {
    return parseJestLikeJsonReportSummary(value, framework, "vitest-json");
  }
  if (framework === "playwright") {
    return parsePlaywrightJsonReportSummary(value, framework);
  }
  if (framework === "unknown") {
    return parseJestLikeJsonReportSummary(value, framework, "jest-json") ??
      parsePlaywrightJsonReportSummary(value, framework);
  }
  return undefined;
}

function parseJsonObjectReport(text: string): Record<string, unknown> | undefined {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return undefined;
  }

  try {
    const value: unknown = JSON.parse(trimmed);
    return isPlainObject(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function parseJestLikeJsonReportSummary(
  value: Record<string, unknown>,
  framework: TestFramework,
  source: "jest-json" | "vitest-json",
): TestReportSummary | undefined {
  const report: TestReportSummary = {
    framework,
    source,
  };

  assignNumber(report, "total", jsonCountNumber(value, "numTotalTests"));
  assignNumber(report, "passed", jsonCountNumber(value, "numPassedTests"));
  assignNumber(report, "failed", jsonCountNumber(value, "numFailedTests"));
  assignNumber(report, "skipped", jsonCountNumber(value, "numPendingTests"));
  assignNumber(report, "todo", jsonCountNumber(value, "numTodoTests"));
  assignNumber(report, "suites", jsonCountNumber(value, "numTotalTestSuites"));
  assignNumber(report, "durationMs", parseJestLikeJsonDurationMs(value));

  return hasReportCounts(report) ? report : undefined;
}

function parseJestLikeJsonDurationMs(value: Record<string, unknown>): number | undefined {
  const directDuration = jsonDurationNumber(value, "durationMs") ?? jsonDurationNumber(value, "duration");
  if (directDuration !== undefined) {
    return directDuration;
  }

  const perfStats = value.perfStats;
  if (!isPlainObject(perfStats)) {
    return undefined;
  }
  return jsonDurationNumber(perfStats, "runtime");
}

function parsePlaywrightJsonReportSummary(
  value: Record<string, unknown>,
  framework: TestFramework,
): TestReportSummary | undefined {
  const stats = value.stats;
  if (!isPlainObject(stats)) {
    return undefined;
  }

  const passed = jsonCountNumber(stats, "expected");
  const failed = jsonCountNumber(stats, "unexpected");
  const skipped = jsonCountNumber(stats, "skipped");
  const flaky = jsonCountNumber(stats, "flaky");
  const report: TestReportSummary = {
    framework,
    source: "playwright-json",
  };

  assignNumber(report, "passed", passed);
  assignNumber(report, "failed", failed);
  assignNumber(report, "skipped", skipped);
  assignNumber(report, "flaky", flaky);
  assignNumber(report, "total", sumDefined(passed, failed, skipped, flaky));
  assignNumber(report, "durationMs", jsonDurationNumber(stats, "duration"));

  return hasReportCounts(report) ? report : undefined;
}

function jsonCountNumber(value: Record<string, unknown>, key: string): number | undefined {
  const raw = value[key];
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0 || !Number.isInteger(raw)) {
    return undefined;
  }
  return raw;
}

function jsonDurationNumber(value: Record<string, unknown>, key: string): number | undefined {
  const raw = value[key];
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) {
    return undefined;
  }
  return raw;
}

function parseNodeReportSummary(text: string, framework: TestFramework): TestReportSummary | undefined {
  const report: TestReportSummary = {
    framework,
    source: "node",
  };
  assignNumber(report, "total", matchLineNumber(text, "tests"));
  assignNumber(report, "suites", matchLineNumber(text, "suites"));
  assignNumber(report, "passed", matchLineNumber(text, "pass"));
  assignNumber(report, "failed", matchLineNumber(text, "fail"));
  assignNumber(report, "skipped", matchLineNumber(text, "skipped"));
  assignNumber(report, "todo", matchLineNumber(text, "todo"));
  assignNumber(report, "durationMs", matchLineNumber(text, "duration_ms"));
  return report;
}

function parseTapReportSummary(text: string, framework: TestFramework): TestReportSummary | undefined {
  const hasTapMarker = /^\s*TAP version \d+\s*$/im.test(text);
  const planTotal = matchTapPlanTotal(text);
  const counts = parseTapResultCounts(text);
  const hasResultLines = hasOutcomeCounts(counts);
  if (!hasTapMarker && (planTotal === undefined || !hasResultLines)) {
    return undefined;
  }
  if (!hasResultLines && planTotal === undefined) {
    return undefined;
  }

  const report: TestReportSummary = {
    framework,
    source: "tap",
  };
  const passed = matchLineNumber(text, "pass") ?? counts.passed;
  const failed = matchLineNumber(text, "fail") ?? counts.failed;
  const skipped = matchLineNumber(text, "skipped") ?? matchLineNumber(text, "skip") ?? counts.skipped;
  const todo = matchLineNumber(text, "todo") ?? counts.todo;
  assignNumber(report, "total", matchLineNumber(text, "tests") ?? planTotal ?? sumDefined(passed, failed, skipped, todo));
  assignNumber(report, "passed", passed);
  assignNumber(report, "failed", failed);
  assignNumber(report, "skipped", skipped);
  assignNumber(report, "todo", todo);
  assignNumber(report, "durationMs", matchLineNumber(text, "duration_ms"));
  return hasReportCounts(report) ? report : undefined;
}

function parseNodeJunitReportSummary(text: string, framework: TestFramework): TestReportSummary | undefined {
  if (!/^\s*<\?xml\b/i.test(text) || !/<testsuites\b/i.test(text)) {
    return undefined;
  }

  const report: TestReportSummary = {
    framework,
    source: "node-junit",
  };

  assignNumber(report, "total", matchXmlCommentNumber(text, "tests") ?? matchXmlAttributeNumber(text, "tests"));
  assignNumber(report, "suites", matchXmlCommentNumber(text, "suites"));
  assignNumber(report, "passed", matchXmlCommentNumber(text, "pass"));
  assignNumber(report, "failed", matchXmlCommentNumber(text, "fail") ?? matchXmlAttributeNumber(text, "failures"));
  assignNumber(report, "skipped", matchXmlCommentNumber(text, "skipped") ?? matchXmlAttributeNumber(text, "skipped"));
  assignNumber(report, "todo", matchXmlCommentNumber(text, "todo"));
  assignNumber(report, "durationMs", matchXmlCommentNumber(text, "duration_ms"));

  if (report.total === undefined) {
    assignNumber(report, "total", countXmlTags(text, "testcase"));
  }
  if (report.failed === undefined) {
    assignNumber(report, "failed", countXmlTags(text, "failure"));
  }
  if (report.skipped === undefined) {
    assignNumber(report, "skipped", countXmlTags(text, "skipped"));
  }
  if (report.passed === undefined && report.total !== undefined) {
    assignNumber(report, "passed", Math.max(0, report.total - (report.failed ?? 0) - (report.skipped ?? 0)));
  }

  return hasReportCounts(report) ? report : undefined;
}

function parseVitestReportSummary(text: string, framework: TestFramework): TestReportSummary | undefined {
  const filesLine = matchVitestNamedLine(text, "Test Files");
  const testsLine = matchVitestNamedLine(text, "Tests");
  if (!filesLine) {
    return undefined;
  }

  const report: TestReportSummary = {
    framework,
    source: "vitest",
  };
  const fileCounts = filesLine ? parseStatusCounts(filesLine) : {};
  const testCounts = testsLine ? parseStatusCounts(testsLine) : {};
  assignNumber(report, "files", fileCounts.total ?? sumDefined(fileCounts.passed, fileCounts.failed, fileCounts.skipped));
  assignNumber(report, "total", testCounts.total ?? sumDefined(testCounts.passed, testCounts.failed, testCounts.skipped, testCounts.todo));
  assignNumber(report, "passed", testCounts.passed);
  assignNumber(report, "failed", testCounts.failed);
  assignNumber(report, "skipped", testCounts.skipped);
  assignNumber(report, "todo", testCounts.todo);
  assignNumber(report, "durationMs", parseDurationMs(matchVitestNamedLine(text, "Duration") ?? ""));
  return report;
}

function parseJestReportSummary(text: string, framework: TestFramework): TestReportSummary | undefined {
  const suitesLine = matchJestNamedLine(text, "Test Suites");
  const testsLine = matchJestNamedLine(text, "Tests");
  if (!suitesLine && !testsLine) {
    return undefined;
  }

  const report: TestReportSummary = {
    framework,
    source: "jest",
  };
  const suiteCounts = suitesLine ? parseStatusCounts(suitesLine) : {};
  const testCounts = testsLine ? parseStatusCounts(testsLine) : {};
  assignNumber(report, "suites", suiteCounts.total ?? sumDefined(suiteCounts.passed, suiteCounts.failed, suiteCounts.skipped));
  assignNumber(report, "total", testCounts.total ?? sumDefined(testCounts.passed, testCounts.failed, testCounts.skipped, testCounts.todo));
  assignNumber(report, "passed", testCounts.passed);
  assignNumber(report, "failed", testCounts.failed);
  assignNumber(report, "skipped", testCounts.skipped);
  assignNumber(report, "todo", testCounts.todo);
  assignNumber(report, "durationMs", parseDurationMs(matchJestNamedLine(text, "Time") ?? ""));
  return report;
}

function parsePlaywrightReportSummary(text: string, framework: TestFramework): TestReportSummary | undefined {
  const counts: Partial<Record<"passed" | "failed" | "skipped" | "flaky", number>> = {};
  let durationMs: number | undefined;
  for (const match of text.matchAll(/^\s*(\d+)\s+(passed|failed|skipped|flaky)\b\s*(?:\(([^)]+)\))?\s*$/gim)) {
    const key = match[2] as "passed" | "failed" | "skipped" | "flaky";
    counts[key] = (counts[key] ?? 0) + Number.parseInt(match[1], 10);
    durationMs ??= parseDurationMs(match[3] ?? "");
  }
  if (Object.keys(counts).length === 0) {
    return undefined;
  }

  const report: TestReportSummary = {
    framework,
    source: "playwright",
  };
  assignNumber(report, "passed", counts.passed);
  assignNumber(report, "failed", counts.failed);
  assignNumber(report, "skipped", counts.skipped);
  assignNumber(report, "flaky", counts.flaky);
  assignNumber(report, "total", sumDefined(counts.passed, counts.failed, counts.skipped, counts.flaky));
  assignNumber(report, "durationMs", durationMs);
  return report;
}

function parseMochaReportSummary(text: string, framework: TestFramework): TestReportSummary | undefined {
  const counts: Partial<Record<"passed" | "failed" | "skipped", number>> = {};
  let durationMs: number | undefined;
  for (const match of text.matchAll(/^\s*(\d+)\s+(passing|failing|pending)\b(?:\s+\(([^)]+)\))?\s*$/gim)) {
    const count = Number.parseInt(match[1] ?? "", 10);
    if (!Number.isInteger(count) || count < 0) {
      continue;
    }
    const label = (match[2] ?? "").toLowerCase();
    if (label === "passing") {
      counts.passed = (counts.passed ?? 0) + count;
      durationMs ??= parseDurationMs(match[3] ?? "");
      continue;
    }
    if (label === "failing") {
      counts.failed = (counts.failed ?? 0) + count;
      continue;
    }
    counts.skipped = (counts.skipped ?? 0) + count;
  }
  if (counts.passed === undefined && counts.failed === undefined) {
    return undefined;
  }

  const report: TestReportSummary = {
    framework,
    source: "mocha",
  };
  assignNumber(report, "passed", counts.passed);
  assignNumber(report, "failed", counts.failed);
  assignNumber(report, "skipped", counts.skipped);
  assignNumber(report, "total", sumDefined(counts.passed, counts.failed, counts.skipped));
  assignNumber(report, "durationMs", durationMs);
  return hasReportCounts(report) ? report : undefined;
}

function parseGenericReportSummary(text: string, framework: TestFramework): TestReportSummary | undefined {
  const line = matchFirstNamedLine(text, ["Tests", "Test Results", "Test Summary", "Summary", "Results"]);
  if (!line) {
    return undefined;
  }
  if (!looksLikeStatusSummary(line)) {
    return undefined;
  }
  const report: TestReportSummary = {
    framework,
    source: "generic",
  };
  const counts = parseStatusCounts(line);
  if (!hasOutcomeCounts(counts)) {
    return undefined;
  }
  assignNumber(report, "total", counts.total ?? sumDefined(counts.passed, counts.failed, counts.skipped, counts.todo));
  assignNumber(report, "passed", counts.passed);
  assignNumber(report, "failed", counts.failed);
  assignNumber(report, "skipped", counts.skipped);
  assignNumber(report, "todo", counts.todo);
  return report;
}

function parseStatusCounts(text: string): Partial<Record<"passed" | "failed" | "skipped" | "todo" | "total", number>> {
  const counts: Partial<Record<"passed" | "failed" | "skipped" | "todo" | "total", number>> = {};
  for (const match of text.matchAll(/\b(\d+)\s+(passed|failed|skipped|todo|pending|total)\b/gi)) {
    const label = match[2].toLowerCase();
    const key = label === "pending" ? "skipped" : label;
    counts[key as keyof typeof counts] = (counts[key as keyof typeof counts] ?? 0) + Number.parseInt(match[1], 10);
  }
  const parenthesizedTotal = text.match(/\((\d+)\)/);
  if (parenthesizedTotal && counts.total === undefined) {
    counts.total = Number.parseInt(parenthesizedTotal[1], 10);
  }
  return counts;
}

function matchTapPlanTotal(text: string): number | undefined {
  let total: number | undefined;
  for (const match of text.matchAll(/^1\.\.(\d+)\s*$/gm)) {
    total = Number.parseInt(match[1] ?? "", 10);
  }
  return typeof total === "number" && Number.isInteger(total) && total >= 0 ? total : undefined;
}

function parseTapResultCounts(
  text: string,
): Partial<Record<"passed" | "failed" | "skipped" | "todo", number>> {
  const counts: Partial<Record<"passed" | "failed" | "skipped" | "todo", number>> = {};
  for (const match of text.matchAll(/^(not ok|ok)(?:\s+\d+)?(?:\s+-[^\r\n#]*)?(?:\s+#\s*(SKIP|TODO)\b[^\r\n]*)?\s*$/gim)) {
    const status = (match[1] ?? "").toLowerCase();
    const directive = (match[2] ?? "").toLowerCase();
    if (directive === "skip") {
      counts.skipped = (counts.skipped ?? 0) + 1;
      continue;
    }
    if (directive === "todo") {
      counts.todo = (counts.todo ?? 0) + 1;
      continue;
    }
    if (status === "ok") {
      counts.passed = (counts.passed ?? 0) + 1;
    } else {
      counts.failed = (counts.failed ?? 0) + 1;
    }
  }
  return counts;
}

function hasOutcomeCounts(
  counts: Partial<Record<"passed" | "failed" | "skipped" | "todo" | "total", number>>,
): boolean {
  return [counts.passed, counts.failed, counts.skipped, counts.todo].some((value) => typeof value === "number");
}

function formatTestReportSummary(report: TestReportSummary): string {
  return [
    `source=${report.source}`,
    formatReportNumber("tests", report.total),
    formatReportNumber("passed", report.passed),
    formatReportNumber("failed", report.failed),
    formatReportNumber("skipped", report.skipped),
    formatReportNumber("todo", report.todo),
    formatReportNumber("flaky", report.flaky),
    formatReportNumber("files", report.files),
    formatReportNumber("suites", report.suites),
    formatReportNumber("duration_ms", report.durationMs),
  ]
    .filter((part): part is string => typeof part === "string")
    .join(" ");
}

function formatReportNumber(name: string, value: number | undefined): string | undefined {
  return value === undefined ? undefined : `${name}=${formatFiniteNumber(value)}`;
}

function formatFiniteNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 1000) / 1000);
}

function hasReportCounts(report: TestReportSummary): boolean {
  return [
    report.total,
    report.passed,
    report.failed,
    report.skipped,
    report.todo,
    report.flaky,
    report.files,
    report.suites,
  ].some((value) => typeof value === "number");
}

function matchLineNumber(text: string, label: string): number | undefined {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`^\\s*(?:[#\\u2139]\\s*)?${escaped}\\s+(\\d+(?:\\.\\d+)?)\\s*$`, "im"));
  return match ? Number.parseFloat(match[1]) : undefined;
}

function matchXmlCommentNumber(text: string, label: string): number | undefined {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`<!--\\s*${escaped}\\s+(\\d+(?:\\.\\d+)?)\\s*-->`, "i"));
  return match ? Number.parseFloat(match[1]) : undefined;
}

function matchXmlAttributeNumber(text: string, attribute: string): number | undefined {
  const escaped = attribute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`\\b${escaped}=["'](\\d+(?:\\.\\d+)?)["']`, "i"));
  return match ? Number.parseFloat(match[1]) : undefined;
}

function countXmlTags(text: string, tag: string): number | undefined {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const count = Array.from(text.matchAll(new RegExp(`<${escaped}\\b`, "gi"))).length;
  return count > 0 ? count : undefined;
}

function matchNamedLine(text: string, label: string): string | undefined {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`^\\s*${escaped}:?\\s+(.+)$`, "im"));
  return match?.[1];
}

function matchJestNamedLine(text: string, label: string): string | undefined {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`^\\s*${escaped}:\\s+(.+)$`, "im"));
  return match?.[1];
}

function matchVitestNamedLine(text: string, label: string): string | undefined {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`^\\s*${escaped}\\s{2,}(.+)$`, "im"));
  return match?.[1];
}

function matchFirstNamedLine(text: string, labels: string[]): string | undefined {
  for (const label of labels) {
    const line = matchNamedLine(text, label);
    if (line) {
      return line;
    }
  }
  return undefined;
}

function looksLikeStatusSummary(line: string): boolean {
  if (!/\b\d+\s+(?:passed|failed|skipped|todo|pending)\b/i.test(line)) {
    return false;
  }
  const leftover = line
    .replace(/\b\d+\s+(?:passed|failed|skipped|todo|pending|total)\b/gi, "")
    .replace(/\(\d+\)/g, "")
    .replace(/[|,;:/\s-]+/g, "");
  return leftover.length === 0;
}

function parseDurationMs(value: string): number | undefined {
  let total = 0;
  for (const match of value.matchAll(/(\d+(?:\.\d+)?)\s*(ms|msec|milliseconds?|s|sec|seconds?|m|min|minutes?|h|hr|hours?)/gi)) {
    const amount = Number.parseFloat(match[1]);
    const unit = match[2].toLowerCase();
    if (unit.startsWith("ms") || unit.startsWith("millisecond") || unit === "msec") {
      total += amount;
    } else if (unit.startsWith("s")) {
      total += amount * 1000;
    } else if (unit.startsWith("m")) {
      total += amount * 60_000;
    } else if (unit.startsWith("h")) {
      total += amount * 3_600_000;
    }
  }
  return total > 0 ? Math.round(total * 1000) / 1000 : undefined;
}

function sumDefined(...values: Array<number | undefined>): number | undefined {
  const defined = values.filter((value): value is number => typeof value === "number");
  return defined.length === 0 ? undefined : defined.reduce((sum, value) => sum + value, 0);
}

function assignNumber<T extends keyof TestReportSummary>(
  report: TestReportSummary,
  key: T,
  value: TestReportSummary[T],
): void {
  if (typeof value === "number" && Number.isFinite(value)) {
    report[key] = value;
  }
}

function limitReportText(text: string): string {
  return text.length <= MAX_REPORT_PARSE_BYTES ? text : text.slice(-MAX_REPORT_PARSE_BYTES);
}

function inferPackageScriptMetadata(scriptCommand: string): {
  framework: TestFramework;
  reporter?: string;
  reporterDeclared: boolean;
  jsonReporter: boolean;
  reportOutputFile: boolean;
  reportOutputPath?: string;
  reportArgsForwardable: boolean;
  defaultReportArgsForwardable: boolean;
} {
  const segments = tokenizeScriptCommandSegments(scriptCommand);
  const tokens = segments.flat();
  const finalSegment = segments.at(-1) ?? [];
  const framework = inferPackageScriptFramework(segments);
  const finalSegmentFramework = inferPackageScriptFramework(finalSegment.length > 0 ? [finalSegment] : []);
  const finalSegmentSupportsReportArgs = finalSegmentSupportsDefaultJsonReportArgs(finalSegment, framework);
  return {
    framework,
    reporter: inferPackageScriptReporter(tokens),
    reporterDeclared: packageScriptHasReporter(tokens),
    jsonReporter: packageScriptHasJsonReporter(tokens, framework),
    reportOutputFile: packageScriptHasReportOutputFile(tokens),
    reportOutputPath: finalSegmentSupportsReportArgs ? packageScriptReportOutputFile(finalSegment) : undefined,
    reportArgsForwardable:
      framework === finalSegmentFramework &&
      packageScriptHasJsonReporter(finalSegment, framework) &&
      finalSegmentSupportsReportArgs,
    defaultReportArgsForwardable: framework === finalSegmentFramework && finalSegmentSupportsReportArgs,
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

function packageScriptHasJsonReporter(tokens: string[], framework: TestFramework): boolean {
  for (const [index, rawToken] of tokens.entries()) {
    const token = stripShellQuotes(rawToken);
    if (token === "--json") {
      if (framework === "jest") {
        return true;
      }
      continue;
    }
    if (framework !== "vitest" && framework !== "playwright") {
      continue;
    }
    if (token === "--reporter" || token === "--reporters") {
      if (reporterValueIncludesJson(tokens[index + 1] ?? "")) {
        return true;
      }
      continue;
    }
    if (token.startsWith("--reporter=") || token.startsWith("--reporters=")) {
      if (reporterValueIncludesJson(token.slice(token.indexOf("=") + 1))) {
        return true;
      }
    }
  }
  return false;
}

function packageScriptHasReporter(tokens: string[]): boolean {
  for (const rawToken of tokens) {
    const token = stripShellQuotes(rawToken);
    if (
      token === "--json" ||
      token === "--tap" ||
      token === "--reporter" ||
      token === "--reporters" ||
      token === "--test-reporter" ||
      token.startsWith("--reporter=") ||
      token.startsWith("--reporters=") ||
      token.startsWith("--test-reporter=")
    ) {
      return true;
    }
  }
  return false;
}

function reporterValueIncludesJson(reporter: string): boolean {
  return stripShellQuotes(reporter)
    .split(/[,:]/)
    .map((part) => part.trim().toLowerCase())
    .includes("json");
}

function packageScriptHasReportOutputFile(tokens: string[]): boolean {
  for (const rawToken of tokens) {
    const token = stripShellQuotes(rawToken);
    if (
      token === "--outputFile" ||
      token === "--output-file" ||
      token.startsWith("--outputFile=") ||
      token.startsWith("--output-file=") ||
      token.startsWith("PLAYWRIGHT_JSON_OUTPUT_NAME=") ||
      token.startsWith("PLAYWRIGHT_JSON_OUTPUT_FILE=")
    ) {
      return true;
    }
  }
  return false;
}

function packageScriptReportOutputFile(tokens: string[]): string | undefined {
  for (const [index, rawToken] of tokens.entries()) {
    const token = stripShellQuotes(rawToken);
    if (token === "--outputFile" || token === "--output-file") {
      return stripShellQuotes(tokens[index + 1] ?? "");
    }
    if (token.startsWith("--outputFile=") || token.startsWith("--output-file=")) {
      return token.slice(token.indexOf("=") + 1);
    }
    if (token.startsWith("PLAYWRIGHT_JSON_OUTPUT_FILE=")) {
      return token.slice(token.indexOf("=") + 1);
    }
  }
  return undefined;
}

function finalSegmentSupportsDefaultJsonReportArgs(tokens: string[], framework: TestFramework): boolean {
  const commandIndex = findFinalSegmentCommandIndex(tokens);
  if (commandIndex === undefined) {
    return false;
  }

  const command = normalizeScriptToken(tokens[commandIndex] ?? "");
  if (framework === "jest") {
    return command === "jest";
  }
  if (framework === "vitest") {
    return command === "vitest";
  }
  if (framework === "playwright") {
    return (
      (command === "playwright" || command === "playwright-core" || command === "@playwright/test") &&
      normalizeScriptToken(tokens[commandIndex + 1] ?? "") === "test"
    );
  }
  return false;
}

function findFinalSegmentCommandIndex(tokens: string[]): number | undefined {
  let index = 0;
  while (index < tokens.length) {
    const rawToken = stripShellQuotes(tokens[index] ?? "");
    const token = normalizeScriptToken(rawToken);
    if (isShellEnvironmentAssignment(rawToken)) {
      index += 1;
      continue;
    }
    if (token === "env" || token === "cross-env" || token === "cross-env-shell") {
      index += 1;
      continue;
    }
    return index;
  }
  return undefined;
}

function isShellEnvironmentAssignment(token: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(token);
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

type FrameworkJsonReportRequestMode = "existing-json-reporter" | "default-json-reporter";

interface StructuredReportFileState {
  exists: boolean;
  size?: number;
  mtimeMs?: number;
}

interface StructuredReportRequest {
  directory?: string;
  path: string;
  mode: "node-junit" | FrameworkJsonReportRequestMode | "declared-json-reporter" | "config-json-reporter";
  previousState?: StructuredReportFileState;
  root?: string;
  env?: Record<string, string>;
}

function createStructuredReportRequest(target: TestTarget, extraArgs: string[] = []): StructuredReportRequest | undefined {
  if (target.kind === "node-test" && target.framework === "node") {
    const directory = mkdtempSync(join(tmpdir(), "orx-test-report-"));
    return { directory, path: join(directory, "node-junit.xml"), mode: "node-junit" };
  }
  const declaredReportRequest = createDeclaredFrameworkJsonReportRequest(target, extraArgs);
  if (declaredReportRequest) {
    return declaredReportRequest;
  }
  const configReportRequest = createConfigFrameworkJsonReportRequest(target, extraArgs);
  if (configReportRequest) {
    return configReportRequest;
  }
  const frameworkReportMode = frameworkJsonReportRequestMode(target, extraArgs);
  if (!frameworkReportMode) {
    return undefined;
  }
  const directory = mkdtempSync(join(tmpdir(), "orx-test-report-"));
  const path = join(directory, `${target.framework}-results.json`);
  return target.framework === "playwright"
    ? { directory, path, mode: frameworkReportMode, env: { PLAYWRIGHT_JSON_OUTPUT_FILE: path } }
    : { directory, path, mode: frameworkReportMode };
}

function createDeclaredFrameworkJsonReportRequest(
  target: TestTarget,
  extraArgs: string[] = [],
): StructuredReportRequest | undefined {
  if (target.kind !== "package-script" || !isFrameworkJsonReportTarget(target)) {
    return undefined;
  }
  const outputPath = packageScriptReportOutputFile(extraArgs) ?? target.reportOutputPath;
  if (!outputPath) {
    return undefined;
  }
  const extraReporterDeclared = packageScriptHasReporter(extraArgs);
  const extraJsonReporterDeclared = packageScriptHasJsonReporter(extraArgs, target.framework);
  if (extraReporterDeclared && !extraJsonReporterDeclared) {
    return undefined;
  }
  const packageJsonReporterIsForwardable = target.jsonReporter === true && target.reportArgsForwardable === true;
  const extraJsonReporterIsForwardable =
    extraJsonReporterDeclared &&
    (target.reportArgsForwardable === true || target.defaultReportArgsForwardable === true);
  if (!packageJsonReporterIsForwardable && !extraJsonReporterIsForwardable) {
    return undefined;
  }
  const path = resolveReportOutputFilePath(target.cwd, outputPath);
  if (!path) {
    return undefined;
  }
  return {
    path,
    mode: "declared-json-reporter",
    previousState: captureStructuredReportFileState(path),
    root: target.cwd,
  };
}

function createConfigFrameworkJsonReportRequest(
  target: TestTarget,
  extraArgs: string[] = [],
): StructuredReportRequest | undefined {
  if (
    target.kind !== "package-script" ||
    !isFrameworkJsonReportTarget(target) ||
    target.defaultReportArgsForwardable !== true ||
    target.reporterDeclared === true ||
    target.jsonReporter === true ||
    target.reportOutputFile === true ||
    target.configJsonReporter !== true ||
    !target.configReportOutputPath ||
    packageScriptHasReporter(extraArgs) ||
    packageScriptHasReportOutputFile(extraArgs)
  ) {
    return undefined;
  }
  const path = resolveReportOutputFilePath(target.cwd, target.configReportOutputPath);
  if (!path) {
    return undefined;
  }
  return {
    path,
    mode: "config-json-reporter",
    previousState: captureStructuredReportFileState(path),
    root: target.cwd,
  };
}

function frameworkJsonReportRequestMode(
  target: TestTarget,
  extraArgs: string[] = [],
): FrameworkJsonReportRequestMode | undefined {
  if (
    target.kind !== "package-script" ||
    !isFrameworkJsonReportTarget(target) ||
    target.reportOutputFile === true ||
    packageScriptHasReportOutputFile(extraArgs) ||
    packageScriptHasReporter(extraArgs)
  ) {
    return undefined;
  }
  if (target.jsonReporter === true && target.reportArgsForwardable === true) {
    return "existing-json-reporter";
  }
  if (
    target.reporterDeclared !== true &&
    target.jsonReporter !== true &&
    target.defaultReportArgsForwardable === true
  ) {
    return "default-json-reporter";
  }
  return undefined;
}

function isFrameworkJsonReportTarget(target: TestTarget): boolean {
  return isFrameworkJsonReportFramework(target.framework);
}

function isFrameworkJsonReportFramework(framework: TestFramework): boolean {
  return framework === "jest" || framework === "vitest" || framework === "playwright";
}

function formatTargetRunArgs(
  target: TestTarget,
  reportRequest: StructuredReportRequest | undefined,
  extraArgs: string[],
): string[] {
  if (!reportRequest) {
    return [...target.args, ...formatExtraArgsForTarget(target, extraArgs)];
  }
  if (reportRequest.mode === "node-junit") {
    return [
      target.args[0] ?? "--test",
      "--test-reporter=junit",
      `--test-reporter-destination=${reportRequest.path}`,
      ...target.args.slice(1),
      ...formatExtraArgsForTarget(target, extraArgs),
    ];
  }
  if (reportRequest.mode === "declared-json-reporter") {
    return [...target.args, ...formatExtraArgsForTarget(target, extraArgs)];
  }
  if (reportRequest.mode === "config-json-reporter") {
    return [...target.args, ...formatExtraArgsForTarget(target, extraArgs)];
  }
  const reportArgs = formatFrameworkJsonReportArgs(target, reportRequest.path, reportRequest.mode);
  return [...target.args, ...formatExtraArgsForTarget(target, [...reportArgs, ...extraArgs])];
}

function formatFrameworkJsonReportArgs(
  target: TestTarget,
  reportPath: string,
  mode: FrameworkJsonReportRequestMode,
): string[] {
  if (mode === "existing-json-reporter") {
    if (target.framework === "jest" || target.framework === "vitest") {
      return [`--outputFile=${reportPath}`];
    }
    return [];
  }
  if (target.framework === "jest") {
    return ["--json", `--outputFile=${reportPath}`];
  }
  if (target.framework === "vitest") {
    return ["--reporter=json", "--reporter=default", `--outputFile=${reportPath}`];
  }
  if (target.framework === "playwright") {
    return ["--reporter=json"];
  }
  return [];
}

function readStructuredReportFile(
  path: string,
  previousState: StructuredReportFileState | undefined = undefined,
  root: string | undefined = undefined,
): string | undefined {
  try {
    if (root && resolveReportOutputFilePath(root, path) !== path) {
      return undefined;
    }
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_STRUCTURED_REPORT_BYTES) {
      return undefined;
    }
    if (
      previousState?.exists === true &&
      previousState.size === stat.size &&
      previousState.mtimeMs === stat.mtimeMs
    ) {
      return undefined;
    }
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}

function captureStructuredReportFileState(path: string): StructuredReportFileState {
  try {
    const stat = lstatSync(path);
    return {
      exists: true,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
    };
  } catch {
    return { exists: false };
  }
}

function resolveReportOutputFilePath(root: string, value: string): string | undefined {
  const normalized = stripShellQuotes(value).trim();
  if (
    normalized.length === 0 ||
    normalized.length > MAX_REPORT_OUTPUT_PATH_LENGTH ||
    normalized.startsWith("-") ||
    CONTROL_CHAR_PATTERN.test(normalized) ||
    SECRET_LIKE_PATTERN.test(normalized) ||
    /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(normalized)
  ) {
    return undefined;
  }

  const resolved = resolve(root, normalized);
  if (!isPathInside(root, resolved)) {
    return undefined;
  }

  const realRoot = safeRealpath(root) ?? root;
  const realParent = safeRealpath(dirname(resolved));
  if (realParent && !isPathInside(realRoot, realParent)) {
    return undefined;
  }

  const realFile = existsSync(resolved) ? safeRealpath(resolved) : undefined;
  if (realFile && !isPathInside(realRoot, realFile)) {
    return undefined;
  }

  return resolved;
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

function createTestProcessEnv(extraEnv: Record<string, string> | undefined = undefined): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...extraEnv };
  for (const key of Object.keys(env)) {
    if (key.startsWith("NODE_TEST_")) {
      delete env[key];
    }
  }
  return env;
}

function formatTestProcessResult(
  target: TestTarget,
  args: string[],
  result: RunProcessResult,
  structuredReportText?: string,
): TestRunResult {
  const status: TestRunStatus = result.error
    ? "process_error"
    : result.timedOut
      ? "timed_out"
      : result.exitCode === 0
        ? "ok"
        : "failed";
  const ok = status === "ok";
  const stdout = sanitizeRenderedText(result.stdout);
  const stderr = sanitizeRenderedText(result.stderr || result.error?.message || "");

  return {
    ok,
    status,
    target,
    report: parseTestReportSummary(target, stdout, stderr, structuredReportText),
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
    stdout,
    stderr,
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
