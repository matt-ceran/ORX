import {
  getContextState,
  type AgentContextBudget,
} from "../agent/index.js";
import type { PermissionConfig } from "../config/types.js";
import type { OpenRouterCreditsInfo } from "../openrouter/live.js";
import type { OpenRouterMessage } from "../openrouter/types.js";
import {
  formatMoney,
  type SessionCostMeterState,
} from "../terminal/meters.js";
import {
  createTerminalRenderer,
  formatMeter,
  shouldUseAnsiColor,
  type TerminalRenderOptions,
  type TerminalRenderer,
} from "../terminal/render.js";

export interface TtyStatusComposerState {
  cwd: string;
  model: string;
  mode: string;
  permissions: PermissionConfig;
  sessionId?: string;
  messages: OpenRouterMessage[];
  contextBudget?: Partial<AgentContextBudget>;
  costMeterState: SessionCostMeterState;
  latestCredits?: OpenRouterCreditsInfo;
  activity?: TtyActivityState;
  width?: number;
  renderOptions?: TerminalRenderOptions;
}

export interface TtyActivityState {
  kind: "assistant" | "tool";
  label?: string;
  frame?: number;
}

const DEFAULT_SCREEN_WIDTH = 80;
const MIN_SCREEN_WIDTH = 20;
const MAX_SCREEN_WIDTH = 220;
const WIDE_LAYOUT_WIDTH = 72;
const ANSI_PATTERN = /\x1B\[[0-?]*[ -/]*[@-~]/g;
const CONTROL_PATTERN = /[\x00-\x1F\x7F]/g;
const ACTIVITY_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;

export function shouldUseTtyScreen(
  stdin: unknown,
  stdout: unknown,
  env: Partial<Pick<NodeJS.ProcessEnv, "NO_COLOR">> = process.env,
): boolean {
  return isInteractiveTerminal(stdin, stdout) && shouldUseAnsiColor({ stream: stdout, env });
}

export function isInteractiveTerminal(stdin: unknown, stdout: unknown): boolean {
  return isTty(stdin) && isTty(stdout);
}

export function resolveTerminalWidth(stream: unknown, fallback = DEFAULT_SCREEN_WIDTH): number {
  const columns = (stream as { columns?: unknown } | undefined)?.columns;
  return normalizeWidth(typeof columns === "number" ? columns : fallback);
}

export function renderTtyStatusComposer(state: TtyStatusComposerState): string {
  return `${renderTtyStatusNotch(state)}\n${renderTtyComposerPrompt(state.renderOptions)}`;
}

export function renderTtyStatusNotch(state: TtyStatusComposerState): string {
  const width = normalizeWidth(state.width);
  const renderer = createTerminalRenderer(state.renderOptions);
  const contextState = getContextState(state.messages, state.contextBudget);
  const activity = formatActivity(state.activity, renderer);
  const model = keyValue("model", state.model, renderer, "accent");
  const mode = keyValue("mode", state.mode, renderer, "success");
  const context = keyValue("ctx", formatNotchContext(contextState, renderer, width), renderer);
  const cost = keyValue("cost", formatNotchCost(state.costMeterState, renderer), renderer);
  const credits = state.latestCredits
    ? keyValue("credits", formatNotchCredits(state.latestCredits, renderer, width), renderer)
    : undefined;
  const cwd = keyValue("cwd", compactCwd(state.cwd), renderer);
  const permissions = keyValue(
    "perm",
    `${state.permissions.approvalPolicy}/${state.permissions.sandboxMode}`,
    renderer,
    "warning",
  );
  const session = keyValue("session", compactSessionId(state.sessionId), renderer);

  if (width >= WIDE_LAYOUT_WIDTH) {
    return [
      fitStatusLine("╭─ ", [renderer.bold("orx"), activity, model, mode, context, cost, credits], width),
      fitStatusLine("╰─ ", [cwd, permissions, session], width),
    ].join("\n");
  }

  return [
    fitStatusLine("╭─ ", [renderer.bold("orx"), activity, model, mode], width),
    fitStatusLine("│  ", [context, cost, credits], width),
    fitStatusLine("╰─ ", [cwd, permissions, session], width),
  ].join("\n");
}

export function renderTtyComposerPrompt(renderOptions: TerminalRenderOptions = {}): string {
  const renderer = createTerminalRenderer(renderOptions);
  return `${renderer.accent("orx")} › `;
}

export function renderPlainComposerPrompt(): string {
  return "orx> ";
}

function formatNotchContext(
  state: ReturnType<typeof getContextState>,
  renderer: TerminalRenderer,
  width: number,
): string {
  const meterWidth = width >= WIDE_LAYOUT_WIDTH ? 8 : 4;
  return [
    formatMeter(
      {
        current: state.approximateBytes,
        total: state.budget.maxBytes,
        width: meterWidth,
      },
      renderer,
    ),
    "approx",
  ].join(" ");
}

function formatNotchCost(state: SessionCostMeterState, renderer: TerminalRenderer): string {
  const totalTurns = state.costedTurnCount + state.uncostedTurnCount;
  const coverage = totalTurns > 0 ? `${state.costedTurnCount}/${totalTurns}` : "n/a";
  return [
    colorMoney(formatMoney(state.knownSessionCost), renderer),
    renderer.dim(`meta ${coverage}`),
  ].join(" ");
}

function formatNotchCredits(
  credits: OpenRouterCreditsInfo,
  renderer: TerminalRenderer,
  width: number,
): string {
  const meterWidth = width >= WIDE_LAYOUT_WIDTH ? 8 : 4;
  return [
    formatMeter(
      {
        percent: credits.percentUsed,
        current: credits.totalUsage,
        total: credits.totalCredits,
        width: meterWidth,
        decimals: 1,
      },
      renderer,
    ),
    `rem ${colorMoney(formatMoney(credits.remainingCredits), renderer)}`,
  ].join(" ");
}

function colorMoney(value: string, renderer: TerminalRenderer): string {
  return value === "n/a" ? value : renderer.success(value);
}

function formatActivity(
  activity: TtyActivityState | undefined,
  renderer: TerminalRenderer,
): string | undefined {
  if (!activity) {
    return undefined;
  }

  const frame = ACTIVITY_FRAMES[normalizeActivityFrame(activity.frame)];
  const detail = compactActivityDetail(activity);
  const label = detail ? `${activity.kind} ${detail}` : activity.kind;
  return `${renderer.dim("work")} ${renderer.accent(frame)} ${label}`;
}

function compactActivityDetail(activity: TtyActivityState): string {
  if (!activity.label) {
    return "";
  }

  return activity.label
    .replace(ANSI_PATTERN, "")
    .replace(CONTROL_PATTERN, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 32);
}

function normalizeActivityFrame(frame: number | undefined): number {
  if (typeof frame !== "number" || !Number.isFinite(frame)) {
    return 0;
  }

  return Math.abs(Math.floor(frame)) % ACTIVITY_FRAMES.length;
}

function keyValue(
  key: string,
  value: string,
  renderer: TerminalRenderer,
  tone?: "accent" | "success" | "warning",
): string {
  const renderedValue =
    tone === "accent"
      ? renderer.accent(value)
      : tone === "success"
        ? renderer.success(value)
        : tone === "warning"
          ? renderer.warning(value)
          : value;
  return `${renderer.dim(key)} ${renderedValue}`;
}

function fitStatusLine(prefix: string, parts: Array<string | undefined>, width: number): string {
  const filtered = parts.filter((part): part is string => Boolean(part));
  const separator = "  ";
  const nextParts = [...filtered];

  while (visibleWidth(joinLine(prefix, nextParts, separator)) > width) {
    const index = longestReduciblePartIndex(nextParts);
    if (index === -1) {
      return truncateVisible(joinLine(prefix, nextParts, separator), width);
    }

    const visible = visibleWidth(nextParts[index]);
    nextParts[index] = truncateVisible(nextParts[index], visible - 1);
  }

  return joinLine(prefix, nextParts, separator);
}

function joinLine(prefix: string, parts: string[], separator: string): string {
  return `${prefix}${parts.join(separator)}`;
}

function longestReduciblePartIndex(parts: string[]): number {
  let bestIndex = -1;
  let bestSize = 0;

  for (let index = 0; index < parts.length; index += 1) {
    const size = visibleWidth(parts[index]);
    if (size > minimumPartWidth(parts[index]) && size > bestSize) {
      bestIndex = index;
      bestSize = size;
    }
  }

  return bestIndex;
}

function minimumPartWidth(part: string): number {
  const plain = stripAnsi(part);
  const firstSpace = plain.indexOf(" ");
  if (firstSpace >= 0) {
    return Math.max(3, firstSpace + 2);
  }

  return Math.min(3, plain.length);
}

function truncateVisible(value: string, maxWidth: number): string {
  const plain = stripAnsi(value);
  if (plain.length <= maxWidth) {
    return value;
  }

  if (maxWidth <= 0) {
    return "";
  }

  if (maxWidth === 1) {
    return "…";
  }

  return `${plain.slice(0, maxWidth - 1)}…`;
}

function visibleWidth(value: string): number {
  return stripAnsi(value).length;
}

function stripAnsi(value: string): string {
  return value.replace(ANSI_PATTERN, "");
}

function compactCwd(cwd: string): string {
  if (!cwd) {
    return ".";
  }

  return cwd.replace(/^\/Users\/[^/]+(?=\/|$)/, "~");
}

function compactSessionId(sessionId: string | undefined): string {
  if (!sessionId) {
    return "n/a";
  }

  const suffix = sessionId.split("-").at(-1);
  if (suffix && suffix.length >= 6 && /^[a-zA-Z0-9]+$/.test(suffix)) {
    return suffix.slice(0, 12);
  }

  return sessionId;
}

function normalizeWidth(width: number | undefined): number {
  if (typeof width !== "number" || !Number.isFinite(width)) {
    return DEFAULT_SCREEN_WIDTH;
  }

  return Math.max(MIN_SCREEN_WIDTH, Math.min(MAX_SCREEN_WIDTH, Math.floor(width)));
}

function isTty(stream: unknown): boolean {
  return Boolean((stream as { isTTY?: boolean } | undefined)?.isTTY);
}
