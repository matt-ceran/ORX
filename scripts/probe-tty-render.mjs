#!/usr/bin/env node

import {
  renderTtyAssistantTranscriptPrefix,
  renderTtyToolCallBlock,
  renderTtyToolResultBlock,
  renderTtyUserTranscript,
} from "../dist/tui/transcript.js";
import {
  createTtyScreenController,
  renderTtyStatusComposer,
} from "../dist/tui/screen.js";
import { formatCompactOpenRouterMetadata } from "../dist/openrouter/summary.js";

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
  const initialComposer = renderTtyStatusComposer({
    cwd: "/Users/draingang/Documents/ORX-ui-ux",
    model: "openrouter/auto",
    mode: "auto",
    permissions: {
      approvalPolicy: "never",
      sandboxMode: "danger-full-access",
    },
    sessionId: "20260702T120000Z-abcdef12",
    messages: [],
    costMeterState: {
      costedTurnCount: 0,
      uncostedTurnCount: 0,
    },
    width,
    renderOptions,
  });
  const metadata = {
    requestedModel: "openrouter/auto",
    totalTokens: 412,
    cost: 0.0002,
  };
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
    formatCompactOpenRouterMetadata(metadata, {
      ...renderOptions,
      maxWidth: width,
    }),
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
  const redrawTrace = renderRedrawTrace({
    width,
    initialComposer,
    transcript,
    renderOptions,
  });

  console.log(`--- ORX TTY launch/idle probe (${width} cols) ---`);
  console.log(initialComposer);
  console.log(`--- ORX TTY redraw trace escaped (${width} cols) ---`);
  console.log(escapeControls(redrawTrace));
  console.log(`--- ORX TTY assistant-turn visible frame (${width} cols) ---`);
  console.log(transcript);
}

function renderRedrawTrace({ initialComposer, transcript }) {
  let output = "";
  const screen = createTtyScreenController({
    write(chunk) {
      output += chunk;
    },
  });

  screen.show(initialComposer);
  screen.clearAfterSubmit();
  output += transcript;
  return output;
}

function escapeControls(value) {
  return value
    .replace(/\x1b/g, "\\x1b")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n\n");
}
