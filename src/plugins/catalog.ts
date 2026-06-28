import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, posix, resolve, sep } from "node:path";
import { pluginManifestId, readPluginManifestFile } from "./manifest.js";

export interface PluginCatalogPathOptions {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  catalogPath?: string;
}

export interface PluginCatalogLoadOptions {
  catalogPath?: string;
}

export interface PluginCatalogEntry {
  id: string;
  publisher: string;
  name: string;
  version: string;
  description: string;
  manifestPath?: string;
  source?: PluginCatalogGitSource;
  tags: string[];
}

export interface PluginCatalogGitSource {
  type: "git";
  repository: string;
  ref?: string;
  resolvedCommit: string;
  manifestPath: string;
}

export interface PluginCatalog {
  version: 1;
  path: string;
  entries: PluginCatalogEntry[];
}

export interface PluginCatalogEditResult {
  ok: boolean;
  action: "added" | "updated" | "removed" | "missing";
  catalogPath: string;
  entry?: PluginCatalogEntry;
  message: string;
}

export interface PluginCatalogAddLocalArgs {
  manifestPath: string;
  description?: string;
  tags?: string[];
}

export interface PluginInstallTarget {
  kind: "manifest" | "git";
  manifestPath: string;
  gitSource?: PluginCatalogGitSource;
  catalogEntry?: PluginCatalogEntry;
}

const CATALOG_VERSION = 1;
const CATALOG_DIRECTORY_MODE = 0o700;
const CATALOG_FILE_MODE = 0o600;
const CATALOG_ID_PATTERN =
  /^([a-z0-9][a-z0-9._-]{0,79})\.([a-z0-9][a-z0-9._-]{0,79})@([0-9A-Za-z][0-9A-Za-z.+-]{0,63})$/;
const TAG_PATTERN = /^[a-z0-9][a-z0-9._-]{0,39}$/;
const RESOLVED_COMMIT_PATTERN = /^(?:[a-fA-F0-9]{40}|[a-fA-F0-9]{64})$/;
const SCP_LIKE_GIT_PATTERN =
  /^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+:[A-Za-z0-9._~/-]+(?:\.git)?$/;
const CONTROL_CHAR_PATTERN = /[\x00-\x1F\x7F]/;
const SECRET_LIKE_PATTERN =
  /\b(?:bearer\s+[A-Za-z0-9._~+/=-]{8,}|authorization:\s*bearer|access[_-]?token|api[_-]?key|token=|key=|secret=|sk-or-v1-[A-Za-z0-9_-]+|github_pat_[A-Za-z0-9_]+|ghp_[A-Za-z0-9_]+|glpat-[A-Za-z0-9_-]+|xox[baprs]-[A-Za-z0-9-]+)\b/i;

export function defaultPluginCatalogPath(): string {
  return join(homedir(), ".orx", "plugins", "catalog.json");
}

export function resolvePluginCatalogPath(options: PluginCatalogPathOptions = {}): string {
  const explicitPath = options.catalogPath ?? options.env?.ORX_PLUGIN_CATALOG_PATH;
  if (!explicitPath) {
    return defaultPluginCatalogPath();
  }

  return resolve(options.cwd ?? process.cwd(), explicitPath);
}

export function loadPluginCatalog(options: PluginCatalogLoadOptions = {}): PluginCatalog {
  const path = options.catalogPath ?? defaultPluginCatalogPath();
  if (!existsSync(path)) {
    return emptyPluginCatalog(path);
  }

  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return sanitizePluginCatalog(parsed, path);
  } catch {
    return emptyPluginCatalog(path);
  }
}

export function savePluginCatalog(
  catalog: PluginCatalog,
  options: PluginCatalogLoadOptions = {},
): void {
  const path = options.catalogPath ?? catalog.path ?? defaultPluginCatalogPath();
  const sanitized = sanitizePluginCatalog(
    {
      version: CATALOG_VERSION,
      entries: catalog.entries,
    },
    path,
  );
  const parent = dirname(path);
  const parentExisted = existsSync(parent);
  mkdirSync(parent, { recursive: true, mode: CATALOG_DIRECTORY_MODE });
  if (!parentExisted || resolve(path) === resolve(defaultPluginCatalogPath())) {
    chmodSync(parent, CATALOG_DIRECTORY_MODE);
  }
  writeFileSync(path, `${JSON.stringify({ version: CATALOG_VERSION, entries: sanitized.entries }, null, 2)}\n`, {
    encoding: "utf8",
    mode: CATALOG_FILE_MODE,
  });
  chmodSync(path, CATALOG_FILE_MODE);
}

export function parsePluginCatalogAddLocalArgs(args: string[]): PluginCatalogAddLocalArgs {
  let manifestPath: string | undefined;
  let description: string | undefined;
  const tags: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? "";
    if (!arg.startsWith("--")) {
      if (manifestPath) {
        throw new Error("Usage: plugins catalog add-local <manifest-path-or-directory> [--description <text>] [--tag <tag>] [--tags <a,b>]");
      }
      manifestPath = arg;
      continue;
    }

    const [rawFlag, inlineValue] = arg.split("=", 2);
    const flag = rawFlag.toLowerCase();
    const value = inlineValue ?? args[index + 1];
    if (typeof value === "undefined" || value.startsWith("--")) {
      throw new Error(`Missing value for ${rawFlag}.`);
    }
    if (typeof inlineValue === "undefined") {
      index += 1;
    }

    if (flag === "--description") {
      description = value;
    } else if (flag === "--tag") {
      tags.push(value);
    } else if (flag === "--tags") {
      tags.push(...value.split(",").map((tag) => tag.trim()).filter(Boolean));
    } else {
      throw new Error(`Unknown catalog add option: ${rawFlag}`);
    }
  }

  if (!manifestPath) {
    throw new Error("Usage: plugins catalog add-local <manifest-path-or-directory> [--description <text>] [--tag <tag>] [--tags <a,b>]");
  }

  return {
    manifestPath,
    description,
    tags: tags.length > 0 ? tags : undefined,
  };
}

export function upsertLocalPluginCatalogEntry(
  args: PluginCatalogAddLocalArgs,
  options: PluginCatalogLoadOptions & { cwd?: string } = {},
): PluginCatalogEditResult {
  const catalogPath = options.catalogPath ?? defaultPluginCatalogPath();
  const manifestPath = resolveManifestInput(args.manifestPath, options.cwd);
  const manifest = readPluginManifestFile(manifestPath);
  const id = pluginManifestId(manifest);
  const description = sanitizeCatalogDescriptionForWrite(args.description ?? manifest.description);
  const tags = typeof args.tags === "undefined" ? undefined : sanitizeTagsForWrite(args.tags);
  const catalog = loadPluginCatalog({ catalogPath });
  const existingIndex = catalog.entries.findIndex((entry) => entry.id === id);
  const existing = existingIndex >= 0 ? catalog.entries[existingIndex] : undefined;
  const entry: PluginCatalogEntry = {
    id,
    publisher: manifest.publisher,
    name: manifest.name,
    version: manifest.version,
    description,
    manifestPath,
    tags: tags ?? existing?.tags ?? [],
  };

  if (existingIndex >= 0) {
    catalog.entries[existingIndex] = entry;
  } else {
    catalog.entries.push(entry);
  }
  savePluginCatalog(catalog, { catalogPath });

  const action = existingIndex >= 0 ? "updated" : "added";
  return {
    ok: true,
    action,
    catalogPath,
    entry,
    message: `Catalog entry ${entry.id} ${action}. Source manifest: ${entry.manifestPath}`,
  };
}

export function removePluginCatalogEntry(
  id: string,
  options: PluginCatalogLoadOptions = {},
): PluginCatalogEditResult {
  const catalogPath = options.catalogPath ?? defaultPluginCatalogPath();
  const catalog = loadPluginCatalog({ catalogPath });
  const normalizedId = sanitizeCatalogId(id);
  const nextEntries = catalog.entries.filter((entry) => entry.id !== normalizedId);
  if (!normalizedId || nextEntries.length === catalog.entries.length) {
    return {
      ok: false,
      action: "missing",
      catalogPath,
      message: `Unknown catalog entry: ${formatCatalogIdForMessage(id)}`,
    };
  }

  const removed = catalog.entries.find((entry) => entry.id === normalizedId);
  savePluginCatalog({ ...catalog, entries: nextEntries }, { catalogPath });
  return {
    ok: true,
    action: "removed",
    catalogPath,
    entry: removed,
    message: `Catalog entry ${normalizedId} removed.`,
  };
}

export function findPluginCatalogEntry(
  selector: string,
  options: PluginCatalogLoadOptions = {},
): PluginCatalogEntry | undefined {
  const normalized = selector.trim();
  if (!normalized) {
    return undefined;
  }

  const catalog = loadPluginCatalog(options);
  return catalog.entries.find((entry) => entry.id === normalized);
}

export function resolvePluginInstallTarget(
  input: string,
  options: PluginCatalogLoadOptions & { cwd?: string } = {},
): PluginInstallTarget {
  const trimmed = input.trim();
  const pathCandidate = resolve(options.cwd ?? process.cwd(), trimmed);
  if (existsSync(pathCandidate) || isPathLike(trimmed)) {
    return {
      kind: "manifest",
      manifestPath: pathCandidate,
    };
  }

  const catalog = loadPluginCatalog({ catalogPath: options.catalogPath });
  const entry = catalog.entries.find((candidate) => candidate.id === trimmed);
  if (!entry) {
    return {
      kind: "manifest",
      manifestPath: pathCandidate,
    };
  }

  if (entry.source) {
    return {
      kind: "git",
      manifestPath: entry.source.manifestPath,
      gitSource: entry.source,
      catalogEntry: entry,
    };
  }

  return {
    kind: "manifest",
    manifestPath: resolveCatalogManifestPath(entry, catalog.path),
    catalogEntry: entry,
  };
}

export function renderPluginCatalog(catalog: PluginCatalog): string {
  const lines = [
    "Plugin Catalog",
    `  path: ${catalog.path}`,
    `  entries: ${catalog.entries.length}`,
  ];

  if (catalog.entries.length === 0) {
    lines.push("  plugins: none");
    return lines.join("\n");
  }

  lines.push("  plugins:");
  for (const entry of catalog.entries) {
    lines.push(
      [
        `    - id=${entry.id}`,
        `publisher=${entry.publisher}`,
        `name=${entry.name}`,
        `version=${entry.version}`,
        `description=${entry.description || "none"}`,
        entry.source
          ? `source=git repository=${entry.source.repository} commit=${entry.source.resolvedCommit.slice(0, 12)} manifest=${entry.source.manifestPath}`
          : `manifest=${entry.manifestPath ?? "none"}`,
        `tags=${entry.tags.length > 0 ? entry.tags.join(",") : "none"}`,
      ].join(" "),
    );
  }

  return lines.join("\n");
}

function emptyPluginCatalog(path: string): PluginCatalog {
  return {
    version: CATALOG_VERSION,
    path,
    entries: [],
  };
}

function sanitizePluginCatalog(value: unknown, path: string): PluginCatalog {
  if (!isPlainObject(value)) {
    return emptyPluginCatalog(path);
  }

  const entries: PluginCatalogEntry[] = [];
  const seen = new Set<string>();
  const rawEntries = Array.isArray(value.entries) ? value.entries : [];
  for (const rawEntry of rawEntries.slice(0, 256)) {
    const entry = sanitizePluginCatalogEntry(rawEntry);
    if (!entry || seen.has(entry.id)) {
      continue;
    }

    seen.add(entry.id);
    entries.push(entry);
  }

  return {
    version: CATALOG_VERSION,
    path,
    entries: entries.sort((left, right) => left.id.localeCompare(right.id)),
  };
}

function sanitizePluginCatalogEntry(value: unknown): PluginCatalogEntry | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }

  const id = sanitizeCatalogId(value.id);
  const match = CATALOG_ID_PATTERN.exec(id);
  if (!match) {
    return undefined;
  }

  const hasSource = typeof value.source !== "undefined";
  const source = sanitizeCatalogGitSource(value.source);
  if (hasSource && !source) {
    return undefined;
  }
  const manifestPath = hasSource ? undefined : sanitizeManifestPathString(value.manifestPath);
  if (!source && !manifestPath) {
    return undefined;
  }

  const description =
    typeof value.description === "undefined"
      ? ""
      : sanitizeCatalogString(value.description, 240);
  if (typeof value.description !== "undefined" && typeof description === "undefined") {
    return undefined;
  }

  return {
    id,
    publisher: match[1],
    name: match[2],
    version: match[3],
    description: description ?? "",
    source,
    manifestPath,
    tags: sanitizeTags(value.tags),
  };
}

function sanitizeCatalogId(value: unknown): string {
  const id = sanitizeCatalogString(value, 240);
  return id ?? "";
}

function sanitizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const tags: string[] = [];
  for (const rawTag of value.slice(0, 16)) {
    const tag = sanitizeCatalogString(rawTag, 40);
    if (tag && TAG_PATTERN.test(tag) && !tags.includes(tag)) {
      tags.push(tag);
    }
  }

  return tags.sort();
}

function sanitizeCatalogString(value: unknown, maximum: number): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (
    trimmed.length === 0 ||
    trimmed.length > maximum ||
    CONTROL_CHAR_PATTERN.test(trimmed) ||
    SECRET_LIKE_PATTERN.test(trimmed)
  ) {
    return undefined;
  }

  return trimmed;
}

function sanitizeManifestPathString(value: unknown): string | undefined {
  const manifestPath = sanitizeCatalogString(value, 2048);
  if (!manifestPath || manifestPath.includes("?") || manifestPath.includes("#")) {
    return undefined;
  }

  return manifestPath;
}

function resolveManifestInput(input: string, cwd = process.cwd()): string {
  const trimmed = sanitizeCatalogString(input, 2048);
  if (!trimmed) {
    throw new Error("Manifest path must be a safe non-empty string.");
  }
  const candidate = resolve(cwd, trimmed);
  if (existsSync(candidate)) {
    try {
      if (lstatSync(candidate).isDirectory()) {
        return join(candidate, "orx-plugin.json");
      }
    } catch {
      return candidate;
    }
  }
  return candidate;
}

function sanitizeCatalogDescriptionForWrite(value: string): string {
  const description = sanitizeCatalogString(value, 240);
  if (typeof description === "undefined") {
    throw new Error("Catalog description must be a safe 1-240 character string.");
  }
  return description;
}

function sanitizeTagsForWrite(values: string[]): string[] {
  const requested = values.map((tag) => tag.trim()).filter(Boolean);
  const invalid = requested.some((tag) => {
    const sanitized = sanitizeCatalogString(tag, 40);
    return !sanitized || !TAG_PATTERN.test(sanitized);
  });
  if (invalid) {
    throw new Error("Catalog tags must use lowercase letters, numbers, dots, underscores, or dashes.");
  }
  return sanitizeTags(requested);
}

function formatCatalogIdForMessage(id: string): string {
  const safeId = sanitizeCatalogId(id);
  return safeId && CATALOG_ID_PATTERN.test(safeId) ? safeId : "[invalid catalog id]";
}

function resolveCatalogManifestPath(entry: PluginCatalogEntry, catalogPath: string): string {
  if (!entry.manifestPath) {
    return resolve(dirname(catalogPath), "orx-plugin.json");
  }
  return isAbsolute(entry.manifestPath)
    ? resolve(entry.manifestPath)
    : resolve(dirname(catalogPath), entry.manifestPath);
}

function sanitizeCatalogGitSource(value: unknown): PluginCatalogGitSource | undefined {
  if (typeof value === "undefined") {
    return undefined;
  }
  if (!isPlainObject(value) || value.type !== "git") {
    return undefined;
  }

  const repository = sanitizeCatalogString(value.repository, 2048);
  if (!repository || !isSafeCatalogGitRepository(repository)) {
    return undefined;
  }

  const resolvedCommit = sanitizeCatalogString(value.resolvedCommit, 128);
  if (!resolvedCommit || !RESOLVED_COMMIT_PATTERN.test(resolvedCommit)) {
    return undefined;
  }

  const ref =
    typeof value.ref === "undefined" ? undefined : sanitizeCatalogString(value.ref, 256);
  if (typeof value.ref !== "undefined" && !ref) {
    return undefined;
  }

  const manifestPath =
    typeof value.manifestPath === "undefined"
      ? "orx-plugin.json"
      : sanitizeCatalogGitManifestPath(value.manifestPath);
  if (!manifestPath) {
    return undefined;
  }

  return {
    type: "git",
    repository,
    ref,
    resolvedCommit,
    manifestPath,
  };
}

function sanitizeCatalogGitManifestPath(value: unknown): string | undefined {
  const manifestPath = sanitizeManifestPathString(value);
  if (
    !manifestPath ||
    isAbsolute(manifestPath) ||
    manifestPath.includes("\\") ||
    manifestPath.includes("\0")
  ) {
    return undefined;
  }

  const normalized = posix.normalize(manifestPath.split(sep).join(posix.sep)).replace(/^\.\/+/, "");
  if (
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.includes("/../")
  ) {
    return undefined;
  }
  return normalized;
}

function isSafeCatalogGitRepository(value: string): boolean {
  const normalized = value.toLowerCase();
  if (value.startsWith("-") || normalized.startsWith("ext::")) {
    return false;
  }
  if (SCP_LIKE_GIT_PATTERN.test(value)) {
    return true;
  }

  try {
    const url = new URL(value);
    if (!["https:", "ssh:", "file:"].includes(url.protocol)) {
      return false;
    }
    if (url.password || url.search || url.hash) {
      return false;
    }
    if (url.protocol === "ssh:" && !url.username) {
      return false;
    }
    if (url.protocol !== "ssh:" && url.username) {
      return false;
    }
    return Boolean(url.hostname || url.protocol === "file:");
  } catch {
    return false;
  }
}

function isPathLike(value: string): boolean {
  return (
    value.includes("/") ||
    value.includes("\\") ||
    value.startsWith(".") ||
    value.endsWith(".json")
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
