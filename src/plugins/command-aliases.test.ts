import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

    assert.equal(untrusted.aliases.length, 2);
    assert.equal(untrusted.promptAliasCount, 1);
    assert.equal(untrusted.binAliasCount, 1);
    assert.equal(untrusted.aliases.find((alias) => alias.alias === promptAlias)?.state, "activate_prompt");
    assert.equal(untrusted.aliases.find((alias) => alias.alias === binAlias)?.state, "untrusted");
    assert.match(rendered, /Plugin Commands/);
    assert.match(rendered, /alias=\/plugin:acme\.alias-plugin@1\.0\.0:command:review-prompt/);
    assert.match(rendered, /alias=\/plugin:acme\.alias-plugin@1\.0\.0:bin:hello/);
    assert.match(rendered, /usage: \/plugin:<plugin-id>:command:<slug>/);

    trustPluginBin(binId, { registryPath, configPath: binsConfigPath });
    const trusted = discoverEnabledPluginCommandAliases({ registryPath, binsConfigPath });
    assert.equal(trusted.aliases.find((alias) => alias.alias === binAlias)?.state, "trusted");
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
