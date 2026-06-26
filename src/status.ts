import { formatConfigSources } from "./config/index.js";
import type { LoadedConfig } from "./config/types.js";
import { getMcpStatusSummary, formatMcpProfile } from "./mcp/index.js";

export interface StatusOptions {
  cwd: string;
  loadedConfig: LoadedConfig;
}

export function formatStatus({ cwd, loadedConfig }: StatusOptions): string {
  const { config } = loadedConfig;
  const mcpStatus = getMcpStatusSummary();
  const activeMcpProfiles =
    mcpStatus.activeProfileIds.length > 0 ? mcpStatus.activeProfileIds.join(",") : "none";
  const lines = [
    "ORX status",
    `cwd: ${cwd}`,
    `config_source: ${formatConfigSources(loadedConfig.loadedFiles)}`,
    `mode: ${config.mode}`,
    `model: ${config.model}`,
    `fusion_preset: ${config.fusionPreset ?? "none"}`,
    `api_key_present: ${loadedConfig.apiKeyPresent ? "yes" : "no"}`,
    `api_key_source: ${loadedConfig.apiKeySource}`,
    `approval_policy: ${config.permissions.approvalPolicy}`,
    `sandbox_mode: ${config.permissions.sandboxMode}`,
    "shell_access: enabled",
    "network_tools: enabled",
    "destructive_command_warnings: disabled",
    `mcp_active_profiles: ${activeMcpProfiles}`,
    `mcp_active_servers: ${mcpStatus.serverCount}`,
    `mcp_auth_bearing_servers: ${mcpStatus.authBearingServerCount}`,
    `mcp_write_enabled_tools: ${mcpStatus.writeEnabledToolCount}`,
    `mcp_billable_tools: ${mcpStatus.billableToolCount}`,
    `mcp_configured_billable_tools: ${mcpStatus.configuredBillableToolCount}`,
    `mcp_risky_transports: ${mcpStatus.riskyTransportCount}`,
    `mcp_registry_hash: ${mcpStatus.registryHash}`,
    `mcp_pending_schema_changes: ${
      mcpStatus.pendingSchemaChangeCount === 0 ? "none" : mcpStatus.pendingSchemaChangeCount
    }`,
    ...mcpStatus.profiles.map(
      (profile) => `mcp_profile: ${formatMcpProfile(profile, mcpStatus.profileHashes[profile.id])}`,
    ),
  ];

  return lines.join("\n");
}
