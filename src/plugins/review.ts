import { checkPluginCatalogUpdates, type PluginCatalogUpdateCheckEntry } from "./catalog.js";
import {
  discoverEnabledPluginBins,
  loadPluginBinsTrustConfigReadOnly,
  type PluginBinDefinition,
} from "./bins.js";
import {
  discoverEnabledPluginCommandAliases,
  type PluginCommandAlias,
} from "./command-aliases.js";
import {
  discoverEnabledPluginHooks,
  loadPluginHooksTrustConfigReadOnly,
  type PluginHookDefinition,
} from "./hooks.js";
import { discoverEnabledPluginMcpProfiles } from "./mcp-presets.js";
import {
  formatPluginIdForMessage,
  loadPluginRegistryReadOnly,
  type InstalledPluginRecord,
  type PluginRegistryIoOptions,
} from "./registry.js";
import type { TerminalRenderOptions } from "../terminal/render.js";
import {
  formatTerminalKeyValues,
  renderTerminalBlock,
  shouldUseHumanTtyLayout,
  type TerminalLayout,
} from "../terminal/ui.js";

export interface PluginReviewOptions extends PluginRegistryIoOptions {
  catalogPath?: string;
  binsConfigPath?: string;
  hooksConfigPath?: string;
}

interface SurfaceCounts {
  total: number;
  trusted: number;
  pending: number;
  untrusted: number;
}

interface AliasCounts {
  total: number;
  prompt: number;
  bin: number;
  exec: number;
  trusted: number;
  pending: number;
  untrusted: number;
  missing: number;
}

interface PluginReviewEntry {
  plugin: InstalledPluginRecord;
  catalog?: PluginCatalogUpdateCheckEntry;
  bins: SurfaceCounts;
  hooks: SurfaceCounts;
  aliases: AliasCounts;
  mcpProfiles: number;
  actions: string[];
}

export interface PluginReview {
  installedCount: number;
  enabledCount: number;
  disabledCount: number;
  updateAvailableCount: number;
  pendingBinTrustCount: number;
  pendingHookTrustCount: number;
  untrustedBinCount: number;
  untrustedHookCount: number;
  pluginMcpProfileCount: number;
  aliasCount: number;
  omissionCount: number;
  truncated: boolean;
  entries: PluginReviewEntry[];
}

export interface PluginReviewParsedArgs {
  json: boolean;
}

export interface PluginReviewRenderOptions {
  layout?: TerminalLayout;
  renderOptions?: TerminalRenderOptions;
}

export function createPluginReview(options: PluginReviewOptions = {}): PluginReview {
  const registry = loadPluginRegistryReadOnly({ registryPath: options.registryPath });
  const plugins = Object.values(registry.plugins).sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const catalogReport = checkPluginCatalogUpdates({
    catalogPath: options.catalogPath,
    registryPath: options.registryPath,
  });
  const catalogById = new Map(catalogReport.entries.map((entry) => [entry.id, entry]));
  const binDiscovery = discoverEnabledPluginBins({
    registryPath: options.registryPath,
    readOnly: true,
  });
  const binTrust = loadPluginBinsTrustConfigReadOnly({ configPath: options.binsConfigPath });
  const hookDiscovery = discoverEnabledPluginHooks({
    registryPath: options.registryPath,
    readOnly: true,
  });
  const hookTrust = loadPluginHooksTrustConfigReadOnly({ configPath: options.hooksConfigPath });
  const aliasDiscovery = discoverEnabledPluginCommandAliases({
    registryPath: options.registryPath,
    binsConfigPath: options.binsConfigPath,
    readOnly: true,
  });
  const mcpDiscovery = discoverEnabledPluginMcpProfiles({
    registryPath: options.registryPath,
    readOnly: true,
  });

  let pendingBinTrustCount = 0;
  let pendingHookTrustCount = 0;
  let untrustedBinCount = 0;
  let untrustedHookCount = 0;
  let aliasCount = 0;
  const entries = plugins.map((plugin) => {
    const pluginBins = binDiscovery.bins.filter((bin) => bin.pluginId === plugin.id);
    const pluginHooks = hookDiscovery.hooks.filter((hook) => hook.pluginId === plugin.id);
    const pluginAliases = aliasDiscovery.aliases.filter((alias) => alias.pluginId === plugin.id);
    const pluginMcpProfiles = mcpDiscovery.profiles.filter(
      (profile) => profile.source?.pluginId === plugin.id,
    );
    const bins = countBins(pluginBins, binTrust.bins);
    const hooks = countHooks(pluginHooks, hookTrust.hooks);
    const aliases = countAliases(pluginAliases);
    const catalog = catalogById.get(plugin.id);
    const actions = pluginActions(plugin, {
      catalog,
      bins: pluginBins,
      hooks: pluginHooks,
      aliases: pluginAliases,
      mcpProfileIds: pluginMcpProfiles.map((profile) => profile.id),
      binTrust: binTrust.bins,
      hookTrust: hookTrust.hooks,
    });

    pendingBinTrustCount += bins.pending;
    pendingHookTrustCount += hooks.pending;
    untrustedBinCount += bins.untrusted;
    untrustedHookCount += hooks.untrusted;
    aliasCount += aliases.total;

    return {
      plugin,
      catalog,
      bins,
      hooks,
      aliases,
      mcpProfiles: pluginMcpProfiles.length,
      actions,
    };
  });

  return {
    installedCount: plugins.length,
    enabledCount: plugins.filter((plugin) => plugin.enabled).length,
    disabledCount: plugins.filter((plugin) => !plugin.enabled).length,
    updateAvailableCount: entries.filter((entry) => entry.catalog?.status === "update_available")
      .length,
    pendingBinTrustCount,
    pendingHookTrustCount,
    untrustedBinCount,
    untrustedHookCount,
    pluginMcpProfileCount: mcpDiscovery.profiles.length,
    aliasCount,
    omissionCount:
      binDiscovery.omissions.length +
      hookDiscovery.omissions.length +
      aliasDiscovery.omissions.length +
      mcpDiscovery.omissions.length,
    truncated:
      binDiscovery.truncated ||
      hookDiscovery.truncated ||
      aliasDiscovery.truncated ||
      mcpDiscovery.truncated,
    entries,
  };
}

export function renderPluginReview(
  review: PluginReview,
  options: PluginReviewRenderOptions = {},
): string {
  if (shouldUseHumanTtyLayout(options.renderOptions, options.layout)) {
    return renderPluginReviewTty(review, options.renderOptions);
  }

  const lines = [
    "Plugin Review",
    `  installed: ${review.installedCount}`,
    `  enabled: ${review.enabledCount}`,
    `  disabled: ${review.disabledCount}`,
    `  catalog_updates_available: ${review.updateAvailableCount}`,
    `  bin_trust: trusted=${review.entries.reduce((sum, entry) => sum + entry.bins.trusted, 0)} pending=${review.pendingBinTrustCount} untrusted=${review.untrustedBinCount}`,
    `  hook_trust: trusted=${review.entries.reduce((sum, entry) => sum + entry.hooks.trusted, 0)} pending=${review.pendingHookTrustCount} untrusted=${review.untrustedHookCount}`,
    `  plugin_mcp_profiles: ${review.pluginMcpProfileCount}`,
    `  plugin_command_aliases: ${review.aliasCount}`,
    `  omissions: ${review.omissionCount}${review.truncated ? " (truncated)" : ""}`,
    "  network: none",
    "  execution: none",
  ];

  if (review.entries.length === 0) {
    lines.push("  plugins: none");
  } else {
    lines.push("  plugins:");
    for (const entry of review.entries) {
      lines.push(formatReviewEntry(entry));
      if (entry.actions.length > 0) {
        for (const action of entry.actions.slice(0, 8)) {
          lines.push(`      command: ${action}`);
        }
        if (entry.actions.length > 8) {
          lines.push(`      command: ${entry.actions.length - 8} more actions omitted`);
        }
      }
    }
  }

  lines.push(
    "  authority:",
    "    review: local_registry_catalog_cache_trust_state_only",
    "    install_enable_trust_grant_fetch_execute: separate_explicit_steps",
  );
  return lines.join("\n");
}

function renderPluginReviewTty(
  review: PluginReview,
  renderOptions?: TerminalRenderOptions,
): string {
  const blocks = [
    renderTerminalBlock({
      title: "Plugin Review",
      subtitle: `${review.installedCount} installed`,
      renderOptions,
      body: [
        formatTerminalKeyValues(
          [
            ["installed", String(review.installedCount)],
            ["enabled", String(review.enabledCount)],
            ["disabled", String(review.disabledCount)],
            ["updates", String(review.updateAvailableCount)],
          ],
          { renderOptions },
        ),
        formatTerminalKeyValues(
          [
            ["mcp profiles", String(review.pluginMcpProfileCount)],
            ["command aliases", String(review.aliasCount)],
            ["omissions", `${review.omissionCount}${review.truncated ? " truncated" : ""}`],
          ],
          { renderOptions },
        ),
        "network none  execution none",
      ],
      footer: "install, enable, trust, grant, fetch, and execute stay explicit",
    }),
    renderTerminalBlock({
      title: "trust gates",
      renderOptions,
      body: [
        formatTerminalKeyValues(
          [
            ["bins trusted", String(totalTrustedBins(review))],
            ["pending", String(review.pendingBinTrustCount)],
            ["untrusted", String(review.untrustedBinCount)],
          ],
          { renderOptions },
        ),
        formatTerminalKeyValues(
          [
            ["hooks trusted", String(totalTrustedHooks(review))],
            ["pending", String(review.pendingHookTrustCount)],
            ["untrusted", String(review.untrustedHookCount)],
          ],
          { renderOptions },
        ),
      ],
    }),
    renderTerminalBlock({
      title: "plugins",
      renderOptions,
      body:
        review.entries.length === 0
          ? ["none"]
          : review.entries.flatMap((entry) => {
              const plugin = entry.plugin;
              const catalogStatus = entry.catalog?.status ?? "not_in_catalog";
              const row = formatTerminalKeyValues(
                [
                  ["id", plugin.id],
                  ["enabled", plugin.enabled ? "yes" : "no"],
                  ["source", plugin.lock.source.type],
                  ["catalog", catalogStatus],
                  ["bins", trustCounts(entry.bins)],
                  ["hooks", trustCounts(entry.hooks)],
                  ["aliases", String(entry.aliases.total)],
                  ["mcp", String(entry.mcpProfiles)],
                ],
                { renderOptions },
              );
              const actions = entry.actions.slice(0, 4).map((action) => `command ${action}`);
              if (entry.actions.length > 4) {
                actions.push(`command ${entry.actions.length - 4} more actions omitted`);
              }
              return [row, ...actions];
            }),
    }),
    renderTerminalBlock({
      title: "authority",
      tone: "muted",
      renderOptions,
      body: [
        "review local_registry_catalog_cache_trust_state_only",
        "install_enable_trust_grant_fetch_execute separate_explicit_steps",
      ],
    }),
  ];

  return blocks.join("\n");
}

function trustCounts(counts: SurfaceCounts): string {
  return `${counts.trusted}/${counts.pending}/${counts.untrusted}`;
}

export function parsePluginReviewArgs(args: string[]): PluginReviewParsedArgs | undefined {
  if (args.length === 1) {
    return { json: false };
  }
  if (args.length === 2 && args[1] === "--json") {
    return { json: true };
  }
  return undefined;
}

export function renderPluginReviewJson(review: PluginReview): string {
  return JSON.stringify(
    {
      schema_version: 1,
      surface: "orx.plugin_review",
      operator_only: true,
      model_tool: "none",
      execution: "none",
      network: "none",
      data_state_writes: "none",
      installed_count: review.installedCount,
      enabled_count: review.enabledCount,
      disabled_count: review.disabledCount,
      catalog_update_available_count: review.updateAvailableCount,
      bin_trust: surfaceCountsJson(totalBins(review), {
        trusted: totalTrustedBins(review),
        pending: review.pendingBinTrustCount,
        untrusted: review.untrustedBinCount,
      }),
      hook_trust: surfaceCountsJson(totalHooks(review), {
        trusted: totalTrustedHooks(review),
        pending: review.pendingHookTrustCount,
        untrusted: review.untrustedHookCount,
      }),
      plugin_mcp_profile_count: review.pluginMcpProfileCount,
      plugin_command_alias_count: review.aliasCount,
      omission_count: review.omissionCount,
      truncated: review.truncated,
      plugins: review.entries.map(pluginReviewEntryJson),
      authority: {
        review_side_effects: "none",
        registry_catalog_cache_trust_state: "read_only",
        install_enable_trust_grant_fetch_execute: "separate_explicit_steps",
        catalog_edits: "orx plugins catalog add-local|add-git|remove",
        catalog_updates: "orx plugins catalog update <id>",
        trust_changes: "orx bins trust|untrust; orx hooks trust|untrust",
      },
      usage: "orx plugins review [--json]",
    },
    null,
    2,
  );
}

function countBins(
  bins: PluginBinDefinition[],
  trust: Record<string, { binHash: string }>,
): SurfaceCounts {
  let trusted = 0;
  let pending = 0;
  for (const bin of bins) {
    const record = trust[bin.id];
    if (record?.binHash === bin.binHash) {
      trusted += 1;
    } else if (record) {
      pending += 1;
    }
  }
  return {
    total: bins.length,
    trusted,
    pending,
    untrusted: bins.length - trusted - pending,
  };
}

function countHooks(
  hooks: PluginHookDefinition[],
  trust: Record<string, { hookHash: string }>,
): SurfaceCounts {
  let trusted = 0;
  let pending = 0;
  for (const hook of hooks) {
    const record = trust[hook.id];
    if (record?.hookHash === hook.hookHash) {
      trusted += 1;
    } else if (record) {
      pending += 1;
    }
  }
  return {
    total: hooks.length,
    trusted,
    pending,
    untrusted: hooks.length - trusted - pending,
  };
}

function countAliases(aliases: PluginCommandAlias[]): AliasCounts {
  let prompt = 0;
  let bin = 0;
  let exec = 0;
  let trusted = 0;
  let pending = 0;
  let untrusted = 0;
  let missing = 0;

  for (const alias of aliases) {
    if (alias.kind === "prompt") {
      prompt += 1;
    } else if (alias.kind === "bin") {
      bin += 1;
    } else {
      exec += 1;
    }

    if (alias.state === "trusted") {
      trusted += 1;
    } else if (alias.state === "pending_hash_change") {
      pending += 1;
    } else if (alias.state === "missing_bin") {
      missing += 1;
    } else if (alias.state === "untrusted") {
      untrusted += 1;
    }
  }

  return {
    total: aliases.length,
    prompt,
    bin,
    exec,
    trusted,
    pending,
    untrusted,
    missing,
  };
}

function pluginActions(
  plugin: InstalledPluginRecord,
  state: {
    catalog?: PluginCatalogUpdateCheckEntry;
    bins: PluginBinDefinition[];
    hooks: PluginHookDefinition[];
    aliases: PluginCommandAlias[];
    mcpProfileIds: string[];
    binTrust: Record<string, { binHash: string }>;
    hookTrust: Record<string, { hookHash: string }>;
  },
): string[] {
  const actions: string[] = [];
  const id = formatPluginIdForMessage(plugin.id);

  if (state.catalog?.status === "update_available") {
    actions.push(`orx plugins catalog update ${id}`);
  }

  if (!plugin.enabled) {
    actions.push(`orx plugins enable ${id}`);
    return actions;
  }

  for (const bin of state.bins) {
    if (state.binTrust[bin.id]?.binHash !== bin.binHash) {
      actions.push(`orx bins trust ${bin.id}`);
    }
  }

  for (const hook of state.hooks) {
    if (state.hookTrust[hook.id]?.hookHash !== hook.hookHash) {
      actions.push(`orx hooks trust ${hook.id}`);
    }
  }

  for (const alias of state.aliases) {
    if (alias.state === "missing_bin") {
      actions.push(`orx plugins commands`);
      break;
    }
  }

  for (const profileId of state.mcpProfileIds) {
    actions.push(`orx mcp inspect ${profileId}`);
  }

  return [...new Set(actions)];
}

function formatReviewEntry(entry: PluginReviewEntry): string {
  const parts = [
    `    - id=${formatPluginIdForMessage(entry.plugin.id)}`,
    `enabled=${entry.plugin.enabled ? "yes" : "no"}`,
    `source=${entry.plugin.manifest.source.type}`,
    `catalog=${entry.catalog?.status ?? "not_in_catalog"}`,
    entry.catalog?.catalogCommit ? `catalog_commit=${entry.catalog.catalogCommit.slice(0, 12)}` : undefined,
    entry.catalog?.installedCommit
      ? `installed_commit=${entry.catalog.installedCommit.slice(0, 12)}`
      : undefined,
    `trust_tier=${entry.plugin.manifest.metadata?.trustTier ?? "unspecified"}`,
    `components=${formatComponents(entry.plugin)}`,
    `bins=${formatSurfaceCounts(entry.bins)}`,
    `hooks=${formatSurfaceCounts(entry.hooks)}`,
    `mcp_profiles=${entry.mcpProfiles}`,
    `aliases=${formatAliasCounts(entry.aliases)}`,
    `next_actions=${entry.actions.length}`,
  ];
  return parts.filter((part): part is string => typeof part === "string").join(" ");
}

function formatComponents(plugin: InstalledPluginRecord): string {
  const components = Object.keys(plugin.manifest.components).sort();
  return components.length > 0 ? components.join(",") : "none";
}

function formatSurfaceCounts(counts: SurfaceCounts): string {
  return `${counts.total}/trusted:${counts.trusted}/pending:${counts.pending}/untrusted:${counts.untrusted}`;
}

function formatAliasCounts(counts: AliasCounts): string {
  return `${counts.total}/prompt:${counts.prompt}/bin:${counts.bin}/exec:${counts.exec}/trusted:${counts.trusted}/pending:${counts.pending}/untrusted:${counts.untrusted}/missing:${counts.missing}`;
}

function totalBins(review: PluginReview): number {
  return review.entries.reduce((sum, entry) => sum + entry.bins.total, 0);
}

function totalTrustedBins(review: PluginReview): number {
  return review.entries.reduce((sum, entry) => sum + entry.bins.trusted, 0);
}

function totalHooks(review: PluginReview): number {
  return review.entries.reduce((sum, entry) => sum + entry.hooks.total, 0);
}

function totalTrustedHooks(review: PluginReview): number {
  return review.entries.reduce((sum, entry) => sum + entry.hooks.trusted, 0);
}

function surfaceCountsJson(
  total: number,
  counts: Pick<SurfaceCounts, "trusted" | "pending" | "untrusted">,
): Record<string, number> {
  return {
    total,
    trusted: counts.trusted,
    pending: counts.pending,
    untrusted: counts.untrusted,
  };
}

function pluginReviewEntryJson(entry: PluginReviewEntry): Record<string, unknown> {
  return {
    id: entry.plugin.id,
    enabled: entry.plugin.enabled,
    source: pluginSourceJson(entry.plugin.manifest.source),
    catalog: entry.catalog
      ? {
          status: entry.catalog.status,
          catalog_commit: entry.catalog.catalogCommit,
          installed_commit: entry.catalog.installedCommit,
          repository: entry.catalog.repository,
          installed_repository: entry.catalog.installedRepository,
          enabled: entry.catalog.enabled,
          message: entry.catalog.message,
        }
      : {
          status: "not_in_catalog",
        },
    trust_tier: entry.plugin.manifest.metadata?.trustTier ?? "unspecified",
    components: Object.keys(entry.plugin.manifest.components).sort(),
    bins: surfaceCountsJson(entry.bins.total, entry.bins),
    hooks: surfaceCountsJson(entry.hooks.total, entry.hooks),
    aliases: {
      total: entry.aliases.total,
      prompt: entry.aliases.prompt,
      bin: entry.aliases.bin,
      exec: entry.aliases.exec,
      trusted: entry.aliases.trusted,
      pending: entry.aliases.pending,
      untrusted: entry.aliases.untrusted,
      missing: entry.aliases.missing,
    },
    mcp_profile_count: entry.mcpProfiles,
    next_action_count: entry.actions.length,
    next_actions: entry.actions,
  };
}

function pluginSourceJson(source: InstalledPluginRecord["manifest"]["source"]): Record<string, unknown> {
  return {
    type: source.type,
    path: source.path,
    repository: source.repository,
    ref: source.ref,
    resolved_commit: source.resolvedCommit,
  };
}
