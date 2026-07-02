import test from "node:test";
import assert from "node:assert/strict";
import {
  clearRenderedTtyLines,
  clearSubmittedTtyLines,
  countRenderedLines,
  createTtyScreenController,
  isInteractiveTerminal,
  renderPlainContinuationPrompt,
  renderPlainComposerPrompt,
  renderTtyComposerPrompt,
  renderTtyStatusComposer,
  renderTtyStatusNotch,
  renderTtyStatusProbe,
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

  assert.match(output, /^╭─ orx  provider anthropic  model claude-sonnet-4\.5  mode exact/);
  assert.match(output, /ctx \[[#-]{10}\] \d+\.\d% approx/);
  assert.match(output, /cost \[####--\] 66\.7% \$0\.000700 meta 2\/3/);
  assert.match(output, /credits \[##------\] 25\.0% rem \$3\.00/);
  assert.match(output, /│  cwd ~\/Documents\/ORX  session abcdef12  perm never\/danger-full-access/);
  assert.match(output, /\n╰─ orx › $/);
  assertLinesFit(output, 180);
});

test("tty screen has stable 80 and 120 column HUD probes", () => {
  const at80 = renderTtyStatusProbe(80);
  const at120 = renderTtyStatusProbe(120);

  assert.equal(
    stripAnsi(at80),
    [
      "╭─ orx  work ⠹ assistant  route auto  mode auto",
      "│  ctx [--------] 3.1% • approx  cost [###-] 66.7% • $0.004100 meta 2/3",
      "│  credits [#-------] 13.8% rem $17.25",
      "│  cwd ~/Documents/ORX  session probe1851d3e  perm never/danger-full-access",
      "╰─ orx › ",
    ].join("\n"),
  );
  assert.equal(
    stripAnsi(at120),
    [
      "╭─ orx  work ⠹ assistant  route auto  mode auto",
      "│  ctx [----------] 3.1% • approx  cost [####--] 66.7% • $0.004100 meta 2/3",
      "│  credits [#-------] 13.8% rem $17.25",
      "│  cwd ~/Documents/ORX  session probe1851d3e  perm never/danger-full-access",
      "╰─ orx › ",
    ].join("\n"),
  );
  assertLinesFit(at80, 80);
  assertLinesFit(at120, 120);
});

test("tty screen controller clears composer redraws in place and after submitted input", () => {
  let output = "";
  const controller = createTtyScreenController({
    write(chunk) {
      output += chunk;
    },
  });

  controller.show("╭─ orx\n│  cwd ~/repo\n╰─ orx › ");
  assert.equal(controller.visibleLineCount, 3);
  controller.show("╭─ orx  work ⠋ assistant\n│  cwd ~/repo\n╰─ orx › ");
  assert.equal(controller.visibleLineCount, 3);
  assert.equal(
    output,
    [
      "╭─ orx\n│  cwd ~/repo\n╰─ orx › ",
      clearRenderedTtyLines(3),
      "╭─ orx  work ⠋ assistant\n│  cwd ~/repo\n╰─ orx › ",
    ].join(""),
  );

  assert.equal(controller.clearAfterSubmit(), true);
  assert.equal(controller.visibleLineCount, 0);
  assert.equal(output.endsWith(clearSubmittedTtyLines(3)), true);
  assert.equal(controller.clear(), false);
  assert.equal(countRenderedLines("one\ntwo\nthree"), 3);
});

test("tty screen probe remains bounded at very narrow widths", () => {
  const output = renderTtyStatusProbe(32);

  assert.match(stripAnsi(output), /^╭─ orx  work …  route …  mode a…/);
  assert.match(stripAnsi(output), /ctx /);
  assert.match(stripAnsi(output), /cost /);
  assert.match(stripAnsi(output), /credits /);
  assert.match(stripAnsi(output), /perm /);
  assertLinesFit(output, 32);
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

test("tty screen renders assistant and tool activity without widening the notch", () => {
  const assistant = renderTtyStatusComposer({
    cwd: "/Users/draingang/Documents/ORX",
    model: "openrouter/auto",
    mode: "auto",
    permissions: {
      approvalPolicy: "never",
      sandboxMode: "danger-full-access",
    },
    sessionId: "20260627T120000Z-abcdef12",
    messages: [],
    costMeterState: {
      costedTurnCount: 0,
      uncostedTurnCount: 0,
    },
    activity: {
      kind: "assistant",
      frame: 0,
    },
    width: 96,
    renderOptions: { color: false },
  });
  const tool = renderTtyStatusComposer({
    cwd: "/Users/draingang/Documents/ORX",
    model: "provider/really-long-model-name-with-many-segments",
    mode: "auto",
    permissions: {
      approvalPolicy: "never",
      sandboxMode: "danger-full-access",
    },
    sessionId: "20260627T120000Z-abcdef12",
    messages: [],
    costMeterState: {
      costedTurnCount: 0,
      uncostedTurnCount: 0,
    },
    activity: {
      kind: "tool",
      label: "read_file",
      frame: 3,
    },
    width: 52,
    renderOptions: { color: false },
  });

  assert.match(assistant, /work ⠋ assistant/);
  assert.match(assistant, /route auto/);
  assert.doesNotMatch(assistant, /model openrouter\/auto/);
  assert.match(tool, /work ⠸ tool re/);
  assertLinesFit(assistant, 96);
  assertLinesFit(tool, 52);
});

test("tty screen splits exact providers while keeping OpenRouter routes compact", () => {
  const exact = renderTtyStatusNotch({
    cwd: "/tmp/orx",
    model: "openai/gpt-4.1",
    mode: "exact",
    permissions: {
      approvalPolicy: "never",
      sandboxMode: "danger-full-access",
    },
    messages: [],
    costMeterState: {
      costedTurnCount: 0,
      uncostedTurnCount: 0,
    },
    width: 120,
    renderOptions: { color: false },
  });
  const fusion = renderTtyStatusNotch({
    cwd: "/tmp/orx",
    model: "openrouter/fusion",
    mode: "fusion",
    permissions: {
      approvalPolicy: "never",
      sandboxMode: "danger-full-access",
    },
    messages: [],
    costMeterState: {
      costedTurnCount: 0,
      uncostedTurnCount: 0,
    },
    width: 120,
    renderOptions: { color: false },
  });

  assert.match(exact, /provider openai  model gpt-4\.1  mode exact/);
  assert.doesNotMatch(exact, /model openai\/gpt-4\.1/);
  assert.match(fusion, /route fusion  mode fusion/);
  assert.doesNotMatch(fusion, /model openrouter\/fusion/);
});

test("tty screen keeps exact models compact near the wide layout threshold", () => {
  for (const width of [72, 80, 104]) {
    const output = renderTtyStatusNotch({
      cwd: "/Users/draingang/Documents/ORX",
      model: "openai/gpt-4.1",
      mode: "exact",
      permissions: {
        approvalPolicy: "never",
        sandboxMode: "danger-full-access",
      },
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
      width,
      renderOptions: { color: false },
    });

    assert.match(output, /model openai\/gpt-4\.1/);
    assert.doesNotMatch(output, /provider openai  model gpt-4\.1/);
    assert.match(output, /ctx \[[#-]{8}\]/);
    assert.match(output, /cost \[[#-]{4}\] 66\.7% \$0\.000700/);
    assert.match(output, /credits \[##------\]/);
    assertLinesFit(output, width);
  }
});

test("tty screen splits exact model ids once the HUD has room", () => {
  for (const width of [120, 140]) {
    const output = renderTtyStatusNotch({
      cwd: "/Users/draingang/Documents/ORX",
      model: "openai/gpt-4.1",
      mode: "exact",
      permissions: {
        approvalPolicy: "never",
        sandboxMode: "danger-full-access",
      },
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
      width,
      renderOptions: { color: false },
    });

    assert.match(output, /provider openai  model gpt-4\.1  mode exact/);
    assert.doesNotMatch(output, /model openai\/gpt-4\.1/);
    assert.match(output, /ctx \[[#-]{10}\]/);
    assert.match(output, /cost \[[#-]{6}\] 66\.7% \$0\.000700/);
    assert.match(output, /credits \[##------\]/);
    assertLinesFit(output, width);
  }
});

test("tty screen sanitizes activity labels without adding status lines", () => {
  const output = renderTtyStatusComposer({
    cwd: "/Users/draingang/Documents/ORX",
    model: "openrouter/auto",
    mode: "auto",
    permissions: {
      approvalPolicy: "never",
      sandboxMode: "danger-full-access",
    },
    sessionId: "20260627T120000Z-abcdef12",
    messages: [],
    costMeterState: {
      costedTurnCount: 0,
      uncostedTurnCount: 0,
    },
    activity: {
      kind: "tool",
      label: "read_file\nINJECTED\rname\tend\x1b[31mred",
      frame: 0,
    },
    width: 140,
    renderOptions: { color: false },
  });

  assert.equal(output.split("\n").length, 3);
  assert.match(output.split("\n")[0], /work ⠋ tool read_file INJECTED name endred/);
  assert.doesNotMatch(output, /\r/);
  assert.doesNotMatch(output, ANSI_PATTERN);
  assertLinesFit(output, 140);
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
  assert.equal(renderTtyComposerPrompt({ color: false }, { mode: "multiline" }), "orx … ");
  assert.equal(renderPlainComposerPrompt(), "orx> ");
  assert.equal(renderPlainContinuationPrompt(), "...> ");
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
