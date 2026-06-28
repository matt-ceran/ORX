import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parsePluginScaffoldArgs,
  renderPluginValidation,
  scaffoldPlugin,
  validatePluginManifestInput,
} from "./index.js";

test("validatePluginManifestInput previews a scaffolded plugin without side effects", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-plugin-validate-"));

  try {
    const scaffold = scaffoldPlugin(
      parsePluginScaffoldArgs(
        ["hook-plugin", "--name", "hook-plugin", "--publisher", "acme", "--with", "hooks"],
        cwd,
      ),
    );
    const result = validatePluginManifestInput(scaffold.targetDirectory);
    assert.equal(result.pluginId, "acme.hook-plugin@0.1.0");
    assert.equal(result.ok, true);
    assert.equal(result.warnings.length, 0);
    assert.deepEqual(
      result.components.map((component) => [component.key, component.status]),
      [
        ["commands", "present"],
        ["hooks", "present"],
        ["rules", "present"],
        ["skills", "present"],
      ],
    );

    const rendered = renderPluginValidation(result);
    assert.match(rendered, /Plugin validation: acme\.hook-plugin@0\.1\.0/);
    assert.match(rendered, /registry_state: unchanged/);
    assert.match(rendered, /execution_state: no install, enable, trust, grant, fetch, or execution performed/);
    assert.match(rendered, /hooks: present file hooks\/hooks\.json sha256:[a-f0-9]{64}/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("validatePluginManifestInput warns about declared components that will not be cached", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-plugin-validate-missing-"));
  const manifestPath = join(cwd, "orx-plugin.json");
  writeFileSync(
    manifestPath,
    JSON.stringify({
      schemaVersion: "1",
      name: "missing-plugin",
      version: "1.0.0",
      description: "Plugin with a missing declared component.",
      publisher: "acme",
      source: {
        type: "local",
        path: ".",
      },
      components: {
        skills: "./skills",
      },
      permissions: {
        filesystem: [],
        network: [],
        env: [],
        mcp: [],
      },
    }),
  );

  try {
    const result = validatePluginManifestInput(manifestPath);
    assert.equal(result.pluginId, "acme.missing-plugin@1.0.0");
    assert.deepEqual(result.components.map((component) => component.status), ["missing"]);
    assert.deepEqual(result.warnings, [
      "components.skills path does not exist and will not be cached.",
    ]);
    assert.doesNotMatch(readFileSync(manifestPath, "utf8"), /registry/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("validatePluginManifestInput rejects invalid manifests clearly", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-plugin-validate-invalid-"));
  const manifestPath = join(cwd, "orx-plugin.json");
  mkdirSync(cwd, { recursive: true });
  writeFileSync(manifestPath, "{not-json");

  try {
    assert.throws(
      () => validatePluginManifestInput(cwd),
      /Invalid plugin manifest: invalid JSON/,
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
