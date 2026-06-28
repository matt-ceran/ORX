import test from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  getPluginStatusSummary,
  loadPluginRegistry,
  formatPluginIdForMessage,
  registerPluginManifest,
  renderPluginInspect,
  resolvePluginCacheDirectory,
  resolvePluginRegistryPath,
  setPluginEnabledState,
} from "./index.js";

const ZERO_SHA256 = "sha256:0000000000000000000000000000000000000000000000000000000000000000";

test("registerPluginManifest sanitizes untrusted manifest JSON and writes private registry", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-plugin-registry-"));
  const registryPath = join(cwd, "state", "registry.json");
  const pluginDirectory = join(cwd, "plugin");
  const manifestPath = join(pluginDirectory, "orx-plugin.json");
  mkdirSync(join(pluginDirectory, "skills"), { recursive: true });
  writeFileSync(join(pluginDirectory, "skills", "SKILL.md"), "# Safe skill\n");
  writeFileSync(join(pluginDirectory, "secret.txt"), "sk-or-v1-secret\n");
  writeFileSync(
    manifestPath,
    JSON.stringify({
      schemaVersion: "1",
      name: "safe-plugin",
      version: "1.2.3",
      description: "A safe local plugin.",
      publisher: "acme",
      privateToken: "sk-or-v1-secret",
      source: {
        type: "local",
        path: ".",
        apiKey: "secret-source-value",
      },
      components: {
        skills: "./skills",
        ignoredSecretFile: "./secret.txt",
      },
      permissions: {
        filesystem: ["read:."],
        network: ["api.example.test"],
        env: ["SAFE_TOKEN"],
        mcp: [],
        secretValues: ["do-not-store"],
      },
    }),
  );

  try {
    const result = registerPluginManifest(manifestPath, {
      registryPath,
      now: () => new Date("2026-06-26T12:00:00.000Z"),
    });

    assert.equal(result.ok, true);
    assert.equal(result.plugin?.id, "acme.safe-plugin@1.2.3");
    assert.equal(result.plugin?.enabled, false);
    assert.match(result.plugin?.manifestHash ?? "", /^sha256:[a-f0-9]{64}$/);
    assert.match(result.plugin?.lock.componentHashes.skills?.hash ?? "", /^sha256:[a-f0-9]{64}$/);
    assert.notEqual(result.plugin?.lock.source.manifestPath, manifestPath);
    assert.equal(result.plugin?.lock.source.originalManifestPath, manifestPath);

    const registryText = readFileSync(registryPath, "utf8");
    assert.doesNotMatch(registryText, /sk-or-v1-secret|secret-source-value|do-not-store/);
    assert.doesNotMatch(registryText, /privateToken|apiKey|ignoredSecretFile|secretValues/);
    assert.match(registryText, /"enabled": false/);

    assert.equal(modeBits(cwd, "state"), "700");
    assert.equal(modeBits(cwd, "state/registry.json"), "600");
    assert.equal(modeBits(cwd, "state/cache"), "700");
    assert.equal(modeBits(cwd, "state/cache/acme.safe-plugin@1.2.3"), "700");

    const cachedManifestPath = result.plugin?.lock.source.manifestPath ?? "";
    const cachedManifestText = readFileSync(cachedManifestPath, "utf8");
    assert.doesNotMatch(cachedManifestText, /sk-or-v1-secret|secret-source-value|privateToken|apiKey/);
    assert.equal(existsSync(join(dirname(cachedManifestPath), "secret.txt")), false);

    const loaded = loadPluginRegistry({ registryPath });
    assert.equal(Object.keys(loaded.plugins).length, 1);
    assert.equal(loaded.plugins["acme.safe-plugin@1.2.3"].manifest.components.skills, "skills");
    assert.deepEqual(loaded.plugins["acme.safe-plugin@1.2.3"].manifest.permissions.env, [
      "SAFE_TOKEN",
    ]);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("plugin registry enable and disable only changes state markers", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-plugin-state-"));
  const registryPath = join(cwd, "registry.json");
  const manifestPath = join(cwd, "plugin.json");
  writeFileSync(manifestPath, JSON.stringify(validManifest()));

  try {
    registerPluginManifest(manifestPath, {
      registryPath,
      now: () => new Date("2026-06-26T12:00:00.000Z"),
    });

    const enabled = setPluginEnabledState("acme.demo-plugin@1.0.0", true, {
      registryPath,
      now: () => new Date("2026-06-26T12:01:00.000Z"),
    });
    assert.equal(enabled.ok, true);
    assert.equal(enabled.previousEnabled, false);
    assert.equal(enabled.nextEnabled, true);
    assert.match(enabled.message, /executable surfaces remain inactive/);

    const summary = getPluginStatusSummary({ registryPath });
    assert.equal(summary.installedCount, 1);
    assert.equal(summary.enabledCount, 1);
    assert.equal(summary.enabledHookCount, 0);
    assert.equal(summary.enabledBinCount, 0);
    assert.equal(summary.enabledMcpCount, 0);

    const disabled = setPluginEnabledState("acme.demo-plugin@1.0.0", false, {
      registryPath,
      now: () => new Date("2026-06-26T12:02:00.000Z"),
    });
    assert.equal(disabled.ok, true);
    assert.equal(getPluginStatusSummary({ registryPath }).enabledCount, 0);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("plugin unknown-id messages do not render unsafe values", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-plugin-unsafe-id-"));
  const registryPath = join(cwd, "registry.json");

  try {
    assert.equal(formatPluginIdForMessage("missing"), "missing");
    assert.equal(formatPluginIdForMessage("MISSING"), "missing");
    assert.equal(formatPluginIdForMessage("bad\u001b[31m"), "[invalid plugin id]");
    assert.equal(formatPluginIdForMessage("sk-or-v1-secret"), "[invalid plugin id]");

    const result = setPluginEnabledState("bad\u001b[31m", true, { registryPath });
    assert.equal(result.ok, false);
    assert.doesNotMatch(result.message, /\u001b|sk-or-v1/);
    assert.match(result.message, /Unknown plugin: \[invalid plugin id\]/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("plugin manifest rejection is clear and does not create registry records", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-plugin-reject-"));
  const registryPath = join(cwd, "registry.json");
  const manifestPath = join(cwd, "bad.json");
  writeFileSync(
    manifestPath,
    JSON.stringify({
      ...validManifest(),
      components: {
        skills: "../outside",
      },
    }),
  );

  try {
    assert.throws(
      () => registerPluginManifest(manifestPath, { registryPath }),
      /Invalid plugin manifest: components\.skills must not traverse outside the plugin directory/,
    );
    assert.equal(getPluginStatusSummary({ registryPath }).installedCount, 0);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("plugin manifest rejects credential-bearing repository URLs", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-plugin-credentials-"));
  const registryPath = join(cwd, "registry.json");
  const manifestPath = join(cwd, "bad.json");
  writeFileSync(
    manifestPath,
    JSON.stringify({
      ...validManifest(),
      source: {
        type: "git",
        repository: "https://user:secret@example.test/acme/plugin.git",
        ref: "v1.0.0",
      },
    }),
  );

  try {
    assert.throws(
      () => registerPluginManifest(manifestPath, { registryPath }),
      /source\.repository must not contain credentials/,
    );
    assert.equal(getPluginStatusSummary({ registryPath }).installedCount, 0);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("plugin manifest rejects git repository query strings and requires pinned commits", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-plugin-git-source-"));
  const registryPath = join(cwd, "registry.json");
  const secretManifestPath = join(cwd, "secret-url.json");
  const floatingManifestPath = join(cwd, "floating-ref.json");
  const pinnedManifestPath = join(cwd, "pinned-ref.json");
  writeFileSync(
    secretManifestPath,
    JSON.stringify({
      ...validManifest(),
      source: {
        type: "git",
        repository: "https://example.test/acme/plugin.git?access_token=sk-or-v1-secret",
        ref: "v1.0.0",
        resolvedCommit: "0123456789abcdef0123456789abcdef01234567",
      },
    }),
  );
  writeFileSync(
    floatingManifestPath,
    JSON.stringify({
      ...validManifest(),
      source: {
        type: "git",
        repository: "https://example.test/acme/plugin.git",
        ref: "main",
      },
    }),
  );
  writeFileSync(
    pinnedManifestPath,
    JSON.stringify({
      ...validManifest(),
      source: {
        type: "git",
        repository: "https://example.test/acme/plugin.git",
        ref: "v1.0.0",
        resolvedCommit: "0123456789abcdef0123456789abcdef01234567",
      },
    }),
  );

  try {
    assert.throws(
      () => registerPluginManifest(secretManifestPath, { registryPath }),
      /source\.repository must not contain secret-like values/,
    );
    assert.throws(
      () => registerPluginManifest(floatingManifestPath, { registryPath }),
      /source\.resolvedCommit is required for git sources/,
    );

    const result = registerPluginManifest(pinnedManifestPath, {
      registryPath,
      now: () => new Date("2026-06-26T12:00:00.000Z"),
    });
    assert.equal(result.ok, true);
    assert.equal(result.plugin?.lock.resolvedRef, "0123456789abcdef0123456789abcdef01234567");
    assert.doesNotMatch(readFileSync(registryPath, "utf8"), /sk-or-v1-secret|access_token/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("plugin manifest env permissions only store environment variable names", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-plugin-env-secret-"));
  const registryPath = join(cwd, "registry.json");
  const manifestPath = join(cwd, "bad.json");
  writeFileSync(
    manifestPath,
    JSON.stringify({
      ...validManifest(),
      permissions: {
        filesystem: [],
        network: [],
        env: ["sk-or-v1-secret-value"],
        mcp: [],
      },
    }),
  );

  try {
    assert.throws(
      () => registerPluginManifest(manifestPath, { registryPath }),
      /permissions\.env\[0\] must not contain secret-like values/,
    );
    assert.equal(getPluginStatusSummary({ registryPath }).installedCount, 0);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("plugin manifest rejects terminal control characters", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-plugin-control-char-"));
  const registryPath = join(cwd, "registry.json");
  const manifestPath = join(cwd, "bad.json");
  writeFileSync(
    manifestPath,
    JSON.stringify({
      ...validManifest(),
      description: "Demo\u001b[31m plugin.",
    }),
  );

  try {
    assert.throws(
      () => registerPluginManifest(manifestPath, { registryPath }),
      /description contains a control character/,
    );
    assert.equal(getPluginStatusSummary({ registryPath }).installedCount, 0);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("plugin component hashing is bounded for large local files", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-plugin-large-component-"));
  const registryPath = join(cwd, "registry.json");
  const manifestPath = join(cwd, "plugin.json");
  const largeFilePath = join(cwd, "large.bin");
  writeFileSync(largeFilePath, "");
  truncateSync(largeFilePath, 3 * 1024 * 1024);
  writeFileSync(
    manifestPath,
    JSON.stringify({
      ...validManifest(),
      components: {
        assets: "./large.bin",
      },
    }),
  );

  try {
    const result = registerPluginManifest(manifestPath, {
      registryPath,
      now: () => new Date("2026-06-26T12:00:00.000Z"),
    });
    const assetHash = result.plugin?.lock.componentHashes.assets;
    assert.equal(assetHash?.kind, "file");
    assert.equal(assetHash?.truncated, true);
    assert.equal(assetHash?.omittedBytes, 3 * 1024 * 1024);
    assert.match(assetHash?.hash ?? "", /^sha256:[a-f0-9]{64}$/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("plugin component hashing is bounded for deep local directories", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-plugin-deep-component-"));
  const registryPath = join(cwd, "registry.json");
  const manifestPath = join(cwd, "plugin.json");
  let current = join(cwd, "skills");
  mkdirSync(current, { recursive: true });
  for (let index = 0; index < 20; index += 1) {
    current = join(current, `level-${index}`);
    mkdirSync(current);
  }
  writeFileSync(join(current, "SKILL.md"), "# Too deep\n");
  writeFileSync(
    manifestPath,
    JSON.stringify({
      ...validManifest(),
      components: {
        skills: "./skills",
      },
    }),
  );

  try {
    const result = registerPluginManifest(manifestPath, {
      registryPath,
      now: () => new Date("2026-06-26T12:00:00.000Z"),
    });
    const skillsHash = result.plugin?.lock.componentHashes.skills;
    assert.equal(skillsHash?.kind, "directory");
    assert.equal(skillsHash?.truncated, true);
    assert.equal(skillsHash?.omittedEntries, 1);
    assert.match(skillsHash?.hash ?? "", /^sha256:[a-f0-9]{64}$/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("plugin registry drops poisoned display metadata from loaded state", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-plugin-poisoned-registry-"));
  const registryPath = join(cwd, "registry.json");
  writeFileSync(
    registryPath,
    JSON.stringify({
      version: 1,
      plugins: {
        "acme.demo-plugin@1.0.0": {
          id: "acme.demo-plugin@1.0.0",
          installed: true,
          enabled: true,
          manifest: validManifest(),
          manifestHash: ZERO_SHA256,
          registeredAt: "sk-or-v1-registered",
          updatedAt: "sk-or-v1-updated",
          lock: {
            source: {
              type: "local",
              path: ".",
              manifestPath: "/tmp/sk-or-v1-manifest",
            },
            resolvedRef: "sk-or-v1-ref",
            integrity: ZERO_SHA256,
            installedAt: "sk-or-v1-installed",
            componentHashes: {
              skills: {
                path: "sk-or-v1-path",
                kind: "file",
                hash: ZERO_SHA256,
              },
            },
          },
        },
      },
    }),
  );

  try {
    const plugin = loadPluginRegistry({ registryPath }).plugins["acme.demo-plugin@1.0.0"];
    assert.ok(plugin);
    const rendered = renderPluginInspect(plugin);
    assert.doesNotMatch(rendered, /sk-or-v1/);
    assert.match(rendered, /registered_at: 1970-01-01T00:00:00\.000Z/);
    assert.match(rendered, /updated_at: 1970-01-01T00:00:00\.000Z/);
    assert.match(rendered, /manifest_path: $/m);
    assert.match(rendered, /resolved_ref: none/);
    assert.match(rendered, /component_hashes:\n    - none_available/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("plugin registry drops terminal control characters from loaded display metadata", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-plugin-ansi-registry-"));
  const registryPath = join(cwd, "registry.json");
  writeFileSync(
    registryPath,
    JSON.stringify({
      version: 1,
      plugins: {
        "acme.demo-plugin@1.0.0": {
          id: "acme.demo-plugin@1.0.0",
          installed: true,
          enabled: true,
          manifest: validManifest(),
          manifestHash: ZERO_SHA256,
          registeredAt: "\u001b[31mregistered",
          updatedAt: "\u001b[31mupdated",
          lock: {
            source: {
              type: "local",
              path: ".",
              manifestPath: "\u001b[31m/tmp/plugin",
            },
            resolvedRef: "\u001b[31mref",
            integrity: ZERO_SHA256,
            installedAt: "\u001b[31minstalled",
            componentHashes: {
              skills: {
                path: "\u001b[31mskills",
                kind: "file",
                hash: ZERO_SHA256,
              },
            },
          },
        },
      },
    }),
  );

  try {
    const plugin = loadPluginRegistry({ registryPath }).plugins["acme.demo-plugin@1.0.0"];
    assert.ok(plugin);
    const rendered = renderPluginInspect(plugin);
    assert.doesNotMatch(rendered, /\u001b/);
    assert.match(rendered, /registered_at: 1970-01-01T00:00:00\.000Z/);
    assert.match(rendered, /manifest_path: $/m);
    assert.match(rendered, /component_hashes:\n    - none_available/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("plugin registry preserves existing override parent permissions", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-plugin-override-mode-"));
  const registryDirectory = join(cwd, "shared-state");
  const registryPath = join(registryDirectory, "plugins.json");
  const manifestPath = join(cwd, "plugin.json");
  mkdirSync(registryDirectory, { recursive: true });
  chmodSync(registryDirectory, 0o755);
  writeFileSync(manifestPath, JSON.stringify(validManifest()));

  try {
    registerPluginManifest(manifestPath, { registryPath });
    assert.equal(modeBits(cwd, "shared-state"), "755");
    assert.equal(modeBits(cwd, "shared-state/plugins.json"), "600");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("plugin cache path supports registry-derived and environment overrides", () => {
  assert.equal(
    resolvePluginCacheDirectory({
      registryPath: "/tmp/orx/plugins/registry.json",
    }),
    "/tmp/orx/plugins/cache",
  );
  assert.equal(
    resolvePluginCacheDirectory({
      env: { ORX_PLUGIN_CACHE_DIR: "plugin-cache" },
      cwd: "/tmp/orx",
      registryPath: "/tmp/orx/plugins/registry.json",
    }),
    "/tmp/orx/plugin-cache",
  );
});

test("resolvePluginRegistryPath supports ORX_PLUGIN_REGISTRY_PATH overrides", () => {
  assert.equal(
    resolvePluginRegistryPath({
      env: { ORX_PLUGIN_REGISTRY_PATH: "state/plugins.json" },
      cwd: "/tmp/orx",
    }),
    "/tmp/orx/state/plugins.json",
  );
});

function validManifest(): Record<string, unknown> {
  return {
    schemaVersion: "1",
    name: "demo-plugin",
    version: "1.0.0",
    description: "Demo plugin.",
    publisher: "acme",
    source: {
      type: "local",
      path: ".",
    },
    components: {},
    permissions: {
      filesystem: [],
      network: [],
      env: [],
      mcp: [],
    },
  };
}

function modeBits(root: string, relativePath: string): string {
  return (statSync(join(root, relativePath)).mode & 0o777).toString(8);
}
