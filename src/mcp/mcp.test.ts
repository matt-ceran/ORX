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
  getMcpStatusSummary,
  hashMcpProfile,
  loadMcpProfilesConfig,
  redactSecrets,
  saveMcpProfilesConfig,
  setMcpProfilePersistentState,
  writeMcpAuditEvent,
  type McpProfile,
} from "./index.js";

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
