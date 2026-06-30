import { createHash } from "node:crypto";
import { existsSync, lstatSync, realpathSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { redactSecrets } from "../mcp/audit.js";
import { runProcess, type RunProcessOptions, type RunProcessResult } from "../tools/process.js";
import type { TextTruncation } from "../tools/types.js";

export const DIAGNOSTICS_USAGE =
  "Usage: orx diagnostics [list|inspect <profile>|run typescript [--project <local-tsconfig-path>] [--json]]";
export const DIAG_USAGE =
  "Usage: orx diag [list|inspect <profile>|run typescript [--project <local-tsconfig-path>] [--json]]";
export const SLASH_DIAGNOSTICS_USAGE =
  "Usage: /diagnostics [list|inspect <profile>|run typescript [--project <local-tsconfig-path>] [--json]]";
export const SLASH_DIAG_USAGE =
  "Usage: /diag [list|inspect <profile>|run typescript [--project <local-tsconfig-path>] [--json]]";

export type DiagnosticProfileId =
  | "typescript"
  | "typescript-language-server"
  | "pyright"
  | "rust-analyzer"
  | "gopls"
  | "clangd"
  | "scip-typescript";

export interface DiagnosticProfile {
  id: DiagnosticProfileId;
  label: string;
  state: "runnable" | "catalog_only";
  binary: string;
  summary: string;
  runSupport: string;
  networkBoundary: string;
}

export interface TypeScriptDiagnosticsArgs {
  profile: DiagnosticProfileId;
  projectPath: string;
  json: boolean;
}

export type DiagnosticRunParseResult =
  | { ok: true; args: TypeScriptDiagnosticsArgs }
  | { ok: false; message: string };

export type DiagnosticRunStatus =
  | "ok"
  | "failed"
  | "timed_out"
  | "tool_missing"
  | "invalid_arguments"
  | "process_error";

export interface ParsedTypeScriptDiagnostic {
  file: string;
  line: number;
  column: number;
  severity: "error" | "warning" | "message";
  code: string;
  message: string;
}

export type DiagnosticsProcessRunner = (options: RunProcessOptions) => Promise<RunProcessResult>;

export interface RunTypeScriptDiagnosticsOptions extends TypeScriptDiagnosticsArgs {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  runner?: DiagnosticsProcessRunner;
  timeoutMs?: number;
  maxBytes?: number;
}

export interface TypeScriptDiagnosticsResult {
  ok: boolean;
  status: DiagnosticRunStatus;
  profile: "typescript";
  root: string;
  projectPath: string;
  json: boolean;
  command?: string;
  commandSource?: "local_node_modules" | "path";
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
  diagnostics: ParsedTypeScriptDiagnostic[];
  message?: string;
}

interface ResolvedDiagnosticPath {
  arg: string;
  displayPath: string;
}

interface ResolvedTscCommand {
  ok: true;
  command: string;
  source: "local_node_modules" | "path";
  displayCommand: string;
}

const DIAGNOSTIC_PROFILES: DiagnosticProfile[] = [
  {
    id: "typescript",
    label: "TypeScript",
    state: "runnable",
    binary: "tsc",
    summary: "Local TypeScript compiler diagnostics using an already-installed tsc binary.",
    runSupport: "runnable only through `run typescript [--project <local-tsconfig-path>] [--json]`",
    networkBoundary: "no installs, package-manager calls, MCP calls, network calls, or model exposure",
  },
  {
    id: "typescript-language-server",
    label: "TypeScript Language Server",
    state: "catalog_only",
    binary: "typescript-language-server",
    summary: "Catalog/readiness placeholder for future LSP diagnostics/references integration.",
    runSupport: "not runnable in this slice",
    networkBoundary: "no runnable no-network/no-auth/no-write command shape is enabled yet",
  },
  {
    id: "pyright",
    label: "Pyright",
    state: "catalog_only",
    binary: "pyright",
    summary: "Catalog/readiness placeholder for future Python diagnostics integration.",
    runSupport: "not runnable in this slice",
    networkBoundary: "no runnable no-network/no-auth/no-write command shape is enabled yet",
  },
  {
    id: "rust-analyzer",
    label: "rust-analyzer",
    state: "catalog_only",
    binary: "rust-analyzer",
    summary: "Catalog/readiness placeholder for future Rust diagnostics integration.",
    runSupport: "not runnable in this slice",
    networkBoundary: "no runnable no-network/no-auth/no-write command shape is enabled yet",
  },
  {
    id: "gopls",
    label: "gopls",
    state: "catalog_only",
    binary: "gopls",
    summary: "Catalog/readiness placeholder for future Go diagnostics integration.",
    runSupport: "not runnable in this slice",
    networkBoundary: "no runnable no-network/no-auth/no-write command shape is enabled yet",
  },
  {
    id: "clangd",
    label: "clangd",
    state: "catalog_only",
    binary: "clangd",
    summary: "Catalog/readiness placeholder for future C/C++ diagnostics integration.",
    runSupport: "not runnable in this slice",
    networkBoundary: "no runnable no-network/no-auth/no-write command shape is enabled yet",
  },
  {
    id: "scip-typescript",
    label: "SCIP TypeScript",
    state: "catalog_only",
    binary: "scip-typescript",
    summary: "Catalog/readiness placeholder for future SCIP index-backed code intelligence.",
    runSupport: "not runnable in this slice",
    networkBoundary: "no runnable no-network/no-auth/no-write command shape is enabled yet",
  },
];

const PROFILE_IDS = new Set<DiagnosticProfileId>(DIAGNOSTIC_PROFILES.map((profile) => profile.id));
const DEFAULT_TYPESCRIPT_TIMEOUT_MS = 120_000;
const DEFAULT_DIAGNOSTIC_OUTPUT_BYTES = 128 * 1024;
const TSC_DISCOVERY_TIMEOUT_MS = 5_000;
const TSC_DISCOVERY_BYTES = 8 * 1024;
const MAX_DIAGNOSTIC_PATH_LENGTH = 4096;
const MAX_DIAGNOSTIC_PROFILE_LENGTH = 120;
const CONTROL_CHAR_PATTERN = /[\x00-\x1F\x7F]/;
const OUTPUT_CONTROL_CHAR_PATTERN = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;
const ANSI_PATTERN = /\x1B\[[0-?]*[ -/]*[@-~]/g;
const OSC_PATTERN = /\x1B\][^\x07]*(?:\x07|\x1B\\)/g;
const SECRET_LIKE_PATTERN =
  /\b(?:bearer\s+[A-Za-z0-9._~+/=-]{8,}|authorization:\s*bearer\s+[A-Za-z0-9._~+/=-]{8,}|(?:access[_-]?token|api[_-]?key|token|key|secret|password|passwd|auth)\s*[=:]\s*[A-Za-z0-9._~+/=-]{4,}|sk-or-v1-[A-Za-z0-9_-]+|github_pat_[A-Za-z0-9_]+|ghp_[A-Za-z0-9_]+|glpat-[A-Za-z0-9_-]+|xox[baprs]-[A-Za-z0-9-]+)\b/i;

const EMPTY_TRUNCATION: TextTruncation = {
  truncated: false,
  originalBytes: 0,
  returnedBytes: 0,
  originalLines: 0,
  returnedLines: 0,
  omittedBytes: 0,
  omittedLines: 0,
};

export function listDiagnosticProfiles(): DiagnosticProfile[] {
  return [...DIAGNOSTIC_PROFILES];
}

export function findDiagnosticProfile(profileId: string): DiagnosticProfile | undefined {
  const normalized = normalizeProfileId(profileId);
  return DIAGNOSTIC_PROFILES.find((profile) => profile.id === normalized);
}

export function renderDiagnosticProfiles(profiles = listDiagnosticProfiles()): string {
  const lines = [
    "Local diagnostics profiles",
    "  execution: explicit_operator_only",
    "  network: none_for_list_or_inspect",
    "  model_tool: not_exposed",
    "  profiles:",
  ];
  for (const profile of profiles) {
    lines.push(
      [
        `    - id=${profile.id}`,
        `state=${profile.state}`,
        `binary=${profile.binary}`,
        `run=${JSON.stringify(profile.runSupport)}`,
      ].join(" "),
    );
  }
  return lines.join("\n");
}

export function renderDiagnosticProfileInspect(profile: DiagnosticProfile): string {
  const lines = [
    `Local diagnostics profile: ${profile.id}`,
    `  label: ${profile.label}`,
    `  state: ${profile.state}`,
    `  binary: ${profile.binary}`,
    `  summary: ${profile.summary}`,
    `  run_support: ${profile.runSupport}`,
    `  install_behavior: not_managed_by_orx`,
    `  network_boundary: ${profile.networkBoundary}`,
    "  execution: explicit_operator_only",
    "  model_tool: not_exposed",
  ];

  if (profile.id === "typescript") {
    lines.push(
      "  default_project: tsconfig.json under cwd",
      "  command_shape: tsc --noEmit --pretty false --project <tsconfig>",
      "  binary_preference: cwd/node_modules/.bin/tsc before PATH tsc",
      "  project_guard: local regular file under cwd; symlink realpath must remain under cwd",
      "  rejected_projects: URLs, registry/package-like values, dash-prefixed values, symlink escapes, secrets, and control characters",
      "  output: bounded and redacted; --json emits ORX-owned structured JSON",
      "  run: orx diagnostics run typescript [--project <local-tsconfig-path>] [--json]",
    );
  }

  return lines.join("\n");
}

export function renderMissingDiagnosticProfile(profileId: string): string {
  return `Unknown diagnostics profile: ${sanitizeInline(profileId)}. Available profiles: ${DIAGNOSTIC_PROFILES.map((profile) => profile.id).join(", ")}.`;
}

export function renderDiagnosticInspectUsage(usage: string): string {
  return usage.replace(
    "[list|inspect <profile>|run typescript [--project <local-tsconfig-path>] [--json]]",
    "inspect <profile>",
  );
}

export function parseDiagnosticRunArgs(
  args: string[],
  usage = DIAGNOSTICS_USAGE,
): DiagnosticRunParseResult {
  const positional: string[] = [];
  let projectPath = "tsconfig.json";
  let json = false;

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
    if (arg === "--project" || arg === "-p") {
      const value = args[index + 1];
      if (value === undefined) {
        return { ok: false, message: `${usage}\nMissing value for ${arg}.` };
      }
      projectPath = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--project=")) {
      projectPath = arg.slice("--project=".length);
      continue;
    }
    if (arg.startsWith("-")) {
      return { ok: false, message: `${usage}\nUnknown diagnostics option: ${sanitizeInline(arg)}` };
    }
    positional.push(arg);
  }

  if (positional.length !== 1) {
    return { ok: false, message: usage };
  }
  const profile = normalizeProfileId(positional[0] ?? "");
  const profileError = validateDiagnosticValue("profile", profile, MAX_DIAGNOSTIC_PROFILE_LENGTH);
  if (profileError) {
    return { ok: false, message: `${usage}\n${profileError}` };
  }
  if (!PROFILE_IDS.has(profile)) {
    return { ok: false, message: renderMissingDiagnosticProfile(profile) };
  }
  if (profile !== "typescript") {
    return {
      ok: false,
      message: `Diagnostics profile ${profile} is catalog/readiness-only in this slice; no run path is enabled.`,
    };
  }
  const projectError = validateProjectPathValue(projectPath);
  if (projectError) {
    return { ok: false, message: `${usage}\n${projectError}` };
  }

  return {
    ok: true,
    args: {
      profile,
      projectPath,
      json,
    },
  };
}

export function parseDiagnosticRunArgText(
  argText: string,
  usage = DIAGNOSTICS_USAGE,
): DiagnosticRunParseResult {
  const tokens = splitDiagnosticArgText(argText);
  if (typeof tokens === "string") {
    return { ok: false, message: `${usage}\n${tokens}` };
  }
  return parseDiagnosticRunArgs(tokens, usage);
}

export async function runTypeScriptDiagnostics(
  options: RunTypeScriptDiagnosticsOptions,
): Promise<TypeScriptDiagnosticsResult> {
  const root = resolve(options.cwd ?? process.cwd());
  const env = createDiagnosticsEnv(options.env ?? process.env);
  const maxBytes = options.maxBytes ?? DEFAULT_DIAGNOSTIC_OUTPUT_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TYPESCRIPT_TIMEOUT_MS;
  const runner = options.runner ?? runProcess;
  const emptyText = emptyDiagnosticText();

  if (options.profile !== "typescript") {
    return invalidTypeScriptRun(options, root, "Only the typescript diagnostics profile is runnable in this slice.");
  }

  const project = resolveProjectPath(root, options.projectPath);
  if (!project.ok) {
    return invalidTypeScriptRun(options, root, project.message);
  }

  const command = await resolveTscCommand(root, env, runner);
  if (!command.ok) {
    return {
      ok: false,
      status: "tool_missing",
      profile: "typescript",
      root,
      projectPath: project.displayPath,
      json: options.json,
      args: [],
      timedOut: false,
      stdout: "",
      stderr: "",
      stdoutTruncation: emptyText.truncation,
      stderrTruncation: emptyText.truncation,
      diagnostics: [],
      message: command.message,
    };
  }

  const spawnArgs = ["--noEmit", "--pretty", "false", "--project", project.arg];
  const result = await runner({
    command: command.command,
    args: spawnArgs,
    cwd: root,
    env,
    inheritEnv: false,
    shell: false,
    timeoutMs,
    maxBytes,
  });
  const stdout = sanitizeProcessOutput(result.stdout);
  const stderr = sanitizeProcessOutput(result.stderr);
  const status = classifyTypeScriptRun(result);
  const diagnostics = parseTypeScriptDiagnostics(`${stdout}\n${stderr}`);

  return {
    ok: status === "ok",
    status,
    profile: "typescript",
    root,
    projectPath: project.displayPath,
    json: options.json,
    command: command.displayCommand,
    commandSource: command.source,
    args: spawnArgs,
    commandLine: formatCommandLine(command.displayCommand, spawnArgs),
    exitCode: result.exitCode,
    signal: result.signal,
    timedOut: result.timedOut,
    durationMs: result.durationMs,
    stdout,
    stderr,
    stdoutTruncation: result.stdoutTruncation,
    stderrTruncation: result.stderrTruncation,
    diagnostics,
    message: result.error ? sanitizeInline(result.error.message) : undefined,
  };
}

export function renderTypeScriptDiagnosticsResult(
  result: TypeScriptDiagnosticsResult,
  usage = DIAGNOSTICS_USAGE,
): string {
  const lines = [
    "Local diagnostics run",
    `  profile: ${result.profile}`,
    `  status: ${result.status}`,
    `  root: ${sanitizeInline(result.root)}`,
    `  project: ${sanitizeInline(result.projectPath)}`,
    "  execution: shell_disabled",
    "  env: minimal_no_orx_openrouter_brave_api_token_values",
    "  network: none_by_command_selection",
    "  model_tool: not_exposed",
  ];
  if (result.commandSource) {
    lines.push(`  binary_source: ${result.commandSource}`);
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
  if (result.status === "tool_missing") {
    lines.push(`  setup: ${typescriptMissingMessage()}`);
  }
  if (result.message && result.status !== "tool_missing") {
    lines.push(`  message: ${sanitizeInline(result.message)}`);
  }
  lines.push(`  parsed_diagnostics: ${result.diagnostics.length}`);
  for (const diagnostic of result.diagnostics.slice(0, 20)) {
    lines.push(
      `    - ${sanitizeInline(diagnostic.file)}:${diagnostic.line}:${diagnostic.column} ${diagnostic.severity} ${diagnostic.code} ${sanitizeInline(diagnostic.message)}`,
    );
  }
  if (result.diagnostics.length > 20) {
    lines.push(`    - ${result.diagnostics.length - 20} more diagnostics omitted from summary`);
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

export function renderTypeScriptDiagnosticsJson(result: TypeScriptDiagnosticsResult): string {
  return JSON.stringify({
    schema_version: 1,
    surface: "orx.local_diagnostics",
    operator_only: true,
    model_tool: "not_exposed",
    network: "none_by_command_selection",
    status: result.status,
    ok: result.ok,
    profile: result.profile,
    root: sanitizeInline(result.root),
    project: sanitizeInline(result.projectPath),
    command: result.command
      ? {
          binary: sanitizeInline(result.command),
          binary_source: result.commandSource,
          args: result.args.map((arg) => sanitizeInline(arg)),
          shell: false,
          command_line: result.commandLine ? sanitizeInline(result.commandLine) : undefined,
        }
      : undefined,
    process: {
      exit_code: result.exitCode,
      signal: result.signal,
      timed_out: result.timedOut,
      duration_ms: result.durationMs,
    },
    diagnostics: result.diagnostics,
    raw_output: {
      stdout: outputMetadata(result.stdout, result.stdoutTruncation),
      stderr: outputMetadata(result.stderr, result.stderrTruncation),
    },
    message: result.message ? sanitizeInline(result.message) : undefined,
  }, null, 2);
}

function resolveProjectPath(
  cwd: string,
  value: string,
): ({ ok: true } & ResolvedDiagnosticPath) | { ok: false; message: string } {
  const validation = validateProjectPathValue(value);
  if (validation) {
    return { ok: false, message: validation };
  }

  const root = safeRealpath(cwd) ?? cwd;
  const resolved = resolve(cwd, value);
  if (!isPathInside(cwd, resolved)) {
    return { ok: false, message: "project must stay inside the current working directory." };
  }
  if (!existsSync(resolved)) {
    return { ok: false, message: "project file does not exist inside the current working directory." };
  }

  const realResolved = safeRealpath(resolved);
  if (!realResolved) {
    return { ok: false, message: "project symlink could not be resolved." };
  }
  if (!isPathInside(root, realResolved)) {
    return { ok: false, message: "project resolves outside the current working directory." };
  }
  if (!safeIsFile(realResolved)) {
    return { ok: false, message: "project must be a regular local file." };
  }

  const relativePath = relative(cwd, resolved).split(/[\\/]/g).join("/") || ".";
  if (isFlagLikeValue(relativePath)) {
    return { ok: false, message: "project must not resolve to a dash-prefixed operand." };
  }
  try {
    const stat = lstatSync(resolved);
    if (stat.isSymbolicLink() && !realResolved) {
      return { ok: false, message: "project symlink could not be resolved." };
    }
  } catch {
    return { ok: false, message: "project could not be inspected." };
  }

  return { ok: true, arg: relativePath, displayPath: relativePath };
}

async function resolveTscCommand(
  cwd: string,
  env: NodeJS.ProcessEnv,
  runner: DiagnosticsProcessRunner,
): Promise<ResolvedTscCommand | { ok: false; message: string }> {
  const local = resolveLocalTscCommand(cwd);
  if (local.ok) {
    return local;
  }
  if (local.message) {
    return { ok: false, message: local.message };
  }

  const pathResult = await runner({
    command: "tsc",
    args: ["--version"],
    cwd,
    env,
    inheritEnv: false,
    shell: false,
    timeoutMs: TSC_DISCOVERY_TIMEOUT_MS,
    maxBytes: TSC_DISCOVERY_BYTES,
  });
  if (pathResult.exitCode === 0) {
    return { ok: true, command: "tsc", displayCommand: "tsc", source: "path" };
  }
  if (pathResult.error && isCommandMissingError(pathResult.error)) {
    return { ok: false, message: typescriptMissingMessage() };
  }
  return {
    ok: false,
    message: `tsc was found but did not respond to --version successfully. ${typescriptMissingMessage()}`,
  };
}

function resolveLocalTscCommand(cwd: string): ResolvedTscCommand | { ok: false; message?: string } {
  const candidates = process.platform === "win32"
    ? ["node_modules/.bin/tsc.cmd", "node_modules/.bin/tsc"]
    : ["node_modules/.bin/tsc", "node_modules/.bin/tsc.cmd"];
  const root = safeRealpath(cwd) ?? cwd;
  for (const candidate of candidates) {
    const absolute = resolve(cwd, candidate);
    if (!existsSync(absolute)) {
      continue;
    }
    const real = safeRealpath(absolute);
    if (!real) {
      return { ok: false, message: "Local node_modules/.bin/tsc exists but could not be resolved." };
    }
    if (!isPathInside(root, real)) {
      return { ok: false, message: "Local node_modules/.bin/tsc resolves outside the current working directory." };
    }
    if (!safeIsFile(real)) {
      return { ok: false, message: "Local node_modules/.bin/tsc must resolve to a regular file." };
    }
    return {
      ok: true,
      command: absolute,
      displayCommand: candidate,
      source: "local_node_modules",
    };
  }
  return { ok: false };
}

function validateProjectPathValue(value: string): string | undefined {
  const basic = validateDiagnosticValue("project", value, MAX_DIAGNOSTIC_PATH_LENGTH);
  if (basic) {
    return basic;
  }
  if (isRegistryLikeValue(value)) {
    return "project must be a local tsconfig file path, not a package, registry, or launcher value.";
  }
  return undefined;
}

function validateDiagnosticValue(name: string, value: string, maxLength: number): string | undefined {
  if (!value.trim()) {
    return `${name} must not be empty.`;
  }
  if (value.length > maxLength) {
    return `${name} is too long.`;
  }
  if (CONTROL_CHAR_PATTERN.test(value)) {
    return `${name} contains unsupported control characters.`;
  }
  if (isFlagLikeValue(value)) {
    return `${name} must not start with a dash.`;
  }
  if (isUrlLikeValue(value)) {
    return `${name} must be a local path or profile id, not a URL.`;
  }
  if (SECRET_LIKE_PATTERN.test(value)) {
    return `${name} must not contain secret-like values.`;
  }
  return undefined;
}

function normalizeProfileId(value: string): DiagnosticProfileId {
  return value.trim().toLowerCase() as DiagnosticProfileId;
}

function isUrlLikeValue(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(value.trim());
}

function isRegistryLikeValue(value: string): boolean {
  const normalized = value.trim().replace(/\\/g, "/").toLowerCase();
  return normalized.startsWith("npm:") ||
    normalized.startsWith("pnpm:") ||
    normalized.startsWith("yarn:") ||
    normalized.startsWith("bun:") ||
    normalized.startsWith("npx:") ||
    normalized.startsWith("dlx:") ||
    normalized.startsWith("github:") ||
    normalized.startsWith("git+") ||
    normalized.startsWith("jsr:") ||
    normalized.startsWith("pkg:") ||
    normalized === "latest" ||
    /^[a-z0-9_.-]+@[a-z0-9_.-]+$/.test(normalized) ||
    /^@[^/]+\/[^/]+$/.test(normalized);
}

function isFlagLikeValue(value: string): boolean {
  return value.trimStart().startsWith("-");
}

function createDiagnosticsEnv(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
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
    const value = source[key];
    if (value !== undefined && isSafeDiagnosticsEnvValue(key, value)) {
      env[key] = value;
    }
  }
  return env;
}

function isSafeDiagnosticsEnvValue(key: string, value: string): boolean {
  if (CONTROL_CHAR_PATTERN.test(key) || CONTROL_CHAR_PATTERN.test(value)) {
    return false;
  }
  if (/ORX|OPENROUTER|BRAVE|API|TOKEN|KEY|SECRET|PASSWORD|PASSWD|AUTH|BEARER/i.test(key)) {
    return false;
  }
  return !SECRET_LIKE_PATTERN.test(value);
}

function classifyTypeScriptRun(result: RunProcessResult): DiagnosticRunStatus {
  if (result.timedOut) {
    return "timed_out";
  }
  if (result.error) {
    return isCommandMissingError(result.error) ? "tool_missing" : "process_error";
  }
  return result.exitCode === 0 ? "ok" : "failed";
}

function parseTypeScriptDiagnostics(output: string): ParsedTypeScriptDiagnostic[] {
  const diagnostics: ParsedTypeScriptDiagnostic[] = [];
  const seen = new Set<string>();
  const linePattern = /^(.+?)\((\d+),(\d+)\):\s+(error|warning|message)\s+(TS\d+):\s+(.+)$/;
  const alternatePattern = /^(.+?):(\d+):(\d+)\s+-\s+(error|warning|message)\s+(TS\d+):\s+(.+)$/;
  for (const rawLine of output.replace(/\r\n|\r/g, "\n").split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    const match = line.match(linePattern) ?? line.match(alternatePattern);
    if (!match) {
      continue;
    }
    const diagnostic = {
      file: sanitizeInline(match[1] ?? ""),
      line: Number.parseInt(match[2] ?? "0", 10),
      column: Number.parseInt(match[3] ?? "0", 10),
      severity: (match[4] ?? "error") as ParsedTypeScriptDiagnostic["severity"],
      code: sanitizeInline(match[5] ?? ""),
      message: sanitizeInline(match[6] ?? ""),
    };
    const key = JSON.stringify(diagnostic);
    if (!seen.has(key)) {
      seen.add(key);
      diagnostics.push(diagnostic);
    }
  }
  return diagnostics;
}

function invalidTypeScriptRun(
  options: RunTypeScriptDiagnosticsOptions,
  root: string,
  message: string,
): TypeScriptDiagnosticsResult {
  const emptyText = emptyDiagnosticText();
  return {
    ok: false,
    status: "invalid_arguments",
    profile: "typescript",
    root,
    projectPath: options.projectPath,
    json: options.json,
    args: [],
    timedOut: false,
    stdout: "",
    stderr: "",
    stdoutTruncation: emptyText.truncation,
    stderrTruncation: emptyText.truncation,
    diagnostics: [],
    message,
  };
}

function splitDiagnosticArgText(text: string): string[] | string {
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
    return "Unterminated quoted diagnostics argument.";
  }
  if (tokenStarted) {
    tokens.push(current);
  }
  return tokens;
}

function sanitizeProcessOutput(value: string): string {
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

function outputMetadata(value: string, truncation: TextTruncation) {
  return {
    sha256: createHash("sha256").update(value).digest("hex"),
    truncated: truncation.truncated,
    original_bytes: truncation.originalBytes,
    returned_bytes: truncation.returnedBytes,
    original_lines: truncation.originalLines,
    returned_lines: truncation.returnedLines,
    omitted_bytes: truncation.omittedBytes,
    omitted_lines: truncation.omittedLines,
  };
}

function formatCommandLine(command: string, args: string[]): string {
  return [command, ...args].map(formatShellToken).join(" ");
}

function formatShellToken(value: string): string {
  if (/^[A-Za-z0-9_./:@=+-]+$/.test(value)) {
    return value;
  }
  return JSON.stringify(value);
}

function typescriptMissingMessage(): string {
  return "tsc is not installed or not on PATH. Install TypeScript locally in this project or make an existing tsc binary available on PATH; ORX will not install it for you.";
}

function isCommandMissingError(error: { code?: string }): boolean {
  return error.code === "ENOENT" || error.code === "ENOTDIR";
}

function emptyDiagnosticText(): { text: string; truncation: TextTruncation } {
  return { text: "", truncation: { ...EMPTY_TRUNCATION } };
}

function safeRealpath(path: string): string | undefined {
  try {
    return realpathSync(path);
  } catch {
    return undefined;
  }
}

function safeIsFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function isPathInside(root: string, candidate: string): boolean {
  const relativePath = relative(resolve(root), resolve(candidate));
  return relativePath === "" || (!relativePath.startsWith("..") && !relativePath.startsWith("/") && !relativePath.startsWith("\\"));
}
