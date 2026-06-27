import {
  DEFAULT_THEME,
  TERMINAL_THEMES,
} from "../constants.js";
import type { OrxTheme } from "../config/types.js";

export interface TerminalRenderOptions {
  stream?: unknown;
  env?: Partial<Pick<NodeJS.ProcessEnv, "NO_COLOR" | "ORX_THEME" | "ORX_TTY_THEME">>;
  color?: boolean;
  theme?: OrxTheme;
}

export interface TerminalRenderer {
  colorEnabled: boolean;
  theme: OrxTheme;
  style: (text: string, style: TerminalStyle) => string;
  bold: (text: string) => string;
  dim: (text: string) => string;
  success: (text: string) => string;
  warning: (text: string) => string;
  danger: (text: string) => string;
  accent: (text: string) => string;
}

export type TerminalStyle = "bold" | "dim" | "green" | "yellow" | "red" | "cyan";
export type MeterTone = "success" | "warning" | "danger" | "muted" | "auto";

export interface MeterOptions {
  current?: number;
  total?: number;
  percent?: number;
  width?: number;
  decimals?: number;
  tone?: MeterTone;
}

const DEFAULT_ANSI_CODES: Record<TerminalStyle, string> = {
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
};
const THEME_ANSI_CODES: Record<OrxTheme, Record<TerminalStyle, string>> = {
  default: DEFAULT_ANSI_CODES,
  mono: {
    bold: "\x1b[1m",
    dim: "\x1b[2m",
    green: "\x1b[1m",
    yellow: "\x1b[1m",
    red: "\x1b[1m",
    cyan: "\x1b[1m",
  },
  vivid: {
    bold: "\x1b[1m",
    dim: "\x1b[2m",
    green: "\x1b[92m",
    yellow: "\x1b[93m",
    red: "\x1b[91m",
    cyan: "\x1b[96m",
  },
};

const ANSI_RESET = "\x1b[0m";
const DEFAULT_METER_WIDTH = 12;

export function createTerminalRenderer(
  options: TerminalRenderOptions = {},
): TerminalRenderer {
  const colorEnabled = shouldUseAnsiColor(options);
  const theme = resolveTerminalTheme(options);
  const codes = THEME_ANSI_CODES[theme];

  function style(text: string, terminalStyle: TerminalStyle): string {
    if (!colorEnabled || text.length === 0) {
      return text;
    }

    return `${codes[terminalStyle]}${text}${ANSI_RESET}`;
  }

  return {
    colorEnabled,
    theme,
    style,
    bold: (text) => style(text, "bold"),
    dim: (text) => style(text, "dim"),
    success: (text) => style(text, "green"),
    warning: (text) => style(text, "yellow"),
    danger: (text) => style(text, "red"),
    accent: (text) => style(text, "cyan"),
  };
}

export function resolveTerminalTheme(options: TerminalRenderOptions = {}): OrxTheme {
  const env = options.env ?? process.env;
  return normalizeTheme(options.theme ?? env.ORX_TTY_THEME ?? env.ORX_THEME);
}

export function shouldUseAnsiColor(options: TerminalRenderOptions = {}): boolean {
  if (options.color !== undefined) {
    return options.color;
  }

  const env = options.env ?? process.env;
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== "") {
    return false;
  }

  return Boolean((options.stream as { isTTY?: boolean } | undefined)?.isTTY);
}

export function formatMeter(
  options: MeterOptions,
  renderer: TerminalRenderer = createTerminalRenderer(),
): string {
  const width = normalizeMeterWidth(options.width);
  const percent = resolvePercent(options);
  if (percent === undefined) {
    return renderer.dim(`[${"-".repeat(width)}] n/a`);
  }

  const clampedPercent = clamp(percent, 0, 100);
  const filled = Math.round((clampedPercent / 100) * width);
  const bar = `[${"#".repeat(filled)}${"-".repeat(width - filled)}]`;
  const text = `${bar} ${clampedPercent.toFixed(options.decimals ?? 1)}%`;
  return styleMeter(text, clampedPercent, options.tone ?? "auto", renderer);
}

function styleMeter(
  text: string,
  percent: number,
  tone: MeterTone,
  renderer: TerminalRenderer,
): string {
  const resolvedTone = tone === "auto" ? autoTone(percent) : tone;
  switch (resolvedTone) {
    case "success":
      return renderer.success(text);
    case "warning":
      return renderer.warning(text);
    case "danger":
      return renderer.danger(text);
    case "muted":
      return renderer.dim(text);
  }
}

function autoTone(percent: number): Exclude<MeterTone, "auto"> {
  if (percent >= 90) {
    return "danger";
  }

  if (percent >= 75) {
    return "warning";
  }

  return "success";
}

function resolvePercent(options: MeterOptions): number | undefined {
  if (isFiniteNumber(options.percent)) {
    return options.percent;
  }

  if (
    isFiniteNumber(options.current) &&
    isFiniteNumber(options.total) &&
    options.total > 0
  ) {
    return (options.current / options.total) * 100;
  }

  return undefined;
}

function normalizeMeterWidth(value: number | undefined): number {
  if (!isFiniteNumber(value)) {
    return DEFAULT_METER_WIDTH;
  }

  return Math.max(4, Math.min(40, Math.round(value)));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeTheme(value: unknown): OrxTheme {
  if (typeof value !== "string") {
    return DEFAULT_THEME;
  }

  const normalized = value.trim().toLowerCase();
  return (TERMINAL_THEMES as readonly string[]).includes(normalized)
    ? (normalized as OrxTheme)
    : DEFAULT_THEME;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
