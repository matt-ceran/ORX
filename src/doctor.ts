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

export interface DoctorReport {
  text: string;
  readiness: DoctorReadiness;
  strictReady: boolean;
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
  return createDoctorReport({
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
  }).text;
}

export function createDoctorReport({
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
}: DoctorOptions): DoctorReport {
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
  const pluginReviewIssues =
    pluginReview.updateAvailableCount +
    pluginReview.pendingBinTrustCount +
    pluginReview.pendingHookTrustCount +
    pluginReview.untrustedBinCount +
    pluginReview.untrustedHookCount +
    pluginReview.omissionCount;
  const readiness = formatDoctorReadiness({
    apiKeyPresent: loadedConfig.apiKeyPresent,
    activeMcpProfileCount: mcpStatus.activeProfileIds.length,
    installedPluginCount: pluginReview.installedCount,
    pluginReviewIssues,
    delegationExecutionEnabled: delegationPolicy.executionEnabled,
    delegationTeamCount: delegationTeamStatus.count,
  });
  const text = [
    "ORX doctor",
    "summary:",
    `  overall: ${readiness.overall}`,
    `  ready_to_use: ${readiness.readyToUse}`,
    `  core_cli: ${readiness.coreCli}`,
    `  chat: ${readiness.chat}`,
    `  mcp: ${readiness.mcp}`,
    `  plugins: ${readiness.plugins}`,
    `  delegation: ${readiness.delegation}`,
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
    `  result_merge: ${delegationPolicy.resultMerge}`,
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
      pluginReviewIssues,
      delegationExecutionEnabled: delegationPolicy.executionEnabled,
      delegationTeamCount: delegationTeamStatus.count,
    }),
  ].join("\n");

  return {
    text,
    readiness,
    strictReady: readiness.readyToUse === "yes",
  };
}

interface DoctorReadinessOptions {
  apiKeyPresent: boolean;
  activeMcpProfileCount: number;
  installedPluginCount: number;
  pluginReviewIssues: number;
  delegationExecutionEnabled: boolean;
  delegationTeamCount: number;
}

export interface DoctorReadiness {
  overall: string;
  readyToUse: string;
  coreCli: string;
  chat: string;
  mcp: string;
  plugins: string;
  delegation: string;
}

function formatDoctorReadiness({
  apiKeyPresent,
  activeMcpProfileCount,
  installedPluginCount,
  pluginReviewIssues,
  delegationExecutionEnabled,
  delegationTeamCount,
}: DoctorReadinessOptions): DoctorReadiness {
  const chat = apiKeyPresent ? "ready" : "blocked_missing_openrouter_api_key";
  const mcp = activeMcpProfileCount > 0
    ? "active_profiles_configured"
    : "available_no_active_profiles";
  const plugins = pluginReviewIssues > 0
    ? "review_needed"
    : installedPluginCount > 0
      ? "review_clean"
      : "available_no_plugins_installed";
  const delegation = !delegationExecutionEnabled
    ? "optional_disabled"
    : delegationTeamCount > 0
      ? "policy_enabled_saved_team_available"
      : "policy_enabled_needs_chat_delegate";

  if (!apiKeyPresent) {
    return {
      overall: "setup_needed_api_key",
      readyToUse: "limited_core_cli_only",
      coreCli: "ready",
      chat,
      mcp,
      plugins,
      delegation,
    };
  }

  if (pluginReviewIssues > 0) {
    return {
      overall: "ready_with_plugin_review_needed",
      readyToUse: "yes",
      coreCli: "ready",
      chat,
      mcp,
      plugins,
      delegation,
    };
  }

  return {
    overall: "ready_for_interactive_coding",
    readyToUse: "yes",
    coreCli: "ready",
    chat,
    mcp,
    plugins,
    delegation,
  };
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
