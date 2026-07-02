#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = mkdtempSync(join(tmpdir(), "orx-release-verify-"));
const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";
const nodeBin = process.execPath;
const cliPath = join(repoRoot, "dist", "cli.js");
const smokeCwd = join(tempRoot, "smoke-cwd");
const pluginSmokeDir = join(tempRoot, "plugin-smoke");
const codeSmokeRoot = join(tempRoot, "code-root");

const steps = [
  ["git diff whitespace check", "git", ["diff", "--check"]],
  ["typecheck", npmBin, ["run", "typecheck"]],
  ["full npm test", npmBin, ["test"]],
  ["global install verifier", npmBin, ["run", "verify:global-install"]],
  [
    "npm package dry-run contents",
    npmBin,
    ["pack", "--dry-run", "--json", "--ignore-scripts"],
    { smoke: "packDryRun" },
  ],
  [
    "built CLI smoke: doctor --json",
    nodeBin,
    [cliPath, "doctor", "--json"],
    { smoke: "doctorJson", cwd: smokeCwd },
  ],
  ["built CLI smoke: guide", nodeBin, [cliPath, "guide"], { smoke: "guide", cwd: smokeCwd }],
  [
    "built CLI smoke: code calls",
    nodeBin,
    [cliPath, "code", "calls", "render"],
    { smoke: "codeCalls", cwd: codeSmokeRoot },
  ],
  [
    "built CLI smoke: plugins review",
    nodeBin,
    [cliPath, "plugins", "review"],
    { smoke: "pluginsReview", cwd: smokeCwd },
  ],
  [
    "built CLI smoke: plugins review --json",
    nodeBin,
    [cliPath, "plugins", "review", "--json"],
    { smoke: "pluginsReviewJson", cwd: smokeCwd },
  ],
  [
    "built CLI smoke: plugins validate --json",
    nodeBin,
    [cliPath, "plugins", "validate", pluginSmokeDir, "--json"],
    { smoke: "pluginsValidateJson", cwd: smokeCwd },
  ],
  ["built CLI smoke: mcp presets", nodeBin, [cliPath, "mcp", "presets"], { smoke: "mcpPresets", cwd: smokeCwd }],
];

try {
  prepareSmokeDirs();
  console.log("ORX release verification");
  console.log("network: disabled by command selection; real OpenRouter/search keys cleared");
  console.log(`temp_state: ${tempRoot}`);

  for (const [index, step] of steps.entries()) {
    const [label, command, args, options = {}] = step;
    process.stdout.write(`[${index + 1}/${steps.length}] ${label} ... `);
    try {
      const result = run(command, args, {
        cwd: options.cwd,
        env: options.smoke ? smokeEnv() : localEnv(),
      });
      assertSmoke(options.smoke, result.stdout);
      console.log("ok");
    } catch (error) {
      console.log("failed");
      throw error;
    }
  }

  console.log("release verification passed");
} catch (error) {
  process.exitCode = 1;
  console.error(formatThrownError(error));
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

function prepareSmokeDirs() {
  for (const path of [
    smokeCwd,
    codeSmokeRoot,
    join(tempRoot, "home"),
    join(tempRoot, "sessions"),
    join(tempRoot, "auth"),
    join(tempRoot, "mcp"),
    join(tempRoot, "mcp", "auth-env"),
    join(tempRoot, "plugins"),
    join(tempRoot, "plugins", "cache"),
    pluginSmokeDir,
    join(tempRoot, "delegation"),
    join(tempRoot, "audit"),
  ]) {
    mkdirSync(path, { recursive: true });
  }

  writeFileSync(
    join(pluginSmokeDir, "orx-plugin.json"),
    JSON.stringify(
      {
        schemaVersion: "1",
        name: "validate-smoke",
        version: "1.0.0",
        description: "Validate smoke plugin.",
        publisher: "orx",
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
      },
      null,
      2,
    ),
  );

  for (const entry of ["package.json", "README.md", "tsconfig.json", "src"]) {
    cpSync(join(repoRoot, entry), join(codeSmokeRoot, entry), { recursive: true });
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    env: options.env ?? localEnv(),
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    shell: false,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(formatFailure(command, args, result));
  }

  return result;
}

function localEnv() {
  return {
    ...process.env,
    OPENROUTER_API_KEY: "",
    BRAVE_SEARCH_API_KEY: "",
    NPM_CONFIG_AUDIT: "false",
    NPM_CONFIG_FUND: "false",
    NO_COLOR: "1",
  };
}

function smokeEnv() {
  return {
    ...localEnv(),
    HOME: join(tempRoot, "home"),
    USERPROFILE: join(tempRoot, "home"),
    ORX_CONFIG_PATH: join(tempRoot, "config.toml"),
    ORX_AUTH_ENV_DIR: join(tempRoot, "auth"),
    ORX_SESSION_DIR: join(tempRoot, "sessions"),
    ORX_CHAT_HISTORY_PATH: join(tempRoot, "history.json"),
    ORX_PROFILE_CONFIG_PATH: join(tempRoot, "profiles.json"),
    ORX_MCP_CONFIG_PATH: join(tempRoot, "mcp", "profiles.json"),
    ORX_MCP_PROFILE_CATALOG_PATH: join(tempRoot, "mcp", "profile-catalog.json"),
    ORX_MCP_AUTH_ENV_DIR: join(tempRoot, "mcp", "auth-env"),
    ORX_MCP_KEYCHAIN: "",
    ORX_PLUGIN_REGISTRY_PATH: join(tempRoot, "plugins", "registry.json"),
    ORX_PLUGIN_CACHE_DIR: join(tempRoot, "plugins", "cache"),
    ORX_PLUGIN_CATALOG_PATH: join(tempRoot, "plugins", "catalog.json"),
    ORX_PLUGIN_BINS_CONFIG_PATH: join(tempRoot, "plugins", "bins.json"),
    ORX_PLUGIN_BINS_AUDIT_PATH: join(tempRoot, "audit", "bins.jsonl"),
    ORX_PLUGIN_HOOKS_CONFIG_PATH: join(tempRoot, "plugins", "hooks.json"),
    ORX_PLUGIN_HOOKS_AUDIT_PATH: join(tempRoot, "audit", "hooks.jsonl"),
    ORX_DELEGATION_TEAMS_PATH: join(tempRoot, "delegation", "teams.json"),
    ORX_DELEGATION_POLICY_PATH: join(tempRoot, "delegation", "policy.json"),
    ORX_DELEGATION_AUDIT_PATH: join(tempRoot, "audit", "delegation.jsonl"),
  };
}

function assertSmoke(kind, stdout) {
  if (!kind) {
    return;
  }

  if (!stdout.trim()) {
    throw new Error(`smoke ${kind} produced no stdout`);
  }

  if (kind === "doctorJson") {
    const data = JSON.parse(stdout);
    if (data.schema_version !== 1) {
      throw new Error(`doctor --json schema_version mismatch: ${JSON.stringify(data.schema_version)}`);
    }
    if (!data.summary || data.summary.core_cli !== "ready") {
      throw new Error("doctor --json did not report core_cli: ready");
    }
    if (data.runtime?.api_key_present !== false) {
      throw new Error("doctor --json smoke unexpectedly found an API key");
    }
    if (
      data.summary.network_calls !== "none" ||
      data.summary.remote_mcp_calls !== "none" ||
      data.summary.plugin_execution !== "none"
    ) {
      throw new Error("doctor --json smoke did not report no-network/no-plugin-execution boundaries");
    }
    return;
  }

  if (kind === "pluginsReviewJson") {
    const data = JSON.parse(stdout);
    if (data.schema_version !== 1 || data.surface !== "orx.plugin_review") {
      throw new Error("plugins review --json schema metadata mismatch");
    }
    if (
      data.operator_only !== true ||
      data.network !== "none" ||
      data.execution !== "none" ||
      data.data_state_writes !== "none"
    ) {
      throw new Error("plugins review --json did not report read-only operator boundaries");
    }
    if (typeof data.installed_count !== "number" || !Array.isArray(data.plugins)) {
      throw new Error("plugins review --json smoke missing review counts");
    }
    if (data.authority?.registry_catalog_cache_trust_state !== "read_only") {
      throw new Error("plugins review --json smoke missing read-only authority");
    }
    return;
  }

  if (kind === "pluginsValidateJson") {
    const data = JSON.parse(stdout);
    if (data.schema_version !== 1 || data.surface !== "orx.plugin_validation") {
      throw new Error("plugins validate --json schema metadata mismatch");
    }
    if (
      data.operator_only !== true ||
      data.network !== "none" ||
      data.execution !== "none" ||
      data.data_state_writes !== "none"
    ) {
      throw new Error("plugins validate --json did not report read-only operator boundaries");
    }
    if (data.plugin_id !== "orx.validate-smoke@1.0.0" || data.ok !== true) {
      throw new Error("plugins validate --json smoke did not validate the smoke plugin");
    }
    if (data.authority?.registry_cache_catalog_trust_state !== "unchanged") {
      throw new Error("plugins validate --json smoke missing unchanged-state authority");
    }
    return;
  }

  if (kind === "packDryRun") {
    const packs = JSON.parse(stdout);
    if (!Array.isArray(packs) || packs.length !== 1 || packs[0]?.name !== "orx") {
      throw new Error("npm pack --dry-run did not report one orx package");
    }
    const filePaths = new Set((packs[0].files ?? []).map((file) => file?.path).filter(Boolean));
    for (const required of ["package.json", "README.md", "RELEASE_NOTES.md", "LICENSE", "dist/cli.js"]) {
      if (!filePaths.has(required)) {
        throw new Error(`npm package dry-run missing required file: ${required}`);
      }
    }
    for (const omitted of ["package-lock.json", "tsconfig.json", "scripts/verify-release.mjs"]) {
      if (filePaths.has(omitted)) {
        throw new Error(`npm package dry-run unexpectedly includes ${omitted}`);
      }
    }
    for (const filePath of filePaths) {
      if (
        filePath.startsWith("src/") ||
        filePath.startsWith("memory/") ||
        filePath.startsWith(".orx/") ||
        filePath.startsWith("scripts/")
      ) {
        throw new Error(`npm package dry-run unexpectedly includes private/source path: ${filePath}`);
      }
    }
    return;
  }

  const expected = {
    guide: "ORX",
    codeCalls: "call",
    pluginsReview: "plugin",
    mcpPresets: "context7",
  }[kind];

  if (expected && !stdout.toLowerCase().includes(expected.toLowerCase())) {
    throw new Error(`smoke ${kind} missing ${JSON.stringify(expected)} in stdout:\n${trimOutput(stdout)}`);
  }
}

function formatFailure(command, args, result) {
  return [
    `command failed: ${formatCommand(command, args)}`,
    `exit: ${result.status}`,
    result.signal ? `signal: ${result.signal}` : "",
    result.stdout.trim() ? `stdout:\n${trimOutput(result.stdout)}` : "",
    result.stderr.trim() ? `stderr:\n${trimOutput(result.stderr)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function formatCommand(command, args) {
  return [command, ...args].map((part) => (/\s/.test(part) ? JSON.stringify(part) : part)).join(" ");
}

function trimOutput(text, max = 12000) {
  const trimmed = text.trim();
  if (trimmed.length <= max) {
    return trimmed;
  }
  return `${trimmed.slice(0, max)}\n... truncated ${trimmed.length - max} chars ...`;
}

function formatThrownError(error) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
