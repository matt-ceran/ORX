import {
  createTerminalRenderer,
  type TerminalRenderOptions,
  type TerminalRenderer,
} from "./render.js";

export type TerminalUiTone = "accent" | "success" | "warning" | "danger" | "muted";
export type TerminalLayout = "auto" | "plain" | "tty";
export type TerminalBlockBodyKind = "text" | "diff";

export interface TerminalBlockOptions {
  title: string;
  subtitle?: string;
  body?: string | string[];
  footer?: string;
  tone?: TerminalUiTone;
  bodyKind?: TerminalBlockBodyKind;
  width?: number;
  renderOptions?: TerminalRenderOptions;
}

export interface TerminalHeaderOptions {
  title: string;
  subtitle?: string;
  tone?: TerminalUiTone;
  width?: number;
  renderOptions?: TerminalRenderOptions;
}

const DEFAULT_WIDTH = 88;
const MIN_WIDTH = 24;
const MAX_WIDTH = 220;
const ANSI_PATTERN = /\x1B\[[0-?]*[ -/]*[@-~]/g;
const CONTROL_PATTERN = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

export function renderTerminalBlock(options: TerminalBlockOptions): string {
  const width = normalizeWidth(options.width);
  const bodyLines = normalizeBodyLines(options.body);
  const renderer = createTerminalRenderer(options.renderOptions);
  const lines = [renderTerminalHeader(options)];

  if (bodyLines.length === 0) {
    lines.push(`  ${renderer.dim("no output")}`);
  } else {
    for (const line of bodyLines) {
      lines.push(...formatBodyLine(line, width, {
        bodyKind: options.bodyKind ?? "text",
        renderer,
      }));
    }
  }

  const footer = renderTerminalFooter(options.footer, width, options.renderOptions);
  if (footer.length > 0) {
    lines.push(footer);
  }
  return lines.join("\n");
}

export function renderTerminalHeader(options: TerminalHeaderOptions): string {
  const width = normalizeWidth(options.width);
  const renderer = createTerminalRenderer(options.renderOptions);
  const tone = options.tone ?? "accent";
  const bullet = styleTone("•", tone, renderer);
  const title = styleTone(options.title, tone, renderer);
  const subtitle = options.subtitle ? renderer.dim(options.subtitle) : undefined;
  return fitVisible([bullet, title, subtitle].filter(Boolean).join(" "), width);
}

export function renderTerminalFooter(
  footer: string | undefined,
  width?: number,
  renderOptions?: TerminalRenderOptions,
): string {
  if (!footer) {
    return "";
  }

  const renderer = createTerminalRenderer(renderOptions);
  return fitVisible(`  ${renderer.dim(`└ ${footer}`)}`, normalizeWidth(width));
}

export function prefixTerminalBodyLine(line = ""): string {
  return `  ${line}`;
}

export function formatTerminalKeyValues(
  entries: Array<[string, string | undefined]>,
  options: { renderOptions?: TerminalRenderOptions; separator?: string } = {},
): string {
  const renderer = createTerminalRenderer(options.renderOptions);
  return entries
    .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0)
    .map(([key, value]) => `${renderer.dim(key)} ${value}`)
    .join(options.separator ?? "  ");
}

export function sanitizeTerminalText(value: string): string {
  return value.replace(CONTROL_PATTERN, " ");
}

export function stripAnsi(value: string): string {
  return value.replace(ANSI_PATTERN, "");
}

export function visibleWidth(value: string): number {
  return stripAnsi(value).length;
}

export function fitVisible(value: string, width: number): string {
  const normalizedWidth = normalizeWidth(width);
  if (visibleWidth(value) <= normalizedWidth) {
    return value;
  }

  const plain = stripAnsi(value);
  if (normalizedWidth <= 1) {
    return "…";
  }

  return `${plain.slice(0, normalizedWidth - 1)}…`;
}

export function padVisible(value: string, width: number): string {
  const normalizedWidth = Math.max(0, Math.floor(width));
  const current = visibleWidth(value);
  if (current >= normalizedWidth) {
    return value;
  }

  return `${value}${" ".repeat(normalizedWidth - current)}`;
}

export function truncatePlain(value: string, width: number): string {
  const normalizedWidth = Math.max(1, Math.floor(width));
  const clean = sanitizeTerminalText(value).replace(/\s+/g, " ").trim();
  if (clean.length <= normalizedWidth) {
    return clean;
  }

  if (normalizedWidth <= 1) {
    return "…";
  }

  return `${clean.slice(0, normalizedWidth - 1)}…`;
}

export function normalizeTerminalWidth(width: number | undefined): number {
  return normalizeWidth(width);
}

export function shouldUseHumanTtyLayout(
  renderOptions: TerminalRenderOptions | undefined,
  layout: TerminalLayout = "auto",
): boolean {
  if (layout === "tty") {
    return true;
  }
  if (layout === "plain") {
    return false;
  }

  return Boolean((renderOptions?.stream as { isTTY?: boolean } | undefined)?.isTTY);
}

function normalizeBodyLines(body: string | string[] | undefined): string[] {
  if (body === undefined) {
    return [];
  }

  const rawLines = Array.isArray(body) ? body.flatMap((line) => line.split("\n")) : body.split("\n");
  return rawLines.map((line) => sanitizeTerminalText(stripAnsi(line).replace(/\r/g, "")));
}

function formatBodyLine(
  line: string,
  width: number,
  options: {
    bodyKind: TerminalBlockBodyKind;
    renderer: TerminalRenderer;
  },
): string[] {
  const firstPrefix = "  ";
  const continuationPrefix = "  ";
  const firstWidth = Math.max(1, width - visibleWidth(firstPrefix));
  const continuationWidth = Math.max(1, width - visibleWidth(continuationPrefix));
  const styleChunk = resolveBodyLineStyler(line, options.bodyKind, options.renderer);
  if (line.length === 0) {
    return [firstPrefix];
  }

  const formatted: string[] = [];
  let remaining = line;
  let first = true;
  while (remaining.length > (first ? firstWidth : continuationWidth)) {
    const chunkWidth = first ? firstWidth : continuationWidth;
    const breakpoint = findWrapBreakpoint(remaining, chunkWidth);
    const chunk = remaining.slice(0, breakpoint).trimEnd();
    formatted.push(`${first ? firstPrefix : continuationPrefix}${styleChunk(chunk)}`);
    remaining = remaining.slice(breakpoint).trimStart();
    first = false;
  }
  formatted.push(`${first ? firstPrefix : continuationPrefix}${styleChunk(remaining)}`);
  return formatted;
}

function findWrapBreakpoint(value: string, maxWidth: number): number {
  if (value.length <= maxWidth) {
    return value.length;
  }

  const preferred = [" ", "/", "|", ",", "]", ")", ":", "-", "_", "."];
  for (const marker of preferred) {
    const index = value.lastIndexOf(marker, Math.max(0, maxWidth - marker.length));
    if (index >= Math.floor(maxWidth * 0.45)) {
      return index + marker.length;
    }
  }

  return maxWidth;
}

function styleTone(
  value: string,
  tone: TerminalUiTone,
  renderer: TerminalRenderer,
): string {
  switch (tone) {
    case "success":
      return renderer.success(value);
    case "warning":
      return renderer.warning(value);
    case "danger":
      return renderer.danger(value);
    case "muted":
      return renderer.dim(value);
    case "accent":
      return renderer.accent(value);
  }
}

function resolveBodyLineStyler(
  line: string,
  bodyKind: TerminalBlockBodyKind,
  renderer: TerminalRenderer,
): (chunk: string) => string {
  if (bodyKind !== "diff") {
    return (chunk) => chunk;
  }

  if (line.startsWith("+") && !line.startsWith("+++")) {
    return renderer.success;
  }
  if (line.startsWith("-") && !line.startsWith("---")) {
    return renderer.danger;
  }
  if (line.startsWith("@@")) {
    return renderer.warning;
  }
  if (isGitDiffMetadataLine(line)) {
    return renderer.dim;
  }

  return (chunk) => chunk;
}

function isGitDiffMetadataLine(line: string): boolean {
  return (
    line.startsWith("diff --git ") ||
    line.startsWith("index ") ||
    line.startsWith("new file mode ") ||
    line.startsWith("deleted file mode ") ||
    line.startsWith("similarity index ") ||
    line.startsWith("dissimilarity index ") ||
    line.startsWith("rename from ") ||
    line.startsWith("rename to ") ||
    line.startsWith("copy from ") ||
    line.startsWith("copy to ") ||
    line.startsWith("--- ") ||
    line.startsWith("+++ ") ||
    line.startsWith("\\ No newline at end of file")
  );
}

function normalizeWidth(width: number | undefined): number {
  if (typeof width !== "number" || !Number.isFinite(width)) {
    return DEFAULT_WIDTH;
  }

  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.floor(width)));
}
