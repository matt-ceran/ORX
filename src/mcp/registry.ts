import {
  loadMcpProfilesConfig,
  saveMcpProfilesConfig,
  type McpProfilesConfig,
} from "./config.js";
import { hashMcpProfile } from "./schema.js";
import { discoverEnabledPluginMcpProfiles } from "../plugins/mcp-presets.js";

export type McpTransportKind = "remote-http" | "stdio";
export type McpProfileState = "disabled" | "enabled";
export type McpRiskLevel = "low" | "medium" | "high";
export type McpToolRisk = "read" | "write" | "destructive" | "billable";

export interface McpDeclaredTool {
  name: string;
  risk: McpToolRisk;
  authRequired: boolean;
  billable: boolean;
}

export interface McpProfileSource {
  kind: "builtin" | "plugin";
  pluginId?: string;
  manifestHash?: string;
  componentPath?: string;
  componentHash?: string;
}

export interface McpProfile {
  id: string;
  name: string;
  state: McpProfileState;
  transport: {
    kind: McpTransportKind;
    url?: string;
  };
  riskLevel: McpRiskLevel;
  authRequired: boolean;
  writeCapable: boolean;
  tools: McpDeclaredTool[];
  notes: string;
  source?: McpProfileSource;
}

export interface McpRegistryOptions {
  config?: McpProfilesConfig;
  configPath?: string;
  pluginRegistryPath?: string;
}

export const OPENROUTER_MCP_PROFILE: McpProfile = {
  id: "openrouter",
  name: "OpenRouter MCP",
  state: "disabled",
  transport: {
    kind: "remote-http",
    url: "https://mcp.openrouter.ai/mcp",
  },
  riskLevel: "medium",
  authRequired: true,
  writeCapable: false,
  tools: [
    {
      name: "models-list",
      risk: "read",
      authRequired: true,
      billable: false,
    },
    {
      name: "model-get",
      risk: "read",
      authRequired: true,
      billable: false,
    },
    {
      name: "model-endpoints",
      risk: "read",
      authRequired: true,
      billable: false,
    },
    {
      name: "providers-list",
      risk: "read",
      authRequired: true,
      billable: false,
    },
    {
      name: "rankings-daily",
      risk: "read",
      authRequired: true,
      billable: false,
    },
    {
      name: "app-rankings",
      risk: "read",
      authRequired: true,
      billable: false,
    },
    {
      name: "credits-get",
      risk: "read",
      authRequired: true,
      billable: false,
    },
    {
      name: "generation-get",
      risk: "read",
      authRequired: true,
      billable: false,
    },
    {
      name: "benchmarks",
      risk: "read",
      authRequired: true,
      billable: false,
    },
    {
      name: "docs-search",
      risk: "read",
      authRequired: true,
      billable: false,
    },
    {
      name: "view-skill",
      risk: "read",
      authRequired: true,
      billable: false,
    },
    {
      name: "ping",
      risk: "read",
      authRequired: true,
      billable: false,
    },
    {
      name: "chat-send",
      risk: "billable",
      authRequired: true,
      billable: true,
    },
  ],
  notes:
    "Disabled by default. Uses remote HTTP with OpenRouter OAuth or dedicated expiring MCP keys. Normal ORX inference uses the direct OpenRouter API.",
};

export function listMcpProfiles(options: McpRegistryOptions = {}): McpProfile[] {
  const config = options.config ?? loadMcpProfilesConfig({ configPath: options.configPath });
  return getConfiguredMcpProfiles(options).map((profile) => applyPersistedState(profile, config));
}

export function getActiveMcpProfiles(options: McpRegistryOptions = {}): McpProfile[] {
  return listMcpProfiles(options).filter((profile) => profile.state === "enabled");
}

export function findMcpProfile(id: string, options: McpRegistryOptions = {}): McpProfile | undefined {
  return listMcpProfiles(options).find((profile) => profile.id === id);
}

export interface McpProfileStateChange {
  ok: boolean;
  profile?: McpProfile;
  previousState?: McpProfileState;
  nextState?: McpProfileState;
  trustedProfileHash?: string;
  updatedAt?: string;
  message: string;
}

export function setMcpProfilePersistentState(
  id: string,
  state: McpProfileState,
  options: McpRegistryOptions & { now?: () => Date } = {},
): McpProfileStateChange {
  const config = options.config ?? loadMcpProfilesConfig({ configPath: options.configPath });
  const configuredProfile = getConfiguredMcpProfile(id, options);
  if (!configuredProfile) {
    return {
      ok: false,
      message: `Unknown MCP profile: ${id}`,
    };
  }

  const profile = applyPersistedState(configuredProfile, config);
  const previousState = profile.state;
  const currentHash = hashMcpProfile(configuredProfile);
  const previousRecord = config.profiles[id];
  const trustedProfileHash = state === "enabled" ? currentHash : previousRecord?.trustedProfileHash;
  const updatedAt = (options.now?.() ?? new Date()).toISOString();

  config.profiles[id] = {
    id,
    state,
    trustedProfileHash,
    updatedAt,
  };
  saveMcpProfilesConfig(config, { configPath: options.configPath });

  const nextProfile = applyPersistedState(configuredProfile, config);

  return {
    ok: true,
    profile: nextProfile,
    previousState,
    nextState: state,
    trustedProfileHash,
    updatedAt,
    message:
      previousState === state
        ? `MCP profile ${id} already ${state}. Persisted profile state updated.`
        : `MCP profile ${id} ${state}. Persisted profile state updated.`,
  };
}

export function setMcpProfileRuntimeState(
  id: string,
  state: McpProfileState,
  options: McpRegistryOptions & { now?: () => Date } = {},
): McpProfileStateChange {
  return setMcpProfilePersistentState(id, state, options);
}

export function resetMcpProfileRuntimeState(): void {
  // Runtime-only MCP profile state was replaced by explicit persisted profile config.
}

export function getMcpToolNames(profile: McpProfile): string[] {
  return profile.tools.map((tool) => tool.name);
}

function getConfiguredMcpProfile(
  id: string,
  options: Pick<McpRegistryOptions, "pluginRegistryPath"> = {},
): McpProfile | undefined {
  return getConfiguredMcpProfiles(options).find((profile) => profile.id === id);
}

function getConfiguredMcpProfiles(
  options: Pick<McpRegistryOptions, "pluginRegistryPath"> = {},
): McpProfile[] {
  if (!options.pluginRegistryPath) {
    return [OPENROUTER_MCP_PROFILE];
  }

  return [
    OPENROUTER_MCP_PROFILE,
    ...discoverEnabledPluginMcpProfiles({ registryPath: options.pluginRegistryPath }).profiles,
  ];
}

function applyPersistedState(profile: McpProfile, config: McpProfilesConfig): McpProfile {
  return {
    ...profile,
    state: config.profiles[profile.id]?.state ?? profile.state,
    transport: {
      ...profile.transport,
    },
    tools: profile.tools.map((tool) => ({ ...tool })),
    source: profile.source ? { ...profile.source } : undefined,
  };
}
