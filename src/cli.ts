#!/usr/bin/env node
import { readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createOpenRouterAuthReport,
  initializeOpenRouterAuthEnvFile,
  renderOpenRouterAuthEnvFileInitResult,
  renderOpenRouterAuthSetup,
  renderOpenRouterAuthStatus,
} from "./auth/openrouter.js";
import { BIN_NAME } from "./constants.js";
import { formatToolCallStart, formatToolResult, runAgentTurn } from "./agent/index.js";
import {
  CODE_AST_GREP_USAGE,
  CODE_TREE_SITTER_OUTLINE_USAGE,
  CODE_TREE_SITTER_USAGE,
  createCodeMap,
  createCodeCallGraph,
  createCodeImportGraph,
  createCodeReferenceIndex,
  createCodeSymbolIndex,
  parseCodeJsonArgs,
  parseCodeAstGrepArgs,
  parseCodeTreeSitterArgs,
  renderCodeMap,
  renderCodeMapJson,
  renderCodeAstGrepResult,
  renderCodeCallGraph,
  renderCodeCallGraphJson,
  renderCodeImportGraph,
  renderCodeImportGraphJson,
  renderCodeReferences,
  renderCodeReferencesJson,
  renderCodeSymbols,
  renderCodeSymbolsJson,
  renderCodeTreeSitterResult,
  renderCodeTreeSitterResultJson,
  runCodeAstGrep,
  runCodeTreeSitter,
  type AstGrepRunner,
  type TreeSitterRunner,
} from "./code-map/index.js";
import {
  initializeConfig,
  loadConfig,
  parseConfigInitArgs,
  parseConfigSetArgs,
  renderConfigPaths,
  renderConfigShow,
  setConfigValue,
  validateApiKey,
} from "./config/index.js";
import type { LoadedConfig, OrxConfig, OrxMode } from "./config/types.js";
import {
  addOpenRouterDelegate,
  createEmptyDelegationState,
  deleteSavedDelegationTeam,
  findSavedDelegationTeam,
  getDelegationTeamStatusSummary,
  loadDelegationExecutionPolicy,
  parseDelegationExecutionPolicySetArgs,
  renderDelegates,
  renderDelegationExecutionPolicy,
  renderDelegationReadinessPlan,
  renderDelegationTeamInspect,
  renderDelegationTeamList,
  renderDelegationTeamReadinessPlan,
  renderDelegationTeamUse,
  renderOrchestratorStatus,
  renderSessionlessDelegationRefusal,
  resolveDelegationAuditLogPath,
  resolveDelegationPolicyPath,
  resolveDelegationTeamRegistryPath,
  saveDelegationTeam,
  setOpenRouterController,
  updateDelegationExecutionPolicy,
  validateDelegateName,
  validateOpenRouterModel,
  type DelegationState,
} from "./delegation/index.js";
import {
  DIAG_USAGE,
  DIAGNOSTICS_USAGE,
  findDiagnosticProfile,
  parseDiagnosticReadinessJsonFlag,
  parseDiagnosticRunArgs,
  renderDiagnosticInspectUsage,
  renderDiagnosticProfileInspect,
  renderDiagnosticProfileInspectJson,
  renderDiagnosticProfiles,
  renderDiagnosticProfilesJson,
  renderLocalDiagnosticsJson,
  renderLocalDiagnosticsResult,
  renderMissingDiagnosticProfile,
  runLocalDiagnostics,
  type DiagnosticsProcessRunner,
} from "./diagnostics/index.js";
import type { AskRequestOverrides } from "./openrouter/request.js";
import type { OpenRouterMessage } from "./openrouter/types.js";
import { formatOpenRouterMetadata } from "./openrouter/summary.js";
import {
  formatOpenRouterCredits,
  formatOpenRouterGeneration,
  formatOpenRouterLiveError,
  formatOpenRouterModels,
  getOpenRouterCredits,
  getOpenRouterGeneration,
  listOpenRouterModels,
} from "./openrouter/live.js";
import {
  allowMcpModelToolGrant,
  allowMcpToolGrant,
  callRemoteMcpTool,
  createMcpSetupPlan,
  deleteMcpMacosKeychainBearer,
  discoverMcpProfile,
  findMcpProviderPreset,
  formatMcpDiscoveryResult,
  formatMcpProviderPresetIdForMessage,
  formatMcpRemoteToolImportResult,
  formatMcpRemoteToolsResult,
  formatMcpToolCallResult,
  getMcpMacosKeychainStatus,
  getMcpProfileAuthReport,
  getMcpProfileToolPolicyReport,
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
  renderMcpSetupPlan,
  renderMcpStatus,
  renderUserMcpProfileCatalog,
  resolveMcpConfigPath,
  resolveMcpProfileCatalogPath,
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
} from "./mcp/index.js";
import {
  createEnabledPluginPromptsSystemMessage,
  createEnabledPluginRulesSystemMessage,
  createEnabledPluginSkillsSystemMessage,
  createPluginReview,
  discoverEnabledPluginBins,
  discoverEnabledPluginCommandAliases,
  discoverEnabledPluginHooks,
  findDiscoveredBin,
  findDiscoveredHook,
  findPluginCatalogEntry,
  formatBinIdForMessage,
  formatHookIdForMessage,
  formatPluginCatalogIdForMessage,
  getPluginBinTrustSummary,
  getPluginHookTrustSummary,
  getPluginStatusSummary,
  checkPluginCatalogUpdates,
  installPlugin,
  loadPluginCatalog,
  parsePluginCatalogAddGitArgs,
  parsePluginCatalogAddLocalArgs,
  parsePluginScaffoldArgs,
  removePluginCatalogEntry,
  renderPluginBinInspect,
  renderPluginBinRunResult,
  renderPluginBins,
  renderPluginCommandAliases,
  renderPluginCatalogInspect,
  renderPluginCatalogUpdateApplyResult,
  renderPluginCatalogUpdateReport,
  renderPluginScaffoldResult,
  renderPluginValidation,
  renderPluginHookInspect,
  renderPluginHookLifecycleResult,
  renderPluginHookRunResult,
  renderPluginHooks,
  renderPluginCatalog,
  renderPluginInspect,
  renderPluginList,
  renderPluginReview,
  resolvePluginBinsAuditLogPath,
  resolvePluginBinsConfigPath,
  resolvePluginHooksAuditLogPath,
  resolvePluginCacheDirectory,
  resolvePluginCatalogPath,
  resolvePluginHooksConfigPath,
  resolveInstalledPluginReference,
  resolvePluginRegistryPath,
  runPluginBin,
  runPluginHook,
  runTrustedPluginHooksForEvent,
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
  type PluginHookEvent,
} from "./plugins/index.js";
import {
  applySavedProfile,
  deleteSavedProfile,
  findSavedProfile,
  getProfileStatusSummary,
  parseProfileSaveArgs,
  renderProfileInspect,
  renderProfileList,
  resolveProfileConfigPath,
  saveCurrentProfile,
} from "./profiles/index.js";
import type { BrowserSnapshotDriver } from "./research/index.js";
import { resolveSessionDirectory } from "./sessions/index.js";
import {
  SCAN_USAGE,
  SCANNERS_USAGE,
  findScannerProfile,
  parseScannerReadinessJsonFlag,
  parseScannerRunArgs,
  renderMissingScannerProfile,
  renderScannerInspectUsage,
  renderScannerProfileInspect,
  renderScannerProfileInspectJson,
  renderScannerProfiles,
  renderScannerProfilesJson,
  renderScannerRunResult,
  runSecurityScanner,
  type ScannerProcessRunner,
} from "./security/index.js";
import { createDoctorReport } from "./doctor.js";
import { GUIDE_USAGE, renderOperatorGuide } from "./guide.js";
import { formatStatus } from "./status.js";
import {
  discoverTestTargets,
  parseTestReadinessJsonFlag,
  parseTestRunArgs,
  renderTestRunResult,
  renderTestRunResultJson,
  renderTestTargets,
  renderTestTargetsJson,
  runTestTarget,
} from "./testing/index.js";
import { runChat } from "./tui/chat.js";
import {
  clearChatHistory,
  loadChatHistory,
  renderChatHistory,
  renderChatHistoryCleared,
  resolveChatHistoryPath,
} from "./tui/history.js";

interface PackageJson {
  version: string;
}

interface CliIo {
  stdin?: NodeJS.ReadableStream;
  stdout: Pick<NodeJS.WriteStream, "write">;
  stderr: Pick<NodeJS.WriteStream, "write">;
  cwd: string;
  fetch?: typeof fetch;
  mcpDiscoveryFetch?: typeof fetch;
  mcpRemoteToolsFetch?: typeof fetch;
  mcpCallFetch?: typeof fetch;
  mcpKeychainRunner?: McpMacosKeychainCommandRunner;
  mcpKeychainPlatform?: NodeJS.Platform;
  browserSnapshot?: BrowserSnapshotDriver;
  astGrepRunner?: AstGrepRunner;
  treeSitterRunner?: TreeSitterRunner;
  scannerRunner?: ScannerProcessRunner;
  diagnosticsRunner?: DiagnosticsProcessRunner;
}

interface AskCommand {
  prompt: string;
  overrides: AskRequestOverrides;
  mcpTools: boolean;
  maxToolIterations?: number;
}

interface GlobalCliOptions {
  profile?: string;
  args: string[];
}

const VALID_MODES = new Set<OrxMode>(["auto", "fusion", "exact"]);
const CLI_NAMESPACE_USAGES = {
  auth: "Usage: orx auth [status|setup|env|init|env-file]",
  config: "Usage: orx config [show|path|init|set <key> <value> [--user|--local]]",
  profile: "Usage: orx profile [list|save <id> [options]|use <id>|inspect <id>|delete <id>]",
  history: "Usage: orx history [search <query>|clear]",
  mcp: "Usage: orx mcp [list|plan [preset-or-profile]|catalog|presets [inspect <preset>]|add-preset <preset>|add-profile <id> <url>|remove-profile <profile>|add-tool <profile> <tool> <risk>|remove-tool <profile> <tool>|inspect <profile>|auth <profile>|auth setup <profile>|auth env <profile>|auth init <profile>|auth env-file <profile>|auth keychain [status|set|delete] <profile>|tools <profile>|call <profile> <tool> [arguments-json]|remote-tools <profile>|import-remote-tools <profile>|discover <profile>|enable <profile>|disable <profile>|allow-tool <profile> <tool>|revoke-tool <profile> <tool>|allow-model-tool <profile> <tool>|revoke-model-tool <profile> <tool>]",
  plugins: "Usage: orx plugins [catalog [list|inspect|updates|update|add-local|add-git|remove]|list|review|doctor|audit|commands|scaffold <directory>|validate <manifest-path-or-directory>|inspect <id>|register <manifest-path-or-directory-or-catalog-id>|install <manifest-path-or-directory-or-catalog-id>|enable <id>|disable <id>]",
  bins: "Usage: orx bins [list|inspect <id>|trust <id>|untrust <id>|run <id> [args...]]",
  hooks: "Usage: orx hooks [list|inspect <id>|trust <id>|untrust <id>|run <id>]",
  tests: "Usage: orx tests [list [--json]|status [--json]|run [target-id] [--json] [-- args...]]",
  code: "Usage: orx code [map|symbols|refs|imports|calls|ast-grep|tree-sitter|outline] [query-or-path]",
  scanners: SCANNERS_USAGE,
  scan: SCAN_USAGE,
  diagnostics: DIAGNOSTICS_USAGE,
  diag: DIAG_USAGE,
  orchestrator: "Usage: orx orchestrator [status|plan|openrouter <model>|clear]",
  delegate: "Usage: orx delegate [status|plan [saved-team-id]|add <name> openrouter <model>|remove <name>|clear|team|policy]",
  delegates:
    "Usage: orx delegates [list|status|plan [saved-team-id]|policy|teams|save <id> --controller <model> --delegate <name> <model>|use <id>|inspect <id>|delete <id>]",
} as const;

const CLI_API_COMMAND_USAGES = {
  ask: 'Usage: orx ask [--model <slug>] [--mode <auto|fusion|exact>] [--fusion <preset>] [--mcp-tools] [--max-tool-iterations <n>] "prompt"',
  chat: "Usage: orx chat",
  models: "Usage: orx models [filter]",
  credits: "Usage: orx credits",
  generation: "Usage: orx generation <id>",
} as const;

const CLI_MCP_SUBCOMMAND_USAGES = {
  plan: "Usage: orx mcp plan [preset-or-profile]",
  presets: "Usage: orx mcp presets [inspect <preset>]",
  presetsInspect: "Usage: orx mcp presets inspect <preset>",
  addPreset: "Usage: orx mcp add-preset <preset> [--id <profile-id>] [--url <url>] [--auth-required|--no-auth]",
} as const;

const CLI_PLUGIN_SUBCOMMAND_USAGES = {
  scaffold:
    "Usage: orx plugins scaffold <directory> [--name <id>] [--publisher <id>] [--version <version>] [--description <text>] [--with <components>] [--minimal]",
  validate: "Usage: orx plugins validate <manifest-path-or-directory>",
  install: "Usage: orx plugins install <manifest-path-or-directory-or-catalog-id>",
  register: "Usage: orx plugins register <manifest-path-or-directory-or-catalog-id>",
  review: "Usage: orx plugins review|doctor|audit",
  catalog:
    "Usage: orx plugins catalog [list|inspect <id>|updates [id]|update <id>|add-local <manifest-path-or-directory>|add-git <id> <repository> <resolved-commit>|remove <id>]",
} as const;

function isHelpToken(value: string | undefined): boolean {
  const normalized = value?.toLowerCase();
  return normalized === "help" || normalized === "--help" || normalized === "-h";
}

function isHelpFlagToken(value: string | undefined): boolean {
  return value === "--help" || value === "-h";
}

function isNamespaceHelp(args: string[]): boolean {
  return args.length === 1 && isHelpToken(args[0]);
}

function getNamespaceHelpUsage(args: string[]): string | undefined {
  if (args.length !== 2 || !isHelpToken(args[1])) {
    return undefined;
  }

  const command = args[0]?.toLowerCase();
  switch (command) {
    case "auth":
      return CLI_NAMESPACE_USAGES.auth;
    case "config":
      return CLI_NAMESPACE_USAGES.config;
    case "profile":
    case "profiles":
      return CLI_NAMESPACE_USAGES.profile;
    case "history":
      return CLI_NAMESPACE_USAGES.history;
    case "mcp":
      return CLI_NAMESPACE_USAGES.mcp;
    case "plugin":
    case "plugins":
      return CLI_NAMESPACE_USAGES.plugins;
    case "bin":
    case "bins":
      return CLI_NAMESPACE_USAGES.bins;
    case "hook":
    case "hooks":
      return CLI_NAMESPACE_USAGES.hooks;
    case "test":
    case "tests":
      return CLI_NAMESPACE_USAGES.tests;
    case "code":
      return CLI_NAMESPACE_USAGES.code;
    case "scanner":
    case "scanners":
      return CLI_NAMESPACE_USAGES.scanners;
    case "scan":
      return CLI_NAMESPACE_USAGES.scan;
    case "diagnostics":
      return CLI_NAMESPACE_USAGES.diagnostics;
    case "diag":
      return CLI_NAMESPACE_USAGES.diag;
    case "orchestrator":
      return CLI_NAMESPACE_USAGES.orchestrator;
    case "delegate":
      return CLI_NAMESPACE_USAGES.delegate;
    case "delegates":
      return CLI_NAMESPACE_USAGES.delegates;
    default:
      return undefined;
  }
}

function getNestedCommandHelpUsage(args: string[]): string | undefined {
  if (!args.slice(1).includes("--help") && !args.slice(1).includes("-h")) {
    return undefined;
  }

  const command = args[0]?.toLowerCase();
  if (command === "mcp") {
    return getMcpSubcommandHelpUsage(args.slice(1));
  }
  if (command === "plugins" || command === "plugin") {
    return getPluginSubcommandHelpUsage(args.slice(1));
  }

  return undefined;
}

function getMcpSubcommandHelpUsage(args: string[]): string | undefined {
  const subcommand = args[0]?.toLowerCase();
  switch (subcommand) {
    case "plan":
    case "setup-plan":
      return args.length === 2 && isHelpFlagToken(args[1])
        ? CLI_MCP_SUBCOMMAND_USAGES.plan
        : undefined;
    case "presets":
    case "preset":
      if (args.length === 2 && isHelpFlagToken(args[1])) {
        return CLI_MCP_SUBCOMMAND_USAGES.presets;
      }
      if (args.length === 3 && args[1]?.toLowerCase() === "inspect" && isHelpFlagToken(args[2])) {
        return CLI_MCP_SUBCOMMAND_USAGES.presetsInspect;
      }
      return undefined;
    case "add-preset":
      return args.length === 2 && isHelpFlagToken(args[1])
        ? CLI_MCP_SUBCOMMAND_USAGES.addPreset
        : undefined;
    default:
      return undefined;
  }
}

function getPluginSubcommandHelpUsage(args: string[]): string | undefined {
  const subcommand = args[0]?.toLowerCase();
  switch (subcommand) {
    case "scaffold":
      return args.length === 2 && isHelpFlagToken(args[1])
        ? CLI_PLUGIN_SUBCOMMAND_USAGES.scaffold
        : undefined;
    case "validate":
    case "check":
      return args.length === 2 && isHelpFlagToken(args[1])
        ? CLI_PLUGIN_SUBCOMMAND_USAGES.validate
        : undefined;
    case "install":
      return args.length === 2 && isHelpFlagToken(args[1])
        ? CLI_PLUGIN_SUBCOMMAND_USAGES.install
        : undefined;
    case "register":
      return args.length === 2 && isHelpFlagToken(args[1])
        ? CLI_PLUGIN_SUBCOMMAND_USAGES.register
        : undefined;
    case "review":
    case "doctor":
    case "audit":
      return args.length === 2 && isHelpFlagToken(args[1])
        ? CLI_PLUGIN_SUBCOMMAND_USAGES.review
        : undefined;
    case "catalog":
      return args.length === 2 && isHelpFlagToken(args[1])
        ? CLI_PLUGIN_SUBCOMMAND_USAGES.catalog
        : undefined;
    default:
      return undefined;
  }
}

function getApiCommandHelpUsage(args: string[]): string | undefined {
  const command = args[0]?.toLowerCase();
  if (!command || !args.slice(1).some(isHelpFlagToken)) {
    return undefined;
  }

  switch (command) {
    case "ask":
      return CLI_API_COMMAND_USAGES.ask;
    case "chat":
      return CLI_API_COMMAND_USAGES.chat;
    case "models":
      return CLI_API_COMMAND_USAGES.models;
    case "credits":
      return CLI_API_COMMAND_USAGES.credits;
    case "generation":
      return CLI_API_COMMAND_USAGES.generation;
    default:
      return undefined;
  }
}

export async function runCli(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
  io: CliIo = {
    stdout: process.stdout,
    stderr: process.stderr,
    stdin: process.stdin,
    cwd: process.cwd(),
    fetch: globalThis.fetch,
  },
): Promise<number> {
  const parsedGlobalOptions = parseGlobalOptions(argv.slice(2));
  if (typeof parsedGlobalOptions === "string") {
    writeLine(io.stderr, parsedGlobalOptions);
    return 1;
  }

  const args = parsedGlobalOptions.args;
  const first = args[0];

  if (first === "help" || first === "--help" || first === "-h") {
    writeLine(io.stdout, helpText());
    return 0;
  }

  if (first === "--version" || first === "-v" || first === "version") {
    writeLine(io.stdout, getVersion());
    return 0;
  }

  if ((first === "guide" || first === "quickstart") && args.length === 2 && isHelpToken(args[1])) {
    writeLine(io.stdout, GUIDE_USAGE);
    return 0;
  }

  const namespaceHelpUsage = getNamespaceHelpUsage(args);
  if (namespaceHelpUsage) {
    writeLine(io.stdout, namespaceHelpUsage);
    return 0;
  }

  const apiCommandHelpUsage = getApiCommandHelpUsage(args);
  if (apiCommandHelpUsage) {
    writeLine(io.stdout, apiCommandHelpUsage);
    return 0;
  }

  const nestedCommandHelpUsage = getNestedCommandHelpUsage(args);
  if (nestedCommandHelpUsage) {
    writeLine(io.stdout, nestedCommandHelpUsage);
    return 0;
  }

  if (first === "init" || first === "setup") {
    return runInitCommand(args.slice(1), io, env, {
      commandName: first === "setup" ? "orx setup" : "orx init",
      commandLabel: first,
    });
  }

  if (first === "config" && args[1]?.toLowerCase() === "init") {
    return runInitCommand(args.slice(2), io, env, {
      commandName: "orx config init",
      commandLabel: "config init",
    });
  }

  if (first === "auth") {
    return runOpenRouterAuthCommand(args.slice(1), io, env);
  }

  const mcpConfigPath = resolveMcpConfigPath({ env, cwd: io.cwd });
  const mcpProfileCatalogPath = resolveMcpProfileCatalogPath({ env, cwd: io.cwd });
  const pluginRegistryPath = resolvePluginRegistryPath({ env, cwd: io.cwd });
  const pluginCacheDirectory = resolvePluginCacheDirectory({
    env,
    cwd: io.cwd,
    registryPath: pluginRegistryPath,
  });
  const pluginBinsConfigPath = resolvePluginBinsConfigPath({ env, cwd: io.cwd });
  const pluginBinsAuditLogPath = resolvePluginBinsAuditLogPath({ env, cwd: io.cwd });
  const pluginHooksConfigPath = resolvePluginHooksConfigPath({ env, cwd: io.cwd });
  const pluginHooksAuditLogPath = resolvePluginHooksAuditLogPath({ env, cwd: io.cwd });
  const pluginCatalogPath = resolvePluginCatalogPath({ env, cwd: io.cwd });
  const profileConfigPath = resolveProfileConfigPath({ env, cwd: io.cwd });
  const chatHistoryPath = resolveChatHistoryPath({ env, cwd: io.cwd });
  const delegationTeamConfigPath = resolveDelegationTeamRegistryPath({ env, cwd: io.cwd });
  const delegationPolicyPath = resolveDelegationPolicyPath({ env, cwd: io.cwd });
  const delegationAuditLogPath = resolveDelegationAuditLogPath({ env, cwd: io.cwd });
  const loadedConfigResult = loadConfigWithProfile({
    env,
    cwd: io.cwd,
    profileId: parsedGlobalOptions.profile,
    profileConfigPath,
  });
  if (typeof loadedConfigResult === "string") {
    if (isConfigPathCommand(first, args) && isConfigLoadFailureMessage(loadedConfigResult)) {
      writeLine(io.stdout, renderConfigPaths(undefined, { cwd: io.cwd, env }));
      return 0;
    }
    writeLine(io.stderr, loadedConfigResult);
    return 1;
  }
  const loadedConfig = loadedConfigResult;

  if (first === "status") {
    writeLine(
      io.stdout,
      formatStatus({
        cwd: io.cwd,
        loadedConfig,
        mcpConfigPath,
        mcpProfileCatalogPath,
        pluginCacheDirectory,
        pluginBinsAuditLogPath,
        pluginBinsConfigPath,
        pluginHooksAuditLogPath,
        pluginHooksConfigPath,
        pluginRegistryPath,
        profileConfigPath,
        delegationTeamConfigPath,
        delegationPolicyPath,
        delegationAuditLogPath,
        renderOptions: { stream: io.stdout, theme: loadedConfig.config.theme },
      }),
    );
    return 0;
  }

  if (first === "doctor") {
    const doctorOptions = parseDoctorArgs(args.slice(1));
    if (typeof doctorOptions === "string") {
      writeLine(io.stderr, doctorOptions);
      return 1;
    }
    if (doctorOptions.help) {
      writeLine(io.stdout, "Usage: orx doctor [--strict] [--json]");
      return 0;
    }
    const report = createDoctorReport({
      cwd: io.cwd,
      loadedConfig,
      mcpConfigPath,
      mcpProfileCatalogPath,
      pluginCatalogPath,
      pluginBinsConfigPath,
      pluginHooksConfigPath,
      pluginRegistryPath,
      profileConfigPath,
      delegationTeamConfigPath,
      delegationPolicyPath,
    });
    writeLine(io.stdout, doctorOptions.json ? JSON.stringify(report.json, null, 2) : report.text);
    if (doctorOptions.strict && !report.strictReady) {
      writeLine(
        io.stderr,
        `ORX doctor strict gate failed: ready_to_use=${report.readiness.readyToUse} overall=${report.readiness.overall}`,
      );
      return 1;
    }
    return 0;
  }

  if (first === "guide" || first === "quickstart") {
    const guideOptions = parseGuideArgs(args.slice(1));
    if (typeof guideOptions === "string") {
      writeLine(io.stderr, guideOptions);
      return 1;
    }
    const report = createDoctorReport({
      cwd: io.cwd,
      loadedConfig,
      mcpConfigPath,
      mcpProfileCatalogPath,
      pluginCatalogPath,
      pluginBinsConfigPath,
      pluginHooksConfigPath,
      pluginRegistryPath,
      profileConfigPath,
      delegationTeamConfigPath,
      delegationPolicyPath,
    });
    writeLine(io.stdout, renderOperatorGuide(report));
    return 0;
  }

  if (first === "config") {
    return runConfigCommand(args.slice(1), loadedConfig, io, env);
  }

  if (first === "profile" || first === "profiles") {
    return runProfileCommand(args.slice(1), loadedConfig.config, io, profileConfigPath);
  }

  if (first === "history") {
    return runHistoryCommand(args.slice(1), io, chatHistoryPath);
  }

  if (first === "plugins" || first === "plugin") {
    return runPluginsCommand(
      args.slice(1),
      io,
      pluginRegistryPath,
      pluginCacheDirectory,
      pluginCatalogPath,
      pluginBinsConfigPath,
      pluginHooksConfigPath,
    );
  }

  if (first === "bins" || first === "bin") {
    return runBinsCommand(
      args.slice(1),
      env,
      io,
      pluginRegistryPath,
      pluginBinsConfigPath,
      pluginBinsAuditLogPath,
    );
  }

  if (first === "hooks" || first === "hook") {
    return runHooksCommand(
      args.slice(1),
      env,
      io,
      pluginRegistryPath,
      pluginHooksConfigPath,
      pluginHooksAuditLogPath,
    );
  }

  if (first === "mcp") {
    return runMcpCommand(
      args.slice(1),
      io,
      env,
      mcpConfigPath,
      mcpProfileCatalogPath,
      pluginRegistryPath,
      env.ORX_MCP_AUDIT_PATH,
    );
  }

  if (first === "tests" || first === "test") {
    return runTestsCommand(args.slice(1), io);
  }

  if (first === "code") {
    return runCodeCommand(args.slice(1), io);
  }

  if (first === "map" || first === "code-map") {
    return runCodeMapCommand(args.slice(1), io);
  }

  if (first === "symbols") {
    return runCodeSymbolsCommand(args.slice(1), io);
  }

  if (first === "refs" || first === "references") {
    return runCodeReferencesCommand(args.slice(1), io);
  }

  if (first === "imports" || first === "import-graph") {
    return runCodeImportGraphCommand(args.slice(1), io);
  }

  if (first === "calls" || first === "call-graph") {
    return runCodeCallGraphCommand(args.slice(1), io);
  }

  if (first === "ast-grep") {
    return runCodeAstGrepCommand(args.slice(1), io);
  }

  if (first === "tree-sitter") {
    return runCodeTreeSitterCommand(args.slice(1), io);
  }

  if (first === "outline") {
    return runCodeTreeSitterCommand(args.slice(1), io, {
      defaultMode: "outline",
      usage: CODE_TREE_SITTER_OUTLINE_USAGE,
    });
  }

  if (first === "scanners" || first === "scanner") {
    return runScannersCommand(args.slice(1), io, env);
  }

  if (first === "scan") {
    return runScanAliasCommand(args.slice(1), io, env);
  }

  if (first === "diagnostics") {
    return runDiagnosticsCommand(args.slice(1), io, env, DIAGNOSTICS_USAGE);
  }

  if (first === "diag") {
    return runDiagnosticsCommand(args.slice(1), io, env, DIAG_USAGE);
  }

  if (first === "orchestrator") {
    return runOrchestratorCommand(args.slice(1), io, delegationPolicyPath);
  }

  if (first === "delegate") {
    return runDelegateCommand(args.slice(1), io, delegationTeamConfigPath, delegationPolicyPath);
  }

  if (first === "delegates") {
    return runDelegatesCommand(args.slice(1), io, delegationTeamConfigPath, delegationPolicyPath);
  }

  const apiKeyError = validateApiKey(loadedConfig);
  if (apiKeyError) {
    writeLine(io.stderr, apiKeyError);
    return 1;
  }

  if (first === "ask") {
    return runAskCommand(args.slice(1), loadedConfig.config.apiKey ?? "", loadedConfig.config, io, {
      hookEnv: env,
      mcpAuditLogPath: env.ORX_MCP_AUDIT_PATH,
      mcpConfigPath,
      mcpProfileCatalogPath,
      mcpKeychainPlatform: io.mcpKeychainPlatform,
      mcpKeychainRunner: io.mcpKeychainRunner,
      pluginHooksAuditLogPath,
      pluginHooksConfigPath,
      pluginRegistryPath,
    });
  }

  if (first === "models") {
    return runModelsCommand(args.slice(1), loadedConfig.config.apiKey ?? "", io);
  }

  if (first === "credits") {
    return runCreditsCommand(loadedConfig.config.apiKey ?? "", loadedConfig.config, io);
  }

  if (first === "generation") {
    return runGenerationCommand(args.slice(1), loadedConfig.config.apiKey ?? "", io);
  }

  if (!first || first === "chat") {
    return runChatCommand(env, loadedConfig, io, {
      mcpConfigPath,
      mcpKeychainPlatform: io.mcpKeychainPlatform,
      mcpKeychainRunner: io.mcpKeychainRunner,
      mcpProfileCatalogPath,
      pluginCacheDirectory,
      pluginCatalogPath,
      pluginBinsAuditLogPath,
      pluginBinsConfigPath,
      pluginHooksAuditLogPath,
      pluginHooksConfigPath,
      pluginRegistryPath,
      profileConfigPath,
      chatHistoryPath,
      delegationTeamConfigPath,
      delegationPolicyPath,
      delegationAuditLogPath,
    });
  }

  writeLine(io.stderr, `Unknown command: ${first}\n\n${helpText()}`);
  return 1;
}

function helpText(): string {
  return [
    "ORX",
    "",
    "OpenRouter-native terminal coding agent.",
    "",
    "Usage:",
    `  ${BIN_NAME}`,
    `  ${BIN_NAME} <command> [options]`,
    "",
    "Commands:",
    "  (no command)  Start an interactive OpenRouter chat session",
    '  ask "prompt"  Send one prompt to OpenRouter and stream the answer',
    "  chat          Start an interactive OpenRouter chat session",
    "  models [q]    List live OpenRouter models with an optional filter",
    "  credits       Show live OpenRouter credits",
    "  generation <id>  Show OpenRouter generation metadata",
    "  init          Create a no-secret starter config for first-run setup",
    "  auth          Show OpenRouter API-key setup status or create an env template",
    "  config        Show or edit local ORX configuration",
    "  profile       List, inspect, save, or delete local ORX profiles",
    "  history       Search or clear local prompt history",
    "  mcp           Plan, inspect, enable, auth, call, and grant MCP tool policy",
    "  plugins       List catalog entries, scaffold, validate, install, enable, or disable plugins",
    "  bins          List, inspect, trust, untrust, or run plugin bins",
    "  hooks         List, inspect, trust, untrust, or run plugin hook definitions",
    "  tests         Discover or run native test targets",
    "  code          Render local code maps, symbol indexes, references, imports, calls, ast-grep searches, or tree-sitter parses/outlines/imports/refs/calls/repo-files/repo-outline/repo-symbols/repo-refs/repo-calls/repo-imports/repo-deps",
    "  scanners      List, inspect, or run local security scanner profiles",
    "  scan          Alias for a local scanner run",
    "  diagnostics  List, inspect, or run local diagnostics profiles",
    "  diag          Alias for diagnostics",
    "  orchestrator  Show delegation readiness or refuse session-less changes",
    "  delegate      Show/refuse session delegate changes, policy, or saved teams",
    "  delegates     Show delegate readiness, execution policy, or saved teams",
    "  status        Show runtime status and config defaults",
    "  doctor        Run a no-network readiness check; use --strict to fail when not ready",
    "  guide         Show a no-network quickstart for daily use, MCP, plugins, and delegation",
    "  quickstart    Alias for guide",
    "  help          Show this help message",
    "  version       Show the current version",
    "",
    "Ask options:",
    "  --model <slug>          Use an exact OpenRouter model slug",
    "  --mode <auto|fusion|exact>",
    "  --fusion <preset>       Use an OpenRouter Fusion preset",
    "  --mcp-tools             Expose model-granted read-only non-billable MCP tools",
    "",
    "Global options:",
    "  --profile <id>          Apply a saved ORX profile for this invocation",
    "  -h, --help              Show this help message",
    "  -v, --version           Show the current version",
  ].join("\n");
}

function runChatCommand(
  env: NodeJS.ProcessEnv,
  loadedConfig: LoadedConfig,
  io: CliIo,
  paths?: {
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
    chatHistoryPath?: string;
    delegationTeamConfigPath?: string;
    delegationPolicyPath?: string;
    delegationAuditLogPath?: string;
    mcpKeychainPlatform?: NodeJS.Platform;
    mcpKeychainRunner?: McpMacosKeychainCommandRunner;
  },
): Promise<number> {
  return runChat({
    apiKey: loadedConfig.config.apiKey ?? "",
    loadedConfig,
    io: {
      stdin: io.stdin ?? process.stdin,
      stdout: io.stdout,
      stderr: io.stderr,
      cwd: io.cwd,
      fetch: io.fetch,
      webSearchFetch: io.fetch,
      browserSnapshot: io.browserSnapshot,
    },
    sessionDirectory: resolveSessionDirectory({ env, cwd: io.cwd }),
    mcpAuditLogPath: env.ORX_MCP_AUDIT_PATH,
    mcpConfigPath: paths?.mcpConfigPath,
    mcpKeychainPlatform: paths?.mcpKeychainPlatform,
    mcpKeychainRunner: paths?.mcpKeychainRunner,
    mcpProfileCatalogPath: paths?.mcpProfileCatalogPath,
    pluginCacheDirectory: paths?.pluginCacheDirectory,
    pluginCatalogPath: paths?.pluginCatalogPath,
    pluginBinsAuditLogPath: paths?.pluginBinsAuditLogPath,
    pluginBinsConfigPath: paths?.pluginBinsConfigPath,
    pluginHooksAuditLogPath: paths?.pluginHooksAuditLogPath,
    pluginHooksConfigPath: paths?.pluginHooksConfigPath,
    pluginRegistryPath: paths?.pluginRegistryPath,
    profileConfigPath: paths?.profileConfigPath,
    chatHistoryPath: paths?.chatHistoryPath,
    delegationTeamConfigPath: paths?.delegationTeamConfigPath,
    delegationPolicyPath: paths?.delegationPolicyPath,
    delegationAuditLogPath: paths?.delegationAuditLogPath,
    braveSearchApiKey: env.BRAVE_SEARCH_API_KEY,
    env,
    hookEnv: env,
  });
}

async function runModelsCommand(args: string[], apiKey: string, io: CliIo): Promise<number> {
  const query = args.join(" ").trim() || undefined;

  try {
    const models = await listOpenRouterModels({
      apiKey,
      fetch: io.fetch,
    });
    writeLine(io.stdout, formatOpenRouterModels(models, query));
    return 0;
  } catch (error) {
    writeLine(io.stderr, formatOpenRouterLiveError(error, { apiKey }));
    return 1;
  }
}

async function runCreditsCommand(apiKey: string, config: OrxConfig, io: CliIo): Promise<number> {
  try {
    const credits = await getOpenRouterCredits({
      apiKey,
      fetch: io.fetch,
    });
    writeLine(
      io.stdout,
      formatOpenRouterCredits(credits, { stream: io.stdout, theme: config.theme }),
    );
    return 0;
  } catch (error) {
    writeLine(io.stderr, formatOpenRouterLiveError(error, { apiKey }));
    return 1;
  }
}

async function runGenerationCommand(args: string[], apiKey: string, io: CliIo): Promise<number> {
  const generationId = args.join(" ").trim();
  if (!generationId) {
    writeLine(io.stderr, "Missing generation id. Usage: orx generation <id>");
    return 1;
  }

  try {
    const generation = await getOpenRouterGeneration({
      apiKey,
      generationId,
      fetch: io.fetch,
    });
    writeLine(io.stdout, formatOpenRouterGeneration(generation));
    return 0;
  } catch (error) {
    writeLine(io.stderr, formatOpenRouterLiveError(error, { apiKey }));
    return 1;
  }
}

async function runTestsCommand(args: string[], io: CliIo): Promise<number> {
  const firstArg = args[0]?.toLowerCase();
  const subcommand = firstArg === "--json" ? "list" : firstArg ?? "list";

  if (isNamespaceHelp(args)) {
    writeLine(io.stdout, CLI_NAMESPACE_USAGES.tests);
    return 0;
  }

  if (subcommand === "list" || subcommand === "status") {
    const jsonFlag = parseTestReadinessJsonFlag(
      firstArg === "list" || firstArg === "status" ? args.slice(1) : args,
      CLI_NAMESPACE_USAGES.tests,
    );
    if (!jsonFlag.ok) {
      writeLine(io.stderr, jsonFlag.message);
      return 1;
    }
    const discovery = discoverTestTargets(io.cwd);
    writeLine(io.stdout, jsonFlag.json ? renderTestTargetsJson(discovery) : renderTestTargets(discovery));
    return 0;
  }

  if (subcommand === "run") {
    const parsed = parseTestRunArgs(args.slice(1), CLI_NAMESPACE_USAGES.tests);
    if (!parsed.ok) {
      writeLine(io.stderr, parsed.message);
      return 1;
    }
    const result = await runTestTarget({
      cwd: io.cwd,
      targetId: parsed.targetId,
      extraArgs: parsed.extraArgs,
    });
    writeLine(result.ok ? io.stdout : io.stderr, parsed.json ? renderTestRunResultJson(result) : renderTestRunResult(result));
    return result.ok ? 0 : 1;
  }

  writeLine(io.stderr, CLI_NAMESPACE_USAGES.tests);
  return 1;
}

function runCodeCommand(args: string[], io: CliIo): number {
  const subcommand = args[0]?.toLowerCase() ?? "map";
  if (isNamespaceHelp(args)) {
    writeLine(io.stdout, CLI_NAMESPACE_USAGES.code);
    return 0;
  }
  if (subcommand === "map" || subcommand === "--json") {
    return runCodeMapCommand(subcommand === "--json" ? args : args.slice(1), io);
  }
  if (subcommand === "symbols" || subcommand === "symbol") {
    return runCodeSymbolsCommand(args.slice(1), io);
  }
  if (subcommand === "refs" || subcommand === "references") {
    return runCodeReferencesCommand(args.slice(1), io);
  }
  if (subcommand === "imports" || subcommand === "import-graph" || subcommand === "graph") {
    return runCodeImportGraphCommand(args.slice(1), io);
  }
  if (subcommand === "calls" || subcommand === "call-graph" || subcommand === "callgraph") {
    return runCodeCallGraphCommand(args.slice(1), io);
  }
  if (subcommand === "ast-grep" || subcommand === "astgrep" || subcommand === "sg") {
    return runCodeAstGrepCommand(args.slice(1), io);
  }
  if (subcommand === "tree-sitter" || subcommand === "treesitter" || subcommand === "ts-ast") {
    return runCodeTreeSitterCommand(args.slice(1), io);
  }
  if (subcommand === "outline" || subcommand === "ast-outline") {
    return runCodeTreeSitterCommand(args.slice(1), io, {
      defaultMode: "outline",
      usage: CODE_TREE_SITTER_OUTLINE_USAGE,
    });
  }

  writeLine(io.stderr, CLI_NAMESPACE_USAGES.code);
  return 1;
}

function runCodeMapCommand(args: string[], io: CliIo): number {
  const parsed = parseCodeJsonArgs(args);
  const map = createCodeMap({ cwd: io.cwd, targetPath: parsed.value });
  writeLine(io.stdout, parsed.json ? renderCodeMapJson(map) : renderCodeMap(map));
  return 0;
}

function runCodeSymbolsCommand(args: string[], io: CliIo): number {
  const parsed = parseCodeJsonArgs(args);
  const index = createCodeSymbolIndex({ cwd: io.cwd, query: parsed.value });
  writeLine(io.stdout, parsed.json ? renderCodeSymbolsJson(index) : renderCodeSymbols(index));
  return 0;
}

function runCodeReferencesCommand(args: string[], io: CliIo): number {
  const parsed = parseCodeJsonArgs(args);
  const query = parsed.value ?? "";
  if (!query) {
    writeLine(io.stderr, "Usage: orx code refs <query> [--json]");
    return 1;
  }
  const index = createCodeReferenceIndex({ cwd: io.cwd, query });
  writeLine(io.stdout, parsed.json ? renderCodeReferencesJson(index) : renderCodeReferences(index));
  return 0;
}

function runCodeImportGraphCommand(args: string[], io: CliIo): number {
  const parsed = parseCodeJsonArgs(args);
  const graph = createCodeImportGraph({ cwd: io.cwd, query: parsed.value });
  writeLine(io.stdout, parsed.json ? renderCodeImportGraphJson(graph) : renderCodeImportGraph(graph));
  return 0;
}

function runCodeCallGraphCommand(args: string[], io: CliIo): number {
  const parsed = parseCodeJsonArgs(args);
  const graph = createCodeCallGraph({ cwd: io.cwd, query: parsed.value });
  writeLine(io.stdout, parsed.json ? renderCodeCallGraphJson(graph) : renderCodeCallGraph(graph));
  return 0;
}

function runCodeAstGrepCommand(args: string[], io: CliIo): number {
  if (isNamespaceHelp(args)) {
    writeLine(io.stdout, CODE_AST_GREP_USAGE);
    return 0;
  }
  const parsed = parseCodeAstGrepArgs(args, CODE_AST_GREP_USAGE);
  if (!parsed.ok) {
    writeLine(io.stderr, parsed.message);
    return 1;
  }
  const result = runCodeAstGrep({
    ...parsed.args,
    cwd: io.cwd,
    runner: io.astGrepRunner,
  });
  if (parsed.args.json && result.ok) {
    writeLine(io.stdout, result.stdout.trimEnd());
    return 0;
  }
  writeLine(
    result.ok ? io.stdout : io.stderr,
    renderCodeAstGrepResult(result, CODE_AST_GREP_USAGE),
  );
  return result.ok ? 0 : 1;
}

function runCodeTreeSitterCommand(
  args: string[],
  io: CliIo,
  options: { defaultMode?: "parse" | "outline" | "imports" | "refs" | "calls" | "repo-files" | "repo-outline" | "repo-symbols" | "repo-refs" | "repo-calls" | "repo-imports" | "repo-deps"; usage?: string } = {},
): number {
  const usage = options.usage ?? CODE_TREE_SITTER_USAGE;
  if (isNamespaceHelp(args)) {
    writeLine(io.stdout, usage);
    return 0;
  }
  const parsed = parseCodeTreeSitterArgs(args, usage, { defaultMode: options.defaultMode });
  if (!parsed.ok) {
    writeLine(io.stderr, parsed.message);
    return 1;
  }
  const result = runCodeTreeSitter({
    ...parsed.args,
    cwd: io.cwd,
    runner: io.treeSitterRunner,
  });
  writeLine(
    result.ok ? io.stdout : io.stderr,
    parsed.args.json ? renderCodeTreeSitterResultJson(result) : renderCodeTreeSitterResult(result, usage),
  );
  return result.ok ? 0 : 1;
}

async function runScannersCommand(args: string[], io: CliIo, env: NodeJS.ProcessEnv): Promise<number> {
  const firstArg = args[0]?.toLowerCase();
  const subcommand = firstArg === "--json" ? "list" : firstArg ?? "list";

  if (isNamespaceHelp(args)) {
    writeLine(io.stdout, SCANNERS_USAGE);
    return 0;
  }

  if (subcommand === "list" || subcommand === "status") {
    const jsonFlag = parseScannerReadinessJsonFlag(
      firstArg === "list" || firstArg === "status" ? args.slice(1) : args,
      SCANNERS_USAGE,
    );
    if (!jsonFlag.ok) {
      writeLine(io.stderr, jsonFlag.message);
      return 1;
    }
    writeLine(io.stdout, jsonFlag.json ? renderScannerProfilesJson() : renderScannerProfiles());
    return 0;
  }

  if (subcommand === "inspect" || subcommand === "show") {
    const profileId = args[1];
    const jsonFlag = parseScannerReadinessJsonFlag(args.slice(2), SCANNERS_USAGE);
    if (!profileId || !jsonFlag.ok) {
      writeLine(io.stderr, renderScannerInspectUsage(SCANNERS_USAGE));
      return 1;
    }
    const profile = findScannerProfile(profileId);
    if (!profile) {
      writeLine(io.stderr, renderMissingScannerProfile(profileId));
      return 1;
    }
    writeLine(
      io.stdout,
      jsonFlag.json ? renderScannerProfileInspectJson(profile) : renderScannerProfileInspect(profile),
    );
    return 0;
  }

  if (subcommand === "run") {
    return runScannerRunCommand(args.slice(1), io, env, SCANNERS_USAGE);
  }

  writeLine(io.stderr, SCANNERS_USAGE);
  return 1;
}

async function runScanAliasCommand(args: string[], io: CliIo, env: NodeJS.ProcessEnv): Promise<number> {
  if (isNamespaceHelp(args)) {
    writeLine(io.stdout, SCAN_USAGE);
    return 0;
  }
  return runScannerRunCommand(args, io, env, SCAN_USAGE);
}

async function runDiagnosticsCommand(
  args: string[],
  io: CliIo,
  env: NodeJS.ProcessEnv,
  usage: string,
): Promise<number> {
  const firstArg = args[0]?.toLowerCase();
  const subcommand = firstArg === "--json" ? "list" : firstArg ?? "list";

  if (isNamespaceHelp(args)) {
    writeLine(io.stdout, usage);
    return 0;
  }

  if (subcommand === "list" || subcommand === "status") {
    const jsonFlag = parseDiagnosticReadinessJsonFlag(
      firstArg === "list" || firstArg === "status" ? args.slice(1) : args,
      usage,
    );
    if (!jsonFlag.ok) {
      writeLine(io.stderr, jsonFlag.message);
      return 1;
    }
    writeLine(io.stdout, jsonFlag.json ? renderDiagnosticProfilesJson() : renderDiagnosticProfiles());
    return 0;
  }

  if (subcommand === "inspect" || subcommand === "show") {
    const profileId = args[1];
    const jsonFlag = parseDiagnosticReadinessJsonFlag(args.slice(2), usage);
    if (!profileId || !jsonFlag.ok) {
      writeLine(io.stderr, renderDiagnosticInspectUsage(usage));
      return 1;
    }
    const profile = findDiagnosticProfile(profileId);
    if (!profile) {
      writeLine(io.stderr, renderMissingDiagnosticProfile(profileId));
      return 1;
    }
    writeLine(
      io.stdout,
      jsonFlag.json ? renderDiagnosticProfileInspectJson(profile) : renderDiagnosticProfileInspect(profile),
    );
    return 0;
  }

  if (subcommand === "run") {
    return runDiagnosticsRunCommand(args.slice(1), io, env, usage);
  }

  writeLine(io.stderr, usage);
  return 1;
}

async function runDiagnosticsRunCommand(
  args: string[],
  io: CliIo,
  env: NodeJS.ProcessEnv,
  usage: string,
): Promise<number> {
  const parsed = parseDiagnosticRunArgs(args, usage);
  if (!parsed.ok) {
    writeLine(io.stderr, parsed.message);
    return 1;
  }

  const result = await runLocalDiagnostics({
    ...parsed.args,
    cwd: io.cwd,
    env,
    runner: io.diagnosticsRunner,
  });
  if (parsed.args.json) {
    writeLine(io.stdout, renderLocalDiagnosticsJson(result));
    return result.ok ? 0 : 1;
  }
  writeLine(
    result.ok ? io.stdout : io.stderr,
    renderLocalDiagnosticsResult(result, usage),
  );
  return result.ok ? 0 : 1;
}

async function runScannerRunCommand(
  args: string[],
  io: CliIo,
  env: NodeJS.ProcessEnv,
  usage: string,
): Promise<number> {
  const parsed = parseScannerRunArgs(args, usage);
  if (!parsed.ok) {
    writeLine(io.stderr, parsed.message);
    return 1;
  }

  const result = await runSecurityScanner({
    ...parsed.args,
    cwd: io.cwd,
    env,
    runner: io.scannerRunner,
  });
  if (parsed.args.json && result.ok) {
    writeLine(io.stdout, result.stdout.trimEnd());
    return 0;
  }
  writeLine(result.ok ? io.stdout : io.stderr, renderScannerRunResult(result, usage));
  return result.ok ? 0 : 1;
}

function runOrchestratorCommand(args: string[], io: CliIo, delegationPolicyPath: string): number {
  const subcommand = args[0]?.toLowerCase() ?? "status";
  const emptyState = createEmptyDelegationState();
  const policy = loadDelegationExecutionPolicy({ configPath: delegationPolicyPath });

  if (isNamespaceHelp(args)) {
    writeLine(io.stdout, CLI_NAMESPACE_USAGES.orchestrator);
    return 0;
  }

  if (subcommand === "status" || subcommand === "plan" || subcommand === "readiness") {
    writeLine(
      io.stdout,
      [
        renderOrchestratorStatus(emptyState, { surface: "cli", policy }),
        "",
        renderDelegationReadinessPlan(emptyState, { surface: "cli", policy }),
      ].join("\n"),
    );
    return 0;
  }

  if (subcommand === "openrouter") {
    const model = args[1];
    if (!model || args.length !== 2) {
      writeLine(io.stderr, "Usage: orx orchestrator openrouter <model>");
      return 1;
    }

    let safeModel: string;
    try {
      safeModel = validateOpenRouterModel(model);
    } catch (error) {
      writeLine(io.stderr, formatDelegationCliError(error));
      return 1;
    }

    writeLine(
      io.stderr,
      renderSessionlessDelegationRefusal(`orchestrator openrouter ${safeModel}`),
    );
    return 1;
  }

  if (subcommand === "clear") {
    if (args.length !== 1) {
      writeLine(io.stderr, "Usage: orx orchestrator clear");
      return 1;
    }

    writeLine(io.stderr, renderSessionlessDelegationRefusal("orchestrator clear"));
    return 1;
  }

  writeLine(io.stderr, CLI_NAMESPACE_USAGES.orchestrator);
  return 1;
}

function runDelegateCommand(
  args: string[],
  io: CliIo,
  delegationTeamConfigPath: string,
  delegationPolicyPath: string,
): number {
  const subcommand = args[0]?.toLowerCase() ?? "status";
  const emptyState = createEmptyDelegationState();
  const policy = loadDelegationExecutionPolicy({ configPath: delegationPolicyPath });

  if (isNamespaceHelp(args)) {
    writeLine(io.stdout, CLI_NAMESPACE_USAGES.delegate);
    return 0;
  }

  if (subcommand === "status" || subcommand === "list") {
    writeLine(
      io.stdout,
      [
        renderDelegates(emptyState, { surface: "cli", policy }),
        "",
        renderDelegationReadinessPlan(emptyState, { surface: "cli", policy }),
      ].join("\n"),
    );
    return 0;
  }

  if (subcommand === "plan" || subcommand === "readiness") {
    if (args.length > 2) {
      writeLine(io.stderr, "Usage: orx delegate plan [saved-team-id]");
      return 1;
    }
    if (args[1]) {
      return runDelegationTeamReadinessCommand(args[1], io, delegationTeamConfigPath, policy);
    }
    writeLine(
      io.stdout,
      [
        renderDelegates(emptyState, { surface: "cli", policy }),
        "",
        renderDelegationReadinessPlan(emptyState, { surface: "cli", policy }),
      ].join("\n"),
    );
    return 0;
  }

  if (subcommand === "add") {
    const name = args[1];
    const provider = args[2]?.toLowerCase();
    const model = args[3];
    if (!name || provider !== "openrouter" || !model || args.length !== 4) {
      writeLine(io.stderr, "Usage: orx delegate add <name> openrouter <model>");
      return 1;
    }

    let safeName: string;
    let safeModel: string;
    try {
      safeName = validateDelegateName(name);
      safeModel = validateOpenRouterModel(model);
    } catch (error) {
      writeLine(io.stderr, formatDelegationCliError(error));
      return 1;
    }

    writeLine(
      io.stderr,
      renderSessionlessDelegationRefusal(`delegate add ${safeName} openrouter ${safeModel}`),
    );
    return 1;
  }

  if (subcommand === "team" || subcommand === "teams" || subcommand === "saved") {
    return runDelegationTeamCommand(args.slice(1), io, delegationTeamConfigPath);
  }

  if (subcommand === "policy" || subcommand === "policies" || subcommand === "execution-policy") {
    return runDelegationPolicyCommand(args.slice(1), io, delegationPolicyPath);
  }

  if (subcommand === "remove") {
    const name = args[1];
    if (!name || args.length !== 2) {
      writeLine(io.stderr, "Usage: orx delegate remove <name>");
      return 1;
    }

    let safeName: string;
    try {
      safeName = validateDelegateName(name);
    } catch (error) {
      writeLine(io.stderr, formatDelegationCliError(error));
      return 1;
    }

    writeLine(io.stderr, renderSessionlessDelegationRefusal(`delegate remove ${safeName}`));
    return 1;
  }

  if (subcommand === "clear") {
    if (args.length !== 1) {
      writeLine(io.stderr, "Usage: orx delegate clear");
      return 1;
    }

    writeLine(io.stderr, renderSessionlessDelegationRefusal("delegate clear"));
    return 1;
  }

  writeLine(io.stderr, CLI_NAMESPACE_USAGES.delegate);
  return 1;
}

function runDelegatesCommand(
  args: string[],
  io: CliIo,
  delegationTeamConfigPath: string,
  delegationPolicyPath: string,
): number {
  const subcommand = args[0]?.toLowerCase() ?? "list";
  const emptyState = createEmptyDelegationState();
  const policy = loadDelegationExecutionPolicy({ configPath: delegationPolicyPath });

  if (isNamespaceHelp(args)) {
    writeLine(io.stdout, CLI_NAMESPACE_USAGES.delegates);
    return 0;
  }

  if (subcommand === "list" || subcommand === "status") {
    writeLine(
      io.stdout,
      [
        renderDelegates(emptyState, { surface: "cli", policy }),
        "",
        renderDelegationReadinessPlan(emptyState, { surface: "cli", policy }),
      ].join("\n"),
    );
    return 0;
  }

  if (subcommand === "plan" || subcommand === "readiness") {
    if (args.length > 2) {
      writeLine(io.stderr, "Usage: orx delegates plan [saved-team-id]");
      return 1;
    }
    if (args[1]) {
      return runDelegationTeamReadinessCommand(args[1], io, delegationTeamConfigPath, policy);
    }
    writeLine(
      io.stdout,
      [
        renderDelegates(emptyState, { surface: "cli", policy }),
        "",
        renderDelegationReadinessPlan(emptyState, { surface: "cli", policy }),
      ].join("\n"),
    );
    return 0;
  }

  if (subcommand === "teams" || subcommand === "team" || subcommand === "saved") {
    return runDelegationTeamCommand(args.slice(1), io, delegationTeamConfigPath);
  }

  if (subcommand === "policy" || subcommand === "policies" || subcommand === "execution-policy") {
    return runDelegationPolicyCommand(args.slice(1), io, delegationPolicyPath);
  }

  if (isDelegationTeamCommand(subcommand)) {
    return runDelegationTeamCommand(args, io, delegationTeamConfigPath);
  }

  writeLine(io.stderr, CLI_NAMESPACE_USAGES.delegates);
  return 1;
}

function runDelegationTeamReadinessCommand(
  teamId: string,
  io: CliIo,
  delegationTeamConfigPath: string,
  policy: ReturnType<typeof loadDelegationExecutionPolicy>,
): number {
  const team = findSavedDelegationTeam(teamId, { configPath: delegationTeamConfigPath });
  if (!team) {
    writeLine(io.stderr, `Unknown delegation team: ${formatDelegationTeamIdForMessage(teamId)}`);
    return 1;
  }

  writeLine(io.stdout, renderDelegationTeamReadinessPlan(team, { surface: "cli", policy }));
  return 0;
}

function formatDelegationCliError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function runDelegationTeamCommand(
  args: string[],
  io: CliIo,
  delegationTeamConfigPath: string,
): number {
  const subcommand = args[0]?.toLowerCase() ?? "list";
  const teamId = args[1];

  if (subcommand === "list" || subcommand === "status" || subcommand === "teams") {
    writeLine(
      io.stdout,
      renderDelegationTeamList(
        getDelegationTeamStatusSummary({ configPath: delegationTeamConfigPath }),
        delegationTeamConfigPath,
      ),
    );
    return 0;
  }

  if (subcommand === "save") {
    if (!teamId || args.length < 3) {
      writeLine(
        io.stderr,
        "Usage: orx delegates save <id> --controller <model> [--delegate <name> <model> ...]",
      );
      return 1;
    }

    const parsed = parseDelegationTeamSaveArgs(args.slice(2));
    if (typeof parsed === "string") {
      writeLine(io.stderr, parsed);
      return 1;
    }

    let result: ReturnType<typeof saveDelegationTeam>;
    try {
      result = saveDelegationTeam(teamId, parsed, { configPath: delegationTeamConfigPath });
    } catch (error) {
      writeLine(io.stderr, `Unable to save delegation team${formatErrorCode(error)}.`);
      return 1;
    }

    if (!result.ok) {
      writeLine(io.stderr, result.message);
      return 1;
    }
    writeLine(io.stdout, result.message);
    return 0;
  }

  if (subcommand === "inspect" || subcommand === "show" || subcommand === "info") {
    if (!teamId || args.length !== 2) {
      writeLine(io.stderr, `Usage: orx delegates ${subcommand} <id>`);
      return 1;
    }

    const team = findSavedDelegationTeam(teamId, { configPath: delegationTeamConfigPath });
    if (!team) {
      writeLine(io.stderr, `Unknown delegation team: ${formatDelegationTeamIdForMessage(teamId)}`);
      return 1;
    }

    writeLine(io.stdout, renderDelegationTeamInspect(team));
    return 0;
  }

  if (subcommand === "use" || subcommand === "load") {
    if (!teamId || args.length !== 2) {
      writeLine(io.stderr, `Usage: orx delegates ${subcommand} <id>`);
      return 1;
    }

    const team = findSavedDelegationTeam(teamId, { configPath: delegationTeamConfigPath });
    if (!team) {
      writeLine(io.stderr, `Unknown delegation team: ${formatDelegationTeamIdForMessage(teamId)}`);
      return 1;
    }

    writeLine(io.stdout, renderDelegationTeamUse(team, { surface: "cli" }));
    return 0;
  }

  if (subcommand === "delete" || subcommand === "remove" || subcommand === "rm") {
    if (!teamId || args.length !== 2) {
      writeLine(io.stderr, `Usage: orx delegates ${subcommand} <id>`);
      return 1;
    }

    let result: ReturnType<typeof deleteSavedDelegationTeam>;
    try {
      result = deleteSavedDelegationTeam(teamId, { configPath: delegationTeamConfigPath });
    } catch (error) {
      writeLine(io.stderr, `Unable to delete delegation team${formatErrorCode(error)}.`);
      return 1;
    }

    if (!result.ok) {
      writeLine(io.stderr, result.message);
      return 1;
    }
    writeLine(io.stdout, result.message);
    return 0;
  }

  writeLine(
    io.stderr,
    "Usage: orx delegates teams [list|save <id> --controller <model> --delegate <name> <model>|use <id>|inspect <id>|delete <id>]",
  );
  return 1;
}

function runDelegationPolicyCommand(
  args: string[],
  io: CliIo,
  delegationPolicyPath: string,
): number {
  const subcommand = args[0]?.toLowerCase() ?? "status";

  if (subcommand === "status" || subcommand === "show" || subcommand === "inspect") {
    writeLine(
      io.stdout,
      renderDelegationExecutionPolicy(
        loadDelegationExecutionPolicy({ configPath: delegationPolicyPath }),
        delegationPolicyPath,
      ),
    );
    return 0;
  }

  if (subcommand === "set" || subcommand === "update") {
    try {
      const result = updateDelegationExecutionPolicy(
        parseDelegationExecutionPolicySetArgs(args.slice(1)),
        { configPath: delegationPolicyPath },
      );
      writeLine(
        io.stdout,
        [
          result.message,
          "",
          renderDelegationExecutionPolicy(
            result.policy ?? loadDelegationExecutionPolicy({ configPath: delegationPolicyPath }),
            delegationPolicyPath,
          ),
        ].join("\n"),
      );
      return 0;
    } catch (error) {
      writeLine(io.stderr, formatDelegationCliError(error));
      return 1;
    }
  }

  writeLine(
    io.stderr,
    "Usage: orx delegates policy [status|set --execution enabled|disabled --max-cost-usd <n> --timeout-ms <ms> --max-result-bytes <bytes> --max-concurrent <n> --credentials none --result-persistence none --result-merge manual_summary|metadata_only]",
  );
  return 1;
}

function parseDelegationTeamSaveArgs(args: string[]): DelegationState | string {
  let state = createEmptyDelegationState();

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--controller") {
      const model = args[index + 1];
      if (!model || model.startsWith("--")) {
        return "Missing value for --controller.";
      }
      try {
        state = setOpenRouterController(state, model);
      } catch (error) {
        return formatDelegationCliError(error);
      }
      index += 1;
      continue;
    }

    if (arg === "--delegate") {
      const name = args[index + 1];
      const model = args[index + 2];
      if (!name || !model || name.startsWith("--") || model.startsWith("--")) {
        return "Missing values for --delegate <name> <model>.";
      }
      try {
        state = addOpenRouterDelegate(state, name, model).state;
      } catch (error) {
        return formatDelegationCliError(error);
      }
      index += 2;
      continue;
    }

    return `Unknown delegation team option: ${arg}`;
  }

  return state;
}

function isDelegationTeamCommand(subcommand: string): boolean {
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

function runConfigCommand(
  args: string[],
  loadedConfig: LoadedConfig,
  io: CliIo,
  env: NodeJS.ProcessEnv,
): number {
  const subcommand = args[0]?.toLowerCase() ?? "show";

  if (isNamespaceHelp(args)) {
    writeLine(io.stdout, CLI_NAMESPACE_USAGES.config);
    return 0;
  }

  if (subcommand === "show" || subcommand === "status" || subcommand === "list") {
    writeLine(io.stdout, renderConfigShow(loadedConfig, { cwd: io.cwd, env }));
    return 0;
  }

  if (subcommand === "path" || subcommand === "paths") {
    writeLine(io.stdout, renderConfigPaths(loadedConfig, { cwd: io.cwd, env }));
    return 0;
  }

  if (subcommand === "set") {
    const parsed = parseConfigSetArgs(args.slice(1));
    if (typeof parsed === "string") {
      writeLine(io.stderr, parsed);
      return 1;
    }
    try {
      const result = setConfigValue(parsed.key, parsed.value, {
        env,
        cwd: io.cwd,
        scope: parsed.scope,
      });
      writeLine(
        io.stdout,
        [
          "ORX config updated",
          `  key: ${result.key}`,
          `  value: ${result.value}`,
          `  scope: ${result.scope}`,
          `  path: ${result.path}`,
          "  api_key: unchanged",
          "  network_calls: none",
          "  subprocesses: none",
          "  restart_required: no; next invocation uses the saved config",
        ].join("\n"),
      );
      return 0;
    } catch (error) {
      writeLine(
        io.stderr,
        `Unable to update config: ${error instanceof Error ? error.message : String(error)}`,
      );
      return 1;
    }
  }

  writeLine(io.stderr, CLI_NAMESPACE_USAGES.config);
  return 1;
}

function isConfigPathCommand(first: string | undefined, args: string[]): boolean {
  const subcommand = args[1]?.toLowerCase();
  return first === "config" && (subcommand === "path" || subcommand === "paths");
}

function isConfigLoadFailureMessage(message: string): boolean {
  return message.startsWith("Unable to load config:");
}

function runOpenRouterAuthCommand(
  args: string[],
  io: CliIo,
  env: NodeJS.ProcessEnv,
): number {
  const usage = CLI_NAMESPACE_USAGES.auth;
  const subcommand = args[0]?.toLowerCase() ?? "status";

  if (subcommand === "--help" || subcommand === "-h" || subcommand === "help") {
    writeLine(io.stdout, usage);
    return 0;
  }

  const acceptsNoArgs = (commandName: string): boolean => {
    if (args.length <= 1) {
      return true;
    }
    writeLine(
      io.stderr,
      `Unexpected auth argument for ${commandName}: ${formatAuthArgForMessage(args[1])}\n${usage}`,
    );
    return false;
  };

  const report = createOpenRouterAuthReport({ env, cwd: io.cwd });

  if (subcommand === "status" || subcommand === "show" || subcommand === "list") {
    if (!acceptsNoArgs(subcommand)) {
      return 1;
    }
    writeLine(io.stdout, renderOpenRouterAuthStatus(report));
    return 0;
  }

  if (subcommand === "setup" || subcommand === "env") {
    if (!acceptsNoArgs(subcommand)) {
      return 1;
    }
    writeLine(io.stdout, renderOpenRouterAuthSetup(report));
    return 0;
  }

  if (subcommand === "init" || subcommand === "env-file") {
    if (!acceptsNoArgs(subcommand)) {
      return 1;
    }
    try {
      const result = initializeOpenRouterAuthEnvFile({ env, cwd: io.cwd });
      const updatedReport = createOpenRouterAuthReport({ env, cwd: io.cwd });
      writeLine(io.stdout, renderOpenRouterAuthEnvFileInitResult(result, updatedReport));
      return 0;
    } catch (error) {
      writeLine(
        io.stderr,
        `Unable to initialize OpenRouter auth env file: ${error instanceof Error ? error.message : String(error)}`,
      );
      return 1;
    }
  }

  writeLine(io.stderr, `Unknown auth command: ${formatAuthArgForMessage(args[0] ?? "")}\n${usage}`);
  return 1;
}

function runInitCommand(
  args: string[],
  io: CliIo,
  env: NodeJS.ProcessEnv,
  options: { commandName: string; commandLabel: string } = {
    commandName: "orx init",
    commandLabel: "init",
  },
): number {
  const usage = `Usage: ${options.commandName} [--user|--local]`;
  if (args.includes("--help") || args.includes("-h")) {
    writeLine(io.stdout, usage);
    return 0;
  }

  const parsed = parseConfigInitArgs(args, usage, options.commandLabel);
  if (typeof parsed === "string") {
    writeLine(io.stderr, parsed);
    return 1;
  }

  try {
    const result = initializeConfig({
      env,
      cwd: io.cwd,
      scope: parsed.scope,
    });
    const envApiKeyPresent = hasOpenRouterApiKeyInEnv(env);
    const apiKeyPresence = envApiKeyPresent
      ? "yes"
      : result.created
        ? "no"
        : "not_evaluated_existing_config";
    const configValueLines =
      result.valueSource === "starter_defaults"
        ? [
            `  model: ${result.model}`,
            `  mode: ${result.mode}`,
            `  theme: ${result.theme}`,
            `  permissions: ${result.approvalPolicy}/${result.sandboxMode}`,
          ]
        : ["  config_values: unchanged_existing_config"];
    const nextSteps = envApiKeyPresent
      ? ["orx doctor --strict", "orx"]
      : result.created
        ? [
            "set OPENROUTER_API_KEY in your shell or edit config manually",
            "orx doctor --strict",
            "orx",
          ]
        : [
            "orx doctor --strict",
            "set OPENROUTER_API_KEY if doctor reports missing credentials",
            "orx",
          ];
    writeLine(
      io.stdout,
      [
        "ORX init",
        `  state_changed: ${result.created ? "yes" : "no"}`,
        `  scope: ${result.scope}`,
        `  path: ${result.path}`,
        `  config_exists: ${result.existed ? "yes" : "no"}`,
        ...configValueLines,
        `  api_key_present: ${apiKeyPresence}`,
        `  api_key_written: ${result.apiKeyWritten ? "yes" : "no"}`,
        "  network_calls: none",
        "  subprocesses: none",
        "next:",
        ...nextSteps.map((step) => `  - ${step}`),
      ].join("\n"),
    );
    return 0;
  } catch (error) {
    writeLine(
      io.stderr,
      `Unable to initialize config: ${error instanceof Error ? error.message : String(error)}`,
    );
    return 1;
  }
}

function runHistoryCommand(args: string[], io: CliIo, historyPath: string): number {
  const subcommand = args[0]?.toLowerCase();

  if (isNamespaceHelp(args)) {
    writeLine(io.stdout, CLI_NAMESPACE_USAGES.history);
    return 0;
  }

  try {
    if (subcommand === "clear") {
      if (args.length !== 1) {
        writeLine(io.stderr, "Usage: orx history clear");
        return 1;
      }
      writeLine(io.stdout, renderChatHistoryCleared(clearChatHistory({ historyPath })));
      return 0;
    }

    const query = subcommand === "search" ? args.slice(1).join(" ") : args.join(" ");
    writeLine(
      io.stdout,
      renderChatHistory(loadChatHistory({ historyPath }), {
        query,
        historyPath,
      }),
    );
    return 0;
  } catch (error) {
    writeLine(
      io.stderr,
      `Unable to use prompt history: ${error instanceof Error ? error.message : String(error)}`,
    );
    return 1;
  }
}

function hasOpenRouterApiKeyInEnv(env: NodeJS.ProcessEnv): boolean {
  return typeof env.OPENROUTER_API_KEY === "string" && env.OPENROUTER_API_KEY.trim().length > 0;
}

function runProfileCommand(
  args: string[],
  config: OrxConfig,
  io: CliIo,
  profileConfigPath: string,
): number {
  const subcommand = args[0]?.toLowerCase() ?? "list";
  const profileId = args[1];

  if (isNamespaceHelp(args)) {
    writeLine(io.stdout, CLI_NAMESPACE_USAGES.profile);
    return 0;
  }

  if (subcommand === "list" || subcommand === "status") {
    writeLine(
      io.stdout,
      renderProfileList(
        getProfileStatusSummary({ configPath: profileConfigPath }),
        config.activeProfile,
      ),
    );
    return 0;
  }

  if (subcommand === "save") {
    const parsed = parseProfileSaveArgs(args.slice(1));
    if (typeof parsed === "string") {
      writeLine(io.stderr, parsed);
      return 1;
    }

    let result: ReturnType<typeof saveCurrentProfile>;
    try {
      result = saveCurrentProfile(parsed.profileId, config, {
        configPath: profileConfigPath,
        overrides: parsed.overrides,
      });
    } catch (error) {
      writeLine(io.stderr, `Unable to save profile${formatErrorCode(error)}.`);
      return 1;
    }

    if (!result.ok) {
      writeLine(io.stderr, result.message);
      return 1;
    }
    writeLine(io.stdout, result.message);
    return 0;
  }

  if (subcommand === "inspect" || subcommand === "use") {
    if (!profileId || args.length !== 2) {
      writeLine(io.stderr, `Usage: orx profile ${subcommand} <id>`);
      return 1;
    }

    const profile = findSavedProfile(profileId, { configPath: profileConfigPath });
    if (!profile) {
      writeLine(io.stderr, `Unknown profile: ${formatProfileIdForMessage(profileId)}`);
      return 1;
    }

    if (subcommand === "use") {
      const applied = applySavedProfile(config, profile);
      writeLine(
        io.stdout,
        [
          `Profile ${profile.id} applied for this invocation.`,
          `mode: ${applied.mode}`,
          `model: ${applied.model}`,
          `fusion_preset: ${applied.fusionPreset ?? "none"}`,
          `theme: ${applied.theme}`,
          "Use `orx --profile <id>` before another command to run with it.",
        ].join("\n"),
      );
      return 0;
    }

    writeLine(io.stdout, renderProfileInspect(profile));
    return 0;
  }

  if (subcommand === "delete") {
    if (!profileId || args.length !== 2) {
      writeLine(io.stderr, "Usage: orx profile delete <id>");
      return 1;
    }

    let result: ReturnType<typeof deleteSavedProfile>;
    try {
      result = deleteSavedProfile(profileId, { configPath: profileConfigPath });
    } catch (error) {
      writeLine(io.stderr, `Unable to delete profile${formatErrorCode(error)}.`);
      return 1;
    }

    if (!result.ok) {
      writeLine(io.stderr, result.message);
      return 1;
    }
    writeLine(io.stdout, result.message);
    return 0;
  }

  writeLine(io.stderr, CLI_NAMESPACE_USAGES.profile);
  return 1;
}

async function runPluginsCommand(
  args: string[],
  io: CliIo,
  pluginRegistryPath: string,
  pluginCacheDirectory: string,
  pluginCatalogPath: string,
  pluginBinsConfigPath: string,
  pluginHooksConfigPath: string,
): Promise<number> {
  const subcommand = args[0]?.toLowerCase() ?? "list";
  const pluginId = args[1];

  if (isNamespaceHelp(args)) {
    writeLine(io.stdout, CLI_NAMESPACE_USAGES.plugins);
    return 0;
  }

  if (subcommand === "list" || subcommand === "status") {
    writeLine(
      io.stdout,
      renderPluginList(getPluginStatusSummary({ registryPath: pluginRegistryPath }), {
        enabledBinCount: getPluginBinTrustSummary({
          configPath: pluginBinsConfigPath,
          registryPath: pluginRegistryPath,
        }).trustedCount,
        enabledHookCount: getPluginHookTrustSummary({
          configPath: pluginHooksConfigPath,
          registryPath: pluginRegistryPath,
        }).trustedCount,
      }),
    );
    return 0;
  }

  if (subcommand === "review" || subcommand === "doctor" || subcommand === "audit") {
    if (args.length !== 1) {
      writeLine(io.stderr, CLI_PLUGIN_SUBCOMMAND_USAGES.review);
      return 1;
    }
    writeLine(
      io.stdout,
      renderPluginReview(
        createPluginReview({
          registryPath: pluginRegistryPath,
          catalogPath: pluginCatalogPath,
          binsConfigPath: pluginBinsConfigPath,
          hooksConfigPath: pluginHooksConfigPath,
        }),
      ),
    );
    return 0;
  }

  if (subcommand === "search") {
    writeLine(io.stdout, renderPluginCatalog(loadPluginCatalog({ catalogPath: pluginCatalogPath })));
    return 0;
  }

  if (subcommand === "catalog") {
    return await runPluginCatalogCommand(
      args.slice(1),
      io,
      pluginCatalogPath,
      pluginRegistryPath,
      pluginCacheDirectory,
    );
  }

  if (subcommand === "commands" || subcommand === "aliases") {
    writeLine(
      io.stdout,
      renderPluginCommandAliases(
        discoverEnabledPluginCommandAliases({
          binsConfigPath: pluginBinsConfigPath,
          registryPath: pluginRegistryPath,
        }),
      ),
    );
    return 0;
  }

  if (subcommand === "scaffold") {
    try {
      const options = parsePluginScaffoldArgs(args.slice(1), io.cwd);
      writeLine(io.stdout, renderPluginScaffoldResult(scaffoldPlugin(options)));
      return 0;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeLine(io.stderr, message);
      return 1;
    }
  }

  if (subcommand === "validate" || subcommand === "check") {
    const manifestPathText = args.slice(1).join(" ").trim();
    if (!manifestPathText) {
      writeLine(io.stderr, `Usage: orx plugins ${subcommand} <manifest-path-or-directory>`);
      return 1;
    }

    try {
      const result = validatePluginManifestInput(manifestPathText, { cwd: io.cwd });
      writeLine(io.stdout, renderPluginValidation(result));
      return 0;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeLine(io.stderr, message);
      return 1;
    }
  }

  if (subcommand === "inspect") {
    if (!pluginId || args.length !== 2) {
      writeLine(io.stderr, "Usage: orx plugins inspect <id>");
      return 1;
    }

    const resolution = resolveInstalledPluginReference(pluginId, { registryPath: pluginRegistryPath });
    if (!resolution.ok) {
      writeLine(io.stderr, resolution.message);
      return 1;
    }

    writeLine(io.stdout, renderPluginInspect(resolution.plugin));
    return 0;
  }

  if (subcommand === "register" || subcommand === "install") {
    const manifestPathText = args.slice(1).join(" ").trim();
    if (!manifestPathText) {
      writeLine(
        io.stderr,
        `Usage: orx plugins ${subcommand} <manifest-path-or-directory-or-catalog-id>`,
      );
      return 1;
    }

    try {
      const result = await installPlugin(manifestPathText, {
        cwd: io.cwd,
        catalogPath: pluginCatalogPath,
        registryPath: pluginRegistryPath,
        cacheDirectory: pluginCacheDirectory,
      });
      const sourceMessage = result.sourceMessage ? `${result.sourceMessage}\n` : "";
      writeLine(io.stdout, `${sourceMessage}${result.message}`);
      return 0;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeLine(io.stderr, message);
      return 1;
    }
  }

  if (subcommand === "enable" || subcommand === "disable") {
    if (!pluginId || args.length !== 2) {
      writeLine(io.stderr, `Usage: orx plugins ${subcommand} <id>`);
      return 1;
    }

    try {
      const result = setPluginEnabledState(pluginId, subcommand === "enable", {
        registryPath: pluginRegistryPath,
      });
      if (!result.ok) {
        writeLine(io.stderr, result.message);
        return 1;
      }

      writeLine(io.stdout, result.message);
      return 0;
    } catch (error) {
      writeLine(io.stderr, `Unable to persist plugin registry state${formatErrorCode(error)}.`);
      return 1;
    }
  }

  writeLine(io.stderr, CLI_NAMESPACE_USAGES.plugins);
  return 1;
}

async function runPluginCatalogCommand(
  args: string[],
  io: CliIo,
  pluginCatalogPath: string,
  pluginRegistryPath?: string,
  pluginCacheDirectory?: string,
): Promise<number> {
  const subcommand = args[0]?.toLowerCase() ?? "list";
  if (subcommand === "list" || subcommand === "status" || subcommand === "search") {
    writeLine(io.stdout, renderPluginCatalog(loadPluginCatalog({ catalogPath: pluginCatalogPath })));
    return 0;
  }

  if (
    subcommand === "updates" ||
    subcommand === "update-check" ||
    subcommand === "check-updates" ||
    subcommand === "outdated"
  ) {
    const ids = args.slice(1);
    const missingIds = ids.filter((id) => !findPluginCatalogEntry(id, { catalogPath: pluginCatalogPath }));
    if (missingIds.length > 0) {
      writeLine(
        io.stderr,
        `Unknown catalog entry: ${formatPluginCatalogIdForMessage(missingIds[0] ?? "")}`,
      );
      return 1;
    }

    writeLine(
      io.stdout,
      renderPluginCatalogUpdateReport(
        checkPluginCatalogUpdates({
          catalogPath: pluginCatalogPath,
          registryPath: pluginRegistryPath,
          ids,
        }),
      ),
    );
    return 0;
  }

  if (subcommand === "update" || subcommand === "upgrade" || subcommand === "apply-update") {
    const id = args[1];
    if (!id || args.length !== 2) {
      writeLine(io.stderr, "Usage: orx plugins catalog update <id>");
      return 1;
    }

    if (!findPluginCatalogEntry(id, { catalogPath: pluginCatalogPath })) {
      writeLine(io.stderr, `Unknown catalog entry: ${formatPluginCatalogIdForMessage(id)}`);
      return 1;
    }

    try {
      const result = await updatePluginFromCatalog(id, {
        cwd: io.cwd,
        catalogPath: pluginCatalogPath,
        registryPath: pluginRegistryPath,
        cacheDirectory: pluginCacheDirectory,
      });
      writeLine(
        result.ok ? io.stdout : io.stderr,
        renderPluginCatalogUpdateApplyResult(result),
      );
      return result.ok ? 0 : 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeLine(io.stderr, message);
      return 1;
    }
  }

  if (subcommand === "inspect" || subcommand === "show" || subcommand === "info") {
    const id = args[1];
    if (!id || args.length !== 2) {
      writeLine(io.stderr, "Usage: orx plugins catalog inspect <id>");
      return 1;
    }

    const entry = findPluginCatalogEntry(id, { catalogPath: pluginCatalogPath });
    if (!entry) {
      writeLine(io.stderr, `Unknown catalog entry: ${formatPluginCatalogIdForMessage(id)}`);
      return 1;
    }

    writeLine(io.stdout, renderPluginCatalogInspect(entry, { catalogPath: pluginCatalogPath }));
    return 0;
  }

  if (subcommand === "add" || subcommand === "add-local" || subcommand === "local") {
    try {
      const parsed = parsePluginCatalogAddLocalArgs(args.slice(1));
      const result = upsertLocalPluginCatalogEntry(parsed, {
        cwd: io.cwd,
        catalogPath: pluginCatalogPath,
      });
      writeLine(io.stdout, result.message);
      return 0;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeLine(io.stderr, message);
      return 1;
    }
  }

  if (subcommand === "add-git" || subcommand === "git") {
    try {
      const parsed = parsePluginCatalogAddGitArgs(args.slice(1));
      const result = upsertGitPluginCatalogEntry(parsed, { catalogPath: pluginCatalogPath });
      writeLine(io.stdout, result.message);
      return 0;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeLine(io.stderr, message);
      return 1;
    }
  }

  if (subcommand === "remove" || subcommand === "rm" || subcommand === "delete") {
    const id = args[1];
    if (!id || args.length !== 2) {
      writeLine(io.stderr, "Usage: orx plugins catalog remove <id>");
      return 1;
    }

    const result = removePluginCatalogEntry(id, { catalogPath: pluginCatalogPath });
    if (!result.ok) {
      writeLine(io.stderr, result.message);
      return 1;
    }

    writeLine(io.stdout, result.message);
    return 0;
  }

  writeLine(
    io.stderr,
    "Usage: orx plugins catalog [list|inspect <id>|updates [id]|update <id>|add-local <manifest-path-or-directory>|add-git <id> <repository> <resolved-commit>|remove <id>]",
  );
  return 1;
}

async function runMcpCommand(
  args: string[],
  io: CliIo,
  env: NodeJS.ProcessEnv,
  mcpConfigPath: string,
  mcpProfileCatalogPath: string,
  pluginRegistryPath: string,
  mcpAuditLogPath?: string,
): Promise<number> {
  const subcommand = args[0]?.toLowerCase() ?? "list";
  const profileId = args[1];
  const toolName = args[2];
  const registryOptions = {
    configPath: mcpConfigPath,
    profileCatalogPath: mcpProfileCatalogPath,
    pluginRegistryPath,
  };

  if (isNamespaceHelp(args)) {
    writeLine(io.stdout, CLI_NAMESPACE_USAGES.mcp);
    return 0;
  }

  if (subcommand === "list" || subcommand === "status") {
    const summary = getMcpStatusSummary(registryOptions);
    tryWriteCliMcpAuditEvent(io, mcpAuditLogPath, {
      type: "mcp.profile.status",
      ok: true,
      details: {
        activeProfileIds: summary.activeProfileIds,
        profileCount: summary.profiles.length,
        policyAllowedToolCount: summary.policyAllowedToolCount,
        policyDeniedToolCount: summary.policyDeniedToolCount,
        toolGrantCount: summary.toolGrantCount,
        staleToolGrantCount: summary.staleToolGrantCount,
        modelToolGrantCount: summary.modelToolGrantCount,
        staleModelToolGrantCount: summary.staleModelToolGrantCount,
        pendingSchemaChangeCount: summary.pendingSchemaChangeCount,
      },
    });
    writeLine(io.stdout, renderMcpStatus(summary));
    return 0;
  }

  if (subcommand === "plan" || subcommand === "setup-plan") {
    if (args.length > 2) {
      writeLine(io.stderr, "Usage: orx mcp plan [preset-or-profile]");
      return 1;
    }

    const plan = createMcpSetupPlan(args[1], {
      ...registryOptions,
      env,
      cwd: io.cwd,
    });
    writeLine(plan.kind === "unknown" ? io.stderr : io.stdout, renderMcpSetupPlan(plan));
    return plan.kind === "unknown" ? 1 : 0;
  }

  if (subcommand === "catalog" || subcommand === "user-catalog") {
    if (args.length !== 1) {
      writeLine(io.stderr, "Usage: orx mcp catalog");
      return 1;
    }

    writeLine(
      io.stdout,
      renderUserMcpProfileCatalog(
        loadUserMcpProfileCatalog({ profileCatalogPath: mcpProfileCatalogPath }),
      ),
    );
    return 0;
  }

  if (subcommand === "presets" || subcommand === "preset") {
    const presetArgs = parseMcpPresetInspectArgs(args);
    if (presetArgs.kind === "error") {
      writeLine(io.stderr, presetArgs.message);
      return 1;
    }
    if (presetArgs.kind === "inspect") {
      const preset = findMcpProviderPreset(presetArgs.presetId);
      if (!preset) {
        writeLine(
          io.stderr,
          `Unknown MCP provider preset: ${formatMcpProviderPresetIdForMessage(presetArgs.presetId)}`,
        );
        return 1;
      }
      writeLine(io.stdout, renderMcpProviderPresetInspect(preset));
      return 0;
    }

    writeLine(io.stdout, renderMcpProviderPresets());
    return 0;
  }

  if (subcommand === "add-preset") {
    const parsed = parseMcpAddPresetArgs(args);
    if (typeof parsed === "string") {
      writeLine(io.stderr, parsed);
      return 1;
    }

    try {
      const result = installMcpProviderPreset(parsed.presetId, {
        profileCatalogPath: mcpProfileCatalogPath,
        profileId: parsed.profileId,
        url: parsed.url,
        authRequired: parsed.authRequired,
      });
      writeLine(result.ok ? io.stdout : io.stderr, result.message);
      return result.ok ? 0 : 1;
    } catch (error) {
      writeLine(io.stderr, `Unable to store MCP provider preset${formatErrorCode(error)}.`);
      return 1;
    }
  }

  if (subcommand === "add-profile") {
    const parsed = parseMcpAddProfileArgs(args);
    if (typeof parsed === "string") {
      writeLine(io.stderr, parsed);
      return 1;
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
        { profileCatalogPath: mcpProfileCatalogPath },
      );
      writeLine(io.stdout, result.message);
      return 0;
    } catch (error) {
      writeLine(io.stderr, `Unable to store user MCP profile${formatErrorCode(error)}.`);
      return 1;
    }
  }

  if (subcommand === "remove-profile") {
    if (!profileId || args.length !== 2) {
      writeLine(io.stderr, "Usage: orx mcp remove-profile <profile>");
      return 1;
    }

    try {
      const result = removeUserMcpProfile(profileId, {
        profileCatalogPath: mcpProfileCatalogPath,
      });
      writeLine(result.ok ? io.stdout : io.stderr, result.message);
      return result.ok ? 0 : 1;
    } catch (error) {
      writeLine(io.stderr, `Unable to remove user MCP profile${formatErrorCode(error)}.`);
      return 1;
    }
  }

  if (subcommand === "add-tool") {
    const parsed = parseMcpAddToolArgs(args);
    if (typeof parsed === "string") {
      writeLine(io.stderr, parsed);
      return 1;
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
        { profileCatalogPath: mcpProfileCatalogPath },
      );
      writeLine(result.ok ? io.stdout : io.stderr, result.message);
      return result.ok ? 0 : 1;
    } catch (error) {
      writeLine(io.stderr, `Unable to store user MCP tool${formatErrorCode(error)}.`);
      return 1;
    }
  }

  if (subcommand === "remove-tool") {
    if (!profileId || !toolName || args.length !== 3) {
      writeLine(io.stderr, "Usage: orx mcp remove-tool <profile> <tool>");
      return 1;
    }

    try {
      const result = removeUserMcpProfileTool(profileId, toolName, {
        profileCatalogPath: mcpProfileCatalogPath,
      });
      writeLine(result.ok ? io.stdout : io.stderr, result.message);
      return result.ok ? 0 : 1;
    } catch (error) {
      writeLine(io.stderr, `Unable to remove user MCP tool${formatErrorCode(error)}.`);
      return 1;
    }
  }

  if (subcommand === "inspect") {
    if (!profileId || args.length !== 2) {
      writeLine(io.stderr, "Usage: orx mcp inspect <profile>");
      return 1;
    }

    const report = getMcpProfileToolPolicyReport(profileId, registryOptions);
    tryWriteCliMcpAuditEvent(io, mcpAuditLogPath, {
      type: "mcp.profile.inspect",
      profileId,
      ok: Boolean(report),
      details: report
        ? {
            state: report.profile.state,
            transport: report.profile.transport.kind,
            source: report.profile.source?.kind ?? "builtin",
            riskLevel: report.profile.riskLevel,
            authRequired: report.profile.authRequired,
            writeCapable: report.profile.writeCapable,
            toolCount: report.evaluations.length,
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
      writeLine(io.stderr, `Unknown MCP profile: ${profileId}`);
      return 1;
    }

    writeLine(
      io.stdout,
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
    return 0;
  }

  if (subcommand === "auth") {
    const authAction = parseMcpAuthArgs(args);
    if (typeof authAction === "string") {
      writeLine(io.stderr, authAction);
      return 1;
    }

    const report = getMcpProfileAuthReport(authAction.profileId, {
      ...registryOptions,
      env,
      cwd: io.cwd,
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
      tryWriteCliMcpAuditEvent(io, mcpAuditLogPath, {
        type: auditType,
        profileId: authAction.profileId,
        ok: false,
      });
      writeLine(io.stderr, `Unknown MCP profile: ${authAction.profileId}`);
      return 1;
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
        env,
        platform: io.mcpKeychainPlatform,
        runner: io.mcpKeychainRunner,
      };
      const result = await (
        authAction.action === "set"
          ? setMcpMacosKeychainBearerPrompt(authAction.profileId, keychainOptions)
          : authAction.action === "delete"
            ? deleteMcpMacosKeychainBearer(authAction.profileId, keychainOptions)
            : getMcpMacosKeychainStatus(authAction.profileId, keychainOptions)
      );
      tryWriteCliMcpAuditEvent(io, mcpAuditLogPath, {
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
      writeLine(result.ok ? io.stdout : io.stderr, renderMcpMacosKeychainResult(result));
      return result.ok ? 0 : 1;
    }

    if (authAction.kind === "init") {
      try {
        const result = initializeMcpAuthEnvFile(report, { env, cwd: io.cwd });
        tryWriteCliMcpAuditEvent(io, mcpAuditLogPath, {
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
        writeLine(io.stdout, renderMcpAuthEnvFileInitResult(result));
        return 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        tryWriteCliMcpAuditEvent(io, mcpAuditLogPath, {
          type: auditType,
          profileId: authAction.profileId,
          ok: false,
          details: {
            ...auditDetails,
            message,
          },
        });
        writeLine(io.stderr, message);
        return 1;
      }
    }

    tryWriteCliMcpAuditEvent(io, mcpAuditLogPath, {
      type: auditType,
      profileId: authAction.profileId,
      ok: true,
      details: auditDetails,
    });
    writeLine(
      io.stdout,
      authAction.kind === "setup"
        ? renderMcpProfileAuthSetup(report)
        : renderMcpProfileAuthReport(report),
    );
    return 0;
  }

  if (subcommand === "tools") {
    if (!profileId || args.length !== 2) {
      writeLine(io.stderr, "Usage: orx mcp tools <profile>");
      return 1;
    }

    const report = getMcpProfileToolPolicyReport(profileId, registryOptions);
    tryWriteCliMcpAuditEvent(io, mcpAuditLogPath, {
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
      writeLine(io.stderr, `Unknown MCP profile: ${profileId}`);
      return 1;
    }

    writeLine(io.stdout, renderMcpProfileTools(report));
    return 0;
  }

  if (subcommand === "enable" || subcommand === "disable") {
    if (!profileId || args.length !== 2) {
      writeLine(io.stderr, `Usage: orx mcp ${subcommand} <profile>`);
      return 1;
    }

    try {
      const result = setMcpProfilePersistentState(
        profileId,
        subcommand === "enable" ? "enabled" : "disabled",
        registryOptions,
      );
      tryWriteCliMcpAuditEvent(io, mcpAuditLogPath, {
        type:
          subcommand === "enable"
            ? "mcp.profile.enable_attempt"
            : "mcp.profile.disable_attempt",
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
        writeLine(io.stderr, result.message);
        return 1;
      }

      writeLine(io.stdout, result.message);
      return 0;
    } catch (error) {
      tryWriteCliMcpAuditEvent(io, mcpAuditLogPath, {
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
      writeLine(io.stderr, `Unable to persist MCP profile state${formatErrorCode(error)}.`);
      return 1;
    }
  }

  if (subcommand === "call") {
    if (!profileId || !toolName || args.length < 3) {
      writeLine(io.stderr, "Usage: orx mcp call <profile> <tool> [arguments-json]");
      return 1;
    }

    const parsedArgs = parseMcpCallArgumentsText(args.slice(3).join(" ").trim());
    if (!parsedArgs.ok) {
      tryWriteCliMcpAuditEvent(io, mcpAuditLogPath, {
        type: "mcp.tool.call_attempt",
        profileId,
        ok: false,
        details: {
          toolName,
          status: "invalid_arguments",
          message: parsedArgs.message,
        },
      });
      writeLine(io.stderr, parsedArgs.message);
      return 1;
    }

    const credential = await resolveMcpBearerCredential(profileId, {
      env,
      platform: io.mcpKeychainPlatform,
      runner: io.mcpKeychainRunner,
    });
    return callRemoteMcpTool(profileId, toolName, parsedArgs.value, {
      ...registryOptions,
      fetch: io.mcpCallFetch,
      authToken: credential.token,
    }).then((result) => {
      tryWriteCliMcpAuditEvent(io, mcpAuditLogPath, {
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
      writeLine(result.ok ? io.stdout : io.stderr, formatMcpToolCallResult(result));
      return result.ok ? 0 : 1;
    });
  }

  if (subcommand === "remote-tools") {
    if (!profileId || args.length !== 2) {
      writeLine(io.stderr, "Usage: orx mcp remote-tools <profile>");
      return 1;
    }

    return listRemoteMcpTools(profileId, {
      ...registryOptions,
      fetch: io.mcpRemoteToolsFetch,
    }).then((result) => {
      tryWriteCliMcpAuditEvent(io, mcpAuditLogPath, {
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
      const stream =
        result.status === "not_found" ||
        result.status === "network_error" ||
        result.status === "remote_error" ||
        result.status === "invalid_response" ||
        result.status === "too_many_pages"
          ? io.stderr
          : io.stdout;
      writeLine(stream, output);
      return result.ok ? 0 : 1;
    });
  }

  if (subcommand === "import-remote-tools" || subcommand === "import-tools") {
    const parsed = parseMcpImportRemoteToolsArgs(args);
    if (typeof parsed === "string") {
      writeLine(io.stderr, parsed);
      return 1;
    }

    return importRemoteMcpTools(parsed.profileId, {
      ...registryOptions,
      fetch: io.mcpRemoteToolsFetch,
      maxTools: parsed.limit,
    }).then((result) => {
      tryWriteCliMcpAuditEvent(io, mcpAuditLogPath, {
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

      writeLine(result.ok ? io.stdout : io.stderr, formatMcpRemoteToolImportResult(result));
      return result.ok ? 0 : 1;
    });
  }

  if (subcommand === "discover") {
    if (!profileId || args.length !== 2) {
      writeLine(io.stderr, "Usage: orx mcp discover <profile>");
      return 1;
    }

    return discoverMcpProfile(profileId, {
      ...registryOptions,
      fetch: io.mcpDiscoveryFetch,
    }).then((result) => {
      tryWriteCliMcpAuditEvent(io, mcpAuditLogPath, {
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
      const stream =
        result.status === "not_found" ||
        result.status === "network_error" ||
        result.status === "remote_error" ||
        result.status === "invalid_response"
          ? io.stderr
          : io.stdout;
      writeLine(stream, output);
      return result.ok ? 0 : 1;
    });
  }

  if (subcommand === "allow-tool") {
    if (!profileId || !toolName || args.length !== 3) {
      writeLine(io.stderr, "Usage: orx mcp allow-tool <profile> <tool>");
      return 1;
    }

    try {
      const result = allowMcpToolGrant(profileId, toolName, registryOptions);
      tryWriteCliMcpAuditEvent(io, mcpAuditLogPath, {
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
      writeLine(result.ok ? io.stdout : io.stderr, result.message);
      return result.ok ? 0 : 1;
    } catch (error) {
      tryWriteCliMcpAuditEvent(io, mcpAuditLogPath, {
        type: "mcp.tool.allow_attempt",
        profileId,
        ok: false,
        details: {
          toolName,
          message: "Unable to persist MCP tool grant.",
          error: formatErrorForMcpAudit(error),
        },
      });
      writeLine(io.stderr, `Unable to persist MCP tool grant${formatErrorCode(error)}.`);
      return 1;
    }
  }

  if (subcommand === "allow-model-tool") {
    if (!profileId || !toolName || args.length !== 3) {
      writeLine(io.stderr, "Usage: orx mcp allow-model-tool <profile> <tool>");
      return 1;
    }

    try {
      const result = allowMcpModelToolGrant(profileId, toolName, registryOptions);
      tryWriteCliMcpAuditEvent(io, mcpAuditLogPath, {
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
      writeLine(result.ok ? io.stdout : io.stderr, result.message);
      return result.ok ? 0 : 1;
    } catch (error) {
      tryWriteCliMcpAuditEvent(io, mcpAuditLogPath, {
        type: "mcp.model_tool.allow_attempt",
        profileId,
        ok: false,
        details: {
          toolName,
          message: "Unable to persist model MCP tool grant.",
          error: formatErrorForMcpAudit(error),
        },
      });
      writeLine(io.stderr, `Unable to persist model MCP tool grant${formatErrorCode(error)}.`);
      return 1;
    }
  }

  if (subcommand === "revoke-model-tool") {
    if (!profileId || !toolName || args.length !== 3) {
      writeLine(io.stderr, "Usage: orx mcp revoke-model-tool <profile> <tool>");
      return 1;
    }

    try {
      const result = revokeMcpModelToolGrant(profileId, toolName, registryOptions);
      tryWriteCliMcpAuditEvent(io, mcpAuditLogPath, {
        type: "mcp.model_tool.revoke_attempt",
        profileId,
        ok: result.ok,
        details: {
          toolName,
          previousGrantProfileHash: result.previousGrant?.profileHash,
          message: result.message,
        },
      });
      writeLine(result.ok ? io.stdout : io.stderr, result.message);
      return result.ok ? 0 : 1;
    } catch (error) {
      tryWriteCliMcpAuditEvent(io, mcpAuditLogPath, {
        type: "mcp.model_tool.revoke_attempt",
        profileId,
        ok: false,
        details: {
          toolName,
          message: "Unable to persist model MCP tool grant.",
          error: formatErrorForMcpAudit(error),
        },
      });
      writeLine(io.stderr, `Unable to persist model MCP tool grant${formatErrorCode(error)}.`);
      return 1;
    }
  }

  if (subcommand === "revoke-tool") {
    if (!profileId || !toolName || args.length !== 3) {
      writeLine(io.stderr, "Usage: orx mcp revoke-tool <profile> <tool>");
      return 1;
    }

    try {
      const result = revokeMcpToolGrant(profileId, toolName, registryOptions);
      tryWriteCliMcpAuditEvent(io, mcpAuditLogPath, {
        type: "mcp.tool.revoke_attempt",
        profileId,
        ok: result.ok,
        details: {
          toolName,
          previousGrantProfileHash: result.previousGrant?.profileHash,
          message: result.message,
        },
      });
      writeLine(result.ok ? io.stdout : io.stderr, result.message);
      return result.ok ? 0 : 1;
    } catch (error) {
      tryWriteCliMcpAuditEvent(io, mcpAuditLogPath, {
        type: "mcp.tool.revoke_attempt",
        profileId,
        ok: false,
        details: {
          toolName,
          message: "Unable to persist MCP tool grant.",
          error: formatErrorForMcpAudit(error),
        },
      });
      writeLine(io.stderr, `Unable to persist MCP tool grant${formatErrorCode(error)}.`);
      return 1;
    }
  }

  writeLine(io.stderr, CLI_NAMESPACE_USAGES.mcp);
  return 1;
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
  return "Usage: orx mcp auth <profile> | orx mcp auth setup <profile> | orx mcp auth env <profile> | orx mcp auth init <profile> | orx mcp auth env-file <profile> | orx mcp auth keychain [status|set|delete] <profile>";
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

async function runBinsCommand(
  args: string[],
  env: NodeJS.ProcessEnv,
  io: CliIo,
  pluginRegistryPath: string,
  pluginBinsConfigPath: string,
  pluginBinsAuditLogPath: string,
): Promise<number> {
  const subcommand = args[0]?.toLowerCase() ?? "list";
  const binId = args[1];

  if (isNamespaceHelp(args)) {
    writeLine(io.stdout, CLI_NAMESPACE_USAGES.bins);
    return 0;
  }

  if (subcommand === "list" || subcommand === "status") {
    writeLine(
      io.stdout,
      renderPluginBins(discoverEnabledPluginBins({ registryPath: pluginRegistryPath }), {
        configPath: pluginBinsConfigPath,
      }),
    );
    return 0;
  }

  if (subcommand === "inspect") {
    if (!binId || args.length !== 2) {
      writeLine(io.stderr, "Usage: orx bins inspect <id>");
      return 1;
    }

    const bin = findDiscoveredBin(binId, { registryPath: pluginRegistryPath });
    if (!bin) {
      writeLine(io.stderr, `Unknown enabled plugin bin: ${formatBinIdForMessage(binId)}`);
      return 1;
    }

    writeLine(io.stdout, renderPluginBinInspect(bin, { configPath: pluginBinsConfigPath }));
    return 0;
  }

  if (subcommand === "trust") {
    if (!binId || args.length !== 2) {
      writeLine(io.stderr, "Usage: orx bins trust <id>");
      return 1;
    }

    try {
      const result = trustPluginBin(binId, {
        registryPath: pluginRegistryPath,
        configPath: pluginBinsConfigPath,
      });
      if (!result.ok) {
        writeLine(io.stderr, result.message);
        return 1;
      }
      writeLine(io.stdout, result.message);
      return 0;
    } catch (error) {
      writeLine(io.stderr, `Unable to persist bin trust state${formatErrorCode(error)}.`);
      return 1;
    }
  }

  if (subcommand === "run") {
    if (!binId || args.length < 2) {
      writeLine(io.stderr, "Usage: orx bins run <id> [args...]");
      return 1;
    }

    const result = await runPluginBin(binId, args.slice(2), {
      auditLogPath: pluginBinsAuditLogPath,
      configPath: pluginBinsConfigPath,
      env,
      registryPath: pluginRegistryPath,
    });
    writeLine(result.ok ? io.stdout : io.stderr, renderPluginBinRunResult(result));
    return result.ok ? 0 : 1;
  }

  if (subcommand === "untrust" || subcommand === "revoke") {
    if (!binId || args.length !== 2) {
      writeLine(io.stderr, `Usage: orx bins ${subcommand} <id>`);
      return 1;
    }

    try {
      const result = untrustPluginBin(binId, { configPath: pluginBinsConfigPath });
      if (!result.ok) {
        writeLine(io.stderr, result.message);
        return 1;
      }
      writeLine(io.stdout, result.message);
      return 0;
    } catch (error) {
      writeLine(io.stderr, `Unable to persist bin trust state${formatErrorCode(error)}.`);
      return 1;
    }
  }

  writeLine(io.stderr, CLI_NAMESPACE_USAGES.bins);
  return 1;
}

async function runHooksCommand(
  args: string[],
  env: NodeJS.ProcessEnv,
  io: CliIo,
  pluginRegistryPath: string,
  pluginHooksConfigPath: string,
  pluginHooksAuditLogPath: string,
): Promise<number> {
  const subcommand = args[0]?.toLowerCase() ?? "list";
  const hookId = args[1];

  if (isNamespaceHelp(args)) {
    writeLine(io.stdout, CLI_NAMESPACE_USAGES.hooks);
    return 0;
  }

  if (subcommand === "list" || subcommand === "status") {
    writeLine(
      io.stdout,
      renderPluginHooks(discoverEnabledPluginHooks({ registryPath: pluginRegistryPath }), {
        configPath: pluginHooksConfigPath,
      }),
    );
    return 0;
  }

  if (subcommand === "inspect") {
    if (!hookId || args.length !== 2) {
      writeLine(io.stderr, "Usage: orx hooks inspect <id>");
      return 1;
    }

    const hook = findDiscoveredHook(hookId, { registryPath: pluginRegistryPath });
    if (!hook) {
      writeLine(io.stderr, `Unknown enabled plugin hook: ${formatHookIdForMessage(hookId)}`);
      return 1;
    }

    writeLine(io.stdout, renderPluginHookInspect(hook, { configPath: pluginHooksConfigPath }));
    return 0;
  }

  if (subcommand === "trust") {
    if (!hookId || args.length !== 2) {
      writeLine(io.stderr, "Usage: orx hooks trust <id>");
      return 1;
    }

    try {
      const result = trustPluginHook(hookId, {
        registryPath: pluginRegistryPath,
        configPath: pluginHooksConfigPath,
      });
      if (!result.ok) {
        writeLine(io.stderr, result.message);
        return 1;
      }
      writeLine(io.stdout, result.message);
      return 0;
    } catch (error) {
      writeLine(io.stderr, `Unable to persist hook trust state${formatErrorCode(error)}.`);
      return 1;
    }
  }

  if (subcommand === "run") {
    if (!hookId || args.length !== 2) {
      writeLine(io.stderr, "Usage: orx hooks run <id>");
      return 1;
    }

    const result = await runPluginHook(hookId, {
      auditLogPath: pluginHooksAuditLogPath,
      configPath: pluginHooksConfigPath,
      env,
      registryPath: pluginRegistryPath,
    });
    writeLine(result.ok ? io.stdout : io.stderr, renderPluginHookRunResult(result));
    return result.ok ? 0 : 1;
  }

  if (subcommand === "untrust" || subcommand === "revoke") {
    if (!hookId || args.length !== 2) {
      writeLine(io.stderr, `Usage: orx hooks ${subcommand} <id>`);
      return 1;
    }

    try {
      const result = untrustPluginHook(hookId, { configPath: pluginHooksConfigPath });
      if (!result.ok) {
        writeLine(io.stderr, result.message);
        return 1;
      }
      writeLine(io.stdout, result.message);
      return 0;
    } catch (error) {
      writeLine(io.stderr, `Unable to persist hook trust state${formatErrorCode(error)}.`);
      return 1;
    }
  }

  writeLine(io.stderr, CLI_NAMESPACE_USAGES.hooks);
  return 1;
}

function getVersion(): string {
  const packagePath = join(dirname(fileURLToPath(import.meta.url)), "..", "package.json");
  const packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as PackageJson;
  return packageJson.version;
}

async function runAskCommand(
  args: string[],
  apiKey: string,
  config: OrxConfig,
  io: CliIo,
  options: {
    hookEnv?: NodeJS.ProcessEnv;
    mcpAuditLogPath?: string;
    mcpConfigPath?: string;
    mcpKeychainPlatform?: NodeJS.Platform;
    mcpKeychainRunner?: McpMacosKeychainCommandRunner;
    mcpProfileCatalogPath?: string;
    pluginHooksAuditLogPath?: string;
    pluginHooksConfigPath?: string;
    pluginRegistryPath?: string;
  } = {},
): Promise<number> {
  const parsed = parseAskArgs(args);
  if (typeof parsed === "string") {
    writeLine(io.stderr, parsed);
    return 1;
  }

  const requestMessages: OpenRouterMessage[] = [{ role: "user", content: parsed.prompt }];
  const requestConfig = applyAskOverrides(config, parsed.overrides);

  async function runLifecycleHooksAndWarn(event: PluginHookEvent): Promise<void> {
    const result = await runTrustedPluginHooksForEvent(event, {
      auditLogPath: options.pluginHooksAuditLogPath,
      configPath: options.pluginHooksConfigPath,
      env: options.hookEnv,
      registryPath: options.pluginRegistryPath,
    });
    if (result.failedCount > 0) {
      writeLine(io.stderr, renderPluginHookLifecycleResult(result));
    }
  }

  try {
    await runLifecycleHooksAndWarn("session_start");
    await runLifecycleHooksAndWarn("user_prompt_submit");
    const result = await runAgentTurn(
      {
        apiKey,
        config: requestConfig,
        messages: requestMessages,
        cwd: io.cwd,
        fetch: io.fetch,
        mcp: parsed.mcpTools
          ? {
              enabled: true,
              auditLogPath: options.mcpAuditLogPath,
              authEnv: options.hookEnv,
              configPath: options.mcpConfigPath,
              fetch: io.mcpCallFetch,
              keychainPlatform: options.mcpKeychainPlatform,
              keychainRunner: options.mcpKeychainRunner,
              profileCatalogPath: options.mcpProfileCatalogPath,
              pluginRegistryPath: options.pluginRegistryPath,
            }
          : undefined,
        maxToolIterations: parsed.maxToolIterations,
        ephemeralSystemMessages: compactPluginContextMessages(options.pluginRegistryPath),
        callbacks: {
          onText(text) {
            io.stdout.write(text);
          },
          async onToolCall(toolCall) {
            io.stdout.write(
              `\n${formatToolCallStart(toolCall, { stream: io.stdout, theme: requestConfig.theme })}\n`,
            );
            await runLifecycleHooksAndWarn("pre_tool_use");
          },
          async onToolResult(result) {
            io.stdout.write(
              `${formatToolResult(result, { stream: io.stdout, theme: requestConfig.theme })}\n`,
            );
            await runLifecycleHooksAndWarn("post_tool_use");
          },
        },
      },
    );

    writeLine(io.stdout, formatOpenRouterMetadata(result.metadata));
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeLine(io.stderr, message);
    return 1;
  } finally {
    await runLifecycleHooksAndWarn("stop");
  }
}

function compactPluginContextMessages(pluginRegistryPath: string | undefined): OpenRouterMessage[] {
  const messages = [
    createEnabledPluginSkillsSystemMessage({ registryPath: pluginRegistryPath }),
    createEnabledPluginPromptsSystemMessage({ registryPath: pluginRegistryPath }),
    createEnabledPluginRulesSystemMessage({ registryPath: pluginRegistryPath }),
  ];
  return messages.filter((message): message is OpenRouterMessage => typeof message !== "undefined");
}

function applyAskOverrides(config: OrxConfig, overrides: AskRequestOverrides): OrxConfig {
  if (overrides.model) {
    return {
      ...config,
      mode: "exact",
      model: overrides.model,
      fusionPreset: undefined,
      activeProfile: undefined,
    };
  }

  if (overrides.mode === "auto") {
    return {
      ...config,
      mode: "auto",
      model: "openrouter/auto",
      fusionPreset: undefined,
      activeProfile: undefined,
    };
  }

  if (overrides.mode === "exact") {
    return {
      ...config,
      mode: "exact",
      fusionPreset: undefined,
      activeProfile: undefined,
    };
  }

  if (overrides.mode === "fusion" || overrides.fusionPreset) {
    return {
      ...config,
      mode: "fusion",
      model: "openrouter/fusion",
      fusionPreset: overrides.fusionPreset ?? config.fusionPreset,
      activeProfile: undefined,
    };
  }

  return config;
}

function parseGlobalOptions(args: string[]): GlobalCliOptions | string {
  const rest = [...args];
  let profile: string | undefined;

  while (rest[0] === "--profile") {
    const value = rest[1];
    if (!value || value.startsWith("--")) {
      return "Missing value for --profile.";
    }
    profile = value;
    rest.splice(0, 2);
  }

  return {
    profile,
    args: rest,
  };
}

function parseDoctorArgs(args: string[]): { strict: boolean; help: boolean; json: boolean } | string {
  let strict = false;
  let help = false;
  let json = false;

  for (const arg of args) {
    if (arg === "--strict") {
      strict = true;
      continue;
    }
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }
    return `Unknown doctor option: ${formatDoctorOptionForMessage(arg)}\nUsage: orx doctor [--strict] [--json]`;
  }

  return { strict, help, json };
}

function parseGuideArgs(args: string[]): true | string {
  for (const arg of args) {
    if (arg === "--help" || arg === "-h" || arg.toLowerCase() === "help") {
      return GUIDE_USAGE;
    }
    return `Unknown guide option: ${formatDoctorOptionForMessage(arg)}\n${GUIDE_USAGE}`;
  }

  return true;
}

function loadConfigWithProfile(options: {
  env: NodeJS.ProcessEnv;
  cwd: string;
  profileId?: string;
  profileConfigPath: string;
}): LoadedConfig | string {
  let loadedConfig: LoadedConfig;
  try {
    loadedConfig = loadConfig({ env: options.env, cwd: options.cwd });
  } catch {
    return [
      "Unable to load config: config file is unreadable or invalid.",
      "Run orx auth for credential status, or fix the config file before retrying.",
    ].join(" ");
  }
  if (!options.profileId) {
    return loadedConfig;
  }

  const profile = findSavedProfile(options.profileId, {
    configPath: options.profileConfigPath,
  });
  if (!profile) {
    return `Unknown profile: ${formatProfileIdForMessage(options.profileId)}`;
  }

  return {
    ...loadedConfig,
    config: applySavedProfile(loadedConfig.config, profile),
  };
}

function parseAskArgs(args: string[]): AskCommand | string {
  const promptParts: string[] = [];
  const overrides: AskRequestOverrides = {};
  let mcpTools = false;
  let maxToolIterations: number | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--model") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        return "Missing value for --model.";
      }
      overrides.model = value;
      index += 1;
      continue;
    }

    if (arg === "--mode") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        return "Missing value for --mode.";
      }
      if (!VALID_MODES.has(value as OrxMode)) {
        return `Invalid --mode value: ${value}. Expected auto, fusion, or exact.`;
      }
      overrides.mode = value as OrxMode;
      index += 1;
      continue;
    }

    if (arg === "--fusion") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        return "Missing value for --fusion.";
      }
      overrides.fusionPreset = value;
      index += 1;
      continue;
    }

    if (arg === "--mcp-tools") {
      mcpTools = true;
      continue;
    }

    if (arg === "--max-tool-iterations") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        return "Missing value for --max-tool-iterations.";
      }
      const parsed = /^\d+$/.test(value) ? Number.parseInt(value, 10) : Number.NaN;
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 64) {
        return "Invalid --max-tool-iterations value: expected an integer from 0 to 64.";
      }
      maxToolIterations = parsed;
      index += 1;
      continue;
    }

    if (arg.startsWith("--")) {
      return `Unknown ask option: ${arg}`;
    }

    promptParts.push(arg);
  }

  if (overrides.model && overrides.mode && overrides.mode !== "exact") {
    return "--model can only be combined with --mode exact.";
  }

  if (overrides.fusionPreset && overrides.mode && overrides.mode !== "fusion") {
    return "--fusion can only be combined with --mode fusion.";
  }

  const prompt = promptParts.join(" ").trim();
  if (!prompt) {
    return 'Missing prompt. Example: orx ask "Say hello"';
  }

  return {
    prompt,
    overrides,
    mcpTools,
    maxToolIterations,
  };
}

function formatProfileIdForMessage(profileId: string): string {
  return profileId.replace(/[\u0000-\u001f\u007f-\u009f]/g, "").trim().toLowerCase().slice(0, 80);
}

const SECRET_LIKE_MESSAGE_PATTERN =
  /\b(?:sk-or-v1-[A-Za-z0-9_-]+|github_pat_[A-Za-z0-9_]+|ghp_[A-Za-z0-9_]+|glpat-[A-Za-z0-9_-]+|xox[baprs]-[A-Za-z0-9-]+)\b/i;

function formatDoctorOptionForMessage(value: string): string {
  if (SECRET_LIKE_MESSAGE_PATTERN.test(value)) {
    return "[redacted]";
  }
  return value.replace(/[\u0000-\u001f\u007f-\u009f]/g, "").trim().slice(0, 80);
}

function formatAuthArgForMessage(value: string): string {
  if (SECRET_LIKE_MESSAGE_PATTERN.test(value)) {
    return "[redacted]";
  }
  const cleaned = value.replace(/[\u0000-\u001f\u007f-\u009f]/g, "").trim();
  return cleaned.length > 0 ? cleaned.slice(0, 80) : "[redacted]";
}

function formatDelegationTeamIdForMessage(teamId: string): string {
  if (SECRET_LIKE_MESSAGE_PATTERN.test(teamId)) {
    return "[redacted]";
  }
  return teamId.replace(/[\u0000-\u001f\u007f-\u009f]/g, "").trim().toLowerCase().slice(0, 80);
}

function parseMcpCallArgumentsText(rawArguments: string):
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; message: string } {
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

function tryWriteCliMcpAuditEvent(
  io: CliIo,
  auditLogPath: string | undefined,
  event: McpAuditEvent,
): void {
  try {
    writeMcpAuditEvent(event, { auditLogPath });
  } catch {
    writeLine(io.stderr, "Warning: unable to write MCP audit log.");
  }
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

function writeLine(stream: Pick<NodeJS.WriteStream, "write">, text: string) {
  stream.write(`${text}\n`);
}

function resolveEntrypointPath(path: string): string {
  const absolutePath = resolve(path);
  try {
    return realpathSync(absolutePath);
  } catch {
    return absolutePath;
  }
}

const isEntrypoint =
  process.argv[1] !== undefined &&
  resolveEntrypointPath(process.argv[1]) === resolveEntrypointPath(fileURLToPath(import.meta.url));
if (isEntrypoint) {
  process.exitCode = await runCli(process.argv);
}
