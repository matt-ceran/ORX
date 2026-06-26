import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { OrxConfig } from "../config/types.js";
import {
  createSessionId,
  createSessionRecord,
  getSessionFilePath,
  listSessionRecords,
  loadSessionRecord,
  redactRemoteUrl,
  resolveGitRepositoryMetadata,
  resolveSessionDirectory,
  saveSessionRecord,
  updateSessionRecord,
} from "./index.js";

test("creates safe sortable session ids", () => {
  const id = createSessionId({
    now: new Date("2026-06-26T12:34:56.000Z"),
    random: Uint8Array.from([0xab, 0xcd, 0x01, 0x23]),
  });

  assert.equal(id, "20260626T123456Z-abcd0123");
});

test("resolves the default and ORX_SESSION_DIR session directories", () => {
  assert.equal(
    resolveSessionDirectory({
      homeDir: "/tmp/orx-home",
      env: {},
    }),
    "/tmp/orx-home/.orx/sessions",
  );

  assert.equal(
    resolveSessionDirectory({
      cwd: "/tmp/orx-cwd",
      homeDir: "/tmp/orx-home",
      env: {
        ORX_SESSION_DIR: "relative-sessions",
      },
    }),
    "/tmp/orx-cwd/relative-sessions",
  );

  assert.equal(
    resolveSessionDirectory({
      homeDir: "/tmp/orx-home",
      env: {
        ORX_SESSION_DIR: "/tmp/custom-orx-sessions",
      },
    }),
    "/tmp/custom-orx-sessions",
  );
});

test("saves and loads session JSON without persisting API keys", async () => {
  const sessionDir = mkdtempSync(join(tmpdir(), "orx-sessions-"));

  try {
    const record = await createSessionRecord({
      id: "20260626T123456Z-test",
      cwd: "/tmp/project",
      activeConfig: {
        ...baseConfig(),
        apiKey: "secret-key",
      },
      messages: [{ role: "user", content: "Build the thing" }],
      latestMetadata: {
        requestedModel: "openrouter/auto",
        resolvedModel: "example/model",
        totalTokens: 3,
        cost: 0.0001,
      },
      now: new Date("2026-06-26T12:34:56.000Z"),
      git: {
        root: "/tmp/project",
        branch: "main",
        commit: "abc123",
        dirty: true,
      },
    });

    const filePath = await saveSessionRecord(record, {
      sessionDir,
    });
    const loaded = await loadSessionRecord(filePath);
    const raw = readFileSync(filePath, "utf8");

    assert.equal(filePath, getSessionFilePath(sessionDir, "20260626T123456Z-test"));
    assert.equal(loaded.id, "20260626T123456Z-test");
    assert.equal(loaded.messageCount, 1);
    assert.equal(loaded.summary.title, "Build the thing");
    assert.equal(loaded.activeConfig.model, "openrouter/auto");
    assert.equal("apiKey" in loaded.activeConfig, false);
    assert.doesNotMatch(raw, /secret-key/);
  } finally {
    rmSync(sessionDir, { recursive: true, force: true });
  }
});

test("saves session JSON with private filesystem modes", async () => {
  const parentDir = mkdtempSync(join(tmpdir(), "orx-session-modes-"));
  const sessionDir = join(parentDir, "sessions");

  try {
    const record = await createSessionRecord({
      id: "20260626T123456Z-mode",
      cwd: "/tmp/project",
      activeConfig: baseConfig(),
      now: new Date("2026-06-26T12:34:56.000Z"),
      git: undefined,
    });

    const filePath = await saveSessionRecord(record, {
      sessionDir,
    });

    assert.equal(statSync(sessionDir).mode & 0o777, 0o700);
    assert.equal(statSync(filePath).mode & 0o777, 0o600);
  } finally {
    rmSync(parentDir, { recursive: true, force: true });
  }
});

test("tightens permissions on existing session directories", async () => {
  const parentDir = mkdtempSync(join(tmpdir(), "orx-session-existing-modes-"));
  const sessionDir = join(parentDir, "sessions");

  try {
    mkdirSync(sessionDir, { mode: 0o755 });
    chmodSync(sessionDir, 0o755);
    const record = await createSessionRecord({
      id: "20260626T123456Z-existing-mode",
      cwd: "/tmp/project",
      activeConfig: baseConfig(),
      now: new Date("2026-06-26T12:34:56.000Z"),
      git: undefined,
    });

    await saveSessionRecord(record, {
      sessionDir,
    });

    assert.equal(statSync(sessionDir).mode & 0o777, 0o700);
  } finally {
    rmSync(parentDir, { recursive: true, force: true });
  }
});

test("updates session records with active config, messages, and latest metadata", async () => {
  const record = await createSessionRecord({
    id: "20260626T123456Z-update",
    cwd: "/tmp/project",
    activeConfig: baseConfig(),
    now: new Date("2026-06-26T12:00:00.000Z"),
    git: undefined,
  });

  updateSessionRecord(record, {
    activeConfig: {
      ...baseConfig(),
      mode: "fusion",
      model: "openrouter/fusion",
      fusionPreset: "general-budget",
    },
    messages: [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi" },
    ],
    latestMetadata: {
      requestedModel: "openrouter/fusion",
      resolvedModel: "example/fusion",
      generationId: "gen-123",
    },
    now: new Date("2026-06-26T12:01:00.000Z"),
  });

  assert.equal(record.updatedAt, "2026-06-26T12:01:00.000Z");
  assert.equal(record.activeConfig.mode, "fusion");
  assert.equal(record.activeConfig.fusionPreset, "general-budget");
  assert.equal(record.messageCount, 2);
  assert.equal(record.latestMetadata?.generationId, "gen-123");
});

test("lists saved sessions newest first while excluding active and malformed records", async () => {
  const sessionDir = mkdtempSync(join(tmpdir(), "orx-session-list-"));

  try {
    const older = await createSessionRecord({
      id: "20260626T120000Z-older",
      cwd: "/tmp/project",
      activeConfig: baseConfig(),
      messages: [{ role: "user", content: "Older task" }],
      now: new Date("2026-06-26T12:00:00.000Z"),
      git: undefined,
    });
    const newer = await createSessionRecord({
      id: "20260626T130000Z-newer",
      cwd: "/tmp/project",
      activeConfig: baseConfig(),
      messages: [{ role: "user", content: "Newer task" }],
      now: new Date("2026-06-26T13:00:00.000Z"),
      git: undefined,
    });
    const active = await createSessionRecord({
      id: "20260626T140000Z-active",
      cwd: "/tmp/project",
      activeConfig: baseConfig(),
      now: new Date("2026-06-26T14:00:00.000Z"),
      git: undefined,
    });

    await saveSessionRecord(older, { sessionDir });
    await saveSessionRecord(newer, { sessionDir });
    await saveSessionRecord(active, { sessionDir });
    writeFileSync(join(sessionDir, "broken.json"), "{");

    const sessions = await listSessionRecords({
      sessionDir,
      excludeIds: [active.id],
      limit: 2,
    });

    assert.deepEqual(
      sessions.map((session) => session.id),
      [newer.id, older.id],
    );
    assert.equal(sessions[0].record.summary.title, "Newer task");
  } finally {
    rmSync(sessionDir, { recursive: true, force: true });
  }
});

test("listing missing session directories returns an empty list", async () => {
  const sessionDir = join(tmpdir(), `orx-missing-sessions-${Date.now()}`);

  assert.deepEqual(await listSessionRecords({ sessionDir }), []);
});

test("reads best-effort git repository metadata", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-session-git-"));

  try {
    git(cwd, "init");
    git(cwd, "config", "user.email", "orx@example.test");
    git(cwd, "config", "user.name", "ORX Test");
    git(cwd, "checkout", "-b", "session-test");
    writeFileSync(join(cwd, "tracked.txt"), "before\n");
    git(cwd, "add", "tracked.txt");
    git(cwd, "commit", "-m", "initial");
    writeFileSync(join(cwd, "tracked.txt"), "after\n");

    const metadata = await resolveGitRepositoryMetadata(cwd);

    assert.equal(metadata?.root, realpathSync(cwd));
    assert.equal(metadata?.branch, "session-test");
    assert.match(metadata?.commit ?? "", /^[a-f0-9]{40}$/);
    assert.equal(metadata?.dirty, true);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("redacts credential userinfo from git remote URLs", () => {
  assert.equal(
    redactRemoteUrl("https://token:secret@example.com/owner/repo.git"),
    "https://REDACTED@example.com/owner/repo.git",
  );
  assert.equal(
    redactRemoteUrl("ssh://git@example.com/owner/repo.git"),
    "ssh://git@example.com/owner/repo.git",
  );
});

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

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
  });
}
