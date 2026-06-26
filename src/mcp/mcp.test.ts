import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  OPENROUTER_MCP_PROFILE,
  hashMcpProfile,
  redactSecrets,
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
