import test from "node:test";
import assert from "node:assert/strict";
import { createTerminalRenderer, formatMeter, shouldUseAnsiColor } from "./render.js";

test("terminal renderer disables color for non-tty and NO_COLOR", () => {
  assert.equal(shouldUseAnsiColor({ stream: { isTTY: false }, env: {} }), false);
  assert.equal(shouldUseAnsiColor({ stream: { isTTY: true }, env: { NO_COLOR: "1" } }), false);
  assert.equal(shouldUseAnsiColor({ stream: { isTTY: true }, env: {} }), true);

  const plain = createTerminalRenderer({ stream: { isTTY: true }, env: { NO_COLOR: "1" } });
  assert.equal(plain.success("ok"), "ok");

  const colored = createTerminalRenderer({ color: true });
  assert.equal(colored.success("ok"), "\x1b[32mok\x1b[0m");
});

test("formatMeter is ASCII-safe and reports unknown values as n/a", () => {
  assert.equal(formatMeter({ current: 25, total: 100, width: 10 }), "[###-------] 25.0%");
  assert.equal(formatMeter({ width: 10 }), "[----------] n/a");
});
