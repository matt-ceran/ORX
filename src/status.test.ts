import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LoadedConfig } from "./config/types.js";
import { formatStatus } from "./status.js";
import { stripAnsi } from "./terminal/ui.js";

test("status keeps plain script-safe output for non-tty streams", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-status-plain-"));
  try {
    const output = formatStatus({
      cwd,
      loadedConfig: baseLoadedConfig(),
      mcpConfigPath: join(cwd, "mcp.json"),
      mcpProfileCatalogPath: join(cwd, "mcp-catalog.json"),
      pluginRegistryPath: join(cwd, "plugins.json"),
      profileConfigPath: join(cwd, "profiles.json"),
      delegationTeamConfigPath: join(cwd, "teams.json"),
      delegationPolicyPath: join(cwd, "policy.json"),
      renderOptions: { color: false },
    });

    assert.match(output, /^ORX status\ncwd: /);
    assert.match(output, /api_key_present: no/);
    assert.match(output, /mcp_profile: profile=openrouter state=disabled/);
    assert.doesNotMatch(output, /• ORX status/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("status renders sectioned terminal blocks for tty streams", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-status-tty-"));
  try {
    const output = stripAnsi(
      formatStatus({
        cwd,
        loadedConfig: baseLoadedConfig(),
        mcpConfigPath: join(cwd, "mcp.json"),
        mcpProfileCatalogPath: join(cwd, "mcp-catalog.json"),
        pluginRegistryPath: join(cwd, "plugins.json"),
        profileConfigPath: join(cwd, "profiles.json"),
        delegationTeamConfigPath: join(cwd, "teams.json"),
        delegationPolicyPath: join(cwd, "policy.json"),
        renderOptions: { color: true },
      }),
    );

    assert.match(output, /^• ORX status auto openrouter\/auto/);
    assert.match(output, /\n {2}model openrouter\/auto {2}mode auto {2}fusion none/);
    assert.match(output, /• runtime/);
    assert.match(output, /• tests/);
    assert.match(output, /• MCP active none/);
    assert.match(output, /• plugins/);
    assert.match(output, /• delegation/);
    assert.match(output, /• MCP profiles/);
    assert.doesNotMatch(output, /[╭╰│]/);
    assert.doesNotMatch(output, /\napi_key_present: no/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("status keeps sectioned tty layout when color is disabled", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-status-no-color-"));
  try {
    const output = formatStatus({
      cwd,
      loadedConfig: baseLoadedConfig(),
      mcpConfigPath: join(cwd, "mcp.json"),
      mcpProfileCatalogPath: join(cwd, "mcp-catalog.json"),
      pluginRegistryPath: join(cwd, "plugins.json"),
      profileConfigPath: join(cwd, "profiles.json"),
      delegationTeamConfigPath: join(cwd, "teams.json"),
      delegationPolicyPath: join(cwd, "policy.json"),
      renderOptions: { stream: { isTTY: true }, env: { NO_COLOR: "1" } },
    });

    assert.match(output, /^• ORX status auto openrouter\/auto/);
    assert.match(output, /• runtime/);
    assert.doesNotMatch(output, /\x1b\[/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

function baseLoadedConfig(): LoadedConfig {
  return {
    config: {
      model: "openrouter/auto",
      mode: "auto",
      permissions: {
        approvalPolicy: "never",
        sandboxMode: "danger-full-access",
      },
      theme: "default",
    },
    loadedFiles: [],
    apiKeyPresent: false,
    apiKeySource: "missing",
  };
}
