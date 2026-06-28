import { formatConfigSources } from "./config/index.js";
import type { LoadedConfig } from "./config/types.js";
import { DEFAULT_THEME } from "./constants.js";
import { getDelegationStatusSummary, type DelegationState } from "./delegation/index.js";
import { getMcpStatusSummary, formatMcpProfile } from "./mcp/index.js";
import {
  getEnabledPluginPromptSummary,
  getEnabledPluginRuleSummary,
  getEnabledPluginSkillSummary,
  getEnabledPluginMcpProfileSummary,
  getEnabledPluginCommandAliasSummary,
  getPluginBinTrustSummary,
  getPluginHookTrustSummary,
  getPluginStatusSummary,
} from "./plugins/index.js";
import { getProfileStatusSummary } from "./profiles/index.js";
import { createTerminalRenderer, type TerminalRenderOptions } from "./terminal/render.js";

export interface StatusOptions {
  cwd: string;
  loadedConfig: LoadedConfig;
  mcpConfigPath?: string;
  pluginCacheDirectory?: string;
  pluginBinsAuditLogPath?: string;
  pluginBinsConfigPath?: string;
  pluginHooksAuditLogPath?: string;
  pluginHooksConfigPath?: string;
  pluginRegistryPath?: string;
  profileConfigPath?: string;
  delegationState?: DelegationState;
  renderOptions?: TerminalRenderOptions;
}

export function formatStatus({
  cwd,
  loadedConfig,
  mcpConfigPath,
  pluginCacheDirectory,
  pluginBinsAuditLogPath,
  pluginBinsConfigPath,
  pluginHooksAuditLogPath,
  pluginHooksConfigPath,
  pluginRegistryPath,
  profileConfigPath,
  delegationState,
  renderOptions,
}: StatusOptions): string {
  const renderer = createTerminalRenderer(renderOptions);
  const { config } = loadedConfig;
  const mcpStatus = getMcpStatusSummary({
    configPath: mcpConfigPath,
    pluginRegistryPath,
  });
  const pluginStatus = getPluginStatusSummary({ registryPath: pluginRegistryPath });
  const pluginSkillStatus = getEnabledPluginSkillSummary({ registryPath: pluginRegistryPath });
  const pluginPromptStatus = getEnabledPluginPromptSummary({ registryPath: pluginRegistryPath });
  const pluginRuleStatus = getEnabledPluginRuleSummary({ registryPath: pluginRegistryPath });
  const pluginMcpStatus = getEnabledPluginMcpProfileSummary({ registryPath: pluginRegistryPath });
  const pluginCommandAliasStatus = getEnabledPluginCommandAliasSummary({
    registryPath: pluginRegistryPath,
    binsConfigPath: pluginBinsConfigPath,
  });
  const pluginBinTrustStatus = getPluginBinTrustSummary({
    registryPath: pluginRegistryPath,
    configPath: pluginBinsConfigPath,
  });
  const pluginHookTrustStatus = getPluginHookTrustSummary({
    registryPath: pluginRegistryPath,
    configPath: pluginHooksConfigPath,
  });
  const profileStatus = getProfileStatusSummary({ configPath: profileConfigPath });
  const delegationStatus =
    delegationState === undefined ? undefined : getDelegationStatusSummary(delegationState);
  const activeMcpProfiles =
    mcpStatus.activeProfileIds.length > 0 ? mcpStatus.activeProfileIds.join(",") : "none";
  const lines = [
    renderer.bold("ORX status"),
    `cwd: ${cwd}`,
    `config_source: ${formatConfigSources(loadedConfig.loadedFiles)}`,
    `mode: ${config.mode}`,
    `model: ${config.model}`,
    `fusion_preset: ${config.fusionPreset ?? "none"}`,
    `theme: ${config.theme ?? DEFAULT_THEME}`,
    `active_profile: ${config.activeProfile ?? "none"}`,
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
    `mcp_policy_allowed_tools: ${mcpStatus.policyAllowedToolCount}`,
    `mcp_policy_denied_tools: ${mcpStatus.policyDeniedToolCount}`,
    `mcp_configured_denied_tools: ${mcpStatus.configuredDeniedToolCount}`,
    `mcp_configured_billable_tools: ${mcpStatus.configuredBillableToolCount}`,
    `mcp_configured_risky_tools: ${mcpStatus.configuredRiskyToolCount}`,
    `mcp_tool_grants: ${mcpStatus.toolGrantCount}`,
    `mcp_stale_tool_grants: ${mcpStatus.staleToolGrantCount}`,
    `mcp_model_tool_grants: ${mcpStatus.modelToolGrantCount}`,
    `mcp_stale_model_tool_grants: ${mcpStatus.staleModelToolGrantCount}`,
    `mcp_risky_transports: ${mcpStatus.riskyTransportCount}`,
    `mcp_registry_hash: ${mcpStatus.registryHash}`,
    `mcp_pending_schema_changes: ${
      mcpStatus.pendingSchemaChangeCount === 0 ? "none" : mcpStatus.pendingSchemaChangeCount
    }`,
    `plugin_installed_count: ${pluginStatus.installedCount}`,
    `plugin_enabled_count: ${pluginStatus.enabledCount}`,
    `plugin_cache_path: ${pluginCacheDirectory ?? "default"}`,
    `plugin_command_aliases: ${pluginCommandAliasStatus.aliasCount}${
      pluginCommandAliasStatus.truncated ? " (truncated)" : ""
    }`,
    `plugin_prompt_aliases: ${pluginCommandAliasStatus.promptAliasCount}`,
    `plugin_bin_aliases: ${pluginCommandAliasStatus.binAliasCount}`,
    `plugin_trusted_bin_aliases: ${pluginCommandAliasStatus.trustedBinAliasCount}`,
    `plugin_bins_config_path: ${pluginBinsConfigPath ?? "default"}`,
    `plugin_bins_audit_path: ${pluginBinsAuditLogPath ?? "default"}`,
    `plugin_hooks_config_path: ${pluginHooksConfigPath ?? "default"}`,
    `plugin_hooks_audit_path: ${pluginHooksAuditLogPath ?? "default"}`,
    "plugin_bin_runtime: explicit_trusted_operator_run",
    `plugin_enabled_bins: ${pluginBinTrustStatus.trustedCount}`,
    `plugin_bin_definitions: ${pluginBinTrustStatus.binCount}${
      pluginBinTrustStatus.truncated ? " (truncated)" : ""
    }`,
    `plugin_trusted_bins: ${pluginBinTrustStatus.trustedCount}`,
    `plugin_pending_bin_trust: ${pluginBinTrustStatus.pendingTrustCount}`,
    "plugin_hook_runtime: manual_and_lifecycle",
    `plugin_enabled_hooks: ${pluginHookTrustStatus.trustedCount}`,
    `plugin_hook_definitions: ${pluginHookTrustStatus.hookCount}${
      pluginHookTrustStatus.truncated ? " (truncated)" : ""
    }`,
    `plugin_trusted_hooks: ${pluginHookTrustStatus.trustedCount}`,
    `plugin_pending_hook_trust: ${pluginHookTrustStatus.pendingTrustCount}`,
    `plugin_enabled_mcp: ${pluginStatus.enabledMcpCount}`,
    `plugin_mcp_presets: ${pluginMcpStatus.profileCount}${
      pluginMcpStatus.truncated ? " (truncated)" : ""
    }`,
    `plugin_enabled_skills: ${pluginSkillStatus.skillCount}${
      pluginSkillStatus.truncated ? " (truncated)" : ""
    }`,
    `plugin_enabled_prompts: ${pluginPromptStatus.promptCount}${
      pluginPromptStatus.truncated ? " (truncated)" : ""
    }`,
    `plugin_enabled_rules: ${pluginRuleStatus.ruleCount}${
      pluginRuleStatus.truncated ? " (truncated)" : ""
    }`,
    `profile_count: ${profileStatus.count}`,
    delegationStatus ? `orchestration_controller: ${delegationStatus.controller}` : undefined,
    delegationStatus ? "orchestration_execution: disabled" : undefined,
    delegationStatus ? `delegate_count: ${delegationStatus.delegateCount}` : undefined,
    delegationStatus ? "delegate_task: unavailable" : undefined,
    ...mcpStatus.profiles.map(
      (profile) =>
        `mcp_profile: ${formatMcpProfile(profile, mcpStatus.profileHashes[profile.id], {
          trustedProfileHash: mcpStatus.trustedProfileHashes[profile.id],
          updatedAt: mcpStatus.profileUpdatedAt[profile.id],
          schemaChangePending: mcpStatus.pendingSchemaChangeProfileIds.includes(profile.id),
        })}`,
    ),
  ];

  return lines.filter((line): line is string => typeof line === "string").join("\n");
}
