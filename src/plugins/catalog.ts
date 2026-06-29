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
import {
  defaultPluginRegistryPath,
  loadPluginRegistryReadOnly,
  type InstalledPluginRecord,
} from "./registry.js";

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

export interface PluginCatalogAddGitArgs {
  id: string;
  repository: string;
  resolvedCommit: string;
  ref?: string;
  manifestPath?: string;
  description?: string;
  tags?: string[];
}

export interface PluginInstallTarget {
  kind: "manifest" | "git";
  manifestPath: string;
  gitSource?: PluginCatalogGitSource;
  catalogEntry?: PluginCatalogEntry;
}

export type PluginCatalogUpdateStatus =
  | "current"
  | "update_available"
  | "not_installed"
  | "not_git_catalog"
  | "source_mismatch";

export interface PluginCatalogUpdateCheckEntry {
  id: string;
  status: PluginCatalogUpdateStatus;
  catalogCommit?: string;
  installedCommit?: string;
  repository?: string;
  installedRepository?: string;
  enabled?: boolean;
  message: string;
}

export interface PluginCatalogUpdateReport {
  catalogPath: string;
  registryPath: string;
  entriesChecked: number;
  updateAvailableCount: number;
  currentCount: number;
  notInstalledCount: number;
  skippedCount: number;
  entries: PluginCatalogUpdateCheckEntry[];
}

const CATALOG_VERSION = 1;
const CATALOG_DIRECTORY_MODE = 0o700;
const CATALOG_FILE_MODE = 0o600;
const ADD_LOCAL_USAGE =
  "Usage: plugins catalog add-local <manifest-path-or-directory> [--description <text>] [--tag <tag>] [--tags <a,b>]";
const ADD_GIT_USAGE =
  "Usage: plugins catalog add-git <id> <repository> <resolved-commit> [--ref <ref>] [--manifest-path <path>] [--description <text>] [--tag <tag>] [--tags <a,b>]";
const CATALOG_ID_PATTERN =
  /^([a-z0-9][a-z0-9._-]{0,79})\.([a-z0-9][a-z0-9._-]{0,79})@([0-9A-Za-z][0-9A-Za-z.+-]{0,63})$/;
const TAG_PATTERN = /^[a-z0-9][a-z0-9._-]{0,39}$/;
const RESOLVED_COMMIT_PATTERN = /^(?:[a-fA-F0-9]{40}|[a-fA-F0-9]{64})$/;
const SCP_LIKE_GIT_PATTERN =
  /^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+:[A-Za-z0-9._~/-]+(?:\.git)?$/;
const CONTROL_CHAR_PATTERN = /[\x00-\x1F\x7F]/;
const OUTPUT_CONTROL_CHAR_PATTERN = /[\x00-\x1F\x7F]/g;
const ANSI_ESCAPE_PATTERN = /\x1B\[[0-?]*[ -/]*[@-~]/g;
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
        throw new Error(ADD_LOCAL_USAGE);
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
    throw new Error(ADD_LOCAL_USAGE);
  }

  return {
    manifestPath,
    description,
    tags: tags.length > 0 ? tags : undefined,
  };
}

export function parsePluginCatalogAddGitArgs(args: string[]): PluginCatalogAddGitArgs {
  const positionals: string[] = [];
  let resolvedCommit: string | undefined;
  let ref: string | undefined;
  let manifestPath: string | undefined;
  let description: string | undefined;
  const tags: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? "";
    if (!arg.startsWith("--")) {
      positionals.push(arg);
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

    if (flag === "--commit" || flag === "--resolved-commit") {
      resolvedCommit = value;
    } else if (flag === "--ref") {
      ref = value;
    } else if (flag === "--manifest-path" || flag === "--manifest") {
      manifestPath = value;
    } else if (flag === "--description") {
      description = value;
    } else if (flag === "--tag") {
      tags.push(value);
    } else if (flag === "--tags") {
      tags.push(...value.split(",").map((tag) => tag.trim()).filter(Boolean));
    } else {
      throw new Error(`Unknown catalog add-git option: ${rawFlag}`);
    }
  }

  if (positionals.length > 3) {
    throw new Error(ADD_GIT_USAGE);
  }
  const [id, repository, positionalCommit] = positionals;
  if (resolvedCommit && positionalCommit) {
    throw new Error("Catalog git commit must be provided only once.");
  }
  resolvedCommit = resolvedCommit ?? positionalCommit;

  if (!id || !repository || !resolvedCommit) {
    throw new Error(ADD_GIT_USAGE);
  }

  return {
    id,
    repository,
    resolvedCommit,
    ref,
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

export function upsertGitPluginCatalogEntry(
  args: PluginCatalogAddGitArgs,
  options: PluginCatalogLoadOptions = {},
): PluginCatalogEditResult {
  const catalogPath = options.catalogPath ?? defaultPluginCatalogPath();
  const id = sanitizeCatalogId(args.id);
  const match = CATALOG_ID_PATTERN.exec(id);
  if (!match) {
    throw new Error("Catalog git id must use publisher.name@version.");
  }
  const description = sanitizeCatalogDescriptionForWrite(
    args.description ?? `Pinned git plugin ${id}.`,
  );
  const source: PluginCatalogGitSource = {
    type: "git",
    repository: sanitizeCatalogGitRepositoryForWrite(args.repository),
    ref: sanitizeCatalogGitRefForWrite(args.ref),
    resolvedCommit: sanitizeCatalogGitCommitForWrite(args.resolvedCommit),
    manifestPath: sanitizeCatalogGitManifestPathForWrite(args.manifestPath ?? "orx-plugin.json"),
  };
  const tags = typeof args.tags === "undefined" ? undefined : sanitizeTagsForWrite(args.tags);
  const catalog = loadPluginCatalog({ catalogPath });
  const existingIndex = catalog.entries.findIndex((entry) => entry.id === id);
  const existing = existingIndex >= 0 ? catalog.entries[existingIndex] : undefined;
  const entry: PluginCatalogEntry = {
    id,
    publisher: match[1],
    name: match[2],
    version: match[3],
    description,
    source,
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
    message: `Catalog git entry ${entry.id} ${action}. Source repository: ${source.repository} commit: ${source.resolvedCommit}`,
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
    let manifestPath = pathCandidate;
    if (existsSync(pathCandidate)) {
      try {
        if (lstatSync(pathCandidate).isDirectory()) {
          manifestPath = join(pathCandidate, "orx-plugin.json");
        }
      } catch {
        manifestPath = pathCandidate;
      }
    }
    return {
      kind: "manifest",
      manifestPath,
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
    `  path: ${formatCatalogDisplayPath(catalog.path)}`,
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

export function renderPluginCatalogInspect(
  entry: PluginCatalogEntry,
  options: { catalogPath?: string } = {},
): string {
  const catalogPath = options.catalogPath ?? defaultPluginCatalogPath();
  const resolvedLocalManifestPath = entry.source
    ? undefined
    : resolveCatalogManifestPath(entry, catalogPath);
  const lines = [
    `Plugin Catalog Entry: ${entry.id}`,
    `  catalog_path: ${formatCatalogDisplayPath(catalogPath)}`,
    `  publisher: ${entry.publisher}`,
    `  name: ${entry.name}`,
    `  version: ${entry.version}`,
    `  description: ${entry.description || "none"}`,
    `  tags: ${entry.tags.length > 0 ? entry.tags.join(",") : "none"}`,
    `  source_type: ${entry.source ? "git" : "local"}`,
  ];

  if (entry.source) {
    lines.push(
      "  git_source:",
      `    repository: ${entry.source.repository}`,
      `    ref: ${entry.source.ref ?? "none"}`,
      `    resolved_commit: ${entry.source.resolvedCommit}`,
      `    manifest_path: ${entry.source.manifestPath}`,
      "    install_resolution: clone_to_private_temp_checkout_and_register_disabled",
    );
  } else {
    lines.push(
      "  local_source:",
      `    manifest_path: ${entry.manifestPath ? formatCatalogDisplayPath(entry.manifestPath) : "none"}`,
      `    resolved_manifest_path: ${formatCatalogDisplayPath(resolvedLocalManifestPath ?? "")}`,
      "    install_resolution: read_local_manifest_and_register_disabled",
    );
  }

  lines.push(
    "  install:",
    `    command: orx plugins install ${entry.id}`,
    "    result_state: registered_disabled",
    "  authority:",
    "    catalog_entry: declaration_only",
    "    inspect_side_effects: none",
    "    install_enable_trust_grant_fetch_execute: separate_explicit_steps",
  );

  return lines.join("\n");
}

export function checkPluginCatalogUpdates(
  options: PluginCatalogLoadOptions & { registryPath?: string; ids?: string[] } = {},
): PluginCatalogUpdateReport {
  const catalogPath = options.catalogPath ?? defaultPluginCatalogPath();
  const registryPath = options.registryPath ?? defaultPluginRegistryPath();
  const catalog = loadPluginCatalog({ catalogPath });
  const registry = loadPluginRegistryReadOnly({ registryPath });
  const requestedIds = normalizeRequestedCatalogIds(options.ids);
  const entries = requestedIds.length > 0
    ? requestedIds
        .map((id) => catalog.entries.find((entry) => entry.id === id))
        .filter((entry): entry is PluginCatalogEntry => Boolean(entry))
    : catalog.entries;

  const checked = entries.map((entry) =>
    checkPluginCatalogEntryUpdate(entry, registry.plugins[entry.id]),
  );

  return {
    catalogPath,
    registryPath,
    entriesChecked: checked.length,
    updateAvailableCount: checked.filter((entry) => entry.status === "update_available").length,
    currentCount: checked.filter((entry) => entry.status === "current").length,
    notInstalledCount: checked.filter((entry) => entry.status === "not_installed").length,
    skippedCount: checked.filter(
      (entry) => entry.status === "not_git_catalog" || entry.status === "source_mismatch",
    ).length,
    entries: checked,
  };
}

export function renderPluginCatalogUpdateReport(report: PluginCatalogUpdateReport): string {
  const lines = [
    "Plugin Catalog Update Check",
    `  catalog_path: ${formatCatalogDisplayPath(report.catalogPath)}`,
    `  registry_path: ${formatCatalogDisplayPath(report.registryPath)}`,
    `  entries_checked: ${report.entriesChecked}`,
    `  updates_available: ${report.updateAvailableCount}`,
    `  current: ${report.currentCount}`,
    `  not_installed: ${report.notInstalledCount}`,
    `  skipped: ${report.skippedCount}`,
    "  network: none",
    "  side_effects: none",
  ];

  if (report.entries.length === 0) {
    lines.push("  plugins: none");
  } else {
    lines.push("  plugins:");
    for (const entry of report.entries) {
      lines.push(
        [
          `    - id=${entry.id}`,
          `status=${entry.status}`,
          entry.catalogCommit ? `catalog_commit=${entry.catalogCommit.slice(0, 12)}` : undefined,
          entry.installedCommit
            ? `installed_commit=${entry.installedCommit.slice(0, 12)}`
            : undefined,
          typeof entry.enabled === "boolean" ? `enabled=${entry.enabled ? "yes" : "no"}` : undefined,
          entry.repository ? `repository=${entry.repository}` : undefined,
          entry.installedRepository ? `installed_repository=${entry.installedRepository}` : undefined,
          `message="${formatCatalogDisplayInline(entry.message)}"`,
        ]
          .filter((part): part is string => typeof part === "string")
          .join(" "),
      );
      if (entry.status === "update_available") {
        lines.push(`      command: orx plugins catalog update ${entry.id}`);
      }
    }
  }

  lines.push(
    "  authority:",
    "    update_check: catalog_and_registry_compare_only",
    "    fetch_install_enable_trust_grant_execute: separate_explicit_steps",
  );

  return lines.join("\n");
}

export function formatPluginCatalogIdForMessage(id: string): string {
  return formatCatalogIdForMessage(id);
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

function sanitizeCatalogGitRepositoryForWrite(value: string): string {
  const repository = sanitizeCatalogString(value, 2048);
  if (!repository || !isSafeCatalogGitRepository(repository)) {
    throw new Error("Catalog git repository must be a safe https, ssh, file, or scp-like URL.");
  }
  return repository;
}

function sanitizeCatalogGitRefForWrite(value: string | undefined): string | undefined {
  if (typeof value === "undefined") {
    return undefined;
  }
  const ref = sanitizeCatalogString(value, 256);
  if (!ref) {
    throw new Error("Catalog git ref must be a safe 1-256 character string.");
  }
  return ref;
}

function sanitizeCatalogGitCommitForWrite(value: string): string {
  const resolvedCommit = sanitizeCatalogString(value, 128);
  if (!resolvedCommit || !RESOLVED_COMMIT_PATTERN.test(resolvedCommit)) {
    throw new Error("Catalog git commit must be a full 40 or 64 character hex commit.");
  }
  return resolvedCommit;
}

function sanitizeCatalogGitManifestPathForWrite(value: string): string {
  const manifestPath = sanitizeCatalogGitManifestPath(value);
  if (!manifestPath) {
    throw new Error("Catalog git manifest path must be a safe relative path.");
  }
  return manifestPath;
}

function formatCatalogIdForMessage(id: string): string {
  const safeId = sanitizeCatalogId(id);
  return safeId && CATALOG_ID_PATTERN.test(safeId) ? safeId : "[invalid catalog id]";
}

function formatCatalogDisplayPath(value: string): string {
  const withoutControls = value
    .replace(ANSI_ESCAPE_PATTERN, "")
    .replace(OUTPUT_CONTROL_CHAR_PATTERN, "")
    .trim();
  if (!withoutControls) {
    return "[invalid path]";
  }
  if (SECRET_LIKE_PATTERN.test(withoutControls)) {
    return "[redacted path]";
  }
  return withoutControls;
}

function formatCatalogDisplayInline(value: string): string {
  return formatCatalogDisplayPath(value).replace(/"/g, "'");
}

function normalizeRequestedCatalogIds(values: string[] | undefined): string[] {
  if (!values) {
    return [];
  }
  const ids: string[] = [];
  for (const value of values) {
    const id = sanitizeCatalogId(value);
    if (id && CATALOG_ID_PATTERN.test(id) && !ids.includes(id)) {
      ids.push(id);
    }
  }
  return ids;
}

function checkPluginCatalogEntryUpdate(
  entry: PluginCatalogEntry,
  plugin: InstalledPluginRecord | undefined,
): PluginCatalogUpdateCheckEntry {
  if (!entry.source) {
    return {
      id: entry.id,
      status: "not_git_catalog",
      message: "local catalog entry has no pinned git update state",
    };
  }

  if (!plugin) {
    return {
      id: entry.id,
      status: "not_installed",
      catalogCommit: entry.source.resolvedCommit,
      repository: entry.source.repository,
      message: "catalog entry is not installed",
    };
  }

  const installedSource = plugin.manifest.source;
  if (
    installedSource.type !== "git" ||
    installedSource.repository !== entry.source.repository ||
    !installedSource.resolvedCommit
  ) {
    return {
      id: entry.id,
      status: "source_mismatch",
      catalogCommit: entry.source.resolvedCommit,
      installedCommit: installedSource.resolvedCommit,
      repository: entry.source.repository,
      installedRepository: installedSource.repository,
      enabled: plugin.enabled,
      message: "installed plugin source does not match the catalog git source",
    };
  }

  const current =
    installedSource.resolvedCommit.toLowerCase() === entry.source.resolvedCommit.toLowerCase();

  return {
    id: entry.id,
    status: current ? "current" : "update_available",
    catalogCommit: entry.source.resolvedCommit,
    installedCommit: installedSource.resolvedCommit,
    repository: entry.source.repository,
    enabled: plugin.enabled,
    message: current
      ? "installed commit matches the catalog pin"
      : "catalog pin differs from the installed commit",
  };
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
