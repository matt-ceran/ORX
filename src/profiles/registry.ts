import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { OrxConfig, OrxMode, OrxTheme, PermissionConfig } from "../config/types.js";
import {
  DEFAULT_APPROVAL_POLICY,
  DEFAULT_MODE,
  DEFAULT_MODEL,
  DEFAULT_SANDBOX_MODE,
  DEFAULT_THEME,
  TERMINAL_THEMES,
} from "../constants.js";

export interface ProfileConfigPathOptions {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  configPath?: string;
}

export interface ProfileRegistryIoOptions {
  configPath?: string;
}

export interface SavedProfileSnapshot {
  model: string;
  mode: OrxMode;
  fusionPreset?: string;
  theme: OrxTheme;
  permissions: PermissionConfig;
}

export interface SavedProfileRecord {
  id: string;
  config: SavedProfileSnapshot;
  createdAt: string;
  updatedAt: string;
}

export interface ProfileRegistryFile {
  version: 1;
  profiles: Record<string, SavedProfileRecord>;
}

export interface ProfileStateChange {
  ok: boolean;
  profile?: SavedProfileRecord;
  message: string;
}

export interface ProfileStatusSummary {
  count: number;
  profiles: SavedProfileRecord[];
}

const REGISTRY_VERSION = 1;
const PROFILE_DIRECTORY_MODE = 0o700;
const PROFILE_FILE_MODE = 0o600;
const SAFE_PROFILE_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const DISPLAY_UNSAFE_PATTERN = /[\x00-\x1F\x7F]/;
const SECRET_LIKE_PATTERN =
  /\b(?:sk-or-v1-[A-Za-z0-9_-]+|github_pat_[A-Za-z0-9_]+|ghp_[A-Za-z0-9_]+|glpat-[A-Za-z0-9_-]+|xox[baprs]-[A-Za-z0-9-]+)\b/;
const VALID_MODES = new Set<OrxMode>(["exact", "auto", "fusion"]);
const VALID_THEMES = new Set<OrxTheme>(TERMINAL_THEMES);

export class ProfileRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProfileRegistryError";
  }
}

export function defaultProfileConfigPath(): string {
  return join(homedir(), ".orx", "profiles.json");
}

export function resolveProfileConfigPath(options: ProfileConfigPathOptions = {}): string {
  const explicitPath = options.configPath ?? options.env?.ORX_PROFILE_CONFIG_PATH;
  if (!explicitPath) {
    return defaultProfileConfigPath();
  }

  return resolve(options.cwd ?? process.cwd(), explicitPath);
}

export function emptyProfileRegistry(): ProfileRegistryFile {
  return {
    version: REGISTRY_VERSION,
    profiles: {},
  };
}

export function loadProfileRegistry(
  options: ProfileRegistryIoOptions = {},
): ProfileRegistryFile {
  const path = options.configPath ?? defaultProfileConfigPath();
  if (!existsSync(path)) {
    return emptyProfileRegistry();
  }

  try {
    tightenProfileRegistryPermissions(path);
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return sanitizeProfileRegistry(parsed);
  } catch {
    return emptyProfileRegistry();
  }
}

export function saveProfileRegistry(
  registry: ProfileRegistryFile,
  options: ProfileRegistryIoOptions = {},
): void {
  const path = options.configPath ?? defaultProfileConfigPath();
  const sanitized = sanitizeProfileRegistry(registry);
  const parentDir = dirname(path);
  const parentExisted = existsSync(parentDir);
  mkdirSync(dirname(path), {
    recursive: true,
    mode: PROFILE_DIRECTORY_MODE,
  });
  if (shouldTightenProfileParent(path, parentExisted)) {
    chmodSync(parentDir, PROFILE_DIRECTORY_MODE);
  }
  writeFileSync(path, `${JSON.stringify(sanitized, null, 2)}\n`, {
    encoding: "utf8",
    mode: PROFILE_FILE_MODE,
  });
  chmodSync(path, PROFILE_FILE_MODE);
}

export function getProfileStatusSummary(
  options: ProfileRegistryIoOptions = {},
): ProfileStatusSummary {
  const registry = loadProfileRegistry({ configPath: options.configPath });
  const profiles = Object.values(registry.profiles).sort((left, right) =>
    left.id.localeCompare(right.id),
  );

  return {
    count: profiles.length,
    profiles,
  };
}

export function findSavedProfile(
  id: string,
  options: ProfileRegistryIoOptions = {},
): SavedProfileRecord | undefined {
  const profileId = normalizeProfileId(id);
  if (!profileId) {
    return undefined;
  }

  return loadProfileRegistry({ configPath: options.configPath }).profiles[profileId];
}

export function saveCurrentProfile(
  id: string,
  config: OrxConfig,
  options: ProfileRegistryIoOptions & { now?: () => Date } = {},
): ProfileStateChange {
  const profileId = normalizeProfileId(id);
  if (!profileId) {
    return {
      ok: false,
      message: "Invalid profile id. Use lowercase letters, numbers, dot, underscore, or dash.",
    };
  }

  const registry = loadProfileRegistry({ configPath: options.configPath });
  const existing = registry.profiles[profileId];
  const now = (options.now?.() ?? new Date()).toISOString();
  const profile: SavedProfileRecord = {
    id: profileId,
    config: snapshotProfileConfig(config),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  registry.profiles[profileId] = profile;
  saveProfileRegistry(registry, { configPath: options.configPath });

  return {
    ok: true,
    profile,
    message: `Profile ${profileId} saved. API keys are not stored in profiles.`,
  };
}

export function deleteSavedProfile(
  id: string,
  options: ProfileRegistryIoOptions = {},
): ProfileStateChange {
  const profileId = normalizeProfileId(id);
  if (!profileId) {
    return {
      ok: false,
      message: "Invalid profile id. Use lowercase letters, numbers, dot, underscore, or dash.",
    };
  }

  const registry = loadProfileRegistry({ configPath: options.configPath });
  const profile = registry.profiles[profileId];
  if (!profile) {
    return {
      ok: false,
      message: `Unknown profile: ${profileId}`,
    };
  }

  delete registry.profiles[profileId];
  saveProfileRegistry(registry, { configPath: options.configPath });

  return {
    ok: true,
    profile,
    message: `Profile ${profileId} deleted.`,
  };
}

export function applySavedProfile(config: OrxConfig, profile: SavedProfileRecord): OrxConfig {
  return {
    ...config,
    model: profile.config.model,
    mode: profile.config.mode,
    fusionPreset: profile.config.fusionPreset,
    theme: profile.config.theme,
    permissions: {
      approvalPolicy: profile.config.permissions.approvalPolicy,
      sandboxMode: profile.config.permissions.sandboxMode,
    },
    activeProfile: profile.id,
  };
}

export function snapshotProfileConfig(config: OrxConfig): SavedProfileSnapshot {
  return sanitizeProfileSnapshot({
    model: config.model,
    mode: config.mode,
    fusionPreset: config.fusionPreset,
    theme: config.theme ?? DEFAULT_THEME,
    permissions: {
      approvalPolicy: config.permissions.approvalPolicy,
      sandboxMode: config.permissions.sandboxMode,
    },
  });
}

export function renderProfileList(
  summary: ProfileStatusSummary,
  activeProfile?: string,
): string {
  const lines = [
    "ORX profiles:",
    `  active_profile: ${activeProfile ?? "none"}`,
    `  saved_profiles: ${summary.count}`,
  ];

  if (summary.profiles.length === 0) {
    lines.push("  none");
    return lines.join("\n");
  }

  for (const profile of summary.profiles) {
    lines.push(`  ${profile.id} ${formatProfileConfigInline(profile.config)} updated=${profile.updatedAt}`);
  }

  return lines.join("\n");
}

export function renderProfileInspect(profile: SavedProfileRecord): string {
  return [
    `ORX profile: ${profile.id}`,
    `  mode: ${profile.config.mode}`,
    `  model: ${profile.config.model}`,
    `  fusion_preset: ${profile.config.fusionPreset ?? "none"}`,
    `  theme: ${profile.config.theme}`,
    `  permissions: ${profile.config.permissions.approvalPolicy}/${profile.config.permissions.sandboxMode}`,
    `  created_at: ${profile.createdAt}`,
    `  updated_at: ${profile.updatedAt}`,
    "  api_key: not stored",
  ].join("\n");
}

function sanitizeProfileRegistry(value: unknown): ProfileRegistryFile {
  if (!isPlainObject(value)) {
    return emptyProfileRegistry();
  }

  const profiles: Record<string, SavedProfileRecord> = {};
  if (isPlainObject(value.profiles)) {
    for (const [fallbackId, rawRecord] of Object.entries(value.profiles)) {
      const record = sanitizeProfileRecord(fallbackId, rawRecord);
      if (record) {
        profiles[record.id] = record;
      }
    }
  }

  return {
    version: REGISTRY_VERSION,
    profiles,
  };
}

function sanitizeProfileRecord(
  fallbackId: string,
  value: unknown,
): SavedProfileRecord | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }

  const id = normalizeProfileId(
    typeof value.id === "string" && value.id ? value.id : fallbackId,
  );
  if (!id) {
    return undefined;
  }

  try {
    const config = sanitizeProfileSnapshot(value.config);
    const createdAt = sanitizeStoredTimestamp(value.createdAt, new Date(0).toISOString());
    const updatedAt = sanitizeStoredTimestamp(value.updatedAt, createdAt);
    return {
      id,
      config,
      createdAt,
      updatedAt,
    };
  } catch {
    return undefined;
  }
}

function sanitizeProfileSnapshot(value: unknown): SavedProfileSnapshot {
  if (!isPlainObject(value)) {
    throw new ProfileRegistryError("Invalid profile config.");
  }

  const mode = typeof value.mode === "string" ? value.mode : DEFAULT_MODE;
  if (!VALID_MODES.has(mode as OrxMode)) {
    throw new ProfileRegistryError("Invalid profile mode.");
  }

  const theme = typeof value.theme === "string" ? value.theme : DEFAULT_THEME;
  if (!VALID_THEMES.has(theme as OrxTheme)) {
    throw new ProfileRegistryError("Invalid profile theme.");
  }

  return {
    model: sanitizeDisplayString(value.model, DEFAULT_MODEL, 256),
    mode: mode as OrxMode,
    fusionPreset: sanitizeOptionalDisplayString(value.fusionPreset, 256),
    theme: theme as OrxTheme,
    permissions: sanitizePermissions(value.permissions),
  };
}

function sanitizePermissions(value: unknown): PermissionConfig {
  if (!isPlainObject(value)) {
    return {
      approvalPolicy: DEFAULT_APPROVAL_POLICY,
      sandboxMode: DEFAULT_SANDBOX_MODE,
    };
  }

  return {
    approvalPolicy: sanitizeDisplayString(
      value.approvalPolicy,
      DEFAULT_APPROVAL_POLICY,
      64,
    ),
    sandboxMode: sanitizeDisplayString(value.sandboxMode, DEFAULT_SANDBOX_MODE, 64),
  };
}

function formatProfileConfigInline(config: SavedProfileSnapshot): string {
  return [
    `mode=${config.mode}`,
    `model=${config.model}`,
    config.fusionPreset ? `fusion=${config.fusionPreset}` : "fusion=none",
    `theme=${config.theme}`,
    `permissions=${config.permissions.approvalPolicy}/${config.permissions.sandboxMode}`,
  ].join(" ");
}

function normalizeProfileId(id: string): string | undefined {
  const normalized = id.trim().toLowerCase();
  if (!SAFE_PROFILE_ID.test(normalized)) {
    return undefined;
  }
  return normalized;
}

function sanitizeStoredTimestamp(value: unknown, fallback: string): string {
  if (!isSafeDisplayString(value, 64)) {
    return fallback;
  }

  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    return fallback;
  }

  return timestamp.toISOString();
}

function sanitizeDisplayString(value: unknown, fallback: string, maximum: number): string {
  return isSafeDisplayString(value, maximum) ? value : fallback;
}

function sanitizeOptionalDisplayString(value: unknown, maximum: number): string | undefined {
  return isSafeDisplayString(value, maximum) ? value : undefined;
}

function isSafeDisplayString(value: unknown, maximum: number): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maximum &&
    !DISPLAY_UNSAFE_PATTERN.test(value) &&
    !SECRET_LIKE_PATTERN.test(value)
  );
}

function tightenProfileRegistryPermissions(path: string): void {
  if (shouldTightenProfileParent(path, true)) {
    chmodSync(dirname(path), PROFILE_DIRECTORY_MODE);
  }
  chmodSync(path, PROFILE_FILE_MODE);
}

function shouldTightenProfileParent(path: string, parentExisted: boolean): boolean {
  return !parentExisted || resolve(path) === resolve(defaultProfileConfigPath());
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
