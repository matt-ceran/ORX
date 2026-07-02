import {
  getContextState,
  type AgentContextBudget,
} from "../agent/index.js";
import type { PermissionConfig } from "../config/types.js";
import type { OpenRouterCreditsInfo } from "../openrouter/live.js";
import type { OpenRouterMessage } from "../openrouter/types.js";
import {
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
  input?: TtyInputState;
  width?: number;
  renderOptions?: TerminalRenderOptions;
}

export interface TtyActivityState {
  kind: "assistant" | "tool";
  label?: string;
  frame?: number;
}

export interface TtyInputState {
  mode: "normal" | "multiline";
}

export interface TtyScreenWritable {
  write(chunk: string): unknown;
}

export interface TtyScreenController {
  show(composer: string): void;
  clear(): boolean;
  clearAfterSubmit(): boolean;
  readonly visibleLineCount: number;
}

const DEFAULT_SCREEN_WIDTH = 80;
const MIN_SCREEN_WIDTH = 20;
const MAX_SCREEN_WIDTH = 220;
const WIDE_LAYOUT_WIDTH = 72;
const SPLIT_PROVIDER_MODEL_WIDTH = 112;
const INLINE_CREDITS_WIDTH = 152;
const ANSI_PATTERN = /\x1B\[[0-?]*[ -/]*[@-~]/g;
const CONTROL_PATTERN = /[\x00-\x1F\x7F]/g;
const ACTIVITY_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;
const METER_PULSE_FRAMES = ["·", "∙", "•", "∙"] as const;

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
  return `${renderTtyStatusNotchForComposer(state)}\n${renderTtyFramedComposerPrompt(state)}`;
}

export function renderTtyStatusNotch(state: TtyStatusComposerState): string {
  const width = normalizeWidth(state.width);
  const renderer = createTerminalRenderer(state.renderOptions);
  const contextState = getContextState(state.messages, state.contextBudget);
  const activity = formatActivity(state.activity, renderer);
  const splitProviderModel = width >= SPLIT_PROVIDER_MODEL_WIDTH;
  const modelBadges = formatModelBadges(state.model, renderer, splitProviderModel);
  const mode = keyValue("mode", state.mode, renderer, "success");
  const activityFrame = state.activity?.frame;
  const context = keyValue(
    "ctx",
    formatNotchContext(contextState, renderer, width, activityFrame),
    renderer,
  );
  const cost = keyValue(
    "cost",
    formatNotchCost(state.costMeterState, renderer, width, activityFrame),
    renderer,
  );
  const credits = state.latestCredits
    ? keyValue("credits", formatNotchCredits(state.latestCredits, renderer, width), renderer)
    : undefined;
  const cwd = keyValue("cwd", compactCwd(state.cwd), renderer);
  const permissions = keyValue(
    "perm",
    `${state.permissions.approvalPolicy}/${state.permissions.sandboxMode}`,
    renderer,
  );
  const session = keyValue("session", compactSessionId(state.sessionId), renderer);

  if (credits && width < INLINE_CREDITS_WIDTH) {
    return [
      fitStatusLine("╭─ ", [renderer.bold("orx"), activity, ...modelBadges, mode], width),
      fitStatusLine("│  ", [context, cost], width),
      fitStatusLine("│  ", [credits], width),
      fitStatusLine("╰─ ", [cwd, session, permissions], width),
    ].join("\n");
  }

  if (width >= WIDE_LAYOUT_WIDTH) {
    return [
      fitStatusLine(
        "╭─ ",
        [renderer.bold("orx"), activity, ...modelBadges, mode, context, cost, credits],
        width,
      ),
      fitStatusLine("╰─ ", [cwd, session, permissions], width),
    ].join("\n");
  }

  return [
    fitStatusLine("╭─ ", [renderer.bold("orx"), activity, ...modelBadges, mode], width),
    fitStatusLine("│  ", [context, cost, credits], width),
    fitStatusLine("╰─ ", [cwd, session, permissions], width),
  ].join("\n");
}

export function renderTtyStatusProbe(
  width: number,
  overrides: Partial<TtyStatusComposerState> = {},
): string {
  return renderTtyStatusComposer({
    cwd: "/Users/draingang/Documents/ORX",
    model: "openrouter/auto",
    mode: "auto",
    permissions: {
      approvalPolicy: "never",
      sandboxMode: "danger-full-access",
    },
    sessionId: "20260702T120000Z-probe1851d3e4",
    messages: [
      { role: "user", content: "Please inspect the changed files." },
      { role: "assistant", content: "I am checking the HUD render path." },
    ],
    contextBudget: {
      maxBytes: 4_096,
      maxMessages: 12,
    },
    costMeterState: {
      latestTurnCost: 0.00035,
      knownSessionCost: 0.0041,
      costedTurnCount: 2,
      uncostedTurnCount: 1,
    },
    latestCredits: {
      totalCredits: 20,
      totalUsage: 2.75,
      remainingCredits: 17.25,
      percentUsed: 13.75,
    },
    activity: {
      kind: "assistant",
      frame: 2,
    },
    width,
    renderOptions: { color: false },
    ...overrides,
  });
}

export function renderTtyComposerPrompt(
  renderOptions: TerminalRenderOptions = {},
  input: TtyInputState = { mode: "normal" },
): string {
  const renderer = createTerminalRenderer(renderOptions);
  const prompt = input.mode === "multiline" ? "…" : "›";
  return `${renderer.accent("orx")} ${prompt} `;
}

export function renderPlainComposerPrompt(): string {
  return "orx> ";
}

export function renderPlainContinuationPrompt(): string {
  return "...> ";
}

export function createTtyScreenController(stream: TtyScreenWritable): TtyScreenController {
  return new DefaultTtyScreenController(stream);
}

export function countRenderedLines(value: string): number {
  return Math.max(1, value.split("\n").length);
}

export function clearRenderedTtyLines(lineCount: number): string {
  const count = normalizeLineCount(lineCount);
  return [
    "\r\x1b[2K",
    ...Array.from({ length: count - 1 }, () => "\x1b[1F\x1b[2K"),
  ].join("");
}

export function clearSubmittedTtyLines(lineCount: number): string {
  const count = normalizeLineCount(lineCount);
  return [
    "\r\x1b[2K",
    ...Array.from({ length: count }, () => "\x1b[1F\x1b[2K"),
  ].join("");
}

class DefaultTtyScreenController implements TtyScreenController {
  private lineCount = 0;

  constructor(private readonly stream: TtyScreenWritable) {}

  get visibleLineCount(): number {
    return this.lineCount;
  }

  show(composer: string): void {
    if (this.lineCount > 0) {
      this.stream.write(clearRenderedTtyLines(this.lineCount));
    }

    this.stream.write(composer);
    this.lineCount = countRenderedLines(composer);
  }

  clear(): boolean {
    if (this.lineCount <= 0) {
      return false;
    }

    this.stream.write(clearRenderedTtyLines(this.lineCount));
    this.lineCount = 0;
    return true;
  }

  clearAfterSubmit(): boolean {
    if (this.lineCount <= 0) {
      return false;
    }

    this.stream.write(clearSubmittedTtyLines(this.lineCount));
    this.lineCount = 0;
    return true;
  }
}

function renderTtyStatusNotchForComposer(state: TtyStatusComposerState): string {
  const lines = renderTtyStatusNotch(state).split("\n");
  if (lines.length === 0) {
    return "";
  }

  const lastIndex = lines.length - 1;
  lines[lastIndex] = lines[lastIndex].replace(/^╰─ /, "│  ");
  return lines.join("\n");
}

function renderTtyFramedComposerPrompt(state: TtyStatusComposerState): string {
  const width = normalizeWidth(state.width);
  const prompt = renderTtyComposerPrompt(state.renderOptions, state.input);
  return truncateVisible(`╰─ ${prompt}`, width);
}

function formatNotchContext(
  state: ReturnType<typeof getContextState>,
  renderer: TerminalRenderer,
  width: number,
  activityFrame: number | undefined,
): string {
  const meterWidth = width >= SPLIT_PROVIDER_MODEL_WIDTH ? 10 : width >= WIDE_LAYOUT_WIDTH ? 8 : 4;
  return [
    formatHudMeter(
      {
        current: state.approximateBytes,
        total: state.budget.maxBytes,
        width: meterWidth,
      },
      renderer,
      activityFrame,
    ),
    "approx",
  ].join(" ");
}

function formatNotchCost(
  state: SessionCostMeterState,
  renderer: TerminalRenderer,
  width: number,
  activityFrame: number | undefined,
): string {
  const totalTurns = state.costedTurnCount + state.uncostedTurnCount;
  if (totalTurns === 0) {
    return `${colorMoney(formatHudMoney(0), renderer)} observed`;
  }

  const coverage = totalTurns > 0 ? `${state.costedTurnCount}/${totalTurns}` : "n/a";
  const meterWidth = width >= SPLIT_PROVIDER_MODEL_WIDTH ? 6 : 4;
  return [
    formatHudMeter(
      {
        current: totalTurns > 0 ? state.costedTurnCount : undefined,
        total: totalTurns > 0 ? totalTurns : undefined,
        width: meterWidth,
        tone: "success",
      },
      renderer,
      activityFrame,
    ),
    colorMoney(formatHudMoney(state.knownSessionCost), renderer),
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
    `rem ${colorMoney(formatHudMoney(credits.remainingCredits), renderer)}`,
  ].join(" ");
}

function colorMoney(value: string, renderer: TerminalRenderer): string {
  return value === "n/a" ? value : renderer.success(value);
}

function formatHudMoney(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "n/a";
  }

  const absolute = Math.abs(value);
  if (absolute === 0) {
    return "$0.00";
  }

  if (absolute >= 100) {
    return `$${value.toFixed(2)}`;
  }

  if (absolute >= 1) {
    return `$${value.toFixed(2)}`;
  }

  if (absolute >= 0.01) {
    return `$${value.toFixed(4)}`;
  }

  return `$${value.toFixed(6)}`;
}

function formatHudMeter(
  options: Parameters<typeof formatMeter>[0],
  renderer: TerminalRenderer,
  activityFrame: number | undefined,
): string {
  const meter = formatMeter(options, renderer);
  if (activityFrame === undefined) {
    return meter;
  }

  return `${meter} ${renderer.accent(METER_PULSE_FRAMES[normalizePulseFrame(activityFrame)])}`;
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

function formatModelBadges(
  model: string,
  renderer: TerminalRenderer,
  splitProvider: boolean,
): string[] {
  const clean = model
    .replace(ANSI_PATTERN, "")
    .replace(CONTROL_PATTERN, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) {
    return [keyValue("model", "unknown", renderer, "accent")];
  }

  if (clean === "openrouter/auto") {
    return [keyValue("route", "auto", renderer, "accent")];
  }

  if (clean === "openrouter/fusion") {
    return [keyValue("route", "fusion", renderer, "accent")];
  }

  const [provider, ...modelParts] = clean.split("/");
  if (!provider || modelParts.length === 0 || !splitProvider) {
    return [keyValue("model", clean, renderer, "accent")];
  }

  return [
    keyValue("provider", provider, renderer, "accent"),
    keyValue("model", modelParts.join("/"), renderer, "accent"),
  ];
}

function normalizeActivityFrame(frame: number | undefined): number {
  if (typeof frame !== "number" || !Number.isFinite(frame)) {
    return 0;
  }

  return Math.abs(Math.floor(frame)) % ACTIVITY_FRAMES.length;
}

function normalizePulseFrame(frame: number): number {
  if (!Number.isFinite(frame)) {
    return 0;
  }

  return Math.abs(Math.floor(frame)) % METER_PULSE_FRAMES.length;
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

function normalizeLineCount(lineCount: number): number {
  if (typeof lineCount !== "number" || !Number.isFinite(lineCount)) {
    return 1;
  }

  return Math.max(1, Math.floor(lineCount));
}

function isTty(stream: unknown): boolean {
  return Boolean((stream as { isTTY?: boolean } | undefined)?.isTTY);
}
