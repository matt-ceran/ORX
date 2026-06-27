import { OPENROUTER_API_BASE } from "./client.js";
import { formatCreditsUsageMeter } from "../terminal/meters.js";
import type { TerminalRenderOptions, TerminalRenderer } from "../terminal/render.js";

export interface OpenRouterLiveOptions {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  signal?: AbortSignal;
}

export interface OpenRouterModelPricing {
  prompt?: string;
  completion?: string;
  image?: string;
  request?: string;
}

export interface OpenRouterModelInfo {
  id: string;
  name?: string;
  contextLength?: number;
  pricing?: OpenRouterModelPricing;
}

export interface OpenRouterCreditsInfo {
  totalCredits?: number;
  totalUsage?: number;
  remainingCredits?: number;
  percentUsed?: number;
}

export interface OpenRouterGenerationInfo {
  id?: string;
  model?: string;
  provider?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
  cost?: number;
  createdAt?: string;
}

export class OpenRouterLiveApiError extends Error {
  readonly status: number;
  readonly body?: string;
  readonly managementPermissionLikelyRequired: boolean;

  constructor(
    status: number,
    message: string,
    options: { body?: string; managementPermissionLikelyRequired?: boolean } = {},
  ) {
    super(message);
    this.name = "OpenRouterLiveApiError";
    this.status = status;
    this.body = options.body;
    this.managementPermissionLikelyRequired = Boolean(options.managementPermissionLikelyRequired);
  }
}

export async function listOpenRouterModels(
  options: OpenRouterLiveOptions,
): Promise<OpenRouterModelInfo[]> {
  const raw = await requestJson(options, "/models");
  const root = asRecord(raw);
  const data = Array.isArray(root?.data) ? root.data : [];

  return data.flatMap((item) => {
    const record = asRecord(item);
    const id = stringFromUnknown(record?.id);
    if (!id) {
      return [];
    }

    const architecture = asRecord(record?.architecture);
    const topProvider = asRecord(record?.top_provider);
    return [
      {
        id,
        name: stringFromUnknown(record?.name),
        contextLength:
          numberFromUnknown(record?.context_length) ??
          numberFromUnknown(record?.contextLength) ??
          numberFromUnknown(topProvider?.context_length) ??
          numberFromUnknown(architecture?.context_length),
        pricing: extractPricing(record?.pricing),
      },
    ];
  });
}

export async function getOpenRouterCredits(
  options: OpenRouterLiveOptions,
): Promise<OpenRouterCreditsInfo> {
  const raw = await requestJson(options, "/credits", { managementPermissionLikelyRequired: true });
  const data = asRecord(asRecord(raw)?.data);
  if (!data) {
    return {};
  }

  const totalCredits =
    numberFromUnknown(data.total_credits) ??
    numberFromUnknown(data.totalCredits) ??
    numberFromUnknown(data.total);
  const totalUsage =
    numberFromUnknown(data.total_usage) ??
    numberFromUnknown(data.totalUsage) ??
    numberFromUnknown(data.used) ??
    numberFromUnknown(data.usedCredits);
  const remainingCredits =
    numberFromUnknown(data.remaining_credits) ??
    numberFromUnknown(data.remainingCredits) ??
    numberFromUnknown(data.remaining) ??
    (totalCredits !== undefined && totalUsage !== undefined ? totalCredits - totalUsage : undefined);
  const percentUsed =
    numberFromUnknown(data.percent_used) ??
    numberFromUnknown(data.percentUsed) ??
    numberFromUnknown(data.usage_percent) ??
    (totalCredits !== undefined && totalUsage !== undefined && totalCredits > 0
      ? (totalUsage / totalCredits) * 100
      : undefined);

  return {
    totalCredits,
    totalUsage,
    remainingCredits,
    percentUsed,
  };
}

export async function getOpenRouterGeneration(
  options: OpenRouterLiveOptions & { generationId: string },
): Promise<OpenRouterGenerationInfo> {
  const raw = await requestJson(options, `/generation?id=${encodeURIComponent(options.generationId)}`);
  const data = asRecord(asRecord(raw)?.data) ?? asRecord(raw);
  if (!data) {
    return {};
  }

  return definedOnly({
    id: stringFromUnknown(data.id) ?? options.generationId,
    model: stringFromUnknown(data.model),
    provider:
      stringFromUnknown(data.provider_name) ??
      stringFromUnknown(data.provider) ??
      stringFromUnknown(asRecord(data.provider)?.name),
    promptTokens:
      numberFromUnknown(data.tokens_prompt) ??
      numberFromUnknown(data.prompt_tokens) ??
      numberFromUnknown(data.native_tokens_prompt),
    completionTokens:
      numberFromUnknown(data.tokens_completion) ??
      numberFromUnknown(data.completion_tokens) ??
      numberFromUnknown(data.native_tokens_completion),
    totalTokens:
      numberFromUnknown(data.total_tokens) ??
      sumOptional(
        numberFromUnknown(data.tokens_prompt) ?? numberFromUnknown(data.prompt_tokens),
        numberFromUnknown(data.tokens_completion) ?? numberFromUnknown(data.completion_tokens),
      ),
    reasoningTokens:
      numberFromUnknown(data.native_tokens_reasoning) ??
      numberFromUnknown(data.reasoning_tokens),
    cost: numberFromUnknown(data.total_cost) ?? numberFromUnknown(data.cost),
    createdAt:
      stringFromUnknown(data.created_at) ??
      stringFromUnknown(data.createdAt) ??
      stringFromUnknown(data.created),
  });
}

export function formatOpenRouterModels(models: OpenRouterModelInfo[], query?: string): string {
  const filtered = filterModels(models, query);
  const rendered = filtered.slice(0, 20);
  const lines = [
    `OpenRouter models${query ? ` matching "${query}"` : ""}: ${filtered.length}`,
  ];

  for (const model of rendered) {
    lines.push(
      [
        `  ${model.id}`,
        model.name ? `name: ${model.name}` : undefined,
        `context: ${formatInteger(model.contextLength)}`,
        formatPricing(model.pricing),
      ]
        .filter((part): part is string => Boolean(part))
        .join(" | "),
    );
  }

  if (filtered.length > rendered.length) {
    lines.push(`... ${filtered.length - rendered.length} more omitted; use a narrower filter.`);
  }

  return lines.join("\n");
}

export function formatOpenRouterCredits(
  credits: OpenRouterCreditsInfo,
  renderOptions: TerminalRenderOptions | TerminalRenderer = {},
): string {
  return [
    "OpenRouter credits",
    `  total: ${formatMoney(credits.totalCredits)}`,
    `  used: ${formatMoney(credits.totalUsage)}`,
    `  remaining: ${formatMoney(credits.remainingCredits)}`,
    `  percent_used: ${formatPercent(credits.percentUsed)}`,
    `  usage_meter: ${formatCreditsUsageMeter(credits, renderOptions)}`,
  ].join("\n");
}

export function formatOpenRouterGeneration(generation: OpenRouterGenerationInfo): string {
  return [
    "OpenRouter generation",
    `  id: ${generation.id ?? "unknown"}`,
    `  model: ${generation.model ?? "unknown"}`,
    `  provider: ${generation.provider ?? "unknown"}`,
    `  tokens: prompt=${formatInteger(generation.promptTokens)}, completion=${formatInteger(
      generation.completionTokens,
    )}, total=${formatInteger(generation.totalTokens)}, reasoning=${formatInteger(
      generation.reasoningTokens,
    )}`,
    `  cost: ${formatMoney(generation.cost)}`,
    `  created_at: ${generation.createdAt ?? "unknown"}`,
  ].join("\n");
}

export function formatOpenRouterLiveError(error: unknown): string {
  if (error instanceof OpenRouterLiveApiError) {
    const permissionNote = error.managementPermissionLikelyRequired
      ? " The configured key may lack OpenRouter management permission."
      : "";
    return `${error.message}${permissionNote}`;
  }

  return error instanceof Error ? error.message : String(error);
}

async function requestJson(
  options: OpenRouterLiveOptions,
  path: string,
  errorOptions: { managementPermissionLikelyRequired?: boolean } = {},
): Promise<unknown> {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new Error("fetch is not available in this Node.js runtime.");
  }

  const baseUrl = trimTrailingSlash(options.baseUrl ?? OPENROUTER_API_BASE);
  const response = await fetchImpl(`${baseUrl}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      Accept: "application/json",
    },
    signal: options.signal,
  });

  if (!response.ok) {
    const body = await readSanitizedBody(response, options.apiKey);
    throw new OpenRouterLiveApiError(
      response.status,
      `OpenRouter request failed with HTTP ${response.status}${body ? `: ${body}` : ""}`,
      {
        body,
        managementPermissionLikelyRequired:
          errorOptions.managementPermissionLikelyRequired &&
          (response.status === 401 || response.status === 403),
      },
    );
  }

  return response.json();
}

function filterModels(models: OpenRouterModelInfo[], query?: string): OpenRouterModelInfo[] {
  const normalized = query?.trim().toLowerCase();
  if (!normalized) {
    return models;
  }

  return models.filter((model) => {
    const haystack = `${model.id} ${model.name ?? ""}`.toLowerCase();
    return haystack.includes(normalized);
  });
}

function extractPricing(value: unknown): OpenRouterModelPricing | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  return definedOnly({
    prompt: stringOrNumberFromUnknown(record.prompt),
    completion: stringOrNumberFromUnknown(record.completion),
    image: stringOrNumberFromUnknown(record.image),
    request: stringOrNumberFromUnknown(record.request),
  });
}

async function readSanitizedBody(response: Response, apiKey: string): Promise<string | undefined> {
  const text = await response.text();
  const sanitized = sanitizeErrorText(text, apiKey).trim();
  return sanitized.length > 0 ? sanitized : undefined;
}

function sanitizeErrorText(text: string, apiKey: string): string {
  return text
    .replaceAll(apiKey, "[redacted]")
    .replace(/(Authorization:\s*Bearer\s+)[^\s"'\\]+/gi, "$1[redacted]")
    .replace(/(Bearer\s+)[^\s"'\\]+/gi, "$1[redacted]");
}

function formatPricing(pricing: OpenRouterModelPricing | undefined): string | undefined {
  if (!pricing) {
    return undefined;
  }

  const parts = [
    pricing.prompt ? `prompt=${pricing.prompt}` : undefined,
    pricing.completion ? `completion=${pricing.completion}` : undefined,
    pricing.request ? `request=${pricing.request}` : undefined,
    pricing.image ? `image=${pricing.image}` : undefined,
  ].filter((part): part is string => Boolean(part));

  return parts.length > 0 ? `pricing: ${parts.join(", ")}` : undefined;
}

function formatInteger(value: number | undefined): string {
  return typeof value === "number" ? Math.round(value).toLocaleString("en-US") : "unknown";
}

function formatMoney(value: number | undefined): string {
  return typeof value === "number" ? `$${value.toFixed(6)}` : "unknown";
}

function formatPercent(value: number | undefined): string {
  return typeof value === "number" ? `${value.toFixed(2)}%` : "unknown";
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return undefined;
}

function stringFromUnknown(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function stringOrNumberFromUnknown(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return undefined;
}

function numberFromUnknown(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function sumOptional(left: number | undefined, right: number | undefined): number | undefined {
  if (left === undefined || right === undefined) {
    return undefined;
  }

  return left + right;
}

function definedOnly<T extends Record<string, unknown>>(record: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}
