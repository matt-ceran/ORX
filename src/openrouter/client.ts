import { createParser } from "eventsource-parser";
import type {
  OpenRouterAskOptions,
  OpenRouterAskResult,
  OpenRouterGenerationMetadata,
  OpenRouterStreamCallbacks,
  OpenRouterStreamMetadata,
  OpenRouterUsageMetadata,
} from "./types.js";

export const OPENROUTER_API_BASE = "https://openrouter.ai/api/v1";

export class OpenRouterApiError extends Error {
  readonly status: number;
  readonly body?: string;

  constructor(status: number, message: string, body?: string) {
    super(message);
    this.name = "OpenRouterApiError";
    this.status = status;
    this.body = body;
  }
}

interface StreamChunk {
  model?: unknown;
  choices?: unknown;
  usage?: unknown;
}

export async function streamOpenRouterAsk(
  options: OpenRouterAskOptions,
  callbacks: OpenRouterStreamCallbacks,
): Promise<OpenRouterAskResult> {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new Error("fetch is not available in this Node.js runtime.");
  }

  const baseUrl = trimTrailingSlash(options.baseUrl ?? OPENROUTER_API_BASE);
  const response = await fetchImpl(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(options.request),
  });

  if (!response.ok) {
    const body = await readSanitizedBody(response, options.apiKey);
    throw new OpenRouterApiError(
      response.status,
      `OpenRouter request failed with HTTP ${response.status}${body ? `: ${body}` : ""}`,
      body,
    );
  }

  if (!response.body) {
    throw new Error("OpenRouter response did not include a stream body.");
  }

  const metadata: OpenRouterStreamMetadata = {
    requestedModel: options.requestMetadata.requestedModel,
    generationId: response.headers.get("x-generation-id") ?? undefined,
  };

  await consumeSseStream(response.body, {
    onChunk(chunk) {
      mergeStreamChunk(metadata, chunk, callbacks);
    },
  });

  if (metadata.generationId) {
    const generationMetadata = await fetchGenerationMetadata({
      apiKey: options.apiKey,
      baseUrl,
      generationId: metadata.generationId,
      fetch: fetchImpl,
    });
    mergeGenerationMetadata(metadata, generationMetadata);
  }

  return { metadata };
}

interface ConsumeSseOptions {
  onChunk: (chunk: StreamChunk) => void;
}

async function consumeSseStream(body: ReadableStream<Uint8Array>, options: ConsumeSseOptions) {
  const decoder = new TextDecoder();
  let parseError: Error | undefined;

  const parser = createParser({
    onEvent(event) {
      if (event.data === "[DONE]") {
        return;
      }

      try {
        options.onChunk(JSON.parse(event.data) as StreamChunk);
      } catch (error) {
        parseError = error instanceof Error ? error : new Error(String(error));
      }
    },
    onComment() {
      // OpenRouter streams may include SSE comments; they are keepalives, not data.
    },
    onError(error) {
      parseError = error;
    },
    maxBufferSize: 1024 * 1024,
  });

  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    parser.feed(decoder.decode(chunk, { stream: true }));
    if (parseError) {
      throw parseError;
    }
  }

  const trailingText = decoder.decode();
  if (trailingText) {
    parser.feed(trailingText);
  }
  parser.reset({ consume: true });

  if (parseError) {
    throw parseError;
  }
}

function mergeStreamChunk(
  metadata: OpenRouterStreamMetadata,
  chunk: StreamChunk,
  callbacks: OpenRouterStreamCallbacks,
) {
  if (typeof chunk.model === "string") {
    metadata.resolvedModel = chunk.model;
  }

  const usage = extractUsage(chunk.usage);
  mergeUsage(metadata, usage);

  for (const text of extractTextDeltas(chunk.choices)) {
    callbacks.onText(text);
  }
}

function extractTextDeltas(choices: unknown): string[] {
  if (!Array.isArray(choices)) {
    return [];
  }

  const texts: string[] = [];
  for (const choice of choices) {
    const choiceObject = asRecord(choice);
    const delta = asRecord(choiceObject?.delta);
    const content = delta?.content;
    if (typeof content === "string" && content.length > 0) {
      texts.push(content);
    }
  }

  return texts;
}

function extractUsage(value: unknown): OpenRouterUsageMetadata & { cost?: number } {
  const usage = asRecord(value);
  if (!usage) {
    return {};
  }

  const completionDetails = asRecord(usage.completion_tokens_details);

  return definedOnly({
    promptTokens: numberFromUnknown(usage.prompt_tokens),
    completionTokens: numberFromUnknown(usage.completion_tokens),
    totalTokens: numberFromUnknown(usage.total_tokens),
    reasoningTokens:
      numberFromUnknown(completionDetails?.reasoning_tokens) ??
      numberFromUnknown(usage.reasoning_tokens),
    cost: numberFromUnknown(usage.cost) ?? numberFromUnknown(usage.total_cost),
  });
}

async function fetchGenerationMetadata(options: {
  apiKey: string;
  baseUrl: string;
  generationId: string;
  fetch: typeof fetch;
}): Promise<OpenRouterGenerationMetadata | undefined> {
  try {
    const response = await options.fetch(
      `${options.baseUrl}/generation?id=${encodeURIComponent(options.generationId)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          Accept: "application/json",
        },
      },
    );

    if (!response.ok) {
      return undefined;
    }

    const raw = (await response.json()) as unknown;
    return extractGenerationMetadata(raw);
  } catch {
    return undefined;
  }
}

function extractGenerationMetadata(raw: unknown): OpenRouterGenerationMetadata | undefined {
  const root = asRecord(raw);
  const data = asRecord(root?.data) ?? root;
  if (!data) {
    return undefined;
  }

  return definedOnly({
    model: stringFromUnknown(data.model),
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
  });
}

function mergeGenerationMetadata(
  metadata: OpenRouterStreamMetadata,
  generationMetadata: OpenRouterGenerationMetadata | undefined,
) {
  if (!generationMetadata) {
    return;
  }

  if (
    generationMetadata.model &&
    (!metadata.resolvedModel || metadata.resolvedModel === metadata.requestedModel)
  ) {
    metadata.resolvedModel = generationMetadata.model;
  }
  metadata.promptTokens ??= generationMetadata.promptTokens;
  metadata.completionTokens ??= generationMetadata.completionTokens;
  metadata.totalTokens ??= generationMetadata.totalTokens;
  metadata.reasoningTokens ??= generationMetadata.reasoningTokens;
  metadata.cost ??= generationMetadata.cost;
}

function mergeUsage(
  metadata: OpenRouterStreamMetadata,
  usage: OpenRouterUsageMetadata & { cost?: number },
) {
  metadata.promptTokens ??= usage.promptTokens;
  metadata.completionTokens ??= usage.completionTokens;
  metadata.totalTokens ??= usage.totalTokens;
  metadata.reasoningTokens ??= usage.reasoningTokens;
  metadata.cost ??= usage.cost;
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
