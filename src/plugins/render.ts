import type { InstalledPluginRecord, PluginStatusSummary } from "./registry.js";

export function renderPluginList(summary: PluginStatusSummary): string {
  const lines = [
    "Plugins",
    `  installed: ${summary.installedCount}`,
    `  enabled: ${summary.enabledCount}`,
    `  enabled_hooks: ${summary.enabledHookCount}`,
    `  enabled_bins: ${summary.enabledBinCount}`,
    `  enabled_mcp: ${summary.enabledMcpCount}`,
  ];

  if (summary.plugins.length === 0) {
    lines.push("  plugins: none");
    return lines.join("\n");
  }

  lines.push("  plugins:");
  for (const plugin of summary.plugins) {
    lines.push(`    - ${formatPluginSummary(plugin)}`);
  }

  return lines.join("\n");
}

export function renderPluginInspect(plugin: InstalledPluginRecord): string {
  const componentEntries = Object.entries(plugin.manifest.components);
  const lockEntries = Object.entries(plugin.lock.componentHashes);

  return [
    `Plugin: ${plugin.id}`,
    `  name: ${plugin.manifest.name}`,
    `  publisher: ${plugin.manifest.publisher}`,
    `  version: ${plugin.manifest.version}`,
    `  description: ${plugin.manifest.description}`,
    `  installed: ${plugin.installed ? "yes" : "no"}`,
    `  enabled: ${plugin.enabled ? "yes" : "no"}`,
    "  trust: local registry marker only",
    `  manifest_hash: ${plugin.manifestHash}`,
    `  integrity: ${plugin.lock.integrity}`,
    `  registered_at: ${plugin.registeredAt}`,
    `  updated_at: ${plugin.updatedAt}`,
    `  source: ${formatSource(plugin)}`,
    `  resolved_ref: ${plugin.lock.resolvedRef ?? "none"}`,
    `  manifest_path: ${plugin.lock.source.manifestPath}`,
    `  original_manifest_path: ${plugin.lock.source.originalManifestPath ?? "none"}`,
    "  components:",
    ...(componentEntries.length === 0
      ? ["    - none"]
      : componentEntries.map(([key, value]) => `    - ${key}: ${value}`)),
    "  component_hashes:",
    ...(lockEntries.length === 0
      ? ["    - none_available"]
      : lockEntries.map(
          ([key, value]) =>
            `    - ${key}: ${value.kind} ${value.path} ${value.hash}${
              value.truncated
                ? ` truncated=yes omitted_entries=${value.omittedEntries ?? 0} omitted_bytes=${
                    value.omittedBytes ?? 0
                  }`
                : ""
            }`,
        )),
    "  permissions:",
    `    filesystem: ${formatPermissionValues(plugin.manifest.permissions.filesystem)}`,
    `    network: ${formatPermissionValues(plugin.manifest.permissions.network)}`,
    `    env: ${formatPermissionValues(plugin.manifest.permissions.env)}`,
    `    mcp: ${formatPermissionValues(plugin.manifest.permissions.mcp)}`,
    "  executable_surfaces: hooks=inactive bins=inactive mcp=inactive commands=inactive",
    "  plugin_code_execution: disabled in this scaffold",
  ].join("\n");
}

export function formatPluginSummary(plugin: InstalledPluginRecord): string {
  return [
    `plugin=${plugin.id}`,
    `enabled=${plugin.enabled ? "yes" : "no"}`,
    "trust=local-registry",
    `integrity=${plugin.lock.integrity}`,
    `manifest=${plugin.manifestHash}`,
    `source=${plugin.manifest.source.type}`,
    `components=${formatComponentKeys(plugin)}`,
    `permissions=${formatPermissionSummary(plugin)}`,
  ].join(" ");
}

function formatSource(plugin: InstalledPluginRecord): string {
  const source = plugin.manifest.source;
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

function formatComponentKeys(plugin: InstalledPluginRecord): string {
  const keys = Object.keys(plugin.manifest.components).sort();
  return keys.length > 0 ? keys.join(",") : "none";
}

function formatPermissionSummary(plugin: InstalledPluginRecord): string {
  const permissions = plugin.manifest.permissions;
  return [
    `filesystem:${permissions.filesystem.length}`,
    `network:${permissions.network.length}`,
    `env:${permissions.env.length}`,
    `mcp:${permissions.mcp.length}`,
  ].join(",");
}

function formatPermissionValues(values: string[]): string {
  return values.length > 0 ? values.join(",") : "none";
}
