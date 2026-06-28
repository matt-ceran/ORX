import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadPluginCatalog,
  renderPluginCatalog,
  resolvePluginCatalogPath,
  resolvePluginInstallTarget,
} from "./index.js";

test("plugin catalog loads sanitized entries and resolves relative manifest paths", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-plugin-catalog-"));
  const catalogDirectory = join(cwd, "catalog");
  const pluginDirectory = join(cwd, "plugins", "demo");
  const catalogPath = join(catalogDirectory, "catalog.json");
  const manifestPath = join(pluginDirectory, "orx-plugin.json");
  mkdirSync(catalogDirectory, { recursive: true });
  mkdirSync(pluginDirectory, { recursive: true });
  writeFileSync(manifestPath, "{}");
  writeFileSync(
    catalogPath,
    JSON.stringify({
      version: 1,
      entries: [
        {
          id: "acme.demo-plugin@1.0.0",
          description: "Demo catalog entry.",
          manifestPath: "../plugins/demo/orx-plugin.json",
          tags: ["demo", "safe", "demo", "bad\u001btag"],
          ignoredSecret: "sk-or-v1-secret",
        },
        {
          id: "bad\u001b[31m",
          description: "Unsafe id.",
          manifestPath: "../bad/orx-plugin.json",
        },
        {
          id: "acme.secret-plugin@1.0.0",
          description: "sk-or-v1-secret",
          manifestPath: "../secret/orx-plugin.json",
        },
        {
          id: "acme.bearer-plugin@1.0.0",
          description: "Authorization: Bearer abc123token",
          manifestPath: "../bearer/orx-plugin.json",
        },
        {
          id: "acme.query-plugin@1.0.0",
          description: "Query token plugin.",
          manifestPath: "../query/orx-plugin.json?token=abc123",
        },
      ],
    }),
  );

  try {
    const catalog = loadPluginCatalog({ catalogPath });
    assert.equal(catalog.path, catalogPath);
    assert.equal(catalog.entries.length, 1);
    assert.equal(catalog.entries[0].id, "acme.demo-plugin@1.0.0");
    assert.equal(catalog.entries[0].publisher, "acme");
    assert.equal(catalog.entries[0].name, "demo-plugin");
    assert.equal(catalog.entries[0].version, "1.0.0");
    assert.deepEqual(catalog.entries[0].tags, ["demo", "safe"]);

    const rendered = renderPluginCatalog(catalog);
    assert.match(rendered, /Plugin Catalog/);
    assert.match(rendered, /entries: 1/);
    assert.match(rendered, /id=acme\.demo-plugin@1\.0\.0/);
    assert.doesNotMatch(rendered, /sk-or-v1-secret|\u001b|Bearer|token=/i);

    const target = resolvePluginInstallTarget("acme.demo-plugin@1.0.0", { catalogPath });
    assert.equal(target.manifestPath, manifestPath);
    assert.equal(target.catalogEntry?.id, "acme.demo-plugin@1.0.0");

    const directTarget = resolvePluginInstallTarget("./plugin.json", { cwd });
    assert.equal(directTarget.manifestPath, join(cwd, "plugin.json"));
    assert.equal(directTarget.catalogEntry, undefined);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("plugin catalog path supports environment overrides", () => {
  assert.equal(
    resolvePluginCatalogPath({
      env: { ORX_PLUGIN_CATALOG_PATH: "plugins/catalog.json" },
      cwd: "/tmp/orx",
    }),
    "/tmp/orx/plugins/catalog.json",
  );
});
