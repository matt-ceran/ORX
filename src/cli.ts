#!/usr/bin/env node
import { readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BIN_NAME } from "./constants.js";
import { formatToolCallStart, formatToolResult, runAgentTurn } from "./agent/index.js";
import { loadConfig, validateApiKey } from "./config/index.js";
import type { LoadedConfig, OrxConfig, OrxMode } from "./config/types.js";
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
  allowMcpToolGrant,
  getMcpProfileToolPolicyReport,
  getMcpStatusSummary,
  hashMcpProfile,
  renderMcpProfileInspect,
  renderMcpProfileTools,
  renderMcpStatus,
  resolveMcpConfigPath,
  revokeMcpToolGrant,
  setMcpProfilePersistentState,
  writeMcpAuditEvent,
  type McpAuditEvent,
} from "./mcp/index.js";
import {
  createEnabledPluginPromptsSystemMessage,
  createEnabledPluginRulesSystemMessage,
  createEnabledPluginSkillsSystemMessage,
  discoverEnabledPluginHooks,
  findDiscoveredHook,
  findInstalledPlugin,
  formatHookIdForMessage,
  formatPluginIdForMessage,
  getPluginHookTrustSummary,
  getPluginStatusSummary,
  loadPluginCatalog,
  registerPluginManifest,
  renderPluginHookInspect,
  renderPluginHookLifecycleResult,
  renderPluginHookRunResult,
  renderPluginHooks,
  renderPluginCatalog,
  renderPluginInspect,
  renderPluginList,
  resolvePluginHooksAuditLogPath,
  resolvePluginCacheDirectory,
  resolvePluginCatalogPath,
  resolvePluginHooksConfigPath,
  resolvePluginInstallTarget,
  resolvePluginRegistryPath,
  runPluginHook,
  runTrustedPluginHooksForEvent,
  setPluginEnabledState,
  trustPluginHook,
  untrustPluginHook,
  type PluginHookEvent,
} from "./plugins/index.js";
import {
  applySavedProfile,
  deleteSavedProfile,
  findSavedProfile,
  getProfileStatusSummary,
  renderProfileInspect,
  renderProfileList,
  resolveProfileConfigPath,
  saveCurrentProfile,
} from "./profiles/index.js";
import type { BrowserSnapshotDriver } from "./research/index.js";
import { resolveSessionDirectory } from "./sessions/index.js";
import { formatStatus } from "./status.js";
import { runChat } from "./tui/chat.js";

interface PackageJson {
  version: string;
}

interface CliIo {
  stdin?: NodeJS.ReadableStream;
  stdout: Pick<NodeJS.WriteStream, "write">;
  stderr: Pick<NodeJS.WriteStream, "write">;
  cwd: string;
  fetch?: typeof fetch;
  browserSnapshot?: BrowserSnapshotDriver;
}

interface AskCommand {
  prompt: string;
  overrides: AskRequestOverrides;
}

interface GlobalCliOptions {
  profile?: string;
  args: string[];
}

const VALID_MODES = new Set<OrxMode>(["auto", "fusion", "exact"]);

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

  const mcpConfigPath = resolveMcpConfigPath({ env, cwd: io.cwd });
  const pluginRegistryPath = resolvePluginRegistryPath({ env, cwd: io.cwd });
  const pluginCacheDirectory = resolvePluginCacheDirectory({
    env,
    cwd: io.cwd,
    registryPath: pluginRegistryPath,
  });
  const pluginHooksConfigPath = resolvePluginHooksConfigPath({ env, cwd: io.cwd });
  const pluginHooksAuditLogPath = resolvePluginHooksAuditLogPath({ env, cwd: io.cwd });
  const pluginCatalogPath = resolvePluginCatalogPath({ env, cwd: io.cwd });
  const profileConfigPath = resolveProfileConfigPath({ env, cwd: io.cwd });
  const loadedConfigResult = loadConfigWithProfile({
    env,
    cwd: io.cwd,
    profileId: parsedGlobalOptions.profile,
    profileConfigPath,
  });
  if (typeof loadedConfigResult === "string") {
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
        pluginCacheDirectory,
        pluginHooksAuditLogPath,
        pluginHooksConfigPath,
        pluginRegistryPath,
        profileConfigPath,
        renderOptions: { stream: io.stdout, theme: loadedConfig.config.theme },
      }),
    );
    return 0;
  }

  if (first === "profile" || first === "profiles") {
    return runProfileCommand(args.slice(1), loadedConfig.config, io, profileConfigPath);
  }

  if (first === "plugins" || first === "plugin") {
    return runPluginsCommand(
      args.slice(1),
      io,
      pluginRegistryPath,
      pluginCacheDirectory,
      pluginCatalogPath,
      pluginHooksConfigPath,
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
      mcpConfigPath,
      pluginRegistryPath,
      env.ORX_MCP_AUDIT_PATH,
    );
  }

  const apiKeyError = validateApiKey(loadedConfig);
  if (apiKeyError) {
    writeLine(io.stderr, apiKeyError);
    return 1;
  }

  if (first === "ask") {
    return runAskCommand(args.slice(1), loadedConfig.config.apiKey ?? "", loadedConfig.config, io, {
      hookEnv: env,
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
      pluginCacheDirectory,
      pluginCatalogPath,
      pluginHooksAuditLogPath,
      pluginHooksConfigPath,
      pluginRegistryPath,
      profileConfigPath,
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
    "  profile       List, inspect, save, or delete local ORX profiles",
    "  mcp           List, inspect, enable, disable, and grant MCP tool policy",
    "  plugins       List catalog entries, inspect, register/install, enable, or disable plugins",
    "  hooks         List, inspect, trust, untrust, or run plugin hook definitions",
    "  status        Show runtime status and config defaults",
    "  help          Show this help message",
    "  version       Show the current version",
    "",
    "Ask options:",
    "  --model <slug>          Use an exact OpenRouter model slug",
    "  --mode <auto|fusion|exact>",
    "  --fusion <preset>       Use an OpenRouter Fusion preset",
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
    pluginCacheDirectory?: string;
    pluginCatalogPath?: string;
    pluginHooksAuditLogPath?: string;
    pluginHooksConfigPath?: string;
    pluginRegistryPath?: string;
    profileConfigPath?: string;
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
    pluginCacheDirectory: paths?.pluginCacheDirectory,
    pluginCatalogPath: paths?.pluginCatalogPath,
    pluginHooksAuditLogPath: paths?.pluginHooksAuditLogPath,
    pluginHooksConfigPath: paths?.pluginHooksConfigPath,
    pluginRegistryPath: paths?.pluginRegistryPath,
    profileConfigPath: paths?.profileConfigPath,
    braveSearchApiKey: env.BRAVE_SEARCH_API_KEY,
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

function runProfileCommand(
  args: string[],
  config: OrxConfig,
  io: CliIo,
  profileConfigPath: string,
): number {
  const subcommand = args[0]?.toLowerCase() ?? "list";
  const profileId = args[1];

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
    if (!profileId || args.length !== 2) {
      writeLine(io.stderr, "Usage: orx profile save <id>");
      return 1;
    }

    let result: ReturnType<typeof saveCurrentProfile>;
    try {
      result = saveCurrentProfile(profileId, config, { configPath: profileConfigPath });
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

  writeLine(io.stderr, "Usage: orx profile [list|save <id>|use <id>|inspect <id>|delete <id>]");
  return 1;
}

function runPluginsCommand(
  args: string[],
  io: CliIo,
  pluginRegistryPath: string,
  pluginCacheDirectory: string,
  pluginCatalogPath: string,
  pluginHooksConfigPath: string,
): number {
  const subcommand = args[0]?.toLowerCase() ?? "list";
  const pluginId = args[1];

  if (subcommand === "list" || subcommand === "status") {
    writeLine(
      io.stdout,
      renderPluginList(getPluginStatusSummary({ registryPath: pluginRegistryPath }), {
        enabledHookCount: getPluginHookTrustSummary({
          configPath: pluginHooksConfigPath,
          registryPath: pluginRegistryPath,
        }).trustedCount,
      }),
    );
    return 0;
  }

  if (subcommand === "catalog" || subcommand === "search") {
    writeLine(io.stdout, renderPluginCatalog(loadPluginCatalog({ catalogPath: pluginCatalogPath })));
    return 0;
  }

  if (subcommand === "inspect") {
    if (!pluginId || args.length !== 2) {
      writeLine(io.stderr, "Usage: orx plugins inspect <id>");
      return 1;
    }

    const plugin = findInstalledPlugin(pluginId, { registryPath: pluginRegistryPath });
    if (!plugin) {
      writeLine(io.stderr, `Unknown plugin: ${formatPluginIdForMessage(pluginId)}`);
      return 1;
    }

    writeLine(io.stdout, renderPluginInspect(plugin));
    return 0;
  }

  if (subcommand === "register" || subcommand === "install") {
    const manifestPathText = args.slice(1).join(" ").trim();
    if (!manifestPathText) {
      writeLine(io.stderr, `Usage: orx plugins ${subcommand} <manifest-path>`);
      return 1;
    }

    try {
      const target = resolvePluginInstallTarget(manifestPathText, {
        cwd: io.cwd,
        catalogPath: pluginCatalogPath,
      });
      const result = registerPluginManifest(target.manifestPath, {
        registryPath: pluginRegistryPath,
        cacheDirectory: pluginCacheDirectory,
      });
      const sourceMessage = target.catalogEntry
        ? `Catalog entry ${target.catalogEntry.id} resolved to ${target.manifestPath}.\n`
        : "";
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

  writeLine(
    io.stderr,
    "Usage: orx plugins [catalog|list|inspect <id>|register <manifest-path-or-catalog-id>|install <manifest-path-or-catalog-id>|enable <id>|disable <id>]",
  );
  return 1;
}

function runMcpCommand(
  args: string[],
  io: CliIo,
  mcpConfigPath: string,
  pluginRegistryPath: string,
  mcpAuditLogPath?: string,
): number {
  const subcommand = args[0]?.toLowerCase() ?? "list";
  const profileId = args[1];
  const toolName = args[2];

  if (subcommand === "list" || subcommand === "status") {
    const summary = getMcpStatusSummary({
      configPath: mcpConfigPath,
      pluginRegistryPath,
    });
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
        pendingSchemaChangeCount: summary.pendingSchemaChangeCount,
      },
    });
    writeLine(io.stdout, renderMcpStatus(summary));
    return 0;
  }

  if (subcommand === "inspect") {
    if (!profileId || args.length !== 2) {
      writeLine(io.stderr, "Usage: orx mcp inspect <profile>");
      return 1;
    }

    const report = getMcpProfileToolPolicyReport(profileId, {
      configPath: mcpConfigPath,
      pluginRegistryPath,
    });
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
      }),
    );
    return 0;
  }

  if (subcommand === "tools") {
    if (!profileId || args.length !== 2) {
      writeLine(io.stderr, "Usage: orx mcp tools <profile>");
      return 1;
    }

    const report = getMcpProfileToolPolicyReport(profileId, {
      configPath: mcpConfigPath,
      pluginRegistryPath,
    });
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
        {
          configPath: mcpConfigPath,
          pluginRegistryPath,
        },
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

  if (subcommand === "allow-tool") {
    if (!profileId || !toolName || args.length !== 3) {
      writeLine(io.stderr, "Usage: orx mcp allow-tool <profile> <tool>");
      return 1;
    }

    try {
      const result = allowMcpToolGrant(profileId, toolName, {
        configPath: mcpConfigPath,
        pluginRegistryPath,
      });
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

  if (subcommand === "revoke-tool") {
    if (!profileId || !toolName || args.length !== 3) {
      writeLine(io.stderr, "Usage: orx mcp revoke-tool <profile> <tool>");
      return 1;
    }

    try {
      const result = revokeMcpToolGrant(profileId, toolName, {
        configPath: mcpConfigPath,
        pluginRegistryPath,
      });
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

  writeLine(
    io.stderr,
    "Usage: orx mcp [list|inspect <profile>|tools <profile>|enable <profile>|disable <profile>|allow-tool <profile> <tool>|revoke-tool <profile> <tool>]",
  );
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

  writeLine(io.stderr, "Usage: orx hooks [list|inspect <id>|trust <id>|untrust <id>|run <id>]");
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

function loadConfigWithProfile(options: {
  env: NodeJS.ProcessEnv;
  cwd: string;
  profileId?: string;
  profileConfigPath: string;
}): LoadedConfig | string {
  const loadedConfig = loadConfig({ env: options.env, cwd: options.cwd });
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
  };
}

function formatProfileIdForMessage(profileId: string): string {
  return profileId.replace(/[\u0000-\u001f\u007f-\u009f]/g, "").trim().toLowerCase().slice(0, 80);
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
