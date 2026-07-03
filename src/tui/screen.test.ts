import test from "node:test";
import assert from "node:assert/strict";
import {
  isInteractiveTerminal,
  renderPlainContinuationPrompt,
  renderPlainComposerPrompt,
  renderTtyCommandSuggestions,
  renderTtyFirstScreen,
  renderTtyReadlinePrompt,
  renderTtyStartupCard,
  renderTtyStatusComposer,
  renderTtyStatusLine,
  renderTtyUserBand,
  shouldUseTtyScreen,
  TTY_PROMPT_PREFIX_WIDTH,
} from "./screen.js";

const ANSI_PATTERN = /\x1B\[[0-?]*[ -/]*[@-~]/g;

test("tty screen renders a flat workbench first screen at 80 columns", () => {
  const output = renderTtyFirstScreen({
    cwd: "/Users/draingang/Documents/ORX",
    model: "openrouter/auto",
    mode: "auto",
    permissions: { approvalPolicy: "never", sandboxMode: "danger-full-access" },
    sessionId: "20260702T120000Z-abcdef12",
    messages: [],
    costMeterState: { costedTurnCount: 0, uncostedTurnCount: 0 },
    apiKeyStatus: "no",
    width: 80,
    renderOptions: { color: false },
  });

  assert.match(output, /^ ORX  OpenRouter-native coding workbench/);
  assert.match(output, /\n {2}model {4}openrouter\/auto/);
  assert.match(output, /mode {5}auto/);
  assert.match(output, /\n {2}cwd {6}~\/Documents\/ORX/);
  assert.match(output, /perm {5}never\/danger-full-access/);
  assert.match(output, /\n {2}key {6}no/);
  assert.match(output, /session {2}abcdef12/);
  assert.match(output, /\/help commands/);
  assert.match(output, /Ctrl\+G editor/);
  assertComposerShape(output);
  assert.match(
    statsLineOf(output),
    /^ {2}openrouter\/auto · auto · ~\/Documents\/ORX · never\/danger-full-access · abcdef12$/,
  );
  assertNoBoxChrome(output);
  assertLinesFit(output, 80);
});

test("tty screen renders a flat workbench first screen at 100 columns", () => {
  const output = renderTtyFirstScreen({
    cwd: "/Users/draingang/Documents/ORX/packages/example",
    model: "openai/gpt-4.1",
    mode: "exact",
    permissions: { approvalPolicy: "never", sandboxMode: "danger-full-access" },
    sessionId: "20260702T120000Z-feedface",
    gitBranch: "ui-recovery",
    messages: [],
    costMeterState: { costedTurnCount: 0, uncostedTurnCount: 0 },
    apiKeyStatus: "yes (env)",
    width: 100,
    renderOptions: { color: false },
  });

  assert.match(output, /^ ORX  OpenRouter-native coding workbench/);
  assert.match(output, /model {4}openai\/gpt-4\.1/);
  assert.match(output, /cwd {6}~\/Documents\/ORX\/packages\/example/);
  assert.match(output, /key {6}yes \(env\)/);
  assertComposerShape(output);
  const stats = statsLineOf(output);
  assert.match(stats, /^ {2}openai\/gpt-4\.1 · exact · ~\/Documents\/ORX/);
  assert.match(stats, /ui-recovery/);
  assert.match(stats, /never\/danger-full-access/);
  assert.doesNotMatch(stats, /…/);
  assertNoBoxChrome(output);
  assertLinesFit(output, 100);
});

test("tty startup card truncates cleanly at narrow widths", () => {
  const output = renderTtyStartupCard({
    cwd: "/Users/draingang/Documents/ORX/packages/example-with-a-very-long-name",
    model: "provider/really-long-model-name-with-many-segments-and-variants",
    mode: "fusion",
    permissions: { approvalPolicy: "never", sandboxMode: "danger-full-access" },
    sessionId: "20260627T120000Z-deadbeefcafebabe",
    gitBranch: "ui-revamp",
    messages: [],
    costMeterState: { costedTurnCount: 0, uncostedTurnCount: 0 },
    apiKeyStatus: "yes (OPENROUTER_API_KEY)",
    width: 44,
    renderOptions: { color: false },
  });

  assert.match(output, /^ ORX  OpenRouter-native coding workbench/);
  assert.match(output, /model {4}provider\/really/);
  assert.match(output, /session {2}deadbe/);
  assert.match(output, /…/);
  assert.doesNotMatch(output, /really-long-model-name-with-many-segments-and-variants/);
  assert.doesNotMatch(output, /example-with-a-very-long-name/);
  assertNoBoxChrome(output);
  assertLinesFit(output, 44);
});

test("tty stats line shows toned context, cost, and credits without battery meters", () => {
  const output = renderTtyStatusLine({
    cwd: "/Users/draingang/Documents/ORX",
    model: "anthropic/claude-sonnet-4.5",
    mode: "exact",
    permissions: { approvalPolicy: "never", sandboxMode: "danger-full-access" },
    sessionId: "20260627T120000Z-abcdef12",
    gitBranch: "ui-revamp",
    messages: [{ role: "user", content: "hello" }],
    contextBudget: { maxBytes: 1_000, maxMessages: 8 },
    costMeterState: {
      latestTurnCost: 0.0002,
      knownSessionCost: 0.0007,
      costedTurnCount: 2,
      uncostedTurnCount: 1,
    },
    latestCredits: { totalCredits: 4, totalUsage: 1, remainingCredits: 3, percentUsed: 25 },
    width: 180,
    renderOptions: { color: false },
  });

  assert.match(output, /anthropic\/claude-sonnet-4\.5 · exact/);
  assert.match(output, /~\/Documents\/ORX · ui-revamp · never\/danger-full-access/);
  assert.match(output, /ctx (\d+%|<1%)/);
  assert.match(output, /\$0\.000700/);
  assert.match(output, /bal \$3\.000000/);
  assert.doesNotMatch(output, /▕|░|█/);
  assert.doesNotMatch(output, /session/);
  assertLinesFit(output, 180);
});

test("tty stats line truncates long fields at narrow widths", () => {
  const output = renderTtyStatusLine({
    cwd: "/Users/draingang/Documents/ORX/packages/example-with-a-very-long-name",
    model: "provider/really-long-model-name-with-many-segments-and-variants",
    mode: "fusion",
    permissions: { approvalPolicy: "never", sandboxMode: "danger-full-access" },
    sessionId: "20260627T120000Z-deadbeefcafebabe",
    messages: [
      { role: "user", content: "A longer prompt that consumes local approximate bytes." },
      { role: "assistant", content: "A response." },
    ],
    contextBudget: { maxBytes: 2_048, maxMessages: 8 },
    costMeterState: {
      latestTurnCost: 0.0002,
      knownSessionCost: 0.0002,
      costedTurnCount: 1,
      uncostedTurnCount: 0,
    },
    width: 44,
    renderOptions: { color: false },
  });

  assert.match(output, /…/);
  assert.doesNotMatch(output, /really-long-model-name-with-many-segments-and-variants/);
  assert.doesNotMatch(output, /example-with-a-very-long-name/);
  assertLinesFit(output, 44);
});

test("tty stats line shows spinner activity for assistant and tool turns", () => {
  const base = {
    cwd: "/Users/draingang/Documents/ORX",
    mode: "auto",
    permissions: { approvalPolicy: "never", sandboxMode: "danger-full-access" } as const,
    sessionId: "20260627T120000Z-abcdef12",
    messages: [],
    costMeterState: { costedTurnCount: 0, uncostedTurnCount: 0 },
    renderOptions: { color: false as const },
  };
  const assistant = renderTtyStatusLine({
    ...base,
    model: "openrouter/auto",
    activity: { kind: "assistant", frame: 0 },
    width: 96,
  });
  const tool = renderTtyStatusLine({
    ...base,
    model: "provider/model",
    activity: { kind: "tool", label: "read_file", frame: 3 },
    width: 80,
  });

  assert.match(assistant, /⠋ assistant/);
  assert.match(assistant, /openrouter\/auto/);
  assert.match(tool, /⠸ tool read_file/);
  assertLinesFit(assistant, 96);
  assertLinesFit(tool, 80);
});

test("tty stats line sanitizes activity labels", () => {
  const output = renderTtyStatusLine({
    cwd: "/Users/draingang/Documents/ORX",
    model: "openrouter/auto",
    mode: "auto",
    permissions: { approvalPolicy: "never", sandboxMode: "danger-full-access" },
    sessionId: "20260627T120000Z-abcdef12",
    messages: [],
    costMeterState: { costedTurnCount: 0, uncostedTurnCount: 0 },
    activity: { kind: "tool", label: "read_file\nINJECTED\rname\tend\x1b[31mred", frame: 0 },
    width: 140,
    renderOptions: { color: false },
  });

  assert.match(output, /⠋ tool read_file INJECTED name endred/);
  assert.doesNotMatch(output, /\r/);
  assert.doesNotMatch(output, ANSI_PATTERN);
  assertLinesFit(output, 140);
});

test("tty composer renders queued follow-ups as flat pending lines", () => {
  const output = renderTtyStatusComposer({
    cwd: "/Users/draingang/Documents/ORX",
    model: "openrouter/auto",
    mode: "auto",
    permissions: { approvalPolicy: "never", sandboxMode: "danger-full-access" },
    sessionId: "20260627T120000Z-abcdef12",
    messages: [],
    costMeterState: { costedTurnCount: 0, uncostedTurnCount: 0 },
    queuedInputs: [
      { kind: "message", text: "then run the focused TTY tests" },
      { kind: "command", text: "/status" },
    ],
    activity: { kind: "assistant", frame: 2 },
    width: 88,
    renderOptions: { color: false },
  });

  assert.match(output, /queued \(2\) · runs after current turn/);
  assert.match(output, /1 › then run the focused TTY tests/);
  assert.match(output, /2 \/ \/status/);
  assert.match(output, /⠹ assistant/);
  assertComposerShape(output);
  assertNoBoxChrome(output);
  assertLinesFit(output, 88);
});

test("tty composer band supports normal and multiline modes", () => {
  const normal = renderTtyStatusComposer(composerState({ width: 80 }));
  const multiline = renderTtyStatusComposer(
    composerState({ width: 80, input: { mode: "multiline" } }),
  );

  assert.equal(bandLineOf(normal), " › ");
  assert.equal(bandLineOf(multiline), " … ");
  assertLinesFit(normal, 80);
  assertLinesFit(multiline, 80);
});

test("tty composer band uses a grey background and repositions the cursor into it", () => {
  const output = renderTtyStatusComposer(
    composerState({ width: 80, renderOptions: { color: true } }),
  );

  assert.match(output, /\x1b\[48;5;254m\x1b\[38;5;235m › +\x1b\[0m/);
  assert.match(output, new RegExp(`\\x1b\\[1A\\x1b\\[${TTY_PROMPT_PREFIX_WIDTH + 1}G\\x1b\\[48;5;254m\\x1b\\[38;5;235m$`));
});

test("tty readline prompt carries the band colors and matches the prefix width", () => {
  const colored = renderTtyReadlinePrompt({ color: true });
  const multiline = renderTtyReadlinePrompt({ color: true }, { mode: "multiline" });
  const plain = renderTtyReadlinePrompt({ color: false });

  assert.match(colored, /^\x1b\[48;5;254m\x1b\[38;5;235m › $/);
  assert.match(multiline, / … $/);
  assert.equal(plain, " › ");
  assert.equal(stripAnsi(colored).length, TTY_PROMPT_PREFIX_WIDTH);
  assert.equal(stripAnsi(plain).length, TTY_PROMPT_PREFIX_WIDTH);
});

test("tty user band renders grey full-width rows that wrap long input", () => {
  const colored = renderTtyUserBand("fix the failing tests", { color: true }, 40);
  const wrapped = renderTtyUserBand("a".repeat(80), { color: false }, 40);
  const multiline = renderTtyUserBand("first\nsecond", { color: false }, 40);

  assert.match(colored, /^\x1b\[48;5;254m\x1b\[38;5;235m › fix the failing tests +\x1b\[0m$/);
  assert.equal(stripAnsi(colored).length, 40);
  const wrappedLines = wrapped.split("\n");
  assert.equal(wrappedLines.length, 3);
  assert.match(wrappedLines[0] ?? "", /^ › a+$/);
  assert.match(wrappedLines[1] ?? "", /^ {3}a+$/);
  const multilineLines = multiline.split("\n");
  assert.equal(multilineLines[0], " › first");
  assert.equal(multilineLines[1], "   second");
});

test("tty command suggestions render a single dim try line", () => {
  const rendered = renderTtyCommandSuggestions(
    ["/help", "/history", "/models"],
    { color: false },
    60,
  );

  assert.match(rendered, /^ {2}try \/help {2}\/history {2}\/models$/);
  assert.equal(renderTtyCommandSuggestions([], { color: false }, 60), "");
});

test("tty screen respects NO_COLOR and prompt fallbacks", () => {
  const output = renderTtyStatusLine({
    cwd: "/tmp/orx",
    model: "openrouter/auto",
    mode: "auto",
    permissions: { approvalPolicy: "never", sandboxMode: "danger-full-access" },
    sessionId: "20260627T120000Z-feedface",
    messages: [{ role: "user", content: "hi" }],
    costMeterState: { costedTurnCount: 1, uncostedTurnCount: 0 },
    width: 90,
    renderOptions: { stream: { isTTY: true }, env: { NO_COLOR: "1" } },
  });

  assert.doesNotMatch(output, ANSI_PATTERN);
  assert.equal(renderPlainComposerPrompt(), "orx> ");
  assert.equal(renderPlainContinuationPrompt(), "...> ");
  assert.equal(isInteractiveTerminal({ isTTY: true }, { isTTY: true }), true);
  assert.equal(shouldUseTtyScreen({ isTTY: true }, { isTTY: true }, {}), true);
  assert.equal(shouldUseTtyScreen({ isTTY: true }, { isTTY: true }, { NO_COLOR: "1" }), false);
  assert.equal(shouldUseTtyScreen({ isTTY: false }, { isTTY: true }, {}), false);
});

test("tty first launch omits meter noise until there is activity", () => {
  const output = renderTtyFirstScreen({
    cwd: "/Users/draingang/Documents/ORX",
    model: "openrouter/auto",
    mode: "auto",
    permissions: { approvalPolicy: "never", sandboxMode: "danger-full-access" },
    sessionId: "20260702T120000Z-abcdef12",
    messages: [],
    costMeterState: { costedTurnCount: 0, uncostedTurnCount: 0 },
    apiKeyStatus: "yes (env)",
    width: 90,
    renderOptions: { color: false },
  });

  assert.doesNotMatch(output, /ctx \d/);
  assert.doesNotMatch(output, /bal \$/);
  assert.match(statsLineOf(output), /abcdef12/);
  assertNoBoxChrome(output);
  assertLinesFit(output, 90);
});

function composerState(overrides: Record<string, unknown> = {}) {
  return {
    cwd: "/Users/draingang/Documents/ORX",
    model: "openrouter/auto",
    mode: "auto",
    permissions: { approvalPolicy: "never", sandboxMode: "danger-full-access" } as const,
    sessionId: "20260627T120000Z-abcdef12",
    messages: [],
    costMeterState: { costedTurnCount: 0, uncostedTurnCount: 0 },
    width: 80,
    renderOptions: { color: false as const },
    ...overrides,
  };
}

/**
 * The composer must end with the stats line as its final row and the grey
 * band row directly above it, separated from the content above by a blank
 * spacer line.
 */
function assertComposerShape(output: string): void {
  const lines = stripAnsi(output).split("\n");
  assert.ok(lines.length >= 3, `composer needs spacer, band, and stats rows: ${lines.length}`);
  const band = lines.at(-2) ?? "";
  assert.match(band, /^ [›…] /, `band row should carry the prompt marker: ${JSON.stringify(band)}`);
  const spacer = lines.at(-3) ?? "";
  assert.equal(spacer.trim(), "", `spacer above band should be blank: ${JSON.stringify(spacer)}`);
}

function bandLineOf(output: string): string {
  return stripAnsi(output).split("\n").at(-2) ?? "";
}

function statsLineOf(output: string): string {
  return stripAnsi(output).split("\n").at(-1) ?? "";
}

function assertNoBoxChrome(output: string): void {
  assert.doesNotMatch(output, /[╭╰│─]{2,}/);
  assert.doesNotMatch(stripAnsi(output), /╭|╰|│/);
  assert.doesNotMatch(output, /▕|░/);
}

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
