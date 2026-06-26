import {
  getActiveMcpProfiles,
  getMcpToolNames,
  listMcpProfiles,
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
  configuredBillableToolCount: number;
  riskyTransportCount: number;
  pendingSchemaChangeCount: number;
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
    configuredBillableToolCount: profiles.reduce(
      (count, profile) => count + profile.tools.filter((tool) => tool.billable).length,
      0,
    ),
    riskyTransportCount: activeProfiles.filter((profile) => profile.transport.kind !== "stdio").length,
    pendingSchemaChangeCount: pendingSchemaChangeProfileIds.length,
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
    `risk=${profile.riskLevel}`,
    `auth=${profile.authRequired ? "yes" : "no"}`,
    `write=${profile.writeCapable ? "yes" : "no"}`,
    `billable_tools=${profile.tools.filter((tool) => tool.billable).length}`,
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
  const lines = [
    `MCP profile: ${profile.id}`,
    `  name: ${profile.name}`,
    `  state: ${profile.state}`,
    `  transport: ${profile.transport.kind}`,
    profile.transport.url ? `  url: ${profile.transport.url}` : undefined,
    `  risk: ${profile.riskLevel}`,
    `  auth_required: ${profile.authRequired ? "yes" : "no"}`,
    `  write_capable: ${profile.writeCapable ? "yes" : "no"}`,
    `  profile_hash: ${currentHash}`,
    options.trustedProfileHash ? `  trusted_hash: ${options.trustedProfileHash}` : undefined,
    options.updatedAt ? `  updated_at: ${options.updatedAt}` : undefined,
    options.schemaChangePending
      ? "  schema_change: pending trusted baseline differs from configured profile hash"
      : undefined,
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
