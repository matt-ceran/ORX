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

export interface PluginValidationParsedArgs {
  input: string;
  json: boolean;
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

export function parsePluginValidationArgs(args: string[]): PluginValidationParsedArgs | undefined {
  const operands = args.slice(1);
  if (operands.length === 0) {
    return undefined;
  }

  const json = operands.at(-1) === "--json";
  const inputParts = json ? operands.slice(0, -1) : operands;
  const input = inputParts.join(" ").trim();
  if (!input || inputParts.includes("--json")) {
    return undefined;
  }

  return { input, json };
}

export function renderPluginValidationJson(result: PluginValidationResult): string {
  return JSON.stringify(
    {
      schema_version: 1,
      surface: "orx.plugin_validation",
      ok: result.ok,
      operator_only: true,
      model_tool: "none",
      execution: "none",
      network: "none",
      data_state_writes: "none",
      plugin_id: result.pluginId,
      manifest_path: result.manifestPath,
      manifest_hash: result.manifestHash,
      manifest: {
        schema_version: result.manifest.schemaVersion,
        name: result.manifest.name,
        version: result.manifest.version,
        description: result.manifest.description,
        publisher: result.manifest.publisher,
        trust_tier: result.manifest.metadata?.trustTier,
      },
      source: pluginValidationSourceJson(result.manifest),
      components: result.components.map(pluginValidationComponentJson),
      component_count: result.components.length,
      warning_count: result.warnings.length,
      warnings: result.warnings,
      permissions: {
        filesystem: result.manifest.permissions.filesystem,
        network: result.manifest.permissions.network,
        env: result.manifest.permissions.env,
        mcp: result.manifest.permissions.mcp,
        counts: {
          filesystem: result.manifest.permissions.filesystem.length,
          network: result.manifest.permissions.network.length,
          env: result.manifest.permissions.env.length,
          mcp: result.manifest.permissions.mcp.length,
        },
      },
      authority: {
        validation_side_effects: "none",
        registry_cache_catalog_trust_state: "unchanged",
        install_enable_trust_grant_fetch_execute: "not_performed",
      },
      usage: "orx plugins validate <manifest-path-or-directory> [--json]",
    },
    null,
    2,
  );
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

function pluginValidationSourceJson(manifest: PluginManifest): Record<string, unknown> {
  const source = manifest.source;
  return {
    type: source.type,
    path: source.path,
    repository: source.repository,
    ref: source.ref,
    resolved_commit: source.resolvedCommit,
  };
}

function pluginValidationComponentJson(component: PluginValidationComponent): Record<string, unknown> {
  return {
    key: component.key,
    path: component.path,
    status: component.status,
    hash: component.hash
      ? {
          path: component.hash.path,
          kind: component.hash.kind,
          hash: component.hash.hash,
          truncated: component.hash.truncated === true,
          omitted_entries: component.hash.omittedEntries,
          omitted_bytes: component.hash.omittedBytes,
        }
      : undefined,
  };
}

function isWithinDirectory(baseDirectory: string, targetPath: string): boolean {
  if (!isAbsolute(baseDirectory) || !isAbsolute(targetPath)) {
    return false;
  }
  const relativePath = relative(baseDirectory, targetPath);
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}
