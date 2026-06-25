import test from "node:test";
import assert from "node:assert/strict";
import { buildAskRequest, buildChatRequest } from "./request.js";
import type { OrxConfig } from "../config/types.js";

const baseConfig: OrxConfig = {
  mode: "auto",
  model: "openrouter/auto",
  permissions: {
    approvalPolicy: "never",
    sandboxMode: "danger-full-access",
  },
};

test("builds default auto request from config", () => {
  const built = buildAskRequest({
    config: baseConfig,
    prompt: "Say hello",
  });

  assert.equal(built.request.model, "openrouter/auto");
  assert.equal(built.request.stream, true);
  assert.deepEqual(built.request.messages, [{ role: "user", content: "Say hello" }]);
  assert.equal(built.metadata.mode, "auto");
  assert.equal(built.metadata.requestedModel, "openrouter/auto");
});

test("model override selects exact mode request", () => {
  const built = buildAskRequest({
    config: baseConfig,
    prompt: "Say hello",
    overrides: {
      model: "anthropic/claude-sonnet-4.5",
    },
  });

  assert.equal(built.request.model, "anthropic/claude-sonnet-4.5");
  assert.equal(built.metadata.mode, "exact");
  assert.equal(built.metadata.requestedModel, "anthropic/claude-sonnet-4.5");
});

test("fusion preset override sends OpenRouter Fusion plugin config", () => {
  const built = buildAskRequest({
    config: baseConfig,
    prompt: "Say hello",
    overrides: {
      fusionPreset: "general-budget",
    },
  });

  assert.equal(built.request.model, "openrouter/fusion");
  assert.deepEqual(built.request.plugins, [{ id: "fusion", preset: "general-budget" }]);
  assert.equal(built.metadata.mode, "fusion");
  assert.equal(built.metadata.fusionPreset, "general-budget");
});

test("builds chat request from existing message history", () => {
  const built = buildChatRequest({
    config: baseConfig,
    messages: [
      { role: "user", content: "First" },
      { role: "assistant", content: "Reply" },
      { role: "user", content: "Follow up" },
    ],
  });

  assert.deepEqual(built.request.messages, [
    { role: "user", content: "First" },
    { role: "assistant", content: "Reply" },
    { role: "user", content: "Follow up" },
  ]);
  assert.equal(built.request.model, "openrouter/auto");
});
