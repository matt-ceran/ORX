import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { nativeToolDefinitions, runAgentTurn } from "./index.js";
import { dispatchNativeToolCall } from "./tool-dispatch.js";
import type { OrxConfig } from "../config/types.js";
import type { OpenRouterToolCall } from "../openrouter/types.js";

const encoder = new TextEncoder();

const baseConfig: OrxConfig = {
  mode: "auto",
  model: "openrouter/auto",
  permissions: {
    approvalPolicy: "never",
    sandboxMode: "danger-full-access",
  },
};

test("native tool schemas expose the local coding tool surface", () => {
  assert.deepEqual(
    nativeToolDefinitions.map((tool) => tool.function.name).sort(),
    ["apply_patch", "git_diff", "list_files", "read_file", "search_files", "shell"],
  );
});

test("dispatchNativeToolCall returns bounded tool result messages", async () => {
  const cwd = createTempDir();
  try {
    writeFileSync(join(cwd, "sample.txt"), "alpha\nbeta\n");
    const toolCall: OpenRouterToolCall = {
      id: "call_1",
      type: "function",
      function: {
        name: "read_file",
        arguments: JSON.stringify({
          path: "sample.txt",
          maxBytes: 5,
        }),
      },
    };

    const result = await dispatchNativeToolCall(toolCall, {
      cwd,
      maxResultBytes: 10_000,
    });

    assert.equal(result.ok, true);
    assert.equal(result.message.role, "tool");
    assert.equal(result.message.tool_call_id, "call_1");

    const envelope = JSON.parse(String(result.message.content));
    assert.equal(envelope.tool, "read_file");
    assert.equal(envelope.ok, true);
    assert.equal(envelope.output_format, "json");

    const output = JSON.parse(envelope.output);
    assert.equal(output.ok, true);
    assert.equal(output.content, "alpha");
    assert.equal(output.truncation.truncated, true);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("dispatchNativeToolCall reports invalid arguments as tool errors", async () => {
  const result = await dispatchNativeToolCall(
    {
      id: "call_bad",
      type: "function",
      function: {
        name: "read_file",
        arguments: "{",
      },
    },
    {
      cwd: process.cwd(),
    },
  );

  assert.equal(result.ok, false);
  const envelope = JSON.parse(String(result.message.content));
  const output = JSON.parse(envelope.output);
  assert.equal(output.ok, false);
  assert.equal(output.error.code, "INVALID_TOOL_ARGUMENT_JSON");
});

test("runAgentTurn executes model-requested tools and continues to final answer", async () => {
  const cwd = createTempDir();
  const requests: unknown[] = [];
  const toolNames: string[] = [];
  let fetchCount = 0;

  try {
    writeFileSync(join(cwd, "sample.txt"), "alpha from tool\n");

    const mockFetch: typeof fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      requests.push(body);
      fetchCount += 1;

      if (fetchCount === 1) {
        assert.deepEqual(
          body.tools.map((tool: { function: { name: string } }) => tool.function.name).sort(),
          ["apply_patch", "git_diff", "list_files", "read_file", "search_files", "shell"],
        );
        return new Response(
          streamFrom([
            sse({
              choices: [
                {
                  delta: {
                    tool_calls: [
                      {
                        index: 0,
                        id: "call_1",
                        type: "function",
                        function: {
                          name: "read_file",
                          arguments: JSON.stringify({ path: "sample.txt" }),
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
      assert.equal(body.messages.at(-1).tool_call_id, "call_1");
      return new Response(
        streamFrom([
          sse({
            choices: [
              {
                delta: {
                  content: "Read sample.txt.",
                },
              },
            ],
          }),
          "data: [DONE]\n\n",
        ]),
        { status: 200 },
      );
    };

    const result = await runAgentTurn({
      apiKey: "test-key",
      config: baseConfig,
      messages: [{ role: "user", content: "Read sample.txt" }],
      cwd,
      fetch: mockFetch,
      callbacks: {
        onToolCall(toolCall) {
          toolNames.push(toolCall.function.name);
        },
      },
    });

    assert.equal(result.assistantText, "Read sample.txt.");
    assert.deepEqual(toolNames, ["read_file"]);
    assert.equal(result.toolResults.length, 1);
    assert.equal(result.toolResults[0].ok, true);
    assert.equal(requests.length, 2);
    assert.equal(result.messages.at(-1)?.role, "assistant");
    assert.equal(result.messages.at(-1)?.content, "Read sample.txt.");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("runAgentTurn stops when tool-call iterations exceed the configured limit", async () => {
  const mockFetch: typeof fetch = async () =>
    new Response(
      streamFrom([
        sse({
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: "call_1",
                    type: "function",
                    function: {
                      name: "read_file",
                      arguments: JSON.stringify({ path: "sample.txt" }),
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

  await assert.rejects(
    runAgentTurn({
      apiKey: "test-key",
      config: baseConfig,
      messages: [{ role: "user", content: "Read sample.txt" }],
      cwd: process.cwd(),
      fetch: mockFetch,
      maxToolIterations: 0,
    }),
    /Tool-call loop exceeded 0 iterations/,
  );
});

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), "orx-agent-"));
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

function sse(value: unknown): string {
  return `data: ${JSON.stringify(value)}\n\n`;
}
