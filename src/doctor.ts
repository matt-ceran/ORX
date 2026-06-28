import { formatConfigSources } from "./config/index.js";
import type { LoadedConfig } from "./config/types.js";
import { DEFAULT_THEME } from "./constants.js";
import {
  getDelegationTeamStatusSummary,
  loadDelegationExecutionPolicy,
} from "./delegation/index.js";
import { getMcpStatusSummary } from "./mcp/index.js";
import { createPluginReview } from "./plugins/index.js";
import { getProfileStatusSummary } from "./profiles/index.js";
import { getTestAdapterSummary } from "./testing/index.js";

export interface DoctorOptions {
  cwd: string;
  loadedConfig: LoadedConfig;
  mcpConfigPath?: string;
  mcpProfileCatalogPath?: string;
  pluginCatalogPath?: string;
  pluginBinsConfigPath?: string;
  pluginHooksConfigPath?: string;
  pluginRegistryPath?: string;
  profileConfigPath?: string;
  delegationTeamConfigPath?: string;
  delegationPolicyPath?: string;
}

export function formatDoctor({
  cwd,
  loadedConfig,
  mcpConfigPath,
  mcpProfileCatalogPath,
  pluginCatalogPath,
  pluginBinsConfigPath,
  pluginHooksConfigPath,
  pluginRegistryPath,
  profileConfigPath,
  delegationTeamConfigPath,
  delegationPolicyPath,
}: DoctorOptions): string {
  const { config } = loadedConfig;
  const mcpStatus = getMcpStatusSummary({
    configPath: mcpConfigPath,
    profileCatalogPath: mcpProfileCatalogPath,
    pluginRegistryPath,
  });
  const pluginReview = createPluginReview({
    registryPath: pluginRegistryPath,
    catalogPath: pluginCatalogPath,
    binsConfigPath: pluginBinsConfigPath,
    hooksConfigPath: pluginHooksConfigPath,
  });
  const profileStatus = getProfileStatusSummary({ configPath: profileConfigPath });
  const delegationTeamStatus = getDelegationTeamStatusSummary({
    configPath: delegationTeamConfigPath,
  });
  const delegationPolicy = loadDelegationExecutionPolicy({ configPath: delegationPolicyPath });
  const testStatus = getTestAdapterSummary(cwd);
  const activeMcpProfiles =
    mcpStatus.activeProfileIds.length > 0 ? mcpStatus.activeProfileIds.join(",") : "none";
  const pluginTrustedBins = pluginReview.entries.reduce(
    (count, entry) => count + entry.bins.trusted,
    0,
  );
  const pluginTrustedHooks = pluginReview.entries.reduce(
    (count, entry) => count + entry.hooks.trusted,
    0,
  );

  return [
    "ORX doctor",
    "summary:",
    `  interactive_chat: ${loadedConfig.apiKeyPresent ? "ready" : "blocked_missing_openrouter_api_key"}`,
    "  network_calls: none",
    "  subprocesses: none",
    "  remote_mcp_calls: none",
    "  plugin_execution: none",
    "runtime:",
    `  cwd: ${cwd}`,
    `  config_source: ${formatConfigSources(loadedConfig.loadedFiles)}`,
    `  mode: ${config.mode}`,
    `  model: ${config.model}`,
    `  fusion_preset: ${config.fusionPreset ?? "none"}`,
    `  theme: ${config.theme ?? DEFAULT_THEME}`,
    `  active_profile: ${config.activeProfile ?? "none"}`,
    `  api_key_present: ${loadedConfig.apiKeyPresent ? "yes" : "no"}`,
    `  api_key_source: ${loadedConfig.apiKeySource}`,
    `  approval_policy: ${config.permissions.approvalPolicy}`,
    `  sandbox_mode: ${config.permissions.sandboxMode}`,
    `  saved_profiles: ${profileStatus.count}`,
    `  test_targets: ${testStatus.targetCount}${testStatus.truncated ? " (truncated)" : ""}`,
    `  test_default_target: ${testStatus.defaultTargetId ?? "none"}`,
    "mcp:",
    `  active_profiles: ${activeMcpProfiles}`,
    `  total_profiles: ${mcpStatus.profiles.length}`,
    `  active_servers: ${mcpStatus.serverCount}`,
    `  auth_bearing_servers: ${mcpStatus.authBearingServerCount}`,
    `  policy_allowed_tools: ${mcpStatus.policyAllowedToolCount}`,
    `  policy_denied_tools: ${mcpStatus.policyDeniedToolCount}`,
    `  model_tool_grants: ${mcpStatus.modelToolGrantCount}`,
    `  stale_model_tool_grants: ${mcpStatus.staleModelToolGrantCount}`,
    `  pending_schema_changes: ${mcpStatus.pendingSchemaChangeCount === 0 ? "none" : mcpStatus.pendingSchemaChangeCount}`,
    `  next: ${mcpStatus.activeProfileIds.length > 0 ? "orx mcp status" : "orx mcp presets"}`,
    "plugins:",
    `  installed: ${pluginReview.installedCount}`,
    `  enabled: ${pluginReview.enabledCount}`,
    `  catalog_updates_available: ${pluginReview.updateAvailableCount}`,
    `  bin_trust: trusted=${pluginTrustedBins} pending=${pluginReview.pendingBinTrustCount} untrusted=${pluginReview.untrustedBinCount}`,
    `  hook_trust: trusted=${pluginTrustedHooks} pending=${pluginReview.pendingHookTrustCount} untrusted=${pluginReview.untrustedHookCount}`,
    `  plugin_mcp_profiles: ${pluginReview.pluginMcpProfileCount}`,
    `  command_aliases: ${pluginReview.aliasCount}`,
    `  omissions: ${pluginReview.omissionCount}${pluginReview.truncated ? " (truncated)" : ""}`,
    "  next: orx plugins doctor",
    "delegation:",
    `  saved_teams: ${delegationTeamStatus.count}`,
    `  execution_policy: ${delegationPolicy.executionEnabled ? "enabled" : "disabled"}`,
    `  max_task_cost_usd: ${delegationPolicy.maxTaskCostUsd}`,
    `  timeout_ms: ${delegationPolicy.taskTimeoutMs}`,
    `  max_result_bytes: ${delegationPolicy.maxResultBytes}`,
    `  credential_forwarding: ${delegationPolicy.credentialForwarding}`,
    `  delegate_task_runtime: ${delegationPolicy.executionEnabled ? "policy_gated_openrouter_adapter" : "policy_enforced_disabled"}`,
    "  delegate_task_cli_exposure: unavailable_sessionless_cli",
    "  chat_readiness: not_evaluated_sessionless_cli",
    "  chat_delegate_requirement: active_chat_session_delegate_required",
    `  saved_team_availability: ${formatDelegationSavedTeamAvailability(
      delegationPolicy.executionEnabled,
      delegationTeamStatus.count,
    )}`,
    "  next: orx delegates plan",
    "next_steps:",
    ...formatNextSteps({
      apiKeyPresent: loadedConfig.apiKeyPresent,
      activeMcpProfileCount: mcpStatus.activeProfileIds.length,
      pluginReviewIssues:
        pluginReview.updateAvailableCount +
        pluginReview.pendingBinTrustCount +
        pluginReview.pendingHookTrustCount +
        pluginReview.untrustedBinCount +
        pluginReview.untrustedHookCount +
        pluginReview.omissionCount,
      delegationExecutionEnabled: delegationPolicy.executionEnabled,
      delegationTeamCount: delegationTeamStatus.count,
    }),
  ].join("\n");
}

function formatDelegationSavedTeamAvailability(
  executionEnabled: boolean,
  teamCount: number,
): string {
  if (!executionEnabled) {
    return "blocked_policy_disabled";
  }
  if (teamCount === 0) {
    return "none";
  }
  return "available_load_in_chat";
}

function formatNextSteps({
  apiKeyPresent,
  activeMcpProfileCount,
  pluginReviewIssues,
  delegationExecutionEnabled,
  delegationTeamCount,
}: {
  apiKeyPresent: boolean;
  activeMcpProfileCount: number;
  pluginReviewIssues: number;
  delegationExecutionEnabled: boolean;
  delegationTeamCount: number;
}): string[] {
  const steps: string[] = [];

  if (!apiKeyPresent) {
    steps.push("  - set OPENROUTER_API_KEY before using chat, ask, models, credits, or generation");
  } else {
    steps.push("  - run orx chat for the interactive coding session");
  }

  steps.push(
    activeMcpProfileCount > 0
      ? "  - run orx mcp status to inspect active MCP profile policy"
      : "  - run orx mcp presets to add a reviewed MCP provider profile",
  );

  steps.push(
    pluginReviewIssues > 0
      ? "  - run orx plugins doctor to review plugin updates and trust gates"
      : "  - run orx plugins catalog to browse installable plugin entries",
  );

  if (!delegationExecutionEnabled) {
    steps.push("  - run orx delegates policy to inspect delegate_task execution gates");
  } else if (delegationTeamCount === 0) {
    steps.push("  - run orx delegates teams save <id> inside chat after configuring delegates");
  } else {
    steps.push("  - run /delegates use <id> inside chat to load a saved delegation team");
  }

  return steps;
}
