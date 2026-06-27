import test from "node:test";
import assert from "node:assert/strict";
import {
  createTerminalRenderer,
  formatMeter,
  resolveTerminalTheme,
  shouldUseAnsiColor,
} from "./render.js";

test("terminal renderer disables color for non-tty and NO_COLOR", () => {
  assert.equal(shouldUseAnsiColor({ stream: { isTTY: false }, env: {} }), false);
  assert.equal(shouldUseAnsiColor({ stream: { isTTY: true }, env: { NO_COLOR: "1" } }), false);
  assert.equal(shouldUseAnsiColor({ stream: { isTTY: true }, env: {} }), true);

  const plain = createTerminalRenderer({ stream: { isTTY: true }, env: { NO_COLOR: "1" } });
  assert.equal(plain.success("ok"), "ok");

  const colored = createTerminalRenderer({ color: true });
  assert.equal(colored.success("ok"), "\x1b[32mok\x1b[0m");
});

test("terminal renderer supports explicit color themes", () => {
  const mono = createTerminalRenderer({ color: true, theme: "mono" });
  assert.equal(mono.theme, "mono");
  assert.equal(mono.success("ok"), "\x1b[1mok\x1b[0m");
  assert.equal(mono.accent("orx"), "\x1b[1morx\x1b[0m");

  const vivid = createTerminalRenderer({ color: true, theme: "vivid" });
  assert.equal(vivid.theme, "vivid");
  assert.equal(vivid.success("ok"), "\x1b[92mok\x1b[0m");
  assert.equal(vivid.warning("warn"), "\x1b[93mwarn\x1b[0m");
  assert.equal(vivid.danger("bad"), "\x1b[91mbad\x1b[0m");
  assert.equal(vivid.accent("orx"), "\x1b[96morx\x1b[0m");

  assert.equal(resolveTerminalTheme({ env: { ORX_TTY_THEME: "mono" } }), "mono");
  assert.equal(resolveTerminalTheme({ env: { ORX_THEME: "vivid" } }), "vivid");
  assert.equal(resolveTerminalTheme({ env: { ORX_THEME: "unknown" } }), "default");
});

test("formatMeter is ASCII-safe and reports unknown values as n/a", () => {
  assert.equal(formatMeter({ current: 25, total: 100, width: 10 }), "[###-------] 25.0%");
  assert.equal(formatMeter({ width: 10 }), "[----------] n/a");
});
