import test from "node:test";
import assert from "node:assert/strict";
import {
  isInteractiveTerminal,
  renderPlainComposerPrompt,
  renderTtyComposerPrompt,
  renderTtyStatusComposer,
  renderTtyStatusNotch,
  shouldUseTtyScreen,
} from "./screen.js";

const ANSI_PATTERN = /\x1B\[[0-?]*[ -/]*[@-~]/g;

test("tty screen renders a wide bottom status notch with compact meters", () => {
  const output = renderTtyStatusComposer({
    cwd: "/Users/draingang/Documents/ORX",
    model: "anthropic/claude-sonnet-4.5",
    mode: "exact",
    permissions: {
      approvalPolicy: "never",
      sandboxMode: "danger-full-access",
    },
    sessionId: "20260627T120000Z-abcdef12",
    messages: [{ role: "user", content: "hello" }],
    contextBudget: {
      maxBytes: 1_000,
      maxMessages: 8,
    },
    costMeterState: {
      latestTurnCost: 0.0002,
      knownSessionCost: 0.0007,
      costedTurnCount: 2,
      uncostedTurnCount: 1,
    },
    latestCredits: {
      totalCredits: 4,
      totalUsage: 1,
      remainingCredits: 3,
      percentUsed: 25,
    },
    width: 180,
    renderOptions: { color: false },
  });

  assert.match(output, /^╭─ orx  model anthropic\/claude-sonnet-4\.5  mode exact/);
  assert.match(output, /ctx \[[#-]{8}\] \d+\.\d% approx/);
  assert.match(output, /cost \$0\.000700 meta 2\/3/);
  assert.match(output, /credits \[##------\] 25\.0% rem \$3\.000000/);
  assert.match(output, /╰─ cwd ~\/Documents\/ORX  perm never\/danger-full-access  session abcdef12/);
  assert.match(output, /\norx › $/);
  assertLinesFit(output, 180);
});

test("tty screen truncates long status fields at narrow widths", () => {
  const output = renderTtyStatusComposer({
    cwd: "/Users/draingang/Documents/ORX/packages/example-with-a-very-long-name",
    model: "provider/really-long-model-name-with-many-segments-and-variants",
    mode: "fusion",
    permissions: {
      approvalPolicy: "never",
      sandboxMode: "danger-full-access",
    },
    sessionId: "20260627T120000Z-deadbeefcafebabe",
    messages: [
      { role: "user", content: "A longer prompt that consumes local approximate bytes." },
      { role: "assistant", content: "A response." },
    ],
    contextBudget: {
      maxBytes: 2_048,
      maxMessages: 8,
    },
    costMeterState: {
      latestTurnCost: 0.0002,
      knownSessionCost: 0.0002,
      costedTurnCount: 1,
      uncostedTurnCount: 0,
    },
    latestCredits: {
      totalCredits: 20,
      totalUsage: 5,
      remainingCredits: 15,
      percentUsed: 25,
    },
    width: 44,
    renderOptions: { color: false },
  });

  assert.match(output, /^╭─ orx  model provider\/really-…/);
  assert.match(output, /ctx \[/);
  assert.match(output, /cost /);
  assert.match(output, /credits /);
  assert.match(output, /perm /);
  assert.match(output, /session /);
  assert.match(output, /…/);
  assert.doesNotMatch(output, /really-long-model-name-with-many-segments-and-variants/);
  assert.doesNotMatch(output, /example-with-a-very-long-name/);
  assertLinesFit(output, 44);
});

test("tty screen respects NO_COLOR and prompt fallbacks", () => {
  const output = renderTtyStatusNotch({
    cwd: "/tmp/orx",
    model: "openrouter/auto",
    mode: "auto",
    permissions: {
      approvalPolicy: "never",
      sandboxMode: "danger-full-access",
    },
    sessionId: "20260627T120000Z-feedface",
    messages: [],
    costMeterState: {
      costedTurnCount: 0,
      uncostedTurnCount: 0,
    },
    width: 90,
    renderOptions: { stream: { isTTY: true }, env: { NO_COLOR: "1" } },
  });

  assert.doesNotMatch(output, ANSI_PATTERN);
  assert.equal(renderTtyComposerPrompt({ color: false }), "orx › ");
  assert.equal(renderPlainComposerPrompt(), "orx> ");
  assert.equal(isInteractiveTerminal({ isTTY: true }, { isTTY: true }), true);
  assert.equal(shouldUseTtyScreen({ isTTY: true }, { isTTY: true }, {}), true);
  assert.equal(shouldUseTtyScreen({ isTTY: true }, { isTTY: true }, { NO_COLOR: "1" }), false);
  assert.equal(shouldUseTtyScreen({ isTTY: false }, { isTTY: true }, {}), false);
});

function assertLinesFit(output: string, width: number): void {
  for (const line of output.split("\n")) {
    assert.ok(
      stripAnsi(line).length <= width,
      `line exceeds width ${width}: ${JSON.stringify(stripAnsi(line))}`,
    );
  }
}

function stripAnsi(value: string): string {
  return value.replace(ANSI_PATTERN, "");
}
