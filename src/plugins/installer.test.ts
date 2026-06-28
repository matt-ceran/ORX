import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  installPlugin,
  loadPluginRegistry,
  type PluginSource,
} from "./index.js";

test("installPlugin installs pinned git catalog entries through the inert cache path", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-plugin-git-install-"));
  const repoPath = join(cwd, "repo");
  const catalogPath = join(cwd, "catalog.json");
  const registryPath = join(cwd, "registry", "plugins.json");
  const cacheDirectory = join(cwd, "registry", "cache");
  mkdirSync(join(repoPath, "skills"), { recursive: true });
  writeFileSync(join(repoPath, "skills", "SKILL.md"), "# Git catalog skill\n");
  writePluginManifest(repoPath, {
    name: "git-catalog-plugin",
    description: "Git catalog plugin.",
    source: {
      type: "local",
      path: ".",
    },
    components: {
      skills: "./skills",
    },
  });
  const commit = commitRepo(repoPath);
  const repository = pathToFileURL(repoPath).href;
  writeCatalog(catalogPath, {
    id: "acme.git-catalog-plugin@1.0.0",
    repository,
    resolvedCommit: commit,
    manifestPath: "orx-plugin.json",
  });

  try {
    const result = await installPlugin("acme.git-catalog-plugin@1.0.0", {
      catalogPath,
      registryPath,
      cacheDirectory,
    });

    assert.equal(result.ok, true);
    assert.match(result.sourceMessage ?? "", /resolved to git source/);
    const registry = loadPluginRegistry({ registryPath });
    const plugin = registry.plugins["acme.git-catalog-plugin@1.0.0"];
    assert.equal(plugin.enabled, false);
    assert.equal(plugin.manifest.source.type, "git");
    assert.equal(plugin.manifest.source.repository, repository);
    assert.equal(plugin.manifest.source.resolvedCommit, commit);
    assert.equal(plugin.lock.resolvedRef, commit);
    assert.equal(existsSync(plugin.lock.source.manifestPath), true);
    assert.match(readFileSync(plugin.lock.source.manifestPath, "utf8"), new RegExp(commit));
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("installPlugin rejects git catalog manifests from a different repository", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-plugin-git-mismatch-"));
  const repoPath = join(cwd, "repo");
  const catalogPath = join(cwd, "catalog.json");
  const registryPath = join(cwd, "registry.json");
  mkdirSync(repoPath, { recursive: true });
  writePluginManifest(repoPath, {
    name: "git-mismatch-plugin",
    description: "Git mismatch plugin.",
    source: {
      type: "git",
      repository: "https://example.test/other/plugin.git",
      resolvedCommit: "0123456789abcdef0123456789abcdef01234567",
    },
  });
  const commit = commitRepo(repoPath);
  writeCatalog(catalogPath, {
    id: "acme.git-mismatch-plugin@1.0.0",
    repository: pathToFileURL(repoPath).href,
    resolvedCommit: commit,
    manifestPath: "orx-plugin.json",
  });

  try {
    await assert.rejects(
      installPlugin("acme.git-mismatch-plugin@1.0.0", {
        catalogPath,
        registryPath,
      }),
      /repository does not match manifest source\.repository/,
    );
    assert.equal(loadPluginRegistry({ registryPath }).plugins["acme.git-mismatch-plugin@1.0.0"], undefined);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("installPlugin rejects symlinked git catalog manifests that escape checkout", async (t) => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-plugin-git-symlink-"));
  const repoPath = join(cwd, "repo");
  const outsidePath = join(cwd, "outside", "orx-plugin.json");
  const catalogPath = join(cwd, "catalog.json");
  const registryPath = join(cwd, "registry.json");
  mkdirSync(repoPath, { recursive: true });
  mkdirSync(join(cwd, "outside"), { recursive: true });
  writePluginManifest(join(cwd, "outside"), {
    name: "git-symlink-plugin",
    description: "Git symlink plugin.",
    source: {
      type: "local",
      path: ".",
    },
  });
  try {
    symlinkSync(outsidePath, join(repoPath, "orx-plugin.json"));
  } catch {
    rmSync(cwd, { recursive: true, force: true });
    t.skip("filesystem does not support symlinks");
    return;
  }
  const commit = commitRepo(repoPath);
  writeCatalog(catalogPath, {
    id: "acme.git-symlink-plugin@1.0.0",
    repository: pathToFileURL(repoPath).href,
    resolvedCommit: commit,
    manifestPath: "orx-plugin.json",
  });

  try {
    await assert.rejects(
      installPlugin("acme.git-symlink-plugin@1.0.0", {
        catalogPath,
        registryPath,
      }),
      /regular file|escapes/,
    );
    assert.equal(loadPluginRegistry({ registryPath }).plugins["acme.git-symlink-plugin@1.0.0"], undefined);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("installPlugin ignores ambient git filter config while checking out catalog sources", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-plugin-git-filter-"));
  const repoPath = join(cwd, "repo");
  const catalogPath = join(cwd, "catalog.json");
  const registryPath = join(cwd, "registry.json");
  const markerPath = join(cwd, "ambient-filter-ran");
  const previousEnv = snapshotEnv([
    "GIT_CONFIG_COUNT",
    "GIT_CONFIG_KEY_0",
    "GIT_CONFIG_VALUE_0",
    "GIT_CONFIG_KEY_1",
    "GIT_CONFIG_VALUE_1",
    "ORX_PROBE_MARKER",
  ]);
  mkdirSync(repoPath, { recursive: true });
  writePluginManifest(repoPath, {
    name: "git-filter-plugin",
    description: "Git filter plugin.",
    source: {
      type: "local",
      path: ".",
    },
  });
  writeFileSync(join(repoPath, ".gitattributes"), "payload.txt filter=orxprobe\n");
  writeFileSync(join(repoPath, "payload.txt"), "payload\n");
  const commit = commitRepo(repoPath);
  writeCatalog(catalogPath, {
    id: "acme.git-filter-plugin@1.0.0",
    repository: pathToFileURL(repoPath).href,
    resolvedCommit: commit,
    manifestPath: "orx-plugin.json",
  });

  process.env.GIT_CONFIG_COUNT = "2";
  process.env.GIT_CONFIG_KEY_0 = "filter.orxprobe.smudge";
  process.env.GIT_CONFIG_VALUE_0 = `sh -c 'printf executed > ${markerPath}; cat'`;
  process.env.GIT_CONFIG_KEY_1 = "filter.orxprobe.required";
  process.env.GIT_CONFIG_VALUE_1 = "true";
  process.env.ORX_PROBE_MARKER = markerPath;

  try {
    const result = await installPlugin("acme.git-filter-plugin@1.0.0", {
      catalogPath,
      registryPath,
    });

    assert.equal(result.ok, true);
    assert.equal(existsSync(markerPath), false);
  } finally {
    restoreEnv(previousEnv);
    rmSync(cwd, { recursive: true, force: true });
  }
});

function writePluginManifest(
  root: string,
  options: {
    name: string;
    description: string;
    source: PluginSource;
    components?: Record<string, string>;
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
      components: options.components ?? {},
      permissions: {
        filesystem: [],
        network: [],
        env: [],
        mcp: [],
      },
    }),
  );
}

function writeCatalog(
  path: string,
  source: {
    id: string;
    repository: string;
    resolvedCommit: string;
    manifestPath: string;
  },
): void {
  writeFileSync(
    path,
    JSON.stringify({
      version: 1,
      entries: [
        {
          id: source.id,
          description: "Install from pinned git source.",
          source: {
            type: "git",
            repository: source.repository,
            resolvedCommit: source.resolvedCommit,
            manifestPath: source.manifestPath,
          },
          tags: ["git"],
        },
      ],
    }),
  );
}

function commitRepo(path: string): string {
  git(path, "init");
  git(path, "config", "user.email", "orx@example.test");
  git(path, "config", "user.name", "ORX Tests");
  git(path, "add", ".");
  git(path, "commit", "-m", "initial");
  return git(path, "rev-parse", "HEAD").trim();
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
  });
}

function snapshotEnv(names: string[]): Record<string, string | undefined> {
  const snapshot: Record<string, string | undefined> = {};
  for (const name of names) {
    snapshot[name] = process.env[name];
  }
  return snapshot;
}

function restoreEnv(snapshot: Record<string, string | undefined>): void {
  for (const [name, value] of Object.entries(snapshot)) {
    if (typeof value === "undefined") {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
}
