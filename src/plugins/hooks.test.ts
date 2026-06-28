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
  renderPluginHooks,
  setPluginEnabledState,
  trustPluginHook,
  untrustPluginHook,
} from "./index.js";

test("plugin hooks discover from enabled cached manifests and render inactive", () => {
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
    assert.match(rendered, /execution: inactive/);
    assert.match(rendered, /trusted=no/);
    assert.match(rendered, /command="npm run format"/);
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
): string {
  const pluginDirectory = join(cwd, "plugin");
  const manifestPath = join(pluginDirectory, "orx-plugin.json");
  mkdirSync(pluginDirectory, { recursive: true });
  writeFileSync(join(pluginDirectory, "hooks.json"), JSON.stringify(hooksFile));
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
        hooks: "./hooks.json",
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
