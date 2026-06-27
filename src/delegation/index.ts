export type DelegationProvider = "openrouter";
export type DelegationExecutionState = "disabled";

export interface OrchestrationControllerConfig {
  provider: DelegationProvider;
  model: string;
  execution: DelegationExecutionState;
}

export interface DelegateConfig {
  name: string;
  provider: DelegationProvider;
  model: string;
  execution: DelegationExecutionState;
}

export interface DelegationState {
  controller?: OrchestrationControllerConfig;
  delegates: DelegateConfig[];
  executionEnabled: false;
}

export interface DelegationStatusSummary {
  controller: string;
  delegateCount: number;
  executionEnabled: false;
  delegateTaskAvailable: false;
}

export class DelegationStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DelegationStateError";
  }
}

const SAFE_DELEGATE_NAME_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;
const SAFE_OPENROUTER_MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}\/[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$/;
const CONTROL_CHAR_PATTERN = /[\x00-\x1F\x7F-\x9F]/;
const SECRET_LIKE_PATTERN =
  /\b(?:sk-or-v1-[A-Za-z0-9_-]+|github_pat_[A-Za-z0-9_]+|ghp_[A-Za-z0-9_]+|glpat-[A-Za-z0-9_-]+|xox[baprs]-[A-Za-z0-9-]+)\b/i;
const MAX_MODEL_LENGTH = 160;
const MAX_DELEGATES = 16;

export function createEmptyDelegationState(): DelegationState {
  return {
    delegates: [],
    executionEnabled: false,
  };
}

export function setOpenRouterController(
  state: DelegationState | undefined,
  rawModel: string,
): DelegationState {
  const model = validateOpenRouterModel(rawModel);
  return {
    ...normalizeDelegationState(state),
    controller: {
      provider: "openrouter",
      model,
      execution: "disabled",
    },
    executionEnabled: false,
  };
}

export function clearController(state: DelegationState | undefined): DelegationState {
  const current = normalizeDelegationState(state);
  return {
    delegates: current.delegates,
    executionEnabled: false,
  };
}

export function addOpenRouterDelegate(
  state: DelegationState | undefined,
  rawName: string,
  rawModel: string,
): { state: DelegationState; created: boolean; delegate: DelegateConfig } {
  const name = validateDelegateName(rawName);
  const model = validateOpenRouterModel(rawModel);
  const current = normalizeDelegationState(state);
  const existing = current.delegates.find((delegate) => delegate.name === name);
  const delegate: DelegateConfig = {
    name,
    provider: "openrouter",
    model,
    execution: "disabled",
  };
  if (!existing && current.delegates.length >= MAX_DELEGATES) {
    throw new DelegationStateError(`Delegate limit reached; maximum is ${MAX_DELEGATES}.`);
  }
  const delegates = existing
    ? current.delegates.map((item) => (item.name === name ? delegate : item))
    : [...current.delegates, delegate];

  return {
    state: {
      ...current,
      delegates: sortDelegates(delegates),
      executionEnabled: false,
    },
    created: !existing,
    delegate,
  };
}

export function removeDelegate(
  state: DelegationState | undefined,
  rawName: string,
): { state: DelegationState; removed: DelegateConfig } {
  const name = validateDelegateName(rawName);
  const current = normalizeDelegationState(state);
  const removed = current.delegates.find((delegate) => delegate.name === name);
  if (!removed) {
    throw new DelegationStateError(`Delegate not found: ${name}`);
  }

  return {
    state: {
      ...current,
      delegates: current.delegates.filter((delegate) => delegate.name !== name),
      executionEnabled: false,
    },
    removed,
  };
}

export function clearDelegates(state: DelegationState | undefined): DelegationState {
  const current = normalizeDelegationState(state);
  return {
    controller: current.controller,
    delegates: [],
    executionEnabled: false,
  };
}

export function normalizeDelegationState(value: unknown): DelegationState {
  if (!isRecord(value)) {
    return createEmptyDelegationState();
  }

  const controller = sanitizeController(value.controller);
  const delegates = Array.isArray(value.delegates)
    ? sortDelegates(value.delegates.slice(0, MAX_DELEGATES * 2).flatMap((delegate) => {
        const sanitized = sanitizeDelegate(delegate);
        return sanitized ? [sanitized] : [];
      }))
    : [];

  return {
    ...(controller ? { controller } : {}),
    delegates: dedupeDelegates(delegates).slice(0, MAX_DELEGATES),
    executionEnabled: false,
  };
}

export function compactDelegationStateForStorage(
  state: unknown,
): DelegationState | undefined {
  const normalized = normalizeDelegationState(state);
  if (!normalized.controller && normalized.delegates.length === 0) {
    return undefined;
  }
  return normalized;
}

export function getDelegationStatusSummary(
  state: DelegationState | undefined,
): DelegationStatusSummary {
  const normalized = normalizeDelegationState(state);
  return {
    controller: normalized.controller
      ? `${normalized.controller.provider}:${normalized.controller.model}`
      : "none",
    delegateCount: normalized.delegates.length,
    executionEnabled: false,
    delegateTaskAvailable: false,
  };
}

export function renderOrchestratorStatus(state: DelegationState | undefined): string {
  const normalized = normalizeDelegationState(state);
  return [
    "ORX orchestrator scaffold:",
    normalized.controller
      ? `controller: openrouter ${normalized.controller.model}`
      : "controller: none",
    `delegate_count: ${normalized.delegates.length}`,
    "execution: disabled",
    "delegate_task: unavailable",
    "network_calls: none",
  ].join("\n");
}

export function renderDelegates(state: DelegationState | undefined): string {
  const normalized = normalizeDelegationState(state);
  const lines = [
    "ORX delegates scaffold:",
    "execution: disabled",
    "delegate_task: unavailable in this scaffold",
    `delegates: ${normalized.delegates.length}`,
  ];

  for (const delegate of normalized.delegates) {
    lines.push(
      `  - ${delegate.name}: provider=openrouter model=${delegate.model} execution=disabled`,
    );
  }

  return lines.join("\n");
}

export function validateDelegateName(rawName: string): string {
  const name = normalizeInput(rawName);
  if (!name) {
    throw new DelegationStateError("Delegate name is required.");
  }
  if (CONTROL_CHAR_PATTERN.test(rawName)) {
    throw new DelegationStateError("Delegate name must not contain control characters.");
  }
  if (SECRET_LIKE_PATTERN.test(rawName)) {
    throw new DelegationStateError("Delegate name must not contain secret-like values.");
  }
  if (!SAFE_DELEGATE_NAME_PATTERN.test(name)) {
    throw new DelegationStateError(
      "Delegate name must match [a-z][a-z0-9_-]{0,31}.",
    );
  }
  return name;
}

export function validateOpenRouterModel(rawModel: string): string {
  const model = normalizeInput(rawModel);
  if (!model) {
    throw new DelegationStateError("OpenRouter model is required.");
  }
  if (model.length > MAX_MODEL_LENGTH) {
    throw new DelegationStateError("OpenRouter model is too long.");
  }
  if (CONTROL_CHAR_PATTERN.test(rawModel)) {
    throw new DelegationStateError("OpenRouter model must not contain control characters.");
  }
  if (SECRET_LIKE_PATTERN.test(rawModel)) {
    throw new DelegationStateError("OpenRouter model must not contain secret-like values.");
  }
  if (!SAFE_OPENROUTER_MODEL_PATTERN.test(model)) {
    throw new DelegationStateError(
      "OpenRouter model must be a model slug, openrouter/auto, or openrouter/fusion.",
    );
  }
  return model;
}

function sanitizeController(value: unknown): OrchestrationControllerConfig | undefined {
  if (!isRecord(value) || value.provider !== "openrouter" || value.execution !== "disabled") {
    return undefined;
  }

  try {
    return {
      provider: "openrouter",
      model: validateOpenRouterModel(stringOrEmpty(value.model)),
      execution: "disabled",
    };
  } catch {
    return undefined;
  }
}

function sanitizeDelegate(value: unknown): DelegateConfig | undefined {
  if (!isRecord(value) || value.provider !== "openrouter" || value.execution !== "disabled") {
    return undefined;
  }

  try {
    return {
      name: validateDelegateName(stringOrEmpty(value.name)),
      provider: "openrouter",
      model: validateOpenRouterModel(stringOrEmpty(value.model)),
      execution: "disabled",
    };
  } catch {
    return undefined;
  }
}

function normalizeInput(value: string): string {
  return value.trim();
}

function sortDelegates(delegates: DelegateConfig[]): DelegateConfig[] {
  return [...delegates].sort((left, right) => left.name.localeCompare(right.name));
}

function dedupeDelegates(delegates: DelegateConfig[]): DelegateConfig[] {
  const seen = new Set<string>();
  const result: DelegateConfig[] = [];
  for (const delegate of delegates) {
    if (seen.has(delegate.name)) {
      continue;
    }
    seen.add(delegate.name);
    result.push(delegate);
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringOrEmpty(value: unknown): string {
  return typeof value === "string" ? value : "";
}
