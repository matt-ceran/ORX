import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  checkPluginCatalogUpdates,
  installPlugin,
  loadPluginCatalog,
  parsePluginCatalogAddGitArgs,
  removePluginCatalogEntry,
  renderPluginCatalog,
  renderPluginCatalogInspect,
  renderPluginCatalogUpdateReport,
  resolvePluginCatalogPath,
  resolvePluginInstallTarget,
  upsertGitPluginCatalogEntry,
  upsertLocalPluginCatalogEntry,
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

    mkdirSync(join(cwd, "direct-plugin"));
    const directoryTarget = resolvePluginInstallTarget("./direct-plugin", { cwd });
    assert.equal(directoryTarget.kind, "manifest");
    assert.equal(directoryTarget.manifestPath, join(cwd, "direct-plugin", "orx-plugin.json"));
    assert.equal(directoryTarget.catalogEntry, undefined);

    const localInspect = renderPluginCatalogInspect(localEntry!, { catalogPath });
    assert.match(localInspect, /Plugin Catalog Entry: acme\.demo-plugin@1\.0\.0/);
    assert.match(localInspect, /source_type: local/);
    assert.match(localInspect, /resolved_manifest_path:/);
    assert.match(localInspect, /command: orx plugins install acme\.demo-plugin@1\.0\.0/);
    assert.match(localInspect, /inspect_side_effects: none/);
    assert.doesNotMatch(localInspect, /sk-or-v1-secret|\u001b|Bearer|token=/i);

    const unsafeCatalogPath = join(cwd, "catalog\u001b[31m-red", "catalog.json");
    const unsafeCatalogList = renderPluginCatalog({ ...catalog, path: unsafeCatalogPath });
    const unsafeCatalogInspect = renderPluginCatalogInspect(localEntry!, {
      catalogPath: unsafeCatalogPath,
    });
    assert.doesNotMatch(unsafeCatalogList, /\u001b|\[31m|sk-or-v1-secret|Bearer|token=/i);
    assert.doesNotMatch(unsafeCatalogInspect, /\u001b|\[31m|sk-or-v1-secret|Bearer|token=/i);

    const secretCatalogInspect = renderPluginCatalogInspect(
      { ...localEntry!, manifestPath: "orx-plugin.json" },
      {
      catalogPath: join(cwd, "token=secret", "catalog.json"),
      },
    );
    assert.match(secretCatalogInspect, /catalog_path: \[redacted path\]/);
    assert.match(secretCatalogInspect, /resolved_manifest_path: \[redacted path\]/);

    const gitInspect = renderPluginCatalogInspect(gitEntry!, { catalogPath });
    assert.match(gitInspect, /Plugin Catalog Entry: acme\.git-plugin@1\.0\.0/);
    assert.match(gitInspect, /source_type: git/);
    assert.match(gitInspect, /repository: https:\/\/example\.test\/acme\/git-plugin\.git/);
    assert.match(gitInspect, /resolved_commit: 0123456789abcdef0123456789abcdef01234567/);
    assert.match(gitInspect, /install_resolution: clone_to_private_temp_checkout_and_register_disabled/);
    assert.match(gitInspect, /install_enable_trust_grant_fetch_execute: separate_explicit_steps/);
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

test("plugin catalog local editor adds updates and removes private entries", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-plugin-catalog-edit-"));
  const pluginDirectory = join(cwd, "catalog-editor");
  const manifestPath = join(pluginDirectory, "orx-plugin.json");
  const catalogPath = join(cwd, "private", "catalog.json");
  mkdirSync(pluginDirectory, { recursive: true });
  writeFileSync(
    manifestPath,
    JSON.stringify({
      schemaVersion: "1",
      name: "catalog-editor",
      version: "0.1.0",
      description: "Catalog editor plugin.",
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
    }),
  );

  try {
    const added = upsertLocalPluginCatalogEntry(
      {
        manifestPath: pluginDirectory,
        tags: ["local", "authoring", "local"],
      },
      { cwd, catalogPath },
    );
    assert.equal(added.ok, true);
    assert.equal(added.action, "added");
    assert.equal(added.entry?.id, "acme.catalog-editor@0.1.0");
    assert.equal(added.entry?.manifestPath, manifestPath);
    assert.match(added.message, /Catalog entry acme\.catalog-editor@0\.1\.0 added/);
    assert.equal(statSync(join(cwd, "private")).mode & 0o777, 0o700);
    assert.equal(statSync(catalogPath).mode & 0o777, 0o600);

    const loaded = loadPluginCatalog({ catalogPath });
    assert.equal(loaded.entries.length, 1);
    assert.deepEqual(loaded.entries[0]?.tags, ["authoring", "local"]);

    const updated = upsertLocalPluginCatalogEntry(
      {
        manifestPath,
        description: "Updated catalog description.",
      },
      { cwd, catalogPath },
    );
    assert.equal(updated.action, "updated");
    const afterUpdate = loadPluginCatalog({ catalogPath });
    assert.equal(afterUpdate.entries[0]?.description, "Updated catalog description.");
    assert.deepEqual(afterUpdate.entries[0]?.tags, ["authoring", "local"]);

    assert.throws(
      () =>
        upsertLocalPluginCatalogEntry(
          {
            manifestPath,
            tags: ["Bad Tag"],
          },
          { cwd, catalogPath },
        ),
      /Catalog tags must use lowercase letters/,
    );

    const removed = removePluginCatalogEntry("acme.catalog-editor@0.1.0", { catalogPath });
    assert.equal(removed.ok, true);
    assert.equal(removed.action, "removed");
    assert.equal(loadPluginCatalog({ catalogPath }).entries.length, 0);

    const missing = removePluginCatalogEntry("acme.catalog-editor@0.1.0", { catalogPath });
    assert.equal(missing.ok, false);
    assert.equal(missing.action, "missing");
    assert.match(missing.message, /Unknown catalog entry/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("plugin catalog git editor adds pinned entries without fetching", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-plugin-catalog-git-edit-"));
  const catalogPath = join(cwd, "private", "catalog.json");
  const commit = "0123456789abcdef0123456789abcdef01234567";

  try {
    const parsed = parsePluginCatalogAddGitArgs([
      "acme.git-editor@1.2.3",
      "https://example.test/acme/git-editor.git",
      commit,
      "--ref",
      "v1.2.3",
      "--manifest-path",
      "packages/orx-plugin.json",
      "--tags",
      "git,authoring,git",
    ]);
    assert.equal(parsed.id, "acme.git-editor@1.2.3");
    assert.equal(parsed.repository, "https://example.test/acme/git-editor.git");
    assert.equal(parsed.resolvedCommit, commit);

    const added = upsertGitPluginCatalogEntry(parsed, { catalogPath });
    assert.equal(added.ok, true);
    assert.equal(added.action, "added");
    assert.equal(added.entry?.source?.type, "git");
    assert.equal(added.entry?.source?.ref, "v1.2.3");
    assert.equal(added.entry?.source?.manifestPath, "packages/orx-plugin.json");
    assert.deepEqual(added.entry?.tags, ["authoring", "git"]);

    const catalog = loadPluginCatalog({ catalogPath });
    assert.equal(catalog.entries.length, 1);
    assert.equal(catalog.entries[0]?.manifestPath, undefined);
    assert.equal(catalog.entries[0]?.source?.resolvedCommit, commit);

    const target = resolvePluginInstallTarget("acme.git-editor@1.2.3", { catalogPath });
    assert.equal(target.kind, "git");
    assert.equal(target.gitSource?.repository, "https://example.test/acme/git-editor.git");
    assert.equal(target.gitSource?.manifestPath, "packages/orx-plugin.json");

    const updated = upsertGitPluginCatalogEntry(
      {
        id: "acme.git-editor@1.2.3",
        repository: "git@example.test:acme/git-editor.git",
        resolvedCommit: "abcdef0123456789abcdef0123456789abcdef01",
        description: "Updated git catalog entry.",
      },
      { catalogPath },
    );
    assert.equal(updated.action, "updated");
    assert.deepEqual(updated.entry?.tags, ["authoring", "git"]);
    assert.equal(updated.entry?.source?.repository, "git@example.test:acme/git-editor.git");

    assert.throws(
      () =>
        upsertGitPluginCatalogEntry(
          {
            id: "acme.git-editor@1.2.3",
            repository: "https://example.test/acme/git-editor.git?token=secret",
            resolvedCommit: commit,
          },
          { catalogPath },
        ),
      /Catalog git repository must be a safe/,
    );
    assert.throws(
      () =>
        upsertGitPluginCatalogEntry(
          {
            id: "acme.git-editor@1.2.3",
            repository: "https://example.test/acme/git-editor.git",
            resolvedCommit: "abc123",
          },
          { catalogPath },
        ),
      /full 40 or 64 character hex commit/,
    );
    assert.throws(
      () =>
        upsertGitPluginCatalogEntry(
          {
            id: "acme.git-editor@1.2.3",
            repository: "https://example.test/acme/git-editor.git",
            resolvedCommit: commit,
            manifestPath: "../orx-plugin.json",
          },
          { catalogPath },
        ),
      /manifest path must be a safe relative path/,
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("plugin catalog update check compares local catalog pins without fetching", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-plugin-catalog-update-check-"));
  const repoPath = join(cwd, "repo");
  const currentRepoPath = join(cwd, "current-repo");
  const localPath = join(cwd, "local");
  const catalogPath = join(cwd, "catalog", "catalog.json");
  const registryPath = join(cwd, "registry", "plugins.json");
  const cacheDirectory = join(cwd, "cache");
  mkdirSync(repoPath, { recursive: true });
  mkdirSync(currentRepoPath, { recursive: true });
  mkdirSync(localPath, { recursive: true });
  writePluginManifest(repoPath, {
    name: "git-update",
    description: "Git update plugin.",
    source: {
      type: "local",
      path: ".",
    },
  });
  writePluginManifest(localPath, {
    name: "local-update",
    description: "Local update plugin.",
    source: {
      type: "local",
      path: ".",
    },
  });
  writePluginManifest(currentRepoPath, {
    name: "git-current",
    description: "Current git plugin.",
    source: {
      type: "local",
      path: ".",
    },
  });
  const installedCommit = commitRepo(repoPath, "initial");
  const currentCommit = commitRepo(currentRepoPath, "initial");

  try {
    upsertGitPluginCatalogEntry(
      {
        id: "acme.git-update@1.0.0",
        repository: pathToFileURL(repoPath).href,
        resolvedCommit: installedCommit,
      },
      { catalogPath },
    );
    await installPlugin("acme.git-update@1.0.0", {
      catalogPath,
      registryPath,
      cacheDirectory,
    });
    upsertGitPluginCatalogEntry(
      {
        id: "acme.git-current@1.0.0",
        repository: pathToFileURL(currentRepoPath).href,
        resolvedCommit: currentCommit,
      },
      { catalogPath },
    );
    await installPlugin("acme.git-current@1.0.0", {
      catalogPath,
      registryPath,
      cacheDirectory,
    });

    writeFileSync(join(repoPath, "README.md"), "catalog pin changed\n");
    const catalogCommit = commitRepo(repoPath, "next");
    upsertGitPluginCatalogEntry(
      {
        id: "acme.git-update@1.0.0",
        repository: pathToFileURL(repoPath).href,
        resolvedCommit: catalogCommit,
      },
      { catalogPath },
    );
    upsertGitPluginCatalogEntry(
      {
        id: "acme.not-installed@1.0.0",
        repository: pathToFileURL(repoPath).href,
        resolvedCommit: catalogCommit,
      },
      { catalogPath },
    );
    upsertLocalPluginCatalogEntry(
      {
        manifestPath: localPath,
      },
      { catalogPath },
    );
    chmodSync(registryPath, 0o644);
    const registryTextBefore = readFileSync(registryPath, "utf8");
    const registryStatBefore = statSync(registryPath);

    const report = checkPluginCatalogUpdates({ catalogPath, registryPath });
    const registryStatAfter = statSync(registryPath);
    assert.equal(registryStatAfter.mode & 0o777, registryStatBefore.mode & 0o777);
    assert.equal(registryStatAfter.mtimeMs, registryStatBefore.mtimeMs);
    assert.equal(readFileSync(registryPath, "utf8"), registryTextBefore);
    assert.equal(report.entriesChecked, 4);
    assert.equal(report.updateAvailableCount, 1);
    assert.equal(report.currentCount, 1);
    assert.equal(report.notInstalledCount, 1);
    assert.equal(report.skippedCount, 1);
    assert.equal(
      report.entries.find((entry) => entry.id === "acme.git-update@1.0.0")?.status,
      "update_available",
    );
    assert.equal(
      report.entries.find((entry) => entry.id === "acme.not-installed@1.0.0")?.status,
      "not_installed",
    );
    assert.equal(
      report.entries.find((entry) => entry.id === "acme.git-current@1.0.0")?.status,
      "current",
    );
    assert.equal(
      report.entries.find((entry) => entry.id === "acme.git-update@1.0.0")?.catalogCommit,
      catalogCommit,
    );
    assert.equal(
      report.entries.find((entry) => entry.id === "acme.git-update@1.0.0")?.installedCommit,
      installedCommit,
    );

    const scopedReport = checkPluginCatalogUpdates({
      catalogPath,
      registryPath,
      ids: ["acme.git-update@1.0.0"],
    });
    assert.equal(scopedReport.entriesChecked, 1);
    assert.equal(scopedReport.entries[0]?.status, "update_available");

    const rendered = renderPluginCatalogUpdateReport(report);
    assert.match(rendered, /Plugin Catalog Update Check/);
    assert.match(rendered, /updates_available: 1/);
    assert.match(rendered, /network: none/);
    assert.match(rendered, /side_effects: none/);
    assert.match(rendered, /id=acme\.git-update@1\.0\.0 status=update_available/);
    assert.match(rendered, new RegExp(`catalog_commit=${catalogCommit.slice(0, 12)}`));
    assert.match(rendered, new RegExp(`installed_commit=${installedCommit.slice(0, 12)}`));
    assert.match(rendered, /command: orx plugins catalog update acme\.git-update@1\.0\.0/);
    assert.match(rendered, /id=acme\.not-installed@1\.0\.0 status=not_installed/);
    assert.match(rendered, /id=acme\.git-current@1\.0\.0 status=current/);
    assert.match(rendered, /status=not_git_catalog/);
    assert.match(rendered, /fetch_install_enable_trust_grant_execute: separate_explicit_steps/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

function writePluginManifest(
  root: string,
  options: {
    name: string;
    description: string;
    source: { type: "local"; path: string } | { type: "git"; repository: string; resolvedCommit: string };
  },
): void {
  writeFileSync(
    join(root, "orx-plugin.json"),
    JSON.stringify({
      schemaVersion: "1",
      name: options.name,
      version: "1.0.0",
      description: options.description,
      publisher: "acme",
      source: options.source,
      components: {},
      permissions: {
        filesystem: [],
        network: [],
        env: [],
        mcp: [],
      },
    }),
  );
}

function commitRepo(cwd: string, message: string): string {
  if (!statSync(join(cwd, ".git"), { throwIfNoEntry: false })) {
    git(cwd, "init");
    git(cwd, "config", "user.email", "orx@example.test");
    git(cwd, "config", "user.name", "ORX Tests");
  }
  git(cwd, "add", ".");
  git(cwd, "commit", "-m", message);
  return git(cwd, "rev-parse", "HEAD").trim();
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
    },
  });
}
