import {
  discoverEnabledPluginBins,
  loadPluginBinsTrustConfig,
} from "./bins.js";
import {
  discoverEnabledPluginPrompts,
} from "./prompts.js";
import type { PluginRegistryIoOptions } from "./registry.js";

export type PluginCommandAliasKind = "prompt" | "bin";
export type PluginCommandAliasState =
  | "activate_prompt"
  | "trusted"
  | "untrusted"
  | "pending_hash_change";

export interface PluginCommandAlias {
  alias: string;
  id: string;
  pluginId: string;
  kind: PluginCommandAliasKind;
  targetId: string;
  state: PluginCommandAliasState;
  name: string;
  description?: string;
}

export interface PluginCommandAliasesDiscovery {
  aliases: PluginCommandAlias[];
  promptAliasCount: number;
  binAliasCount: number;
  omissions: Array<{ pluginId: string; path?: string; reason: string }>;
  truncated: boolean;
}

export interface PluginCommandAliasSummary {
  aliasCount: number;
  promptAliasCount: number;
  binAliasCount: number;
  trustedBinAliasCount: number;
  pendingBinAliasCount: number;
  untrustedBinAliasCount: number;
  truncated: boolean;
  omissionCount: number;
}

export interface PluginCommandAliasOptions extends PluginRegistryIoOptions {
  binsConfigPath?: string;
}

const CONTROL_CHAR_PATTERN = /[\x00-\x1F\x7F]/;
const SECRET_LIKE_PATTERN =
  /\b(?:bearer\s+[A-Za-z0-9._~+/=-]{8,}|authorization:\s*bearer\s+[A-Za-z0-9._~+/=-]{8,}|(?:access[_-]?token|api[_-]?key|token|key|secret)\s*[=:]\s*[A-Za-z0-9._~+/=-]{4,}|sk-or-v1-[A-Za-z0-9_-]+|github_pat_[A-Za-z0-9_]+|ghp_[A-Za-z0-9_]+|glpat-[A-Za-z0-9_-]+|xox[baprs]-[A-Za-z0-9-]+)\b/i;

export function discoverEnabledPluginCommandAliases(
  options: PluginCommandAliasOptions = {},
): PluginCommandAliasesDiscovery {
  const promptDiscovery = discoverEnabledPluginPrompts({ registryPath: options.registryPath });
  const binDiscovery = discoverEnabledPluginBins({ registryPath: options.registryPath });
  const binTrust = loadPluginBinsTrustConfig({ configPath: options.binsConfigPath });

  const promptAliases: PluginCommandAlias[] = promptDiscovery.prompts.map((prompt) => ({
    alias: `/${prompt.id}`,
    id: prompt.id,
    pluginId: prompt.pluginId,
    kind: "prompt",
    targetId: prompt.id,
    state: "activate_prompt",
    name: prompt.name,
    description: prompt.description || undefined,
  }));

  const binAliases: PluginCommandAlias[] = binDiscovery.bins.map((bin) => {
    const record = binTrust.bins[bin.id];
    const state: PluginCommandAliasState = record?.binHash === bin.binHash
      ? "trusted"
      : record
        ? "pending_hash_change"
        : "untrusted";

    return {
      alias: `/${bin.id}`,
      id: bin.id,
      pluginId: bin.pluginId,
      kind: "bin",
      targetId: bin.id,
      state,
      name: bin.binId,
      description: `runner=${bin.runner.kind}`,
    };
  });

  const aliases = [...promptAliases, ...binAliases].sort((left, right) =>
    left.alias.localeCompare(right.alias),
  );

  return {
    aliases,
    promptAliasCount: promptAliases.length,
    binAliasCount: binAliases.length,
    omissions: [
      ...promptDiscovery.omissions,
      ...binDiscovery.omissions,
    ],
    truncated: promptDiscovery.truncated || binDiscovery.truncated,
  };
}

export function getEnabledPluginCommandAliasSummary(
  options: PluginCommandAliasOptions = {},
): PluginCommandAliasSummary {
  const discovery = discoverEnabledPluginCommandAliases(options);
  let trustedBinAliasCount = 0;
  let pendingBinAliasCount = 0;
  let untrustedBinAliasCount = 0;

  for (const alias of discovery.aliases) {
    if (alias.kind !== "bin") {
      continue;
    }
    if (alias.state === "trusted") {
      trustedBinAliasCount += 1;
    } else if (alias.state === "pending_hash_change") {
      pendingBinAliasCount += 1;
    } else {
      untrustedBinAliasCount += 1;
    }
  }

  return {
    aliasCount: discovery.aliases.length,
    promptAliasCount: discovery.promptAliasCount,
    binAliasCount: discovery.binAliasCount,
    trustedBinAliasCount,
    pendingBinAliasCount,
    untrustedBinAliasCount,
    truncated: discovery.truncated,
    omissionCount: discovery.omissions.length,
  };
}

export function findPluginCommandAlias(
  alias: string,
  options: PluginCommandAliasOptions = {},
): PluginCommandAlias | undefined {
  const normalized = normalizePluginAlias(alias);
  if (!normalized) {
    return undefined;
  }

  return discoverEnabledPluginCommandAliases(options).aliases.find(
    (command) => command.alias === normalized,
  );
}

export function renderPluginCommandAliases(discovery: PluginCommandAliasesDiscovery): string {
  const lines = [
    "Plugin Commands",
    `  aliases: ${discovery.aliases.length}${discovery.truncated ? " (truncated)" : ""}`,
    `  prompt_aliases: ${discovery.promptAliasCount}`,
    `  bin_aliases: ${discovery.binAliasCount}`,
    "  commands:",
  ];

  if (discovery.aliases.length === 0) {
    lines.push("    - none");
  } else {
    for (const alias of discovery.aliases) {
      lines.push(
        [
          `    - alias=${alias.alias}`,
          `kind=${alias.kind}`,
          `state=${alias.state}`,
          `target=${alias.targetId}`,
          `name=${alias.name}`,
          alias.description ? `description=${JSON.stringify(alias.description)}` : undefined,
        ]
          .filter((part): part is string => typeof part === "string")
          .join(" "),
      );
    }
  }

  if (discovery.omissions.length > 0) {
    lines.push("  omitted:");
    for (const omission of discovery.omissions.slice(0, 10)) {
      lines.push(
        [
          `    - plugin=${omission.pluginId}`,
          omission.path ? `path=${omission.path}` : undefined,
          `reason=${JSON.stringify(omission.reason)}`,
        ]
          .filter((part): part is string => typeof part === "string")
          .join(" "),
      );
    }
    if (discovery.omissions.length > 10) {
      lines.push(`    - ${discovery.omissions.length - 10} more omissions omitted`);
    }
  }

  lines.push(
    "  usage: /plugin:<plugin-id>:command:<slug> activates a prompt; /plugin:<plugin-id>:bin:<file> [args...] runs a trusted bin",
  );
  return lines.join("\n");
}

export function isPluginCommandAliasName(name: string): boolean {
  return normalizePluginAlias(name)?.startsWith("/plugin:") ?? false;
}

export function formatPluginCommandAliasForMessage(alias: string): string {
  const normalized = normalizePluginAlias(alias);
  if (!normalized) {
    return "[invalid plugin command]";
  }
  return normalized;
}

function normalizePluginAlias(alias: string): string | undefined {
  const trimmed = alias.trim().toLowerCase();
  const normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  if (
    normalized.length <= 8 ||
    normalized.length > 320 ||
    CONTROL_CHAR_PATTERN.test(normalized) ||
    SECRET_LIKE_PATTERN.test(normalized)
  ) {
    return undefined;
  }
  return normalized;
}
