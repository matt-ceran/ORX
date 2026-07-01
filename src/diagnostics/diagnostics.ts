import { createHash } from "node:crypto";
import { existsSync, lstatSync, realpathSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { redactSecrets } from "../mcp/audit.js";
import { runProcess, type RunProcessOptions, type RunProcessResult } from "../tools/process.js";
import type { TextTruncation } from "../tools/types.js";

export const DIAGNOSTICS_USAGE =
  "Usage: orx diagnostics [list [--json]|inspect <profile> [--json]|run <typescript|pyright|eslint|ruff|gopls|clangd> [--project <local-project-path>] [--json]]";
export const DIAG_USAGE =
  "Usage: orx diag [list [--json]|inspect <profile> [--json]|run <typescript|pyright|eslint|ruff|gopls|clangd> [--project <local-project-path>] [--json]]";
export const SLASH_DIAGNOSTICS_USAGE =
  "Usage: /diagnostics [list [--json]|inspect <profile> [--json]|run <typescript|pyright|eslint|ruff|gopls|clangd> [--project <local-project-path>] [--json]]";
export const SLASH_DIAG_USAGE =
  "Usage: /diag [list [--json]|inspect <profile> [--json]|run <typescript|pyright|eslint|ruff|gopls|clangd> [--project <local-project-path>] [--json]]";

export type DiagnosticProfileId =
  | "typescript"
  | "typescript-language-server"
  | "pyright"
  | "eslint"
  | "ruff"
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

export type RunnableDiagnosticProfileId = "typescript" | "pyright" | "eslint" | "ruff" | "gopls" | "clangd";

export interface LocalDiagnosticsArgs {
  profile: RunnableDiagnosticProfileId;
  projectPath: string;
  json: boolean;
}

export type TypeScriptDiagnosticsArgs = LocalDiagnosticsArgs;

export type DiagnosticRunParseResult =
  | { ok: true; args: LocalDiagnosticsArgs }
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
  severity: "error" | "warning" | "message" | "information";
  code: string;
  message: string;
}

export type DiagnosticsProcessRunner = (options: RunProcessOptions) => Promise<RunProcessResult>;

export interface RunLocalDiagnosticsOptions extends LocalDiagnosticsArgs {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  runner?: DiagnosticsProcessRunner;
  timeoutMs?: number;
  maxBytes?: number;
}

export type RunTypeScriptDiagnosticsOptions = RunLocalDiagnosticsOptions;

export interface LocalDiagnosticsResult {
  ok: boolean;
  status: DiagnosticRunStatus;
  profile: RunnableDiagnosticProfileId;
  root: string;
  projectPath: string;
  json: boolean;
  command?: string;
  commandSource?: "local_node_modules" | "local_venv" | "path";
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

export type TypeScriptDiagnosticsResult = LocalDiagnosticsResult;

interface ResolvedDiagnosticPath {
  arg: string;
  displayPath: string;
}

interface ResolvedDiagnosticCommand {
  ok: true;
  command: string;
  source: "local_node_modules" | "local_venv" | "path";
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
    state: "runnable",
    binary: "pyright",
    summary: "Local Python diagnostics using an already-installed Pyright binary.",
    runSupport: "runnable only through `run pyright [--project <local-project-file-or-directory>] [--json]`",
    networkBoundary: "no installs, package-manager calls, MCP calls, network calls, or model exposure",
  },
  {
    id: "eslint",
    label: "ESLint",
    state: "runnable",
    binary: "eslint",
    summary: "Local JavaScript/TypeScript lint diagnostics using an already-installed ESLint binary.",
    runSupport: "runnable only through `run eslint [--project <local-file-or-directory>] [--json]`",
    networkBoundary: "no installs, package-manager calls, MCP calls, network calls, or model exposure by command selection",
  },
  {
    id: "ruff",
    label: "Ruff",
    state: "runnable",
    binary: "ruff",
    summary: "Local Python lint diagnostics using an already-installed Ruff binary.",
    runSupport: "runnable only through `run ruff [--project <local-file-or-directory>] [--json]`",
    networkBoundary: "no installs, package-manager calls, MCP calls, network calls, or model exposure by command selection",
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
    state: "runnable",
    binary: "gopls",
    summary: "Local Go diagnostics using an already-installed gopls binary.",
    runSupport: "runnable only through `run gopls --project <local-go-file> [--json]`",
    networkBoundary: "no installs, package-manager calls, MCP calls, model exposure, or Go proxy/checksum/toolchain downloads by command selection",
  },
  {
    id: "clangd",
    label: "clangd",
    state: "runnable",
    binary: "clangd",
    summary: "Local C/C++/Objective-C diagnostics using an already-installed clangd binary.",
    runSupport: "runnable only through `run clangd --project <local-c-cpp-source-or-header-file> [--json]`",
    networkBoundary: "no installs, package-manager calls, MCP calls, network calls, or model exposure",
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
const RUNNABLE_PROFILE_IDS = new Set<RunnableDiagnosticProfileId>(["typescript", "pyright", "eslint", "ruff", "gopls", "clangd"]);
const DEFAULT_TYPESCRIPT_TIMEOUT_MS = 120_000;
const DEFAULT_PYRIGHT_TIMEOUT_MS = 120_000;
const DEFAULT_ESLINT_TIMEOUT_MS = 120_000;
const DEFAULT_RUFF_TIMEOUT_MS = 120_000;
const DEFAULT_GOPLS_TIMEOUT_MS = 120_000;
const DEFAULT_CLANGD_TIMEOUT_MS = 120_000;
const DEFAULT_DIAGNOSTIC_OUTPUT_BYTES = 128 * 1024;
const TSC_DISCOVERY_TIMEOUT_MS = 5_000;
const PYRIGHT_DISCOVERY_TIMEOUT_MS = 5_000;
const ESLINT_DISCOVERY_TIMEOUT_MS = 5_000;
const RUFF_DISCOVERY_TIMEOUT_MS = 5_000;
const GOPLS_DISCOVERY_TIMEOUT_MS = 5_000;
const CLANGD_DISCOVERY_TIMEOUT_MS = 5_000;
const TSC_DISCOVERY_BYTES = 8 * 1024;
const PYRIGHT_DISCOVERY_BYTES = 8 * 1024;
const ESLINT_DISCOVERY_BYTES = 8 * 1024;
const RUFF_DISCOVERY_BYTES = 8 * 1024;
const GOPLS_DISCOVERY_BYTES = 8 * 1024;
const CLANGD_DISCOVERY_BYTES = 8 * 1024;
const MAX_DIAGNOSTIC_PATH_LENGTH = 4096;
const MAX_DIAGNOSTIC_PROFILE_LENGTH = 120;
const CLANGD_SOURCE_EXTENSIONS = new Set([
  ".c",
  ".cc",
  ".cpp",
  ".cxx",
  ".h",
  ".hh",
  ".hpp",
  ".hxx",
  ".m",
  ".mm",
]);
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

export function renderDiagnosticProfilesJson(profiles = listDiagnosticProfiles()): string {
  return JSON.stringify({
    schema_version: 1,
    surface: "orx.local_diagnostics_profiles",
    operator_only: true,
    model_tool: "not_exposed",
    execution: "explicit_operator_only",
    network: "none_for_list_or_inspect",
    profiles: profiles.map(diagnosticProfileJson),
  }, null, 2);
}

function diagnosticProfileJson(profile: DiagnosticProfile): Record<string, unknown> {
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
    details: diagnosticProfileJsonDetails(profile),
  };
}

function diagnosticProfileJsonDetails(profile: DiagnosticProfile): Record<string, string> | undefined {
  if (profile.id === "typescript") {
    return {
      default_project: "tsconfig.json under cwd",
      command_shape: "tsc --noEmit --pretty false --project <tsconfig>",
      binary_preference: "cwd/node_modules/.bin/tsc before PATH tsc",
      project_guard: "local regular file under cwd; symlink realpath must remain under cwd",
      rejected_projects: "URLs, registry/package-like values, dash-prefixed values, symlink escapes, secrets, and control characters",
      output: "bounded and redacted; --json emits ORX-owned structured JSON",
      run: "orx diagnostics run typescript [--project <local-tsconfig-path>] [--json]",
    };
  }
  if (profile.id === "pyright") {
    return {
      default_project: ". under cwd",
      command_shape: "pyright --outputjson --project <project-file-or-directory>",
      binary_preference: "cwd/node_modules/.bin/pyright before PATH pyright",
      project_guard: "local regular file or directory under cwd; symlink realpath must remain under cwd",
      rejected_projects: "URLs, registry/package-like values, dash-prefixed values, symlink escapes, secrets, and control characters",
      output: "bounded and redacted; --json emits ORX-owned structured JSON with parsed generalDiagnostics",
      run: "orx diagnostics run pyright [--project <local-project-file-or-directory>] [--json]",
    };
  }
  if (profile.id === "eslint") {
    return {
      default_project: ". under cwd",
      command_shape: "eslint --format json <file-or-directory>",
      binary_preference: "cwd/node_modules/.bin/eslint before PATH eslint",
      project_guard: "local regular file or directory under cwd; symlink realpath must remain under cwd",
      rejected_projects: "URLs, registry/package-like values, dash-prefixed values, symlink escapes, secrets, and control characters",
      output: "bounded and redacted; --json emits ORX-owned structured JSON with parsed ESLint messages",
      run: "orx diagnostics run eslint [--project <local-file-or-directory>] [--json]",
    };
  }
  if (profile.id === "ruff") {
    return {
      default_project: ". under cwd",
      command_shape: "ruff check --output-format json --no-cache <file-or-directory>",
      binary_preference: "cwd/node_modules/.bin/ruff, then cwd/.venv/bin/ruff or cwd/venv/bin/ruff, before PATH ruff",
      project_guard: "local regular file or directory under cwd; symlink realpath must remain under cwd",
      rejected_projects: "URLs, registry/package-like values, dash-prefixed values, symlink escapes, secrets, and control characters",
      output: "bounded and redacted; --json emits ORX-owned structured JSON with parsed Ruff diagnostics",
      run: "orx diagnostics run ruff [--project <local-file-or-directory>] [--json]",
    };
  }
  if (profile.id === "gopls") {
    return {
      default_project: "none; --project <local-go-file> is required",
      command_shape: "gopls check <go-file>",
      binary_preference: "cwd/node_modules/.bin/gopls before PATH gopls",
      project_guard: "local regular .go file under cwd; symlink realpath must remain under cwd",
      rejected_projects: "URLs, registry/package-like values, dash-prefixed values, symlink escapes, secrets, and control characters",
      output: "bounded and redacted; --json emits ORX-owned structured JSON with parsed text diagnostics",
      go_network_guard: "GOPROXY=off GOSUMDB=off GOTOOLCHAIN=local",
      run: "orx diagnostics run gopls --project <local-go-file> [--json]",
    };
  }
  if (profile.id === "clangd") {
    return {
      default_project: "none; --project <local-c-cpp-source-or-header-file> is required",
      command_shape: "clangd --log=error --check=<file>",
      binary_preference: "cwd/node_modules/.bin/clangd before PATH clangd",
      project_guard: "local regular C/C++/Objective-C source or header file under cwd; symlink realpath must remain under cwd",
      rejected_projects: "URLs, registry/package-like values, dash-prefixed values, symlink escapes, secrets, and control characters",
      output: "bounded and redacted; --json emits ORX-owned structured JSON with parsed clangd --check diagnostics",
      run: "orx diagnostics run clangd --project <local-c-cpp-source-or-header-file> [--json]",
    };
  }
  return undefined;
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
  if (profile.id === "pyright") {
    lines.push(
      "  default_project: . under cwd",
      "  command_shape: pyright --outputjson --project <project-file-or-directory>",
      "  binary_preference: cwd/node_modules/.bin/pyright before PATH pyright",
      "  project_guard: local regular file or directory under cwd; symlink realpath must remain under cwd",
      "  rejected_projects: URLs, registry/package-like values, dash-prefixed values, symlink escapes, secrets, and control characters",
      "  output: bounded and redacted; --json emits ORX-owned structured JSON with parsed generalDiagnostics",
      "  run: orx diagnostics run pyright [--project <local-project-file-or-directory>] [--json]",
    );
  }
  if (profile.id === "eslint") {
    lines.push(
      "  default_project: . under cwd",
      "  command_shape: eslint --format json <file-or-directory>",
      "  binary_preference: cwd/node_modules/.bin/eslint before PATH eslint",
      "  project_guard: local regular file or directory under cwd; symlink realpath must remain under cwd",
      "  rejected_projects: URLs, registry/package-like values, dash-prefixed values, symlink escapes, secrets, and control characters",
      "  output: bounded and redacted; --json emits ORX-owned structured JSON with parsed ESLint messages",
      "  run: orx diagnostics run eslint [--project <local-file-or-directory>] [--json]",
    );
  }
  if (profile.id === "ruff") {
    lines.push(
      "  default_project: . under cwd",
      "  command_shape: ruff check --output-format json --no-cache <file-or-directory>",
      "  binary_preference: cwd/node_modules/.bin/ruff, then cwd/.venv/bin/ruff or cwd/venv/bin/ruff, before PATH ruff",
      "  project_guard: local regular file or directory under cwd; symlink realpath must remain under cwd",
      "  rejected_projects: URLs, registry/package-like values, dash-prefixed values, symlink escapes, secrets, and control characters",
      "  output: bounded and redacted; --json emits ORX-owned structured JSON with parsed Ruff diagnostics",
      "  run: orx diagnostics run ruff [--project <local-file-or-directory>] [--json]",
    );
  }
  if (profile.id === "gopls") {
    lines.push(
      "  default_project: none; --project <local-go-file> is required",
      "  command_shape: gopls check <go-file>",
      "  binary_preference: cwd/node_modules/.bin/gopls before PATH gopls",
      "  project_guard: local regular .go file under cwd; symlink realpath must remain under cwd",
      "  rejected_projects: URLs, registry/package-like values, dash-prefixed values, symlink escapes, secrets, and control characters",
      "  output: bounded and redacted; --json emits ORX-owned structured JSON with parsed text diagnostics",
      "  go_network_guard: GOPROXY=off GOSUMDB=off GOTOOLCHAIN=local",
      "  run: orx diagnostics run gopls --project <local-go-file> [--json]",
    );
  }
  if (profile.id === "clangd") {
    lines.push(
      "  default_project: none; --project <local-c-cpp-source-or-header-file> is required",
      "  command_shape: clangd --log=error --check=<file>",
      "  binary_preference: cwd/node_modules/.bin/clangd before PATH clangd",
      "  project_guard: local regular C/C++/Objective-C source or header file under cwd; symlink realpath must remain under cwd",
      "  rejected_projects: URLs, registry/package-like values, dash-prefixed values, symlink escapes, secrets, and control characters",
      "  output: bounded and redacted; --json emits ORX-owned structured JSON with parsed clangd --check diagnostics",
      "  run: orx diagnostics run clangd --project <local-c-cpp-source-or-header-file> [--json]",
    );
  }

  return lines.join("\n");
}

export function renderDiagnosticProfileInspectJson(profile: DiagnosticProfile): string {
  return JSON.stringify({
    schema_version: 1,
    surface: "orx.local_diagnostics_profile",
    profile: diagnosticProfileJson(profile),
  }, null, 2);
}

export function renderMissingDiagnosticProfile(profileId: string): string {
  return `Unknown diagnostics profile: ${sanitizeInline(profileId)}. Available profiles: ${DIAGNOSTIC_PROFILES.map((profile) => profile.id).join(", ")}.`;
}

export function renderDiagnosticInspectUsage(usage: string): string {
  return usage.replace(
    /\[list(?: \[--json\])?\|inspect <profile>(?: \[--json\])?\|run .+$/,
    "inspect <profile> [--json]",
  );
}

export function parseDiagnosticReadinessJsonFlag(
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
    return { ok: false, message: `${usage}\nUnknown diagnostics option: ${sanitizeInline(option)}` };
  }
  return { ok: false, message: usage };
}

export function parseDiagnosticRunArgs(
  args: string[],
  usage = DIAGNOSTICS_USAGE,
): DiagnosticRunParseResult {
  const positional: string[] = [];
  let projectPath: string | undefined;
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
  if (!RUNNABLE_PROFILE_IDS.has(profile as RunnableDiagnosticProfileId)) {
    return {
      ok: false,
      message: `Diagnostics profile ${profile} is catalog/readiness-only in this slice; no run path is enabled.`,
    };
  }
  const runnableProfile = profile as RunnableDiagnosticProfileId;
  const selectedProjectPath = projectPath ?? defaultProjectPathForProfile(runnableProfile);
  if (!selectedProjectPath) {
    return {
      ok: false,
      message: `${usage}\n${missingProjectMessageForProfile(runnableProfile)}`,
    };
  }
  const projectError = validateProjectPathValue(selectedProjectPath, runnableProfile);
  if (projectError) {
    return { ok: false, message: `${usage}\n${projectError}` };
  }

  return {
    ok: true,
    args: {
      profile: runnableProfile,
      projectPath: selectedProjectPath,
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

export async function runLocalDiagnostics(
  options: RunLocalDiagnosticsOptions,
): Promise<LocalDiagnosticsResult> {
  const root = resolve(options.cwd ?? process.cwd());
  const env = createDiagnosticsEnv(options.env ?? process.env, options.profile);
  const maxBytes = options.maxBytes ?? DEFAULT_DIAGNOSTIC_OUTPUT_BYTES;
  const timeoutMs = options.timeoutMs ?? defaultTimeoutForProfile(options.profile);
  const runner = options.runner ?? runProcess;
  const emptyText = emptyDiagnosticText();

  const project = resolveProjectPath(root, options.projectPath, options.profile);
  if (!project.ok) {
    return invalidDiagnosticsRun(options, root, project.message);
  }

  const command = await resolveDiagnosticCommand(root, env, runner, options.profile);
  if (!command.ok) {
    return {
      ok: false,
      status: "tool_missing",
      profile: options.profile,
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

  const spawnArgs = buildDiagnosticCommandArgs(options.profile, project.arg);
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
  const status = classifyDiagnosticsRun(result);
  const diagnostics = parseDiagnosticsForProfile(options.profile, stdout, stderr, root, project.displayPath);

  return {
    ok: status === "ok",
    status,
    profile: options.profile,
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

export async function runTypeScriptDiagnostics(
  options: RunTypeScriptDiagnosticsOptions,
): Promise<TypeScriptDiagnosticsResult> {
  return runLocalDiagnostics(options);
}

export function renderLocalDiagnosticsResult(
  result: LocalDiagnosticsResult,
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
    lines.push(`  setup: ${diagnosticMissingMessage(result.profile)}`);
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

export function renderTypeScriptDiagnosticsResult(
  result: TypeScriptDiagnosticsResult,
  usage = DIAGNOSTICS_USAGE,
): string {
  return renderLocalDiagnosticsResult(result, usage);
}

export function renderLocalDiagnosticsJson(result: LocalDiagnosticsResult): string {
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

export function renderTypeScriptDiagnosticsJson(result: TypeScriptDiagnosticsResult): string {
  return renderLocalDiagnosticsJson(result);
}

function resolveProjectPath(
  cwd: string,
  value: string,
  profile: RunnableDiagnosticProfileId,
): ({ ok: true } & ResolvedDiagnosticPath) | { ok: false; message: string } {
  const validation = validateProjectPathValue(value, profile);
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
  if (profile === "typescript" && !safeIsFile(realResolved)) {
    return { ok: false, message: "project must be a regular local file." };
  }
  if (profile === "pyright" && !safeIsFile(realResolved) && !safeIsDirectory(realResolved)) {
    return { ok: false, message: "project must be a regular local file or directory." };
  }
  if (profile === "eslint" && !safeIsFile(realResolved) && !safeIsDirectory(realResolved)) {
    return { ok: false, message: "project must be a regular local file or directory." };
  }
  if (profile === "ruff" && !safeIsFile(realResolved) && !safeIsDirectory(realResolved)) {
    return { ok: false, message: "project must be a regular local file or directory." };
  }

  const relativePath = relative(cwd, resolved).split(/[\\/]/g).join("/") || ".";
  if (profile === "gopls") {
    if (!safeIsFile(realResolved)) {
      return { ok: false, message: "project must be a regular local .go file." };
    }
    if (!relativePath.toLowerCase().endsWith(".go")) {
      return { ok: false, message: "project must be a local .go file." };
    }
  }
  if (profile === "clangd") {
    if (!safeIsFile(realResolved)) {
      return { ok: false, message: "project must be a regular local C/C++/Objective-C source or header file." };
    }
    if (!isClangdProjectPath(relativePath)) {
      return { ok: false, message: "project must be a local C/C++/Objective-C source or header file." };
    }
  }
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

async function resolveDiagnosticCommand(
  cwd: string,
  env: NodeJS.ProcessEnv,
  runner: DiagnosticsProcessRunner,
  profile: RunnableDiagnosticProfileId,
): Promise<ResolvedDiagnosticCommand | { ok: false; message: string }> {
  const local = resolveLocalDiagnosticCommand(cwd, profile);
  if (local.ok) {
    return local;
  }
  if (local.message) {
    return { ok: false, message: local.message };
  }

  const binary = diagnosticBinaryForProfile(profile);
  const discoveryArgs = diagnosticDiscoveryArgsForProfile(profile);
  const pathResult = await runner({
    command: binary,
    args: discoveryArgs,
    cwd,
    env,
    inheritEnv: false,
    shell: false,
    timeoutMs: discoveryTimeoutForProfile(profile),
    maxBytes: discoveryBytesForProfile(profile),
  });
  if (pathResult.exitCode === 0) {
    return { ok: true, command: binary, displayCommand: binary, source: "path" };
  }
  if (pathResult.error && isCommandMissingError(pathResult.error)) {
    return { ok: false, message: diagnosticMissingMessage(profile) };
  }
  return {
    ok: false,
    message: `${binary} was found but did not respond to ${formatCommandLine(binary, discoveryArgs)} successfully. ${diagnosticMissingMessage(profile)}`,
  };
}

function resolveLocalDiagnosticCommand(
  cwd: string,
  profile: RunnableDiagnosticProfileId,
): ResolvedDiagnosticCommand | { ok: false; message?: string } {
  const binary = diagnosticBinaryForProfile(profile);
  const localName = process.platform === "win32" ? `${binary}.cmd` : binary;
  const alternateName = process.platform === "win32" ? binary : `${binary}.cmd`;
  const candidates = [`node_modules/.bin/${localName}`, `node_modules/.bin/${alternateName}`];
  const root = safeRealpath(cwd) ?? cwd;
  for (const candidate of candidates) {
    const absolute = resolve(cwd, candidate);
    if (!existsSync(absolute)) {
      continue;
    }
    const real = safeRealpath(absolute);
    if (!real) {
      return { ok: false, message: `Local node_modules/.bin/${binary} exists but could not be resolved.` };
    }
    if (!isPathInside(root, real)) {
      return { ok: false, message: `Local node_modules/.bin/${binary} resolves outside the current working directory.` };
    }
    if (!safeIsFile(real)) {
      return { ok: false, message: `Local node_modules/.bin/${binary} must resolve to a regular file.` };
    }
    return {
      ok: true,
      command: absolute,
      displayCommand: candidate,
      source: "local_node_modules",
    };
  }
  if (profile === "ruff") {
    const venvCandidates = process.platform === "win32"
      ? [".venv/Scripts/ruff.exe", "venv/Scripts/ruff.exe", ".venv/Scripts/ruff.cmd", "venv/Scripts/ruff.cmd"]
      : [".venv/bin/ruff", "venv/bin/ruff"];
    for (const candidate of venvCandidates) {
      const absolute = resolve(cwd, candidate);
      if (!existsSync(absolute)) {
        continue;
      }
      const real = safeRealpath(absolute);
      if (!real) {
        return { ok: false, message: `Local ${candidate} exists but could not be resolved.` };
      }
      if (!isPathInside(root, real)) {
        return { ok: false, message: `Local ${candidate} resolves outside the current working directory.` };
      }
      if (!safeIsFile(real)) {
        return { ok: false, message: `Local ${candidate} must resolve to a regular file.` };
      }
      return {
        ok: true,
        command: absolute,
        displayCommand: candidate,
        source: "local_venv",
      };
    }
  }
  return { ok: false };
}

function validateProjectPathValue(value: string, profile: RunnableDiagnosticProfileId): string | undefined {
  const basic = validateDiagnosticValue("project", value, MAX_DIAGNOSTIC_PATH_LENGTH);
  if (basic) {
    return basic;
  }
  if (isRegistryLikeValue(value)) {
    if (profile === "typescript") {
      return "project must be a local tsconfig file path, not a package, registry, or launcher value.";
    }
    if (profile === "pyright") {
      return "project must be a local Pyright project file or directory, not a package, registry, or launcher value.";
    }
    if (profile === "eslint") {
      return "project must be a local ESLint file or directory, not a package, registry, or launcher value.";
    }
    if (profile === "ruff") {
      return "project must be a local Ruff file or directory, not a package, registry, or launcher value.";
    }
    if (profile === "gopls") {
      return "project must be a local Go file, not a package, registry, or launcher value.";
    }
    return "project must be a local C/C++/Objective-C source or header file, not a package, registry, or launcher value.";
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

function createDiagnosticsEnv(source: NodeJS.ProcessEnv, profile?: RunnableDiagnosticProfileId): NodeJS.ProcessEnv {
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
  if (profile === "gopls") {
    env.GOPROXY = "off";
    env.GOSUMDB = "off";
    env.GOTOOLCHAIN = "local";
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

function classifyDiagnosticsRun(result: RunProcessResult): DiagnosticRunStatus {
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

function parsePyrightDiagnostics(output: string, root: string): ParsedTypeScriptDiagnostic[] {
  const trimmed = output.trim();
  if (!trimmed) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return [];
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.generalDiagnostics)) {
    return [];
  }
  const diagnostics: ParsedTypeScriptDiagnostic[] = [];
  const seen = new Set<string>();
  for (const entry of parsed.generalDiagnostics) {
    if (!isRecord(entry)) {
      continue;
    }
    const range = isRecord(entry.range) ? entry.range : undefined;
    const start = range && isRecord(range.start) ? range.start : undefined;
    const line = toOneBasedNumber(start?.line);
    const column = toOneBasedNumber(start?.character);
    const diagnostic = {
      file: formatDiagnosticFile(entry.file, root),
      line,
      column,
      severity: normalizePyrightSeverity(entry.severity),
      code: typeof entry.rule === "string" && entry.rule.trim() ? sanitizeInline(entry.rule) : "pyright",
      message: typeof entry.message === "string" ? sanitizeInline(entry.message) : "[redacted]",
    };
    const key = JSON.stringify(diagnostic);
    if (!seen.has(key)) {
      seen.add(key);
      diagnostics.push(diagnostic);
    }
  }
  return diagnostics;
}

function parseDiagnosticsForProfile(
  profile: RunnableDiagnosticProfileId,
  stdout: string,
  stderr: string,
  root: string,
  projectPath: string,
): ParsedTypeScriptDiagnostic[] {
  if (profile === "typescript") {
    return parseTypeScriptDiagnostics(`${stdout}\n${stderr}`);
  }
  if (profile === "pyright") {
    return parsePyrightDiagnostics(stdout, root);
  }
  if (profile === "eslint") {
    return parseEslintDiagnostics(stdout, root);
  }
  if (profile === "ruff") {
    return parseRuffDiagnostics(stdout, root);
  }
  if (profile === "gopls") {
    return parseGoplsDiagnostics(`${stdout}\n${stderr}`, root);
  }
  return parseClangdDiagnostics(`${stdout}\n${stderr}`, projectPath);
}

function parseEslintDiagnostics(output: string, root: string): ParsedTypeScriptDiagnostic[] {
  const trimmed = output.trim();
  if (!trimmed) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }

  const diagnostics: ParsedTypeScriptDiagnostic[] = [];
  const seen = new Set<string>();
  for (const fileResult of parsed) {
    if (!isRecord(fileResult) || !Array.isArray(fileResult.messages)) {
      continue;
    }
    const file = formatDiagnosticFile(fileResult.filePath, root);
    for (const message of fileResult.messages) {
      if (!isRecord(message)) {
        continue;
      }
      const diagnostic = {
        file,
        line: toPositiveOneBasedNumber(message.line),
        column: toPositiveOneBasedNumber(message.column),
        severity: normalizeEslintSeverity(message.severity),
        code: typeof message.ruleId === "string" && message.ruleId.trim()
          ? sanitizeInline(message.ruleId)
          : "eslint",
        message: typeof message.message === "string" ? sanitizeInline(message.message) : "[redacted]",
      };
      const key = JSON.stringify(diagnostic);
      if (!seen.has(key)) {
        seen.add(key);
        diagnostics.push(diagnostic);
      }
    }
  }
  return diagnostics;
}

function parseRuffDiagnostics(output: string, root: string): ParsedTypeScriptDiagnostic[] {
  const trimmed = output.trim();
  if (!trimmed) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }

  const diagnostics: ParsedTypeScriptDiagnostic[] = [];
  const seen = new Set<string>();
  for (const entry of parsed) {
    if (!isRecord(entry)) {
      continue;
    }
    const location = isRecord(entry.location) ? entry.location : undefined;
    const diagnostic = {
      file: formatDiagnosticFile(entry.filename, root),
      line: toPositiveOneBasedNumber(location?.row),
      column: toPositiveOneBasedNumber(location?.column),
      severity: "error" as const,
      code: typeof entry.code === "string" && entry.code.trim()
        ? sanitizeInline(entry.code)
        : "ruff",
      message: typeof entry.message === "string" ? sanitizeInline(entry.message) : "[redacted]",
    };
    const key = JSON.stringify(diagnostic);
    if (!seen.has(key)) {
      seen.add(key);
      diagnostics.push(diagnostic);
    }
  }
  return diagnostics;
}

function parseGoplsDiagnostics(output: string, root: string): ParsedTypeScriptDiagnostic[] {
  const diagnostics: ParsedTypeScriptDiagnostic[] = [];
  const seen = new Set<string>();
  for (const rawLine of output.replace(/\r\n|\r/g, "\n").split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    const match = /^(.+?):(\d+):(\d+):\s+(.+)$/.exec(line);
    if (!match) {
      continue;
    }
    const diagnostic = {
      file: formatDiagnosticFile(match[1] ?? "", root),
      line: Number.parseInt(match[2] ?? "1", 10),
      column: Number.parseInt(match[3] ?? "1", 10),
      severity: "error" as const,
      code: "gopls",
      message: sanitizeInline(match[4] ?? ""),
    };
    const key = JSON.stringify(diagnostic);
    if (!seen.has(key)) {
      seen.add(key);
      diagnostics.push(diagnostic);
    }
  }
  return diagnostics;
}

function parseClangdDiagnostics(output: string, projectPath: string): ParsedTypeScriptDiagnostic[] {
  const diagnostics: ParsedTypeScriptDiagnostic[] = [];
  const seen = new Set<string>();
  for (const rawLine of output.replace(/\r\n|\r/g, "\n").split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    const match = /^([EWI])\[[^\]]+\]\s+(?:\[([^\]]+)\]\s+)?Line\s+(\d+)(?::(\d+))?:\s+(.+)$/.exec(line);
    if (!match) {
      continue;
    }
    const diagnostic = {
      file: sanitizeInline(projectPath),
      line: Number.parseInt(match[3] ?? "1", 10),
      column: match[4] ? Number.parseInt(match[4], 10) : 1,
      severity: normalizeClangdSeverity(match[1]),
      code: sanitizeInline(match[2] ?? "clangd"),
      message: sanitizeInline(match[5] ?? ""),
    };
    const key = JSON.stringify(diagnostic);
    if (!seen.has(key)) {
      seen.add(key);
      diagnostics.push(diagnostic);
    }
  }
  return diagnostics;
}

function invalidDiagnosticsRun(
  options: RunLocalDiagnosticsOptions,
  root: string,
  message: string,
): LocalDiagnosticsResult {
  const emptyText = emptyDiagnosticText();
  return {
    ok: false,
    status: "invalid_arguments",
    profile: options.profile,
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

function buildDiagnosticCommandArgs(profile: RunnableDiagnosticProfileId, projectArg: string): string[] {
  if (profile === "typescript") {
    return ["--noEmit", "--pretty", "false", "--project", projectArg];
  }
  if (profile === "pyright") {
    return ["--outputjson", "--project", projectArg];
  }
  if (profile === "eslint") {
    return ["--format", "json", projectArg];
  }
  if (profile === "ruff") {
    return ["check", "--output-format", "json", "--no-cache", projectArg];
  }
  if (profile === "gopls") {
    return ["check", projectArg];
  }
  return ["--log=error", `--check=${projectArg}`];
}

function defaultProjectPathForProfile(profile: RunnableDiagnosticProfileId): string | undefined {
  if (profile === "typescript") {
    return "tsconfig.json";
  }
  if (profile === "pyright") {
    return ".";
  }
  if (profile === "eslint") {
    return ".";
  }
  if (profile === "ruff") {
    return ".";
  }
  return undefined;
}

function defaultTimeoutForProfile(profile: RunnableDiagnosticProfileId): number {
  if (profile === "typescript") {
    return DEFAULT_TYPESCRIPT_TIMEOUT_MS;
  }
  if (profile === "pyright") {
    return DEFAULT_PYRIGHT_TIMEOUT_MS;
  }
  if (profile === "eslint") {
    return DEFAULT_ESLINT_TIMEOUT_MS;
  }
  if (profile === "ruff") {
    return DEFAULT_RUFF_TIMEOUT_MS;
  }
  return profile === "gopls" ? DEFAULT_GOPLS_TIMEOUT_MS : DEFAULT_CLANGD_TIMEOUT_MS;
}

function diagnosticBinaryForProfile(profile: RunnableDiagnosticProfileId): string {
  if (profile === "typescript") {
    return "tsc";
  }
  if (profile === "pyright") {
    return "pyright";
  }
  if (profile === "eslint") {
    return "eslint";
  }
  if (profile === "ruff") {
    return "ruff";
  }
  return profile === "gopls" ? "gopls" : "clangd";
}

function diagnosticDiscoveryArgsForProfile(profile: RunnableDiagnosticProfileId): string[] {
  return profile === "gopls" ? ["version"] : ["--version"];
}

function diagnosticMissingMessage(profile: RunnableDiagnosticProfileId): string {
  if (profile === "typescript") {
    return "tsc is not installed or not on PATH. Install TypeScript locally in this project or make an existing tsc binary available on PATH; ORX will not install it for you.";
  }
  if (profile === "pyright") {
    return "pyright is not installed or not on PATH. Install Pyright locally in this project or make an existing pyright binary available on PATH; ORX will not install it for you.";
  }
  if (profile === "eslint") {
    return "eslint is not installed or not on PATH. Install ESLint locally in this project or make an existing eslint binary available on PATH; ORX will not install it for you.";
  }
  if (profile === "ruff") {
    return "ruff is not installed or not on PATH. Install Ruff locally in this project, project virtualenv, or make an existing ruff binary available on PATH; ORX will not install it for you.";
  }
  if (profile === "gopls") {
    return "gopls is not installed or not on PATH. Install gopls locally for this project or make an existing gopls binary available on PATH; ORX will not install it for you.";
  }
  return "clangd is not installed or not on PATH. Install clangd locally for this project or make an existing clangd binary available on PATH; ORX will not install it for you.";
}

function discoveryTimeoutForProfile(profile: RunnableDiagnosticProfileId): number {
  if (profile === "typescript") {
    return TSC_DISCOVERY_TIMEOUT_MS;
  }
  if (profile === "pyright") {
    return PYRIGHT_DISCOVERY_TIMEOUT_MS;
  }
  if (profile === "eslint") {
    return ESLINT_DISCOVERY_TIMEOUT_MS;
  }
  if (profile === "ruff") {
    return RUFF_DISCOVERY_TIMEOUT_MS;
  }
  return profile === "gopls" ? GOPLS_DISCOVERY_TIMEOUT_MS : CLANGD_DISCOVERY_TIMEOUT_MS;
}

function discoveryBytesForProfile(profile: RunnableDiagnosticProfileId): number {
  if (profile === "typescript") {
    return TSC_DISCOVERY_BYTES;
  }
  if (profile === "pyright") {
    return PYRIGHT_DISCOVERY_BYTES;
  }
  if (profile === "eslint") {
    return ESLINT_DISCOVERY_BYTES;
  }
  if (profile === "ruff") {
    return RUFF_DISCOVERY_BYTES;
  }
  return profile === "gopls" ? GOPLS_DISCOVERY_BYTES : CLANGD_DISCOVERY_BYTES;
}

function normalizePyrightSeverity(value: unknown): ParsedTypeScriptDiagnostic["severity"] {
  if (value === "error" || value === "warning" || value === "information") {
    return value;
  }
  return "message";
}

function normalizeClangdSeverity(value: unknown): ParsedTypeScriptDiagnostic["severity"] {
  if (value === "E") {
    return "error";
  }
  if (value === "W") {
    return "warning";
  }
  if (value === "I") {
    return "information";
  }
  return "message";
}

function normalizeEslintSeverity(value: unknown): ParsedTypeScriptDiagnostic["severity"] {
  return value === 1 ? "warning" : "error";
}

function missingProjectMessageForProfile(profile: RunnableDiagnosticProfileId): string {
  if (profile === "gopls") {
    return "gopls diagnostics require --project <local-go-file>; gopls check accepts file arguments.";
  }
  if (profile === "clangd") {
    return "clangd diagnostics require --project <local-c-cpp-source-or-header-file>; clangd --check accepts one file.";
  }
  return "diagnostics require --project <local-project-path>.";
}

function isClangdProjectPath(value: string): boolean {
  const normalized = value.toLowerCase();
  for (const extension of CLANGD_SOURCE_EXTENSIONS) {
    if (normalized.endsWith(extension)) {
      return true;
    }
  }
  return false;
}

function toOneBasedNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.trunc(value) + 1 : 1;
}

function toPositiveOneBasedNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 1;
}

function formatDiagnosticFile(value: unknown, root: string): string {
  if (typeof value !== "string" || !value.trim()) {
    return "[unknown]";
  }
  const absolute = resolve(value);
  if (isPathInside(root, absolute)) {
    return sanitizeInline(relative(root, absolute).split(/[\\/]/g).join("/") || ".");
  }
  return sanitizeInline(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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

function safeIsDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function isPathInside(root: string, candidate: string): boolean {
  const relativePath = relative(resolve(root), resolve(candidate));
  return relativePath === "" || (!relativePath.startsWith("..") && !relativePath.startsWith("/") && !relativePath.startsWith("\\"));
}
