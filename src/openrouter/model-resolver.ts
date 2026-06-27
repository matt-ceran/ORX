import {
  formatOpenRouterLiveError,
  listOpenRouterModels,
  type OpenRouterLiveOptions,
  type OpenRouterModelInfo,
} from "./live.js";

export interface ModelResolutionMatch {
  id: string;
  name?: string;
}

export type ModelResolutionResult =
  | {
      kind: "resolved";
      modelId: string;
      source: "catalog_exact" | "catalog_friendly" | "explicit_slug_unverified";
      warning?: string;
    }
  | {
      kind: "multiple";
      input: string;
      matches: ModelResolutionMatch[];
      totalMatches: number;
    }
  | {
      kind: "unknown";
      input: string;
      reason: string;
    };

export interface ResolveOpenRouterModelOptions
  extends Pick<OpenRouterLiveOptions, "baseUrl" | "fetch" | "signal"> {
  input: string;
  apiKey?: string;
  models?: OpenRouterModelInfo[];
  maxMatches?: number;
}

const DEFAULT_MAX_MATCHES = 8;

export async function resolveOpenRouterModel(
  options: ResolveOpenRouterModelOptions,
): Promise<ModelResolutionResult> {
  const input = options.input.trim();
  if (!input) {
    return {
      kind: "unknown",
      input,
      reason: "Usage: /model <model-id-or-search>. Try /models <query> to search.",
    };
  }

  const explicitSlug = looksLikeOpenRouterModelId(input);

  let models: OpenRouterModelInfo[];
  try {
    models =
      options.models ??
      (options.apiKey
        ? await listOpenRouterModels({
            apiKey: options.apiKey,
            baseUrl: options.baseUrl,
            fetch: options.fetch,
            signal: options.signal,
          })
        : []);
  } catch (error) {
    if (explicitSlug) {
      return {
        kind: "resolved",
        modelId: input,
        source: "explicit_slug_unverified",
        warning: `Model catalog unavailable; using explicit slug without live verification. ${formatOpenRouterLiveError(
          error,
          { apiKey: options.apiKey },
        )}`,
      };
    }

    return {
      kind: "unknown",
      input,
      reason: `Model catalog unavailable, so ORX cannot safely resolve a friendly name. ${formatOpenRouterLiveError(
        error,
        { apiKey: options.apiKey },
      )}`,
    };
  }

  const exact = models.find((model) => model.id === input);
  if (exact) {
    return {
      kind: "resolved",
      modelId: exact.id,
      source: "catalog_exact",
    };
  }

  if (models.length === 0) {
    if (explicitSlug) {
      return {
        kind: "resolved",
        modelId: input,
        source: "explicit_slug_unverified",
        warning: "OpenRouter model catalog is unavailable; using explicit slug without live verification.",
      };
    }

    return {
      kind: "unknown",
      input,
      reason: "OpenRouter model catalog is unavailable. Use an exact provider/model slug or run /models <query> after configuring an API key.",
    };
  }

  const matches = findFriendlyMatches(input, models);
  if (matches.length === 1) {
    return {
      kind: "resolved",
      modelId: matches[0].id,
      source: "catalog_friendly",
    };
  }

  if (matches.length > 1) {
    return {
      kind: "multiple",
      input,
      matches: matches.slice(0, options.maxMatches ?? DEFAULT_MAX_MATCHES),
      totalMatches: matches.length,
    };
  }

  return {
    kind: "unknown",
    input,
    reason: `No OpenRouter model matched "${input}". Try /models ${input} to search, then use /model <exact-id>.`,
  };
}

export function formatModelResolutionResult(result: ModelResolutionResult): string {
  switch (result.kind) {
    case "resolved":
      return [
        `Model set to ${result.modelId} (mode: exact).`,
        result.warning ? `Warning: ${result.warning}` : undefined,
      ]
        .filter((line): line is string => Boolean(line))
        .join("\n");
    case "multiple": {
      const lines = [
        `Multiple OpenRouter models matched "${result.input}". Use an exact id:`,
        ...result.matches.map((match) =>
          [`  /model ${match.id}`, match.name ? `name: ${match.name}` : undefined]
            .filter((part): part is string => Boolean(part))
            .join(" | "),
        ),
      ];
      if (result.totalMatches > result.matches.length) {
        lines.push(
          `... ${result.totalMatches - result.matches.length} more omitted; use /models ${result.input} for a narrower search.`,
        );
      }
      return lines.join("\n");
    }
    case "unknown":
      return result.reason;
  }
}

function findFriendlyMatches(input: string, models: OpenRouterModelInfo[]): ModelResolutionMatch[] {
  const query = normalizeModelSearchText(input);
  if (!query) {
    return [];
  }

  return models
    .map((model) => ({
      model,
      rank: modelMatchRank(query, model),
    }))
    .filter((entry): entry is { model: OpenRouterModelInfo; rank: number } => entry.rank !== undefined)
    .sort((a, b) => a.rank - b.rank || a.model.id.localeCompare(b.model.id))
    .map(({ model }) => ({
      id: model.id,
      name: model.name,
    }));
}

function modelMatchRank(query: string, model: OpenRouterModelInfo): number | undefined {
  const id = normalizeModelSearchText(model.id);
  const name = normalizeModelSearchText(model.name ?? "");
  const provider = normalizeModelSearchText(model.id.split("/")[0] ?? "");
  const idTail = normalizeModelSearchText(model.id.split("/").slice(1).join(" "));
  const haystack = [id, name, provider, idTail].filter(Boolean).join(" ");

  if (query === id) {
    return 0;
  }
  if (query === name) {
    return 1;
  }
  if (query === idTail) {
    return 2;
  }
  if (id.includes(query)) {
    return 3;
  }
  if (name.includes(query)) {
    return 4;
  }
  if (haystack.includes(query)) {
    return 5;
  }

  const queryParts = query.split(" ").filter(Boolean);
  if (queryParts.length > 1 && queryParts.every((part) => haystack.includes(part))) {
    return 6;
  }

  return undefined;
}

function normalizeModelSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function looksLikeOpenRouterModelId(value: string): boolean {
  return /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:.-]*(?:\/[a-z0-9][a-z0-9._:.-]*)?$/i.test(
    value,
  );
}
