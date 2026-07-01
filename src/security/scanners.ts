import { existsSync, lstatSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { redactSecrets } from "../mcp/audit.js";
import { runProcess, type RunProcessOptions, type RunProcessResult } from "../tools/process.js";
import type { TextTruncation } from "../tools/types.js";

export const SCANNERS_USAGE =
  "Usage: orx scanners [list [--json]|inspect <profile> [--json]|run semgrep <path> --config <local-config-path> [--json]]";
export const SCAN_USAGE =
  "Usage: orx scan semgrep <path> --config <local-config-path> [--json]";
export const SLASH_SCANNERS_USAGE =
  "Usage: /scanners [list [--json]|inspect <profile> [--json]|run semgrep <path> --config <local-config-path> [--json]]";
export const SLASH_SCAN_USAGE =
  "Usage: /scan semgrep <path> --config <local-config-path> [--json]";

export type ScannerProfileId =
  | "semgrep"
  | "snyk"
  | "socket"
  | "osv-scanner"
  | "codeql"
  | "trivy";

export interface ScannerProfile {
  id: ScannerProfileId;
  label: string;
  state: "runnable" | "catalog_only";
  binary: string;
  summary: string;
  runSupport: string;
  networkBoundary: string;
}

export interface ScannerRunArgs {
  profile: ScannerProfileId;
  targetPath: string;
  configPath: string;
  json: boolean;
}

export type ScannerRunParseResult =
  | { ok: true; args: ScannerRunArgs }
  | { ok: false; message: string };

export type ScannerRunStatus =
  | "ok"
  | "failed"
  | "timed_out"
  | "tool_missing"
  | "invalid_arguments"
  | "process_error";

export type ScannerProcessRunner = (options: RunProcessOptions) => Promise<RunProcessResult>;

export interface RunSemgrepScannerOptions extends ScannerRunArgs {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  runner?: ScannerProcessRunner;
  timeoutMs?: number;
  maxBytes?: number;
}

export interface ScannerRunResult {
  ok: boolean;
  status: ScannerRunStatus;
  profile: ScannerProfileId;
  root: string;
  targetPath: string;
  configPath: string;
  json: boolean;
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

interface ResolvedScannerPath {
  arg: string;
  displayPath: string;
}

const SCANNER_PROFILES: ScannerProfile[] = [
  {
    id: "semgrep",
    label: "Semgrep",
    state: "runnable",
    binary: "semgrep",
    summary: "Local static-analysis scan using an already-installed Semgrep CLI.",
    runSupport: "runnable only through `run semgrep <path> --config <local-config-path> [--json]`",
    networkBoundary: "remote registry configs, URLs, auth env, and model exposure are disabled in this slice",
  },
  {
    id: "snyk",
    label: "Snyk",
    state: "catalog_only",
    binary: "snyk",
    summary: "Catalog/readiness placeholder for future local scanner integration.",
    runSupport: "not runnable in this slice",
    networkBoundary: "no no-network/no-auth command selection is enabled yet",
  },
  {
    id: "socket",
    label: "Socket",
    state: "catalog_only",
    binary: "socket",
    summary: "Catalog/readiness placeholder for future dependency-risk scanning.",
    runSupport: "not runnable in this slice",
    networkBoundary: "no no-network/no-auth command selection is enabled yet",
  },
  {
    id: "osv-scanner",
    label: "OSV-Scanner",
    state: "catalog_only",
    binary: "osv-scanner",
    summary: "Catalog/readiness placeholder for future vulnerability scanning.",
    runSupport: "not runnable in this slice",
    networkBoundary: "no no-network/no-auth command selection is enabled yet",
  },
  {
    id: "codeql",
    label: "CodeQL",
    state: "catalog_only",
    binary: "codeql",
    summary: "Catalog/readiness placeholder for future local CodeQL database/query workflows.",
    runSupport: "not runnable in this slice",
    networkBoundary: "no no-network/no-auth command selection is enabled yet",
  },
  {
    id: "trivy",
    label: "Trivy",
    state: "catalog_only",
    binary: "trivy",
    summary: "Catalog/readiness placeholder for future local filesystem/image scanning.",
    runSupport: "not runnable in this slice",
    networkBoundary: "no no-network/no-auth command selection is enabled yet",
  },
];

const PROFILE_IDS = new Set<ScannerProfileId>(SCANNER_PROFILES.map((profile) => profile.id));
const DEFAULT_SCANNER_TIMEOUT_MS = 120_000;
const DEFAULT_SCANNER_OUTPUT_BYTES = 128 * 1024;
const SCANNER_DISCOVERY_TIMEOUT_MS = 5_000;
const SCANNER_DISCOVERY_BYTES = 8 * 1024;
const MAX_SCANNER_PATH_LENGTH = 4096;
const MAX_SCANNER_PROFILE_LENGTH = 80;
const CONTROL_CHAR_PATTERN = /[\x00-\x1F\x7F]/;
const OUTPUT_CONTROL_CHAR_PATTERN = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;
const ANSI_PATTERN = /\x1B\[[0-?]*[ -/]*[@-~]/g;
const OSC_PATTERN = /\x1B\][^\x07]*(?:\x07|\x1B\\)/g;
const SECRET_LIKE_PATTERN =
  /\b(?:bearer\s+[A-Za-z0-9._~+/=-]{8,}|authorization:\s*bearer\s+[A-Za-z0-9._~+/=-]{8,}|(?:access[_-]?token|api[_-]?key|token|key|secret|password|passwd)\s*[=:]\s*[A-Za-z0-9._~+/=-]{4,}|sk-or-v1-[A-Za-z0-9_-]+|github_pat_[A-Za-z0-9_]+|ghp_[A-Za-z0-9_]+|glpat-[A-Za-z0-9_-]+|xox[baprs]-[A-Za-z0-9-]+)\b/i;

const EMPTY_TRUNCATION: TextTruncation = {
  truncated: false,
  originalBytes: 0,
  returnedBytes: 0,
  originalLines: 0,
  returnedLines: 0,
  omittedBytes: 0,
  omittedLines: 0,
};

export function listScannerProfiles(): ScannerProfile[] {
  return [...SCANNER_PROFILES];
}

export function findScannerProfile(profileId: string): ScannerProfile | undefined {
  const normalized = normalizeProfileId(profileId);
  return SCANNER_PROFILES.find((profile) => profile.id === normalized);
}

export function renderScannerProfiles(profiles = listScannerProfiles()): string {
  const lines = [
    "Security scanner profiles",
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

export function renderScannerProfilesJson(profiles = listScannerProfiles()): string {
  return JSON.stringify({
    schema_version: 1,
    surface: "orx.security_scanner_profiles",
    operator_only: true,
    model_tool: "not_exposed",
    execution: "explicit_operator_only",
    network: "none_for_list_or_inspect",
    profiles: profiles.map(scannerProfileJson),
  }, null, 2);
}

function scannerProfileJson(profile: ScannerProfile): Record<string, unknown> {
  return {
    id: profile.id,
    label: profile.label,
    state: profile.state,
    binary: profile.binary,
    summary: profile.summary,
    run_support: profile.runSupport,
    install_behavior: "not_managed_by_orx",
    network_boundary: profile.networkBoundary,
    execution: "explicit_operator_only",
    model_tool: "not_exposed",
    details: scannerProfileJsonDetails(profile),
  };
}

function scannerProfileJsonDetails(profile: ScannerProfile): Record<string, string> | undefined {
  if (profile.id === "semgrep") {
    return {
      config_required: "local file under cwd via --config",
      rejected_configs: "URLs, registry configs such as auto or p/default, dash-prefixed values, symlink escapes, secrets, and control characters",
      output: "bounded and redacted; run --json passes redacted bounded Semgrep stdout only on success",
      run: "orx scanners run semgrep <path> --config <local-config-path> [--json]",
    };
  }
  return undefined;
}

export function renderScannerProfileInspect(profile: ScannerProfile): string {
  const lines = [
    `Security scanner profile: ${profile.id}`,
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

  if (profile.id === "semgrep") {
    lines.push(
      "  config_required: local file under cwd via --config",
      "  rejected_configs: URLs, registry configs such as auto or p/default, dash-prefixed values, symlink escapes, secrets, and control characters",
      "  output: bounded and redacted; --json passes redacted bounded Semgrep stdout only on success",
      "  run: orx scanners run semgrep <path> --config <local-config-path> [--json]",
    );
  }

  return lines.join("\n");
}

export function renderScannerProfileInspectJson(profile: ScannerProfile): string {
  return JSON.stringify({
    schema_version: 1,
    surface: "orx.security_scanner_profile",
    profile: scannerProfileJson(profile),
  }, null, 2);
}

export function renderMissingScannerProfile(profileId: string): string {
  return `Unknown scanner profile: ${sanitizeInline(profileId)}. Available profiles: ${SCANNER_PROFILES.map((profile) => profile.id).join(", ")}.`;
}

export function renderScannerInspectUsage(usage: string): string {
  return usage.replace(
    /\[list(?: \[--json\])?\|inspect <profile>(?: \[--json\])?\|run .+$/,
    "inspect <profile> [--json]",
  );
}

export function parseScannerReadinessJsonFlag(
  args: string[],
  usage: string,
): { ok: true; json: boolean } | { ok: false; message: string } {
  if (args.length === 0) {
    return { ok: true, json: false };
  }
  if (args.length === 1 && args[0] === "--json") {
    return { ok: true, json: true };
  }
  const option = args.find((arg) => arg.startsWith("-"));
  if (option) {
    return { ok: false, message: `${usage}\nUnknown scanner option: ${sanitizeInline(option)}` };
  }
  return { ok: false, message: usage };
}

export function parseScannerRunArgs(
  args: string[],
  usage = SCANNERS_USAGE,
): ScannerRunParseResult {
  const positional: string[] = [];
  let configPath: string | undefined;
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
    if (arg === "--config") {
      const value = args[index + 1];
      if (value === undefined) {
        return { ok: false, message: `${usage}\nMissing value for --config.` };
      }
      configPath = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--config=")) {
      configPath = arg.slice("--config=".length);
      continue;
    }
    if (arg.startsWith("-")) {
      return { ok: false, message: `${usage}\nUnknown scanner option: ${sanitizeInline(arg)}` };
    }
    positional.push(arg);
  }

  if (positional.length !== 2) {
    return { ok: false, message: usage };
  }
  const profile = normalizeProfileId(positional[0] ?? "");
  const targetPath = positional[1] ?? "";
  const profileError = validateScannerValue("profile", profile, MAX_SCANNER_PROFILE_LENGTH);
  if (profileError) {
    return { ok: false, message: `${usage}\n${profileError}` };
  }
  if (!PROFILE_IDS.has(profile)) {
    return { ok: false, message: renderMissingScannerProfile(profile) };
  }
  if (profile !== "semgrep") {
    return {
      ok: false,
      message: `Scanner profile ${profile} is catalog/readiness-only in this slice; no run path is enabled.`,
    };
  }
  const targetError = validateScannerValue("path", targetPath, MAX_SCANNER_PATH_LENGTH);
  if (targetError) {
    return { ok: false, message: `${usage}\n${targetError}` };
  }
  if (!configPath) {
    return { ok: false, message: `${usage}\nMissing required --config <local-config-path>.` };
  }
  const configError = validateScannerValue("config", configPath, MAX_SCANNER_PATH_LENGTH);
  if (configError) {
    return { ok: false, message: `${usage}\n${configError}` };
  }
  if (isRegistrySemgrepConfig(configPath)) {
    return {
      ok: false,
      message: `${usage}\nconfig must be a local file under cwd, not a Semgrep registry config such as auto or p/default.`,
    };
  }

  return {
    ok: true,
    args: {
      profile,
      targetPath,
      configPath,
      json,
    },
  };
}

export function parseScannerRunArgText(argText: string, usage = SCANNERS_USAGE): ScannerRunParseResult {
  const tokens = splitScannerArgText(argText);
  if (typeof tokens === "string") {
    return { ok: false, message: `${usage}\n${tokens}` };
  }
  return parseScannerRunArgs(tokens, usage);
}

export async function runSemgrepScanner(options: RunSemgrepScannerOptions): Promise<ScannerRunResult> {
  const root = resolve(options.cwd ?? process.cwd());
  const env = createScannerEnv(options.env ?? process.env);
  const maxBytes = options.maxBytes ?? DEFAULT_SCANNER_OUTPUT_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_SCANNER_TIMEOUT_MS;
  const runner = options.runner ?? runProcess;
  const emptyText = emptyScannerText();

  if (options.profile !== "semgrep") {
    return {
      ok: false,
      status: "invalid_arguments",
      profile: options.profile,
      root,
      targetPath: options.targetPath,
      configPath: options.configPath,
      json: options.json,
      args: [],
      timedOut: false,
      stdout: "",
      stderr: "",
      stdoutTruncation: emptyText.truncation,
      stderrTruncation: emptyText.truncation,
      message: "Only the semgrep scanner profile is runnable in this slice.",
    };
  }

  const target = resolveScannerPath(root, options.targetPath, "path", { mustExist: true });
  if (!target.ok) {
    return invalidScannerRun(options, root, target.message);
  }
  const config = resolveScannerPath(root, options.configPath, "config", { mustExist: true, mustBeFile: true });
  if (!config.ok) {
    return invalidScannerRun(options, root, config.message);
  }

  const command = await resolveSemgrepCommand(root, env, runner);
  if (!command.ok) {
    return {
      ok: false,
      status: "tool_missing",
      profile: "semgrep",
      root,
      targetPath: target.displayPath,
      configPath: config.displayPath,
      json: options.json,
      args: [],
      timedOut: false,
      stdout: "",
      stderr: "",
      stdoutTruncation: emptyText.truncation,
      stderrTruncation: emptyText.truncation,
      message: command.message,
    };
  }

  const spawnArgs = buildSemgrepArgs(target.arg, config.arg, options.json);
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
  const stdout = options.json ? sanitizeJsonProcessOutput(result.stdout) : sanitizeProcessOutput(result.stdout);
  const stderr = sanitizeProcessOutput(result.stderr);
  const status = classifySemgrepRun(result);

  return {
    ok: status === "ok",
    status,
    profile: "semgrep",
    root,
    targetPath: target.displayPath,
    configPath: config.displayPath,
    json: options.json,
    command: command.command,
    args: spawnArgs,
    commandLine: formatCommandLine(command.command, spawnArgs),
    exitCode: result.exitCode,
    signal: result.signal,
    timedOut: result.timedOut,
    durationMs: result.durationMs,
    stdout,
    stderr,
    stdoutTruncation: result.stdoutTruncation,
    stderrTruncation: result.stderrTruncation,
    message: result.error ? sanitizeInline(result.error.message) : undefined,
  };
}

export function renderScannerRunResult(result: ScannerRunResult, usage = SCANNERS_USAGE): string {
  const lines = [
    "Security scanner run",
    `  profile: ${result.profile}`,
    `  status: ${result.status}`,
    `  root: ${sanitizeInline(result.root)}`,
    `  path: ${sanitizeInline(result.targetPath)}`,
    `  config: ${sanitizeInline(result.configPath)}`,
    "  execution: shell_disabled",
    "  env: minimal_no_orx_openrouter_brave_api_token_values",
    "  network: none_by_command_selection",
    "  model_tool: not_exposed",
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
    lines.push(`  setup: ${semgrepMissingMessage()}`);
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

  lines.push(`  usage: ${usage.replace(/^Usage:\s*/, "")}`);
  return lines.join("\n");
}

function buildSemgrepArgs(targetPath: string, configPath: string, json: boolean): string[] {
  const args = ["scan", "--config", configPath, "--metrics", "off", "--error", "--no-suppress-errors"];
  if (json) {
    args.push("--json");
  }
  args.push(targetPath);
  return args;
}

async function resolveSemgrepCommand(
  cwd: string,
  env: NodeJS.ProcessEnv,
  runner: ScannerProcessRunner,
): Promise<{ ok: true; command: "semgrep" } | { ok: false; message: string }> {
  const result = await runner({
    command: "semgrep",
    args: ["--version"],
    cwd,
    env,
    inheritEnv: false,
    shell: false,
    timeoutMs: SCANNER_DISCOVERY_TIMEOUT_MS,
    maxBytes: SCANNER_DISCOVERY_BYTES,
  });
  if (result.exitCode === 0) {
    return { ok: true, command: "semgrep" };
  }
  if (result.error && isCommandMissingError(result.error)) {
    return { ok: false, message: semgrepMissingMessage() };
  }
  return {
    ok: false,
    message: `Semgrep was found but did not respond to --version successfully. ${semgrepMissingMessage()}`,
  };
}

function resolveScannerPath(
  cwd: string,
  value: string,
  label: "path" | "config",
  options: { mustExist: boolean; mustBeFile?: boolean },
): { ok: true } & ResolvedScannerPath | { ok: false; message: string } {
  const validation = validateScannerValue(label, value, MAX_SCANNER_PATH_LENGTH);
  if (validation) {
    return { ok: false, message: validation };
  }
  if (label === "config" && isRegistrySemgrepConfig(value)) {
    return {
      ok: false,
      message: "config must be a local file under cwd, not a Semgrep registry config such as auto or p/default.",
    };
  }

  const root = safeRealpath(cwd) ?? cwd;
  const resolved = resolve(cwd, value);
  if (!isPathInside(cwd, resolved)) {
    return { ok: false, message: `${label} must stay inside the current working directory.` };
  }
  if (options.mustExist && !existsSync(resolved)) {
    return { ok: false, message: `${label} does not exist inside the current working directory.` };
  }

  const realResolved = existsSync(resolved) ? safeRealpath(resolved) : undefined;
  if (realResolved && !isPathInside(root, realResolved)) {
    return { ok: false, message: `${label} resolves outside the current working directory.` };
  }
  if (options.mustBeFile) {
    const filePath = realResolved ?? resolved;
    if (!safeIsFile(filePath)) {
      return { ok: false, message: `${label} must be a regular local file.` };
    }
  }

  const relativePath = relative(cwd, resolved).split(/[\\/]/g).join("/") || ".";
  if (isFlagLikeValue(relativePath)) {
    return { ok: false, message: `${label} must not resolve to a dash-prefixed operand.` };
  }
  if (existsSync(resolved)) {
    try {
      const stat = lstatSync(resolved);
      if (stat.isSymbolicLink() && !realResolved) {
        return { ok: false, message: `${label} symlink could not be resolved.` };
      }
    } catch {
      return { ok: false, message: `${label} could not be inspected.` };
    }
  }

  return { ok: true, arg: relativePath, displayPath: relativePath };
}

function validateScannerValue(name: string, value: string, maxLength: number): string | undefined {
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

function normalizeProfileId(value: string): ScannerProfileId {
  return value.trim().toLowerCase() as ScannerProfileId;
}

function isRegistrySemgrepConfig(value: string): boolean {
  const normalized = value.trim().replace(/\\/g, "/").toLowerCase();
  return normalized === "auto" ||
    normalized === "p/default" ||
    normalized.startsWith("p/") ||
    normalized.startsWith("r/") ||
    normalized.startsWith("registry/");
}

function isUrlLikeValue(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(value.trim());
}

function isFlagLikeValue(value: string): boolean {
  return value.trimStart().startsWith("-");
}

function createScannerEnv(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
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
    if (value !== undefined && isSafeScannerEnvValue(value)) {
      env[key] = value;
    }
  }
  env.SEMGREP_SEND_METRICS = "off";
  env.SEMGREP_ENABLE_VERSION_CHECK = "0";
  return env;
}

function isSafeScannerEnvValue(value: string): boolean {
  return !CONTROL_CHAR_PATTERN.test(value) && !SECRET_LIKE_PATTERN.test(value);
}

function classifySemgrepRun(result: RunProcessResult): ScannerRunStatus {
  if (result.timedOut) {
    return "timed_out";
  }
  if (result.error) {
    return isCommandMissingError(result.error) ? "tool_missing" : "process_error";
  }
  return result.exitCode === 0 ? "ok" : "failed";
}

function invalidScannerRun(
  options: RunSemgrepScannerOptions,
  root: string,
  message: string,
): ScannerRunResult {
  const emptyText = emptyScannerText();
  return {
    ok: false,
    status: "invalid_arguments",
    profile: options.profile,
    root,
    targetPath: options.targetPath,
    configPath: options.configPath,
    json: options.json,
    args: [],
    timedOut: false,
    stdout: "",
    stderr: "",
    stdoutTruncation: emptyText.truncation,
    stderrTruncation: emptyText.truncation,
    message,
  };
}

function splitScannerArgText(text: string): string[] | string {
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
    return "Unterminated quoted scanner argument.";
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

function sanitizeJsonProcessOutput(value: string): string {
  const stripped = value
    .replace(OSC_PATTERN, "")
    .replace(ANSI_PATTERN, "")
    .replace(OUTPUT_CONTROL_CHAR_PATTERN, "");
  try {
    const parsed = JSON.parse(stripped);
    return `${JSON.stringify(redactSecrets(parsed))}\n`;
  } catch {
    return sanitizeProcessOutput(stripped);
  }
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

function semgrepMissingMessage(): string {
  return "Semgrep is not installed or not on PATH. Install Semgrep yourself, ensure `semgrep` is available locally, and rerun with an explicit local --config file under the current working directory.";
}

function isCommandMissingError(error: { code: string }): boolean {
  return error.code === "ENOENT" || error.code === "ENOTDIR";
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

function isPathInside(parent: string, child: string): boolean {
  const relativePath = relative(parent, child);
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

function emptyScannerText(): { text: string; truncation: TextTruncation } {
  return { text: "", truncation: { ...EMPTY_TRUNCATION } };
}
