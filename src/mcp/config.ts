import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { McpProfileState } from "./registry.js";

export interface McpProfileConfigRecord {
  id: string;
  state: McpProfileState;
  trustedProfileHash?: string;
  updatedAt: string;
}

export interface McpProfilesConfig {
  version: 1;
  profiles: Record<string, McpProfileConfigRecord>;
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
  config: McpProfilesConfig,
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

function sanitizeMcpProfilesConfig(value: unknown): McpProfilesConfig {
  if (!value || typeof value !== "object") {
    return emptyMcpProfilesConfig();
  }

  const input = value as Record<string, unknown>;
  const rawProfiles = input.profiles;
  const profiles: Record<string, McpProfileConfigRecord> = {};

  if (rawProfiles && typeof rawProfiles === "object" && !Array.isArray(rawProfiles)) {
    for (const [key, rawRecord] of Object.entries(rawProfiles as Record<string, unknown>)) {
      const record = sanitizeMcpProfileConfigRecord(key, rawRecord);
      if (record) {
        profiles[record.id] = record;
      }
    }
  }

  return {
    version: CONFIG_VERSION,
    profiles,
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

function tightenMcpConfigPermissions(path: string): void {
  chmodSync(dirname(path), 0o700);
  chmodSync(path, 0o600);
}
