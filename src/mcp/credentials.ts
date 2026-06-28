import { spawn } from "node:child_process";

export type McpBearerCredentialSource =
  | "profile_env"
  | "fallback_env"
  | "macos_keychain"
  | "none";

export interface McpBearerCredentialResolution {
  token?: string;
  source: McpBearerCredentialSource;
  keychainAttempted: boolean;
  keychainStatus?: McpMacosKeychainStatus;
}

export type McpMacosKeychainStatus =
  | "configured"
  | "missing"
  | "unsupported"
  | "disabled"
  | "error";

export type McpMacosKeychainAction = "status" | "set" | "delete" | "read";

export interface McpMacosKeychainReference {
  service: string;
  account: string;
  label: string;
}

export interface McpMacosKeychainCommandResult {
  code: number;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
}

export interface McpMacosKeychainCommandOptions {
  stdio: "capture" | "inherit";
  timeoutMs: number;
}

export type McpMacosKeychainCommandRunner = (
  args: string[],
  options: McpMacosKeychainCommandOptions,
) => Promise<McpMacosKeychainCommandResult>;

export interface McpMacosKeychainOptions {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  runner?: McpMacosKeychainCommandRunner;
  timeoutMs?: number;
}

export interface McpMacosKeychainResult {
  profileId: string;
  action: McpMacosKeychainAction;
  ok: boolean;
  status: McpMacosKeychainStatus;
  stateChanged: boolean;
  tokenConfigured: boolean;
  keychain: McpMacosKeychainReference;
  command: string;
  message: string;
}

export interface McpBearerCredentialOptions extends McpMacosKeychainOptions {
  keychain?: boolean;
}

const MCP_KEYCHAIN_SERVICE = "orx.mcp.bearer";
const SECURITY_PATH = "/usr/bin/security";
const DEFAULT_KEYCHAIN_TIMEOUT_MS = 30_000;

export function resolveMcpBearerToken(
  profileId: string,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  return resolveMcpBearerTokenFromEnv(profileId, env).token;
}

export async function resolveMcpBearerCredential(
  profileId: string,
  options: McpBearerCredentialOptions = {},
): Promise<McpBearerCredentialResolution> {
  const env = options.env ?? process.env;
  const envCredential = resolveMcpBearerTokenFromEnv(profileId, env);
  if (envCredential.token) {
    return {
      token: envCredential.token,
      source: envCredential.source,
      keychainAttempted: false,
    };
  }

  if (!shouldUseMcpMacosKeychain(options)) {
    return {
      source: "none",
      keychainAttempted: false,
      keychainStatus: keychainSupported(options) ? "disabled" : "unsupported",
    };
  }

  const result = await readMcpMacosKeychainBearerToken(profileId, options);
  return {
    token: result.token,
    source: result.token ? "macos_keychain" : "none",
    keychainAttempted: true,
    keychainStatus: result.status,
  };
}

export function mcpBearerTokenEnvName(profileId: string): string {
  const suffix = profileId
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `ORX_MCP_BEARER_${suffix || "PROFILE"}`;
}

export function getMcpMacosKeychainReference(profileId: string): McpMacosKeychainReference {
  return {
    service: MCP_KEYCHAIN_SERVICE,
    account: profileId,
    label: `ORX MCP bearer: ${profileId}`,
  };
}

export function isMcpMacosKeychainOptedIn(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ORX_MCP_KEYCHAIN === "1";
}

export async function getMcpMacosKeychainStatus(
  profileId: string,
  options: McpMacosKeychainOptions = {},
): Promise<McpMacosKeychainResult> {
  const keychain = getMcpMacosKeychainReference(profileId);
  const commandArgs = ["find-generic-password", "-a", keychain.account, "-s", keychain.service];
  const unsupported = unsupportedKeychainResult(profileId, "status", commandArgs, options);
  if (unsupported) {
    return unsupported;
  }

  const result = await runMcpMacosKeychainCommand(commandArgs, options, "capture");
  if (result.code === 0) {
    return {
      profileId,
      action: "status",
      ok: true,
      status: "configured",
      stateChanged: false,
      tokenConfigured: true,
      keychain,
      command: formatSecurityCommand(commandArgs),
      message: "A macOS Keychain item is configured for this MCP profile.",
    };
  }

  const missing = isKeychainMissing(result);
  return {
    profileId,
    action: "status",
    ok: missing,
    status: missing ? "missing" : "error",
    stateChanged: false,
    tokenConfigured: false,
    keychain,
    command: formatSecurityCommand(commandArgs),
    message: missing
      ? "No macOS Keychain item is configured for this MCP profile."
      : "Unable to inspect the macOS Keychain item for this MCP profile.",
  };
}

export async function setMcpMacosKeychainBearerPrompt(
  profileId: string,
  options: McpMacosKeychainOptions = {},
): Promise<McpMacosKeychainResult> {
  const keychain = getMcpMacosKeychainReference(profileId);
  const commandArgs = [
    "add-generic-password",
    "-U",
    "-a",
    keychain.account,
    "-s",
    keychain.service,
    "-l",
    keychain.label,
    "-j",
    "ORX managed MCP bearer token. Token value is stored in macOS Keychain.",
    "-T",
    "",
    "-w",
  ];
  const unsupported = unsupportedKeychainResult(profileId, "set", commandArgs, options);
  if (unsupported) {
    return unsupported;
  }

  const result = await runMcpMacosKeychainCommand(commandArgs, options, "inherit");
  return {
    profileId,
    action: "set",
    ok: result.code === 0,
    status: result.code === 0 ? "configured" : "error",
    stateChanged: result.code === 0,
    tokenConfigured: result.code === 0,
    keychain,
    command: formatSecurityCommand(commandArgs),
    message: result.code === 0
      ? "macOS Keychain item was stored or updated for this MCP profile."
      : "Unable to store the macOS Keychain item for this MCP profile.",
  };
}

export async function deleteMcpMacosKeychainBearer(
  profileId: string,
  options: McpMacosKeychainOptions = {},
): Promise<McpMacosKeychainResult> {
  const keychain = getMcpMacosKeychainReference(profileId);
  const commandArgs = ["delete-generic-password", "-a", keychain.account, "-s", keychain.service];
  const unsupported = unsupportedKeychainResult(profileId, "delete", commandArgs, options);
  if (unsupported) {
    return unsupported;
  }

  const result = await runMcpMacosKeychainCommand(commandArgs, options, "capture");
  if (result.code === 0) {
    return {
      profileId,
      action: "delete",
      ok: true,
      status: "missing",
      stateChanged: true,
      tokenConfigured: false,
      keychain,
      command: formatSecurityCommand(commandArgs),
      message: "macOS Keychain item was deleted for this MCP profile.",
    };
  }

  const missing = isKeychainMissing(result);
  return {
    profileId,
    action: "delete",
    ok: missing,
    status: missing ? "missing" : "error",
    stateChanged: false,
    tokenConfigured: false,
    keychain,
    command: formatSecurityCommand(commandArgs),
    message: missing
      ? "No macOS Keychain item existed for this MCP profile."
      : "Unable to delete the macOS Keychain item for this MCP profile.",
  };
}

export function renderMcpMacosKeychainResult(result: McpMacosKeychainResult): string {
  const nextStep = result.action === "set" && result.ok
    ? `export ORX_MCP_KEYCHAIN=1, then run orx mcp auth ${result.profileId}`
    : result.action === "status" && result.status === "missing"
      ? `run orx mcp auth keychain set ${result.profileId}`
      : result.action === "delete"
        ? `unset ORX_MCP_KEYCHAIN if this was the only keychain-backed MCP profile`
        : result.status === "unsupported"
          ? "use env vars or env-file templates on this platform"
          : `run orx mcp auth keychain status ${result.profileId}`;

  return [
    `MCP auth keychain ${result.action}: ${result.profileId}`,
    `  status: ${result.status}`,
    `  ok: ${result.ok ? "yes" : "no"}`,
    `  state_changed: ${result.stateChanged ? "yes" : "no"}`,
    `  token_configured: ${result.tokenConfigured ? "yes" : "no"}`,
    "  credential_mode: macos_keychain_bearer",
    `  keychain_service: ${result.keychain.service}`,
    `  keychain_account: ${result.keychain.account}`,
    `  keychain_label: ${result.keychain.label}`,
    `  opt_in: ORX_MCP_KEYCHAIN=1 required for MCP calls to read this item`,
    `  token_value: ${result.action === "set" ? "entered in macOS security prompt; never printed by ORX" : "never shown"}`,
    "  network_calls: none",
    "  subprocesses: /usr/bin/security",
    "  config_writes: none",
    "  model_exposure: not exposed to the model loop",
    `  command: ${result.command}`,
    `  detail: ${result.message}`,
    `  next_step: ${nextStep}`,
  ].join("\n");
}

export function sanitizeMcpBearerToken(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed || /[\u0000-\u001f\u007f-\u009f]/.test(trimmed)) {
    return undefined;
  }
  return trimmed;
}

function resolveMcpBearerTokenFromEnv(
  profileId: string,
  env: NodeJS.ProcessEnv,
): { token?: string; source: Exclude<McpBearerCredentialSource, "macos_keychain"> } {
  const profileToken = sanitizeMcpBearerToken(env[mcpBearerTokenEnvName(profileId)]);
  if (profileToken) {
    return { token: profileToken, source: "profile_env" };
  }

  const fallbackToken = sanitizeMcpBearerToken(env.ORX_MCP_BEARER_TOKEN);
  if (fallbackToken) {
    return { token: fallbackToken, source: "fallback_env" };
  }

  return { source: "none" };
}

async function readMcpMacosKeychainBearerToken(
  profileId: string,
  options: McpMacosKeychainOptions,
): Promise<{ token?: string; status: McpMacosKeychainStatus }> {
  const keychain = getMcpMacosKeychainReference(profileId);
  const commandArgs = ["find-generic-password", "-w", "-a", keychain.account, "-s", keychain.service];
  const unsupported = unsupportedKeychainResult(profileId, "read", commandArgs, options);
  if (unsupported) {
    return { status: unsupported.status };
  }

  const result = await runMcpMacosKeychainCommand(commandArgs, options, "capture");
  if (result.code === 0) {
    const token = sanitizeMcpBearerToken(result.stdout);
    return { token, status: token ? "configured" : "error" };
  }

  return { status: isKeychainMissing(result) ? "missing" : "error" };
}

function shouldUseMcpMacosKeychain(options: McpBearerCredentialOptions): boolean {
  if (options.keychain === true) {
    return keychainSupported(options);
  }
  if (options.keychain === false) {
    return false;
  }
  return isMcpMacosKeychainOptedIn(options.env ?? process.env) && keychainSupported(options);
}

function keychainSupported(options: McpMacosKeychainOptions): boolean {
  return (options.platform ?? process.platform) === "darwin";
}

function unsupportedKeychainResult(
  profileId: string,
  action: McpMacosKeychainAction,
  commandArgs: string[],
  options: McpMacosKeychainOptions,
): McpMacosKeychainResult | undefined {
  if (keychainSupported(options)) {
    return undefined;
  }

  return {
    profileId,
    action,
    ok: false,
    status: "unsupported",
    stateChanged: false,
    tokenConfigured: false,
    keychain: getMcpMacosKeychainReference(profileId),
    command: formatSecurityCommand(commandArgs),
    message: "macOS Keychain MCP bearer storage is only available on darwin.",
  };
}

async function runMcpMacosKeychainCommand(
  args: string[],
  options: McpMacosKeychainOptions,
  stdio: "capture" | "inherit",
): Promise<McpMacosKeychainCommandResult> {
  const runner = options.runner ?? defaultMcpMacosKeychainCommandRunner;
  return runner(args, {
    stdio,
    timeoutMs: options.timeoutMs ?? DEFAULT_KEYCHAIN_TIMEOUT_MS,
  });
}

function defaultMcpMacosKeychainCommandRunner(
  args: string[],
  options: McpMacosKeychainCommandOptions,
): Promise<McpMacosKeychainCommandResult> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const child = spawn(SECURITY_PATH, args, {
      shell: false,
      stdio: options.stdio === "inherit" ? "inherit" : ["ignore", "pipe", "pipe"],
    });
    const timer = setTimeout(() => {
      if (!settled) {
        child.kill("SIGTERM");
      }
    }, options.timeoutMs);

    if (options.stdio === "capture") {
      child.stdout?.setEncoding("utf8");
      child.stderr?.setEncoding("utf8");
      child.stdout?.on("data", (chunk) => {
        stdout += String(chunk);
      });
      child.stderr?.on("data", (chunk) => {
        stderr += String(chunk);
      });
    }

    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({
        code: 1,
        stdout,
        stderr: error.message,
      });
    });

    child.on("close", (code, signal) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({
        code: code ?? 1,
        stdout,
        stderr,
        timedOut: signal === "SIGTERM",
      });
    });
  });
}

function isKeychainMissing(result: McpMacosKeychainCommandResult): boolean {
  const text = `${result.stdout}\n${result.stderr}`.toLowerCase();
  return (
    result.timedOut !== true &&
    /could not be found|specified item could not be found|no such keychain item|secitemcopymatching/.test(text)
  );
}

function formatSecurityCommand(args: string[]): string {
  return [SECURITY_PATH, ...args].map(shellQuote).join(" ");
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
