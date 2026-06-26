import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { COMPACTED_CONTEXT_PROVENANCE } from "../agent/index.js";
import type { LoadedConfig } from "../config/types.js";
import { createSessionRecord, saveSessionRecord } from "../sessions/index.js";
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

test("chat resumes a saved session and continues with restored transcript and routing", async () => {
  const sessionDirectory = mkdtempSync(join(tmpdir(), "orx-chat-sessions-"));
  const savedCwd = mkdtempSync(join(tmpdir(), "orx-chat-resume-cwd-"));
  const startCwd = mkdtempSync(join(tmpdir(), "orx-chat-start-cwd-"));
  const requests: Array<{
    model: string;
    messages: Array<{ role: string; content: string | null }>;
    plugins?: Array<{ id: string; preset?: string }>;
  }> = [];

  try {
    const record = await createSessionRecord({
      id: "20260626T120000Z-resume",
      cwd: savedCwd,
      activeConfig: {
        ...baseLoadedConfig().config,
        mode: "fusion",
        model: "openrouter/fusion",
        fusionPreset: "general-budget",
      },
      messages: [
        { role: "user", content: "Original task" },
        { role: "assistant", content: "Original answer" },
      ],
      latestMetadata: {
        requestedModel: "openrouter/fusion",
        resolvedModel: "example/fusion",
        cost: 0.0025,
      },
      now: new Date("2026-06-26T12:00:00.000Z"),
      git: undefined,
    });
    await saveSessionRecord(record, { sessionDir: sessionDirectory });
    for (let index = 0; index < 22; index += 1) {
      const minute = String(10 + index).padStart(2, "0");
      const emptyRecord = await createSessionRecord({
        id: `20260626T12${minute}00Z-empty${index}`,
        cwd: savedCwd,
        activeConfig: baseLoadedConfig().config,
        now: new Date(`2026-06-26T12:${minute}:00.000Z`),
        git: undefined,
      });
      await saveSessionRecord(emptyRecord, { sessionDir: sessionDirectory });
    }

    const capture = createIo({
      stdin: Readable.from(["/resume\n", "/resume 1\n", "/status\n", "Follow up\n", "/exit\n"]),
      cwd: startCwd,
      fetch: async (_input, init) => {
        const body = JSON.parse(String(init?.body));
        requests.push({
          model: body.model,
          messages: body.messages,
          plugins: body.plugins,
        });

        return new Response(
          streamFrom([
            'data: {"model":"example/fusion","choices":[{"delta":{"content":"Resumed answer"}}]}\n\n',
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
    });

    assert.equal(exitCode, 0);
    assert.equal(requests.length, 1);
    assert.deepEqual(requests[0], {
      model: "openrouter/fusion",
      messages: [
        { role: "user", content: "Original task" },
        { role: "assistant", content: "Original answer" },
        { role: "user", content: "Follow up" },
      ],
      plugins: [{ id: "fusion", preset: "general-budget" }],
    });
    assert.match(capture.stdout(), /Saved sessions:/);
    assert.match(capture.stdout(), /1\. 20260626T120000Z-resume/);
    assert.match(capture.stdout(), /Resumed session 20260626T120000Z-resume/);
    assert.match(capture.stdout(), new RegExp(`cwd: ${escapeRegExp(savedCwd)}`));
    assert.match(capture.stdout(), /history_messages: 2/);
    assert.match(capture.stdout(), /latest_metadata:/);
    assert.match(capture.stdout(), /cost: \$0\.002500/);
    assert.match(capture.stdout(), /assistant: Resumed answer/);
    assert.equal(capture.stderr(), "");

    const saved = JSON.parse(
      readFileSync(join(sessionDirectory, "20260626T120000Z-resume.json"), "utf8"),
    ) as {
      activeConfig: { mode: string; model: string; fusionPreset?: string };
      messageCount: number;
      latestMetadata?: { requestedModel: string; resolvedModel?: string };
    };
    assert.equal(saved.activeConfig.mode, "fusion");
    assert.equal(saved.activeConfig.model, "openrouter/fusion");
    assert.equal(saved.activeConfig.fusionPreset, "general-budget");
    assert.equal(saved.messageCount, 4);
    assert.equal(saved.latestMetadata?.requestedModel, "openrouter/fusion");
    assert.equal(saved.latestMetadata?.resolvedModel, "example/fusion");
  } finally {
    rmSync(startCwd, { recursive: true, force: true });
    rmSync(savedCwd, { recursive: true, force: true });
    rmSync(sessionDirectory, { recursive: true, force: true });
  }
});

test("chat resumes an exact session id outside the recent display window", async () => {
  const sessionDirectory = mkdtempSync(join(tmpdir(), "orx-chat-sessions-"));
  const savedCwd = mkdtempSync(join(tmpdir(), "orx-chat-resume-old-cwd-"));
  const requests: Array<{
    model: string;
    messages: Array<{ role: string; content: string | null }>;
  }> = [];

  try {
    const target = await createSessionRecord({
      id: "20260626T100000Z-target",
      cwd: savedCwd,
      activeConfig: {
        ...baseLoadedConfig().config,
        mode: "exact",
        model: "example/old-target",
      },
      messages: [
        { role: "user", content: "Old target task" },
        { role: "assistant", content: "Old target answer" },
      ],
      now: new Date("2026-06-26T10:00:00.000Z"),
      git: undefined,
    });
    await saveSessionRecord(target, { sessionDir: sessionDirectory });

    for (let index = 0; index < 21; index += 1) {
      const minute = String(index).padStart(2, "0");
      const newer = await createSessionRecord({
        id: `20260626T12${minute}00Z-newer${index}`,
        cwd: savedCwd,
        activeConfig: baseLoadedConfig().config,
        messages: [{ role: "user", content: `Newer task ${index}` }],
        now: new Date(`2026-06-26T12:${minute}:00.000Z`),
        git: undefined,
      });
      await saveSessionRecord(newer, { sessionDir: sessionDirectory });
    }

    const capture = createIo({
      stdin: Readable.from(["/resume 20260626T100000Z-target\n", "Continue old\n", "/exit\n"]),
      fetch: async (_input, init) => {
        const body = JSON.parse(String(init?.body));
        requests.push({
          model: body.model,
          messages: body.messages,
        });

        return new Response(
          streamFrom([
            'data: {"model":"example/old-target","choices":[{"delta":{"content":"Old continued"}}]}\n\n',
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
    });

    assert.equal(exitCode, 0);
    assert.equal(requests.length, 1);
    assert.deepEqual(requests[0], {
      model: "example/old-target",
      messages: [
        { role: "user", content: "Old target task" },
        { role: "assistant", content: "Old target answer" },
        { role: "user", content: "Continue old" },
      ],
    });
    assert.match(capture.stdout(), /Resumed session 20260626T100000Z-target/);
    assert.match(capture.stdout(), /assistant: Old continued/);
    assert.equal(capture.stderr(), "");
  } finally {
    rmSync(savedCwd, { recursive: true, force: true });
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
