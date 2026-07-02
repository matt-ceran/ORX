import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parsePluginScaffoldArgs,
  parsePluginValidationArgs,
  renderPluginValidation,
  renderPluginValidationJson,
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

    const json = JSON.parse(renderPluginValidationJson(result));
    assert.equal(json.schema_version, 1);
    assert.equal(json.surface, "orx.plugin_validation");
    assert.equal(json.ok, true);
    assert.equal(json.operator_only, true);
    assert.equal(json.model_tool, "none");
    assert.equal(json.execution, "none");
    assert.equal(json.network, "none");
    assert.equal(json.data_state_writes, "none");
    assert.equal(json.plugin_id, "acme.hook-plugin@0.1.0");
    assert.equal(json.manifest_path, result.manifestPath);
    assert.equal(json.manifest_hash, result.manifestHash);
    assert.equal(json.manifest.name, "hook-plugin");
    assert.equal(json.manifest.publisher, "acme");
    assert.deepEqual(json.source, {
      type: "local",
      path: ".",
    });
    assert.equal(json.component_count, 4);
    assert.deepEqual(
      json.components.map((component: { key: string; status: string; hash?: { kind: string } }) => [
        component.key,
        component.status,
        component.hash?.kind,
      ]),
      [
        ["commands", "present", "directory"],
        ["hooks", "present", "file"],
        ["rules", "present", "directory"],
        ["skills", "present", "directory"],
      ],
    );
    assert.deepEqual(json.permissions.counts, {
      filesystem: 0,
      network: 0,
      env: 0,
      mcp: 0,
    });
    assert.equal(json.warning_count, 0);
    assert.deepEqual(json.warnings, []);
    assert.equal(json.authority.validation_side_effects, "none");
    assert.equal(json.authority.registry_cache_catalog_trust_state, "unchanged");
    assert.equal(json.authority.install_enable_trust_grant_fetch_execute, "not_performed");
    assert.equal(json.usage, "orx plugins validate <manifest-path-or-directory> [--json]");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("parsePluginValidationArgs accepts only a manifest input plus optional trailing json", () => {
  assert.deepEqual(parsePluginValidationArgs(["validate", "plugin"]), {
    input: "plugin",
    json: false,
  });
  assert.deepEqual(parsePluginValidationArgs(["validate", "plugin path", "--json"]), {
    input: "plugin path",
    json: true,
  });
  assert.deepEqual(parsePluginValidationArgs(["validate", "plugin", "path", "--json"]), {
    input: "plugin path",
    json: true,
  });
  assert.equal(parsePluginValidationArgs(["validate"]), undefined);
  assert.equal(parsePluginValidationArgs(["validate", "--json"]), undefined);
  assert.equal(parsePluginValidationArgs(["validate", "plugin", "--json", "extra"]), undefined);
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
