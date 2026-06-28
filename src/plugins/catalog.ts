import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";

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
  manifestPath: string;
  tags: string[];
}

export interface PluginCatalog {
  version: 1;
  path: string;
  entries: PluginCatalogEntry[];
}

export interface PluginInstallTarget {
  manifestPath: string;
  catalogEntry?: PluginCatalogEntry;
}

const CATALOG_VERSION = 1;
const CATALOG_ID_PATTERN =
  /^([a-z0-9][a-z0-9._-]{0,79})\.([a-z0-9][a-z0-9._-]{0,79})@([0-9A-Za-z][0-9A-Za-z.+-]{0,63})$/;
const TAG_PATTERN = /^[a-z0-9][a-z0-9._-]{0,39}$/;
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
    return { manifestPath: pathCandidate };
  }

  const catalog = loadPluginCatalog({ catalogPath: options.catalogPath });
  const entry = catalog.entries.find((candidate) => candidate.id === trimmed);
  if (!entry) {
    return { manifestPath: pathCandidate };
  }

  return {
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
        `manifest=${entry.manifestPath}`,
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

  const manifestPath = sanitizeManifestPathString(value.manifestPath);
  if (!manifestPath) {
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

function resolveCatalogManifestPath(entry: PluginCatalogEntry, catalogPath: string): string {
  return isAbsolute(entry.manifestPath)
    ? resolve(entry.manifestPath)
    : resolve(dirname(catalogPath), entry.manifestPath);
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
