import { existsSync, lstatSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import type {
  McpDeclaredTool,
  McpProfile,
  McpProfileSource,
  McpRiskLevel,
  McpToolRisk,
} from "./registry.js";
import { canonicalJson, sha256 } from "../plugins/hash.js";

export interface UserMcpProfileCatalogPathOptions {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  profileCatalogPath?: string;
}

export interface UserMcpProfileCatalogIoOptions {
  profileCatalogPath?: string;
}

export interface UserMcpProfileOmission {
  id?: string;
  path: string;
  reason: string;
}

export interface UserMcpProfileCatalogLoadResult {
  path: string;
  exists: boolean;
  profiles: McpProfile[];
  omissions: UserMcpProfileOmission[];
  truncated: boolean;
}

const MAX_USER_MCP_PROFILES = 128;
const MAX_USER_MCP_FILE_BYTES = 256 * 1024;
const MAX_USER_MCP_TOOLS = 128;
const MAX_NAME_LENGTH = 120;
const MAX_NOTE_LENGTH = 500;
const MCP_SERVER_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,79}$/;
const MCP_TOOL_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SECRET_LIKE_PATTERN =
  /\b(?:bearer\s+[A-Za-z0-9._~+/=-]{8,}|authorization:\s*bearer\s+[A-Za-z0-9._~+/=-]{8,}|(?:access[_-]?token|api[_-]?key|token|key|secret)\s*[=:]\s*[A-Za-z0-9._~+/=-]{4,}|sk-or-v1-[A-Za-z0-9_-]+|github_pat_[A-Za-z0-9_]+|ghp_[A-Za-z0-9_]+|glpat-[A-Za-z0-9_-]+|xox[baprs]-[A-Za-z0-9-]+)\b/i;
const CONTROL_CHAR_PATTERN = /[\x00-\x1F\x7F]/;

export function defaultMcpProfileCatalogPath(): string {
  return resolve(homedir(), ".orx", "mcp", "profile-catalog.json");
}

export function resolveMcpProfileCatalogPath(
  options: UserMcpProfileCatalogPathOptions = {},
): string {
  const explicitPath =
    options.profileCatalogPath ?? options.env?.ORX_MCP_PROFILE_CATALOG_PATH;
  if (!explicitPath) {
    return defaultMcpProfileCatalogPath();
  }

  return resolve(options.cwd ?? process.cwd(), explicitPath);
}

export function loadUserMcpProfileCatalog(
  options: UserMcpProfileCatalogIoOptions = {},
): UserMcpProfileCatalogLoadResult {
  const path = options.profileCatalogPath ?? defaultMcpProfileCatalogPath();
  if (!existsSync(path)) {
    return {
      path,
      exists: false,
      profiles: [],
      omissions: [],
      truncated: false,
    };
  }

  let stat;
  try {
    stat = lstatSync(path);
  } catch {
    return emptyWithOmission(path, "user MCP profile catalog could not be inspected");
  }

  if (!stat.isFile()) {
    return emptyWithOmission(path, "user MCP profile catalog is not a file");
  }

  if (stat.size > MAX_USER_MCP_FILE_BYTES) {
    return emptyWithOmission(path, "user MCP profile catalog exceeds the byte limit");
  }

  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return emptyWithOmission(path, "user MCP profile catalog could not be read");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return emptyWithOmission(path, "user MCP profile catalog is invalid JSON");
  }

  if (!isPlainObject(parsed)) {
    return emptyWithOmission(path, "user MCP profile catalog must be a JSON object");
  }

  if (
    typeof parsed.version !== "undefined" &&
    parsed.version !== 1
  ) {
    return emptyWithOmission(path, "user MCP profile catalog version must be 1");
  }

  const entries = getUserProfileEntries(parsed);
  const profiles: McpProfile[] = [];
  const omissions: UserMcpProfileOmission[] = [];
  const seenProfileIds = new Set<string>();
  let truncated = false;

  for (const [fallbackProfileId, rawProfile] of entries) {
    if (profiles.length >= MAX_USER_MCP_PROFILES) {
      truncated = true;
      omissions.push({
        path,
        reason: "maximum user MCP profile count reached",
      });
      break;
    }

    try {
      const profile = sanitizeUserMcpProfile(fallbackProfileId, rawProfile, path);
      if (seenProfileIds.has(profile.id)) {
        omissions.push({
          id: profile.id,
          path,
          reason: "duplicate user MCP profile id",
        });
        continue;
      }
      seenProfileIds.add(profile.id);
      profiles.push(profile);
    } catch (error) {
      omissions.push({
        id: fallbackProfileId,
        path,
        reason: error instanceof Error ? error.message : "invalid user MCP profile declaration",
      });
    }
  }

  return {
    path,
    exists: true,
    profiles: profiles.sort((left, right) => left.id.localeCompare(right.id)),
    omissions,
    truncated,
  };
}

function sanitizeUserMcpProfile(
  fallbackProfileId: string,
  value: unknown,
  catalogPath: string,
): McpProfile {
  if (!isPlainObject(value)) {
    throw new Error("user MCP profile declaration must be an object");
  }

  const serverId = sanitizeServerId(
    optionalSafeString(value.id, "profile.id", 1, 80) ?? fallbackProfileId,
  );
  const profileAuthRequired =
    optionalBoolean(value.authRequired, "profile.authRequired") ?? false;
  const transport = sanitizeUserTransport(value.transport);
  const tools = sanitizeTools(value.tools, profileAuthRequired);
  const writeCapable =
    optionalBoolean(value.writeCapable, "profile.writeCapable") === true ||
    tools.some((tool) => tool.risk === "write" || tool.risk === "destructive");
  const authRequired =
    profileAuthRequired || tools.some((tool) => tool.authRequired);
  const riskLevel =
    optionalRiskLevel(value.riskLevel, "profile.riskLevel") ?? inferRiskLevel(tools);
  const normalizedDeclaration = {
    id: serverId,
    name: optionalSafeString(value.name, "profile.name", 1, MAX_NAME_LENGTH),
    notes: optionalSafeString(value.notes, "profile.notes", 1, MAX_NOTE_LENGTH),
    transport,
    riskLevel,
    authRequired,
    writeCapable,
    tools: [...tools].sort((left, right) => left.name.localeCompare(right.name)),
  };
  const source: McpProfileSource = {
    kind: "user",
    componentPath: catalogPath,
    componentHash: sha256(canonicalJson(normalizedDeclaration)),
  };

  return {
    id: `user:${serverId}`,
    name: normalizedDeclaration.name ?? serverId,
    state: "disabled",
    transport,
    riskLevel,
    authRequired,
    writeCapable,
    tools,
    notes:
      normalizedDeclaration.notes ??
      "Declared in the local user MCP profile catalog. Disabled until explicitly enabled and trusted.",
    source,
  };
}

function sanitizeUserTransport(value: unknown): McpProfile["transport"] {
  if (!isPlainObject(value)) {
    throw new Error("user MCP profile transport must be an object");
  }

  if (value.kind !== "remote-http") {
    throw new Error("user MCP profile transport.kind must be remote-http");
  }

  const url = requiredSafeString(value.url, "profile.transport.url", 1, 2048);
  validateRemoteHttpUrl(url, "profile.transport.url");
  return {
    kind: "remote-http",
    url,
  };
}

function sanitizeTools(value: unknown, defaultAuthRequired: boolean): McpDeclaredTool[] {
  if (typeof value === "undefined") {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error("user MCP profile tools must be an array");
  }

  if (value.length > MAX_USER_MCP_TOOLS) {
    throw new Error("user MCP profile tools has too many entries");
  }

  return value.map((entry, index) => sanitizeTool(entry, index, defaultAuthRequired));
}

function sanitizeTool(
  value: unknown,
  index: number,
  defaultAuthRequired: boolean,
): McpDeclaredTool {
  if (!isPlainObject(value)) {
    throw new Error(`user MCP profile tools[${index}] must be an object`);
  }

  const name = requiredSafeString(value.name, `profile.tools[${index}].name`, 1, 128);
  if (!MCP_TOOL_NAME_PATTERN.test(name)) {
    throw new Error(`profile.tools[${index}].name contains unsupported characters`);
  }

  const risk = requiredToolRisk(value.risk, `profile.tools[${index}].risk`);
  const billable =
    optionalBoolean(value.billable, `profile.tools[${index}].billable`) ?? risk === "billable";
  const authRequired =
    optionalBoolean(value.authRequired, `profile.tools[${index}].authRequired`) ??
    defaultAuthRequired;

  return {
    name,
    risk,
    authRequired,
    billable,
  };
}

function getUserProfileEntries(value: Record<string, unknown>): Array<[string, unknown]> {
  if (Array.isArray(value.profiles)) {
    return value.profiles
      .slice(0, MAX_USER_MCP_PROFILES + 1)
      .map((profile, index) => [String(index + 1), profile]);
  }

  if (isPlainObject(value.profiles)) {
    return Object.entries(value.profiles).slice(0, MAX_USER_MCP_PROFILES + 1);
  }

  if (isPlainObject(value.servers)) {
    return Object.entries(value.servers).slice(0, MAX_USER_MCP_PROFILES + 1);
  }

  return [];
}

function sanitizeServerId(value: string): string {
  if (!MCP_SERVER_ID_PATTERN.test(value)) {
    throw new Error(
      "user MCP profile id must use lowercase letters, numbers, dots, underscores, or dashes",
    );
  }
  return value;
}

function requiredToolRisk(value: unknown, field: string): McpToolRisk {
  if (
    value !== "read" &&
    value !== "write" &&
    value !== "destructive" &&
    value !== "billable"
  ) {
    throw new Error(`${field} must be read, write, destructive, or billable`);
  }
  return value;
}

function optionalRiskLevel(value: unknown, field: string): McpRiskLevel | undefined {
  if (typeof value === "undefined") {
    return undefined;
  }
  if (value !== "low" && value !== "medium" && value !== "high") {
    throw new Error(`${field} must be low, medium, or high`);
  }
  return value;
}

function inferRiskLevel(tools: McpDeclaredTool[]): McpRiskLevel {
  if (tools.some((tool) => tool.risk === "destructive" || tool.risk === "write")) {
    return "high";
  }
  return "medium";
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (typeof value === "undefined") {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new Error(`${field} must be a boolean`);
  }
  return value;
}

function requiredSafeString(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): string {
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string`);
  }

  const trimmed = value.trim();
  if (trimmed.length < minimum || trimmed.length > maximum) {
    throw new Error(`${field} must be ${minimum}-${maximum} characters`);
  }
  if (CONTROL_CHAR_PATTERN.test(trimmed)) {
    throw new Error(`${field} contains a control character`);
  }
  if (SECRET_LIKE_PATTERN.test(trimmed)) {
    throw new Error(`${field} must not contain secret-like values`);
  }
  return trimmed;
}

function optionalSafeString(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): string | undefined {
  if (typeof value === "undefined") {
    return undefined;
  }
  return requiredSafeString(value, field, minimum, maximum);
}

function validateRemoteHttpUrl(value: string, field: string): void {
  if (value.includes("?") || value.includes("#")) {
    throw new Error(`${field} must not contain query strings or fragments`);
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error(`${field} must use http or https`);
    }
    if (url.username || url.password) {
      throw new Error(`${field} must not contain credentials`);
    }
    if (url.search || url.hash) {
      throw new Error(`${field} must not contain query strings or fragments`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(field)) {
      throw error;
    }
    throw new Error(`${field} must be a valid URL`);
  }
}

function emptyWithOmission(path: string, reason: string): UserMcpProfileCatalogLoadResult {
  return {
    path,
    exists: true,
    profiles: [],
    omissions: [
      {
        path,
        reason,
      },
    ],
    truncated: false,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
