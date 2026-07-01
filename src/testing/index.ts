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
  source: TestFramework | "generic" | "tap" | "mocha" | "pytest" | "cargo" | "cucumber" | "testthat" | "gtest" | "catch2" | "deno" | "exunit" | "gradle" | "junit-platform" | "testng" | "nunit" | "go" | "rspec" | "minitest" | "karma" | "bun" | "unittest" | "junit-text" | "phpunit" | "dotnet" | "ctest" | "xctest" | "node-junit" | "jest-json" | "vitest-json" | "playwright-json";
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
    if (report === INVALID_TEST_REPORT) {
      return undefined;
    }
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

const INVALID_TEST_REPORT = Symbol("invalid-test-report");

type InvalidTestReport = typeof INVALID_TEST_REPORT;
type ReportParser = (text: string, framework: TestFramework) => TestReportSummary | InvalidTestReport | undefined;

function orderedReportParsers(framework: TestFramework): ReportParser[] {
  const parsers: Record<TestFramework, ReportParser> = {
    node: parseNodeReportSummary,
    vitest: parseVitestReportSummary,
    jest: parseJestReportSummary,
    playwright: parsePlaywrightReportSummary,
    unknown: parseGenericReportSummary,
  };
  if (framework === "node") {
    return [parseExunitReportSummary, parseGradleReportSummary, parseJunitPlatformReportSummary, parseTestngReportSummary, parseNunitReportSummary, parseDotnetReportSummary, parseCucumberReportSummary, parseTestthatReportSummary, parseGtestReportSummary, parseCatch2ReportSummary, parseTapReportSummary, parseNodeReportSummary, parseJunitTextReportSummary, parsePhpunitReportSummary, parseCtestReportSummary, parseXctestReportSummary, parseMinitestReportSummary, parseKarmaReportSummary, parseBunReportSummary, parseDenoReportSummary, parseGenericReportSummary];
  }
  return framework === "unknown"
    ? [parseExunitReportSummary, parseGradleReportSummary, parseJunitPlatformReportSummary, parseTestngReportSummary, parseNunitReportSummary, parseDotnetReportSummary, parseCucumberReportSummary, parseTestthatReportSummary, parseGtestReportSummary, parseCatch2ReportSummary, parseJestReportSummary, parseVitestReportSummary, parseTapReportSummary, parseNodeReportSummary, parsePlaywrightReportSummary, parseMochaReportSummary, parsePytestReportSummary, parseDenoReportSummary, parseCargoReportSummary, parseGoTestReportSummary, parseRspecReportSummary, parseMinitestReportSummary, parseKarmaReportSummary, parseBunReportSummary, parsePythonUnittestReportSummary, parseJunitTextReportSummary, parsePhpunitReportSummary, parseCtestReportSummary, parseXctestReportSummary, parseGenericReportSummary]
    : [parseExunitReportSummary, parseGradleReportSummary, parseJunitPlatformReportSummary, parseTestngReportSummary, parseNunitReportSummary, parseDotnetReportSummary, parseCucumberReportSummary, parseTestthatReportSummary, parseGtestReportSummary, parseCatch2ReportSummary, parsers[framework], parseTapReportSummary, parseMochaReportSummary, parsePytestReportSummary, parseDenoReportSummary, parseCargoReportSummary, parseGoTestReportSummary, parseRspecReportSummary, parseMinitestReportSummary, parseKarmaReportSummary, parseBunReportSummary, parsePythonUnittestReportSummary, parseJunitTextReportSummary, parsePhpunitReportSummary, parseCtestReportSummary, parseXctestReportSummary, parseGenericReportSummary];
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

function parsePytestReportSummary(text: string, framework: TestFramework): TestReportSummary | undefined {
  let parsed: {
    counts: Partial<Record<"passed" | "failed" | "skipped" | "todo", number>>;
    durationMs?: number;
  } | undefined;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim().replace(/^=+\s*/, "").replace(/\s*=+$/, "").trim();
    const candidate = parsePytestStatusLine(line);
    if (candidate) {
      parsed = candidate;
    }
  }
  if (!parsed) {
    return undefined;
  }

  const report: TestReportSummary = {
    framework,
    source: "pytest",
  };
  assignNumber(report, "passed", parsed.counts.passed);
  assignNumber(report, "failed", parsed.counts.failed);
  assignNumber(report, "skipped", parsed.counts.skipped);
  assignNumber(report, "todo", parsed.counts.todo);
  assignNumber(report, "total", sumDefined(report.passed, report.failed, report.skipped, report.todo));
  assignNumber(report, "durationMs", parsed.durationMs);
  return hasReportCounts(report) ? report : undefined;
}

function parseCargoReportSummary(text: string, framework: TestFramework): TestReportSummary | undefined {
  const counts: Partial<Record<"passed" | "failed" | "skipped", number>> = {};
  let durationMs: number | undefined;
  let hasParsedSummary = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const match = /^test result:\s*(?:ok|FAILED)\.\s+(.+)$/i.exec(rawLine.trim());
    if (!match) {
      continue;
    }
    const candidate = parseCargoStatusLine(match[1] ?? "");
    if (candidate) {
      counts.passed = sumDefined(counts.passed, candidate.counts.passed);
      counts.failed = sumDefined(counts.failed, candidate.counts.failed);
      counts.skipped = sumDefined(counts.skipped, candidate.counts.skipped);
      durationMs = sumDefined(durationMs, candidate.durationMs);
      hasParsedSummary = true;
    }
  }
  if (!hasParsedSummary) {
    return undefined;
  }

  const report: TestReportSummary = {
    framework,
    source: "cargo",
  };
  assignNumber(report, "passed", counts.passed);
  assignNumber(report, "failed", counts.failed);
  assignNumber(report, "skipped", counts.skipped);
  assignNumber(report, "total", sumDefined(report.passed, report.failed, report.skipped));
  assignNumber(report, "durationMs", durationMs);
  return hasReportCounts(report) ? report : undefined;
}

function parseDenoReportSummary(text: string, framework: TestFramework): TestReportSummary | InvalidTestReport | undefined {
  let counts:
    | {
        total: number;
        passed: number;
        failed: number;
        skipped: number;
        durationMs: number;
      }
    | undefined;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    const candidate = parseDenoStatusLine(line);
    if (candidate) {
      counts = candidate;
      continue;
    }
    if (looksLikeDenoStatusLine(line)) {
      return INVALID_TEST_REPORT;
    }
  }
  if (!counts) {
    return undefined;
  }

  const report: TestReportSummary = {
    framework,
    source: "deno",
  };
  assignNumber(report, "total", counts.total);
  assignNumber(report, "passed", counts.passed);
  assignNumber(report, "failed", counts.failed);
  assignNumber(report, "skipped", counts.skipped);
  assignNumber(report, "durationMs", counts.durationMs);
  return hasReportCounts(report) ? report : undefined;
}

function parseExunitReportSummary(text: string, framework: TestFramework): TestReportSummary | InvalidTestReport | undefined {
  let counts:
    | {
        total: number;
        passed: number;
        failed: number;
        skipped: number;
      }
    | undefined;
  let durationMs: number | undefined;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    const durationCandidate = parseExunitDurationLine(line);
    if (durationCandidate !== undefined) {
      durationMs = durationCandidate;
      continue;
    }
    const candidate = parseExunitStatusLine(line);
    if (candidate) {
      counts = candidate;
      continue;
    }
    if (looksLikeExunitStatusLine(line)) {
      return INVALID_TEST_REPORT;
    }
  }
  if (!counts) {
    return undefined;
  }

  const report: TestReportSummary = {
    framework,
    source: "exunit",
  };
  assignNumber(report, "total", counts.total);
  assignNumber(report, "passed", counts.passed);
  assignNumber(report, "failed", counts.failed);
  assignNumber(report, "skipped", counts.skipped);
  assignNumber(report, "durationMs", durationMs);
  return hasReportCounts(report) ? report : undefined;
}

function parseGradleReportSummary(text: string, framework: TestFramework): TestReportSummary | InvalidTestReport | undefined {
  let counts:
    | {
        total: number;
        passed: number;
        failed: number;
        skipped: number;
      }
    | undefined;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    const candidate = parseGradleStatusLine(line);
    if (candidate) {
      counts = candidate;
      continue;
    }
    if (looksLikeGradleStatusLine(line)) {
      return INVALID_TEST_REPORT;
    }
  }
  if (!counts) {
    return undefined;
  }

  const report: TestReportSummary = {
    framework,
    source: "gradle",
  };
  assignNumber(report, "total", counts.total);
  assignNumber(report, "passed", counts.passed);
  assignNumber(report, "failed", counts.failed);
  assignNumber(report, "skipped", counts.skipped);
  return hasReportCounts(report) ? report : undefined;
}

function parseJunitPlatformReportSummary(text: string, framework: TestFramework): TestReportSummary | InvalidTestReport | undefined {
  const counts: Partial<Record<"found" | "skipped" | "aborted" | "started" | "successful" | "failed", number>> = {};
  let durationMs: number | undefined;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    const durationCandidate = parseJunitPlatformDurationLine(line);
    if (durationCandidate !== undefined) {
      durationMs = durationCandidate;
      continue;
    }
    if (looksLikeJunitPlatformDurationLine(line)) {
      return INVALID_TEST_REPORT;
    }
    const candidate = parseJunitPlatformStatusLine(line);
    if (candidate) {
      counts[candidate.label] = candidate.count;
      continue;
    }
    if (looksLikeJunitPlatformStatusLine(line)) {
      return INVALID_TEST_REPORT;
    }
  }

  const skippedCount = sumDefined(counts.skipped, counts.aborted);
  let skipped = skippedCount;
  if (
    skipped === undefined &&
    counts.found !== undefined &&
    counts.successful !== undefined &&
    counts.failed !== undefined &&
    counts.successful + counts.failed === counts.found
  ) {
    skipped = 0;
  }
  const outcomeTotal = sumDefined(counts.successful, counts.failed, skipped);
  const total = counts.found ?? outcomeTotal;
  if (total === undefined || total <= 0) {
    return undefined;
  }
  if (outcomeTotal !== undefined && outcomeTotal > total) {
    return undefined;
  }
  if (
    counts.found !== undefined &&
    counts.successful !== undefined &&
    counts.failed !== undefined &&
    skipped !== undefined &&
    outcomeTotal !== counts.found
  ) {
    return undefined;
  }

  const report: TestReportSummary = {
    framework,
    source: "junit-platform",
  };
  assignNumber(report, "total", total);
  assignNumber(report, "passed", counts.successful);
  assignNumber(report, "failed", counts.failed);
  assignNumber(report, "skipped", skipped);
  assignNumber(report, "durationMs", durationMs);
  return hasReportCounts(report) ? report : undefined;
}

function parseTestngReportSummary(text: string, framework: TestFramework): TestReportSummary | InvalidTestReport | undefined {
  let counts:
    | {
        total: number;
        passed: number;
        failed: number;
        skipped: number;
      }
    | undefined;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    const candidate = parseTestngStatusLine(line);
    if (candidate) {
      counts = candidate;
      continue;
    }
    if (looksLikeTestngStatusLine(line)) {
      return INVALID_TEST_REPORT;
    }
  }
  if (!counts) {
    return undefined;
  }

  const report: TestReportSummary = {
    framework,
    source: "testng",
  };
  assignNumber(report, "total", counts.total);
  assignNumber(report, "passed", counts.passed);
  assignNumber(report, "failed", counts.failed);
  assignNumber(report, "skipped", counts.skipped);
  return hasReportCounts(report) ? report : undefined;
}

function parseNunitReportSummary(text: string, framework: TestFramework): TestReportSummary | InvalidTestReport | undefined {
  let counts:
    | {
        total: number;
        passed: number;
        failed: number;
        skipped: number;
      }
    | undefined;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    const candidate = parseNunitTestCountLine(line);
    if (candidate) {
      counts = candidate;
      continue;
    }
    if (looksLikeNunitTestCountLine(line)) {
      return INVALID_TEST_REPORT;
    }
  }
  if (!counts) {
    return undefined;
  }

  const report: TestReportSummary = {
    framework,
    source: "nunit",
  };
  assignNumber(report, "total", counts.total);
  assignNumber(report, "passed", counts.passed);
  assignNumber(report, "failed", counts.failed);
  assignNumber(report, "skipped", counts.skipped);
  return hasReportCounts(report) ? report : undefined;
}

function parseCucumberReportSummary(text: string, framework: TestFramework): TestReportSummary | InvalidTestReport | undefined {
  let counts:
    | {
        total: number;
        passed: number;
        failed: number;
        skipped: number;
      }
    | undefined;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    const candidate = parseCucumberScenarioStatusLine(line);
    if (candidate) {
      counts = candidate;
      continue;
    }
    if (looksLikeCucumberScenarioStatusLine(line)) {
      return INVALID_TEST_REPORT;
    }
  }
  if (!counts) {
    return undefined;
  }

  const report: TestReportSummary = {
    framework,
    source: "cucumber",
  };
  assignNumber(report, "total", counts.total);
  assignNumber(report, "passed", counts.passed);
  assignNumber(report, "failed", counts.failed);
  assignNumber(report, "skipped", counts.skipped);
  return hasReportCounts(report) ? report : undefined;
}

function parseTestthatReportSummary(text: string, framework: TestFramework): TestReportSummary | InvalidTestReport | undefined {
  let counts:
    | {
        total: number;
        passed: number;
        failed: number;
        skipped: number;
      }
    | undefined;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    const candidate = parseTestthatStatusLine(line);
    if (candidate) {
      counts = candidate;
      continue;
    }
    if (looksLikeTestthatStatusLine(line)) {
      return INVALID_TEST_REPORT;
    }
  }
  if (!counts) {
    return undefined;
  }

  const report: TestReportSummary = {
    framework,
    source: "testthat",
  };
  assignNumber(report, "total", counts.total);
  assignNumber(report, "passed", counts.passed);
  assignNumber(report, "failed", counts.failed);
  assignNumber(report, "skipped", counts.skipped);
  return hasReportCounts(report) ? report : undefined;
}

function parseGtestReportSummary(text: string, framework: TestFramework): TestReportSummary | InvalidTestReport | undefined {
  let counts: Partial<Record<"passed" | "failed" | "skipped" | "total", number>> = {};
  let durationMs: number | undefined;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    const totalCandidate = parseGtestTotalLine(line);
    if (totalCandidate) {
      counts = {
        total: totalCandidate.total,
      };
      durationMs = totalCandidate.durationMs;
      continue;
    }
    if (looksLikeGtestTotalLine(line)) {
      return INVALID_TEST_REPORT;
    }
    const statusCandidate = parseGtestStatusLine(line);
    if (statusCandidate) {
      counts[statusCandidate.label] = statusCandidate.count;
      continue;
    }
    if (looksLikeGtestStatusLine(line)) {
      return INVALID_TEST_REPORT;
    }
  }

  const failed = counts.failed ?? 0;
  const skipped = counts.skipped ?? 0;
  let passed = counts.passed;
  if (passed === undefined && counts.total !== undefined) {
    passed = counts.total - failed - skipped;
  }
  const outcomeTotal = sumDefined(passed, failed, skipped);
  const total = counts.total ?? outcomeTotal;
  if (total === undefined || total <= 0) {
    return undefined;
  }
  if (passed === undefined || passed < 0 || outcomeTotal !== total) {
    return INVALID_TEST_REPORT;
  }

  const report: TestReportSummary = {
    framework,
    source: "gtest",
  };
  assignNumber(report, "total", total);
  assignNumber(report, "passed", passed);
  assignNumber(report, "failed", failed);
  assignNumber(report, "skipped", skipped);
  assignNumber(report, "durationMs", durationMs);
  return hasReportCounts(report) ? report : undefined;
}

function parseCatch2ReportSummary(text: string, framework: TestFramework): TestReportSummary | InvalidTestReport | undefined {
  let counts:
    | {
        total: number;
        passed: number;
        failed: number;
        skipped: number;
      }
    | undefined;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    const allPassedCandidate = parseCatch2AllPassedLine(line);
    if (allPassedCandidate) {
      counts = allPassedCandidate;
      continue;
    }
    if (looksLikeCatch2AllPassedLine(line)) {
      return INVALID_TEST_REPORT;
    }
    const statusCandidate = parseCatch2TestCasesLine(line);
    if (statusCandidate) {
      counts = statusCandidate;
      continue;
    }
    if (looksLikeCatch2TestCasesLine(line)) {
      return INVALID_TEST_REPORT;
    }
  }
  if (!counts) {
    return undefined;
  }

  const report: TestReportSummary = {
    framework,
    source: "catch2",
  };
  assignNumber(report, "total", counts.total);
  assignNumber(report, "passed", counts.passed);
  assignNumber(report, "failed", counts.failed);
  assignNumber(report, "skipped", counts.skipped);
  return hasReportCounts(report) ? report : undefined;
}

function parseGoTestReportSummary(text: string, framework: TestFramework): TestReportSummary | undefined {
  const counts: Partial<Record<"passed" | "failed" | "skipped", number>> = {};
  let durationMs: number | undefined;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    const testMatch = /^---\s+(PASS|FAIL|SKIP):\s+\S+\s+\((\d+(?:\.\d+)?)s\)$/.exec(line);
    if (testMatch) {
      const label = (testMatch[1] ?? "").toLowerCase();
      if (label === "pass") {
        counts.passed = (counts.passed ?? 0) + 1;
      } else if (label === "fail") {
        counts.failed = (counts.failed ?? 0) + 1;
      } else {
        counts.skipped = (counts.skipped ?? 0) + 1;
      }
      continue;
    }

    const packageMatch = /^(?:ok|FAIL)\s+\S+\s+(\d+(?:\.\d+)?)s$/.exec(line);
    if (packageMatch) {
      durationMs = sumDefined(durationMs, parseSecondsDurationMs(packageMatch[1] ?? ""));
    }
  }
  if (counts.passed === undefined && counts.failed === undefined && counts.skipped === undefined) {
    return undefined;
  }

  const report: TestReportSummary = {
    framework,
    source: "go",
  };
  assignNumber(report, "passed", counts.passed);
  assignNumber(report, "failed", counts.failed);
  assignNumber(report, "skipped", counts.skipped);
  assignNumber(report, "total", sumDefined(report.passed, report.failed, report.skipped));
  assignNumber(report, "durationMs", durationMs);
  return hasReportCounts(report) ? report : undefined;
}

function parseRspecReportSummary(text: string, framework: TestFramework): TestReportSummary | undefined {
  let counts:
    | {
        total: number;
        passed: number;
        failed: number;
        skipped?: number;
      }
    | undefined;
  let durationMs: number | undefined;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    const durationMatch = /^Finished in\s+(\d+(?:\.\d+)?)\s+seconds?(?:\s+\(files took\s+\d+(?:\.\d+)?\s+seconds?\s+to load\))?$/.exec(line);
    if (durationMatch) {
      durationMs = parseSecondsDurationMs(durationMatch[1] ?? "");
      continue;
    }

    const candidate = parseRspecStatusLine(line);
    if (candidate) {
      counts = candidate;
    }
  }
  if (!counts) {
    return undefined;
  }

  const report: TestReportSummary = {
    framework,
    source: "rspec",
  };
  assignNumber(report, "total", counts.total);
  assignNumber(report, "passed", counts.passed);
  assignNumber(report, "failed", counts.failed);
  assignNumber(report, "skipped", counts.skipped);
  assignNumber(report, "durationMs", durationMs);
  return hasReportCounts(report) ? report : undefined;
}

function parseMinitestReportSummary(text: string, framework: TestFramework): TestReportSummary | undefined {
  let counts:
    | {
        total: number;
        passed: number;
        failed: number;
        skipped: number;
      }
    | undefined;
  let durationMs: number | undefined;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    const duration = parseMinitestDurationLine(line);
    if (duration !== undefined) {
      durationMs = duration;
      continue;
    }
    const candidate = parseMinitestStatusLine(line);
    if (candidate) {
      counts = candidate;
    }
  }
  if (!counts) {
    return undefined;
  }

  const report: TestReportSummary = {
    framework,
    source: "minitest",
  };
  assignNumber(report, "total", counts.total);
  assignNumber(report, "passed", counts.passed);
  assignNumber(report, "failed", counts.failed);
  assignNumber(report, "skipped", counts.skipped);
  assignNumber(report, "durationMs", durationMs);
  return hasReportCounts(report) ? report : undefined;
}

function parseKarmaReportSummary(text: string, framework: TestFramework): TestReportSummary | undefined {
  let counts:
    | {
        total: number;
        passed: number;
        failed: number;
        skipped: number;
      }
    | undefined;
  for (const rawLine of text.split(/\r?\n/)) {
    const candidate = parseKarmaStatusLine(rawLine.trim());
    if (candidate) {
      counts = candidate;
    }
  }
  if (!counts) {
    return undefined;
  }

  const report: TestReportSummary = {
    framework,
    source: "karma",
  };
  assignNumber(report, "total", counts.total);
  assignNumber(report, "passed", counts.passed);
  assignNumber(report, "failed", counts.failed);
  assignNumber(report, "skipped", counts.skipped);
  return hasReportCounts(report) ? report : undefined;
}

function parseBunReportSummary(text: string, framework: TestFramework): TestReportSummary | undefined {
  let counts:
    | {
        total: number;
        passed: number;
        failed: number;
        files?: number;
        durationMs?: number;
      }
    | undefined;
  let pending: { passed?: number; failed?: number } | undefined;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const pass = parseBunCountLine(line, "pass");
    if (pass !== undefined) {
      pending = { passed: pass };
      continue;
    }
    const fail = parseBunCountLine(line, "fail");
    if (fail !== undefined) {
      pending = {
        ...pending,
        failed: fail,
      };
      continue;
    }
    if (looksLikeMalformedBunCountLine(line)) {
      pending = undefined;
      counts = undefined;
      continue;
    }
    const candidate = parseBunRanLine(line);
    if (candidate) {
      if (pending?.passed === undefined || pending.failed === undefined || pending.passed + pending.failed !== candidate.total) {
        counts = undefined;
        pending = undefined;
        continue;
      }
      counts = {
        total: candidate.total,
        passed: pending.passed,
        failed: pending.failed,
        files: candidate.files,
        durationMs: candidate.durationMs,
      };
      pending = undefined;
      continue;
    }
    if (/^Ran\s+\d+\s+tests?\b/.test(line)) {
      pending = undefined;
      counts = undefined;
      continue;
    }
    if (pending && !/^\d+\s+expect\(\)\s+calls$/.test(line)) {
      pending = undefined;
    }
  }
  if (pending?.passed !== undefined || pending?.failed !== undefined) {
    counts = undefined;
  }
  if (!counts) {
    return undefined;
  }

  const report: TestReportSummary = {
    framework,
    source: "bun",
  };
  assignNumber(report, "total", counts.total);
  assignNumber(report, "passed", counts.passed);
  assignNumber(report, "failed", counts.failed);
  assignNumber(report, "files", counts.files);
  assignNumber(report, "durationMs", counts.durationMs);
  return hasReportCounts(report) ? report : undefined;
}

function parsePythonUnittestReportSummary(text: string, framework: TestFramework): TestReportSummary | undefined {
  let run:
    | {
        total: number;
        durationMs?: number;
      }
    | undefined;
  let statusLine: string | undefined;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (statusLine && line) {
      return undefined;
    }
    const runMatch = /^Ran\s+(\d+)\s+tests?\s+in\s+(\d+(?:\.\d+)?)s$/.exec(line);
    if (runMatch) {
      const total = Number.parseInt(runMatch[1] ?? "", 10);
      if (!Number.isInteger(total) || total < 0) {
        return undefined;
      }
      run = {
        total,
        durationMs: parseSecondsDurationMs(runMatch[2] ?? ""),
      };
      statusLine = undefined;
      continue;
    }
    if (run && (/^OK(?:\s+\(.+\))?$/.test(line) || /^FAILED\s+\(.+\)$/.test(line))) {
      statusLine = line;
    }
  }
  if (!run || !statusLine) {
    return undefined;
  }

  const status = parsePythonUnittestStatusLine(statusLine, run.total);
  if (!status) {
    return undefined;
  }

  const report: TestReportSummary = {
    framework,
    source: "unittest",
  };
  assignNumber(report, "total", run.total);
  assignNumber(report, "passed", status.passed);
  assignNumber(report, "failed", status.failed);
  assignNumber(report, "skipped", status.skipped);
  assignNumber(report, "todo", status.todo);
  assignNumber(report, "durationMs", run.durationMs);
  return hasReportCounts(report) ? report : undefined;
}

function parseJunitTextReportSummary(text: string, framework: TestFramework): TestReportSummary | undefined {
  let counts:
    | {
        total: number;
        passed: number;
        failed: number;
        skipped: number;
        durationMs?: number;
      }
    | undefined;
  for (const rawLine of text.split(/\r?\n/)) {
    const candidate = parseJunitTextStatusLine(rawLine.trim());
    if (candidate) {
      counts = candidate;
    }
  }
  if (!counts) {
    return undefined;
  }

  const report: TestReportSummary = {
    framework,
    source: "junit-text",
  };
  assignNumber(report, "total", counts.total);
  assignNumber(report, "passed", counts.passed);
  assignNumber(report, "failed", counts.failed);
  assignNumber(report, "skipped", counts.skipped);
  assignNumber(report, "durationMs", counts.durationMs);
  return hasReportCounts(report) ? report : undefined;
}

function parsePhpunitReportSummary(text: string, framework: TestFramework): TestReportSummary | undefined {
  let counts:
    | {
        total: number;
        passed: number;
        failed: number;
        skipped?: number;
        todo?: number;
      }
    | undefined;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    const candidate = parsePhpunitOkLine(line) ?? parsePhpunitStatusLine(line);
    if (candidate) {
      counts = candidate;
    }
  }
  if (!counts) {
    return undefined;
  }

  const report: TestReportSummary = {
    framework,
    source: "phpunit",
  };
  assignNumber(report, "total", counts.total);
  assignNumber(report, "passed", counts.passed);
  assignNumber(report, "failed", counts.failed);
  assignNumber(report, "skipped", counts.skipped);
  assignNumber(report, "todo", counts.todo);
  return hasReportCounts(report) ? report : undefined;
}

function parseDotnetReportSummary(text: string, framework: TestFramework): TestReportSummary | InvalidTestReport | undefined {
  let counts:
    | {
        total: number;
        passed: number;
        failed: number;
        skipped: number;
        durationMs?: number;
      }
    | undefined;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    const candidate = parseDotnetStatusLine(line) ?? parseDotnetTestSummaryLine(line);
    if (candidate) {
      counts = candidate;
      continue;
    }
    if (looksLikeDotnetStatusLine(line) || looksLikeDotnetTestSummaryLine(line)) {
      return INVALID_TEST_REPORT;
    }
  }
  if (!counts) {
    return undefined;
  }

  const report: TestReportSummary = {
    framework,
    source: "dotnet",
  };
  assignNumber(report, "total", counts.total);
  assignNumber(report, "passed", counts.passed);
  assignNumber(report, "failed", counts.failed);
  assignNumber(report, "skipped", counts.skipped);
  assignNumber(report, "durationMs", counts.durationMs);
  return hasReportCounts(report) ? report : undefined;
}

function parseCtestReportSummary(text: string, framework: TestFramework): TestReportSummary | undefined {
  let counts:
    | {
        total: number;
        passed: number;
        failed: number;
        durationMs?: number;
      }
    | undefined;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    const candidate = parseCtestStatusLine(line);
    if (candidate) {
      counts = candidate;
      continue;
    }
    const durationMs = parseCtestDurationLine(line);
    if (durationMs !== undefined && counts) {
      counts.durationMs = durationMs;
      continue;
    }
    if (/^Total Test time\b/.test(line)) {
      return undefined;
    }
  }
  if (!counts) {
    return undefined;
  }

  const report: TestReportSummary = {
    framework,
    source: "ctest",
  };
  assignNumber(report, "total", counts.total);
  assignNumber(report, "passed", counts.passed);
  assignNumber(report, "failed", counts.failed);
  assignNumber(report, "durationMs", counts.durationMs);
  return hasReportCounts(report) ? report : undefined;
}

function parseXctestReportSummary(text: string, framework: TestFramework): TestReportSummary | InvalidTestReport | undefined {
  let counts:
    | {
        total: number;
        passed: number;
        failed: number;
        durationMs: number;
      }
    | undefined;
  let sawSummary = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    const candidate = parseXctestStatusLine(line);
    if (candidate) {
      counts = candidate;
      sawSummary = true;
      continue;
    }
    if (sawSummary && line) {
      return INVALID_TEST_REPORT;
    }
  }
  if (!counts) {
    return undefined;
  }

  const report: TestReportSummary = {
    framework,
    source: "xctest",
  };
  assignNumber(report, "total", counts.total);
  assignNumber(report, "passed", counts.passed);
  assignNumber(report, "failed", counts.failed);
  assignNumber(report, "durationMs", counts.durationMs);
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

function parseJunitTextStatusLine(line: string): {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  durationMs?: number;
} | undefined {
  const match = /^(?:\[(?:INFO|WARNING|ERROR)\]\s*)?Tests run:\s*(\d+),\s*Failures:\s*(\d+),\s*Errors:\s*(\d+),\s*Skipped:\s*(\d+)(?:,\s*Time elapsed:\s*(\d+(?:\.\d+)?)\s*s)?(?:\s+<<<\s+(?:FAILURE|ERROR)!)?(?:\s+--\s+in\s+\S+)?$/.exec(line);
  if (!match) {
    return undefined;
  }
  const total = Number.parseInt(match[1] ?? "", 10);
  const failures = Number.parseInt(match[2] ?? "", 10);
  const errors = Number.parseInt(match[3] ?? "", 10);
  const skipped = Number.parseInt(match[4] ?? "", 10);
  if (![total, failures, errors, skipped].every((value) => Number.isInteger(value) && value >= 0)) {
    return undefined;
  }
  const failed = failures + errors;
  const passed = total - failed - skipped;
  if (passed < 0) {
    return undefined;
  }
  return {
    total,
    passed,
    failed,
    skipped,
    durationMs: match[5] === undefined ? undefined : parseSecondsDurationMs(match[5]),
  };
}

function parseDotnetStatusLine(line: string): {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  durationMs?: number;
} | undefined {
  const match = /^(Passed|Failed)!\s+-\s+Failed:\s*(\d+),\s*Passed:\s*(\d+),\s*Skipped:\s*(\d+),\s*Total:\s*(\d+)(?:,\s*Duration:\s*(.+))?$/i.exec(line);
  if (!match) {
    return undefined;
  }
  const status = (match[1] ?? "").toLowerCase();
  const failed = Number.parseInt(match[2] ?? "", 10);
  const passed = Number.parseInt(match[3] ?? "", 10);
  const skipped = Number.parseInt(match[4] ?? "", 10);
  const total = Number.parseInt(match[5] ?? "", 10);
  if (![failed, passed, skipped, total].every((value) => Number.isInteger(value) && value >= 0)) {
    return undefined;
  }
  if (passed + failed + skipped !== total) {
    return undefined;
  }
  if ((status === "passed" && failed > 0) || (status === "failed" && failed === 0)) {
    return undefined;
  }
  const durationMs = match[6] === undefined ? undefined : parseDotnetDurationMs(match[6]);
  if (match[6] !== undefined && durationMs === undefined) {
    return undefined;
  }

  return {
    total,
    passed,
    failed,
    skipped,
    durationMs,
  };
}

function looksLikeDotnetStatusLine(line: string): boolean {
  return /^(?:Passed|Failed)!/i.test(line);
}

function parseDotnetTestSummaryLine(line: string): {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  durationMs?: number;
} | undefined {
  const match = /^Test summary:\s+total:\s+(\d+),\s+failed:\s+(\d+),\s+succeeded:\s+(\d+),\s+skipped:\s+(\d+),\s+duration:\s+(.+)$/.exec(line);
  if (!match) {
    return undefined;
  }
  const total = Number.parseInt(match[1] ?? "", 10);
  const failed = Number.parseInt(match[2] ?? "", 10);
  const passed = Number.parseInt(match[3] ?? "", 10);
  const skipped = Number.parseInt(match[4] ?? "", 10);
  if (![failed, passed, skipped, total].every((value) => Number.isInteger(value) && value >= 0)) {
    return undefined;
  }
  if (total <= 0 || passed + failed + skipped !== total) {
    return undefined;
  }
  const durationMs = parseDotnetDurationMs(match[5] ?? "");
  if (durationMs === undefined) {
    return undefined;
  }
  return {
    total,
    passed,
    failed,
    skipped,
    durationMs,
  };
}

function looksLikeDotnetTestSummaryLine(line: string): boolean {
  return /^Test summary:/.test(line);
}

function parseDotnetDurationMs(text: string): number | undefined {
  let durationText = text.trim();
  const suffixIndex = durationText.search(/\s+-\s+\S/);
  if (suffixIndex >= 0) {
    const suffix = durationText.slice(suffixIndex).trim();
    if (!/^-\s+\S+\.dll(?:\s+\([^)]+\))?$/.test(suffix)) {
      return undefined;
    }
    durationText = durationText.slice(0, suffixIndex).trim();
  }
  if (!/^(?:\d+(?:\.\d+)?\s*(?:milliseconds?|msec|ms|minutes?|min|m|seconds?|sec|s|hours?|hr|h)(?:\s+|$))+$/.test(durationText)) {
    return undefined;
  }
  let total = 0;
  for (const match of durationText.matchAll(/(\d+(?:\.\d+)?)\s*(milliseconds?|msec|ms|minutes?|min|m|seconds?|sec|s|hours?|hr|h)/gi)) {
    const amount = Number.parseFloat(match[1] ?? "");
    const unit = (match[2] ?? "").toLowerCase();
    if (!Number.isFinite(amount) || amount < 0) {
      return undefined;
    }
    if (unit === "ms" || unit === "msec" || unit.startsWith("millisecond")) {
      total += amount;
    } else if (unit === "s" || unit === "sec" || unit.startsWith("second")) {
      total += amount * 1000;
    } else if (unit === "m" || unit === "min" || unit.startsWith("minute")) {
      total += amount * 60_000;
    } else {
      total += amount * 3_600_000;
    }
  }
  return Math.round(total * 1000) / 1000;
}

function parseCtestStatusLine(line: string): {
  total: number;
  passed: number;
  failed: number;
} | undefined {
  const match = /^(\d+)% tests? passed,\s*(\d+)\s+tests? failed out of\s+(\d+)$/.exec(line);
  if (!match) {
    return undefined;
  }
  const percent = Number.parseInt(match[1] ?? "", 10);
  const failed = Number.parseInt(match[2] ?? "", 10);
  const total = Number.parseInt(match[3] ?? "", 10);
  if (![percent, failed, total].every((value) => Number.isInteger(value) && value >= 0) || percent > 100) {
    return undefined;
  }
  const passed = total - failed;
  if (total <= 0 || passed < 0) {
    return undefined;
  }
  if (Math.round((passed / total) * 100) !== percent) {
    return undefined;
  }
  return {
    total,
    passed,
    failed,
  };
}

function parseCtestDurationLine(line: string): number | undefined {
  const match = /^Total Test time \(real\) =\s+(\d+(?:\.\d+)?)\s+sec$/.exec(line);
  if (!match) {
    return undefined;
  }
  return parseSecondsDurationMs(match[1] ?? "");
}

function parseMinitestStatusLine(line: string): {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
} | undefined {
  const match = /^(\d+)\s+runs,\s+(\d+)\s+assertions,\s+(\d+)\s+failures,\s+(\d+)\s+errors,\s+(\d+)\s+skips$/.exec(line);
  if (!match) {
    return undefined;
  }
  const total = Number.parseInt(match[1] ?? "", 10);
  const failures = Number.parseInt(match[3] ?? "", 10);
  const errors = Number.parseInt(match[4] ?? "", 10);
  const skipped = Number.parseInt(match[5] ?? "", 10);
  if (![total, failures, errors, skipped].every((value) => Number.isInteger(value) && value >= 0)) {
    return undefined;
  }
  const failed = failures + errors;
  const passed = total - failed - skipped;
  if (passed < 0) {
    return undefined;
  }
  return {
    total,
    passed,
    failed,
    skipped,
  };
}

function parseMinitestDurationLine(line: string): number | undefined {
  const match = /^Finished in\s+(\d+(?:\.\d+)?)s,\s+\d+(?:\.\d+)?\s+runs\/s,\s+\d+(?:\.\d+)?\s+assertions\/s\.$/.exec(line);
  if (!match) {
    return undefined;
  }
  return parseSecondsDurationMs(match[1] ?? "");
}

function parseKarmaStatusLine(line: string): {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
} | undefined {
  const match = /^TOTAL:\s+(.+)$/.exec(line);
  if (!match) {
    return undefined;
  }

  let passed = 0;
  let failed = 0;
  let skipped = 0;
  for (const segment of (match[1] ?? "").split(/,\s+/)) {
    const segmentMatch = /^(\d+)\s+(SUCCESS|FAILED|SKIPPED)$/.exec(segment);
    if (!segmentMatch) {
      return undefined;
    }
    const value = Number.parseInt(segmentMatch[1] ?? "", 10);
    if (!Number.isInteger(value) || value < 0) {
      return undefined;
    }
    const label = segmentMatch[2] ?? "";
    if (label === "SUCCESS") {
      passed += value;
    } else if (label === "FAILED") {
      failed += value;
    } else {
      skipped += value;
    }
  }
  return {
    total: passed + failed + skipped,
    passed,
    failed,
    skipped,
  };
}

function parseBunRanLine(line: string): {
  total: number;
  files?: number;
  durationMs?: number;
} | undefined {
  let match = /^Ran\s+(\d+)\s+tests?\s+in\s+(\d+(?:\.\d+)?)(ms|s)$/.exec(line);
  if (match) {
    const total = Number.parseInt(match[1] ?? "", 10);
    const durationMs = parseBunDurationMs(match[2] ?? "", match[3] ?? "");
    if (!Number.isInteger(total) || total < 0 || durationMs === undefined) {
      return undefined;
    }
    return {
      total,
      durationMs,
    };
  }

  match = /^Ran\s+(\d+)\s+tests?\s+across\s+(\d+)\s+files?\.(?:\s+(\d+)\s+total)?\s+\[(\d+(?:\.\d+)?)(ms|s)\]$/.exec(line);
  if (!match) {
    return undefined;
  }
  const total = Number.parseInt(match[1] ?? "", 10);
  const files = Number.parseInt(match[2] ?? "", 10);
  const optionalTotal = match[3] === undefined ? undefined : Number.parseInt(match[3], 10);
  const durationMs = parseBunDurationMs(match[4] ?? "", match[5] ?? "");
  if (
    ![total, files].every((value) => Number.isInteger(value) && value >= 0) ||
    (optionalTotal !== undefined && (!Number.isInteger(optionalTotal) || optionalTotal !== total)) ||
    durationMs === undefined
  ) {
    return undefined;
  }
  return {
    total,
    files,
    durationMs,
  };
}

function parseBunCountLine(line: string, label: "pass" | "fail"): number | undefined {
  const match = new RegExp(`^(\\d+)\\s+${label}$`).exec(line);
  if (!match) {
    return undefined;
  }
  const value = Number.parseInt(match[1] ?? "", 10);
  return Number.isInteger(value) && value >= 0 ? value : undefined;
}

function looksLikeMalformedBunCountLine(line: string): boolean {
  return /^\d+\s+(?:passes?|fails?|passed|failed)\b/.test(line) && parseBunCountLine(line, "pass") === undefined && parseBunCountLine(line, "fail") === undefined;
}

function parseBunDurationMs(valueText: string, unit: string): number | undefined {
  const value = Number.parseFloat(valueText);
  if (!Number.isFinite(value) || value < 0) {
    return undefined;
  }
  if (unit === "ms") {
    return Math.round(value * 1000) / 1000;
  }
  if (unit === "s") {
    return Math.round(value * 1000 * 1000) / 1000;
  }
  return undefined;
}

function parseXctestStatusLine(line: string): {
  total: number;
  passed: number;
  failed: number;
  durationMs: number;
} | undefined {
  const match = /^Executed\s+(\d+)\s+tests?,\s+with\s+(\d+)\s+failures?\s+\((\d+)\s+unexpected\)\s+in\s+(\d+(?:\.\d+)?)\s+\(\d+(?:\.\d+)?\)\s+seconds?$/.exec(line);
  if (!match) {
    return undefined;
  }
  const total = Number.parseInt(match[1] ?? "", 10);
  const failed = Number.parseInt(match[2] ?? "", 10);
  const unexpected = Number.parseInt(match[3] ?? "", 10);
  if (![total, failed, unexpected].every((value) => Number.isInteger(value) && value >= 0)) {
    return undefined;
  }
  const passed = total - failed;
  if (total <= 0 || passed < 0 || unexpected > failed) {
    return undefined;
  }
  const durationMs = parseSecondsDurationMs(match[4] ?? "");
  if (durationMs === undefined) {
    return undefined;
  }
  return {
    total,
    passed,
    failed,
    durationMs,
  };
}

function parsePhpunitOkLine(line: string): {
  total: number;
  passed: number;
  failed: number;
} | undefined {
  const match = /^OK\s+\((\d+)\s+tests?,\s+\d+\s+assertions?\)$/.exec(line);
  if (!match) {
    return undefined;
  }
  const total = Number.parseInt(match[1] ?? "", 10);
  if (!Number.isInteger(total) || total < 0) {
    return undefined;
  }
  return {
    total,
    passed: total,
    failed: 0,
  };
}

function parsePhpunitStatusLine(line: string): {
  total: number;
  passed: number;
  failed: number;
  skipped?: number;
  todo?: number;
} | undefined {
  const match = /^(Tests?):\s*(\d+),\s*(Assertions?):\s*\d+((?:,\s*(?:Errors?|Failures?|Skipped|Incomplete|Risky):\s*\d+)+)\.?$/.exec(line);
  if (!match) {
    return undefined;
  }
  const total = Number.parseInt(match[2] ?? "", 10);
  if (!Number.isInteger(total) || total < 0) {
    return undefined;
  }
  const counts: Partial<Record<"failed" | "skipped" | "todo", number>> = {};
  for (const rawPart of (match[4] ?? "").split(/\s*,\s*/)) {
    if (!rawPart) {
      continue;
    }
    const partMatch = /^(Errors?|Failures?|Skipped|Incomplete|Risky):\s*(\d+)$/.exec(rawPart.trim());
    if (!partMatch) {
      return undefined;
    }
    const value = Number.parseInt(partMatch[2] ?? "", 10);
    if (!Number.isInteger(value) || value < 0) {
      return undefined;
    }
    const label = partMatch[1] ?? "";
    if (label === "Skipped") {
      counts.skipped = (counts.skipped ?? 0) + value;
    } else if (label === "Incomplete") {
      counts.todo = (counts.todo ?? 0) + value;
    } else {
      counts.failed = (counts.failed ?? 0) + value;
    }
  }
  const failed = counts.failed ?? 0;
  const skipped = counts.skipped ?? 0;
  const todo = counts.todo ?? 0;
  const passed = total - failed - skipped - todo;
  if (passed < 0) {
    return undefined;
  }
  return {
    total,
    passed,
    failed,
    skipped: counts.skipped,
    todo: counts.todo,
  };
}

function parsePythonUnittestStatusLine(line: string, total: number): {
  passed: number;
  failed: number;
  skipped?: number;
  todo?: number;
} | undefined {
  const okMatch = /^OK(?:\s+\((.+)\))?$/.exec(line);
  const failedMatch = /^FAILED\s+\((.+)\)$/.exec(line);
  if (!okMatch && !failedMatch) {
    return undefined;
  }
  const counts = parsePythonUnittestDetailCounts((okMatch?.[1] ?? failedMatch?.[1] ?? "").trim());
  if (!counts) {
    return undefined;
  }
  if (okMatch && (counts.failed ?? 0) > 0) {
    return undefined;
  }
  if (failedMatch && (counts.failed ?? 0) === 0) {
    return undefined;
  }
  const failed = counts.failed ?? 0;
  const skipped = counts.skipped ?? 0;
  const todo = counts.todo ?? 0;
  const passed = total - failed - skipped - todo;
  if (passed < 0) {
    return undefined;
  }
  return {
    passed,
    failed,
    skipped: counts.skipped,
    todo: counts.todo,
  };
}

function parsePythonUnittestDetailCounts(
  details: string,
): Partial<Record<"failed" | "skipped" | "todo", number>> | undefined {
  const counts: Partial<Record<"failed" | "skipped" | "todo", number>> = {};
  if (!details) {
    return counts;
  }
  for (const rawPart of details.split(/\s*,\s*/)) {
    const match = /^(failures?|errors?|skipped|expected failures?|unexpected successes?)=(\d+)$/.exec(rawPart.trim());
    if (!match) {
      return undefined;
    }
    const value = Number.parseInt(match[2] ?? "", 10);
    if (!Number.isInteger(value) || value < 0) {
      return undefined;
    }
    const label = (match[1] ?? "").toLowerCase();
    if (label === "skipped") {
      counts.skipped = (counts.skipped ?? 0) + value;
    } else if (label.startsWith("expected failure")) {
      counts.todo = (counts.todo ?? 0) + value;
    } else {
      counts.failed = (counts.failed ?? 0) + value;
    }
  }
  return counts;
}

function parsePytestStatusLine(line: string): {
  counts: Partial<Record<"passed" | "failed" | "skipped" | "todo", number>>;
  durationMs?: number;
} | undefined {
  const durationMs = parsePytestDurationMs(line);
  if (durationMs === undefined) {
    return undefined;
  }
  const statusText = line.replace(/\s+in\s+\d+(?:\.\d+)?s$/i, "").trim();
  if (!statusText) {
    return undefined;
  }

  const counts: Partial<Record<"passed" | "failed" | "skipped" | "todo", number>> = {};
  let hasOutcome = false;
  for (const rawPart of statusText.split(/\s*,\s*/)) {
    const part = rawPart.trim();
    const match = /^(\d+)\s+(passed|failed|skipped|xfailed|xpassed|error|errors|warning|warnings|deselected|rerun|reruns)$/i.exec(part);
    if (!match) {
      return undefined;
    }
    const count = Number.parseInt(match[1] ?? "", 10);
    if (!Number.isInteger(count) || count < 0) {
      return undefined;
    }
    const label = (match[2] ?? "").toLowerCase();
    if (label === "passed") {
      counts.passed = (counts.passed ?? 0) + count;
      hasOutcome = true;
    } else if (label === "failed" || label === "error" || label === "errors") {
      counts.failed = (counts.failed ?? 0) + count;
      hasOutcome = true;
    } else if (label === "skipped") {
      counts.skipped = (counts.skipped ?? 0) + count;
      hasOutcome = true;
    } else if (label === "xfailed" || label === "xpassed") {
      counts.todo = (counts.todo ?? 0) + count;
      hasOutcome = true;
    }
  }
  return hasOutcome ? { counts, durationMs } : undefined;
}

function parsePytestDurationMs(text: string): number | undefined {
  const match = text.match(/\bin\s+(\d+(?:\.\d+)?)s$/i);
  if (!match) {
    return undefined;
  }
  return Math.round(Number.parseFloat(match[1] ?? "") * 1000 * 1000) / 1000;
}

function parseCargoStatusLine(line: string): {
  counts: Partial<Record<"passed" | "failed" | "skipped", number>>;
  durationMs?: number;
} | undefined {
  const counts: Partial<Record<"passed" | "failed" | "skipped", number>> = {};
  let durationMs: number | undefined;
  let hasOutcome = false;
  for (const rawPart of line.split(/\s*;\s*/)) {
    const part = rawPart.trim();
    if (!part) {
      return undefined;
    }

    const countMatch = /^(\d+)\s+(passed|failed|ignored|measured|filtered out)$/i.exec(part);
    if (countMatch) {
      const count = Number.parseInt(countMatch[1] ?? "", 10);
      if (!Number.isInteger(count) || count < 0) {
        return undefined;
      }
      const label = (countMatch[2] ?? "").toLowerCase();
      if (label === "passed") {
        counts.passed = (counts.passed ?? 0) + count;
        hasOutcome = true;
      } else if (label === "failed") {
        counts.failed = (counts.failed ?? 0) + count;
        hasOutcome = true;
      } else if (label === "ignored") {
        counts.skipped = (counts.skipped ?? 0) + count;
        hasOutcome = true;
      }
      continue;
    }

    const candidateDurationMs = parseCargoDurationMs(part);
    if (candidateDurationMs !== undefined) {
      if (durationMs !== undefined) {
        return undefined;
      }
      durationMs = candidateDurationMs;
      continue;
    }

    return undefined;
  }
  return hasOutcome ? { counts, durationMs } : undefined;
}

function parseCargoDurationMs(text: string): number | undefined {
  const match = text.match(/^finished in\s+(\d+(?:\.\d+)?)s$/i);
  if (!match) {
    return undefined;
  }
  return parseSecondsDurationMs(match[1] ?? "");
}

function parseDenoStatusLine(line: string): {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
} | undefined {
  const match = /^test result:\s+(ok|FAILED)\.\s+(\d+)\s+passed;\s+(\d+)\s+failed;\s+(\d+)\s+ignored;\s+\d+\s+measured;\s+\d+\s+filtered out\s+\((\d+(?:\.\d+)?)(ms|s)\)$/.exec(line);
  if (!match) {
    return undefined;
  }
  const status = match[1] ?? "";
  const passed = Number.parseInt(match[2] ?? "", 10);
  const failed = Number.parseInt(match[3] ?? "", 10);
  const skipped = Number.parseInt(match[4] ?? "", 10);
  const durationMs = parseMillisecondsOrSecondsDurationMs(match[5] ?? "", match[6] ?? "");
  if (![passed, failed, skipped].every((value) => Number.isInteger(value) && value >= 0) || durationMs === undefined) {
    return undefined;
  }
  if ((status === "ok" && failed > 0) || (status === "FAILED" && failed === 0)) {
    return undefined;
  }
  return {
    total: passed + failed + skipped,
    passed,
    failed,
    skipped,
    durationMs,
  };
}

function looksLikeDenoStatusLine(line: string): boolean {
  return /^test result:\s+(?:ok|FAILED)\.\s+\d+\s+passed;\s+\d+\s+failed;\s+\d+\s+ignored;\s+\d+\s+measured;\s+\d+\s+filtered out(?:$|\s+)/.test(line);
}

function parseExunitStatusLine(line: string): {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
} | undefined {
  const match = /^(?:(\d+)\s+doctests?,\s+)?(\d+)\s+tests?,\s+(\d+)\s+failures?(?:,\s+(\d+)\s+skipped)?$/.exec(line);
  if (!match) {
    return undefined;
  }
  const doctests = match[1] === undefined ? 0 : Number.parseInt(match[1], 10);
  const tests = Number.parseInt(match[2] ?? "", 10);
  const failed = Number.parseInt(match[3] ?? "", 10);
  const skipped = match[4] === undefined ? 0 : Number.parseInt(match[4], 10);
  if (![doctests, tests, failed, skipped].every((value) => Number.isInteger(value) && value >= 0)) {
    return undefined;
  }
  const total = doctests + tests;
  const passed = total - failed - skipped;
  if (total <= 0 || passed < 0) {
    return undefined;
  }
  return {
    total,
    passed,
    failed,
    skipped,
  };
}

function parseExunitDurationLine(line: string): number | undefined {
  const match = /^Finished in\s+(\d+(?:\.\d+)?)\s+seconds?(?:\s+\(\d+(?:\.\d+)?s async,\s+\d+(?:\.\d+)?s sync\))?$/.exec(line);
  if (!match) {
    return undefined;
  }
  return parseSecondsDurationMs(match[1] ?? "");
}

function looksLikeExunitStatusLine(line: string): boolean {
  return /^(?:\d+\s+doctests?,\s+)?\d+\s+tests?,\s+\d+\s+failures?(?:,|$|\s+)/.test(line);
}

function parseGradleStatusLine(line: string): {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
} | undefined {
  const match = /^(\d+)\s+tests?\s+completed,\s+(\d+)\s+failed(?:,\s+(\d+)\s+skipped)?$/.exec(line);
  if (!match) {
    return undefined;
  }
  const total = Number.parseInt(match[1] ?? "", 10);
  const failed = Number.parseInt(match[2] ?? "", 10);
  const skipped = match[3] === undefined ? 0 : Number.parseInt(match[3], 10);
  if (![total, failed, skipped].every((value) => Number.isInteger(value) && value >= 0)) {
    return undefined;
  }
  const passed = total - failed - skipped;
  if (total <= 0 || passed < 0) {
    return undefined;
  }
  return {
    total,
    passed,
    failed,
    skipped,
  };
}

function looksLikeGradleStatusLine(line: string): boolean {
  return /^\d+\s+tests?\s+completed,\s+\d+\s+failed(?:,|$|\s+)/.test(line);
}

function parseJunitPlatformStatusLine(line: string): {
  label: "found" | "skipped" | "aborted" | "started" | "successful" | "failed";
  count: number;
} | undefined {
  const match = /^\[\s*(\d+)\s+tests?\s+(found|skipped|aborted|started|successful|failed)\s*\]$/.exec(line);
  if (!match) {
    return undefined;
  }
  const count = Number.parseInt(match[1] ?? "", 10);
  if (!Number.isInteger(count) || count < 0) {
    return undefined;
  }
  return {
    count,
    label: (match[2] ?? "") as "found" | "skipped" | "aborted" | "started" | "successful" | "failed",
  };
}

function parseJunitPlatformDurationLine(line: string): number | undefined {
  const match = /^Test run finished after\s+(\d+(?:\.\d+)?)\s*(ms|s)$/.exec(line);
  if (!match) {
    return undefined;
  }
  return parseMillisecondsOrSecondsDurationMs(match[1] ?? "", match[2] ?? "");
}

function looksLikeJunitPlatformDurationLine(line: string): boolean {
  return /^Test run finished after(?:$|\s+)/.test(line);
}

function looksLikeJunitPlatformStatusLine(line: string): boolean {
  return /^\[\s*\d+\s+tests?\s+(?:found|skipped|aborted|started|successful|failed)(?:\s*\]?|$|\s+)/.test(line);
}

function parseTestngStatusLine(line: string): {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
} | undefined {
  const match = /^Total tests run:\s+(\d+)(?:,\s+Passes:\s+(\d+))?,\s+Failures:\s+(\d+),\s+Skips:\s+(\d+)$/.exec(line);
  if (!match) {
    return undefined;
  }
  const total = Number.parseInt(match[1] ?? "", 10);
  const passed = parseOptionalNonnegativeInteger(match[2]);
  const failed = Number.parseInt(match[3] ?? "", 10);
  const skipped = Number.parseInt(match[4] ?? "", 10);
  if (
    !Number.isInteger(total) ||
    total <= 0 ||
    passed === undefined ||
    !Number.isInteger(failed) ||
    failed < 0 ||
    !Number.isInteger(skipped) ||
    skipped < 0
  ) {
    return undefined;
  }
  const passedCount = passed ?? total - failed - skipped;
  if (passedCount < 0 || passedCount + failed + skipped !== total) {
    return undefined;
  }
  return {
    total,
    passed: passedCount,
    failed,
    skipped,
  };
}

function looksLikeTestngStatusLine(line: string): boolean {
  return /^Total tests run:/.test(line);
}

function parseNunitTestCountLine(line: string): {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
} | undefined {
  const match =
    /^Test Count:\s+(\d+),\s+Passed:\s+(\d+),\s+Failed:\s+(\d+),\s+Warnings:\s+(\d+),\s+Inconclusive:\s+(\d+),\s+Skipped:\s+(\d+)$/.exec(
      line,
    );
  if (!match) {
    return undefined;
  }
  const total = Number.parseInt(match[1] ?? "", 10);
  const passed = Number.parseInt(match[2] ?? "", 10);
  const failed = Number.parseInt(match[3] ?? "", 10);
  const warnings = Number.parseInt(match[4] ?? "", 10);
  const inconclusive = Number.parseInt(match[5] ?? "", 10);
  const skipped = Number.parseInt(match[6] ?? "", 10);
  const values = [total, passed, failed, warnings, inconclusive, skipped];
  if (!values.every((value) => Number.isInteger(value) && value >= 0) || total <= 0) {
    return undefined;
  }
  if (passed + failed + warnings + inconclusive + skipped !== total) {
    return undefined;
  }
  return {
    total,
    passed: passed + warnings,
    failed,
    skipped: inconclusive + skipped,
  };
}

function looksLikeNunitTestCountLine(line: string): boolean {
  return /^Test Count:/.test(line);
}

function parseCucumberScenarioStatusLine(line: string): {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
} | undefined {
  const match = /^(\d+)\s+scenarios?\s+\(([^)]+)\)$/.exec(line);
  if (!match) {
    return undefined;
  }
  const total = Number.parseInt(match[1] ?? "", 10);
  if (!Number.isInteger(total) || total <= 0) {
    return undefined;
  }
  const counts: Partial<Record<"passed" | "failed" | "skipped", number>> = {};
  for (const part of (match[2] ?? "").split(",")) {
    const partMatch = /^\s*(\d+)\s+(passed|failed|skipped|pending|undefined|ambiguous|unused)\s*$/.exec(part);
    if (!partMatch) {
      return undefined;
    }
    const count = Number.parseInt(partMatch[1] ?? "", 10);
    if (!Number.isInteger(count) || count < 0) {
      return undefined;
    }
    const label = partMatch[2] ?? "";
    const key = label === "passed" || label === "failed" ? label : "skipped";
    counts[key] = (counts[key] ?? 0) + count;
  }
  const passed = counts.passed ?? 0;
  const failed = counts.failed ?? 0;
  const skipped = counts.skipped ?? 0;
  if (passed + failed + skipped !== total) {
    return undefined;
  }
  return {
    total,
    passed,
    failed,
    skipped,
  };
}

function looksLikeCucumberScenarioStatusLine(line: string): boolean {
  return /^\d+\s+scenarios?\b/.test(line);
}

function parseTestthatStatusLine(line: string): {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
} | undefined {
  const match = /^\[\s*FAIL\s+(\d+)\s*\|\s*WARN\s+(\d+)\s*\|\s*SKIP\s+(\d+)\s*\|\s*PASS\s+(\d+)\s*\]$/.exec(line);
  if (!match) {
    return undefined;
  }
  const failed = Number.parseInt(match[1] ?? "", 10);
  const warnings = Number.parseInt(match[2] ?? "", 10);
  const skipped = Number.parseInt(match[3] ?? "", 10);
  const passed = Number.parseInt(match[4] ?? "", 10);
  if (![failed, warnings, skipped, passed].every((count) => Number.isInteger(count) && count >= 0)) {
    return undefined;
  }
  return {
    total: failed + skipped + passed,
    passed,
    failed,
    skipped,
  };
}

function looksLikeTestthatStatusLine(line: string): boolean {
  return /^\[\s*(?=[^\]]*\|)(?=[^\]]*\b(?:FAIL|WARN|SKIP|PASS)\b)/.test(line);
}

function parseGtestTotalLine(line: string): {
  total: number;
  durationMs: number;
} | undefined {
  const match = /^\[=+\]\s+(\d+)\s+tests?\s+from\s+\d+\s+test\s+suites?\s+ran\.\s+\((\d+(?:\.\d+)?)\s*(ms|s)\s+total\)$/.exec(line);
  if (!match) {
    return undefined;
  }
  const total = Number.parseInt(match[1] ?? "", 10);
  const duration = Number.parseFloat(match[2] ?? "");
  const unit = match[3] ?? "";
  if (!Number.isInteger(total) || total <= 0 || !Number.isFinite(duration) || duration < 0) {
    return undefined;
  }
  return {
    total,
    durationMs: unit === "s" ? duration * 1000 : duration,
  };
}

function looksLikeGtestTotalLine(line: string): boolean {
  return /^\[=+\]\s+\d+\s+tests?\b.*\bran\b/.test(line);
}

function parseGtestStatusLine(line: string): {
  label: "passed" | "failed" | "skipped";
  count: number;
} | undefined {
  const match = /^\[\s*(PASSED|FAILED|SKIPPED)\s*\]\s+(\d+)\s+tests?(?:\.|,\s+listed below:)$/.exec(line);
  if (!match) {
    return undefined;
  }
  const count = Number.parseInt(match[2] ?? "", 10);
  if (!Number.isInteger(count) || count < 0) {
    return undefined;
  }
  const label = (match[1] ?? "").toLowerCase();
  if (label !== "passed" && label !== "failed" && label !== "skipped") {
    return undefined;
  }
  return {
    label,
    count,
  };
}

function looksLikeGtestStatusLine(line: string): boolean {
  return /^\[\s*[A-Z]+\s*\]\s+\d+\s+tests?\b/.test(line);
}

function parseCatch2AllPassedLine(line: string): {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
} | undefined {
  const match = /^All tests passed \(\d+ assertions? in (\d+) test cases?\)$/.exec(line);
  if (!match) {
    return undefined;
  }
  const total = Number.parseInt(match[1] ?? "", 10);
  if (!Number.isInteger(total) || total <= 0) {
    return undefined;
  }
  return {
    total,
    passed: total,
    failed: 0,
    skipped: 0,
  };
}

function looksLikeCatch2AllPassedLine(line: string): boolean {
  return /^All tests passed\b/.test(line);
}

function parseCatch2TestCasesLine(line: string): {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
} | undefined {
  const match = /^test cases:\s+(\d+)(?:\s+\|\s+(\d+)\s+passed)?(?:\s+\|\s+(\d+)\s+failed)?(?:\s+\|\s+(\d+)\s+skipped)?$/.exec(line);
  if (!match) {
    return undefined;
  }
  const total = Number.parseInt(match[1] ?? "", 10);
  const passed = parseOptionalNonnegativeInteger(match[2]);
  const failed = parseOptionalNonnegativeInteger(match[3]);
  const skipped = parseOptionalNonnegativeInteger(match[4]);
  if (!Number.isInteger(total) || total <= 0 || passed === undefined || failed === undefined || skipped === undefined) {
    return undefined;
  }
  const passedCount = passed ?? 0;
  const failedCount = failed ?? 0;
  const skippedCount = skipped ?? 0;
  if (passedCount + failedCount + skippedCount !== total) {
    return undefined;
  }
  return {
    total,
    passed: passedCount,
    failed: failedCount,
    skipped: skippedCount,
  };
}

function looksLikeCatch2TestCasesLine(line: string): boolean {
  return /^test cases:\s+\d+\b/.test(line);
}

function parseOptionalNonnegativeInteger(value: string | undefined): number | null | undefined {
  if (value === undefined) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function parseSecondsDurationMs(seconds: string): number | undefined {
  const value = Number.parseFloat(seconds);
  if (!Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return Math.round(value * 1000 * 1000) / 1000;
}

function parseMillisecondsOrSecondsDurationMs(valueText: string, unit: string): number | undefined {
  const value = Number.parseFloat(valueText);
  if (!Number.isFinite(value) || value < 0) {
    return undefined;
  }
  if (unit === "ms") {
    return Math.round(value * 1000) / 1000;
  }
  if (unit === "s") {
    return Math.round(value * 1000 * 1000) / 1000;
  }
  return undefined;
}

function parseRspecStatusLine(line: string): {
  total: number;
  passed: number;
  failed: number;
  skipped?: number;
} | undefined {
  const match = /^(\d+)\s+examples?,\s+(\d+)\s+failures?(?:,\s+(\d+)\s+pending)?$/.exec(line);
  if (!match) {
    return undefined;
  }
  const total = Number.parseInt(match[1] ?? "", 10);
  const failed = Number.parseInt(match[2] ?? "", 10);
  const skipped = match[3] === undefined ? undefined : Number.parseInt(match[3], 10);
  if (!Number.isInteger(total) || !Number.isInteger(failed) || (skipped !== undefined && !Number.isInteger(skipped))) {
    return undefined;
  }
  const passed = total - failed - (skipped ?? 0);
  if (passed < 0) {
    return undefined;
  }
  return {
    total,
    passed,
    failed,
    skipped,
  };
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
