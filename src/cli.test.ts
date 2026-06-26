import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  assert.match(status.stdout(), /mcp_active_profiles: none/);
  assert.match(status.stdout(), /mcp_profile: profile=openrouter state=disabled/);
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

test("metadata CLI commands use live OpenRouter APIs", async () => {
  const seenUrls: string[] = [];
  const capture = createIo({
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
          JSON.stringify({ data: { total_credits: 12, total_usage: 3 } }),
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
              tokens_prompt: 5,
              tokens_completion: 7,
              total_cost: 0.002,
            },
          }),
          { status: 200 },
        );
      }

      throw new Error(`unexpected URL ${String(input)}`);
    },
  });
  const env = { OPENROUTER_API_KEY: "test-key" };

  assert.equal(await runCli(["node", "cli", "models", "claude"], env, capture.io), 0);
  assert.equal(await runCli(["node", "cli", "credits"], env, capture.io), 0);
  assert.equal(await runCli(["node", "cli", "generation", "gen_123"], env, capture.io), 0);

  assert.deepEqual(seenUrls, [
    "https://openrouter.ai/api/v1/models",
    "https://openrouter.ai/api/v1/credits",
    "https://openrouter.ai/api/v1/generation?id=gen_123",
  ]);
  assert.match(capture.stdout(), /OpenRouter models matching "claude": 1/);
  assert.match(capture.stdout(), /remaining: \$9\.000000/);
  assert.match(capture.stdout(), /id: gen_123/);
  assert.match(capture.stdout(), /provider: OpenAI/);
  assert.equal(capture.stderr(), "");
});

test("metadata CLI command failures are sanitized", async () => {
  const capture = createIo({
    fetch: async () => new Response("bad test-key Bearer test-key", { status: 403 }),
  });

  const exitCode = await runCli(
    ["node", "cli", "credits"],
    { OPENROUTER_API_KEY: "test-key" },
    capture.io,
  );

  assert.equal(exitCode, 1);
  assert.doesNotMatch(capture.stderr(), /test-key/);
  assert.match(capture.stderr(), /\[redacted\]/);
  assert.match(capture.stderr(), /may lack OpenRouter management permission/);
});

test("ask prints visible tool start and result summaries", async () => {
  const cwd = createTempDir();
  const patch = [
    "*** Begin Patch",
    "*** Add File: created.txt",
    "+SHOULD_NOT_APPEAR_IN_TOOL_SUMMARY",
    "*** End Patch",
    "",
  ].join("\n");
  let callCount = 0;

  try {
    const capture = createIo({
      cwd,
      fetch: async (_input, init) => {
        const body = JSON.parse(String(init?.body));
        callCount += 1;

        if (callCount === 1) {
          assert.equal(body.messages.at(-1).role, "user");
          return new Response(
            streamFrom([
              sse({
                choices: [
                  {
                    delta: {
                      tool_calls: [
                        {
                          index: 0,
                          id: "call_patch",
                          type: "function",
                          function: {
                            name: "apply_patch",
                            arguments: JSON.stringify({ patch }),
                          },
                        },
                      ],
                    },
                    finish_reason: "tool_calls",
                  },
                ],
              }),
              "data: [DONE]\n\n",
            ]),
            { status: 200 },
          );
        }

        assert.equal(body.messages.at(-1).role, "tool");
        assert.equal(body.messages.at(-1).tool_call_id, "call_patch");
        return new Response(
          streamFrom([
            sse({
              choices: [
                {
                  delta: {
                    content: "Patched.",
                  },
                },
              ],
            }),
            "data: [DONE]\n\n",
          ]),
          { status: 200 },
        );
      },
    });

    const exitCode = await runCli(
      ["node", "cli", "ask", "Create a file"],
      {
        OPENROUTER_API_KEY: "test-key",
      },
      capture.io,
    );

    assert.equal(exitCode, 0);
    assert.equal(readFileSync(join(cwd, "created.txt"), "utf8"), "SHOULD_NOT_APPEAR_IN_TOOL_SUMMARY\n");
    assert.match(capture.stdout(), /\[tool\] apply_patch patch=<\d+B, 4 lines>/);
    assert.match(
      capture.stdout(),
      /\[tool\] apply_patch ok duration=\d+ms changed_files=1 \["created\.txt"\]/,
    );
    assert.match(capture.stdout(), /Patched\./);
    assert.doesNotMatch(capture.stdout(), /\+SHOULD_NOT_APPEAR_IN_TOOL_SUMMARY/);
    assert.equal(capture.stderr(), "");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("chat streams turns, keeps history, and handles slash commands", async () => {
  const sessionDirectory = createTempDir();
  const requests: unknown[] = [];
  let callCount = 0;

  try {
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
      fetch: async (input, init) => {
        if (String(input).endsWith("/models")) {
          return new Response(
            JSON.stringify({
              data: [
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
        ORX_SESSION_DIR: sessionDirectory,
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
    assert.match(capture.stdout(), /session: \d{8}T\d{6}Z-[a-f0-9]{8}/);
    assert.match(capture.stdout(), /assistant: First reply/);
    assert.match(capture.stdout(), /history_messages: 2/);
    assert.match(capture.stdout(), /session: .*\.json\)/);
    assert.match(capture.stdout(), /Mode set to fusion/);
    assert.match(capture.stdout(), /Fusion preset set to general-budget/);
    assert.match(capture.stdout(), /OpenRouter models: 1/);
    assert.match(capture.stdout(), /anthropic\/claude-sonnet-4\.5/);
    assert.match(capture.stdout(), /New chat started/);
    assert.match(capture.stdout(), /Mode set to auto/);
    assert.match(capture.stdout(), /Exiting ORX chat/);
    assert.equal(capture.stderr(), "");

    const sessionFiles = readdirSync(sessionDirectory).filter((file) => file.endsWith(".json"));
    assert.equal(sessionFiles.length, 2);
    const sessions = sessionFiles.map(
      (file) =>
        JSON.parse(readFileSync(join(sessionDirectory, file), "utf8")) as {
          activeConfig: { mode: string; model: string; fusionPreset?: string };
          messageCount: number;
          summary: { firstUserMessage?: string };
        },
    );
    const originalSession = sessions.find(
      (session) => session.summary.firstUserMessage === "Hello",
    );
    const newSession = sessions.find(
      (session) => session.summary.firstUserMessage === "After new",
    );

    assert.equal(originalSession?.activeConfig.mode, "fusion");
    assert.equal(originalSession?.activeConfig.model, "openrouter/fusion");
    assert.equal(originalSession?.activeConfig.fusionPreset, "general-budget");
    assert.equal(originalSession?.messageCount, 4);
    assert.equal(newSession?.activeConfig.mode, "auto");
    assert.equal(newSession?.activeConfig.model, "openrouter/auto");
    assert.equal(newSession?.messageCount, 2);
  } finally {
    rmSync(sessionDirectory, { recursive: true, force: true });
  }
});

test("chat metadata slash commands do not make chat completion requests", async () => {
  const sessionDirectory = createTempDir();
  const seenUrls: string[] = [];

  try {
    const capture = createIo({
      stdin: Readable.from([
        "/models claude\n",
        "/credits\n",
        "/generation gen_123\n",
        "/mcp\n",
        "/exit\n",
      ]),
      fetch: async (input) => {
        const url = String(input);
        seenUrls.push(url);
        assert.doesNotMatch(url, /\/chat\/completions$/);

        if (url.endsWith("/models")) {
          return new Response(
            JSON.stringify({
              data: [
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

        if (url.endsWith("/credits")) {
          return new Response(
            JSON.stringify({ data: { total_credits: 5, total_usage: 1 } }),
            { status: 200 },
          );
        }

        if (url.endsWith("/generation?id=gen_123")) {
          return new Response(
            JSON.stringify({
              data: {
                id: "gen_123",
                model: "anthropic/claude-sonnet-4.5",
                provider_name: "Anthropic",
                total_cost: 0.003,
              },
            }),
            { status: 200 },
          );
        }

        throw new Error(`unexpected URL ${url}`);
      },
    });

    const exitCode = await runCli(
      ["node", "cli", "chat"],
      {
        OPENROUTER_API_KEY: "test-key",
        ORX_SESSION_DIR: sessionDirectory,
      },
      capture.io,
    );

    assert.equal(exitCode, 0);
    assert.deepEqual(seenUrls, [
      "https://openrouter.ai/api/v1/models",
      "https://openrouter.ai/api/v1/credits",
      "https://openrouter.ai/api/v1/generation?id=gen_123",
    ]);
    assert.match(capture.stdout(), /OpenRouter models matching "claude": 1/);
    assert.match(capture.stdout(), /OpenRouter credits/);
    assert.match(capture.stdout(), /OpenRouter generation/);
    assert.match(capture.stdout(), /profile=openrouter state=disabled/);
    assert.equal(capture.stderr(), "");
  } finally {
    rmSync(sessionDirectory, { recursive: true, force: true });
  }
});

test("chat prints visible tool start and result summaries", async () => {
  const cwd = createTempDir();
  const sessionDirectory = createTempDir();
  let callCount = 0;
  const patch = [
    "*** Begin Patch",
    "*** Add File: later-change.txt",
    "+dirty",
    "*** End Patch",
    "",
  ].join("\n");

  try {
    git(cwd, "init");
    git(cwd, "config", "user.email", "orx@example.test");
    git(cwd, "config", "user.name", "ORX Test");
    writeFileSync(join(cwd, "sample.txt"), "alpha from chat\n");
    git(cwd, "add", "sample.txt");
    git(cwd, "commit", "-m", "initial");

    const capture = createIo({
      cwd,
      stdin: Readable.from(["Patch sample\n", "/exit\n"]),
      fetch: async (_input, init) => {
        callCount += 1;
        const body = JSON.parse(String(init?.body));

        if (callCount === 1) {
          assert.equal(body.messages.at(-1).content, "Patch sample");
          return new Response(
            streamFrom([
              sse({
                choices: [
                  {
                    delta: {
                      tool_calls: [
                        {
                          index: 0,
                          id: "call_patch",
                          type: "function",
                          function: {
                            name: "apply_patch",
                            arguments: JSON.stringify({ patch }),
                          },
                        },
                      ],
                    },
                    finish_reason: "tool_calls",
                  },
                ],
              }),
              "data: [DONE]\n\n",
            ]),
            { status: 200 },
          );
        }

        assert.equal(body.messages.at(-1).role, "tool");
        return new Response(
          streamFrom([
            sse({
              choices: [
                {
                  delta: {
                    content: "Patched sample.",
                  },
                },
              ],
            }),
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
        ORX_SESSION_DIR: sessionDirectory,
      },
      capture.io,
    );

    assert.equal(exitCode, 0);
    assert.match(capture.stdout(), /\[tool\] apply_patch patch=<\d+B, 4 lines>/);
    assert.match(
      capture.stdout(),
      /\[tool\] apply_patch ok duration=\d+ms changed_files=1 \["later-change\.txt"\]/,
    );
    assert.match(capture.stdout(), /assistant: Patched sample\./);
    assert.equal(capture.stderr(), "");

    const sessionFiles = readdirSync(sessionDirectory).filter((file) => file.endsWith(".json"));
    assert.equal(sessionFiles.length, 1);
    const session = JSON.parse(
      readFileSync(join(sessionDirectory, sessionFiles[0]), "utf8"),
    ) as {
      git?: { dirty: boolean };
    };
    assert.equal(session.git?.dirty, true);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
    rmSync(sessionDirectory, { recursive: true, force: true });
  }
});

function createIo(options: { fetch?: typeof fetch; stdin?: NodeJS.ReadableStream; cwd?: string } = {}) {
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
      cwd: options.cwd ?? "/tmp/orx-test",
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

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), "orx-cli-"));
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
  });
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

function sse(value: unknown): string {
  return `data: ${JSON.stringify(value)}\n\n`;
}
