import {
  getActiveMcpProfiles,
  getMcpToolNames,
  listMcpProfiles,
  type McpProfile,
} from "./registry.js";
import { hashMcpProfile, hashMcpProfiles } from "./schema.js";

export interface McpStatusSummary {
  activeProfileIds: string[];
  profiles: McpProfile[];
  profileHashes: Record<string, string>;
  registryHash: string;
  serverCount: number;
  authBearingServerCount: number;
  writeEnabledToolCount: number;
  billableToolCount: number;
  configuredBillableToolCount: number;
  riskyTransportCount: number;
  pendingSchemaChangeCount: number;
}

export function getMcpStatusSummary(): McpStatusSummary {
  const profiles = listMcpProfiles();
  const activeProfiles = getActiveMcpProfiles();
  const profileHashes = Object.fromEntries(
    profiles.map((profile) => [profile.id, hashMcpProfile(profile)]),
  );

  return {
    activeProfileIds: activeProfiles.map((profile) => profile.id),
    profiles,
    profileHashes,
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
    configuredBillableToolCount: profiles.reduce(
      (count, profile) => count + profile.tools.filter((tool) => tool.billable).length,
      0,
    ),
    riskyTransportCount: activeProfiles.filter((profile) => profile.transport.kind !== "stdio").length,
    pendingSchemaChangeCount: 0,
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
    `  configured_billable_tools: ${summary.configuredBillableToolCount}`,
    `  risky_transports: ${summary.riskyTransportCount}`,
    `  registry_hash: ${summary.registryHash}`,
    `  pending_schema_changes: ${formatSchemaChanges(summary.pendingSchemaChangeCount)}`,
  ];

  for (const profile of summary.profiles) {
    lines.push(`  ${formatMcpProfile(profile, summary.profileHashes[profile.id])}`);
  }

  return lines.join("\n");
}

export function formatMcpProfile(profile: McpProfile, hash = hashMcpProfile(profile)): string {
  return [
    `profile=${profile.id}`,
    `state=${profile.state}`,
    `transport=${profile.transport.kind}`,
    profile.transport.url ? `url=${profile.transport.url}` : undefined,
    `risk=${profile.riskLevel}`,
    `auth=${profile.authRequired ? "yes" : "no"}`,
    `write=${profile.writeCapable ? "yes" : "no"}`,
    `billable_tools=${profile.tools.filter((tool) => tool.billable).length}`,
    `tools=${profile.tools.length}`,
    `hash=${hash}`,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" ");
}

export function renderMcpProfileInspect(profile: McpProfile): string {
  const lines = [
    `MCP profile: ${profile.id}`,
    `  name: ${profile.name}`,
    `  state: ${profile.state}`,
    `  transport: ${profile.transport.kind}`,
    profile.transport.url ? `  url: ${profile.transport.url}` : undefined,
    `  risk: ${profile.riskLevel}`,
    `  auth_required: ${profile.authRequired ? "yes" : "no"}`,
    `  write_capable: ${profile.writeCapable ? "yes" : "no"}`,
    `  profile_hash: ${hashMcpProfile(profile)}`,
    `  notes: ${profile.notes}`,
    "  tools:",
    ...profile.tools.map(
      (tool) =>
        `    - ${tool.name} risk=${tool.risk} auth=${tool.authRequired ? "yes" : "no"} billable=${
          tool.billable ? "yes" : "no"
        }`,
    ),
  ];

  return lines.filter((line): line is string => typeof line === "string").join("\n");
}

export function getMcpProfileToolNames(profile: McpProfile): string[] {
  return getMcpToolNames(profile);
}

function formatSchemaChanges(count: number): string {
  return count === 0 ? "none" : String(count);
}
