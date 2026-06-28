import test from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createPluginReview,
  registerPluginManifest,
  renderPluginReview,
  savePluginCatalog,
  setPluginEnabledState,
} from "./index.js";

test("plugin review summarizes catalog drift and enabled trust gates without network or execution", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-plugin-review-"));
  const pluginDirectory = join(cwd, "plugin");
  const registryPath = join(cwd, "state", "registry.json");
  const catalogPath = join(cwd, "state", "catalog.json");
  const binsConfigPath = join(cwd, "state", "bins.json");
  const hooksConfigPath = join(cwd, "state", "hooks.json");
  const manifestPath = join(pluginDirectory, "orx-plugin.json");
  const oldCommit = "0123456789abcdef0123456789abcdef01234567";
  const newCommit = "abcdef0123456789abcdef0123456789abcdef01";

  mkdirSync(join(pluginDirectory, "bin"), { recursive: true });
  writeFileSync(join(pluginDirectory, "bin", "format"), "echo format\n");
  writeFileSync(
    join(pluginDirectory, "hooks.json"),
    JSON.stringify({
      hooks: {
        format: {
          event: "pre_tool_use",
          command: "node ./bin/format",
          description: "Format before tools.",
        },
      },
    }),
  );
  writeFileSync(
    join(pluginDirectory, "mcp.json"),
    JSON.stringify({
      servers: {
        docs: {
          transport: {
            kind: "remote-http",
            url: "https://mcp.example.test/mcp",
          },
          tools: [{ name: "lookup", risk: "read", authRequired: false, billable: false }],
        },
      },
    }),
  );
  writeFileSync(
    manifestPath,
    JSON.stringify({
      schemaVersion: "1",
      name: "review-plugin",
      version: "1.0.0",
      description: "Review plugin.",
      publisher: "acme",
      source: {
        type: "git",
        repository: "https://example.test/acme/review-plugin.git",
        ref: "v1.0.0",
        resolvedCommit: oldCommit,
      },
      components: {
        bins: "./bin",
        hooks: "./hooks.json",
        mcpServers: "./mcp.json",
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
    const registered = registerPluginManifest(manifestPath, { registryPath });
    assert.equal(registered.ok, true);
    const enabled = setPluginEnabledState("acme.review-plugin@1.0.0", true, { registryPath });
    assert.equal(enabled.ok, true);
    savePluginCatalog(
      {
        version: 1,
        path: catalogPath,
        entries: [
          {
            id: "acme.review-plugin@1.0.0",
            publisher: "acme",
            name: "review-plugin",
            version: "1.0.0",
            description: "Pinned review plugin.",
            source: {
              type: "git",
              repository: "https://example.test/acme/review-plugin.git",
              ref: "v1.0.0",
              resolvedCommit: newCommit,
              manifestPath: "orx-plugin.json",
            },
            tags: ["review"],
          },
        ],
      },
      { catalogPath },
    );

    const review = createPluginReview({
      registryPath,
      catalogPath,
      binsConfigPath,
      hooksConfigPath,
    });
    assert.equal(review.installedCount, 1);
    assert.equal(review.enabledCount, 1);
    assert.equal(review.updateAvailableCount, 1);
    assert.equal(review.untrustedBinCount, 1);
    assert.equal(review.untrustedHookCount, 1);
    assert.equal(review.pluginMcpProfileCount, 1);

    const rendered = renderPluginReview(review);
    assert.match(rendered, /Plugin Review/);
    assert.match(rendered, /catalog_updates_available: 1/);
    assert.match(rendered, /bin_trust: trusted=0 pending=0 untrusted=1/);
    assert.match(rendered, /hook_trust: trusted=0 pending=0 untrusted=1/);
    assert.match(rendered, /id=acme\.review-plugin@1\.0\.0 enabled=yes source=git catalog=update_available/);
    assert.match(rendered, new RegExp(`catalog_commit=${newCommit.slice(0, 12)}`));
    assert.match(rendered, new RegExp(`installed_commit=${oldCommit.slice(0, 12)}`));
    assert.match(rendered, /bins=1\/trusted:0\/pending:0\/untrusted:1/);
    assert.match(rendered, /hooks=1\/trusted:0\/pending:0\/untrusted:1/);
    assert.match(rendered, /mcp_profiles=1/);
    assert.match(rendered, /command: orx plugins catalog update acme\.review-plugin@1\.0\.0/);
    assert.match(rendered, /command: orx bins trust plugin:acme\.review-plugin@1\.0\.0:bin:format/);
    assert.match(rendered, /command: orx hooks trust plugin:acme\.review-plugin@1\.0\.0:format/);
    assert.match(rendered, /command: orx mcp inspect plugin:acme\.review-plugin@1\.0\.0:docs/);
    assert.match(rendered, /network: none/);
    assert.match(rendered, /execution: none/);
    assert.match(rendered, /install_enable_trust_grant_fetch_execute: separate_explicit_steps/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("plugin review does not tighten existing state file permissions", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-plugin-review-modes-"));
  const registryPath = join(cwd, "registry.json");
  const binsConfigPath = join(cwd, "bins.json");
  const hooksConfigPath = join(cwd, "hooks.json");
  const catalogPath = join(cwd, "catalog.json");
  writeFileSync(registryPath, JSON.stringify({ version: 1, plugins: {} }));
  writeFileSync(binsConfigPath, JSON.stringify({ version: 1, bins: {} }));
  writeFileSync(hooksConfigPath, JSON.stringify({ version: 1, hooks: {} }));
  chmodSync(registryPath, 0o644);
  chmodSync(binsConfigPath, 0o644);
  chmodSync(hooksConfigPath, 0o644);

  try {
    createPluginReview({
      registryPath,
      catalogPath,
      binsConfigPath,
      hooksConfigPath,
    });

    assert.equal(modeBits(registryPath), "644");
    assert.equal(modeBits(binsConfigPath), "644");
    assert.equal(modeBits(hooksConfigPath), "644");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

function modeBits(path: string): string {
  return (statSync(path).mode & 0o777).toString(8);
}
