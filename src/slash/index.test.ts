import test from "node:test";
import assert from "node:assert/strict";
import type { LoadedConfig, OrxConfig } from "../config/types.js";
import type { OpenRouterMessage, OpenRouterStreamMetadata } from "../openrouter/types.js";
import { handleSlashCommand, parseSlashCommand } from "./index.js";

test("parses slash commands with extra whitespace", () => {
  assert.deepEqual(parseSlashCommand("   /model    anthropic/claude-sonnet-4.5   "), {
    name: "/model",
    argText: "anthropic/claude-sonnet-4.5",
    args: ["anthropic/claude-sonnet-4.5"],
  });

  assert.deepEqual(parseSlashCommand("/fusion   general-budget  "), {
    name: "/fusion",
    argText: "general-budget",
    args: ["general-budget"],
  });

  assert.equal(parseSlashCommand("hello"), undefined);
});

test("handles unknown commands predictably", () => {
  const harness = createSlashHarness();

  assert.equal(handleSlashCommand("  /unknown   value  ", harness.context), "continue");
  assert.equal(harness.stdout(), "");
  assert.match(harness.stderr(), /Unknown command: \/unknown\. Type \/help for commands\./);
});

test("mode and model commands update active routing config", () => {
  const harness = createSlashHarness({
    config: {
      ...baseConfig(),
      mode: "exact",
      model: "anthropic/claude-sonnet-4.5",
      fusionPreset: "general-budget",
    },
  });

  assert.equal(handleSlashCommand("/mode auto", harness.context), "continue");
  assert.equal(harness.config().mode, "auto");
  assert.equal(harness.config().model, "openrouter/auto");
  assert.equal(harness.config().fusionPreset, undefined);
  assert.match(harness.stdout(), /Mode set to auto/);

  assert.equal(handleSlashCommand("/mode fusion", harness.context), "continue");
  assert.equal(harness.config().mode, "fusion");
  assert.equal(harness.config().model, "openrouter/fusion");

  assert.equal(handleSlashCommand("/model example/test-model", harness.context), "continue");
  assert.equal(harness.config().mode, "exact");
  assert.equal(harness.config().model, "example/test-model");
  assert.equal(harness.config().fusionPreset, undefined);
});

test("fusion command shows and sets presets", () => {
  const harness = createSlashHarness();

  assert.equal(handleSlashCommand("/fusion", harness.context), "continue");
  assert.match(harness.stdout(), /Current Fusion preset: none/);

  assert.equal(handleSlashCommand("/fusion general-budget", harness.context), "continue");
  assert.equal(harness.config().mode, "fusion");
  assert.equal(harness.config().model, "openrouter/fusion");
  assert.equal(harness.config().fusionPreset, "general-budget");
  assert.match(harness.stdout(), /Fusion preset set to general-budget/);
});

test("clear and new reset conversation state callback", () => {
  const harness = createSlashHarness({
    messages: [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi" },
    ],
    metadata: {
      requestedModel: "openrouter/auto",
      resolvedModel: "example/model",
    },
  });

  assert.equal(handleSlashCommand("/clear", harness.context), "continue");
  assert.deepEqual(harness.messages(), []);
  assert.equal(harness.metadata(), undefined);
  assert.match(harness.stdout(), /Conversation history cleared/);

  harness.setMessages([
    { role: "user", content: "Next" },
    { role: "assistant", content: "Reply" },
  ]);
  harness.setMetadata({
    requestedModel: "openrouter/fusion",
    resolvedModel: "example/fusion-model",
  });

  assert.equal(handleSlashCommand("/new", harness.context), "continue");
  assert.deepEqual(harness.messages(), []);
  assert.equal(harness.metadata(), undefined);
  assert.match(harness.stdout(), /New chat started/);
});

test("status reports active routing, config, key, permissions, history, and metadata", () => {
  const harness = createSlashHarness({
    config: {
      ...baseConfig(),
      mode: "fusion",
      model: "openrouter/fusion",
      fusionPreset: "general-budget",
    },
    messages: [{ role: "user", content: "Hello" }],
    metadata: {
      requestedModel: "openrouter/fusion",
      resolvedModel: "anthropic/claude-sonnet-4.5",
      generationId: "gen-123",
      promptTokens: 2,
      completionTokens: 3,
      totalTokens: 5,
      cost: 0.0001,
    },
  });

  assert.equal(handleSlashCommand("/status", harness.context), "continue");
  assert.match(harness.stdout(), /cwd: \/tmp\/orx-test/);
  assert.match(harness.stdout(), /config_source: built-in defaults/);
  assert.match(harness.stdout(), /mode: fusion/);
  assert.match(harness.stdout(), /model: openrouter\/fusion/);
  assert.match(harness.stdout(), /fusion_preset: general-budget/);
  assert.match(harness.stdout(), /api_key_present: yes/);
  assert.match(harness.stdout(), /api_key_source: OPENROUTER_API_KEY/);
  assert.match(harness.stdout(), /approval_policy: never/);
  assert.match(harness.stdout(), /sandbox_mode: danger-full-access/);
  assert.match(harness.stdout(), /history_messages: 1/);
  assert.match(harness.stdout(), /latest_metadata:/);
  assert.match(harness.stdout(), /generation_id: gen-123/);
});

function createSlashHarness(
  options: {
    config?: OrxConfig;
    messages?: OpenRouterMessage[];
    metadata?: OpenRouterStreamMetadata;
  } = {},
) {
  let stdoutText = "";
  let stderrText = "";
  let config = options.config ?? baseConfig();
  let messages = options.messages ?? [];
  let metadata = options.metadata;
  const loadedConfig: LoadedConfig = {
    config,
    loadedFiles: [],
    apiKeyPresent: true,
    apiKeySource: "OPENROUTER_API_KEY",
  };

  return {
    context: {
      io: {
        stdout: {
          write(chunk: string | Uint8Array) {
            stdoutText += String(chunk);
            return true;
          },
        },
        stderr: {
          write(chunk: string | Uint8Array) {
            stderrText += String(chunk);
            return true;
          },
        },
        cwd: "/tmp/orx-test",
      },
      loadedConfig,
      getConfig: () => config,
      setConfig: (nextConfig: OrxConfig) => {
        config = nextConfig;
      },
      getMessages: () => messages,
      clearMessages: () => {
        messages = [];
        metadata = undefined;
      },
      getLatestMetadata: () => metadata,
    },
    config: () => config,
    messages: () => messages,
    metadata: () => metadata,
    setMessages: (nextMessages: OpenRouterMessage[]) => {
      messages = nextMessages;
    },
    setMetadata: (nextMetadata: OpenRouterStreamMetadata) => {
      metadata = nextMetadata;
    },
    stdout: () => stdoutText,
    stderr: () => stderrText,
  };
}

function baseConfig(): OrxConfig {
  return {
    mode: "auto",
    model: "openrouter/auto",
    permissions: {
      approvalPolicy: "never",
      sandboxMode: "danger-full-access",
    },
  };
}
