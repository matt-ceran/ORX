import type { AgentContextState } from "../agent/index.js";
import type { OpenRouterCreditsInfo } from "../openrouter/live.js";
import type { OpenRouterStreamMetadata } from "../openrouter/types.js";
import {
  createTerminalRenderer,
  formatMeter,
  type TerminalRenderOptions,
  type TerminalRenderer,
} from "./render.js";

export interface SessionCostMeterState {
  latestTurnCost?: number;
  knownSessionCost?: number;
  costedTurnCount: number;
  uncostedTurnCount: number;
}

export function createSessionCostMeterState(
  metadata?: OpenRouterStreamMetadata,
): SessionCostMeterState {
  if (!metadata) {
    return emptySessionCostMeterState();
  }

  if (isFiniteNumber(metadata.cost)) {
    return {
      latestTurnCost: metadata.cost,
      knownSessionCost: metadata.cost,
      costedTurnCount: 1,
      uncostedTurnCount: 0,
    };
  }

  return {
    costedTurnCount: 0,
    uncostedTurnCount: 1,
  };
}

export function emptySessionCostMeterState(): SessionCostMeterState {
  return {
    costedTurnCount: 0,
    uncostedTurnCount: 0,
  };
}

export function recordSessionTurnCost(
  state: SessionCostMeterState,
  metadata: OpenRouterStreamMetadata,
): SessionCostMeterState {
  if (!isFiniteNumber(metadata.cost)) {
    return {
      ...state,
      latestTurnCost: undefined,
      uncostedTurnCount: state.uncostedTurnCount + 1,
    };
  }

  return {
    latestTurnCost: metadata.cost,
    knownSessionCost: (state.knownSessionCost ?? 0) + metadata.cost,
    costedTurnCount: state.costedTurnCount + 1,
    uncostedTurnCount: state.uncostedTurnCount,
  };
}

export function formatContextUsageMeter(
  state: AgentContextState,
  renderOptions: TerminalRenderOptions | TerminalRenderer = {},
): string {
  const renderer = asRenderer(renderOptions);
  const meter = formatMeter(
    {
      current: state.approximateBytes,
      total: state.budget.maxBytes,
      width: 12,
    },
    renderer,
  );
  const compacted = state.compactedSummaries > 0 ? "yes" : "no";
  return [
    meter,
    `approx_local_bytes=${state.approximateBytes}B/${state.budget.maxBytes}B`,
    `messages=${state.messageCount}/${state.budget.maxMessages}`,
    `compacted=${compacted}`,
  ].join(" ");
}

export function formatCompactContextUsageMeter(
  state: AgentContextState,
  renderOptions: TerminalRenderOptions | TerminalRenderer = {},
): string {
  const renderer = asRenderer(renderOptions);
  return [
    formatMeter(
      {
        current: state.approximateBytes,
        total: state.budget.maxBytes,
        width: 10,
      },
      renderer,
    ),
    `approx local bytes ${state.approximateBytes}B/${state.budget.maxBytes}B`,
    `messages ${state.messageCount}/${state.budget.maxMessages}`,
  ].join(" ");
}

export function formatSessionCostMeter(
  state: SessionCostMeterState,
  renderOptions: TerminalRenderOptions | TerminalRenderer = {},
): string {
  const renderer = asRenderer(renderOptions);
  const totalTurns = state.costedTurnCount + state.uncostedTurnCount;
  const meter = formatMeter(
    {
      current: totalTurns > 0 ? state.costedTurnCount : undefined,
      total: totalTurns > 0 ? totalTurns : undefined,
      width: 12,
      tone: "success",
    },
    renderer,
  );
  return [
    meter,
    `metadata_coverage=${totalTurns > 0 ? `${state.costedTurnCount}/${totalTurns} turns` : "n/a"}`,
    `latest_turn=${formatMoney(state.latestTurnCost)}`,
    `known_session=${formatMoney(state.knownSessionCost)}`,
    "source=OpenRouter metadata",
  ].join(" ");
}

export function formatCompactSessionCostMeter(
  state: SessionCostMeterState,
  renderOptions: TerminalRenderOptions | TerminalRenderer = {},
): string {
  const renderer = asRenderer(renderOptions);
  const totalTurns = state.costedTurnCount + state.uncostedTurnCount;
  const meter = formatMeter(
    {
      current: totalTurns > 0 ? state.costedTurnCount : undefined,
      total: totalTurns > 0 ? totalTurns : undefined,
      width: 8,
      tone: "success",
    },
    renderer,
  );
  return [
    meter,
    `latest ${formatMoney(state.latestTurnCost)}`,
    `known ${formatMoney(state.knownSessionCost)}`,
  ].join(" ");
}

export function formatCreditsUsageMeter(
  credits: OpenRouterCreditsInfo,
  renderOptions: TerminalRenderOptions | TerminalRenderer = {},
): string {
  const renderer = asRenderer(renderOptions);
  const meter = formatMeter(
    {
      percent: credits.percentUsed,
      current: credits.totalUsage,
      total: credits.totalCredits,
      width: 12,
      decimals: 2,
    },
    renderer,
  );
  return [
    meter,
    `used=${formatMoney(credits.totalUsage)}`,
    `total=${formatMoney(credits.totalCredits)}`,
    `remaining=${formatMoney(credits.remainingCredits)}`,
    "source=OpenRouter credits",
  ].join(" ");
}

export function formatCompactCreditsUsageMeter(
  credits: OpenRouterCreditsInfo,
  renderOptions: TerminalRenderOptions | TerminalRenderer = {},
): string {
  const renderer = asRenderer(renderOptions);
  return [
    formatMeter(
      {
        percent: credits.percentUsed,
        current: credits.totalUsage,
        total: credits.totalCredits,
        width: 8,
        decimals: 1,
      },
      renderer,
    ),
    `remaining ${formatMoney(credits.remainingCredits)}`,
  ].join(" ");
}

export function formatMoney(value: number | undefined): string {
  return isFiniteNumber(value) ? `$${value.toFixed(6)}` : "n/a";
}

function asRenderer(
  value: TerminalRenderOptions | TerminalRenderer,
): TerminalRenderer {
  if ("colorEnabled" in value) {
    return value;
  }

  return createTerminalRenderer(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
