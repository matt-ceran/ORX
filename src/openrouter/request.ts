import type { OrxConfig, OrxMode } from "../config/types.js";
import type {
  OpenRouterChatRequest,
  OpenRouterMessage,
  OpenRouterRequestMetadata,
} from "./types.js";

export interface AskRequestOverrides {
  mode?: OrxMode;
  model?: string;
  fusionPreset?: string;
}

export interface BuildAskRequestOptions {
  config: OrxConfig;
  prompt: string;
  overrides?: AskRequestOverrides;
}

export interface BuildChatRequestOptions {
  config: OrxConfig;
  messages: OpenRouterMessage[];
  overrides?: AskRequestOverrides;
}

export interface BuiltAskRequest {
  request: OpenRouterChatRequest;
  metadata: OpenRouterRequestMetadata;
}

export function buildAskRequest({
  config,
  prompt,
  overrides = {},
}: BuildAskRequestOptions): BuiltAskRequest {
  return buildChatRequest({
    config,
    messages: [{ role: "user", content: prompt }],
    overrides,
  });
}

export function buildChatRequest({
  config,
  messages,
  overrides = {},
}: BuildChatRequestOptions): BuiltAskRequest {
  const mode = resolveMode(config.mode, overrides);
  const requestedModel = resolveModel(config, mode, overrides.model);
  const fusionPreset = resolveFusionPreset(config, mode, overrides.fusionPreset);

  return {
    request: {
      model: requestedModel,
      messages,
      stream: true,
      ...(fusionPreset ? { plugins: [{ id: "fusion", preset: fusionPreset }] } : {}),
    },
    metadata: {
      mode,
      requestedModel,
      ...(fusionPreset ? { fusionPreset } : {}),
    },
  };
}

function resolveMode(configMode: OrxMode, overrides: AskRequestOverrides): OrxMode {
  if (overrides.mode) {
    return overrides.mode;
  }

  if (overrides.model) {
    return "exact";
  }

  if (overrides.fusionPreset) {
    return "fusion";
  }

  return configMode;
}

function resolveModel(config: OrxConfig, mode: OrxMode, modelOverride?: string): string {
  if (mode === "auto") {
    return "openrouter/auto";
  }

  if (mode === "fusion") {
    return "openrouter/fusion";
  }

  return modelOverride ?? config.model;
}

function resolveFusionPreset(
  config: OrxConfig,
  mode: OrxMode,
  fusionPresetOverride?: string,
): string | undefined {
  if (mode !== "fusion") {
    return undefined;
  }

  return fusionPresetOverride ?? config.fusionPreset;
}
