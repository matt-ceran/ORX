import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, parse as parsePath, relative, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import {
  DEFAULT_APPROVAL_POLICY,
  DEFAULT_MODE,
  DEFAULT_MODEL,
  DEFAULT_SANDBOX_MODE,
  DEFAULT_THEME,
  TERMINAL_THEMES,
} from "../constants.js";
import type { LoadedConfig, OrxConfig, OrxMode, OrxTheme } from "./types.js";

type TomlValue = string | number | boolean | Date | TomlValue[] | TomlTable;
type TomlTable = { [key: string]: TomlValue };
type ConfigPatch = Partial<Omit<OrxConfig, "permissions">> & {
  permissions?: Partial<OrxConfig["permissions"]>;
};

export interface LoadConfigOptions {
  cwd?: string;
  homeDir?: string;
  env?: NodeJS.ProcessEnv;
}

export interface ConfigPathOptions extends LoadConfigOptions {
  scope?: ConfigEditScope;
}

export type ConfigEditScope = "user" | "local";

export type ConfigSetKey =
  | "model"
  | "mode"
  | "fusion_preset"
  | "theme"
  | "approval_policy"
  | "sandbox_mode";

export interface ConfigSetResult {
  path: string;
  key: ConfigSetKey;
  value: string;
  scope: ConfigEditScope;
  message: string;
}

const VALID_MODES = new Set<OrxMode>(["exact", "auto", "fusion"]);
const VALID_THEMES = new Set<OrxTheme>(TERMINAL_THEMES);
const CONFIG_DIRECTORY_MODE = 0o700;
const CONFIG_FILE_MODE = 0o600;
const CONTROL_CHAR_PATTERN = /[\x00-\x1F\x7F]/;
const SECRET_LIKE_PATTERN =
  /\b(?:sk-or-v1-[A-Za-z0-9_-]+|github_pat_[A-Za-z0-9_]+|ghp_[A-Za-z0-9_]+|glpat-[A-Za-z0-9_-]+|xox[baprs]-[A-Za-z0-9-]+)\b/i;

export function loadConfig(options: LoadConfigOptions = {}): LoadedConfig {
  const cwd = options.cwd ?? process.cwd();
  const homeDir = options.homeDir ?? homedir();
  const env = options.env ?? process.env;

  const defaults: OrxConfig = {
    model: DEFAULT_MODEL,
    mode: DEFAULT_MODE,
    theme: DEFAULT_THEME,
    permissions: {
      approvalPolicy: DEFAULT_APPROVAL_POLICY,
      sandboxMode: DEFAULT_SANDBOX_MODE,
    },
  };

  const localConfigPath = findRepoLocalConfig(cwd);
  const userConfigPath = resolveUserConfigPath({ cwd, homeDir, env });
  const candidates = [localConfigPath, userConfigPath].filter(
    (path): path is string => Boolean(path),
  );

  const loadedFiles: string[] = [];
  let config = defaults;

  for (const path of candidates) {
    if (!existsSync(path)) {
      continue;
    }

    const fileConfig = readConfigFile(path);
    config = mergeConfig(config, fileConfig);
    loadedFiles.push(path);
  }

  const envApiKey = cleanString(env.OPENROUTER_API_KEY);
  const configApiKey = cleanString(config.apiKey);
  const apiKey = envApiKey ?? configApiKey;

  return {
    config: {
      ...config,
      apiKey,
    },
    loadedFiles,
    apiKeyPresent: Boolean(apiKey),
    apiKeySource: envApiKey ? "OPENROUTER_API_KEY" : configApiKey ? "config" : "missing",
  };
}

export function validateApiKey(loadedConfig: LoadedConfig): string | undefined {
  if (loadedConfig.apiKeyPresent) {
    return undefined;
  }

  return "OpenRouter API key not found. Set OPENROUTER_API_KEY or add api_key to ~/.orx/config.toml.";
}

export function resolveUserConfigPath(options: ConfigPathOptions = {}): string {
  const cwd = options.cwd ?? process.cwd();
  const homeDir = options.homeDir ?? homedir();
  const explicitPath = options.env?.ORX_CONFIG_PATH;
  if (explicitPath) {
    return resolve(cwd, explicitPath);
  }

  return join(homeDir, ".orx", "config.toml");
}

export function resolveLocalConfigPath(options: ConfigPathOptions = {}): string {
  const cwd = options.cwd ?? process.cwd();
  return findRepoLocalConfig(cwd) ?? join(cwd, ".orx", "config.toml");
}

export function resolveConfigEditPath(options: ConfigPathOptions = {}): string {
  return options.scope === "local" ? resolveLocalConfigPath(options) : resolveUserConfigPath(options);
}

export function setConfigValue(
  keyInput: string,
  valueInput: string,
  options: ConfigPathOptions = {},
): ConfigSetResult {
  const scope = options.scope ?? "user";
  const key = normalizeConfigSetKey(keyInput);
  if (!key) {
    if (normalizeConfigKeyInput(keyInput) === "api_key") {
      throw new Error(
        "Refusing to store API keys through config set. Use OPENROUTER_API_KEY or edit the config file manually.",
      );
    }
    throw new Error(`Unknown config key: ${keyInput}`);
  }
  const value = validateConfigSetValue(key, valueInput);
  const path = resolveConfigEditPath({ ...options, scope });
  const parsed = readEditableConfigFile(path);
  applyEditableConfigValue(parsed, key, value);
  writeEditableConfigFile(path, parsed);

  return {
    path,
    key,
    value,
    scope,
    message: `Config ${key} saved to ${path}`,
  };
}

function findRepoLocalConfig(startCwd: string): string | undefined {
  let current = startCwd;

  while (true) {
    const candidate = join(current, ".orx", "config.toml");
    if (existsSync(candidate)) {
      return candidate;
    }

    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }

    current = parent;
  }
}

function readConfigFile(path: string): ConfigPatch {
  const raw = readFileSync(path, "utf8");
  const parsed = parseToml(raw) as TomlTable;

  const mode = cleanString(parsed.mode);
  if (mode && !VALID_MODES.has(mode as OrxMode)) {
    throw new Error(`Invalid mode in ${path}: ${mode}. Expected exact, auto, or fusion.`);
  }

  const theme = cleanString(parsed.theme);
  if (theme && !VALID_THEMES.has(theme as OrxTheme)) {
    throw new Error(
      `Invalid theme in ${path}: ${theme}. Expected default, mono, or vivid.`,
    );
  }

  const permissions = asTable(parsed.permissions);

  return {
    model: cleanString(parsed.model),
    mode: mode as OrxMode | undefined,
    theme: theme as OrxTheme | undefined,
    fusionPreset: cleanString(parsed.fusion_preset ?? parsed.fusionPreset),
    apiKey: cleanString(parsed.api_key ?? parsed.openrouter_api_key ?? parsed.apiKey),
    permissions: {
      approvalPolicy:
        cleanString(permissions?.approval_policy ?? permissions?.approvalPolicy) ??
        undefined,
      sandboxMode:
        cleanString(permissions?.sandbox_mode ?? permissions?.sandboxMode) ?? undefined,
    },
  };
}

function mergeConfig(base: OrxConfig, next: ConfigPatch): OrxConfig {
  return {
    ...base,
    ...definedOnly({
      model: next.model,
      mode: next.mode,
      theme: next.theme,
      fusionPreset: next.fusionPreset,
      apiKey: next.apiKey,
    }),
    permissions: {
      ...base.permissions,
      ...definedOnly({
        approvalPolicy: next.permissions?.approvalPolicy,
        sandboxMode: next.permissions?.sandboxMode,
      }),
    },
  };
}

function cleanString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asTable(value: unknown): TomlTable | undefined {
  if (value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
    return value as TomlTable;
  }

  return undefined;
}

function definedOnly<T extends Record<string, unknown>>(record: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

export function formatConfigSources(loadedFiles: string[]): string {
  return loadedFiles.length > 0 ? loadedFiles.join(", ") : "built-in defaults";
}

function readEditableConfigFile(path: string): TomlTable {
  if (!existsSync(path)) {
    return {};
  }

  try {
    assertConfigPathWritable(path);
    const parsed = parseToml(readFileSync(path, "utf8")) as unknown;
    return asTable(parsed) ?? {};
  } catch (error) {
    throw new Error(`Unable to read config file: ${formatConfigEditError(error)}`);
  }
}

function writeEditableConfigFile(path: string, config: TomlTable): void {
  assertNoSymlinkInParentPath(path);
  assertConfigPathWritable(path);
  const parentDir = dirname(path);
  const parentExisted = existsSync(parentDir);
  mkdirSync(parentDir, { recursive: true, mode: CONFIG_DIRECTORY_MODE });
  if (!parentExisted) {
    chmodSync(parentDir, CONFIG_DIRECTORY_MODE);
  }
  writeFileSync(path, `${stringifyToml(config).trimEnd()}\n`, {
    encoding: "utf8",
    mode: CONFIG_FILE_MODE,
  });
  chmodSync(path, CONFIG_FILE_MODE);
}

function applyEditableConfigValue(config: TomlTable, key: ConfigSetKey, value: string): void {
  if (key === "model" || key === "mode" || key === "theme") {
    config[key] = value;
    return;
  }

  if (key === "fusion_preset") {
    config.fusion_preset = value;
    delete config.fusionPreset;
    return;
  }

  const permissions = asTable(config.permissions) ?? {};
  if (key === "approval_policy") {
    permissions.approval_policy = value;
    delete permissions.approvalPolicy;
  } else {
    permissions.sandbox_mode = value;
    delete permissions.sandboxMode;
  }
  config.permissions = permissions;
}

function normalizeConfigSetKey(key: string): ConfigSetKey | undefined {
  const normalized = normalizeConfigKeyInput(key);
  if (
    normalized === "model" ||
    normalized === "mode" ||
    normalized === "fusion_preset" ||
    normalized === "theme" ||
    normalized === "approval_policy" ||
    normalized === "sandbox_mode"
  ) {
    return normalized;
  }

  return undefined;
}

function normalizeConfigKeyInput(key: string): string {
  return key.trim().replace(/-/g, "_").replace(/^permissions\./, "").toLowerCase();
}

function validateConfigSetValue(key: ConfigSetKey, valueInput: string): string {
  const value = cleanString(valueInput);
  if (!value) {
    throw new Error(`Missing value for config ${key}.`);
  }
  if (CONTROL_CHAR_PATTERN.test(value) || SECRET_LIKE_PATTERN.test(value)) {
    throw new Error(`Unsafe value for config ${key}.`);
  }
  if (key === "mode" && !VALID_MODES.has(value as OrxMode)) {
    throw new Error(`Invalid mode: ${value}. Expected exact, auto, or fusion.`);
  }
  if (key === "theme" && !VALID_THEMES.has(value as OrxTheme)) {
    throw new Error(`Invalid theme: ${value}. Expected default, mono, or vivid.`);
  }
  if (key === "model" && !/^\S{1,200}$/.test(value)) {
    throw new Error("Invalid model. Use a non-empty OpenRouter model id without spaces.");
  }
  if (key === "fusion_preset" && !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) {
    throw new Error("Invalid fusion_preset. Use letters, numbers, dot, underscore, colon, or dash.");
  }
  if (
    (key === "approval_policy" || key === "sandbox_mode") &&
    !/^[a-z][a-z0-9-]{0,79}$/.test(value)
  ) {
    throw new Error(`Invalid ${key}. Use lowercase letters, numbers, and dashes.`);
  }

  return value;
}

function assertConfigPathWritable(path: string): void {
  if (!existsSync(path)) {
    return;
  }
  if (lstatSync(path).isSymbolicLink()) {
    throw new Error("refusing to write through a config symlink");
  }
}

function assertNoSymlinkInParentPath(path: string): void {
  const resolvedPath = resolve(path);
  const resolvedRoot = configParentSymlinkCheckRoot(resolvedPath);
  const relativeParent = relative(resolvedRoot, dirname(resolvedPath));
  if (relativeParent.startsWith("..") || parsePath(relativeParent).root) {
    throw new Error("refusing to write config outside the configured root");
  }

  let current = resolvedRoot;
  for (const part of relativeParent.split(sep).filter(Boolean)) {
    current = join(current, part);
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) {
      throw new Error("refusing to write through a config parent symlink");
    }
  }
}

function configParentSymlinkCheckRoot(path: string): string {
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

  return isAllowedSystemConfigRootSymlink(current) ? current : dirname(current);
}

function isAllowedSystemConfigRootSymlink(path: string): boolean {
  const resolved = resolve(path);
  return resolved === "/tmp" || resolved === "/var";
}

function formatConfigEditError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
