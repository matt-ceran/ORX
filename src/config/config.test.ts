import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig, setConfigValue, validateApiKey } from "./index.js";

test("loads built-in defaults when config files are absent", () => {
  const tempHome = mkdtempSync(join(tmpdir(), "orx-home-"));
  const tempCwd = mkdtempSync(join(tmpdir(), "orx-cwd-"));

  try {
    const loaded = loadConfig({
      cwd: tempCwd,
      homeDir: tempHome,
      env: {},
    });

    assert.equal(loaded.config.mode, "auto");
    assert.equal(loaded.config.model, "openrouter/auto");
    assert.equal(loaded.config.theme, "default");
    assert.equal(loaded.apiKeyPresent, false);
    assert.equal(loaded.apiKeySource, "missing");
    assert.match(validateApiKey(loaded) ?? "", /OpenRouter API key not found/);
  } finally {
    rmSync(tempHome, { recursive: true, force: true });
    rmSync(tempCwd, { recursive: true, force: true });
  }
});

test("merges repo-local config, user config, and OPENROUTER_API_KEY", () => {
  const tempHome = mkdtempSync(join(tmpdir(), "orx-home-"));
  const tempCwd = mkdtempSync(join(tmpdir(), "orx-cwd-"));

  try {
    mkdirSync(join(tempHome, ".orx"), { recursive: true });
    mkdirSync(join(tempCwd, ".orx"), { recursive: true });

    writeFileSync(
      join(tempCwd, ".orx", "config.toml"),
      [
        'mode = "fusion"',
        'model = "openrouter/fusion"',
        'fusion_preset = "general-budget"',
        'theme = "mono"',
        "",
      ].join("\n"),
    );

    writeFileSync(
      join(tempHome, ".orx", "config.toml"),
      [
        'api_key = "config-key"',
        "[permissions]",
        'approval_policy = "never"',
        'sandbox_mode = "danger-full-access"',
        "",
      ].join("\n"),
    );

    const loaded = loadConfig({
      cwd: tempCwd,
      homeDir: tempHome,
      env: {
        OPENROUTER_API_KEY: "env-key",
      },
    });

    assert.equal(loaded.config.mode, "fusion");
    assert.equal(loaded.config.model, "openrouter/fusion");
    assert.equal(loaded.config.fusionPreset, "general-budget");
    assert.equal(loaded.config.theme, "mono");
    assert.equal(loaded.apiKeyPresent, true);
    assert.equal(loaded.apiKeySource, "OPENROUTER_API_KEY");
    assert.equal(validateApiKey(loaded), undefined);
    assert.equal(loaded.loadedFiles.length, 2);
  } finally {
    rmSync(tempHome, { recursive: true, force: true });
    rmSync(tempCwd, { recursive: true, force: true });
  }
});

test("loads user config from ORX_CONFIG_PATH override", () => {
  const tempHome = mkdtempSync(join(tmpdir(), "orx-home-"));
  const tempCwd = mkdtempSync(join(tmpdir(), "orx-cwd-"));

  try {
    writeFileSync(
      join(tempCwd, "user-config.toml"),
      ['mode = "exact"', 'model = "anthropic/claude-sonnet-4.5"', ""].join("\n"),
    );

    const loaded = loadConfig({
      cwd: tempCwd,
      homeDir: tempHome,
      env: {
        ORX_CONFIG_PATH: "user-config.toml",
      },
    });

    assert.equal(loaded.config.mode, "exact");
    assert.equal(loaded.config.model, "anthropic/claude-sonnet-4.5");
    assert.deepEqual(loaded.loadedFiles, [join(tempCwd, "user-config.toml")]);
  } finally {
    rmSync(tempHome, { recursive: true, force: true });
    rmSync(tempCwd, { recursive: true, force: true });
  }
});

test("setConfigValue writes supported config keys privately and preserves existing api key", () => {
  const tempHome = mkdtempSync(join(tmpdir(), "orx-home-"));
  const tempCwd = mkdtempSync(join(tmpdir(), "orx-cwd-"));
  const configPath = join(tempCwd, "config.toml");

  try {
    writeFileSync(configPath, ['api_key = "config-key"', 'mode = "auto"', ""].join("\n"));
    const result = setConfigValue("theme", "vivid", {
      cwd: tempCwd,
      homeDir: tempHome,
      env: {
        ORX_CONFIG_PATH: configPath,
      },
    });

    assert.equal(result.key, "theme");
    assert.equal(result.path, configPath);
    const stored = readFileSync(configPath, "utf8");
    assert.match(stored, /api_key = "config-key"/);
    assert.match(stored, /theme = "vivid"/);
    assert.equal(statSync(configPath).mode & 0o777, 0o600);
  } finally {
    rmSync(tempHome, { recursive: true, force: true });
    rmSync(tempCwd, { recursive: true, force: true });
  }
});

test("setConfigValue --local edits discovered ancestor local config from subdirectories", () => {
  const tempHome = mkdtempSync(join(tmpdir(), "orx-home-"));
  const tempRoot = mkdtempSync(join(tmpdir(), "orx-root-"));
  const subdir = join(tempRoot, "packages", "demo");
  const localConfigPath = join(tempRoot, ".orx", "config.toml");
  const subdirConfigPath = join(subdir, ".orx", "config.toml");

  try {
    mkdirSync(join(tempRoot, ".orx"), { recursive: true });
    mkdirSync(subdir, { recursive: true });
    writeFileSync(localConfigPath, ['theme = "default"', ""].join("\n"));

    const result = setConfigValue("theme", "mono", {
      cwd: subdir,
      homeDir: tempHome,
      scope: "local",
    });

    assert.equal(result.path, localConfigPath);
    assert.match(readFileSync(localConfigPath, "utf8"), /theme = "mono"/);
    assert.equal(existsSync(subdirConfigPath), false);
  } finally {
    rmSync(tempHome, { recursive: true, force: true });
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("setConfigValue rejects unsafe values and symlink config paths", () => {
  const tempHome = mkdtempSync(join(tmpdir(), "orx-home-"));
  const tempCwd = mkdtempSync(join(tmpdir(), "orx-cwd-"));
  const targetPath = join(tempCwd, "target.toml");
  const linkPath = join(tempCwd, "config-link.toml");

  try {
    assert.throws(
      () => setConfigValue("api_key", "sk-or-v1-secret", { cwd: tempCwd, homeDir: tempHome }),
      /Refusing to store API keys/,
    );
    assert.throws(
      () => setConfigValue("theme", "neon", { cwd: tempCwd, homeDir: tempHome }),
      /Invalid theme/,
    );

    writeFileSync(targetPath, "");
    symlinkSync(targetPath, linkPath);
    assert.throws(
      () =>
        setConfigValue("theme", "vivid", {
          cwd: tempCwd,
          homeDir: tempHome,
          env: {
            ORX_CONFIG_PATH: linkPath,
          },
        }),
      /symlink/,
    );
  } finally {
    rmSync(tempHome, { recursive: true, force: true });
    rmSync(tempCwd, { recursive: true, force: true });
  }
});

test("setConfigValue refuses symlink parent directories", () => {
  const tempHome = mkdtempSync(join(tmpdir(), "orx-home-"));
  const tempCwd = mkdtempSync(join(tmpdir(), "orx-cwd-"));
  const targetDir = join(tempCwd, "target");
  const linkDir = join(tempCwd, "link");

  try {
    mkdirSync(targetDir);
    symlinkSync(targetDir, linkDir);

    assert.throws(
      () =>
        setConfigValue("theme", "vivid", {
          cwd: tempCwd,
          homeDir: tempHome,
          env: {
            ORX_CONFIG_PATH: join(linkDir, "nested", "config.toml"),
          },
        }),
      /parent symlink/,
    );
    assert.equal(existsSync(join(targetDir, "nested", "config.toml")), false);
  } finally {
    rmSync(tempHome, { recursive: true, force: true });
    rmSync(tempCwd, { recursive: true, force: true });
  }
});

test("setConfigValue allows explicit system temp config paths with missing parents", () => {
  const tempHome = mkdtempSync(join(tmpdir(), "orx-home-"));
  const tempConfigDir = join("/tmp", `orx-config-${process.pid}-${Date.now()}`);
  const configPath = join(tempConfigDir, "config.toml");

  try {
    const result = setConfigValue("theme", "vivid", {
      cwd: process.cwd(),
      homeDir: tempHome,
      env: {
        ORX_CONFIG_PATH: configPath,
      },
    });

    assert.equal(result.path, configPath);
    assert.match(readFileSync(configPath, "utf8"), /theme = "vivid"/);
  } finally {
    rmSync(tempHome, { recursive: true, force: true });
    rmSync(tempConfigDir, { recursive: true, force: true });
  }
});

test("rejects invalid configured themes", () => {
  const tempHome = mkdtempSync(join(tmpdir(), "orx-home-"));
  const tempCwd = mkdtempSync(join(tmpdir(), "orx-cwd-"));

  try {
    mkdirSync(join(tempCwd, ".orx"), { recursive: true });
    writeFileSync(
      join(tempCwd, ".orx", "config.toml"),
      ['theme = "neon"', ""].join("\n"),
    );

    assert.throws(
      () =>
        loadConfig({
          cwd: tempCwd,
          homeDir: tempHome,
          env: {},
        }),
      /Invalid theme .* Expected default, mono, or vivid/,
    );
  } finally {
    rmSync(tempHome, { recursive: true, force: true });
    rmSync(tempCwd, { recursive: true, force: true });
  }
});
