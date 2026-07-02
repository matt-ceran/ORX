import type { OpenRouterStreamMetadata } from "./types.js";
import {
  createTerminalRenderer,
  type TerminalRenderOptions,
  type TerminalRenderer,
} from "../terminal/render.js";

const ANSI_PATTERN = /\x1B\[[0-?]*[ -/]*[@-~]/g;
const TERMINAL_CONTROL_PATTERN = /[\x00-\x1F\x7F-\x9F]/g;
const BEARER_PATTERN = /\bbearer\s+[a-z0-9._~+/=-]+/gi;
const API_KEY_LIKE_PATTERN = /\bsk-or-v\d+-[a-z0-9._-]+\b/gi;
const PROVIDER_TOKEN_PATTERN =
  /\b(?:github_pat_[A-Za-z0-9_]+|ghp_[A-Za-z0-9_]+|glpat-[A-Za-z0-9_-]+|xox[baprs]-[A-Za-z0-9-]+)\b/g;
const SENSITIVE_ASSIGNMENT_PATTERN =
  /\b(api[_-]?key|access[_-]?token|auth[_-]?token|secret[_-]?token|token|secret|password|passwd|key)(\s*[:=]\s*)([a-z0-9._~+/=-]{4,})/gi;

export function formatOpenRouterMetadata(metadata: OpenRouterStreamMetadata): string {
  const lines = ["", "metadata:"];
  lines.push(`  requested_model: ${metadata.requestedModel}`);

  if (metadata.resolvedModel) {
    lines.push(`  resolved_model: ${metadata.resolvedModel}`);
  }

  if (metadata.generationId) {
    lines.push(`  generation_id: ${metadata.generationId}`);
  }

  const tokenParts = [
    formatTokenPart("prompt", metadata.promptTokens),
    formatTokenPart("completion", metadata.completionTokens),
    formatTokenPart("total", metadata.totalTokens),
    formatTokenPart("reasoning", metadata.reasoningTokens),
  ].filter((part): part is string => Boolean(part));

  if (tokenParts.length > 0) {
    lines.push(`  tokens: ${tokenParts.join(", ")}`);
  }

  if (metadata.cost !== undefined) {
    lines.push(`  cost: ${formatCost(metadata.cost)}`);
  }

  return lines.join("\n");
}

export interface CompactOpenRouterMetadataOptions extends TerminalRenderOptions {
  maxWidth?: number;
}

export function formatCompactOpenRouterMetadata(
  metadata: OpenRouterStreamMetadata,
  options: CompactOpenRouterMetadataOptions = {},
): string {
  const renderer = createTerminalRenderer(options);
  const model = sanitizeCompactValue(metadata.resolvedModel ?? metadata.requestedModel);
  const parts = [
    renderer.dim("meta"),
    metadata.resolvedModel && metadata.resolvedModel !== metadata.requestedModel
      ? keyValue("model", model, renderer)
      : keyValue("route", model, renderer),
    formatCompactTokens(metadata, renderer),
    metadata.cost === undefined
      ? undefined
      : `${renderer.dim("cost")} ${renderer.success(formatCost(metadata.cost))}`,
    metadata.generationId
      ? keyValue("gen", compactGenerationId(metadata.generationId), renderer)
      : undefined,
  ].filter((part): part is string => Boolean(part));

  return truncateVisible(parts.join("  "), options.maxWidth);
}

function formatTokenPart(label: string, value: number | undefined): string | undefined {
  return value === undefined ? undefined : `${label}=${value}`;
}

function formatCompactTokens(
  metadata: OpenRouterStreamMetadata,
  renderer: TerminalRenderer,
): string | undefined {
  if (metadata.totalTokens !== undefined) {
    return `${renderer.dim("tokens")} ${metadata.totalTokens}`;
  }

  const tokenParts = [
    formatTokenPart("prompt", metadata.promptTokens),
    formatTokenPart("completion", metadata.completionTokens),
  ].filter((part): part is string => Boolean(part));

  return tokenParts.length > 0
    ? `${renderer.dim("tokens")} ${tokenParts.join(",")}`
    : undefined;
}

function keyValue(key: string, value: string, renderer: TerminalRenderer): string {
  return `${renderer.dim(key)} ${value}`;
}

function compactGenerationId(value: string): string {
  const sanitized = sanitizeCompactValue(value);
  return sanitized.length > 18 ? `${sanitized.slice(0, 17)}…` : sanitized;
}

function sanitizeCompactValue(value: string): string {
  const withoutControls = stripAnsi(value).replace(TERMINAL_CONTROL_PATTERN, " ");
  const redacted = withoutControls
    .replace(SENSITIVE_ASSIGNMENT_PATTERN, "$1$2[redacted]")
    .replace(BEARER_PATTERN, "Bearer [redacted]")
    .replace(API_KEY_LIKE_PATTERN, "[redacted]")
    .replace(PROVIDER_TOKEN_PATTERN, "[redacted]")
    .replace(/\s+/g, " ")
    .trim();

  return redacted.length > 0 ? redacted : "[redacted]";
}

function truncateVisible(value: string, maxWidth: number | undefined): string {
  if (typeof maxWidth !== "number" || !Number.isFinite(maxWidth) || maxWidth <= 0) {
    return value;
  }

  const plain = stripAnsi(value);
  if (plain.length <= maxWidth) {
    return value;
  }

  if (maxWidth === 1) {
    return "…";
  }

  return `${plain.slice(0, maxWidth - 1)}…`;
}

function stripAnsi(value: string): string {
  return value.replace(ANSI_PATTERN, "");
}

function formatCost(value: number): string {
  if (value === 0) {
    return "$0";
  }

  if (Math.abs(value) < 0.01) {
    return `$${value.toFixed(6)}`;
  }

  return `$${value.toFixed(4)}`;
}
