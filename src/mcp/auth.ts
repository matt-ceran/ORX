import { mcpBearerTokenEnvName, resolveMcpBearerToken } from "./call.js";
import { getMcpStatusSummary } from "./policy.js";
import type { McpProfile, McpRegistryOptions } from "./registry.js";

export interface McpProfileAuthReport {
  profile: McpProfile;
  profileHash?: string;
  trustedProfileHash?: string;
  schemaChangePending: boolean;
  profileEnvName: string;
  fallbackEnvName: "ORX_MCP_BEARER_TOKEN";
  profileEnvSet: boolean;
  fallbackEnvSet: boolean;
  effectiveBearerConfigured: boolean;
  authReady: boolean;
  authRequiredToolCount: number;
}

export interface McpProfileAuthReportOptions extends McpRegistryOptions {
  env?: NodeJS.ProcessEnv;
}

export function getMcpProfileAuthReport(
  profileId: string,
  options: McpProfileAuthReportOptions = {},
): McpProfileAuthReport | undefined {
  const summary = getMcpStatusSummary(options);
  const profile = summary.profiles.find((candidate) => candidate.id === profileId);
  if (!profile) {
    return undefined;
  }

  const env = options.env ?? process.env;
  const profileEnvName = mcpBearerTokenEnvName(profile.id);
  const profileEnvSet = hasEnvValue(env, profileEnvName);
  const fallbackEnvSet = hasEnvValue(env, "ORX_MCP_BEARER_TOKEN");
  const effectiveBearerConfigured = Boolean(resolveMcpBearerToken(profile.id, env));
  const authRequiredToolCount = profile.tools.filter((tool) => tool.authRequired).length;
  const needsBearer = profile.authRequired || authRequiredToolCount > 0;

  return {
    profile,
    profileHash: summary.profileHashes[profile.id],
    trustedProfileHash: summary.trustedProfileHashes[profile.id],
    schemaChangePending: summary.pendingSchemaChangeProfileIds.includes(profile.id),
    profileEnvName,
    fallbackEnvName: "ORX_MCP_BEARER_TOKEN",
    profileEnvSet,
    fallbackEnvSet,
    effectiveBearerConfigured,
    authReady: !needsBearer || effectiveBearerConfigured,
    authRequiredToolCount,
  };
}

export function renderMcpProfileAuthReport(report: McpProfileAuthReport): string {
  const needsBearer = report.profile.authRequired || report.authRequiredToolCount > 0;
  const authStatus = !needsBearer
    ? "not_required"
    : report.authReady
      ? "configured"
      : "missing";
  const nextStep = !needsBearer
    ? "no bearer token required by current local declarations"
    : report.authReady
      ? "continue with enable/trust/grant/call steps as needed"
      : `set ${report.profileEnvName}=... or ${report.fallbackEnvName}=... in the shell before authenticated MCP calls`;

  return [
    `MCP auth: ${report.profile.id}`,
    `  state: ${report.profile.state}`,
    `  auth_required: ${needsBearer ? "yes" : "no"}`,
    `  auth_status: ${authStatus}`,
    "  credential_mode: env_only_bearer",
    `  profile_env: ${report.profileEnvName} status=${report.profileEnvSet ? "set" : "unset"}`,
    `  fallback_env: ${report.fallbackEnvName} status=${report.fallbackEnvSet ? "set" : "unset"}`,
    `  effective_bearer: ${report.effectiveBearerConfigured ? "configured" : "missing"}`,
    `  tools_requiring_auth: ${report.authRequiredToolCount}`,
    `  profile_hash: ${report.profileHash ?? "unknown"}`,
    report.trustedProfileHash ? `  trusted_hash: ${report.trustedProfileHash}` : undefined,
    report.schemaChangePending ? "  schema_change: pending" : undefined,
    "  oauth: not managed by ORX yet; use a provider-issued bearer or expiring MCP key only when the provider supports it",
    "  storage: ORX does not persist MCP bearer token values",
    `  next_step: ${nextStep}`,
  ].filter((line): line is string => typeof line === "string").join("\n");
}

export function renderMcpProfileAuthSetup(report: McpProfileAuthReport): string {
  const needsBearer = report.profile.authRequired || report.authRequiredToolCount > 0;
  const authStatus = !needsBearer
    ? "not_required"
    : report.authReady
      ? "configured"
      : "missing";
  const profileExport = `export ${report.profileEnvName}="<bearer-token>"`;
  const fallbackExport = `export ${report.fallbackEnvName}="<bearer-token>"`;
  const nextStep = !needsBearer
    ? "no bearer token setup is required by current local declarations"
    : report.authReady
      ? `run orx mcp enable ${report.profile.id}, trust/grant as needed, then call tools explicitly`
      : `export ${report.profileEnvName}, then run orx mcp auth ${report.profile.id}`;

  return [
    `MCP auth setup: ${report.profile.id}`,
    `  auth_required: ${needsBearer ? "yes" : "no"}`,
    `  auth_status: ${authStatus}`,
    "  credential_mode: env_only_bearer",
    "  storage: ORX does not persist MCP bearer token values",
    "  network_calls: none",
    "  subprocesses: none",
    "  config_writes: none",
    `  preferred_env: ${report.profileEnvName} status=${report.profileEnvSet ? "set" : "unset"}`,
    `  fallback_env: ${report.fallbackEnvName} status=${report.fallbackEnvSet ? "set" : "unset"}`,
    needsBearer
      ? "  token_value: never shown; paste a provider-issued bearer or expiring MCP key into your shell only"
      : "  token_value: not needed by current local declarations",
    needsBearer ? "  shell_exports:" : "  shell_exports: not required",
    needsBearer ? `    bash_zsh: ${profileExport}` : undefined,
    needsBearer ? `    fish: set -gx ${report.profileEnvName} "<bearer-token>"` : undefined,
    needsBearer ? `    powershell: $env:${report.profileEnvName} = "<bearer-token>"` : undefined,
    needsBearer ? `    fallback_bash_zsh: ${fallbackExport}` : undefined,
    needsBearer ? `  unset: unset ${report.profileEnvName}` : undefined,
    needsBearer
      ? "  note: prefer the profile-specific env var over the fallback when multiple MCP profiles are configured"
      : "  note: add bearer setup only if this profile's local declarations later require auth",
    `  next_step: ${nextStep}`,
  ].filter((line): line is string => typeof line === "string").join("\n");
}

function hasEnvValue(env: NodeJS.ProcessEnv, name: string): boolean {
  return typeof env[name] === "string" && env[name]!.trim().length > 0;
}
