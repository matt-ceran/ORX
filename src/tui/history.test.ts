import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  appendChatHistoryEntry,
  chatHistoryEntriesForReadline,
  clearChatHistory,
  loadChatHistory,
  renderChatHistory,
  resolveChatHistoryPath,
} from "./history.js";

test("chat history stores bounded private prompt entries and skips unsafe input", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-chat-history-"));
  const historyPath = join(cwd, "state", "history.json");

  try {
    const first = appendChatHistoryEntry("  first prompt  ", {
      historyPath,
      now: () => new Date("2026-06-28T10:00:00Z"),
    });
    assert.equal(first.recorded, true);

    const slash = appendChatHistoryEntry("/status", { historyPath });
    assert.equal(slash.recorded, false);
    assert.equal(slash.reason, "slash_command");

    const secret = appendChatHistoryEntry("token=sk-or-v1-secret", { historyPath });
    assert.equal(secret.recorded, false);
    assert.equal(secret.reason, "secret_like");

    appendChatHistoryEntry("second prompt", {
      historyPath,
      now: () => new Date("2026-06-28T10:01:00Z"),
    });
    appendChatHistoryEntry("first prompt", {
      historyPath,
      now: () => new Date("2026-06-28T10:02:00Z"),
    });

    const entries = loadChatHistory({ historyPath });
    assert.deepEqual(entries.map((entry) => entry.text), ["first prompt", "second prompt"]);
    assert.equal(entries[0].createdAt, "2026-06-28T10:02:00.000Z");
    assert.equal(statSync(dirname(historyPath)).mode & 0o777, 0o700);
    assert.equal(statSync(historyPath).mode & 0o777, 0o600);
    assert.doesNotMatch(readFileSync(historyPath, "utf8"), /sk-or-v1-secret|\/status|cwd|sessionId/);

    const rendered = renderChatHistory(entries, { query: "second", historyPath });
    assert.match(rendered, /Prompt history matching "second"/);
    assert.match(rendered, /second prompt/);
    assert.doesNotMatch(rendered, /first prompt/);
    assert.match(rendered, /slash commands and secret-like input are skipped/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("chat history drops stale cwd and session metadata when loading", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-chat-history-stale-metadata-"));
  const historyPath = join(cwd, "history.json");

  try {
    mkdirSync(dirname(historyPath), { recursive: true });
    writeFileSync(
      historyPath,
      JSON.stringify({
        version: 1,
        entries: [
          {
            text: "old prompt",
            createdAt: "2026-06-28T10:00:00.000Z",
            cwd: "/Users/example/private-project",
            sessionId: "20260628T100000Z-private",
          },
        ],
      }),
    );

    assert.deepEqual(loadChatHistory({ historyPath }), [
      {
        text: "old prompt",
        createdAt: "2026-06-28T10:00:00.000Z",
      },
    ]);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("chat history readline preload uses single-line newest-first entries", () => {
  assert.deepEqual(
    chatHistoryEntriesForReadline([
      { text: "newest", createdAt: "2026-06-28T10:00:00.000Z" },
      { text: "multi\nline", createdAt: "2026-06-28T09:59:00.000Z" },
      { text: "older", createdAt: "2026-06-28T09:58:00.000Z" },
    ]),
    ["newest", "older"],
  );
});

test("chat history clear removes the private file without requiring it to exist", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-chat-history-clear-"));
  const historyPath = join(cwd, "history.json");

  try {
    appendChatHistoryEntry("clear me", { historyPath });
    assert.equal(loadChatHistory({ historyPath }).length, 1);
    const first = clearChatHistory({ historyPath });
    assert.equal(first.removed, true);
    assert.equal(loadChatHistory({ historyPath }).length, 0);
    const second = clearChatHistory({ historyPath });
    assert.equal(second.removed, false);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("chat history resolves override paths and refuses symlink parents", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-chat-history-symlink-"));
  const target = join(cwd, "target");
  const link = join(cwd, "link");

  try {
    mkdirSync(target, { recursive: true });
    symlinkSync(target, link, "dir");
    assert.equal(
      resolveChatHistoryPath({
        env: { ORX_CHAT_HISTORY_PATH: "relative/history.json" } as NodeJS.ProcessEnv,
        cwd,
      }),
      join(cwd, "relative", "history.json"),
    );
    assert.throws(
      () => appendChatHistoryEntry("blocked", { historyPath: join(link, "history.json") }),
      /parent path must not contain symlinks/,
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
