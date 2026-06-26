import { getActiveMcpProfiles, listMcpProfiles, type McpProfile } from "./registry.js";

export interface McpStatusSummary {
  activeProfileIds: string[];
  profiles: McpProfile[];
  serverCount: number;
  authBearingServerCount: number;
  writeEnabledToolCount: number;
  riskyTransportCount: number;
}

export function getMcpStatusSummary(): McpStatusSummary {
  const profiles = listMcpProfiles();
  const activeProfiles = getActiveMcpProfiles();

  return {
    activeProfileIds: activeProfiles.map((profile) => profile.id),
    profiles,
    serverCount: activeProfiles.length,
    authBearingServerCount: activeProfiles.filter((profile) => profile.authRequired).length,
    writeEnabledToolCount: activeProfiles
      .filter((profile) => profile.writeCapable)
      .reduce((count, profile) => count + profile.toolNames.length, 0),
    riskyTransportCount: activeProfiles.filter((profile) => profile.transport.kind !== "stdio").length,
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
    `  risky_transports: ${summary.riskyTransportCount}`,
  ];

  for (const profile of summary.profiles) {
    lines.push(`  ${formatMcpProfile(profile)}`);
  }

  return lines.join("\n");
}

export function formatMcpProfile(profile: McpProfile): string {
  return [
    `profile=${profile.id}`,
    `state=${profile.state}`,
    `transport=${profile.transport.kind}`,
    profile.transport.url ? `url=${profile.transport.url}` : undefined,
    `risk=${profile.riskLevel}`,
    `auth=${profile.authRequired ? "yes" : "no"}`,
    `write=${profile.writeCapable ? "yes" : "no"}`,
    `tools=${profile.toolNames.length}`,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" ");
}
