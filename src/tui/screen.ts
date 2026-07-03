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
  gitBranch?: string;
  messages: OpenRouterMessage[];
  contextBudget?: Partial<AgentContextBudget>;
  costMeterState: SessionCostMeterState;
  latestCredits?: OpenRouterCreditsInfo;
  activity?: TtyActivityState;
  input?: TtyInputState;
  queuedInputs?: TtyQueuedInput[];
  width?: number;
  renderOptions?: TerminalRenderOptions;
}

export interface TtyStartupScreenState extends TtyStatusComposerState {
  apiKeyStatus?: string;
}

export interface TtyActivityState {
  kind: "assistant" | "tool";
  label?: string;
  frame?: number;
}

export interface TtyInputState {
  mode: "normal" | "multiline";
}

export interface TtyQueuedInput {
  text: string;
  kind: "message" | "command";
}

const DEFAULT_SCREEN_WIDTH = 80;
const MIN_SCREEN_WIDTH = 20;
const MAX_SCREEN_WIDTH = 220;
const ANSI_PATTERN = /\x1B\[[0-?]*[ -/]*[@-~]/g;
const CONTROL_PATTERN = /[\x00-\x1F\x7F]/g;
const ANSI_RESET = "\x1b[0m";
const BAND_BACKGROUND = "\x1b[48;5;254m";
const BAND_FOREGROUND = "\x1b[38;5;235m";
const BAND_MONO = "\x1b[7m";
const ACTIVITY_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;

/**
 * Visible width of the composer prompt prefix (" › " / " … ").
 * The readline prompt and the composer band must agree on this so the cursor
 * lands exactly after the prefix when the composer repositions it.
 */
export const TTY_PROMPT_PREFIX_WIDTH = 3;

/**
 * Number of real terminal rows the composer renders BELOW the prompt row
 * (the color-coded stats line). Composer clear math offsets by this.
 */
export const TTY_COMPOSER_ROWS_BELOW_PROMPT = 1;

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

/**
 * Renders the bottom composer:
 *
 *   [queued follow-ups]
 *   (blank spacer line)
 *   › input band            ← grey full-width band, readline cursor lives here
 *   model · mode · cwd · …  ← color-coded stats line
 *
 * The string ends with cursor-movement escapes that place the cursor back on
 * the band row directly after the prompt prefix, with the band colors armed
 * so typed characters stay inside the band. The stats line is a real terminal
 * row, so bottom-of-screen scrolling stays correct.
 */
export function renderTtyStatusComposer(state: TtyStatusComposerState): string {
  const width = normalizeWidth(state.width);
  const renderer = createTerminalRenderer(state.renderOptions);
  const input = state.input ?? { mode: "normal" };
  const lines = [
    ...renderQueuedInputLines(state, renderer, width),
    "",
    renderComposerBand(input, renderer, width),
    renderTtyStatusLine(state),
  ];
  const reposition = `\x1b[1A\x1b[${TTY_PROMPT_PREFIX_WIDTH + 1}G${bandOpenCodes(renderer)}`;
  return `${lines.join("\n")}${reposition}`;
}

/**
 * Renders the single color-coded stats line shown below the input band.
 * Also used to restore the stats row after slash suggestions clear.
 */
export function renderTtyStatusLine(state: TtyStatusComposerState): string {
  const width = normalizeWidth(state.width);
  const renderer = createTerminalRenderer(state.renderOptions);
  const showMeters = shouldShowMeterDetails(state);
  const activity = formatActivity(state.activity, renderer);
  const model = renderer.accent(compactModelLabel(state.model));
  const mode = renderer.success(state.mode);
  const cwd = renderer.dim(compactCwd(state.cwd));
  const git = state.gitBranch ? renderer.dim(compactGitBranch(state.gitBranch)) : undefined;
  const perm = renderer.warning(
    `${state.permissions.approvalPolicy}/${state.permissions.sandboxMode}`,
  );
  const session = showMeters ? undefined : renderer.dim(compactSessionId(state.sessionId));
  const ctx = showMeters ? formatContextStat(state, renderer) : undefined;
  const cost = showMeters ? formatCostStat(state.costMeterState, renderer) : undefined;
  const credits = showMeters ? formatCreditsStat(state.latestCredits, renderer) : undefined;

  // Degrade gracefully at narrow widths: drop low-value parts whole, then
  // shorten the cwd, before resorting to per-part ellipsis truncation.
  const assemble = (drop: number, cwdOverride?: string): Array<string | undefined> => [
    activity,
    model,
    mode,
    drop < 3 ? (cwdOverride ?? cwd) : undefined,
    drop < 2 ? git : undefined,
    drop < 4 ? perm : undefined,
    ctx,
    cost,
    credits,
    drop < 1 ? session : undefined,
  ];

  const tryFit = (drop: number, cwdOverride?: string): string | undefined => {
    const parts = assemble(drop, cwdOverride).filter((part): part is string => Boolean(part));
    const line = joinLine("  ", parts, " · ");
    return visibleWidth(line) <= width ? line : undefined;
  };

  for (let drop = 0; drop <= 2; drop += 1) {
    const line = tryFit(drop);
    if (line !== undefined) {
      return line;
    }
  }

  const withoutCwd = assemble(3).filter((part): part is string => Boolean(part));
  const cwdRoom = width - visibleWidth(joinLine("  ", withoutCwd, " · ")) - visibleWidth(" · ");
  if (cwdRoom >= 12) {
    const truncatedCwd = renderer.dim(truncateVisible(compactCwd(state.cwd), cwdRoom));
    const line = tryFit(2, truncatedCwd);
    if (line !== undefined) {
      return line;
    }
  }

  for (let drop = 3; drop <= 4; drop += 1) {
    const line = tryFit(drop);
    if (line !== undefined) {
      return line;
    }
  }

  return fitStatusLine("  ", assemble(4), width, " · ");
}

export function renderTtyFirstScreen(state: TtyStartupScreenState): string {
  return `${renderTtyStartupCard(state)}\n${renderTtyStatusComposer(state)}`;
}

export function renderTtyStartupCard(state: TtyStartupScreenState): string {
  const width = normalizeWidth(state.width);
  const renderer = createTerminalRenderer(state.renderOptions);
  const permissionText = `${state.permissions.approvalPolicy}/${state.permissions.sandboxMode}`;
  const keyStatus = state.apiKeyStatus ?? "unknown";
  const rows = [
    renderCardGridRow(
      { label: "model", value: compactModelLabel(state.model), tone: "accent" },
      { label: "mode", value: state.mode, tone: "success" },
      renderer,
      width,
    ),
    renderCardGridRow(
      { label: "cwd", value: compactCwd(state.cwd) },
      { label: "perm", value: permissionText, tone: "warning" },
      renderer,
      width,
    ),
    renderCardGridRow(
      { label: "key", value: keyStatus, tone: keyStatus.startsWith("yes") ? "success" : "warning" },
      { label: "session", value: compactSessionId(state.sessionId) },
      renderer,
      width,
    ),
  ];

  return [
    ` ${renderer.bold(renderer.accent("ORX"))}  ${renderer.dim("OpenRouter-native coding workbench")}`,
    "",
    ...rows,
    "",
    fitStatusLine(
      "  ",
      [
        renderer.dim("/help commands"),
        renderer.dim("Ctrl+G editor"),
        renderer.dim("Ctrl+O copy"),
        renderer.dim("Ctrl+R history"),
        renderer.dim("Ctrl+L clear"),
      ],
      width,
      renderer.dim(" · "),
    ),
  ].join("\n");
}

/**
 * Returns the readline prompt string for TTY mode. It carries the band colors
 * (no trailing reset) so readline refreshes repaint the band and typed
 * characters inherit it. Its visible width must equal TTY_PROMPT_PREFIX_WIDTH.
 */
export function renderTtyReadlinePrompt(
  renderOptions: TerminalRenderOptions = {},
  input: TtyInputState = { mode: "normal" },
): string {
  const renderer = createTerminalRenderer(renderOptions);
  const marker = input.mode === "multiline" ? "…" : "›";
  return `${bandOpenCodes(renderer)} ${marker} `;
}

export function renderPlainComposerPrompt(): string {
  return "orx> ";
}

export function renderPlainContinuationPrompt(): string {
  return "...> ";
}

/**
 * Renders a user message as grey band rows for the transcript scrollback,
 * mirroring the composer band the message was typed into.
 */
export function renderTtyUserBand(
  text: string,
  renderOptions: TerminalRenderOptions = {},
  width = DEFAULT_SCREEN_WIDTH,
): string {
  const renderer = createTerminalRenderer(renderOptions);
  const normalized = normalizeWidth(width);
  const contentWidth = Math.max(1, normalized - TTY_PROMPT_PREFIX_WIDTH);
  const rows: string[] = [];
  const sourceLines = text.replace(/\r/g, "").split("\n");

  for (const sourceLine of sourceLines) {
    const clean = sourceLine.replace(ANSI_PATTERN, "").replace(CONTROL_PATTERN, " ");
    let remaining = clean;
    do {
      rows.push(remaining.slice(0, contentWidth));
      remaining = remaining.slice(contentWidth);
    } while (remaining.length > 0);
  }

  return rows
    .map((row, index) => {
      const marker = index === 0 ? "›" : " ";
      const content = ` ${marker} ${row}`;
      if (!renderer.colorEnabled) {
        return content.trimEnd();
      }
      return `${bandOpenCodes(renderer)}${padPlain(content, normalized)}${ANSI_RESET}`;
    })
    .join("\n");
}

/**
 * Renders a compact dimmed suggestion line for slash command autocomplete.
 * Shows up to `maxLines` lines, fitting as many suggestions as possible per
 * line. Returns an empty string when there are no suggestions.
 */
export function renderTtyCommandSuggestions(
  suggestions: string[],
  renderOptions: TerminalRenderOptions = {},
  width = DEFAULT_SCREEN_WIDTH,
  maxLines = 1,
): string {
  if (suggestions.length === 0) {
    return "";
  }
  const renderer = createTerminalRenderer(renderOptions);
  const normalized = normalizeWidth(width);
  const prefix = `  ${renderer.dim("try")} `;
  const prefixWidth = visibleWidth(prefix);
  const sep = "  ";
  const sepWidth = visibleWidth(sep);

  const lines: string[] = [];
  let currentParts: string[] = [];
  let currentWidth = prefixWidth;

  for (const suggestion of suggestions) {
    const partWidth = visibleWidth(suggestion);
    const needed = currentParts.length > 0 ? sepWidth + partWidth : partWidth;
    if (currentWidth + needed > normalized && currentParts.length > 0) {
      lines.push(`${prefix}${currentParts.join(sep)}`);
      currentParts = [];
      currentWidth = prefixWidth;
      if (lines.length >= maxLines) {
        break;
      }
      currentParts.push(suggestion);
      currentWidth = prefixWidth + partWidth;
    } else {
      currentParts.push(suggestion);
      currentWidth += needed;
    }
  }
  if (currentParts.length > 0 && lines.length < maxLines) {
    lines.push(`${prefix}${currentParts.join(sep)}`);
  }
  if (lines.length === 0) {
    return "";
  }
  return lines.join("\n");
}

/**
 * The SGR codes that arm the input-band colors (empty when color is off).
 * Exposed so chat.ts can sanitize readline's clear-screen-down writes, which
 * would otherwise flood the screen below the prompt with the band background.
 */
export function ttyBandOpenCodes(renderOptions: TerminalRenderOptions = {}): string {
  return bandOpenCodes(createTerminalRenderer(renderOptions));
}

function renderComposerBand(
  input: TtyInputState,
  renderer: TerminalRenderer,
  width: number,
): string {
  const marker = input.mode === "multiline" ? "…" : "›";
  const prefix = ` ${marker} `;
  if (!renderer.colorEnabled) {
    return prefix;
  }

  return `${bandOpenCodes(renderer)}${padPlain(prefix, width)}${ANSI_RESET}`;
}

function bandOpenCodes(renderer: TerminalRenderer): string {
  if (!renderer.colorEnabled) {
    return "";
  }

  return renderer.theme === "mono" ? BAND_MONO : `${BAND_BACKGROUND}${BAND_FOREGROUND}`;
}

function renderQueuedInputLines(
  state: TtyStatusComposerState,
  renderer: TerminalRenderer,
  width: number,
): string[] {
  const queued = state.queuedInputs?.filter((entry) => entry.text.trim().length > 0) ?? [];
  if (queued.length === 0) {
    return [];
  }

  const visible = queued.slice(-3);
  const hiddenCount = Math.max(0, queued.length - visible.length);
  const heading = hiddenCount > 0
    ? `queued (showing ${visible.length} of ${queued.length}) · runs after current turn`
    : `queued (${queued.length}) · runs after current turn`;
  const lines = [fitStatusLine("  ", [renderer.dim(heading)], width, " ")];
  for (const [index, entry] of visible.entries()) {
    const marker = entry.kind === "command" ? "/" : "›";
    lines.push(
      fitStatusLine(
        "  ",
        [renderer.dim(`${hiddenCount + index + 1} ${marker}`), compactQueuedInput(entry.text, width)],
        width,
        " ",
      ),
    );
  }
  return lines;
}

function shouldShowMeterDetails(state: TtyStatusComposerState): boolean {
  return Boolean(
    state.activity ||
      state.messages.length > 0 ||
      state.latestCredits ||
      state.costMeterState.knownSessionCost !== undefined ||
      state.costMeterState.latestTurnCost !== undefined ||
      state.costMeterState.costedTurnCount > 0 ||
      state.costMeterState.uncostedTurnCount > 0,
  );
}

function formatContextStat(
  state: TtyStatusComposerState,
  renderer: TerminalRenderer,
): string | undefined {
  const contextState = getContextState(state.messages, state.contextBudget);
  if (contextState.budget.maxBytes <= 0) {
    return undefined;
  }

  const percent = Math.min(
    100,
    Math.max(0, (contextState.approximateBytes / contextState.budget.maxBytes) * 100),
  );
  const text = `ctx ${formatPercent(percent)}`;
  if (percent >= 90) {
    return renderer.danger(text);
  }
  if (percent >= 75) {
    return renderer.warning(text);
  }
  return renderer.success(text);
}

function formatCostStat(
  state: SessionCostMeterState,
  renderer: TerminalRenderer,
): string | undefined {
  if (state.knownSessionCost === undefined) {
    return undefined;
  }

  return renderer.success(formatMoney(state.knownSessionCost));
}

function formatCreditsStat(
  credits: OpenRouterCreditsInfo | undefined,
  renderer: TerminalRenderer,
): string | undefined {
  if (!credits) {
    return undefined;
  }

  return `${renderer.dim("bal")} ${renderer.success(formatMoney(credits.remainingCredits))}`;
}

function formatPercent(percent: number): string {
  if (percent > 0 && percent < 1) {
    return "<1%";
  }

  return `${Math.round(percent)}%`;
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
  return `${renderer.accent(frame)} ${label}`;
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

function compactQueuedInput(text: string, width: number): string {
  const budget = Math.max(12, width - 10);
  const clean = text
    .replace(ANSI_PATTERN, "")
    .replace(CONTROL_PATTERN, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length <= budget) {
    return clean;
  }
  return `${clean.slice(0, budget - 1)}…`;
}

function compactModelLabel(model: string): string {
  return model
    .replace(ANSI_PATTERN, "")
    .replace(CONTROL_PATTERN, " ")
    .replace(/\s+/g, " ")
    .trim() || "unknown";
}

function normalizeActivityFrame(frame: number | undefined): number {
  if (typeof frame !== "number" || !Number.isFinite(frame)) {
    return 0;
  }

  return Math.abs(Math.floor(frame)) % ACTIVITY_FRAMES.length;
}

type CardTone = "accent" | "success" | "warning" | "dim";

interface CardCell {
  label: string;
  value: string;
  tone?: CardTone;
}

const CARD_LABEL_COL = 9;

function renderCardGridRow(
  left: CardCell,
  right: CardCell,
  renderer: TerminalRenderer,
  width: number,
): string {
  const prefix = "  ";
  const sep = "  ";
  const leftLabel = renderer.dim(padLabel(left.label, CARD_LABEL_COL));
  const rightLabel = renderer.dim(padLabel(right.label, CARD_LABEL_COL));
  const fixedWidth =
    visibleWidth(prefix) + CARD_LABEL_COL + visibleWidth(sep) + CARD_LABEL_COL;
  const minTwoCol = fixedWidth + 2;

  if (width <= minTwoCol) {
    return renderSingleCardRow(left, renderer, prefix, width);
  }

  const avail = width - fixedWidth;
  const leftPlain = sanitizeValue(left.value);
  const rightPlain = sanitizeValue(right.value);
  let leftBudget: number;
  let rightBudget: number;

  if (leftPlain.length + rightPlain.length <= avail) {
    leftBudget = leftPlain.length;
    rightBudget = rightPlain.length;
  } else {
    const total = leftPlain.length + rightPlain.length;
    leftBudget = Math.max(1, Math.floor((avail * leftPlain.length) / Math.max(1, total)));
    rightBudget = Math.max(1, avail - leftBudget);
    if (leftPlain.length <= leftBudget) {
      rightBudget = avail - leftPlain.length;
    } else if (rightPlain.length <= rightBudget) {
      leftBudget = avail - rightPlain.length;
    }
  }

  const leftValue = applyTone(truncateVisible(leftPlain, leftBudget), left.tone, renderer);
  const rightValue = applyTone(truncateVisible(rightPlain, rightBudget), right.tone, renderer);
  const leftColumnWidth = Math.max(
    leftBudget,
    Math.min(Math.floor(avail / 2), avail - rightBudget),
  );
  return `${prefix}${leftLabel}${padVisiblePart(leftValue, leftColumnWidth)}${sep}${rightLabel}${rightValue}`;
}

function renderSingleCardRow(
  cell: CardCell,
  renderer: TerminalRenderer,
  prefix: string,
  width: number,
): string {
  const label = renderer.dim(padLabel(cell.label, CARD_LABEL_COL));
  const valueBudget = Math.max(0, width - visibleWidth(prefix) - CARD_LABEL_COL);
  const value = applyTone(truncateVisible(sanitizeValue(cell.value), valueBudget), cell.tone, renderer);
  return `${prefix}${label}${value}`;
}

function padLabel(label: string, width: number): string {
  return label.length >= width ? label : `${label}${" ".repeat(width - label.length)}`;
}

function padPlain(value: string, width: number): string {
  const visible = visibleWidth(value);
  if (visible >= width) {
    return value;
  }

  return `${value}${" ".repeat(width - visible)}`;
}

function padVisiblePart(value: string, width: number): string {
  return padPlain(value, width);
}

function applyTone(
  value: string,
  tone: CardTone | undefined,
  renderer: TerminalRenderer,
): string {
  if (!tone || value.length === 0) {
    return value;
  }
  if (tone === "accent") {
    return renderer.accent(value);
  }
  if (tone === "success") {
    return renderer.success(value);
  }
  if (tone === "warning") {
    return renderer.warning(value);
  }
  return renderer.dim(value);
}

function sanitizeValue(value: string): string {
  return value
    .replace(ANSI_PATTERN, "")
    .replace(CONTROL_PATTERN, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fitStatusLine(
  prefix: string,
  parts: Array<string | undefined>,
  width: number,
  separator = "  ",
): string {
  const filtered = parts.filter((part): part is string => Boolean(part));
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

function compactGitBranch(branch: string): string {
  return branch
    .replace(ANSI_PATTERN, "")
    .replace(CONTROL_PATTERN, " ")
    .replace(/\s+/g, " ")
    .trim();
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
