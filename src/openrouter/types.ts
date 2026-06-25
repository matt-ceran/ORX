import type { OrxMode } from "../config/types.js";

export type OpenRouterRole = "system" | "user" | "assistant" | "tool";

export interface OpenRouterMessage {
  role: OpenRouterRole;
  content: string;
}

export interface OpenRouterPluginConfig {
  id: "fusion" | string;
  preset?: string;
}

export interface OpenRouterChatRequest {
  model: string;
  messages: OpenRouterMessage[];
  stream: true;
  plugins?: OpenRouterPluginConfig[];
}

export interface OpenRouterRequestMetadata {
  mode: OrxMode;
  requestedModel: string;
  fusionPreset?: string;
}

export interface OpenRouterUsageMetadata {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
}

export interface OpenRouterStreamMetadata extends OpenRouterUsageMetadata {
  requestedModel: string;
  resolvedModel?: string;
  generationId?: string;
  cost?: number;
}

export interface OpenRouterStreamCallbacks {
  onText: (text: string) => void;
}

export interface OpenRouterAskOptions {
  apiKey: string;
  baseUrl?: string;
  prompt: string;
  request: OpenRouterChatRequest;
  requestMetadata: OpenRouterRequestMetadata;
  fetch?: typeof fetch;
}

export interface OpenRouterAskResult {
  metadata: OpenRouterStreamMetadata;
}

export interface OpenRouterGenerationMetadata {
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
  cost?: number;
}
