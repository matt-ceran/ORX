import {
  formatToolArguments,
  formatToolDuration,
  formatToolResultDetails,
} from "../agent/tool-summaries.js";
import type { ToolDispatchResult } from "../agent/tool-dispatch.js";
import type { OpenRouterToolCall } from "../openrouter/types.js";
import {
  createTerminalRenderer,
  type TerminalRenderOptions,
  type TerminalRenderer,
} from "../terminal/render.js";

export interface TtyTranscriptRenderOptions extends TerminalRenderOptions {
  maxWidth?: number;
  maxStringLength?: number;
  maxListItems?: number;
}

const DEFAULT_TRANSCRIPT_WIDTH = 80;
const MIN_TRANSCRIPT_WIDTH = 28;
const ANSI_PATTERN = /\x1B\[[0-?]*[ -/]*[@-~]/g;
const CONTROL_PATTERN = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;
const DETAIL_SEPARATOR = "  ";

export function renderTtyUserTranscript(
  input: string,
  options: TtyTranscriptRenderOptions = {},
): string {
  const renderer = createTerminalRenderer(options);
  const width = normalizeWidth(options.maxWidth);
  const body = indentTranscriptBody(input, "  ", width);
  return ["", renderer.accent("user"), body].join("\n");
}

export function renderTtyAssistantTranscriptPrefix(
  options: TtyTranscriptRenderOptions = {},
): string {
  const renderer = createTerminalRenderer(options);
  return `\n${renderer.accent("assistant")}\n  `;
}

export function sanitizeTtyTranscriptChunk(text: string): string {
  return sanitizeTranscriptText(text, { trimLineEnd: false });
}

export function renderTtyToolCallBlock(
  toolCall: OpenRouterToolCall,
  options: TtyTranscriptRenderOptions = {},
): string {
  const renderer = createTerminalRenderer(options);
  const width = normalizeWidth(options.maxWidth);
  const name = sanitizeInline(toolCall.function.name) || "unknown";
  const argumentSummary = sanitizeInline(formatToolArguments(toolCall, options));
  const lines = [
    fitRenderedLine(`${renderer.dim("╭─")} ${renderer.accent("tool")} ${renderer.bold(name)}`, width),
  ];

  if (argumentSummary) {
    lines.push(renderDetailLine("args", argumentSummary, renderer, width));
  }

  lines.push(fitRenderedLine(`${renderer.dim("╰─")} ${renderer.dim("started")}`, width));
  return lines.join("\n");
}

export function renderTtyToolResultBlock(
  result: ToolDispatchResult,
  options: TtyTranscriptRenderOptions = {},
): string {
  const renderer = createTerminalRenderer(options);
  const width = normalizeWidth(options.maxWidth);
  const name = sanitizeInline(result.toolCall.function.name) || "unknown";
  const status = result.ok ? renderer.success("ok") : renderer.danger("failed");
  const details = formatToolResultDetails(result, options)
    .map(sanitizeInline)
    .filter((detail) => detail.length > 0);
  const lines = [
    fitRenderedLine(
      `${renderer.dim("╭─")} ${renderer.accent("tool")} ${renderer.bold(name)} ${status} ${renderer.dim(formatToolDuration(result.durationMs))}`,
      width,
    ),
  ];

  if (details.length > 0) {
    lines.push(renderDetailLine("details", details.join(DETAIL_SEPARATOR), renderer, width));
  }

  lines.push(fitRenderedLine(`${renderer.dim("╰─")} ${renderer.dim("done")}`, width));
  return lines.join("\n");
}

function renderDetailLine(
  label: string,
  detail: string,
  renderer: TerminalRenderer,
  width: number,
): string {
  return fitRenderedLine(
    `${renderer.dim("│")}  ${renderer.dim(label)} ${renderer.dim(detail)}`,
    width,
  );
}

function indentTranscriptBody(input: string, indent: string, width: number): string {
  const bodyWidth = Math.max(8, width - visibleWidth(indent));
  const sanitized = sanitizeTranscriptText(input, { trimLineEnd: true });
  const lines = sanitized.split("\n");
  return lines
    .map((line) => `${indent}${truncatePlain(line.length > 0 ? line : " ", bodyWidth)}`)
    .join("\n");
}

function sanitizeTranscriptText(
  text: string,
  options: { trimLineEnd: boolean },
): string {
  const sanitized = text
    .replace(ANSI_PATTERN, "")
    .replace(/\r\n|\r/g, "\n")
    .replace(CONTROL_PATTERN, " ");
  return options.trimLineEnd ? sanitized.replace(/[ \t]+$/gm, "") : sanitized;
}

function sanitizeInline(text: string): string {
  return sanitizeTranscriptText(text, { trimLineEnd: true }).replace(/\s+/g, " ").trim();
}

function fitRenderedLine(line: string, width: number): string {
  if (visibleWidth(line) <= width) {
    return line;
  }

  return truncatePlain(stripAnsi(line), width);
}

function truncatePlain(value: string, width: number): string {
  if (width <= 1) {
    return "…".slice(0, width);
  }

  if (visibleWidth(value) <= width) {
    return value;
  }

  return `${value.slice(0, Math.max(0, width - 1))}…`;
}

function normalizeWidth(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_TRANSCRIPT_WIDTH;
  }

  return Math.max(MIN_TRANSCRIPT_WIDTH, Math.floor(value));
}

function visibleWidth(value: string): number {
  return stripAnsi(value).length;
}

function stripAnsi(value: string): string {
  return value.replace(ANSI_PATTERN, "");
}
