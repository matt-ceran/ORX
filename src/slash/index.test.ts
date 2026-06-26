import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LoadedConfig, OrxConfig } from "../config/types.js";
import type { OpenRouterMessage, OpenRouterStreamMetadata } from "../openrouter/types.js";
import {
  COMPACTED_CONTEXT_PROVENANCE,
  createSessionDiffState,
  recordToolResultForDiffState,
  type AgentContextBudget,
  type SessionDiffState,
} from "../agent/index.js";
import { resetMcpProfileRuntimeState } from "../mcp/index.js";
import { handleSlashCommand, parseSlashCommand, type SlashCommandContext } from "./index.js";

afterEach(() => {
  resetMcpProfileRuntimeState();
});

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

test("live metadata slash commands use OpenRouter metadata APIs", async () => {
  const seenUrls: string[] = [];
  const harness = createSlashHarness({
    fetch: async (input) => {
      seenUrls.push(String(input));
      if (String(input).endsWith("/models")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: "openai/gpt-5.5",
                name: "GPT 5.5",
                context_length: 200000,
                pricing: { prompt: "0.000001", completion: "0.000004" },
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
      }

      if (String(input).endsWith("/credits")) {
        return new Response(
          JSON.stringify({ data: { total_credits: 10, total_usage: 2.5 } }),
          { status: 200 },
        );
      }

      if (String(input).endsWith("/generation?id=gen_123")) {
        return new Response(
          JSON.stringify({
            data: {
              id: "gen_123",
              model: "openai/gpt-5.5",
              provider_name: "OpenAI",
              tokens_prompt: 4,
              tokens_completion: 6,
              total_cost: 0.001,
            },
          }),
          { status: 200 },
        );
      }

      throw new Error(`unexpected URL ${String(input)}`);
    },
  });

  assert.equal(await handleSlashCommand("/models claude", harness.context), "continue");
  assert.equal(await handleSlashCommand("/credits", harness.context), "continue");
  assert.equal(await handleSlashCommand("/generation gen_123", harness.context), "continue");
  assert.deepEqual(seenUrls, [
    "https://openrouter.ai/api/v1/models",
    "https://openrouter.ai/api/v1/credits",
    "https://openrouter.ai/api/v1/generation?id=gen_123",
  ]);
  assert.match(harness.stdout(), /OpenRouter models matching "claude": 1/);
  assert.match(harness.stdout(), /anthropic\/claude-sonnet-4\.5/);
  assert.match(harness.stdout(), /remaining: \$7\.500000/);
  assert.match(harness.stdout(), /provider: OpenAI/);
});

test("mcp slash command reports disabled OpenRouter profile without network and audits status", async () => {
  let fetchCalls = 0;
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-slash-"));
  const auditLogPath = join(cwd, "audit", "mcp.jsonl");
  const configPath = join(cwd, "mcp", "profiles.json");
  const harness = createSlashHarness({
    mcpAuditLogPath: auditLogPath,
    mcpConfigPath: configPath,
    fetch: async () => {
      fetchCalls += 1;
      throw new Error("fetch should not be called");
    },
  });

  try {
    assert.equal(await handleSlashCommand("/mcp", harness.context), "continue");
    assert.equal(fetchCalls, 0);
    assert.match(harness.stdout(), /active_profiles: none/);
    assert.match(harness.stdout(), /billable_tools: 0/);
    assert.match(harness.stdout(), /configured_billable_tools: 1/);
    assert.match(harness.stdout(), /registry_hash: sha256:[a-f0-9]{64}/);
    assert.match(harness.stdout(), /pending_schema_changes: none/);
    assert.match(harness.stdout(), /profile=openrouter state=disabled/);
    assert.match(harness.stdout(), /billable_tools=1/);
    assert.match(harness.stdout(), /hash=sha256:[a-f0-9]{64}/);
    assert.match(harness.stdout(), /url=https:\/\/mcp\.openrouter\.ai\/mcp/);

    const events = readAuditEvents(auditLogPath);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, "mcp.profile.status");
    assert.equal(events[0].ok, true);
    assert.equal(events[0].details.pendingSchemaChangeCount, 0);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("mcp slash command keeps working when audit log is unavailable", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-audit-unavailable-"));
  const harness = createSlashHarness({
    mcpAuditLogPath: cwd,
    mcpConfigPath: join(cwd, "mcp", "profiles.json"),
  });

  try {
    assert.equal(await handleSlashCommand("/mcp list", harness.context), "continue");
    assert.match(harness.stdout(), /active_profiles: none/);
    assert.match(harness.stderr(), /Warning: unable to write MCP audit log/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("mcp enable reports and audits persistence failures", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-persist-failure-"));
  const auditLogPath = join(cwd, "audit", "mcp.jsonl");
  const harness = createSlashHarness({
    mcpAuditLogPath: auditLogPath,
    mcpConfigPath: cwd,
  });

  try {
    assert.equal(await handleSlashCommand("/mcp enable openrouter", harness.context), "continue");
    assert.match(harness.stderr(), /Unable to persist MCP profile state/);

    const events = readAuditEvents(auditLogPath);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, "mcp.profile.enable_attempt");
    assert.equal(events[0].profileId, "openrouter");
    assert.equal(events[0].ok, false);
    assert.equal(events[0].details.message, "Unable to persist MCP profile state.");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("mcp inspect renders profile metadata and audits without network", async () => {
  let fetchCalls = 0;
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-inspect-"));
  const auditLogPath = join(cwd, "audit", "mcp.jsonl");
  const configPath = join(cwd, "mcp", "profiles.json");
  const harness = createSlashHarness({
    mcpAuditLogPath: auditLogPath,
    mcpConfigPath: configPath,
    fetch: async () => {
      fetchCalls += 1;
      throw new Error("fetch should not be called");
    },
  });

  try {
    assert.equal(await handleSlashCommand("/mcp inspect openrouter", harness.context), "continue");
    assert.equal(fetchCalls, 0);
    assert.match(harness.stdout(), /MCP profile: openrouter/);
    assert.match(harness.stdout(), /profile_hash: sha256:[a-f0-9]{64}/);
    assert.match(harness.stdout(), /chat-send risk=billable auth=yes billable=yes/);
    assert.match(harness.stdout(), /write_capable: no/);

    const events = readAuditEvents(auditLogPath);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, "mcp.profile.inspect");
    assert.equal(events[0].profileId, "openrouter");
    assert.equal(events[0].ok, true);
    assert.equal(events[0].details.writeCapable, false);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("mcp enable and disable persist profile state without network", async () => {
  let fetchCalls = 0;
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-enable-"));
  const auditLogPath = join(cwd, "audit", "mcp.jsonl");
  const configPath = join(cwd, "mcp", "profiles.json");
  const harness = createSlashHarness({
    mcpAuditLogPath: auditLogPath,
    mcpConfigPath: configPath,
    fetch: async () => {
      fetchCalls += 1;
      throw new Error("fetch should not be called");
    },
  });

  try {
    assert.equal(await handleSlashCommand("/mcp enable openrouter", harness.context), "continue");
    assert.match(harness.stdout(), /MCP profile openrouter enabled/);
    assert.match(harness.stdout(), /Persisted profile state updated/);

    assert.equal(await handleSlashCommand("/mcp list", harness.context), "continue");
    assert.match(harness.stdout(), /active_profiles: openrouter/);
    assert.match(harness.stdout(), /billable_tools: 1/);
    assert.match(harness.stdout(), /profile=openrouter state=enabled/);
    assert.match(harness.stdout(), /trusted_hash=sha256:[a-f0-9]{64}/);

    assert.equal(await handleSlashCommand("/mcp disable openrouter", harness.context), "continue");
    assert.match(harness.stdout(), /MCP profile openrouter disabled/);
    assert.match(readFileSync(configPath, "utf8"), /"state": "disabled"/);
    assert.match(readFileSync(configPath, "utf8"), /"trustedProfileHash": "sha256:[a-f0-9]{64}"/);

    assert.equal(fetchCalls, 0);
    const events = readAuditEvents(auditLogPath);
    assert.deepEqual(
      events.map((event) => event.type),
      ["mcp.profile.enable_attempt", "mcp.profile.status", "mcp.profile.disable_attempt"],
    );
    assert.equal(events[0].ok, true);
    assert.equal(events[0].details.previousState, "disabled");
    assert.equal(events[0].details.nextState, "enabled");
    assert.match(String(events[0].details.profileHash), /^sha256:[a-f0-9]{64}$/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("mcp persisted enable and disable are visible across slash status contexts", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-persist-"));
  const configPath = join(cwd, "mcp", "profiles.json");
  try {
    const first = createSlashHarness({ mcpConfigPath: configPath });
    assert.equal(await handleSlashCommand("/mcp enable openrouter", first.context), "continue");

    const afterEnable = createSlashHarness({ mcpConfigPath: configPath });
    assert.equal(handleSlashCommand("/status", afterEnable.context), "continue");
    assert.match(afterEnable.stdout(), /mcp_active_profiles: openrouter/);
    assert.match(afterEnable.stdout(), /mcp_profile: profile=openrouter state=enabled/);
    assert.match(afterEnable.stdout(), /trusted_hash=sha256:[a-f0-9]{64}/);

    const second = createSlashHarness({ mcpConfigPath: configPath });
    assert.equal(await handleSlashCommand("/mcp disable openrouter", second.context), "continue");

    const afterDisable = createSlashHarness({ mcpConfigPath: configPath });
    assert.equal(handleSlashCommand("/status", afterDisable.context), "continue");
    assert.match(afterDisable.stdout(), /mcp_active_profiles: none/);
    assert.match(afterDisable.stdout(), /mcp_profile: profile=openrouter state=disabled/);
    assert.match(afterDisable.stdout(), /trusted_hash=sha256:[a-f0-9]{64}/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("mcp enable reports unknown profiles without network", async () => {
  let fetchCalls = 0;
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-unknown-"));
  const auditLogPath = join(cwd, "audit", "mcp.jsonl");
  const configPath = join(cwd, "mcp", "profiles.json");
  const harness = createSlashHarness({
    mcpAuditLogPath: auditLogPath,
    mcpConfigPath: configPath,
    fetch: async () => {
      fetchCalls += 1;
      throw new Error("fetch should not be called");
    },
  });

  try {
    assert.equal(await handleSlashCommand("/mcp enable missing", harness.context), "continue");
    assert.equal(fetchCalls, 0);
    assert.match(harness.stderr(), /Unknown MCP profile: missing/);
    const events = readAuditEvents(auditLogPath);
    assert.equal(events[0].type, "mcp.profile.enable_attempt");
    assert.equal(events[0].profileId, "missing");
    assert.equal(events[0].ok, false);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("clear and new reset conversation state callback", async () => {
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

  assert.equal(await handleSlashCommand("/new", harness.context), "continue");
  assert.deepEqual(harness.messages(), []);
  assert.equal(harness.metadata(), undefined);
  assert.match(harness.stdout(), /New chat started/);
});

test("resume lists saved sessions and calls the resume callback for selectors", async () => {
  const resumeCalls: Array<string | undefined> = [];
  const harness = createSlashHarness({
    resumeSession: async (selector) => {
      resumeCalls.push(selector);
      if (!selector) {
        return {
          kind: "list",
          sessions: [
            {
              id: "20260626T130000Z-newer",
              path: "/tmp/orx-sessions/20260626T130000Z-newer.json",
              updatedAt: "2026-06-26T13:00:00.000Z",
              cwd: "/tmp/newer",
              model: "openrouter/fusion",
              mode: "fusion",
              title: "Continue feature work",
              cost: 0.001234,
              messageCount: 4,
            },
          ],
        };
      }

      return {
        kind: "resumed",
        session: {
          id: "20260626T130000Z-newer",
          path: "/tmp/orx-sessions/20260626T130000Z-newer.json",
          updatedAt: "2026-06-26T13:00:00.000Z",
          cwd: "/tmp/newer",
          model: "openrouter/fusion",
          mode: "fusion",
          title: "Continue feature work",
          cost: 0.001234,
          messageCount: 4,
        },
      };
    },
  });

  assert.equal(await handleSlashCommand("/resume", harness.context), "continue");
  assert.match(harness.stdout(), /Saved sessions:/);
  assert.match(harness.stdout(), /1\. 20260626T130000Z-newer/);
  assert.match(harness.stdout(), /title: Continue feature work/);
  assert.match(harness.stdout(), /model: openrouter\/fusion/);
  assert.match(harness.stdout(), /cost: \$0\.001234/);

  assert.equal(await handleSlashCommand("/resume 1", harness.context), "continue");
  assert.deepEqual(resumeCalls, [undefined, "1"]);
  assert.match(harness.stdout(), /Resumed session 20260626T130000Z-newer/);
  assert.match(harness.stdout(), /messages: 4/);
});

test("resume reports missing and ambiguous selectors", async () => {
  const missing = createSlashHarness({
    resumeSession: async (selector) => ({
      kind: "not_found",
      selector: selector ?? "",
    }),
  });

  assert.equal(await handleSlashCommand("/resume nope", missing.context), "continue");
  assert.match(missing.stderr(), /No saved session matched: nope/);

  const ambiguous = createSlashHarness({
    resumeSession: async (selector) => ({
      kind: "ambiguous",
      selector: selector ?? "",
      matches: Array.from({ length: 25 }, (_unused, index) => ({
        id: `20260626T13${String(index).padStart(2, "0")}00Z-aaaa`,
        path: `/tmp/${index}.json`,
        updatedAt: `2026-06-26T13:${String(index).padStart(2, "0")}:00.000Z`,
        cwd: `/tmp/${index}`,
        model: "openrouter/auto",
        mode: "auto",
        messageCount: 1,
      })),
    }),
  });

  assert.equal(await handleSlashCommand("/resume 20260626", ambiguous.context), "continue");
  assert.match(ambiguous.stderr(), /Session selector is ambiguous: 20260626/);
  assert.match(ambiguous.stderr(), /Matching sessions:/);
  assert.match(ambiguous.stderr(), /20260626T130000Z-aaaa/);
  assert.match(ambiguous.stderr(), /\.\.\. 5 more sessions omitted; use a longer id prefix\./);
  assert.doesNotMatch(ambiguous.stderr(), /20260626T132000Z-aaaa/);
  assert.doesNotMatch(ambiguous.stderr(), /1\. 20260626T130000Z-aaaa/);
  assert.doesNotMatch(ambiguous.stderr(), /Use \/resume <number/);
  assert.match(ambiguous.stderr(), /Use \/resume <exact-id> or a longer unique id prefix\./);
});

test("compact replaces older in-session turns with a local summary", () => {
  const harness = createSlashHarness({
    messages: [
      { role: "user", content: "First task" },
      { role: "assistant", content: "First answer" },
      { role: "user", content: "Current task" },
      { role: "assistant", content: "Current answer" },
    ],
    contextBudget: {
      maxBytes: 100_000,
      maxMessages: 6,
      preserveMessages: 3,
      summaryMaxBytes: 2_000,
    },
  });

  assert.equal(handleSlashCommand("/compact", harness.context), "continue");
  assert.match(harness.stdout(), /Context compacted locally: 4->3 messages/);
  assert.equal(harness.messages()[0].role, "assistant");
  assert.match(String(harness.messages()[0].content), new RegExp(COMPACTED_CONTEXT_PROVENANCE));
  assert.deepEqual(harness.messages().slice(1), [
    { role: "user", content: "Current task" },
    { role: "assistant", content: "Current answer" },
  ]);
});

test("compact leaves an already minimal session unchanged", () => {
  const harness = createSlashHarness({
    messages: [{ role: "user", content: "Only task" }],
  });

  assert.equal(handleSlashCommand("/compact", harness.context), "continue");
  assert.deepEqual(harness.messages(), [{ role: "user", content: "Only task" }]);
  assert.match(harness.stdout(), /Context unchanged: 1 messages/);
  assert.match(harness.stdout(), /compacted=no/);
});

test("diff command prints the current working tree diff and records diff state", async () => {
  const cwd = createGitRepo();
  try {
    writeFileSync(join(cwd, "tracked.txt"), "before\n");
    git(cwd, "add", "tracked.txt");
    git(cwd, "commit", "-m", "initial");
    writeFileSync(join(cwd, "tracked.txt"), "after\n");

    const harness = createSlashHarness({ cwd });
    assert.equal(await handleSlashCommand("/diff", harness.context), "continue");

    assert.match(harness.stdout(), /diff --git a\/tracked\.txt b\/tracked\.txt/);
    assert.match(harness.stdout(), /-before/);
    assert.match(harness.stdout(), /\+after/);
    assert.equal(harness.diffState().lastDiff?.hasChanges, true);
    assert.equal(harness.stderr(), "");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("diff command includes untracked new files", async () => {
  const cwd = createGitRepo();
  try {
    writeFileSync(join(cwd, "created.txt"), "created\n");

    const harness = createSlashHarness({ cwd });
    assert.equal(await handleSlashCommand("/diff", harness.context), "continue");

    assert.match(harness.stdout(), /diff --git a\/created\.txt b\/created\.txt/);
    assert.match(harness.stdout(), /new file mode/);
    assert.match(harness.stdout(), /\+created/);
    assert.equal(harness.diffState().lastDiff?.hasChanges, true);
    assert.equal(harness.stderr(), "");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("diff command reports a concise no-changes message", async () => {
  const cwd = createGitRepo();
  try {
    writeFileSync(join(cwd, "tracked.txt"), "same\n");
    git(cwd, "add", "tracked.txt");
    git(cwd, "commit", "-m", "initial");

    const harness = createSlashHarness({ cwd });
    assert.equal(await handleSlashCommand("/diff", harness.context), "continue");

    assert.equal(harness.stdout(), "No working tree changes.\n");
    assert.equal(harness.diffState().lastDiff?.hasChanges, false);
    assert.equal(harness.stderr(), "");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("status reports active routing, config, key, permissions, history, and metadata", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-status-"));
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
    sessionInfo: {
      id: "20260626T123456Z-test",
      path: "/tmp/orx-sessions/20260626T123456Z-test.json",
    },
    mcpConfigPath: join(cwd, "profiles.json"),
  });

  try {
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
    assert.match(harness.stdout(), /mcp_active_profiles: none/);
    assert.match(harness.stdout(), /mcp_billable_tools: 0/);
    assert.match(harness.stdout(), /mcp_configured_billable_tools: 1/);
    assert.match(harness.stdout(), /mcp_registry_hash: sha256:[a-f0-9]{64}/);
    assert.match(harness.stdout(), /mcp_pending_schema_changes: none/);
    assert.match(harness.stdout(), /mcp_profile: profile=openrouter state=disabled/);
    assert.match(harness.stdout(), /hash=sha256:[a-f0-9]{64}/);
    assert.match(harness.stdout(), /history_messages: 1/);
    assert.match(harness.stdout(), /context: 1 messages, \d+B approx, budget \d+B\/\d+ messages/);
    assert.match(
      harness.stdout(),
      /session: 20260626T123456Z-test \(\/tmp\/orx-sessions\/20260626T123456Z-test\.json\)/,
    );
    assert.match(harness.stdout(), /diff_state: no edit tools observed/);
    assert.match(harness.stdout(), /latest_metadata:/);
    assert.match(harness.stdout(), /generation_id: gen-123/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("status reports concise observed edit state", () => {
  const diffState = createSessionDiffState();
  recordToolResultForDiffState(diffState, {
    toolCall: {
      id: "call_patch",
      type: "function",
      function: {
        name: "apply_patch",
        arguments: "{}",
      },
    },
    message: {
      role: "tool",
      tool_call_id: "call_patch",
      content: "{}",
    },
    output: {
      ok: true,
      changedFiles: ["a.txt", "b.txt"],
    },
    ok: true,
    durationMs: 1,
    truncation: {
      truncated: false,
      originalBytes: 0,
      returnedBytes: 0,
      originalLines: 0,
      returnedLines: 0,
      omittedBytes: 0,
      omittedLines: 0,
    },
  });
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-diff-status-"));
  const harness = createSlashHarness({
    diffState,
    mcpConfigPath: join(cwd, "profiles.json"),
  });

  try {
    assert.equal(handleSlashCommand("/status", harness.context), "continue");
    assert.match(harness.stdout(), /diff_state: 1 edit tool call, 2 files observed \(a\.txt, b\.txt\)/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

function createSlashHarness(
  options: {
    config?: OrxConfig;
    messages?: OpenRouterMessage[];
    metadata?: OpenRouterStreamMetadata;
    contextBudget?: Partial<AgentContextBudget>;
    diffState?: SessionDiffState;
    sessionInfo?: { id: string; path: string };
    cwd?: string;
    mcpAuditLogPath?: string;
    mcpConfigPath?: string;
    resumeSession?: SlashCommandContext["resumeSession"];
    fetch?: typeof fetch;
  } = {},
) {
  let stdoutText = "";
  let stderrText = "";
  let config = options.config ?? baseConfig();
  let messages = options.messages ?? [];
  let metadata = options.metadata;
  const diffState = options.diffState ?? createSessionDiffState();
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
        cwd: options.cwd ?? "/tmp/orx-test",
      },
      loadedConfig,
      fetch: options.fetch,
      getConfig: () => config,
      setConfig: (nextConfig: OrxConfig) => {
        config = nextConfig;
      },
      getMessages: () => messages,
      setMessages: (nextMessages: OpenRouterMessage[]) => {
        messages = nextMessages;
      },
      clearMessages: () => {
        messages = [];
        metadata = undefined;
      },
      getLatestMetadata: () => metadata,
      getContextBudget: () => options.contextBudget ?? {},
      getDiffState: () => diffState,
      getSessionInfo: () => options.sessionInfo,
      mcpAuditLogPath: options.mcpAuditLogPath,
      mcpConfigPath: options.mcpConfigPath,
      resumeSession: options.resumeSession,
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
    diffState: () => diffState,
    stdout: () => stdoutText,
    stderr: () => stderrText,
  };
}

function readAuditEvents(path: string): Array<{
  type: string;
  profileId?: string;
  ok: boolean;
  details: Record<string, unknown>;
}> {
  return readFileSync(path, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as {
      type: string;
      profileId?: string;
      ok: boolean;
      details: Record<string, unknown>;
    });
}

function baseConfig(): OrxConfig {
  return {
    mode: "auto",
    model: "openrouter/auto",
    apiKey: "test-key",
    permissions: {
      approvalPolicy: "never",
      sandboxMode: "danger-full-access",
    },
  };
}

function createGitRepo(): string {
  const cwd = mkdtempSync(join(tmpdir(), "orx-slash-"));
  git(cwd, "init");
  git(cwd, "config", "user.email", "orx@example.test");
  git(cwd, "config", "user.name", "ORX Test");
  return cwd;
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
  });
}
