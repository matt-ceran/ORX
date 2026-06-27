import { existsSync, readFileSync } from "node:fs";
import { dirname, join, parse as parsePath } from "node:path";
import { homedir } from "node:os";
import { parse as parseToml } from "smol-toml";
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

const VALID_MODES = new Set<OrxMode>(["exact", "auto", "fusion"]);
const VALID_THEMES = new Set<OrxTheme>(TERMINAL_THEMES);

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
  const userConfigPath = join(homeDir, ".orx", "config.toml");
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
