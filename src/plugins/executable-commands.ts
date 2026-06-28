import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { canonicalJson, sha256 } from "./hash.js";
import {
  loadPluginRegistry,
  loadPluginRegistryReadOnly,
  type InstalledPluginRecord,
  type PluginRegistryIoOptions,
} from "./registry.js";

export interface PluginExecutableCommandDefinition {
  id: string;
  pluginId: string;
  slug: string;
  name: string;
  description?: string;
  binId: string;
  schemaPath: string;
  relativePath: string;
  usage?: string;
  maxArgs: number;
  commandHash: string;
  sourceManifestHash: string;
}

export interface PluginExecutableCommandOmission {
  pluginId: string;
  path?: string;
  reason: string;
}

export interface PluginExecutableCommandsDiscovery {
  commands: PluginExecutableCommandDefinition[];
  omissions: PluginExecutableCommandOmission[];
  truncated: boolean;
}

const MAX_EXECUTABLE_COMMANDS = 64;
const MAX_SCHEMA_FILE_BYTES = 128 * 1024;
const MAX_NAME_LENGTH = 80;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_USAGE_LENGTH = 180;
const MAX_COMMAND_ARGS = 64;
const COMMAND_SLUG_PATTERN = /^[a-z0-9][a-z0-9._-]{0,79}$/;
const BIN_REFERENCE_PATTERN = /^[a-z0-9][a-z0-9._-]{0,79}$/;
const CONTROL_CHAR_PATTERN = /[\x00-\x1F\x7F]/;
const SECRET_LIKE_PATTERN =
  /\b(?:bearer\s+[A-Za-z0-9._~+/=-]{8,}|authorization:\s*bearer\s+[A-Za-z0-9._~+/=-]{8,}|(?:access[_-]?token|api[_-]?key|token|key|secret)\s*[=:]\s*[A-Za-z0-9._~+/=-]{4,}|sk-or-v1-[A-Za-z0-9_-]+|github_pat_[A-Za-z0-9_]+|ghp_[A-Za-z0-9_]+|glpat-[A-Za-z0-9_-]+|xox[baprs]-[A-Za-z0-9-]+)\b/i;

export function discoverEnabledPluginExecutableCommands(
  options: PluginRegistryIoOptions = {},
): PluginExecutableCommandsDiscovery {
  const registry = options.readOnly
    ? loadPluginRegistryReadOnly({ registryPath: options.registryPath })
    : loadPluginRegistry({ registryPath: options.registryPath });
  const enabledPlugins = Object.values(registry.plugins)
    .filter((plugin) => plugin.enabled)
    .sort((left, right) => left.id.localeCompare(right.id));
  const commands: PluginExecutableCommandDefinition[] = [];
  const omissions: PluginExecutableCommandOmission[] = [];
  let truncated = false;

  for (const plugin of enabledPlugins) {
    if (commands.length >= MAX_EXECUTABLE_COMMANDS) {
      truncated = true;
      omissions.push({
        pluginId: plugin.id,
        reason: "maximum enabled executable command count reached",
      });
      break;
    }

    const componentPath = plugin.manifest.components.commandSchemas;
    if (!componentPath) {
      continue;
    }

    const discovered = discoverPluginExecutableCommands(
      plugin,
      componentPath,
      MAX_EXECUTABLE_COMMANDS - commands.length,
    );
    commands.push(...discovered.commands);
    omissions.push(...discovered.omissions);
    truncated = truncated || discovered.truncated;
  }

  return {
    commands: commands.sort((left, right) => left.id.localeCompare(right.id)),
    omissions,
    truncated,
  };
}

function discoverPluginExecutableCommands(
  plugin: InstalledPluginRecord,
  componentPath: string,
  remainingCommandBudget: number,
): PluginExecutableCommandsDiscovery {
  const baseDirectory = dirname(plugin.lock.source.manifestPath);
  if (!isSafePluginBaseDirectory(plugin.lock.source.manifestPath, baseDirectory)) {
    return {
      commands: [],
      omissions: [{ pluginId: plugin.id, path: componentPath, reason: "plugin manifest path is unavailable or unsafe" }],
      truncated: false,
    };
  }

  const schemaPath = resolve(baseDirectory, componentPath);
  const relativePath = relative(baseDirectory, schemaPath).split(/[\\/]/g).join("/");
  if (!isWithinDirectory(baseDirectory, schemaPath)) {
    return {
      commands: [],
      omissions: [{ pluginId: plugin.id, path: componentPath, reason: "command schema path escapes plugin directory" }],
      truncated: false,
    };
  }
  if (!existsSync(schemaPath)) {
    return {
      commands: [],
      omissions: [{ pluginId: plugin.id, path: componentPath, reason: "command schema path does not exist" }],
      truncated: false,
    };
  }

  let realBaseDirectory: string;
  let realSchemaPath: string;
  try {
    realBaseDirectory = realpathSync(baseDirectory);
    realSchemaPath = realpathSync(schemaPath);
  } catch {
    return {
      commands: [],
      omissions: [{ pluginId: plugin.id, path: componentPath, reason: "command schema path could not be resolved" }],
      truncated: false,
    };
  }
  if (!isWithinDirectory(realBaseDirectory, realSchemaPath)) {
    return {
      commands: [],
      omissions: [{ pluginId: plugin.id, path: relativePath, reason: "command schema path escapes plugin directory through symlinks" }],
      truncated: false,
    };
  }

  let stat;
  try {
    stat = lstatSync(schemaPath);
  } catch {
    return {
      commands: [],
      omissions: [{ pluginId: plugin.id, path: componentPath, reason: "command schema path could not be inspected" }],
      truncated: false,
    };
  }
  if (!stat.isFile()) {
    return {
      commands: [],
      omissions: [{ pluginId: plugin.id, path: componentPath, reason: "command schema path is not a file" }],
      truncated: false,
    };
  }
  if (stat.size <= 0 || stat.size > MAX_SCHEMA_FILE_BYTES) {
    return {
      commands: [],
      omissions: [{ pluginId: plugin.id, path: relativePath, reason: `command schema file must be 1-${MAX_SCHEMA_FILE_BYTES} bytes` }],
      truncated: false,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(schemaPath, "utf8")) as unknown;
  } catch {
    return {
      commands: [],
      omissions: [{ pluginId: plugin.id, path: relativePath, reason: "command schema file is not valid JSON" }],
      truncated: false,
    };
  }

  const entries = commandEntries(parsed);
  if (typeof entries === "string") {
    return {
      commands: [],
      omissions: [{ pluginId: plugin.id, path: relativePath, reason: entries }],
      truncated: false,
    };
  }

  const commands: PluginExecutableCommandDefinition[] = [];
  const omissions: PluginExecutableCommandOmission[] = [];
  const seen = new Set<string>();
  let truncated = false;

  for (const [fallbackSlug, rawCommand] of entries) {
    if (commands.length >= remainingCommandBudget) {
      truncated = true;
      omissions.push({ pluginId: plugin.id, path: relativePath, reason: "command schema discovery reached its entry limit" });
      break;
    }

    try {
      const command = sanitizeExecutableCommand(plugin, rawCommand, fallbackSlug, schemaPath, relativePath);
      if (seen.has(command.id)) {
        omissions.push({
          pluginId: plugin.id,
          path: relativePath,
          reason: `duplicate executable command id: ${command.id}`,
        });
        continue;
      }
      seen.add(command.id);
      commands.push(command);
    } catch (error) {
      omissions.push({
        pluginId: plugin.id,
        path: relativePath,
        reason: error instanceof Error ? error.message : "invalid executable command declaration",
      });
    }
  }

  return { commands, omissions, truncated };
}

function commandEntries(value: unknown): Array<[string | undefined, unknown]> | string {
  if (!isPlainObject(value)) {
    return "command schema must be a JSON object";
  }

  const commands = value.commands;
  if (Array.isArray(commands)) {
    return commands.map((command) => [undefined, command]);
  }
  if (isPlainObject(commands)) {
    return Object.entries(commands);
  }
  return "command schema must include commands as an object or array";
}

function sanitizeExecutableCommand(
  plugin: InstalledPluginRecord,
  value: unknown,
  fallbackSlug: string | undefined,
  schemaPath: string,
  relativePath: string,
): PluginExecutableCommandDefinition {
  if (!isPlainObject(value)) {
    throw new Error("executable command must be an object");
  }

  const slug = sanitizeCommandSlug(
    typeof value.slug === "string" ? value.slug : fallbackSlug,
    "command slug",
  );
  const name = optionalBoundedText(value.name, "command name", MAX_NAME_LENGTH) ?? slug;
  const description = optionalBoundedText(value.description, "command description", MAX_DESCRIPTION_LENGTH);
  const binId = sanitizeBinReference(value.bin);
  const usage = optionalBoundedText(value.usage, "command usage", MAX_USAGE_LENGTH);
  const maxArgs = optionalMaxArgs(value.maxArgs);
  const id = `plugin:${plugin.id}:exec:${slug}`;
  const commandHash = sha256(
    canonicalJson({
      id,
      pluginId: plugin.id,
      slug,
      name,
      description,
      binId,
      usage,
      maxArgs,
      relativePath,
      sourceManifestHash: plugin.manifestHash,
    }),
  );

  return {
    id,
    pluginId: plugin.id,
    slug,
    name,
    description,
    binId,
    schemaPath,
    relativePath,
    usage,
    maxArgs,
    commandHash,
    sourceManifestHash: plugin.manifestHash,
  };
}

function sanitizeCommandSlug(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string`);
  }
  const slug = sanitizeText(value, field, 1, 80).toLowerCase();
  if (!COMMAND_SLUG_PATTERN.test(slug)) {
    throw new Error(`${field} must use lowercase letters, numbers, dots, underscores, or dashes`);
  }
  return slug;
}

function sanitizeBinReference(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("command bin must be a string");
  }
  const binId = sanitizeText(value, "command bin", 1, 80).toLowerCase();
  if (!BIN_REFERENCE_PATTERN.test(binId)) {
    throw new Error("command bin must reference a direct plugin bin id");
  }
  return binId;
}

function optionalBoundedText(value: unknown, field: string, maximum: number): string | undefined {
  if (typeof value === "undefined") {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string`);
  }
  return sanitizeText(value, field, 1, maximum);
}

function sanitizeText(value: string, field: string, minimum: number, maximum: number): string {
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

function optionalMaxArgs(value: unknown): number {
  if (typeof value === "undefined") {
    return MAX_COMMAND_ARGS;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > MAX_COMMAND_ARGS) {
    throw new Error(`command maxArgs must be an integer from 0 to ${MAX_COMMAND_ARGS}`);
  }
  return value;
}

function isSafePluginBaseDirectory(manifestPath: string | undefined, baseDirectory: string): boolean {
  return Boolean(manifestPath && isAbsolute(manifestPath) && isAbsolute(baseDirectory));
}

function isWithinDirectory(baseDirectory: string, targetPath: string): boolean {
  const relativePath = relative(baseDirectory, targetPath);
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
