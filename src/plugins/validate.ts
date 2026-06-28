import { existsSync, lstatSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { PluginComponentKey, PluginManifest } from "./manifest.js";
import { pluginManifestId, readPluginManifestFile } from "./manifest.js";
import { createPluginLockRecord, type PluginComponentHash } from "./lockfile.js";
import { hashPluginManifest } from "./registry.js";

export interface PluginValidationComponent {
  key: PluginComponentKey;
  path: string;
  status: "present" | "missing" | "outside_plugin";
  hash?: PluginComponentHash;
}

export interface PluginValidationResult {
  ok: boolean;
  pluginId: string;
  manifestPath: string;
  manifest: PluginManifest;
  manifestHash: string;
  components: PluginValidationComponent[];
  warnings: string[];
}

const MANIFEST_FILE_NAME = "orx-plugin.json";

export function validatePluginManifestInput(input: string, options: { cwd?: string } = {}): PluginValidationResult {
  const manifestPath = resolveManifestInput(input, options.cwd);
  const manifest = readPluginManifestFile(manifestPath);
  const manifestHash = hashPluginManifest(manifest);
  const lock = createPluginLockRecord(manifest, {
    manifestPath,
    manifestHash,
  });
  const baseDirectory = dirname(manifestPath);
  const components: PluginValidationComponent[] = [];
  const warnings: string[] = [];

  for (const [key, componentPath] of Object.entries(manifest.components) as Array<
    [PluginComponentKey, string]
  >) {
    const resolvedPath = resolve(baseDirectory, componentPath);
    const hash = lock.componentHashes[key];
    if (!isWithinDirectory(baseDirectory, resolvedPath)) {
      components.push({ key, path: componentPath, status: "outside_plugin" });
      warnings.push(`components.${key} points outside the plugin directory and will not be cached.`);
      continue;
    }
    if (!existsSync(resolvedPath)) {
      components.push({ key, path: componentPath, status: "missing" });
      warnings.push(`components.${key} path does not exist and will not be cached.`);
      continue;
    }

    components.push({ key, path: componentPath, status: "present", hash });
  }

  return {
    ok: true,
    pluginId: pluginManifestId(manifest),
    manifestPath,
    manifest,
    manifestHash,
    components: components.sort((left, right) => left.key.localeCompare(right.key)),
    warnings,
  };
}

export function renderPluginValidation(result: PluginValidationResult): string {
  return [
    `Plugin validation: ${result.pluginId}`,
    `  valid: ${result.ok ? "yes" : "no"}`,
    `  manifest: ${result.manifestPath}`,
    `  manifest_hash: ${result.manifestHash}`,
    `  source: ${formatSource(result.manifest)}`,
    `  components:`,
    ...formatComponents(result.components),
    `  permissions: filesystem=${result.manifest.permissions.filesystem.length} network=${result.manifest.permissions.network.length} env=${result.manifest.permissions.env.length} mcp=${result.manifest.permissions.mcp.length}`,
    `  warnings: ${result.warnings.length}`,
    ...result.warnings.map((warning) => `    - ${warning}`),
    "  registry_state: unchanged",
    "  execution_state: no install, enable, trust, grant, fetch, or execution performed",
  ].join("\n");
}

function resolveManifestInput(input: string, cwd = process.cwd()): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Usage: orx plugins validate <manifest-path-or-directory>");
  }

  const candidate = resolve(cwd, trimmed);
  if (existsSync(candidate)) {
    const stat = lstatSync(candidate);
    if (stat.isDirectory()) {
      return join(candidate, MANIFEST_FILE_NAME);
    }
  }
  return candidate;
}

function formatComponents(components: PluginValidationComponent[]): string[] {
  if (components.length === 0) {
    return ["    - none"];
  }

  return components.map((component) => {
    if (component.status !== "present" || !component.hash) {
      return `    - ${component.key}: ${component.status} ${component.path}`;
    }
    return `    - ${component.key}: present ${component.hash.kind} ${component.hash.path} ${component.hash.hash}${
      component.hash.truncated
        ? ` truncated=yes omitted_entries=${component.hash.omittedEntries ?? 0} omitted_bytes=${
            component.hash.omittedBytes ?? 0
          }`
        : ""
    }`;
  });
}

function formatSource(manifest: PluginManifest): string {
  const source = manifest.source;
  return [
    `type=${source.type}`,
    source.path ? `path=${source.path}` : undefined,
    source.repository ? `repository=${source.repository}` : undefined,
    source.ref ? `ref=${source.ref}` : undefined,
    source.resolvedCommit ? `resolvedCommit=${source.resolvedCommit}` : undefined,
  ]
    .filter((part): part is string => typeof part === "string")
    .join(" ");
}

function isWithinDirectory(baseDirectory: string, targetPath: string): boolean {
  if (!isAbsolute(baseDirectory) || !isAbsolute(targetPath)) {
    return false;
  }
  const relativePath = relative(baseDirectory, targetPath);
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}
