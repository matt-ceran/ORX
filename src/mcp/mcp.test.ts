import test from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  OPENROUTER_MCP_PROFILE,
  discoverMcpProfile,
  evaluateMcpToolPolicy,
  formatMcpDiscoveryResult,
  getMcpStatusSummary,
  getMcpProfileToolPolicyReport,
  hashMcpProfile,
  loadMcpProfilesConfig,
  renderMcpProfileTools,
  redactSecrets,
  saveMcpProfilesConfig,
  setMcpProfilePersistentState,
  writeMcpAuditEvent,
  type McpProfile,
} from "./index.js";

test("openrouter mcp profile declares current official tools and billable chat-send", () => {
  assert.deepEqual(
    OPENROUTER_MCP_PROFILE.tools.map((tool) => tool.name),
    [
      "models-list",
      "model-get",
      "model-endpoints",
      "providers-list",
      "rankings-daily",
      "app-rankings",
      "credits-get",
      "generation-get",
      "benchmarks",
      "docs-search",
      "view-skill",
      "ping",
      "chat-send",
    ],
  );
  assert.deepEqual(
    OPENROUTER_MCP_PROFILE.tools.filter((tool) => tool.billable).map((tool) => tool.name),
    ["chat-send"],
  );
  assert.equal(OPENROUTER_MCP_PROFILE.transport.kind, "remote-http");
  assert.equal(OPENROUTER_MCP_PROFILE.transport.url, "https://mcp.openrouter.ai/mcp");
});

test("mcp profile hashing is deterministic and excludes runtime state", () => {
  const first = hashMcpProfile(OPENROUTER_MCP_PROFILE);
  const second = hashMcpProfile({
    ...OPENROUTER_MCP_PROFILE,
    state: "enabled",
    tools: [...OPENROUTER_MCP_PROFILE.tools].reverse(),
  });

  assert.equal(first, second);
  assert.match(first, /^sha256:[a-f0-9]{64}$/);
});

test("mcp profile hash changes when declared tool metadata changes", () => {
  const changed: McpProfile = {
    ...OPENROUTER_MCP_PROFILE,
    tools: OPENROUTER_MCP_PROFILE.tools.map((tool) =>
      tool.name === "chat-send" ? { ...tool, billable: false, risk: "read" } : tool,
    ),
  };

  assert.notEqual(hashMcpProfile(changed), hashMcpProfile(OPENROUTER_MCP_PROFILE));
});

test("mcp profile hash changes when operator-facing notes change", () => {
  const changed: McpProfile = {
    ...OPENROUTER_MCP_PROFILE,
    notes: "Changed trust guidance.",
  };

  assert.notEqual(hashMcpProfile(changed), hashMcpProfile(OPENROUTER_MCP_PROFILE));
});

test("mcp profile hashing is deterministic for duplicate declared tool names", () => {
  const profile: McpProfile = {
    ...OPENROUTER_MCP_PROFILE,
    tools: [
      { name: "duplicate", risk: "read", authRequired: true, billable: false },
      { name: "duplicate", risk: "billable", authRequired: true, billable: true },
    ],
  };

  assert.equal(hashMcpProfile(profile), hashMcpProfile({ ...profile, tools: [...profile.tools].reverse() }));
});

test("mcp persistent profile config stores only state and trusted hash baseline", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-config-"));
  const configPath = join(cwd, "mcp", "profiles.json");
  try {
    const result = setMcpProfilePersistentState("openrouter", "enabled", {
      configPath,
      now: () => new Date("2026-06-26T12:00:00.000Z"),
    });

    assert.equal(result.ok, true);
    assert.equal(result.nextState, "enabled");
    assert.equal(result.trustedProfileHash, hashMcpProfile(OPENROUTER_MCP_PROFILE));

    const raw = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
    assert.deepEqual(Object.keys(raw).sort(), ["profiles", "version"]);
    const profiles = raw.profiles as Record<string, Record<string, unknown>>;
    assert.deepEqual(Object.keys(profiles.openrouter).sort(), [
      "id",
      "state",
      "trustedProfileHash",
      "updatedAt",
    ]);
    assert.equal(profiles.openrouter.id, "openrouter");
    assert.equal(profiles.openrouter.state, "enabled");
    assert.equal(profiles.openrouter.trustedProfileHash, hashMcpProfile(OPENROUTER_MCP_PROFILE));
    assert.equal(profiles.openrouter.updatedAt, "2026-06-26T12:00:00.000Z");

    const loaded = loadMcpProfilesConfig({ configPath });
    assert.equal(loaded.profiles.openrouter.state, "enabled");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("mcp disabling persists disabled state and keeps trusted hash visible", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-disable-config-"));
  const configPath = join(cwd, "mcp", "profiles.json");
  try {
    setMcpProfilePersistentState("openrouter", "enabled", {
      configPath,
      now: () => new Date("2026-06-26T12:00:00.000Z"),
    });
    const result = setMcpProfilePersistentState("openrouter", "disabled", {
      configPath,
      now: () => new Date("2026-06-26T12:05:00.000Z"),
    });

    assert.equal(result.ok, true);
    assert.equal(result.nextState, "disabled");
    assert.equal(result.trustedProfileHash, hashMcpProfile(OPENROUTER_MCP_PROFILE));

    const summary = getMcpStatusSummary({ configPath });
    assert.deepEqual(summary.activeProfileIds, []);
    assert.equal(summary.trustedProfileHashes.openrouter, hashMcpProfile(OPENROUTER_MCP_PROFILE));
    assert.equal(summary.profileUpdatedAt.openrouter, "2026-06-26T12:05:00.000Z");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("mcp disabling without prior trust does not create a trusted hash baseline", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-disable-untrusted-"));
  const configPath = join(cwd, "mcp", "profiles.json");
  try {
    const result = setMcpProfilePersistentState("openrouter", "disabled", {
      configPath,
      now: () => new Date("2026-06-26T12:00:00.000Z"),
    });

    assert.equal(result.ok, true);
    assert.equal(result.nextState, "disabled");
    assert.equal(result.trustedProfileHash, undefined);

    const loaded = loadMcpProfilesConfig({ configPath });
    assert.equal(loaded.profiles.openrouter.state, "disabled");
    assert.equal(loaded.profiles.openrouter.trustedProfileHash, undefined);
    assert.doesNotMatch(readFileSync(configPath, "utf8"), /trustedProfileHash/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("mcp status counts pending schema changes against trusted baselines", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-pending-config-"));
  const configPath = join(cwd, "mcp", "profiles.json");
  try {
    saveMcpProfilesConfig(
      {
        version: 1,
        profiles: {
          openrouter: {
            id: "openrouter",
            state: "enabled",
            trustedProfileHash: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
            updatedAt: "2026-06-26T12:00:00.000Z",
          },
        },
      },
      { configPath },
    );

    const summary = getMcpStatusSummary({ configPath });
    assert.equal(summary.pendingSchemaChangeCount, 1);
    assert.deepEqual(summary.pendingSchemaChangeProfileIds, ["openrouter"]);
    assert.equal(summary.activeProfileIds[0], "openrouter");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("mcp tool policy blocks disabled profiles without network", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-policy-disabled-"));
  const configPath = join(cwd, "mcp", "profiles.json");
  try {
    const evaluation = evaluateMcpToolPolicy("openrouter", "models-list", { configPath });
    const report = getMcpProfileToolPolicyReport("openrouter", { configPath });

    assert.equal(evaluation.decision, "blocked_by_profile");
    assert.equal(evaluation.reason, "profile is disabled");
    assert.equal(report?.evaluations.length, OPENROUTER_MCP_PROFILE.tools.length);
    assert.equal(
      report?.evaluations.every((candidate) => candidate.decision === "blocked_by_profile"),
      true,
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("mcp tool policy allows enabled trusted read tools and denies billable chat-send", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-policy-enabled-"));
  const configPath = join(cwd, "mcp", "profiles.json");
  try {
    setMcpProfilePersistentState("openrouter", "enabled", { configPath });

    const readTool = evaluateMcpToolPolicy("openrouter", "models-list", { configPath });
    const chatSend = evaluateMcpToolPolicy("openrouter", "chat-send", { configPath });
    const explicitlyAllowedChatSend = evaluateMcpToolPolicy("openrouter", "chat-send", {
      configPath,
      futureAllowedToolIds: ["openrouter/chat-send"],
    });
    const summary = getMcpStatusSummary({ configPath });

    assert.equal(readTool.decision, "allowed");
    assert.equal(readTool.reason, "read-only declared tool on enabled trusted profile");
    assert.equal(chatSend.decision, "denied");
    assert.match(chatSend.reason, /billable MCP tools require an explicit future allowlist/);
    assert.equal(chatSend.tool?.billable, true);
    assert.equal(explicitlyAllowedChatSend.decision, "allowed");
    assert.equal(
      explicitlyAllowedChatSend.reason,
      "explicit future allowlist permits this MCP tool",
    );
    assert.equal(summary.policyAllowedToolCount, 12);
    assert.equal(summary.policyDeniedToolCount, 1);
    assert.equal(summary.configuredDeniedToolCount, 1);
    assert.equal(summary.configuredRiskyToolCount, 1);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("mcp tool policy blocks pending schema changes before tool risk checks", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-policy-pending-"));
  const configPath = join(cwd, "mcp", "profiles.json");
  try {
    saveMcpProfilesConfig(
      {
        version: 1,
        profiles: {
          openrouter: {
            id: "openrouter",
            state: "enabled",
            trustedProfileHash: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
            updatedAt: "2026-06-26T12:00:00.000Z",
          },
        },
      },
      { configPath },
    );

    const readTool = evaluateMcpToolPolicy("openrouter", "models-list", { configPath });
    const chatSend = evaluateMcpToolPolicy("openrouter", "chat-send", { configPath });
    const report = getMcpProfileToolPolicyReport("openrouter", { configPath });

    assert.equal(readTool.decision, "blocked_by_schema_change");
    assert.equal(chatSend.decision, "blocked_by_schema_change");
    assert.equal(report?.schemaChangePending, true);
    assert.equal(
      report?.evaluations.every((candidate) => candidate.decision === "blocked_by_schema_change"),
      true,
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("mcp tool policy handles unknown profile and tool safely", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-policy-unknown-"));
  const configPath = join(cwd, "mcp", "profiles.json");
  try {
    assert.equal(evaluateMcpToolPolicy("missing", "models-list", { configPath }).decision, "unknown_profile");
    assert.equal(evaluateMcpToolPolicy("openrouter", "missing-tool", { configPath }).decision, "unknown_tool");
    assert.equal(getMcpProfileToolPolicyReport("missing", { configPath }), undefined);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("mcp tools renderer includes risk auth billable and policy decisions", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-policy-render-"));
  const configPath = join(cwd, "mcp", "profiles.json");
  try {
    setMcpProfilePersistentState("openrouter", "enabled", { configPath });
    const report = getMcpProfileToolPolicyReport("openrouter", { configPath });
    assert.ok(report);

    const rendered = renderMcpProfileTools(report);
    assert.match(rendered, /MCP tools: openrouter/);
    assert.match(rendered, /remote_tool_execution: not implemented/);
    assert.match(rendered, /decisions: allowed=12 denied=1/);
    assert.match(rendered, /models-list risk=read auth=yes billable=no policy=allowed/);
    assert.match(rendered, /chat-send risk=billable auth=yes billable=yes policy=denied/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("mcp config load fails closed on malformed JSON and tightens existing modes", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-malformed-config-"));
  const configDir = join(cwd, "mcp");
  const configPath = join(configDir, "profiles.json");
  try {
    mkdirSync(configDir, { recursive: true, mode: 0o777 });
    writeFileSync(configPath, "{not-json", { mode: 0o666 });
    chmodSync(configDir, 0o777);
    chmodSync(configPath, 0o666);

    const loaded = loadMcpProfilesConfig({ configPath });
    assert.deepEqual(loaded.profiles, {});
    assert.equal(statSync(configDir).mode & 0o777, 0o700);
    assert.equal(statSync(configPath).mode & 0o777, 0o600);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("mcp config save repairs existing loose permissions", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-save-mode-"));
  const configDir = join(cwd, "mcp");
  const configPath = join(configDir, "profiles.json");
  try {
    mkdirSync(configDir, { recursive: true, mode: 0o777 });
    writeFileSync(configPath, "{}\n", { mode: 0o666 });
    chmodSync(configDir, 0o777);
    chmodSync(configPath, 0o666);

    saveMcpProfilesConfig(emptyConfigWithOpenRouter(), { configPath });
    assert.equal(statSync(configDir).mode & 0o777, 0o700);
    assert.equal(statSync(configPath).mode & 0o777, 0o600);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("mcp config loader drops unrelated fields instead of preserving secrets", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-secret-config-"));
  const configPath = join(cwd, "profiles.json");
  try {
    writeFileSync(
      configPath,
      JSON.stringify({
        version: 1,
        apiKey: "sk-or-v1-secret",
        profiles: {
          openrouter: {
            id: "openrouter",
            state: "enabled",
            trustedProfileHash: hashMcpProfile(OPENROUTER_MCP_PROFILE),
            updatedAt: "2026-06-26T12:00:00.000Z",
            token: "secret",
          },
        },
      }),
    );

    const loaded = loadMcpProfilesConfig({ configPath });
    assert.deepEqual(Object.keys(loaded.profiles.openrouter).sort(), [
      "id",
      "state",
      "trustedProfileHash",
      "updatedAt",
    ]);
    assert.doesNotMatch(JSON.stringify(loaded), /sk-or-v1-secret|token|secret/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

function emptyConfigWithOpenRouter() {
  return {
    version: 1 as const,
    profiles: {
      openrouter: {
        id: "openrouter",
        state: "disabled" as const,
        updatedAt: "2026-06-26T12:00:00.000Z",
      },
    },
  };
}

test("mcp audit JSONL writes redacted event shape", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-audit-"));
  const auditLogPath = join(cwd, "audit", "mcp.jsonl");
  try {
    writeMcpAuditEvent(
      {
        type: "mcp.profile.inspect",
        profileId: "openrouter",
        ok: true,
        details: {
          authorization: "Bearer sk-or-v1-secret",
          url: "https://example.test/?token=plain-token&safe=ok&api_key=abc123",
          nested: {
            apiKey: "sk-or-v1-nested",
          },
        },
      },
      {
        auditLogPath,
        now: () => new Date("2026-06-26T12:00:00.000Z"),
      },
    );

    const lines = readFileSync(auditLogPath, "utf8").trim().split("\n");
    assert.equal(lines.length, 1);
    const event = JSON.parse(lines[0]) as {
      timestamp: string;
      type: string;
      profileId: string;
      ok: boolean;
      details: Record<string, unknown>;
    };
    assert.equal(event.timestamp, "2026-06-26T12:00:00.000Z");
    assert.equal(event.type, "mcp.profile.inspect");
    assert.equal(event.profileId, "openrouter");
    assert.equal(event.ok, true);
    assert.equal(event.details.authorization, "[redacted]");
    assert.equal(event.details.url, "https://example.test/?token=[redacted]&safe=ok&api_key=[redacted]");
    assert.deepEqual(event.details.nested, { apiKey: "[redacted]" });
    assert.doesNotMatch(
      JSON.stringify(event),
      /sk-or-v1-secret|plain-token|abc123|sk-or-v1-nested/,
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("mcp redaction handles bearer strings and sensitive object keys", () => {
  assert.deepEqual(
    redactSecrets({
      message: "Authorization: Bearer sk-or-v1-test",
      password: "plain",
      nested: [{ token: "abc" }],
    }),
    {
      message: "Authorization: Bearer [redacted]",
      password: "[redacted]",
      nested: [{ token: "[redacted]" }],
    },
  );
});

test("mcp discovery does not fetch disabled profiles", async () => {
  let fetchCalls = 0;
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-discovery-disabled-"));
  const configPath = join(cwd, "mcp", "profiles.json");
  try {
    const result = await discoverMcpProfile("openrouter", {
      configPath,
      fetch: async () => {
        fetchCalls += 1;
        throw new Error("fetch should not be called");
      },
    });

    assert.equal(fetchCalls, 0);
    assert.equal(result.status, "disabled");
    assert.equal(result.networkAttempted, false);
    assert.match(formatMcpDiscoveryResult(result), /Enable and trust it with \/mcp enable openrouter/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("mcp discovery does not fetch enabled profiles without trusted hash baseline", async () => {
  let fetchCalls = 0;
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-discovery-untrusted-"));
  const configPath = join(cwd, "mcp", "profiles.json");
  try {
    saveMcpProfilesConfig(
      {
        version: 1,
        profiles: {
          openrouter: {
            id: "openrouter",
            state: "enabled",
            updatedAt: "2026-06-26T12:00:00.000Z",
          },
        },
      },
      { configPath },
    );

    const result = await discoverMcpProfile("openrouter", {
      configPath,
      fetch: async () => {
        fetchCalls += 1;
        throw new Error("fetch should not be called");
      },
    });

    assert.equal(fetchCalls, 0);
    assert.equal(result.status, "untrusted");
    assert.equal(result.networkAttempted, false);
    assert.match(result.message, /no trusted profile hash baseline/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("mcp discovery does not fetch profiles with pending schema changes", async () => {
  let fetchCalls = 0;
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-discovery-pending-"));
  const configPath = join(cwd, "mcp", "profiles.json");
  try {
    saveMcpProfilesConfig(
      {
        version: 1,
        profiles: {
          openrouter: {
            id: "openrouter",
            state: "enabled",
            trustedProfileHash: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
            updatedAt: "2026-06-26T12:00:00.000Z",
          },
        },
      },
      { configPath },
    );

    const result = await discoverMcpProfile("openrouter", {
      configPath,
      fetch: async () => {
        fetchCalls += 1;
        throw new Error("fetch should not be called");
      },
    });

    assert.equal(fetchCalls, 0);
    assert.equal(result.status, "schema_change_pending");
    assert.equal(result.schemaChangePending, true);
    assert.equal(result.networkAttempted, false);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("mcp discovery calls provided fetch for enabled trusted remote-http profile", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-discovery-ok-"));
  const configPath = join(cwd, "mcp", "profiles.json");
  const seenRequests: Array<{ url: string; method?: string; accept?: string | null; body?: string }> =
    [];
  try {
    setMcpProfilePersistentState("openrouter", "enabled", {
      configPath,
      now: () => new Date("2026-06-26T12:00:00.000Z"),
    });

    const result = await discoverMcpProfile("openrouter", {
      configPath,
      fetch: async (input, init) => {
        seenRequests.push({
          url: String(input),
          method: init?.method,
          accept:
            init?.headers instanceof Headers
              ? init.headers.get("accept")
              : ((init?.headers as Record<string, string> | undefined)?.Accept ?? null),
          body: String(init?.body),
        });
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: "orx-discovery-1",
            result: {
              protocolVersion: "2025-03-26",
              capabilities: {
                tools: {},
                resources: {},
              },
              serverInfo: {
                name: "openrouter",
                version: "test",
              },
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      },
    });

    assert.equal(seenRequests.length, 1);
    assert.equal(seenRequests[0].url, "https://mcp.openrouter.ai/mcp");
    assert.equal(seenRequests[0].method, "POST");
    assert.equal(seenRequests[0].accept, "application/json");
    assert.match(seenRequests[0].body ?? "", /"method":"initialize"/);
    assert.equal(result.status, "ok");
    assert.equal(result.networkAttempted, true);
    assert.equal(result.serverInfo?.name, "openrouter");
    assert.deepEqual(result.capabilityKeys, ["resources", "tools"]);
    assert.match(formatMcpDiscoveryResult(result), /tool_execution: not implemented/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("mcp discovery rejects malformed JSON-RPC initialize responses", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-discovery-invalid-"));
  const configPath = join(cwd, "mcp", "profiles.json");
  try {
    setMcpProfilePersistentState("openrouter", "enabled", { configPath });

    const result = await discoverMcpProfile("openrouter", {
      configPath,
      fetch: async () =>
        new Response(JSON.stringify({ result: { protocolVersion: "2025-03-26" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    });

    assert.equal(result.status, "invalid_response");
    assert.equal(result.networkAttempted, true);
    assert.match(result.message, /invalid JSON-RPC initialize response/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("mcp discovery bounds remote-controlled initialize fields", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-discovery-bounds-"));
  const configPath = join(cwd, "mcp", "profiles.json");
  const long = "x".repeat(500);
  try {
    setMcpProfilePersistentState("openrouter", "enabled", { configPath });

    const result = await discoverMcpProfile("openrouter", {
      configPath,
      fetch: async () =>
        new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: "orx-discovery-1",
            result: {
              protocolVersion: long,
              capabilities: Object.fromEntries(
                Array.from({ length: 25 }, (_, index) => [`cap-${index}-${long}`, {}]),
              ),
              serverInfo: {
                name: `openrouter-${long}`,
                version: long,
              },
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
    });

    assert.equal(result.status, "ok");
    assert.ok((result.serverInfo?.name?.length ?? 0) <= 160);
    assert.ok((result.serverInfo?.version?.length ?? 0) <= 160);
    assert.ok((result.protocolVersion?.length ?? 0) <= 160);
    assert.ok((result.capabilityKeys?.length ?? 0) <= 20);
    assert.ok(result.capabilityKeys?.every((key) => key.length <= 160));
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("mcp discovery treats 401 and 403 as auth-required without leaking response body", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-discovery-auth-"));
  const configPath = join(cwd, "mcp", "profiles.json");
  try {
    setMcpProfilePersistentState("openrouter", "enabled", { configPath });

    const result = await discoverMcpProfile("openrouter", {
      configPath,
      fetch: async () => new Response("Bearer sk-or-v1-secret", { status: 401 }),
    });
    const formatted = formatMcpDiscoveryResult(result);

    assert.equal(result.status, "auth_required");
    assert.equal(result.httpStatus, 401);
    assert.equal(result.networkAttempted, true);
    assert.doesNotMatch(JSON.stringify(result), /sk-or-v1-secret/);
    assert.doesNotMatch(formatted, /sk-or-v1-secret/);
    assert.match(formatted, /OAuth or a dedicated expiring MCP key/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("mcp discovery sanitizes network errors", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-discovery-network-error-"));
  const configPath = join(cwd, "mcp", "profiles.json");
  try {
    setMcpProfilePersistentState("openrouter", "enabled", { configPath });

    const result = await discoverMcpProfile("openrouter", {
      configPath,
      fetch: async () => {
        throw new Error("failed with Authorization: Bearer sk-or-v1-secret");
      },
    });

    assert.equal(result.status, "network_error");
    assert.equal(result.networkAttempted, true);
    assert.match(result.error ?? "", /\[redacted\]/);
    assert.ok((result.error?.length ?? 0) <= 500);
    assert.doesNotMatch(formatMcpDiscoveryResult(result), /sk-or-v1-secret/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("mcp discovery bounds long thrown network errors", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-discovery-long-network-error-"));
  const configPath = join(cwd, "mcp", "profiles.json");
  try {
    setMcpProfilePersistentState("openrouter", "enabled", { configPath });

    const result = await discoverMcpProfile("openrouter", {
      configPath,
      fetch: async () => {
        throw new Error("x".repeat(2_000));
      },
    });

    assert.equal(result.status, "network_error");
    assert.ok((result.error?.length ?? 0) <= 500);
    assert.ok(formatMcpDiscoveryResult(result).length < 1_500);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
