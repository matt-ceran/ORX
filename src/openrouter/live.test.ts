import test from "node:test";
import assert from "node:assert/strict";
import {
  OpenRouterLiveApiError,
  formatOpenRouterCredits,
  formatOpenRouterGeneration,
  formatOpenRouterLiveError,
  formatOpenRouterModels,
  getOpenRouterCredits,
  getOpenRouterGeneration,
  listOpenRouterModels,
} from "./live.js";

test("lists OpenRouter models and formats filtered pricing output", async () => {
  const seen: Array<{ url: string; authorization?: string }> = [];
  const mockFetch: typeof fetch = async (input, init) => {
    seen.push({
      url: String(input),
      authorization: (init?.headers as Record<string, string>).Authorization,
    });
    return new Response(
      JSON.stringify({
        data: [
          {
            id: "openai/gpt-5.5",
            name: "GPT 5.5",
            context_length: 200000,
            pricing: {
              prompt: "0.000001",
              completion: "0.000004",
            },
          },
          {
            id: "anthropic/claude-sonnet-4.5",
            name: "Claude Sonnet 4.5",
            context_length: 200000,
          },
        ],
      }),
      { status: 200 },
    );
  };

  const models = await listOpenRouterModels({
    apiKey: "test-key",
    baseUrl: "https://example.test/",
    fetch: mockFetch,
  });

  assert.deepEqual(seen, [
    {
      url: "https://example.test/models",
      authorization: "Bearer test-key",
    },
  ]);
  assert.equal(models.length, 2);
  assert.equal(models[0].id, "openai/gpt-5.5");
  assert.equal(models[0].contextLength, 200000);
  assert.equal(models[0].pricing?.prompt, "0.000001");

  const output = formatOpenRouterModels(models, "claude");
  assert.match(output, /OpenRouter models matching "claude": 1/);
  assert.match(output, /anthropic\/claude-sonnet-4\.5/);
  assert.doesNotMatch(output, /openai\/gpt-5\.5/);
});

test("fetches OpenRouter credits and computes remaining and percent used", async () => {
  const mockFetch: typeof fetch = async (input) => {
    assert.equal(String(input), "https://example.test/credits");
    return new Response(
      JSON.stringify({
        data: {
          total_credits: 25,
          total_usage: 10,
        },
      }),
      { status: 200 },
    );
  };

  const credits = await getOpenRouterCredits({
    apiKey: "test-key",
    baseUrl: "https://example.test",
    fetch: mockFetch,
  });

  assert.equal(credits.totalCredits, 25);
  assert.equal(credits.totalUsage, 10);
  assert.equal(credits.remainingCredits, 15);
  assert.equal(credits.percentUsed, 40);
  assert.match(formatOpenRouterCredits(credits), /percent_used: 40\.00%/);
  assert.match(formatOpenRouterCredits(credits), /usage_meter: \[#####-------\] 40\.00%/);
});

test("fetches OpenRouter credits from explicit remaining and percent fields", async () => {
  const mockFetch: typeof fetch = async (input) => {
    assert.equal(String(input), "https://example.test/credits");
    return new Response(
      JSON.stringify({
        data: {
          total: 50,
          used: 12.5,
          remaining_credits: 37.5,
          percent_used: 25,
        },
      }),
      { status: 200 },
    );
  };

  const credits = await getOpenRouterCredits({
    apiKey: "test-key",
    baseUrl: "https://example.test",
    fetch: mockFetch,
  });

  assert.equal(credits.totalCredits, 50);
  assert.equal(credits.totalUsage, 12.5);
  assert.equal(credits.remainingCredits, 37.5);
  assert.equal(credits.percentUsed, 25);
  assert.match(formatOpenRouterCredits(credits), /usage_meter: \[###---------\] 25\.00%/);
});

test("fetches OpenRouter generation metadata", async () => {
  const mockFetch: typeof fetch = async (input) => {
    assert.equal(String(input), "https://example.test/generation?id=gen_123");
    return new Response(
      JSON.stringify({
        data: {
          id: "gen_123",
          model: "openai/gpt-5.5",
          provider_name: "OpenAI",
          tokens_prompt: 12,
          tokens_completion: 8,
          native_tokens_reasoning: 3,
          total_cost: "0.00042",
          created_at: "2026-06-26T12:00:00Z",
        },
      }),
      { status: 200 },
    );
  };

  const generation = await getOpenRouterGeneration({
    apiKey: "test-key",
    baseUrl: "https://example.test",
    generationId: "gen_123",
    fetch: mockFetch,
  });

  assert.equal(generation.id, "gen_123");
  assert.equal(generation.model, "openai/gpt-5.5");
  assert.equal(generation.provider, "OpenAI");
  assert.equal(generation.totalTokens, 20);
  assert.equal(generation.reasoningTokens, 3);
  assert.equal(generation.cost, 0.00042);
  assert.match(formatOpenRouterGeneration(generation), /provider: OpenAI/);
});

test("reports sanitized live API failures without leaking keys", async () => {
  const mockFetch: typeof fetch = async () =>
    new Response('bad key test-key Authorization: Bearer test-key', { status: 403 });

  await assert.rejects(
    getOpenRouterCredits({
      apiKey: "test-key",
      baseUrl: "https://example.test",
      fetch: mockFetch,
    }),
    (error) => {
      assert.ok(error instanceof OpenRouterLiveApiError);
      assert.equal(error.status, 403);
      assert.equal(error.managementPermissionLikelyRequired, true);
      assert.doesNotMatch(error.message, /test-key/);
      assert.match(error.message, /\[redacted\]/);
      assert.match(formatOpenRouterLiveError(error), /may lack OpenRouter management permission/);
      return true;
    },
  );
});
