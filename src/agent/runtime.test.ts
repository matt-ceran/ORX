import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
  COMPACTED_CONTEXT_PROVENANCE,
  createSessionDiffState,
  formatSessionDiffState,
  formatToolCallStart,
  formatToolResult,
  nativeToolDefinitions,
  recordToolResultForDiffState,
  runAgentTurn,
} from "./index.js";
import { dispatchNativeToolCall, type ToolDispatchResult } from "./tool-dispatch.js";
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

test("diff state records successful edit-capable tool results", () => {
  const diffState = createSessionDiffState();
  recordToolResultForDiffState(diffState, {
    toolCall: {
      id: "call_future_edit",
      type: "function",
      function: {
        name: "future_edit",
        arguments: "{}",
      },
    },
    message: {
      role: "tool",
      tool_call_id: "call_future_edit",
      content: "{}",
    },
    output: {
      ok: true,
      changedFiles: ["a.txt", "b.txt", "a.txt"],
    },
    ok: true,
    durationMs: 4,
    truncation: emptyTruncation(),
  });

  assert.equal(diffState.editToolCalls, 1);
  assert.deepEqual(diffState.changedFiles, ["a.txt", "b.txt"]);
  assert.deepEqual(diffState.lastChange, {
    tool: "future_edit",
    toolCallId: "call_future_edit",
    changedFiles: ["a.txt", "b.txt"],
  });
  assert.equal(
    formatSessionDiffState(diffState),
    "1 edit tool call, 2 files observed (a.txt, b.txt)",
  );
});

test("diff state treats fully truncated git diffs as changed", () => {
  const diffState = createSessionDiffState();
  recordToolResultForDiffState(diffState, {
    toolCall: {
      id: "call_diff",
      type: "function",
      function: {
        name: "git_diff",
        arguments: JSON.stringify({ maxBytes: 0 }),
      },
    },
    message: {
      role: "tool",
      tool_call_id: "call_diff",
      content: "{}",
    },
    output: {
      ok: true,
      diff: "",
      truncation: {
        truncated: true,
        originalBytes: 120,
        returnedBytes: 0,
        originalLines: 10,
        returnedLines: 0,
        omittedBytes: 120,
        omittedLines: 10,
      },
    },
    ok: true,
    durationMs: 2,
    truncation: emptyTruncation(),
  });

  assert.equal(diffState.lastDiff?.hasChanges, true);
  assert.equal(formatSessionDiffState(diffState), "no edit tools observed; last diff 0B/0 lines, truncated");
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

test("runAgentTurn updates session diff state after apply_patch", async () => {
  const cwd = createTempDir();
  const diffState = createSessionDiffState();
  let fetchCount = 0;

  try {
    const patch = [
      "*** Begin Patch",
      "*** Add File: created.txt",
      "+created",
      "*** End Patch",
      "",
    ].join("\n");

    const mockFetch: typeof fetch = async () => {
      fetchCount += 1;

      if (fetchCount === 1) {
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
    };

    const result = await runAgentTurn({
      apiKey: "test-key",
      config: baseConfig,
      messages: [{ role: "user", content: "Create a file" }],
      cwd,
      fetch: mockFetch,
      diffState,
    });

    assert.equal(result.assistantText, "Patched.");
    assert.equal(diffState.editToolCalls, 1);
    assert.deepEqual(diffState.changedFiles, ["created.txt"]);
    assert.equal(diffState.lastChange?.tool, "apply_patch");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("runAgentTurn bounds oversized history before OpenRouter requests", async () => {
  const requestMessages: unknown[] = [];
  const mockFetch: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    requestMessages.push(body.messages);

    return new Response(
      streamFrom([
        sse({
          choices: [
            {
              delta: {
                content: "Bounded.",
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
    messages: [
      { role: "user", content: "old one" },
      { role: "assistant", content: "old answer one" },
      { role: "user", content: "old two" },
      { role: "assistant", content: "old answer two" },
      { role: "user", content: "current task" },
    ],
    cwd: process.cwd(),
    fetch: mockFetch,
    contextBudget: {
      maxMessages: 3,
      maxBytes: 100_000,
      preserveMessages: 2,
      summaryMaxBytes: 2_000,
    },
  });

  const sentMessages = requestMessages[0] as Array<{ role: string; content: string | null }>;
  assert.equal(sentMessages[0].role, "assistant");
  assert.match(String(sentMessages[0].content), new RegExp(COMPACTED_CONTEXT_PROVENANCE));
  assert.deepEqual(sentMessages.slice(1), [{ role: "user", content: "current task" }]);
  assert.deepEqual(result.messages.slice(0, 2), [
    sentMessages[0],
    { role: "user", content: "current task" },
  ]);
});

test("runAgentTurn passes abort signals into active shell tool dispatch", async () => {
  const controller = new AbortController();
  const toolResults: ToolDispatchResult[] = [];
  let fetchCount = 0;

  const mockFetch: typeof fetch = async () => {
    fetchCount += 1;
    if (fetchCount > 1) {
      throw new Error("runAgentTurn should not start another request after tool abort.");
    }

    return new Response(
      streamFrom([
        sse({
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: "call_shell",
                    type: "function",
                    function: {
                      name: "shell",
                      arguments: JSON.stringify({
                        command: process.execPath,
                        args: ["-e", "setInterval(() => {}, 1000)"],
                        shell: false,
                        timeoutMs: 5_000,
                      }),
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
  };

  const pending = runAgentTurn({
    apiKey: "test-key",
    config: baseConfig,
    messages: [{ role: "user", content: "Run a long shell command" }],
    cwd: process.cwd(),
    fetch: mockFetch,
    signal: controller.signal,
    callbacks: {
      onToolResult(result) {
        toolResults.push(result);
      },
    },
  });

  await delay(25);
  controller.abort();

  await assert.rejects(pending, isAbortError);
  assert.equal(fetchCount, 1);
  assert.equal(toolResults.length, 1);
  assert.equal(toolResults[0].ok, false);

  const output = toolResults[0].output as { ok: false; error: { code: string; message: string } };
  assert.equal(output.error.code, "ABORTED");
  assert.match(output.error.message, /aborted/i);

  const envelope = JSON.parse(String(toolResults[0].message.content));
  assert.equal(envelope.tool, "shell");
  assert.equal(envelope.ok, false);
  const boundedOutput = JSON.parse(envelope.output);
  assert.equal(boundedOutput.ok, false);
  assert.equal(boundedOutput.error.code, "ABORTED");
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isAbortError(error: unknown): boolean {
  return (
    (typeof DOMException !== "undefined" &&
      error instanceof DOMException &&
      error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}
