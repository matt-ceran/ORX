import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  rmSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pluginManifestId, type PluginManifest } from "./manifest.js";

export interface PluginCachePathOptions {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  registryPath?: string;
  cacheDirectory?: string;
}

export interface PluginCacheOptions {
  registryPath?: string;
  cacheDirectory?: string;
}

export interface CachedPluginManifest {
  cacheRoot: string;
  manifestPath: string;
  originalManifestPath: string;
}

const PLUGIN_DIRECTORY_MODE = 0o700;
const PLUGIN_FILE_MODE = 0o600;
const MANIFEST_FILE_NAME = "orx-plugin.json";
const MAX_CACHE_COPY_DEPTH = 32;
const MAX_CACHE_COPY_ENTRIES = 4096;
const MAX_CACHE_COPY_BYTES = 32 * 1024 * 1024;
const MAX_CACHE_COPY_FILE_BYTES = 8 * 1024 * 1024;
const MAX_CACHE_DIRECTORY_ENTRIES = 2048;

export function defaultPluginCacheDirectory(): string {
  return join(homedir(), ".orx", "plugins", "cache");
}

export function resolvePluginCacheDirectory(options: PluginCachePathOptions = {}): string {
  const explicitPath = options.cacheDirectory ?? options.env?.ORX_PLUGIN_CACHE_DIR;
  if (explicitPath) {
    return resolve(options.cwd ?? process.cwd(), explicitPath);
  }

  if (options.registryPath) {
    return join(dirname(resolve(options.cwd ?? process.cwd(), options.registryPath)), "cache");
  }

  return defaultPluginCacheDirectory();
}

export function cachePluginManifest(
  manifestPath: string,
  manifest: PluginManifest,
  manifestHash: string,
  options: PluginCacheOptions = {},
): CachedPluginManifest {
  const originalManifestPath = resolve(manifestPath);
  const sourceDirectory = dirname(originalManifestPath);
  const cacheDirectory = resolvePluginCacheDirectory({
    registryPath: options.registryPath,
    cacheDirectory: options.cacheDirectory,
  });
  const pluginCacheDirectory = join(cacheDirectory, cacheSegmentForPluginId(pluginManifestId(manifest)));
  const cacheRoot = join(pluginCacheDirectory, manifestHash.replace(/^sha256:/, ""));
  const tempRoot = `${cacheRoot}.tmp-${process.pid}-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}`;
  const budget = createCopyBudget();

  ensureCacheDirectory(cacheDirectory, shouldTightenCacheDirectory(cacheDirectory));
  ensureCacheDirectory(pluginCacheDirectory, true);
  rmSync(tempRoot, { recursive: true, force: true });
  mkdirSync(tempRoot, { recursive: true, mode: PLUGIN_DIRECTORY_MODE });
  chmodSync(tempRoot, PLUGIN_DIRECTORY_MODE);

  try {
    for (const componentPath of Object.values(manifest.components)) {
      if (!componentPath) {
        continue;
      }

      const sourcePath = resolve(sourceDirectory, componentPath);
      const destinationPath = resolve(tempRoot, componentPath);
      if (!isWithinDirectory(sourceDirectory, sourcePath) || !existsSync(sourcePath)) {
        continue;
      }
      if (!isWithinDirectory(tempRoot, destinationPath)) {
        continue;
      }

      copyPluginComponent(sourcePath, destinationPath, sourceDirectory, budget, 0);
    }

    const cachedManifestPath = join(tempRoot, MANIFEST_FILE_NAME);
    writeFileSync(cachedManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
      encoding: "utf8",
      mode: PLUGIN_FILE_MODE,
    });
    chmodSync(cachedManifestPath, PLUGIN_FILE_MODE);

    rmSync(cacheRoot, { recursive: true, force: true });
    renameSync(tempRoot, cacheRoot);
    chmodSync(cacheRoot, PLUGIN_DIRECTORY_MODE);

    return {
      cacheRoot,
      manifestPath: join(cacheRoot, MANIFEST_FILE_NAME),
      originalManifestPath,
    };
  } catch (error) {
    rmSync(tempRoot, { recursive: true, force: true });
    throw error;
  }
}

function copyPluginComponent(
  sourcePath: string,
  destinationPath: string,
  sourceDirectory: string,
  budget: PluginCacheCopyBudget,
  depth: number,
): void {
  if (budget.entries >= MAX_CACHE_COPY_ENTRIES) {
    throw new Error("Plugin cache copy exceeded the maximum entry count.");
  }
  if (depth > MAX_CACHE_COPY_DEPTH) {
    throw new Error(
      `Plugin cache copy exceeded the maximum directory depth at ${formatPluginPath(
        sourceDirectory,
        sourcePath,
      )}.`,
    );
  }

  const stat = lstatSync(sourcePath);
  budget.entries += 1;

  if (stat.isSymbolicLink()) {
    return;
  }

  if (stat.isDirectory()) {
    mkdirSync(destinationPath, { recursive: true, mode: PLUGIN_DIRECTORY_MODE });
    chmodSync(destinationPath, PLUGIN_DIRECTORY_MODE);
    const entries = readdirSync(sourcePath, { withFileTypes: true });
    if (entries.length > MAX_CACHE_DIRECTORY_ENTRIES) {
      throw new Error(
        `Plugin cache copy exceeded the maximum directory entry count at ${formatPluginPath(
          sourceDirectory,
          sourcePath,
        )}.`,
      );
    }

    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      copyPluginComponent(
        join(sourcePath, entry.name),
        join(destinationPath, entry.name),
        sourceDirectory,
        budget,
        depth + 1,
      );
    }
    return;
  }

  if (!stat.isFile()) {
    return;
  }

  if (stat.size > MAX_CACHE_COPY_FILE_BYTES || budget.bytes + stat.size > MAX_CACHE_COPY_BYTES) {
    throw new Error(
      `Plugin cache copy exceeded the maximum byte budget at ${formatPluginPath(
        sourceDirectory,
        sourcePath,
      )}.`,
    );
  }

  budget.bytes += stat.size;
  mkdirSync(dirname(destinationPath), { recursive: true, mode: PLUGIN_DIRECTORY_MODE });
  chmodSync(dirname(destinationPath), PLUGIN_DIRECTORY_MODE);
  copyFileSync(sourcePath, destinationPath);
  chmodSync(destinationPath, PLUGIN_FILE_MODE);
}

function ensureCacheDirectory(path: string, tighten: boolean): void {
  mkdirSync(path, { recursive: true, mode: PLUGIN_DIRECTORY_MODE });
  if (tighten) {
    chmodSync(path, PLUGIN_DIRECTORY_MODE);
  }
}

function shouldTightenCacheDirectory(path: string): boolean {
  return !existsSync(path) || resolve(path) === resolve(defaultPluginCacheDirectory());
}

function createCopyBudget(): PluginCacheCopyBudget {
  return {
    entries: 0,
    bytes: 0,
  };
}

function cacheSegmentForPluginId(id: string): string {
  return id.replace(/[^a-z0-9._@-]/g, "_").slice(0, 160);
}

function formatPluginPath(baseDirectory: string, path: string): string {
  const relativePath = relative(baseDirectory, path);
  return relativePath ? relativePath.split(sep).join("/") : ".";
}

function isWithinDirectory(baseDirectory: string, candidate: string): boolean {
  const base = resolve(baseDirectory);
  const resolved = resolve(candidate);
  const relativePath = relative(base, resolved);
  return Boolean(
    relativePath &&
      relativePath !== ".." &&
      !relativePath.startsWith(`..${sep}`) &&
      !isAbsolute(relativePath),
  );
}

interface PluginCacheCopyBudget {
  entries: number;
  bytes: number;
}
