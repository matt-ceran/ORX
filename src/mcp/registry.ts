export type McpTransportKind = "remote-http" | "stdio";
export type McpProfileState = "disabled" | "enabled";
export type McpRiskLevel = "low" | "medium" | "high";

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
  toolNames: string[];
  notes: string;
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
  toolNames: [
    "models-list",
    "credits-get",
    "generation-get",
    "providers-list",
    "benchmarks",
    "docs-search",
    "chat-send",
  ],
  notes: "Disabled by default. Normal ORX inference uses the direct OpenRouter API.",
};

export function listMcpProfiles(): McpProfile[] {
  return [OPENROUTER_MCP_PROFILE];
}

export function getActiveMcpProfiles(): McpProfile[] {
  return listMcpProfiles().filter((profile) => profile.state === "enabled");
}

export function findMcpProfile(id: string): McpProfile | undefined {
  return listMcpProfiles().find((profile) => profile.id === id);
}
