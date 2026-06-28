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

  return [
    `MCP auth: ${report.profile.id}`,
    `  state: ${report.profile.state}`,
    `  auth_required: ${needsBearer ? "yes" : "no"}`,
    `  auth_status: ${authStatus}`,
    "  credential_mode: env_bearer_then_optional_macos_keychain",
    `  profile_env: ${report.profileEnvName} status=${report.profileEnvSet ? "set" : "unset"}`,
    `  fallback_env: ${report.fallbackEnvName} status=${report.fallbackEnvSet ? "set" : "unset"}`,
    `  effective_bearer: ${report.effectiveBearerConfigured ? "configured" : "missing"}`,
    `  macos_keychain: supported=${report.macosKeychainSupported ? "yes" : "no"} opt_in=${report.macosKeychainOptedIn ? "enabled" : "disabled"} status=not_checked`,
    `  tools_requiring_auth: ${report.authRequiredToolCount}`,
    `  managed_env_file: ${report.managedEnvFilePath}`,
    `  profile_hash: ${report.profileHash ?? "unknown"}`,
    report.trustedProfileHash ? `  trusted_hash: ${report.trustedProfileHash}` : undefined,
    report.schemaChangePending ? "  schema_change: pending" : undefined,
    "  oauth: not managed by ORX yet; use a provider-issued bearer or expiring MCP key only when the provider supports it",
    "  storage: env vars are not persisted; optional macOS Keychain stores bearer values only after explicit keychain setup",
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
      : `export ${report.profileEnvName}, or run orx mcp auth keychain set ${report.profile.id} and export ORX_MCP_KEYCHAIN=1`;

  return [
    `MCP auth setup: ${report.profile.id}`,
    `  auth_required: ${needsBearer ? "yes" : "no"}`,
    `  auth_status: ${authStatus}`,
    "  credential_mode: env_bearer_then_optional_macos_keychain",
    "  storage: env vars are not persisted; optional macOS Keychain stores bearer values only after explicit keychain setup",
    "  network_calls: none",
    "  subprocesses: none",
    "  config_writes: none",
    `  preferred_env: ${report.profileEnvName} status=${report.profileEnvSet ? "set" : "unset"}`,
    `  fallback_env: ${report.fallbackEnvName} status=${report.fallbackEnvSet ? "set" : "unset"}`,
    `  macos_keychain: supported=${report.macosKeychainSupported ? "yes" : "no"} opt_in=${report.macosKeychainOptedIn ? "enabled" : "disabled"} status=not_checked`,
    `  managed_env_file: ${report.managedEnvFilePath}`,
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
