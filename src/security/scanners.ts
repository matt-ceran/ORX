import { closeSync, existsSync, lstatSync, mkdtempSync, openSync, readSync, realpathSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { redactSecrets } from "../mcp/audit.js";
import { runProcess, type RunProcessOptions, type RunProcessResult } from "../tools/process.js";
import { truncateText } from "../tools/truncation.js";
import type { TextTruncation } from "../tools/types.js";

export const SCANNERS_USAGE =
  "Usage: orx scanners [list [--json]|status [--json]|inspect <profile> [--json]|show <profile> [--json]|plan <profile> [--json]|setup-plan <profile> [--json]|run <semgrep|trivy|codeql|osv-scanner> <path> [--config <local-config-path>] [--query <local-query-or-suite>] [--json]]";
export const SCAN_USAGE =
  "Usage: orx scan <semgrep|trivy|codeql|osv-scanner> <path> [--config <local-config-path>] [--query <local-query-or-suite>] [--json]";
export const SLASH_SCANNERS_USAGE =
  "Usage: /scanners [list [--json]|status [--json]|inspect <profile> [--json]|show <profile> [--json]|plan <profile> [--json]|setup-plan <profile> [--json]|run <semgrep|trivy|codeql|osv-scanner> <path> [--config <local-config-path>] [--query <local-query-or-suite>] [--json]]";
export const SLASH_SCAN_USAGE =
  "Usage: /scan <semgrep|trivy|codeql|osv-scanner> <path> [--config <local-config-path>] [--query <local-query-or-suite>] [--json]";

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

export interface ScannerSetupPlan {
  profile: ScannerProfile;
  status: "runnable_now" | "catalog_only";
  nextAction: string;
  currentRunCommand?: string;
  futureIntegration?: string;
  blockers: string[];
  boundaries: {
    execution: "none";
    processSpawn: "none";
    network: "none";
    stateWrites: "none";
    modelTool: "not_exposed";
  };
}

export type RunnableScannerProfileId = "semgrep" | "trivy" | "codeql" | "osv-scanner";

export interface ScannerRunArgs {
  profile: ScannerProfileId;
  targetPath: string;
  configPath?: string;
  queryPath?: string;
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

export interface RunSecurityScannerOptions extends ScannerRunArgs {
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
  configPath?: string;
  queryPath?: string;
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
    state: "runnable",
    binary: "osv-scanner",
    summary: "Local dependency vulnerability scan using an already-installed OSV-Scanner CLI and already-cached offline vulnerability data.",
    runSupport: "runnable only through `run osv-scanner <path> [--json]` for offline source/lockfile scanning",
    networkBoundary: "source scanning uses full --offline mode and --no-resolve; database downloads, online matching, config overrides, license scans, image scans, and guided remediation are not enabled",
  },
  {
    id: "codeql",
    label: "CodeQL",
    state: "runnable",
    binary: "codeql",
    summary: "Local CodeQL database analysis using an already-installed CodeQL CLI, existing local database, and local query or suite path.",
    runSupport: "runnable only through `run codeql <database-dir> --query <local-query-or-suite> [--json]`",
    networkBoundary: "database analysis uses local database/query paths, strips auth env, and passes --no-download; database creation and remote pack resolution are not enabled",
  },
  {
    id: "trivy",
    label: "Trivy",
    state: "runnable",
    binary: "trivy",
    summary: "Local filesystem secret scan using an already-installed Trivy CLI.",
    runSupport: "runnable only through `run trivy <path> [--json]` for filesystem secret scanning",
    networkBoundary: "secret scanner only with offline/update-skip flags; vulnerability, misconfiguration, license, image, and registry scanning are not enabled",
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
const SENSITIVE_JSON_KEY_PATTERN = /(api[_-]?key|authorization|bearer|token|secret|password|credential)/i;
const SAFE_SCANNER_JSON_KEY_EXCEPTIONS = /^(secrets)$/i;

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
  if (profile.id === "trivy") {
    return {
      scan_scope: "filesystem secret scanning only",
      command_shape: "trivy fs --scanners secret --format json --offline-scan --skip-db-update --skip-java-db-update --skip-check-update --skip-version-check --disable-telemetry --no-progress <path>",
      target_guard: "local regular file or directory under cwd; symlink realpath must remain under cwd",
      rejected_options: "--config, URLs, dash-prefixed values, symlink escapes, secrets, and control characters",
      output: "bounded and redacted; run --json passes redacted bounded Trivy JSON stdout only on success",
      run: "orx scanners run trivy <path> [--json]",
    };
  }
  if (profile.id === "codeql") {
    return {
      database_required: "local CodeQL database directory under cwd",
      query_required: "local .ql query, .qls suite, or query directory under cwd via --query",
      command_shape: "codeql database analyze --format=sarifv2.1.0 --output=<orx-temp-sarif> --no-download --no-sarif-add-file-contents --no-sarif-add-snippets --sarif-include-query-help=never --no-print-diagnostics-summary --no-print-metrics-summary --threads=0 -- <database-dir> <query-path>",
      rejected_inputs: "pack names, URLs, dash-prefixed operands, symlink escapes, secrets, control characters, and --config",
      output: "bounded and redacted; run --json passes redacted bounded SARIF JSON from the ORX temp output file on success",
      run: "orx scanners run codeql <database-dir> --query <local-query-or-suite> [--json]",
    };
  }
  if (profile.id === "osv-scanner") {
    return {
      scan_scope: "source and lockfile vulnerability scanning only",
      command_shape: "osv-scanner scan source --recursive --format json --offline --no-resolve <path>",
      target_guard: "local regular file or directory under cwd; symlink realpath must remain under cwd",
      offline_data: "uses OSV full offline mode with already-cached vulnerability databases only; ORX does not pass --download-offline-databases",
      rejected_options: "--config, --query, URLs, dash-prefixed values, symlink escapes, secrets, and control characters",
      output: "bounded and redacted; run --json passes redacted bounded OSV-Scanner JSON stdout only on success",
      run: "orx scanners run osv-scanner <path> [--json]",
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
  if (profile.id === "trivy") {
    lines.push(
      "  scan_scope: filesystem secret scanning only",
      "  command_shape: trivy fs --scanners secret --format json --offline-scan --skip-db-update --skip-java-db-update --skip-check-update --skip-version-check --disable-telemetry --no-progress <path>",
      "  target_guard: local regular file or directory under cwd; symlink realpath must remain under cwd",
      "  rejected_options: --config, URLs, dash-prefixed values, symlink escapes, secrets, and control characters",
      "  output: bounded and redacted; --json passes redacted bounded Trivy JSON stdout only on success",
      "  run: orx scanners run trivy <path> [--json]",
    );
  }
  if (profile.id === "codeql") {
    lines.push(
      "  database_required: local CodeQL database directory under cwd",
      "  query_required: local .ql query, .qls suite, or query directory under cwd via --query",
      "  command_shape: codeql database analyze --format=sarifv2.1.0 --output=<orx-temp-sarif> --no-download --no-sarif-add-file-contents --no-sarif-add-snippets --sarif-include-query-help=never --no-print-diagnostics-summary --no-print-metrics-summary --threads=0 -- <database-dir> <query-path>",
      "  rejected_inputs: pack names, URLs, dash-prefixed operands, symlink escapes, secrets, control characters, and --config",
      "  output: bounded and redacted; --json passes redacted bounded SARIF JSON from the ORX temp output file on success",
      "  run: orx scanners run codeql <database-dir> --query <local-query-or-suite> [--json]",
    );
  }
  if (profile.id === "osv-scanner") {
    lines.push(
      "  scan_scope: source and lockfile vulnerability scanning only",
      "  command_shape: osv-scanner scan source --recursive --format json --offline --no-resolve <path>",
      "  target_guard: local regular file or directory under cwd; symlink realpath must remain under cwd",
      "  offline_data: uses OSV full offline mode with already-cached vulnerability databases only; ORX does not pass --download-offline-databases",
      "  rejected_options: --config, --query, URLs, dash-prefixed values, symlink escapes, secrets, and control characters",
      "  output: bounded and redacted; --json passes redacted bounded OSV-Scanner JSON stdout only on success",
      "  run: orx scanners run osv-scanner <path> [--json]",
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

export function createScannerSetupPlan(profile: ScannerProfile): ScannerSetupPlan {
  if (profile.state === "runnable") {
    return {
      profile,
      status: "runnable_now",
      nextAction: "Run the existing guarded local scanner command when an operator explicitly requests it.",
      currentRunCommand: runnableScannerCommandForProfile(profile.id as RunnableScannerProfileId),
      blockers: [],
      boundaries: scannerPlanBoundaries(),
    };
  }

  return {
    profile,
    status: "catalog_only",
    nextAction: "Keep this profile in list/inspect/plan metadata until a deterministic local no-network/no-auth integration shape is implemented.",
    futureIntegration: futureScannerIntegrationForProfile(profile.id),
    blockers: catalogOnlyScannerBlockers(profile.id),
    boundaries: scannerPlanBoundaries(),
  };
}

export function renderScannerSetupPlan(profile: ScannerProfile): string {
  const plan = createScannerSetupPlan(profile);
  const lines = [
    `Security scanner setup plan: ${plan.profile.id}`,
    `  label: ${plan.profile.label}`,
    `  state: ${plan.profile.state}`,
    `  status: ${plan.status}`,
    `  binary: ${plan.profile.binary}`,
    `  next_action: ${plan.nextAction}`,
    plan.currentRunCommand ? `  current_run: ${plan.currentRunCommand}` : undefined,
    plan.futureIntegration ? `  future_integration: ${plan.futureIntegration}` : undefined,
    "  execution: none",
    "  process_spawn: none",
    "  network: none",
    "  state_writes: none",
    "  model_tool: not_exposed",
    "  blockers:",
    ...(plan.blockers.length > 0
      ? plan.blockers.map((blocker) => `    - ${blocker}`)
      : ["    - none"]),
  ];

  return lines.filter((line): line is string => typeof line === "string").join("\n");
}

export function renderScannerSetupPlanJson(profile: ScannerProfile): string {
  const plan = createScannerSetupPlan(profile);
  return JSON.stringify({
    schema_version: 1,
    surface: "orx.security_scanner_setup_plan",
    operator_only: true,
    profile: scannerProfileJson(profile),
    status: plan.status,
    next_action: plan.nextAction,
    current_run: plan.currentRunCommand,
    future_integration: plan.futureIntegration,
    blockers: plan.blockers,
    authority: {
      execution: plan.boundaries.execution,
      process_spawn: plan.boundaries.processSpawn,
      network: plan.boundaries.network,
      state_writes: plan.boundaries.stateWrites,
      model_tool: plan.boundaries.modelTool,
    },
  }, null, 2);
}

export function renderMissingScannerProfile(profileId: string): string {
  return `Unknown scanner profile: ${sanitizeInline(profileId)}. Available profiles: ${SCANNER_PROFILES.map((profile) => profile.id).join(", ")}.`;
}

export function renderScannerInspectUsage(usage: string): string {
  return usage.replace(
    /\[list(?: \[--json\])?\|status(?: \[--json\])?\|inspect <profile>(?: \[--json\])?\|show <profile>(?: \[--json\])?\|plan <profile>(?: \[--json\])?\|setup-plan <profile>(?: \[--json\])?\|run .+$/,
    "[inspect|show] <profile> [--json]",
  );
}

export function renderScannerPlanUsage(usage: string): string {
  return usage.replace(
    /\[list(?: \[--json\])?\|status(?: \[--json\])?\|inspect <profile>(?: \[--json\])?\|show <profile>(?: \[--json\])?\|plan <profile>(?: \[--json\])?\|setup-plan <profile>(?: \[--json\])?\|run .+$/,
    "[plan|setup-plan] <profile> [--json]",
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
  let configProvided = false;
  let queryPath: string | undefined;
  let queryProvided = false;
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
      configProvided = true;
      configPath = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--config=")) {
      configProvided = true;
      configPath = arg.slice("--config=".length);
      continue;
    }
    if (arg === "--query") {
      const value = args[index + 1];
      if (value === undefined) {
        return { ok: false, message: `${usage}\nMissing value for --query.` };
      }
      queryProvided = true;
      queryPath = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--query=")) {
      queryProvided = true;
      queryPath = arg.slice("--query=".length);
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
  if (profile !== "semgrep" && profile !== "trivy" && profile !== "codeql" && profile !== "osv-scanner") {
    return {
      ok: false,
      message: `Scanner profile ${profile} is catalog/readiness-only in this slice; no run path is enabled.`,
    };
  }
  const targetError = validateScannerValue("path", targetPath, MAX_SCANNER_PATH_LENGTH);
  if (targetError) {
    return { ok: false, message: `${usage}\n${targetError}` };
  }
  if (profile === "trivy" && configProvided) {
    return {
      ok: false,
      message: `${usage}\nTrivy secret scans do not accept --config; ORX does not load Trivy config files in this profile.`,
    };
  }
  if (profile === "osv-scanner" && configProvided) {
    return {
      ok: false,
      message: `${usage}\nOSV-Scanner offline source scans do not accept --config; ORX does not load OSV config files in this profile.`,
    };
  }
  if (profile === "codeql" && configProvided) {
    return {
      ok: false,
      message: `${usage}\nCodeQL database analysis does not accept --config; use --query <local-query-or-suite> for a local query path.`,
    };
  }
  if (profile !== "codeql" && queryProvided) {
    return {
      ok: false,
      message: `${usage}\nOnly the CodeQL scanner profile accepts --query.`,
    };
  }
  if (profile === "semgrep" && (!configProvided || !configPath)) {
    return { ok: false, message: `${usage}\nMissing required --config <local-config-path>.` };
  }
  if (profile === "codeql" && (!queryProvided || !queryPath)) {
    return { ok: false, message: `${usage}\nMissing required --query <local-query-or-suite>.` };
  }
  const configError = configPath ? validateScannerValue("config", configPath, MAX_SCANNER_PATH_LENGTH) : undefined;
  if (configError) {
    return { ok: false, message: `${usage}\n${configError}` };
  }
  const queryError = queryPath ? validateScannerValue("query", queryPath, MAX_SCANNER_PATH_LENGTH) : undefined;
  if (queryError) {
    return { ok: false, message: `${usage}\n${queryError}` };
  }
  if (configPath && isRegistrySemgrepConfig(configPath)) {
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
      queryPath,
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

export async function runSecurityScanner(options: RunSecurityScannerOptions): Promise<ScannerRunResult> {
  const root = resolve(options.cwd ?? process.cwd());
  const env = createScannerEnv(options.env ?? process.env);
  const maxBytes = options.maxBytes ?? DEFAULT_SCANNER_OUTPUT_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_SCANNER_TIMEOUT_MS;
  const runner = options.runner ?? runProcess;
  const emptyText = emptyScannerText();

  if (options.profile !== "semgrep" && options.profile !== "trivy" && options.profile !== "codeql" && options.profile !== "osv-scanner") {
    return {
      ok: false,
      status: "invalid_arguments",
      profile: options.profile,
      root,
      targetPath: options.targetPath,
      configPath: options.configPath,
      queryPath: options.queryPath,
      json: options.json,
      args: [],
      timedOut: false,
      stdout: "",
      stderr: "",
      stdoutTruncation: emptyText.truncation,
      stderrTruncation: emptyText.truncation,
      message: "Only the semgrep, trivy, codeql, and osv-scanner scanner profiles are runnable in this slice.",
    };
  }

  const target = resolveScannerPath(root, options.targetPath, "path", {
    mustExist: true,
    mustBeFileOrDirectory: options.profile !== "codeql",
    mustBeDirectory: options.profile === "codeql",
  });
  if (!target.ok) {
    return invalidScannerRun(options, root, target.message);
  }
  const config = options.profile === "semgrep"
    ? resolveScannerPath(root, options.configPath ?? "", "config", { mustExist: true, mustBeFile: true })
    : undefined;
  if (config && !config.ok) {
    return invalidScannerRun(options, root, config.message);
  }
  const query = options.profile === "codeql"
    ? resolveScannerPath(root, options.queryPath ?? "", "query", { mustExist: true, mustBeFileOrDirectory: true })
    : undefined;
  if (query && !query.ok) {
    return invalidScannerRun(options, root, query.message);
  }

  const command = await resolveScannerCommand(options.profile, root, env, runner);
  if (!command.ok) {
    return {
      ok: false,
      status: "tool_missing",
      profile: options.profile,
      root,
      targetPath: target.displayPath,
      configPath: config?.displayPath,
      queryPath: query?.displayPath,
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

  if (options.profile === "codeql") {
    return runCodeqlScanner({
      options,
      root,
      env,
      runner,
      maxBytes,
      timeoutMs,
      target,
      query: query!,
      command: "codeql",
    });
  }

  const spawnArgs = options.profile === "semgrep"
    ? buildSemgrepArgs(target.arg, config?.arg ?? "", options.json)
    : options.profile === "trivy"
      ? buildTrivyArgs(target.arg)
      : buildOsvScannerArgs(target.arg);
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
    profile: options.profile,
    root,
    targetPath: target.displayPath,
    configPath: config?.displayPath,
    queryPath: query?.displayPath,
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

export async function runSemgrepScanner(options: RunSecurityScannerOptions): Promise<ScannerRunResult> {
  return runSecurityScanner(options);
}

export function renderScannerRunResult(result: ScannerRunResult, usage = SCANNERS_USAGE): string {
  const lines = [
    "Security scanner run",
    `  profile: ${result.profile}`,
    `  status: ${result.status}`,
    `  root: ${sanitizeInline(result.root)}`,
    `  path: ${sanitizeInline(result.targetPath)}`,
    "  execution: shell_disabled",
    "  env: minimal_no_orx_openrouter_brave_api_token_values",
    "  network: none_by_command_selection",
    "  model_tool: not_exposed",
  ];
  if (result.configPath) {
    lines.splice(5, 0, `  config: ${sanitizeInline(result.configPath)}`);
  }
  if (result.queryPath) {
    lines.splice(result.configPath ? 6 : 5, 0, `  query: ${sanitizeInline(result.queryPath)}`);
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
    lines.push(`  setup: ${scannerMissingMessage(result.profile)}`);
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

function buildTrivyArgs(targetPath: string): string[] {
  return [
    "fs",
    "--scanners",
    "secret",
    "--format",
    "json",
    "--offline-scan",
    "--skip-db-update",
    "--skip-java-db-update",
    "--skip-check-update",
    "--skip-version-check",
    "--disable-telemetry",
    "--no-progress",
    targetPath,
  ];
}

function buildOsvScannerArgs(targetPath: string): string[] {
  return [
    "scan",
    "source",
    "--recursive",
    "--format",
    "json",
    "--offline",
    "--no-resolve",
    targetPath,
  ];
}

function buildCodeqlArgs(databasePath: string, queryPath: string, outputPath: string): string[] {
  return [
    "database",
    "analyze",
    "--format=sarifv2.1.0",
    `--output=${outputPath}`,
    "--no-download",
    "--no-sarif-add-file-contents",
    "--no-sarif-add-snippets",
    "--sarif-include-query-help=never",
    "--no-print-diagnostics-summary",
    "--no-print-metrics-summary",
    "--threads=0",
    "--",
    databasePath,
    queryPath,
  ];
}

interface RunCodeqlScannerInternalOptions {
  options: RunSecurityScannerOptions;
  root: string;
  env: NodeJS.ProcessEnv;
  runner: ScannerProcessRunner;
  maxBytes: number;
  timeoutMs: number;
  target: ResolvedScannerPath;
  query: ResolvedScannerPath;
  command: "codeql";
}

async function runCodeqlScanner(context: RunCodeqlScannerInternalOptions): Promise<ScannerRunResult> {
  const tempDir = mkdtempSync(join(tmpdir(), "orx-codeql-sarif-"));
  const outputPath = join(tempDir, "results.sarif");
  const spawnArgs = buildCodeqlArgs(context.target.arg, context.query.arg, outputPath);

  try {
    const result = await context.runner({
      command: context.command,
      args: spawnArgs,
      cwd: context.root,
      env: context.env,
      inheritEnv: false,
      shell: false,
      timeoutMs: context.timeoutMs,
      maxBytes: context.maxBytes,
    });
    let stdout = context.options.json ? sanitizeJsonProcessOutput(result.stdout) : sanitizeProcessOutput(result.stdout);
    let stdoutTruncation = result.stdoutTruncation;
    let status = classifySemgrepRun(result);
    let message = result.error ? sanitizeInline(result.error.message) : undefined;

    if (!result.timedOut && !result.error && result.exitCode === 0) {
      if (safeIsFile(outputPath)) {
        const sarif = readBoundedTextFile(outputPath, context.maxBytes);
        const rendered = context.options.json
          ? sanitizeJsonProcessOutput(sarif.text)
          : renderCodeqlSarifSummary(sarif.text, sarif.truncation.truncated);
        const truncated = truncateText(rendered, { maxBytes: context.maxBytes });
        stdout = truncated.text;
        stdoutTruncation = mergeSourceTruncation(truncated.truncation, sarif.truncation);
      } else {
        status = "process_error";
        message = "CodeQL did not produce the expected SARIF output file.";
      }
    }

    return {
      ok: status === "ok",
      status,
      profile: "codeql",
      root: context.root,
      targetPath: context.target.displayPath,
      queryPath: context.query.displayPath,
      json: context.options.json,
      command: context.command,
      args: spawnArgs,
      commandLine: formatCommandLine(context.command, spawnArgs),
      exitCode: result.exitCode,
      signal: result.signal,
      timedOut: result.timedOut,
      durationMs: result.durationMs,
      stdout,
      stderr: sanitizeProcessOutput(result.stderr),
      stdoutTruncation,
      stderrTruncation: result.stderrTruncation,
      message,
    };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function readBoundedTextFile(filePath: string, maxBytes: number): { text: string; truncation: TextTruncation } {
  const stats = statSync(filePath);
  const readLimit = Math.min(stats.size, Math.max(0, maxBytes + 4));
  const buffer = Buffer.alloc(readLimit);
  let bytesRead = 0;

  if (readLimit > 0) {
    const fd = openSync(filePath, "r");
    try {
      while (bytesRead < readLimit) {
        const next = readSync(fd, buffer, bytesRead, readLimit - bytesRead, bytesRead);
        if (next === 0) {
          break;
        }
        bytesRead += next;
      }
    } finally {
      closeSync(fd);
    }
  }

  const truncated = truncateText(buffer.subarray(0, bytesRead).toString("utf8"), { maxBytes });
  const originalLines = Math.max(
    truncated.truncation.originalLines + (stats.size > bytesRead ? 1 : 0),
    truncated.truncation.returnedLines,
  );
  return {
    text: truncated.text,
    truncation: {
      truncated: truncated.truncation.truncated || stats.size > truncated.truncation.returnedBytes,
      originalBytes: stats.size,
      returnedBytes: truncated.truncation.returnedBytes,
      originalLines,
      returnedLines: truncated.truncation.returnedLines,
      omittedBytes: Math.max(0, stats.size - truncated.truncation.returnedBytes),
      omittedLines: Math.max(0, originalLines - truncated.truncation.returnedLines),
    },
  };
}

function mergeSourceTruncation(rendered: TextTruncation, source: TextTruncation): TextTruncation {
  if (!source.truncated) {
    return rendered;
  }
  const originalBytes = Math.max(rendered.originalBytes, source.originalBytes);
  const originalLines = Math.max(rendered.originalLines, source.originalLines);
  return {
    truncated: true,
    originalBytes,
    returnedBytes: rendered.returnedBytes,
    originalLines,
    returnedLines: rendered.returnedLines,
    omittedBytes: Math.max(0, originalBytes - rendered.returnedBytes),
    omittedLines: Math.max(0, originalLines - rendered.returnedLines),
  };
}

async function resolveScannerCommand(
  profile: "semgrep" | "trivy" | "codeql" | "osv-scanner",
  cwd: string,
  env: NodeJS.ProcessEnv,
  runner: ScannerProcessRunner,
): Promise<{ ok: true; command: "semgrep" | "trivy" | "codeql" | "osv-scanner" } | { ok: false; message: string }> {
  if (profile === "semgrep") {
    return resolveSemgrepCommand(cwd, env, runner);
  }
  if (profile === "trivy") {
    return resolveTrivyCommand(cwd, env, runner);
  }
  if (profile === "osv-scanner") {
    return resolveOsvScannerCommand(cwd, env, runner);
  }
  return resolveCodeqlCommand(cwd, env, runner);
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
    return { ok: false, message: scannerMissingMessage("semgrep") };
  }
  return {
    ok: false,
    message: `Semgrep was found but did not respond to --version successfully. ${scannerMissingMessage("semgrep")}`,
  };
}

async function resolveTrivyCommand(
  cwd: string,
  env: NodeJS.ProcessEnv,
  runner: ScannerProcessRunner,
): Promise<{ ok: true; command: "trivy" } | { ok: false; message: string }> {
  const result = await runner({
    command: "trivy",
    args: ["--version"],
    cwd,
    env,
    inheritEnv: false,
    shell: false,
    timeoutMs: SCANNER_DISCOVERY_TIMEOUT_MS,
    maxBytes: SCANNER_DISCOVERY_BYTES,
  });
  if (result.exitCode === 0) {
    return { ok: true, command: "trivy" };
  }
  if (result.error && isCommandMissingError(result.error)) {
    return { ok: false, message: scannerMissingMessage("trivy") };
  }
  return {
    ok: false,
    message: `Trivy was found but did not respond to --version successfully. ${scannerMissingMessage("trivy")}`,
  };
}

async function resolveCodeqlCommand(
  cwd: string,
  env: NodeJS.ProcessEnv,
  runner: ScannerProcessRunner,
): Promise<{ ok: true; command: "codeql" } | { ok: false; message: string }> {
  const result = await runner({
    command: "codeql",
    args: ["--version"],
    cwd,
    env,
    inheritEnv: false,
    shell: false,
    timeoutMs: SCANNER_DISCOVERY_TIMEOUT_MS,
    maxBytes: SCANNER_DISCOVERY_BYTES,
  });
  if (result.exitCode === 0) {
    return { ok: true, command: "codeql" };
  }
  if (result.error && isCommandMissingError(result.error)) {
    return { ok: false, message: scannerMissingMessage("codeql") };
  }
  return {
    ok: false,
    message: `CodeQL was found but did not respond to --version successfully. ${scannerMissingMessage("codeql")}`,
  };
}

async function resolveOsvScannerCommand(
  cwd: string,
  env: NodeJS.ProcessEnv,
  runner: ScannerProcessRunner,
): Promise<{ ok: true; command: "osv-scanner" } | { ok: false; message: string }> {
  const result = await runner({
    command: "osv-scanner",
    args: ["--version"],
    cwd,
    env,
    inheritEnv: false,
    shell: false,
    timeoutMs: SCANNER_DISCOVERY_TIMEOUT_MS,
    maxBytes: SCANNER_DISCOVERY_BYTES,
  });
  if (result.exitCode === 0) {
    return { ok: true, command: "osv-scanner" };
  }
  if (result.error && isCommandMissingError(result.error)) {
    return { ok: false, message: scannerMissingMessage("osv-scanner") };
  }
  return {
    ok: false,
    message: `OSV-Scanner was found but did not respond to --version successfully. ${scannerMissingMessage("osv-scanner")}`,
  };
}

function resolveScannerPath(
  cwd: string,
  value: string,
  label: "path" | "config" | "query",
  options: { mustExist: boolean; mustBeFile?: boolean; mustBeDirectory?: boolean; mustBeFileOrDirectory?: boolean },
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
  if (options.mustBeDirectory) {
    const directoryPath = realResolved ?? resolved;
    if (!safeIsDirectory(directoryPath)) {
      return { ok: false, message: `${label} must be a regular local directory.` };
    }
  }
  if (options.mustBeFileOrDirectory) {
    const targetPath = realResolved ?? resolved;
    if (!safeIsFile(targetPath) && !safeIsDirectory(targetPath)) {
      return { ok: false, message: `${label} must be a regular local file or directory.` };
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
  options: RunSecurityScannerOptions,
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
    queryPath: options.queryPath,
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
    return `${JSON.stringify(redactScannerJson(parsed))}\n`;
  } catch {
    return sanitizeProcessOutput(stripped);
  }
}

function renderCodeqlSarifSummary(value: string, sourceTruncated = false): string {
  if (sourceTruncated) {
    return [
      "CodeQL SARIF summary",
      "runs: unavailable (SARIF output exceeded ORX output byte limit)",
      "results: unavailable (SARIF output exceeded ORX output byte limit)",
      "rules: unavailable (SARIF output exceeded ORX output byte limit)",
    ].join("\n") + "\n";
  }
  try {
    const parsed = JSON.parse(value) as { runs?: Array<{ results?: unknown[]; tool?: { driver?: { rules?: unknown[] } } }> };
    const runs = Array.isArray(parsed.runs) ? parsed.runs : [];
    const results = runs.reduce((sum, run) => sum + (Array.isArray(run.results) ? run.results.length : 0), 0);
    const rules = runs.reduce(
      (sum, run) => sum + (Array.isArray(run.tool?.driver?.rules) ? run.tool.driver.rules.length : 0),
      0,
    );
    return [
      "CodeQL SARIF summary",
      `runs: ${runs.length}`,
      `results: ${results}`,
      `rules: ${rules}`,
    ].join("\n") + "\n";
  } catch {
    return sanitizeProcessOutput(value);
  }
}

function redactScannerJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactScannerJson(item));
  }
  if (value && typeof value === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      sanitized[key] = SENSITIVE_JSON_KEY_PATTERN.test(key) && !SAFE_SCANNER_JSON_KEY_EXCEPTIONS.test(key)
        ? "[redacted]"
        : redactScannerJson(nestedValue);
    }
    return sanitized;
  }
  if (typeof value === "string") {
    return redactSecrets(value);
  }
  return value;
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

function scannerMissingMessage(profile: ScannerProfileId): string {
  if (profile === "codeql") {
    return "CodeQL is not installed or not on PATH. Install the CodeQL CLI yourself, ensure `codeql` is available locally, and rerun with an explicit local database directory plus --query path under the current working directory.";
  }
  if (profile === "osv-scanner") {
    return "OSV-Scanner is not installed or not on PATH. Install OSV-Scanner yourself, ensure `osv-scanner` is available locally, pre-cache offline vulnerability data yourself, and rerun with an explicit local target path under the current working directory.";
  }
  if (profile === "trivy") {
    return "Trivy is not installed or not on PATH. Install Trivy yourself, ensure `trivy` is available locally, and rerun with an explicit local target path under the current working directory.";
  }
  return "Semgrep is not installed or not on PATH. Install Semgrep yourself, ensure `semgrep` is available locally, and rerun with an explicit local --config file under the current working directory.";
}

function scannerPlanBoundaries(): ScannerSetupPlan["boundaries"] {
  return {
    execution: "none",
    processSpawn: "none",
    network: "none",
    stateWrites: "none",
    modelTool: "not_exposed",
  };
}

function runnableScannerCommandForProfile(profile: RunnableScannerProfileId): string {
  if (profile === "semgrep") {
    return "orx scanners run semgrep <path> --config <local-config-path> [--json]";
  }
  if (profile === "trivy") {
    return "orx scanners run trivy <path> [--json]";
  }
  if (profile === "codeql") {
    return "orx scanners run codeql <database-dir> --query <local-query-or-suite> [--json]";
  }
  return "orx scanners run osv-scanner <path> [--json]";
}

function futureScannerIntegrationForProfile(profile: ScannerProfileId): string | undefined {
  if (profile === "snyk") {
    return "prove a noninteractive local Snyk command shape with no auth, no network, no telemetry, cwd-confined inputs, cleaned env, bounded/redacted output, and explicit denial tests before enabling runs";
  }
  if (profile === "socket") {
    return "prove a noninteractive local Socket command shape with no auth, no network, no package-manager side effects, cwd-confined manifest inputs, cleaned env, bounded/redacted output, and explicit denial tests before enabling runs";
  }
  return undefined;
}

function catalogOnlyScannerBlockers(profile: ScannerProfileId): string[] {
  if (profile === "snyk") {
    return [
      "no deterministic no-network/no-auth command shape has been accepted",
      "cwd-confined manifest or SBOM input guards and output parsing are not implemented",
      "auth, telemetry, update, policy-file, and environment denial tests are not implemented",
    ];
  }
  if (profile === "socket") {
    return [
      "no deterministic local dependency-risk command shape has been accepted",
      "cwd-confined manifest or package-manager input guards and output parsing are not implemented",
      "auth, telemetry, package-manager side-effect, and network/update denial tests are not implemented",
    ];
  }
  return [];
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

function safeIsDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
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
