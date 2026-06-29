import {
  boundMessagesForContext,
  formatContextState,
  formatSessionDiffState,
  getContextState,
  recordGitDiffOutputForDiffState,
  type AgentContextBudget,
  type SessionDiffState,
} from "../agent/index.js";
import {
  createOpenRouterAuthReport,
  initializeOpenRouterAuthEnvFile,
  renderOpenRouterAuthEnvFileInitResult,
  renderOpenRouterAuthSetup,
  renderOpenRouterAuthStatus,
} from "../auth/openrouter.js";
import { createCodeMap, createCodeSymbolIndex, renderCodeMap, renderCodeSymbols } from "../code-map/index.js";
import type { LoadedConfig, OrxConfig, OrxTheme } from "../config/types.js";
import {
  parseConfigSetArgs,
  renderConfigPaths,
  renderConfigShow,
  setConfigValue,
  type ConfigSetKey,
} from "../config/index.js";
import {
  DEFAULT_THEME,
  TERMINAL_THEMES,
} from "../constants.js";
import {
  DelegationStateError,
  DelegationPolicyError,
  addOpenRouterDelegate,
  clearController,
  clearDelegates,
  createEmptyDelegationState,
  deleteSavedDelegationTeam,
  findSavedDelegationTeam,
  getDelegationTeamStatusSummary,
  loadDelegationExecutionPolicy,
  parseDelegationExecutionPolicySetArgs,
  removeDelegate,
  renderDelegates,
  renderDelegationExecutionPolicy,
  renderDelegationReadinessPlan,
  renderDelegationTeamInspect,
  renderDelegationTeamList,
  renderDelegationTeamUse,
  renderOrchestratorStatus,
  saveDelegationTeam,
  setOpenRouterController,
  updateDelegationExecutionPolicy,
  type DelegationState,
} from "../delegation/index.js";
import {
  allowMcpModelToolGrant,
  allowMcpToolGrant,
  callRemoteMcpTool,
  deleteMcpMacosKeychainBearer,
  discoverMcpProfile,
  findMcpProviderPreset,
  formatMcpProviderPresetIdForMessage,
  formatMcpToolCallResult,
  formatMcpDiscoveryResult,
  formatMcpRemoteToolImportResult,
  formatMcpRemoteToolsResult,
  getMcpMacosKeychainStatus,
  getMcpProfileToolPolicyReport,
  getMcpProfileAuthReport,
  getMcpStatusSummary,
  hashMcpProfile,
  importRemoteMcpTools,
  initializeMcpAuthEnvFile,
  installMcpProviderPreset,
  loadUserMcpProfileCatalog,
  listRemoteMcpTools,
  renderMcpAuthEnvFileInitResult,
  renderMcpMacosKeychainResult,
  renderMcpProviderPresetInspect,
  renderMcpProviderPresets,
  renderMcpProfileAuthReport,
  renderMcpProfileAuthSetup,
  renderMcpProfileInspect,
  renderMcpProfileTools,
  renderMcpStatus,
  renderUserMcpProfileCatalog,
  resolveMcpBearerCredential,
  removeUserMcpProfile,
  removeUserMcpProfileTool,
  revokeMcpModelToolGrant,
  revokeMcpToolGrant,
  setMcpMacosKeychainBearerPrompt,
  setMcpProfilePersistentState,
  upsertUserMcpProfileTool,
  upsertUserMcpRemoteProfile,
  writeMcpAuditEvent,
  type McpAuditEvent,
  type McpMacosKeychainCommandRunner,
  type McpToolRisk,
  type ResolveMcpHost,
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
  activatePluginPrompt,
  activatePluginRule,
  activatePluginSkill,
  createPluginReview,
  discoverEnabledPluginBins,
  discoverEnabledPluginCommandAliases,
  discoverEnabledPluginHooks,
  discoverEnabledPluginPrompts,
  discoverEnabledPluginRules,
  discoverEnabledPluginSkills,
  findDiscoveredBin,
  findDiscoveredHook,
  findPluginCatalogEntry,
  findPluginCommandAlias,
  findInstalledPlugin,
  formatBinIdForMessage,
  formatHookIdForMessage,
  formatPluginCatalogIdForMessage,
  formatPluginCommandAliasForMessage,
  formatPluginIdForMessage,
  getPluginBinTrustSummary,
  getPluginHookTrustSummary,
  getPluginStatusSummary,
  checkPluginCatalogUpdates,
  installPlugin,
  isPluginCommandAliasName,
  loadPluginCatalog,
  parsePluginCatalogAddGitArgs,
  parsePluginCatalogAddLocalArgs,
  parsePluginScaffoldArgs,
  removePluginCatalogEntry,
  renderPluginBinInspect,
  renderPluginBinRunResult,
  renderPluginBins,
  renderPluginCommandAliases,
  renderPluginHookInspect,
  renderPluginHookRunResult,
  renderPluginHooks,
  renderPluginCatalog,
  renderPluginCatalogInspect,
  renderPluginCatalogUpdateApplyResult,
  renderPluginCatalogUpdateReport,
  renderPluginInspect,
  renderPluginList,
  renderPluginPromptList,
  renderPluginReview,
  renderPluginRuleList,
  renderPluginScaffoldResult,
  renderPluginSkillList,
  renderPluginValidation,
  renderPromptActivation,
  renderRuleActivation,
  renderSkillActivation,
  runPluginBin,
  runPluginHook,
  scaffoldPlugin,
  setPluginEnabledState,
  trustPluginBin,
  trustPluginHook,
  untrustPluginBin,
  untrustPluginHook,
  updatePluginFromCatalog,
  upsertGitPluginCatalogEntry,
  upsertLocalPluginCatalogEntry,
  validatePluginManifestInput,
  type PluginPromptActivationProvenance,
  type PluginRuleActivationProvenance,
  type PluginSkillActivationProvenance,
  type PluginHookEvent,
} from "../plugins/index.js";
import {
  applySavedProfile,
  deleteSavedProfile,
  findSavedProfile,
  getProfileStatusSummary,
  renderProfileInspect,
  renderProfileList,
  saveCurrentProfile,
} from "../profiles/index.js";
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
import {
  discoverTestTargets,
  renderTestRunResult,
  renderTestTargets,
  runTestTarget,
} from "../testing/index.js";
import {
  loadChatHistory,
  renderChatHistory,
  type ChatHistoryEntry,
} from "../tui/history.js";
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
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  fetch?: typeof fetch;
  mcpDiscoveryFetch?: typeof fetch;
  mcpRemoteToolsFetch?: typeof fetch;
  mcpCallFetch?: typeof fetch;
  mcpAuthEnv?: NodeJS.ProcessEnv;
  mcpKeychainRunner?: McpMacosKeychainCommandRunner;
  mcpKeychainPlatform?: NodeJS.Platform;
  mcpResolveHost?: ResolveMcpHost;
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
  getModelMcpEnabled?: () => boolean;
  setModelMcpEnabled?: (enabled: boolean) => void;
  setLatestCredits?: (credits: OpenRouterCreditsInfo) => void;
  mcpAuditLogPath?: string;
  mcpConfigPath?: string;
  mcpProfileCatalogPath?: string;
  pluginCacheDirectory?: string;
  pluginCatalogPath?: string;
  pluginBinsAuditLogPath?: string;
  pluginBinsConfigPath?: string;
  pluginHooksAuditLogPath?: string;
  pluginHooksConfigPath?: string;
  pluginRegistryPath?: string;
  profileConfigPath?: string;
  delegationTeamConfigPath?: string;
  delegationPolicyPath?: string;
  delegationAuditLogPath?: string;
  chatHistoryPath?: string;
  getChatHistoryEntries?: () => ChatHistoryEntry[];
  clearChatHistory?: () => string | undefined;
  recordActivatedPrompt?: (prompt: PluginPromptActivationProvenance) => void;
  recordActivatedRule?: (rule: PluginRuleActivationProvenance) => void;
  recordActivatedSkill?: (skill: PluginSkillActivationProvenance) => void;
  runLifecycleHooks?: (event: PluginHookEvent) => Promise<void>;
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
const SECRET_LIKE_MESSAGE_PATTERN =
  /\b(?:sk-or-v1-[A-Za-z0-9_-]+|github_pat_[A-Za-z0-9_]+|ghp_[A-Za-z0-9_]+|glpat-[A-Za-z0-9_-]+|xox[baprs]-[A-Za-z0-9-]+)\b/i;
const MODE_COMPLETIONS = ["auto", "fusion"] as const;
const FUSION_PRESET_COMPLETIONS = ["general-budget"] as const;
const THEME_COMPLETIONS = [...TERMINAL_THEMES];
const AUTH_SUBCOMMAND_COMPLETIONS = ["status", "show", "setup", "env", "init", "env-file", "help"] as const;
const CONFIG_SUBCOMMAND_COMPLETIONS = ["show", "status", "list", "path", "paths", "set"] as const;
const CONFIG_SET_KEY_COMPLETIONS = [
  "model",
  "mode",
  "fusion_preset",
  "theme",
  "approval_policy",
  "sandbox_mode",
] as const;
const CONFIG_SCOPE_COMPLETIONS = ["--user", "--local"] as const;
const OPENROUTER_MODEL_SHORTCUT_COMPLETIONS = [
  "openrouter/auto",
  "openrouter/fusion",
] as const;
const WEB_SUBCOMMAND_COMPLETIONS = ["help", "fetch", "search", "browse"] as const;
const MCP_SUBCOMMAND_COMPLETIONS = [
  "list",
  "status",
  "catalog",
  "presets",
  "add-preset",
  "add-profile",
  "remove-profile",
  "add-tool",
  "remove-tool",
  "model",
  "inspect",
  "auth",
  "tools",
  "call",
  "remote-tools",
  "import-remote-tools",
  "discover",
  "enable",
  "disable",
  "allow-tool",
  "revoke-tool",
  "allow-model-tool",
  "revoke-model-tool",
] as const;
const MCP_MODEL_SUBCOMMAND_COMPLETIONS = ["status", "enable", "disable"] as const;
const MCP_AUTH_ACTION_COMPLETIONS = ["setup", "env", "init", "env-file", "keychain"] as const;
const MCP_AUTH_KEYCHAIN_ACTION_COMPLETIONS = ["status", "set", "delete"] as const;
const MCP_PROFILE_COMPLETIONS = ["openrouter"] as const;
const MCP_PROVIDER_PRESET_COMPLETIONS = [
  "browser",
  "cloudflare-api",
  "cloudflare-docs",
  "context7",
  "figma",
  "github-readonly",
  "microsoft-learn",
  "sentry-readonly",
] as const;
const MCP_PROVIDER_PRESET_ACTION_COMPLETIONS = [
  "inspect",
  "show",
  "info",
  ...MCP_PROVIDER_PRESET_COMPLETIONS,
] as const;
const MCP_TOOL_RISK_COMPLETIONS = ["read", "write", "destructive", "billable"] as const;
const PLUGIN_SUBCOMMAND_COMPLETIONS = [
  "catalog",
  "list",
  "status",
  "review",
  "doctor",
  "audit",
  "commands",
  "scaffold",
  "validate",
  "inspect",
  "register",
  "install",
  "enable",
  "disable",
] as const;
const PLUGIN_CATALOG_SUBCOMMAND_COMPLETIONS = [
  "list",
  "status",
  "inspect",
  "updates",
  "update",
  "upgrade",
  "apply-update",
  "update-check",
  "check-updates",
  "outdated",
  "add-local",
  "add-git",
  "remove",
] as const;
const PLUGIN_COMMAND_SUBCOMMAND_COMPLETIONS = ["list", "status"] as const;
const BIN_SUBCOMMAND_COMPLETIONS = ["list", "status", "inspect", "trust", "untrust", "run"] as const;
const HOOK_SUBCOMMAND_COMPLETIONS = ["list", "status", "inspect", "trust", "untrust", "run"] as const;
const TEST_SUBCOMMAND_COMPLETIONS = ["list", "status", "run"] as const;
const CODE_SUBCOMMAND_COMPLETIONS = ["map", "symbols"] as const;
const SKILL_SUBCOMMAND_COMPLETIONS = ["list", "status", "activate"] as const;
const PROMPT_SUBCOMMAND_COMPLETIONS = ["list", "status", "activate"] as const;
const RULE_SUBCOMMAND_COMPLETIONS = ["list", "status", "activate"] as const;
const PROFILE_SUBCOMMAND_COMPLETIONS = [
  "list",
  "status",
  "inspect",
  "save",
  "use",
  "delete",
] as const;
const ORCHESTRATOR_SUBCOMMAND_COMPLETIONS = ["status", "plan", "openrouter", "clear"] as const;
const DELEGATE_SUBCOMMAND_COMPLETIONS = ["help", "status", "plan", "add", "remove", "clear", "team", "policy"] as const;
const DELEGATE_ADAPTER_COMPLETIONS = ["openrouter"] as const;
const DELEGATES_SUBCOMMAND_COMPLETIONS = [
  "list",
  "status",
  "plan",
  "policy",
  "teams",
  "save",
  "use",
  "inspect",
  "delete",
] as const;
const DELEGATION_TEAM_SUBCOMMAND_COMPLETIONS = [
  "list",
  "status",
  "save",
  "use",
  "inspect",
  "delete",
] as const;
const DELEGATION_POLICY_SUBCOMMAND_COMPLETIONS = [
  "status",
  "set",
] as const;
const RESUME_SELECTOR_COMPLETIONS = ["latest"] as const;
const HISTORY_SUBCOMMAND_COMPLETIONS = ["search", "clear"] as const;
const COMMON_GROUP_ORDER: SlashCommandGroup[] = [
  "Core",
  "Models & routing",
  "Workspace",
  "Account & metadata",
];
const ADVANCED_GROUP_ORDER: SlashCommandGroup[] = [
  "Account & metadata",
  "Workspace",
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
        renderCommandPaletteForOutput(
          command.argText || undefined,
          context.io.stdout,
          context.getConfig().theme,
        ),
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
  "/theme": {
    usage: "/theme [default|mono|vivid]",
    description: "Show or set the TTY color theme",
    group: "Core",
    tier: "common",
    handler: (command, context) => {
      if (!command.argText) {
        writeLine(context.io.stdout, `Current theme: ${context.getConfig().theme ?? DEFAULT_THEME}`);
        return "continue";
      }

      const theme = command.args[0]?.toLowerCase();
      if (command.args.length !== 1 || !isTerminalTheme(theme)) {
        writeLine(context.io.stderr, "Usage: /theme [default|mono|vivid]");
        return "continue";
      }

      context.setConfig({
        ...context.getConfig(),
        theme,
        activeProfile: undefined,
      });
      writeLine(context.io.stdout, `Theme set to ${theme}.`);
      return "continue";
    },
  },
  "/config": {
    usage: "/config [show|path|set <key> <value>]",
    description: "Inspect or edit safe ORX config keys",
    group: "Core",
    tier: "common",
    handler: (command, context): SlashResult => {
      handleConfigCommand(command, context);
      return "continue";
    },
  },
  "/auth": {
    usage: "/auth [status|setup|env|init|env-file]",
    description: "Inspect or initialize core OpenRouter auth setup",
    group: "Core",
    tier: "common",
    handler: (command, context): SlashResult => {
      handleOpenRouterAuthCommand(command, context);
      return "continue";
    },
  },
  "/compact": {
    usage: "/compact",
    description: "Compact older in-session context locally",
    group: "Sessions",
    tier: "advanced",
    handler: async (_command, context): Promise<SlashResult> => {
      await context.runLifecycleHooks?.("pre_compact");
      const result = boundMessagesForContext(context.getMessages(), {
        budget: context.getContextBudget?.(),
        force: true,
      });
      context.setMessages(result.messages);

      if (!result.compacted) {
        writeLine(context.io.stdout, `Context unchanged: ${formatContextState(result.after)}.`);
        await context.runLifecycleHooks?.("post_compact");
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
      await context.runLifecycleHooks?.("post_compact");
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
  "/tests": {
    usage: "/tests [list|run <target-id>]",
    description: "Discover or run native test targets",
    group: "Workspace",
    tier: "common",
    aliases: ["/test"],
    handler: async (command, context): Promise<SlashResult> => {
      await handleTestsCommand(command, context);
      return "continue";
    },
  },
  "/map": {
    usage: "/map [path]",
    description: "Render a bounded local repository code map",
    group: "Workspace",
    tier: "common",
    handler: (command, context): SlashResult => {
      writeLine(
        context.io.stdout,
        renderCodeMap(createCodeMap({ cwd: context.io.cwd, targetPath: command.argText || undefined })),
      );
      return "continue";
    },
  },
  "/code": {
    usage: "/code [map|symbols]",
    description: "Run local code intelligence commands",
    group: "Workspace",
    tier: "advanced",
    handler: (command, context): SlashResult => {
      const subcommand = command.args[0]?.toLowerCase() ?? "map";
      if (subcommand === "map") {
        writeLine(
          context.io.stdout,
          renderCodeMap(createCodeMap({
            cwd: context.io.cwd,
            targetPath: command.args.slice(1).join(" ").trim() || undefined,
          })),
        );
        return "continue";
      }
      if (subcommand === "symbols" || subcommand === "symbol") {
        writeLine(
          context.io.stdout,
          renderCodeSymbols(createCodeSymbolIndex({
            cwd: context.io.cwd,
            query: command.args.slice(1).join(" ").trim() || undefined,
          })),
        );
        return "continue";
      }
      writeLine(context.io.stderr, "Usage: /code [map|symbols] [query-or-path]");
      return "continue";
    },
  },
  "/symbols": {
    usage: "/symbols [query]",
    description: "Render local exported symbols",
    group: "Workspace",
    tier: "advanced",
    handler: (command, context): SlashResult => {
      writeLine(
        context.io.stdout,
        renderCodeSymbols(createCodeSymbolIndex({
          cwd: context.io.cwd,
          query: command.argText || undefined,
        })),
      );
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
        activeProfile: undefined,
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
          activeProfile: undefined,
        });
        writeLine(context.io.stdout, "Mode set to auto (model: openrouter/auto).");
        return "continue";
      }

      context.setConfig({
        ...context.getConfig(),
        mode: "fusion",
        model: "openrouter/fusion",
        activeProfile: undefined,
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
        activeProfile: undefined,
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
  "/profile": {
    usage: "/profile [list|save|use|inspect|delete]",
    description: "Manage saved local config profiles",
    group: "Core",
    tier: "common",
    handler: (command, context): SlashResult => {
      handleProfileCommand(command, context);
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
          formatOpenRouterCredits(credits, {
            stream: context.io.stdout,
            theme: context.getConfig().theme,
          }),
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
    usage: "/mcp [list|catalog|presets [inspect]|add-preset|add-profile|add-tool|model|inspect|auth|auth setup|auth env|auth init|auth env-file|auth keychain|tools|call|remote-tools|import-remote-tools|discover|enable|disable|allow-tool|revoke-tool|allow-model-tool|revoke-model-tool]",
    description: "Show and manage MCP profiles, local user catalogs, remote metadata, and tool grants",
    group: "Integrations",
    tier: "advanced",
    handler: async (command, context): Promise<SlashResult> => {
      await handleMcpCommand(command, context);
      return "continue";
    },
  },
  "/plugins": {
    usage: "/plugins [catalog [list|inspect|updates|update|add-local|add-git|remove]|list|review|commands|scaffold|validate|inspect|register|install|enable|disable]",
    description: "Show catalog entries and update inert plugin registry state",
    group: "Integrations",
    tier: "advanced",
    handler: async (command, context): Promise<SlashResult> => {
      await handlePluginsCommand(command, context);
      return "continue";
    },
  },
  "/plugin": {
    usage: "/plugin [list|status]",
    description: "List namespaced plugin command aliases",
    group: "Integrations",
    tier: "advanced",
    handler: (command, context): SlashResult => {
      handlePluginAliasListCommand(command, context);
      return "continue";
    },
  },
  "/bins": {
    usage: "/bins [list|inspect|trust|untrust|run]",
    description: "Review, trust, or manually run plugin bins",
    group: "Integrations",
    tier: "advanced",
    handler: async (command, context): Promise<SlashResult> => {
      await handleBinsCommand(command, context);
      return "continue";
    },
  },
  "/hooks": {
    usage: "/hooks [list|inspect|trust|untrust|run]",
    description: "Review, trust, or manually run plugin hooks",
    group: "Integrations",
    tier: "advanced",
    handler: async (command, context): Promise<SlashResult> => {
      await handleHooksCommand(command, context);
      return "continue";
    },
  },
  "/skills": {
    usage: "/skills [list|status|activate <id>]",
    description: "List enabled plugin skills or activate one for this chat",
    group: "Integrations",
    tier: "advanced",
    handler: (command, context): SlashResult => {
      handleSkillsCommand(command, context);
      return "continue";
    },
  },
  "/prompts": {
    usage: "/prompts [list|status|activate <id>]",
    description: "List enabled plugin prompts or activate one for this chat",
    group: "Integrations",
    tier: "advanced",
    handler: (command, context): SlashResult => {
      handlePromptsCommand(command, context);
      return "continue";
    },
  },
  "/rules": {
    usage: "/rules [list|status|activate <id>]",
    description: "List enabled plugin rules or activate one for this chat",
    group: "Integrations",
    tier: "advanced",
    handler: (command, context): SlashResult => {
      handleRulesCommand(command, context);
      return "continue";
    },
  },
  "/orchestrator": {
    usage: "/orchestrator [status|plan|openrouter <model>|clear]",
    description: "Configure the chat delegation controller metadata",
    group: "Orchestration",
    tier: "advanced",
    handler: (command, context): SlashResult => {
      handleOrchestratorCommand(command, context);
      return "continue";
    },
  },
  "/delegate": {
    usage: "/delegate [help|status|plan|add|remove|clear|team|policy]",
    description: "Register OpenRouter delegates or manage policy/saved teams",
    group: "Orchestration",
    tier: "advanced",
    handler: (command, context): SlashResult => {
      handleDelegateCommand(command, context);
      return "continue";
    },
  },
  "/delegates": {
    usage: "/delegates [list|status|plan|policy|teams|save|use|inspect|delete]",
    description: "List delegates, readiness, policy, or saved teams",
    group: "Orchestration",
    tier: "advanced",
    handler: (command, context): SlashResult => {
      handleDelegatesCommand(command, context);
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
  "/history": {
    usage: "/history [search <query>|clear]",
    description: "Search or clear local prompt history",
    group: "Workspace",
    tier: "common",
    handler: (command, context): SlashResult => {
      handleHistoryCommand(command, context);
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
    if (isPluginCommandAliasName(command.name)) {
      return handlePluginCommandAlias(command, context);
    }

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
    case "/theme":
      return argIndex === 0 ? [...THEME_COMPLETIONS] : [];
    case "/auth":
      return argIndex === 0 ? [...AUTH_SUBCOMMAND_COMPLETIONS] : [];
    case "/config":
      if (argIndex === 0) {
        return [...CONFIG_SUBCOMMAND_COMPLETIONS];
      }
      if (firstArg === "set" && argIndex === 1) {
        return [...CONFIG_SET_KEY_COMPLETIONS];
      }
      if (firstArg === "set" && argIndex === 2) {
        return configValueCompletions(secondArg);
      }
      if (firstArg === "set" && argIndex >= 3) {
        return [...CONFIG_SCOPE_COMPLETIONS];
      }
      return [];
    case "/profile":
      return argIndex === 0 ? [...PROFILE_SUBCOMMAND_COMPLETIONS] : [];
    case "/history":
      return argIndex === 0 ? [...HISTORY_SUBCOMMAND_COMPLETIONS] : [];
    case "/web":
      return argIndex === 0 ? [...WEB_SUBCOMMAND_COMPLETIONS] : [];
    case "/mcp":
      if (argIndex === 0) {
        return [...MCP_SUBCOMMAND_COMPLETIONS];
      }
      if (firstArg === "model" && argIndex === 1) {
        return [...MCP_MODEL_SUBCOMMAND_COMPLETIONS];
      }
      if (firstArg === "auth" && argIndex === 1) {
        return [...MCP_AUTH_ACTION_COMPLETIONS, ...MCP_PROFILE_COMPLETIONS];
      }
      if (
        firstArg === "auth" &&
        isMcpAuthActionWithProfile(secondArg) &&
        argIndex === 2
      ) {
        return [...MCP_PROFILE_COMPLETIONS];
      }
      if (firstArg === "auth" && secondArg === "keychain" && argIndex === 2) {
        return [...MCP_AUTH_KEYCHAIN_ACTION_COMPLETIONS, ...MCP_PROFILE_COMPLETIONS];
      }
      if (
        firstArg === "auth" &&
        secondArg === "keychain" &&
        isMcpKeychainAction(thirdArg) &&
        argIndex === 3
      ) {
        return [...MCP_PROFILE_COMPLETIONS];
      }
      if ((firstArg === "presets" || firstArg === "preset") && argIndex === 1) {
        return [...MCP_PROVIDER_PRESET_ACTION_COMPLETIONS];
      }
      if (
        (firstArg === "presets" || firstArg === "preset") &&
        (secondArg === "inspect" || secondArg === "show" || secondArg === "info") &&
        argIndex === 2
      ) {
        return [...MCP_PROVIDER_PRESET_COMPLETIONS];
      }
      if (firstArg === "add-preset" && argIndex === 1) {
        return [...MCP_PROVIDER_PRESET_COMPLETIONS];
      }
      if (firstArg === "add-tool" && argIndex === 3) {
        return [...MCP_TOOL_RISK_COMPLETIONS];
      }
      return isMcpProfileSubcommand(firstArg) && argIndex === 1
        ? [...MCP_PROFILE_COMPLETIONS]
        : [];
    case "/plugins":
      if (argIndex === 0) {
        return [...PLUGIN_SUBCOMMAND_COMPLETIONS];
      }
      if (firstArg === "catalog" && argIndex === 1) {
        return [...PLUGIN_CATALOG_SUBCOMMAND_COMPLETIONS];
      }
      return [];
    case "/plugin":
      return argIndex === 0 ? [...PLUGIN_COMMAND_SUBCOMMAND_COMPLETIONS] : [];
    case "/bins":
      return argIndex === 0 ? [...BIN_SUBCOMMAND_COMPLETIONS] : [];
    case "/hooks":
      return argIndex === 0 ? [...HOOK_SUBCOMMAND_COMPLETIONS] : [];
    case "/tests":
      return argIndex === 0 ? [...TEST_SUBCOMMAND_COMPLETIONS] : [];
    case "/code":
      return argIndex === 0 ? [...CODE_SUBCOMMAND_COMPLETIONS] : [];
    case "/skills":
      return argIndex === 0 ? [...SKILL_SUBCOMMAND_COMPLETIONS] : [];
    case "/prompts":
      return argIndex === 0 ? [...PROMPT_SUBCOMMAND_COMPLETIONS] : [];
    case "/rules":
      return argIndex === 0 ? [...RULE_SUBCOMMAND_COMPLETIONS] : [];
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
      if ((firstArg === "team" || firstArg === "teams") && argIndex === 1) {
        return [...DELEGATION_TEAM_SUBCOMMAND_COMPLETIONS];
      }
      if (firstArg === "policy" && argIndex === 1) {
        return [...DELEGATION_POLICY_SUBCOMMAND_COMPLETIONS];
      }
      if (firstArg === "add" && argIndex === 2) {
        return [...DELEGATE_ADAPTER_COMPLETIONS];
      }
      if (firstArg === "add" && secondArg && thirdArg === "openrouter" && argIndex === 3) {
        return [...OPENROUTER_MODEL_SHORTCUT_COMPLETIONS];
      }
      return [];
    case "/delegates":
      if (argIndex === 0) {
        return [...DELEGATES_SUBCOMMAND_COMPLETIONS];
      }
      if ((firstArg === "teams" || firstArg === "team") && argIndex === 1) {
        return [...DELEGATION_TEAM_SUBCOMMAND_COMPLETIONS];
      }
      if (firstArg === "policy" && argIndex === 1) {
        return [...DELEGATION_POLICY_SUBCOMMAND_COMPLETIONS];
      }
      return [];
    case "/resume":
      return argIndex === 0 ? [...RESUME_SELECTOR_COMPLETIONS] : [];
    default:
      return [];
  }
}

function isTerminalTheme(value: string | undefined): value is OrxTheme {
  return Boolean(value && (TERMINAL_THEMES as readonly string[]).includes(value));
}

function configValueCompletions(key: string | undefined): string[] {
  if (key === "mode") {
    return [...MODE_COMPLETIONS];
  }
  if (key === "theme") {
    return [...THEME_COMPLETIONS];
  }
  return [];
}

function isMcpAuthActionWithProfile(value: string | undefined): boolean {
  return value === "setup" || value === "env" || value === "init" || value === "env-file";
}

function isMcpKeychainAction(value: string | undefined): boolean {
  return normalizeMcpKeychainAction(value) !== undefined;
}

type ParsedMcpAuthArgs =
  | { kind: "status"; profileId: string }
  | { kind: "setup"; profileId: string }
  | { kind: "init"; profileId: string }
  | { kind: "keychain"; action: "status" | "set" | "delete"; profileId: string };

function parseMcpAuthArgs(args: string[]): ParsedMcpAuthArgs | string {
  const action = args[1]?.toLowerCase();
  if (!action) {
    return mcpAuthUsage();
  }

  if (action === "setup" || action === "env") {
    const profileId = args[2];
    return profileId && args.length === 3 ? { kind: "setup", profileId } : mcpAuthUsage();
  }

  if (action === "init" || action === "env-file") {
    const profileId = args[2];
    return profileId && args.length === 3 ? { kind: "init", profileId } : mcpAuthUsage();
  }

  if (action === "keychain" || action === "macos-keychain") {
    const keychainAction = normalizeMcpKeychainAction(args[2]);
    if (keychainAction) {
      const profileId = args[3];
      return profileId && args.length === 4
        ? { kind: "keychain", action: keychainAction, profileId }
        : mcpAuthUsage();
    }

    const profileId = args[2];
    return profileId && args.length === 3
      ? { kind: "keychain", action: "status", profileId }
      : mcpAuthUsage();
  }

  return args.length === 2 ? { kind: "status", profileId: args[1] } : mcpAuthUsage();
}

function normalizeMcpKeychainAction(value: string | undefined): "status" | "set" | "delete" | undefined {
  if (value === "status" || value === "show" || value === "inspect") {
    return "status";
  }
  if (value === "set" || value === "store" || value === "add" || value === "update") {
    return "set";
  }
  if (value === "delete" || value === "remove" || value === "rm") {
    return "delete";
  }
  return undefined;
}

function mcpAuthUsage(): string {
  return "Usage: /mcp auth <profile> | /mcp auth setup <profile> | /mcp auth env <profile> | /mcp auth init <profile> | /mcp auth env-file <profile> | /mcp auth keychain [status|set|delete] <profile>";
}

function isMcpProfileSubcommand(subcommand: string | undefined): boolean {
  return (
    subcommand === "inspect" ||
    subcommand === "auth" ||
    subcommand === "tools" ||
    subcommand === "call" ||
    subcommand === "remote-tools" ||
    subcommand === "import-remote-tools" ||
    subcommand === "discover" ||
    subcommand === "enable" ||
    subcommand === "disable" ||
    subcommand === "remove-profile" ||
    subcommand === "add-tool" ||
    subcommand === "remove-tool" ||
    subcommand === "allow-tool" ||
    subcommand === "revoke-tool" ||
    subcommand === "allow-model-tool" ||
    subcommand === "revoke-model-tool"
  );
}

function renderCommandPaletteForOutput(
  query: string | undefined,
  stream: WritableLike,
  theme: OrxTheme | undefined,
): string {
  if (!shouldUseAnsiColor({ stream })) {
    return renderCommandPalette(query);
  }

  return renderCompactCommandPalette(query, {
    width: resolveOutputWidth(stream),
    renderOptions: { stream, theme },
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
  const renderer = createTerminalRenderer({
    stream: context.io.stdout,
    theme: context.getConfig().theme,
  });
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
      mcpProfileCatalogPath: context.mcpProfileCatalogPath,
      pluginCacheDirectory: context.pluginCacheDirectory,
      pluginBinsAuditLogPath: context.pluginBinsAuditLogPath,
      pluginBinsConfigPath: context.pluginBinsConfigPath,
      pluginHooksAuditLogPath: context.pluginHooksAuditLogPath,
      pluginHooksConfigPath: context.pluginHooksConfigPath,
      pluginRegistryPath: context.pluginRegistryPath,
      profileConfigPath: context.profileConfigPath,
      delegationTeamConfigPath: context.delegationTeamConfigPath,
      delegationPolicyPath: context.delegationPolicyPath,
      delegationAuditLogPath: context.delegationAuditLogPath,
      delegationState: getDelegationState(context),
      renderOptions: { stream: context.io.stdout, theme: context.getConfig().theme },
    }),
    `history_messages: ${context.getMessages().length}`,
    `evidence_sources: ${context.getEvidenceSources?.().length ?? 0}`,
    `context: ${formatContextState(contextState)}`,
    `context_meter: ${formatContextUsageMeter(contextState, renderer)}`,
    `cost_meter: ${formatSessionCostMeter(costState, renderer)}`,
    `model_mcp_tools: ${context.getModelMcpEnabled?.() ? "enabled" : "disabled"}`,
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

async function handleTestsCommand(command: SlashCommand, context: SlashCommandContext): Promise<void> {
  const subcommand = command.args[0]?.toLowerCase() ?? "list";

  if (subcommand === "list" || subcommand === "status") {
    writeLine(context.io.stdout, renderTestTargets(discoverTestTargets(context.io.cwd)));
    return;
  }

  if (subcommand === "run") {
    const parsed = parseTestRunArgs(command.args.slice(1));
    const result = await runTestTarget({
      cwd: context.io.cwd,
      targetId: parsed.targetId,
      extraArgs: parsed.extraArgs,
    });
    writeLine(result.ok ? context.io.stdout : context.io.stderr, renderTestRunResult(result));
    return;
  }

  writeLine(context.io.stderr, "Usage: /tests [list|run [target-id] [-- args...]]");
}

function parseTestRunArgs(args: string[]): { targetId?: string; extraArgs: string[] } {
  if (args.length === 0) {
    return { extraArgs: [] };
  }
  if (args[0] === "--") {
    return { extraArgs: args.slice(1) };
  }
  if (args[1] === "--") {
    return { targetId: args[0], extraArgs: args.slice(2) };
  }
  return { targetId: args[0], extraArgs: args.slice(1) };
}

function handleOpenRouterAuthCommand(command: SlashCommand, context: SlashCommandContext): void {
  const usage = "Usage: /auth [status|setup|env|init|env-file]";
  const subcommand = command.args[0]?.toLowerCase() ?? "status";
  const options = {
    cwd: context.io.cwd,
    env: context.env,
    homeDir: context.homeDir,
  };

  if (subcommand === "help" || subcommand === "--help" || subcommand === "-h") {
    writeLine(context.io.stdout, usage);
    return;
  }

  const acceptsNoArgs = (commandName: string): boolean => {
    if (command.args.length <= 1) {
      return true;
    }
    writeLine(
      context.io.stderr,
      `Unexpected auth argument for ${commandName}: ${formatAuthArgForMessage(command.args[1])}\n${usage}`,
    );
    return false;
  };

  const report = createOpenRouterAuthReport(options);

  if (subcommand === "status" || subcommand === "show" || subcommand === "list") {
    if (!acceptsNoArgs(subcommand)) {
      return;
    }
    writeLine(context.io.stdout, renderOpenRouterAuthStatus(report));
    return;
  }

  if (subcommand === "setup" || subcommand === "env") {
    if (!acceptsNoArgs(subcommand)) {
      return;
    }
    writeLine(context.io.stdout, renderOpenRouterAuthSetup(report));
    return;
  }

  if (subcommand === "init" || subcommand === "env-file") {
    if (!acceptsNoArgs(subcommand)) {
      return;
    }
    try {
      const result = initializeOpenRouterAuthEnvFile(options);
      const updatedReport = createOpenRouterAuthReport(options);
      writeLine(context.io.stdout, renderOpenRouterAuthEnvFileInitResult(result, updatedReport));
    } catch (error) {
      writeLine(
        context.io.stderr,
        `Unable to initialize OpenRouter auth env file: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return;
  }

  writeLine(
    context.io.stderr,
    `Unknown auth command: ${formatAuthArgForMessage(command.args[0] ?? "")}\n${usage}`,
  );
}

function handleConfigCommand(command: SlashCommand, context: SlashCommandContext): void {
  const subcommand = command.args[0]?.toLowerCase() ?? "show";
  const configPathOptions = {
    cwd: context.io.cwd,
    homeDir: context.homeDir,
    env: context.env,
  };

  if (subcommand === "show" || subcommand === "status" || subcommand === "list") {
    writeLine(
      context.io.stdout,
      renderConfigShow(context.loadedConfig, {
        ...configPathOptions,
        config: context.getConfig(),
        commandPrefix: "/config",
      }),
    );
    return;
  }

  if (subcommand === "path" || subcommand === "paths") {
    writeLine(
      context.io.stdout,
      renderConfigPaths(context.loadedConfig, {
        ...configPathOptions,
        commandPrefix: "/config",
      }),
    );
    return;
  }

  if (subcommand === "set") {
    const parsed = parseConfigSetArgs(
      command.args.slice(1),
      "Usage: /config set <key> <value> [--user|--local]",
    );
    if (typeof parsed === "string") {
      writeLine(context.io.stderr, parsed);
      return;
    }

    try {
      const result = setConfigValue(parsed.key, parsed.value, {
        ...configPathOptions,
        scope: parsed.scope,
      });
      context.setConfig(applyConfigSetResultToConfig(context.getConfig(), result.key, result.value));
      writeLine(
        context.io.stdout,
        [
          "ORX config updated",
          `  key: ${result.key}`,
          `  value: ${result.value}`,
          `  scope: ${result.scope}`,
          `  path: ${result.path}`,
          "  api_key: unchanged",
          "  network_calls: none",
          "  subprocesses: none",
          "  current_chat: updated",
          "  restart_required: no; next invocation uses the saved config",
        ].join("\n"),
      );
    } catch (error) {
      writeLine(
        context.io.stderr,
        `Unable to update config: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return;
  }

  writeLine(context.io.stderr, "Usage: /config [show|path|set <key> <value> [--user|--local]]");
}

function applyConfigSetResultToConfig(config: OrxConfig, key: ConfigSetKey, value: string): OrxConfig {
  const nextConfig: OrxConfig = {
    ...config,
    activeProfile: undefined,
    permissions: { ...config.permissions },
  };

  if (key === "model") {
    nextConfig.model = value;
  } else if (key === "mode") {
    nextConfig.mode = value as OrxConfig["mode"];
  } else if (key === "fusion_preset") {
    nextConfig.fusionPreset = value;
  } else if (key === "theme") {
    nextConfig.theme = value as OrxTheme;
  } else if (key === "approval_policy") {
    nextConfig.permissions.approvalPolicy = value;
  } else {
    nextConfig.permissions.sandboxMode = value;
  }

  return nextConfig;
}

function handleHistoryCommand(command: SlashCommand, context: SlashCommandContext): void {
  const subcommand = command.args[0]?.toLowerCase();
  if (subcommand === "clear") {
    if (command.args.length !== 1) {
      writeLine(context.io.stderr, "Usage: /history clear");
      return;
    }
    if (!context.clearChatHistory) {
      writeLine(context.io.stderr, "Prompt history is not available in this context.");
      return;
    }

    try {
      const rendered = context.clearChatHistory();
      writeLine(context.io.stdout, rendered ?? "Prompt history cleared.");
    } catch (error) {
      writeLine(
        context.io.stderr,
        `Unable to clear prompt history: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return;
  }

  const query = subcommand === "search" ? command.args.slice(1).join(" ") : command.argText;
  try {
    const entries = context.getChatHistoryEntries
      ? context.getChatHistoryEntries()
      : context.chatHistoryPath
        ? loadChatHistory({ historyPath: context.chatHistoryPath })
        : [];
    writeLine(
      context.io.stdout,
      renderChatHistory(entries, {
        query,
        historyPath: context.chatHistoryPath,
      }),
    );
  } catch (error) {
    writeLine(
      context.io.stderr,
      `Unable to read prompt history: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function handleProfileCommand(command: SlashCommand, context: SlashCommandContext): void {
  const subcommand = command.args[0]?.toLowerCase() ?? "list";
  const profileId = command.args[1];

  if (subcommand === "list" || subcommand === "status") {
    writeLine(
      context.io.stdout,
      renderProfileList(
        getProfileStatusSummary({ configPath: context.profileConfigPath }),
        context.getConfig().activeProfile,
      ),
    );
    return;
  }

  if (subcommand === "save") {
    if (!profileId || command.args.length !== 2) {
      writeLine(context.io.stderr, "Usage: /profile save <id>");
      return;
    }

    try {
      const result = saveCurrentProfile(profileId, context.getConfig(), {
        configPath: context.profileConfigPath,
      });
      if (!result.ok) {
        writeLine(context.io.stderr, result.message);
        return;
      }
      writeLine(context.io.stdout, result.message);
    } catch (error) {
      writeLine(context.io.stderr, `Unable to save profile${formatErrorCode(error)}.`);
    }
    return;
  }

  if (subcommand === "use") {
    if (!profileId || command.args.length !== 2) {
      writeLine(context.io.stderr, "Usage: /profile use <id>");
      return;
    }

    const profile = findSavedProfile(profileId, { configPath: context.profileConfigPath });
    if (!profile) {
      writeLine(context.io.stderr, `Unknown profile: ${formatProfileIdForMessage(profileId)}`);
      return;
    }

    context.setConfig(applySavedProfile(context.getConfig(), profile));
    writeLine(
      context.io.stdout,
      `Profile ${profile.id} applied: mode=${profile.config.mode} model=${profile.config.model} theme=${profile.config.theme}.`,
    );
    return;
  }

  if (subcommand === "inspect") {
    if (!profileId || command.args.length !== 2) {
      writeLine(context.io.stderr, "Usage: /profile inspect <id>");
      return;
    }

    const profile = findSavedProfile(profileId, { configPath: context.profileConfigPath });
    if (!profile) {
      writeLine(context.io.stderr, `Unknown profile: ${formatProfileIdForMessage(profileId)}`);
      return;
    }

    writeLine(context.io.stdout, renderProfileInspect(profile));
    return;
  }

  if (subcommand === "delete") {
    if (!profileId || command.args.length !== 2) {
      writeLine(context.io.stderr, "Usage: /profile delete <id>");
      return;
    }

    try {
      const result = deleteSavedProfile(profileId, {
        configPath: context.profileConfigPath,
      });
      if (!result.ok) {
        writeLine(context.io.stderr, result.message);
        return;
      }
      writeLine(context.io.stdout, result.message);
    } catch (error) {
      writeLine(context.io.stderr, `Unable to delete profile${formatErrorCode(error)}.`);
    }
    return;
  }

  writeLine(
    context.io.stderr,
    "Usage: /profile [list|save <id>|use <id>|inspect <id>|delete <id>]",
  );
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

  writeLine(context.io.stderr, "Usage: /skills [list|status|activate <id>]");
}

function handlePromptsCommand(command: SlashCommand, context: SlashCommandContext): void {
  const subcommand = command.args[0]?.toLowerCase() ?? "list";

  if (subcommand === "list" || subcommand === "status") {
    writeLine(
      context.io.stdout,
      renderPluginPromptList(
        discoverEnabledPluginPrompts({ registryPath: context.pluginRegistryPath }),
      ),
    );
    return;
  }

  if (subcommand === "activate") {
    const promptId = command.args[1];
    if (!promptId || command.args.length !== 2) {
      writeLine(context.io.stderr, `Usage: /prompts ${subcommand} <id>`);
      return;
    }

    try {
      const activation = activatePluginPrompt(promptId, {
        registryPath: context.pluginRegistryPath,
      });
      context.setMessages([...context.getMessages(), activation.systemMessage]);
      context.recordActivatedPrompt?.(activation.provenance);
      writeLine(context.io.stdout, renderPromptActivation(activation));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeLine(context.io.stderr, message);
    }
    return;
  }

  writeLine(context.io.stderr, "Usage: /prompts [list|status|activate <id>]");
}

function handleRulesCommand(command: SlashCommand, context: SlashCommandContext): void {
  const subcommand = command.args[0]?.toLowerCase() ?? "list";

  if (subcommand === "list" || subcommand === "status") {
    writeLine(
      context.io.stdout,
      renderPluginRuleList(
        discoverEnabledPluginRules({ registryPath: context.pluginRegistryPath }),
      ),
    );
    return;
  }

  if (subcommand === "activate") {
    const ruleId = command.args[1];
    if (!ruleId || command.args.length !== 2) {
      writeLine(context.io.stderr, `Usage: /rules ${subcommand} <id>`);
      return;
    }

    try {
      const activation = activatePluginRule(ruleId, {
        registryPath: context.pluginRegistryPath,
      });
      context.setMessages([...context.getMessages(), activation.systemMessage]);
      context.recordActivatedRule?.(activation.provenance);
      writeLine(context.io.stdout, renderRuleActivation(activation));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeLine(context.io.stderr, message);
    }
    return;
  }

  writeLine(context.io.stderr, "Usage: /rules [list|status|activate <id>]");
}

async function handlePluginsCommand(
  command: SlashCommand,
  context: SlashCommandContext,
): Promise<void> {
  const subcommand = command.args[0]?.toLowerCase() ?? "list";
  const pluginId = command.args[1];

  if (subcommand === "list" || subcommand === "status") {
    writeLine(
      context.io.stdout,
      renderPluginList(getPluginStatusSummary({ registryPath: context.pluginRegistryPath }), {
        enabledBinCount: getPluginBinTrustSummary({
          configPath: context.pluginBinsConfigPath,
          registryPath: context.pluginRegistryPath,
        }).trustedCount,
        enabledHookCount: getPluginHookTrustSummary({
          configPath: context.pluginHooksConfigPath,
          registryPath: context.pluginRegistryPath,
        }).trustedCount,
      }),
    );
    return;
  }

  if (subcommand === "review" || subcommand === "doctor" || subcommand === "audit") {
    writeLine(
      context.io.stdout,
      renderPluginReview(
        createPluginReview({
          registryPath: context.pluginRegistryPath,
          catalogPath: context.pluginCatalogPath,
          binsConfigPath: context.pluginBinsConfigPath,
          hooksConfigPath: context.pluginHooksConfigPath,
        }),
      ),
    );
    return;
  }

  if (subcommand === "search") {
    writeLine(
      context.io.stdout,
      renderPluginCatalog(loadPluginCatalog({ catalogPath: context.pluginCatalogPath })),
    );
    return;
  }

  if (subcommand === "catalog") {
    await handlePluginCatalogCommand(command.args.slice(1), context);
    return;
  }

  if (subcommand === "commands" || subcommand === "aliases") {
    writeLine(
      context.io.stdout,
      renderPluginCommandAliases(
        discoverEnabledPluginCommandAliases({
          binsConfigPath: context.pluginBinsConfigPath,
          registryPath: context.pluginRegistryPath,
        }),
      ),
    );
    return;
  }

  if (subcommand === "scaffold") {
    try {
      const options = parsePluginScaffoldArgs(command.args.slice(1), context.io.cwd);
      writeLine(context.io.stdout, renderPluginScaffoldResult(scaffoldPlugin(options)));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeLine(context.io.stderr, message);
    }
    return;
  }

  if (subcommand === "validate" || subcommand === "check") {
    const manifestPathText = command.args.slice(1).join(" ").trim();
    if (!manifestPathText) {
      writeLine(context.io.stderr, `Usage: /plugins ${subcommand} <manifest-path-or-directory>`);
      return;
    }

    try {
      const result = validatePluginManifestInput(manifestPathText, { cwd: context.io.cwd });
      writeLine(context.io.stdout, renderPluginValidation(result));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeLine(context.io.stderr, message);
    }
    return;
  }

  if (subcommand === "inspect") {
    if (!pluginId || command.args.length !== 2) {
      writeLine(context.io.stderr, "Usage: /plugins inspect <id>");
      return;
    }

    const plugin = findInstalledPlugin(pluginId, { registryPath: context.pluginRegistryPath });
    if (!plugin) {
      writeLine(context.io.stderr, `Unknown plugin: ${formatPluginIdForMessage(pluginId)}`);
      return;
    }

    writeLine(context.io.stdout, renderPluginInspect(plugin));
    return;
  }

  if (subcommand === "register" || subcommand === "install") {
    const manifestPathText = command.args.slice(1).join(" ").trim();
    if (!manifestPathText) {
      writeLine(context.io.stderr, `Usage: /plugins ${subcommand} <manifest-path>`);
      return;
    }

    try {
      const result = await installPlugin(manifestPathText, {
        cwd: context.io.cwd,
        catalogPath: context.pluginCatalogPath,
        registryPath: context.pluginRegistryPath,
        cacheDirectory: context.pluginCacheDirectory,
      });
      const sourceMessage = result.sourceMessage ? `${result.sourceMessage}\n` : "";
      writeLine(context.io.stdout, `${sourceMessage}${result.message}`);
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
    "Usage: /plugins [catalog [list|inspect|updates|update|add-local|add-git|remove]|list|review|commands|scaffold <directory>|validate <manifest-path-or-directory>|inspect <id>|register <manifest-path-or-catalog-id>|install <manifest-path-or-catalog-id>|enable <id>|disable <id>]",
  );
}

async function handlePluginCatalogCommand(
  args: string[],
  context: SlashCommandContext,
): Promise<void> {
  const subcommand = args[0]?.toLowerCase() ?? "list";
  if (subcommand === "list" || subcommand === "status" || subcommand === "search") {
    writeLine(
      context.io.stdout,
      renderPluginCatalog(loadPluginCatalog({ catalogPath: context.pluginCatalogPath })),
    );
    return;
  }

  if (subcommand === "update" || subcommand === "upgrade" || subcommand === "apply-update") {
    const id = args[1];
    if (!id || args.length !== 2) {
      writeLine(context.io.stderr, "Usage: /plugins catalog update <id>");
      return;
    }

    if (!findPluginCatalogEntry(id, { catalogPath: context.pluginCatalogPath })) {
      writeLine(context.io.stderr, `Unknown catalog entry: ${formatPluginCatalogIdForMessage(id)}`);
      return;
    }

    try {
      const result = await updatePluginFromCatalog(id, {
        cwd: context.io.cwd,
        catalogPath: context.pluginCatalogPath,
        registryPath: context.pluginRegistryPath,
        cacheDirectory: context.pluginCacheDirectory,
      });
      writeLine(
        result.ok ? context.io.stdout : context.io.stderr,
        renderPluginCatalogUpdateApplyResult(result),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeLine(context.io.stderr, message);
    }
    return;
  }

  if (
    subcommand === "updates" ||
    subcommand === "update-check" ||
    subcommand === "check-updates" ||
    subcommand === "outdated"
  ) {
    const ids = args.slice(1);
    const missingIds = ids.filter(
      (id) => !findPluginCatalogEntry(id, { catalogPath: context.pluginCatalogPath }),
    );
    if (missingIds.length > 0) {
      writeLine(
        context.io.stderr,
        `Unknown catalog entry: ${formatPluginCatalogIdForMessage(missingIds[0] ?? "")}`,
      );
      return;
    }

    writeLine(
      context.io.stdout,
      renderPluginCatalogUpdateReport(
        checkPluginCatalogUpdates({
          catalogPath: context.pluginCatalogPath,
          registryPath: context.pluginRegistryPath,
          ids,
        }),
      ),
    );
    return;
  }

  if (subcommand === "inspect" || subcommand === "show" || subcommand === "info") {
    const id = args[1];
    if (!id || args.length !== 2) {
      writeLine(context.io.stderr, "Usage: /plugins catalog inspect <id>");
      return;
    }

    const entry = findPluginCatalogEntry(id, { catalogPath: context.pluginCatalogPath });
    if (!entry) {
      writeLine(context.io.stderr, `Unknown catalog entry: ${formatPluginCatalogIdForMessage(id)}`);
      return;
    }

    writeLine(
      context.io.stdout,
      renderPluginCatalogInspect(entry, { catalogPath: context.pluginCatalogPath }),
    );
    return;
  }

  if (subcommand === "add" || subcommand === "add-local" || subcommand === "local") {
    try {
      const parsed = parsePluginCatalogAddLocalArgs(args.slice(1));
      const result = upsertLocalPluginCatalogEntry(parsed, {
        cwd: context.io.cwd,
        catalogPath: context.pluginCatalogPath,
      });
      writeLine(context.io.stdout, result.message);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeLine(context.io.stderr, message);
    }
    return;
  }

  if (subcommand === "add-git" || subcommand === "git") {
    try {
      const parsed = parsePluginCatalogAddGitArgs(args.slice(1));
      const result = upsertGitPluginCatalogEntry(parsed, {
        catalogPath: context.pluginCatalogPath,
      });
      writeLine(context.io.stdout, result.message);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeLine(context.io.stderr, message);
    }
    return;
  }

  if (subcommand === "remove" || subcommand === "rm" || subcommand === "delete") {
    const id = args[1];
    if (!id || args.length !== 2) {
      writeLine(context.io.stderr, "Usage: /plugins catalog remove <id>");
      return;
    }

    const result = removePluginCatalogEntry(id, { catalogPath: context.pluginCatalogPath });
    if (!result.ok) {
      writeLine(context.io.stderr, result.message);
      return;
    }

    writeLine(context.io.stdout, result.message);
    return;
  }

  writeLine(
    context.io.stderr,
    "Usage: /plugins catalog [list|inspect <id>|updates [id]|update <id>|add-local <manifest-path-or-directory>|add-git <id> <repository> <resolved-commit>|remove <id>]",
  );
}

function handlePluginAliasListCommand(command: SlashCommand, context: SlashCommandContext): void {
  const subcommand = command.args[0]?.toLowerCase() ?? "list";
  if ((subcommand === "list" || subcommand === "status") && command.args.length <= 1) {
    writeLine(
      context.io.stdout,
      renderPluginCommandAliases(
        discoverEnabledPluginCommandAliases({
          binsConfigPath: context.pluginBinsConfigPath,
          registryPath: context.pluginRegistryPath,
        }),
      ),
    );
    return;
  }

  writeLine(context.io.stderr, "Usage: /plugin [list|status]");
}

async function handlePluginCommandAlias(
  command: SlashCommand,
  context: SlashCommandContext,
): Promise<SlashResult> {
  const alias = findPluginCommandAlias(command.name, {
    binsConfigPath: context.pluginBinsConfigPath,
    registryPath: context.pluginRegistryPath,
  });
  if (!alias) {
    writeLine(
      context.io.stderr,
      `Unknown enabled plugin command: ${formatPluginCommandAliasForMessage(command.name)}. Use /plugin list.`,
    );
    return "continue";
  }

  if (alias.kind === "prompt") {
    if (command.args.length > 0) {
      writeLine(context.io.stderr, `Usage: ${alias.alias}`);
      return "continue";
    }

    try {
      const activation = activatePluginPrompt(alias.targetId, {
        registryPath: context.pluginRegistryPath,
      });
      context.setMessages([...context.getMessages(), activation.systemMessage]);
      context.recordActivatedPrompt?.(activation.provenance);
      writeLine(context.io.stdout, renderPromptActivation(activation));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeLine(context.io.stderr, message);
    }
    return "continue";
  }

  if (alias.kind === "exec") {
    if (alias.state === "missing_bin") {
      writeLine(
        context.io.stderr,
        `Plugin command ${alias.alias} references a missing bin target: ${alias.targetId}`,
      );
      return "continue";
    }
    if (alias.maxArgs !== undefined && command.args.length > alias.maxArgs) {
      writeLine(
        context.io.stderr,
        `Usage: ${alias.usage ?? `${alias.alias} [args...]`} (max_args=${alias.maxArgs})`,
      );
      return "continue";
    }
  }

  const result = await runPluginBin(alias.targetId, command.args, {
    auditLogPath: context.pluginBinsAuditLogPath,
    configPath: context.pluginBinsConfigPath,
    env: process.env,
    registryPath: context.pluginRegistryPath,
  });
  writeLine(result.ok ? context.io.stdout : context.io.stderr, renderPluginBinRunResult(result));
  return "continue";
}

async function handleBinsCommand(command: SlashCommand, context: SlashCommandContext): Promise<void> {
  const subcommand = command.args[0]?.toLowerCase() ?? "list";
  const binId = command.args[1];

  if (subcommand === "list" || subcommand === "status") {
    writeLine(
      context.io.stdout,
      renderPluginBins(discoverEnabledPluginBins({ registryPath: context.pluginRegistryPath }), {
        configPath: context.pluginBinsConfigPath,
      }),
    );
    return;
  }

  if (subcommand === "inspect") {
    if (!binId || command.args.length !== 2) {
      writeLine(context.io.stderr, "Usage: /bins inspect <id>");
      return;
    }

    const bin = findDiscoveredBin(binId, { registryPath: context.pluginRegistryPath });
    if (!bin) {
      writeLine(context.io.stderr, `Unknown enabled plugin bin: ${formatBinIdForMessage(binId)}`);
      return;
    }

    writeLine(
      context.io.stdout,
      renderPluginBinInspect(bin, { configPath: context.pluginBinsConfigPath }),
    );
    return;
  }

  if (subcommand === "trust") {
    if (!binId || command.args.length !== 2) {
      writeLine(context.io.stderr, "Usage: /bins trust <id>");
      return;
    }

    try {
      const result = trustPluginBin(binId, {
        registryPath: context.pluginRegistryPath,
        configPath: context.pluginBinsConfigPath,
      });
      if (!result.ok) {
        writeLine(context.io.stderr, result.message);
        return;
      }
      writeLine(context.io.stdout, result.message);
    } catch (error) {
      writeLine(context.io.stderr, `Unable to persist bin trust state${formatErrorCode(error)}.`);
    }
    return;
  }

  if (subcommand === "run") {
    if (!binId || command.args.length < 2) {
      writeLine(context.io.stderr, "Usage: /bins run <id> [args...]");
      return;
    }

    const result = await runPluginBin(binId, command.args.slice(2), {
      auditLogPath: context.pluginBinsAuditLogPath,
      configPath: context.pluginBinsConfigPath,
      env: process.env,
      registryPath: context.pluginRegistryPath,
    });
    writeLine(result.ok ? context.io.stdout : context.io.stderr, renderPluginBinRunResult(result));
    return;
  }

  if (subcommand === "untrust" || subcommand === "revoke") {
    if (!binId || command.args.length !== 2) {
      writeLine(context.io.stderr, `Usage: /bins ${subcommand} <id>`);
      return;
    }

    try {
      const result = untrustPluginBin(binId, { configPath: context.pluginBinsConfigPath });
      if (!result.ok) {
        writeLine(context.io.stderr, result.message);
        return;
      }
      writeLine(context.io.stdout, result.message);
    } catch (error) {
      writeLine(context.io.stderr, `Unable to persist bin trust state${formatErrorCode(error)}.`);
    }
    return;
  }

  writeLine(context.io.stderr, "Usage: /bins [list|inspect <id>|trust <id>|untrust <id>|run <id> [args...]]");
}

async function handleHooksCommand(command: SlashCommand, context: SlashCommandContext): Promise<void> {
  const subcommand = command.args[0]?.toLowerCase() ?? "list";
  const hookId = command.args[1];

  if (subcommand === "list" || subcommand === "status") {
    writeLine(
      context.io.stdout,
      renderPluginHooks(discoverEnabledPluginHooks({ registryPath: context.pluginRegistryPath }), {
        configPath: context.pluginHooksConfigPath,
      }),
    );
    return;
  }

  if (subcommand === "inspect") {
    if (!hookId || command.args.length !== 2) {
      writeLine(context.io.stderr, "Usage: /hooks inspect <id>");
      return;
    }

    const hook = findDiscoveredHook(hookId, { registryPath: context.pluginRegistryPath });
    if (!hook) {
      writeLine(context.io.stderr, `Unknown enabled plugin hook: ${formatHookIdForMessage(hookId)}`);
      return;
    }

    writeLine(
      context.io.stdout,
      renderPluginHookInspect(hook, { configPath: context.pluginHooksConfigPath }),
    );
    return;
  }

  if (subcommand === "trust") {
    if (!hookId || command.args.length !== 2) {
      writeLine(context.io.stderr, "Usage: /hooks trust <id>");
      return;
    }

    try {
      const result = trustPluginHook(hookId, {
        registryPath: context.pluginRegistryPath,
        configPath: context.pluginHooksConfigPath,
      });
      if (!result.ok) {
        writeLine(context.io.stderr, result.message);
        return;
      }
      writeLine(context.io.stdout, result.message);
    } catch (error) {
      writeLine(context.io.stderr, `Unable to persist hook trust state${formatErrorCode(error)}.`);
    }
    return;
  }

  if (subcommand === "run") {
    if (!hookId || command.args.length !== 2) {
      writeLine(context.io.stderr, "Usage: /hooks run <id>");
      return;
    }

    const result = await runPluginHook(hookId, {
      auditLogPath: context.pluginHooksAuditLogPath,
      configPath: context.pluginHooksConfigPath,
      env: process.env,
      registryPath: context.pluginRegistryPath,
    });
    writeLine(result.ok ? context.io.stdout : context.io.stderr, renderPluginHookRunResult(result));
    return;
  }

  if (subcommand === "untrust" || subcommand === "revoke") {
    if (!hookId || command.args.length !== 2) {
      writeLine(context.io.stderr, `Usage: /hooks ${subcommand} <id>`);
      return;
    }

    try {
      const result = untrustPluginHook(hookId, { configPath: context.pluginHooksConfigPath });
      if (!result.ok) {
        writeLine(context.io.stderr, result.message);
        return;
      }
      writeLine(context.io.stdout, result.message);
    } catch (error) {
      writeLine(context.io.stderr, `Unable to persist hook trust state${formatErrorCode(error)}.`);
    }
    return;
  }

  writeLine(context.io.stderr, "Usage: /hooks [list|inspect <id>|trust <id>|untrust <id>|run <id>]");
}

function handleOrchestratorCommand(command: SlashCommand, context: SlashCommandContext): void {
  const subcommand = command.args[0]?.toLowerCase();
  const policy = loadDelegationExecutionPolicy({ configPath: context.delegationPolicyPath });

  if (!subcommand || subcommand === "status") {
    writeLine(context.io.stdout, renderOrchestratorStatus(getDelegationState(context), { policy }));
    return;
  }

  if (subcommand === "plan" || subcommand === "readiness") {
    writeLine(
      context.io.stdout,
      renderDelegationReadinessPlan(getDelegationState(context), { policy }),
    );
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
    writeLine(context.io.stdout, "Orchestration controller cleared. Delegation execution policy is unchanged.");
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
        `Orchestration controller set: openrouter ${nextState.controller?.model}. Delegation execution remains policy-gated.`,
      );
    } catch (error) {
      writeLine(context.io.stderr, formatDelegationError(error));
    }
    return;
  }

  writeLine(context.io.stderr, "Usage: /orchestrator [status|plan|openrouter <model>|clear]");
}

function handleDelegatesCommand(command: SlashCommand, context: SlashCommandContext): void {
  const subcommand = command.args[0]?.toLowerCase() ?? "list";
  const policy = loadDelegationExecutionPolicy({ configPath: context.delegationPolicyPath });
  const teamArgs = subcommand === "teams" || subcommand === "team" || subcommand === "saved"
    ? command.args.slice(1)
    : command.args;
  const teamSubcommand = teamArgs[0]?.toLowerCase() ?? "list";
  const teamId = teamArgs[1];

  if (subcommand === "list" || subcommand === "status") {
    writeLine(context.io.stdout, renderDelegates(getDelegationState(context), { policy }));
    return;
  }

  if (subcommand === "plan" || subcommand === "readiness") {
    writeLine(
      context.io.stdout,
      renderDelegationReadinessPlan(getDelegationState(context), { policy }),
    );
    return;
  }

  if (subcommand === "policy" || subcommand === "policies" || subcommand === "execution-policy") {
    handleDelegationPolicySlashCommand(command.args.slice(1), context, "/delegates policy");
    return;
  }

  if (subcommand === "teams" || subcommand === "team" || subcommand === "saved") {
    handleDelegationTeamSlashCommand(teamArgs, context);
    return;
  }

  if (isDelegationTeamSlashCommand(subcommand)) {
    handleDelegationTeamSlashCommand(command.args, context);
    return;
  }

  writeLine(
    context.io.stderr,
    "Usage: /delegates [list|status|plan|policy|teams|save <id>|use <id>|inspect <id>|delete <id>]",
  );

  function handleDelegationTeamSlashCommand(
    args: string[],
    slashContext: SlashCommandContext,
  ): void {
    if (teamSubcommand === "list" || teamSubcommand === "status" || teamSubcommand === "teams") {
      writeLine(
        slashContext.io.stdout,
        renderDelegationTeamList(
          getDelegationTeamStatusSummary({
            configPath: slashContext.delegationTeamConfigPath,
          }),
          slashContext.delegationTeamConfigPath,
        ),
      );
      return;
    }

    if (teamSubcommand === "save") {
      if (!teamId || args.length !== 2) {
        writeLine(slashContext.io.stderr, "Usage: /delegates save <id>");
        return;
      }

      try {
        const result = saveDelegationTeam(teamId, getDelegationState(slashContext), {
          configPath: slashContext.delegationTeamConfigPath,
        });
        if (!result.ok) {
          writeLine(slashContext.io.stderr, result.message);
          return;
        }
        writeLine(slashContext.io.stdout, result.message);
      } catch (error) {
        writeLine(slashContext.io.stderr, `Unable to save delegation team${formatErrorCode(error)}.`);
      }
      return;
    }

    if (teamSubcommand === "inspect" || teamSubcommand === "show" || teamSubcommand === "info") {
      if (!teamId || args.length !== 2) {
        writeLine(slashContext.io.stderr, `Usage: /delegates ${teamSubcommand} <id>`);
        return;
      }

      const team = findSavedDelegationTeam(teamId, {
        configPath: slashContext.delegationTeamConfigPath,
      });
      if (!team) {
        writeLine(
          slashContext.io.stderr,
          `Unknown delegation team: ${formatDelegationTeamIdForMessage(teamId)}`,
        );
        return;
      }

      writeLine(slashContext.io.stdout, renderDelegationTeamInspect(team));
      return;
    }

    if (teamSubcommand === "use" || teamSubcommand === "load") {
      if (!teamId || args.length !== 2) {
        writeLine(slashContext.io.stderr, `Usage: /delegates ${teamSubcommand} <id>`);
        return;
      }

      const team = findSavedDelegationTeam(teamId, {
        configPath: slashContext.delegationTeamConfigPath,
      });
      if (!team) {
        writeLine(
          slashContext.io.stderr,
          `Unknown delegation team: ${formatDelegationTeamIdForMessage(teamId)}`,
        );
        return;
      }

      if (!setDelegationState(slashContext, team.delegation)) {
        return;
      }
      writeLine(
        slashContext.io.stdout,
        renderDelegationTeamUse(team, {
          surface: "interactive",
          policy: loadDelegationExecutionPolicy({ configPath: slashContext.delegationPolicyPath }),
        }),
      );
      return;
    }

    if (teamSubcommand === "delete" || teamSubcommand === "remove" || teamSubcommand === "rm") {
      if (!teamId || args.length !== 2) {
        writeLine(slashContext.io.stderr, `Usage: /delegates ${teamSubcommand} <id>`);
        return;
      }

      try {
        const result = deleteSavedDelegationTeam(teamId, {
          configPath: slashContext.delegationTeamConfigPath,
        });
        if (!result.ok) {
          writeLine(slashContext.io.stderr, result.message);
          return;
        }
        writeLine(slashContext.io.stdout, result.message);
      } catch (error) {
        writeLine(slashContext.io.stderr, `Unable to delete delegation team${formatErrorCode(error)}.`);
      }
      return;
    }

    writeLine(
      slashContext.io.stderr,
      "Usage: /delegates teams [list|save <id>|use <id>|inspect <id>|delete <id>]",
    );
  }
}

function handleDelegateCommand(command: SlashCommand, context: SlashCommandContext): void {
  const subcommand = command.args[0]?.toLowerCase();
  const policy = loadDelegationExecutionPolicy({ configPath: context.delegationPolicyPath });

  if (!subcommand || subcommand === "help") {
    writeLine(
      context.io.stdout,
      [
        "Delegate commands:",
        "  /delegate plan",
        "  /delegate status",
        "  /delegate add <name> openrouter <model>",
        "  /delegate remove <name>",
        "  /delegate clear",
        "  /delegate policy",
        "  /delegate policy set --execution enabled|disabled --max-cost-usd <n> --timeout-ms <ms> --max-result-bytes <bytes> --max-concurrent <n> --credentials none --result-persistence none --result-merge manual_summary|metadata_only",
        "  /delegate team save <id>",
        "  /delegate team use <id>",
        "  /delegates",
        "Execution is policy-gated; delegate_task is available in chat only after policy is enabled and a delegate is configured.",
      ].join("\n"),
    );
    return;
  }

  if (subcommand === "status" || subcommand === "list") {
    writeLine(context.io.stdout, renderDelegates(getDelegationState(context), { policy }));
    return;
  }

  if (subcommand === "plan" || subcommand === "readiness") {
    writeLine(
      context.io.stdout,
      renderDelegationReadinessPlan(getDelegationState(context), { policy }),
    );
    return;
  }

  if (subcommand === "team" || subcommand === "teams" || subcommand === "saved") {
    handleDelegatesCommand(
      {
        ...command,
        args: command.args.slice(1),
      },
      context,
    );
    return;
  }

  if (subcommand === "policy" || subcommand === "policies" || subcommand === "execution-policy") {
    handleDelegationPolicySlashCommand(command.args.slice(1), context, "/delegate policy");
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
        `${result.created ? "Registered" : "Updated"} delegate ${result.delegate.name}: openrouter ${result.delegate.model}. Delegation execution remains policy-gated.`,
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
        `Removed delegate ${result.removed.name}. Delegation execution policy is unchanged.`,
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
    writeLine(context.io.stdout, "Delegates cleared. Delegation execution policy is unchanged.");
    return;
  }

  writeLine(context.io.stderr, "Usage: /delegate [help|status|plan|add|remove|clear|team|policy]");
}

function handleDelegationPolicySlashCommand(
  args: string[],
  context: SlashCommandContext,
  usagePrefix: string,
): void {
  const subcommand = args[0]?.toLowerCase() ?? "status";

  if (subcommand === "status" || subcommand === "show" || subcommand === "inspect") {
    writeLine(
      context.io.stdout,
      renderDelegationExecutionPolicy(
        loadDelegationExecutionPolicy({ configPath: context.delegationPolicyPath }),
        context.delegationPolicyPath,
      ),
    );
    return;
  }

  if (subcommand === "set" || subcommand === "update") {
    try {
      const result = updateDelegationExecutionPolicy(
        parseDelegationExecutionPolicySetArgs(args.slice(1)),
        { configPath: context.delegationPolicyPath },
      );
      writeLine(
        context.io.stdout,
        [
          result.message,
          "",
          renderDelegationExecutionPolicy(
            result.policy ?? loadDelegationExecutionPolicy({
              configPath: context.delegationPolicyPath,
            }),
            context.delegationPolicyPath,
          ),
        ].join("\n"),
      );
    } catch (error) {
      writeLine(context.io.stderr, formatDelegationError(error));
    }
    return;
  }

  writeLine(
    context.io.stderr,
    `Usage: ${usagePrefix} [status|set --execution enabled|disabled --max-cost-usd <n> --timeout-ms <ms> --max-result-bytes <bytes> --max-concurrent <n> --credentials none --result-persistence none --result-merge manual_summary|metadata_only]`,
  );
}

async function handleMcpCommand(command: SlashCommand, context: SlashCommandContext): Promise<void> {
  const subcommand = command.args[0]?.toLowerCase() ?? "list";
  const profileId = command.args[1];
  const registryOptions = {
    configPath: context.mcpConfigPath,
    profileCatalogPath: context.mcpProfileCatalogPath,
    pluginRegistryPath: context.pluginRegistryPath,
  };

  if (subcommand === "model") {
    handleMcpModelCommand(command, context);
    return;
  }

  if (subcommand === "list" || subcommand === "status") {
    const summary = getMcpStatusSummary(registryOptions);
    tryWriteMcpAuditEvent(context, {
      type: "mcp.profile.status",
      ok: true,
      details: {
        activeProfileIds: summary.activeProfileIds,
        registryHash: summary.registryHash,
        toolGrantCount: summary.toolGrantCount,
        staleToolGrantCount: summary.staleToolGrantCount,
        modelToolGrantCount: summary.modelToolGrantCount,
        staleModelToolGrantCount: summary.staleModelToolGrantCount,
        pendingSchemaChangeCount: summary.pendingSchemaChangeCount,
      },
    });
    writeLine(context.io.stdout, renderMcpStatus(summary));
    return;
  }

  if (subcommand === "catalog" || subcommand === "user-catalog") {
    if (command.args.length !== 1) {
      writeLine(context.io.stderr, "Usage: /mcp catalog");
      return;
    }

    writeLine(
      context.io.stdout,
      renderUserMcpProfileCatalog(
        loadUserMcpProfileCatalog({ profileCatalogPath: context.mcpProfileCatalogPath }),
      ),
    );
    return;
  }

  if (subcommand === "presets" || subcommand === "preset") {
    const presetArgs = parseMcpPresetInspectArgs(command.args);
    if (presetArgs.kind === "error") {
      writeLine(context.io.stderr, presetArgs.message.replace(/^Usage: orx mcp /, "Usage: /mcp "));
      return;
    }
    if (presetArgs.kind === "inspect") {
      const preset = findMcpProviderPreset(presetArgs.presetId);
      if (!preset) {
        writeLine(
          context.io.stderr,
          `Unknown MCP provider preset: ${formatMcpProviderPresetIdForMessage(presetArgs.presetId)}`,
        );
        return;
      }
      writeLine(context.io.stdout, renderMcpProviderPresetInspect(preset));
      return;
    }

    writeLine(context.io.stdout, renderMcpProviderPresets());
    return;
  }

  if (subcommand === "add-preset") {
    const parsed = parseMcpAddPresetArgs(command.args);
    if (typeof parsed === "string") {
      writeLine(context.io.stderr, parsed.replace(/^Usage: orx mcp /, "Usage: /mcp "));
      return;
    }

    try {
      const result = installMcpProviderPreset(parsed.presetId, {
        profileCatalogPath: context.mcpProfileCatalogPath,
        profileId: parsed.profileId,
        url: parsed.url,
        authRequired: parsed.authRequired,
      });
      writeLine(result.ok ? context.io.stdout : context.io.stderr, result.message);
      return;
    } catch (error) {
      writeLine(context.io.stderr, `Unable to store MCP provider preset${formatErrorCode(error)}.`);
      return;
    }
  }

  if (subcommand === "add-profile") {
    const parsed = parseMcpAddProfileArgs(command.args);
    if (typeof parsed === "string") {
      writeLine(context.io.stderr, parsed.replace(/^Usage: orx mcp /, "Usage: /mcp "));
      return;
    }

    try {
      const result = upsertUserMcpRemoteProfile(
        parsed.id,
        {
          name: parsed.name,
          url: parsed.url,
          authRequired: parsed.authRequired,
          notes: parsed.notes,
        },
        { profileCatalogPath: context.mcpProfileCatalogPath },
      );
      writeLine(context.io.stdout, result.message);
      return;
    } catch (error) {
      writeLine(context.io.stderr, `Unable to store user MCP profile${formatErrorCode(error)}.`);
      return;
    }
  }

  if (subcommand === "remove-profile") {
    if (!profileId || command.args.length !== 2) {
      writeLine(context.io.stderr, "Usage: /mcp remove-profile <profile>");
      return;
    }

    try {
      const result = removeUserMcpProfile(profileId, {
        profileCatalogPath: context.mcpProfileCatalogPath,
      });
      writeLine(result.ok ? context.io.stdout : context.io.stderr, result.message);
      return;
    } catch (error) {
      writeLine(context.io.stderr, `Unable to remove user MCP profile${formatErrorCode(error)}.`);
      return;
    }
  }

  if (subcommand === "add-tool") {
    const parsed = parseMcpAddToolArgs(command.args);
    if (typeof parsed === "string") {
      writeLine(context.io.stderr, parsed.replace(/^Usage: orx mcp /, "Usage: /mcp "));
      return;
    }

    try {
      const result = upsertUserMcpProfileTool(
        parsed.profileId,
        {
          name: parsed.toolName,
          risk: parsed.risk,
          authRequired: parsed.authRequired,
          billable: parsed.billable,
        },
        { profileCatalogPath: context.mcpProfileCatalogPath },
      );
      writeLine(result.ok ? context.io.stdout : context.io.stderr, result.message);
      return;
    } catch (error) {
      writeLine(context.io.stderr, `Unable to store user MCP tool${formatErrorCode(error)}.`);
      return;
    }
  }

  if (subcommand === "remove-tool") {
    const toolName = command.args[2];
    if (!profileId || !toolName || command.args.length !== 3) {
      writeLine(context.io.stderr, "Usage: /mcp remove-tool <profile> <tool>");
      return;
    }

    try {
      const result = removeUserMcpProfileTool(profileId, toolName, {
        profileCatalogPath: context.mcpProfileCatalogPath,
      });
      writeLine(result.ok ? context.io.stdout : context.io.stderr, result.message);
      return;
    } catch (error) {
      writeLine(context.io.stderr, `Unable to remove user MCP tool${formatErrorCode(error)}.`);
      return;
    }
  }

  if (subcommand === "inspect") {
    if (!profileId || command.args.length !== 2) {
      writeLine(context.io.stderr, "Usage: /mcp inspect <profile>");
      return;
    }

    const report = getMcpProfileToolPolicyReport(profileId, registryOptions);
    tryWriteMcpAuditEvent(context, {
      type: "mcp.profile.inspect",
      profileId,
      ok: Boolean(report),
      details: report
        ? {
            state: report.profile.state,
            transport: report.profile.transport.kind,
            authRequired: report.profile.authRequired,
            writeCapable: report.profile.writeCapable,
            profileHash: report.profileHash,
            trustedProfileHash: report.trustedProfileHash,
            schemaChangePending: report.schemaChangePending,
            toolGrantCount: report.toolGrantCount,
            staleToolGrantCount: report.staleToolGrantCount,
            modelToolGrantCount: report.modelToolGrantCount,
            staleModelToolGrantCount: report.staleModelToolGrantCount,
          }
        : undefined,
    });

    if (!report) {
      writeLine(context.io.stderr, `Unknown MCP profile: ${profileId}`);
      return;
    }

    writeLine(
      context.io.stdout,
      renderMcpProfileInspect(report.profile, {
        trustedProfileHash: report.trustedProfileHash,
        updatedAt: report.updatedAt,
        schemaChangePending: report.schemaChangePending,
        toolEvaluations: report.evaluations,
        toolGrantCount: report.toolGrantCount,
        staleToolGrantCount: report.staleToolGrantCount,
        modelToolGrantCount: report.modelToolGrantCount,
        staleModelToolGrantCount: report.staleModelToolGrantCount,
      }),
    );
    return;
  }

  if (subcommand === "auth") {
    const authAction = parseMcpAuthArgs(command.args);
    if (typeof authAction === "string") {
      writeLine(context.io.stderr, authAction);
      return;
    }

    const authEnv = context.mcpAuthEnv ?? context.env;
    const report = getMcpProfileAuthReport(authAction.profileId, {
      ...registryOptions,
      env: authEnv,
      cwd: context.io.cwd,
    });
    const auditType =
      authAction.kind === "setup"
        ? "mcp.profile.auth_setup"
        : authAction.kind === "init"
          ? "mcp.profile.auth_env_file"
          : authAction.kind === "keychain"
            ? "mcp.profile.auth_keychain"
          : "mcp.profile.auth_status";

    if (!report) {
      tryWriteMcpAuditEvent(context, {
        type: auditType,
        profileId: authAction.profileId,
        ok: false,
      });
      writeLine(context.io.stderr, `Unknown MCP profile: ${authAction.profileId}`);
      return;
    }

    const auditDetails = {
      state: report.profile.state,
      authRequired: report.profile.authRequired,
      profileEnvName: report.profileEnvName,
      profileEnvSet: report.profileEnvSet,
      fallbackEnvName: report.fallbackEnvName,
      fallbackEnvSet: report.fallbackEnvSet,
      ready: report.authReady,
      macosKeychainSupported: report.macosKeychainSupported,
      macosKeychainOptedIn: report.macosKeychainOptedIn,
      authRequiredToolCount: report.authRequiredToolCount,
      managedEnvFilePath: report.managedEnvFilePath,
      profileHash: report.profileHash,
      trustedProfileHash: report.trustedProfileHash,
      schemaChangePending: report.schemaChangePending,
    };

    if (authAction.kind === "keychain") {
      const keychainOptions = {
        env: authEnv,
        platform: context.mcpKeychainPlatform,
        runner: context.mcpKeychainRunner,
      };
      const result = await (
        authAction.action === "set"
          ? setMcpMacosKeychainBearerPrompt(authAction.profileId, keychainOptions)
          : authAction.action === "delete"
            ? deleteMcpMacosKeychainBearer(authAction.profileId, keychainOptions)
            : getMcpMacosKeychainStatus(authAction.profileId, keychainOptions)
      );
      tryWriteMcpAuditEvent(context, {
        type: auditType,
        profileId: authAction.profileId,
        ok: result.ok,
        details: {
          ...auditDetails,
          action: result.action,
          status: result.status,
          stateChanged: result.stateChanged,
          tokenConfigured: result.tokenConfigured,
          keychainService: result.keychain.service,
          keychainAccount: result.keychain.account,
          command: result.command,
          message: result.message,
        },
      });
      writeLine(result.ok ? context.io.stdout : context.io.stderr, renderMcpMacosKeychainResult(result));
      return;
    }

    if (authAction.kind === "init") {
      try {
        const result = initializeMcpAuthEnvFile(report, { env: authEnv, cwd: context.io.cwd });
        tryWriteMcpAuditEvent(context, {
          type: auditType,
          profileId: authAction.profileId,
          ok: true,
          details: {
            ...auditDetails,
            path: result.path,
            created: result.created,
            existing: result.existing,
            stateChanged: result.stateChanged,
            permissionsTightened: result.permissionsTightened,
            directoryPermissionsTightened: result.directoryPermissionsTightened,
            skipped: result.skipped,
          },
        });
        writeLine(context.io.stdout, renderMcpAuthEnvFileInitResult(result));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        tryWriteMcpAuditEvent(context, {
          type: auditType,
          profileId: authAction.profileId,
          ok: false,
          details: {
            ...auditDetails,
            message,
          },
        });
        writeLine(context.io.stderr, message);
      }
      return;
    }

    tryWriteMcpAuditEvent(context, {
      type: auditType,
      profileId: authAction.profileId,
      ok: true,
      details: auditDetails,
    });
    writeLine(
      context.io.stdout,
      authAction.kind === "setup"
        ? renderMcpProfileAuthSetup(report)
        : renderMcpProfileAuthReport(report),
    );
    return;
  }

  if (subcommand === "tools") {
    if (!profileId || command.args.length !== 2) {
      writeLine(context.io.stderr, "Usage: /mcp tools <profile>");
      return;
    }

    const report = getMcpProfileToolPolicyReport(profileId, registryOptions);
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
            toolGrantCount: report.toolGrantCount,
            staleToolGrantCount: report.staleToolGrantCount,
            modelToolGrantCount: report.modelToolGrantCount,
            staleModelToolGrantCount: report.staleModelToolGrantCount,
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

  if (subcommand === "call") {
    const toolName = command.args[2];
    if (!profileId || !toolName || command.args.length < 3) {
      writeLine(context.io.stderr, "Usage: /mcp call <profile> <tool> [arguments-json]");
      return;
    }

    const parsedArgs = parseMcpCallArguments(command);
    if (!parsedArgs.ok) {
      tryWriteMcpAuditEvent(context, {
        type: "mcp.tool.call_attempt",
        profileId,
        ok: false,
        details: {
          toolName,
          status: "invalid_arguments",
          message: parsedArgs.message,
        },
      });
      writeLine(context.io.stderr, parsedArgs.message);
      return;
    }

    const credential = await resolveMcpBearerCredential(profileId, {
      env: context.mcpAuthEnv ?? context.env,
      platform: context.mcpKeychainPlatform,
      runner: context.mcpKeychainRunner,
    });
    const result = await callRemoteMcpTool(profileId, toolName, parsedArgs.value, {
      ...registryOptions,
      fetch: context.mcpCallFetch,
      resolveHost: context.mcpResolveHost,
      authToken: credential.token,
    });
    tryWriteMcpAuditEvent(context, {
      type: "mcp.tool.call_attempt",
      profileId,
      ok: result.ok,
      details: {
        toolName,
        status: result.status,
        networkAttempted: result.networkAttempted,
        transport: result.transport,
        url: result.url,
        authRequired: result.authRequired,
        profileHash: result.profileHash,
        trustedProfileHash: result.trustedProfileHash,
        schemaChangePending: result.schemaChangePending,
        policyDecision: result.policyDecision,
        httpStatus: result.httpStatus,
        toolError: result.toolError,
        resultHash: result.resultHash,
        contentCount: result.content?.length,
        contentTypes: result.content?.map((item) => item.type),
        error: result.error,
        message: result.message,
        credentialSource: credential.source,
        keychainAttempted: credential.keychainAttempted,
        keychainStatus: credential.keychainStatus,
      },
    });

    const output = formatMcpToolCallResult(result);
    writeLine(result.ok ? context.io.stdout : context.io.stderr, output);
    return;
  }

  if (subcommand === "remote-tools") {
    if (!profileId || command.args.length !== 2) {
      writeLine(context.io.stderr, "Usage: /mcp remote-tools <profile>");
      return;
    }

    const result = await listRemoteMcpTools(profileId, {
      ...registryOptions,
      fetch: context.mcpRemoteToolsFetch,
      resolveHost: context.mcpResolveHost,
    });
    tryWriteMcpAuditEvent(context, {
      type: "mcp.profile.remote_tools_attempt",
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
        toolCount: result.toolCount,
        nextCursorPresent: result.nextCursorPresent,
        truncated: result.truncated,
        toolHashes: result.tools?.map((tool) => ({
          name: tool.name,
          toolHash: tool.toolHash,
          inputSchemaHash: tool.inputSchemaHash,
          outputSchemaHash: tool.outputSchemaHash,
        })),
        error: result.error,
        message: result.message,
      },
    });

    const output = formatMcpRemoteToolsResult(result);
    if (
      result.status === "not_found" ||
      result.status === "network_error" ||
      result.status === "remote_error" ||
      result.status === "invalid_response" ||
      result.status === "too_many_pages"
    ) {
      writeLine(context.io.stderr, output);
      return;
    }

    writeLine(context.io.stdout, output);
    return;
  }

  if (subcommand === "import-remote-tools" || subcommand === "import-tools") {
    const parsed = parseMcpImportRemoteToolsArgs(command.args);
    if (typeof parsed === "string") {
      writeLine(context.io.stderr, parsed.replace(/^Usage: orx mcp /, "Usage: /mcp "));
      return;
    }

    const result = await importRemoteMcpTools(parsed.profileId, {
      ...registryOptions,
      fetch: context.mcpRemoteToolsFetch,
      resolveHost: context.mcpResolveHost,
      maxTools: parsed.limit,
    });
    tryWriteMcpAuditEvent(context, {
      type: "mcp.profile.remote_tools_import_attempt",
      profileId: result.profileId,
      ok: result.ok,
      details: {
        status: result.status,
        networkAttempted: result.networkAttempted,
        profileHashBefore: result.profileHashBefore,
        trustedProfileHashBefore: result.trustedProfileHashBefore,
        profileHashAfter: result.profileHashAfter,
        trustedProfileHashAfter: result.trustedProfileHashAfter,
        schemaChangePendingAfter: result.schemaChangePendingAfter,
        remoteStatus: result.remoteToolsResult?.status,
        remoteHttpStatus: result.remoteToolsResult?.httpStatus,
        remoteToolCount: result.remoteToolsResult?.toolCount,
        importedTools: result.importedTools?.map((tool) => ({
          name: tool.name,
          risk: tool.risk,
          authRequired: tool.authRequired,
          billable: tool.billable,
          remoteToolHash: tool.remoteToolHash,
        })),
        skippedTools: result.skippedTools?.map((tool) => ({
          name: tool.name,
          reason: tool.reason,
          remoteToolHash: tool.remoteToolHash,
        })),
        message: result.message,
      },
    });

    writeLine(
      result.ok ? context.io.stdout : context.io.stderr,
      formatMcpRemoteToolImportResult(result),
    );
    return;
  }

  if (subcommand === "discover") {
    if (!profileId || command.args.length !== 2) {
      writeLine(context.io.stderr, "Usage: /mcp discover <profile>");
      return;
    }

    const result = await discoverMcpProfile(profileId, {
      ...registryOptions,
      fetch: context.mcpDiscoveryFetch,
      resolveHost: context.mcpResolveHost,
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

  if (subcommand === "allow-tool") {
    const toolName = command.args[2];
    if (!profileId || !toolName || command.args.length !== 3) {
      writeLine(context.io.stderr, "Usage: /mcp allow-tool <profile> <tool>");
      return;
    }

    let result: ReturnType<typeof allowMcpToolGrant>;
    try {
      result = allowMcpToolGrant(profileId, toolName, registryOptions);
    } catch (error) {
      tryWriteMcpAuditEvent(context, {
        type: "mcp.tool.allow_attempt",
        profileId,
        ok: false,
        details: {
          toolName,
          message: "Unable to persist MCP tool grant.",
          error: formatErrorForMcpAudit(error),
        },
      });
      writeLine(context.io.stderr, `Unable to persist MCP tool grant${formatErrorCode(error)}.`);
      return;
    }

    tryWriteMcpAuditEvent(context, {
      type: "mcp.tool.allow_attempt",
      profileId,
      ok: result.ok,
      details: {
        toolName,
        profileHash: result.profileHash,
        risk: result.tool?.risk,
        billable: result.tool?.billable,
        grantProfileHash: result.grant?.profileHash,
        previousGrantProfileHash: result.previousGrant?.profileHash,
        message: result.message,
      },
    });
    writeLine(result.ok ? context.io.stdout : context.io.stderr, result.message);
    return;
  }

  if (subcommand === "allow-model-tool") {
    const toolName = command.args[2];
    if (!profileId || !toolName || command.args.length !== 3) {
      writeLine(context.io.stderr, "Usage: /mcp allow-model-tool <profile> <tool>");
      return;
    }

    let result: ReturnType<typeof allowMcpModelToolGrant>;
    try {
      result = allowMcpModelToolGrant(profileId, toolName, registryOptions);
    } catch (error) {
      tryWriteMcpAuditEvent(context, {
        type: "mcp.model_tool.allow_attempt",
        profileId,
        ok: false,
        details: {
          toolName,
          message: "Unable to persist model MCP tool grant.",
          error: formatErrorForMcpAudit(error),
        },
      });
      writeLine(context.io.stderr, `Unable to persist model MCP tool grant${formatErrorCode(error)}.`);
      return;
    }

    tryWriteMcpAuditEvent(context, {
      type: "mcp.model_tool.allow_attempt",
      profileId,
      ok: result.ok,
      details: {
        toolName,
        profileHash: result.profileHash,
        risk: result.tool?.risk,
        billable: result.tool?.billable,
        grantProfileHash: result.grant?.profileHash,
        previousGrantProfileHash: result.previousGrant?.profileHash,
        message: result.message,
      },
    });
    writeLine(result.ok ? context.io.stdout : context.io.stderr, result.message);
    return;
  }

  if (subcommand === "revoke-tool") {
    const toolName = command.args[2];
    if (!profileId || !toolName || command.args.length !== 3) {
      writeLine(context.io.stderr, "Usage: /mcp revoke-tool <profile> <tool>");
      return;
    }

    let result: ReturnType<typeof revokeMcpToolGrant>;
    try {
      result = revokeMcpToolGrant(profileId, toolName, registryOptions);
    } catch (error) {
      tryWriteMcpAuditEvent(context, {
        type: "mcp.tool.revoke_attempt",
        profileId,
        ok: false,
        details: {
          toolName,
          message: "Unable to persist MCP tool grant.",
          error: formatErrorForMcpAudit(error),
        },
      });
      writeLine(context.io.stderr, `Unable to persist MCP tool grant${formatErrorCode(error)}.`);
      return;
    }

    tryWriteMcpAuditEvent(context, {
      type: "mcp.tool.revoke_attempt",
      profileId,
      ok: result.ok,
      details: {
        toolName,
        previousGrantProfileHash: result.previousGrant?.profileHash,
        message: result.message,
      },
    });
    writeLine(result.ok ? context.io.stdout : context.io.stderr, result.message);
    return;
  }

  if (subcommand === "revoke-model-tool") {
    const toolName = command.args[2];
    if (!profileId || !toolName || command.args.length !== 3) {
      writeLine(context.io.stderr, "Usage: /mcp revoke-model-tool <profile> <tool>");
      return;
    }

    let result: ReturnType<typeof revokeMcpModelToolGrant>;
    try {
      result = revokeMcpModelToolGrant(profileId, toolName, registryOptions);
    } catch (error) {
      tryWriteMcpAuditEvent(context, {
        type: "mcp.model_tool.revoke_attempt",
        profileId,
        ok: false,
        details: {
          toolName,
          message: "Unable to persist model MCP tool grant.",
          error: formatErrorForMcpAudit(error),
        },
      });
      writeLine(context.io.stderr, `Unable to persist model MCP tool grant${formatErrorCode(error)}.`);
      return;
    }

    tryWriteMcpAuditEvent(context, {
      type: "mcp.model_tool.revoke_attempt",
      profileId,
      ok: result.ok,
      details: {
        toolName,
        previousGrantProfileHash: result.previousGrant?.profileHash,
        message: result.message,
      },
    });
    writeLine(result.ok ? context.io.stdout : context.io.stderr, result.message);
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
        registryOptions,
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
    "Usage: /mcp [list|catalog|presets [inspect <preset>]|add-preset <preset>|add-profile <id> <url>|remove-profile <profile>|add-tool <profile> <tool> <risk>|remove-tool <profile> <tool>|model <status|enable|disable>|inspect <profile>|auth <profile>|auth setup <profile>|auth env <profile>|auth init <profile>|auth env-file <profile>|auth keychain [status|set|delete] <profile>|tools <profile>|call <profile> <tool> [arguments-json]|remote-tools <profile>|import-remote-tools <profile>|discover <profile>|enable <profile>|disable <profile>|allow-tool <profile> <tool>|revoke-tool <profile> <tool>|allow-model-tool <profile> <tool>|revoke-model-tool <profile> <tool>]",
  );
}

function handleMcpModelCommand(command: SlashCommand, context: SlashCommandContext): void {
  const action = command.args[1]?.toLowerCase() ?? "status";
  if (action === "status") {
    writeLine(context.io.stdout, renderMcpModelToolState(context));
    return;
  }

  if (action !== "enable" && action !== "disable") {
    writeLine(context.io.stderr, "Usage: /mcp model <status|enable|disable>");
    return;
  }

  if (!context.setModelMcpEnabled) {
    writeLine(
      context.io.stderr,
      "Model-visible MCP tools can be toggled only in an interactive chat session.",
    );
    return;
  }

  const enabled = action === "enable";
  context.setModelMcpEnabled(enabled);
  writeLine(context.io.stdout, renderMcpModelToolState(context));
}

function renderMcpModelToolState(context: SlashCommandContext): string {
  const enabled = context.getModelMcpEnabled?.() === true;
  const summary = getMcpStatusSummary({
    configPath: context.mcpConfigPath,
    profileCatalogPath: context.mcpProfileCatalogPath,
    pluginRegistryPath: context.pluginRegistryPath,
  });
  return [
    "MCP model tools",
    `  state: ${enabled ? "enabled" : "disabled"}`,
    "  model_tool: mcp_call",
    "  policy: read-only non-billable model-granted declared MCP tools only",
    `  model_tool_grants: ${summary.modelToolGrantCount}`,
    `  stale_model_tool_grants: ${summary.staleModelToolGrantCount}`,
    "  gates: profile enabled, trusted hash, no schema change, declared-tool policy allowed, model-tool grant active",
    "  auth: env bearer tokens first, optional macOS Keychain only with ORX_MCP_KEYCHAIN=1",
    "  trust_boundary: remote MCP tool output is untrusted model context",
  ].join("\n");
}

function parseMcpPresetInspectArgs(
  args: string[],
):
  | { kind: "list" }
  | { kind: "inspect"; presetId: string }
  | { kind: "error"; message: string } {
  if (args.length === 1) {
    return { kind: "list" };
  }
  const action = args[1]?.toLowerCase();
  if (action === "inspect" || action === "show" || action === "info") {
    const presetId = args[2];
    if (!presetId || args.length !== 3) {
      return { kind: "error", message: "Usage: orx mcp presets inspect <preset>" };
    }
    return { kind: "inspect", presetId };
  }
  if (args.length === 2) {
    return { kind: "inspect", presetId: args[1] ?? "" };
  }
  return { kind: "error", message: "Usage: orx mcp presets [inspect <preset>]" };
}

function parseMcpAddPresetArgs(args: string[]):
  | {
      presetId: string;
      profileId?: string;
      url?: string;
      authRequired?: boolean;
    }
  | string {
  const presetId = args[1];
  if (!presetId) {
    return "Usage: orx mcp add-preset <preset> [--id <profile-id>] [--url <url>] [--auth-required|--no-auth]";
  }

  const parsed: {
    presetId: string;
    profileId?: string;
    url?: string;
    authRequired?: boolean;
  } = { presetId };
  const rest = args.slice(2);
  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index];
    if (flag === "--id") {
      const value = rest[index + 1];
      if (!value) {
        return "Usage: --id requires a value";
      }
      parsed.profileId = value;
      index += 1;
      continue;
    }
    if (flag === "--url") {
      const value = rest[index + 1];
      if (!value) {
        return "Usage: --url requires a value";
      }
      parsed.url = value;
      index += 1;
      continue;
    }
    if (flag === "--auth-required") {
      parsed.authRequired = true;
      continue;
    }
    if (flag === "--no-auth") {
      parsed.authRequired = false;
      continue;
    }
    return "Unknown add-preset option.";
  }

  return parsed;
}

function parseMcpImportRemoteToolsArgs(args: string[]):
  | {
      profileId: string;
      limit?: number;
    }
  | string {
  const profileId = args[1];
  if (!profileId) {
    return "Usage: orx mcp import-remote-tools <profile> [--limit <n>]";
  }

  const parsed: {
    profileId: string;
    limit?: number;
  } = { profileId };
  const rest = args.slice(2);
  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index];
    if (flag === "--limit") {
      const value = rest[index + 1];
      if (!value) {
        return "Usage: --limit requires a value";
      }
      const limit = Number(value);
      if (!Number.isInteger(limit) || limit < 1 || limit > 128) {
        return "Usage: --limit must be an integer from 1 to 128";
      }
      parsed.limit = limit;
      index += 1;
      continue;
    }
    return "Unknown import-remote-tools option.";
  }

  return parsed;
}

function parseMcpAddProfileArgs(args: string[]):
  | {
      id: string;
      url: string;
      name?: string;
      notes?: string;
      authRequired?: boolean;
    }
  | string {
  const id = args[1];
  const url = args[2];
  if (!id || !url) {
    return "Usage: orx mcp add-profile <id> <url> [--name <name>] [--notes <text>] [--auth-required|--no-auth]";
  }

  const parsed: {
    id: string;
    url: string;
    name?: string;
    notes?: string;
    authRequired?: boolean;
  } = { id, url };
  const rest = args.slice(3);
  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index];
    if (flag === "--name") {
      const parsedValue = parseMcpTextOption(rest, index, "--name");
      if (!parsedValue.ok) {
        return parsedValue.message;
      }
      parsed.name = parsedValue.value;
      index = parsedValue.index;
      continue;
    }
    if (flag === "--notes") {
      const parsedValue = parseMcpTextOption(rest, index, "--notes");
      if (!parsedValue.ok) {
        return parsedValue.message;
      }
      parsed.notes = parsedValue.value;
      index = parsedValue.index;
      continue;
    }
    if (flag === "--auth-required") {
      parsed.authRequired = true;
      continue;
    }
    if (flag === "--no-auth") {
      parsed.authRequired = false;
      continue;
    }
    return `Unknown add-profile option: ${flag}`;
  }

  return parsed;
}

function parseMcpTextOption(
  args: string[],
  index: number,
  flag: string,
): { ok: true; value: string; index: number } | { ok: false; message: string } {
  let cursor = index + 1;
  const values: string[] = [];
  while (cursor < args.length && !args[cursor].startsWith("--")) {
    values.push(args[cursor]);
    cursor += 1;
  }

  if (values.length === 0) {
    return {
      ok: false,
      message: `Usage: ${flag} requires a value`,
    };
  }

  return {
    ok: true,
    value: stripWrappingQuotes(values.join(" ")),
    index: cursor - 1,
  };
}

function stripWrappingQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function parseMcpAddToolArgs(args: string[]):
  | {
      profileId: string;
      toolName: string;
      risk: McpToolRisk;
      authRequired?: boolean;
      billable?: boolean;
    }
  | string {
  const profileId = args[1];
  const toolName = args[2];
  const risk = parseMcpToolRisk(args[3]);
  if (!profileId || !toolName || !risk) {
    return "Usage: orx mcp add-tool <profile> <tool> <read|write|destructive|billable> [--auth-required|--no-auth] [--billable|--free]";
  }

  const parsed: {
    profileId: string;
    toolName: string;
    risk: McpToolRisk;
    authRequired?: boolean;
    billable?: boolean;
  } = { profileId, toolName, risk };
  const rest = args.slice(4);
  for (const flag of rest) {
    if (flag === "--auth-required") {
      parsed.authRequired = true;
      continue;
    }
    if (flag === "--no-auth") {
      parsed.authRequired = false;
      continue;
    }
    if (flag === "--billable") {
      parsed.billable = true;
      continue;
    }
    if (flag === "--free") {
      parsed.billable = false;
      continue;
    }
    return `Unknown add-tool option: ${flag}`;
  }

  return parsed;
}

function parseMcpToolRisk(value: string | undefined): McpToolRisk | undefined {
  if (
    value === "read" ||
    value === "write" ||
    value === "destructive" ||
    value === "billable"
  ) {
    return value;
  }
  return undefined;
}

function parseMcpCallArguments(command: SlashCommand):
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; message: string } {
  const rawArguments = command.argText
    .replace(/^call\s+\S+\s+\S+/i, "")
    .trim();
  if (!rawArguments) {
    return {
      ok: true,
      value: {},
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawArguments) as unknown;
  } catch {
    return {
      ok: false,
      message: "MCP tool arguments must be valid JSON object text.",
    };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      ok: false,
      message: "MCP tool arguments must be a JSON object.",
    };
  }

  return {
    ok: true,
    value: parsed as Record<string, unknown>,
  };
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

function formatProfileIdForMessage(profileId: string): string {
  return profileId.replace(HELP_CONTROL_PATTERN, "").trim().toLowerCase().slice(0, 80);
}

function formatAuthArgForMessage(value: string): string {
  if (SECRET_LIKE_MESSAGE_PATTERN.test(value)) {
    return "[redacted]";
  }
  const cleaned = value.replace(HELP_CONTROL_PATTERN, "").trim();
  return cleaned.length > 0 ? cleaned.slice(0, 80) : "[redacted]";
}

function formatDelegationTeamIdForMessage(teamId: string): string {
  return teamId.replace(HELP_CONTROL_PATTERN, "").trim().toLowerCase().slice(0, 80);
}

function isDelegationTeamSlashCommand(subcommand: string): boolean {
  return (
    subcommand === "save" ||
    subcommand === "use" ||
    subcommand === "load" ||
    subcommand === "inspect" ||
    subcommand === "show" ||
    subcommand === "info" ||
    subcommand === "delete" ||
    subcommand === "remove" ||
    subcommand === "rm"
  );
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
  if (error instanceof DelegationStateError || error instanceof DelegationPolicyError) {
    return error.message;
  }
  if (error instanceof Error) {
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
