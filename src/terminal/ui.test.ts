import test from "node:test";
import assert from "node:assert/strict";
import { renderTerminalBlock, stripAnsi } from "./ui.js";

test("terminal block renders a flat bullet header with indented wrapped body", () => {
  const output = stripAnsi(
    renderTerminalBlock({
      title: "command /commands",
      subtitle: "/commands plugin",
      body:
        "\x1b[1mCommand palette\x1b[0m\n  /plugins [catalog [list|inspect|updates|update|add-local|add-git|remove]|list]",
      footer: "2 lines",
      width: 58,
      renderOptions: { color: true },
    }),
  );

  assert.match(output, /^• command \/commands \/commands plugin/);
  assert.match(output, /\n {2}Command palette/);
  assert.match(output, /\n {4}\/plugins \[catalog/);
  assert.match(output, /\n {2}add-local\|add-git\|remove\]\|list\]/);
  assert.match(output, /\n {2}└ 2 lines$/);
  assert.doesNotMatch(output, /\[1m|\[0m/);
  assert.doesNotMatch(output, /[╭╰│]/);
});

test("terminal block omits the footer line when no footer is given", () => {
  const output = stripAnsi(
    renderTerminalBlock({
      title: "status",
      body: "catalog /tmp/orx-status/example-profile-catalog.json",
      width: 34,
      renderOptions: { color: true },
    }),
  );

  assert.match(output, /\n {2}catalog \/tmp\/orx-status\//);
  assert.match(output, /\n {2}example-profile-catalog\.json$/);
  assert.doesNotMatch(output, /└/);
});

test("terminal block renders a dim placeholder for empty bodies", () => {
  const output = stripAnsi(
    renderTerminalBlock({
      title: "command /copy",
      width: 60,
      renderOptions: { color: true },
    }),
  );

  assert.match(output, /^• command \/copy\n {2}no output$/);
});

test("terminal block can color diff additions and removals in tty output", () => {
  const output = renderTerminalBlock({
    title: "command /diff",
    body: [
      "diff --git a/tracked.txt b/tracked.txt",
      "--- a/tracked.txt",
      "+++ b/tracked.txt",
      "@@ -1 +1 @@",
      "-before",
      "+after",
    ],
    width: 72,
    bodyKind: "diff",
    renderOptions: { color: true },
  });

  assert.match(output, / {2}\x1b\[38;5;179m@@ -1 \+1 @@\x1b\[0m/);
  assert.match(output, / {2}\x1b\[38;5;167m-before\x1b\[0m/);
  assert.match(output, / {2}\x1b\[38;5;108m\+after\x1b\[0m/);
  assert.doesNotMatch(output, /\x1b\[38;5;167m--- a\/tracked\.txt/);
  assert.doesNotMatch(output, /\x1b\[38;5;108m\+\+\+ b\/tracked\.txt/);
});
