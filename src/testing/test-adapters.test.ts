import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

  assert.equal(parseTestReportSummary(createTarget("unknown"), "2 failed network requests (99)"), undefined);
  assert.equal(parseTestReportSummary(createTarget("playwright"), "2 failed network requests (99)"), undefined);
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

test("requests private structured JSON report files for package scripts with JSON reporters", async () => {
  const cwd = createTempDir();
  try {
    writeFileSync(
      join(cwd, "package.json"),
      JSON.stringify({
        scripts: {
          "test:jest-json": "node ./fake-json-reporter.mjs jest --json",
          "test:vitest-json": "node ./fake-json-reporter.mjs vitest --reporter=json",
          "test:playwright-json": "node ./fake-json-reporter.mjs playwright test --reporter=json",
          "test:jest-existing-output": "node ./fake-json-reporter.mjs jest --json --outputFile=already.json",
          "test:vitest-post-step": "node ./fake-json-reporter.mjs vitest --reporter=json && node ./post-step.mjs",
          "test:vitest-json-post-step": "node ./fake-json-reporter.mjs vitest --reporter=json && node ./post-step.mjs --json",
        },
      }),
    );
    writeFileSync(
      join(cwd, "fake-json-reporter.mjs"),
      [
        "import { writeFileSync } from 'node:fs';",
        "const framework = process.argv[2];",
        "const outputArg = process.argv.find((arg) => arg.startsWith('--outputFile='));",
        "const outputFile = outputArg?.slice('--outputFile='.length) ?? process.env.PLAYWRIGHT_JSON_OUTPUT_FILE;",
        "const report = framework === 'playwright'",
        "  ? { stats: { expected: 3, unexpected: 1, skipped: 1, flaky: 0, duration: 456 } }",
        "  : { numTotalTests: 5, numPassedTests: 4, numFailedTests: 1, numPendingTests: 0, numTodoTests: 0, numTotalTestSuites: 2, duration: 789 };",
        "if (outputFile) writeFileSync(outputFile, JSON.stringify(report));",
        "console.log('Tests: 99 passed, 99 total');",
        "",
      ].join("\n"),
    );
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
    assert.equal(existingOutputResult.report?.source, "jest");
    assert.equal(existingOutputResult.report?.total, 99);
    assert.equal(existingOutputResult.args.some((arg) => arg.startsWith("--outputFile=")), false);

    const postStepResult = await runTestTarget({ cwd, targetId: "script:test:vitest-post-step" });
    assert.equal(postStepResult.ok, true);
    assert.equal(postStepResult.args.some((arg) => arg.startsWith("--outputFile=")), false);
    assert.match(postStepResult.stdout ?? "", /post-step-ok/);

    const jsonPostStepResult = await runTestTarget({ cwd, targetId: "script:test:vitest-json-post-step" });
    assert.equal(jsonPostStepResult.ok, true);
    assert.equal(jsonPostStepResult.args.some((arg) => arg.startsWith("--outputFile=")), false);
    assert.match(jsonPostStepResult.stdout ?? "", /post-step-ok/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
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

test("infers package-script frameworks and report metadata", () => {
  const cwd = createTempDir();
  try {
    writeFileSync(
      join(cwd, "package.json"),
      JSON.stringify({
        scripts: {
          test: "vitest run --reporter=json",
          "test:custom-node": "node ./custom-runner.mjs --test",
          "test:jest": "jest --json",
          "test:node": "node --test --test-reporter=tap ./example.test.mjs",
          "test:playwright": "playwright test --reporter=list",
          "test:playwright-install": "playwright install && npm test",
          "test:react": "react-scripts test",
          "test:unknown": "node ./custom-runner.mjs",
        },
      }),
    );

    const discovery = discoverTestTargets(cwd);
    const frameworks = Object.fromEntries(
      discovery.targets.map((target) => [target.id, target.framework]),
    );
    assert.deepEqual(frameworks, {
      "script:test": "vitest",
      "script:test:custom-node": "unknown",
      "script:test:jest": "jest",
      "script:test:node": "node",
      "script:test:playwright": "playwright",
      "script:test:playwright-install": "unknown",
      "script:test:react": "jest",
      "script:test:unknown": "unknown",
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
      unknown: 3,
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
