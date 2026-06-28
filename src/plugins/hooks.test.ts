import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  discoverEnabledPluginHooks,
  getPluginHookTrustSummary,
  loadPluginHooksTrustConfig,
  registerPluginManifest,
  renderPluginHookInspect,
  renderPluginHookRunResult,
  renderPluginHooks,
  runPluginHook,
  runTrustedPluginHooksForEvent,
  setPluginEnabledState,
  trustPluginHook,
  untrustPluginHook,
} from "./index.js";

test("plugin hooks discover from enabled cached manifests and render manual runtime state", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-plugin-hooks-"));
  const registryPath = join(cwd, "plugins", "registry.json");
  const hooksConfigPath = join(cwd, "state", "hooks.json");
  const manifestPath = writeHookPluginFixture(cwd);

  try {
    registerPluginManifest(manifestPath, { registryPath });
    assert.equal(discoverEnabledPluginHooks({ registryPath }).hooks.length, 0);

    setPluginEnabledState("acme.hook-plugin@1.0.0", true, { registryPath });
    const discovery = discoverEnabledPluginHooks({ registryPath });
    const hook = discovery.hooks[0];
    const rendered = renderPluginHooks(discovery, { configPath: hooksConfigPath });

    assert.equal(discovery.hooks.length, 1);
    assert.equal(hook.id, "plugin:acme.hook-plugin@1.0.0:format");
    assert.equal(hook.event, "post_tool_use");
    assert.equal(hook.command, "npm run format");
    assert.deepEqual(hook.env, ["CI"]);
    assert.match(hook.hookHash, /^sha256:[a-f0-9]{64}$/);
    assert.match(hook.componentHash, /^sha256:[a-f0-9]{64}$/);
    assert.match(rendered, /Hooks/);
    assert.match(rendered, /execution: manual_and_lifecycle/);
    assert.match(rendered, /trusted=no/);
    assert.match(rendered, /command="npm run format"/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("plugin hook runner blocks untrusted hooks and executes trusted hooks with declared env and audit", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-plugin-hook-run-"));
  const registryPath = join(cwd, "plugins", "registry.json");
  const hooksConfigPath = join(cwd, "state", "hooks.json");
  const auditLogPath = join(cwd, "audit", "hooks.jsonl");
  const secretValue = "hide-me-12345";
  const command = `${JSON.stringify(process.execPath)} -e ${JSON.stringify(
    "console.log('ci=' + process.env.CI); console.error('secret=' + process.env.SECRET_HOOK_VALUE)",
  )}`;
  const manifestPath = writeHookPluginFixture(cwd, {
    hooks: {
      format: {
        event: "post_tool_use",
        command,
        env: ["CI", "SECRET_HOOK_VALUE"],
      },
    },
  });
  const hookId = "plugin:acme.hook-plugin@1.0.0:format";

  try {
    registerPluginManifest(manifestPath, { registryPath });
    setPluginEnabledState("acme.hook-plugin@1.0.0", true, { registryPath });

    const blocked = await runPluginHook(hookId, {
      auditLogPath,
      configPath: hooksConfigPath,
      env: { CI: "1", SECRET_HOOK_VALUE: secretValue },
      registryPath,
    });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.executed, false);
    assert.equal(blocked.status, "untrusted");

    trustPluginHook(hookId, { registryPath, configPath: hooksConfigPath });
    const result = await runPluginHook(hookId, {
      auditLogPath,
      configPath: hooksConfigPath,
      env: { CI: "1", SECRET_HOOK_VALUE: secretValue, UNDECLARED_VALUE: "ignored" },
      registryPath,
      now: () => new Date("2026-06-27T12:30:00.000Z"),
    });
    const rendered = renderPluginHookRunResult(result);

    assert.equal(result.ok, true);
    assert.equal(result.executed, true);
    assert.equal(result.status, "ok");
    assert.deepEqual(result.envNames, ["CI", "SECRET_HOOK_VALUE"]);
    assert.match(result.stdout ?? "", /ci=1/);
    assert.doesNotMatch(result.stderr ?? "", new RegExp(secretValue));
    assert.match(result.stderr ?? "", /\[redacted-env:SECRET_HOOK_VALUE\]/);
    assert.match(rendered, /Hook run: plugin:acme\.hook-plugin@1\.0\.0:format/);
    assert.match(rendered, /status: ok/);
    assert.match(rendered, /stdout: "ci=1\\n"/);
    assert.equal(statSync(dirname(auditLogPath)).mode & 0o777, 0o700);
    assert.equal(statSync(auditLogPath).mode & 0o777, 0o600);

    const auditLog = readFileSync(auditLogPath, "utf8");
    assert.match(auditLog, /"type":"plugin.hook.run"/);
    assert.match(auditLog, /"status":"untrusted"/);
    assert.match(auditLog, /"status":"ok"/);
    assert.doesNotMatch(auditLog, new RegExp(secretValue));
    assert.doesNotMatch(auditLog, /UNDECLARED_VALUE/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("plugin lifecycle runner executes only trusted current hooks for one event", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-plugin-hook-lifecycle-"));
  const registryPath = join(cwd, "plugins", "registry.json");
  const hooksConfigPath = join(cwd, "state", "hooks.json");
  const auditLogPath = join(cwd, "audit", "hooks.jsonl");
  const eventLogPath = join(cwd, "events.log");
  const commandFor = (label: string) =>
    `${JSON.stringify(process.execPath)} -e ${JSON.stringify(
      `require("node:fs").appendFileSync(${JSON.stringify(eventLogPath)}, ${JSON.stringify(
        `${label}\n`,
      )})`,
    )}`;
  const manifestPath = writeHookPluginFixture(cwd, {
    hooks: {
      trustedprompt: {
        event: "user_prompt_submit",
        command: commandFor("trusted-prompt"),
      },
      untrustedprompt: {
        event: "user_prompt_submit",
        command: commandFor("untrusted-prompt"),
      },
      trustedstop: {
        event: "stop",
        command: commandFor("trusted-stop"),
      },
    },
  });
  const trustedPromptId = "plugin:acme.hook-plugin@1.0.0:trustedprompt";

  try {
    registerPluginManifest(manifestPath, { registryPath });
    setPluginEnabledState("acme.hook-plugin@1.0.0", true, { registryPath });
    const promptHook = discoverEnabledPluginHooks({ registryPath }).hooks.find(
      (hook) => hook.hookId === "trustedprompt",
    );
    assert.equal(promptHook?.id, trustedPromptId);
    trustPluginHook(trustedPromptId, { registryPath, configPath: hooksConfigPath });

    const result = await runTrustedPluginHooksForEvent("user_prompt_submit", {
      auditLogPath,
      configPath: hooksConfigPath,
      registryPath,
    });

    assert.equal(result.hookCount, 2);
    assert.equal(result.executedCount, 1);
    assert.equal(result.failedCount, 0);
    assert.equal(result.skippedUntrustedCount, 1);
    assert.equal(result.skippedPendingTrustCount, 0);
    assert.equal(readFileSync(eventLogPath, "utf8"), "trusted-prompt\n");
    assert.match(readFileSync(auditLogPath, "utf8"), /trustedprompt/);
    assert.doesNotMatch(readFileSync(auditLogPath, "utf8"), /untrustedprompt/);

    const pluginRoot = dirname(
      readPluginRegistryManifestPath(registryPath, "acme.hook-plugin@1.0.0"),
    );
    writeFileSync(
      join(pluginRoot, "hooks.json"),
      JSON.stringify({
        hooks: {
          trustedprompt: {
            event: "user_prompt_submit",
            command: commandFor("changed-trusted-prompt"),
          },
          untrustedprompt: {
            event: "user_prompt_submit",
            command: commandFor("untrusted-prompt"),
          },
          trustedstop: {
            event: "stop",
            command: commandFor("trusted-stop"),
          },
        },
      }),
    );

    const pendingResult = await runTrustedPluginHooksForEvent("user_prompt_submit", {
      auditLogPath,
      configPath: hooksConfigPath,
      registryPath,
    });
    assert.equal(pendingResult.hookCount, 2);
    assert.equal(pendingResult.executedCount, 0);
    assert.equal(pendingResult.failedCount, 0);
    assert.equal(pendingResult.skippedUntrustedCount, 1);
    assert.equal(pendingResult.skippedPendingTrustCount, 1);
    assert.equal(readFileSync(eventLogPath, "utf8"), "trusted-prompt\n");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("plugin hook runner uses cached hook cwd after source plugin removal", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-plugin-hook-cwd-run-"));
  const registryPath = join(cwd, "plugins", "registry.json");
  const hooksConfigPath = join(cwd, "state", "hooks.json");
  const auditLogPath = join(cwd, "audit", "hooks.jsonl");
  const command = `${JSON.stringify(process.execPath)} -e ${JSON.stringify(
    "console.log('cwd-marker=' + require('node:fs').existsSync('marker.txt'))",
  )}`;
  const manifestPath = writeHookPluginFixture(cwd, {
    hooks: {
      format: {
        event: "post_tool_use",
        command,
        cwd: "safe",
      },
    },
  });
  const sourcePluginRoot = dirname(manifestPath);
  mkdirSync(join(sourcePluginRoot, "safe"), { recursive: true });
  writeFileSync(join(sourcePluginRoot, "safe", "marker.txt"), "cached");
  const hookId = "plugin:acme.hook-plugin@1.0.0:format";

  try {
    registerPluginManifest(manifestPath, { registryPath });
    rmSync(sourcePluginRoot, { recursive: true, force: true });
    setPluginEnabledState("acme.hook-plugin@1.0.0", true, { registryPath });
    trustPluginHook(hookId, { registryPath, configPath: hooksConfigPath });

    const result = await runPluginHook(hookId, {
      auditLogPath,
      configPath: hooksConfigPath,
      registryPath,
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, "ok");
    assert.match(result.cwd ?? "", /plugins[/\\]cache[/\\]acme\.hook-plugin@1\.0\.0/);
    assert.match(result.stdout ?? "", /cwd-marker=true/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("plugin hook runner caches full cwd when hooks file is nested inside it", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-plugin-hook-nested-cwd-run-"));
  const registryPath = join(cwd, "plugins", "registry.json");
  const hooksConfigPath = join(cwd, "state", "hooks.json");
  const auditLogPath = join(cwd, "audit", "hooks.jsonl");
  const command = `${JSON.stringify(process.execPath)} -e ${JSON.stringify(
    "console.log('nested-marker=' + require('node:fs').existsSync('marker.txt'))",
  )}`;
  const manifestPath = writeHookPluginFixture(
    cwd,
    {
      hooks: {
        format: {
          event: "post_tool_use",
          command,
          cwd: "safe",
        },
      },
    },
    "./safe/hooks.json",
  );
  const sourcePluginRoot = dirname(manifestPath);
  writeFileSync(join(sourcePluginRoot, "safe", "marker.txt"), "cached");
  const hookId = "plugin:acme.hook-plugin@1.0.0:format";

  try {
    registerPluginManifest(manifestPath, { registryPath });
    rmSync(sourcePluginRoot, { recursive: true, force: true });
    setPluginEnabledState("acme.hook-plugin@1.0.0", true, { registryPath });
    trustPluginHook(hookId, { registryPath, configPath: hooksConfigPath });

    const result = await runPluginHook(hookId, {
      auditLogPath,
      configPath: hooksConfigPath,
      registryPath,
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, "ok");
    assert.match(result.stdout ?? "", /nested-marker=true/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("plugin hook runner fails closed when a successful run cannot be audited", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-plugin-hook-audit-failure-"));
  const registryPath = join(cwd, "plugins", "registry.json");
  const hooksConfigPath = join(cwd, "state", "hooks.json");
  const auditLogPath = join(cwd, "audit-directory");
  const command = `${JSON.stringify(process.execPath)} -e ${JSON.stringify(
    "console.log('audit-required')",
  )}`;
  const manifestPath = writeHookPluginFixture(cwd, {
    hooks: {
      format: {
        event: "post_tool_use",
        command,
      },
    },
  });
  const hookId = "plugin:acme.hook-plugin@1.0.0:format";

  try {
    registerPluginManifest(manifestPath, { registryPath });
    setPluginEnabledState("acme.hook-plugin@1.0.0", true, { registryPath });
    trustPluginHook(hookId, { registryPath, configPath: hooksConfigPath });
    mkdirSync(auditLogPath, { recursive: true });

    const result = await runPluginHook(hookId, {
      auditLogPath,
      configPath: hooksConfigPath,
      registryPath,
    });

    assert.equal(result.executed, true);
    assert.equal(result.ok, false);
    assert.equal(result.status, "audit_failed");
    assert.match(result.stdout ?? "", /audit-required/);
    assert.match(result.message, /Audit log could not be written/);
    assert.ok(result.auditError);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("plugin hook trust persists hashes privately and detects changed cached definitions", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-plugin-hook-trust-"));
  const registryPath = join(cwd, "plugins", "registry.json");
  const hooksConfigPath = join(cwd, "state", "hooks.json");
  const manifestPath = writeHookPluginFixture(cwd);

  try {
    registerPluginManifest(manifestPath, { registryPath });
    setPluginEnabledState("acme.hook-plugin@1.0.0", true, { registryPath });
    const hookId = "plugin:acme.hook-plugin@1.0.0:format";
    const trusted = trustPluginHook(hookId, {
      registryPath,
      configPath: hooksConfigPath,
      now: () => new Date("2026-06-27T12:00:00.000Z"),
    });

    assert.equal(trusted.ok, true);
    assert.equal(getPluginHookTrustSummary({ registryPath, configPath: hooksConfigPath }).trustedCount, 1);
    assert.equal(statSync(dirname(hooksConfigPath)).mode & 0o777, 0o700);
    assert.equal(statSync(hooksConfigPath).mode & 0o777, 0o600);
    assert.deepEqual(Object.keys(loadPluginHooksTrustConfig({ configPath: hooksConfigPath }).hooks), [
      hookId,
    ]);

    const pluginRoot = dirname(
      readPluginRegistryManifestPath(registryPath, "acme.hook-plugin@1.0.0"),
    );
    writeFileSync(
      join(pluginRoot, "hooks.json"),
      JSON.stringify({
        hooks: {
          format: {
            event: "post_tool_use",
            command: "npm run lint",
            env: ["CI"],
          },
        },
      }),
    );

    const summary = getPluginHookTrustSummary({ registryPath, configPath: hooksConfigPath });
    const hook = discoverEnabledPluginHooks({ registryPath }).hooks[0];
    const inspected = renderPluginHookInspect(hook, { configPath: hooksConfigPath });

    assert.equal(summary.trustedCount, 0);
    assert.equal(summary.pendingTrustCount, 1);
    assert.match(inspected, /trust_status: pending_hash_change/);

    const untrusted = untrustPluginHook(hookId, { configPath: hooksConfigPath });
    assert.equal(untrusted.ok, true);
    assert.equal(getPluginHookTrustSummary({ registryPath, configPath: hooksConfigPath }).pendingTrustCount, 0);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("plugin hook discovery omits unsafe hook values without storing secrets", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-plugin-hook-unsafe-"));
  const registryPath = join(cwd, "plugins", "registry.json");
  const manifestPath = writeHookPluginFixture(cwd, {
    hooks: {
      unsafe: {
        event: "post_tool_use",
        command: "echo api_key=abcdefgh12345678",
      },
    },
  });

  try {
    registerPluginManifest(manifestPath, { registryPath });
    setPluginEnabledState("acme.hook-plugin@1.0.0", true, { registryPath });
    const discovery = discoverEnabledPluginHooks({ registryPath });
    const rendered = renderPluginHooks(discovery);

    assert.equal(discovery.hooks.length, 0);
    assert.equal(discovery.omissions.length, 1);
    assert.match(rendered, /hook.command must not contain secret-like values/);
    assert.doesNotMatch(rendered, /abcdefgh12345678/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("plugin hook discovery rejects cwd traversal and duplicate effective hook ids", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-plugin-hook-paths-"));
  const registryPath = join(cwd, "plugins", "registry.json");
  const manifestPath = writeHookPluginFixture(cwd, {
    hooks: {
      first: {
        id: "shared",
        event: "post_tool_use",
        command: "npm run format",
        cwd: "safe",
      },
      second: {
        id: "shared",
        event: "post_tool_use",
        command: "npm run lint",
      },
      traversal: {
        event: "post_tool_use",
        command: "npm test",
        cwd: "safe/../../outside",
      },
    },
  });

  try {
    registerPluginManifest(manifestPath, { registryPath });
    setPluginEnabledState("acme.hook-plugin@1.0.0", true, { registryPath });
    const discovery = discoverEnabledPluginHooks({ registryPath });

    assert.deepEqual(
      discovery.hooks.map((hook) => hook.id),
      ["plugin:acme.hook-plugin@1.0.0:shared"],
    );
    assert.equal(discovery.hooks[0].cwd, "safe");
    assert.equal(discovery.omissions.length, 2);
    assert.match(JSON.stringify(discovery.omissions), /duplicate hook id/);
    assert.match(JSON.stringify(discovery.omissions), /hook.cwd must not traverse outside/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

function writeHookPluginFixture(
  cwd: string,
  hooksFile: unknown = {
    hooks: {
      format: {
        event: "post_tool_use",
        command: "npm run format",
        env: ["CI"],
        timeoutMs: 5000,
        description: "Format after edits.",
      },
    },
  },
  hooksComponentPath = "./hooks.json",
): string {
  const pluginDirectory = join(cwd, "plugin");
  const manifestPath = join(pluginDirectory, "orx-plugin.json");
  mkdirSync(pluginDirectory, { recursive: true });
  const hooksPath = join(pluginDirectory, hooksComponentPath);
  mkdirSync(dirname(hooksPath), { recursive: true });
  writeFileSync(hooksPath, JSON.stringify(hooksFile));
  writeFileSync(
    manifestPath,
    JSON.stringify({
      schemaVersion: "1",
      name: "hook-plugin",
      version: "1.0.0",
      description: "Declares hook definitions.",
      publisher: "acme",
      source: {
        type: "local",
        path: ".",
      },
      components: {
        hooks: hooksComponentPath,
      },
      permissions: {
        filesystem: [],
        network: [],
        env: ["CI"],
        mcp: [],
      },
    }),
  );
  return manifestPath;
}

function readPluginRegistryManifestPath(registryPath: string, pluginId: string): string {
  const registry = JSON.parse(readFileSync(registryPath, "utf8")) as {
    plugins: Record<string, { lock: { source: { manifestPath: string } } }>;
  };
  return registry.plugins[pluginId].lock.source.manifestPath;
}
