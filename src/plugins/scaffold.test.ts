import test from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  discoverEnabledPluginBins,
  discoverEnabledPluginCommandAliases,
  discoverEnabledPluginHooks,
  discoverEnabledPluginMcpProfiles,
  loadPluginRegistry,
  parsePluginScaffoldArgs,
  registerPluginManifest,
  scaffoldPlugin,
  setPluginEnabledState,
  renderPluginScaffoldResult,
} from "./index.js";

test("scaffoldPlugin creates a valid inert default plugin bundle", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-plugin-scaffold-"));
  const targetDirectory = join(cwd, "demo-plugin");
  const registryPath = join(cwd, "state", "registry.json");

  try {
    const result = scaffoldPlugin({
      cwd,
      targetDirectory: "demo-plugin",
      name: "daily-tools",
      publisher: "acme",
      description: "Daily local tools.",
    });

    assert.equal(result.pluginId, "acme.daily-tools@0.1.0");
    assert.equal(result.targetDirectory, targetDirectory);
    assert.deepEqual(result.components, ["skills", "commands", "rules"]);
    assert.equal(existsSync(join(targetDirectory, "orx-plugin.json")), true);
    assert.equal(existsSync(join(targetDirectory, "skills", "SKILL.md")), true);
    assert.equal(existsSync(join(targetDirectory, "commands", "example.md")), true);
    assert.equal(existsSync(join(targetDirectory, "rules", "example.md")), true);
    assert.equal(existsSync(join(targetDirectory, "hooks")), false);
    assert.equal(existsSync(join(targetDirectory, "bin")), false);
    assert.equal(existsSync(join(targetDirectory, "mcp.json")), false);

    const manifest = JSON.parse(readFileSync(result.manifestPath, "utf8")) as {
      components: Record<string, string>;
      permissions: Record<string, string[]>;
    };
    assert.deepEqual(Object.keys(manifest.components).sort(), ["commands", "rules", "skills"]);
    assert.deepEqual(manifest.permissions, { filesystem: [], network: [], env: [], mcp: [] });
    const rendered = renderPluginScaffoldResult(result);
    assert.match(rendered, new RegExp(`review ${escapeRegExp(result.manifestPath)}`));
    assert.match(rendered, new RegExp(`orx plugins validate ${escapeRegExp(targetDirectory)}`));
    assert.match(rendered, new RegExp(`orx plugins install ${escapeRegExp(targetDirectory)}`));
    assert.doesNotMatch(rendered, new RegExp(`orx plugins validate ${escapeRegExp(result.manifestPath)}`));
    assert.doesNotMatch(rendered, new RegExp(`orx plugins install ${escapeRegExp(result.manifestPath)}`));

    const registered = registerPluginManifest(result.manifestPath, { registryPath });
    assert.equal(registered.ok, true);
    assert.equal(registered.plugin?.enabled, false);
    assert.equal(loadPluginRegistry({ registryPath }).plugins["acme.daily-tools@0.1.0"].enabled, false);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("scaffoldPlugin opt-in integration placeholders expose no runnable entries", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-plugin-scaffold-integrations-"));
  const registryPath = join(cwd, "registry.json");

  try {
    const options = parsePluginScaffoldArgs(
      [
        "full-plugin",
        "--name",
        "full-plugin",
        "--publisher",
        "acme",
        "--with",
        "hooks,bins,mcp,command-schemas,assets,docs",
      ],
      cwd,
    );
    const result = scaffoldPlugin(options);
    assert.deepEqual(result.components, [
      "skills",
      "commands",
      "commandSchemas",
      "rules",
      "hooks",
      "mcpServers",
      "bins",
      "assets",
      "docs",
    ]);
    assert.equal(existsSync(join(result.targetDirectory, "skills", "SKILL.md")), true);
    assert.equal(existsSync(join(result.targetDirectory, "commands", "example.md")), true);
    assert.equal(existsSync(join(result.targetDirectory, "rules", "example.md")), true);
    assert.equal(readFileSync(join(result.targetDirectory, "hooks", "hooks.json"), "utf8"), '{\n  "hooks": {}\n}\n');
    assert.equal(readFileSync(join(result.targetDirectory, "mcp.json"), "utf8"), '{\n  "servers": {}\n}\n');
    assert.equal(readFileSync(join(result.targetDirectory, "command-schemas.json"), "utf8"), '{\n  "commands": {}\n}\n');
    assert.deepEqual(readdirSync(join(result.targetDirectory, "bin")), []);

    registerPluginManifest(result.manifestPath, { registryPath });
    setPluginEnabledState("acme.full-plugin@0.1.0", true, { registryPath });
    assert.equal(discoverEnabledPluginHooks({ registryPath }).hooks.length, 0);
    assert.equal(discoverEnabledPluginBins({ registryPath }).bins.length, 0);
    assert.equal(discoverEnabledPluginMcpProfiles({ registryPath }).profiles.length, 0);
    assert.equal(
      discoverEnabledPluginCommandAliases({ registryPath }).aliases.filter(
        (alias) => alias.kind === "exec",
      ).length,
      0,
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("scaffoldPlugin minimal mode is the only manifest-only scaffold path", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-plugin-scaffold-minimal-"));

  try {
    const result = scaffoldPlugin(
      parsePluginScaffoldArgs(
        ["minimal-plugin", "--name", "minimal-plugin", "--publisher", "acme", "--minimal"],
        cwd,
      ),
    );
    assert.deepEqual(result.components, []);
    assert.deepEqual(readdirSync(result.targetDirectory).sort(), ["orx-plugin.json"]);

    assert.throws(
      () => parsePluginScaffoldArgs(["bad-plugin", "--minimal", "--with", "hooks"], cwd),
      /either --minimal or --with/,
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("scaffoldPlugin refuses existing non-empty targets and unsafe option values", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-plugin-scaffold-refuse-"));
  const targetDirectory = join(cwd, "plugin");
  mkdirSync(targetDirectory, { recursive: true });
  writeFileSync(join(targetDirectory, "existing.txt"), "keep me");

  try {
    assert.throws(
      () => scaffoldPlugin({ cwd, targetDirectory: "plugin" }),
      /target directory must be empty/,
    );
    assert.throws(
      () => scaffoldPlugin({ cwd, targetDirectory: "safe", name: "Bad Name" }),
      /name must use lowercase/,
    );
    assert.throws(
      () => parsePluginScaffoldArgs(["safe", "--with", "unknown"], cwd),
      /Unknown scaffold component/,
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
