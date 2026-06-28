import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, posix, relative, resolve, sep } from "node:path";
import { canonicalJson, sha256 } from "./hash.js";
import {
  loadPluginRegistry,
  type InstalledPluginRecord,
  type PluginRegistryIoOptions,
} from "./registry.js";

export type PluginHookEvent =
  | "session_start"
  | "user_prompt_submit"
  | "pre_tool_use"
  | "post_tool_use"
  | "pre_compact"
  | "post_compact"
  | "stop";

export interface PluginHookDefinition {
  id: string;
  pluginId: string;
  hookId: string;
  event: PluginHookEvent;
  command: string;
  cwd?: string;
  env: string[];
  timeoutMs?: number;
  description?: string;
  sourcePath: string;
  relativePath: string;
  manifestHash: string;
  componentHash: string;
  hookHash: string;
}

export interface PluginHookOmission {
  pluginId: string;
  path?: string;
  reason: string;
}

export interface PluginHooksDiscovery {
  hooks: PluginHookDefinition[];
  omissions: PluginHookOmission[];
  truncated: boolean;
}

export interface PluginHookTrustRecord {
  id: string;
  hookHash: string;
  trustedAt: string;
}

export interface PluginHooksTrustConfig {
  version: 1;
  hooks: Record<string, PluginHookTrustRecord>;
}

export interface PluginHookTrustSummary {
  hookCount: number;
  trustedCount: number;
  pendingTrustCount: number;
  untrustedCount: number;
  truncated: boolean;
  omissionCount: number;
}

export interface PluginHookTrustResult {
  ok: boolean;
  hook?: PluginHookDefinition;
  trustedAt?: string;
  previousTrustedHash?: string;
  message: string;
}

export interface PluginHookPathOptions {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  configPath?: string;
}

export interface PluginHookOptions extends PluginRegistryIoOptions {
  configPath?: string;
}

const HOOK_CONFIG_VERSION = 1;
const HOOK_DIRECTORY_MODE = 0o700;
const HOOK_FILE_MODE = 0o600;
const MAX_PLUGIN_HOOKS = 128;
const MAX_HOOK_FILE_BYTES = 256 * 1024;
const MAX_COMMAND_LENGTH = 2048;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_ENV_ENTRIES = 32;
const MAX_TIMEOUT_MS = 120_000;
const HOOK_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,79}$/;
const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
const CONTROL_CHAR_PATTERN = /[\x00-\x1F\x7F]/;
const SECRET_LIKE_PATTERN =
  /\b(?:bearer\s+[A-Za-z0-9._~+/=-]{8,}|authorization:\s*bearer\s+[A-Za-z0-9._~+/=-]{8,}|(?:access[_-]?token|api[_-]?key|token|key|secret)\s*[=:]\s*[A-Za-z0-9._~+/=-]{4,}|sk-or-v1-[A-Za-z0-9_-]+|github_pat_[A-Za-z0-9_]+|ghp_[A-Za-z0-9_]+|glpat-[A-Za-z0-9_-]+|xox[baprs]-[A-Za-z0-9-]+)\b/i;
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;
const HOOK_EVENTS: PluginHookEvent[] = [
  "session_start",
  "user_prompt_submit",
  "pre_tool_use",
  "post_tool_use",
  "pre_compact",
  "post_compact",
  "stop",
];

export function defaultPluginHooksConfigPath(): string {
  return join(homedir(), ".orx", "plugins", "hooks.json");
}

export function resolvePluginHooksConfigPath(options: PluginHookPathOptions = {}): string {
  const explicitPath = options.configPath ?? options.env?.ORX_PLUGIN_HOOKS_CONFIG_PATH;
  if (!explicitPath) {
    return defaultPluginHooksConfigPath();
  }

  return resolve(options.cwd ?? process.cwd(), explicitPath);
}

export function emptyPluginHooksTrustConfig(): PluginHooksTrustConfig {
  return {
    version: HOOK_CONFIG_VERSION,
    hooks: {},
  };
}

export function loadPluginHooksTrustConfig(
  options: { configPath?: string } = {},
): PluginHooksTrustConfig {
  const path = options.configPath ?? defaultPluginHooksConfigPath();
  if (!existsSync(path)) {
    return emptyPluginHooksTrustConfig();
  }

  try {
    tightenHookTrustPermissions(path);
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return sanitizePluginHooksTrustConfig(parsed);
  } catch {
    return emptyPluginHooksTrustConfig();
  }
}

export function savePluginHooksTrustConfig(
  config: PluginHooksTrustConfig,
  options: { configPath?: string } = {},
): void {
  const path = options.configPath ?? defaultPluginHooksConfigPath();
  const sanitized = sanitizePluginHooksTrustConfig(config);
  const parent = dirname(path);
  const parentExisted = existsSync(parent);
  mkdirSync(parent, { recursive: true, mode: HOOK_DIRECTORY_MODE });
  if (!parentExisted || resolve(path) === resolve(defaultPluginHooksConfigPath())) {
    chmodSync(parent, HOOK_DIRECTORY_MODE);
  }
  writeFileSync(path, `${JSON.stringify(sanitized, null, 2)}\n`, {
    encoding: "utf8",
    mode: HOOK_FILE_MODE,
  });
  chmodSync(path, HOOK_FILE_MODE);
}

export function discoverEnabledPluginHooks(
  options: PluginRegistryIoOptions = {},
): PluginHooksDiscovery {
  const registry = loadPluginRegistry({ registryPath: options.registryPath });
  const enabledPlugins = Object.values(registry.plugins)
    .filter((plugin) => plugin.enabled)
    .sort((left, right) => left.id.localeCompare(right.id));
  const hooks: PluginHookDefinition[] = [];
  const omissions: PluginHookOmission[] = [];
  let truncated = false;

  for (const plugin of enabledPlugins) {
    if (hooks.length >= MAX_PLUGIN_HOOKS) {
      truncated = true;
      omissions.push({
        pluginId: plugin.id,
        reason: "maximum enabled plugin hook count reached",
      });
      break;
    }

    const componentPath = plugin.manifest.components.hooks;
    if (!componentPath) {
      continue;
    }

    const discovered = discoverPluginHooks(plugin, componentPath, MAX_PLUGIN_HOOKS - hooks.length);
    hooks.push(...discovered.hooks);
    omissions.push(...discovered.omissions);
    truncated = truncated || discovered.truncated;
  }

  return {
    hooks: hooks.sort((left, right) => left.id.localeCompare(right.id)),
    omissions,
    truncated,
  };
}

export function getPluginHookTrustSummary(
  options: PluginHookOptions = {},
): PluginHookTrustSummary {
  const discovery = discoverEnabledPluginHooks({ registryPath: options.registryPath });
  if (discovery.hooks.length === 0) {
    return {
      hookCount: 0,
      trustedCount: 0,
      pendingTrustCount: 0,
      untrustedCount: 0,
      truncated: discovery.truncated,
      omissionCount: discovery.omissions.length,
    };
  }

  const trust = loadPluginHooksTrustConfig({ configPath: options.configPath });
  let trustedCount = 0;
  let pendingTrustCount = 0;

  for (const hook of discovery.hooks) {
    const record = trust.hooks[hook.id];
    if (record?.hookHash === hook.hookHash) {
      trustedCount += 1;
    } else if (record) {
      pendingTrustCount += 1;
    }
  }

  return {
    hookCount: discovery.hooks.length,
    trustedCount,
    pendingTrustCount,
    untrustedCount: discovery.hooks.length - trustedCount,
    truncated: discovery.truncated,
    omissionCount: discovery.omissions.length,
  };
}

export function renderPluginHooks(
  discovery: PluginHooksDiscovery,
  options: { configPath?: string } = {},
): string {
  const trust = loadPluginHooksTrustConfig({ configPath: options.configPath });
  const lines = [
    "Hooks",
    `  discovered_hooks: ${discovery.hooks.length}${discovery.truncated ? " (truncated)" : ""}`,
    "  execution: inactive",
    "  hooks:",
  ];

  if (discovery.hooks.length === 0) {
    lines.push("    - none");
  } else {
    for (const hook of discovery.hooks) {
      lines.push(`    - ${formatHookSummary(hook, trust.hooks[hook.id])}`);
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

  lines.push("  trust: use /hooks trust <id>; trusted hooks still do not execute in this scaffold");
  return lines.join("\n");
}

export function renderPluginHookInspect(
  hook: PluginHookDefinition,
  options: { configPath?: string } = {},
): string {
  const record = loadPluginHooksTrustConfig({ configPath: options.configPath }).hooks[hook.id];
  return [
    `Hook: ${hook.id}`,
    `  plugin: ${hook.pluginId}`,
    `  hook_id: ${hook.hookId}`,
    `  event: ${hook.event}`,
    `  command: ${hook.command}`,
    `  cwd: ${hook.cwd ?? "plugin-root"}`,
    `  env: ${hook.env.length > 0 ? hook.env.join(",") : "none"}`,
    `  timeout_ms: ${hook.timeoutMs ?? "default"}`,
    `  description: ${hook.description ?? "none"}`,
    `  path: ${hook.sourcePath}`,
    `  relative_path: ${hook.relativePath}`,
    `  manifest_hash: ${hook.manifestHash}`,
    `  component_hash: ${hook.componentHash}`,
    `  hook_hash: ${hook.hookHash}`,
    `  trusted: ${record?.hookHash === hook.hookHash ? "yes" : "no"}`,
    record && record.hookHash !== hook.hookHash ? `  trust_status: pending_hash_change trusted_hash=${record.hookHash}` : undefined,
    record?.trustedAt ? `  trusted_at: ${record.trustedAt}` : undefined,
    "  execution: inactive; hooks are not run by ORX yet",
  ]
    .filter((line): line is string => typeof line === "string")
    .join("\n");
}

export function trustPluginHook(
  id: string,
  options: PluginHookOptions & { now?: () => Date } = {},
): PluginHookTrustResult {
  const hook = findDiscoveredHook(id, { registryPath: options.registryPath });
  if (!hook) {
    return {
      ok: false,
      message: `Unknown enabled plugin hook: ${formatHookIdForMessage(id)}`,
    };
  }

  const trust = loadPluginHooksTrustConfig({ configPath: options.configPath });
  const previousTrustedHash = trust.hooks[hook.id]?.hookHash;
  const trustedAt = (options.now?.() ?? new Date()).toISOString();
  trust.hooks[hook.id] = {
    id: hook.id,
    hookHash: hook.hookHash,
    trustedAt,
  };
  savePluginHooksTrustConfig(trust, { configPath: options.configPath });

  return {
    ok: true,
    hook,
    trustedAt,
    previousTrustedHash,
    message: `Hook ${hook.id} trusted at ${hook.hookHash}. Execution remains inactive.`,
  };
}

export function untrustPluginHook(
  id: string,
  options: PluginHookOptions = {},
): PluginHookTrustResult {
  const formattedId = formatHookIdForMessage(id);
  const trust = loadPluginHooksTrustConfig({ configPath: options.configPath });
  const record = trust.hooks[id];
  if (!record) {
    return {
      ok: false,
      message: `No trusted hook record for ${formattedId}.`,
    };
  }

  delete trust.hooks[id];
  savePluginHooksTrustConfig(trust, { configPath: options.configPath });

  return {
    ok: true,
    message: `Hook ${formattedId} trust removed. Execution remains inactive.`,
  };
}

export function findDiscoveredHook(
  id: string,
  options: PluginRegistryIoOptions = {},
): PluginHookDefinition | undefined {
  return discoverEnabledPluginHooks({ registryPath: options.registryPath }).hooks.find(
    (hook) => hook.id === id,
  );
}

export function formatHookIdForMessage(id: string): string {
  const trimmed = id.trim();
  if (!trimmed || trimmed.length > 240 || CONTROL_CHAR_PATTERN.test(trimmed) || SECRET_LIKE_PATTERN.test(trimmed)) {
    return "[invalid hook id]";
  }
  return trimmed;
}

function discoverPluginHooks(
  plugin: InstalledPluginRecord,
  componentPath: string,
  remainingHookBudget: number,
): PluginHooksDiscovery {
  const baseDirectory = dirname(plugin.lock.source.manifestPath);
  if (!isSafePluginBaseDirectory(plugin.lock.source.manifestPath, baseDirectory)) {
    return {
      hooks: [],
      omissions: [{ pluginId: plugin.id, path: componentPath, reason: "plugin manifest path is unavailable or unsafe" }],
      truncated: false,
    };
  }

  const componentFile = resolve(baseDirectory, componentPath);
  if (!isWithinDirectory(baseDirectory, componentFile)) {
    return {
      hooks: [],
      omissions: [{ pluginId: plugin.id, path: componentPath, reason: "hooks component path escapes plugin directory" }],
      truncated: false,
    };
  }
  if (!existsSync(componentFile)) {
    return {
      hooks: [],
      omissions: [{ pluginId: plugin.id, path: componentPath, reason: "hooks component path does not exist" }],
      truncated: false,
    };
  }

  let stat;
  try {
    stat = lstatSync(componentFile);
  } catch {
    return {
      hooks: [],
      omissions: [{ pluginId: plugin.id, path: componentPath, reason: "hooks component path could not be inspected" }],
      truncated: false,
    };
  }

  if (!stat.isFile()) {
    return {
      hooks: [],
      omissions: [{ pluginId: plugin.id, path: componentPath, reason: "hooks component path is not a file" }],
      truncated: false,
    };
  }
  if (stat.size > MAX_HOOK_FILE_BYTES) {
    return {
      hooks: [],
      omissions: [{ pluginId: plugin.id, path: componentPath, reason: "hooks component file exceeds the byte limit" }],
      truncated: false,
    };
  }

  let raw;
  try {
    raw = readFileSync(componentFile, "utf8");
  } catch {
    return {
      hooks: [],
      omissions: [{ pluginId: plugin.id, path: componentPath, reason: "hooks component file could not be read" }],
      truncated: false,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return {
      hooks: [],
      omissions: [{ pluginId: plugin.id, path: componentPath, reason: "hooks component file is invalid JSON" }],
      truncated: false,
    };
  }

  const entries = getHookEntries(parsed);
  const componentHash = sha256(raw);
  const relativePath = relative(baseDirectory, componentFile).split(/[\\/]/g).join("/");
  const hooks: PluginHookDefinition[] = [];
  const omissions: PluginHookOmission[] = [];
  const seenHookIds = new Set<string>();
  let truncated = false;

  for (const [hookId, rawHook] of entries) {
    if (hooks.length >= remainingHookBudget) {
      truncated = true;
      omissions.push({ pluginId: plugin.id, path: componentPath, reason: "hook discovery reached its entry limit" });
      break;
    }

    try {
      const hook = sanitizeHookDefinition(hookId, rawHook, plugin, componentFile, relativePath, componentHash);
      if (seenHookIds.has(hook.id)) {
        omissions.push({
          pluginId: plugin.id,
          path: componentPath,
          reason: `duplicate hook id: ${hook.id}`,
        });
        continue;
      }
      seenHookIds.add(hook.id);
      hooks.push(hook);
    } catch (error) {
      omissions.push({
        pluginId: plugin.id,
        path: componentPath,
        reason: error instanceof Error ? error.message : "invalid hook declaration",
      });
    }
  }

  return { hooks, omissions, truncated };
}

function sanitizeHookDefinition(
  fallbackHookId: string,
  value: unknown,
  plugin: InstalledPluginRecord,
  sourcePath: string,
  relativePath: string,
  componentHash: string,
): PluginHookDefinition {
  if (!isPlainObject(value)) {
    throw new Error("hook declaration must be an object");
  }

  const hookId = sanitizeHookId(optionalSafeString(value.id, "hook.id", 1, 80) ?? fallbackHookId);
  const event = requiredHookEvent(value.event, "hook.event");
  const command = requiredSafeString(value.command, "hook.command", 1, MAX_COMMAND_LENGTH);
  const cwd = optionalRelativePath(value.cwd, "hook.cwd");
  const env = optionalEnvArray(value.env, "hook.env") ?? [];
  const timeoutMs = optionalTimeout(value.timeoutMs, "hook.timeoutMs");
  const description = optionalSafeString(value.description, "hook.description", 1, MAX_DESCRIPTION_LENGTH);
  const id = `plugin:${plugin.id}:${hookId}`;
  const hashInput = {
    id,
    pluginId: plugin.id,
    hookId,
    event,
    command,
    cwd,
    env,
    timeoutMs,
    description,
    manifestHash: plugin.manifestHash,
    componentHash,
  };

  return {
    id,
    pluginId: plugin.id,
    hookId,
    event,
    command,
    cwd,
    env,
    timeoutMs,
    description,
    sourcePath,
    relativePath,
    manifestHash: plugin.manifestHash,
    componentHash,
    hookHash: sha256(canonicalJson(hashInput)),
  };
}

function getHookEntries(value: unknown): Array<[string, unknown]> {
  if (!isPlainObject(value) || !isPlainObject(value.hooks)) {
    return [];
  }

  return Object.entries(value.hooks).slice(0, MAX_PLUGIN_HOOKS + 1);
}

function sanitizeHookId(value: string): string {
  if (!HOOK_ID_PATTERN.test(value)) {
    throw new Error("hook id must use lowercase letters, numbers, dots, underscores, or dashes");
  }
  return value;
}

function requiredHookEvent(value: unknown, field: string): PluginHookEvent {
  if (typeof value !== "string" || !HOOK_EVENTS.includes(value as PluginHookEvent)) {
    throw new Error(`${field} must be one of ${HOOK_EVENTS.join(", ")}`);
  }
  return value as PluginHookEvent;
}

function optionalTimeout(value: unknown, field: string): number | undefined {
  if (typeof value === "undefined") {
    return undefined;
  }
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    value > MAX_TIMEOUT_MS
  ) {
    throw new Error(`${field} must be an integer between 1 and ${MAX_TIMEOUT_MS}`);
  }
  return value;
}

function optionalEnvArray(value: unknown, field: string): string[] | undefined {
  if (typeof value === "undefined") {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array`);
  }
  if (value.length > MAX_ENV_ENTRIES) {
    throw new Error(`${field} has too many entries`);
  }
  return value.map((entry, index) => {
    const text = requiredSafeString(entry, `${field}[${index}]`, 1, 128);
    if (!ENV_NAME_PATTERN.test(text)) {
      throw new Error(`${field}[${index}] must be an environment variable name`);
    }
    return text;
  });
}

function optionalRelativePath(value: unknown, field: string): string | undefined {
  if (typeof value === "undefined") {
    return undefined;
  }
  const text = requiredSafeString(value, field, 1, 512);
  if (isAbsolute(text) || text.includes("\\") || text.includes("\0")) {
    throw new Error(`${field} must be a relative POSIX-style path`);
  }
  const normalized = posix.normalize(text.split(sep).join(posix.sep)).replace(/^\.\/+/, "");
  if (
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.includes("/../")
  ) {
    throw new Error(`${field} must not traverse outside the plugin directory`);
  }
  return normalized;
}

function requiredSafeString(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): string {
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length < minimum || trimmed.length > maximum) {
    throw new Error(`${field} must be ${minimum}-${maximum} characters`);
  }
  if (CONTROL_CHAR_PATTERN.test(trimmed)) {
    throw new Error(`${field} contains a control character`);
  }
  if (SECRET_LIKE_PATTERN.test(trimmed)) {
    throw new Error(`${field} must not contain secret-like values`);
  }
  return trimmed;
}

function optionalSafeString(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): string | undefined {
  if (typeof value === "undefined") {
    return undefined;
  }
  return requiredSafeString(value, field, minimum, maximum);
}

function sanitizePluginHooksTrustConfig(value: unknown): PluginHooksTrustConfig {
  if (!isPlainObject(value)) {
    return emptyPluginHooksTrustConfig();
  }

  const hooks: Record<string, PluginHookTrustRecord> = {};
  if (isPlainObject(value.hooks)) {
    for (const [fallbackId, rawRecord] of Object.entries(value.hooks)) {
      const record = sanitizeTrustRecord(fallbackId, rawRecord);
      if (record) {
        hooks[record.id] = record;
      }
    }
  }

  return { version: HOOK_CONFIG_VERSION, hooks };
}

function sanitizeTrustRecord(
  fallbackId: string,
  value: unknown,
): PluginHookTrustRecord | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }

  const id = typeof value.id === "string" && value.id ? value.id : fallbackId;
  const hookHash = typeof value.hookHash === "string" && SHA256_PATTERN.test(value.hookHash)
    ? value.hookHash
    : undefined;
  const trustedAt = typeof value.trustedAt === "string" ? new Date(value.trustedAt) : undefined;
  if (
    !id ||
    !hookHash ||
    !trustedAt ||
    Number.isNaN(trustedAt.getTime()) ||
    CONTROL_CHAR_PATTERN.test(id) ||
    SECRET_LIKE_PATTERN.test(id)
  ) {
    return undefined;
  }

  return {
    id,
    hookHash,
    trustedAt: trustedAt.toISOString(),
  };
}

function formatHookSummary(
  hook: PluginHookDefinition,
  record: PluginHookTrustRecord | undefined,
): string {
  const trusted = record?.hookHash === hook.hookHash;
  return [
    `id=${hook.id}`,
    `plugin=${hook.pluginId}`,
    `event=${hook.event}`,
    `trusted=${trusted ? "yes" : "no"}`,
    record && !trusted ? "trust=pending_hash_change" : undefined,
    `hook_hash=${hook.hookHash}`,
    `command=${JSON.stringify(hook.command)}`,
    "execution=inactive",
  ]
    .filter((part): part is string => typeof part === "string")
    .join(" ");
}

function tightenHookTrustPermissions(path: string): void {
  if (resolve(path) === resolve(defaultPluginHooksConfigPath())) {
    chmodSync(dirname(path), HOOK_DIRECTORY_MODE);
  }
  chmodSync(path, HOOK_FILE_MODE);
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
