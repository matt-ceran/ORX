import type { OpenRouterStreamMetadata } from "./types.js";

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

function formatTokenPart(label: string, value: number | undefined): string | undefined {
  return value === undefined ? undefined : `${label}=${value}`;
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
