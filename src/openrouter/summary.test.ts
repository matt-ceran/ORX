import test from "node:test";
import assert from "node:assert/strict";
import {
  formatCompactOpenRouterMetadata,
  formatOpenRouterMetadata,
} from "./summary.js";

const ANSI_PATTERN = /\x1B\[[0-?]*[ -/]*[@-~]/g;

test("full OpenRouter metadata keeps the script-safe block", () => {
  const output = formatOpenRouterMetadata({
    requestedModel: "openrouter/auto",
    resolvedModel: "anthropic/claude-sonnet-4.5",
    generationId: "generation_123",
    promptTokens: 2,
    completionTokens: 3,
    totalTokens: 5,
    reasoningTokens: 1,
    cost: 0.00042,
  });

  assert.match(output, /\nmetadata:\n/);
  assert.match(output, /requested_model: openrouter\/auto/);
  assert.match(output, /resolved_model: anthropic\/claude-sonnet-4\.5/);
  assert.match(output, /tokens: prompt=2, completion=3, total=5, reasoning=1/);
  assert.match(output, /cost: \$0\.000420/);
});

test("compact OpenRouter metadata is single-line and width-aware", () => {
  const output = formatCompactOpenRouterMetadata(
    {
      requestedModel: "openrouter/auto",
      resolvedModel: "anthropic/claude-sonnet-4.5",
      generationId: "generation_1234567890",
      totalTokens: 123,
      cost: 0.00042,
    },
    { color: false, maxWidth: 64 },
  );

  assert.doesNotMatch(output, /\n/);
  assert.doesNotMatch(output, /metadata:/);
  assert.match(output, /^meta  model anthropic\/claude-sonnet-4\.5  tokens 123/);
  assert.ok(output.length <= 64);
  assert.match(output, /…$/);
});

test("compact OpenRouter metadata honors NO_COLOR", () => {
  const output = formatCompactOpenRouterMetadata(
    {
      requestedModel: "openrouter/auto",
      totalTokens: 3,
      cost: 0.0002,
    },
    { stream: { isTTY: true }, env: { NO_COLOR: "1" } },
  );

  assert.equal(output, "meta  route openrouter/auto  tokens 3  cost $0.000200");
  assert.doesNotMatch(output, ANSI_PATTERN);
});

test("compact OpenRouter metadata strips terminal controls and redacts secret-shaped values", () => {
  const output = formatCompactOpenRouterMetadata(
    {
      requestedModel: "openrouter/auto",
      resolvedModel: "evil/model\nleaked_line\x1b[31mRED\x07 api_key=abcd1234",
      generationId: "gen_abc\rSECRET_TOKEN=abc123",
      totalTokens: 12,
      cost: 0.00123,
    },
    { color: false, maxWidth: 140 },
  );

  assert.doesNotMatch(output, /[\n\r\x07\x1B]/);
  assert.doesNotMatch(output, /abcd1234|abc123/);
  assert.match(output, /api_key=\[redacted\]/);
  assert.match(output, /^meta  model evil\/model leaked_lineRED api_key=\[redacted\]/);
});
