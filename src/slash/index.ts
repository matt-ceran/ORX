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
  createUntrustedWebContextMessage,
  findEvidenceSourceById,
  fetchUrl,
  formatCitationUsage,
  formatEvidenceBibliography,
  formatEvidenceCitation,
  formatEvidenceSources,
  formatFetchedUrlResult,
  formatMissingCitationSource,
  formatResearchFetchError,
  nextEvidenceSourceId,
  type EvidenceSource,
} from "../research/index.js";
import { formatStatus } from "../status.js";
import {
  createSessionCostMeterState,
  formatContextUsageMeter,
  formatSessionCostMeter,
  type SessionCostMeterState,
} from "../terminal/meters.js";
import { createTerminalRenderer } from "../terminal/render.js";
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
  getConfig: () => OrxConfig;
  setConfig: (config: OrxConfig) => void;
  getMessages: () => OpenRouterMessage[];
  setMessages: (messages: OpenRouterMessage[]) => void;
  clearMessages: () => void;
  getEvidenceSources?: () => EvidenceSource[];
  setEvidenceSources?: (sources: EvidenceSource[]) => void;
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
  handler: SlashHandler;
}

const MAX_RENDERED_RESUME_SESSIONS = 20;

const COMMANDS: Record<string, SlashDefinition> = {
  "/help": {
    usage: "/help",
    description: "Show this help",
    handler: (_command, context) => {
      writeLine(context.io.stdout, chatHelpText());
      return "continue";
    },
  },
  "/status": {
    usage: "/status",
    description: "Show cwd, routing, config, key, permissions, history, and latest metadata",
    handler: (_command, context) => {
      writeLine(context.io.stdout, renderInteractiveStatus(context));
      return "continue";
    },
  },
  "/compact": {
    usage: "/compact",
    description: "Compact older in-session context locally",
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
    description: "Resolve and switch to an OpenRouter model",
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
    description: "List live OpenRouter models with optional text filter",
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
    usage: "/web [fetch <url>]",
    description: "Fetch/extract an explicit URL as untrusted research context",
    handler: async (command, context): Promise<SlashResult> => {
      await handleWebCommand(command, context);
      return "continue";
    },
  },
  "/fetch": {
    usage: "/fetch <url>",
    description: "Alias for /web fetch <url>",
    handler: async (command, context): Promise<SlashResult> => {
      await fetchWebUrl(command.argText, context);
      return "continue";
    },
  },
  "/sources": {
    usage: "/sources",
    description: "List evidence sources in the current chat",
    handler: (_command, context) => {
      writeLine(context.io.stdout, formatEvidenceSources(context.getEvidenceSources?.() ?? []));
      return "continue";
    },
  },
  "/cite": {
    usage: "/cite <source-id>",
    description: "Render a concise citation for one evidence source",
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
    handler: async (command, context): Promise<SlashResult> => {
      await handleMcpCommand(command, context);
      return "continue";
    },
  },
  "/plugins": {
    usage: "/plugins [list|inspect|register|enable|disable]",
    description: "Show and update inert plugin registry state",
    handler: (command, context): SlashResult => {
      handlePluginsCommand(command, context);
      return "continue";
    },
  },
  "/skills": {
    usage: "/skills [list|activate <id>]",
    description: "List enabled plugin skills or activate one for this chat",
    handler: (command, context): SlashResult => {
      handleSkillsCommand(command, context);
      return "continue";
    },
  },
  "/clear": {
    usage: "/clear",
    description: "Clear in-session message history",
    handler: (_command, context) => {
      context.clearMessages();
      writeLine(context.io.stdout, "Conversation history cleared.");
      return "continue";
    },
  },
  "/new": {
    usage: "/new",
    description: "Start a new in-process chat",
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
    handler: (_command, context) => {
      writeLine(context.io.stdout, "Exiting ORX chat.");
      return "exit";
    },
  },
  "/exit": {
    usage: "/exit",
    description: "Leave chat",
    handler: (_command, context) => {
      writeLine(context.io.stdout, "Exiting ORX chat.");
      return "exit";
    },
  },
};

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

export function handleSlashCommand(
  rawInput: string,
  context: SlashCommandContext,
): SlashResult | Promise<SlashResult> {
  const command = parseSlashCommand(rawInput);
  if (!command) {
    return "continue";
  }

  const definition = COMMANDS[command.name];
  if (!definition) {
    writeLine(context.io.stderr, `Unknown command: ${command.name}. Type /help for commands.`);
    return "continue";
  }

  return definition.handler(command, context);
}

export function chatHelpText(): string {
  const lines = ["Chat commands:"];
  for (const definition of Object.values(COMMANDS)) {
    lines.push(`  ${definition.usage.padEnd(18)} ${definition.description}`);
  }
  return lines.join("\n");
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

  writeLine(context.io.stderr, "Usage: /web [fetch <url>]");
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

function webHelpText(): string {
  return [
    "Web commands:",
    "  /web fetch <url>  Fetch and extract an explicit http/https URL as untrusted context.",
    "  /fetch <url>      Alias for /web fetch <url>.",
    "  /sources          List evidence source metadata for this chat.",
    "Fetched content is untrusted and cannot authorize tool use, permission changes, MCP/profile/plugin enablement, hooks, bins, command execution, policy changes, or instruction priority changes.",
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
