import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  discoverTestTargets,
  getTestAdapterSummary,
  parseTestReportSummary,
  parseStructuredTestReportSummary,
  renderTestRunResult,
  renderTestTargets,
  runTestTarget,
  type TestFramework,
  type TestTarget,
} from "./index.js";

test("discovers and runs package script test targets", async () => {
  const cwd = createTempDir();
  try {
    writeFileSync(
      join(cwd, "package.json"),
      JSON.stringify({
        scripts: {
          build: "node ./pass.mjs build",
          test: "node ./pass.mjs default",
          "test:unit": "node ./pass.mjs unit",
        },
      }),
    );
    writeFileSync(
      join(cwd, "pass.mjs"),
      [
        "console.log(`adapter-pass ${process.argv.slice(2).join(',')}`);",
        "console.log('Tests 1 passed (1)');",
        "",
      ].join("\n"),
    );

    const discovery = discoverTestTargets(cwd);
    assert.equal(discovery.defaultTargetId, "script:test");
    assert.deepEqual(
      discovery.targets.map((target) => target.id),
      ["script:test", "script:test:unit"],
    );
    assert.equal(discovery.targets[0].packageManager, "npm");
    assert.equal(discovery.targets[0].framework, "unknown");
    assert.match(renderTestTargets(discovery), /usage: orx tests run/);

    const result = await runTestTarget({
      cwd,
      targetId: "script:test:unit",
      extraArgs: ["--flag"],
    });
    assert.equal(result.ok, true);
    assert.equal(result.status, "ok");
    assert.deepEqual(result.report, {
      framework: "unknown",
      source: "generic",
      total: 1,
      passed: 1,
    });
    assert.match(result.stdout ?? "", /adapter-pass unit,--flag/);
    assert.match(renderTestRunResult(result), /status: ok/);
    assert.match(renderTestRunResult(result), /report: source=generic tests=1 passed=1/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("falls back to direct node:test files when no package test script exists", async () => {
  const cwd = createTempDir();
  try {
    writeFileSync(
      join(cwd, "example.test.mjs"),
      [
        "import test from 'node:test';",
        "import assert from 'node:assert/strict';",
        "test('node fallback works', () => assert.equal(2 + 2, 4));",
        "",
      ].join("\n"),
    );

    const discovery = discoverTestTargets(cwd);
    assert.equal(discovery.defaultTargetId, "node:test");
    assert.equal(discovery.targets.length, 1);
    assert.equal(discovery.targets[0].kind, "node-test");
    assert.equal(discovery.targets[0].framework, "node");
    assert.equal(discovery.targets[0].fileCount, 1);

    const result = await runTestTarget({ cwd });
    assert.equal(result.ok, true);
    assert.equal(result.status, "ok");
    assert.equal(result.target?.id, "node:test");
    assert.equal(result.report?.source, "node-junit");
    assert.equal(result.report?.total, 1);
    assert.equal(result.report?.passed, 1);
    assert.match(result.args.join(" "), /--test-reporter=junit/);

    const summary = getTestAdapterSummary(cwd);
    assert.equal(summary.targetCount, 1);
    assert.equal(summary.nodeTestTargetCount, 1);
    assert.deepEqual(summary.frameworkCounts, {
      node: 1,
      vitest: 0,
      jest: 0,
      playwright: 0,
      ava: 0,
      unknown: 0,
    });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("parses common framework report summaries", () => {
  const vitestOutput = [
    " Test Files  1 failed | 2 passed (3)",
    "      Tests  1 failed | 4 passed | 1 skipped (6)",
    "   Duration  1.25s",
  ].join("\n");
  const jestOutput = [
    "Test Suites: 1 failed, 2 passed, 3 total",
    "Tests:       1 failed, 2 skipped, 3 passed, 6 total",
    "Time:        1.234 s",
  ].join("\n");

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("node"),
      [
        "ℹ tests 6",
        "ℹ suites 0",
        "ℹ pass 5",
        "ℹ fail 1",
        "ℹ skipped 0",
        "ℹ todo 0",
        "ℹ duration_ms 522.250584",
      ].join("\n"),
    ),
    {
      framework: "node",
      source: "node",
      total: 6,
      passed: 5,
      failed: 1,
      skipped: 0,
      todo: 0,
      suites: 0,
      durationMs: 522.250584,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("node"),
      [
        "TAP version 13",
        "ok 1 - loads config",
        "not ok 2 - rejects bad input",
        "ok 3 - optional case # SKIP missing fixture",
        "not ok 4 - future case # TODO not implemented",
        "1..4",
        "# tests 4",
        "# pass 1",
        "# fail 1",
        "# skipped 1",
        "# todo 1",
        "# duration_ms 12.5",
      ].join("\n"),
    ),
    {
      framework: "node",
      source: "tap",
      total: 4,
      passed: 1,
      failed: 1,
      skipped: 1,
      todo: 1,
      durationMs: 12.5,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "TAP version 13",
        "ok 1 - one",
        "not ok 2 - two",
        "ok 3 - three # SKIP platform",
        "not ok 4 - four # TODO later",
        "1..4",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "tap",
      total: 4,
      passed: 1,
      failed: 1,
      skipped: 1,
      todo: 1,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(createTarget("vitest"), vitestOutput),
    {
      framework: "vitest",
      source: "vitest",
      files: 3,
      total: 6,
      passed: 4,
      failed: 1,
      skipped: 1,
      durationMs: 1250,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(createTarget("jest"), jestOutput),
    {
      framework: "jest",
      source: "jest",
      suites: 3,
      total: 6,
      passed: 3,
      failed: 1,
      skipped: 2,
      durationMs: 1234,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("playwright"),
      ["  1 failed", "  2 skipped", "  3 passed (4.5s)"].join("\n"),
    ),
    {
      framework: "playwright",
      source: "playwright",
      passed: 3,
      failed: 1,
      skipped: 2,
      total: 6,
      durationMs: 4500,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(createTarget("ava"), "\x1b[32m1 test passed\x1b[39m"),
    {
      framework: "ava",
      source: "ava",
      total: 1,
      passed: 1,
      failed: 0,
      skipped: 0,
      todo: 0,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(createTarget("ava"), "2 passed"),
    {
      framework: "ava",
      source: "ava",
      total: 2,
      passed: 2,
      failed: 0,
      skipped: 0,
      todo: 0,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("ava"),
      [
        "\x1b[31m13 tests failed\x1b[39m",
        "\x1b[31m1 known failure\x1b[39m",
        "\x1b[33m1 test skipped\x1b[39m",
        "\x1b[34m1 test todo\x1b[39m",
        "\x1b[31m2 unhandled rejections\x1b[39m",
      ].join("\n"),
    ),
    {
      framework: "ava",
      source: "ava",
      total: 16,
      passed: 1,
      failed: 13,
      skipped: 1,
      todo: 1,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("ava"),
      [
        "1 test failed",
        "details from a previous watch run",
        "1 test passed [17:19:12]",
      ].join("\n"),
    ),
    {
      framework: "ava",
      source: "ava",
      total: 1,
      passed: 1,
      failed: 0,
      skipped: 0,
      todo: 0,
    },
  );

  assert.equal(parseTestReportSummary(createTarget("unknown"), "1 test failed"), undefined);
  assert.equal(
    parseTestReportSummary(
      createTarget("ava"),
      [
        "1 test passed after cleanup",
        "Test Summary: 1 passed, 1 total",
      ].join("\n"),
    ),
    undefined,
  );

  assert.deepEqual(
    parseTestReportSummary(createTarget("unknown"), jestOutput),
    {
      framework: "unknown",
      source: "jest",
      suites: 3,
      total: 6,
      passed: 3,
      failed: 1,
      skipped: 2,
      durationMs: 1234,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(createTarget("unknown"), vitestOutput),
    {
      framework: "unknown",
      source: "vitest",
      files: 3,
      total: 6,
      passed: 4,
      failed: 1,
      skipped: 1,
      durationMs: 1250,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(createTarget("unknown"), "Test Summary: 1 failed, 2 passed, 3 total"),
    {
      framework: "unknown",
      source: "generic",
      total: 3,
      passed: 2,
      failed: 1,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "  2 passing (35ms)",
        "  1 pending",
        "  1 failing",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "mocha",
      total: 4,
      passed: 2,
      failed: 1,
      skipped: 1,
      durationMs: 35,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      "================ 2 failed, 3 passed, 1 skipped, 1 xfailed in 1.23s ================",
    ),
    {
      framework: "unknown",
      source: "pytest",
      total: 7,
      passed: 3,
      failed: 2,
      skipped: 1,
      todo: 1,
      durationMs: 1230,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      "test result: FAILED. 3 passed; 2 failed; 1 ignored; 0 measured; 0 filtered out; finished in 0.42s",
    ),
    {
      framework: "unknown",
      source: "cargo",
      total: 6,
      passed: 3,
      failed: 2,
      skipped: 1,
      durationMs: 420,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      "test result: ok. 4 passed; 0 failed; 0 ignored; 2 measured; 5 filtered out; finished in 0.25s",
    ),
    {
      framework: "unknown",
      source: "cargo",
      total: 4,
      passed: 4,
      failed: 0,
      skipped: 0,
      durationMs: 250,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "test result: ok. 3 passed; 0 failed; 1 ignored; 0 measured; 0 filtered out; finished in 0.42s",
        "test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.01s",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "cargo",
      total: 4,
      passed: 3,
      failed: 0,
      skipped: 1,
      durationMs: 430,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      "test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out (2ms)",
    ),
    {
      framework: "unknown",
      source: "deno",
      total: 1,
      passed: 1,
      failed: 0,
      skipped: 0,
      durationMs: 2,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      "test result: FAILED. 2 passed; 1 failed; 1 ignored; 0 measured; 3 filtered out (0.25s)",
    ),
    {
      framework: "unknown",
      source: "deno",
      total: 4,
      passed: 2,
      failed: 1,
      skipped: 1,
      durationMs: 250,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("node"),
      "test result: ok. 2 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out (10ms)",
    ),
    {
      framework: "node",
      source: "deno",
      total: 2,
      passed: 2,
      failed: 0,
      skipped: 0,
      durationMs: 10,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out (1ms)",
        "test result: ok. 2 passed; 0 failed; 1 ignored; 0 measured; 0 filtered out (2ms)",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "deno",
      total: 3,
      passed: 2,
      failed: 0,
      skipped: 1,
      durationMs: 2,
    },
  );

  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      "test result: ok. 1 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out (2ms)",
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      "test result: FAILED. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out (2ms)",
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      "test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out (2ms) after cleanup",
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out (1ms)",
        "test result: ok. 2 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out (2ms) after cleanup",
      ].join("\n"),
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out (1ms)",
        "test result: ok. 2 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out",
      ].join("\n"),
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      "test result: ok. 1 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out",
    ),
    undefined,
  );

  assert.deepEqual(
    parseTestReportSummary(createTarget("unknown"), "00:02 +3 ~1: All tests passed!"),
    {
      framework: "unknown",
      source: "dart",
      total: 4,
      passed: 3,
      failed: 0,
      skipped: 1,
      durationMs: 2000,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(createTarget("unknown"), "01:02 +2 -1 ~1: Some tests failed."),
    {
      framework: "unknown",
      source: "dart",
      total: 4,
      passed: 2,
      failed: 1,
      skipped: 1,
      durationMs: 62000,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(createTarget("node"), "01:02:03 +0 ~2: All tests skipped."),
    {
      framework: "node",
      source: "dart",
      total: 2,
      passed: 0,
      failed: 0,
      skipped: 2,
      durationMs: 3723000,
    },
  );

  assert.equal(parseTestReportSummary(createTarget("unknown"), "00:00 +1: loading test/widget_test.dart"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "00:00 +1 -1: All tests passed!"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "00:01 +0 ~1: All tests passed!"), undefined);
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "00:00 +1 -1: All tests passed!",
        "Summary: 2 total, 1 passed",
      ].join("\n"),
    ),
    undefined,
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "Finished in 0.05 seconds (0.03s async, 0.02s sync)",
        "3 tests, 1 failure, 1 skipped",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "exunit",
      total: 3,
      passed: 1,
      failed: 1,
      skipped: 1,
      durationMs: 50,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(createTarget("unknown"), "1 doctest, 2 tests, 0 failures"),
    {
      framework: "unknown",
      source: "exunit",
      total: 3,
      passed: 3,
      failed: 0,
      skipped: 0,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(createTarget("node"), "1 test, 0 failures"),
    {
      framework: "node",
      source: "exunit",
      total: 1,
      passed: 1,
      failed: 0,
      skipped: 0,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "1 test, 0 failures",
        "2 tests, 1 failure",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "exunit",
      total: 2,
      passed: 1,
      failed: 1,
      skipped: 0,
    },
  );

  assert.equal(parseTestReportSummary(createTarget("unknown"), "2 tests, 3 failures"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "2 tests, 0 failures, 3 skipped"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "2 tests, 0 failures after cleanup"), undefined);
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "1 test, 0 failures",
        "2 tests, 0 failures after cleanup",
      ].join("\n"),
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "2 tests, 3 failures",
        "Tests: 2 failed, 2 total",
      ].join("\n"),
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("node"),
      [
        "2 tests, 3 failures",
        "ℹ tests 2",
        "ℹ fail 2",
      ].join("\n"),
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("jest"),
      [
        "2 tests, 3 failures",
        "Tests: 2 failed, 2 total",
      ].join("\n"),
    ),
    undefined,
  );

  assert.deepEqual(
    parseTestReportSummary(createTarget("unknown"), "3 tests completed, 1 failed, 1 skipped"),
    {
      framework: "unknown",
      source: "gradle",
      total: 3,
      passed: 1,
      failed: 1,
      skipped: 1,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(createTarget("unknown"), "1 test completed, 0 failed"),
    {
      framework: "unknown",
      source: "gradle",
      total: 1,
      passed: 1,
      failed: 0,
      skipped: 0,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(createTarget("node"), "2 tests completed, 0 failed"),
    {
      framework: "node",
      source: "gradle",
      total: 2,
      passed: 2,
      failed: 0,
      skipped: 0,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "1 test completed, 0 failed",
        "2 tests completed, 1 failed",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "gradle",
      total: 2,
      passed: 1,
      failed: 1,
      skipped: 0,
    },
  );

  assert.equal(parseTestReportSummary(createTarget("unknown"), "2 tests completed, 3 failed"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "2 tests completed, 0 failed, 3 skipped"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "2 tests completed, 0 failed after cleanup"), undefined);
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "1 test completed, 0 failed",
        "2 tests completed, 0 failed after cleanup",
      ].join("\n"),
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "2 tests completed, 3 failed",
        "Tests: 2 failed, 2 total",
      ].join("\n"),
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("node"),
      [
        "2 tests completed, 3 failed",
        "ℹ tests 2",
        "ℹ fail 2",
      ].join("\n"),
    ),
    undefined,
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "Test run finished after 125 ms",
        "[         4 tests found           ]",
        "[         0 tests skipped         ]",
        "[         1 tests aborted         ]",
        "[         4 tests started         ]",
        "[         2 tests successful      ]",
        "[         1 tests failed          ]",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "junit-platform",
      total: 4,
      passed: 2,
      failed: 1,
      skipped: 1,
      durationMs: 125,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(createTarget("node"), "[ 1 test successful ]"),
    {
      framework: "node",
      source: "junit-platform",
      total: 1,
      passed: 1,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "[ 1 test found ]",
        "[ 1 test successful ]",
        "[ 2 tests found ]",
        "[ 1 test successful ]",
        "[ 1 test failed ]",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "junit-platform",
      total: 2,
      passed: 1,
      failed: 1,
      skipped: 0,
    },
  );

  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "[ 2 tests found ]",
        "[ 3 tests successful ]",
      ].join("\n"),
    ),
    undefined,
  );
  assert.equal(parseTestReportSummary(createTarget("unknown"), "[ 0 tests found ]"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "[ 2 tests failed ] after cleanup"), undefined);
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "[ 2 tests failed ] after cleanup",
        "Tests: 2 failed, 2 total",
      ].join("\n"),
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("node"),
      [
        "[ 2 tests failed ] after cleanup",
        "ℹ tests 2",
        "ℹ fail 2",
      ].join("\n"),
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "Test run finished after 125 ms after cleanup",
        "Tests: 2 failed, 2 total",
      ].join("\n"),
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("node"),
      [
        "Test run finished after 125 ms after cleanup",
        "ℹ tests 2",
        "ℹ fail 2",
      ].join("\n"),
    ),
    undefined,
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "Run completed in 386 milliseconds.",
        "Total number of tests run: 2",
        "Suites: completed 1, aborted 0",
        "Tests: succeeded 1, failed 1, canceled 1, ignored 1, pending 1",
        "*** 1 TEST FAILED ***",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "scalatest",
      total: 5,
      passed: 1,
      failed: 1,
      skipped: 2,
      todo: 1,
      suites: 1,
      durationMs: 386,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("node"),
      [
        "[info] Run completed in 0 milliseconds.",
        "[info] Total number of tests run: 3",
        "[info] Suites: completed 1, aborted 0",
        "[info] Tests: succeeded 3, failed 0, canceled 0, ignored 0, pending 0",
        "[info] All tests passed.",
      ].join("\n"),
    ),
    {
      framework: "node",
      source: "scalatest",
      total: 3,
      passed: 3,
      failed: 0,
      skipped: 0,
      todo: 0,
      suites: 1,
      durationMs: 0,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "Run stopped after 1 second, 1 millisecond.",
        "Total number of tests run: 1",
        "Suites: completed 1, aborted 1  Scopes: pending 2",
        "Tests: succeeded 0, failed 1, canceled 1, ignored 0, pending 1",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "scalatest",
      total: 3,
      passed: 0,
      failed: 1,
      skipped: 1,
      todo: 1,
      suites: 2,
      durationMs: 1001,
    },
  );

  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "Run completed in 10 milliseconds.",
        "Total number of tests run: 3",
        "Suites: completed 1, aborted 0",
        "Tests: succeeded 1, failed 1, canceled 0, ignored 0, pending 0",
        "Test Summary: 2 passed, 2 total",
      ].join("\n"),
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "Run completed in 10 milliseconds.",
        "Total number of tests run: 2",
        "Suites: completed 1, aborted 0",
        "Test Summary: 2 passed, 2 total",
      ].join("\n"),
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "Run completed in nope.",
        "Total number of tests run: 2",
        "Suites: completed 1, aborted 0",
        "Test Summary: 2 passed, 2 total",
      ].join("\n"),
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "Total number of tests run: 1",
        "Test Summary: 1 passed, 1 total",
      ].join("\n"),
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "Suites: completed 1, aborted 0",
        "Test Summary: 1 passed, 1 total",
      ].join("\n"),
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "Tests: succeeded 1, failed 0, canceled 0, ignored 0, pending 0",
        "Test Summary: 1 passed, 1 total",
      ].join("\n"),
    ),
    undefined,
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      "     Summary [   0.021s] 14 tests run: 14 passed, 177 skipped",
    ),
    {
      framework: "unknown",
      source: "nextest",
      total: 191,
      passed: 14,
      failed: 0,
      skipped: 177,
      flaky: 0,
      durationMs: 21,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("node"),
      "\x1b[32;1m     Summary\x1b[0m [   0.155s] \x1b[1m1\x1b[0m test run: \x1b[1m1\x1b[0m \x1b[32;1mpassed\x1b[0m, \x1b[1m50\x1b[0m \x1b[33;1mskipped\x1b[0m",
    ),
    {
      framework: "node",
      source: "nextest",
      total: 51,
      passed: 1,
      failed: 0,
      skipped: 50,
      flaky: 0,
      durationMs: 155,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      "     Summary [  15.750s] 8/10 tests run: 5 passed (1 slow, 1 flaky, 1 leaky), 2 failed, 1 exec failed, 1 timed out, 2 skipped",
    ),
    {
      framework: "unknown",
      source: "nextest",
      total: 11,
      passed: 5,
      failed: 4,
      skipped: 2,
      flaky: 1,
      durationMs: 15750,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "test result: FAILED. 0 passed; 1 failed; 0 ignored; 0 measured; 13 filtered out; finished in 0.00s",
        "     Summary [   0.105s] 1 test run: 0 passed, 1 failed (1 due to being leaky), 26 skipped",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "nextest",
      total: 27,
      passed: 0,
      failed: 1,
      skipped: 26,
      flaky: 0,
      durationMs: 105,
    },
  );

  assert.equal(
    parseTestReportSummary(createTarget("unknown"), "     Summary [ 120.000s] 25/50 stress run iterations: 25 passed"),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(createTarget("unknown"), " Stress test [ duration] iteration 1/5: 1 test run: 1 passed, 31 skipped"),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "     Summary [ duration] 1 test run: 1 passed, 0 skipped",
        "Test Summary: 1 passed, 1 total",
      ].join("\n"),
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "     Summary [   0.001s] 1 test run: 1 passed",
        "Test Summary: 1 passed, 1 total",
      ].join("\n"),
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "     Summary [   0.001s] 1 test run: 1 passed (1 flaky, 1 flaky), 0 skipped",
        "Test Summary: 1 passed, 1 total",
      ].join("\n"),
    ),
    undefined,
  );

  assert.deepEqual(
    parseTestReportSummary(createTarget("unknown"), "Total tests run: 4, Passes: 2, Failures: 1, Skips: 1"),
    {
      framework: "unknown",
      source: "testng",
      total: 4,
      passed: 2,
      failed: 1,
      skipped: 1,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(createTarget("node"), "Total tests run: 3, Failures: 1, Skips: 1"),
    {
      framework: "node",
      source: "testng",
      total: 3,
      passed: 1,
      failed: 1,
      skipped: 1,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "Total tests run: 1, Passes: 1, Failures: 0, Skips: 0",
        "Total tests run: 3, Passes: 1, Failures: 1, Skips: 1",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "testng",
      total: 3,
      passed: 1,
      failed: 1,
      skipped: 1,
    },
  );

  assert.equal(parseTestReportSummary(createTarget("unknown"), "Total tests run: 2, Passes: 3, Failures: 0, Skips: 0"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "Total tests run: 2, Passes: 1, Failures: 0, Errors: 1"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "Total tests run: 1, Passes: 1, Failures: 0, Skips: 0 after cleanup"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "Total tests run:4, Passes: 2, Failures: 1, Skips: 1"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "Total tests run: four, Passes: 2, Failures: 1, Skips: 1"), undefined);
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "Total tests run: 2, Passes: 3, Failures: 0, Skips: 0",
        "Test Summary: 3 passed, 3 total",
      ].join("\n"),
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "Total tests run:4, Passes: 2, Failures: 1, Skips: 1",
        "Test Summary: 4 passed, 4 total",
      ].join("\n"),
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("node"),
      [
        "Total tests run: four, Passes: 1, Failures: 0, Skips: 0",
        "ℹ tests 1",
        "ℹ pass 1",
      ].join("\n"),
    ),
    undefined,
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      "Test Count: 5, Passed: 2, Failed: 1, Warnings: 1, Inconclusive: 1, Skipped: 0",
    ),
    {
      framework: "unknown",
      source: "nunit",
      total: 5,
      passed: 3,
      failed: 1,
      skipped: 1,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("node"),
      "Test Count: 4, Passed: 2, Failed: 1, Warnings: 0, Inconclusive: 0, Skipped: 1",
    ),
    {
      framework: "node",
      source: "nunit",
      total: 4,
      passed: 2,
      failed: 1,
      skipped: 1,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "Test Count: 1, Passed: 1, Failed: 0, Warnings: 0, Inconclusive: 0, Skipped: 0",
        "Test Count: 3, Passed: 1, Failed: 1, Warnings: 0, Inconclusive: 0, Skipped: 1",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "nunit",
      total: 3,
      passed: 1,
      failed: 1,
      skipped: 1,
    },
  );

  assert.equal(
    parseTestReportSummary(createTarget("unknown"), "Test Count: 2, Passed: 3, Failed: 0, Warnings: 0, Inconclusive: 0, Skipped: 0"),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(createTarget("unknown"), "Test Count: 2, Passed: 1, Failed: 0, Errors: 1, Inconclusive: 0, Skipped: 0"),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(createTarget("unknown"), "Test Count: 1, Passed: 1, Failed: 0, Warnings: 0, Inconclusive: 0, Skipped: 0 after cleanup"),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(createTarget("unknown"), "Test Count:4, Passed: 2, Failed: 1, Warnings: 0, Inconclusive: 0, Skipped: 1"),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(createTarget("unknown"), "Test Count: four, Passed: 2, Failed: 1, Warnings: 0, Inconclusive: 0, Skipped: 1"),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "Test Count:4, Passed: 2, Failed: 1, Warnings: 0, Inconclusive: 0, Skipped: 1",
        "Test Summary: 4 passed, 4 total",
      ].join("\n"),
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("node"),
      [
        "Test Count: four, Passed: 1, Failed: 0, Warnings: 0, Inconclusive: 0, Skipped: 0",
        "ℹ tests 1",
        "ℹ pass 1",
      ].join("\n"),
    ),
    undefined,
  );

  assert.deepEqual(
    parseTestReportSummary(createTarget("unknown"), "2 tests, 1 passed, 1 failed"),
    {
      framework: "unknown",
      source: "robot",
      total: 2,
      passed: 1,
      failed: 1,
      skipped: 0,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(createTarget("node"), "3 tests, 1 passed, 1 failed, 1 skipped"),
    {
      framework: "node",
      source: "robot",
      total: 3,
      passed: 1,
      failed: 1,
      skipped: 1,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "1 test, 1 passed, 0 failed",
        "4 tests, 2 passed, 1 failed, 1 skipped",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "robot",
      total: 4,
      passed: 2,
      failed: 1,
      skipped: 1,
    },
  );

  assert.equal(parseTestReportSummary(createTarget("unknown"), "2 tests, 2 passed, 1 failed"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "2 tests, 1 passed, 1 failed after cleanup"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "2 tests, 1 passed, 1 errored"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "2 tests, 1 passed, 1 failed, 1 skipped"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "2 Tests, 1 Passed, 1 Failed"), undefined);
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "2 tests, 2 passed, 1 failed",
        "Test Summary: 3 passed, 3 total",
      ].join("\n"),
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("node"),
      [
        "2 tests, 1 passed, 1 failed after cleanup",
        "ℹ tests 2",
        "ℹ fail 1",
        "ℹ pass 1",
      ].join("\n"),
    ),
    undefined,
  );

  assert.deepEqual(
    parseTestReportSummary(createTarget("unknown"), "1 spec, 0 failures"),
    {
      framework: "unknown",
      source: "jasmine",
      total: 1,
      passed: 1,
      failed: 0,
      skipped: 0,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(createTarget("node"), "3 specs, 1 failure, 1 pending spec"),
    {
      framework: "node",
      source: "jasmine",
      total: 3,
      passed: 1,
      failed: 1,
      skipped: 1,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "2 specs, 0 failures",
        "4 specs, 1 failure, 2 pending specs",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "jasmine",
      total: 4,
      passed: 1,
      failed: 1,
      skipped: 2,
    },
  );

  assert.equal(parseTestReportSummary(createTarget("unknown"), "0 specs, 0 failures"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "2 specs, 3 failures"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "2 specs, 1 failure after cleanup"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "2 specs, 1 failed"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "2 specs, 0 failures, 3 pending specs"), undefined);
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "2 specs, 3 failures",
        "Test Summary: 3 passed, 3 total",
      ].join("\n"),
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("node"),
      [
        "2 specs, 1 failure after cleanup",
        "ℹ tests 2",
        "ℹ fail 1",
        "ℹ pass 1",
      ].join("\n"),
    ),
    undefined,
  );

  assert.deepEqual(
    parseTestReportSummary(createTarget("unknown"), "3 scenarios (1 failed, 2 passed)"),
    {
      framework: "unknown",
      source: "cucumber",
      total: 3,
      passed: 2,
      failed: 1,
      skipped: 0,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(createTarget("node"), "4 scenarios (2 passed, 1 skipped, 1 pending)"),
    {
      framework: "node",
      source: "cucumber",
      total: 4,
      passed: 2,
      failed: 0,
      skipped: 2,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "1 scenario (1 passed)",
        "2 scenarios (1 failed, 1 undefined)",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "cucumber",
      total: 2,
      passed: 0,
      failed: 1,
      skipped: 1,
    },
  );

  assert.equal(parseTestReportSummary(createTarget("unknown"), "2 scenarios (3 passed)"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "2 scenarios (1 passed, 1 errored)"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "2 scenarios (2 passed) after cleanup"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "2 scenarios(2 passed)"), undefined);
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "2 scenarios (3 passed)",
        "Tests: 2 failed, 2 total",
      ].join("\n"),
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("node"),
      [
        "2 scenarios(2 passed)",
        "ℹ tests 2",
        "ℹ pass 2",
      ].join("\n"),
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("node"),
      [
        "2 scenarios (2 passed) after cleanup",
        "ℹ tests 2",
        "ℹ pass 2",
      ].join("\n"),
    ),
    undefined,
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "6 scenarios (1 passed, 3 failed, 1 undefined, 1 pending)",
        "23 steps (16 passed, 3 failed, 1 undefined, 1 pending, 2 skipped)",
        "0m0.02s (18.50Mb)",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "behat",
      total: 6,
      passed: 1,
      failed: 3,
      skipped: 0,
      todo: 2,
      durationMs: 20,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("node"),
      [
        "2 scenarios (2 passed)",
        "6 steps (6 passed)",
        "1m2.34s (22.25Mb)",
      ].join("\n"),
    ),
    {
      framework: "node",
      source: "behat",
      total: 2,
      passed: 2,
      failed: 0,
      skipped: 0,
      todo: 0,
      durationMs: 62340,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "3 scenarios (1 failed, 2 passed)",
        "9 steps (7 passed, 1 failed, 1 skipped)",
        "0m0.02s",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "cucumber",
      total: 3,
      passed: 2,
      failed: 1,
      skipped: 0,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "3 scenarios (1 failed, 1 passed, 1 ambiguous)",
        "9 steps (7 passed, 1 failed, 1 ambiguous)",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "cucumber",
      total: 3,
      passed: 1,
      failed: 1,
      skipped: 1,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "1 feature passed, 0 failed, 0 skipped",
        "3 scenarios passed, 1 failed, 1 skipped",
        "16 steps passed, 1 failed, 2 skipped, 1 undefined",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "behave",
      total: 5,
      passed: 3,
      failed: 1,
      skipped: 1,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("node"),
      [
        "2 features passed, 1 failed, 1 skipped, 1 untested",
        "2 scenarios passed, 1 error, 1 skipped, 1 untested",
        "12 steps passed, 1 hook_error, 1 pending_warn, 2 skipped",
      ].join("\n"),
    ),
    {
      framework: "node",
      source: "behave",
      total: 5,
      passed: 2,
      failed: 1,
      skipped: 2,
    },
  );

  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "1 scenarios passed, 0 failed, 0 skipped",
        "4 steps passed, 0 failed, 0 skipped",
        "Tests: 2 passed, 2 total",
      ].join("\n"),
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "1 scenario passed, 0 failed, 0 skipped",
        "Tests: 1 passed, 1 total",
      ].join("\n"),
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("node"),
      [
        "1 scenario passed, 0 failed, 0 skipped",
        "3 steps passed, 0 failed, 0 skipped after cleanup",
        "ℹ tests 1",
        "ℹ pass 1",
      ].join("\n"),
    ),
    undefined,
  );

  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "2 scenarios (1 passed, 2 failed)",
        "6 steps (4 passed, 2 failed)",
        "0m0.02s (18.50Mb)",
        "Tests: 3 failed, 3 total",
      ].join("\n"),
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "2 scenarios (1 passed, 1 failed)",
        "6 steps (4 passed, 1 failed)",
        "0m0.02s (18.50Mb)",
        "Tests: 2 failed, 2 total",
      ].join("\n"),
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("node"),
      [
        "2 scenarios (1 passed, 1 failed)",
        "6 steps (4 passed, 1 failed, 1 skipped)",
        "0m0.02s (18.50Mb) after cleanup",
        "ℹ tests 2",
        "ℹ fail 1",
        "ℹ pass 1",
      ].join("\n"),
    ),
    undefined,
  );

  assert.deepEqual(
    parseTestReportSummary(createTarget("unknown"), "[ FAIL 1 | WARN 0 | SKIP 2 | PASS 5 ]"),
    {
      framework: "unknown",
      source: "testthat",
      total: 8,
      passed: 5,
      failed: 1,
      skipped: 2,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(createTarget("node"), "[ FAIL 0 | WARN 2 | SKIP 1 | PASS 3 ]"),
    {
      framework: "node",
      source: "testthat",
      total: 4,
      passed: 3,
      failed: 0,
      skipped: 1,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "[ FAIL 0 | WARN 0 | SKIP 0 | PASS 1 ]",
        "[ FAIL 2 | WARN 1 | SKIP 1 | PASS 4 ]",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "testthat",
      total: 7,
      passed: 4,
      failed: 2,
      skipped: 1,
    },
  );

  assert.equal(parseTestReportSummary(createTarget("unknown"), "[ FAIL 0 | SKIP 0 | PASS 2 ]"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "[ PASS 2 | WARN 0 | SKIP 0 | FAIL 0 ]"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "[ FAIL 0 | WARN 0 | SKIP 0 | PASS 2 | TODO 1 ]"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "[ FAIL 0 | WARN 0 | SKIP 0 | PASS 2 ] after cleanup"), undefined);
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "[ FAIL 0 | WARN 0 | SKIP 0 | PASS 2 | TODO 1 ]",
        "Tests: 2 failed, 2 total",
      ].join("\n"),
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "[ TODO 1 | FAIL 0 | WARN 0 | SKIP 0 | PASS 2 ]",
        "Tests: 2 failed, 2 total",
      ].join("\n"),
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("node"),
      [
        "[ FAIL 0 | WARN 0 | SKIP 0 | PASS 2 ] after cleanup",
        "ℹ tests 2",
        "ℹ pass 2",
      ].join("\n"),
    ),
    undefined,
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "[==========] 4 tests from 2 test suites ran. (12 ms total)",
        "[  PASSED  ] 2 tests.",
        "[  SKIPPED ] 1 test, listed below:",
        "[  FAILED  ] 1 test, listed below:",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "gtest",
      total: 4,
      passed: 2,
      failed: 1,
      skipped: 1,
      durationMs: 12,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("node"),
      [
        "[==========] 3 tests from 1 test suite ran. (0.5 s total)",
        "[  PASSED  ] 3 tests.",
      ].join("\n"),
    ),
    {
      framework: "node",
      source: "gtest",
      total: 3,
      passed: 3,
      failed: 0,
      skipped: 0,
      durationMs: 500,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "[==========] 2 tests from 1 test suite ran. (3 ms total)",
        "[  PASSED  ] 1 test.",
        "[  SKIPPED ] 1 test, listed below:",
        "[==========] 2 tests from 1 test suite ran. (4 ms total)",
        "[  PASSED  ] 1 test.",
        "[  FAILED  ] 1 test, listed below:",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "gtest",
      total: 2,
      passed: 1,
      failed: 1,
      skipped: 0,
      durationMs: 4,
    },
  );

  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "[==========] 2 tests from 1 test suite ran. (12 ms total)",
        "[  PASSED  ] 3 tests.",
      ].join("\n"),
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "[==========] 2 tests from 1 test suite ran. (12 ms total)",
        "[  PASSED  ] 3 tests.",
        "Test Summary: 3 passed, 3 total",
      ].join("\n"),
    ),
    undefined,
  );
  assert.equal(parseTestReportSummary(createTarget("unknown"), "[  FAILED  ] 1 test after cleanup"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "[  ERRORED ] 1 test."), undefined);
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "[  ERRORED ] 1 test.",
        "Tests: 2 failed, 2 total",
      ].join("\n"),
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("node"),
      [
        "[  FAILED  ] 1 test after cleanup",
        "ℹ tests 1",
        "ℹ fail 1",
      ].join("\n"),
    ),
    undefined,
  );

  assert.deepEqual(
    parseTestReportSummary(createTarget("unknown"), "All tests passed (4 assertions in 2 test cases)"),
    {
      framework: "unknown",
      source: "catch2",
      total: 2,
      passed: 2,
      failed: 0,
      skipped: 0,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(createTarget("node"), "test cases: 4 | 2 passed | 1 failed | 1 skipped"),
    {
      framework: "node",
      source: "catch2",
      total: 4,
      passed: 2,
      failed: 1,
      skipped: 1,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "test cases: 1 | 1 passed",
        "test cases: 3 | 1 passed | 1 failed | 1 skipped",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "catch2",
      total: 3,
      passed: 1,
      failed: 1,
      skipped: 1,
    },
  );

  assert.equal(parseTestReportSummary(createTarget("unknown"), "test cases: 2 | 3 passed"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "test cases: 2 | 1 passed | 1 errored"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "All tests passed (4 assertions in 2 test cases) after cleanup"), undefined);
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "test cases: 2 | 3 passed",
        "Test Summary: 3 passed, 3 total",
      ].join("\n"),
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("node"),
      [
        "All tests passed (4 assertions in 2 test cases) after cleanup",
        "ℹ tests 2",
        "ℹ pass 2",
      ].join("\n"),
    ),
    undefined,
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "=== RUN   TestAlpha",
        "--- PASS: TestAlpha (0.01s)",
        "=== RUN   TestBeta",
        "--- FAIL: TestBeta (0.02s)",
        "=== RUN   TestSkip",
        "--- SKIP: TestSkip (0.00s)",
        "FAIL",
        "FAIL\texample.com/project/pkg\t0.12s",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "go",
      total: 3,
      passed: 1,
      failed: 1,
      skipped: 1,
      durationMs: 120,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "--- PASS: TestOne (0.01s)",
        "ok  \texample.com/project/a\t0.10s",
        "--- PASS: TestTwo (0.01s)",
        "ok  \texample.com/project/b\t0.20s",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "go",
      total: 2,
      passed: 2,
      durationMs: 300,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "{\"Action\":\"run\",\"Package\":\"example.com/project/pkg\",\"Test\":\"TestAlpha\"}",
        "{\"Action\":\"pass\",\"Package\":\"example.com/project/pkg\",\"Test\":\"TestAlpha\",\"Elapsed\":0.01}",
        "{\"Action\":\"run\",\"Package\":\"example.com/project/pkg\",\"Test\":\"TestBeta\"}",
        "{\"Action\":\"fail\",\"Package\":\"example.com/project/pkg\",\"Test\":\"TestBeta\",\"Elapsed\":0.02}",
        "{\"Action\":\"skip\",\"Package\":\"example.com/project/pkg\",\"Test\":\"TestSkip\",\"Elapsed\":0}",
        "{\"Action\":\"fail\",\"Package\":\"example.com/project/pkg\",\"Elapsed\":0.123}",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "go-json",
      total: 3,
      passed: 1,
      failed: 1,
      skipped: 1,
      durationMs: 123,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "{\"Action\":\"fail\",\"Package\":\"example.com/project/pkg\",\"Test\":\"TestRetry\",\"Elapsed\":0.01}",
        "{\"Action\":\"pass\",\"Package\":\"example.com/project/pkg\",\"Test\":\"TestRetry\",\"Elapsed\":0.02}",
        "{\"Action\":\"pass\",\"Package\":\"example.com/project/pkg\",\"Elapsed\":0.2}",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "go-json",
      total: 1,
      passed: 1,
      failed: 0,
      skipped: 0,
      durationMs: 200,
    },
  );

  assert.equal(
    parseTestReportSummary(createTarget("unknown"), "{\"Action\":\"pass\",\"Package\":\"example.com/project/pkg\",\"Elapsed\":0.01}"),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(createTarget("unknown"), "{\"Action\":\"output\",\"Package\":\"example.com/project/pkg\",\"Test\":\"TestAlpha\",\"Output\":\"PASS\"}"),
    undefined,
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      "All specs passed!                        00:05        4        3        -        1        -",
    ),
    {
      framework: "unknown",
      source: "cypress",
      total: 4,
      passed: 3,
      failed: 0,
      skipped: 0,
      todo: 1,
      durationMs: 5000,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      "1 of 2 failed (50%)                      01:02        4        2        1        -        1",
    ),
    {
      framework: "unknown",
      source: "cypress",
      total: 4,
      passed: 2,
      failed: 1,
      skipped: 1,
      todo: 0,
      durationMs: 62000,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      "│ ✔  All specs passed!                    00:05        4        3        -        1        - │",
    ),
    {
      framework: "unknown",
      source: "cypress",
      total: 4,
      passed: 3,
      failed: 0,
      skipped: 0,
      todo: 1,
      durationMs: 5000,
    },
  );

  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      "All specs passed!                        00:05        4        3        1        -        -",
    ),
    undefined,
  );
  assert.equal(parseTestReportSummary(createTarget("unknown"), "All specs passed! after cleanup"), undefined);
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "All specs passed! 00:05 4 3 1 - -",
        "Summary: 4 total, 3 passed",
      ].join("\n"),
    ),
    undefined,
  );

  assert.equal(parseTestReportSummary(createTarget("unknown"), "2 failed network requests (99)"), undefined);
  assert.equal(parseTestReportSummary(createTarget("playwright"), "2 failed network requests (99)"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "ok 1 - only a log line"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "1..4"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "1 pending migration"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "2 failed network requests in 1.2s"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "1 warning in 0.1s"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "2 failed, 3 passed in 1.2s after cleanup"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "3 passed; 2 failed; finished in 0.42s"), undefined);
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      "test result: FAILED. 3 passed; 2 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.42s after cleanup",
    ),
    undefined,
  );
  assert.equal(parseTestReportSummary(createTarget("unknown"), "PASS: TestAlpha (0.01s)"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "--- PASS: migration completed (0.01s)"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "--- PASS: TestAlpha (0.01s) after cleanup"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "--- pass: TestAlpha (0.01s)"), undefined);
  assert.deepEqual(
    parseTestReportSummary(createTarget("unknown"), "--- PASS: TestAlpha (0.01s)\nfail example.com/project/pkg 0.12s"),
    {
      framework: "unknown",
      source: "go",
      total: 1,
      passed: 1,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "Finished in 0.123 seconds (files took 0.456 seconds to load)",
        "3 examples, 1 failure, 1 pending",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "rspec",
      total: 3,
      passed: 1,
      failed: 1,
      skipped: 1,
      durationMs: 123,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(createTarget("unknown"), "1 example, 0 failures"),
    {
      framework: "unknown",
      source: "rspec",
      total: 1,
      passed: 1,
      failed: 0,
    },
  );
  assert.equal(parseTestReportSummary(createTarget("unknown"), "3 examples, 1 failure after cleanup"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "3 examples, 4 failures"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "3 examples, 2 failures, 2 pending"), undefined);
  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      "Finished in 0.123 seconds after cleanup\n3 examples, 0 failures",
    ),
    {
      framework: "unknown",
      source: "rspec",
      total: 3,
      passed: 3,
      failed: 0,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "Finished in 0.123456s, 24.3000 runs/s, 48.6000 assertions/s.",
        "3 runs, 6 assertions, 1 failures, 1 errors, 1 skips",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "minitest",
      total: 3,
      passed: 0,
      failed: 2,
      skipped: 1,
      durationMs: 123.456,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(createTarget("unknown"), "1 runs, 1 assertions, 0 failures, 0 errors, 0 skips"),
    {
      framework: "unknown",
      source: "minitest",
      total: 1,
      passed: 1,
      failed: 0,
      skipped: 0,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(createTarget("node"), "2 runs, 2 assertions, 0 failures, 0 errors, 0 skips"),
    {
      framework: "node",
      source: "minitest",
      total: 2,
      passed: 2,
      failed: 0,
      skipped: 0,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "1 runs, 1 assertions, 0 failures, 0 errors, 0 skips",
        "2 runs, 2 assertions, 1 failures, 0 errors, 0 skips",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "minitest",
      total: 2,
      passed: 1,
      failed: 1,
      skipped: 0,
    },
  );

  assert.equal(
    parseTestReportSummary(createTarget("unknown"), "2 runs, 2 assertions, 2 failures, 1 errors, 0 skips"),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(createTarget("unknown"), "2 runs, 2 assertions, 0 failures, 0 errors, 0 skips after cleanup"),
    undefined,
  );
  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "Finished in 0.123s after cleanup",
        "1 runs, 1 assertions, 0 failures, 0 errors, 0 skips",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "minitest",
      total: 1,
      passed: 1,
      failed: 0,
      skipped: 0,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(createTarget("unknown"), "TOTAL: 1 FAILED, 2 SUCCESS, 1 SKIPPED"),
    {
      framework: "unknown",
      source: "karma",
      total: 4,
      passed: 2,
      failed: 1,
      skipped: 1,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(createTarget("unknown"), "TOTAL: 69 SUCCESS"),
    {
      framework: "unknown",
      source: "karma",
      total: 69,
      passed: 69,
      failed: 0,
      skipped: 0,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(createTarget("node"), "TOTAL: 2 SUCCESS"),
    {
      framework: "node",
      source: "karma",
      total: 2,
      passed: 2,
      failed: 0,
      skipped: 0,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "TOTAL: 1 SUCCESS",
        "TOTAL: 1 FAILED, 1 SUCCESS",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "karma",
      total: 2,
      passed: 1,
      failed: 1,
      skipped: 0,
    },
  );

  assert.equal(parseTestReportSummary(createTarget("unknown"), "TOTAL: 2 SUCCESS after cleanup"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "TOTAL: 1 SUCCESS, 1 ERROR"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "Total: 1 SUCCESS"), undefined);

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "4 pass",
        "0 fail",
        "4 expect() calls",
        "Ran 4 tests in 1.44ms",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "bun",
      total: 4,
      passed: 4,
      failed: 0,
      durationMs: 1.44,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "2 pass",
        "1 fail",
        "Ran 3 tests across 2 files. [50.00ms]",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "bun",
      total: 3,
      passed: 2,
      failed: 1,
      files: 2,
      durationMs: 50,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("node"),
      [
        "1 pass",
        "0 fail",
        "Ran 1 test across 1 file. 1 total [125.00ms]",
      ].join("\n"),
    ),
    {
      framework: "node",
      source: "bun",
      total: 1,
      passed: 1,
      failed: 0,
      files: 1,
      durationMs: 125,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "1 pass",
        "0 fail",
        "Ran 1 test in 0.001s",
        "2 pass",
        "0 fail",
        "Ran 2 tests in 2ms",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "bun",
      total: 2,
      passed: 2,
      failed: 0,
      durationMs: 2,
    },
  );

  assert.equal(parseTestReportSummary(createTarget("unknown"), "4 pass\n0 fail\nRan 5 tests in 1ms"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "4 pass\nRan 4 tests in 1ms"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "4 pass\n0 fail\nRan 4 tests in 1ms after cleanup"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "4 ok\n0 fail\nRan 4 tests in 1ms"), undefined);
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "1 pass",
        "0 fail",
        "Ran 1 test in 1ms",
        "2 pass",
        "Ran 2 tests in 2ms",
      ].join("\n"),
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "1 pass",
        "0 fail",
        "Ran 1 test in 1ms",
        "2 passes",
        "0 fails",
        "Ran 2 tests in 2ms",
      ].join("\n"),
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "1 pass",
        "0 fail",
        "Ran 1 test in 1ms",
        "2 pass",
      ].join("\n"),
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "1 pass",
        "0 fail",
        "Ran 1 test in 1ms",
        "2 pass",
        "0 fail",
      ].join("\n"),
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "2 pass",
        "1 fail",
        "Ran 3 tests across 2 files. 99 total [50ms]",
      ].join("\n"),
    ),
    undefined,
  );

  assert.deepEqual(parseTestReportSummary(createTarget("unknown"), "All 3 tests passed"), {
    framework: "unknown",
    source: "tasty",
    total: 3,
    passed: 3,
    failed: 0,
  });

  assert.deepEqual(parseTestReportSummary(createTarget("node"), "All 2 tests passed (0.12s)"), {
    framework: "node",
    source: "tasty",
    total: 2,
    passed: 2,
    failed: 0,
    durationMs: 120,
  });

  assert.deepEqual(parseTestReportSummary(createTarget("unknown"), "1 out of 3 tests failed (1.23s)"), {
    framework: "unknown",
    source: "tasty",
    total: 3,
    passed: 2,
    failed: 1,
    durationMs: 1230,
  });

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "All 1 tests passed",
        "2 out of 4 tests failed",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "tasty",
      total: 4,
      passed: 2,
      failed: 2,
    },
  );

  assert.equal(parseTestReportSummary(createTarget("unknown"), "All 0 tests passed"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "All 03 tests passed"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "All 1 test passed"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "All 3 tests passed (0.1s)"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "All 3 tests passed (1s)"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "All 9007199254740993 tests passed"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "0 out of 3 tests failed"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "01 out of 3 tests failed"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "4 out of 3 tests failed"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "1 out of 9007199254740993 tests failed"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "1 out of 3 tests failed (0.1s)"), undefined);
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "1 out of 3 test failed",
        "Test Summary: 1 failed, 1 total",
      ].join("\n"),
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "All 3 tests passed (0.1s)",
        "Test Summary: 1 passed, 1 total",
      ].join("\n"),
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "All 9007199254740993 tests passed",
        "Test Summary: 1 passed, 1 total",
      ].join("\n"),
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "All 1 tests passed",
        "cleanup done",
      ].join("\n"),
    ),
    undefined,
  );

  assert.deepEqual(parseTestReportSummary(createTarget("unknown"), "All 3 tests passed."), {
    framework: "unknown",
    source: "zig",
    total: 3,
    passed: 3,
    failed: 0,
    skipped: 0,
  });

  assert.deepEqual(parseTestReportSummary(createTarget("unknown"), "2 passed; 1 skipped; 1 failed."), {
    framework: "unknown",
    source: "zig",
    total: 4,
    passed: 2,
    failed: 1,
    skipped: 1,
  });

  assert.deepEqual(parseTestReportSummary(createTarget("node"), "2 passed, 1 skipped, 0 failed"), {
    framework: "node",
    source: "zig",
    total: 3,
    passed: 2,
    failed: 0,
    skipped: 1,
  });

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "All 1 tests passed.",
        "2 passed; 1 skipped; 0 failed.",
        "1 errors were logged.",
        "1 tests leaked memory.",
        "2 fuzz tests found.",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "zig",
      total: 3,
      passed: 2,
      failed: 0,
      skipped: 1,
    },
  );

  assert.equal(parseTestReportSummary(createTarget("unknown"), "All 0 tests passed."), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "All 1 test passed."), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "0 passed; 0 skipped; 0 failed."), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "1 passed; 0 skipped; 0 failed"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "1 passed, 0 skipped, 0 failed."), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "1 passed, 0 skipped; 0 failed"), undefined);
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "1 passed; 0 skipped; 0 failed.",
        "Test Summary: 1 passed, 1 total",
      ].join("\n"),
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "1 passed; 0 skipped; 0 failed.",
        "cleanup done",
      ].join("\n"),
    ),
    undefined,
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "----------------------------------------------------------------------",
        "Ran 4 tests in 0.012s",
        "",
        "OK",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "unittest",
      total: 4,
      passed: 4,
      failed: 0,
      durationMs: 12,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "----------------------------------------------------------------------",
        "Ran 6 tests in 0.034s",
        "",
        "FAILED (failures=1, errors=1, skipped=1, expected failures=1, unexpected successes=1)",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "unittest",
      total: 6,
      passed: 1,
      failed: 3,
      skipped: 1,
      todo: 1,
      durationMs: 34,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "Ran 3 tests in 0.001s",
        "",
        "OK (skipped=1, expected failures=1)",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "unittest",
      total: 3,
      passed: 1,
      failed: 0,
      skipped: 1,
      todo: 1,
      durationMs: 1,
    },
  );

  assert.equal(parseTestReportSummary(createTarget("unknown"), "Ran 3 requests in 0.001s\nOK"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "Ran 3 tests in 0.001s\nOK after cleanup"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "Ran 3 tests in 0.001s\nFAILED (failures=1) after cleanup"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "Ran 3 tests in 0.001s\nOK\ncleanup done"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "Ran 3 tests in 0.001s\nFAILED (failures=1)\ncleanup done"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "Ran 3 tests in 0.001s\nFAILED (skipped=1)"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "Ran 3 tests in 0.001s\nOK (failures=1)"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "Ran 3 tests in 0.001s\nFAILED (failures=1, skipped=3)"), undefined);

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      "Tests run: 6, Failures: 1, Errors: 1, Skipped: 2, Time elapsed: 0.123 s -- in com.example.FooTest",
    ),
    {
      framework: "unknown",
      source: "junit-text",
      total: 6,
      passed: 2,
      failed: 2,
      skipped: 2,
      durationMs: 123,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(createTarget("unknown"), "Tests run: 2, Failures: 0, Errors: 0, Skipped: 0"),
    {
      framework: "unknown",
      source: "junit-text",
      total: 2,
      passed: 2,
      failed: 0,
      skipped: 0,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      "[ERROR] Tests run: 1, Failures: 0, Errors: 1, Skipped: 0, Time elapsed: 0.039 s <<< FAILURE! -- in com.example.FooTest",
    ),
    {
      framework: "unknown",
      source: "junit-text",
      total: 1,
      passed: 0,
      failed: 1,
      skipped: 0,
      durationMs: 39,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(createTarget("unknown"), "Tests run: 1, Failures: 0, Errors: 1, Skipped: 0 <<< ERROR!"),
    {
      framework: "unknown",
      source: "junit-text",
      total: 1,
      passed: 0,
      failed: 1,
      skipped: 0,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(createTarget("unknown"), "Tests run: 2, Failures: 0, Errors: 0, Skipped: 0 -- in com.example.FooTest"),
    {
      framework: "unknown",
      source: "junit-text",
      total: 2,
      passed: 2,
      failed: 0,
      skipped: 0,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(createTarget("unknown"), "Tests run: 2, Failures: 1, Errors: 0, Skipped: 0 <<< FAILURE! -- in com.example.FooTest"),
    {
      framework: "unknown",
      source: "junit-text",
      total: 2,
      passed: 1,
      failed: 1,
      skipped: 0,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(createTarget("node"), "Tests run: 1, Failures: 0, Errors: 1, Skipped: 0 <<< ERROR!"),
    {
      framework: "node",
      source: "junit-text",
      total: 1,
      passed: 0,
      failed: 1,
      skipped: 0,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "Tests run: 1, Failures: 0, Errors: 0, Skipped: 0",
        "Tests run: 2, Failures: 1, Errors: 0, Skipped: 0",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "junit-text",
      total: 2,
      passed: 1,
      failed: 1,
      skipped: 0,
    },
  );

  assert.equal(
    parseTestReportSummary(createTarget("unknown"), "Tests run: 2, Failures: 2, Errors: 1, Skipped: 0"),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(createTarget("unknown"), "Tests run: 2, Failures: 0, Errors: 0, Skipped: 0 after cleanup"),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(createTarget("unknown"), "Tests run: 2, Failures: 0, Errors: 0, Skipped: 0, Time elapsed: 0.1 s after cleanup"),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(createTarget("unknown"), "[ERROR] Tests run: 2, Failures: 0, Errors: 0, Skipped: 0 after cleanup"),
    undefined,
  );

  assert.deepEqual(
    parseTestReportSummary(createTarget("unknown"), "Tests:    2 passed (2 assertions)"),
    {
      framework: "unknown",
      source: "pest",
      total: 2,
      passed: 2,
      failed: 0,
      skipped: 0,
      todo: 0,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(createTarget("node"), "Tests:    1 failed, 1 passed (1 assertions)"),
    {
      framework: "node",
      source: "pest",
      total: 2,
      passed: 1,
      failed: 1,
      skipped: 0,
      todo: 0,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      "Tests:    2 deprecated, 4 warnings, 5 incomplete, 3 notices, 40 todos, 27 skipped, 1314 passed (2959 assertions)",
    ),
    {
      framework: "unknown",
      source: "pest",
      total: 1395,
      passed: 1323,
      failed: 0,
      skipped: 27,
      todo: 45,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "Tests:    1 skipped, 1 passed (1 assertions)",
        "Tests:    1 failed, 2 passed (3 assertions)",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "pest",
      total: 3,
      passed: 2,
      failed: 1,
      skipped: 0,
      todo: 0,
    },
  );

  assert.equal(parseTestReportSummary(createTarget("unknown"), "Tests:    0 passed (0 assertions)"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "Tests:    1 errored, 1 passed (1 assertions)"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "Tests:    1 passed, 1 passed (2 assertions)"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "Tests:    1 failed, 1 passed (1 assertions) after cleanup"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "Tests:    1 failed, 1 passed (2 assertions). after cleanup"), undefined);
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "Tests:    1 failed, 1 passed (2 assertions). after cleanup",
        "Test Summary: 2 passed, 2 total",
      ].join("\n"),
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("node"),
      [
        "Tests:    1 failed, 1 passed (2 assertions). after cleanup",
        "ℹ tests 2",
        "ℹ fail 1",
        "ℹ pass 1",
      ].join("\n"),
    ),
    undefined,
  );

  assert.deepEqual(
    parseTestReportSummary(createTarget("unknown"), "OK (3 tests, 5 assertions)"),
    {
      framework: "unknown",
      source: "phpunit",
      total: 3,
      passed: 3,
      failed: 0,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      "Tests: 6, Assertions: 8, Errors: 1, Failures: 1, Skipped: 1, Incomplete: 1, Risky: 1.",
    ),
    {
      framework: "unknown",
      source: "phpunit",
      total: 6,
      passed: 1,
      failed: 3,
      skipped: 1,
      todo: 1,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(createTarget("unknown"), "Test: 1, Assertion: 1, Failure: 1."),
    {
      framework: "unknown",
      source: "phpunit",
      total: 1,
      passed: 0,
      failed: 1,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(createTarget("node"), "OK (2 tests, 4 assertions)"),
    {
      framework: "node",
      source: "phpunit",
      total: 2,
      passed: 2,
      failed: 0,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "OK (1 test, 1 assertion)",
        "Tests: 2, Assertions: 2, Failure: 1.",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "phpunit",
      total: 2,
      passed: 1,
      failed: 1,
    },
  );

  assert.equal(parseTestReportSummary(createTarget("unknown"), "OK (3 tests, 5 assertions) after cleanup"), undefined);
  assert.equal(
    parseTestReportSummary(createTarget("unknown"), "Tests: 2, Assertions: 2, Errors: 2, Failures: 1."),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(createTarget("unknown"), "Tests: 2, Assertions: 2, Failures: 1. after cleanup"),
    undefined,
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      "Passed!  - Failed:     0, Passed:    10, Skipped:     1, Total:    11, Duration: 123 ms - Example.Tests.dll (net8.0)",
    ),
    {
      framework: "unknown",
      source: "dotnet",
      total: 11,
      passed: 10,
      failed: 0,
      skipped: 1,
      durationMs: 123,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      "Failed! - Failed: 1, Passed: 2, Skipped: 1, Total: 4, Duration: 1.5 s",
    ),
    {
      framework: "unknown",
      source: "dotnet",
      total: 4,
      passed: 2,
      failed: 1,
      skipped: 1,
      durationMs: 1500,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(createTarget("node"), "Passed! - Failed: 0, Passed: 2, Skipped: 0, Total: 2"),
    {
      framework: "node",
      source: "dotnet",
      total: 2,
      passed: 2,
      failed: 0,
      skipped: 0,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(createTarget("unknown"), "Passed! - Failed: 0, Passed: 1, Skipped: 0, Total: 1, Duration: 0 ms"),
    {
      framework: "unknown",
      source: "dotnet",
      total: 1,
      passed: 1,
      failed: 0,
      skipped: 0,
      durationMs: 0,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "Passed! - Failed: 0, Passed: 1, Skipped: 0, Total: 1",
        "Failed! - Failed: 1, Passed: 1, Skipped: 0, Total: 2",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "dotnet",
      total: 2,
      passed: 1,
      failed: 1,
      skipped: 0,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      "Test summary: total: 4, failed: 1, succeeded: 2, skipped: 1, duration: 0.4s",
    ),
    {
      framework: "unknown",
      source: "dotnet",
      total: 4,
      passed: 2,
      failed: 1,
      skipped: 1,
      durationMs: 400,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(createTarget("node"), "Test summary: total: 2, failed: 0, succeeded: 2, skipped: 0, duration: 12 ms"),
    {
      framework: "node",
      source: "dotnet",
      total: 2,
      passed: 2,
      failed: 0,
      skipped: 0,
      durationMs: 12,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "Test summary: total: 1, failed: 0, succeeded: 1, skipped: 0, duration: 1 ms",
        "Test summary: total: 3, failed: 1, succeeded: 1, skipped: 1, duration: 2 ms",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "dotnet",
      total: 3,
      passed: 1,
      failed: 1,
      skipped: 1,
      durationMs: 2,
    },
  );

  assert.equal(
    parseTestReportSummary(createTarget("unknown"), "Passed! - Failed: 1, Passed: 1, Skipped: 0, Total: 2"),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(createTarget("unknown"), "Failed! - Failed: 0, Passed: 2, Skipped: 0, Total: 2"),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(createTarget("unknown"), "Passed! - Failed: 0, Passed: 1, Skipped: 0, Total: 2"),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(createTarget("unknown"), "Passed! - Failed: 0, Passed: 1, Skipped: 0, Total: 1, Duration: 1 s after cleanup"),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(createTarget("unknown"), "Passed! - Failed: 0, Passed: 1, Skipped: 0, Total: 1, Duration: 1 s - after cleanup"),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      "Test summary: total: 2, failed: 0, succeeded: 1, skipped: 0, duration: 0.4s",
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      "Test summary: total: 2, failed: 0, passed: 2, skipped: 0, duration: 0.4s",
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      "Test summary: total: 1, failed: 0, succeeded: 1, skipped: 0, duration: 0.4s after cleanup",
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "Test summary: total: two, failed: 0, succeeded: 2, skipped: 0, duration: 0.4s",
        "Test Summary: 2 passed, 2 total",
      ].join("\n"),
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("node"),
      [
        "Passed! - Failed: 0, Passed: 1, Skipped: 0, Total: 1, Duration: 1 s after cleanup",
        "ℹ tests 1",
        "ℹ pass 1",
      ].join("\n"),
    ),
    undefined,
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "100% tests passed, 0 tests failed out of 5",
        "Total Test time (real) =   0.12 sec",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "ctest",
      total: 5,
      passed: 5,
      failed: 0,
      durationMs: 120,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(createTarget("unknown"), "67% tests passed, 1 tests failed out of 3"),
    {
      framework: "unknown",
      source: "ctest",
      total: 3,
      passed: 2,
      failed: 1,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(createTarget("node"), "0% tests passed, 1 test failed out of 1"),
    {
      framework: "node",
      source: "ctest",
      total: 1,
      passed: 0,
      failed: 1,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "100% tests passed, 0 tests failed out of 1",
        "0% tests passed, 1 test failed out of 1",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "ctest",
      total: 1,
      passed: 0,
      failed: 1,
    },
  );

  assert.equal(parseTestReportSummary(createTarget("unknown"), "66% tests passed, 1 tests failed out of 3"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "100% tests passed, 1 tests failed out of 1"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "100% tests passed, 0 tests failed out of 0"), undefined);
  assert.equal(
    parseTestReportSummary(createTarget("unknown"), "100% tests passed, 0 tests failed out of 5 after cleanup"),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      "100% tests passed, 0 tests failed out of 5\nTotal Test time (real) = 0.12 sec after cleanup",
    ),
    undefined,
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "Ok:                2",
        "Expected Fail:     1",
        "Fail:              1",
        "Unexpected Pass:   1",
        "Skipped:           1",
        "Ignored:           1",
        "Timeout:           1",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "meson",
      total: 8,
      passed: 3,
      failed: 3,
      skipped: 2,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("node"),
      [
        "Summary of Failures:",
        "",
        "Ok:                1",
        "Fail:              0",
      ].join("\n"),
    ),
    {
      framework: "node",
      source: "meson",
      total: 1,
      passed: 1,
      failed: 0,
      skipped: 0,
    },
  );

  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "Ok:                one",
        "Fail:              0",
        "Tests: 1 passed, 1 total",
      ].join("\n"),
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "Ok:                1",
        "Tests: 1 passed, 1 total",
      ].join("\n"),
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("node"),
      [
        "Ok:                1",
        "Ok:                2",
        "Fail:              0",
        "ℹ tests 3",
        "ℹ pass 3",
      ].join("\n"),
    ),
    undefined,
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "-----------------------",
        "3 Tests 1 Failures 1 Ignored",
        "FAIL",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "unity",
      total: 3,
      passed: 1,
      failed: 1,
      skipped: 1,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("node"),
      [
        "-----------------------",
        "2 Tests 0 Failures 1 Ignored",
        "OK",
      ].join("\n"),
    ),
    {
      framework: "node",
      source: "unity",
      total: 2,
      passed: 1,
      failed: 0,
      skipped: 1,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "1 Tests 1 Failures 0 Ignored",
        "FAILED",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "unity",
      total: 1,
      passed: 0,
      failed: 1,
      skipped: 0,
    },
  );

  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "1 Tests 0 Failures 0 Ignored",
        "Tests: 1 passed, 1 total",
      ].join("\n"),
    ),
    undefined,
  );
  assert.equal(parseTestReportSummary(createTarget("unknown"), "0 Tests 0 Failures 0 Ignored\nOK"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "1 Tests 2 Failures 0 Ignored\nFAIL"), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "1 Tests 1 Failures 0 Ignored\nOK"), undefined);
  assert.equal(
    parseTestReportSummary(
      createTarget("node"),
      [
        "1 Tests 0 Failures 0 Ignored",
        "1 Tests 0 Failures 0 Ignored",
        "OK",
        "ℹ tests 1",
        "ℹ pass 1",
      ].join("\n"),
    ),
    undefined,
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "Testing Time: 1.23s",
        "",
        "Total Discovered Tests: 9",
        "  Unsupported        : 1 (11.11%)",
        "  Passed             : 2 (22.22%)",
        "  Passed With Retry  : 1 (11.11%)",
        "  Expectedly Failed  : 1 (11.11%)",
        "  Unresolved         : 1 (11.11%)",
        "  Timed Out          : 1 (11.11%)",
        "  Failed             : 1 (11.11%)",
        "  Unexpectedly Passed: 1 (11.11%)",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "lit",
      total: 9,
      passed: 2,
      failed: 4,
      skipped: 1,
      todo: 1,
      flaky: 1,
      durationMs: 1230,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "Total Discovered Tests: 1",
        "  Passed: 1 (100.00%)",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "lit",
      total: 1,
      passed: 1,
      failed: 0,
      skipped: 0,
      todo: 0,
      flaky: 0,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("node"),
      [
        "Total Discovered Tests: 2",
        "  Unsupported: 1 (50.00%)",
        "  Failed     : 1 (50.00%)",
      ].join("\n"),
    ),
    {
      framework: "node",
      source: "lit",
      total: 2,
      passed: 0,
      failed: 1,
      skipped: 1,
      todo: 0,
      flaky: 0,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("node"),
      [
        "Testing Time: 1.23s",
        "ℹ tests 1",
        "ℹ pass 1",
      ].join("\n"),
    ),
    {
      framework: "node",
      source: "node",
      total: 1,
      passed: 1,
    },
  );

  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "Total Discovered Tests: two",
        "Test Summary: 1 passed, 1 total",
      ].join("\n"),
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "Total Discovered Tests: 2",
        "  Passed: 1 (50.00%)",
        "Test Summary: 1 passed, 1 total",
      ].join("\n"),
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "Total Discovered Tests: 4",
        "  Passed: 1 (20.00%)",
        "  Failed: 3 (75.00%)",
        "Test Summary: 4 total, 1 passed, 3 failed",
      ].join("\n"),
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("node"),
      [
        "Total Discovered Tests: 2",
        "  Passed: 1 (50.00%)",
        "  Passed: 1 (50.00%)",
        "ℹ tests 2",
        "ℹ pass 2",
      ].join("\n"),
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "Testing Time: nope",
        "Test Summary: 1 passed, 1 total",
      ].join("\n"),
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "Total Discovered Tests: 1",
        "  Expected Passes: 1 (100.00%)",
        "Test Summary: 1 passed, 1 total",
      ].join("\n"),
    ),
    undefined,
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      "Executed 2 out of 3 tests: 1 test passes, 1 fails locally, and 1 was skipped.",
    ),
    {
      framework: "unknown",
      source: "bazel",
      total: 3,
      passed: 1,
      failed: 1,
      skipped: 1,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(createTarget("unknown"), "Executed 0 out of 5 tests: 3 tests pass and 2 were skipped."),
    {
      framework: "unknown",
      source: "bazel",
      total: 5,
      passed: 3,
      failed: 0,
      skipped: 2,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("node"),
      "Executed 4 out of 4 tests: 1 test passes, 1 fails to build, 1 fails remotely, and 1 fails locally.",
    ),
    {
      framework: "node",
      source: "bazel",
      total: 4,
      passed: 1,
      failed: 3,
      skipped: 0,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "Executed 1 out of 1 test: 1 test passes.",
        "Executed 2 out of 2 tests: 2 tests pass.",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "bazel",
      total: 2,
      passed: 2,
      failed: 0,
      skipped: 0,
    },
  );

  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "Executed 2 out of 3 tests: 2 tests pass.",
        "Test Summary: 2 passed, 2 total",
      ].join("\n"),
    ),
    undefined,
  );
  assert.equal(parseTestReportSummary(createTarget("unknown"), "Executed 3 out of 2 tests: 2 tests pass."), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "Executed 1 out of 1 tests: 1 test passes."), undefined);
  assert.equal(parseTestReportSummary(createTarget("unknown"), "Executed 1 out of 1 test: 1 tests pass."), undefined);
  assert.equal(
    parseTestReportSummary(
      createTarget("node"),
      [
        "Executed 2 out of 2 tests: 1 test passes and 1 test passes.",
        "ℹ tests 2",
        "ℹ pass 2",
      ].join("\n"),
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      "Executed 1 out of 1 test: 1 test failed.\nTest Summary: 1 failed, 1 total",
    ),
    undefined,
  );

  assert.deepEqual(
    parseTestReportSummary(createTarget("unknown"), "Executed 3 tests, with 1 failure (1 unexpected) in 0.123 (0.124) seconds"),
    {
      framework: "unknown",
      source: "xctest",
      total: 3,
      passed: 2,
      failed: 1,
      durationMs: 123,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(createTarget("unknown"), "Executed 1 test, with 0 failures (0 unexpected) in 0.000 (0.001) seconds"),
    {
      framework: "unknown",
      source: "xctest",
      total: 1,
      passed: 1,
      failed: 0,
      durationMs: 0,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(createTarget("node"), "Executed 2 tests, with 0 failures (0 unexpected) in 0.010 (0.011) seconds"),
    {
      framework: "node",
      source: "xctest",
      total: 2,
      passed: 2,
      failed: 0,
      durationMs: 10,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(createTarget("vitest"), "Executed 2 tests, with 0 failures (0 unexpected) in 0.010 (0.011) seconds"),
    {
      framework: "vitest",
      source: "xctest",
      total: 2,
      passed: 2,
      failed: 0,
      durationMs: 10,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "Executed 1 test, with 0 failures (0 unexpected) in 0.001 (0.001) seconds",
        "Executed 2 tests, with 1 failure (1 unexpected) in 0.002 (0.003) seconds",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "xctest",
      total: 2,
      passed: 1,
      failed: 1,
      durationMs: 2,
    },
  );

  assert.equal(
    parseTestReportSummary(createTarget("unknown"), "Executed 1 test, with 2 failures (1 unexpected) in 0.001 (0.001) seconds"),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(createTarget("unknown"), "Executed 2 tests, with 1 failure (2 unexpected) in 0.001 (0.001) seconds"),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(createTarget("unknown"), "Executed 0 tests, with 0 failures (0 unexpected) in 0.000 (0.000) seconds"),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(createTarget("unknown"), "Executed 1 test, with 0 failures (0 unexpected) in 0.001 (0.001) seconds after cleanup"),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      "Executed 1 test, with 0 failures (0 unexpected) in 0.001 (0.001) seconds\ncleanup done",
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      "Executed 1 test, with 0 failures (0 unexpected) in 0.001 (0.001) seconds\nSummary: 1 passed",
    ),
    undefined,
  );
});

test("parses structured framework JSON reports before stdout fallback", () => {
  const jestJson = JSON.stringify({
    numTotalTests: 6,
    numPassedTests: 4,
    numFailedTests: 1,
    numPendingTests: 1,
    numTodoTests: 0,
    numTotalTestSuites: 3,
    perfStats: { runtime: 1234 },
  });
  const vitestJson = JSON.stringify({
    numTotalTests: 7,
    numPassedTests: 5,
    numFailedTests: 1,
    numPendingTests: 1,
    numTodoTests: 0,
    numTotalTestSuites: 4,
    duration: 2500,
  });
  const playwrightJson = JSON.stringify({
    stats: {
      expected: 3,
      unexpected: 1,
      skipped: 2,
      flaky: 1,
      duration: 4500,
    },
  });
  const mochaJson = JSON.stringify({
    stats: {
      suites: 2,
      tests: 4,
      passes: 2,
      failures: 1,
      pending: 1,
      duration: 37,
    },
    suites: [{ title: "root" }, { title: "nested" }],
    tests: [{ title: "passes" }, { title: "also passes" }, { title: "fails" }, { title: "pending" }],
    passes: [{ title: "passes" }, { title: "also passes" }],
    failures: [{ title: "fails" }],
    pending: [{ title: "pending" }],
  });
  const rspecJson = JSON.stringify({
    summary: {
      duration: 0.123,
      example_count: 4,
      failure_count: 1,
      pending_count: 1,
      errors_outside_of_examples_count: 0,
    },
    examples: [
      { description: "passes", status: "passed" },
      { description: "also passes", status: "passed" },
      { description: "fails", status: "failed" },
      { description: "is pending", status: "pending" },
    ],
  });

  assert.deepEqual(
    parseTestReportSummary(createTarget("jest"), jestJson, "Tests: 99 passed, 99 total"),
    {
      framework: "jest",
      source: "jest-json",
      total: 6,
      passed: 4,
      failed: 1,
      skipped: 1,
      todo: 0,
      suites: 3,
      durationMs: 1234,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(createTarget("vitest"), "Tests 99 passed (99)", vitestJson),
    {
      framework: "vitest",
      source: "vitest-json",
      total: 7,
      passed: 5,
      failed: 1,
      skipped: 1,
      todo: 0,
      suites: 4,
      durationMs: 2500,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(createTarget("playwright"), playwrightJson),
    {
      framework: "playwright",
      source: "playwright-json",
      total: 7,
      passed: 3,
      failed: 1,
      skipped: 2,
      flaky: 1,
      durationMs: 4500,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(createTarget("unknown"), mochaJson, "Test Summary: 99 passed, 99 total"),
    {
      framework: "unknown",
      source: "mocha-json",
      total: 4,
      passed: 2,
      failed: 1,
      skipped: 1,
      suites: 2,
      durationMs: 37,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(createTarget("jest"), mochaJson),
    {
      framework: "jest",
      source: "mocha-json",
      total: 4,
      passed: 2,
      failed: 1,
      skipped: 1,
      suites: 2,
      durationMs: 37,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      JSON.stringify({
        stats: {
          tests: 4,
          passes: 4,
          failures: 0,
          pending: 1,
        },
        tests: [{}, {}, {}, {}],
        passes: [{}, {}, {}, {}],
        failures: [],
        pending: [{}],
      }),
      "Test Summary: 2 passed, 2 total",
    ),
    {
      framework: "unknown",
      source: "generic",
      total: 2,
      passed: 2,
    },
  );

  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      JSON.stringify({
        stats: {
          tests: 1,
          passes: 1,
          failures: 0,
          pending: 0,
        },
      }),
    ),
    undefined,
  );

  assert.deepEqual(
    parseTestReportSummary(createTarget("unknown"), rspecJson, "Test Summary: 99 passed, 99 total"),
    {
      framework: "unknown",
      source: "rspec-json",
      total: 4,
      passed: 2,
      failed: 1,
      skipped: 1,
      durationMs: 123,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(createTarget("node"), rspecJson),
    {
      framework: "node",
      source: "rspec-json",
      total: 4,
      passed: 2,
      failed: 1,
      skipped: 1,
      durationMs: 123,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      JSON.stringify({
        summary: {
          duration: 0.123,
          example_count: 1,
          failure_count: 0,
          pending_count: 0,
          errors_outside_of_examples_count: 1,
        },
        examples: [{ status: "passed" }],
      }),
      "Test Summary: 2 passed, 2 total",
    ),
    {
      framework: "unknown",
      source: "rspec-json",
      total: 2,
      passed: 1,
      failed: 1,
      skipped: 0,
      durationMs: 123,
    },
  );

  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      JSON.stringify({
        summary: {
          duration: 0.123,
          example_count: 1,
          failure_count: 0,
          pending_count: 0,
          errors_outside_of_examples_count: 0,
        },
        examples: [{ description: "no status" }],
      }),
    ),
    undefined,
  );

  for (const errorsOutsideOfExamplesCount of ["1", -1, 1.5]) {
    assert.equal(
      parseTestReportSummary(
        createTarget("unknown"),
        JSON.stringify({
          summary: {
            duration: 0.123,
            example_count: 1,
            failure_count: 0,
            pending_count: 0,
            errors_outside_of_examples_count: errorsOutsideOfExamplesCount,
          },
          examples: [{ status: "passed" }],
        }),
        "Test Summary: 2 passed, 2 total",
      ),
      undefined,
    );
  }

  assert.deepEqual(
    parseTestReportSummary(createTarget("unknown"), jestJson),
    {
      framework: "unknown",
      source: "jest-json",
      total: 6,
      passed: 4,
      failed: 1,
      skipped: 1,
      todo: 0,
      suites: 3,
      durationMs: 1234,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(createTarget("jest"), "{not json", "Tests: 1 passed, 1 total"),
    {
      framework: "jest",
      source: "jest",
      total: 1,
      passed: 1,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(createTarget("jest"), `report follows\n${jestJson}`, "Tests: 2 passed, 2 total"),
    {
      framework: "jest",
      source: "jest",
      total: 2,
      passed: 2,
    },
  );
});

test("parses captured JUnit XML reports before text fallback", () => {
  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<testsuite name="unit" tests="4" failures="1" errors="1" skipped="1" time="0.250">',
        '  <testcase name="passes"/>',
        '  <testcase name="fails"><failure message="bad"/></testcase>',
        '  <testcase name="errors"><error message="boom"/></testcase>',
        '  <testcase name="skips"><skipped/></testcase>',
        "</testsuite>",
      ].join("\n"),
      "Tests: 99 passed, 99 total",
    ),
    {
      framework: "unknown",
      source: "junit-xml",
      total: 4,
      passed: 1,
      failed: 2,
      skipped: 1,
      suites: 1,
      durationMs: 250,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("node"),
      [
        '<testsuites name="all" tests="5" failures="1" errors="0" skipped="1" suites="2" time="0.500">',
        '  <testsuite name="a" tests="2" failures="1" errors="0" skipped="0" time="0.200"/>',
        '  <testsuite name="b" tests="3" failures="0" errors="0" skipped="1" time="0.300"/>',
        "</testsuites>",
      ].join("\n"),
    ),
    {
      framework: "node",
      source: "junit-xml",
      total: 5,
      passed: 3,
      failed: 1,
      skipped: 1,
      suites: 2,
      durationMs: 500,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        '<testsuite time="0.250">',
        '  <testcase name="passes"/>',
        '  <testcase name="fails"><failure/></testcase>',
        '  <testcase name="errors"><error/></testcase>',
        '  <testcase name="skips"><skipped/></testcase>',
        "</testsuite>",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "junit-xml",
      total: 4,
      passed: 1,
      failed: 2,
      skipped: 1,
      suites: 1,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "<!-- generated report -->",
        "<testsuite>",
        '  <testcase name="fails"><failure message="expected > actual"/></testcase>',
        "</testsuite>",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "junit-xml",
      total: 1,
      passed: 0,
      failed: 1,
      skipped: 0,
      suites: 1,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      '<testsuite name=\'failures="1" > suite\' tests="1" failures="0" errors="0" skipped="0"></testsuite>',
    ),
    {
      framework: "unknown",
      source: "junit-xml",
      total: 1,
      passed: 1,
      failed: 0,
      skipped: 0,
      suites: 1,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      '<testsuite name=\'tests="01" > suite\' tests="1" failures="0" errors="0" skipped="0"></testsuite>',
    ),
    {
      framework: "unknown",
      source: "junit-xml",
      total: 1,
      passed: 1,
      failed: 0,
      skipped: 0,
      suites: 1,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        '<testsuite tests="1" failures="1" errors="0" skipped="0">',
        '  <testcase name="fails"><failure><![CDATA[expected > actual]]></failure></testcase>',
        "</testsuite>",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "junit-xml",
      total: 1,
      passed: 0,
      failed: 1,
      skipped: 0,
      suites: 1,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "debug before xml",
        '<testsuite tests="1" failures="0" errors="0" skipped="0"></testsuite>',
        "Test Summary: 1 passed, 1 total",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "generic",
      total: 1,
      passed: 1,
    },
  );

  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      '<testsuite tests="1" failures="2" errors="0" skipped="0"></testsuite>',
      "Test Summary: 1 passed, 1 total",
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      '<testsuite tests="9007199254740993" failures="0" errors="0" skipped="0"></testsuite>',
      "Test Summary: 1 passed, 1 total",
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      '<testsuite tests="01" failures="0" errors="0" skipped="0"></testsuite>',
      "Test Summary: 1 passed, 1 total",
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      '<testsuite tests="1" failures="oops" errors="0" skipped="0"></testsuite>',
      "Test Summary: 1 passed, 1 total",
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        '<testsuite tests="2" failures="oops" errors="0" skipped="0">',
        '  <testcase name="a"/>',
        '  <testcase name="b"/>',
        "</testsuite>",
      ].join("\n"),
      "Test Summary: 2 passed, 2 total",
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        '<testsuites tests="2" failures="0" errors="0" skipped="0">',
        '  <testsuite name="a" tests="1" failures="0" errors="0" skipped="0"/>',
        "</testsuites>",
      ].join("\n"),
      "Test Summary: 1 passed, 1 total",
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      '<testsuite tests="1" failures="0" errors="0" skipped="0"></testsuites>',
      "Test Summary: 1 passed, 1 total",
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        '<testsuite tests="1" failures="0" errors="0" skipped="0"></testsuite>',
        '<testsuite tests="1" failures="0" errors="0" skipped="0"></testsuite>',
      ].join("\n"),
      "Test Summary: 2 passed, 2 total",
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "<!-- generated report -->",
        '<testsuite tests="1" failures="0" errors="0" skipped="0"></testsuite>',
        '<testsuite tests="1" failures="0" errors="0" skipped="0"></testsuite>',
      ].join("\n"),
      "Test Summary: 2 passed, 2 total",
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "<!DOCTYPE testsuite>",
        '<testsuite tests="1" failures="0" errors="0" skipped="0"></testsuite>',
        '<testsuite tests="1" failures="0" errors="0" skipped="0"></testsuite>',
      ].join("\n"),
      "Test Summary: 2 passed, 2 total",
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        '<testsuites tests="1" failures="0" errors="0" skipped="0">',
        '  <testsuite name="a" tests="01" failures="0" errors="0" skipped="0"/>',
        "</testsuites>",
      ].join("\n"),
      "Test Summary: 1 passed, 1 total",
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        '<testsuites tests="1" failures="0" errors="0" skipped="0">',
        '  <testsuite name="a" tests="9007199254740993" failures="0" errors="0" skipped="0"/>',
        "</testsuites>",
      ].join("\n"),
      "Test Summary: 1 passed, 1 total",
    ),
    undefined,
  );
});

test("parses captured TestNG XML reports before text fallback", () => {
  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<testng-results skipped="1" failed="1" ignored="1" total="5" passed="2">',
        '  <suite name="unit" duration-ms="123.5">',
        '    <test name="cases">',
        '      <class name="ExampleTest"/>',
        "    </test>",
        "  </suite>",
        "</testng-results>",
      ].join("\n"),
      "Test Summary: 99 passed, 99 total",
    ),
    {
      framework: "unknown",
      source: "testng-xml",
      total: 5,
      passed: 2,
      failed: 1,
      skipped: 2,
      suites: 1,
      durationMs: 123.5,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("node"),
      [
        '<testng-results skipped="0" failed="1" total="3" passed="2">',
        '  <suite name="unit-a" duration-ms="10"/>',
        '  <suite name="unit-b" duration-ms="15"/>',
        "</testng-results>",
      ].join("\n"),
    ),
    {
      framework: "node",
      source: "testng-xml",
      total: 3,
      passed: 2,
      failed: 1,
      skipped: 0,
      suites: 2,
      durationMs: 25,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "debug before xml",
        '<testng-results skipped="0" failed="0" total="1" passed="1"></testng-results>',
        "Test Summary: 1 passed, 1 total",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "generic",
      total: 1,
      passed: 1,
    },
  );

  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      '<testng-results skipped="0" failed="2" total="1" passed="0"></testng-results>',
      "Test Summary: 1 passed, 1 total",
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      '<testng-results skipped="0" failed="oops" total="1" passed="1"></testng-results>',
      "Test Summary: 1 passed, 1 total",
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      '<testng-results skipped="0" failed="0" total="1" passed="1"><suite duration-ms="oops"/></testng-results>',
      "Test Summary: 1 passed, 1 total",
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      '<testng-results skipped="0" failed="0" total="1" passed="1"></testng-result>',
      "Test Summary: 1 passed, 1 total",
    ),
    undefined,
  );
});

test("parses captured NUnit XML reports before text fallback", () => {
  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<test-run testcasecount="5" total="5" passed="2" failed="1" warnings="1" inconclusive="1" skipped="0" duration="0.123">',
        '  <test-suite type="Assembly" name="Example.Tests"/>',
        "</test-run>",
      ].join("\n"),
      "Test Summary: 99 passed, 99 total",
    ),
    {
      framework: "unknown",
      source: "nunit-xml",
      total: 5,
      passed: 3,
      failed: 1,
      skipped: 1,
      durationMs: 123,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("node"),
      [
        '<test-run testcasecount="4" total="4" passed="2" failed="1" skipped="1" duration="1.5">',
        '  <test-suite type="Assembly" name="Example.Tests"/>',
        "</test-run>",
      ].join("\n"),
    ),
    {
      framework: "node",
      source: "nunit-xml",
      total: 4,
      passed: 2,
      failed: 1,
      skipped: 1,
      durationMs: 1500,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        '<test-results total="5" errors="1" failures="1" not-run="2" inconclusive="1" ignored="1" skipped="0" invalid="0">',
        '  <test-suite type="Assembly" name="Example.Tests"/>',
        "</test-results>",
      ].join("\n"),
      "Test Summary: 99 passed, 99 total",
    ),
    {
      framework: "unknown",
      source: "nunit-xml",
      total: 5,
      passed: 1,
      failed: 2,
      skipped: 2,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "debug before xml",
        '<test-run testcasecount="1" total="1" passed="1" failed="0"></test-run>',
        "Test Summary: 1 passed, 1 total",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "generic",
      total: 1,
      passed: 1,
    },
  );

  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      '<test-run testcasecount="1" total="1" passed="0" failed="2"></test-run>',
      "Test Summary: 1 passed, 1 total",
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      '<test-run testcasecount="1" total="1" passed="1" failed="oops"></test-run>',
      "Test Summary: 1 passed, 1 total",
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      '<test-run testcasecount="2" total="1" passed="1" failed="0"></test-run>',
      "Test Summary: 1 passed, 1 total",
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      '<test-run testcasecount="1" total="1" passed="1" failed="0" duration="oops"></test-run>',
      "Test Summary: 1 passed, 1 total",
    ),
    undefined,
  );
  for (const attribute of ["warnings", "inconclusive", "skipped"]) {
    assert.equal(
      parseTestReportSummary(
        createTarget("unknown"),
        `<test-run testcasecount="1" total="1" passed="1" failed="0" ${attribute}="oops"></test-run>`,
        "Test Summary: 1 passed, 1 total",
      ),
      undefined,
    );
  }
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      '<test-results total="5" errors="1" failures="1" not-run="1" inconclusive="1" ignored="1" skipped="0" invalid="0"></test-results>',
      "Test Summary: 5 passed, 5 total",
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      '<test-results total="5" errors="1" failures="oops" not-run="2" inconclusive="1" ignored="1" skipped="0" invalid="0"></test-results>',
      "Test Summary: 5 passed, 5 total",
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      '<test-results total="1" errors="1" failures="1" not-run="0" inconclusive="0" ignored="0" skipped="0" invalid="0"></test-results>',
      "Test Summary: 1 passed, 1 total",
    ),
    undefined,
  );
  for (const attribute of ["total", "errors", "failures", "not-run", "inconclusive", "ignored", "skipped", "invalid"]) {
    const attributes = new Map([
      ["total", "5"],
      ["errors", "1"],
      ["failures", "1"],
      ["not-run", "2"],
      ["inconclusive", "1"],
      ["ignored", "1"],
      ["skipped", "0"],
      ["invalid", "0"],
    ]);
    attributes.delete(attribute);
    const renderedAttributes = Array.from(attributes, ([key, value]) => `${key}="${value}"`).join(" ");
    assert.equal(
      parseTestReportSummary(
        createTarget("unknown"),
        `<test-results ${renderedAttributes}></test-results>`,
        "Test Summary: 5 passed, 5 total",
      ),
      undefined,
    );
  }
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      '<test-run testcasecount="1" total="1" passed="1" failed="0"></test-runs>',
      "Test Summary: 1 passed, 1 total",
    ),
    undefined,
  );
});

test("parses captured xUnit XML reports before text fallback", () => {
  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        "<assemblies>",
        '  <assembly name="Example.Tests" total="4" passed="2" failed="1" skipped="1" time="0.125" errors="0"/>',
        '  <assembly name="Other.Tests" total="1" passed="1" failed="0" skipped="0" time="0.250" errors="1"/>',
        "</assemblies>",
      ].join("\n"),
      "Test Summary: 99 passed, 99 total",
    ),
    {
      framework: "unknown",
      source: "xunit-xml",
      total: 6,
      passed: 3,
      failed: 2,
      skipped: 1,
      durationMs: 375,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("node"),
      [
        "<assemblies>",
        '  <assembly name="Example.Tests" total="3" passed="2" failed="1" skipped="0"/>',
        "</assemblies>",
      ].join("\n"),
    ),
    {
      framework: "node",
      source: "xunit-xml",
      total: 3,
      passed: 2,
      failed: 1,
      skipped: 0,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "debug before xml",
        '<assemblies><assembly total="1" passed="1" failed="0" skipped="0"/></assemblies>',
        "Test Summary: 1 passed, 1 total",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "generic",
      total: 1,
      passed: 1,
    },
  );

  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      '<assemblies><assembly total="1" passed="2" failed="0" skipped="0"/></assemblies>',
      "Test Summary: 1 passed, 1 total",
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      '<assemblies><assembly total="1" passed="1" failed="oops" skipped="0"/></assemblies>',
      "Test Summary: 1 passed, 1 total",
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      '<assemblies><assembly total="1" passed="1" failed="0" skipped="0" errors="oops"/></assemblies>',
      "Test Summary: 1 passed, 1 total",
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      '<assemblies><assembly total="1" passed="1" failed="0" skipped="0" time="oops"/></assemblies>',
      "Test Summary: 1 passed, 1 total",
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      "<assemblies></assemblies>",
      "Test Summary: 1 passed, 1 total",
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      '<assemblies><assembly total="1" passed="1" failed="0" skipped="0"/></assembly>',
      "Test Summary: 1 passed, 1 total",
    ),
    undefined,
  );
});

test("parses captured TeamCity service messages before text fallback", () => {
  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "build log before tests",
        "##teamcity[testSuiteStarted name='unit']",
        "##teamcity[testStarted name='pass |'quoted|' |[x|]']",
        "##teamcity[testFinished name='pass |'quoted|' |[x|]' duration='10']",
        "##teamcity[testStarted name='fails']",
        "##teamcity[testFailed name='fails' message='boom |n detail']",
        "##teamcity[testFinished name='fails' duration='5']",
        "##teamcity[testIgnored name='skips' message='pending']",
        "##teamcity[testSuiteFinished name='unit']",
        "Test Summary: 99 passed, 99 total",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "teamcity",
      total: 3,
      passed: 1,
      failed: 1,
      skipped: 1,
      suites: 1,
      durationMs: 15,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("node"),
      [
        "##teamcity[testSuiteStarted name='suite-a']",
        "##teamcity[testStarted name='same']",
        "##teamcity[testFinished name='same' duration='1']",
        "##teamcity[testSuiteFinished name='suite-a']",
        "##teamcity[testSuiteStarted name='suite-b']",
        "##teamcity[testStarted name='same']",
        "##teamcity[testFinished name='same' duration='2']",
        "##teamcity[testSuiteFinished name='suite-b']",
      ].join("\n"),
    ),
    {
      framework: "node",
      source: "teamcity",
      total: 2,
      passed: 2,
      failed: 0,
      skipped: 0,
      suites: 2,
      durationMs: 3,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "##teamcity[testSuiteStarted name='suite-a' flowId='a']",
        "##teamcity[testStarted name='same' flowId='a']",
        "##teamcity[testSuiteStarted name='suite-b' flowId='b']",
        "##teamcity[testStarted name='same' flowId='b']",
        "##teamcity[testFinished name='same' duration='1' flowId='a']",
        "##teamcity[testSuiteFinished name='suite-a' flowId='a']",
        "##teamcity[testFinished name='same' duration='2' flowId='b']",
        "##teamcity[testSuiteFinished name='suite-b' flowId='b']",
        "Test Summary: 99 passed, 99 total",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "teamcity",
      total: 2,
      passed: 2,
      failed: 0,
      skipped: 0,
      suites: 2,
      durationMs: 3,
    },
  );

  assert.deepEqual(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "##teamcity[testSuiteStarted name='unit']",
        "##teamcity[testSuiteFinished name='unit']",
        "##teamcity[message text='hello']",
        "Test Summary: 1 passed, 1 total",
      ].join("\n"),
    ),
    {
      framework: "unknown",
      source: "generic",
      total: 1,
      passed: 1,
    },
  );

  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "##teamcity[testStarted name='open",
        "Test Summary: 1 passed, 1 total",
      ].join("\n"),
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "##teamcity[testFinished duration='1']",
        "Test Summary: 1 passed, 1 total",
      ].join("\n"),
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "##teamcity[testFinished name='one' duration='01']",
        "Test Summary: 1 passed, 1 total",
      ].join("\n"),
    ),
    undefined,
  );
  assert.equal(
    parseTestReportSummary(
      createTarget("unknown"),
      [
        "##teamcity[testStarted name='one']",
        "Test Summary: 1 passed, 1 total",
      ].join("\n"),
    ),
    undefined,
  );
});

test("parses node structured JUnit reports before stdout fallback", () => {
  const target = createTarget("node");
  const report = [
    '<?xml version="1.0" encoding="utf-8"?>',
    "<testsuites>",
    '  <testcase name="a" time="0.001" classname="test"/>',
    '  <testcase name="b" time="0.001" classname="test">',
    '    <skipped type="skipped" message="true"/>',
    "  </testcase>",
    "  <!-- tests 2 -->",
    "  <!-- suites 0 -->",
    "  <!-- pass 1 -->",
    "  <!-- fail 0 -->",
    "  <!-- skipped 1 -->",
    "  <!-- todo 0 -->",
    "  <!-- duration_ms 12.5 -->",
    "</testsuites>",
  ].join("\n");

  assert.deepEqual(parseStructuredTestReportSummary(target, report), {
    framework: "node",
    source: "node-junit",
    total: 2,
    passed: 1,
    failed: 0,
    skipped: 1,
    todo: 0,
    suites: 0,
    durationMs: 12.5,
  });

  assert.deepEqual(parseTestReportSummary(target, "ℹ tests 99\nℹ pass 99", "", report), {
    framework: "node",
    source: "node-junit",
    total: 2,
    passed: 1,
    failed: 0,
    skipped: 1,
    todo: 0,
    suites: 0,
    durationMs: 12.5,
  });
});

test("requests private structured JSON report files for safe package script framework reporters", async () => {
  const cwd = createTempDir();
  const outsideReportDir = mkdtempSync(join(tmpdir(), "orx-report-outside-"));
  const previousOutsideReportDir = process.env.ORX_TEST_OUTSIDE_REPORT_DIR;
  process.env.ORX_TEST_OUTSIDE_REPORT_DIR = outsideReportDir;
  try {
    writeFileSync(
      join(cwd, "package.json"),
      JSON.stringify({
        scripts: {
          "test:jest-default": "jest",
          "test:jest-npx-default": "npx --no-install jest",
          "test:path-npx-default": "./scripts/npx --no-install jest",
          "test:npx-path-jest-default": "npx --no-install ./scripts/jest",
          "test:npx-separator-jest-default": "npx --no-install -- jest",
          "test:npx-duplicate-no-install-jest-default": "npx --no-install --no-install jest",
          "test:npx-uppercase-no-install-jest-default": "npx --NO-INSTALL jest",
          "test:env-assignment-npx-default": "CI=1 npx --no-install jest",
          "test:env-command-npx-default": "env npx --no-install jest",
          "test:vitest-default": "vitest run",
          "test:playwright-default": "playwright test",
          "test:react-default": "react-scripts test",
          "test:custom-node-default": "node ./fake-json-reporter.mjs jest",
          "test:jest-unsafe-reporter": "jest --reporter='bad reporter'",
          "test:jest-custom-json-reporter-output": "jest --reporter=json --outputFile=jest-custom-reporter.json",
          "test:jest-json": "jest --json",
          "test:vitest-json": "vitest --reporter=json",
          "test:playwright-json": "playwright test --reporter=json",
          "test:jest-existing-output": "jest --json --outputFile=already.json",
          "test:jest-plain-npx-existing-output": "npx jest --json --outputFile=npx-plain.json",
          "test:custom-jest-existing-output": "node ./fake-json-reporter.mjs jest --json --outputFile=custom-runner.json",
          "test:jest-pre-output": "node ./fake-json-reporter.mjs jest --json --outputFile=prep.json && jest --json",
          "test:vitest-separate-output": "vitest run --reporter=json --outputFile separate.json",
          "test:vitest-npx-existing-output": "npx --no-install vitest run --reporter=json --outputFile=npx-vitest.json",
          "test:vitest-json-after-json-pre-step": "node ./json-pre-step.mjs --json && vitest run --reporter=json --outputFile=pre-json-vitest.json",
          "test:playwright-existing-output": "PLAYWRIGHT_JSON_OUTPUT_FILE=playwright-existing.json playwright test --reporter=json",
          "test:jest-stale-output": "jest --json --outputFile=stale.json",
          "test:jest-symlink-output": "jest --json --outputFile=reports/result.json",
          "test:vitest-post-step": "node ./fake-json-reporter.mjs vitest --reporter=json && node ./post-step.mjs",
          "test:vitest-json-post-step": "node ./fake-json-reporter.mjs vitest --reporter=json && node ./post-step.mjs --json",
        },
      }),
    );
    const binDir = join(cwd, "node_modules", ".bin");
    mkdirSync(binDir, { recursive: true });
    for (const binName of ["jest", "vitest", "playwright", "react-scripts", "npx"]) {
      const binPath = join(binDir, binName);
      writeFileSync(binPath, "#!/usr/bin/env node\nimport '../../fake-json-reporter.mjs';\n");
      chmodSync(binPath, 0o755);
    }
    const scriptDir = join(cwd, "scripts");
    mkdirSync(scriptDir, { recursive: true });
    for (const scriptName of ["npx", "jest"]) {
      const scriptPath = join(scriptDir, scriptName);
      writeFileSync(scriptPath, "#!/usr/bin/env node\nimport '../fake-json-reporter.mjs';\n");
      chmodSync(scriptPath, 0o755);
    }
    writeFileSync(
      join(cwd, "fake-json-reporter.mjs"),
      [
        "import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';",
        "import { basename } from 'node:path';",
        "const binName = basename(process.argv[1] ?? '');",
        "const knownBins = new Set(['jest', 'vitest', 'playwright', 'react-scripts']);",
        "const rawArgs = process.argv.slice(2);",
        "const npxCommandIndex = binName === 'npx' ? rawArgs.findIndex((arg) => arg !== '--no-install' && arg !== '--') : -1;",
        "const framework = knownBins.has(binName)",
        "  ? binName",
        "  : binName === 'npx' && npxCommandIndex >= 0",
        "    ? basename(rawArgs[npxCommandIndex] ?? '')",
        "    : process.argv[2];",
        "const args = binName === 'npx' && npxCommandIndex >= 0 ? rawArgs.slice(npxCommandIndex + 1) : rawArgs;",
        "const reporterValues = [];",
        "for (const [index, arg] of args.entries()) {",
        "  if (arg === '--reporter' || arg === '--reporters') reporterValues.push(args[index + 1] ?? '');",
        "  if (arg.startsWith('--reporter=') || arg.startsWith('--reporters=')) reporterValues.push(arg.slice(arg.indexOf('=') + 1));",
        "}",
        "const hasJsonReporter = reporterValues.some((value) => value.split(/[,:]/).includes('json'));",
        "const outputIndex = args.findIndex((arg) => arg === '--outputFile' || arg === '--output-file');",
        "const outputArg = args.find((arg) => arg.startsWith('--outputFile=') || arg.startsWith('--output-file='));",
        "const outputFile = outputArg?.slice(outputArg.indexOf('=') + 1) ?? (outputIndex >= 0 ? args[outputIndex + 1] : undefined) ?? process.env.PLAYWRIGHT_JSON_OUTPUT_FILE;",
        "const customJsonReporterOutputFiles = new Set(['jest-custom-reporter.json', 'per-run-jest-reporter.json']);",
        "const requestedJson = framework === 'jest'",
        "  ? args.includes('--json')",
        "  : framework === 'vitest'",
        "    ? hasJsonReporter",
        "    : framework === 'playwright'",
        "      ? args.includes('test') && hasJsonReporter",
        "      : false;",
        "const report = framework === 'playwright'",
        "  ? { stats: { expected: 3, unexpected: 1, skipped: 1, flaky: 0, duration: 456 } }",
        "  : { numTotalTests: 5, numPassedTests: 4, numFailedTests: 1, numPendingTests: 0, numTodoTests: 0, numTotalTestSuites: 2, duration: 789 };",
        "if (outputFile === 'reports/result.json' && process.env.ORX_TEST_OUTSIDE_REPORT_DIR) {",
        "  rmSync('reports', { recursive: true, force: true });",
        "  mkdirSync(process.env.ORX_TEST_OUTSIDE_REPORT_DIR, { recursive: true });",
        "  symlinkSync(process.env.ORX_TEST_OUTSIDE_REPORT_DIR, 'reports', 'dir');",
        "}",
        "if (outputFile && outputFile !== 'stale.json' && (requestedJson || customJsonReporterOutputFiles.has(outputFile))) writeFileSync(outputFile, JSON.stringify(report));",
        "console.log('Tests: 99 passed, 99 total');",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(cwd, "stale.json"),
      JSON.stringify({
        numTotalTests: 5,
        numPassedTests: 4,
        numFailedTests: 1,
        numPendingTests: 0,
        numTodoTests: 0,
        numTotalTestSuites: 2,
        duration: 789,
      }),
    );
    writeFileSync(join(cwd, "json-pre-step.mjs"), "console.log('json-pre-step-ok');\n");
    writeFileSync(
      join(cwd, "post-step.mjs"),
      [
        "if (process.argv.some((arg) => arg.startsWith('--outputFile='))) {",
        "  console.error('unexpected report arg');",
        "  process.exit(11);",
        "}",
        "console.log('post-step-ok');",
        "",
      ].join("\n"),
    );

    const defaultJestResult = await runTestTarget({ cwd, targetId: "script:test:jest-default" });
    assert.equal(defaultJestResult.ok, true);
    assert.equal(defaultJestResult.report?.source, "jest-json");
    assert.equal(defaultJestResult.report?.total, 5);
    assert.ok(defaultJestResult.args.includes("--json"));
    const defaultJestOutputFileArg = defaultJestResult.args.find((arg) => arg.startsWith("--outputFile="));
    assert.ok(defaultJestOutputFileArg);
    assert.equal(existsSync(defaultJestOutputFileArg.slice("--outputFile=".length)), false);

    const npxDefaultJestResult = await runTestTarget({ cwd, targetId: "script:test:jest-npx-default" });
    assert.equal(npxDefaultJestResult.ok, true);
    assert.equal(npxDefaultJestResult.report?.source, "jest-json");
    assert.equal(npxDefaultJestResult.report?.total, 5);
    assert.ok(npxDefaultJestResult.args.includes("--json"));
    const npxDefaultJestOutputFileArg = npxDefaultJestResult.args.find((arg) => arg.startsWith("--outputFile="));
    assert.ok(npxDefaultJestOutputFileArg);
    assert.equal(existsSync(npxDefaultJestOutputFileArg.slice("--outputFile=".length)), false);

    const pathNpxDefaultJestResult = await runTestTarget({ cwd, targetId: "script:test:path-npx-default" });
    assert.equal(pathNpxDefaultJestResult.ok, true);
    assert.equal(pathNpxDefaultJestResult.report?.source, "jest");
    assert.equal(pathNpxDefaultJestResult.report?.total, 99);
    assert.equal(pathNpxDefaultJestResult.args.includes("--json"), false);
    assert.equal(pathNpxDefaultJestResult.args.some((arg) => arg.startsWith("--outputFile=")), false);

    const npxPathJestResult = await runTestTarget({ cwd, targetId: "script:test:npx-path-jest-default" });
    assert.equal(npxPathJestResult.ok, true);
    assert.equal(npxPathJestResult.report?.source, "jest");
    assert.equal(npxPathJestResult.report?.total, 99);
    assert.equal(npxPathJestResult.args.includes("--json"), false);
    assert.equal(npxPathJestResult.args.some((arg) => arg.startsWith("--outputFile=")), false);

    const npxSeparatorJestResult = await runTestTarget({ cwd, targetId: "script:test:npx-separator-jest-default" });
    assert.equal(npxSeparatorJestResult.ok, true);
    assert.equal(npxSeparatorJestResult.report?.source, "jest");
    assert.equal(npxSeparatorJestResult.report?.total, 99);
    assert.equal(npxSeparatorJestResult.args.includes("--json"), false);
    assert.equal(npxSeparatorJestResult.args.some((arg) => arg.startsWith("--outputFile=")), false);

    const npxDuplicateNoInstallJestResult = await runTestTarget({
      cwd,
      targetId: "script:test:npx-duplicate-no-install-jest-default",
    });
    assert.equal(npxDuplicateNoInstallJestResult.ok, true);
    assert.equal(npxDuplicateNoInstallJestResult.report?.source, "jest");
    assert.equal(npxDuplicateNoInstallJestResult.report?.total, 99);
    assert.equal(npxDuplicateNoInstallJestResult.args.includes("--json"), false);
    assert.equal(npxDuplicateNoInstallJestResult.args.some((arg) => arg.startsWith("--outputFile=")), false);

    const npxUppercaseNoInstallJestResult = await runTestTarget({
      cwd,
      targetId: "script:test:npx-uppercase-no-install-jest-default",
    });
    assert.equal(npxUppercaseNoInstallJestResult.ok, true);
    assert.equal(npxUppercaseNoInstallJestResult.report?.source, "jest");
    assert.equal(npxUppercaseNoInstallJestResult.report?.total, 99);
    assert.equal(npxUppercaseNoInstallJestResult.args.includes("--json"), false);
    assert.equal(npxUppercaseNoInstallJestResult.args.some((arg) => arg.startsWith("--outputFile=")), false);

    const envAssignmentNpxJestResult = await runTestTarget({
      cwd,
      targetId: "script:test:env-assignment-npx-default",
    });
    assert.equal(envAssignmentNpxJestResult.ok, true);
    assert.equal(envAssignmentNpxJestResult.report?.source, "jest");
    assert.equal(envAssignmentNpxJestResult.report?.total, 99);
    assert.equal(envAssignmentNpxJestResult.args.includes("--json"), false);
    assert.equal(envAssignmentNpxJestResult.args.some((arg) => arg.startsWith("--outputFile=")), false);

    const envCommandNpxJestResult = await runTestTarget({
      cwd,
      targetId: "script:test:env-command-npx-default",
    });
    assert.equal(envCommandNpxJestResult.ok, true);
    assert.equal(envCommandNpxJestResult.report?.source, "jest");
    assert.equal(envCommandNpxJestResult.report?.total, 99);
    assert.equal(envCommandNpxJestResult.args.includes("--json"), false);
    assert.equal(envCommandNpxJestResult.args.some((arg) => arg.startsWith("--outputFile=")), false);

    const defaultVitestResult = await runTestTarget({ cwd, targetId: "script:test:vitest-default" });
    assert.equal(defaultVitestResult.ok, true);
    assert.equal(defaultVitestResult.report?.source, "vitest-json");
    assert.equal(defaultVitestResult.report?.total, 5);
    assert.ok(defaultVitestResult.args.includes("--reporter=json"));
    assert.ok(defaultVitestResult.args.includes("--reporter=default"));
    assert.ok(defaultVitestResult.args.some((arg) => arg.startsWith("--outputFile=")));

    const defaultVitestReporterOverrideResult = await runTestTarget({
      cwd,
      targetId: "script:test:vitest-default",
      extraArgs: ["--reporter=dot"],
    });
    assert.equal(defaultVitestReporterOverrideResult.ok, true);
    assert.equal(defaultVitestReporterOverrideResult.report?.source, "generic");
    assert.equal(defaultVitestReporterOverrideResult.report?.total, 99);
    assert.ok(defaultVitestReporterOverrideResult.args.includes("--reporter=dot"));
    assert.equal(defaultVitestReporterOverrideResult.args.includes("--reporter=json"), false);
    assert.equal(defaultVitestReporterOverrideResult.args.includes("--reporter=default"), false);
    assert.equal(defaultVitestReporterOverrideResult.args.some((arg) => arg.startsWith("--outputFile=")), false);

    const defaultPlaywrightResult = await runTestTarget({ cwd, targetId: "script:test:playwright-default" });
    assert.equal(defaultPlaywrightResult.ok, true);
    assert.equal(defaultPlaywrightResult.report?.source, "playwright-json");
    assert.equal(defaultPlaywrightResult.report?.total, 5);
    assert.equal(defaultPlaywrightResult.report?.durationMs, 456);
    assert.ok(defaultPlaywrightResult.args.includes("--reporter=json"));
    assert.equal(defaultPlaywrightResult.args.some((arg) => arg.startsWith("--outputFile=")), false);

    const defaultJestOutputOverrideResult = await runTestTarget({
      cwd,
      targetId: "script:test:jest-default",
      extraArgs: ["--outputFile=custom.json"],
    });
    assert.equal(defaultJestOutputOverrideResult.ok, true);
    assert.equal(defaultJestOutputOverrideResult.report?.source, "jest");
    assert.equal(defaultJestOutputOverrideResult.report?.total, 99);
    assert.deepEqual(
      defaultJestOutputOverrideResult.args.filter((arg) => arg.startsWith("--outputFile=")),
      ["--outputFile=custom.json"],
    );
    assert.equal(defaultJestOutputOverrideResult.args.includes("--json"), false);

    const defaultJestCustomReporterResult = await runTestTarget({
      cwd,
      targetId: "script:test:jest-default",
      extraArgs: ["--reporter=json", "--outputFile=per-run-jest-reporter.json"],
    });
    assert.equal(defaultJestCustomReporterResult.ok, true);
    assert.equal(defaultJestCustomReporterResult.report?.source, "jest");
    assert.equal(defaultJestCustomReporterResult.report?.total, 99);
    assert.equal(defaultJestCustomReporterResult.args.includes("--json"), false);
    assert.equal(existsSync(join(cwd, "per-run-jest-reporter.json")), true);

    const reactScriptsResult = await runTestTarget({ cwd, targetId: "script:test:react-default" });
    assert.equal(reactScriptsResult.ok, true);
    assert.equal(reactScriptsResult.report?.source, "jest");
    assert.equal(reactScriptsResult.report?.total, 99);
    assert.equal(reactScriptsResult.args.some((arg) => arg.startsWith("--outputFile=")), false);
    assert.equal(reactScriptsResult.args.includes("--json"), false);

    const customNodeResult = await runTestTarget({ cwd, targetId: "script:test:custom-node-default" });
    assert.equal(customNodeResult.ok, true);
    assert.equal(customNodeResult.report?.source, "jest");
    assert.equal(customNodeResult.report?.total, 99);
    assert.equal(customNodeResult.args.some((arg) => arg.startsWith("--outputFile=")), false);
    assert.equal(customNodeResult.args.includes("--json"), false);

    const unsafeReporterResult = await runTestTarget({ cwd, targetId: "script:test:jest-unsafe-reporter" });
    assert.equal(unsafeReporterResult.ok, true);
    assert.equal(unsafeReporterResult.report?.source, "jest");
    assert.equal(unsafeReporterResult.report?.total, 99);
    assert.equal(unsafeReporterResult.args.some((arg) => arg.startsWith("--outputFile=")), false);
    assert.equal(unsafeReporterResult.args.includes("--json"), false);

    const customJsonReporterOutputResult = await runTestTarget({
      cwd,
      targetId: "script:test:jest-custom-json-reporter-output",
    });
    assert.equal(customJsonReporterOutputResult.ok, true);
    assert.equal(customJsonReporterOutputResult.report?.source, "jest");
    assert.equal(customJsonReporterOutputResult.report?.total, 99);
    assert.equal(existsSync(join(cwd, "jest-custom-reporter.json")), true);

    const jestResult = await runTestTarget({
      cwd,
      targetId: "script:test:jest-json",
      extraArgs: ["--watch=false"],
    });
    assert.equal(jestResult.ok, true);
    assert.equal(jestResult.report?.source, "jest-json");
    assert.equal(jestResult.report?.total, 5);
    assert.equal(jestResult.report?.passed, 4);
    const jestOutputFileArg = jestResult.args.find((arg) => arg.startsWith("--outputFile="));
    assert.ok(jestOutputFileArg);
    assert.equal(existsSync(jestOutputFileArg.slice("--outputFile=".length)), false);
    assert.deepEqual(jestResult.args.filter((arg) => arg === "--"), ["--"]);
    assert.ok(jestResult.args.indexOf(jestOutputFileArg) < jestResult.args.indexOf("--watch=false"));

    const jestJsonOutputOverrideResult = await runTestTarget({
      cwd,
      targetId: "script:test:jest-json",
      extraArgs: ["--outputFile=custom.json"],
    });
    assert.equal(jestJsonOutputOverrideResult.ok, true);
    assert.equal(jestJsonOutputOverrideResult.report?.source, "jest-json");
    assert.equal(jestJsonOutputOverrideResult.report?.total, 5);
    assert.deepEqual(
      jestJsonOutputOverrideResult.args.filter((arg) => arg.startsWith("--outputFile=")),
      ["--outputFile=custom.json"],
    );
    assert.equal(existsSync(join(cwd, "custom.json")), true);

    const vitestResult = await runTestTarget({ cwd, targetId: "script:test:vitest-json" });
    assert.equal(vitestResult.ok, true);
    assert.equal(vitestResult.report?.source, "vitest-json");
    assert.equal(vitestResult.report?.total, 5);
    assert.ok(vitestResult.args.some((arg) => arg.startsWith("--outputFile=")));

    const playwrightResult = await runTestTarget({ cwd, targetId: "script:test:playwright-json" });
    assert.equal(playwrightResult.ok, true);
    assert.equal(playwrightResult.report?.source, "playwright-json");
    assert.equal(playwrightResult.report?.total, 5);
    assert.equal(playwrightResult.report?.durationMs, 456);
    assert.equal(playwrightResult.args.some((arg) => arg.startsWith("--outputFile=")), false);

    const existingOutputResult = await runTestTarget({ cwd, targetId: "script:test:jest-existing-output" });
    assert.equal(existingOutputResult.ok, true);
    assert.equal(existingOutputResult.report?.source, "jest-json");
    assert.equal(existingOutputResult.report?.total, 5);
    assert.equal(existingOutputResult.args.some((arg) => arg.startsWith("--outputFile=")), false);
    assert.equal(existsSync(join(cwd, "already.json")), true);

    const plainNpxExistingOutputResult = await runTestTarget({
      cwd,
      targetId: "script:test:jest-plain-npx-existing-output",
    });
    assert.equal(plainNpxExistingOutputResult.ok, true);
    assert.equal(plainNpxExistingOutputResult.report?.source, "jest");
    assert.equal(plainNpxExistingOutputResult.report?.total, 99);
    assert.equal(existsSync(join(cwd, "npx-plain.json")), true);

    const existingOutputReporterOverrideResult = await runTestTarget({
      cwd,
      targetId: "script:test:jest-existing-output",
      extraArgs: ["--reporter=dot"],
    });
    assert.equal(existingOutputReporterOverrideResult.ok, true);
    assert.equal(existingOutputReporterOverrideResult.report?.source, "jest");
    assert.equal(existingOutputReporterOverrideResult.report?.total, 99);

    const customExistingOutputResult = await runTestTarget({
      cwd,
      targetId: "script:test:custom-jest-existing-output",
    });
    assert.equal(customExistingOutputResult.ok, true);
    assert.equal(customExistingOutputResult.report?.source, "jest");
    assert.equal(customExistingOutputResult.report?.total, 99);
    assert.equal(existsSync(join(cwd, "custom-runner.json")), true);

    const preOutputResult = await runTestTarget({ cwd, targetId: "script:test:jest-pre-output" });
    assert.equal(preOutputResult.ok, true);
    assert.equal(preOutputResult.report?.source, "jest");
    assert.equal(preOutputResult.report?.total, 99);
    assert.equal(existsSync(join(cwd, "prep.json")), true);

    const separateOutputResult = await runTestTarget({ cwd, targetId: "script:test:vitest-separate-output" });
    assert.equal(separateOutputResult.ok, true);
    assert.equal(separateOutputResult.report?.source, "vitest-json");
    assert.equal(separateOutputResult.report?.total, 5);
    assert.equal(separateOutputResult.args.some((arg) => arg.startsWith("--outputFile=")), false);
    assert.equal(existsSync(join(cwd, "separate.json")), true);

    const npxExistingOutputResult = await runTestTarget({ cwd, targetId: "script:test:vitest-npx-existing-output" });
    assert.equal(npxExistingOutputResult.ok, true);
    assert.equal(npxExistingOutputResult.report?.source, "vitest-json");
    assert.equal(npxExistingOutputResult.report?.total, 5);
    assert.equal(npxExistingOutputResult.args.some((arg) => arg.startsWith("--outputFile=")), false);
    assert.equal(existsSync(join(cwd, "npx-vitest.json")), true);

    const vitestJsonAfterJsonPreStepResult = await runTestTarget({
      cwd,
      targetId: "script:test:vitest-json-after-json-pre-step",
    });
    assert.equal(vitestJsonAfterJsonPreStepResult.ok, true);
    assert.equal(vitestJsonAfterJsonPreStepResult.report?.source, "vitest-json");
    assert.equal(vitestJsonAfterJsonPreStepResult.report?.total, 5);
    assert.equal(existsSync(join(cwd, "pre-json-vitest.json")), true);

    const playwrightExistingOutputResult = await runTestTarget({
      cwd,
      targetId: "script:test:playwright-existing-output",
    });
    assert.equal(playwrightExistingOutputResult.ok, true);
    assert.equal(playwrightExistingOutputResult.report?.source, "playwright-json");
    assert.equal(playwrightExistingOutputResult.report?.total, 5);
    assert.equal(playwrightExistingOutputResult.args.includes("--reporter=json"), false);
    assert.equal(existsSync(join(cwd, "playwright-existing.json")), true);

    const staleOutputResult = await runTestTarget({ cwd, targetId: "script:test:jest-stale-output" });
    assert.equal(staleOutputResult.ok, true);
    assert.equal(staleOutputResult.report?.source, "jest");
    assert.equal(staleOutputResult.report?.total, 99);

    const symlinkOutputResult = await runTestTarget({ cwd, targetId: "script:test:jest-symlink-output" });
    assert.equal(symlinkOutputResult.ok, true);
    assert.equal(symlinkOutputResult.report?.source, "jest");
    assert.equal(symlinkOutputResult.report?.total, 99);
    assert.equal(existsSync(join(outsideReportDir, "result.json")), true);

    const postStepResult = await runTestTarget({ cwd, targetId: "script:test:vitest-post-step" });
    assert.equal(postStepResult.ok, true);
    assert.equal(postStepResult.args.some((arg) => arg.startsWith("--outputFile=")), false);
    assert.match(postStepResult.stdout ?? "", /post-step-ok/);

    const jsonPostStepResult = await runTestTarget({ cwd, targetId: "script:test:vitest-json-post-step" });
    assert.equal(jsonPostStepResult.ok, true);
    assert.equal(jsonPostStepResult.args.some((arg) => arg.startsWith("--outputFile=")), false);
    assert.match(jsonPostStepResult.stdout ?? "", /post-step-ok/);
  } finally {
    if (previousOutsideReportDir === undefined) {
      delete process.env.ORX_TEST_OUTSIDE_REPORT_DIR;
    } else {
      process.env.ORX_TEST_OUTSIDE_REPORT_DIR = previousOutsideReportDir;
    }
    rmSync(cwd, { recursive: true, force: true });
    rmSync(outsideReportDir, { recursive: true, force: true });
  }
});

test("ignores malformed structured reports and falls back to stdout summary", () => {
  assert.equal(parseStructuredTestReportSummary(createTarget("node"), "{ not junit"), undefined);
  assert.equal(parseStructuredTestReportSummary(createTarget("jest"), "<testsuites></testsuites>"), undefined);

  assert.deepEqual(
    parseTestReportSummary(createTarget("node"), "ℹ tests 1\nℹ pass 1", "", "{ not junit"),
    {
      framework: "node",
      source: "node",
      total: 1,
      passed: 1,
    },
  );
});

test("reads config-declared JSON report files only for direct framework scripts", async () => {
  const cwd = createTempDir();
  const outsideReportDir = mkdtempSync(join(tmpdir(), "orx-config-report-outside-"));
  const previousOutsideReportDir = process.env.ORX_TEST_OUTSIDE_REPORT_DIR;
  process.env.ORX_TEST_OUTSIDE_REPORT_DIR = outsideReportDir;
  try {
    writeFileSync(
      join(cwd, "package.json"),
      JSON.stringify({
        scripts: {
          "test:jest-config": "jest",
          "test:vitest-config": "vitest run",
          "test:playwright-config": "playwright test",
          "test:jest-config-stale": "ORX_FAKE_SKIP_CONFIG=1 jest",
          "test:jest-config-symlink": "ORX_FAKE_SYMLINK_CONFIG=1 jest",
          "test:custom-jest-config": "node ./fake-config-reporter.mjs jest",
          "test:vitest-config-post-step": "vitest run && node ./post-step.mjs",
        },
      }),
    );
    writeFileSync(
      join(cwd, "jest.config.js"),
      "module.exports = { json: true, outputFile: 'reports/jest-config.json' };\n",
    );
    writeFileSync(
      join(cwd, "vitest.config.ts"),
      "export default { test: { reporters: ['default', 'json'], outputFile: { json: 'reports/vitest-config.json' } } };\n",
    );
    writeFileSync(
      join(cwd, "playwright.config.ts"),
      "export default { reporter: [['list'], ['json', { outputFile: 'reports/playwright-config.json' }]] };\n",
    );

    const binDir = join(cwd, "node_modules", ".bin");
    mkdirSync(binDir, { recursive: true });
    for (const binName of ["jest", "vitest", "playwright"]) {
      const binPath = join(binDir, binName);
      writeFileSync(binPath, "#!/usr/bin/env node\nimport '../../fake-config-reporter.mjs';\n");
      chmodSync(binPath, 0o755);
    }
    writeFileSync(
      join(cwd, "fake-config-reporter.mjs"),
      [
        "import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';",
        "import { basename, dirname } from 'node:path';",
        "const binName = basename(process.argv[1] ?? '');",
        "const knownBins = new Set(['jest', 'vitest', 'playwright']);",
        "const framework = knownBins.has(binName) ? binName : process.argv[2];",
        "const args = process.argv.slice(2);",
        "const report = framework === 'playwright'",
        "  ? { stats: { expected: 3, unexpected: 1, skipped: 1, flaky: 0, duration: 456 } }",
        "  : { numTotalTests: 5, numPassedTests: 4, numFailedTests: 1, numPendingTests: 0, numTodoTests: 0, numTotalTestSuites: 2, duration: 789 };",
        "const outputByFramework = new Map([",
        "  ['jest', 'reports/jest-config.json'],",
        "  ['vitest', 'reports/vitest-config.json'],",
        "  ['playwright', 'reports/playwright-config.json'],",
        "]);",
        "const reporterValues = [];",
        "for (const [index, arg] of args.entries()) {",
        "  if (arg === '--reporter' || arg === '--reporters') reporterValues.push(args[index + 1] ?? '');",
        "  if (arg.startsWith('--reporter=') || arg.startsWith('--reporters=')) reporterValues.push(arg.slice(arg.indexOf('=') + 1));",
        "}",
        "const hasNonJsonReporterOverride = reporterValues.some((value) => !value.split(/[,:]/).includes('json'));",
        "const hasOutputOverride = args.some((arg) => arg === '--outputFile' || arg === '--output-file' || arg.startsWith('--outputFile=') || arg.startsWith('--output-file='));",
        "const outputFile = outputByFramework.get(framework);",
        "if (outputFile && !process.env.ORX_FAKE_SKIP_CONFIG && !hasNonJsonReporterOverride && !hasOutputOverride) {",
        "  if (process.env.ORX_FAKE_SYMLINK_CONFIG && process.env.ORX_TEST_OUTSIDE_REPORT_DIR) {",
        "    rmSync('reports', { recursive: true, force: true });",
        "    mkdirSync(process.env.ORX_TEST_OUTSIDE_REPORT_DIR, { recursive: true });",
        "    symlinkSync(process.env.ORX_TEST_OUTSIDE_REPORT_DIR, 'reports', 'dir');",
        "  } else {",
        "    mkdirSync(dirname(outputFile), { recursive: true });",
        "  }",
        "  writeFileSync(outputFile, JSON.stringify(report));",
        "}",
        "console.log('Tests: 99 passed, 99 total');",
        "",
      ].join("\n"),
    );
    writeFileSync(join(cwd, "post-step.mjs"), "console.log('post-step-ok');\n");

    const jestConfigResult = await runTestTarget({ cwd, targetId: "script:test:jest-config" });
    assert.equal(jestConfigResult.ok, true);
    assert.equal(jestConfigResult.report?.source, "jest-json");
    assert.equal(jestConfigResult.report?.total, 5);
    assert.equal(jestConfigResult.args.includes("--json"), false);
    assert.equal(jestConfigResult.args.some((arg) => arg.startsWith("--outputFile=")), false);
    assert.equal(existsSync(join(cwd, "reports", "jest-config.json")), true);

    const vitestConfigResult = await runTestTarget({ cwd, targetId: "script:test:vitest-config" });
    assert.equal(vitestConfigResult.ok, true);
    assert.equal(vitestConfigResult.report?.source, "vitest-json");
    assert.equal(vitestConfigResult.report?.total, 5);
    assert.equal(vitestConfigResult.args.includes("--reporter=json"), false);
    assert.equal(vitestConfigResult.args.some((arg) => arg.startsWith("--outputFile=")), false);

    const playwrightConfigResult = await runTestTarget({ cwd, targetId: "script:test:playwright-config" });
    assert.equal(playwrightConfigResult.ok, true);
    assert.equal(playwrightConfigResult.report?.source, "playwright-json");
    assert.equal(playwrightConfigResult.report?.total, 5);
    assert.equal(playwrightConfigResult.report?.durationMs, 456);
    assert.equal(playwrightConfigResult.args.includes("--reporter=json"), false);

    const reporterOverrideResult = await runTestTarget({
      cwd,
      targetId: "script:test:jest-config",
      extraArgs: ["--reporter=dot"],
    });
    assert.equal(reporterOverrideResult.ok, true);
    assert.equal(reporterOverrideResult.report?.source, "jest");
    assert.equal(reporterOverrideResult.report?.total, 99);

    const staleResult = await runTestTarget({ cwd, targetId: "script:test:jest-config-stale" });
    assert.equal(staleResult.ok, true);
    assert.equal(staleResult.report?.source, "jest");
    assert.equal(staleResult.report?.total, 99);

    const customWrapperResult = await runTestTarget({ cwd, targetId: "script:test:custom-jest-config" });
    assert.equal(customWrapperResult.ok, true);
    assert.equal(customWrapperResult.report?.source, "jest");
    assert.equal(customWrapperResult.report?.total, 99);

    const postStepResult = await runTestTarget({ cwd, targetId: "script:test:vitest-config-post-step" });
    assert.equal(postStepResult.ok, true);
    assert.notEqual(postStepResult.report?.source, "vitest-json");
    assert.equal(postStepResult.report?.total, 99);
    assert.match(postStepResult.stdout ?? "", /post-step-ok/);

    const symlinkResult = await runTestTarget({ cwd, targetId: "script:test:jest-config-symlink" });
    assert.equal(symlinkResult.ok, true);
    assert.equal(symlinkResult.report?.source, "jest");
    assert.equal(symlinkResult.report?.total, 99);
    assert.equal(existsSync(join(outsideReportDir, "jest-config.json")), true);
  } finally {
    if (previousOutsideReportDir === undefined) {
      delete process.env.ORX_TEST_OUTSIDE_REPORT_DIR;
    } else {
      process.env.ORX_TEST_OUTSIDE_REPORT_DIR = previousOutsideReportDir;
    }
    rmSync(cwd, { recursive: true, force: true });
    rmSync(outsideReportDir, { recursive: true, force: true });
  }
});

test("reads config-declared JSON report files for exact no-install npx framework scripts", async () => {
  const cwd = createTempDir();
  try {
    writeFileSync(
      join(cwd, "package.json"),
      JSON.stringify({
        scripts: {
          "test:jest-config-npx": "npx --no-install jest",
          "test:jest-config-plain-npx": "npx jest",
        },
      }),
    );
    writeFileSync(
      join(cwd, "jest.config.js"),
      "module.exports = { json: true, outputFile: 'reports/npx-config.json' };\n",
    );
    const binDir = join(cwd, "node_modules", ".bin");
    mkdirSync(binDir, { recursive: true });
    const binPath = join(binDir, "jest");
    writeFileSync(binPath, "#!/usr/bin/env node\nimport '../../fake-config-reporter.mjs';\n");
    chmodSync(binPath, 0o755);
    writeFileSync(
      join(cwd, "fake-config-reporter.mjs"),
      [
        "import { mkdirSync, writeFileSync } from 'node:fs';",
        "mkdirSync('reports', { recursive: true });",
        "writeFileSync('reports/npx-config.json', JSON.stringify({",
        "  numTotalTests: 5,",
        "  numPassedTests: 4,",
        "  numFailedTests: 1,",
        "  numPendingTests: 0,",
        "  numTodoTests: 0,",
        "  numTotalTestSuites: 2,",
        "  duration: 789,",
        "}));",
        "console.log('Tests: 99 passed, 99 total');",
        "",
      ].join("\n"),
    );

    const npxConfigResult = await runTestTarget({ cwd, targetId: "script:test:jest-config-npx" });
    assert.equal(npxConfigResult.ok, true);
    assert.equal(npxConfigResult.report?.source, "jest-json");
    assert.equal(npxConfigResult.report?.total, 5);
    assert.equal(npxConfigResult.args.includes("--json"), false);
    assert.equal(npxConfigResult.args.some((arg) => arg.startsWith("--outputFile=")), false);
    assert.equal(existsSync(join(cwd, "reports", "npx-config.json")), true);

    const plainNpxConfigResult = await runTestTarget({ cwd, targetId: "script:test:jest-config-plain-npx" });
    assert.equal(plainNpxConfigResult.ok, true);
    assert.equal(plainNpxConfigResult.report?.source, "jest");
    assert.equal(plainNpxConfigResult.report?.total, 99);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("infers package-script frameworks and report metadata", () => {
  const cwd = createTempDir();
  try {
    writeFileSync(
      join(cwd, "package.json"),
      JSON.stringify({
        scripts: {
          test: "vitest run --reporter=json",
          "test:ava": "ava --verbose",
          "test:custom-node": "node ./custom-runner.mjs --test",
          "test:jest": "jest --json",
          "test:node": "node --test --test-reporter=tap ./example.test.mjs",
          "test:playwright": "playwright test --reporter=list",
          "test:playwright-install": "playwright install && npm test",
          "test:react": "react-scripts test",
          "test:unknown": "node ./custom-runner.mjs",
          "test:wrapped-ava": "node ./custom-runner.mjs ava --verbose",
        },
      }),
    );

    const discovery = discoverTestTargets(cwd);
    const frameworks = Object.fromEntries(
      discovery.targets.map((target) => [target.id, target.framework]),
    );
    assert.deepEqual(frameworks, {
      "script:test": "vitest",
      "script:test:ava": "ava",
      "script:test:custom-node": "unknown",
      "script:test:jest": "jest",
      "script:test:node": "node",
      "script:test:playwright": "playwright",
      "script:test:playwright-install": "unknown",
      "script:test:react": "jest",
      "script:test:unknown": "unknown",
      "script:test:wrapped-ava": "unknown",
    });
    assert.equal(discovery.targets.find((target) => target.id === "script:test")?.reporter, "json");
    assert.equal(discovery.targets.find((target) => target.id === "script:test:node")?.reporter, "tap");
    assert.equal(discovery.targets.find((target) => target.id === "script:test:playwright")?.reporter, "list");

    const renderedTargets = renderTestTargets(discovery);
    assert.match(renderedTargets, /id=script:test kind=package-script framework=vitest/);
    assert.match(renderedTargets, /id=script:test:playwright kind=package-script framework=playwright/);
    assert.match(renderedTargets, /reporter="json"/);

    const summary = getTestAdapterSummary(cwd);
    assert.deepEqual(summary.frameworkCounts, {
      node: 1,
      vitest: 1,
      jest: 2,
      playwright: 1,
      ava: 1,
      unknown: 4,
    });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("node:test fallback safely runs root files with dash-leading names", async () => {
  const cwd = createTempDir();
  try {
    writeFileSync(
      join(cwd, "--dash.test.mjs"),
      [
        "import test from 'node:test';",
        "import assert from 'node:assert/strict';",
        "test('dash file works', () => assert.equal('ok', 'ok'));",
        "",
      ].join("\n"),
    );

    const discovery = discoverTestTargets(cwd);
    assert.equal(discovery.defaultTargetId, "node:test");
    assert.deepEqual(discovery.targets[0].args, ["--test", join(cwd, "--dash.test.mjs")]);

    const result = await runTestTarget({ cwd });
    assert.equal(result.ok, true);
    assert.equal(result.status, "ok");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("redacts secret-like test output and unsafe omitted script names", async () => {
  const cwd = createTempDir();
  try {
    writeFileSync(
      join(cwd, "package.json"),
      JSON.stringify({
        scripts: {
          test: "node ./leak.mjs",
          "test:sk-or-v1-secretvalue": "node ./ignored.mjs",
          "test\u001b[31m": "node ./ignored.mjs",
        },
      }),
    );
    writeFileSync(
      join(cwd, "leak.mjs"),
      [
        "console.log('secret=abcd1234 Bearer sk-or-v1-secretvalue');",
        "console.error('access_token=abcd1234');",
        "",
      ].join("\n"),
    );

    const discovery = discoverTestTargets(cwd);
    const renderedTargets = renderTestTargets(discovery);
    assert.doesNotMatch(renderedTargets, /\x1b/);
    assert.doesNotMatch(renderedTargets, /sk-or-v1-secretvalue/);
    assert.match(renderedTargets, /\[redacted\]/);

    const result = await runTestTarget({ cwd });
    const renderedRun = renderTestRunResult(result);
    assert.equal(result.ok, true);
    assert.doesNotMatch(renderedRun, /abcd1234/);
    assert.doesNotMatch(renderedRun, /sk-or-v1-secretvalue/);
    assert.match(renderedRun, /secret=\[redacted\]/);
    assert.match(renderedRun, /Bearer \[redacted\]/);
    assert.match(renderedRun, /access_token=\[redacted\]/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("rejects unsafe test run arguments and unknown targets", async () => {
  const cwd = createTempDir();
  try {
    writeFileSync(
      join(cwd, "package.json"),
      JSON.stringify({
        scripts: {
          test: "node ./pass.mjs",
        },
      }),
    );
    writeFileSync(join(cwd, "pass.mjs"), "console.log('ok');\n");

    const unsafe = await runTestTarget({
      cwd,
      targetId: "script:test",
      extraArgs: ["bad\u0000arg"],
    });
    assert.equal(unsafe.ok, false);
    assert.equal(unsafe.status, "invalid_arguments");
    assert.match(unsafe.message, /control character/);

    const unknown = await runTestTarget({ cwd, targetId: "script:missing" });
    assert.equal(unknown.ok, false);
    assert.equal(unknown.status, "not_found");
    assert.match(unknown.message, /Unknown test target: script:missing/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), "orx-tests-"));
}

function createTarget(framework: TestFramework): TestTarget {
  return {
    id: `script:${framework}`,
    kind: "package-script",
    framework,
    label: `${framework} target`,
    command: "npm",
    args: ["run", "test"],
    cwd: "/tmp/orx-test-target",
    packageManager: "npm",
    scriptName: "test",
  };
}
