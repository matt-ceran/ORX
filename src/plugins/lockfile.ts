import {
  existsSync,
  lstatSync,
  opendirSync,
  readFileSync,
  readlinkSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import type { PluginComponentKey, PluginManifest, PluginSource } from "./manifest.js";
import { canonicalJson, sha256 } from "./hash.js";

export interface PluginComponentHash {
  path: string;
  kind: "file" | "directory" | "symlink";
  hash: string;
  truncated?: boolean;
  omittedEntries?: number;
  omittedBytes?: number;
}

export interface PluginLockRecord {
  source: PluginSource & {
    manifestPath: string;
  };
  resolvedRef?: string;
  integrity: string;
  installedAt: string;
  componentHashes: Partial<Record<PluginComponentKey, PluginComponentHash>>;
}

export interface PluginLockOptions {
  manifestPath: string;
  manifestHash: string;
  now?: () => Date;
}

const MAX_COMPONENT_HASH_DEPTH = 16;
const MAX_COMPONENT_HASH_ENTRIES = 4096;
const MAX_COMPONENT_HASH_BYTES = 4 * 1024 * 1024;
const MAX_COMPONENT_FILE_BYTES = 2 * 1024 * 1024;
const MAX_DIRECTORY_ENTRIES = 1024;

export function createPluginLockRecord(
  manifest: PluginManifest,
  options: PluginLockOptions,
): PluginLockRecord {
  const absoluteManifestPath = resolve(options.manifestPath);
  const baseDirectory = dirname(absoluteManifestPath);
  const componentHashes: Partial<Record<PluginComponentKey, PluginComponentHash>> = {};

  for (const [key, componentPath] of Object.entries(manifest.components)) {
    const resolvedPath = resolve(baseDirectory, componentPath);
    if (!isWithinDirectory(baseDirectory, resolvedPath) || !existsSync(resolvedPath)) {
      continue;
    }

    componentHashes[key as PluginComponentKey] = hashComponent(resolvedPath, baseDirectory);
  }

  return {
    source: {
      ...manifest.source,
      manifestPath: absoluteManifestPath,
    },
    resolvedRef:
      manifest.source.type === "git"
        ? manifest.source.resolvedCommit
        : manifest.source.resolvedCommit ?? manifest.source.ref,
    integrity: options.manifestHash,
    installedAt: (options.now?.() ?? new Date()).toISOString(),
    componentHashes,
  };
}

function hashComponent(path: string, baseDirectory: string): PluginComponentHash {
  const budget = createHashBudget();
  const component = hashComponentWithBudget(path, baseDirectory, budget, 0);
  if (!budget.truncated) {
    return component;
  }

  return {
    ...component,
    truncated: true,
    omittedEntries: budget.omittedEntries,
    omittedBytes: budget.omittedBytes,
  };
}

function hashComponentWithBudget(
  path: string,
  baseDirectory: string,
  budget: ComponentHashBudget,
  depth: number,
): PluginComponentHash {
  const stat = lstatSync(path);
  const displayPath = relative(baseDirectory, path) || basename(path);
  budget.entries += 1;

  if (stat.isSymbolicLink()) {
    const target = readlinkSync(path);
    return {
      path: displayPath,
      kind: "symlink",
      hash: sha256(canonicalJson({ kind: "symlink", path: displayPath, target })),
    };
  }

  if (stat.isDirectory()) {
    if (depth >= MAX_COMPONENT_HASH_DEPTH) {
      budget.truncated = true;
      budget.omittedEntries += 1;
      return {
        path: displayPath,
        kind: "directory",
        hash: sha256(
          canonicalJson({
            kind: "directory",
            path: displayPath,
            truncated: true,
            reason: "max_depth",
          }),
        ),
      };
    }

    const entries = readDirectoryEntries(path, path, budget, depth + 1);
    return {
      path: displayPath,
      kind: "directory",
      hash: sha256(
        canonicalJson({
          kind: "directory",
          entries,
          truncated: budget.truncated,
          omittedEntries: budget.omittedEntries,
          omittedBytes: budget.omittedBytes,
        }),
      ),
    };
  }

  if (
    stat.size > MAX_COMPONENT_FILE_BYTES ||
    budget.bytes + stat.size > MAX_COMPONENT_HASH_BYTES
  ) {
    budget.truncated = true;
    budget.omittedBytes += stat.size;
    return {
      path: displayPath,
      kind: "file",
      hash: sha256(
        canonicalJson({
          kind: "file",
          path: displayPath,
          size: stat.size,
          truncated: true,
          reason:
            stat.size > MAX_COMPONENT_FILE_BYTES ? "max_file_bytes" : "max_total_bytes",
        }),
      ),
    };
  }

  budget.bytes += stat.size;
  return {
    path: displayPath,
    kind: "file",
    hash: sha256(readFileSync(path)),
  };
}

function readDirectoryEntries(
  root: string,
  current: string,
  budget: ComponentHashBudget,
  depth: number,
): unknown[] {
  const entries: unknown[] = [];
  let names = readDirectoryEntryNames(current, budget);
  names = names.sort();

  for (const name of names) {
    if (budget.entries >= MAX_COMPONENT_HASH_ENTRIES) {
      budget.truncated = true;
      budget.omittedEntries += 1;
      entries.push({
        kind: "truncated",
        reason: "max_entries",
      });
      break;
    }

    const path = join(current, name);
    const displayPath = relative(root, path);
    const stat = lstatSync(path);
    budget.entries += 1;

    if (stat.isSymbolicLink()) {
      entries.push({
        path: displayPath,
        kind: "symlink",
        target: readlinkSync(path),
      });
      continue;
    }

    if (stat.isDirectory()) {
      if (depth >= MAX_COMPONENT_HASH_DEPTH) {
        budget.truncated = true;
        budget.omittedEntries += 1;
        entries.push({
          path: displayPath,
          kind: "directory",
          truncated: true,
          reason: "max_depth",
        });
        continue;
      }

      entries.push({
        path: displayPath,
        kind: "directory",
        entries: readDirectoryEntries(root, path, budget, depth + 1),
      });
      continue;
    }

    if (
      stat.size > MAX_COMPONENT_FILE_BYTES ||
      budget.bytes + stat.size > MAX_COMPONENT_HASH_BYTES
    ) {
      budget.truncated = true;
      budget.omittedBytes += stat.size;
      entries.push({
        path: displayPath,
        kind: "file",
        size: stat.size,
        truncated: true,
        reason:
          stat.size > MAX_COMPONENT_FILE_BYTES ? "max_file_bytes" : "max_total_bytes",
      });
      continue;
    }

    budget.bytes += stat.size;
    entries.push({
      path: displayPath,
      kind: "file",
      hash: sha256(readFileSync(path)),
    });
  }

  return entries;
}

interface ComponentHashBudget {
  entries: number;
  bytes: number;
  truncated: boolean;
  omittedEntries: number;
  omittedBytes: number;
}

function createHashBudget(): ComponentHashBudget {
  return {
    entries: 0,
    bytes: 0,
    truncated: false,
    omittedEntries: 0,
    omittedBytes: 0,
  };
}

function readDirectoryEntryNames(path: string, budget: ComponentHashBudget): string[] {
  const names: string[] = [];
  const directory = opendirSync(path);
  try {
    while (names.length < MAX_DIRECTORY_ENTRIES) {
      const entry = directory.readSync();
      if (!entry) {
        return names;
      }
      names.push(entry.name);
    }

    if (directory.readSync()) {
      budget.truncated = true;
      budget.omittedEntries += 1;
      names.push("__orx_truncated_directory_entries__");
    }
  } finally {
    directory.closeSync();
  }

  return names.filter((name) => name !== "__orx_truncated_directory_entries__");
}

function isWithinDirectory(baseDirectory: string, candidate: string): boolean {
  const relativePath = relative(baseDirectory, candidate);
  return Boolean(relativePath && !relativePath.startsWith("..") && !relativePath.includes("/../"));
}
