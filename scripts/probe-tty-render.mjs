#!/usr/bin/env node

import {
  renderTtyAssistantTranscriptPrefix,
  renderTtyToolCallBlock,
  renderTtyToolResultBlock,
  renderTtyUserTranscript,
} from "../dist/tui/transcript.js";
import { renderTtyStatusComposer } from "../dist/tui/screen.js";

const toolCall = {
  id: "call_read",
  type: "function",
  function: {
    name: "read_file",
    arguments: JSON.stringify({ path: "src/tui/chat.ts" }),
  },
};

const toolResult = {
  toolCall,
  message: {
    role: "tool",
    tool_call_id: "call_read",
    content: "{}",
  },
  output: {
    ok: true,
  },
  ok: true,
  durationMs: 18,
  truncation: {
    truncated: false,
    originalBytes: 0,
    returnedBytes: 0,
    originalLines: 0,
    returnedLines: 0,
    omittedBytes: 0,
    omittedLines: 0,
  },
};

for (const width of [80, 120]) {
  const renderOptions = { color: false };
  const transcript = [
    renderTtyUserTranscript("Review the chat transcript spacing.", {
      ...renderOptions,
      maxWidth: width,
    }),
    `${renderTtyAssistantTranscriptPrefix({
      ...renderOptions,
      maxWidth: width,
    })}I will inspect the TTY renderer.`,
    renderTtyToolCallBlock(toolCall, {
      ...renderOptions,
      maxWidth: width,
    }),
    renderTtyToolResultBlock(toolResult, {
      ...renderOptions,
      maxWidth: width,
    }),
    "meta  route openrouter/auto  tokens 412  cost $0.000200",
    renderTtyStatusComposer({
      cwd: "/Users/draingang/Documents/ORX-ui-ux",
      model: "openrouter/auto",
      mode: "auto",
      permissions: {
        approvalPolicy: "never",
        sandboxMode: "danger-full-access",
      },
      sessionId: "20260702T120000Z-abcdef12",
      messages: [
        { role: "user", content: "Review the chat transcript spacing." },
        { role: "assistant", content: "I will inspect the TTY renderer." },
      ],
      costMeterState: {
        latestTurnCost: 0.0002,
        knownSessionCost: 0.0002,
        costedTurnCount: 1,
        uncostedTurnCount: 0,
      },
      width,
      renderOptions,
    }),
  ].join("\n");

  console.log(`--- ORX TTY transcript probe (${width} cols) ---`);
  console.log(transcript);
}
