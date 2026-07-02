import test from "node:test";
import assert from "node:assert/strict";
import type { ToolDispatchResult } from "../agent/tool-dispatch.js";
import type { OpenRouterToolCall } from "../openrouter/types.js";
import type { TextTruncation } from "../tools/types.js";
import {
  renderTtyAssistantTranscriptPrefix,
  renderTtyToolCallBlock,
  renderTtyToolResultBlock,
  renderTtyUserTranscript,
  sanitizeTtyTranscriptChunk,
} from "./transcript.js";

const ANSI_PATTERN = /\x1B\[[0-?]*[ -/]*[@-~]/g;

test("tty transcript renders compact representative snapshots at 80 and 120 columns", () => {
  const toolCall: OpenRouterToolCall = {
    id: "call_shell",
    type: "function",
    function: {
      name: "shell",
      arguments: JSON.stringify({
        command: "npm",
        args: ["run", "test", "--", "--reporter=json", "--very-long-argument-name"],
        shell: false,
      }),
    },
  };
  const result: ToolDispatchResult = {
    toolCall,
    message: {
      role: "tool",
      tool_call_id: "call_shell",
      content: "{}",
    },
    output: {
      ok: true,
      exitCode: 0,
      stdoutTruncation: {
        truncated: true,
        originalBytes: 4200,
        returnedBytes: 1200,
        originalLines: 90,
        returnedLines: 20,
        omittedBytes: 3000,
        omittedLines: 70,
      } satisfies TextTruncation,
    },
    ok: true,
    durationMs: 1250,
    truncation: emptyTruncation(),
  };

  for (const width of [80, 120]) {
    const snapshot = [
      renderTtyUserTranscript("Run tests and summarize\nthen patch if needed", {
        color: false,
        maxWidth: width,
      }),
      `${renderTtyAssistantTranscriptPrefix({ color: false, maxWidth: width })}I will inspect the test target.`,
      renderTtyToolCallBlock(toolCall, {
        color: false,
        maxWidth: width,
        maxStringLength: 48,
        maxListItems: 3,
      }),
      renderTtyToolResultBlock(result, {
        color: false,
        maxWidth: width,
      }),
    ].join("\n");

    assert.match(snapshot, /\nuser\n  Run tests and summarize\n  then patch if needed/);
    assert.match(snapshot, /\nassistant\n  I will inspect the test target\./);
    assert.match(snapshot, /╭─ tool shell/);
    assert.match(snapshot, /│  args command="npm" args=\["run", "test", "--", \+2 more\] shell=false/);
    assert.match(snapshot, /╭─ tool shell ok 1\.3s/);
    assert.match(snapshot, /details exit=0  stdout_truncated=\(2\.9KiB omitted, 70 lines omitted\)/);
    assertLinesFit(snapshot, width);
  }
});

test("tty transcript strips terminal controls from rendered scrollback", () => {
  const user = renderTtyUserTranscript("hello\x1b[31m red\nnext\rline\x07", {
    color: false,
    maxWidth: 80,
  });
  const assistant = sanitizeTtyTranscriptChunk("ok\x1b[2J\nstill here\rhidden\x00");

  assert.doesNotMatch(user, ANSI_PATTERN);
  assert.doesNotMatch(assistant, ANSI_PATTERN);
  assert.equal(user, "\nuser\n  hello red\n  next\n  line");
  assert.equal(assistant, "ok\nstill here\nhidden ");
  assert.equal(sanitizeTtyTranscriptChunk("Hello "), "Hello ");
});

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

function assertLinesFit(output: string, width: number): void {
  for (const line of output.split("\n")) {
    assert.ok(stripAnsi(line).length <= width, `line exceeds ${width}: ${line}`);
  }
}

function stripAnsi(value: string): string {
  return value.replace(ANSI_PATTERN, "");
}
