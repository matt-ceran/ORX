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
  discoverEnabledPluginBins,
  getPluginBinTrustSummary,
  loadPluginBinsTrustConfig,
  registerPluginManifest,
  renderPluginBinInspect,
  renderPluginBinRunResult,
  renderPluginBins,
  runPluginBin,
  setPluginEnabledState,
  trustPluginBin,
  untrustPluginBin,
} from "./index.js";

test("plugin bins discover from enabled cached manifests and render trust state", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-plugin-bins-"));
  const registryPath = join(cwd, "plugins", "registry.json");
  const binsConfigPath = join(cwd, "state", "bins.json");
  const manifestPath = writeBinPluginFixture(cwd);

  try {
    registerPluginManifest(manifestPath, { registryPath });
    assert.equal(discoverEnabledPluginBins({ registryPath }).bins.length, 0);

    setPluginEnabledState("acme.bin-plugin@1.0.0", true, { registryPath });
    const discovery = discoverEnabledPluginBins({ registryPath });
    const bin = discovery.bins[0];
    const rendered = renderPluginBins(discovery, { configPath: binsConfigPath });

    assert.equal(discovery.bins.length, 1);
    assert.equal(bin.id, "plugin:acme.bin-plugin@1.0.0:bin:greet");
    assert.equal(bin.binId, "greet");
    assert.equal(bin.runner.kind, "sh");
    assert.deepEqual(bin.env, ["PLUGIN_TOKEN"]);
    assert.match(bin.binHash, /^sha256:[a-f0-9]{64}$/);
    assert.match(bin.componentHash, /^sha256:[a-f0-9]{64}$/);
    assert.match(rendered, /Bins/);
    assert.match(rendered, /execution: explicit_trusted_operator_run/);
    assert.match(rendered, /trusted=no/);
    assert.match(rendered, /runner=sh/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("plugin bin runner blocks untrusted bins and executes trusted bins with declared env and audit", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-plugin-bin-run-"));
  const registryPath = join(cwd, "plugins", "registry.json");
  const binsConfigPath = join(cwd, "state", "bins.json");
  const auditLogPath = join(cwd, "audit", "bins.jsonl");
  const secretValue = "hide-bin-secret-12345";
  const manifestPath = writeBinPluginFixture(cwd, {
    greet: "printf 'arg1=%s\\n' \"$1\"\nprintf 'secret=%s\\n' \"$PLUGIN_TOKEN\" >&2\n",
  });
  const binId = "plugin:acme.bin-plugin@1.0.0:bin:greet";

  try {
    registerPluginManifest(manifestPath, { registryPath });
    setPluginEnabledState("acme.bin-plugin@1.0.0", true, { registryPath });

    const blocked = await runPluginBin(binId, ["visible-arg"], {
      auditLogPath,
      configPath: binsConfigPath,
      env: { PLUGIN_TOKEN: secretValue },
      registryPath,
    });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.executed, false);
    assert.equal(blocked.status, "untrusted");

    trustPluginBin(binId, { registryPath, configPath: binsConfigPath });
    const result = await runPluginBin(binId, ["visible-arg"], {
      auditLogPath,
      configPath: binsConfigPath,
      env: { PLUGIN_TOKEN: secretValue, UNDECLARED_VALUE: "ignored" },
      registryPath,
      now: () => new Date("2026-06-28T15:30:00.000Z"),
    });
    const rendered = renderPluginBinRunResult(result);

    assert.equal(result.ok, true);
    assert.equal(result.executed, true);
    assert.equal(result.status, "ok");
    assert.equal(result.argCount, 1);
    assert.deepEqual(result.envNames, ["PLUGIN_TOKEN"]);
    assert.match(result.stdout ?? "", /arg1=visible-arg/);
    assert.doesNotMatch(result.stderr ?? "", new RegExp(secretValue));
    assert.match(result.stderr ?? "", /\[redacted-env:PLUGIN_TOKEN\]/);
    assert.match(rendered, /Bin run: plugin:acme\.bin-plugin@1\.0\.0:bin:greet/);
    assert.match(rendered, /status: ok/);
    assert.match(rendered, /arg_count: 1/);
    assert.equal(statSync(dirname(auditLogPath)).mode & 0o777, 0o700);
    assert.equal(statSync(auditLogPath).mode & 0o777, 0o600);

    const auditLog = readFileSync(auditLogPath, "utf8");
    assert.match(auditLog, /"type":"plugin.bin.run"/);
    assert.match(auditLog, /"status":"untrusted"/);
    assert.match(auditLog, /"status":"ok"/);
    assert.match(auditLog, /"argCount":1/);
    assert.doesNotMatch(auditLog, /visible-arg/);
    assert.match(auditLog, /\[redacted-arg:1\]/);
    assert.doesNotMatch(auditLog, new RegExp(secretValue));
    assert.doesNotMatch(auditLog, /UNDECLARED_VALUE/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("plugin bin trust persists hashes privately and detects changed cached files", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-plugin-bin-trust-"));
  const registryPath = join(cwd, "plugins", "registry.json");
  const binsConfigPath = join(cwd, "state", "bins.json");
  const auditLogPath = join(cwd, "audit", "bins.jsonl");
  const manifestPath = writeBinPluginFixture(cwd);
  const binId = "plugin:acme.bin-plugin@1.0.0:bin:greet";

  try {
    registerPluginManifest(manifestPath, { registryPath });
    setPluginEnabledState("acme.bin-plugin@1.0.0", true, { registryPath });
    const trusted = trustPluginBin(binId, {
      registryPath,
      configPath: binsConfigPath,
      now: () => new Date("2026-06-28T15:00:00.000Z"),
    });

    assert.equal(trusted.ok, true);
    assert.equal(getPluginBinTrustSummary({ registryPath, configPath: binsConfigPath }).trustedCount, 1);
    assert.equal(statSync(dirname(binsConfigPath)).mode & 0o777, 0o700);
    assert.equal(statSync(binsConfigPath).mode & 0o777, 0o600);
    assert.deepEqual(Object.keys(loadPluginBinsTrustConfig({ configPath: binsConfigPath }).bins), [
      binId,
    ]);

    const pluginRoot = dirname(
      readPluginRegistryManifestPath(registryPath, "acme.bin-plugin@1.0.0"),
    );
    writeFileSync(join(pluginRoot, "bin", "greet"), "printf 'changed\\n'\n");

    const summary = getPluginBinTrustSummary({ registryPath, configPath: binsConfigPath });
    const bin = discoverEnabledPluginBins({ registryPath }).bins[0];
    const inspected = renderPluginBinInspect(bin, { configPath: binsConfigPath });
    const blocked = await runPluginBin(binId, [], {
      auditLogPath,
      configPath: binsConfigPath,
      registryPath,
    });

    assert.equal(summary.trustedCount, 0);
    assert.equal(summary.pendingTrustCount, 1);
    assert.match(inspected, /trust_status: pending_hash_change/);
    assert.equal(blocked.status, "pending_hash_change");

    const untrusted = untrustPluginBin(binId, { configPath: binsConfigPath });
    assert.equal(untrusted.ok, true);
    assert.equal(getPluginBinTrustSummary({ registryPath, configPath: binsConfigPath }).pendingTrustCount, 0);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("plugin bin hashes include nested cached helpers before execution", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-plugin-bin-helper-hash-"));
  const registryPath = join(cwd, "plugins", "registry.json");
  const binsConfigPath = join(cwd, "state", "bins.json");
  const auditLogPath = join(cwd, "audit", "bins.jsonl");
  const manifestPath = writeBinPluginFixture(cwd, {
    greet: "sh ./bin/helpers/helper.sh\n",
    "helpers/helper.sh": "printf 'original helper\\n'\n",
  });
  const binId = "plugin:acme.bin-plugin@1.0.0:bin:greet";

  try {
    registerPluginManifest(manifestPath, { registryPath });
    setPluginEnabledState("acme.bin-plugin@1.0.0", true, { registryPath });
    trustPluginBin(binId, { registryPath, configPath: binsConfigPath });

    const pluginRoot = dirname(
      readPluginRegistryManifestPath(registryPath, "acme.bin-plugin@1.0.0"),
    );
    writeFileSync(
      join(pluginRoot, "bin", "helpers", "helper.sh"),
      "printf 'changed helper\\n'\ntouch ./should-not-run\n",
    );

    const blocked = await runPluginBin(binId, [], {
      auditLogPath,
      configPath: binsConfigPath,
      registryPath,
    });

    assert.equal(blocked.ok, false);
    assert.equal(blocked.executed, false);
    assert.equal(blocked.status, "pending_hash_change");
    assert.throws(() => statSync(join(pluginRoot, "should-not-run")));
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("plugin bin discovery rejects arbitrary shebang interpreters outside the trusted runner set", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-plugin-bin-shebang-"));
  const registryPath = join(cwd, "plugins", "registry.json");
  const manifestPath = writeBinPluginFixture(cwd, {
    external: `#!${join(cwd, "external-runner")}\nprintf 'external\\n'\n`,
  });

  try {
    registerPluginManifest(manifestPath, { registryPath });
    setPluginEnabledState("acme.bin-plugin@1.0.0", true, { registryPath });

    const discovery = discoverEnabledPluginBins({ registryPath });

    assert.equal(discovery.bins.length, 0);
    assert.equal(discovery.omissions.length, 1);
    assert.equal(discovery.omissions[0].path, "bin/external");
    assert.match(discovery.omissions[0].reason, /shebang interpreter is not supported/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

function writeBinPluginFixture(
  cwd: string,
  binFiles: Record<string, string> = {
    greet: "printf 'hello from bin\\n'\n",
  },
): string {
  const pluginDirectory = join(cwd, "plugin");
  const manifestPath = join(pluginDirectory, "orx-plugin.json");
  const binDirectory = join(pluginDirectory, "bin");
  mkdirSync(binDirectory, { recursive: true });
  for (const [name, content] of Object.entries(binFiles)) {
    const binPath = join(binDirectory, name);
    mkdirSync(dirname(binPath), { recursive: true });
    writeFileSync(binPath, content);
  }
  writeFileSync(
    manifestPath,
    JSON.stringify({
      schemaVersion: "1",
      name: "bin-plugin",
      version: "1.0.0",
      description: "Declares executable bin files.",
      publisher: "acme",
      source: {
        type: "local",
        path: ".",
      },
      components: {
        bins: "./bin",
      },
      permissions: {
        filesystem: [],
        network: [],
        env: ["PLUGIN_TOKEN"],
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
