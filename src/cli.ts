#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BIN_NAME } from "./constants.js";
import { formatToolCallStart, formatToolResult, runAgentTurn } from "./agent/index.js";
import { loadConfig, validateApiKey } from "./config/index.js";
import type { OrxConfig, OrxMode } from "./config/types.js";
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
import { resolveMcpConfigPath } from "./mcp/index.js";
import { resolvePluginRegistryPath } from "./plugins/index.js";
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
}

interface AskCommand {
  prompt: string;
  overrides: AskRequestOverrides;
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
  const args = argv.slice(2);
  const first = args[0];

  if (!first || first === "help" || first === "--help" || first === "-h") {
    writeLine(io.stdout, helpText());
    return 0;
  }

  if (first === "--version" || first === "-v" || first === "version") {
    writeLine(io.stdout, getVersion());
    return 0;
  }

  if (first === "status") {
    const loadedConfig = loadConfig({ env, cwd: io.cwd });
    const mcpConfigPath = resolveMcpConfigPath({ env, cwd: io.cwd });
    const pluginRegistryPath = resolvePluginRegistryPath({ env, cwd: io.cwd });
    writeLine(
      io.stdout,
      formatStatus({
        cwd: io.cwd,
        loadedConfig,
        mcpConfigPath,
        pluginRegistryPath,
      }),
    );
    return 0;
  }

  const loadedConfig = loadConfig({ env, cwd: io.cwd });
  const apiKeyError = validateApiKey(loadedConfig);
  if (apiKeyError) {
    writeLine(io.stderr, apiKeyError);
    return 1;
  }

  if (first === "ask") {
    return runAskCommand(args.slice(1), loadedConfig.config.apiKey ?? "", loadedConfig.config, io);
  }

  if (first === "models") {
    return runModelsCommand(args.slice(1), loadedConfig.config.apiKey ?? "", io);
  }

  if (first === "credits") {
    return runCreditsCommand(loadedConfig.config.apiKey ?? "", io);
  }

  if (first === "generation") {
    return runGenerationCommand(args.slice(1), loadedConfig.config.apiKey ?? "", io);
  }

  if (first === "chat") {
    const mcpConfigPath = resolveMcpConfigPath({ env, cwd: io.cwd });
    const pluginRegistryPath = resolvePluginRegistryPath({ env, cwd: io.cwd });
    return runChat({
      apiKey: loadedConfig.config.apiKey ?? "",
      loadedConfig,
      io: {
        stdin: io.stdin ?? process.stdin,
        stdout: io.stdout,
        stderr: io.stderr,
        cwd: io.cwd,
        fetch: io.fetch,
      },
      sessionDirectory: resolveSessionDirectory({ env, cwd: io.cwd }),
      mcpAuditLogPath: env.ORX_MCP_AUDIT_PATH,
      mcpConfigPath,
      pluginRegistryPath,
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
    `  ${BIN_NAME} [command] [options]`,
    "",
    "Commands:",
    '  ask "prompt"  Send one prompt to OpenRouter and stream the answer',
    "  chat          Start an interactive OpenRouter chat session",
    "  models [q]    List live OpenRouter models with an optional filter",
    "  credits       Show live OpenRouter credits",
    "  generation <id>  Show OpenRouter generation metadata",
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
    "  -h, --help              Show this help message",
    "  -v, --version           Show the current version",
  ].join("\n");
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
    writeLine(io.stderr, formatOpenRouterLiveError(error));
    return 1;
  }
}

async function runCreditsCommand(apiKey: string, io: CliIo): Promise<number> {
  try {
    const credits = await getOpenRouterCredits({
      apiKey,
      fetch: io.fetch,
    });
    writeLine(io.stdout, formatOpenRouterCredits(credits));
    return 0;
  } catch (error) {
    writeLine(io.stderr, formatOpenRouterLiveError(error));
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
    writeLine(io.stderr, formatOpenRouterLiveError(error));
    return 1;
  }
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
): Promise<number> {
  const parsed = parseAskArgs(args);
  if (typeof parsed === "string") {
    writeLine(io.stderr, parsed);
    return 1;
  }

  const requestMessages: OpenRouterMessage[] = [{ role: "user", content: parsed.prompt }];
  const requestConfig = applyAskOverrides(config, parsed.overrides);

  try {
    const result = await runAgentTurn(
      {
        apiKey,
        config: requestConfig,
        messages: requestMessages,
        cwd: io.cwd,
        fetch: io.fetch,
        callbacks: {
          onText(text) {
            io.stdout.write(text);
          },
          onToolCall(toolCall) {
            io.stdout.write(`\n${formatToolCallStart(toolCall)}\n`);
          },
          onToolResult(result) {
            io.stdout.write(`${formatToolResult(result)}\n`);
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
  }
}

function applyAskOverrides(config: OrxConfig, overrides: AskRequestOverrides): OrxConfig {
  if (overrides.model) {
    return {
      ...config,
      mode: "exact",
      model: overrides.model,
      fusionPreset: undefined,
    };
  }

  if (overrides.mode === "auto") {
    return {
      ...config,
      mode: "auto",
      model: "openrouter/auto",
      fusionPreset: undefined,
    };
  }

  if (overrides.mode === "exact") {
    return {
      ...config,
      mode: "exact",
      fusionPreset: undefined,
    };
  }

  if (overrides.mode === "fusion" || overrides.fusionPreset) {
    return {
      ...config,
      mode: "fusion",
      model: "openrouter/fusion",
      fusionPreset: overrides.fusionPreset ?? config.fusionPreset,
    };
  }

  return config;
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

function writeLine(stream: Pick<NodeJS.WriteStream, "write">, text: string) {
  stream.write(`${text}\n`);
}

const isEntrypoint = process.argv[1] === fileURLToPath(import.meta.url);
if (isEntrypoint) {
  process.exitCode = await runCli(process.argv);
}
