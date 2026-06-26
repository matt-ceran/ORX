import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
  formatToolCallStart,
  formatToolResult,
  nativeToolDefinitions,
  runAgentTurn,
} from "./index.js";
import { dispatchNativeToolCall } from "./tool-dispatch.js";
import type { OrxConfig } from "../config/types.js";
import type { OpenRouterToolCall } from "../openrouter/types.js";
import type { TextTruncation } from "../tools/types.js";

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

test("tool call summaries keep large patch arguments compact", () => {
  const patch = [
    "*** Begin Patch",
    "*** Add File: secret.txt",
    "+SHOULD_NOT_APPEAR_IN_SUMMARY",
    "*** End Patch",
    "",
  ].join("\n");

  const summary = formatToolCallStart({
    id: "call_patch",
    type: "function",
    function: {
      name: "apply_patch",
      arguments: JSON.stringify({ patch }),
    },
  });

  assert.match(summary, /^\[tool\] apply_patch patch=<\d+B, 4 lines>$/);
  assert.doesNotMatch(summary, /SHOULD_NOT_APPEAR_IN_SUMMARY/);
});

test("tool result summaries show changed files after apply_patch", async () => {
  const cwd = createTempDir();
  try {
    const result = await dispatchNativeToolCall(
      {
        id: "call_patch",
        type: "function",
        function: {
          name: "apply_patch",
          arguments: JSON.stringify({
            patch: [
              "*** Begin Patch",
              "*** Add File: created.txt",
              "+created",
              "*** End Patch",
              "",
            ].join("\n"),
          }),
        },
      },
      { cwd },
    );

    assert.equal(result.ok, true);
    assert.match(
      formatToolResult(result),
      /^\[tool\] apply_patch ok duration=\d+ms changed_files=1 \["created\.txt"\]$/,
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("tool result summaries expose git_diff truncation without dumping diff text", () => {
  const summary = formatToolResult({
    toolCall: {
      id: "call_diff",
      type: "function",
      function: {
        name: "git_diff",
        arguments: "{}",
      },
    },
    message: {
      role: "tool",
      tool_call_id: "call_diff",
      content: "{}",
    },
    output: {
      ok: true,
      diff: "SHOULD_NOT_APPEAR_IN_SUMMARY",
      truncation: {
        truncated: true,
        originalBytes: 120,
        returnedBytes: 40,
        originalLines: 10,
        returnedLines: 4,
        omittedBytes: 80,
        omittedLines: 6,
      } satisfies TextTruncation,
    },
    ok: true,
    durationMs: 12,
    truncation: emptyTruncation(),
  });

  assert.match(
    summary,
    /^\[tool\] git_diff ok duration=12ms diff=40B, 4 lines diff_truncated=\(80B omitted, 6 lines omitted\)$/,
  );
  assert.doesNotMatch(summary, /SHOULD_NOT_APPEAR_IN_SUMMARY/);
});

test("tool result summaries show shell exit and stream truncation details", async () => {
  const result = await dispatchNativeToolCall(
    {
      id: "call_shell",
      type: "function",
      function: {
        name: "shell",
        arguments: JSON.stringify({
          command: process.execPath,
          args: ["-e", "process.stdout.write('abcdef'); process.stderr.write('ghijkl'); process.exit(7)"],
          shell: false,
          maxBytes: 3,
        }),
      },
    },
    { cwd: process.cwd() },
  );

  const summary = formatToolResult(result);

  assert.equal(result.ok, true);
  assert.match(summary, /\[tool\] shell ok duration=\d+ms exit=7/);
  assert.match(summary, /stdout_truncated=\(3B omitted/);
  assert.match(summary, /stderr_truncated=\(3B omitted/);
  assert.doesNotMatch(summary, /abcdef/);
  assert.doesNotMatch(summary, /ghijkl/);
});

test("tool result summaries show failed tool error codes", async () => {
  const result = await dispatchNativeToolCall(
    {
      id: "call_missing",
      type: "function",
      function: {
        name: "read_file",
        arguments: JSON.stringify({
          path: "definitely-missing.txt",
        }),
      },
    },
    { cwd: process.cwd() },
  );

  assert.equal(result.ok, false);
  assert.match(formatToolResult(result), /\[tool\] read_file failed duration=\d+ms error=ENOENT/);
});

test("tool result summaries show read_file content truncation", async () => {
  const cwd = createTempDir();
  try {
    writeFileSync(join(cwd, "sample.txt"), "abcdef");
    const result = await dispatchNativeToolCall(
      {
        id: "call_read",
        type: "function",
        function: {
          name: "read_file",
          arguments: JSON.stringify({
            path: "sample.txt",
            maxBytes: 2,
          }),
        },
      },
      { cwd },
    );

    const summary = formatToolResult(result);

    assert.equal(result.ok, true);
    assert.match(summary, /\[tool\] read_file ok duration=\d+ms content_truncated=\(4B omitted\)/);
    assert.doesNotMatch(summary, /abcdef/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
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

function emptyTruncation(): TextTruncation {
  return {
    truncated: false,
    originalBytes: 0,
    returnedBytes: 0,
    originalLines: 0,
    returnedLines: 0,
    omittedBytes: 0,
    omittedLines: 0,
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

function sse(value: unknown): string {
  return `data: ${JSON.stringify(value)}\n\n`;
}
