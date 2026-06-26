import { createInterface } from "node:readline";
import {
  DEFAULT_CONTEXT_BUDGET,
  createSessionDiffState,
  formatToolCallStart,
  formatToolResult,
  runAgentTurn,
  type AgentContextBudget,
} from "../agent/index.js";
import type { LoadedConfig, OrxConfig } from "../config/types.js";
import { formatOpenRouterMetadata } from "../openrouter/summary.js";
import type { OpenRouterMessage, OpenRouterStreamMetadata } from "../openrouter/types.js";
import { handleSlashCommand } from "../slash/index.js";

type WritableLike = Pick<NodeJS.WriteStream, "write">;

export interface ChatIo {
  stdin: NodeJS.ReadableStream;
  stdout: WritableLike;
  stderr: WritableLike;
  cwd: string;
  fetch?: typeof fetch;
}

export interface ChatOptions {
  apiKey: string;
  loadedConfig: LoadedConfig;
  io: ChatIo;
  contextBudget?: Partial<AgentContextBudget>;
}

export async function runChat({
  apiKey,
  loadedConfig,
  io,
  contextBudget = DEFAULT_CONTEXT_BUDGET,
}: ChatOptions): Promise<number> {
  let activeConfig: OrxConfig = { ...loadedConfig.config };
  let messages: OpenRouterMessage[] = [];
  let latestMetadata: OpenRouterStreamMetadata | undefined;
  let activeAbort: AbortController | undefined;
  const diffState = createSessionDiffState();

  const rl = createInterface({
    input: io.stdin,
    output: writableStreamOrUndefined(io.stdout),
    terminal: isTty(io.stdin) && isTty(io.stdout),
    crlfDelay: Infinity,
  });

  rl.on("SIGINT", () => {
    if (activeAbort) {
      activeAbort.abort();
      writeLine(io.stdout, "\nInterrupted current request.");
      return;
    }

    writeLine(io.stdout, "\nExiting ORX chat.");
    rl.close();
  });

  writeLine(io.stdout, renderHeader(io.cwd, loadedConfig, activeConfig));
  writePrompt(io.stdout);

  try {
    for await (const rawLine of rl) {
      const line = rawLine.trim();

      if (!line) {
        writePrompt(io.stdout);
        continue;
      }

      if (line.startsWith("/")) {
        const result = await handleSlashCommand(line, {
          io,
          loadedConfig,
          getConfig: () => activeConfig,
          setConfig: (nextConfig) => {
            activeConfig = nextConfig;
          },
          getMessages: () => messages,
          setMessages: (nextMessages) => {
            messages = nextMessages;
          },
          clearMessages: () => {
            messages = [];
            latestMetadata = undefined;
          },
          getLatestMetadata: () => latestMetadata,
          getContextBudget: () => contextBudget,
          getDiffState: () => diffState,
        });

        if (result === "exit") {
          rl.close();
          break;
        }

        writePrompt(io.stdout);
        continue;
      }

      const userMessage: OpenRouterMessage = { role: "user", content: line };
      const requestMessages = [...messages, userMessage];

      activeAbort = new AbortController();
      writeLine(io.stdout, `\nyou: ${line}`);
      io.stdout.write("assistant: ");
      let needsAssistantPrefix = false;

      try {
        const result = await runAgentTurn(
          {
            apiKey,
            config: activeConfig,
            messages: requestMessages,
            cwd: io.cwd,
            fetch: io.fetch,
            signal: activeAbort.signal,
            contextBudget,
            diffState,
            callbacks: {
              onText(text) {
                if (needsAssistantPrefix) {
                  io.stdout.write("assistant: ");
                  needsAssistantPrefix = false;
                }
                io.stdout.write(text);
              },
              onToolCall(toolCall) {
                io.stdout.write(`\n${formatToolCallStart(toolCall)}\n`);
                needsAssistantPrefix = true;
              },
              onToolResult(result) {
                io.stdout.write(`${formatToolResult(result)}\n`);
                needsAssistantPrefix = true;
              },
            },
          },
        );

        io.stdout.write("\n");
        messages = result.messages;
        latestMetadata = result.metadata;
        writeLine(io.stdout, formatOpenRouterMetadata(result.metadata));
        writeLine(io.stdout, renderFooter(io.cwd, loadedConfig, activeConfig));
      } catch (error) {
        io.stdout.write("\n");
        if (isAbortError(error)) {
          writeLine(io.stderr, "Request interrupted.");
        } else {
          const message = error instanceof Error ? error.message : String(error);
          writeLine(io.stderr, message);
        }
      } finally {
        activeAbort = undefined;
      }

      writePrompt(io.stdout);
    }
  } finally {
    rl.close();
  }

  return 0;
}

function renderHeader(cwd: string, loadedConfig: LoadedConfig, activeConfig: OrxConfig): string {
  return [
    "ORX chat",
    renderFooter(cwd, loadedConfig, activeConfig),
    "Type /help for commands. Ctrl+C interrupts an active response or exits when idle.",
  ].join("\n");
}

function renderFooter(cwd: string, loadedConfig: LoadedConfig, activeConfig: OrxConfig): string {
  const key = loadedConfig.apiKeyPresent ? `yes (${loadedConfig.apiKeySource})` : "no";
  return [
    `cwd: ${cwd}`,
    `mode: ${activeConfig.mode}`,
    `model: ${activeConfig.model}`,
    `key: ${key}`,
    `permissions: ${activeConfig.permissions.approvalPolicy}/${activeConfig.permissions.sandboxMode}`,
  ].join(" | ");
}

function writePrompt(stream: WritableLike) {
  stream.write("\norx> ");
}

function writeLine(stream: WritableLike, text: string) {
  stream.write(`${text}\n`);
}

function isAbortError(error: unknown): boolean {
  return (
    (typeof DOMException !== "undefined" &&
      error instanceof DOMException &&
      error.name === "AbortError") ||
    (error instanceof Error && (error.name === "AbortError" || error.message === "AbortError"))
  );
}

function isTty(stream: unknown): boolean {
  return Boolean((stream as { isTTY?: boolean }).isTTY);
}

function writableStreamOrUndefined(stream: WritableLike): NodeJS.WritableStream | undefined {
  const maybeStream = stream as NodeJS.WritableStream;
  return typeof maybeStream.on === "function" ? maybeStream : undefined;
}
