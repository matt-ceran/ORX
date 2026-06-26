import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { runCli } from "./cli.js";

const encoder = new TextEncoder();

test("help, version, and status work without an API key", async () => {
  const help = createIo();
  assert.equal(await runCli(["node", "cli", "--help"], {}, help.io), 0);
  assert.match(help.stdout(), /Commands:/);

  const version = createIo();
  assert.equal(await runCli(["node", "cli", "--version"], {}, version.io), 0);
  assert.match(version.stdout(), /\d+\.\d+\.\d+/);

  const status = createIo();
  assert.equal(await runCli(["node", "cli", "status"], {}, status.io), 0);
  assert.match(status.stdout(), /api_key_present: no/);
});

test("ask and chat require an OpenRouter API key", async () => {
  const capture = createIo();
  const exitCode = await runCli(["node", "cli", "ask", "Say hello"], {}, capture.io);

  assert.equal(exitCode, 1);
  assert.match(capture.stderr(), /OpenRouter API key not found/);

  const chat = createIo({
    stdin: Readable.from(["/exit\n"]),
  });
  const chatExitCode = await runCli(["node", "cli", "chat"], {}, chat.io);

  assert.equal(chatExitCode, 1);
  assert.match(chat.stderr(), /OpenRouter API key not found/);
});

test("ask streams text and prints compact metadata summary", async () => {
  const capture = createIo({
    fetch: async (input, init) => {
      assert.equal(String(input), "https://openrouter.ai/api/v1/chat/completions");
      assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer test-key");

      const body = JSON.parse(String(init?.body));
      assert.equal(body.model, "anthropic/claude-sonnet-4.5");
      assert.equal(body.stream, true);
      assert.deepEqual(body.messages, [{ role: "user", content: "Say hello" }]);
      assert.equal(body.plugins, undefined);
      assertNativeTools(body.tools);

      return new Response(
        streamFrom([
          'data: {"model":"anthropic/claude-sonnet-4.5","choices":[{"delta":{"content":"Hello"}}]}\n\n',
          'data: {"usage":{"prompt_tokens":2,"completion_tokens":1,"total_tokens":3,"cost":0.0001},"choices":[]}\n\n',
          "data: [DONE]\n\n",
        ]),
        {
          status: 200,
        },
      );
    },
  });

  const exitCode = await runCli(
    ["node", "cli", "ask", "Say", "hello", "--model", "anthropic/claude-sonnet-4.5"],
    {
      OPENROUTER_API_KEY: "test-key",
    },
    capture.io,
  );

  assert.equal(exitCode, 0);
  assert.match(capture.stdout(), /^Hello\nmetadata:/);
  assert.match(capture.stdout(), /requested_model: anthropic\/claude-sonnet-4\.5/);
  assert.match(capture.stdout(), /resolved_model: anthropic\/claude-sonnet-4\.5/);
  assert.match(capture.stdout(), /tokens: prompt=2, completion=1, total=3/);
  assert.match(capture.stdout(), /cost: \$0\.000100/);
  assert.equal(capture.stderr(), "");
});

test("ask supports Fusion preset override", async () => {
  const capture = createIo({
    fetch: async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.model, "openrouter/fusion");
      assert.deepEqual(body.plugins, [{ id: "fusion", preset: "general-budget" }]);
      assertNativeTools(body.tools);

      return new Response(streamFrom(["data: [DONE]\n\n"]), { status: 200 });
    },
  });

  const exitCode = await runCli(
    ["node", "cli", "ask", "Say hello", "--fusion", "general-budget"],
    {
      OPENROUTER_API_KEY: "test-key",
    },
    capture.io,
  );

  assert.equal(exitCode, 0);
  assert.match(capture.stdout(), /requested_model: openrouter\/fusion/);
});

test("chat streams turns, keeps history, and handles slash commands", async () => {
  const requests: unknown[] = [];
  let callCount = 0;
  const capture = createIo({
    stdin: Readable.from([
      "Hello\n",
      "/status\n",
      "/mode fusion\n",
      "/fusion general-budget\n",
      "/models\n",
      "Follow up\n",
      "/new\n",
      "/mode auto\n",
      "After new\n",
      "/exit\n",
    ]),
    fetch: async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      assertNativeTools(body.tools);
      delete body.tools;
      requests.push(body);
      const text = callCount === 0 ? "First reply" : "Second reply";
      callCount += 1;

      return new Response(
        streamFrom([
          `data: {"model":"${body.model}","choices":[{"delta":{"content":"${text}"}}]}\n\n`,
          "data: [DONE]\n\n",
        ]),
        { status: 200 },
      );
    },
  });

  const exitCode = await runCli(
    ["node", "cli", "chat"],
    {
      OPENROUTER_API_KEY: "test-key",
    },
    capture.io,
  );

  assert.equal(exitCode, 0);
  assert.equal(requests.length, 3);
  assert.deepEqual(requests[0], {
    model: "openrouter/auto",
    messages: [{ role: "user", content: "Hello" }],
    stream: true,
  });
  assert.deepEqual(requests[1], {
    model: "openrouter/fusion",
    messages: [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "First reply" },
      { role: "user", content: "Follow up" },
    ],
    stream: true,
    plugins: [{ id: "fusion", preset: "general-budget" }],
  });
  assert.deepEqual(requests[2], {
    model: "openrouter/auto",
    messages: [{ role: "user", content: "After new" }],
    stream: true,
  });
  assert.match(capture.stdout(), /ORX chat/);
  assert.match(capture.stdout(), /assistant: First reply/);
  assert.match(capture.stdout(), /history_messages: 2/);
  assert.match(capture.stdout(), /Mode set to fusion/);
  assert.match(capture.stdout(), /Fusion preset set to general-budget/);
  assert.match(capture.stdout(), /live_search: planned for OpenRouter MCP integration/);
  assert.match(capture.stdout(), /New chat started/);
  assert.match(capture.stdout(), /Mode set to auto/);
  assert.match(capture.stdout(), /Exiting ORX chat/);
  assert.equal(capture.stderr(), "");
});

function createIo(options: { fetch?: typeof fetch; stdin?: NodeJS.ReadableStream } = {}) {
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
      cwd: "/tmp/orx-test",
      fetch: options.fetch ?? globalThis.fetch,
    },
    stdout() {
      return stdoutText;
    },
    stderr() {
      return stderrText;
    },
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

function assertNativeTools(tools: unknown) {
  assert.equal(Array.isArray(tools), true);
  const names = (tools as Array<{ function: { name: string } }>)
    .map((tool) => tool.function.name)
    .sort();
  assert.deepEqual(names, [
    "apply_patch",
    "git_diff",
    "list_files",
    "read_file",
    "search_files",
    "shell",
  ]);
}
