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
        {
          id: "acme.git-plugin@1.0.0",
          description: "Git catalog entry.",
          source: {
            type: "git",
            repository: "https://example.test/acme/git-plugin.git",
            ref: "main",
            resolvedCommit: "0123456789abcdef0123456789abcdef01234567",
            manifestPath: "./orx-plugin.json",
          },
          tags: ["git"],
        },
        {
          id: "acme.git-secret@1.0.0",
          description: "Git secret catalog entry.",
          source: {
            type: "git",
            repository: "https://example.test/acme/plugin.git?access_token=secret",
            resolvedCommit: "0123456789abcdef0123456789abcdef01234567",
            manifestPath: "./orx-plugin.json",
          },
        },
        {
          id: "acme.git-fallback@1.0.0",
          description: "Git source must not fall back to local manifest.",
          manifestPath: "../plugins/demo/orx-plugin.json",
          source: {
            type: "git",
            repository: "https://example.test/acme/plugin.git?access_token=secret",
            resolvedCommit: "0123456789abcdef0123456789abcdef01234567",
            manifestPath: "./orx-plugin.json",
          },
        },
      ],
    }),
  );

  try {
    const catalog = loadPluginCatalog({ catalogPath });
    assert.equal(catalog.path, catalogPath);
    assert.equal(catalog.entries.length, 2);
    const localEntry = catalog.entries.find((entry) => entry.id === "acme.demo-plugin@1.0.0");
    assert.equal(localEntry?.publisher, "acme");
    assert.equal(localEntry?.name, "demo-plugin");
    assert.equal(localEntry?.version, "1.0.0");
    assert.deepEqual(localEntry?.tags, ["demo", "safe"]);
    const gitEntry = catalog.entries.find((entry) => entry.id === "acme.git-plugin@1.0.0");
    assert.equal(gitEntry?.source?.type, "git");
    assert.equal(gitEntry?.source?.repository, "https://example.test/acme/git-plugin.git");
    assert.equal(gitEntry?.source?.resolvedCommit, "0123456789abcdef0123456789abcdef01234567");
    assert.equal(gitEntry?.source?.manifestPath, "orx-plugin.json");

    const rendered = renderPluginCatalog(catalog);
    assert.match(rendered, /Plugin Catalog/);
    assert.match(rendered, /entries: 2/);
    assert.match(rendered, /id=acme\.demo-plugin@1\.0\.0/);
    assert.match(rendered, /id=acme\.git-plugin@1\.0\.0/);
    assert.match(rendered, /source=git repository=https:\/\/example\.test\/acme\/git-plugin\.git commit=0123456789ab manifest=orx-plugin\.json/);
    assert.doesNotMatch(rendered, /sk-or-v1-secret|\u001b|Bearer|token=/i);

    const target = resolvePluginInstallTarget("acme.demo-plugin@1.0.0", { catalogPath });
    assert.equal(target.kind, "manifest");
    assert.equal(target.manifestPath, manifestPath);
    assert.equal(target.catalogEntry?.id, "acme.demo-plugin@1.0.0");

    const gitTarget = resolvePluginInstallTarget("acme.git-plugin@1.0.0", { catalogPath });
    assert.equal(gitTarget.kind, "git");
    assert.equal(gitTarget.manifestPath, "orx-plugin.json");
    assert.equal(gitTarget.gitSource?.repository, "https://example.test/acme/git-plugin.git");

    const directTarget = resolvePluginInstallTarget("./plugin.json", { cwd });
    assert.equal(directTarget.kind, "manifest");
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
