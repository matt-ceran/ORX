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
import { dirname, join, resolve } from "node:path";

export * from "./policy.js";
export * from "./runtime.js";

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

export interface DelegationReadinessRenderOptions {
  surface?: "interactive" | "cli";
  policy?: {
    executionEnabled?: boolean;
  };
}

export interface DelegationTeamsPathOptions {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  configPath?: string;
}

export interface DelegationTeamRegistryIoOptions {
  configPath?: string;
}

export interface SavedDelegationTeamRecord {
  id: string;
  delegation: DelegationState;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DelegationTeamRegistryFile {
  version: 1;
  teams: Record<string, SavedDelegationTeamRecord>;
}

export interface DelegationTeamStatusSummary {
  count: number;
  teams: SavedDelegationTeamRecord[];
}

export interface DelegationTeamStateChange {
  ok: boolean;
  team?: SavedDelegationTeamRecord;
  message: string;
}

export class DelegationStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DelegationStateError";
  }
}

const SAFE_DELEGATE_NAME_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;
const SAFE_DELEGATION_TEAM_ID_PATTERN = /^[a-z][a-z0-9._-]{0,63}$/;
const SAFE_OPENROUTER_MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}\/[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$/;
const CONTROL_CHAR_PATTERN = /[\x00-\x1F\x7F-\x9F]/;
const CONTROL_CHAR_GLOBAL_PATTERN = /[\x00-\x1F\x7F-\x9F]/g;
const SECRET_LIKE_PATTERN =
  /\b(?:sk-or-v1-[A-Za-z0-9_-]+|github_pat_[A-Za-z0-9_]+|ghp_[A-Za-z0-9_]+|glpat-[A-Za-z0-9_-]+|xox[baprs]-[A-Za-z0-9-]+)\b/i;
const MAX_MODEL_LENGTH = 160;
const MAX_DELEGATES = 16;
const MAX_TEAM_DESCRIPTION_LENGTH = 240;
const MAX_DELEGATION_TEAMS = 64;
const MAX_DELEGATION_TEAM_REGISTRY_BYTES = 256 * 1024;
const DELEGATION_TEAM_REGISTRY_VERSION = 1;
const DELEGATION_TEAM_DIRECTORY_MODE = 0o700;
const DELEGATION_TEAM_FILE_MODE = 0o600;
const O_NOFOLLOW = typeof fsConstants.O_NOFOLLOW === "number" ? fsConstants.O_NOFOLLOW : 0;

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

export function defaultDelegationTeamsPath(): string {
  return join(homedir(), ".orx", "delegation", "teams.json");
}

export function resolveDelegationTeamsPath(options: DelegationTeamsPathOptions = {}): string {
  const explicitPath =
    options.configPath ??
    options.env?.ORX_DELEGATION_TEAMS_PATH ??
    options.env?.ORX_DELEGATION_CONFIG_PATH;
  if (!explicitPath) {
    return defaultDelegationTeamsPath();
  }

  return resolve(options.cwd ?? process.cwd(), explicitPath);
}

export const resolveDelegationTeamRegistryPath = resolveDelegationTeamsPath;

export function emptyDelegationTeamRegistry(): DelegationTeamRegistryFile {
  return {
    version: DELEGATION_TEAM_REGISTRY_VERSION,
    teams: {},
  };
}

export function loadDelegationTeamRegistry(
  options: DelegationTeamRegistryIoOptions = {},
): DelegationTeamRegistryFile {
  const path = options.configPath ?? defaultDelegationTeamsPath();
  if (!existsSync(path)) {
    return emptyDelegationTeamRegistry();
  }

  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.size > MAX_DELEGATION_TEAM_REGISTRY_BYTES) {
      return emptyDelegationTeamRegistry();
    }
    const fd = openSync(path, fsConstants.O_RDONLY | O_NOFOLLOW);
    try {
      const openStat = fstatSync(fd);
      if (!openStat.isFile() || openStat.size > MAX_DELEGATION_TEAM_REGISTRY_BYTES) {
        return emptyDelegationTeamRegistry();
      }
      tightenDelegationTeamRegistryPermissions(path, fd);
      const parsed = JSON.parse(readFileSync(fd, { encoding: "utf8" })) as unknown;
      return sanitizeDelegationTeamRegistry(parsed);
    } finally {
      closeSync(fd);
    }
  } catch {
    return emptyDelegationTeamRegistry();
  }
}

export function saveDelegationTeamRegistry(
  registry: DelegationTeamRegistryFile,
  options: DelegationTeamRegistryIoOptions = {},
): void {
  const path = options.configPath ?? defaultDelegationTeamsPath();
  const sanitized = sanitizeDelegationTeamRegistry(registry);
  const parentDir = dirname(path);
  const parentExisted = existsSync(parentDir);
  mkdirSync(parentDir, {
    recursive: true,
    mode: DELEGATION_TEAM_DIRECTORY_MODE,
  });
  if (shouldTightenDelegationTeamParent(path, parentExisted)) {
    chmodSync(parentDir, DELEGATION_TEAM_DIRECTORY_MODE);
  }
  if (existsSync(path)) {
    const existing = lstatSync(path);
    if (!existing.isFile()) {
      throw new DelegationStateError("Delegation team registry path must be a regular file.");
    }
  }
  const fd = openSync(
    path,
    fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_TRUNC | O_NOFOLLOW,
    DELEGATION_TEAM_FILE_MODE,
  );
  try {
    writeFileSync(fd, `${JSON.stringify(sanitized, null, 2)}\n`, {
      encoding: "utf8",
    });
    fchmodSync(fd, DELEGATION_TEAM_FILE_MODE);
  } finally {
    closeSync(fd);
  }
}

export function getDelegationTeamStatusSummary(
  options: DelegationTeamRegistryIoOptions = {},
): DelegationTeamStatusSummary {
  const registry = loadDelegationTeamRegistry({ configPath: options.configPath });
  const teams = Object.values(registry.teams).sort((left, right) =>
    left.id.localeCompare(right.id),
  );

  return {
    count: teams.length,
    teams,
  };
}

export function findSavedDelegationTeam(
  id: string,
  options: DelegationTeamRegistryIoOptions = {},
): SavedDelegationTeamRecord | undefined {
  const teamId = normalizeDelegationTeamId(id);
  if (!teamId) {
    return undefined;
  }

  return loadDelegationTeamRegistry({ configPath: options.configPath }).teams[teamId];
}

export function saveDelegationTeam(
  id: string,
  state: DelegationState | undefined,
  options: DelegationTeamRegistryIoOptions & {
    description?: string;
    now?: () => Date;
  } = {},
): DelegationTeamStateChange {
  const teamId = normalizeDelegationTeamId(id);
  if (!teamId) {
    return {
      ok: false,
      message: "Invalid delegation team id. Use lowercase letters, numbers, dot, underscore, or dash; start with a letter.",
    };
  }

  const delegation = compactDelegationStateForStorage(state);
  if (!delegation) {
    return {
      ok: false,
      message: "Delegation team is empty. Set a controller or delegate before saving.",
    };
  }

  const registry = loadDelegationTeamRegistry({ configPath: options.configPath });
  const existing = registry.teams[teamId];
  if (!existing && Object.keys(registry.teams).length >= MAX_DELEGATION_TEAMS) {
    return {
      ok: false,
      message: `Delegation team limit reached; maximum is ${MAX_DELEGATION_TEAMS}.`,
    };
  }
  const now = (options.now?.() ?? new Date()).toISOString();
  const team: SavedDelegationTeamRecord = {
    id: teamId,
    delegation,
    ...(sanitizeTeamDescription(options.description) ?? existing?.description
      ? { description: sanitizeTeamDescription(options.description) ?? existing?.description }
      : {}),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  registry.teams[teamId] = team;
  saveDelegationTeamRegistry(registry, { configPath: options.configPath });

  return {
    ok: true,
    team,
    message: `Delegation team ${teamId} saved. Execution remains disabled.`,
  };
}

export function deleteSavedDelegationTeam(
  id: string,
  options: DelegationTeamRegistryIoOptions = {},
): DelegationTeamStateChange {
  const teamId = normalizeDelegationTeamId(id);
  if (!teamId) {
    return {
      ok: false,
      message: "Invalid delegation team id. Use lowercase letters, numbers, dot, underscore, or dash; start with a letter.",
    };
  }

  const registry = loadDelegationTeamRegistry({ configPath: options.configPath });
  const team = registry.teams[teamId];
  if (!team) {
    return {
      ok: false,
      message: `Unknown delegation team: ${teamId}`,
    };
  }

  delete registry.teams[teamId];
  saveDelegationTeamRegistry(registry, { configPath: options.configPath });

  return {
    ok: true,
    team,
    message: `Delegation team ${teamId} deleted.`,
  };
}

export function renderDelegationTeamList(
  summary: DelegationTeamStatusSummary,
  path?: string,
): string {
  const lines = [
    "ORX delegation teams:",
    path ? `  registry_path: ${path}` : undefined,
    `  saved_teams: ${summary.count}`,
    "  execution: disabled",
    "  delegate_task: unavailable",
  ];

  if (summary.teams.length === 0) {
    lines.push("  none");
    return lines.filter((line): line is string => Boolean(line)).join("\n");
  }

  for (const team of summary.teams) {
    lines.push(
      `  ${team.id} controller=${formatControllerForLine(team.delegation)} delegates=${team.delegation.delegates.length} updated=${team.updatedAt}`,
    );
  }

  return lines.filter((line): line is string => Boolean(line)).join("\n");
}

export function renderDelegationTeamInspect(team: SavedDelegationTeamRecord): string {
  const lines = [
    `ORX delegation team: ${team.id}`,
    team.description ? `description: ${team.description}` : undefined,
    team.delegation.controller
      ? `controller: openrouter ${team.delegation.controller.model}`
      : "controller: none",
    `delegates: ${team.delegation.delegates.length}`,
    "execution: disabled",
    "delegate_task: unavailable",
    "model_exposure: none",
    "network_calls: none",
    `created_at: ${team.createdAt}`,
    `updated_at: ${team.updatedAt}`,
  ].filter((line): line is string => Boolean(line));

  for (const delegate of team.delegation.delegates) {
    lines.push(
      `  - ${delegate.name}: provider=openrouter model=${delegate.model} execution=disabled`,
    );
  }

  return lines.join("\n");
}

export function renderDelegationTeamUse(
  team: SavedDelegationTeamRecord,
  options: { surface: "cli" | "interactive" },
): string {
  const lines =
    options.surface === "cli"
      ? [
          `Delegation team ${team.id} inspected for use.`,
          "state_changed: no",
          "reason: noninteractive CLI has no active delegation session",
          "Use /delegates use <id> or /delegate team use <id> inside chat to load it into session-local scaffold metadata.",
        ]
      : [
          `Delegation team ${team.id} loaded into this chat session.`,
          "state_changed: yes",
        ];

  return [
    ...lines,
    "execution: disabled",
    "delegate_task: unavailable",
    "network_calls: none",
    "subprocesses: none",
    "",
    renderDelegationTeamInspect(team),
  ].join("\n");
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

export function renderDelegationReadinessPlan(
  state: DelegationState | undefined,
  options: DelegationReadinessRenderOptions = {},
): string {
  const normalized = normalizeDelegationState(state);
  const policyEnabled = options.policy?.executionEnabled === true;
  const hasDelegate = normalized.delegates.length > 0;
  const chatReady = options.surface !== "cli" && policyEnabled && hasDelegate;
  const blockers: string[] = [];
  if (!policyEnabled) {
    blockers.push("delegation execution policy must be enabled before model exposure");
  }
  if (!hasDelegate) {
    blockers.push("at least one chat-session delegate is required before model exposure");
  }
  if (options.surface === "cli") {
    blockers.push("noninteractive CLI cannot attach a saved team to a live chat session");
  }
  const lines = [
    "ORX delegation readiness:",
    normalized.controller
      ? `controller: openrouter ${normalized.controller.model}`
      : "controller: none",
    `delegate_count: ${normalized.delegates.length}`,
    `execution: ${policyEnabled ? "enabled" : "disabled"}`,
    `delegate_task: ${chatReady ? "available_in_chat" : "unavailable"}`,
    "delegate_task_schema: policy_gated",
    "runtime_enforcement: policy_gated_openrouter_adapter",
    "audit_log: configured",
    `model_exposure: ${chatReady ? "available_in_chat" : "available_when_policy_and_delegate_are_enabled"}`,
    `network_calls: ${policyEnabled ? "openrouter_delegate_only_when_enabled" : "none"}`,
    "subprocesses: none",
    options.surface === "cli"
    ? "state_scope: cli-saved-teams-available"
      : "state_scope: interactive-session-local",
    "readiness_blockers:",
    blockers.length === 0 ? "  none" : blockers.map((blocker) => `  - ${blocker}`),
    "readiness_notes:",
    "  - delegated model output is untrusted and must be manually summarized",
  ];
  return lines.flat().join("\n");
}

export function renderSessionlessDelegationRefusal(action: string): string {
  return [
    "ORX delegation scaffold:",
    "status: refused",
    `action: ${action}`,
    "reason: noninteractive CLI has no active delegation chat session",
    "state_changed: no",
    "execution: disabled",
    "delegate_task: unavailable",
    "model_exposure: none",
    "network_calls: none",
    "subprocesses: none",
    "Use interactive chat slash commands to store session-local scaffold metadata.",
  ].join("\n");
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

export function validateDelegationTeamId(rawId: string): string {
  const teamId = normalizeDelegationTeamId(rawId);
  if (!teamId) {
    throw new DelegationStateError(
      "Delegation team id must match [a-z][a-z0-9._-]{0,63}.",
    );
  }
  if (CONTROL_CHAR_PATTERN.test(rawId)) {
    throw new DelegationStateError("Delegation team id must not contain control characters.");
  }
  if (SECRET_LIKE_PATTERN.test(rawId)) {
    throw new DelegationStateError("Delegation team id must not contain secret-like values.");
  }
  return teamId;
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

function normalizeDelegationTeamId(value: string): string | undefined {
  const teamId = normalizeInput(value).toLowerCase();
  if (CONTROL_CHAR_PATTERN.test(value) || SECRET_LIKE_PATTERN.test(value)) {
    return undefined;
  }
  return SAFE_DELEGATION_TEAM_ID_PATTERN.test(teamId) ? teamId : undefined;
}

function sanitizeDelegationTeamRegistry(value: unknown): DelegationTeamRegistryFile {
  if (!isRecord(value) || value.version !== DELEGATION_TEAM_REGISTRY_VERSION || !isRecord(value.teams)) {
    return emptyDelegationTeamRegistry();
  }

  const teams: Record<string, SavedDelegationTeamRecord> = {};
  for (const [rawId, rawTeam] of Object.entries(value.teams)) {
    if (Object.keys(teams).length >= MAX_DELEGATION_TEAMS) {
      break;
    }
    const team = sanitizeDelegationTeam(rawId, rawTeam);
    if (team) {
      teams[team.id] = team;
    }
  }

  return {
    version: DELEGATION_TEAM_REGISTRY_VERSION,
    teams,
  };
}

function sanitizeDelegationTeam(
  rawId: string,
  value: unknown,
): SavedDelegationTeamRecord | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const teamId = normalizeDelegationTeamId(stringOrEmpty(value.id) || rawId);
  if (!teamId || normalizeDelegationTeamId(rawId) !== teamId) {
    return undefined;
  }

  const delegation = compactDelegationStateForStorage(value.delegation);
  if (!delegation) {
    return undefined;
  }

  const createdAt = sanitizeTimestamp(value.createdAt);
  const updatedAt = sanitizeTimestamp(value.updatedAt);
  if (!createdAt || !updatedAt) {
    return undefined;
  }

  const description = sanitizeTeamDescription(value.description);

  return {
    id: teamId,
    delegation,
    ...(description ? { description } : {}),
    createdAt,
    updatedAt,
  };
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

function sanitizeTeamDescription(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const description = value.replace(CONTROL_CHAR_GLOBAL_PATTERN, " ").trim();
  if (!description || SECRET_LIKE_PATTERN.test(description)) {
    return undefined;
  }
  return description.slice(0, MAX_TEAM_DESCRIPTION_LENGTH);
}

function tightenDelegationTeamRegistryPermissions(path: string, fd: number): void {
  try {
    if (shouldTightenDelegationTeamParent(path, true)) {
      chmodSync(dirname(path), DELEGATION_TEAM_DIRECTORY_MODE);
    }
    fchmodSync(fd, DELEGATION_TEAM_FILE_MODE);
  } catch {
    // Best effort only; unreadable or foreign-owned files will be handled by the caller.
  }
}

function shouldTightenDelegationTeamParent(path: string, parentExisted: boolean): boolean {
  return !parentExisted || resolve(path) === resolve(defaultDelegationTeamsPath());
}

function formatControllerForLine(state: DelegationState): string {
  return state.controller ? `openrouter:${state.controller.model}` : "none";
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
