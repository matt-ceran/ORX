import {
  appendFileSync,
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { redactSecrets } from "../mcp/audit.js";
import { shellTool } from "../tools/shell.js";
import { canonicalJson, sha256 } from "./hash.js";
import {
  loadPluginRegistry,
  loadPluginRegistryReadOnly,
  type InstalledPluginRecord,
  type PluginRegistryIoOptions,
} from "./registry.js";

export type PluginBinRunnerKind = "node" | "shebang" | "sh";

export interface PluginBinRunner {
  kind: PluginBinRunnerKind;
  command: string;
  args: string[];
}

export interface PluginBinDefinition {
  id: string;
  pluginId: string;
  binId: string;
  pluginRoot: string;
  path: string;
  relativePath: string;
  env: string[];
  sizeBytes: number;
  runner: PluginBinRunner;
  manifestHash: string;
  componentHash: string;
  fileHash: string;
  binHash: string;
}

export type PluginBinRunStatus =
  | "ok"
  | "not_found"
  | "untrusted"
  | "pending_hash_change"
  | "cwd_unavailable"
  | "invalid_arguments"
  | "process_error"
  | "exit_nonzero"
  | "timed_out"
  | "audit_failed";

export interface PluginBinOmission {
  pluginId: string;
  path?: string;
  reason: string;
}

export interface PluginBinsDiscovery {
  bins: PluginBinDefinition[];
  omissions: PluginBinOmission[];
  truncated: boolean;
}

export interface PluginBinTrustRecord {
  id: string;
  binHash: string;
  trustedAt: string;
}

export interface PluginBinsTrustConfig {
  version: 1;
  bins: Record<string, PluginBinTrustRecord>;
}

export interface PluginBinTrustSummary {
  binCount: number;
  trustedCount: number;
  pendingTrustCount: number;
  untrustedCount: number;
  truncated: boolean;
  omissionCount: number;
}

export interface PluginBinTrustResult {
  ok: boolean;
  bin?: PluginBinDefinition;
  trustedAt?: string;
  previousTrustedHash?: string;
  message: string;
}

export interface PluginBinRunResult {
  ok: boolean;
  executed: boolean;
  status: PluginBinRunStatus;
  bin?: PluginBinDefinition;
  message: string;
  cwd?: string;
  envNames: string[];
  runner?: PluginBinRunnerKind;
  argCount: number;
  timeoutMs?: number;
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
  stdout?: string;
  stderr?: string;
  stdoutTruncated?: boolean;
  stderrTruncated?: boolean;
  durationMs?: number;
  timedOut?: boolean;
  auditLogPath: string;
  auditError?: string;
}

export type PluginBinAuditEventType = "plugin.bin.run";

export interface PluginBinAuditEvent {
  type: PluginBinAuditEventType;
  binId?: string;
  pluginId?: string;
  binHash?: string;
  ok: boolean;
  details?: Record<string, unknown>;
  timestamp?: string;
}

export interface PluginBinPathOptions {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  configPath?: string;
  auditLogPath?: string;
}

export interface PluginBinOptions extends PluginRegistryIoOptions {
  configPath?: string;
}

export interface PluginBinRunOptions extends PluginBinOptions {
  auditLogPath?: string;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  signal?: AbortSignal;
}

const BIN_CONFIG_VERSION = 1;
const BIN_DIRECTORY_MODE = 0o700;
const BIN_FILE_MODE = 0o600;
const MAX_PLUGIN_BINS = 128;
const MAX_BIN_FILE_BYTES = 2 * 1024 * 1024;
const MAX_BIN_OUTPUT_BYTES = 32 * 1024;
const MAX_BIN_ARGS = 64;
const MAX_BIN_ARG_LENGTH = 1024;
const MAX_RUNTIME_HASH_DEPTH = 40;
const MAX_RUNTIME_HASH_ENTRIES = 8192;
const MAX_RUNTIME_HASH_BYTES = 64 * 1024 * 1024;
const MAX_RUNTIME_HASH_FILE_BYTES = 8 * 1024 * 1024;
const DEFAULT_BIN_TIMEOUT_MS = 60_000;
const BIN_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,79}$/;
const SAFE_SHEBANG_TOKEN_PATTERN = /^[A-Za-z0-9_./:+@%=-]{1,256}$/;
const CONTROL_CHAR_PATTERN = /[\x00-\x1F\x7F]/;
const OUTPUT_CONTROL_CHAR_PATTERN = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;
const ANSI_PATTERN = /\x1B\[[0-?]*[ -/]*[@-~]/g;
const SECRET_LIKE_PATTERN =
  /\b(?:bearer\s+[A-Za-z0-9._~+/=-]{8,}|authorization:\s*bearer\s+[A-Za-z0-9._~+/=-]{8,}|(?:access[_-]?token|api[_-]?key|token|key|secret)\s*[=:]\s*[A-Za-z0-9._~+/=-]{4,}|sk-or-v1-[A-Za-z0-9_-]+|github_pat_[A-Za-z0-9_]+|ghp_[A-Za-z0-9_]+|glpat-[A-Za-z0-9_-]+|xox[baprs]-[A-Za-z0-9-]+)\b/i;
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;

export function defaultPluginBinsConfigPath(): string {
  return join(homedir(), ".orx", "plugins", "bins.json");
}

export function defaultPluginBinsAuditLogPath(): string {
  return join(homedir(), ".orx", "audit", "bins.jsonl");
}

export function resolvePluginBinsConfigPath(options: PluginBinPathOptions = {}): string {
  const explicitPath = options.configPath ?? options.env?.ORX_PLUGIN_BINS_CONFIG_PATH;
  if (!explicitPath) {
    return defaultPluginBinsConfigPath();
  }

  return resolve(options.cwd ?? process.cwd(), explicitPath);
}

export function resolvePluginBinsAuditLogPath(options: PluginBinPathOptions = {}): string {
  const explicitPath = options.auditLogPath ?? options.env?.ORX_PLUGIN_BINS_AUDIT_PATH;
  if (!explicitPath) {
    return defaultPluginBinsAuditLogPath();
  }

  return resolve(options.cwd ?? process.cwd(), explicitPath);
}

export function writePluginBinAuditEvent(
  event: PluginBinAuditEvent,
  options: { auditLogPath?: string; now?: () => Date } = {},
): void {
  const path = options.auditLogPath ?? defaultPluginBinsAuditLogPath();
  const timestamp = event.timestamp ?? (options.now?.() ?? new Date()).toISOString();
  const sanitized = redactSecrets({
    timestamp,
    type: event.type,
    binId: event.binId,
    pluginId: event.pluginId,
    binHash: event.binHash,
    ok: event.ok,
    details: event.details,
  });
  const parent = dirname(path);
  const parentExisted = existsSync(parent);

  mkdirSync(parent, { recursive: true, mode: BIN_DIRECTORY_MODE });
  if (!parentExisted || resolve(path) === resolve(defaultPluginBinsAuditLogPath())) {
    chmodSync(parent, BIN_DIRECTORY_MODE);
  }
  appendFileSync(path, `${JSON.stringify(sanitized)}\n`, {
    encoding: "utf8",
    mode: BIN_FILE_MODE,
  });
  chmodSync(path, BIN_FILE_MODE);
}

export function emptyPluginBinsTrustConfig(): PluginBinsTrustConfig {
  return {
    version: BIN_CONFIG_VERSION,
    bins: {},
  };
}

export function loadPluginBinsTrustConfig(
  options: { configPath?: string } = {},
): PluginBinsTrustConfig {
  const path = options.configPath ?? defaultPluginBinsConfigPath();
  if (!existsSync(path)) {
    return emptyPluginBinsTrustConfig();
  }

  try {
    tightenBinTrustPermissions(path);
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return sanitizePluginBinsTrustConfig(parsed);
  } catch {
    return emptyPluginBinsTrustConfig();
  }
}

export function loadPluginBinsTrustConfigReadOnly(
  options: { configPath?: string } = {},
): PluginBinsTrustConfig {
  const path = options.configPath ?? defaultPluginBinsConfigPath();
  if (!existsSync(path)) {
    return emptyPluginBinsTrustConfig();
  }

  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return sanitizePluginBinsTrustConfig(parsed);
  } catch {
    return emptyPluginBinsTrustConfig();
  }
}

export function savePluginBinsTrustConfig(
  config: PluginBinsTrustConfig,
  options: { configPath?: string } = {},
): void {
  const path = options.configPath ?? defaultPluginBinsConfigPath();
  const sanitized = sanitizePluginBinsTrustConfig(config);
  const parent = dirname(path);
  const parentExisted = existsSync(parent);
  mkdirSync(parent, { recursive: true, mode: BIN_DIRECTORY_MODE });
  if (!parentExisted || resolve(path) === resolve(defaultPluginBinsConfigPath())) {
    chmodSync(parent, BIN_DIRECTORY_MODE);
  }
  writeFileSync(path, `${JSON.stringify(sanitized, null, 2)}\n`, {
    encoding: "utf8",
    mode: BIN_FILE_MODE,
  });
  chmodSync(path, BIN_FILE_MODE);
}

export function discoverEnabledPluginBins(
  options: PluginRegistryIoOptions = {},
): PluginBinsDiscovery {
  const registry = options.readOnly
    ? loadPluginRegistryReadOnly({ registryPath: options.registryPath })
    : loadPluginRegistry({ registryPath: options.registryPath });
  const enabledPlugins = Object.values(registry.plugins)
    .filter((plugin) => plugin.enabled)
    .sort((left, right) => left.id.localeCompare(right.id));
  const bins: PluginBinDefinition[] = [];
  const omissions: PluginBinOmission[] = [];
  let truncated = false;

  for (const plugin of enabledPlugins) {
    if (bins.length >= MAX_PLUGIN_BINS) {
      truncated = true;
      omissions.push({
        pluginId: plugin.id,
        reason: "maximum enabled plugin bin count reached",
      });
      break;
    }

    const componentPath = plugin.manifest.components.bins;
    if (!componentPath) {
      continue;
    }

    const discovered = discoverPluginBins(plugin, componentPath, MAX_PLUGIN_BINS - bins.length);
    bins.push(...discovered.bins);
    omissions.push(...discovered.omissions);
    truncated = truncated || discovered.truncated;
  }

  return {
    bins: bins.sort((left, right) => left.id.localeCompare(right.id)),
    omissions,
    truncated,
  };
}

export function getPluginBinTrustSummary(options: PluginBinOptions = {}): PluginBinTrustSummary {
  const discovery = discoverEnabledPluginBins({ registryPath: options.registryPath });
  if (discovery.bins.length === 0) {
    return {
      binCount: 0,
      trustedCount: 0,
      pendingTrustCount: 0,
      untrustedCount: 0,
      truncated: discovery.truncated,
      omissionCount: discovery.omissions.length,
    };
  }

  const trust = loadPluginBinsTrustConfig({ configPath: options.configPath });
  let trustedCount = 0;
  let pendingTrustCount = 0;

  for (const bin of discovery.bins) {
    const record = trust.bins[bin.id];
    if (record?.binHash === bin.binHash) {
      trustedCount += 1;
    } else if (record) {
      pendingTrustCount += 1;
    }
  }

  return {
    binCount: discovery.bins.length,
    trustedCount,
    pendingTrustCount,
    untrustedCount: discovery.bins.length - trustedCount,
    truncated: discovery.truncated,
    omissionCount: discovery.omissions.length,
  };
}

export function renderPluginBins(
  discovery: PluginBinsDiscovery,
  options: { configPath?: string } = {},
): string {
  const trust = loadPluginBinsTrustConfig({ configPath: options.configPath });
  const lines = [
    "Bins",
    `  discovered_bins: ${discovery.bins.length}${discovery.truncated ? " (truncated)" : ""}`,
    "  execution: explicit_trusted_operator_run",
    "  bins:",
  ];

  if (discovery.bins.length === 0) {
    lines.push("    - none");
  } else {
    for (const bin of discovery.bins) {
      lines.push(`    - ${formatBinSummary(bin, trust.bins[bin.id])}`);
    }
  }

  if (discovery.omissions.length > 0) {
    lines.push("  omitted:");
    for (const omission of discovery.omissions.slice(0, 10)) {
      lines.push(
        [
          `    - plugin=${omission.pluginId}`,
          omission.path ? `path=${omission.path}` : undefined,
          `reason=${JSON.stringify(omission.reason)}`,
        ]
          .filter((part): part is string => typeof part === "string")
          .join(" "),
      );
    }
    if (discovery.omissions.length > 10) {
      lines.push(`    - ${discovery.omissions.length - 10} more omissions omitted`);
    }
  }

  lines.push("  trust: use /bins trust <id>; use /bins run <id> [args...] to execute a trusted bin");
  return lines.join("\n");
}

export function renderPluginBinInspect(
  bin: PluginBinDefinition,
  options: { configPath?: string } = {},
): string {
  const record = loadPluginBinsTrustConfig({ configPath: options.configPath }).bins[bin.id];
  const trusted = record?.binHash === bin.binHash;
  return [
    `Bin: ${bin.id}`,
    `  plugin: ${bin.pluginId}`,
    `  bin_id: ${bin.binId}`,
    `  path: ${bin.path}`,
    `  relative_path: ${bin.relativePath}`,
    `  cwd: plugin-root`,
    `  env: ${bin.env.length > 0 ? bin.env.join(",") : "none"}`,
    `  runner: ${bin.runner.kind}`,
    `  runner_command: ${bin.runner.command}`,
    `  size_bytes: ${bin.sizeBytes}`,
    `  manifest_hash: ${bin.manifestHash}`,
    `  component_hash: ${bin.componentHash}`,
    `  file_hash: ${bin.fileHash}`,
    `  bin_hash: ${bin.binHash}`,
    `  trusted: ${trusted ? "yes" : "no"}`,
    record && !trusted ? `  trust_status: pending_hash_change trusted_hash=${record.binHash}` : undefined,
    record?.trustedAt ? `  trusted_at: ${record.trustedAt}` : undefined,
    "  execution: explicit trusted operator run only; arguments are not written to audit logs",
  ]
    .filter((line): line is string => typeof line === "string")
    .join("\n");
}

export function trustPluginBin(
  id: string,
  options: PluginBinOptions & { now?: () => Date } = {},
): PluginBinTrustResult {
  const bin = findDiscoveredBin(id, { registryPath: options.registryPath });
  if (!bin) {
    return {
      ok: false,
      message: `Unknown enabled plugin bin: ${formatBinIdForMessage(id)}`,
    };
  }

  const trust = loadPluginBinsTrustConfig({ configPath: options.configPath });
  const previousTrustedHash = trust.bins[bin.id]?.binHash;
  const trustedAt = (options.now?.() ?? new Date()).toISOString();
  trust.bins[bin.id] = {
    id: bin.id,
    binHash: bin.binHash,
    trustedAt,
  };
  savePluginBinsTrustConfig(trust, { configPath: options.configPath });

  return {
    ok: true,
    bin,
    trustedAt,
    previousTrustedHash,
    message: `Bin ${bin.id} trusted at ${bin.binHash}. Manual execution is now available with /bins run ${bin.id}.`,
  };
}

export function untrustPluginBin(
  id: string,
  options: PluginBinOptions = {},
): PluginBinTrustResult {
  const formattedId = formatBinIdForMessage(id);
  const trust = loadPluginBinsTrustConfig({ configPath: options.configPath });
  const record = trust.bins[id];
  if (!record) {
    return {
      ok: false,
      message: `No trusted bin record for ${formattedId}.`,
    };
  }

  delete trust.bins[id];
  savePluginBinsTrustConfig(trust, { configPath: options.configPath });

  return {
    ok: true,
    message: `Bin ${formattedId} trust removed. Manual execution is blocked until the bin is trusted again.`,
  };
}

export async function runPluginBin(
  id: string,
  args: string[] = [],
  options: PluginBinRunOptions = {},
): Promise<PluginBinRunResult> {
  const auditLogPath = options.auditLogPath ?? defaultPluginBinsAuditLogPath();
  const bin = findDiscoveredBin(id, { registryPath: options.registryPath });
  if (!bin) {
    return finalizeBinRunResult(
      {
        ok: false,
        executed: false,
        status: "not_found",
        message: `Unknown enabled plugin bin: ${formatBinIdForMessage(id)}`,
        envNames: [],
        argCount: args.length,
        auditLogPath,
      },
      options,
    );
  }

  const trustRecord = loadPluginBinsTrustConfig({ configPath: options.configPath }).bins[bin.id];
  if (!trustRecord) {
    return finalizeBinRunResult(
      {
        ok: false,
        executed: false,
        status: "untrusted",
        bin,
        message: `Bin ${bin.id} is not trusted. Run /bins trust ${bin.id} before manual execution.`,
        envNames: bin.env,
        runner: bin.runner.kind,
        argCount: args.length,
        auditLogPath,
      },
      options,
    );
  }
  if (trustRecord.binHash !== bin.binHash) {
    return finalizeBinRunResult(
      {
        ok: false,
        executed: false,
        status: "pending_hash_change",
        bin,
        message: `Bin ${bin.id} changed since it was trusted. Re-run /bins trust ${bin.id} before manual execution.`,
        envNames: bin.env,
        runner: bin.runner.kind,
        argCount: args.length,
        auditLogPath,
      },
      options,
    );
  }

  const runtimeArgs = sanitizeRuntimeArgs(args);
  if (typeof runtimeArgs === "string") {
    return finalizeBinRunResult(
      {
        ok: false,
        executed: false,
        status: "invalid_arguments",
        bin,
        message: runtimeArgs,
        envNames: bin.env,
        runner: bin.runner.kind,
        argCount: args.length,
        auditLogPath,
      },
      options,
    );
  }

  const cwdResult = resolveBinRuntimeCwd(bin);
  if (typeof cwdResult !== "string") {
    return finalizeBinRunResult(
      {
        ok: false,
        executed: false,
        status: "cwd_unavailable",
        bin,
        message: cwdResult.message,
        envNames: bin.env,
        runner: bin.runner.kind,
        argCount: runtimeArgs.length,
        auditLogPath,
      },
      options,
    );
  }

  const forwardedEnv = collectBinEnvironment(bin, options.env ?? process.env);
  const result = await shellTool({
    command: bin.runner.command,
    args: [...bin.runner.args, ...runtimeArgs],
    cwd: cwdResult,
    env: forwardedEnv,
    inheritEnv: false,
    maxBytes: MAX_BIN_OUTPUT_BYTES,
    shell: false,
    signal: options.signal,
    timeoutMs: DEFAULT_BIN_TIMEOUT_MS,
  });

  if (!result.ok) {
    return finalizeBinRunResult(
      {
        ok: false,
        executed: true,
        status: "process_error",
        bin,
        message: `Bin ${bin.id} failed to start: ${result.error.message}`,
        cwd: cwdResult,
        envNames: Object.keys(forwardedEnv).sort(),
        runner: bin.runner.kind,
        argCount: runtimeArgs.length,
        timeoutMs: DEFAULT_BIN_TIMEOUT_MS,
        stdout: "",
        stderr: result.error.message,
        stdoutTruncated: false,
        stderrTruncated: false,
        durationMs: 0,
        timedOut: false,
        auditLogPath,
      },
      options,
      forwardedEnv,
      runtimeArgs,
    );
  }

  const stdout = redactBinOutput(result.stdout, forwardedEnv);
  const stderr = redactBinOutput(result.stderr, forwardedEnv);
  const status: PluginBinRunStatus = result.timedOut
    ? "timed_out"
    : result.exitCode === 0
      ? "ok"
      : "exit_nonzero";
  const ok = status === "ok";

  return finalizeBinRunResult(
    {
      ok,
      executed: true,
      status,
      bin,
      message: ok
        ? `Bin ${bin.id} completed successfully.`
        : `Bin ${bin.id} ${status === "timed_out" ? "timed out" : `exited with code ${result.exitCode}`}.`,
      cwd: cwdResult,
      envNames: Object.keys(forwardedEnv).sort(),
      runner: bin.runner.kind,
      argCount: runtimeArgs.length,
      timeoutMs: DEFAULT_BIN_TIMEOUT_MS,
      exitCode: result.exitCode,
      signal: result.signal,
      stdout,
      stderr,
      stdoutTruncated: result.stdoutTruncation.truncated,
      stderrTruncated: result.stderrTruncation.truncated,
      durationMs: result.durationMs,
      timedOut: result.timedOut,
      auditLogPath,
    },
    options,
    forwardedEnv,
    runtimeArgs,
  );
}

export function renderPluginBinRunResult(result: PluginBinRunResult): string {
  const lines = [
    `Bin run: ${result.bin?.id ?? "unknown"}`,
    `  status: ${result.status}`,
    `  executed: ${result.executed ? "yes" : "no"}`,
    result.runner ? `  runner: ${result.runner}` : undefined,
    result.cwd ? `  cwd: ${result.cwd}` : undefined,
    result.timeoutMs ? `  timeout_ms: ${result.timeoutMs}` : undefined,
    `  env: ${result.envNames.length > 0 ? result.envNames.join(",") : "none"}`,
    `  arg_count: ${result.argCount}`,
    result.exitCode !== undefined ? `  exit_code: ${result.exitCode}` : undefined,
    result.signal !== undefined && result.signal !== null ? `  signal: ${result.signal}` : undefined,
    result.timedOut !== undefined ? `  timed_out: ${result.timedOut ? "yes" : "no"}` : undefined,
    result.durationMs !== undefined ? `  duration_ms: ${result.durationMs}` : undefined,
    result.stdout !== undefined
      ? `  stdout${result.stdoutTruncated ? " (truncated)" : ""}: ${formatBinOutputBlock(result.stdout)}`
      : undefined,
    result.stderr !== undefined
      ? `  stderr${result.stderrTruncated ? " (truncated)" : ""}: ${formatBinOutputBlock(result.stderr)}`
      : undefined,
    `  audit_log: ${result.auditLogPath}`,
    result.auditError ? `  audit_error: ${result.auditError}` : undefined,
    `  message: ${result.message}`,
  ];

  return lines.filter((line): line is string => typeof line === "string").join("\n");
}

export function findDiscoveredBin(
  id: string,
  options: PluginRegistryIoOptions = {},
): PluginBinDefinition | undefined {
  return discoverEnabledPluginBins({ registryPath: options.registryPath }).bins.find(
    (bin) => bin.id === id,
  );
}

export function formatBinIdForMessage(id: string): string {
  const trimmed = id.trim();
  if (!trimmed || trimmed.length > 260 || CONTROL_CHAR_PATTERN.test(trimmed) || SECRET_LIKE_PATTERN.test(trimmed)) {
    return "[invalid bin id]";
  }
  return trimmed;
}

function discoverPluginBins(
  plugin: InstalledPluginRecord,
  componentPath: string,
  remainingBinBudget: number,
): PluginBinsDiscovery {
  const baseDirectory = dirname(plugin.lock.source.manifestPath);
  if (!isSafePluginBaseDirectory(plugin.lock.source.manifestPath, baseDirectory)) {
    return {
      bins: [],
      omissions: [{ pluginId: plugin.id, path: componentPath, reason: "plugin manifest path is unavailable or unsafe" }],
      truncated: false,
    };
  }

  const componentDirectory = resolve(baseDirectory, componentPath);
  if (!isWithinDirectory(baseDirectory, componentDirectory)) {
    return {
      bins: [],
      omissions: [{ pluginId: plugin.id, path: componentPath, reason: "bins component path escapes plugin directory" }],
      truncated: false,
    };
  }
  if (!existsSync(componentDirectory)) {
    return {
      bins: [],
      omissions: [{ pluginId: plugin.id, path: componentPath, reason: "bins component path does not exist" }],
      truncated: false,
    };
  }

  let componentStat;
  try {
    componentStat = lstatSync(componentDirectory);
  } catch {
    return {
      bins: [],
      omissions: [{ pluginId: plugin.id, path: componentPath, reason: "bins component path could not be inspected" }],
      truncated: false,
    };
  }

  if (!componentStat.isDirectory()) {
    return {
      bins: [],
      omissions: [{ pluginId: plugin.id, path: componentPath, reason: "bins component path is not a directory" }],
      truncated: false,
    };
  }

  const bins: PluginBinDefinition[] = [];
  const omissions: PluginBinOmission[] = [];
  const seenBinIds = new Set<string>();
  const componentHash = hashRuntimeTree(componentDirectory, baseDirectory);
  const pluginRootHash = hashRuntimeTree(baseDirectory, baseDirectory);
  let truncated = false;
  let entries;

  try {
    entries = readdirSync(componentDirectory, { withFileTypes: true });
  } catch {
    return {
      bins: [],
      omissions: [{ pluginId: plugin.id, path: componentPath, reason: "bins component directory could not be read" }],
      truncated: false,
    };
  }

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (bins.length >= remainingBinBudget) {
      truncated = true;
      omissions.push({ pluginId: plugin.id, path: componentPath, reason: "bin discovery reached its entry limit" });
      break;
    }

    const binPath = resolve(componentDirectory, entry.name);
    const relativePath = relative(baseDirectory, binPath).split(/[\\/]/g).join("/");
    if (!entry.isFile()) {
      omissions.push({
        pluginId: plugin.id,
        path: relativePath,
        reason: "bin entry is not a regular file",
      });
      continue;
    }
    if (!isWithinDirectory(baseDirectory, binPath)) {
      omissions.push({
        pluginId: plugin.id,
        path: relativePath,
        reason: "bin entry escapes plugin directory",
      });
      continue;
    }

    try {
      const bin = sanitizeBinDefinition(
        entry.name,
        plugin,
        baseDirectory,
        binPath,
        relativePath,
        componentHash,
        pluginRootHash,
      );
      if (seenBinIds.has(bin.id)) {
        omissions.push({
          pluginId: plugin.id,
          path: relativePath,
          reason: `duplicate bin id: ${bin.id}`,
        });
        continue;
      }
      seenBinIds.add(bin.id);
      bins.push(bin);
    } catch (error) {
      omissions.push({
        pluginId: plugin.id,
        path: relativePath,
        reason: error instanceof Error ? error.message : "invalid bin declaration",
      });
    }
  }

  return { bins, omissions, truncated };
}

function sanitizeBinDefinition(
  fallbackBinId: string,
  plugin: InstalledPluginRecord,
  pluginRoot: string,
  sourcePath: string,
  relativePath: string,
  componentHash: string,
  pluginRootHash: string,
): PluginBinDefinition {
  const stat = lstatSync(sourcePath);
  if (!stat.isFile()) {
    throw new Error("bin entry is not a file");
  }
  if (stat.size <= 0 || stat.size > MAX_BIN_FILE_BYTES) {
    throw new Error(`bin file must be 1-${MAX_BIN_FILE_BYTES} bytes`);
  }

  const binId = sanitizeBinId(fallbackBinId);
  const bytes = readFileSync(sourcePath);
  const fileHash = sha256(bytes);
  const runner = resolveBinRunner(fallbackBinId, bytes, sourcePath);
  const env = [...plugin.manifest.permissions.env].sort((left, right) => left.localeCompare(right));
  const id = `plugin:${plugin.id}:bin:${binId}`;
  const hashInput = {
    id,
    pluginId: plugin.id,
    binId,
    relativePath,
    env,
    runnerKind: runner.kind,
    runnerCommand: runner.command,
    runnerArgs: runner.args.map((arg) => (arg === sourcePath ? "{bin}" : arg)),
    manifestHash: plugin.manifestHash,
    componentHash,
    pluginRootHash,
    fileHash,
  };

  return {
    id,
    pluginId: plugin.id,
    binId,
    pluginRoot,
    path: sourcePath,
    relativePath,
    env,
    sizeBytes: stat.size,
    runner,
    manifestHash: plugin.manifestHash,
    componentHash,
    fileHash,
    binHash: sha256(canonicalJson(hashInput)),
  };
}

function resolveBinRunner(
  fileName: string,
  bytes: Buffer,
  sourcePath: string,
): PluginBinRunner {
  const extension = extname(fileName).toLowerCase();
  if (extension === ".js" || extension === ".mjs" || extension === ".cjs") {
    return {
      kind: "node",
      command: process.execPath,
      args: [sourcePath],
    };
  }

  const shebang = parseShebang(bytes);
  if (shebang) {
    return {
      kind: "shebang",
      command: shebang.command,
      args: [...shebang.args, sourcePath],
    };
  }

  return {
    kind: "sh",
    command: "/bin/sh",
    args: [sourcePath],
  };
}

function parseShebang(bytes: Buffer): { command: string; args: string[] } | undefined {
  const firstLine = bytes.subarray(0, Math.min(bytes.length, 512)).toString("utf8").split(/\r?\n/, 1)[0] ?? "";
  if (!firstLine.startsWith("#!")) {
    return undefined;
  }

  const tokens = firstLine.slice(2).trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || tokens.length > 8) {
    throw new Error("bin shebang must include one interpreter and at most seven arguments");
  }
  const [command = "", ...args] = tokens;
  if (!SAFE_SHEBANG_TOKEN_PATTERN.test(command) || !isAbsolute(command)) {
    throw new Error("bin shebang interpreter must be an absolute safe path");
  }
  for (const [index, arg] of args.entries()) {
    if (!SAFE_SHEBANG_TOKEN_PATTERN.test(arg)) {
      throw new Error(`bin shebang argument ${index + 1} is not supported`);
    }
  }

  if (command === "/bin/sh") {
    if (args.length > 0) {
      throw new Error("bin shell shebang arguments are not supported");
    }
    return { command: "/bin/sh", args };
  }
  if (command === "/bin/bash") {
    if (args.length > 0) {
      throw new Error("bin shell shebang arguments are not supported");
    }
    return { command: "/bin/bash", args };
  }
  if (command === "/usr/bin/env") {
    const [tool, ...toolArgs] = args;
    if (toolArgs.length > 0) {
      throw new Error("bin env shebang arguments are not supported");
    }
    if (tool === "node") {
      return { command: process.execPath, args: [] };
    }
    if (tool === "sh") {
      return { command: "/bin/sh", args: [] };
    }
    if (tool === "bash") {
      return { command: "/bin/bash", args: [] };
    }
  }

  throw new Error("bin shebang interpreter is not supported");
}

function resolveBinRuntimeCwd(bin: PluginBinDefinition): string | { message: string } {
  if (!isWithinDirectory(bin.pluginRoot, bin.path)) {
    return {
      message: `Bin ${bin.id} path is outside the cached plugin directory.`,
    };
  }

  try {
    const rootStat = lstatSync(bin.pluginRoot);
    if (!rootStat.isDirectory()) {
      return {
        message: `Bin ${bin.id} plugin root is not a directory: ${bin.pluginRoot}`,
      };
    }
    const binStat = lstatSync(bin.path);
    if (!binStat.isFile()) {
      return {
        message: `Bin ${bin.id} path is not a file: ${bin.path}`,
      };
    }
  } catch {
    return {
      message: `Bin ${bin.id} cached path is unavailable: ${bin.path}`,
    };
  }

  return bin.pluginRoot;
}

function collectBinEnvironment(
  bin: PluginBinDefinition,
  sourceEnv: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const name of bin.env) {
    const value = sourceEnv[name];
    if (typeof value === "string") {
      env[name] = value;
    }
  }
  return env;
}

function finalizeBinRunResult(
  result: PluginBinRunResult,
  options: Pick<PluginBinRunOptions, "auditLogPath" | "now">,
  forwardedEnv: NodeJS.ProcessEnv = {},
  runtimeArgs: string[] = [],
): PluginBinRunResult {
  try {
    writePluginBinAuditEvent(
      {
        type: "plugin.bin.run",
        binId: result.bin?.id,
        pluginId: result.bin?.pluginId,
        binHash: result.bin?.binHash,
        ok: result.ok,
        details: {
          status: result.status,
          executed: result.executed,
          cwd: result.cwd,
          envNames: result.envNames,
          runner: result.runner,
          argCount: result.argCount,
          timeoutMs: result.timeoutMs,
          exitCode: result.exitCode,
          signal: result.signal,
          timedOut: result.timedOut,
          durationMs: result.durationMs,
          stdout: redactBinOutput(result.stdout ?? "", forwardedEnv, runtimeArgs),
          stderr: redactBinOutput(result.stderr ?? "", forwardedEnv, runtimeArgs),
          stdoutTruncated: result.stdoutTruncated,
          stderrTruncated: result.stderrTruncated,
          message: result.message,
        },
      },
      { auditLogPath: options.auditLogPath, now: options.now },
    );
  } catch (error) {
    const auditError = error instanceof Error ? error.message : "unknown audit write failure";
    if (result.ok) {
      return {
        ...result,
        ok: false,
        status: "audit_failed",
        message: `${result.message} Audit log could not be written; treating bin run as failed.`,
        auditError,
      };
    }

    return {
      ...result,
      auditError,
    };
  }

  return result;
}

function sanitizeRuntimeArgs(args: string[]): string[] | string {
  if (args.length > MAX_BIN_ARGS) {
    return `Bin run arguments exceed the maximum count of ${MAX_BIN_ARGS}.`;
  }

  const sanitized: string[] = [];
  for (const [index, arg] of args.entries()) {
    if (arg.length > MAX_BIN_ARG_LENGTH) {
      return `Bin run argument ${index + 1} exceeds ${MAX_BIN_ARG_LENGTH} characters.`;
    }
    if (CONTROL_CHAR_PATTERN.test(arg)) {
      return `Bin run argument ${index + 1} contains a control character.`;
    }
    if (SECRET_LIKE_PATTERN.test(arg)) {
      return `Bin run argument ${index + 1} looks like a secret; pass secrets through declared env instead.`;
    }
    sanitized.push(arg);
  }

  return sanitized;
}

function redactBinOutput(
  text: string,
  forwardedEnv: NodeJS.ProcessEnv,
  runtimeArgs: string[] = [],
): string {
  let output = stripTerminalControls(text);
  for (const [name, value] of Object.entries(forwardedEnv)) {
    if (typeof value === "string" && value.length >= 4) {
      output = output.split(value).join(`[redacted-env:${name}]`);
    }
  }
  for (const [index, value] of runtimeArgs.entries()) {
    if (value.length > 0) {
      output = output.split(value).join(`[redacted-arg:${index + 1}]`);
    }
  }
  const redacted = redactSecrets(output);
  return typeof redacted === "string" ? redacted : output;
}

function stripTerminalControls(text: string): string {
  return text.replace(ANSI_PATTERN, "").replace(OUTPUT_CONTROL_CHAR_PATTERN, "");
}

function formatBinOutputBlock(text: string): string {
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

function hashRuntimeTree(rootPath: string, baseDirectory: string): string {
  const budget: RuntimeHashBudget = {
    bytes: 0,
    entries: 0,
    omittedBytes: 0,
    omittedEntries: 0,
    truncated: false,
  };
  const descriptor = hashRuntimePath(rootPath, baseDirectory, budget, 0);
  return sha256(
    canonicalJson({
      descriptor,
      truncated: budget.truncated,
      omittedBytes: budget.omittedBytes,
      omittedEntries: budget.omittedEntries,
    }),
  );
}

function hashRuntimePath(
  path: string,
  baseDirectory: string,
  budget: RuntimeHashBudget,
  depth: number,
): unknown {
  if (budget.entries >= MAX_RUNTIME_HASH_ENTRIES) {
    budget.truncated = true;
    budget.omittedEntries += 1;
    return { kind: "truncated", reason: "max_entries" };
  }
  if (depth > MAX_RUNTIME_HASH_DEPTH) {
    budget.truncated = true;
    budget.omittedEntries += 1;
    return { kind: "truncated", reason: "max_depth" };
  }

  const stat = lstatSync(path);
  const displayPath = relative(baseDirectory, path).split(/[\\/]/g).join("/") || ".";
  budget.entries += 1;

  if (stat.isSymbolicLink()) {
    return {
      kind: "symlink",
      path: displayPath,
      target: readlinkSync(path),
    };
  }

  if (stat.isDirectory()) {
    const entries = readdirSync(path, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((entry) => hashRuntimePath(join(path, entry.name), baseDirectory, budget, depth + 1));
    return {
      kind: "directory",
      path: displayPath,
      entries,
    };
  }

  if (!stat.isFile()) {
    return {
      kind: "other",
      path: displayPath,
    };
  }

  if (
    stat.size > MAX_RUNTIME_HASH_FILE_BYTES ||
    budget.bytes + stat.size > MAX_RUNTIME_HASH_BYTES
  ) {
    budget.truncated = true;
    budget.omittedBytes += stat.size;
    return {
      kind: "file",
      path: displayPath,
      size: stat.size,
      truncated: true,
    };
  }

  budget.bytes += stat.size;
  return {
    kind: "file",
    path: displayPath,
    hash: sha256(readFileSync(path)),
  };
}

function sanitizeBinId(value: string): string {
  const lowered = value.trim().toLowerCase();
  if (!BIN_ID_PATTERN.test(lowered)) {
    throw new Error("bin id must use lowercase letters, numbers, dots, underscores, or dashes");
  }
  if (SECRET_LIKE_PATTERN.test(lowered) || CONTROL_CHAR_PATTERN.test(lowered)) {
    throw new Error("bin id is unsafe");
  }
  return lowered;
}

function sanitizePluginBinsTrustConfig(value: unknown): PluginBinsTrustConfig {
  if (!isPlainObject(value)) {
    return emptyPluginBinsTrustConfig();
  }

  const bins: Record<string, PluginBinTrustRecord> = {};
  if (isPlainObject(value.bins)) {
    for (const [fallbackId, rawRecord] of Object.entries(value.bins)) {
      const record = sanitizeTrustRecord(fallbackId, rawRecord);
      if (record) {
        bins[record.id] = record;
      }
    }
  }

  return { version: BIN_CONFIG_VERSION, bins };
}

function sanitizeTrustRecord(
  fallbackId: string,
  value: unknown,
): PluginBinTrustRecord | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }

  const id = typeof value.id === "string" && value.id ? value.id : fallbackId;
  const binHash = typeof value.binHash === "string" && SHA256_PATTERN.test(value.binHash)
    ? value.binHash
    : undefined;
  const trustedAt = typeof value.trustedAt === "string" ? new Date(value.trustedAt) : undefined;
  if (
    !id ||
    !binHash ||
    !trustedAt ||
    Number.isNaN(trustedAt.getTime()) ||
    CONTROL_CHAR_PATTERN.test(id) ||
    SECRET_LIKE_PATTERN.test(id)
  ) {
    return undefined;
  }

  return {
    id,
    binHash,
    trustedAt: trustedAt.toISOString(),
  };
}

function formatBinSummary(
  bin: PluginBinDefinition,
  record: PluginBinTrustRecord | undefined,
): string {
  const trusted = record?.binHash === bin.binHash;
  return [
    `id=${bin.id}`,
    `plugin=${bin.pluginId}`,
    `path=${bin.relativePath}`,
    `runner=${bin.runner.kind}`,
    `trusted=${trusted ? "yes" : "no"}`,
    record && !trusted ? "trust=pending_hash_change" : undefined,
    `bin_hash=${bin.binHash}`,
    `execution=${trusted ? "manual" : "trust-required"}`,
  ]
    .filter((part): part is string => typeof part === "string")
    .join(" ");
}

function tightenBinTrustPermissions(path: string): void {
  if (resolve(path) === resolve(defaultPluginBinsConfigPath())) {
    chmodSync(dirname(path), BIN_DIRECTORY_MODE);
  }
  chmodSync(path, BIN_FILE_MODE);
}

function isSafePluginBaseDirectory(manifestPath: string, baseDirectory: string): boolean {
  return Boolean(manifestPath) && isWithinDirectory(baseDirectory, manifestPath);
}

function isWithinDirectory(baseDirectory: string, candidatePath: string): boolean {
  const relativePath = relative(resolve(baseDirectory), resolve(candidatePath));
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

interface RuntimeHashBudget {
  bytes: number;
  entries: number;
  omittedBytes: number;
  omittedEntries: number;
  truncated: boolean;
}
