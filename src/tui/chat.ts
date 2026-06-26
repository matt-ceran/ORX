import { createInterface } from "node:readline";
import {
  DEFAULT_CONTEXT_BUDGET,
  createSessionDiffState,
  formatToolCallStart,
  formatToolResult,
  resetSessionDiffState,
  runAgentTurn,
  type AgentContextBudget,
} from "../agent/index.js";
import type { LoadedConfig, OrxConfig } from "../config/types.js";
import { formatOpenRouterMetadata } from "../openrouter/summary.js";
import type { OpenRouterMessage, OpenRouterStreamMetadata } from "../openrouter/types.js";
import {
  createSessionRecord,
  listSessionRecords,
  refreshSessionGitMetadata,
  resolveSessionDirectory,
  saveSessionRecord,
  updateSessionRecord,
  type ListedSessionRecord,
  type OrxSessionRecord,
} from "../sessions/index.js";
import {
  handleSlashCommand,
  type ResumeSessionResult,
  type ResumeSessionSummary,
} from "../slash/index.js";

type WritableLike = Pick<NodeJS.WriteStream, "write">;

interface ChatSessionHandle {
  record: OrxSessionRecord;
  sessionDir: string;
  filePath: string;
}

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
  sessionDirectory?: string;
}

export async function runChat({
  apiKey,
  loadedConfig,
  io,
  contextBudget = DEFAULT_CONTEXT_BUDGET,
  sessionDirectory,
}: ChatOptions): Promise<number> {
  let activeConfig: OrxConfig = { ...loadedConfig.config };
  let activeCwd = io.cwd;
  let messages: OpenRouterMessage[] = [];
  let latestMetadata: OpenRouterStreamMetadata | undefined;
  let activeAbort: AbortController | undefined;
  const diffState = createSessionDiffState();
  let session = await createChatSession(activeCwd, activeConfig, sessionDirectory, io.stderr);

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

  writeLine(io.stdout, renderHeader(activeCwd, loadedConfig, activeConfig, session));
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
          io: {
            stdout: io.stdout,
            stderr: io.stderr,
            cwd: activeCwd,
          },
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
          getSessionInfo: () => sessionInfo(session),
          startNewSession: async () => {
            session = await createChatSession(activeCwd, activeConfig, sessionDirectory, io.stderr);
          },
          resumeSession: async (selector) => {
            const result = await resumeChatSession({
              selector,
              currentSessionId: session.record.id,
              sessionDir: session.sessionDir,
            });

            if (result.kind !== "resumed") {
              return result;
            }

            const record = result.record;
            activeCwd = record.cwd;
            activeConfig = {
              ...record.activeConfig,
              apiKey: activeConfig.apiKey ?? loadedConfig.config.apiKey,
            };
            messages = cloneJson(record.messages);
            latestMetadata = cloneOptionalJson(record.latestMetadata);
            resetSessionDiffState(diffState);
            session = {
              record,
              sessionDir: session.sessionDir,
              filePath: result.filePath,
            };

            return {
              kind: "resumed",
              session: result.session,
            };
          },
        });
        await persistSession(session, activeCwd, activeConfig, messages, latestMetadata, io.stderr);

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
            cwd: activeCwd,
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
        await persistSession(session, activeCwd, activeConfig, messages, latestMetadata, io.stderr);
        writeLine(io.stdout, formatOpenRouterMetadata(result.metadata));
        writeLine(io.stdout, renderFooter(activeCwd, loadedConfig, activeConfig, session));
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

function renderHeader(
  cwd: string,
  loadedConfig: LoadedConfig,
  activeConfig: OrxConfig,
  session: ChatSessionHandle,
): string {
  return [
    "ORX chat",
    renderFooter(cwd, loadedConfig, activeConfig, session),
    "Type /help for commands. Ctrl+C interrupts an active response or exits when idle.",
  ].join("\n");
}

function renderFooter(
  cwd: string,
  loadedConfig: LoadedConfig,
  activeConfig: OrxConfig,
  session: ChatSessionHandle,
): string {
  const key = loadedConfig.apiKeyPresent ? `yes (${loadedConfig.apiKeySource})` : "no";
  return [
    `cwd: ${cwd}`,
    `mode: ${activeConfig.mode}`,
    `model: ${activeConfig.model}`,
    `key: ${key}`,
    `permissions: ${activeConfig.permissions.approvalPolicy}/${activeConfig.permissions.sandboxMode}`,
    `session: ${session.record.id} @ ${session.filePath}`,
  ].join(" | ");
}

function writePrompt(stream: WritableLike) {
  stream.write("\norx> ");
}

function writeLine(stream: WritableLike, text: string) {
  stream.write(`${text}\n`);
}

async function createChatSession(
  cwd: string,
  config: OrxConfig,
  directory: string | undefined,
  stderr: WritableLike,
): Promise<ChatSessionHandle> {
  try {
    const record = await createSessionRecord({
      cwd,
      activeConfig: config,
    });
    const sessionDir = resolveSessionDirectory({ cwd, sessionDir: directory });
    const filePath = await saveSessionRecord(record, { cwd, sessionDir });
    return {
      record,
      sessionDir,
      filePath,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeLine(stderr, `Unable to create session: ${message}`);
    throw error;
  }
}

async function persistSession(
  session: ChatSessionHandle,
  cwd: string,
  config: OrxConfig,
  messages: OpenRouterMessage[],
  latestMetadata: OpenRouterStreamMetadata | undefined,
  stderr: WritableLike,
): Promise<void> {
  try {
    updateSessionRecord(session.record, {
      activeConfig: config,
      messages,
      latestMetadata,
      cwd,
    });
    await refreshSessionGitMetadata(session.record);
    session.filePath = await saveSessionRecord(session.record, {
      cwd,
      sessionDir: session.sessionDir,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeLine(stderr, `Unable to save session: ${message}`);
  }
}

function sessionInfo(session: ChatSessionHandle): { id: string; path: string } {
  return {
    id: session.record.id,
    path: session.filePath,
  };
}

type ChatResumeSessionResult =
  | Exclude<ResumeSessionResult, { kind: "resumed" }>
  | {
      kind: "resumed";
      session: ResumeSessionSummary;
      record: OrxSessionRecord;
      filePath: string;
    };

async function resumeChatSession(options: {
  selector?: string;
  currentSessionId: string;
  sessionDir: string;
}): Promise<ChatResumeSessionResult> {
  try {
    const sessions = (
      await listSessionRecords({
        sessionDir: options.sessionDir,
        excludeIds: [options.currentSessionId],
      })
    ).filter((session) => session.record.messageCount > 0);
    const selector = options.selector?.trim();

    if (!selector) {
      return {
        kind: "list",
        sessions: sessions.slice(0, 20).map(toResumeSessionSummary),
      };
    }

    const selected = selectSession(selector, sessions);
    if (selected.kind === "selected") {
      return {
        kind: "resumed",
        record: selected.session.record,
        filePath: selected.session.filePath,
        session: toResumeSessionSummary(selected.session),
      };
    }

    if (selected.kind === "ambiguous") {
      return {
        kind: "ambiguous",
        selector,
        matches: selected.matches.map(toResumeSessionSummary),
      };
    }

    return {
      kind: "not_found",
      selector,
    };
  } catch (error) {
    return {
      kind: "error",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

type SessionSelection =
  | { kind: "selected"; session: ListedSessionRecord }
  | { kind: "ambiguous"; matches: ListedSessionRecord[] }
  | { kind: "not_found" };

function selectSession(selector: string, sessions: ListedSessionRecord[]): SessionSelection {
  if (selector.toLowerCase() === "latest") {
    const latest = sessions[0];
    return latest ? { kind: "selected", session: latest } : { kind: "not_found" };
  }

  const exactMatch = sessions.find((session) => session.id === selector);
  if (exactMatch) {
    return {
      kind: "selected",
      session: exactMatch,
    };
  }

  if (/^\d+$/.test(selector)) {
    const index = Number(selector);
    if (Number.isSafeInteger(index) && index >= 1 && index <= sessions.length) {
      return {
        kind: "selected",
        session: sessions[index - 1],
      };
    }
  }

  const prefixMatches = sessions.filter((session) => session.id.startsWith(selector));
  if (prefixMatches.length === 1) {
    return {
      kind: "selected",
      session: prefixMatches[0],
    };
  }

  if (prefixMatches.length > 1) {
    return {
      kind: "ambiguous",
      matches: prefixMatches,
    };
  }

  return {
    kind: "not_found",
  };
}

function toResumeSessionSummary(session: ListedSessionRecord): ResumeSessionSummary {
  const { record } = session;
  return {
    id: record.id,
    path: session.filePath,
    updatedAt: record.updatedAt,
    cwd: record.cwd,
    model: record.activeConfig.model,
    mode: record.activeConfig.mode,
    title: record.summary.title,
    cost: record.latestMetadata?.cost,
    messageCount: record.messageCount,
  };
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function cloneOptionalJson<T>(value: T | undefined): T | undefined {
  return value === undefined ? undefined : cloneJson(value);
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
