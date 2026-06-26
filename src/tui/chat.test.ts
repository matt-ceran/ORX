import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { COMPACTED_CONTEXT_PROVENANCE } from "../agent/index.js";
import type { LoadedConfig } from "../config/types.js";
import { runChat } from "./chat.js";

const encoder = new TextEncoder();

test("chat bounds in-process history before later turns", async () => {
  const requests: Array<{ messages: Array<{ role: string; content: string | null }> }> = [];
  let callCount = 0;
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
  assert.equal(capture.stderr(), "");
});

function createIo(options: { fetch: typeof fetch; stdin: NodeJS.ReadableStream }) {
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
      cwd: "/tmp/orx-chat-test",
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
