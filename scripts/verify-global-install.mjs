#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = mkdtempSync(join(tmpdir(), "orx-global-install-"));
const sourceDir = join(tempRoot, "source");
const prefixDir = join(tempRoot, "prefix");
const outsideCwd = join(tempRoot, "outside");
const homeDir = join(tempRoot, "home");
const authEnvDir = join(tempRoot, "auth");
const sessionDir = join(tempRoot, "sessions");
const profileConfigPath = join(tempRoot, "profiles.json");
const chatHistoryPath = join(tempRoot, "history.json");
const mcpDir = join(tempRoot, "mcp");
const mcpConfigPath = join(tempRoot, "mcp", "profiles.json");
const mcpProfileCatalogPath = join(tempRoot, "mcp", "profile-catalog.json");
const mcpAuthEnvDir = join(tempRoot, "mcp", "auth-env");
const pluginDir = join(tempRoot, "plugins");
const pluginRegistryPath = join(tempRoot, "plugins", "registry.json");
const pluginCacheDir = join(tempRoot, "plugins", "cache");
const pluginCatalogPath = join(tempRoot, "plugins", "catalog.json");
const pluginBinsConfigPath = join(tempRoot, "plugins", "bins.json");
const pluginHooksConfigPath = join(tempRoot, "plugins", "hooks.json");
const delegationDir = join(tempRoot, "delegation");
const delegationTeamConfigPath = join(tempRoot, "delegation", "teams.json");
const delegationPolicyPath = join(tempRoot, "delegation", "policy.json");
const auditDir = join(tempRoot, "audit");
const mcpAuditLogPath = join(tempRoot, "audit", "mcp.jsonl");
const pluginBinsAuditLogPath = join(tempRoot, "audit", "bins.jsonl");
const pluginHooksAuditLogPath = join(tempRoot, "audit", "hooks.jsonl");
const delegationAuditLogPath = join(tempRoot, "audit", "delegation.jsonl");
const configPath = join(tempRoot, "config.toml");

const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";
const orxBin =
  process.platform === "win32" ? join(prefixDir, "orx.cmd") : join(prefixDir, "bin", "orx");

try {
  copySourceTree();
  mkdirSync(prefixDir, { recursive: true });
  mkdirSync(outsideCwd, { recursive: true });
  mkdirSync(homeDir, { recursive: true });
  mkdirSync(sessionDir, { recursive: true });
  mkdirSync(authEnvDir, { recursive: true });
  mkdirSync(mcpDir, { recursive: true });
  mkdirSync(mcpAuthEnvDir, { recursive: true });
  mkdirSync(pluginDir, { recursive: true });
  mkdirSync(pluginCacheDir, { recursive: true });
  mkdirSync(delegationDir, { recursive: true });
  mkdirSync(auditDir, { recursive: true });
  const realOutsideCwd = realpathSync(outsideCwd);

  run(npmBin, ["install", "-g", sourceDir, "--prefix", prefixDir, "--no-audit", "--no-fund"], {
    cwd: outsideCwd,
  });

  if (!existsSync(join(sourceDir, "dist", "cli.js"))) {
    throw new Error("local source install did not build dist/cli.js");
  }

  const version = run(orxBin, ["--version"], { cwd: outsideCwd }).stdout.trim();
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`unexpected orx --version output: ${version}`);
  }

  const status = run(orxBin, ["status"], { cwd: outsideCwd, env: childEnv() }).stdout;
  assertIncludes(status, "api_key_present: no", "orx status should run without an API key");
  assertIncludes(status, `cwd: ${realOutsideCwd}`, "orx status should use the caller cwd");

  const chat = run(orxBin, [], {
    cwd: outsideCwd,
    env: childEnv({ OPENROUTER_API_KEY: "test-key" }),
    input: "/exit\n",
  }).stdout;
  assertIncludes(chat, "ORX chat", "no-arg orx should launch chat");
  assertIncludes(chat, "Exiting ORX chat", "no-arg orx should accept /exit");

  const sessionFiles = readdirSync(sessionDir).filter((file) => file.endsWith(".json"));
  if (sessionFiles.length !== 1) {
    throw new Error(`expected one chat session file, found ${sessionFiles.length}`);
  }

  const session = JSON.parse(readFileSync(join(sessionDir, sessionFiles[0]), "utf8"));
  if (session.cwd !== realOutsideCwd) {
    throw new Error(`expected chat session cwd ${realOutsideCwd}, found ${session.cwd}`);
  }

  console.log("global install verification passed");
  console.log(`orx --version: ${version}`);
  console.log(`prefix: ${prefixDir}`);
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

function copySourceTree() {
  mkdirSync(sourceDir, { recursive: true });

  for (const entry of ["package.json", "package-lock.json", "README.md", "tsconfig.json", "src"]) {
    cpSync(join(repoRoot, entry), join(sourceDir, entry), { recursive: true });
  }

  const nodeModulesPath = join(repoRoot, "node_modules");
  if (!existsSync(nodeModulesPath)) {
    throw new Error("node_modules is required for the source install prepare build. Run npm install first.");
  }

  symlinkSync(
    nodeModulesPath,
    join(sourceDir, "node_modules"),
    process.platform === "win32" ? "junction" : "dir",
  );
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    env: options.env ?? childEnv(),
    input: options.input,
    encoding: "utf8",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      [
        `command failed: ${command} ${args.join(" ")}`,
        `exit: ${result.status}`,
        result.stdout.trim() ? `stdout:\n${result.stdout.trim()}` : "",
        result.stderr.trim() ? `stderr:\n${result.stderr.trim()}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  return result;
}

function childEnv(overrides = {}) {
  return {
    ...baseEnv(),
    HOME: homeDir,
    USERPROFILE: homeDir,
    OPENROUTER_API_KEY: "",
    BRAVE_SEARCH_API_KEY: "",
    ORX_CONFIG_PATH: configPath,
    ORX_AUTH_ENV_DIR: authEnvDir,
    ORX_SESSION_DIR: sessionDir,
    ORX_CHAT_HISTORY_PATH: chatHistoryPath,
    ORX_PROFILE_CONFIG_PATH: profileConfigPath,
    ORX_MCP_CONFIG_PATH: mcpConfigPath,
    ORX_MCP_PROFILE_CATALOG_PATH: mcpProfileCatalogPath,
    ORX_MCP_AUTH_ENV_DIR: mcpAuthEnvDir,
    ORX_MCP_AUDIT_PATH: mcpAuditLogPath,
    ORX_MCP_KEYCHAIN: "",
    ORX_PLUGIN_REGISTRY_PATH: pluginRegistryPath,
    ORX_PLUGIN_CACHE_DIR: pluginCacheDir,
    ORX_PLUGIN_CATALOG_PATH: pluginCatalogPath,
    ORX_PLUGIN_BINS_CONFIG_PATH: pluginBinsConfigPath,
    ORX_PLUGIN_BINS_AUDIT_PATH: pluginBinsAuditLogPath,
    ORX_PLUGIN_HOOKS_CONFIG_PATH: pluginHooksConfigPath,
    ORX_PLUGIN_HOOKS_AUDIT_PATH: pluginHooksAuditLogPath,
    ORX_DELEGATION_TEAMS_PATH: delegationTeamConfigPath,
    ORX_DELEGATION_POLICY_PATH: delegationPolicyPath,
    ORX_DELEGATION_AUDIT_PATH: delegationAuditLogPath,
    NPM_CONFIG_AUDIT: "false",
    NPM_CONFIG_FUND: "false",
    NO_COLOR: "1",
    ...overrides,
  };
}

function baseEnv() {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) {
      continue;
    }
    if (key.startsWith("ORX_") || key === "OPENROUTER_API_KEY" || key === "BRAVE_SEARCH_API_KEY") {
      continue;
    }
    env[key] = value;
  }
  return env;
}

function assertIncludes(text, expected, message) {
  if (!text.includes(expected)) {
    throw new Error(`${message}: missing ${JSON.stringify(expected)} in ${JSON.stringify(text)}`);
  }
}
