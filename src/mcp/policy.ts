import {
  getActiveMcpProfiles,
  getMcpToolNames,
  listMcpProfiles,
  type McpDeclaredTool,
  type McpProfile,
  type McpRegistryOptions,
} from "./registry.js";
import { hashMcpProfile, hashMcpProfiles } from "./schema.js";
import { getMcpProfileConfigRecord, loadMcpProfilesConfig } from "./config.js";

export interface McpStatusSummary {
  activeProfileIds: string[];
  profiles: McpProfile[];
  profileHashes: Record<string, string>;
  trustedProfileHashes: Record<string, string | undefined>;
  profileUpdatedAt: Record<string, string | undefined>;
  pendingSchemaChangeProfileIds: string[];
  registryHash: string;
  serverCount: number;
  authBearingServerCount: number;
  writeEnabledToolCount: number;
  billableToolCount: number;
  policyAllowedToolCount: number;
  policyDeniedToolCount: number;
  configuredDeniedToolCount: number;
  configuredBillableToolCount: number;
  configuredRiskyToolCount: number;
  riskyTransportCount: number;
  pendingSchemaChangeCount: number;
}

export type McpToolPolicyDecision =
  | "allowed"
  | "denied"
  | "blocked_by_profile"
  | "blocked_by_trust"
  | "blocked_by_schema_change"
  | "unknown_profile"
  | "unknown_tool";

export interface McpToolPolicyEvaluation {
  profileId: string;
  toolName: string;
  tool?: McpDeclaredTool;
  decision: McpToolPolicyDecision;
  reason: string;
}

export interface McpToolPolicyContext {
  trustedProfileHash?: string;
  schemaChangePending?: boolean;
  futureAllowedToolIds?: string[];
}

export interface McpProfileToolPolicyReport {
  profile: McpProfile;
  profileHash: string;
  trustedProfileHash?: string;
  updatedAt?: string;
  schemaChangePending: boolean;
  evaluations: McpToolPolicyEvaluation[];
}

export function getMcpStatusSummary(options: McpRegistryOptions = {}): McpStatusSummary {
  const config = options.config ?? loadMcpProfilesConfig({ configPath: options.configPath });
  const registryOptions = {
    ...options,
    config,
  };
  const profiles = listMcpProfiles(registryOptions);
  const activeProfiles = getActiveMcpProfiles(registryOptions);
  const profileHashes = Object.fromEntries(
    profiles.map((profile) => [profile.id, hashMcpProfile(profile)]),
  );
  const trustedProfileHashes = Object.fromEntries(
    profiles.map((profile) => [
      profile.id,
      getMcpProfileConfigRecord(config, profile.id)?.trustedProfileHash,
    ]),
  );
  const profileUpdatedAt = Object.fromEntries(
    profiles.map((profile) => [profile.id, getMcpProfileConfigRecord(config, profile.id)?.updatedAt]),
  );
  const pendingSchemaChangeProfileIds = profiles
    .filter((profile) => {
      const trustedHash = trustedProfileHashes[profile.id];
      return Boolean(trustedHash && trustedHash !== profileHashes[profile.id]);
    })
    .map((profile) => profile.id);
  const toolEvaluations = profiles.flatMap((profile) =>
    profile.tools.map((tool) =>
      evaluateDeclaredMcpToolPolicy(profile, tool, {
        trustedProfileHash: trustedProfileHashes[profile.id],
        schemaChangePending: pendingSchemaChangeProfileIds.includes(profile.id),
      }),
    ),
  );

  return {
    activeProfileIds: activeProfiles.map((profile) => profile.id),
    profiles,
    profileHashes,
    trustedProfileHashes,
    profileUpdatedAt,
    pendingSchemaChangeProfileIds,
    registryHash: hashMcpProfiles(profiles),
    serverCount: activeProfiles.length,
    authBearingServerCount: activeProfiles.filter((profile) => profile.authRequired).length,
    writeEnabledToolCount: activeProfiles.reduce(
      (count, profile) =>
        count +
        profile.tools.filter((tool) => tool.risk === "write" || tool.risk === "destructive")
          .length,
      0,
    ),
    billableToolCount: activeProfiles.reduce(
      (count, profile) => count + profile.tools.filter((tool) => tool.billable).length,
      0,
    ),
    policyAllowedToolCount: toolEvaluations.filter((evaluation) => evaluation.decision === "allowed")
      .length,
    policyDeniedToolCount: toolEvaluations.filter((evaluation) => evaluation.decision === "denied")
      .length,
    configuredDeniedToolCount: profiles.reduce(
      (count, profile) => count + profile.tools.filter(isDefaultDeniedTool).length,
      0,
    ),
    configuredBillableToolCount: profiles.reduce(
      (count, profile) => count + profile.tools.filter((tool) => tool.billable).length,
      0,
    ),
    configuredRiskyToolCount: profiles.reduce(
      (count, profile) => count + profile.tools.filter(isRiskyDeclaredTool).length,
      0,
    ),
    riskyTransportCount: activeProfiles.filter((profile) => profile.transport.kind !== "stdio").length,
    pendingSchemaChangeCount: pendingSchemaChangeProfileIds.length,
  };
}

export function evaluateMcpToolPolicy(
  profileId: string,
  toolName: string,
  options: McpRegistryOptions & Pick<McpToolPolicyContext, "futureAllowedToolIds"> = {},
): McpToolPolicyEvaluation {
  const summary = getMcpStatusSummary(options);
  const profile = summary.profiles.find((candidate) => candidate.id === profileId);
  if (!profile) {
    return {
      profileId,
      toolName,
      decision: "unknown_profile",
      reason: `Unknown MCP profile: ${profileId}`,
    };
  }

  const tool = profile.tools.find((candidate) => candidate.name === toolName);
  if (!tool) {
    return {
      profileId,
      toolName,
      decision: "unknown_tool",
      reason: `Unknown MCP tool for profile ${profileId}: ${toolName}`,
    };
  }

  return evaluateDeclaredMcpToolPolicy(profile, tool, {
    trustedProfileHash: summary.trustedProfileHashes[profile.id],
    schemaChangePending: summary.pendingSchemaChangeProfileIds.includes(profile.id),
    futureAllowedToolIds: options.futureAllowedToolIds,
  });
}

export function evaluateDeclaredMcpToolPolicy(
  profile: McpProfile,
  tool: McpDeclaredTool,
  context: McpToolPolicyContext = {},
): McpToolPolicyEvaluation {
  if (profile.state !== "enabled") {
    return {
      profileId: profile.id,
      toolName: tool.name,
      tool,
      decision: "blocked_by_profile",
      reason: "profile is disabled",
    };
  }

  if (!context.trustedProfileHash) {
    return {
      profileId: profile.id,
      toolName: tool.name,
      tool,
      decision: "blocked_by_trust",
      reason: "profile has no trusted schema hash baseline",
    };
  }

  if (context.schemaChangePending) {
    return {
      profileId: profile.id,
      toolName: tool.name,
      tool,
      decision: "blocked_by_schema_change",
      reason: "profile schema changed since the trusted baseline",
    };
  }

  if (isDefaultDeniedTool(tool)) {
    if (isFutureAllowedTool(profile.id, tool.name, context)) {
      return {
        profileId: profile.id,
        toolName: tool.name,
        tool,
        decision: "allowed",
        reason: "explicit future allowlist permits this MCP tool",
      };
    }

    return {
      profileId: profile.id,
      toolName: tool.name,
      tool,
      decision: "denied",
      reason: tool.billable
        ? "billable MCP tools require an explicit future allowlist"
        : `${tool.risk} MCP tools require an explicit future allowlist`,
    };
  }

  return {
    profileId: profile.id,
    toolName: tool.name,
    tool,
    decision: "allowed",
    reason: "read-only declared tool on enabled trusted profile",
  };
}

export function getMcpProfileToolPolicyReport(
  profileId: string,
  options: McpRegistryOptions & Pick<McpToolPolicyContext, "futureAllowedToolIds"> = {},
): McpProfileToolPolicyReport | undefined {
  const summary = getMcpStatusSummary(options);
  const profile = summary.profiles.find((candidate) => candidate.id === profileId);
  if (!profile) {
    return undefined;
  }

  return {
    profile,
    profileHash: summary.profileHashes[profile.id],
    trustedProfileHash: summary.trustedProfileHashes[profile.id],
    updatedAt: summary.profileUpdatedAt[profile.id],
    schemaChangePending: summary.pendingSchemaChangeProfileIds.includes(profile.id),
    evaluations: profile.tools.map((tool) =>
      evaluateDeclaredMcpToolPolicy(profile, tool, {
        trustedProfileHash: summary.trustedProfileHashes[profile.id],
        schemaChangePending: summary.pendingSchemaChangeProfileIds.includes(profile.id),
        futureAllowedToolIds: options.futureAllowedToolIds,
      }),
    ),
  };
}

export function renderMcpStatus(summary: McpStatusSummary = getMcpStatusSummary()): string {
  const active = summary.activeProfileIds.length > 0 ? summary.activeProfileIds.join(",") : "none";
  const lines = [
    "MCP",
    `  active_profiles: ${active}`,
    `  active_servers: ${summary.serverCount}`,
    `  auth_bearing_servers: ${summary.authBearingServerCount}`,
    `  write_enabled_tools: ${summary.writeEnabledToolCount}`,
    `  billable_tools: ${summary.billableToolCount}`,
    `  policy_allowed_tools: ${summary.policyAllowedToolCount}`,
    `  policy_denied_tools: ${summary.policyDeniedToolCount}`,
    `  configured_denied_tools: ${summary.configuredDeniedToolCount}`,
    `  configured_billable_tools: ${summary.configuredBillableToolCount}`,
    `  configured_risky_tools: ${summary.configuredRiskyToolCount}`,
    `  risky_transports: ${summary.riskyTransportCount}`,
    `  registry_hash: ${summary.registryHash}`,
    `  pending_schema_changes: ${formatSchemaChanges(summary.pendingSchemaChangeCount)}`,
  ];

  for (const profile of summary.profiles) {
    lines.push(
      `  ${formatMcpProfile(profile, summary.profileHashes[profile.id], {
        trustedProfileHash: summary.trustedProfileHashes[profile.id],
        updatedAt: summary.profileUpdatedAt[profile.id],
        schemaChangePending: summary.pendingSchemaChangeProfileIds.includes(profile.id),
      })}`,
    );
  }

  return lines.join("\n");
}

export interface FormatMcpProfileOptions {
  trustedProfileHash?: string;
  updatedAt?: string;
  schemaChangePending?: boolean;
}

export function formatMcpProfile(
  profile: McpProfile,
  hash = hashMcpProfile(profile),
  options: FormatMcpProfileOptions = {},
): string {
  return [
    `profile=${profile.id}`,
    `state=${profile.state}`,
    `transport=${profile.transport.kind}`,
    profile.transport.url ? `url=${profile.transport.url}` : undefined,
    `source=${profile.source?.kind ?? "builtin"}`,
    profile.source?.pluginId ? `plugin=${profile.source.pluginId}` : undefined,
    `risk=${profile.riskLevel}`,
    `auth=${profile.authRequired ? "yes" : "no"}`,
    `write=${profile.writeCapable ? "yes" : "no"}`,
    `billable_tools=${profile.tools.filter((tool) => tool.billable).length}`,
    `default_denied_tools=${profile.tools.filter(isDefaultDeniedTool).length}`,
    `risky_tools=${profile.tools.filter(isRiskyDeclaredTool).length}`,
    `tools=${profile.tools.length}`,
    `hash=${hash}`,
    options.trustedProfileHash ? `trusted_hash=${options.trustedProfileHash}` : undefined,
    options.updatedAt ? `updated_at=${options.updatedAt}` : undefined,
    options.schemaChangePending ? "schema_change=pending" : undefined,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" ");
}

export function renderMcpProfileInspect(
  profile: McpProfile,
  options: FormatMcpProfileOptions = {},
): string {
  const currentHash = hashMcpProfile(profile);
  const evaluationsByTool = new Map(
    profile.tools.map((tool) => [
      tool.name,
      evaluateDeclaredMcpToolPolicy(profile, tool, {
        trustedProfileHash: options.trustedProfileHash,
        schemaChangePending: options.schemaChangePending,
      }),
    ]),
  );
  const lines = [
    `MCP profile: ${profile.id}`,
    `  name: ${profile.name}`,
    `  state: ${profile.state}`,
    `  transport: ${profile.transport.kind}`,
    profile.transport.url ? `  url: ${profile.transport.url}` : undefined,
    `  source: ${formatMcpProfileSource(profile)}`,
    `  risk: ${profile.riskLevel}`,
    `  auth_required: ${profile.authRequired ? "yes" : "no"}`,
    profile.authRequired
      ? "  auth_status: required (OAuth or dedicated expiring MCP key)"
      : "  auth_status: not required",
    `  write_capable: ${profile.writeCapable ? "yes" : "no"}`,
    "  remote_tool_execution: not implemented; not exposed to the model loop",
    "  normal_inference: direct OpenRouter REST API",
    `  profile_hash: ${currentHash}`,
    options.trustedProfileHash ? `  trusted_hash: ${options.trustedProfileHash}` : undefined,
    options.updatedAt ? `  updated_at: ${options.updatedAt}` : undefined,
    options.schemaChangePending
      ? "  schema_change: pending trusted baseline differs from configured profile hash"
      : undefined,
    `  notes: ${profile.notes}`,
    "  tools:",
    ...profile.tools.map(
      (tool) => `    - ${formatMcpToolPolicyEvaluation(evaluationsByTool.get(tool.name)!)}`,
    ),
  ];

  return lines.filter((line): line is string => typeof line === "string").join("\n");
}

export function renderMcpProfileTools(report: McpProfileToolPolicyReport): string {
  const counts = countToolPolicyDecisions(report.evaluations);
  const lines = [
    `MCP tools: ${report.profile.id}`,
    `  state: ${report.profile.state}`,
    `  profile_hash: ${report.profileHash}`,
    report.trustedProfileHash ? `  trusted_hash: ${report.trustedProfileHash}` : undefined,
    report.updatedAt ? `  updated_at: ${report.updatedAt}` : undefined,
    report.schemaChangePending ? "  schema_change: pending" : undefined,
    `  decisions: allowed=${counts.allowed} denied=${counts.denied} blocked_by_profile=${counts.blocked_by_profile} blocked_by_trust=${counts.blocked_by_trust} blocked_by_schema_change=${counts.blocked_by_schema_change}`,
    "  remote_tool_execution: not implemented; this is a future-use policy evaluation only",
    "  tools:",
    ...report.evaluations.map((evaluation) => `    - ${formatMcpToolPolicyEvaluation(evaluation)}`),
  ];

  return lines.filter((line): line is string => typeof line === "string").join("\n");
}

export function formatMcpToolPolicyEvaluation(evaluation: McpToolPolicyEvaluation): string {
  const tool = evaluation.tool;
  return [
    evaluation.toolName,
    tool ? `risk=${tool.risk}` : undefined,
    tool ? `auth=${tool.authRequired ? "yes" : "no"}` : undefined,
    tool ? `billable=${tool.billable ? "yes" : "no"}` : undefined,
    `policy=${evaluation.decision}`,
    `reason=${quotePolicyReason(evaluation.reason)}`,
  ]
    .filter((part): part is string => typeof part === "string")
    .join(" ");
}

export function getMcpProfileToolNames(profile: McpProfile): string[] {
  return getMcpToolNames(profile);
}

function formatSchemaChanges(count: number): string {
  return count === 0 ? "none" : String(count);
}

function isDefaultDeniedTool(tool: McpDeclaredTool): boolean {
  return tool.billable || tool.risk === "billable" || tool.risk === "write" || tool.risk === "destructive";
}

function isRiskyDeclaredTool(tool: McpDeclaredTool): boolean {
  return isDefaultDeniedTool(tool);
}

function isFutureAllowedTool(
  profileId: string,
  toolName: string,
  context: McpToolPolicyContext,
): boolean {
  return Boolean(context.futureAllowedToolIds?.includes(`${profileId}/${toolName}`));
}

function countToolPolicyDecisions(
  evaluations: McpToolPolicyEvaluation[],
): Record<McpToolPolicyDecision, number> {
  const counts: Record<McpToolPolicyDecision, number> = {
    allowed: 0,
    denied: 0,
    blocked_by_profile: 0,
    blocked_by_trust: 0,
    blocked_by_schema_change: 0,
    unknown_profile: 0,
    unknown_tool: 0,
  };
  for (const evaluation of evaluations) {
    counts[evaluation.decision] += 1;
  }
  return counts;
}

function quotePolicyReason(reason: string): string {
  return JSON.stringify(reason);
}

function formatMcpProfileSource(profile: McpProfile): string {
  const source = profile.source;
  if (!source || source.kind === "builtin") {
    return "builtin";
  }

  return [
    "plugin",
    source.pluginId ? `plugin=${source.pluginId}` : undefined,
    source.manifestHash ? `manifest_hash=${source.manifestHash}` : undefined,
    source.componentPath ? `component_path=${source.componentPath}` : undefined,
    source.componentHash ? `component_hash=${source.componentHash}` : undefined,
    "execution=inactive",
  ]
    .filter((part): part is string => typeof part === "string")
    .join(" ");
}
