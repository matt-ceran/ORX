import {
  discoverEnabledPluginBins,
  loadPluginBinsTrustConfig,
  loadPluginBinsTrustConfigReadOnly,
} from "./bins.js";
import {
  discoverEnabledPluginPrompts,
} from "./prompts.js";
import {
  discoverEnabledPluginExecutableCommands,
} from "./executable-commands.js";
import type { PluginRegistryIoOptions } from "./registry.js";

export type PluginCommandAliasKind = "prompt" | "bin" | "exec";
export type PluginCommandAliasState =
  | "activate_prompt"
  | "trusted"
  | "untrusted"
  | "pending_hash_change"
  | "missing_bin";

export interface PluginCommandAlias {
  alias: string;
  id: string;
  pluginId: string;
  kind: PluginCommandAliasKind;
  targetId: string;
  state: PluginCommandAliasState;
  name: string;
  description?: string;
  usage?: string;
  maxArgs?: number;
  commandHash?: string;
}

export interface PluginCommandAliasesDiscovery {
  aliases: PluginCommandAlias[];
  promptAliasCount: number;
  binAliasCount: number;
  execAliasCount: number;
  omissions: Array<{ pluginId: string; path?: string; reason: string }>;
  truncated: boolean;
}

export interface PluginCommandAliasSummary {
  aliasCount: number;
  promptAliasCount: number;
  binAliasCount: number;
  execAliasCount: number;
  trustedBinAliasCount: number;
  trustedExecAliasCount: number;
  pendingBinAliasCount: number;
  pendingExecAliasCount: number;
  untrustedBinAliasCount: number;
  untrustedExecAliasCount: number;
  missingExecBinAliasCount: number;
  truncated: boolean;
  omissionCount: number;
}

export interface PluginCommandAliasOptions extends PluginRegistryIoOptions {
  binsConfigPath?: string;
  readOnly?: boolean;
}

const CONTROL_CHAR_PATTERN = /[\x00-\x1F\x7F]/;
const SECRET_LIKE_PATTERN =
  /\b(?:bearer\s+[A-Za-z0-9._~+/=-]{8,}|authorization:\s*bearer\s+[A-Za-z0-9._~+/=-]{8,}|(?:access[_-]?token|api[_-]?key|token|key|secret)\s*[=:]\s*[A-Za-z0-9._~+/=-]{4,}|sk-or-v1-[A-Za-z0-9_-]+|github_pat_[A-Za-z0-9_]+|ghp_[A-Za-z0-9_]+|glpat-[A-Za-z0-9_-]+|xox[baprs]-[A-Za-z0-9-]+)\b/i;

export function discoverEnabledPluginCommandAliases(
  options: PluginCommandAliasOptions = {},
): PluginCommandAliasesDiscovery {
  const promptDiscovery = discoverEnabledPluginPrompts({
    registryPath: options.registryPath,
    readOnly: options.readOnly,
  });
  const binDiscovery = discoverEnabledPluginBins({
    registryPath: options.registryPath,
    readOnly: options.readOnly,
  });
  const execDiscovery = discoverEnabledPluginExecutableCommands({
    registryPath: options.registryPath,
    readOnly: options.readOnly,
  });
  const binTrust = options.readOnly
    ? loadPluginBinsTrustConfigReadOnly({ configPath: options.binsConfigPath })
    : loadPluginBinsTrustConfig({ configPath: options.binsConfigPath });

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

  const execAliases: PluginCommandAlias[] = execDiscovery.commands.map((command) => {
    const bin = binDiscovery.bins.find(
      (candidate) => candidate.pluginId === command.pluginId && candidate.binId === command.binId,
    );
    const record = bin ? binTrust.bins[bin.id] : undefined;
    const state: PluginCommandAliasState = !bin
      ? "missing_bin"
      : record?.binHash === bin.binHash
        ? "trusted"
        : record
          ? "pending_hash_change"
          : "untrusted";

    return {
      alias: `/${command.id}`,
      id: command.id,
      pluginId: command.pluginId,
      kind: "exec",
      targetId: bin?.id ?? `plugin:${command.pluginId}:bin:${command.binId}`,
      state,
      name: command.name,
      description: command.description,
      usage: command.usage,
      maxArgs: command.maxArgs,
      commandHash: command.commandHash,
    };
  });

  const aliases = [...promptAliases, ...binAliases, ...execAliases].sort((left, right) =>
    left.alias.localeCompare(right.alias),
  );

  return {
    aliases,
    promptAliasCount: promptAliases.length,
    binAliasCount: binAliases.length,
    execAliasCount: execAliases.length,
    omissions: [
      ...promptDiscovery.omissions,
      ...binDiscovery.omissions,
      ...execDiscovery.omissions,
    ],
    truncated: promptDiscovery.truncated || binDiscovery.truncated || execDiscovery.truncated,
  };
}

export function getEnabledPluginCommandAliasSummary(
  options: PluginCommandAliasOptions = {},
): PluginCommandAliasSummary {
  const discovery = discoverEnabledPluginCommandAliases(options);
  let trustedBinAliasCount = 0;
  let trustedExecAliasCount = 0;
  let pendingBinAliasCount = 0;
  let pendingExecAliasCount = 0;
  let untrustedBinAliasCount = 0;
  let untrustedExecAliasCount = 0;
  let missingExecBinAliasCount = 0;

  for (const alias of discovery.aliases) {
    if (alias.kind !== "bin" && alias.kind !== "exec") {
      continue;
    }
    if (alias.state === "trusted") {
      if (alias.kind === "bin") {
        trustedBinAliasCount += 1;
      } else {
        trustedExecAliasCount += 1;
      }
    } else if (alias.state === "pending_hash_change") {
      if (alias.kind === "bin") {
        pendingBinAliasCount += 1;
      } else {
        pendingExecAliasCount += 1;
      }
    } else if (alias.state === "missing_bin") {
      missingExecBinAliasCount += 1;
    } else {
      if (alias.kind === "bin") {
        untrustedBinAliasCount += 1;
      } else {
        untrustedExecAliasCount += 1;
      }
    }
  }

  return {
    aliasCount: discovery.aliases.length,
    promptAliasCount: discovery.promptAliasCount,
    binAliasCount: discovery.binAliasCount,
    execAliasCount: discovery.execAliasCount,
    trustedBinAliasCount,
    trustedExecAliasCount,
    pendingBinAliasCount,
    pendingExecAliasCount,
    untrustedBinAliasCount,
    untrustedExecAliasCount,
    missingExecBinAliasCount,
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
    `  exec_aliases: ${discovery.execAliasCount}`,
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
          alias.usage ? `usage=${JSON.stringify(alias.usage)}` : undefined,
          alias.maxArgs !== undefined ? `max_args=${alias.maxArgs}` : undefined,
          alias.commandHash ? `command_hash=${alias.commandHash}` : undefined,
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
    "  usage: /plugin:<plugin-id>:command:<slug> activates a prompt; /plugin:<plugin-id>:bin:<file> [args...] runs a trusted bin; /plugin:<plugin-id>:exec:<slug> [args...] runs a manifest-defined command backed by a trusted bin",
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
