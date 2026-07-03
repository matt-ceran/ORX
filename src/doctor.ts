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
import type { TerminalRenderOptions } from "./terminal/render.js";
import {
  formatTerminalKeyValues,
  renderTerminalBlock,
  shouldUseHumanTtyLayout,
  type TerminalLayout,
} from "./terminal/ui.js";

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
  json: DoctorJsonReport;
}

export interface DoctorRenderOptions {
  layout?: TerminalLayout;
  renderOptions?: TerminalRenderOptions;
}

export interface DoctorJsonReport {
  schema_version: 1;
  strict_ready: boolean;
  summary: {
    overall: string;
    ready_to_use: string;
    core_cli: string;
    chat: string;
    mcp: string;
    plugins: string;
    delegation: string;
    interactive_chat: string;
    network_calls: "none";
    subprocesses: "none";
    remote_mcp_calls: "none";
    plugin_execution: "none";
  };
  runtime: {
    cwd: string;
    config_source: string;
    mode: string;
    model: string;
    fusion_preset: string | null;
    theme: string;
    active_profile: string | null;
    api_key_present: boolean;
    api_key_source: string;
    approval_policy: string;
    sandbox_mode: string;
    saved_profiles: number;
    test_targets: number;
    test_targets_truncated: boolean;
    test_default_target: string | null;
  };
  mcp: {
    active_profiles: string[];
    total_profiles: number;
    active_servers: number;
    auth_bearing_servers: number;
    policy_allowed_tools: number;
    policy_denied_tools: number;
    model_tool_grants: number;
    stale_model_tool_grants: number;
    pending_schema_changes: number;
    next: string;
  };
  plugins: {
    installed: number;
    enabled: number;
    catalog_updates_available: number;
    bin_trust: {
      trusted: number;
      pending: number;
      untrusted: number;
    };
    hook_trust: {
      trusted: number;
      pending: number;
      untrusted: number;
    };
    plugin_mcp_profiles: number;
    command_aliases: number;
    omissions: number;
    omissions_truncated: boolean;
    next: string;
  };
  delegation: {
    saved_teams: number;
    execution_policy: "enabled" | "disabled";
    max_task_cost_usd: number;
    timeout_ms: number;
    max_result_bytes: number;
    credential_forwarding: string;
    result_merge: string;
    delegate_task_runtime: string;
    delegate_task_cli_exposure: "unavailable_sessionless_cli";
    chat_readiness: "not_evaluated_sessionless_cli";
    chat_delegate_requirement: "active_chat_session_delegate_required";
    saved_team_availability: string;
    next: string;
  };
  next_steps: string[];
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
  const interactiveChat = loadedConfig.apiKeyPresent ? "ready" : "blocked_missing_openrouter_api_key";
  const configSource = formatConfigSources(loadedConfig.loadedFiles);
  const mcpNext = mcpStatus.activeProfileIds.length > 0 ? "orx mcp status" : "orx mcp presets";
  const pluginNext = "orx plugins doctor";
  const delegationSavedTeamAvailability = formatDelegationSavedTeamAvailability(
    delegationPolicy.executionEnabled,
    delegationTeamStatus.count,
  );
  const nextSteps = formatNextSteps({
    apiKeyPresent: loadedConfig.apiKeyPresent,
    activeMcpProfileCount: mcpStatus.activeProfileIds.length,
    pluginReviewIssues,
    delegationExecutionEnabled: delegationPolicy.executionEnabled,
    delegationTeamCount: delegationTeamStatus.count,
  });
  const json: DoctorJsonReport = {
    schema_version: 1,
    strict_ready: readiness.readyToUse === "yes",
    summary: {
      overall: readiness.overall,
      ready_to_use: readiness.readyToUse,
      core_cli: readiness.coreCli,
      chat: readiness.chat,
      mcp: readiness.mcp,
      plugins: readiness.plugins,
      delegation: readiness.delegation,
      interactive_chat: interactiveChat,
      network_calls: "none",
      subprocesses: "none",
      remote_mcp_calls: "none",
      plugin_execution: "none",
    },
    runtime: {
      cwd,
      config_source: configSource,
      mode: config.mode,
      model: config.model,
      fusion_preset: config.fusionPreset ?? null,
      theme: config.theme ?? DEFAULT_THEME,
      active_profile: config.activeProfile ?? null,
      api_key_present: loadedConfig.apiKeyPresent,
      api_key_source: loadedConfig.apiKeySource,
      approval_policy: config.permissions.approvalPolicy,
      sandbox_mode: config.permissions.sandboxMode,
      saved_profiles: profileStatus.count,
      test_targets: testStatus.targetCount,
      test_targets_truncated: testStatus.truncated,
      test_default_target: testStatus.defaultTargetId ?? null,
    },
    mcp: {
      active_profiles: mcpStatus.activeProfileIds,
      total_profiles: mcpStatus.profiles.length,
      active_servers: mcpStatus.serverCount,
      auth_bearing_servers: mcpStatus.authBearingServerCount,
      policy_allowed_tools: mcpStatus.policyAllowedToolCount,
      policy_denied_tools: mcpStatus.policyDeniedToolCount,
      model_tool_grants: mcpStatus.modelToolGrantCount,
      stale_model_tool_grants: mcpStatus.staleModelToolGrantCount,
      pending_schema_changes: mcpStatus.pendingSchemaChangeCount,
      next: mcpNext,
    },
    plugins: {
      installed: pluginReview.installedCount,
      enabled: pluginReview.enabledCount,
      catalog_updates_available: pluginReview.updateAvailableCount,
      bin_trust: {
        trusted: pluginTrustedBins,
        pending: pluginReview.pendingBinTrustCount,
        untrusted: pluginReview.untrustedBinCount,
      },
      hook_trust: {
        trusted: pluginTrustedHooks,
        pending: pluginReview.pendingHookTrustCount,
        untrusted: pluginReview.untrustedHookCount,
      },
      plugin_mcp_profiles: pluginReview.pluginMcpProfileCount,
      command_aliases: pluginReview.aliasCount,
      omissions: pluginReview.omissionCount,
      omissions_truncated: pluginReview.truncated,
      next: pluginNext,
    },
    delegation: {
      saved_teams: delegationTeamStatus.count,
      execution_policy: delegationPolicy.executionEnabled ? "enabled" : "disabled",
      max_task_cost_usd: delegationPolicy.maxTaskCostUsd,
      timeout_ms: delegationPolicy.taskTimeoutMs,
      max_result_bytes: delegationPolicy.maxResultBytes,
      credential_forwarding: delegationPolicy.credentialForwarding,
      result_merge: delegationPolicy.resultMerge,
      delegate_task_runtime: delegationPolicy.executionEnabled
        ? "policy_gated_openrouter_adapter"
        : "policy_enforced_disabled",
      delegate_task_cli_exposure: "unavailable_sessionless_cli",
      chat_readiness: "not_evaluated_sessionless_cli",
      chat_delegate_requirement: "active_chat_session_delegate_required",
      saved_team_availability: delegationSavedTeamAvailability,
      next: "orx delegates plan",
    },
    next_steps: nextSteps,
  };
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
    `  interactive_chat: ${interactiveChat}`,
    "  network_calls: none",
    "  subprocesses: none",
    "  remote_mcp_calls: none",
    "  plugin_execution: none",
    "runtime:",
    `  cwd: ${cwd}`,
    `  config_source: ${configSource}`,
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
    `  next: ${mcpNext}`,
    "plugins:",
    `  installed: ${pluginReview.installedCount}`,
    `  enabled: ${pluginReview.enabledCount}`,
    `  catalog_updates_available: ${pluginReview.updateAvailableCount}`,
    `  bin_trust: trusted=${pluginTrustedBins} pending=${pluginReview.pendingBinTrustCount} untrusted=${pluginReview.untrustedBinCount}`,
    `  hook_trust: trusted=${pluginTrustedHooks} pending=${pluginReview.pendingHookTrustCount} untrusted=${pluginReview.untrustedHookCount}`,
    `  plugin_mcp_profiles: ${pluginReview.pluginMcpProfileCount}`,
    `  command_aliases: ${pluginReview.aliasCount}`,
    `  omissions: ${pluginReview.omissionCount}${pluginReview.truncated ? " (truncated)" : ""}`,
    `  next: ${pluginNext}`,
    "delegation:",
    `  saved_teams: ${delegationTeamStatus.count}`,
    `  execution_policy: ${json.delegation.execution_policy}`,
    `  max_task_cost_usd: ${delegationPolicy.maxTaskCostUsd}`,
    `  timeout_ms: ${delegationPolicy.taskTimeoutMs}`,
    `  max_result_bytes: ${delegationPolicy.maxResultBytes}`,
    `  credential_forwarding: ${delegationPolicy.credentialForwarding}`,
    `  result_merge: ${delegationPolicy.resultMerge}`,
    `  delegate_task_runtime: ${json.delegation.delegate_task_runtime}`,
    "  delegate_task_cli_exposure: unavailable_sessionless_cli",
    "  chat_readiness: not_evaluated_sessionless_cli",
    "  chat_delegate_requirement: active_chat_session_delegate_required",
    `  saved_team_availability: ${delegationSavedTeamAvailability}`,
    "  next: orx delegates plan",
    "next_steps:",
    ...nextSteps.map((step) => `  - ${step}`),
  ].join("\n");

  return {
    text,
    readiness,
    strictReady: json.strict_ready,
    json,
  };
}

export function renderDoctorReport(
  report: DoctorReport,
  options: DoctorRenderOptions = {},
): string {
  if (!shouldUseHumanTtyLayout(options.renderOptions, options.layout)) {
    return report.text;
  }

  const renderOptions = options.renderOptions;
  const json = report.json;
  const activeMcpProfiles =
    json.mcp.active_profiles.length > 0 ? json.mcp.active_profiles.join(", ") : "none";
  const nextSteps =
    json.next_steps.length === 0
      ? ["none"]
      : json.next_steps.map((step, index) => `${index + 1}. ${step}`);

  return [
    renderTerminalBlock({
      title: "ORX doctor",
      subtitle: json.summary.overall,
      renderOptions,
      body: [
        formatTerminalKeyValues(
          [
            ["ready", json.summary.ready_to_use],
            ["core", json.summary.core_cli],
            ["chat", json.summary.chat],
          ],
          { renderOptions },
        ),
        formatTerminalKeyValues(
          [
            ["mcp", json.summary.mcp],
            ["plugins", json.summary.plugins],
            ["delegation", json.summary.delegation],
          ],
          { renderOptions },
        ),
        "network none  subprocesses none  remote_mcp none  plugin_execution none",
      ],
      footer: "no-network readiness check",
    }),
    renderTerminalBlock({
      title: "runtime",
      renderOptions,
      body: [
        formatTerminalKeyValues(
          [
            ["cwd", json.runtime.cwd],
            ["config", json.runtime.config_source],
          ],
          { renderOptions },
        ),
        formatTerminalKeyValues(
          [
            ["mode", json.runtime.mode],
            ["model", json.runtime.model],
            ["fusion", json.runtime.fusion_preset ?? "none"],
            ["theme", json.runtime.theme],
          ],
          { renderOptions },
        ),
        formatTerminalKeyValues(
          [
            ["api key", json.runtime.api_key_present ? "yes" : "no"],
            ["source", json.runtime.api_key_source],
            ["profile", json.runtime.active_profile ?? "none"],
          ],
          { renderOptions },
        ),
        formatTerminalKeyValues(
          [
            ["permissions", `${json.runtime.approval_policy}/${json.runtime.sandbox_mode}`],
            ["saved profiles", String(json.runtime.saved_profiles)],
            [
              "tests",
              `${json.runtime.test_targets}${json.runtime.test_targets_truncated ? " truncated" : ""}`,
            ],
            ["default test", json.runtime.test_default_target ?? "none"],
          ],
          { renderOptions },
        ),
      ],
    }),
    renderTerminalBlock({
      title: "mcp",
      renderOptions,
      body: [
        formatTerminalKeyValues(
          [
            ["active", activeMcpProfiles],
            ["profiles", String(json.mcp.total_profiles)],
            ["servers", String(json.mcp.active_servers)],
            ["auth", String(json.mcp.auth_bearing_servers)],
          ],
          { renderOptions },
        ),
        formatTerminalKeyValues(
          [
            ["allowed", String(json.mcp.policy_allowed_tools)],
            ["denied", String(json.mcp.policy_denied_tools)],
            ["model grants", String(json.mcp.model_tool_grants)],
            ["stale", String(json.mcp.stale_model_tool_grants)],
            ["pending schema", String(json.mcp.pending_schema_changes)],
          ],
          { renderOptions },
        ),
        `next ${json.mcp.next}`,
      ],
    }),
    renderTerminalBlock({
      title: "plugins",
      renderOptions,
      body: [
        formatTerminalKeyValues(
          [
            ["installed", String(json.plugins.installed)],
            ["enabled", String(json.plugins.enabled)],
            ["updates", String(json.plugins.catalog_updates_available)],
          ],
          { renderOptions },
        ),
        formatTerminalKeyValues(
          [
            ["bins", trustSummary(json.plugins.bin_trust)],
            ["hooks", trustSummary(json.plugins.hook_trust)],
            ["mcp profiles", String(json.plugins.plugin_mcp_profiles)],
            ["aliases", String(json.plugins.command_aliases)],
            [
              "omissions",
              `${json.plugins.omissions}${json.plugins.omissions_truncated ? " truncated" : ""}`,
            ],
          ],
          { renderOptions },
        ),
        `next ${json.plugins.next}`,
      ],
    }),
    renderTerminalBlock({
      title: "delegation",
      renderOptions,
      body: [
        formatTerminalKeyValues(
          [
            ["saved teams", String(json.delegation.saved_teams)],
            ["policy", json.delegation.execution_policy],
            ["runtime", json.delegation.delegate_task_runtime],
          ],
          { renderOptions },
        ),
        formatTerminalKeyValues(
          [
            ["max cost", `$${json.delegation.max_task_cost_usd}`],
            ["timeout", `${json.delegation.timeout_ms}ms`],
            ["bytes", String(json.delegation.max_result_bytes)],
            ["credentials", json.delegation.credential_forwarding],
            ["merge", json.delegation.result_merge],
          ],
          { renderOptions },
        ),
        formatTerminalKeyValues(
          [
            ["cli", json.delegation.delegate_task_cli_exposure],
            ["chat", json.delegation.chat_readiness],
            ["team", json.delegation.saved_team_availability],
          ],
          { renderOptions },
        ),
        `next ${json.delegation.next}`,
      ],
    }),
    renderTerminalBlock({
      title: "next steps",
      renderOptions,
      body: nextSteps,
    }),
  ].join("\n");
}

function trustSummary(counts: { trusted: number; pending: number; untrusted: number }): string {
  return `${counts.trusted}/${counts.pending}/${counts.untrusted}`;
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
    steps.push("run orx auth setup to configure OPENROUTER_API_KEY");
    steps.push("run orx auth init to create a private commented env template");
  } else {
    steps.push("run orx chat for the interactive coding session");
  }

  steps.push(
    activeMcpProfileCount > 0
      ? "run orx mcp status to inspect active MCP profile policy"
      : "run orx mcp presets to add a reviewed MCP provider profile",
  );

  steps.push(
    pluginReviewIssues > 0
      ? "run orx plugins doctor to review plugin updates and trust gates"
      : "run orx plugins catalog to browse installable plugin entries",
  );

  if (!delegationExecutionEnabled) {
    steps.push("run orx delegates policy to inspect delegate_task execution gates");
  } else if (delegationTeamCount === 0) {
    steps.push("run orx delegates teams save <id> inside chat after configuring delegates");
  } else {
    steps.push("run /delegates use <id> inside chat to load a saved delegation team");
  }

  return steps;
}
