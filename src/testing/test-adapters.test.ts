import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  discoverTestTargets,
  getTestAdapterSummary,
  renderTestRunResult,
  renderTestTargets,
  runTestTarget,
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
      "console.log(`adapter-pass ${process.argv.slice(2).join(',')}`);\n",
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
    assert.match(result.stdout ?? "", /adapter-pass unit,--flag/);
    assert.match(renderTestRunResult(result), /status: ok/);
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
