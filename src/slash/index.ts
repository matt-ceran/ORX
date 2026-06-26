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
import type { OpenRouterMessage, OpenRouterStreamMetadata } from "../openrouter/types.js";
import { formatOpenRouterMetadata } from "../openrouter/summary.js";
import { formatStatus } from "../status.js";
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

export interface SlashCommandContext {
  io: SlashIo;
  loadedConfig: LoadedConfig;
  getConfig: () => OrxConfig;
  setConfig: (config: OrxConfig) => void;
  getMessages: () => OpenRouterMessage[];
  setMessages: (messages: OpenRouterMessage[]) => void;
  clearMessages: () => void;
  getLatestMetadata: () => OpenRouterStreamMetadata | undefined;
  getContextBudget?: () => Partial<AgentContextBudget>;
  getDiffState?: () => SessionDiffState;
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
    usage: "/model <slug>",
    description: "Switch to an exact OpenRouter model",
    handler: (command, context) => {
      if (!command.argText) {
        writeLine(context.io.stdout, `Current model: ${context.getConfig().model}`);
        return "continue";
      }

      context.setConfig({
        ...context.getConfig(),
        mode: "exact",
        model: command.argText,
        fusionPreset: undefined,
      });
      writeLine(context.io.stdout, `Model set to ${command.argText} (mode: exact).`);
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
    usage: "/models",
    description: "Show current routing and model lookup status",
    handler: (_command, context) => {
      const config = context.getConfig();
      writeLine(
        context.io.stdout,
        [
          "Models",
          `  mode: ${config.mode}`,
          `  model: ${config.model}`,
          `  fusion_preset: ${config.fusionPreset ?? "none"}`,
          "  live_search: planned for OpenRouter MCP integration",
        ].join("\n"),
      );
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
    handler: (_command, context) => {
      context.clearMessages();
      writeLine(context.io.stdout, "New chat started. Conversation history cleared.");
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
  const loadedConfig = {
    ...context.loadedConfig,
    config: context.getConfig(),
  };
  const latestMetadata = context.getLatestMetadata();
  const diffState = context.getDiffState?.();

  return [
    formatStatus({
      cwd: context.io.cwd,
      loadedConfig,
    }),
    `history_messages: ${context.getMessages().length}`,
    `context: ${formatContextState(
      getContextState(context.getMessages(), context.getContextBudget?.()),
    )}`,
    diffState ? `diff_state: ${formatSessionDiffState(diffState)}` : undefined,
    latestMetadata
      ? `latest_metadata:\n${indent(formatOpenRouterMetadata(latestMetadata).trim())}`
      : "latest_metadata: none",
  ]
    .filter((line): line is string => typeof line === "string")
    .join("\n");
}

function indent(text: string): string {
  return text
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
}

function writeLine(stream: WritableLike, text: string) {
  stream.write(`${text}\n`);
}
