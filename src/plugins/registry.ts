import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  pluginManifestId,
  readPluginManifestFile,
  sanitizePluginManifest,
  type PluginComponentKey,
  type PluginManifest,
} from "./manifest.js";
import { canonicalJson, sha256 } from "./hash.js";
import {
  createPluginLockRecord,
  type PluginLockRecord,
} from "./lockfile.js";
import { cachePluginManifest } from "./cache.js";

export interface PluginRegistryPathOptions {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  registryPath?: string;
}

export interface PluginRegistryIoOptions {
  registryPath?: string;
  cacheDirectory?: string;
}

export interface InstalledPluginRecord {
  id: string;
  installed: true;
  enabled: boolean;
  manifest: PluginManifest;
  manifestHash: string;
  lock: PluginLockRecord;
  registeredAt: string;
  updatedAt: string;
}

export interface PluginRegistryFile {
  version: 1;
  plugins: Record<string, InstalledPluginRecord>;
}

export interface PluginRegisterResult {
  ok: boolean;
  plugin?: InstalledPluginRecord;
  message: string;
}

export interface PluginStateChange {
  ok: boolean;
  plugin?: InstalledPluginRecord;
  previousEnabled?: boolean;
  nextEnabled?: boolean;
  message: string;
}

export interface PluginStatusSummary {
  installedCount: number;
  enabledCount: number;
  enabledHookCount: 0;
  enabledBinCount: 0;
  enabledMcpCount: 0;
  plugins: InstalledPluginRecord[];
}

const REGISTRY_VERSION = 1;
const PLUGIN_DIRECTORY_MODE = 0o700;
const PLUGIN_FILE_MODE = 0o600;
const COMPONENT_KEYS = new Set<PluginComponentKey>([
  "skills",
  "commands",
  "rules",
  "hooks",
  "mcpServers",
  "bins",
  "assets",
  "docs",
]);
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;
const SECRET_LIKE_PATTERN =
  /\b(?:sk-or-v1-[A-Za-z0-9_-]+|github_pat_[A-Za-z0-9_]+|ghp_[A-Za-z0-9_]+|glpat-[A-Za-z0-9_-]+|xox[baprs]-[A-Za-z0-9-]+)\b/;
const DISPLAY_UNSAFE_PATTERN = /[\x00-\x1F\x7F]/;

export function defaultPluginRegistryPath(): string {
  return join(homedir(), ".orx", "plugins", "registry.json");
}

export function resolvePluginRegistryPath(options: PluginRegistryPathOptions = {}): string {
  const explicitPath = options.registryPath ?? options.env?.ORX_PLUGIN_REGISTRY_PATH;
  if (!explicitPath) {
    return defaultPluginRegistryPath();
  }

  return resolve(options.cwd ?? process.cwd(), explicitPath);
}

export function emptyPluginRegistry(): PluginRegistryFile {
  return {
    version: REGISTRY_VERSION,
    plugins: {},
  };
}

export function loadPluginRegistry(options: PluginRegistryIoOptions = {}): PluginRegistryFile {
  const path = options.registryPath ?? defaultPluginRegistryPath();
  if (!existsSync(path)) {
    return emptyPluginRegistry();
  }

  try {
    tightenPluginRegistryPermissions(path);
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return sanitizePluginRegistry(parsed);
  } catch {
    return emptyPluginRegistry();
  }
}

export function savePluginRegistry(
  registry: PluginRegistryFile,
  options: PluginRegistryIoOptions = {},
): void {
  const path = options.registryPath ?? defaultPluginRegistryPath();
  const sanitized = sanitizePluginRegistry(registry);
  const parentDir = dirname(path);
  const parentExisted = existsSync(parentDir);
  mkdirSync(parentDir, {
    recursive: true,
    mode: PLUGIN_DIRECTORY_MODE,
  });
  if (shouldTightenPluginParent(path, parentExisted)) {
    chmodSync(parentDir, PLUGIN_DIRECTORY_MODE);
  }
  writeFileSync(path, `${JSON.stringify(sanitized, null, 2)}\n`, {
    encoding: "utf8",
    mode: PLUGIN_FILE_MODE,
  });
  chmodSync(path, PLUGIN_FILE_MODE);
}

export function registerPluginManifest(
  manifestPath: string,
  options: PluginRegistryIoOptions & { now?: () => Date } = {},
): PluginRegisterResult {
  const manifest = readPluginManifestFile(manifestPath);
  const id = pluginManifestId(manifest);
  const manifestHash = hashPluginManifest(manifest);
  const now = (options.now?.() ?? new Date()).toISOString();
  const registry = loadPluginRegistry({ registryPath: options.registryPath });
  const cached = cachePluginManifest(manifestPath, manifest, manifestHash, {
    registryPath: options.registryPath,
    cacheDirectory: options.cacheDirectory,
  });
  const lock = createPluginLockRecord(manifest, {
    manifestPath: cached.manifestPath,
    originalManifestPath: cached.originalManifestPath,
    manifestHash,
    now: () => new Date(now),
  });

  const plugin: InstalledPluginRecord = {
    id,
    installed: true,
    enabled: false,
    manifest,
    manifestHash,
    lock,
    registeredAt: now,
    updatedAt: now,
  };
  registry.plugins[id] = plugin;
  savePluginRegistry(registry, { registryPath: options.registryPath });

  return {
    ok: true,
    plugin,
    message: `Plugin ${id} registered disabled. No hooks, bins, MCP servers, or plugin code are active.`,
  };
}

export function setPluginEnabledState(
  id: string,
  enabled: boolean,
  options: PluginRegistryIoOptions & { now?: () => Date } = {},
): PluginStateChange {
  const registry = loadPluginRegistry({ registryPath: options.registryPath });
  const plugin = registry.plugins[id];
  if (!plugin) {
    return {
      ok: false,
      message: `Unknown plugin: ${formatPluginIdForMessage(id)}`,
    };
  }

  const previousEnabled = plugin.enabled;
  const updated: InstalledPluginRecord = {
    ...plugin,
    enabled,
    updatedAt: (options.now?.() ?? new Date()).toISOString(),
  };
  registry.plugins[id] = updated;
  savePluginRegistry(registry, { registryPath: options.registryPath });

  return {
    ok: true,
    plugin: updated,
    previousEnabled,
    nextEnabled: enabled,
    message:
      previousEnabled === enabled
        ? `Plugin ${id} already ${enabled ? "enabled" : "disabled"}. State marker persisted; executable surfaces remain inactive.`
        : `Plugin ${id} ${enabled ? "enabled" : "disabled"}. State marker persisted; executable surfaces remain inactive.`,
  };
}

export function getPluginStatusSummary(
  options: PluginRegistryIoOptions = {},
): PluginStatusSummary {
  const registry = loadPluginRegistry({ registryPath: options.registryPath });
  const plugins = Object.values(registry.plugins).sort((left, right) =>
    left.id.localeCompare(right.id),
  );

  return {
    installedCount: plugins.length,
    enabledCount: plugins.filter((plugin) => plugin.enabled).length,
    enabledHookCount: 0,
    enabledBinCount: 0,
    enabledMcpCount: 0,
    plugins,
  };
}

export function findInstalledPlugin(
  id: string,
  options: PluginRegistryIoOptions = {},
): InstalledPluginRecord | undefined {
  return loadPluginRegistry({ registryPath: options.registryPath }).plugins[id];
}

export function hashPluginManifest(manifest: PluginManifest): string {
  return sha256(canonicalJson(manifest));
}

export function formatPluginIdForMessage(id: string): string {
  const formatted = sanitizeDisplayString(id.trim().toLowerCase(), "", 160);
  return formatted || "[invalid plugin id]";
}

function sanitizePluginRegistry(value: unknown): PluginRegistryFile {
  if (!isPlainObject(value)) {
    return emptyPluginRegistry();
  }

  const plugins: Record<string, InstalledPluginRecord> = {};
  if (isPlainObject(value.plugins)) {
    for (const [fallbackId, rawRecord] of Object.entries(value.plugins)) {
      const record = sanitizeInstalledPluginRecord(fallbackId, rawRecord);
      if (record) {
        plugins[record.id] = record;
      }
    }
  }

  return {
    version: REGISTRY_VERSION,
    plugins,
  };
}

function sanitizeInstalledPluginRecord(
  fallbackId: string,
  value: unknown,
): InstalledPluginRecord | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }

  try {
    const manifest = sanitizePluginManifest(value.manifest);
    const id = typeof value.id === "string" && value.id ? value.id : fallbackId;
    const expectedId = pluginManifestId(manifest);
    if (id !== expectedId) {
      return undefined;
    }

    const manifestHash =
      typeof value.manifestHash === "string" && SHA256_PATTERN.test(value.manifestHash)
        ? value.manifestHash
        : hashPluginManifest(manifest);
    const registeredAt = sanitizeStoredTimestamp(value.registeredAt, new Date(0).toISOString());
    const updatedAt = sanitizeStoredTimestamp(value.updatedAt, registeredAt);

    return {
      id,
      installed: true,
      enabled: value.enabled === true,
      manifest,
      manifestHash,
      lock: sanitizeLockRecord(value.lock, manifest, manifestHash, registeredAt),
      registeredAt,
      updatedAt,
    };
  } catch {
    return undefined;
  }
}

function sanitizeLockRecord(
  value: unknown,
  manifest: PluginManifest,
  manifestHash: string,
  registeredAt: string,
): PluginLockRecord {
  if (!isPlainObject(value)) {
    return {
      source: {
        ...manifest.source,
        manifestPath: "",
      },
      resolvedRef: resolvedRefForManifest(manifest),
      integrity: manifestHash,
      installedAt: registeredAt,
      componentHashes: {},
    };
  }

  const source = isPlainObject(value.source)
    ? {
        ...manifest.source,
        manifestPath: sanitizeDisplayString(value.source.manifestPath, "", 4096),
        originalManifestPath:
          sanitizeDisplayString(value.source.originalManifestPath, "", 4096) || undefined,
      }
    : {
        ...manifest.source,
        manifestPath: "",
      };

  return {
    source,
    resolvedRef: resolvedRefForManifest(manifest),
    integrity:
      typeof value.integrity === "string" && SHA256_PATTERN.test(value.integrity)
        ? value.integrity
        : manifestHash,
    installedAt: sanitizeStoredTimestamp(value.installedAt, registeredAt),
    componentHashes: isPlainObject(value.componentHashes)
      ? sanitizeComponentHashes(value.componentHashes)
      : {},
  };
}

function sanitizeComponentHashes(value: Record<string, unknown>): PluginLockRecord["componentHashes"] {
  const hashes: PluginLockRecord["componentHashes"] = {};
  for (const [key, rawValue] of Object.entries(value)) {
    if (!COMPONENT_KEYS.has(key as PluginComponentKey)) {
      continue;
    }

    if (!isPlainObject(rawValue)) {
      continue;
    }

    const kind = rawValue.kind;
    const path = rawValue.path;
    const hash = rawValue.hash;
    if (
      (kind === "file" || kind === "directory" || kind === "symlink") &&
      isSafeDisplayString(path, 512) &&
      typeof hash === "string" &&
      SHA256_PATTERN.test(hash)
    ) {
      hashes[key as keyof PluginLockRecord["componentHashes"]] = {
        kind,
        path,
        hash,
        truncated: rawValue.truncated === true ? true : undefined,
        omittedEntries:
          typeof rawValue.omittedEntries === "number" &&
          Number.isSafeInteger(rawValue.omittedEntries) &&
          rawValue.omittedEntries >= 0
            ? rawValue.omittedEntries
            : undefined,
        omittedBytes:
          typeof rawValue.omittedBytes === "number" &&
          Number.isSafeInteger(rawValue.omittedBytes) &&
          rawValue.omittedBytes >= 0
            ? rawValue.omittedBytes
            : undefined,
      };
    }
  }

  return hashes;
}

function resolvedRefForManifest(manifest: PluginManifest): string | undefined {
  return manifest.source.type === "git"
    ? manifest.source.resolvedCommit
    : manifest.source.resolvedCommit ?? manifest.source.ref;
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

function isSafeDisplayString(value: unknown, maximum: number): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maximum &&
    !DISPLAY_UNSAFE_PATTERN.test(value) &&
    !SECRET_LIKE_PATTERN.test(value)
  );
}

function tightenPluginRegistryPermissions(path: string): void {
  if (shouldTightenPluginParent(path, true)) {
    chmodSync(dirname(path), PLUGIN_DIRECTORY_MODE);
  }
  chmodSync(path, PLUGIN_FILE_MODE);
}

function shouldTightenPluginParent(path: string, parentExisted: boolean): boolean {
  return !parentExisted || resolve(path) === resolve(defaultPluginRegistryPath());
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
