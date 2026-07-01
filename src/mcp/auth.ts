import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, parse, relative, resolve, sep } from "node:path";
import {
  isMcpMacosKeychainOptedIn,
  mcpBearerTokenEnvName,
  resolveMcpBearerToken,
} from "./credentials.js";
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
  macosKeychainSupported: boolean;
  macosKeychainOptedIn: boolean;
  managedEnvFilePath: string;
  authReady: boolean;
  authRequiredToolCount: number;
}

interface McpProviderAuthGuidance {
  provider: string;
  credentialSource: string;
  credentialLifetime: string;
  scopeHint: string;
  setupUrl: string;
  orxSupport: string;
  warning?: string;
}

export interface McpProfileAuthReportOptions extends McpRegistryOptions {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  authEnvDirectory?: string;
}

export interface McpAuthEnvFilePathOptions {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  authEnvDirectory?: string;
}

export interface McpAuthEnvFileInitResult {
  profile: McpProfile;
  path: string;
  profileEnvName: string;
  authRequired: boolean;
  authReady: boolean;
  created: boolean;
  existing: boolean;
  stateChanged: boolean;
  permissionsTightened: boolean;
  directoryPermissionsTightened: boolean;
  skipped: boolean;
}

export class McpAuthEnvFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpAuthEnvFileError";
  }
}

const AUTH_ENV_DIRECTORY_MODE = 0o700;
const AUTH_ENV_FILE_MODE = 0o600;

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
  const platform = process.platform;

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
    macosKeychainSupported: platform === "darwin",
    macosKeychainOptedIn: isMcpMacosKeychainOptedIn(env),
    managedEnvFilePath: resolveMcpAuthEnvFilePath(profile.id, options),
    authReady: !needsBearer || effectiveBearerConfigured,
    authRequiredToolCount,
  };
}

export function renderMcpProfileAuthReport(report: McpProfileAuthReport): string {
  const needsBearer = report.profile.authRequired || report.authRequiredToolCount > 0;
  const guidance = getMcpProviderAuthGuidance(report.profile);
  const authStatus = !needsBearer
    ? "not_required"
    : report.authReady
      ? "configured"
      : "missing";
  const nextStep = !needsBearer
    ? "no bearer token required by current local declarations"
    : report.authReady
      ? "continue with enable/trust/grant/call steps as needed"
      : `set ${report.profileEnvName}=..., ${report.fallbackEnvName}=..., or configure macOS Keychain and ORX_MCP_KEYCHAIN=1 before authenticated MCP calls`;
  const credentialMode = needsBearer ? "env_bearer_then_optional_macos_keychain" : "not_required";
  const effectiveBearer = !needsBearer
    ? "not_required"
    : report.effectiveBearerConfigured
      ? "configured"
      : "missing";
  const keychainStatus = needsBearer ? "not_checked" : "not_required";

  return [
    `MCP auth: ${report.profile.id}`,
    `  state: ${report.profile.state}`,
    `  auth_required: ${needsBearer ? "yes" : "no"}`,
    `  auth_status: ${authStatus}`,
    `  credential_mode: ${credentialMode}`,
    `  profile_env: ${report.profileEnvName} status=${report.profileEnvSet ? "set" : "unset"}`,
    `  fallback_env: ${report.fallbackEnvName} status=${report.fallbackEnvSet ? "set" : "unset"}`,
    `  effective_bearer: ${effectiveBearer}`,
    `  macos_keychain: supported=${report.macosKeychainSupported ? "yes" : "no"} opt_in=${report.macosKeychainOptedIn ? "enabled" : "disabled"} status=${keychainStatus}`,
    `  tools_requiring_auth: ${report.authRequiredToolCount}`,
    `  managed_env_file: ${report.managedEnvFilePath}`,
    `  profile_hash: ${report.profileHash ?? "unknown"}`,
    report.trustedProfileHash ? `  trusted_hash: ${report.trustedProfileHash}` : undefined,
    report.schemaChangePending ? "  schema_change: pending" : undefined,
    "  oauth: provider-managed; ORX accepts env/Keychain bearer material but does not run an OAuth browser or device flow yet",
    ...renderProviderAuthGuidance(guidance),
    "  storage: env vars are not persisted; optional macOS Keychain stores bearer values only after explicit keychain setup",
    `  next_step: ${nextStep}`,
  ].filter((line): line is string => typeof line === "string").join("\n");
}

export function renderMcpProfileAuthSetup(report: McpProfileAuthReport): string {
  const needsBearer = report.profile.authRequired || report.authRequiredToolCount > 0;
  const guidance = getMcpProviderAuthGuidance(report.profile);
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
      : `export ${report.profileEnvName}, or run orx mcp auth keychain set ${report.profile.id} and export ORX_MCP_KEYCHAIN=1`;
  const credentialMode = needsBearer ? "env_bearer_then_optional_macos_keychain" : "not_required";
  const keychainStatus = needsBearer ? "not_checked" : "not_required";

  return [
    `MCP auth setup: ${report.profile.id}`,
    `  auth_required: ${needsBearer ? "yes" : "no"}`,
    `  auth_status: ${authStatus}`,
    `  credential_mode: ${credentialMode}`,
    "  storage: env vars are not persisted; optional macOS Keychain stores bearer values only after explicit keychain setup",
    "  network_calls: none",
    "  subprocesses: none",
    "  config_writes: none",
    `  preferred_env: ${report.profileEnvName} status=${report.profileEnvSet ? "set" : "unset"}`,
    `  fallback_env: ${report.fallbackEnvName} status=${report.fallbackEnvSet ? "set" : "unset"}`,
    `  macos_keychain: supported=${report.macosKeychainSupported ? "yes" : "no"} opt_in=${report.macosKeychainOptedIn ? "enabled" : "disabled"} status=${keychainStatus}`,
    `  managed_env_file: ${report.managedEnvFilePath}`,
    ...renderProviderAuthGuidance(guidance),
    needsBearer
      ? "  token_value: never shown; paste a provider-issued bearer or expiring MCP key into your shell only"
      : "  token_value: not needed by current local declarations",
    needsBearer ? "  shell_exports:" : "  shell_exports: not required",
    needsBearer ? `    bash_zsh: ${profileExport}` : undefined,
    needsBearer ? `    fish: set -gx ${report.profileEnvName} "<bearer-token>"` : undefined,
    needsBearer ? `    powershell: $env:${report.profileEnvName} = "<bearer-token>"` : undefined,
    needsBearer ? `    fallback_bash_zsh: ${fallbackExport}` : undefined,
    needsBearer ? `  unset: unset ${report.profileEnvName}` : undefined,
    needsBearer ? `  keychain_setup: orx mcp auth keychain set ${report.profile.id}` : undefined,
    needsBearer ? "  keychain_opt_in: export ORX_MCP_KEYCHAIN=1" : undefined,
    needsBearer
      ? "  note: prefer the profile-specific env var over the fallback when multiple MCP profiles are configured"
      : "  note: add bearer setup only if this profile's local declarations later require auth",
    needsBearer
      ? `  init_env_file: orx mcp auth init ${report.profile.id}`
      : undefined,
    `  next_step: ${nextStep}`,
  ].filter((line): line is string => typeof line === "string").join("\n");
}

function renderProviderAuthGuidance(guidance: McpProviderAuthGuidance): string[] {
  return [
    `  provider_auth: ${guidance.provider}`,
    `  credential_source: ${guidance.credentialSource}`,
    `  credential_lifetime: ${guidance.credentialLifetime}`,
    `  scope_hint: ${guidance.scopeHint}`,
    `  setup_url: ${guidance.setupUrl}`,
    `  orx_support: ${guidance.orxSupport}`,
    guidance.warning ? `  provider_warning: ${guidance.warning}` : undefined,
  ].filter((line): line is string => typeof line === "string");
}

function getMcpProviderAuthGuidance(profile: McpProfile): McpProviderAuthGuidance {
  const endpoint = parseMcpProviderEndpoint(profile.transport.url);

  if (isMcpProviderEndpoint(endpoint, "mcp.openrouter.ai", "/mcp")) {
    return {
      provider: "openrouter",
      credentialSource:
        "OpenRouter MCP OAuth creates a dedicated expiring OpenRouter key for the MCP connection.",
      credentialLifetime: "provider default: 7 days for OAuth-created MCP keys",
      scopeHint: "read tools plus billable chat-send only after explicit ORX grants",
      setupUrl: "https://openrouter.ai/docs/mcp-server",
      orxSupport: "paste the provider-issued key into the profile env var, fallback env var, or opted-in macOS Keychain",
    };
  }

  if (isMcpProviderEndpoint(endpoint, "api.githubcopilot.com", "/mcp")) {
    return {
      provider: "github",
      credentialSource:
        "GitHub remote MCP uses provider OAuth or bearer/PAT material scoped to the approved GitHub access.",
      credentialLifetime: "provider managed",
      scopeHint: profile.writeCapable
        ? "high-risk/write-capable: approve only the repositories, organizations, and write scopes intentionally needed"
        : "approve only read-only repository scopes for read-only ORX profiles",
      setupUrl:
        "https://docs.github.com/en/copilot/how-tos/provide-context/use-mcp-in-your-ide/set-up-the-github-mcp-server",
      orxSupport:
        "remote OAuth must be completed with the provider; use ORX bearer env or Keychain only when you already have compatible bearer material",
      warning: profile.writeCapable
        ? "this profile is write-capable; ORX keeps write/destructive tools denied until explicit grants"
        : undefined,
    };
  }

  if (isExactMcpProviderEndpoint(endpoint, "gitlab.com", "/api/v4/mcp")) {
    return {
      provider: "gitlab",
      credentialSource:
        "GitLab hosted MCP uses OAuth/provider authorization for GitLab project access.",
      credentialLifetime: "provider managed",
      scopeHint:
        "approve read-only repository/project scopes only; do not approve CI, write, or admin scopes for read-only ORX profiles",
      setupUrl: "https://docs.gitlab.com/user/gitlab_duo/model_context_protocol/mcp_server/",
      orxSupport:
        "complete provider OAuth externally; ORX stores only bearer-compatible credentials in profile env vars or opted-in macOS Keychain",
      warning: "GitLab documents the MCP server as beta; review remote tool metadata before importing tools",
    };
  }

  if (isMcpProviderEndpoint(endpoint, "sourcegraph.com", "/mcp")) {
    return {
      provider: "sourcegraph",
      credentialSource:
        "Sourcegraph hosted MCP uses provider-issued bearer/OAuth material for code search over connected repositories.",
      credentialLifetime: "provider/token policy dependent",
      scopeHint: "grant Sourcegraph/GitHub read-only repository access only; do not approve write scopes for read-only ORX profiles",
      setupUrl: "https://sourcegraph.com/mcp",
      orxSupport:
        "complete provider auth externally; ORX stores only bearer-compatible credentials in profile env vars or opted-in macOS Keychain",
    };
  }

  if (
    isMcpProviderEndpoint(endpoint, "mcp.cloudflare.com", "/mcp") ||
    isMcpProviderEndpoint(endpoint, "docs.mcp.cloudflare.com", "/mcp") ||
    isMcpProviderEndpoint(endpoint, "browser.mcp.cloudflare.com", "/mcp")
  ) {
    return {
      provider: "cloudflare",
      credentialSource:
        "Cloudflare hosted MCP supports OAuth-style authorization; use least-privilege Cloudflare account credentials or tokens.",
      credentialLifetime: "provider/token policy dependent",
      scopeHint: profile.writeCapable
        ? "high-risk/write-capable: grant only reviewed tools and account scopes"
        : "prefer docs/read-only scopes where available",
      setupUrl: "https://github.com/cloudflare/mcp",
      orxSupport: "store only bearer-compatible credentials in env or opted-in Keychain; keep grants explicit",
      warning: profile.writeCapable
        ? "this profile is write-capable; ORX keeps write/destructive tools denied until explicit grants"
        : undefined,
    };
  }

  if (isMcpProviderEndpoint(endpoint, "mcp.figma.com", "/mcp")) {
    return {
      provider: "figma",
      credentialSource: "Figma remote MCP uses provider OAuth for Figma file access.",
      credentialLifetime: "provider managed",
      scopeHint: "design-file access can expose or modify workspace content; review tools before grants",
      setupUrl: "https://developers.figma.com/docs/figma-mcp-server/remote-server-installation/",
      orxSupport:
        "complete provider OAuth externally; ORX bearer env/Keychain works only if the provider exposes compatible bearer material",
      warning:
        "Figma documents a supported client catalog; do not put Figma personal access tokens in ORX config or prompts",
    };
  }

  if (isMcpProviderEndpoint(endpoint, "mcp.sentry.dev", "/mcp")) {
    return {
      provider: "sentry",
      credentialSource: "Sentry hosted MCP uses OAuth-style provider authorization for organization/project access.",
      credentialLifetime: "provider managed",
      scopeHint: "prefer read-only debugging scopes unless you explicitly add write-capable tools",
      setupUrl: "https://mcp.sentry.dev/",
      orxSupport:
        "complete provider OAuth externally; ORX bearer env/Keychain works only if the provider exposes compatible bearer material",
    };
  }

  if (isMcpProviderEndpoint(endpoint, "mcp.context7.com", "/mcp")) {
    return {
      provider: "context7",
      credentialSource:
        "Context7 basic hosted docs lookup is no-auth; higher-rate or account features may use a provider API key.",
      credentialLifetime: "provider/token policy dependent",
      scopeHint: "docs lookup should stay read-only and non-billable unless declarations change",
      setupUrl: "https://context7.com/docs",
      orxSupport: "no ORX credential is needed for current no-auth declarations; use profile env only if auth is later required",
    };
  }

  if (isMcpProviderEndpoint(endpoint, "learn.microsoft.com", "/api/mcp")) {
    return {
      provider: "microsoft-learn",
      credentialSource: "Microsoft Learn hosted docs MCP is no-auth in the built-in preset.",
      credentialLifetime: "not applicable for current declarations",
      scopeHint: "read-only docs and code sample lookup",
      setupUrl: "https://learn.microsoft.com/api/mcp",
      orxSupport: "no ORX credential is needed unless local declarations later require auth",
    };
  }

  return {
    provider: "generic",
    credentialSource: "provider-issued bearer token, OAuth session token, or expiring MCP key when supported",
    credentialLifetime: "provider/token policy dependent",
    scopeHint: "use the narrowest read-only scopes possible before declaring risky tools",
    setupUrl: profile.transport.url ?? "unknown",
    orxSupport: "store bearer-compatible values only in env vars or opted-in macOS Keychain",
  };
}

function parseMcpProviderEndpoint(url: string | undefined): URL | undefined {
  if (!url) {
    return undefined;
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

function isMcpProviderEndpoint(
  endpoint: URL | undefined,
  hostname: string,
  pathPrefix: string,
): boolean {
  if (!endpoint || endpoint.hostname.toLowerCase() !== hostname) {
    return false;
  }

  const normalizedPath = endpoint.pathname.replace(/\/+$/g, "") || "/";
  const normalizedPrefix = pathPrefix.replace(/\/+$/g, "") || "/";
  return normalizedPath === normalizedPrefix || normalizedPath.startsWith(`${normalizedPrefix}/`);
}

function isExactMcpProviderEndpoint(
  endpoint: URL | undefined,
  hostname: string,
  path: string,
): boolean {
  if (!endpoint || endpoint.hostname.toLowerCase() !== hostname) {
    return false;
  }

  const normalizedPath = endpoint.pathname.replace(/\/+$/g, "") || "/";
  const normalizedExpectedPath = path.replace(/\/+$/g, "") || "/";
  return normalizedPath === normalizedExpectedPath;
}

export function defaultMcpAuthEnvDirectory(): string {
  return join(homedir(), ".orx", "mcp", "auth-env");
}

export function resolveMcpAuthEnvDirectory(options: McpAuthEnvFilePathOptions = {}): string {
  const explicitPath = options.authEnvDirectory ?? options.env?.ORX_MCP_AUTH_ENV_DIR;
  if (!explicitPath) {
    return defaultMcpAuthEnvDirectory();
  }

  return resolve(options.cwd ?? process.cwd(), explicitPath);
}

export function resolveMcpAuthEnvFilePath(
  profileId: string,
  options: McpAuthEnvFilePathOptions = {},
): string {
  return join(resolveMcpAuthEnvDirectory(options), `${mcpAuthEnvFileSlug(profileId)}.env`);
}

export function initializeMcpAuthEnvFile(
  report: McpProfileAuthReport,
  options: McpAuthEnvFilePathOptions = {},
): McpAuthEnvFileInitResult {
  const authRequired = report.profile.authRequired || report.authRequiredToolCount > 0;
  const path = resolveMcpAuthEnvFilePath(report.profile.id, options);
  if (!authRequired) {
    return {
      profile: report.profile,
      path,
      profileEnvName: report.profileEnvName,
      authRequired,
      authReady: report.authReady,
      created: false,
      existing: false,
      stateChanged: false,
      permissionsTightened: false,
      directoryPermissionsTightened: false,
      skipped: true,
    };
  }

  assertNoSymlinkInParentPath(path);
  const directory = dirname(path);
  const directoryPermissionsTightened = existingDirectoryNeedsTightening(directory);
  mkdirSync(directory, {
    recursive: true,
    mode: AUTH_ENV_DIRECTORY_MODE,
  });
  chmodSync(directory, AUTH_ENV_DIRECTORY_MODE);

  if (existsSync(path)) {
    const existing = lstatSync(path);
    if (existing.isSymbolicLink()) {
      throw new McpAuthEnvFileError("MCP auth env file path must not be a symlink.");
    }
    if (!existing.isFile()) {
      throw new McpAuthEnvFileError("MCP auth env file path already exists and is not a regular file.");
    }
    const permissionsTightened = (existing.mode & 0o777) !== AUTH_ENV_FILE_MODE;
    chmodSync(path, AUTH_ENV_FILE_MODE);
    const stateChanged = permissionsTightened || directoryPermissionsTightened;
    return {
      profile: report.profile,
      path,
      profileEnvName: report.profileEnvName,
      authRequired,
      authReady: report.authReady,
      created: false,
      existing: true,
      stateChanged,
      permissionsTightened,
      directoryPermissionsTightened,
      skipped: false,
    };
  }

  writeFileSync(path, renderMcpAuthEnvFileTemplate(report, path), {
    encoding: "utf8",
    mode: AUTH_ENV_FILE_MODE,
    flag: "wx",
  });
  chmodSync(path, AUTH_ENV_FILE_MODE);

  return {
    profile: report.profile,
    path,
    profileEnvName: report.profileEnvName,
    authRequired,
    authReady: report.authReady,
    created: true,
    existing: false,
    stateChanged: true,
    permissionsTightened: false,
    directoryPermissionsTightened,
    skipped: false,
  };
}

export function renderMcpAuthEnvFileInitResult(
  result: McpAuthEnvFileInitResult,
): string {
  return [
    `MCP auth env file: ${result.profile.id}`,
    `  auth_required: ${result.authRequired ? "yes" : "no"}`,
    `  auth_status: ${!result.authRequired ? "not_required" : result.authReady ? "configured" : "missing"}`,
    `  state_changed: ${result.stateChanged ? "yes" : "no"}`,
    `  file_created: ${result.created ? "yes" : "no"}`,
    `  existing_file: ${result.existing ? "yes" : "no"}`,
    `  permissions_tightened: ${result.permissionsTightened ? "yes" : "no"}`,
    `  directory_permissions_tightened: ${result.directoryPermissionsTightened ? "yes" : "no"}`,
    `  skipped: ${result.skipped ? "yes" : "no"}`,
    `  path: ${result.path}`,
    `  credential_mode: env_file_template`,
    `  token_value: ${result.authRequired ? "not written; edit the commented export locally" : "not needed by current local declarations"}`,
    "  network_calls: none",
    "  subprocesses: none",
    result.authRequired ? "  config_writes: auth_env_file_only" : "  config_writes: none",
    result.authRequired ? "  file_mode: 0600" : undefined,
    result.authRequired ? "  directory_mode: 0700" : undefined,
    result.authRequired ? "  shell_source:" : "  shell_source: not required",
    result.authRequired ? `    bash_zsh: source ${shellQuote(result.path)}` : undefined,
    result.authRequired ? `    fish: source ${shellQuote(result.path)}` : undefined,
    result.authRequired
      ? `  next_step: edit ${result.profileEnvName} in the file, source it, then run orx mcp auth ${result.profile.id}`
      : "  next_step: no bearer env file is required unless this profile later declares auth",
  ].filter((line): line is string => typeof line === "string").join("\n");
}

function hasEnvValue(env: NodeJS.ProcessEnv, name: string): boolean {
  return typeof env[name] === "string" && env[name]!.trim().length > 0;
}

function renderMcpAuthEnvFileTemplate(
  report: McpProfileAuthReport,
  path: string,
): string {
  return [
    `# ORX MCP auth env template for ${report.profile.id}`,
    "#",
    "# Replace the placeholder below with a provider-issued bearer or expiring MCP key,",
    "# then remove the leading '# ' from the export line and source this file.",
    "#",
    `# Source with: source ${shellQuote(path)}`,
    "# ORX does not read this file automatically or store this token in config.",
    "",
    `# export ${report.profileEnvName}="<bearer-token>"`,
    "",
  ].join("\n");
}

function mcpAuthEnvFileSlug(profileId: string): string {
  return mcpBearerTokenEnvName(profileId)
    .replace(/^ORX_MCP_BEARER_/, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "") || "profile";
}

function assertNoSymlinkInParentPath(path: string): void {
  const parentDir = resolve(dirname(path));
  const root = parse(parentDir).root;
  const components = relative(root, parentDir).split(sep).filter(Boolean);
  let current = root;

  for (let index = 0; index < components.length; index += 1) {
    current = join(current, components[index]);
    if (!existsSync(current)) {
      return;
    }

    const stat = lstatSync(current);
    const isTopLevelPosixComponent = root === sep && index === 0;
    if (isTopLevelPosixComponent && stat.isSymbolicLink()) {
      continue;
    }
    if (stat.isSymbolicLink()) {
      throw new McpAuthEnvFileError("MCP auth env file parent path must not contain symlinks.");
    }
    if (!stat.isDirectory()) {
      throw new McpAuthEnvFileError("MCP auth env file parent path must be a directory.");
    }
  }
}

function existingDirectoryNeedsTightening(path: string): boolean {
  if (!existsSync(path)) {
    return false;
  }
  const stat = lstatSync(path);
  if (!stat.isDirectory()) {
    return false;
  }
  return (stat.mode & 0o777) !== AUTH_ENV_DIRECTORY_MODE;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
