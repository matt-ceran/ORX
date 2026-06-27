import test from "node:test";
import assert from "node:assert/strict";
import type { OpenRouterModelInfo } from "./live.js";
import { formatModelResolutionResult, resolveOpenRouterModel } from "./model-resolver.js";

const CATALOG: OpenRouterModelInfo[] = [
  {
    id: "anthropic/claude-sonnet-4.5",
    name: "Claude Sonnet 4.5",
  },
  {
    id: "openai/gpt-5.5",
    name: "GPT 5.5",
  },
  {
    id: "openai/gpt-5.5-mini",
    name: "GPT 5.5 Mini",
  },
  {
    id: "deepseek/deepseek-chat-v3.1",
    name: "DeepSeek Chat V3.1",
  },
];

test("resolves exact catalog model ids", async () => {
  const result = await resolveOpenRouterModel({
    input: "anthropic/claude-sonnet-4.5",
    apiKey: "test-key",
    models: CATALOG,
  });

  assert.deepEqual(result, {
    kind: "resolved",
    modelId: "anthropic/claude-sonnet-4.5",
    source: "catalog_exact",
  });
  assert.equal(
    formatModelResolutionResult(result),
    "Model set to anthropic/claude-sonnet-4.5 (mode: exact).",
  );
});

test("resolves a friendly query when exactly one catalog model matches", async () => {
  const result = await resolveOpenRouterModel({
    input: "claude sonnet 4.5",
    apiKey: "test-key",
    models: CATALOG,
  });

  assert.equal(result.kind, "resolved");
  assert.equal(result.modelId, "anthropic/claude-sonnet-4.5");
  assert.equal(result.source, "catalog_friendly");
});

test("returns bounded choices for friendly queries with multiple matches", async () => {
  const result = await resolveOpenRouterModel({
    input: "gpt 5.5",
    apiKey: "test-key",
    models: CATALOG,
    maxMatches: 1,
  });

  assert.equal(result.kind, "multiple");
  assert.equal(result.totalMatches, 2);
  assert.deepEqual(result.matches, [{ id: "openai/gpt-5.5", name: "GPT 5.5" }]);

  const output = formatModelResolutionResult(result);
  assert.match(output, /Multiple OpenRouter models matched "gpt 5\.5"/);
  assert.match(output, /\/model openai\/gpt-5\.5/);
  assert.match(output, /\.\.\. 1 more omitted; use \/models gpt 5\.5/);
});

test("rejects unknown friendly names instead of inventing exact model ids", async () => {
  const result = await resolveOpenRouterModel({
    input: "deepseek v4",
    apiKey: "test-key",
    models: CATALOG,
  });

  assert.equal(result.kind, "unknown");
  assert.match(formatModelResolutionResult(result), /No OpenRouter model matched "deepseek v4"/);
  assert.match(formatModelResolutionResult(result), /Try \/models deepseek v4/);
});

test("preserves explicit slugs on catalog failure while redacting secrets", async () => {
  const result = await resolveOpenRouterModel({
    input: "deepseek/deepseek-chat-v3.1",
    apiKey: "test-key",
    fetch: async () => {
      throw new Error("network failed for test-key Bearer sk-or-v1-secret");
    },
  });

  assert.equal(result.kind, "resolved");
  assert.equal(result.modelId, "deepseek/deepseek-chat-v3.1");
  assert.equal(result.source, "explicit_slug_unverified");
  assert.doesNotMatch(result.warning ?? "", /test-key|sk-or-v1-secret/);
  assert.match(result.warning ?? "", /\[redacted\]/);
});

test("does not resolve friendly names on catalog failure or leak secrets", async () => {
  const result = await resolveOpenRouterModel({
    input: "deepseek v4",
    apiKey: "test-key",
    fetch: async () => {
      throw new Error(
        "network failed for test-key Authorization: Bearer test-key and sk-or-v1-secret",
      );
    },
  });

  assert.equal(result.kind, "unknown");
  assert.match(result.reason, /cannot safely resolve a friendly name/);
  assert.doesNotMatch(result.reason, /test-key|sk-or-v1-secret/);
  assert.match(result.reason, /\[redacted\]/);
});
