import {
  boundMessagesForContext,
  formatContextState,
  formatSessionDiffState,
  getContextState,
  recordGitDiffOutputForDiffState,
  type AgentContextBudget,
  type SessionDiffState,
} from "../agent/index.js";
import type { LoadedConfig, OrxConfig } from "../config/types.js";
import {
  DelegationStateError,
  addOpenRouterDelegate,
  clearController,
  clearDelegates,
  createEmptyDelegationState,
  removeDelegate,
  renderDelegates,
  renderOrchestratorStatus,
  setOpenRouterController,
  type DelegationState,
} from "../delegation/index.js";
import {
  discoverMcpProfile,
  findMcpProfile,
  formatMcpDiscoveryResult,
  getMcpProfileToolPolicyReport,
  getMcpStatusSummary,
  hashMcpProfile,
  renderMcpProfileInspect,
  renderMcpProfileTools,
  renderMcpStatus,
  setMcpProfilePersistentState,
  writeMcpAuditEvent,
  type McpAuditEvent,
} from "../mcp/index.js";
import {
  formatOpenRouterCredits,
  formatOpenRouterGeneration,
  formatOpenRouterLiveError,
  formatOpenRouterModels,
  getOpenRouterCredits,
  getOpenRouterGeneration,
  listOpenRouterModels,
  type OpenRouterCreditsInfo,
} from "../openrouter/live.js";
import {
  formatModelResolutionResult,
  resolveOpenRouterModel,
} from "../openrouter/model-resolver.js";
import type { OpenRouterMessage, OpenRouterStreamMetadata } from "../openrouter/types.js";
import { formatOpenRouterMetadata } from "../openrouter/summary.js";
import {
  activatePluginSkill,
  discoverEnabledPluginSkills,
  findInstalledPlugin,
  getPluginStatusSummary,
  registerPluginManifest,
  renderPluginInspect,
  renderPluginList,
  renderPluginSkillList,
  renderSkillActivation,
  setPluginEnabledState,
  type PluginSkillActivationProvenance,
} from "../plugins/index.js";
import {
  createUntrustedBrowserContextMessage,
  createUntrustedSearchContextMessage,
  createUntrustedWebContextMessage,
  findEvidenceSourceById,
  fetchUrl,
  formatBrowserSnapshotResult,
  formatCitationUsage,
  formatEvidenceBibliography,
  formatEvidenceCitation,
  formatEvidenceSources,
  formatFetchedUrlResult,
  formatResearchBrowserError,
  formatResearchSearchError,
  formatMissingCitationSource,
  formatResearchFetchError,
  formatSearchResults,
  nextEvidenceSourceId,
  snapshotBrowserUrl,
  searchWeb,
  type BrowserSnapshotDriver,
  type EvidenceSource,
  type ResolveBrowserHost,
} from "../research/index.js";
import { formatStatus } from "../status.js";
import {
  createSessionCostMeterState,
  formatContextUsageMeter,
  formatSessionCostMeter,
  type SessionCostMeterState,
} from "../terminal/meters.js";
import {
  createTerminalRenderer,
  shouldUseAnsiColor,
  type TerminalRenderOptions,
  type TerminalRenderer,
} from "../terminal/render.js";
import { gitDiffTool } from "../tools/index.js";

type WritableLike = Pick<NodeJS.WriteStream, "write">;

export interface SlashCommand {
  name: string;
  argText: string;
  args: string[];
}

export type SlashResult = "continue" | "exit";

export interface SlashIo {
  stdout: WritableLike;
  stderr: WritableLike;
  cwd: string;
}

export interface ResumeSessionSummary {
  id: string;
  path: string;
  updatedAt: string;
  cwd: string;
  model: string;
  mode: string;
  title?: string;
  cost?: number;
  messageCount: number;
}

export type ResumeSessionResult =
  | {
      kind: "list";
      sessions: ResumeSessionSummary[];
    }
  | {
      kind: "resumed";
      session: ResumeSessionSummary;
    }
  | {
      kind: "not_found";
      selector: string;
    }
  | {
      kind: "ambiguous";
      selector: string;
      matches: ResumeSessionSummary[];
    }
  | {
      kind: "error";
      message: string;
    };

export interface SlashCommandContext {
  io: SlashIo;
  loadedConfig: LoadedConfig;
  fetch?: typeof fetch;
  webFetch?: typeof fetch;
  webSearchFetch?: typeof fetch;
  browserSnapshot?: BrowserSnapshotDriver;
  browserResolveHost?: ResolveBrowserHost;
  braveSearchApiKey?: string;
  getConfig: () => OrxConfig;
  setConfig: (config: OrxConfig) => void;
  getMessages: () => OpenRouterMessage[];
  setMessages: (messages: OpenRouterMessage[]) => void;
  clearMessages: () => void;
  getEvidenceSources?: () => EvidenceSource[];
  setEvidenceSources?: (sources: EvidenceSource[]) => void;
  getDelegationState?: () => DelegationState;
  setDelegationState?: (state: DelegationState) => void;
  getLatestMetadata: () => OpenRouterStreamMetadata | undefined;
  getCostMeterState?: () => SessionCostMeterState;
  getContextBudget?: () => Partial<AgentContextBudget>;
  getDiffState?: () => SessionDiffState;
  getSessionInfo?: () => { id: string; path: string } | undefined;
  setLatestCredits?: (credits: OpenRouterCreditsInfo) => void;
  mcpAuditLogPath?: string;
  mcpConfigPath?: string;
  pluginRegistryPath?: string;
  recordActivatedSkill?: (skill: PluginSkillActivationProvenance) => void;
  startNewSession?: () => Promise<void> | void;
  resumeSession?: (selector?: string) => Promise<ResumeSessionResult>;
}

type SlashHandler = (
  command: SlashCommand,
  context: SlashCommandContext,
) => SlashResult | Promise<SlashResult>;

interface SlashDefinition {
  usage: string;
  description: string;
  group: SlashCommandGroup;
  tier: SlashCommandTier;
  aliases?: string[];
  handler: SlashHandler;
}

export type SlashCommandGroup =
  | "Core"
  | "Models & routing"
  | "Workspace"
  | "Account & metadata"
  | "Sessions"
  | "Research"
  | "Orchestration"
  | "Integrations";

type SlashCommandTier = "common" | "advanced";

export interface SlashCommandMetadata {
  name: string;
  usage: string;
  description: string;
  group: SlashCommandGroup;
  tier: SlashCommandTier;
  aliases: string[];
}

const MAX_RENDERED_RESUME_SESSIONS = 20;
const MAX_HELP_QUERY_LENGTH = 80;
const MAX_COMPACT_PALETTE_MATCHES = 8;
const DEFAULT_COMPACT_PALETTE_WIDTH = 88;
const MIN_COMPACT_PALETTE_WIDTH = 32;
const MAX_COMPACT_PALETTE_WIDTH = 140;
const HELP_CONTROL_PATTERN = /[\u0000-\u001f\u007f-\u009f]/g;
const ANSI_PATTERN = /\x1B\[[0-?]*[ -/]*[@-~]/g;
const MODE_COMPLETIONS = ["auto", "fusion"] as const;
const FUSION_PRESET_COMPLETIONS = ["general-budget"] as const;
const OPENROUTER_MODEL_SHORTCUT_COMPLETIONS = [
  "openrouter/auto",
  "openrouter/fusion",
] as const;
const WEB_SUBCOMMAND_COMPLETIONS = ["help", "fetch", "search", "browse"] as const;
const MCP_SUBCOMMAND_COMPLETIONS = [
  "list",
  "status",
  "inspect",
  "tools",
  "discover",
  "enable",
  "disable",
] as const;
const MCP_PROFILE_COMPLETIONS = ["openrouter"] as const;
const PLUGIN_SUBCOMMAND_COMPLETIONS = [
  "list",
  "status",
  "inspect",
  "register",
  "enable",
  "disable",
] as const;
const SKILL_SUBCOMMAND_COMPLETIONS = ["list", "status", "activate"] as const;
const ORCHESTRATOR_SUBCOMMAND_COMPLETIONS = ["status", "openrouter", "clear"] as const;
const DELEGATE_SUBCOMMAND_COMPLETIONS = ["help", "add", "remove", "clear"] as const;
const DELEGATE_ADAPTER_COMPLETIONS = ["openrouter"] as const;
const RESUME_SELECTOR_COMPLETIONS = ["latest"] as const;
const COMMON_GROUP_ORDER: SlashCommandGroup[] = [
  "Core",
  "Models & routing",
  "Workspace",
  "Account & metadata",
];
const ADVANCED_GROUP_ORDER: SlashCommandGroup[] = [
  "Account & metadata",
  "Sessions",
  "Research",
  "Orchestration",
  "Integrations",
];
const ALL_GROUP_ORDER: SlashCommandGroup[] = [
  "Core",
  "Models & routing",
  "Workspace",
  "Account & metadata",
  "Sessions",
  "Research",
  "Orchestration",
  "Integrations",
];

const COMMANDS: Record<string, SlashDefinition> = {
  "/help": {
    usage: "/help",
    description: "Show grouped command help",
    group: "Core",
    tier: "common",
    aliases: ["/h"],
    handler: (command, context) => {
      writeLine(context.io.stdout, renderSlashHelp(command.argText || undefined));
      return "continue";
    },
  },
  "/commands": {
    usage: "/commands [query]",
    description: "Show a compact slash command palette",
    group: "Core",
    tier: "common",
    aliases: ["/palette"],
    handler: (command, context) => {
      writeLine(
        context.io.stdout,
        renderCommandPaletteForOutput(command.argText || undefined, context.io.stdout),
      );
      return "continue";
    },
  },
  "/status": {
    usage: "/status",
    description: "Show current chat status, config, permissions, and metadata",
    group: "Core",
    tier: "common",
    aliases: ["/s"],
    handler: (_command, context) => {
      writeLine(context.io.stdout, renderInteractiveStatus(context));
      return "continue";
    },
  },
  "/compact": {
    usage: "/compact",
    description: "Compact older in-session context locally",
    group: "Sessions",
    tier: "advanced",
    handler: (_command, context) => {
      const result = boundMessagesForContext(context.getMessages(), {
        budget: context.getContextBudget?.(),
        force: true,
      });
      context.setMessages(result.messages);

      if (!result.compacted) {
        writeLine(context.io.stdout, `Context unchanged: ${formatContextState(result.after)}.`);
        return "continue";
      }

      writeLine(
        context.io.stdout,
        [
          "Context compacted locally:",
          `${result.before.messageCount}->${result.after.messageCount} messages`,
          `${result.before.approximateBytes}B->${result.after.approximateBytes}B approx`,
        ].join(" "),
      );
      return "continue";
    },
  },
  "/diff": {
    usage: "/diff [path...]",
    description: "Show the current working tree diff",
    group: "Workspace",
    tier: "common",
    handler: async (command, context): Promise<SlashResult> => {
      const result = await gitDiffTool({
        cwd: context.io.cwd,
        paths: command.args.length > 0 ? command.args : undefined,
      });

      if (!result.ok) {
        writeLine(context.io.stderr, `Unable to show diff: ${result.error.message}`);
        return "continue";
      }

      const diffState = context.getDiffState?.();
      if (diffState) {
        recordGitDiffOutputForDiffState(diffState, result);
      }

      if (result.diff.length === 0) {
        writeLine(context.io.stdout, "No working tree changes.");
        return "continue";
      }

      context.io.stdout.write(result.diff.endsWith("\n") ? result.diff : `${result.diff}\n`);
      if (result.truncation.truncated) {
        writeLine(
          context.io.stdout,
          `Diff truncated: ${result.truncation.omittedBytes}B omitted, ${result.truncation.omittedLines} lines omitted.`,
        );
      }
      return "continue";
    },
  },
  "/model": {
    usage: "/model <id-or-search>",
    description: "Resolve and switch OpenRouter model",
    group: "Models & routing",
    tier: "common",
    aliases: ["/m"],
    handler: async (command, context): Promise<SlashResult> => {
      if (!command.argText) {
        writeLine(context.io.stdout, `Current model: ${context.getConfig().model}`);
        return "continue";
      }

      const config = context.getConfig();
      const result = await resolveOpenRouterModel({
        input: command.argText,
        apiKey: config.apiKey,
        fetch: context.fetch,
      });

      if (result.kind !== "resolved") {
        writeLine(context.io.stderr, formatModelResolutionResult(result));
        return "continue";
      }

      context.setConfig({
        ...config,
        mode: "exact",
        model: result.modelId,
        fusionPreset: undefined,
      });
      writeLine(context.io.stdout, formatModelResolutionResult(result));
      return "continue";
    },
  },
  "/mode": {
    usage: "/mode <auto|fusion>",
    description: "Switch OpenRouter routing mode",
    group: "Models & routing",
    tier: "common",
    handler: (command, context) => {
      const mode = command.args[0];
      const extra = command.args.slice(1).join(" ");

      if (!mode) {
        const config = context.getConfig();
        writeLine(context.io.stdout, `Current mode: ${config.mode} (${config.model})`);
        return "continue";
      }

      if (extra || (mode !== "auto" && mode !== "fusion")) {
        writeLine(context.io.stderr, "Usage: /mode <auto|fusion>");
        return "continue";
      }

      if (mode === "auto") {
        context.setConfig({
          ...context.getConfig(),
          mode: "auto",
          model: "openrouter/auto",
          fusionPreset: undefined,
        });
        writeLine(context.io.stdout, "Mode set to auto (model: openrouter/auto).");
        return "continue";
      }

      context.setConfig({
        ...context.getConfig(),
        mode: "fusion",
        model: "openrouter/fusion",
      });
      writeLine(context.io.stdout, "Mode set to fusion (model: openrouter/fusion).");
      return "continue";
    },
  },
  "/fusion": {
    usage: "/fusion [preset]",
    description: "Show or set the active OpenRouter Fusion preset",
    group: "Models & routing",
    tier: "common",
    handler: (command, context) => {
      if (!command.argText) {
        writeLine(
          context.io.stdout,
          `Current Fusion preset: ${context.getConfig().fusionPreset ?? "none"}`,
        );
        return "continue";
      }

      context.setConfig({
        ...context.getConfig(),
        mode: "fusion",
        model: "openrouter/fusion",
        fusionPreset: command.argText,
      });
      writeLine(
        context.io.stdout,
        `Fusion preset set to ${command.argText} (mode: fusion, model: openrouter/fusion).`,
      );
      return "continue";
    },
  },
  "/models": {
    usage: "/models [filter]",
    description: "Search live OpenRouter model catalog",
    group: "Models & routing",
    tier: "common",
    handler: async (command, context): Promise<SlashResult> => {
      const config = context.getConfig();
      if (!context.loadedConfig.apiKeyPresent || !config.apiKey) {
        writeLine(
          context.io.stderr,
          "OpenRouter API key not found. Live model lookup is unavailable.",
        );
        return "continue";
      }

      try {
        const models = await listOpenRouterModels({
          apiKey: config.apiKey,
          fetch: context.fetch,
        });
        writeLine(context.io.stdout, formatOpenRouterModels(models, command.argText || undefined));
      } catch (error) {
        writeLine(context.io.stderr, formatOpenRouterLiveError(error, { apiKey: config.apiKey }));
      }
      return "continue";
    },
  },
  "/credits": {
    usage: "/credits",
    description: "Show live OpenRouter credit balance",
    group: "Account & metadata",
    tier: "common",
    handler: async (_command, context): Promise<SlashResult> => {
      const config = context.getConfig();
      if (!context.loadedConfig.apiKeyPresent || !config.apiKey) {
        writeLine(
          context.io.stderr,
          "OpenRouter API key not found. Credit lookup is unavailable.",
        );
        return "continue";
      }

      try {
        const credits = await getOpenRouterCredits({
          apiKey: config.apiKey,
          fetch: context.fetch,
        });
        context.setLatestCredits?.(credits);
        writeLine(
          context.io.stdout,
          formatOpenRouterCredits(credits, { stream: context.io.stdout }),
        );
      } catch (error) {
        writeLine(context.io.stderr, formatOpenRouterLiveError(error, { apiKey: config.apiKey }));
      }
      return "continue";
    },
  },
  "/generation": {
    usage: "/generation <id>",
    description: "Show OpenRouter generation metadata",
    group: "Account & metadata",
    tier: "advanced",
    handler: async (command, context): Promise<SlashResult> => {
      const config = context.getConfig();
      const generationId = command.argText || context.getLatestMetadata()?.generationId;
      if (!generationId) {
        writeLine(context.io.stderr, "Usage: /generation <id>");
        return "continue";
      }

      if (!context.loadedConfig.apiKeyPresent || !config.apiKey) {
        writeLine(
          context.io.stderr,
          "OpenRouter API key not found. Generation lookup is unavailable.",
        );
        return "continue";
      }

      try {
        const generation = await getOpenRouterGeneration({
          apiKey: config.apiKey,
          generationId,
          fetch: context.fetch,
        });
        writeLine(context.io.stdout, formatOpenRouterGeneration(generation));
      } catch (error) {
        writeLine(context.io.stderr, formatOpenRouterLiveError(error, { apiKey: config.apiKey }));
      }
      return "continue";
    },
  },
  "/web": {
    usage: "/web [fetch <url>|search <query>|browse <url>]",
    description: "Fetch, search, or browse as untrusted research context",
    group: "Research",
    tier: "advanced",
    handler: async (command, context): Promise<SlashResult> => {
      await handleWebCommand(command, context);
      return "continue";
    },
  },
  "/fetch": {
    usage: "/fetch <url>",
    description: "Alias for /web fetch <url>",
    group: "Research",
    tier: "advanced",
    handler: async (command, context): Promise<SlashResult> => {
      await fetchWebUrl(command.argText, context);
      return "continue";
    },
  },
  "/search": {
    usage: "/search <query>",
    description: "Search the web via Brave as untrusted provider snippets",
    group: "Research",
    tier: "advanced",
    handler: async (command, context): Promise<SlashResult> => {
      await searchWebQuery(command.argText, context);
      return "continue";
    },
  },
  "/browse": {
    usage: "/browse <url>",
    description: "Alias for /web browse <url>",
    group: "Research",
    tier: "advanced",
    handler: async (command, context): Promise<SlashResult> => {
      await browseWebUrl(command.argText, context);
      return "continue";
    },
  },
  "/sources": {
    usage: "/sources",
    description: "List evidence sources in the current chat",
    group: "Research",
    tier: "advanced",
    handler: (_command, context) => {
      writeLine(context.io.stdout, formatEvidenceSources(context.getEvidenceSources?.() ?? []));
      return "continue";
    },
  },
  "/cite": {
    usage: "/cite <source-id>",
    description: "Render a concise citation for one evidence source",
    group: "Research",
    tier: "advanced",
    handler: (command, context) => {
      const sources = context.getEvidenceSources?.() ?? [];
      if (!command.argText) {
        writeLine(context.io.stdout, formatCitationUsage(sources));
        return "continue";
      }

      if (command.args.length !== 1) {
        writeLine(context.io.stderr, "Usage: /cite <source-id>");
        return "continue";
      }

      const source = findEvidenceSourceById(sources, command.args[0]);
      if (!source) {
        writeLine(context.io.stderr, formatMissingCitationSource(command.args[0], sources));
        return "continue";
      }

      writeLine(context.io.stdout, formatEvidenceCitation(source));
      return "continue";
    },
  },
  "/bibliography": {
    usage: "/bibliography",
    description: "Render all evidence source citations",
    group: "Research",
    tier: "advanced",
    handler: (command, context) => {
      if (command.argText) {
        writeLine(context.io.stderr, "Usage: /bibliography");
        return "continue";
      }

      writeLine(
        context.io.stdout,
        formatEvidenceBibliography(context.getEvidenceSources?.() ?? []),
      );
      return "continue";
    },
  },
  "/mcp": {
    usage: "/mcp [list|inspect|tools|discover|enable|disable]",
    description: "Show MCP profile policy state and gated discovery",
    group: "Integrations",
    tier: "advanced",
    handler: async (command, context): Promise<SlashResult> => {
      await handleMcpCommand(command, context);
      return "continue";
    },
  },
  "/plugins": {
    usage: "/plugins [list|inspect|register|enable|disable]",
    description: "Show and update inert plugin registry state",
    group: "Integrations",
    tier: "advanced",
    handler: (command, context): SlashResult => {
      handlePluginsCommand(command, context);
      return "continue";
    },
  },
  "/skills": {
    usage: "/skills [list|activate <id>]",
    description: "List enabled plugin skills or activate one for this chat",
    group: "Integrations",
    tier: "advanced",
    handler: (command, context): SlashResult => {
      handleSkillsCommand(command, context);
      return "continue";
    },
  },
  "/orchestrator": {
    usage: "/orchestrator [openrouter <model>|clear]",
    description: "Show or configure inert OpenRouter orchestration",
    group: "Orchestration",
    tier: "advanced",
    handler: (command, context): SlashResult => {
      handleOrchestratorCommand(command, context);
      return "continue";
    },
  },
  "/delegate": {
    usage: "/delegate <add|remove|clear>",
    description: "Register or remove inert OpenRouter delegates",
    group: "Orchestration",
    tier: "advanced",
    handler: (command, context): SlashResult => {
      handleDelegateCommand(command, context);
      return "continue";
    },
  },
  "/delegates": {
    usage: "/delegates",
    description: "List inert delegates and disabled execution state",
    group: "Orchestration",
    tier: "advanced",
    handler: (command, context): SlashResult => {
      if (command.argText) {
        writeLine(context.io.stderr, "Usage: /delegates");
        return "continue";
      }

      writeLine(context.io.stdout, renderDelegates(getDelegationState(context)));
      return "continue";
    },
  },
  "/clear": {
    usage: "/clear",
    description: "Clear in-session message history",
    group: "Workspace",
    tier: "common",
    handler: (_command, context) => {
      context.clearMessages();
      writeLine(context.io.stdout, "Conversation history cleared.");
      return "continue";
    },
  },
  "/new": {
    usage: "/new",
    description: "Start a new in-process chat",
    group: "Workspace",
    tier: "common",
    handler: async (_command, context): Promise<SlashResult> => {
      context.clearMessages();
      await context.startNewSession?.();
      writeLine(context.io.stdout, "New chat started. Conversation history cleared.");
      return "continue";
    },
  },
  "/resume": {
    usage: "/resume [id|prefix|number|latest]",
    description: "List or resume a saved chat session",
    group: "Sessions",
    tier: "advanced",
    handler: async (command, context): Promise<SlashResult> => {
      if (!context.resumeSession) {
        writeLine(context.io.stderr, "Session resume is not available in this context.");
        return "continue";
      }

      const result = await context.resumeSession(command.argText || undefined);
      if (result.kind === "list") {
        writeLine(context.io.stdout, renderResumeSessionList(result.sessions));
        return "continue";
      }

      if (result.kind === "resumed") {
        writeLine(context.io.stdout, renderResumedSession(result.session));
        return "continue";
      }

      if (result.kind === "ambiguous") {
        writeLine(
          context.io.stderr,
          [
            `Session selector is ambiguous: ${result.selector}`,
            renderAmbiguousResumeSessions(result.matches),
          ].join("\n"),
        );
        return "continue";
      }

      if (result.kind === "not_found") {
        writeLine(context.io.stderr, `No saved session matched: ${result.selector}`);
        return "continue";
      }

      writeLine(context.io.stderr, `Unable to resume session: ${result.message}`);
      return "continue";
    },
  },
  "/quit": {
    usage: "/quit",
    description: "Leave chat",
    group: "Core",
    tier: "common",
    aliases: ["/q", "/exit"],
    handler: (_command, context) => {
      writeLine(context.io.stdout, "Exiting ORX chat.");
      return "exit";
    },
  },
};

const COMMAND_ALIASES = createCommandAliasMap(COMMANDS);

export function parseSlashCommand(rawInput: string): SlashCommand | undefined {
  const trimmed = rawInput.trim();
  if (!trimmed.startsWith("/")) {
    return undefined;
  }

  const [rawName = "", ...args] = trimmed.split(/\s+/);
  return {
    name: rawName.toLowerCase(),
    argText: args.join(" ").trim(),
    args,
  };
}

export function resolveSlashCommandName(name: string): string {
  return COMMAND_ALIASES[name.toLowerCase()] ?? name.toLowerCase();
}

export function handleSlashCommand(
  rawInput: string,
  context: SlashCommandContext,
): SlashResult | Promise<SlashResult> {
  const command = parseSlashCommand(rawInput);
  if (!command) {
    return "continue";
  }

  const canonicalName = resolveSlashCommandName(command.name);
  const definition = COMMANDS[canonicalName];
  if (!definition) {
    writeLine(
      context.io.stderr,
      `Unknown command: ${command.name}. Type /help <query> or /help all.`,
    );
    return "continue";
  }

  return definition.handler({ ...command, name: canonicalName }, context);
}

export function listSlashCommands(): SlashCommandMetadata[] {
  return Object.entries(COMMANDS).map(([name, definition]) => ({
    name,
    usage: definition.usage,
    description: definition.description,
    group: definition.group,
    tier: definition.tier,
    aliases: definition.aliases ?? [],
  }));
}

export function filterSlashCommands(query: string): SlashCommandMetadata[] {
  const normalizedQuery = normalizeHelpQuery(query);
  if (!normalizedQuery) {
    return listSlashCommands();
  }

  const tokens = normalizedQuery.toLowerCase().split(/\s+/).filter(Boolean);
  return listSlashCommands().filter((command) => {
    const haystack = [
      command.name,
      command.usage,
      command.description,
      command.group,
      command.tier,
      ...command.aliases,
    ]
      .join(" ")
      .toLowerCase();
    return tokens.every((token) => haystack.includes(token));
  });
}

export function completeSlashCommandLine(line: string): [string[], string] {
  const context = slashCompletionContext(line);
  if (!context) {
    return [[], line];
  }

  const values =
    context.kind === "command"
      ? slashCommandCompletionValues()
      : slashArgumentCompletionValues(context.commandName, context.completedArgs);
  const normalizedFragment = context.fragment.toLowerCase();
  const completions = values
    .filter((completion) => completion.toLowerCase().startsWith(normalizedFragment))
    .map((completion) => `${completion} `);

  if (completions.length === 0) {
    return [[], line];
  }

  return [completions, context.fragment];
}

export function renderSlashHelp(query?: string): string {
  const normalizedQuery = normalizeHelpQuery(query ?? "");

  if (!normalizedQuery) {
    return renderGroupedCommandList({
      title: "Common chat commands:",
      commands: listSlashCommands().filter((command) => command.tier === "common"),
      groupOrder: COMMON_GROUP_ORDER,
      footer:
        "Use /help <query> to filter. Use /help all for advanced, plugin, MCP, research, and session commands.",
    });
  }

  if (normalizedQuery.toLowerCase() === "all") {
    return [
      renderGroupedCommandList({
        title: "Common chat commands:",
        commands: listSlashCommands().filter((command) => command.tier === "common"),
        groupOrder: COMMON_GROUP_ORDER,
      }),
      "",
      renderGroupedCommandList({
        title: "Advanced chat commands:",
        commands: listSlashCommands().filter((command) => command.tier === "advanced"),
        groupOrder: ADVANCED_GROUP_ORDER,
      }),
      "",
      "Use /help <query> to filter by name, alias, group, usage, or description.",
    ].join("\n");
  }

  return renderGroupedCommandList({
    title: `Slash commands matching "${normalizedQuery}":`,
    commands: filterSlashCommands(normalizedQuery),
    groupOrder: ALL_GROUP_ORDER,
    emptyMessage: `No slash commands matched "${normalizedQuery}".`,
    footer: "Use /help all to show every command.",
  });
}

export function renderCommandPalette(query?: string): string {
  const normalizedQuery = normalizeHelpQuery(query ?? "");
  return renderGroupedCommandList({
    title: normalizedQuery
      ? `Command palette matching "${normalizedQuery}":`
      : "Command palette:",
    commands: normalizedQuery ? filterSlashCommands(normalizedQuery) : listSlashCommands(),
    groupOrder: ALL_GROUP_ORDER,
    emptyMessage: normalizedQuery
      ? `No commands matched "${normalizedQuery}".`
      : "No slash commands registered.",
  });
}

export interface CompactCommandPaletteOptions {
  width?: number;
  limit?: number;
  renderOptions?: TerminalRenderOptions;
}

export function renderCompactCommandPalette(
  query?: string,
  options: CompactCommandPaletteOptions = {},
): string {
  const normalizedQuery = normalizeHelpQuery(query ?? "");
  const width = normalizeCompactPaletteWidth(options.width);
  const limit = normalizeCompactPaletteLimit(options.limit);
  const renderer = createTerminalRenderer(options.renderOptions);
  const commands = normalizedQuery ? filterSlashCommands(normalizedQuery) : listSlashCommands();
  const visibleCommands = commands.slice(0, limit);
  const usageWidth = Math.min(
    28,
    Math.max(10, ...visibleCommands.map((command) => command.usage.length)),
  );
  const title = normalizedQuery
    ? `Command palette matching "${normalizedQuery}" (${commands.length})`
    : `Command palette (${commands.length})`;
  const lines = [renderer.bold(truncateVisible(title, width))];

  if (visibleCommands.length === 0) {
    lines.push(truncateVisible("  No commands matched.", width));
    return lines.join("\n");
  }

  for (const command of visibleCommands) {
    lines.push(renderCompactCommandPaletteLine(command, usageWidth, width, renderer));
  }

  const omitted = commands.length - visibleCommands.length;
  if (omitted > 0) {
    lines.push(renderer.dim(truncateVisible(`  ... ${omitted} more; use /help all`, width)));
  }

  return lines.join("\n");
}

export function chatHelpText(query?: string): string {
  return renderSlashHelp(query);
}

function createCommandAliasMap(commands: Record<string, SlashDefinition>): Record<string, string> {
  const aliases: Record<string, string> = {};
  for (const [name, definition] of Object.entries(commands)) {
    for (const alias of definition.aliases ?? []) {
      aliases[alias.toLowerCase()] = name;
    }
  }
  return aliases;
}

function normalizeHelpQuery(query: string): string {
  return query.replace(HELP_CONTROL_PATTERN, "").trim().slice(0, MAX_HELP_QUERY_LENGTH);
}

type SlashCompletionContext =
  | {
      kind: "command";
      fragment: string;
    }
  | {
      kind: "argument";
      commandName: string;
      completedArgs: string[];
      fragment: string;
    };

function slashCompletionContext(line: string): SlashCompletionContext | undefined {
  const leadingWhitespaceLength = line.match(/^\s*/)?.[0].length ?? 0;
  const trimmedLeft = line.slice(leadingWhitespaceLength);
  if (!trimmedLeft.startsWith("/")) {
    return undefined;
  }

  const commandMatch = /^(\S+)(?:\s+([\s\S]*))?$/.exec(trimmedLeft);
  if (!commandMatch) {
    return undefined;
  }

  const commandToken = commandMatch[1];
  const rest = commandMatch[2];
  if (rest === undefined) {
    return {
      kind: "command",
      fragment: commandToken,
    };
  }

  const commandName = resolveSlashCommandName(commandToken.toLowerCase());
  if (!COMMANDS[commandName]) {
    return undefined;
  }

  const restEndsWithWhitespace = /\s$/.test(trimmedLeft);
  const restTokens = rest.trim().length > 0 ? rest.trim().split(/\s+/) : [];
  return {
    kind: "argument",
    commandName,
    completedArgs: restEndsWithWhitespace ? restTokens : restTokens.slice(0, -1),
    fragment: restEndsWithWhitespace ? "" : restTokens.at(-1) ?? "",
  };
}

function slashCommandCompletionValues(): string[] {
  return Array.from(
    new Set(
      listSlashCommands().flatMap((command) => [
        command.name,
        ...command.aliases,
      ]),
    ),
  ).sort((left, right) => left.localeCompare(right));
}

function slashArgumentCompletionValues(commandName: string, completedArgs: string[]): string[] {
  const argIndex = completedArgs.length;
  const firstArg = completedArgs[0]?.toLowerCase();
  const secondArg = completedArgs[1]?.toLowerCase();
  const thirdArg = completedArgs[2]?.toLowerCase();

  switch (commandName) {
    case "/help":
      return argIndex === 0 ? ["all", ...slashCommandCompletionValues()] : [];
    case "/commands":
      return argIndex === 0 ? slashCommandCompletionValues() : [];
    case "/model":
      return argIndex === 0 ? [...OPENROUTER_MODEL_SHORTCUT_COMPLETIONS] : [];
    case "/mode":
      return argIndex === 0 ? [...MODE_COMPLETIONS] : [];
    case "/fusion":
      return argIndex === 0 ? [...FUSION_PRESET_COMPLETIONS] : [];
    case "/web":
      return argIndex === 0 ? [...WEB_SUBCOMMAND_COMPLETIONS] : [];
    case "/mcp":
      if (argIndex === 0) {
        return [...MCP_SUBCOMMAND_COMPLETIONS];
      }
      return isMcpProfileSubcommand(firstArg) && argIndex === 1
        ? [...MCP_PROFILE_COMPLETIONS]
        : [];
    case "/plugins":
      return argIndex === 0 ? [...PLUGIN_SUBCOMMAND_COMPLETIONS] : [];
    case "/skills":
      return argIndex === 0 ? [...SKILL_SUBCOMMAND_COMPLETIONS] : [];
    case "/orchestrator":
      if (argIndex === 0) {
        return [...ORCHESTRATOR_SUBCOMMAND_COMPLETIONS];
      }
      return firstArg === "openrouter" && argIndex === 1
        ? [...OPENROUTER_MODEL_SHORTCUT_COMPLETIONS]
        : [];
    case "/delegate":
      if (argIndex === 0) {
        return [...DELEGATE_SUBCOMMAND_COMPLETIONS];
      }
      if (firstArg === "add" && argIndex === 2) {
        return [...DELEGATE_ADAPTER_COMPLETIONS];
      }
      if (firstArg === "add" && secondArg && thirdArg === "openrouter" && argIndex === 3) {
        return [...OPENROUTER_MODEL_SHORTCUT_COMPLETIONS];
      }
      return [];
    case "/resume":
      return argIndex === 0 ? [...RESUME_SELECTOR_COMPLETIONS] : [];
    default:
      return [];
  }
}

function isMcpProfileSubcommand(subcommand: string | undefined): boolean {
  return (
    subcommand === "inspect" ||
    subcommand === "tools" ||
    subcommand === "discover" ||
    subcommand === "enable" ||
    subcommand === "disable"
  );
}

function renderCommandPaletteForOutput(query: string | undefined, stream: WritableLike): string {
  if (!shouldUseAnsiColor({ stream })) {
    return renderCommandPalette(query);
  }

  return renderCompactCommandPalette(query, {
    width: resolveOutputWidth(stream),
    renderOptions: { stream },
  });
}

function renderCompactCommandPaletteLine(
  command: SlashCommandMetadata,
  usageWidth: number,
  width: number,
  renderer: TerminalRenderer,
): string {
  const aliasText =
    command.aliases.length > 0
      ? renderer.dim(` aliases ${command.aliases.join(", ")}`)
      : "";
  const usage = renderer.accent(command.usage.padEnd(usageWidth));
  return truncateVisible(`  ${usage} ${command.description}${aliasText}`, width);
}

function normalizeCompactPaletteWidth(width: number | undefined): number {
  if (typeof width !== "number" || !Number.isFinite(width)) {
    return DEFAULT_COMPACT_PALETTE_WIDTH;
  }

  return Math.max(
    MIN_COMPACT_PALETTE_WIDTH,
    Math.min(MAX_COMPACT_PALETTE_WIDTH, Math.floor(width)),
  );
}

function normalizeCompactPaletteLimit(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return MAX_COMPACT_PALETTE_MATCHES;
  }

  return Math.max(1, Math.min(20, Math.floor(limit)));
}

function resolveOutputWidth(stream: WritableLike): number {
  const columns = (stream as { columns?: unknown }).columns;
  return typeof columns === "number" ? columns : DEFAULT_COMPACT_PALETTE_WIDTH;
}

function truncateVisible(value: string, width: number): string {
  const plain = stripAnsi(value);
  if (plain.length <= width) {
    return value;
  }

  if (width <= 1) {
    return "…";
  }

  return `${plain.slice(0, width - 1)}…`;
}

function stripAnsi(value: string): string {
  return value.replace(ANSI_PATTERN, "");
}

function renderGroupedCommandList({
  title,
  commands,
  groupOrder,
  emptyMessage,
  footer,
}: {
  title: string;
  commands: SlashCommandMetadata[];
  groupOrder: SlashCommandGroup[];
  emptyMessage?: string;
  footer?: string;
}): string {
  const lines = [title];

  if (commands.length === 0) {
    lines.push(emptyMessage ?? "No commands matched.");
    if (footer) {
      lines.push("", footer);
    }
    return lines.join("\n");
  }

  const usageWidth = Math.min(
    32,
    Math.max(12, ...commands.map((command) => command.usage.length)),
  );

  for (const group of groupOrder) {
    const groupedCommands = commands.filter((command) => command.group === group);
    if (groupedCommands.length === 0) {
      continue;
    }

    lines.push("", `${group}:`);
    for (const command of groupedCommands) {
      lines.push(renderCommandHelpLine(command, usageWidth));
    }
  }

  if (footer) {
    lines.push("", footer);
  }

  return lines.join("\n");
}

function renderCommandHelpLine(command: SlashCommandMetadata, usageWidth: number): string {
  const aliases =
    command.aliases.length > 0 ? ` (aliases: ${command.aliases.join(", ")})` : "";
  return `  ${command.usage.padEnd(usageWidth)} ${command.description}${aliases}`;
}

function renderInteractiveStatus(context: SlashCommandContext): string {
  const renderer = createTerminalRenderer({ stream: context.io.stdout });
  const loadedConfig = {
    ...context.loadedConfig,
    config: context.getConfig(),
  };
  const latestMetadata = context.getLatestMetadata();
  const contextState = getContextState(context.getMessages(), context.getContextBudget?.());
  const costState =
    context.getCostMeterState?.() ?? createSessionCostMeterState(latestMetadata);
  const diffState = context.getDiffState?.();
  const sessionInfo = context.getSessionInfo?.();

  return [
    formatStatus({
      cwd: context.io.cwd,
      loadedConfig,
      mcpConfigPath: context.mcpConfigPath,
      pluginRegistryPath: context.pluginRegistryPath,
      delegationState: getDelegationState(context),
      renderOptions: { stream: context.io.stdout },
    }),
    `history_messages: ${context.getMessages().length}`,
    `evidence_sources: ${context.getEvidenceSources?.().length ?? 0}`,
    `context: ${formatContextState(contextState)}`,
    `context_meter: ${formatContextUsageMeter(contextState, renderer)}`,
    `cost_meter: ${formatSessionCostMeter(costState, renderer)}`,
    sessionInfo ? `session: ${sessionInfo.id} (${sessionInfo.path})` : undefined,
    diffState ? `diff_state: ${formatSessionDiffState(diffState)}` : undefined,
    latestMetadata
      ? `latest_metadata:\n${indent(formatOpenRouterMetadata(latestMetadata).trim())}`
      : "latest_metadata: none",
  ]
    .filter((line): line is string => typeof line === "string")
    .join("\n");
}

async function handleWebCommand(command: SlashCommand, context: SlashCommandContext): Promise<void> {
  const subcommand = command.args[0]?.toLowerCase();

  if (!subcommand || subcommand === "help") {
    writeLine(context.io.stdout, webHelpText());
    return;
  }

  if (subcommand === "fetch") {
    await fetchWebUrl(command.args.slice(1).join(" ").trim(), context);
    return;
  }

  if (subcommand === "search") {
    await searchWebQuery(command.args.slice(1).join(" ").trim(), context);
    return;
  }

  if (subcommand === "browse") {
    await browseWebUrl(command.args.slice(1).join(" ").trim(), context);
    return;
  }

  writeLine(context.io.stderr, "Usage: /web [fetch <url>|search <query>|browse <url>]");
}

async function fetchWebUrl(rawUrl: string, context: SlashCommandContext): Promise<void> {
  const url = rawUrl.trim();
  if (!url) {
    writeLine(context.io.stderr, "Usage: /web fetch <url>");
    return;
  }

  const sources = context.getEvidenceSources?.() ?? [];
  try {
    const result = await fetchUrl({
      url,
      sourceId: nextEvidenceSourceId(sources),
      fetch: context.webFetch,
    });
    context.setEvidenceSources?.([...sources, result.source]);
    context.setMessages([
      ...context.getMessages(),
      createUntrustedWebContextMessage(result.source, result.extracted.text),
    ]);
    writeLine(context.io.stdout, formatFetchedUrlResult(result));
  } catch (error) {
    writeLine(context.io.stderr, `Unable to fetch URL: ${formatResearchFetchError(error)}`);
  }
}

async function searchWebQuery(rawQuery: string, context: SlashCommandContext): Promise<void> {
  const query = rawQuery.trim();
  if (!query) {
    writeLine(context.io.stderr, "Usage: /web search <query>");
    return;
  }

  const apiKey = context.braveSearchApiKey?.trim();
  if (!apiKey) {
    writeLine(
      context.io.stderr,
      "Web search unavailable: BRAVE_SEARCH_API_KEY is not set. No network request was made.",
    );
    return;
  }

  const sources = context.getEvidenceSources?.() ?? [];
  try {
    const result = await searchWeb({
      query,
      apiKey,
      existingSources: sources,
      fetch: context.webSearchFetch,
    });
    const nextSources = result.results.map((entry) => entry.source);
    if (nextSources.length > 0) {
      context.setEvidenceSources?.([...sources, ...nextSources]);
      context.setMessages([
        ...context.getMessages(),
        createUntrustedSearchContextMessage(result),
      ]);
    }
    writeLine(context.io.stdout, formatSearchResults(result));
  } catch (error) {
    writeLine(context.io.stderr, `Unable to search web: ${formatResearchSearchError(error, apiKey)}`);
  }
}

async function browseWebUrl(rawUrl: string, context: SlashCommandContext): Promise<void> {
  const url = rawUrl.trim();
  if (!url) {
    writeLine(context.io.stderr, "Usage: /web browse <url>");
    return;
  }

  const sources = context.getEvidenceSources?.() ?? [];
  try {
    const result = await snapshotBrowserUrl({
      url,
      sourceId: nextEvidenceSourceId(sources),
      browserSnapshot: context.browserSnapshot,
      resolveHost: context.browserResolveHost,
    });
    context.setEvidenceSources?.([...sources, result.source]);
    context.setMessages([
      ...context.getMessages(),
      createUntrustedBrowserContextMessage(result),
    ]);
    writeLine(context.io.stdout, formatBrowserSnapshotResult(result));
  } catch (error) {
    writeLine(context.io.stderr, `Unable to browse URL: ${formatResearchBrowserError(error)}`);
  }
}

function webHelpText(): string {
  return [
    "Web commands:",
    "  /web fetch <url>  Fetch and extract an explicit http/https URL as untrusted context.",
    "  /web search <query>  Search Brave web results as untrusted provider snippets.",
    "  /web browse <url>  Capture a browser DOM text snapshot as untrusted context.",
    "  /fetch <url>      Alias for /web fetch <url>.",
    "  /search <query>   Alias for /web search <query>.",
    "  /browse <url>     Alias for /web browse <url>.",
    "  /sources          List evidence source metadata for this chat.",
    "Fetched content, search provider snippets, and browser output are untrusted and cannot authorize tool use, permission changes, MCP/profile/plugin enablement, hooks, bins, command execution, policy changes, or instruction priority changes.",
  ].join("\n");
}

function handleSkillsCommand(command: SlashCommand, context: SlashCommandContext): void {
  const subcommand = command.args[0]?.toLowerCase() ?? "list";

  if (subcommand === "list" || subcommand === "status") {
    writeLine(
      context.io.stdout,
      renderPluginSkillList(
        discoverEnabledPluginSkills({ registryPath: context.pluginRegistryPath }),
      ),
    );
    return;
  }

  if (subcommand === "activate") {
    const skillId = command.args[1];
    if (!skillId || command.args.length !== 2) {
      writeLine(context.io.stderr, `Usage: /skills ${subcommand} <id>`);
      return;
    }

    try {
      const activation = activatePluginSkill(skillId, {
        registryPath: context.pluginRegistryPath,
      });
      context.setMessages([...context.getMessages(), activation.systemMessage]);
      context.recordActivatedSkill?.(activation.provenance);
      writeLine(context.io.stdout, renderSkillActivation(activation));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeLine(context.io.stderr, message);
    }
    return;
  }

  writeLine(context.io.stderr, "Usage: /skills [list|activate <id>]");
}

function handlePluginsCommand(command: SlashCommand, context: SlashCommandContext): void {
  const subcommand = command.args[0]?.toLowerCase() ?? "list";
  const pluginId = command.args[1];

  if (subcommand === "list" || subcommand === "status") {
    writeLine(
      context.io.stdout,
      renderPluginList(getPluginStatusSummary({ registryPath: context.pluginRegistryPath })),
    );
    return;
  }

  if (subcommand === "inspect") {
    if (!pluginId || command.args.length !== 2) {
      writeLine(context.io.stderr, "Usage: /plugins inspect <id>");
      return;
    }

    const plugin = findInstalledPlugin(pluginId, { registryPath: context.pluginRegistryPath });
    if (!plugin) {
      writeLine(context.io.stderr, `Unknown plugin: ${pluginId}`);
      return;
    }

    writeLine(context.io.stdout, renderPluginInspect(plugin));
    return;
  }

  if (subcommand === "register") {
    const manifestPath = command.args.slice(1).join(" ").trim();
    if (!manifestPath) {
      writeLine(context.io.stderr, "Usage: /plugins register <manifest-path>");
      return;
    }

    try {
      const result = registerPluginManifest(manifestPath, {
        registryPath: context.pluginRegistryPath,
      });
      writeLine(context.io.stdout, result.message);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeLine(context.io.stderr, message);
    }
    return;
  }

  if (subcommand === "enable" || subcommand === "disable") {
    if (!pluginId || command.args.length !== 2) {
      writeLine(context.io.stderr, `Usage: /plugins ${subcommand} <id>`);
      return;
    }

    try {
      const result = setPluginEnabledState(pluginId, subcommand === "enable", {
        registryPath: context.pluginRegistryPath,
      });
      if (!result.ok) {
        writeLine(context.io.stderr, result.message);
        return;
      }

      writeLine(context.io.stdout, result.message);
    } catch (error) {
      writeLine(
        context.io.stderr,
        `Unable to persist plugin registry state${formatErrorCode(error)}.`,
      );
    }
    return;
  }

  writeLine(
    context.io.stderr,
    "Usage: /plugins [list|inspect <id>|register <manifest-path>|enable <id>|disable <id>]",
  );
}

function handleOrchestratorCommand(command: SlashCommand, context: SlashCommandContext): void {
  const subcommand = command.args[0]?.toLowerCase();

  if (!subcommand || subcommand === "status") {
    writeLine(context.io.stdout, renderOrchestratorStatus(getDelegationState(context)));
    return;
  }

  if (subcommand === "clear") {
    if (command.args.length !== 1) {
      writeLine(context.io.stderr, "Usage: /orchestrator clear");
      return;
    }

    if (!setDelegationState(context, clearController(getDelegationState(context)))) {
      return;
    }
    writeLine(context.io.stdout, "Orchestration controller cleared. Execution remains disabled.");
    return;
  }

  if (subcommand === "openrouter") {
    if (command.args.length !== 2) {
      writeLine(context.io.stderr, "Usage: /orchestrator openrouter <model>");
      return;
    }

    try {
      const nextState = setOpenRouterController(getDelegationState(context), command.args[1]);
      if (!setDelegationState(context, nextState)) {
        return;
      }
      writeLine(
        context.io.stdout,
        `Orchestration controller set: openrouter ${nextState.controller?.model}. Execution remains disabled.`,
      );
    } catch (error) {
      writeLine(context.io.stderr, formatDelegationError(error));
    }
    return;
  }

  writeLine(context.io.stderr, "Usage: /orchestrator [openrouter <model>|clear]");
}

function handleDelegateCommand(command: SlashCommand, context: SlashCommandContext): void {
  const subcommand = command.args[0]?.toLowerCase();

  if (!subcommand || subcommand === "help") {
    writeLine(
      context.io.stdout,
      [
        "Delegate commands:",
        "  /delegate add <name> openrouter <model>",
        "  /delegate remove <name>",
        "  /delegate clear",
        "  /delegates",
        "Execution is disabled; delegate_task is unavailable in this scaffold.",
      ].join("\n"),
    );
    return;
  }

  if (subcommand === "add") {
    if (command.args.length !== 4 || command.args[2]?.toLowerCase() !== "openrouter") {
      writeLine(context.io.stderr, "Usage: /delegate add <name> openrouter <model>");
      return;
    }

    try {
      const result = addOpenRouterDelegate(
        getDelegationState(context),
        command.args[1],
        command.args[3],
      );
      if (!setDelegationState(context, result.state)) {
        return;
      }
      writeLine(
        context.io.stdout,
        `${result.created ? "Registered" : "Updated"} delegate ${result.delegate.name}: openrouter ${result.delegate.model}. Execution remains disabled.`,
      );
    } catch (error) {
      writeLine(context.io.stderr, formatDelegationError(error));
    }
    return;
  }

  if (subcommand === "remove") {
    if (command.args.length !== 2) {
      writeLine(context.io.stderr, "Usage: /delegate remove <name>");
      return;
    }

    try {
      const result = removeDelegate(getDelegationState(context), command.args[1]);
      if (!setDelegationState(context, result.state)) {
        return;
      }
      writeLine(
        context.io.stdout,
        `Removed delegate ${result.removed.name}. Execution remains disabled.`,
      );
    } catch (error) {
      writeLine(context.io.stderr, formatDelegationError(error));
    }
    return;
  }

  if (subcommand === "clear") {
    if (command.args.length !== 1) {
      writeLine(context.io.stderr, "Usage: /delegate clear");
      return;
    }

    if (!setDelegationState(context, clearDelegates(getDelegationState(context)))) {
      return;
    }
    writeLine(context.io.stdout, "Delegates cleared. Execution remains disabled.");
    return;
  }

  writeLine(context.io.stderr, "Usage: /delegate <add|remove|clear>");
}

async function handleMcpCommand(command: SlashCommand, context: SlashCommandContext): Promise<void> {
  const subcommand = command.args[0]?.toLowerCase() ?? "list";
  const profileId = command.args[1];

  if (subcommand === "list" || subcommand === "status") {
    const summary = getMcpStatusSummary({ configPath: context.mcpConfigPath });
    tryWriteMcpAuditEvent(context, {
      type: "mcp.profile.status",
      ok: true,
      details: {
        activeProfileIds: summary.activeProfileIds,
        registryHash: summary.registryHash,
        pendingSchemaChangeCount: summary.pendingSchemaChangeCount,
      },
    });
    writeLine(context.io.stdout, renderMcpStatus(summary));
    return;
  }

  if (subcommand === "inspect") {
    if (!profileId || command.args.length !== 2) {
      writeLine(context.io.stderr, "Usage: /mcp inspect <profile>");
      return;
    }

    const summary = getMcpStatusSummary({ configPath: context.mcpConfigPath });
    const profile = findMcpProfile(profileId, { configPath: context.mcpConfigPath });
    tryWriteMcpAuditEvent(context, {
      type: "mcp.profile.inspect",
      profileId,
      ok: Boolean(profile),
      details: profile
        ? {
            state: profile.state,
            transport: profile.transport.kind,
            authRequired: profile.authRequired,
            writeCapable: profile.writeCapable,
            profileHash: hashMcpProfile(profile),
            trustedProfileHash: summary.trustedProfileHashes[profile.id],
            schemaChangePending: summary.pendingSchemaChangeProfileIds.includes(profile.id),
          }
        : undefined,
    });

    if (!profile) {
      writeLine(context.io.stderr, `Unknown MCP profile: ${profileId}`);
      return;
    }

    writeLine(
      context.io.stdout,
      renderMcpProfileInspect(profile, {
        trustedProfileHash: summary.trustedProfileHashes[profile.id],
        updatedAt: summary.profileUpdatedAt[profile.id],
        schemaChangePending: summary.pendingSchemaChangeProfileIds.includes(profile.id),
      }),
    );
    return;
  }

  if (subcommand === "tools") {
    if (!profileId || command.args.length !== 2) {
      writeLine(context.io.stderr, "Usage: /mcp tools <profile>");
      return;
    }

    const report = getMcpProfileToolPolicyReport(profileId, { configPath: context.mcpConfigPath });
    tryWriteMcpAuditEvent(context, {
      type: "mcp.profile.tools",
      profileId,
      ok: Boolean(report),
      details: report
        ? {
            state: report.profile.state,
            profileHash: report.profileHash,
            trustedProfileHash: report.trustedProfileHash,
            schemaChangePending: report.schemaChangePending,
            toolCount: report.evaluations.length,
            allowedCount: report.evaluations.filter((evaluation) => evaluation.decision === "allowed")
              .length,
            deniedCount: report.evaluations.filter((evaluation) => evaluation.decision === "denied")
              .length,
          }
        : undefined,
    });

    if (!report) {
      writeLine(context.io.stderr, `Unknown MCP profile: ${profileId}`);
      return;
    }

    writeLine(context.io.stdout, renderMcpProfileTools(report));
    return;
  }

  if (subcommand === "discover") {
    if (!profileId || command.args.length !== 2) {
      writeLine(context.io.stderr, "Usage: /mcp discover <profile>");
      return;
    }

    const result = await discoverMcpProfile(profileId, {
      configPath: context.mcpConfigPath,
      fetch: context.fetch,
    });
    tryWriteMcpAuditEvent(context, {
      type: "mcp.profile.discovery_attempt",
      profileId,
      ok: result.ok,
      details: {
        status: result.status,
        networkAttempted: result.networkAttempted,
        transport: result.transport,
        url: result.url,
        authRequired: result.authRequired,
        profileHash: result.profileHash,
        trustedProfileHash: result.trustedProfileHash,
        schemaChangePending: result.schemaChangePending,
        httpStatus: result.httpStatus,
        serverInfo: result.serverInfo,
        protocolVersion: result.protocolVersion,
        capabilityKeys: result.capabilityKeys,
        error: result.error,
        message: result.message,
      },
    });

    const output = formatMcpDiscoveryResult(result);
    if (
      result.status === "not_found" ||
      result.status === "network_error" ||
      result.status === "remote_error" ||
      result.status === "invalid_response"
    ) {
      writeLine(context.io.stderr, output);
      return;
    }

    writeLine(context.io.stdout, output);
    return;
  }

  if (subcommand === "enable" || subcommand === "disable") {
    if (!profileId || command.args.length !== 2) {
      writeLine(context.io.stderr, `Usage: /mcp ${subcommand} <profile>`);
      return;
    }

    let result: ReturnType<typeof setMcpProfilePersistentState>;
    try {
      result = setMcpProfilePersistentState(
        profileId,
        subcommand === "enable" ? "enabled" : "disabled",
        { configPath: context.mcpConfigPath },
      );
    } catch (error) {
      tryWriteMcpAuditEvent(context, {
        type:
          subcommand === "enable"
            ? "mcp.profile.enable_attempt"
            : "mcp.profile.disable_attempt",
        profileId,
        ok: false,
        details: {
          message: "Unable to persist MCP profile state.",
          error: formatErrorForMcpAudit(error),
        },
      });
      writeLine(context.io.stderr, `Unable to persist MCP profile state${formatErrorCode(error)}.`);
      return;
    }

    tryWriteMcpAuditEvent(context, {
      type:
        subcommand === "enable" ? "mcp.profile.enable_attempt" : "mcp.profile.disable_attempt",
      profileId,
      ok: result.ok,
      details: {
        previousState: result.previousState,
        nextState: result.nextState,
        message: result.message,
        profileHash: result.profile ? hashMcpProfile(result.profile) : undefined,
        trustedProfileHash: result.trustedProfileHash,
        updatedAt: result.updatedAt,
      },
    });

    if (!result.ok) {
      writeLine(context.io.stderr, result.message);
      return;
    }

    writeLine(context.io.stdout, result.message);
    return;
  }

  writeLine(
    context.io.stderr,
    "Usage: /mcp [list|inspect <profile>|tools <profile>|discover <profile>|enable <profile>|disable <profile>]",
  );
}

function formatErrorForMcpAudit(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const code = typeof error === "object" && "code" in error ? String(error.code) : undefined;
  return code ? `${error.name}: ${code}` : error.name;
}

function formatErrorCode(error: unknown): string {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  return code ? ` (${code})` : "";
}

function tryWriteMcpAuditEvent(context: SlashCommandContext, event: McpAuditEvent): void {
  try {
    writeMcpAuditEvent(event, { auditLogPath: context.mcpAuditLogPath });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    const suffix = code ? ` (${code})` : "";
    writeLine(context.io.stderr, `Warning: unable to write MCP audit log${suffix}.`);
  }
}

function getDelegationState(context: SlashCommandContext): DelegationState {
  return context.getDelegationState?.() ?? createEmptyDelegationState();
}

function setDelegationState(context: SlashCommandContext, state: DelegationState): boolean {
  if (!context.setDelegationState) {
    writeLine(context.io.stderr, "Delegation state is not available in this context.");
    return false;
  }
  context.setDelegationState(state);
  return true;
}

function formatDelegationError(error: unknown): string {
  if (error instanceof DelegationStateError) {
    return error.message;
  }
  return "Unable to update delegation state.";
}

function indent(text: string): string {
  return text
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
}

function renderResumeSessionList(sessions: ResumeSessionSummary[]): string {
  if (sessions.length === 0) {
    return "No previous sessions found.";
  }

  const lines = ["Saved sessions:"];
  const renderedSessions = sessions.slice(0, MAX_RENDERED_RESUME_SESSIONS);
  renderedSessions.forEach((session, index) => {
    lines.push(
      [
        `  ${index + 1}. ${session.id}`,
        `updated: ${session.updatedAt}`,
        `mode: ${session.mode}`,
        `model: ${session.model}`,
        `cost: ${formatCost(session.cost)}`,
        `messages: ${session.messageCount}`,
      ].join(" | "),
    );
    lines.push(`     title: ${session.title ?? "(untitled)"}`);
    lines.push(`     cwd: ${session.cwd}`);
  });
  if (sessions.length > renderedSessions.length) {
    lines.push(
      `... ${sessions.length - renderedSessions.length} more sessions omitted; use a longer id prefix.`,
    );
  }
  lines.push("Use /resume <number|id|prefix|latest> to load one.");
  return lines.join("\n");
}

function renderAmbiguousResumeSessions(sessions: ResumeSessionSummary[]): string {
  if (sessions.length === 0) {
    return "No previous sessions found.";
  }

  const lines = ["Matching sessions:"];
  const renderedSessions = sessions.slice(0, MAX_RENDERED_RESUME_SESSIONS);
  for (const session of renderedSessions) {
    lines.push(
      [
        `  - ${session.id}`,
        `updated: ${session.updatedAt}`,
        `mode: ${session.mode}`,
        `model: ${session.model}`,
        `cost: ${formatCost(session.cost)}`,
        `messages: ${session.messageCount}`,
      ].join(" | "),
    );
    lines.push(`    title: ${session.title ?? "(untitled)"}`);
    lines.push(`    cwd: ${session.cwd}`);
  }
  if (sessions.length > renderedSessions.length) {
    lines.push(
      `... ${sessions.length - renderedSessions.length} more sessions omitted; use a longer id prefix.`,
    );
  }
  lines.push("Use /resume <exact-id> or a longer unique id prefix.");
  return lines.join("\n");
}

function renderResumedSession(session: ResumeSessionSummary): string {
  return [
    `Resumed session ${session.id}.`,
    `title: ${session.title ?? "(untitled)"}`,
    `messages: ${session.messageCount}`,
    `cwd: ${session.cwd}`,
    `model: ${session.model}`,
    `mode: ${session.mode}`,
    `cost: ${formatCost(session.cost)}`,
  ].join(" ");
}

function formatCost(cost: number | undefined): string {
  return typeof cost === "number" ? `$${cost.toFixed(6)}` : "n/a";
}

function writeLine(stream: WritableLike, text: string) {
  stream.write(`${text}\n`);
}
