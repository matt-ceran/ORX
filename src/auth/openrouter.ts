import { chmodSync, existsSync, lstatSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, parse as parsePath, relative, resolve, sep } from "node:path";
import { loadConfig } from "../config/index.js";
import type { LoadedConfig } from "../config/types.js";

export const OPENROUTER_AUTH_ENV_VAR = "OPENROUTER_API_KEY";
export const OPENROUTER_AUTH_ENV_DIR_VAR = "ORX_AUTH_ENV_DIR";

const AUTH_DIRECTORY_MODE = 0o700;
const AUTH_FILE_MODE = 0o600;

export type OpenRouterAuthConfigStatus = "loaded" | "unreadable";
export type OpenRouterAuthApiKeySource =
  | LoadedConfig["apiKeySource"]
  | "config_unreadable";

export interface OpenRouterAuthSnapshot {
  apiKeyPresent: boolean;
  apiKeySource: OpenRouterAuthApiKeySource;
  configStatus: OpenRouterAuthConfigStatus;
}

export interface OpenRouterAuthReport extends OpenRouterAuthSnapshot {
  envVar: typeof OPENROUTER_AUTH_ENV_VAR;
  envFilePath: string;
  envFileExists: boolean;
  envFileAutoLoaded: false;
  cliSecretArgsAccepted: false;
  configWrites: false;
  networkCalls: "none";
  subprocesses: "none";
}

export interface OpenRouterAuthEnvFileInitResult {
  path: string;
  created: boolean;
  existed: boolean;
  apiKeyWritten: false;
  templateExportsCommented: true;
  directoryMode: "0700";
  fileMode: "0600" | "unchanged_existing_file";
}

export interface OpenRouterAuthOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
}

export function createOpenRouterAuthReport(
  options: OpenRouterAuthOptions = {},
): OpenRouterAuthReport {
  const snapshot = loadOpenRouterAuthSnapshot(options);
  const envFilePath = resolveOpenRouterAuthEnvFilePath(options);

  return {
    ...snapshot,
    envVar: OPENROUTER_AUTH_ENV_VAR,
    envFilePath,
    envFileExists: existsSync(envFilePath),
    envFileAutoLoaded: false,
    cliSecretArgsAccepted: false,
    configWrites: false,
    networkCalls: "none",
    subprocesses: "none",
  };
}

export function loadOpenRouterAuthSnapshot(
  options: OpenRouterAuthOptions = {},
): OpenRouterAuthSnapshot {
  const env = options.env ?? process.env;
  const envApiKeyPresent =
    typeof env[OPENROUTER_AUTH_ENV_VAR] === "string" &&
    env[OPENROUTER_AUTH_ENV_VAR]!.trim().length > 0;

  try {
    const loadedConfig = loadConfig(options);
    return {
      apiKeyPresent: loadedConfig.apiKeyPresent,
      apiKeySource: loadedConfig.apiKeySource,
      configStatus: "loaded",
    };
  } catch {
    return {
      apiKeyPresent: envApiKeyPresent,
      apiKeySource: envApiKeyPresent ? OPENROUTER_AUTH_ENV_VAR : "config_unreadable",
      configStatus: "unreadable",
    };
  }
}

export function resolveOpenRouterAuthEnvFilePath(
  options: OpenRouterAuthOptions = {},
): string {
  const cwd = options.cwd ?? process.cwd();
  const homeDir = options.homeDir ?? homedir();
  const env = options.env ?? process.env;
  const explicitDir = env[OPENROUTER_AUTH_ENV_DIR_VAR];
  const baseDir =
    typeof explicitDir === "string" && explicitDir.trim().length > 0
      ? resolve(cwd, explicitDir)
      : join(homeDir, ".orx", "auth");

  return join(baseDir, "openrouter.env");
}

export function initializeOpenRouterAuthEnvFile(
  options: OpenRouterAuthOptions = {},
): OpenRouterAuthEnvFileInitResult {
  const path = resolveOpenRouterAuthEnvFilePath(options);
  assertNoSymlinkInParentPath(path);
  assertAuthEnvPathWritable(path);

  const parentDir = dirname(path);
  mkdirSync(parentDir, { recursive: true, mode: AUTH_DIRECTORY_MODE });
  chmodSync(parentDir, AUTH_DIRECTORY_MODE);

  if (existsSync(path)) {
    assertExistingAuthEnvFile(path);
    return {
      path,
      created: false,
      existed: true,
      apiKeyWritten: false,
      templateExportsCommented: true,
      directoryMode: "0700",
      fileMode: "unchanged_existing_file",
    };
  }

  writeFileSync(path, renderOpenRouterAuthEnvTemplate(), {
    encoding: "utf8",
    mode: AUTH_FILE_MODE,
  });
  chmodSync(path, AUTH_FILE_MODE);

  return {
    path,
    created: true,
    existed: false,
    apiKeyWritten: false,
    templateExportsCommented: true,
    directoryMode: "0700",
    fileMode: "0600",
  };
}

export function renderOpenRouterAuthStatus(report: OpenRouterAuthReport): string {
  const nextSteps = report.apiKeyPresent
    ? ["orx doctor --strict", "orx"]
    : ["orx auth setup", "orx auth init", "orx doctor --strict"];

  return [
    "ORX OpenRouter auth",
    `  api_key_present: ${yesNo(report.apiKeyPresent)}`,
    `  api_key_source: ${report.apiKeySource}`,
    `  config_status: ${report.configStatus}`,
    `  env_var: ${report.envVar}`,
    `  env_file: ${report.envFilePath}`,
    `  env_file_exists: ${yesNo(report.envFileExists)}`,
    `  env_file_auto_loaded: ${yesNo(report.envFileAutoLoaded)}`,
    `  cli_secret_args_accepted: ${yesNo(report.cliSecretArgsAccepted)}`,
    `  config_writes: ${yesNo(report.configWrites)}`,
    `  network_calls: ${report.networkCalls}`,
    `  subprocesses: ${report.subprocesses}`,
    "next:",
    ...nextSteps.map((step) => `  - ${step}`),
  ].join("\n");
}

export function renderOpenRouterAuthSetup(report: OpenRouterAuthReport): string {
  return [
    "ORX OpenRouter auth setup",
    `  api_key_present: ${yesNo(report.apiKeyPresent)}`,
    `  api_key_source: ${report.apiKeySource}`,
    `  config_status: ${report.configStatus}`,
    `  env_var: ${report.envVar}`,
    "  token_display: never",
    "  cli_secret_args: refused",
    "  config_writes: none",
    `  managed_env_file: ${report.envFilePath}`,
    `  env_file_auto_loaded: ${yesNo(report.envFileAutoLoaded)}`,
    `  network_calls: ${report.networkCalls}`,
    `  subprocesses: ${report.subprocesses}`,
    "shell:",
    `  export ${report.envVar}="<openrouter-api-key>"`,
    "managed_template:",
    "  orx auth init",
    "next:",
    "  - set the environment variable in your shell, or source an edited env file",
    "  - orx doctor --strict",
    "  - orx",
  ].join("\n");
}

export function renderOpenRouterAuthEnvFileInitResult(
  result: OpenRouterAuthEnvFileInitResult,
  report: OpenRouterAuthReport,
): string {
  return [
    "ORX OpenRouter auth env file",
    `  state_changed: ${yesNo(result.created)}`,
    `  path: ${result.path}`,
    `  env_var: ${report.envVar}`,
    `  file_exists: ${yesNo(result.existed || result.created)}`,
    `  api_key_written: ${yesNo(result.apiKeyWritten)}`,
    `  template_exports_commented: ${yesNo(result.templateExportsCommented)}`,
    `  directory_mode: ${result.directoryMode}`,
    `  file_mode: ${result.fileMode}`,
    `  env_file_auto_loaded: ${yesNo(report.envFileAutoLoaded)}`,
    "  config_writes: none",
    `  network_calls: ${report.networkCalls}`,
    `  subprocesses: ${report.subprocesses}`,
    "next:",
    "  - edit the env file and uncomment the export line",
    `  - source ${result.path}`,
    "  - orx doctor --strict",
  ].join("\n");
}

function renderOpenRouterAuthEnvTemplate(): string {
  return [
    "# ORX OpenRouter auth env template",
    "# Replace the placeholder below, then source this file from your shell.",
    "# ORX does not load this file automatically.",
    `# export ${OPENROUTER_AUTH_ENV_VAR}="<openrouter-api-key>"`,
    "",
  ].join("\n");
}

function yesNo(value: boolean): "yes" | "no" {
  return value ? "yes" : "no";
}

function assertAuthEnvPathWritable(path: string): void {
  const stat = lstatIfExists(path);
  if (stat?.isSymbolicLink()) {
    throw new Error("refusing to write through an auth env-file symlink");
  }
  if (stat && !stat.isFile()) {
    throw new Error("auth env-file path exists but is not a regular file");
  }
}

function assertExistingAuthEnvFile(path: string): void {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) {
    throw new Error("refusing to use an auth env-file symlink");
  }
  if (!stat.isFile()) {
    throw new Error("auth env-file path exists but is not a regular file");
  }
}

function lstatIfExists(path: string): ReturnType<typeof lstatSync> | undefined {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

function assertNoSymlinkInParentPath(path: string): void {
  const resolvedPath = resolve(path);
  const resolvedRoot = authParentSymlinkCheckRoot(resolvedPath);
  const relativeParent = relative(resolvedRoot, dirname(resolvedPath));
  if (relativeParent.startsWith("..") || parsePath(relativeParent).root) {
    throw new Error("refusing to write auth env-file outside the configured root");
  }

  let current = resolvedRoot;
  for (const part of relativeParent.split(sep).filter(Boolean)) {
    current = join(current, part);
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) {
      throw new Error("refusing to write through an auth env-file parent symlink");
    }
  }
}

function authParentSymlinkCheckRoot(path: string): string {
  let current = dirname(resolve(path));
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) {
      return current;
    }
    current = parent;
  }

  if (!lstatSync(current).isSymbolicLink()) {
    return current;
  }

  return isAllowedSystemAuthRootSymlink(current) ? current : dirname(current);
}

function isAllowedSystemAuthRootSymlink(path: string): boolean {
  const resolved = resolve(path);
  return resolved === "/tmp" || resolved === "/var";
}
