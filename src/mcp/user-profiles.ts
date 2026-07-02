import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
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

export interface UserMcpRemoteProfileInput {
  name?: string;
  url: string;
  authRequired?: boolean;
  riskLevel?: McpRiskLevel;
  writeCapable?: boolean;
  notes?: string;
}

export interface UserMcpToolInput {
  name: string;
  risk: McpToolRisk;
  authRequired?: boolean;
  billable?: boolean;
}

export interface UserMcpProfileCatalogMutationResult {
  ok: boolean;
  path: string;
  profileId?: string;
  toolName?: string;
  profile?: McpProfile;
  message: string;
}

export interface UserMcpProfileToolsMutationResult extends UserMcpProfileCatalogMutationResult {
  toolNames: string[];
}

export interface UserMcpProfileCatalogParsedArgs {
  json: boolean;
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

export function upsertUserMcpRemoteProfile(
  id: string,
  input: UserMcpRemoteProfileInput,
  options: UserMcpProfileCatalogIoOptions = {},
): UserMcpProfileCatalogMutationResult {
  const path = options.profileCatalogPath ?? defaultMcpProfileCatalogPath();
  const serverId = normalizeUserProfileId(id);
  const existingCatalog = loadEditableUserMcpProfileCatalog(path);
  const existing = existingCatalog.profiles[serverId];
  const existingRecord = isPlainObject(existing) ? existing : {};
  const existingTools = Array.isArray(existingRecord.tools) ? existingRecord.tools : [];
  const safeName = optionalSafeString(input.name, "profile.name", 1, MAX_NAME_LENGTH);
  const safeNotes = optionalSafeString(input.notes, "profile.notes", 1, MAX_NOTE_LENGTH);
  const riskLevel =
    input.riskLevel ?? optionalRiskLevel(existingRecord.riskLevel, "profile.riskLevel");
  const writeCapable =
    input.writeCapable ?? optionalBoolean(existingRecord.writeCapable, "profile.writeCapable");
  const declaration = {
    ...existingRecord,
    ...(typeof safeName === "undefined" ? {} : { name: safeName }),
    transport: sanitizeUserTransport({
      kind: "remote-http",
      url: input.url,
    }),
    ...(typeof riskLevel === "undefined" ? {} : { riskLevel }),
    authRequired:
      input.authRequired ??
      optionalBoolean(existingRecord.authRequired, "profile.authRequired") ??
      false,
    ...(typeof writeCapable === "undefined" ? {} : { writeCapable }),
    tools: existingTools,
    ...(typeof safeNotes === "undefined" ? {} : { notes: safeNotes }),
  };

  const profile = sanitizeUserMcpProfile(serverId, declaration, path);
  existingCatalog.profiles[serverId] = toEditableUserMcpProfileDeclaration(
    serverId,
    declaration,
    path,
  );
  saveEditableUserMcpProfileCatalog(path, existingCatalog);

  return {
    ok: true,
    path,
    profileId: profile.id,
    profile,
    message: `User MCP profile ${profile.id} stored in ${path}. Enable it with orx mcp enable ${profile.id}.`,
  };
}

export function removeUserMcpProfile(
  id: string,
  options: UserMcpProfileCatalogIoOptions = {},
): UserMcpProfileCatalogMutationResult {
  const path = options.profileCatalogPath ?? defaultMcpProfileCatalogPath();
  const serverId = normalizeUserProfileId(id);
  const catalog = loadEditableUserMcpProfileCatalog(path);

  if (!catalog.profiles[serverId]) {
    return {
      ok: false,
      path,
      profileId: `user:${serverId}`,
      message: `No user MCP profile stored for user:${serverId}.`,
    };
  }

  delete catalog.profiles[serverId];
  saveEditableUserMcpProfileCatalog(path, catalog);

  return {
    ok: true,
    path,
    profileId: `user:${serverId}`,
    message: `User MCP profile user:${serverId} removed from ${path}.`,
  };
}

export function upsertUserMcpProfileTool(
  profileId: string,
  input: UserMcpToolInput,
  options: UserMcpProfileCatalogIoOptions = {},
): UserMcpProfileCatalogMutationResult {
  const path = options.profileCatalogPath ?? defaultMcpProfileCatalogPath();
  const serverId = normalizeUserProfileId(profileId);
  const catalog = loadEditableUserMcpProfileCatalog(path);
  const existing = catalog.profiles[serverId];
  if (!isPlainObject(existing)) {
    return {
      ok: false,
      path,
      profileId: `user:${serverId}`,
      toolName: input.name,
      message: `No user MCP profile stored for user:${serverId}.`,
    };
  }

  const profileAuthRequired =
    optionalBoolean(existing.authRequired, "profile.authRequired") ?? false;
  const tool = sanitizeTool(
    {
      name: input.name,
      risk: input.risk,
      authRequired: input.authRequired,
      billable: input.billable,
    },
    0,
    profileAuthRequired,
  );
  const currentTools = Array.isArray(existing.tools) ? existing.tools : [];
  const nextTools = [
    ...currentTools.filter(
      (entry) => !(isPlainObject(entry) && entry.name === tool.name),
    ),
    tool,
  ];
  const declaration = {
    ...existing,
    tools: nextTools.sort((left, right) => {
      const leftName = isPlainObject(left) && typeof left.name === "string" ? left.name : "";
      const rightName = isPlainObject(right) && typeof right.name === "string" ? right.name : "";
      return leftName.localeCompare(rightName);
    }),
  };
  const profile = sanitizeUserMcpProfile(serverId, declaration, path);
  catalog.profiles[serverId] = toEditableUserMcpProfileDeclaration(serverId, declaration, path);
  saveEditableUserMcpProfileCatalog(path, catalog);

  return {
    ok: true,
    path,
    profileId: profile.id,
    toolName: tool.name,
    profile,
    message: `User MCP tool ${profile.id}/${tool.name} stored in ${path}.`,
  };
}

export function upsertUserMcpProfileTools(
  profileId: string,
  inputs: UserMcpToolInput[],
  options: UserMcpProfileCatalogIoOptions = {},
): UserMcpProfileToolsMutationResult {
  const path = options.profileCatalogPath ?? defaultMcpProfileCatalogPath();
  const serverId = normalizeUserProfileId(profileId);
  const catalog = loadEditableUserMcpProfileCatalog(path);
  const existing = catalog.profiles[serverId];
  if (!isPlainObject(existing)) {
    return {
      ok: false,
      path,
      profileId: `user:${serverId}`,
      toolNames: inputs.map((input) => input.name),
      message: `No user MCP profile stored for user:${serverId}.`,
    };
  }

  const profileAuthRequired =
    optionalBoolean(existing.authRequired, "profile.authRequired") ?? false;
  const importedByName = new Map<string, McpDeclaredTool>();
  for (const [index, input] of inputs.entries()) {
    const tool = sanitizeTool(
      {
        name: input.name,
        risk: input.risk,
        authRequired: input.authRequired,
        billable: input.billable,
      },
      index,
      profileAuthRequired,
    );
    importedByName.set(tool.name, tool);
  }

  const currentTools = Array.isArray(existing.tools) ? existing.tools : [];
  for (const [index, currentTool] of currentTools.entries()) {
    if (!isPlainObject(currentTool) || typeof currentTool.name !== "string") {
      continue;
    }

    const importedTool = importedByName.get(currentTool.name);
    if (!importedTool) {
      continue;
    }

    try {
      const existingTool = sanitizeTool(currentTool, index, profileAuthRequired);
      importedByName.set(importedTool.name, mergeMcpDeclaredTools(existingTool, importedTool));
    } catch {
      // Invalid existing declarations are not allowed to override sanitized imports.
    }
  }

  const importedTools = [...importedByName.values()].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  const importedNames = new Set(importedTools.map((tool) => tool.name));
  const nextTools = [
    ...currentTools.filter(
      (entry) => !(isPlainObject(entry) && importedNames.has(String(entry.name))),
    ),
    ...importedTools,
  ];
  const declaration = {
    ...existing,
    tools: nextTools.sort((left, right) => {
      const leftName = isPlainObject(left) && typeof left.name === "string" ? left.name : "";
      const rightName = isPlainObject(right) && typeof right.name === "string" ? right.name : "";
      return leftName.localeCompare(rightName);
    }),
  };
  const profile = sanitizeUserMcpProfile(serverId, declaration, path);
  catalog.profiles[serverId] = toEditableUserMcpProfileDeclaration(serverId, declaration, path);
  saveEditableUserMcpProfileCatalog(path, catalog);

  return {
    ok: true,
    path,
    profileId: profile.id,
    toolNames: importedTools.map((tool) => tool.name),
    profile,
    message: `${importedTools.length} user MCP tools stored for ${profile.id} in ${path}.`,
  };
}

function mergeMcpDeclaredTools(
  existingTool: McpDeclaredTool,
  importedTool: McpDeclaredTool,
): McpDeclaredTool {
  return {
    name: importedTool.name,
    risk: stricterMcpToolRisk(existingTool.risk, importedTool.risk),
    authRequired: existingTool.authRequired || importedTool.authRequired,
    billable: existingTool.billable || importedTool.billable,
  };
}

function stricterMcpToolRisk(left: McpToolRisk, right: McpToolRisk): McpToolRisk {
  return MCP_TOOL_RISK_RANK[left] >= MCP_TOOL_RISK_RANK[right] ? left : right;
}

const MCP_TOOL_RISK_RANK: Record<McpToolRisk, number> = {
  read: 0,
  billable: 1,
  write: 2,
  destructive: 3,
};

export function removeUserMcpProfileTool(
  profileId: string,
  toolName: string,
  options: UserMcpProfileCatalogIoOptions = {},
): UserMcpProfileCatalogMutationResult {
  const path = options.profileCatalogPath ?? defaultMcpProfileCatalogPath();
  const serverId = normalizeUserProfileId(profileId);
  const safeToolName = requiredSafeString(toolName, "profile.tool.name", 1, 128);
  if (!MCP_TOOL_NAME_PATTERN.test(safeToolName)) {
    throw new Error("profile.tool.name contains unsupported characters");
  }
  const catalog = loadEditableUserMcpProfileCatalog(path);
  const existing = catalog.profiles[serverId];
  if (!isPlainObject(existing)) {
    return {
      ok: false,
      path,
      profileId: `user:${serverId}`,
      toolName: safeToolName,
      message: `No user MCP profile stored for user:${serverId}.`,
    };
  }

  const currentTools = Array.isArray(existing.tools) ? existing.tools : [];
  const nextTools = currentTools.filter(
    (entry) => !(isPlainObject(entry) && entry.name === safeToolName),
  );
  if (nextTools.length === currentTools.length) {
    return {
      ok: false,
      path,
      profileId: `user:${serverId}`,
      toolName: safeToolName,
      message: `No user MCP tool stored for user:${serverId}/${safeToolName}.`,
    };
  }

  const declaration = {
    ...existing,
    tools: nextTools,
  };
  const profile = sanitizeUserMcpProfile(serverId, declaration, path);
  catalog.profiles[serverId] = toEditableUserMcpProfileDeclaration(serverId, declaration, path);
  saveEditableUserMcpProfileCatalog(path, catalog);

  return {
    ok: true,
    path,
    profileId: profile.id,
    toolName: safeToolName,
    profile,
    message: `User MCP tool ${profile.id}/${safeToolName} removed from ${path}.`,
  };
}

export function renderUserMcpProfileCatalog(
  catalog: UserMcpProfileCatalogLoadResult,
): string {
  const lines = [
    "MCP user catalog",
    `  path: ${catalog.path}`,
    `  exists: ${catalog.exists ? "yes" : "no"}`,
    `  profiles: ${catalog.profiles.length}`,
    `  omissions: ${catalog.omissions.length}`,
    `  truncated: ${catalog.truncated ? "yes" : "no"}`,
    ...catalog.profiles.map((profile) =>
      [
        `  - profile=${profile.id}`,
        `name=${JSON.stringify(profile.name)}`,
        `transport=${profile.transport.kind}`,
        profile.transport.url ? `url=${profile.transport.url}` : undefined,
        `auth=${profile.authRequired ? "yes" : "no"}`,
        `risk=${profile.riskLevel}`,
        `write=${profile.writeCapable ? "yes" : "no"}`,
        `tools=${profile.tools.length}`,
        profile.source?.componentHash ? `declaration_hash=${profile.source.componentHash}` : undefined,
      ]
        .filter((part): part is string => typeof part === "string")
        .join(" "),
    ),
    ...catalog.omissions.map((omission) =>
      [
        "  - omission",
        omission.id ? `id=${omission.id}` : undefined,
        `reason=${JSON.stringify(omission.reason)}`,
      ]
        .filter((part): part is string => typeof part === "string")
        .join(" "),
    ),
  ];

  return lines.join("\n");
}

export function parseUserMcpProfileCatalogArgs(
  args: string[],
): UserMcpProfileCatalogParsedArgs | undefined {
  if (args.length === 1) {
    return { json: false };
  }
  if (args.length === 2 && args[1] === "--json") {
    return { json: true };
  }
  return undefined;
}

export function renderUserMcpProfileCatalogJson(
  catalog: UserMcpProfileCatalogLoadResult,
): string {
  return JSON.stringify(
    {
      schema_version: 1,
      surface: "orx.mcp_user_catalog",
      operator_only: true,
      model_tool: "none",
      execution: "none",
      network: "none",
      data_state_writes: "none",
      path: catalog.path,
      exists: catalog.exists,
      profile_count: catalog.profiles.length,
      omission_count: catalog.omissions.length,
      truncated: catalog.truncated,
      profiles: catalog.profiles.map(userMcpProfileJson),
      omissions: catalog.omissions.map((omission) => ({
        id: omission.id,
        path: omission.path,
        reason: omission.reason,
      })),
      authority: {
        catalog_read_side_effects: "none",
        install_enable_trust_grant_fetch_call_model_exposure: "separate_explicit_steps",
        catalog_edits: "orx mcp add-profile|remove-profile|add-tool|remove-tool",
      },
      usage: "orx mcp catalog [--json]",
    },
    null,
    2,
  );
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

function userMcpProfileJson(profile: McpProfile): Record<string, unknown> {
  return {
    id: profile.id,
    name: profile.name,
    state: profile.state,
    transport: profile.transport.kind,
    url: profile.transport.url,
    auth_required: profile.authRequired,
    risk_level: profile.riskLevel,
    write_capable: profile.writeCapable,
    notes: profile.notes,
    source: profile.source
      ? {
          kind: profile.source.kind,
          catalog_path: profile.source.componentPath,
          declaration_hash: profile.source.componentHash,
        }
      : undefined,
    tool_count: profile.tools.length,
    tools: profile.tools.map((tool) => ({
      name: tool.name,
      risk: tool.risk,
      auth_required: tool.authRequired,
      billable: tool.billable,
    })),
  };
}

interface EditableUserMcpProfileCatalog {
  version: 1;
  profiles: Record<string, Record<string, unknown>>;
}

function toEditableUserMcpProfileDeclaration(
  serverId: string,
  value: Record<string, unknown>,
  catalogPath: string,
): Record<string, unknown> {
  const profile = sanitizeUserMcpProfile(serverId, value, catalogPath);
  const name = optionalSafeString(value.name, "profile.name", 1, MAX_NAME_LENGTH);
  const notes = optionalSafeString(value.notes, "profile.notes", 1, MAX_NOTE_LENGTH);
  const riskLevel = optionalRiskLevel(value.riskLevel, "profile.riskLevel");
  const explicitWriteCapable = optionalBoolean(value.writeCapable, "profile.writeCapable");

  return {
    ...(typeof name === "undefined" ? {} : { name }),
    transport: profile.transport,
    ...(typeof riskLevel === "undefined" ? {} : { riskLevel }),
    authRequired: profile.authRequired,
    ...(typeof explicitWriteCapable === "undefined"
      ? {}
      : { writeCapable: explicitWriteCapable }),
    tools: [...profile.tools].sort((left, right) => left.name.localeCompare(right.name)),
    ...(typeof notes === "undefined" ? {} : { notes }),
  };
}

function loadEditableUserMcpProfileCatalog(path: string): EditableUserMcpProfileCatalog {
  if (!existsSync(path)) {
    return {
      version: 1,
      profiles: {},
    };
  }

  let stat;
  try {
    stat = lstatSync(path);
  } catch {
    throw new Error("User MCP profile catalog could not be inspected.");
  }

  if (!stat.isFile()) {
    throw new Error("User MCP profile catalog is not a file.");
  }

  if (stat.size > MAX_USER_MCP_FILE_BYTES) {
    throw new Error("User MCP profile catalog exceeds the byte limit.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch {
    throw new Error("User MCP profile catalog is invalid JSON.");
  }

  if (!isPlainObject(parsed)) {
    throw new Error("User MCP profile catalog must be a JSON object.");
  }

  if (typeof parsed.version !== "undefined" && parsed.version !== 1) {
    throw new Error("User MCP profile catalog version must be 1.");
  }

  const profiles: Record<string, Record<string, unknown>> = {};
  const rawProfiles =
    typeof parsed.profiles === "undefined" && isPlainObject(parsed.servers)
      ? parsed.servers
      : parsed.profiles;
  if (typeof rawProfiles === "undefined") {
    return {
      version: 1,
      profiles,
    };
  }

  if (Array.isArray(rawProfiles)) {
    if (rawProfiles.length > MAX_USER_MCP_PROFILES) {
      throw new Error("User MCP profile catalog has too many profiles for edits.");
    }

    for (const [index, value] of rawProfiles.entries()) {
      if (!isPlainObject(value)) {
        throw new Error(`User MCP profile ${index + 1} must be an object.`);
      }
      const profile = sanitizeUserMcpProfile(String(index + 1), value, path);
      const serverId = normalizeUserProfileId(profile.id);
      if (profiles[serverId]) {
        throw new Error(`Duplicate user MCP profile user:${serverId}.`);
      }
      profiles[serverId] = toEditableUserMcpProfileDeclaration(serverId, value, path);
    }

    return {
      version: 1,
      profiles,
    };
  }

  if (!isPlainObject(rawProfiles)) {
    throw new Error("User MCP profile catalog profiles must be an object for edits.");
  }

  for (const [id, value] of Object.entries(rawProfiles)) {
    if (!isPlainObject(value)) {
      throw new Error(`User MCP profile ${id} must be an object.`);
    }
    profiles[normalizeUserProfileId(id)] = { ...value };
  }

  return {
    version: 1,
    profiles,
  };
}

function saveEditableUserMcpProfileCatalog(
  path: string,
  catalog: EditableUserMcpProfileCatalog,
): void {
  const directory = dirname(path);
  mkdirSync(directory, {
    recursive: true,
    mode: 0o700,
  });
  chmodSync(directory, 0o700);
  writeFileSync(path, `${JSON.stringify(catalog, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  chmodSync(path, 0o600);
}

function normalizeUserProfileId(id: string): string {
  const raw = requiredSafeString(id, "profile.id", 1, 85);
  const withoutPrefix = raw.startsWith("user:") ? raw.slice("user:".length) : raw;
  return sanitizeServerId(withoutPrefix);
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

export function validateUserMcpToolName(toolName: string): string {
  const safeToolName = requiredSafeString(toolName, "profile.tool.name", 1, 128);
  if (!MCP_TOOL_NAME_PATTERN.test(safeToolName)) {
    throw new Error("profile.tool.name contains unsupported characters");
  }
  return safeToolName;
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
