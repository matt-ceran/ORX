import {
  chmodSync,
  closeSync,
  constants as fsConstants,
  existsSync,
  fchmodSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, parse, relative, resolve, sep } from "node:path";

export type DelegationPolicyCredentialMode = "none";
export type DelegationPolicyResultPersistence = "none";
export type DelegationPolicyResultMerge = "manual_summary";

export interface DelegationPolicyPathOptions {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  configPath?: string;
}

export interface DelegationPolicyIoOptions {
  configPath?: string;
}

export interface DelegationExecutionPolicy {
  version: 1;
  executionEnabled: boolean;
  maxTaskCostUsd: number;
  taskTimeoutMs: number;
  maxResultBytes: number;
  maxConcurrentDelegates: number;
  credentialForwarding: DelegationPolicyCredentialMode;
  resultPersistence: DelegationPolicyResultPersistence;
  resultMerge: DelegationPolicyResultMerge;
  updatedAt?: string;
}

export interface DelegationExecutionPolicyPatch {
  executionEnabled?: boolean;
  maxTaskCostUsd?: number;
  taskTimeoutMs?: number;
  maxResultBytes?: number;
  maxConcurrentDelegates?: number;
  credentialForwarding?: DelegationPolicyCredentialMode;
  resultPersistence?: DelegationPolicyResultPersistence;
  resultMerge?: DelegationPolicyResultMerge;
}

export interface DelegationPolicyStateChange {
  ok: boolean;
  policy?: DelegationExecutionPolicy;
  message: string;
}

export class DelegationPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DelegationPolicyError";
  }
}

const POLICY_VERSION = 1;
const POLICY_DIRECTORY_MODE = 0o700;
const POLICY_FILE_MODE = 0o600;
const MAX_POLICY_BYTES = 64 * 1024;
const O_NOFOLLOW = typeof fsConstants.O_NOFOLLOW === "number" ? fsConstants.O_NOFOLLOW : 0;
const CONTROL_CHAR_PATTERN = /[\x00-\x1F\x7F-\x9F]/;

const DEFAULT_DELEGATION_POLICY: DelegationExecutionPolicy = {
  version: POLICY_VERSION,
  executionEnabled: false,
  maxTaskCostUsd: 0.25,
  taskTimeoutMs: 120_000,
  maxResultBytes: 60_000,
  maxConcurrentDelegates: 1,
  credentialForwarding: "none",
  resultPersistence: "none",
  resultMerge: "manual_summary",
};

export function defaultDelegationPolicyPath(): string {
  return join(homedir(), ".orx", "delegation", "policy.json");
}

export function resolveDelegationPolicyPath(options: DelegationPolicyPathOptions = {}): string {
  const explicitPath = options.configPath ?? options.env?.ORX_DELEGATION_POLICY_PATH;
  if (!explicitPath) {
    return defaultDelegationPolicyPath();
  }

  return resolve(options.cwd ?? process.cwd(), explicitPath);
}

export function createDefaultDelegationExecutionPolicy(): DelegationExecutionPolicy {
  return { ...DEFAULT_DELEGATION_POLICY };
}

export function loadDelegationExecutionPolicy(
  options: DelegationPolicyIoOptions = {},
): DelegationExecutionPolicy {
  const path = options.configPath ?? defaultDelegationPolicyPath();
  if (!existsSync(path)) {
    return createDefaultDelegationExecutionPolicy();
  }

  try {
    assertNoSymlinkInParentPath(path);
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.size > MAX_POLICY_BYTES) {
      return createDefaultDelegationExecutionPolicy();
    }
    const fd = openSync(path, fsConstants.O_RDONLY | O_NOFOLLOW);
    try {
      const openStat = fstatSync(fd);
      if (!openStat.isFile() || openStat.size > MAX_POLICY_BYTES) {
        return createDefaultDelegationExecutionPolicy();
      }
      tightenDelegationPolicyPermissions(path, fd);
      const parsed = JSON.parse(readFileSync(fd, { encoding: "utf8" })) as unknown;
      return sanitizeDelegationExecutionPolicy(parsed);
    } finally {
      closeSync(fd);
    }
  } catch {
    return createDefaultDelegationExecutionPolicy();
  }
}

export function saveDelegationExecutionPolicy(
  policy: DelegationExecutionPolicy,
  options: DelegationPolicyIoOptions = {},
): void {
  const path = options.configPath ?? defaultDelegationPolicyPath();
  const sanitized = sanitizeDelegationExecutionPolicy(policy);
  const parentDir = dirname(path);
  const parentExisted = existsSync(parentDir);
  assertNoSymlinkInParentPath(path);
  mkdirSync(parentDir, {
    recursive: true,
    mode: POLICY_DIRECTORY_MODE,
  });
  assertNoSymlinkInParentPath(path);
  if (!parentExisted || resolve(path) === resolve(defaultDelegationPolicyPath())) {
    chmodSync(parentDir, POLICY_DIRECTORY_MODE);
  }
  if (existsSync(path)) {
    const existing = lstatSync(path);
    if (!existing.isFile()) {
      throw new DelegationPolicyError("Delegation policy path must be a regular file.");
    }
  }

  const fd = openSync(
    path,
    fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_TRUNC | O_NOFOLLOW,
    POLICY_FILE_MODE,
  );
  try {
    writeFileSync(fd, `${JSON.stringify(sanitized, null, 2)}\n`, {
      encoding: "utf8",
    });
    fchmodSync(fd, POLICY_FILE_MODE);
  } finally {
    closeSync(fd);
  }
}

export function updateDelegationExecutionPolicy(
  patch: DelegationExecutionPolicyPatch,
  options: DelegationPolicyIoOptions & { now?: () => Date } = {},
): DelegationPolicyStateChange {
  const current = loadDelegationExecutionPolicy({ configPath: options.configPath });
  const validatedPatch = validateDelegationPolicyPatch(patch);
  const next = sanitizeDelegationExecutionPolicy({
    ...current,
    ...validatedPatch,
    updatedAt: (options.now?.() ?? new Date()).toISOString(),
  });
  saveDelegationExecutionPolicy(next, { configPath: options.configPath });

  return {
    ok: true,
    policy: next,
    message: next.executionEnabled
      ? "Delegation execution policy saved. Execution is enabled for configured delegates."
      : "Delegation execution policy saved. Execution is disabled.",
  };
}

export function renderDelegationExecutionPolicy(
  policy: DelegationExecutionPolicy,
  path?: string,
): string {
  const normalized = sanitizeDelegationExecutionPolicy(policy);
  return [
    "ORX delegation execution policy:",
    path ? `  policy_path: ${path}` : undefined,
    `  execution: ${normalized.executionEnabled ? "enabled" : "disabled"}`,
    `  delegate_task: ${normalized.executionEnabled ? "available_when_chat_has_delegate" : "unavailable"}`,
    `  max_task_cost_usd: ${formatPolicyCost(normalized.maxTaskCostUsd)}`,
    `  task_timeout_ms: ${normalized.taskTimeoutMs}`,
    `  max_result_bytes: ${normalized.maxResultBytes}`,
    `  max_concurrent_delegates: ${normalized.maxConcurrentDelegates}`,
    `  credential_forwarding: ${normalized.credentialForwarding}`,
    `  result_persistence: ${normalized.resultPersistence}`,
    `  result_merge: ${normalized.resultMerge}`,
    `  updated_at: ${normalized.updatedAt ?? "default"}`,
    `  network_calls: ${normalized.executionEnabled ? "openrouter_delegate_only" : "none"}`,
    "  subprocesses: none",
    "  enforcement: policy_gated_openrouter_adapter",
  ].filter((line): line is string => typeof line === "string").join("\n");
}

export function sanitizeDelegationExecutionPolicy(value: unknown): DelegationExecutionPolicy {
  const record = isRecord(value) ? value : {};
  return {
    version: POLICY_VERSION,
    executionEnabled: record.executionEnabled === true,
    maxTaskCostUsd: sanitizeCost(record.maxTaskCostUsd, DEFAULT_DELEGATION_POLICY.maxTaskCostUsd),
    taskTimeoutMs: sanitizeInteger(
      record.taskTimeoutMs,
      DEFAULT_DELEGATION_POLICY.taskTimeoutMs,
      1_000,
      3_600_000,
    ),
    maxResultBytes: sanitizeInteger(
      record.maxResultBytes,
      DEFAULT_DELEGATION_POLICY.maxResultBytes,
      1_024,
      1_048_576,
    ),
    maxConcurrentDelegates: sanitizeInteger(
      record.maxConcurrentDelegates,
      DEFAULT_DELEGATION_POLICY.maxConcurrentDelegates,
      1,
      8,
    ),
    credentialForwarding:
      record.credentialForwarding === "none" ? "none" : DEFAULT_DELEGATION_POLICY.credentialForwarding,
    resultPersistence:
      record.resultPersistence === "none" ? "none" : DEFAULT_DELEGATION_POLICY.resultPersistence,
    resultMerge:
      record.resultMerge === "manual_summary" ? "manual_summary" : DEFAULT_DELEGATION_POLICY.resultMerge,
    ...(sanitizeTimestamp(record.updatedAt) ? { updatedAt: sanitizeTimestamp(record.updatedAt) } : {}),
  };
}

export function validateDelegationPolicyPatch(
  patch: DelegationExecutionPolicyPatch,
): DelegationExecutionPolicyPatch {
  const result: DelegationExecutionPolicyPatch = {};
  if (patch.executionEnabled !== undefined) {
    if (typeof patch.executionEnabled !== "boolean") {
      throw new DelegationPolicyError("Execution must be enabled or disabled.");
    }
    result.executionEnabled = patch.executionEnabled;
  }
  if (patch.maxTaskCostUsd !== undefined) {
    result.maxTaskCostUsd = validatePolicyCost(patch.maxTaskCostUsd);
  }
  if (patch.taskTimeoutMs !== undefined) {
    result.taskTimeoutMs = validatePolicyInteger(patch.taskTimeoutMs, "Task timeout", 1_000, 3_600_000);
  }
  if (patch.maxResultBytes !== undefined) {
    result.maxResultBytes = validatePolicyInteger(patch.maxResultBytes, "Max result bytes", 1_024, 1_048_576);
  }
  if (patch.maxConcurrentDelegates !== undefined) {
    result.maxConcurrentDelegates = validatePolicyInteger(
      patch.maxConcurrentDelegates,
      "Max concurrent delegates",
      1,
      8,
    );
  }
  if (patch.credentialForwarding !== undefined) {
    if (patch.credentialForwarding !== "none") {
      throw new DelegationPolicyError("Credential forwarding must be none in this scaffold.");
    }
    result.credentialForwarding = "none";
  }
  if (patch.resultPersistence !== undefined) {
    if (patch.resultPersistence !== "none") {
      throw new DelegationPolicyError("Result persistence must be none until delegate execution exists.");
    }
    result.resultPersistence = "none";
  }
  if (patch.resultMerge !== undefined) {
    if (patch.resultMerge !== "manual_summary") {
      throw new DelegationPolicyError("Result merge must be manual_summary until delegate execution exists.");
    }
    result.resultMerge = "manual_summary";
  }
  return result;
}

export function parseDelegationExecutionPolicySetArgs(
  args: string[],
): DelegationExecutionPolicyPatch {
  const patch: DelegationExecutionPolicyPatch = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) {
      continue;
    }

    if (arg === "--max-cost-usd" || arg === "--max-task-cost-usd") {
      patch.maxTaskCostUsd = parsePolicyNumberArg(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--execution") {
      patch.executionEnabled = parsePolicyExecutionArg(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--enable-execution" || arg === "--enable") {
      patch.executionEnabled = true;
      continue;
    }

    if (arg === "--disable-execution" || arg === "--disable") {
      patch.executionEnabled = false;
      continue;
    }

    if (arg === "--timeout-ms" || arg === "--task-timeout-ms") {
      patch.taskTimeoutMs = parsePolicyIntegerArg(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--max-result-bytes") {
      patch.maxResultBytes = parsePolicyIntegerArg(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--max-concurrent" || arg === "--max-concurrent-delegates") {
      patch.maxConcurrentDelegates = parsePolicyIntegerArg(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--credentials" || arg === "--credential-forwarding") {
      patch.credentialForwarding = parsePolicyFixedArg(args, index, arg, "none");
      index += 1;
      continue;
    }

    if (arg === "--result-persistence") {
      patch.resultPersistence = parsePolicyFixedArg(args, index, arg, "none");
      index += 1;
      continue;
    }

    if (arg === "--result-merge") {
      patch.resultMerge = parsePolicyFixedArg(args, index, arg, "manual_summary");
      index += 1;
      continue;
    }

    throw new DelegationPolicyError(`Unknown delegation policy option: ${arg}`);
  }

  if (Object.keys(patch).length === 0) {
    throw new DelegationPolicyError("No delegation policy settings provided.");
  }

  return validateDelegationPolicyPatch(patch);
}

function parsePolicyExecutionArg(args: string[], index: number, option: string): boolean {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new DelegationPolicyError(`Missing value for ${option}.`);
  }
  if (value === "enabled" || value === "on" || value === "true") {
    return true;
  }
  if (value === "disabled" || value === "off" || value === "false") {
    return false;
  }
  throw new DelegationPolicyError(`${option} must be enabled or disabled.`);
}

function validatePolicyCost(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new DelegationPolicyError("Max task cost must be between 0 and 100 USD.");
  }
  return roundCost(value);
}

function validatePolicyInteger(
  value: number,
  label: string,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new DelegationPolicyError(`${label} must be an integer between ${minimum} and ${maximum}.`);
  }
  return value;
}

function assertNoSymlinkInParentPath(path: string): void {
  const parentDir = resolve(dirname(path));
  const root = parse(parentDir).root;
  const components = relative(root, parentDir).split(sep).filter(Boolean);
  let current = root;

  for (let index = 0; index < components.length; index += 1) {
    current = join(current, components[index]);
    if (!existsSync(current)) {
      return;
    }

    const stat = lstatSync(current);
    const isTopLevelPosixComponent = root === sep && index === 0;
    if (isTopLevelPosixComponent && stat.isSymbolicLink()) {
      continue;
    }
    if (stat.isSymbolicLink()) {
      throw new DelegationPolicyError("Delegation policy parent path must not contain symlinks.");
    }
    if (!stat.isDirectory()) {
      throw new DelegationPolicyError("Delegation policy parent path must be a directory.");
    }
  }
}

function parsePolicyNumberArg(args: string[], index: number, option: string): number {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new DelegationPolicyError(`Missing value for ${option}.`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new DelegationPolicyError(`Invalid number for ${option}.`);
  }
  return parsed;
}

function parsePolicyIntegerArg(args: string[], index: number, option: string): number {
  const parsed = parsePolicyNumberArg(args, index, option);
  if (!Number.isInteger(parsed)) {
    throw new DelegationPolicyError(`Invalid integer for ${option}.`);
  }
  return parsed;
}

function parsePolicyFixedArg<T extends string>(
  args: string[],
  index: number,
  option: string,
  allowed: T,
): T {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new DelegationPolicyError(`Missing value for ${option}.`);
  }
  if (value !== allowed) {
    throw new DelegationPolicyError(`${option} must be ${allowed}.`);
  }
  return allowed;
}

function sanitizeCost(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100
    ? roundCost(value)
    : fallback;
}

function sanitizeInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  return typeof value === "number" && Number.isInteger(value) && value >= minimum && value <= maximum
    ? value
    : fallback;
}

function sanitizeTimestamp(value: unknown): string | undefined {
  if (typeof value !== "string" || CONTROL_CHAR_PATTERN.test(value) || value.length > 40) {
    return undefined;
  }
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    return undefined;
  }
  return timestamp.toISOString();
}

function tightenDelegationPolicyPermissions(path: string, fd: number): void {
  try {
    if (resolve(path) === resolve(defaultDelegationPolicyPath())) {
      chmodSync(dirname(path), POLICY_DIRECTORY_MODE);
    }
    fchmodSync(fd, POLICY_FILE_MODE);
  } catch {
    // Best effort only; unreadable or foreign-owned files fail closed in the caller.
  }
}

function formatPolicyCost(value: number): string {
  return value.toFixed(4).replace(/0+$/, "").replace(/\.$/, ".0");
}

function roundCost(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
