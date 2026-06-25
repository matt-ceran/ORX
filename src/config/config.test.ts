import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig, validateApiKey } from "./index.js";

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
    assert.equal(loaded.apiKeyPresent, true);
    assert.equal(loaded.apiKeySource, "OPENROUTER_API_KEY");
    assert.equal(validateApiKey(loaded), undefined);
    assert.equal(loaded.loadedFiles.length, 2);
  } finally {
    rmSync(tempHome, { recursive: true, force: true });
    rmSync(tempCwd, { recursive: true, force: true });
  }
});
