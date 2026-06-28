import {
  appendFileSync,
  closeSync,
  constants as fsConstants,
  existsSync,
  fchmodSync,
  lstatSync,
  mkdirSync,
  openSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, parse, relative, resolve, sep } from "node:path";
import { redactSecrets } from "../mcp/audit.js";
import { sha256 } from "../research/extract.js";
import type { DelegationState } from "./index.js";
import {
  loadDelegationExecutionPolicy,
  type DelegationExecutionPolicy,
} from "./policy.js";

export interface DelegationAuditPathOptions {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  auditLogPath?: string;
}

export interface DelegateTaskOptions {
  state?: DelegationState;
  policyConfigPath?: string;
  auditLogPath?: string;
  enabled?: boolean;
  now?: () => Date;
}

export interface DelegationAuditEvent {
  type: "delegation.task.attempt";
  ok: boolean;
  delegate?: string;
  details?: Record<string, unknown>;
  timestamp?: string;
}

export interface DelegationAuditOptions {
  auditLogPath?: string;
  now?: () => Date;
}

export interface DelegateTaskResult {
  ok: false;
  status:
    | "invalid_arguments"
    | "delegate_not_found"
    | "execution_disabled"
    | "adapter_unavailable";
  message: string;
  delegate?: string;
  provider?: "openrouter";
  model?: string;
  taskHash?: string;
  taskBytes?: number;
  contextHash?: string;
  contextBytes?: number;
  expectedOutputHash?: string;
  expectedOutputBytes?: number;
  requestedTimeoutMs?: number;
  requestedMaxResultBytes?: number;
  requestedMaxTaskCostUsd?: number;
  policy: DelegationRuntimePolicySummary;
  executionEnabled: false;
  delegateTaskAvailable: false;
  networkAttempted: false;
  subprocesses: "none";
  resultPersistence: "none";
  resultMerge: "manual_summary";
  modelExposure: "disabled_delegate_task_result";
  trustBoundary: string;
  auditLogPath: string;
  auditWritten: boolean;
  auditError?: string;
  error: {
    code: string;
    message: string;
  };
}

export interface DelegationRuntimePolicySummary {
  maxTaskCostUsd: number;
  taskTimeoutMs: number;
  maxResultBytes: number;
  maxConcurrentDelegates: number;
  credentialForwarding: "none";
  resultPersistence: "none";
  resultMerge: "manual_summary";
}

interface ParsedDelegateTaskArguments {
  delegate?: string;
  task: string;
  context?: string;
  expectedOutput?: string;
  timeoutMs?: number;
  maxResultBytes?: number;
  maxTaskCostUsd?: number;
}

const DELEGATION_AUDIT_DIRECTORY_MODE = 0o700;
const DELEGATION_AUDIT_FILE_MODE = 0o600;
const O_NOFOLLOW = typeof fsConstants.O_NOFOLLOW === "number" ? fsConstants.O_NOFOLLOW : 0;
const SAFE_DELEGATE_NAME_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;
const CONTROL_CHAR_PATTERN = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/;
const SECRET_LIKE_PATTERN =
  /\b(?:sk-or-v1-[A-Za-z0-9_-]+|github_pat_[A-Za-z0-9_]+|ghp_[A-Za-z0-9_]+|glpat-[A-Za-z0-9_-]+|xox[baprs]-[A-Za-z0-9-]+)\b/i;
const MAX_TASK_BYTES = 24 * 1024;
const MAX_CONTEXT_BYTES = 24 * 1024;
const MAX_EXPECTED_OUTPUT_BYTES = 4 * 1024;

export function defaultDelegationAuditLogPath(): string {
  return join(homedir(), ".orx", "audit", "delegation.jsonl");
}

export function resolveDelegationAuditLogPath(options: DelegationAuditPathOptions = {}): string {
  const explicitPath = options.auditLogPath ?? options.env?.ORX_DELEGATION_AUDIT_PATH;
  if (!explicitPath) {
    return defaultDelegationAuditLogPath();
  }

  return resolve(options.cwd ?? process.cwd(), explicitPath);
}

export function runDelegateTask(
  rawArguments: Record<string, unknown>,
  options: DelegateTaskOptions = {},
): DelegateTaskResult {
  const policy = loadDelegationExecutionPolicy({ configPath: options.policyConfigPath });
  const auditLogPath = options.auditLogPath ?? defaultDelegationAuditLogPath();
  const parsed = parseDelegateTaskArguments(rawArguments, policy);
  const baseDetails = parsed.ok
    ? hashedTaskDetails(parsed.value)
    : { argumentErrorCode: parsed.code };
  const delegate = parsed.ok
    ? resolveDelegate(parsed.value.delegate, options.state)
    : undefined;

  let result: DelegateTaskResult;
  if (!parsed.ok) {
    result = createDelegateTaskResult({
      status: "invalid_arguments",
      message: parsed.message,
      errorCode: parsed.code,
      errorMessage: parsed.message,
      auditLogPath,
      policy,
    });
  } else if (!delegate) {
    result = createDelegateTaskResult({
      status: "delegate_not_found",
      message: parsed.value.delegate
        ? `Delegate not found or unavailable: ${parsed.value.delegate}`
        : "No delegate is configured for delegate_task.",
      errorCode: "DELEGATE_NOT_FOUND",
      errorMessage: parsed.value.delegate
        ? `Delegate not found or unavailable: ${parsed.value.delegate}`
        : "No delegate is configured for delegate_task.",
      auditLogPath,
      policy,
      parsed: parsed.value,
    });
  } else if (options.enabled !== true || policy.executionEnabled === false) {
    result = createDelegateTaskResult({
      status: "execution_disabled",
      message: "delegate_task execution is disabled by ORX delegation policy.",
      errorCode: "DELEGATE_TASK_DISABLED",
      errorMessage: "delegate_task execution is disabled by ORX delegation policy.",
      auditLogPath,
      policy,
      parsed: parsed.value,
      delegate,
    });
  } else {
    result = createDelegateTaskResult({
      status: "adapter_unavailable",
      message: "OpenRouter delegate adapter is not implemented yet.",
      errorCode: "DELEGATE_ADAPTER_UNAVAILABLE",
      errorMessage: "OpenRouter delegate adapter is not implemented yet.",
      auditLogPath,
      policy,
      parsed: parsed.value,
      delegate,
    });
  }

  try {
    writeDelegationAuditEvent(
      {
        type: "delegation.task.attempt",
        ok: false,
        delegate: result.delegate,
        details: {
          source: "model_loop",
          status: result.status,
          enabled: options.enabled === true,
          executionEnabled: false,
          delegateTaskAvailable: false,
          networkAttempted: false,
          subprocesses: "none",
          resultPersistence: "none",
          resultMerge: "manual_summary",
          policy: result.policy,
          ...baseDetails,
        },
      },
      { auditLogPath, now: options.now },
    );
    result.auditWritten = true;
  } catch (error) {
    result.auditWritten = false;
    result.auditError = error instanceof Error ? error.message : String(error);
  }

  return result;
}

export function writeDelegationAuditEvent(
  event: DelegationAuditEvent,
  options: DelegationAuditOptions = {},
): void {
  const path = options.auditLogPath ?? defaultDelegationAuditLogPath();
  const timestamp = event.timestamp ?? (options.now?.() ?? new Date()).toISOString();
  const sanitized = redactSecrets({
    timestamp,
    type: event.type,
    ok: event.ok,
    delegate: event.delegate,
    details: event.details,
  });

  const parentDir = dirname(path);
  assertAuditPathIsSafe(path);
  mkdirSync(parentDir, {
    recursive: true,
    mode: DELEGATION_AUDIT_DIRECTORY_MODE,
  });
  assertAuditPathIsSafe(path);

  const fd = openSync(
    path,
    fsConstants.O_WRONLY | fsConstants.O_APPEND | fsConstants.O_CREAT | O_NOFOLLOW,
    DELEGATION_AUDIT_FILE_MODE,
  );
  try {
    appendFileSync(fd, `${JSON.stringify(sanitized)}\n`, {
      encoding: "utf8",
    });
    fchmodSync(fd, DELEGATION_AUDIT_FILE_MODE);
  } finally {
    closeSync(fd);
  }
}

function parseDelegateTaskArguments(
  args: Record<string, unknown>,
  policy: DelegationExecutionPolicy,
):
  | { ok: true; value: ParsedDelegateTaskArguments }
  | { ok: false; code: string; message: string } {
  const delegate = optionalDelegateName(args.delegate);
  if (args.delegate !== undefined && !delegate) {
    return {
      ok: false,
      code: "INVALID_DELEGATE_NAME",
      message: "delegate must match [a-z][a-z0-9_-]{0,31}.",
    };
  }

  const task = boundedTextArgument(args.task, "task", MAX_TASK_BYTES);
  if (!task.ok) {
    return task;
  }

  const context = args.context === undefined
    ? undefined
    : boundedTextArgument(args.context, "context", MAX_CONTEXT_BYTES);
  if (context && !context.ok) {
    return context;
  }

  const expectedOutput = args.expected_output === undefined
    ? undefined
    : boundedTextArgument(args.expected_output, "expected_output", MAX_EXPECTED_OUTPUT_BYTES);
  if (expectedOutput && !expectedOutput.ok) {
    return expectedOutput;
  }

  const timeoutMs = optionalPolicyInteger(args.timeout_ms, "timeout_ms", 1_000, policy.taskTimeoutMs);
  if (!timeoutMs.ok) {
    return timeoutMs;
  }

  const maxResultBytes = optionalPolicyInteger(
    args.max_result_bytes,
    "max_result_bytes",
    1_024,
    policy.maxResultBytes,
  );
  if (!maxResultBytes.ok) {
    return maxResultBytes;
  }

  const maxTaskCostUsd = optionalPolicyCost(args.max_task_cost_usd, policy.maxTaskCostUsd);
  if (!maxTaskCostUsd.ok) {
    return maxTaskCostUsd;
  }

  return {
    ok: true,
    value: {
      ...(delegate ? { delegate } : {}),
      task: task.value,
      ...(context?.ok ? { context: context.value } : {}),
      ...(expectedOutput?.ok ? { expectedOutput: expectedOutput.value } : {}),
      ...(timeoutMs.value !== undefined ? { timeoutMs: timeoutMs.value } : {}),
      ...(maxResultBytes.value !== undefined ? { maxResultBytes: maxResultBytes.value } : {}),
      ...(maxTaskCostUsd.value !== undefined ? { maxTaskCostUsd: maxTaskCostUsd.value } : {}),
    },
  };
}

function createDelegateTaskResult(options: {
  status: DelegateTaskResult["status"];
  message: string;
  errorCode: string;
  errorMessage: string;
  auditLogPath: string;
  policy: DelegationExecutionPolicy;
  parsed?: ParsedDelegateTaskArguments;
  delegate?: { name: string; provider: "openrouter"; model: string };
}): DelegateTaskResult {
  const taskDetails = options.parsed ? hashedTaskDetails(options.parsed) : {};
  return {
    ok: false,
    status: options.status,
    message: options.message,
    ...(options.delegate ? {
      delegate: options.delegate.name,
      provider: options.delegate.provider,
      model: options.delegate.model,
    } : {}),
    ...taskDetails,
    requestedTimeoutMs: options.parsed?.timeoutMs,
    requestedMaxResultBytes: options.parsed?.maxResultBytes,
    requestedMaxTaskCostUsd: options.parsed?.maxTaskCostUsd,
    policy: summarizePolicy(options.policy),
    executionEnabled: false,
    delegateTaskAvailable: false,
    networkAttempted: false,
    subprocesses: "none",
    resultPersistence: "none",
    resultMerge: "manual_summary",
    modelExposure: "disabled_delegate_task_result",
    trustBoundary:
      "delegate_task output is an ORX policy result, not delegated model output; no external delegate was called.",
    auditLogPath: options.auditLogPath,
    auditWritten: false,
    error: {
      code: options.errorCode,
      message: options.errorMessage,
    },
  };
}

function resolveDelegate(
  requestedDelegate: string | undefined,
  state: DelegationState | undefined,
): { name: string; provider: "openrouter"; model: string } | undefined {
  const delegates = Array.isArray(state?.delegates)
    ? state.delegates.filter(
        (delegate) =>
          delegate.provider === "openrouter" &&
          delegate.execution === "disabled" &&
          SAFE_DELEGATE_NAME_PATTERN.test(delegate.name) &&
          typeof delegate.model === "string" &&
          !SECRET_LIKE_PATTERN.test(delegate.model),
      )
    : [];
  const selected = requestedDelegate
    ? delegates.find((delegate) => delegate.name === requestedDelegate)
    : delegates.length === 1
      ? delegates[0]
      : undefined;
  return selected
    ? {
        name: selected.name,
        provider: "openrouter",
        model: selected.model,
      }
    : undefined;
}

function hashedTaskDetails(parsed: ParsedDelegateTaskArguments): {
  taskHash: string;
  taskBytes: number;
  contextHash?: string;
  contextBytes?: number;
  expectedOutputHash?: string;
  expectedOutputBytes?: number;
} {
  return {
    taskHash: sha256(parsed.task),
    taskBytes: Buffer.byteLength(parsed.task, "utf8"),
    ...(parsed.context ? {
      contextHash: sha256(parsed.context),
      contextBytes: Buffer.byteLength(parsed.context, "utf8"),
    } : {}),
    ...(parsed.expectedOutput ? {
      expectedOutputHash: sha256(parsed.expectedOutput),
      expectedOutputBytes: Buffer.byteLength(parsed.expectedOutput, "utf8"),
    } : {}),
  };
}

function summarizePolicy(policy: DelegationExecutionPolicy): DelegationRuntimePolicySummary {
  return {
    maxTaskCostUsd: policy.maxTaskCostUsd,
    taskTimeoutMs: policy.taskTimeoutMs,
    maxResultBytes: policy.maxResultBytes,
    maxConcurrentDelegates: policy.maxConcurrentDelegates,
    credentialForwarding: policy.credentialForwarding,
    resultPersistence: policy.resultPersistence,
    resultMerge: policy.resultMerge,
  };
}

function optionalDelegateName(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  return SAFE_DELEGATE_NAME_PATTERN.test(normalized) && !SECRET_LIKE_PATTERN.test(normalized)
    ? normalized
    : undefined;
}

function boundedTextArgument(
  value: unknown,
  name: string,
  maxBytes: number,
): { ok: true; value: string } | { ok: false; code: string; message: string } {
  if (typeof value !== "string" || value.trim().length === 0) {
    return {
      ok: false,
      code: "INVALID_DELEGATE_TASK_ARGUMENTS",
      message: `${name} must be a non-empty string.`,
    };
  }
  if (CONTROL_CHAR_PATTERN.test(value)) {
    return {
      ok: false,
      code: "INVALID_DELEGATE_TASK_ARGUMENTS",
      message: `${name} must not contain terminal control characters.`,
    };
  }
  if (Buffer.byteLength(value, "utf8") > maxBytes) {
    return {
      ok: false,
      code: "DELEGATE_TASK_ARGUMENT_TOO_LARGE",
      message: `${name} exceeds ${maxBytes} bytes.`,
    };
  }
  return { ok: true, value };
}

function optionalPolicyInteger(
  value: unknown,
  name: string,
  minimum: number,
  maximum: number,
): { ok: true; value?: number } | { ok: false; code: string; message: string } {
  if (value === undefined) {
    return { ok: true };
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum || value > maximum) {
    return {
      ok: false,
      code: "DELEGATE_TASK_POLICY_LIMIT_EXCEEDED",
      message: `${name} must be an integer between ${minimum} and ${maximum}.`,
    };
  }
  return { ok: true, value };
}

function optionalPolicyCost(
  value: unknown,
  maximum: number,
): { ok: true; value?: number } | { ok: false; code: string; message: string } {
  if (value === undefined) {
    return { ok: true };
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > maximum) {
    return {
      ok: false,
      code: "DELEGATE_TASK_POLICY_LIMIT_EXCEEDED",
      message: `max_task_cost_usd must be between 0 and ${maximum}.`,
    };
  }
  return { ok: true, value: Math.round(value * 10_000) / 10_000 };
}

function assertAuditPathIsSafe(path: string): void {
  const parentDir = dirname(resolve(path));
  assertNoSymlinkInAuditParentPath(parentDir);
  if (existsSync(parentDir)) {
    const stat = lstatSync(parentDir);
    if (stat.isSymbolicLink()) {
      throw new Error("Delegation audit parent path must not contain symlinks.");
    }
    if (!stat.isDirectory()) {
      throw new Error("Delegation audit parent path must be a directory.");
    }
  }
  if (existsSync(path)) {
    const stat = lstatSync(path);
    if (!stat.isFile()) {
      throw new Error("Delegation audit path must be a regular file.");
    }
  }
}

function assertNoSymlinkInAuditParentPath(parentDir: string): void {
  const resolvedParent = resolve(parentDir);
  const root = parse(resolvedParent).root;
  const components = relative(root, resolvedParent).split(sep).filter(Boolean);
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
      throw new Error("Delegation audit parent path must not contain symlinks.");
    }
    if (!stat.isDirectory()) {
      throw new Error("Delegation audit parent path must be a directory.");
    }
  }
}
