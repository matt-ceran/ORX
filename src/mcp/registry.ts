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
}

const runtimeProfileStates = new Map<string, McpProfileState>();

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
      name: "providers-list",
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
      name: "chat-send",
      risk: "billable",
      authRequired: true,
      billable: true,
    },
  ],
  notes: "Disabled by default. Normal ORX inference uses the direct OpenRouter API.",
};

export function listMcpProfiles(): McpProfile[] {
  return [applyRuntimeState(OPENROUTER_MCP_PROFILE)];
}

export function getActiveMcpProfiles(): McpProfile[] {
  return listMcpProfiles().filter((profile) => profile.state === "enabled");
}

export function findMcpProfile(id: string): McpProfile | undefined {
  return listMcpProfiles().find((profile) => profile.id === id);
}

export interface McpProfileStateChange {
  ok: boolean;
  profile?: McpProfile;
  previousState?: McpProfileState;
  nextState?: McpProfileState;
  message: string;
}

export function setMcpProfileRuntimeState(
  id: string,
  state: McpProfileState,
): McpProfileStateChange {
  const profile = findMcpProfile(id);
  if (!profile) {
    return {
      ok: false,
      message: `Unknown MCP profile: ${id}`,
    };
  }

  const previousState = profile.state;
  runtimeProfileStates.set(id, state);
  const nextProfile = findMcpProfile(id);

  return {
    ok: true,
    profile: nextProfile,
    previousState,
    nextState: state,
    message:
      previousState === state
        ? `MCP profile ${id} already ${state}. Runtime state is in-process only.`
        : `MCP profile ${id} ${state}. Runtime state is in-process only.`,
  };
}

export function resetMcpProfileRuntimeState(): void {
  runtimeProfileStates.clear();
}

export function getMcpToolNames(profile: McpProfile): string[] {
  return profile.tools.map((tool) => tool.name);
}

function applyRuntimeState(profile: McpProfile): McpProfile {
  return {
    ...profile,
    state: runtimeProfileStates.get(profile.id) ?? profile.state,
    transport: {
      ...profile.transport,
    },
    tools: profile.tools.map((tool) => ({ ...tool })),
  };
}
