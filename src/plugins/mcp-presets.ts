import { existsSync, lstatSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import type {
  McpDeclaredTool,
  McpProfile,
  McpProfileSource,
  McpRiskLevel,
  McpToolRisk,
  McpTransportKind,
} from "../mcp/registry.js";
import { sha256 } from "./hash.js";
import {
  loadPluginRegistry,
  type InstalledPluginRecord,
  type PluginRegistryIoOptions,
} from "./registry.js";

export interface PluginMcpProfileOmission {
  pluginId: string;
  path?: string;
  reason: string;
}

export interface PluginMcpProfilesDiscovery {
  profiles: McpProfile[];
  omissions: PluginMcpProfileOmission[];
  truncated: boolean;
}

const MAX_PLUGIN_MCP_PROFILES = 64;
const MAX_PLUGIN_MCP_FILE_BYTES = 256 * 1024;
const MAX_PLUGIN_MCP_TOOLS = 128;
const MAX_NAME_LENGTH = 120;
const MAX_NOTE_LENGTH = 500;
const MCP_SERVER_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,79}$/;
const MCP_TOOL_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SECRET_LIKE_PATTERN =
  /\b(?:bearer\s+[A-Za-z0-9._~+/=-]{8,}|authorization:\s*bearer\s+[A-Za-z0-9._~+/=-]{8,}|(?:access[_-]?token|api[_-]?key|token|key|secret)\s*[=:]\s*[A-Za-z0-9._~+/=-]{4,}|sk-or-v1-[A-Za-z0-9_-]+|github_pat_[A-Za-z0-9_]+|ghp_[A-Za-z0-9_]+|glpat-[A-Za-z0-9_-]+|xox[baprs]-[A-Za-z0-9-]+)\b/i;
const CONTROL_CHAR_PATTERN = /[\x00-\x1F\x7F]/;

export function discoverEnabledPluginMcpProfiles(
  options: PluginRegistryIoOptions = {},
): PluginMcpProfilesDiscovery {
  const registry = loadPluginRegistry({ registryPath: options.registryPath });
  const enabledPlugins = Object.values(registry.plugins)
    .filter((plugin) => plugin.enabled)
    .sort((left, right) => left.id.localeCompare(right.id));
  const profiles: McpProfile[] = [];
  const omissions: PluginMcpProfileOmission[] = [];
  let truncated = false;

  for (const plugin of enabledPlugins) {
    if (profiles.length >= MAX_PLUGIN_MCP_PROFILES) {
      truncated = true;
      omissions.push({
        pluginId: plugin.id,
        reason: "maximum enabled plugin MCP profile count reached",
      });
      break;
    }

    const componentPath = plugin.manifest.components.mcpServers;
    if (!componentPath) {
      continue;
    }

    const discovered = discoverPluginMcpProfiles(
      plugin,
      componentPath,
      MAX_PLUGIN_MCP_PROFILES - profiles.length,
    );
    profiles.push(...discovered.profiles);
    omissions.push(...discovered.omissions);
    truncated = truncated || discovered.truncated;
  }

  return {
    profiles: profiles.sort((left, right) => left.id.localeCompare(right.id)),
    omissions,
    truncated,
  };
}

export function getEnabledPluginMcpProfileSummary(
  options: PluginRegistryIoOptions = {},
): { profileCount: number; truncated: boolean; omissionCount: number } {
  const discovery = discoverEnabledPluginMcpProfiles(options);
  return {
    profileCount: discovery.profiles.length,
    truncated: discovery.truncated,
    omissionCount: discovery.omissions.length,
  };
}

function discoverPluginMcpProfiles(
  plugin: InstalledPluginRecord,
  componentPath: string,
  remainingProfileBudget: number,
): PluginMcpProfilesDiscovery {
  const baseDirectory = dirname(plugin.lock.source.manifestPath);
  const omissions: PluginMcpProfileOmission[] = [];

  if (!isSafePluginBaseDirectory(plugin.lock.source.manifestPath, baseDirectory)) {
    return {
      profiles: [],
      omissions: [
        {
          pluginId: plugin.id,
          path: componentPath,
          reason: "plugin manifest path is unavailable or unsafe",
        },
      ],
      truncated: false,
    };
  }

  const componentFile = resolve(baseDirectory, componentPath);
  if (!isWithinDirectory(baseDirectory, componentFile)) {
    return {
      profiles: [],
      omissions: [
        {
          pluginId: plugin.id,
          path: componentPath,
          reason: "MCP component path escapes plugin directory",
        },
      ],
      truncated: false,
    };
  }

  if (!existsSync(componentFile)) {
    return {
      profiles: [],
      omissions: [
        {
          pluginId: plugin.id,
          path: componentPath,
          reason: "MCP component path does not exist",
        },
      ],
      truncated: false,
    };
  }

  let stat;
  try {
    stat = lstatSync(componentFile);
  } catch {
    return {
      profiles: [],
      omissions: [
        {
          pluginId: plugin.id,
          path: componentPath,
          reason: "MCP component path could not be inspected",
        },
      ],
      truncated: false,
    };
  }

  if (!stat.isFile()) {
    return {
      profiles: [],
      omissions: [
        {
          pluginId: plugin.id,
          path: componentPath,
          reason: "MCP component path is not a file",
        },
      ],
      truncated: false,
    };
  }

  if (stat.size > MAX_PLUGIN_MCP_FILE_BYTES) {
    return {
      profiles: [],
      omissions: [
        {
          pluginId: plugin.id,
          path: componentPath,
          reason: "MCP component file exceeds the byte limit",
        },
      ],
      truncated: false,
    };
  }

  let raw;
  try {
    raw = readFileSync(componentFile, "utf8");
  } catch {
    return {
      profiles: [],
      omissions: [
        {
          pluginId: plugin.id,
          path: componentPath,
          reason: "MCP component file could not be read",
        },
      ],
      truncated: false,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return {
      profiles: [],
      omissions: [
        {
          pluginId: plugin.id,
          path: componentPath,
          reason: "MCP component file is invalid JSON",
        },
      ],
      truncated: false,
    };
  }

  const componentHash = sha256(raw);
  const serverEntries = getServerEntries(parsed);
  const profiles: McpProfile[] = [];
  let truncated = false;

  for (const [serverId, rawServer] of serverEntries) {
    if (profiles.length >= remainingProfileBudget) {
      truncated = true;
      omissions.push({
        pluginId: plugin.id,
        path: componentPath,
        reason: "MCP profile discovery reached its entry limit",
      });
      break;
    }

    try {
      profiles.push(
        sanitizePluginMcpProfile(serverId, rawServer, plugin, componentPath, componentHash),
      );
    } catch (error) {
      omissions.push({
        pluginId: plugin.id,
        path: componentPath,
        reason: error instanceof Error ? error.message : "invalid MCP server declaration",
      });
    }
  }

  return {
    profiles,
    omissions,
    truncated,
  };
}

function sanitizePluginMcpProfile(
  fallbackServerId: string,
  value: unknown,
  plugin: InstalledPluginRecord,
  componentPath: string,
  componentHash: string,
): McpProfile {
  if (!isPlainObject(value)) {
    throw new Error("MCP server declaration must be an object");
  }

  const serverId = sanitizeServerId(
    optionalSafeString(value.id, "server.id", 1, 80) ?? fallbackServerId,
  );
  const profileAuthRequired =
    optionalBoolean(value.authRequired, "server.authRequired") ??
    plugin.manifest.metadata?.auth?.required ??
    false;
  const transport = sanitizeTransport(value.transport);
  const tools = sanitizeTools(value.tools, profileAuthRequired);
  const writeCapable =
    optionalBoolean(value.writeCapable, "server.writeCapable") === true ||
    tools.some((tool) => tool.risk === "write" || tool.risk === "destructive");
  const authRequired =
    profileAuthRequired || tools.some((tool) => tool.authRequired);
  const riskLevel =
    optionalRiskLevel(value.riskLevel, "server.riskLevel") ?? inferRiskLevel(transport.kind, tools);
  const source: McpProfileSource = {
    kind: "plugin",
    pluginId: plugin.id,
    manifestHash: plugin.manifestHash,
    componentPath,
    componentHash,
  };

  return {
    id: `plugin:${plugin.id}:${serverId}`,
    name:
      optionalSafeString(value.name, "server.name", 1, MAX_NAME_LENGTH) ??
      `${plugin.manifest.publisher}.${plugin.manifest.name}/${serverId}`,
    state: "disabled",
    transport,
    riskLevel,
    authRequired,
    writeCapable,
    tools,
    notes:
      optionalSafeString(value.notes, "server.notes", 1, MAX_NOTE_LENGTH) ??
      `Declared by plugin ${plugin.id}. Plugin MCP execution is inactive until ORX adds an explicit runtime trust policy.`,
    source,
  };
}

function sanitizeTransport(value: unknown): McpProfile["transport"] {
  if (!isPlainObject(value)) {
    throw new Error("MCP server transport must be an object");
  }

  const kind = value.kind;
  if (kind !== "remote-http" && kind !== "stdio") {
    throw new Error("MCP server transport.kind must be remote-http or stdio");
  }

  const transport: { kind: McpTransportKind; url?: string } = { kind };
  if (kind === "remote-http") {
    const url = requiredSafeString(value.url, "server.transport.url", 1, 2048);
    validateRemoteHttpUrl(url, "server.transport.url");
    transport.url = url;
  }

  return transport;
}

function sanitizeTools(value: unknown, defaultAuthRequired: boolean): McpDeclaredTool[] {
  if (typeof value === "undefined") {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error("MCP server tools must be an array");
  }

  if (value.length > MAX_PLUGIN_MCP_TOOLS) {
    throw new Error("MCP server tools has too many entries");
  }

  return value.map((entry, index) => sanitizeTool(entry, index, defaultAuthRequired));
}

function sanitizeTool(
  value: unknown,
  index: number,
  defaultAuthRequired: boolean,
): McpDeclaredTool {
  if (!isPlainObject(value)) {
    throw new Error(`MCP server tools[${index}] must be an object`);
  }

  const name = requiredSafeString(value.name, `server.tools[${index}].name`, 1, 128);
  if (!MCP_TOOL_NAME_PATTERN.test(name)) {
    throw new Error(`MCP server tools[${index}].name contains unsupported characters`);
  }

  const risk = requiredToolRisk(value.risk, `server.tools[${index}].risk`);
  const billable = optionalBoolean(value.billable, `server.tools[${index}].billable`) ?? risk === "billable";
  const authRequired =
    optionalBoolean(value.authRequired, `server.tools[${index}].authRequired`) ??
    defaultAuthRequired;

  return {
    name,
    risk,
    authRequired,
    billable,
  };
}

function getServerEntries(value: unknown): Array<[string, unknown]> {
  if (!isPlainObject(value) || !isPlainObject(value.servers)) {
    return [];
  }

  return Object.entries(value.servers).slice(0, MAX_PLUGIN_MCP_PROFILES + 1);
}

function sanitizeServerId(value: string): string {
  if (!MCP_SERVER_ID_PATTERN.test(value)) {
    throw new Error("MCP server id must use lowercase letters, numbers, dots, underscores, or dashes");
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

function inferRiskLevel(kind: McpTransportKind, tools: McpDeclaredTool[]): McpRiskLevel {
  if (tools.some((tool) => tool.risk === "destructive" || tool.risk === "write")) {
    return "high";
  }
  if (kind === "remote-http" || tools.some((tool) => tool.risk === "billable" || tool.billable)) {
    return "medium";
  }
  return "low";
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

function isSafePluginBaseDirectory(manifestPath: string, baseDirectory: string): boolean {
  return Boolean(manifestPath) && isWithinDirectory(baseDirectory, manifestPath);
}

function isWithinDirectory(baseDirectory: string, candidatePath: string): boolean {
  const relativePath = relative(resolve(baseDirectory), resolve(candidatePath));
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
