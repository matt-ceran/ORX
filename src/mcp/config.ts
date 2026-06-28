import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { McpProfileState, McpToolRisk } from "./registry.js";

export interface McpProfileConfigRecord {
  id: string;
  state: McpProfileState;
  trustedProfileHash?: string;
  updatedAt: string;
}

export interface McpToolGrantRecord {
  profileId: string;
  toolName: string;
  profileHash: string;
  risk: McpToolRisk;
  billable: boolean;
  grantedAt: string;
}

export interface McpModelToolGrantRecord extends McpToolGrantRecord {}

export interface McpProfilesConfig {
  version: 1;
  profiles: Record<string, McpProfileConfigRecord>;
  toolGrants: Record<string, McpToolGrantRecord>;
  modelToolGrants: Record<string, McpModelToolGrantRecord>;
}

export interface McpProfilesConfigInput {
  version: 1;
  profiles: Record<string, McpProfileConfigRecord>;
  toolGrants?: Record<string, McpToolGrantRecord>;
  modelToolGrants?: Record<string, McpModelToolGrantRecord>;
}

export interface McpConfigPathOptions {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  configPath?: string;
}

export interface McpConfigIoOptions {
  configPath?: string;
}

const CONFIG_VERSION = 1;

export function defaultMcpConfigPath(): string {
  return join(homedir(), ".orx", "mcp", "profiles.json");
}

export function resolveMcpConfigPath(options: McpConfigPathOptions = {}): string {
  const explicitPath = options.configPath ?? options.env?.ORX_MCP_CONFIG_PATH;
  if (!explicitPath) {
    return defaultMcpConfigPath();
  }

  return resolve(options.cwd ?? process.cwd(), explicitPath);
}

export function emptyMcpProfilesConfig(): McpProfilesConfig {
  return {
    version: CONFIG_VERSION,
    profiles: {},
    toolGrants: {},
    modelToolGrants: {},
  };
}

export function loadMcpProfilesConfig(options: McpConfigIoOptions = {}): McpProfilesConfig {
  const path = options.configPath ?? defaultMcpConfigPath();
  if (!existsSync(path)) {
    return emptyMcpProfilesConfig();
  }

  try {
    tightenMcpConfigPermissions(path);
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return sanitizeMcpProfilesConfig(parsed);
  } catch {
    return emptyMcpProfilesConfig();
  }
}

export function saveMcpProfilesConfig(
  config: McpProfilesConfigInput,
  options: McpConfigIoOptions = {},
): void {
  const path = options.configPath ?? defaultMcpConfigPath();
  const sanitized = sanitizeMcpProfilesConfig(config);
  mkdirSync(dirname(path), {
    recursive: true,
    mode: 0o700,
  });
  chmodSync(dirname(path), 0o700);
  writeFileSync(path, `${JSON.stringify(sanitized, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  chmodSync(path, 0o600);
}

export function getMcpProfileConfigRecord(
  config: McpProfilesConfig,
  profileId: string,
): McpProfileConfigRecord | undefined {
  return config.profiles[profileId];
}

export function mcpToolGrantKey(profileId: string, toolName: string): string {
  return `${encodeURIComponent(profileId)}/${encodeURIComponent(toolName)}`;
}

export function getMcpToolGrantRecord(
  config: McpProfilesConfig,
  profileId: string,
  toolName: string,
): McpToolGrantRecord | undefined {
  return config.toolGrants[mcpToolGrantKey(profileId, toolName)];
}

export function mcpModelToolGrantKey(profileId: string, toolName: string): string {
  return `${encodeURIComponent(profileId)}/${encodeURIComponent(toolName)}`;
}

export function getMcpModelToolGrantRecord(
  config: McpProfilesConfig,
  profileId: string,
  toolName: string,
): McpModelToolGrantRecord | undefined {
  return config.modelToolGrants[mcpModelToolGrantKey(profileId, toolName)];
}

function sanitizeMcpProfilesConfig(value: unknown): McpProfilesConfig {
  if (!value || typeof value !== "object") {
    return emptyMcpProfilesConfig();
  }

  const input = value as Record<string, unknown>;
  const rawProfiles = input.profiles;
  const rawToolGrants = input.toolGrants;
  const rawModelToolGrants = input.modelToolGrants;
  const profiles: Record<string, McpProfileConfigRecord> = {};
  const toolGrants: Record<string, McpToolGrantRecord> = {};
  const modelToolGrants: Record<string, McpModelToolGrantRecord> = {};

  if (rawProfiles && typeof rawProfiles === "object" && !Array.isArray(rawProfiles)) {
    for (const [key, rawRecord] of Object.entries(rawProfiles as Record<string, unknown>)) {
      const record = sanitizeMcpProfileConfigRecord(key, rawRecord);
      if (record) {
        profiles[record.id] = record;
      }
    }
  }

  if (rawToolGrants && typeof rawToolGrants === "object" && !Array.isArray(rawToolGrants)) {
    for (const rawRecord of Object.values(rawToolGrants as Record<string, unknown>)) {
      const record = sanitizeMcpToolGrantRecord(rawRecord);
      if (record) {
        toolGrants[mcpToolGrantKey(record.profileId, record.toolName)] = record;
      }
    }
  }

  if (
    rawModelToolGrants &&
    typeof rawModelToolGrants === "object" &&
    !Array.isArray(rawModelToolGrants)
  ) {
    for (const rawRecord of Object.values(rawModelToolGrants as Record<string, unknown>)) {
      const record = sanitizeMcpToolGrantRecord(rawRecord);
      if (record) {
        modelToolGrants[mcpModelToolGrantKey(record.profileId, record.toolName)] = record;
      }
    }
  }

  return {
    version: CONFIG_VERSION,
    profiles,
    toolGrants,
    modelToolGrants,
  };
}

function sanitizeMcpProfileConfigRecord(
  fallbackId: string,
  value: unknown,
): McpProfileConfigRecord | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const input = value as Record<string, unknown>;
  const id = typeof input.id === "string" && input.id ? input.id : fallbackId;
  const state = input.state === "enabled" ? "enabled" : input.state === "disabled" ? "disabled" : undefined;
  const updatedAt = typeof input.updatedAt === "string" ? input.updatedAt : undefined;
  const trustedProfileHash =
    typeof input.trustedProfileHash === "string" && input.trustedProfileHash
      ? input.trustedProfileHash
      : undefined;

  if (!id || !state || !updatedAt) {
    return undefined;
  }

  return {
    id,
    state,
    trustedProfileHash,
    updatedAt,
  };
}

function sanitizeMcpToolGrantRecord(value: unknown): McpToolGrantRecord | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const input = value as Record<string, unknown>;
  const profileId = sanitizeMcpConfigText(input.profileId, 240);
  const toolName = sanitizeMcpConfigText(input.toolName, 240);
  const profileHash =
    typeof input.profileHash === "string" && /^sha256:[a-f0-9]{64}$/.test(input.profileHash)
      ? input.profileHash
      : undefined;
  const risk = sanitizeMcpToolRisk(input.risk);
  const billable = typeof input.billable === "boolean" ? input.billable : undefined;
  const grantedAt = sanitizeMcpConfigText(input.grantedAt, 80);

  if (!profileId || !toolName || !profileHash || !risk || billable === undefined || !grantedAt) {
    return undefined;
  }

  return {
    profileId,
    toolName,
    profileHash,
    risk,
    billable,
    grantedAt,
  };
}

function sanitizeMcpToolRisk(value: unknown): McpToolRisk | undefined {
  return value === "read" || value === "write" || value === "destructive" || value === "billable"
    ? value
    : undefined;
}

function sanitizeMcpConfigText(value: unknown, maxChars: number): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const stripped = value.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\s+/g, " ").trim();
  if (!stripped || stripped.length > maxChars) {
    return undefined;
  }

  return stripped;
}

function tightenMcpConfigPermissions(path: string): void {
  chmodSync(dirname(path), 0o700);
  chmodSync(path, 0o600);
}
