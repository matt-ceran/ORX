import {
  getActiveMcpProfiles,
  getMcpToolNames,
  listMcpProfiles,
  type McpDeclaredTool,
  type McpProfile,
  type McpRegistryOptions,
} from "./registry.js";
import { hashMcpProfile, hashMcpProfiles } from "./schema.js";
import {
  getMcpProfileConfigRecord,
  getMcpModelToolGrantRecord,
  getMcpToolGrantRecord,
  loadMcpProfilesConfig,
  mcpModelToolGrantKey,
  mcpToolGrantKey,
  saveMcpProfilesConfig,
  type McpModelToolGrantRecord,
  type McpToolGrantRecord,
} from "./config.js";
import type { TerminalRenderOptions } from "../terminal/render.js";
import {
  formatTerminalKeyValues,
  renderTerminalBlock,
  shouldUseHumanTtyLayout,
  type TerminalLayout,
} from "../terminal/ui.js";

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
  toolGrantCount: number;
  staleToolGrantCount: number;
  modelToolGrantCount: number;
  staleModelToolGrantCount: number;
}

export interface McpStatusRenderOptions {
  layout?: TerminalLayout;
  renderOptions?: TerminalRenderOptions;
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
  grantStatus?: "active" | "stale";
  toolGrant?: McpToolGrantRecord;
  modelGrantStatus?: "active" | "stale";
  modelToolGrant?: McpModelToolGrantRecord;
  modelPolicyDecision?: McpToolPolicyDecision;
}

export interface McpToolPolicyContext {
  profileHash?: string;
  trustedProfileHash?: string;
  schemaChangePending?: boolean;
  toolGrant?: McpToolGrantRecord;
  futureAllowedToolIds?: string[];
}

export interface McpProfileToolPolicyReport {
  profile: McpProfile;
  profileHash: string;
  trustedProfileHash?: string;
  updatedAt?: string;
  schemaChangePending: boolean;
  toolGrantCount: number;
  staleToolGrantCount: number;
  modelToolGrantCount: number;
  staleModelToolGrantCount: number;
  evaluations: McpToolPolicyEvaluation[];
}

export interface McpToolGrantChange {
  ok: boolean;
  profileId: string;
  toolName: string;
  profile?: McpProfile;
  tool?: McpDeclaredTool;
  profileHash?: string;
  previousGrant?: McpToolGrantRecord;
  grant?: McpToolGrantRecord;
  message: string;
}

export interface McpModelToolPolicyEvaluation {
  profileId: string;
  toolName: string;
  tool?: McpDeclaredTool;
  decision: McpToolPolicyDecision;
  reason: string;
  basePolicyDecision?: McpToolPolicyDecision;
  profileHash?: string;
  trustedProfileHash?: string;
  schemaChangePending?: boolean;
  modelGrantStatus?: "active" | "stale";
  modelToolGrant?: McpModelToolGrantRecord;
}

export interface McpModelToolGrantChange {
  ok: boolean;
  profileId: string;
  toolName: string;
  profile?: McpProfile;
  tool?: McpDeclaredTool;
  profileHash?: string;
  previousGrant?: McpModelToolGrantRecord;
  grant?: McpModelToolGrantRecord;
  message: string;
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
  const activeGrantKeys = new Set<string>();
  const activeModelGrantKeys = new Set<string>();
  const toolEvaluations = profiles.flatMap((profile) =>
    profile.tools.map((tool) => {
      const toolGrant = getMcpToolGrantRecord(config, profile.id, tool.name);
      if (toolGrant && toolGrant.profileHash === profileHashes[profile.id]) {
        activeGrantKeys.add(mcpToolGrantKey(profile.id, tool.name));
      }

      const modelToolGrant = getMcpModelToolGrantRecord(config, profile.id, tool.name);
      if (modelToolGrant && modelToolGrant.profileHash === profileHashes[profile.id]) {
        activeModelGrantKeys.add(mcpModelToolGrantKey(profile.id, tool.name));
      }

      return evaluateDeclaredMcpToolPolicy(profile, tool, {
        profileHash: profileHashes[profile.id],
        trustedProfileHash: trustedProfileHashes[profile.id],
        schemaChangePending: pendingSchemaChangeProfileIds.includes(profile.id),
        toolGrant,
      });
    }),
  );
  const staleToolGrantCount = Object.entries(config.toolGrants).filter(([key, record]) => {
    if (activeGrantKeys.has(key)) {
      return false;
    }

    const profileHash = profileHashes[record.profileId];
    const profile = profiles.find((candidate) => candidate.id === record.profileId);
    const tool = profile?.tools.find((candidate) => candidate.name === record.toolName);
    return !profileHash || !tool || record.profileHash !== profileHash;
  }).length;
  const staleModelToolGrantCount = Object.entries(config.modelToolGrants).filter(([key, record]) => {
    if (activeModelGrantKeys.has(key)) {
      return false;
    }

    const profileHash = profileHashes[record.profileId];
    const profile = profiles.find((candidate) => candidate.id === record.profileId);
    const tool = profile?.tools.find((candidate) => candidate.name === record.toolName);
    return !profileHash || !tool || record.profileHash !== profileHash;
  }).length;

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
    toolGrantCount: Object.keys(config.toolGrants).length,
    staleToolGrantCount,
    modelToolGrantCount: Object.keys(config.modelToolGrants).length,
    staleModelToolGrantCount,
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
    profileHash: summary.profileHashes[profile.id],
    trustedProfileHash: summary.trustedProfileHashes[profile.id],
    schemaChangePending: summary.pendingSchemaChangeProfileIds.includes(profile.id),
    toolGrant: getMcpToolGrantRecord(
      options.config ?? loadMcpProfilesConfig({ configPath: options.configPath }),
      profile.id,
      tool.name,
    ),
    futureAllowedToolIds: options.futureAllowedToolIds,
  });
}

export function evaluateMcpModelToolPolicy(
  profileId: string,
  toolName: string,
  options: McpRegistryOptions = {},
): McpModelToolPolicyEvaluation {
  const config = options.config ?? loadMcpProfilesConfig({ configPath: options.configPath });
  const summary = getMcpStatusSummary({ ...options, config });
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
      profileHash: summary.profileHashes[profile.id],
      trustedProfileHash: summary.trustedProfileHashes[profile.id],
      schemaChangePending: summary.pendingSchemaChangeProfileIds.includes(profile.id),
    };
  }

  const profileHash = summary.profileHashes[profile.id];
  const trustedProfileHash = summary.trustedProfileHashes[profile.id];
  const schemaChangePending = summary.pendingSchemaChangeProfileIds.includes(profile.id);
  const modelToolGrant = getMcpModelToolGrantRecord(config, profile.id, tool.name);
  const modelGrantStatus = getModelToolGrantStatus(profileHash, modelToolGrant);
  const basePolicy = evaluateDeclaredMcpToolPolicy(profile, tool, {
    profileHash,
    trustedProfileHash,
    schemaChangePending,
    toolGrant: getMcpToolGrantRecord(config, profile.id, tool.name),
  });
  const base = {
    profileId: profile.id,
    toolName: tool.name,
    tool,
    basePolicyDecision: basePolicy.decision,
    profileHash,
    trustedProfileHash,
    schemaChangePending,
    ...formatModelGrantForEvaluation(modelToolGrant, modelGrantStatus),
  };

  if (basePolicy.decision !== "allowed") {
    return {
      ...base,
      decision: basePolicy.decision,
      reason: basePolicy.reason,
    };
  }

  if (tool.risk !== "read" || tool.billable) {
    return {
      ...base,
      decision: "denied",
      reason: "model-visible MCP calls are limited to read-only non-billable declared tools",
    };
  }

  if (modelGrantStatus !== "active") {
    return {
      ...base,
      decision: "denied",
      reason:
        modelGrantStatus === "stale"
          ? "model MCP tool grant is stale for the current profile hash"
          : "model MCP tools require an explicit model-tool grant",
    };
  }

  return {
    ...base,
    decision: "allowed",
    reason: "explicit model MCP tool grant permits this read-only tool",
  };
}

export function evaluateDeclaredMcpToolPolicy(
  profile: McpProfile,
  tool: McpDeclaredTool,
  context: McpToolPolicyContext = {},
): McpToolPolicyEvaluation {
  const grantStatus = getToolGrantStatus(profile, tool, context);
  if (profile.state !== "enabled") {
    return {
      profileId: profile.id,
      toolName: tool.name,
      tool,
      decision: "blocked_by_profile",
      reason: "profile is disabled",
      ...formatGrantForEvaluation(context.toolGrant, grantStatus),
    };
  }

  if (!context.trustedProfileHash) {
    return {
      profileId: profile.id,
      toolName: tool.name,
      tool,
      decision: "blocked_by_trust",
      reason: "profile has no trusted schema hash baseline",
      ...formatGrantForEvaluation(context.toolGrant, grantStatus),
    };
  }

  if (context.schemaChangePending) {
    return {
      profileId: profile.id,
      toolName: tool.name,
      tool,
      decision: "blocked_by_schema_change",
      reason: "profile schema changed since the trusted baseline",
      ...formatGrantForEvaluation(context.toolGrant, grantStatus),
    };
  }

  if (isDefaultDeniedTool(tool)) {
    if (grantStatus === "active") {
      return {
        profileId: profile.id,
        toolName: tool.name,
        tool,
        decision: "allowed",
        reason: "explicit MCP tool grant permits this tool for the trusted profile hash",
        ...formatGrantForEvaluation(context.toolGrant, grantStatus),
      };
    }

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
      reason:
        grantStatus === "stale"
          ? "explicit MCP tool grant is stale for the current profile hash"
          : tool.billable
            ? "billable MCP tools require an explicit MCP tool grant"
            : `${tool.risk} MCP tools require an explicit MCP tool grant`,
      ...formatGrantForEvaluation(context.toolGrant, grantStatus),
    };
  }

  return {
    profileId: profile.id,
    toolName: tool.name,
    tool,
    decision: "allowed",
    reason: "read-only declared tool on enabled trusted profile",
    ...formatGrantForEvaluation(context.toolGrant, grantStatus),
  };
}

export function getMcpProfileToolPolicyReport(
  profileId: string,
  options: McpRegistryOptions & Pick<McpToolPolicyContext, "futureAllowedToolIds"> = {},
): McpProfileToolPolicyReport | undefined {
  const config = options.config ?? loadMcpProfilesConfig({ configPath: options.configPath });
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
    toolGrantCount: profile.tools.filter((tool) =>
      Boolean(getMcpToolGrantRecord(config, profile.id, tool.name)),
    ).length,
    staleToolGrantCount: profile.tools.filter((tool) => {
      const grant = getMcpToolGrantRecord(config, profile.id, tool.name);
      return Boolean(grant && grant.profileHash !== summary.profileHashes[profile.id]);
    }).length,
    modelToolGrantCount: profile.tools.filter((tool) =>
      Boolean(getMcpModelToolGrantRecord(config, profile.id, tool.name)),
    ).length,
    staleModelToolGrantCount: profile.tools.filter((tool) => {
      const grant = getMcpModelToolGrantRecord(config, profile.id, tool.name);
      return Boolean(grant && grant.profileHash !== summary.profileHashes[profile.id]);
    }).length,
    evaluations: profile.tools.map((tool) => {
      const evaluation = evaluateDeclaredMcpToolPolicy(profile, tool, {
        profileHash: summary.profileHashes[profile.id],
        trustedProfileHash: summary.trustedProfileHashes[profile.id],
        schemaChangePending: summary.pendingSchemaChangeProfileIds.includes(profile.id),
        toolGrant: getMcpToolGrantRecord(config, profile.id, tool.name),
        futureAllowedToolIds: options.futureAllowedToolIds,
      });
      const modelToolGrant = getMcpModelToolGrantRecord(config, profile.id, tool.name);
      const modelPolicy = modelToolGrant
        ? evaluateMcpModelToolPolicy(profile.id, tool.name, { ...options, config })
        : undefined;
      return {
        ...evaluation,
        ...formatModelGrantForEvaluation(
          modelToolGrant,
          getModelToolGrantStatus(summary.profileHashes[profile.id], modelToolGrant),
        ),
        modelPolicyDecision: modelPolicy?.decision,
      };
    }),
  };
}

export function allowMcpToolGrant(
  profileId: string,
  toolName: string,
  options: McpRegistryOptions & { now?: () => Date } = {},
): McpToolGrantChange {
  const config = options.config ?? loadMcpProfilesConfig({ configPath: options.configPath });
  const summary = getMcpStatusSummary({ ...options, config });
  const profile = summary.profiles.find((candidate) => candidate.id === profileId);
  if (!profile) {
    return {
      ok: false,
      profileId,
      toolName,
      message: `Unknown MCP profile: ${profileId}`,
    };
  }

  const tool = profile.tools.find((candidate) => candidate.name === toolName);
  if (!tool) {
    return {
      ok: false,
      profileId,
      toolName,
      profile,
      message: `Unknown MCP tool for profile ${profileId}: ${toolName}`,
    };
  }

  const profileHash = summary.profileHashes[profile.id];
  const trustedProfileHash = summary.trustedProfileHashes[profile.id];
  const schemaChangePending = summary.pendingSchemaChangeProfileIds.includes(profile.id);
  if (profile.state !== "enabled" || !trustedProfileHash || schemaChangePending) {
    const evaluation = evaluateDeclaredMcpToolPolicy(profile, tool, {
      profileHash,
      trustedProfileHash,
      schemaChangePending,
      toolGrant: getMcpToolGrantRecord(config, profile.id, tool.name),
    });
    return {
      ok: false,
      profileId,
      toolName,
      profile,
      tool,
      profileHash,
      message: `Cannot grant MCP tool ${profileId}/${toolName}: ${evaluation.reason}.`,
    };
  }

  if (!isDefaultDeniedTool(tool)) {
    return {
      ok: true,
      profileId,
      toolName,
      profile,
      tool,
      profileHash,
      message: `MCP tool ${profileId}/${toolName} is already allowed by read-only policy; no explicit grant stored.`,
    };
  }

  const key = mcpToolGrantKey(profile.id, tool.name);
  const previousGrant = config.toolGrants[key];
  const grant: McpToolGrantRecord = {
    profileId: profile.id,
    toolName: tool.name,
    profileHash,
    risk: tool.risk,
    billable: tool.billable,
    grantedAt: (options.now?.() ?? new Date()).toISOString(),
  };
  config.toolGrants[key] = grant;
  saveMcpProfilesConfig(config, { configPath: options.configPath });

  return {
    ok: true,
    profileId,
    toolName,
    profile,
    tool,
    profileHash,
    previousGrant,
    grant,
    message: previousGrant
      ? `MCP tool grant updated for ${profile.id}/${tool.name}. Execution is available only through explicit operator calls and policy gates.`
      : `MCP tool grant stored for ${profile.id}/${tool.name}. Execution is available only through explicit operator calls and policy gates.`,
  };
}

export function revokeMcpToolGrant(
  profileId: string,
  toolName: string,
  options: McpRegistryOptions = {},
): McpToolGrantChange {
  const config = options.config ?? loadMcpProfilesConfig({ configPath: options.configPath });
  const key = mcpToolGrantKey(profileId, toolName);
  const previousGrant = config.toolGrants[key];
  if (!previousGrant) {
    return {
      ok: false,
      profileId,
      toolName,
      message: `No MCP tool grant stored for ${profileId}/${toolName}.`,
    };
  }

  delete config.toolGrants[key];
  saveMcpProfilesConfig(config, { configPath: options.configPath });

  return {
    ok: true,
    profileId,
    toolName,
    previousGrant,
    message: `MCP tool grant revoked for ${profileId}/${toolName}.`,
  };
}

export function allowMcpModelToolGrant(
  profileId: string,
  toolName: string,
  options: McpRegistryOptions & { now?: () => Date } = {},
): McpModelToolGrantChange {
  const config = options.config ?? loadMcpProfilesConfig({ configPath: options.configPath });
  const summary = getMcpStatusSummary({ ...options, config });
  const profile = summary.profiles.find((candidate) => candidate.id === profileId);
  if (!profile) {
    return {
      ok: false,
      profileId,
      toolName,
      message: `Unknown MCP profile: ${profileId}`,
    };
  }

  const tool = profile.tools.find((candidate) => candidate.name === toolName);
  if (!tool) {
    return {
      ok: false,
      profileId,
      toolName,
      profile,
      message: `Unknown MCP tool for profile ${profileId}: ${toolName}`,
    };
  }

  const profileHash = summary.profileHashes[profile.id];
  const basePolicy = evaluateDeclaredMcpToolPolicy(profile, tool, {
    profileHash,
    trustedProfileHash: summary.trustedProfileHashes[profile.id],
    schemaChangePending: summary.pendingSchemaChangeProfileIds.includes(profile.id),
    toolGrant: getMcpToolGrantRecord(config, profile.id, tool.name),
  });
  if (basePolicy.decision !== "allowed") {
    return {
      ok: false,
      profileId,
      toolName,
      profile,
      tool,
      profileHash,
      message: `Cannot grant model MCP tool ${profileId}/${toolName}: ${basePolicy.reason}.`,
    };
  }

  if (tool.risk !== "read" || tool.billable) {
    return {
      ok: false,
      profileId,
      toolName,
      profile,
      tool,
      profileHash,
      message:
        `Cannot grant model MCP tool ${profileId}/${toolName}: model-visible MCP calls are limited to read-only non-billable declared tools.`,
    };
  }

  const key = mcpModelToolGrantKey(profile.id, tool.name);
  const previousGrant = config.modelToolGrants[key];
  const grant: McpModelToolGrantRecord = {
    profileId: profile.id,
    toolName: tool.name,
    profileHash,
    risk: tool.risk,
    billable: tool.billable,
    grantedAt: (options.now?.() ?? new Date()).toISOString(),
  };
  config.modelToolGrants[key] = grant;
  saveMcpProfilesConfig(config, { configPath: options.configPath });

  return {
    ok: true,
    profileId,
    toolName,
    profile,
    tool,
    profileHash,
    previousGrant,
    grant,
    message: previousGrant
      ? `Model MCP tool grant updated for ${profile.id}/${tool.name}. Model-visible execution requires /mcp model enable or orx ask --mcp-tools.`
      : `Model MCP tool grant stored for ${profile.id}/${tool.name}. Model-visible execution requires /mcp model enable or orx ask --mcp-tools.`,
  };
}

export function revokeMcpModelToolGrant(
  profileId: string,
  toolName: string,
  options: McpRegistryOptions = {},
): McpModelToolGrantChange {
  const config = options.config ?? loadMcpProfilesConfig({ configPath: options.configPath });
  const key = mcpModelToolGrantKey(profileId, toolName);
  const previousGrant = config.modelToolGrants[key];
  if (!previousGrant) {
    return {
      ok: false,
      profileId,
      toolName,
      message: `No model MCP tool grant stored for ${profileId}/${toolName}.`,
    };
  }

  delete config.modelToolGrants[key];
  saveMcpProfilesConfig(config, { configPath: options.configPath });

  return {
    ok: true,
    profileId,
    toolName,
    previousGrant,
    message: `Model MCP tool grant revoked for ${profileId}/${toolName}.`,
  };
}

export function renderMcpStatus(
  summary: McpStatusSummary = getMcpStatusSummary(),
  options: McpStatusRenderOptions = {},
): string {
  if (shouldUseHumanTtyLayout(options.renderOptions, options.layout)) {
    return renderMcpStatusTty(summary, options.renderOptions);
  }

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
    `  tool_grants: ${summary.toolGrantCount}`,
    `  stale_tool_grants: ${summary.staleToolGrantCount}`,
    `  model_tool_grants: ${summary.modelToolGrantCount}`,
    `  stale_model_tool_grants: ${summary.staleModelToolGrantCount}`,
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

function renderMcpStatusTty(
  summary: McpStatusSummary,
  renderOptions?: TerminalRenderOptions,
): string {
  const active = summary.activeProfileIds.length > 0 ? summary.activeProfileIds.join(", ") : "none";
  const blocks = [
    renderTerminalBlock({
      title: "MCP",
      subtitle: `${summary.profiles.length} profiles`,
      renderOptions,
      body: [
        formatTerminalKeyValues(
          [
            ["active", active],
            ["servers", String(summary.serverCount)],
            ["auth", String(summary.authBearingServerCount)],
            ["risky transports", String(summary.riskyTransportCount)],
          ],
          { renderOptions },
        ),
        formatTerminalKeyValues(
          [
            ["allowed tools", String(summary.policyAllowedToolCount)],
            ["denied tools", String(summary.policyDeniedToolCount)],
            ["write", String(summary.writeEnabledToolCount)],
            ["billable", String(summary.billableToolCount)],
          ],
          { renderOptions },
        ),
        formatTerminalKeyValues(
          [
            ["tool grants", String(summary.toolGrantCount)],
            ["stale", String(summary.staleToolGrantCount)],
            ["model grants", String(summary.modelToolGrantCount)],
            ["stale model", String(summary.staleModelToolGrantCount)],
          ],
          { renderOptions },
        ),
      ],
      footer: "normal inference uses direct OpenRouter REST",
    }),
    renderTerminalBlock({
      title: "profiles",
      renderOptions,
      body:
        summary.profiles.length === 0
          ? ["none"]
          : summary.profiles.map((profile) =>
              formatTerminalKeyValues(
                [
                  ["id", profile.id],
                  ["state", profile.state],
                  ["transport", profile.transport.kind],
                  ["risk", profile.riskLevel],
                  ["auth", profile.authRequired ? "yes" : "no"],
                  ["write", profile.writeCapable ? "yes" : "no"],
                  ["tools", String(profile.tools.length)],
                  ["url", profile.transport.url],
                ],
                { renderOptions },
              ),
            ),
    }),
    renderTerminalBlock({
      title: "policy",
      renderOptions,
      body: [
        formatTerminalKeyValues(
          [
            ["default denied", String(summary.configuredDeniedToolCount)],
            ["configured billable", String(summary.configuredBillableToolCount)],
            ["configured risky", String(summary.configuredRiskyToolCount)],
          ],
          { renderOptions },
        ),
        formatTerminalKeyValues(
          [
            ["registry hash", summary.registryHash],
            ["pending schema", formatSchemaChanges(summary.pendingSchemaChangeCount)],
          ],
          { renderOptions },
        ),
      ],
    }),
  ];

  return blocks.join("\n");
}

export interface FormatMcpProfileOptions {
  trustedProfileHash?: string;
  updatedAt?: string;
  schemaChangePending?: boolean;
  toolEvaluations?: McpToolPolicyEvaluation[];
  toolGrantCount?: number;
  staleToolGrantCount?: number;
  modelToolGrantCount?: number;
  staleModelToolGrantCount?: number;
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
    options.toolEvaluations
      ? options.toolEvaluations.map((evaluation) => [evaluation.toolName, evaluation])
      : profile.tools.map((tool) => [
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
    "  remote_tool_execution: explicit /mcp call or orx mcp call; /mcp model enable or orx ask --mcp-tools exposes read-only non-billable model-granted mcp_call only",
    "  normal_inference: direct OpenRouter REST API",
    `  profile_hash: ${currentHash}`,
    options.trustedProfileHash ? `  trusted_hash: ${options.trustedProfileHash}` : undefined,
    options.updatedAt ? `  updated_at: ${options.updatedAt}` : undefined,
    options.schemaChangePending
      ? "  schema_change: pending trusted baseline differs from configured profile hash"
      : undefined,
    typeof options.toolGrantCount === "number" ? `  tool_grants: ${options.toolGrantCount}` : undefined,
    typeof options.staleToolGrantCount === "number"
      ? `  stale_tool_grants: ${options.staleToolGrantCount}`
      : undefined,
    typeof options.modelToolGrantCount === "number"
      ? `  model_tool_grants: ${options.modelToolGrantCount}`
      : undefined,
    typeof options.staleModelToolGrantCount === "number"
      ? `  stale_model_tool_grants: ${options.staleModelToolGrantCount}`
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
    `  tool_grants: ${report.toolGrantCount}`,
    `  stale_tool_grants: ${report.staleToolGrantCount}`,
    `  model_tool_grants: ${report.modelToolGrantCount}`,
    `  stale_model_tool_grants: ${report.staleModelToolGrantCount}`,
    `  decisions: allowed=${counts.allowed} denied=${counts.denied} blocked_by_profile=${counts.blocked_by_profile} blocked_by_trust=${counts.blocked_by_trust} blocked_by_schema_change=${counts.blocked_by_schema_change}`,
    "  remote_tool_execution: explicit /mcp call or orx mcp call; /mcp model enable or orx ask --mcp-tools exposes read-only non-billable model-granted mcp_call only",
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
    evaluation.grantStatus ? `grant=${evaluation.grantStatus}` : undefined,
    evaluation.modelGrantStatus ? `model_grant=${evaluation.modelGrantStatus}` : undefined,
    evaluation.modelPolicyDecision ? `model_policy=${evaluation.modelPolicyDecision}` : undefined,
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

function getToolGrantStatus(
  profile: McpProfile,
  tool: McpDeclaredTool,
  context: McpToolPolicyContext,
): "active" | "stale" | undefined {
  const grant = context.toolGrant;
  if (!grant) {
    return undefined;
  }

  if (
    grant.profileId === profile.id &&
    grant.toolName === tool.name &&
    context.profileHash &&
    grant.profileHash === context.profileHash
  ) {
    return "active";
  }

  return "stale";
}

function formatGrantForEvaluation(
  toolGrant: McpToolGrantRecord | undefined,
  grantStatus: "active" | "stale" | undefined,
): Pick<McpToolPolicyEvaluation, "toolGrant" | "grantStatus"> {
  return toolGrant && grantStatus
    ? {
        toolGrant,
        grantStatus,
      }
    : {};
}

function getModelToolGrantStatus(
  profileHash: string | undefined,
  grant: McpModelToolGrantRecord | undefined,
): "active" | "stale" | undefined {
  if (!grant) {
    return undefined;
  }

  if (profileHash && grant.profileHash === profileHash) {
    return "active";
  }

  return "stale";
}

function formatModelGrantForEvaluation(
  modelToolGrant: McpModelToolGrantRecord | undefined,
  modelGrantStatus: "active" | "stale" | undefined,
): Pick<McpToolPolicyEvaluation, "modelToolGrant" | "modelGrantStatus"> {
  return modelToolGrant && modelGrantStatus
    ? {
        modelToolGrant,
        modelGrantStatus,
      }
    : {};
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

  if (source.kind === "user") {
    return [
      "user",
      source.componentPath ? `catalog_path=${source.componentPath}` : undefined,
      source.componentHash ? `profile_hash=${source.componentHash}` : undefined,
    ]
      .filter((part): part is string => typeof part === "string")
      .join(" ");
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
