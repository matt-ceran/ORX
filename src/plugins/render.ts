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
    `  trust_tier: ${plugin.manifest.metadata?.trustTier ?? "unspecified"}`,
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
    "  metadata:",
    ...formatMetadataLines(plugin),
    plugin.manifest.components.mcpServers
      ? "  mcp_profiles: discoverable via /mcp list when plugin is enabled; execution inactive"
      : "  mcp_profiles: none declared",
    "  executable_surfaces: hooks=manual_trust_required bins=inactive mcp=inactive commands=inactive",
    "  plugin_code_execution: hooks run only through explicit /hooks run for trusted hashes",
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
    `trust_tier=${plugin.manifest.metadata?.trustTier ?? "unspecified"}`,
    `auth=${formatAuthSummary(plugin)}`,
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

function formatMetadataLines(plugin: InstalledPluginRecord): string[] {
  const metadata = plugin.manifest.metadata;
  if (!metadata) {
    return ["    none"];
  }

  const lines = [
    `    homepage: ${metadata.homepage ?? "none"}`,
    `    documentation: ${metadata.documentation ?? "none"}`,
    `    license: ${metadata.license ?? "none"}`,
    `    trust_tier: ${metadata.trustTier ?? "unspecified"}`,
  ];

  if (metadata.auth) {
    lines.push(
      `    auth_required: ${formatOptionalBoolean(metadata.auth.required)}`,
      `    auth_methods: ${formatPermissionValues(metadata.auth.methods ?? [])}`,
      `    auth_env: ${formatPermissionValues(metadata.auth.env ?? [])}`,
      `    auth_notes: ${metadata.auth.notes ?? "none"}`,
    );
  } else {
    lines.push("    auth_required: unspecified");
  }

  if (metadata.privacy) {
    lines.push(
      `    privacy_data_access: ${formatPermissionValues(metadata.privacy.dataAccess ?? [])}`,
      `    privacy_network_access: ${formatPermissionValues(metadata.privacy.networkAccess ?? [])}`,
      `    privacy_notes: ${metadata.privacy.notes ?? "none"}`,
    );
  }

  if (metadata.runtime) {
    lines.push(
      `    runtime_node: ${metadata.runtime.node ?? "unspecified"}`,
      `    runtime_platforms: ${formatPermissionValues(metadata.runtime.platforms ?? [])}`,
      `    runtime_tools: ${formatPermissionValues(metadata.runtime.tools ?? [])}`,
      `    runtime_notes: ${metadata.runtime.notes ?? "none"}`,
    );
  }

  return lines;
}

function formatAuthSummary(plugin: InstalledPluginRecord): string {
  const required = plugin.manifest.metadata?.auth?.required;
  if (required === true) {
    return "required";
  }
  if (required === false) {
    return "not-required";
  }
  return "unspecified";
}

function formatOptionalBoolean(value: boolean | undefined): string {
  if (value === true) {
    return "yes";
  }
  if (value === false) {
    return "no";
  }
  return "unspecified";
}
