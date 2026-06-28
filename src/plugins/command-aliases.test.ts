import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  discoverEnabledPluginCommandAliases,
  registerPluginManifest,
  renderPluginCommandAliases,
  setPluginEnabledState,
  trustPluginBin,
} from "./index.js";

test("plugin command aliases derive from enabled prompt and bin surfaces", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-plugin-command-aliases-"));
  const registryPath = join(cwd, "plugins", "registry.json");
  const binsConfigPath = join(cwd, "state", "bins.json");
  const manifestPath = writeCommandAliasFixture(cwd);
  const promptAlias = "/plugin:acme.alias-plugin@1.0.0:command:review-prompt";
  const binAlias = "/plugin:acme.alias-plugin@1.0.0:bin:hello";
  const execAlias = "/plugin:acme.alias-plugin@1.0.0:exec:greet";
  const binId = "plugin:acme.alias-plugin@1.0.0:bin:hello";

  try {
    registerPluginManifest(manifestPath, { registryPath });
    assert.equal(
      discoverEnabledPluginCommandAliases({ registryPath, binsConfigPath }).aliases.length,
      0,
    );

    setPluginEnabledState("acme.alias-plugin@1.0.0", true, { registryPath });
    const untrusted = discoverEnabledPluginCommandAliases({ registryPath, binsConfigPath });
    const rendered = renderPluginCommandAliases(untrusted);

    assert.equal(untrusted.aliases.length, 3);
    assert.equal(untrusted.promptAliasCount, 1);
    assert.equal(untrusted.binAliasCount, 1);
    assert.equal(untrusted.execAliasCount, 1);
    assert.equal(untrusted.aliases.find((alias) => alias.alias === promptAlias)?.state, "activate_prompt");
    assert.equal(untrusted.aliases.find((alias) => alias.alias === binAlias)?.state, "untrusted");
    const untrustedExec = untrusted.aliases.find((alias) => alias.alias === execAlias);
    assert.equal(untrustedExec?.kind, "exec");
    assert.equal(untrustedExec?.state, "untrusted");
    assert.equal(untrustedExec?.targetId, binId);
    assert.equal(untrustedExec?.maxArgs, 2);
    assert.match(rendered, /Plugin Commands/);
    assert.match(rendered, /alias=\/plugin:acme\.alias-plugin@1\.0\.0:command:review-prompt/);
    assert.match(rendered, /alias=\/plugin:acme\.alias-plugin@1\.0\.0:bin:hello/);
    assert.match(rendered, /alias=\/plugin:acme\.alias-plugin@1\.0\.0:exec:greet/);
    assert.match(rendered, /exec_aliases: 1/);
    assert.match(rendered, /max_args=2/);
    assert.match(rendered, /usage: \/plugin:<plugin-id>:command:<slug>/);

    trustPluginBin(binId, { registryPath, configPath: binsConfigPath });
    const trusted = discoverEnabledPluginCommandAliases({ registryPath, binsConfigPath });
    assert.equal(trusted.aliases.find((alias) => alias.alias === binAlias)?.state, "trusted");
    assert.equal(trusted.aliases.find((alias) => alias.alias === execAlias)?.state, "trusted");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("plugin executable command aliases surface missing bins and omit unsafe schema entries", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-plugin-exec-command-aliases-"));
  const registryPath = join(cwd, "plugins", "registry.json");
  const manifestPath = writeExecutableCommandAliasFixture(cwd);
  const execAlias = "/plugin:acme.exec-plugin@1.0.0:exec:missing";

  try {
    registerPluginManifest(manifestPath, { registryPath });
    setPluginEnabledState("acme.exec-plugin@1.0.0", true, { registryPath });

    const discovery = discoverEnabledPluginCommandAliases({ registryPath });
    const alias = discovery.aliases.find((candidate) => candidate.alias === execAlias);
    assert.equal(discovery.execAliasCount, 1);
    assert.equal(alias?.kind, "exec");
    assert.equal(alias?.state, "missing_bin");
    assert.equal(alias?.targetId, "plugin:acme.exec-plugin@1.0.0:bin:absent");
    assert.match(discovery.omissions.map((omission) => omission.reason).join("\n"), /secret-like values/);

    const rendered = renderPluginCommandAliases(discovery);
    assert.match(rendered, /alias=\/plugin:acme\.exec-plugin@1\.0\.0:exec:missing/);
    assert.match(rendered, /state=missing_bin/);
    assert.doesNotMatch(rendered, /sk-or-v1-secretvalue/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("plugin executable command schemas do not follow symlink escapes from cached snapshots", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-plugin-exec-symlink-"));
  const registryPath = join(cwd, "plugins", "registry.json");
  const manifestPath = writeExecutableCommandAliasFixture(cwd);

  try {
    const result = registerPluginManifest(manifestPath, { registryPath });
    assert.equal(result.ok, true);
    setPluginEnabledState("acme.exec-plugin@1.0.0", true, { registryPath });

    const registry = JSON.parse(readFileSync(registryPath, "utf8")) as {
      plugins: Record<string, { lock: { source: { manifestPath: string } } }>;
    };
    const cachedManifestPath = registry.plugins["acme.exec-plugin@1.0.0"].lock.source.manifestPath;
    const cacheRoot = dirname(cachedManifestPath);
    const outsideDirectory = join(cwd, "outside");
    mkdirSync(outsideDirectory, { recursive: true });
    writeFileSync(
      join(outsideDirectory, "command-schemas.json"),
      JSON.stringify({
        commands: {
          outside: {
            name: "Outside",
            bin: "absent",
          },
        },
      }),
    );
    unlinkSync(join(cacheRoot, "command-schemas.json"));
    symlinkSync(outsideDirectory, join(cacheRoot, "command-schemas.json"));

    const discovery = discoverEnabledPluginCommandAliases({ registryPath });
    assert.equal(discovery.execAliasCount, 0);
    assert.match(
      discovery.omissions.map((omission) => omission.reason).join("\n"),
      /escapes plugin directory through symlinks/,
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

function writeCommandAliasFixture(cwd: string): string {
  const pluginDirectory = join(cwd, "plugin");
  const manifestPath = join(pluginDirectory, "orx-plugin.json");
  mkdirSync(join(pluginDirectory, "commands"), { recursive: true });
  mkdirSync(join(pluginDirectory, "bin"), { recursive: true });
  writeFileSync(
    join(pluginDirectory, "commands", "review.md"),
    [
      "---",
      "name: Review Prompt",
      "description: Review prompt metadata.",
      "---",
      "FULL REVIEW PROMPT",
      "",
    ].join("\n"),
  );
  writeFileSync(join(pluginDirectory, "bin", "hello"), "printf 'hello=%s\\n' \"$1\"\n");
  writeFileSync(
    join(pluginDirectory, "command-schemas.json"),
    JSON.stringify({
      commands: {
        greet: {
          name: "Greet",
          description: "Run the greeting bin with bounded args.",
          bin: "hello",
          usage: "/plugin:acme.alias-plugin@1.0.0:exec:greet [name]",
          maxArgs: 2,
        },
      },
    }),
  );
  writeFileSync(
    manifestPath,
    JSON.stringify({
      schemaVersion: "1",
      name: "alias-plugin",
      version: "1.0.0",
      description: "Declares prompt and bin aliases.",
      publisher: "acme",
      source: {
        type: "local",
        path: ".",
      },
      components: {
        commands: "./commands",
        commandSchemas: "./command-schemas.json",
        bins: "./bin",
      },
      permissions: {
        filesystem: [],
        network: [],
        env: [],
        mcp: [],
      },
    }),
  );
  return manifestPath;
}

function writeExecutableCommandAliasFixture(cwd: string): string {
  const pluginDirectory = join(cwd, "exec-plugin");
  const manifestPath = join(pluginDirectory, "orx-plugin.json");
  mkdirSync(pluginDirectory, { recursive: true });
  writeFileSync(
    join(pluginDirectory, "command-schemas.json"),
    JSON.stringify({
      commands: {
        missing: {
          name: "Missing",
          description: "References a bin that is not declared.",
          bin: "absent",
          maxArgs: 0,
        },
        unsafe: {
          name: "Unsafe",
          description: "contains sk-or-v1-secretvalue",
          bin: "absent",
        },
      },
    }),
  );
  writeFileSync(
    manifestPath,
    JSON.stringify({
      schemaVersion: "1",
      name: "exec-plugin",
      version: "1.0.0",
      description: "Declares executable command aliases.",
      publisher: "acme",
      source: {
        type: "local",
        path: ".",
      },
      components: {
        commandSchemas: "./command-schemas.json",
      },
      permissions: {
        filesystem: [],
        network: [],
        env: [],
        mcp: [],
      },
    }),
  );
  return manifestPath;
}
