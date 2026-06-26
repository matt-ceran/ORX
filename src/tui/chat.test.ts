import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { COMPACTED_CONTEXT_PROVENANCE } from "../agent/index.js";
import type { LoadedConfig } from "../config/types.js";
import { runChat } from "./chat.js";

const encoder = new TextEncoder();

test("chat bounds in-process history before later turns", async () => {
  const sessionDirectory = mkdtempSync(join(tmpdir(), "orx-chat-sessions-"));
  const requests: Array<{ messages: Array<{ role: string; content: string | null }> }> = [];
  let callCount = 0;

  try {
    const capture = createIo({
      stdin: Readable.from(["Hello\n", "Follow up\n", "/exit\n"]),
      fetch: async (_input, init) => {
        const body = JSON.parse(String(init?.body));
        requests.push({ messages: body.messages });
        callCount += 1;
        const text = callCount === 1 ? "First reply" : "Second reply";

        return new Response(
          streamFrom([
            `data: {"choices":[{"delta":{"content":"${text}"}}]}\n\n`,
            "data: [DONE]\n\n",
          ]),
          { status: 200 },
        );
      },
    });

    const exitCode = await runChat({
      apiKey: "test-key",
      loadedConfig: baseLoadedConfig(),
      io: capture.io,
      sessionDirectory,
      contextBudget: {
        maxBytes: 100_000,
        maxMessages: 2,
        preserveMessages: 1,
        summaryMaxBytes: 2_000,
      },
    });

    assert.equal(exitCode, 0);
    assert.equal(requests.length, 2);
    assert.deepEqual(requests[0].messages, [{ role: "user", content: "Hello" }]);
    assert.equal(requests[1].messages[0].role, "assistant");
    assert.match(String(requests[1].messages[0].content), new RegExp(COMPACTED_CONTEXT_PROVENANCE));
    assert.deepEqual(requests[1].messages.slice(1), [{ role: "user", content: "Follow up" }]);
    assert.match(capture.stdout(), /assistant: Second reply/);
    assert.match(capture.stdout(), /session: \d{8}T\d{6}Z-[a-f0-9]{8}/);
    assert.match(capture.stdout(), new RegExp(`session: .* @ ${escapeRegExp(sessionDirectory)}`));
    assert.equal(capture.stderr(), "");

    const sessionFiles = readdirSync(sessionDirectory).filter((file) => file.endsWith(".json"));
    assert.equal(sessionFiles.length, 1);
    const session = JSON.parse(
      readFileSync(join(sessionDirectory, sessionFiles[0]), "utf8"),
    ) as {
      activeConfig: { model: string };
      latestMetadata: { requestedModel: string };
      messageCount: number;
    };
    assert.equal(session.activeConfig.model, "openrouter/auto");
    assert.equal(session.latestMetadata.requestedModel, "openrouter/auto");
    assert.equal(session.messageCount, 3);
  } finally {
    rmSync(sessionDirectory, { recursive: true, force: true });
  }
});

test("chat diff command shows native working tree diff without a model request", async () => {
  const cwd = createGitRepo();
  const sessionDirectory = mkdtempSync(join(tmpdir(), "orx-chat-sessions-"));
  try {
    writeFileSync(join(cwd, "tracked.txt"), "before\n");
    git(cwd, "add", "tracked.txt");
    git(cwd, "commit", "-m", "initial");
    writeFileSync(join(cwd, "tracked.txt"), "after\n");

    const capture = createIo({
      stdin: Readable.from(["/diff\n", "/exit\n"]),
      fetch: async () => {
        throw new Error("chat /diff should not call OpenRouter.");
      },
      cwd,
    });

    const exitCode = await runChat({
      apiKey: "test-key",
      loadedConfig: baseLoadedConfig(),
      io: capture.io,
      sessionDirectory,
    });

    assert.equal(exitCode, 0);
    assert.match(capture.stdout(), /diff --git a\/tracked\.txt b\/tracked\.txt/);
    assert.match(capture.stdout(), /-before/);
    assert.match(capture.stdout(), /\+after/);
    assert.match(capture.stdout(), /Exiting ORX chat/);
    assert.equal(capture.stderr(), "");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
    rmSync(sessionDirectory, { recursive: true, force: true });
  }
});

function createIo(options: { fetch: typeof fetch; stdin: NodeJS.ReadableStream; cwd?: string }) {
  let stdoutText = "";
  let stderrText = "";

  return {
    io: {
      stdin: options.stdin,
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
      cwd: options.cwd ?? "/tmp/orx-chat-test",
      fetch: options.fetch,
    },
    stdout() {
      return stdoutText;
    },
    stderr() {
      return stderrText;
    },
  };
}

function createGitRepo(): string {
  const cwd = mkdtempSync(join(tmpdir(), "orx-chat-"));
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

function baseLoadedConfig(): LoadedConfig {
  return {
    config: {
      mode: "auto",
      model: "openrouter/auto",
      permissions: {
        approvalPolicy: "never",
        sandboxMode: "danger-full-access",
      },
    },
    loadedFiles: [],
    apiKeyPresent: true,
    apiKeySource: "OPENROUTER_API_KEY",
  };
}

function streamFrom(chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
