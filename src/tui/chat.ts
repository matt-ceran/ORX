import { createInterface } from "node:readline";
import {
  DEFAULT_CONTEXT_BUDGET,
  createSessionDiffState,
  formatToolCallStart,
  formatToolResult,
  getContextState,
  resetSessionDiffState,
  runAgentTurn,
  type AgentContextBudget,
} from "../agent/index.js";
import type { LoadedConfig, OrxConfig } from "../config/types.js";
import {
  createEmptyDelegationState,
  normalizeDelegationState,
  type DelegationState,
} from "../delegation/index.js";
import type { OpenRouterCreditsInfo } from "../openrouter/live.js";
import { formatOpenRouterMetadata } from "../openrouter/summary.js";
import type { OpenRouterMessage, OpenRouterStreamMetadata } from "../openrouter/types.js";
import {
  createEnabledPluginSkillsSystemMessage,
  discoverEnabledPluginSkills,
} from "../plugins/index.js";
import type {
  BrowserSnapshotDriver,
  EvidenceSource,
  ResolveBrowserHost,
} from "../research/index.js";
import {
  createSessionRecord,
  listSessionRecords,
  refreshSessionGitMetadata,
  resolveSessionDirectory,
  saveSessionRecord,
  updateSessionRecord,
  type ListedSessionRecord,
  type OrxSessionRecord,
  type SessionActivatedSkill,
} from "../sessions/index.js";
import {
  completeSlashCommandLine,
  handleSlashCommand,
  type ResumeSessionResult,
  type ResumeSessionSummary,
} from "../slash/index.js";
import {
  createSessionCostMeterState,
  emptySessionCostMeterState,
  formatCompactContextUsageMeter,
  formatCompactCreditsUsageMeter,
  formatCompactSessionCostMeter,
  recordSessionTurnCost,
  type SessionCostMeterState,
} from "../terminal/meters.js";
import { createTerminalRenderer, type TerminalRenderOptions } from "../terminal/render.js";
import {
  isInteractiveTerminal,
  renderPlainComposerPrompt,
  renderTtyStatusComposer,
  resolveTerminalWidth,
  shouldUseTtyScreen,
  type TtyActivityState,
} from "./screen.js";

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
  webFetch?: typeof fetch;
  webSearchFetch?: typeof fetch;
  browserSnapshot?: BrowserSnapshotDriver;
  browserResolveHost?: ResolveBrowserHost;
}

export interface ChatOptions {
  apiKey: string;
  loadedConfig: LoadedConfig;
  io: ChatIo;
  contextBudget?: Partial<AgentContextBudget>;
  sessionDirectory?: string;
  mcpAuditLogPath?: string;
  mcpConfigPath?: string;
  pluginCacheDirectory?: string;
  pluginRegistryPath?: string;
  profileConfigPath?: string;
  braveSearchApiKey?: string;
}

export interface ChatTerminalModes {
  useReadlineTerminal: boolean;
  useTtyScreen: boolean;
}

const TTY_ACTIVITY_INTERVAL_MS = 120;

export async function runChat({
  apiKey,
  loadedConfig,
  io,
  contextBudget = DEFAULT_CONTEXT_BUDGET,
  sessionDirectory,
  mcpAuditLogPath,
  mcpConfigPath,
  pluginCacheDirectory,
  pluginRegistryPath,
  profileConfigPath,
  braveSearchApiKey = process.env.BRAVE_SEARCH_API_KEY,
}: ChatOptions): Promise<number> {
  let activeConfig: OrxConfig = { ...loadedConfig.config };
  let activeCwd = io.cwd;
  let messages: OpenRouterMessage[] = [];
  let latestMetadata: OpenRouterStreamMetadata | undefined;
  let costMeterState = emptySessionCostMeterState();
  let latestCredits: OpenRouterCreditsInfo | undefined;
  let activeAbort: AbortController | undefined;
  let activeTtyActivity: TtyActivityState | undefined;
  let activeTtyActivityLineCount = 0;
  let activeTtyActivityTimer: ReturnType<typeof setInterval> | undefined;
  let ttyActivityFrame = 0;
  const diffState = createSessionDiffState();
  let session = await createChatSession(activeCwd, activeConfig, sessionDirectory, io.stderr);
  let activatedSkills: SessionActivatedSkill[] = session.record.activatedSkills ?? [];
  let evidenceSources: EvidenceSource[] = session.record.evidenceSources ?? [];
  let delegationState: DelegationState = normalizeDelegationState(session.record.delegation);
  const { useReadlineTerminal, useTtyScreen } = resolveChatTerminalModes(io.stdin, io.stdout);

  const rl = createInterface({
    input: io.stdin,
    output: writableStreamOrUndefined(io.stdout),
    completer: useReadlineTerminal ? completeSlashCommandLine : undefined,
    terminal: useReadlineTerminal,
    crlfDelay: Infinity,
  });

  rl.on("SIGINT", () => {
    if (activeAbort) {
      activeAbort.abort();
      finishTtyActivityLine();
      writeLine(io.stdout, "\nInterrupted current request.");
      return;
    }

    writeLine(io.stdout, "\nExiting ORX chat.");
    rl.close();
  });

  if (useTtyScreen) {
    writeComposer(io.stdout, renderCurrentTtyComposer());
  } else {
    writeLine(
      io.stdout,
      renderHeader(activeCwd, loadedConfig, activeConfig, session, {
        messages,
        contextBudget,
        costMeterState,
        latestCredits,
        renderOptions: { stream: io.stdout, theme: activeConfig.theme },
      }),
    );
    writePrompt(io.stdout);
  }

  try {
    for await (const rawLine of rl) {
      const line = rawLine.trim();

      if (!line) {
        writePromptOrComposer();
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
          fetch: io.fetch,
          webFetch: io.webFetch,
          webSearchFetch: io.webSearchFetch,
          browserSnapshot: io.browserSnapshot,
          browserResolveHost: io.browserResolveHost,
          braveSearchApiKey,
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
            costMeterState = emptySessionCostMeterState();
            activatedSkills = [];
            evidenceSources = [];
          },
          getEvidenceSources: () => evidenceSources,
          setEvidenceSources: (sources) => {
            evidenceSources = sources;
          },
          getDelegationState: () => delegationState,
          setDelegationState: (state) => {
            delegationState = normalizeDelegationState(state);
          },
          getLatestMetadata: () => latestMetadata,
          getCostMeterState: () => costMeterState,
          getContextBudget: () => contextBudget,
          getDiffState: () => diffState,
          getSessionInfo: () => sessionInfo(session),
          setLatestCredits: (credits) => {
            latestCredits = credits;
          },
          mcpAuditLogPath,
          mcpConfigPath,
          pluginCacheDirectory,
          pluginRegistryPath,
          profileConfigPath,
          recordActivatedSkill: (skill) => {
            activatedSkills = upsertActivatedSkill(activatedSkills, skill);
          },
          startNewSession: async () => {
            session = await createChatSession(activeCwd, activeConfig, sessionDirectory, io.stderr);
            activatedSkills = [];
            evidenceSources = [];
            delegationState = createEmptyDelegationState();
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
            costMeterState = createSessionCostMeterState(latestMetadata);
            activatedSkills = cloneJson(record.activatedSkills ?? []);
            evidenceSources = cloneJson(record.evidenceSources ?? []);
            delegationState = normalizeDelegationState(record.delegation);
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
        ({ messages, activatedSkills } = pruneInactiveSkillState(
          messages,
          activatedSkills,
          pluginRegistryPath,
        ));
        await persistSession(
          session,
          activeCwd,
          activeConfig,
          messages,
          latestMetadata,
          activatedSkills,
          evidenceSources,
          delegationState,
          io.stderr,
        );

        if (result === "exit") {
          rl.close();
          break;
        }

        writePromptOrComposer();
        continue;
      }

      ({ messages, activatedSkills } = pruneInactiveSkillState(
        messages,
        activatedSkills,
        pluginRegistryPath,
      ));
      const userMessage: OpenRouterMessage = { role: "user", content: line };
      const requestMessages = [...messages, userMessage];

      activeAbort = new AbortController();
      writeLine(io.stdout, `\nyou: ${line}`);
      if (useTtyScreen) {
        startTtyActivity("assistant");
      } else {
        io.stdout.write("assistant: ");
      }
      let needsAssistantPrefix = useTtyScreen;

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
            ephemeralSystemMessages: compactPluginSkillMessages(pluginRegistryPath),
            callbacks: {
              onText(text) {
                finishTtyActivityLine();
                if (needsAssistantPrefix) {
                  io.stdout.write("assistant: ");
                  needsAssistantPrefix = false;
                }
                io.stdout.write(text);
              },
              onToolCall(toolCall) {
                finishTtyActivityLine();
                io.stdout.write(
                  `\n${formatToolCallStart(toolCall, { stream: io.stdout, theme: activeConfig.theme })}\n`,
                );
                startTtyActivity("tool", toolCall.function.name);
                needsAssistantPrefix = true;
              },
              onToolResult(result) {
                finishTtyActivityLine();
                io.stdout.write(
                  `${formatToolResult(result, { stream: io.stdout, theme: activeConfig.theme })}\n`,
                );
                startTtyActivity("assistant");
                needsAssistantPrefix = true;
              },
            },
          },
        );

        if (!finishTtyActivityLine()) {
          io.stdout.write("\n");
        }
        messages = result.messages;
        latestMetadata = result.metadata;
        costMeterState = recordSessionTurnCost(costMeterState, result.metadata);
        await persistSession(
          session,
          activeCwd,
          activeConfig,
          messages,
          latestMetadata,
          activatedSkills,
          evidenceSources,
          delegationState,
          io.stderr,
        );
        writeLine(io.stdout, formatOpenRouterMetadata(result.metadata));
        if (!useTtyScreen) {
          writeLine(
            io.stdout,
            renderFooter(activeCwd, loadedConfig, activeConfig, session, {
              messages,
              contextBudget,
              costMeterState,
              latestCredits,
              renderOptions: { stream: io.stdout, theme: activeConfig.theme },
            }),
          );
        }
      } catch (error) {
        if (!finishTtyActivityLine()) {
          io.stdout.write("\n");
        }
        if (isAbortError(error)) {
          writeLine(io.stderr, "Request interrupted.");
        } else {
          const message = error instanceof Error ? error.message : String(error);
          writeLine(io.stderr, message);
        }
      } finally {
        stopTtyActivity();
        activeAbort = undefined;
      }

      writePromptOrComposer();
    }
  } finally {
    stopTtyActivity();
    rl.close();
  }

  return 0;

  function writePromptOrComposer(): void {
    if (useTtyScreen) {
      writeComposer(io.stdout, renderCurrentTtyComposer());
      return;
    }

    writePrompt(io.stdout);
  }

  function renderCurrentTtyComposer(activity?: TtyActivityState): string {
    return renderTtyStatusComposer({
      cwd: activeCwd,
      model: activeConfig.model,
      mode: activeConfig.mode,
      permissions: activeConfig.permissions,
      sessionId: session.record.id,
      messages,
      contextBudget,
      costMeterState,
      latestCredits,
      activity,
      width: resolveTerminalWidth(io.stdout),
      renderOptions: { stream: io.stdout, theme: activeConfig.theme },
    });
  }

  function startTtyActivity(kind: TtyActivityState["kind"], label?: string): void {
    if (!useTtyScreen) {
      return;
    }

    stopTtyActivity();
    const activity = nextTtyActivity(kind, label);
    const composer = renderCurrentTtyComposer(activity);
    activeTtyActivity = activity;
    activeTtyActivityLineCount = countLines(composer);
    writeComposer(io.stdout, composer);

    activeTtyActivityTimer = setInterval(() => {
      if (!activeTtyActivity) {
        return;
      }

      const nextActivity = nextTtyActivity(kind, label);
      const nextComposer = renderCurrentTtyComposer(nextActivity);
      io.stdout.write(clearRenderedLines(activeTtyActivityLineCount));
      activeTtyActivity = nextActivity;
      activeTtyActivityLineCount = countLines(nextComposer);
      writeComposer(io.stdout, nextComposer);
    }, TTY_ACTIVITY_INTERVAL_MS);
    activeTtyActivityTimer.unref?.();
  }

  function nextTtyActivity(kind: TtyActivityState["kind"], label?: string): TtyActivityState {
    const activity = {
      kind,
      label,
      frame: ttyActivityFrame,
    };
    ttyActivityFrame += 1;
    return activity;
  }

  function finishTtyActivityLine(): boolean {
    if (!activeTtyActivity) {
      return false;
    }

    const lineCount = activeTtyActivityLineCount;
    stopTtyActivity();
    io.stdout.write(clearRenderedLines(lineCount));
    return true;
  }

  function stopTtyActivity(): void {
    if (activeTtyActivityTimer) {
      clearInterval(activeTtyActivityTimer);
      activeTtyActivityTimer = undefined;
    }
    activeTtyActivity = undefined;
    activeTtyActivityLineCount = 0;
  }
}

export function resolveChatTerminalModes(
  stdin: unknown,
  stdout: unknown,
  env: Partial<Pick<NodeJS.ProcessEnv, "NO_COLOR">> = process.env,
): ChatTerminalModes {
  return {
    useReadlineTerminal: isInteractiveTerminal(stdin, stdout),
    useTtyScreen: shouldUseTtyScreen(stdin, stdout, env),
  };
}

function renderHeader(
  cwd: string,
  loadedConfig: LoadedConfig,
  activeConfig: OrxConfig,
  session: ChatSessionHandle,
  meterState: ChatFooterMeterState,
): string {
  const renderer = createTerminalRenderer(meterState.renderOptions);
  return [
    renderer.bold("ORX chat"),
    renderFooter(cwd, loadedConfig, activeConfig, session, meterState),
    "Type /help for commands. Ctrl+C interrupts an active response or exits when idle.",
  ].join("\n");
}

interface ChatFooterMeterState {
  messages: OpenRouterMessage[];
  contextBudget: Partial<AgentContextBudget>;
  costMeterState: SessionCostMeterState;
  latestCredits?: OpenRouterCreditsInfo;
  renderOptions?: TerminalRenderOptions;
}

function renderFooter(
  cwd: string,
  loadedConfig: LoadedConfig,
  activeConfig: OrxConfig,
  session: ChatSessionHandle,
  meterState: ChatFooterMeterState,
): string {
  const renderer = createTerminalRenderer(meterState.renderOptions);
  const contextState = getContextState(meterState.messages, meterState.contextBudget);
  const key = loadedConfig.apiKeyPresent ? `yes (${loadedConfig.apiKeySource})` : "no";
  return [
    `cwd: ${cwd}`,
    `mode: ${activeConfig.mode}`,
    `model: ${activeConfig.model}`,
    `key: ${key}`,
    `context: ${formatCompactContextUsageMeter(contextState, renderer)}`,
    `cost: ${formatCompactSessionCostMeter(meterState.costMeterState, renderer)}`,
    meterState.latestCredits
      ? `credits: ${formatCompactCreditsUsageMeter(meterState.latestCredits, renderer)}`
      : undefined,
    `permissions: ${activeConfig.permissions.approvalPolicy}/${activeConfig.permissions.sandboxMode}`,
    `session: ${session.record.id} @ ${session.filePath}`,
  ]
    .filter((part): part is string => typeof part === "string")
    .join(" | ");
}

function writePrompt(stream: WritableLike) {
  stream.write(`\n${renderPlainComposerPrompt()}`);
}

function writeComposer(stream: WritableLike, composer: string) {
  stream.write(composer);
}

function writeLine(stream: WritableLike, text: string) {
  stream.write(`${text}\n`);
}

function countLines(value: string): number {
  return value.split("\n").length;
}

function clearRenderedLines(lineCount: number): string {
  const count = Math.max(1, Math.floor(lineCount));
  return [
    "\r\x1b[2K",
    ...Array.from({ length: count - 1 }, () => "\x1b[1F\x1b[2K"),
  ].join("");
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
  activatedSkills: SessionActivatedSkill[],
  evidenceSources: EvidenceSource[],
  delegationState: DelegationState,
  stderr: WritableLike,
): Promise<void> {
  try {
    updateSessionRecord(session.record, {
      activeConfig: config,
      messages,
      latestMetadata,
      activatedSkills,
      evidenceSources,
      delegation: delegationState,
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

function compactPluginSkillMessages(pluginRegistryPath: string | undefined): OpenRouterMessage[] {
  const message = createEnabledPluginSkillsSystemMessage({ registryPath: pluginRegistryPath });
  return message ? [message] : [];
}

function upsertActivatedSkill(
  skills: SessionActivatedSkill[],
  nextSkill: SessionActivatedSkill,
): SessionActivatedSkill[] {
  return [...skills.filter((skill) => skill.id !== nextSkill.id), nextSkill];
}

function pruneInactiveSkillState(
  messages: OpenRouterMessage[],
  activatedSkills: SessionActivatedSkill[],
  pluginRegistryPath: string | undefined,
): { messages: OpenRouterMessage[]; activatedSkills: SessionActivatedSkill[] } {
  if (activatedSkills.length === 0) {
    return {
      messages,
      activatedSkills,
    };
  }

  const activeSkillIds = new Set(
    discoverEnabledPluginSkills({ registryPath: pluginRegistryPath }).skills.map((skill) => skill.id),
  );
  const nextActivatedSkills = activatedSkills.filter((skill) => activeSkillIds.has(skill.id));
  if (nextActivatedSkills.length === activatedSkills.length) {
    return {
      messages,
      activatedSkills,
    };
  }

  return {
    messages: messages.filter((message) => {
      const skillId = activatedSkillMessageId(message);
      return !skillId || activeSkillIds.has(skillId);
    }),
    activatedSkills: nextActivatedSkills,
  };
}

function activatedSkillMessageId(message: OpenRouterMessage): string | undefined {
  if (message.role !== "system" || typeof message.content !== "string") {
    return undefined;
  }

  if (!message.content.startsWith("ORX plugin skill activation.\n")) {
    return undefined;
  }

  return /^- skill_id: (plugin:[^\n]+)$/m.exec(message.content)?.[1];
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

function writableStreamOrUndefined(stream: WritableLike): NodeJS.WritableStream | undefined {
  const maybeStream = stream as NodeJS.WritableStream;
  return typeof maybeStream.on === "function" ? maybeStream : undefined;
}
