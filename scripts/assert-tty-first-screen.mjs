#!/usr/bin/env node
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { Readable } from "node:stream";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = mkdtempSync(join(tmpdir(), "orx-tty-first-screen-"));
const cliPath = join(repoRoot, "dist", "cli.js");
const inheritedNoColor = process.env.NO_COLOR;

try {
  mkdirSync(join(tempRoot, "home"), { recursive: true });
  mkdirSync(join(tempRoot, "sessions"), { recursive: true });
  mkdirSync(join(tempRoot, "mcp"), { recursive: true });
  mkdirSync(join(tempRoot, "plugins"), { recursive: true });
  mkdirSync(join(tempRoot, "audit"), { recursive: true });
  mkdirSync(join(tempRoot, "delegation"), { recursive: true });
  mkdirSync(join(tempRoot, "workspace"), { recursive: true });

  const { runCli } = await import(pathToFileURL(cliPath).href);
  const capture = createTtyIo();
  delete process.env.NO_COLOR;
  const exitCode = await runCli(["node", "orx"], smokeEnv(), capture.io);
  if (exitCode !== 0) {
    throw new Error(`expected exit code 0, got ${exitCode}\nstderr:\n${capture.stderr()}`);
  }

  const plain = stripAnsi(capture.stdout()).replace(/\r/g, "");
  const firstLine = plain.split("\n").find((line) => line.trim().length > 0) ?? "";
  const beforeExit = plain.split("• command /exit")[0] ?? plain;

  assertMatch(firstLine, /^ ORX  OpenRouter-native coding workbench/, "first line should be the ORX workbench header");
  assertIncludes(beforeExit, "model    openrouter/auto", "startup card should show model in the grid");
  assertIncludes(beforeExit, "mode     auto", "startup card should show mode in the grid");
  assertIncludes(beforeExit, "perm     never/danger-full", "startup card should show permissions in the grid");
  assertIncludes(beforeExit, "/help commands", "startup card should show keyboard tips");
  assertIncludes(beforeExit, " › ", "composer should show the input band prompt");
  assertMatch(
    beforeExit,
    /openrouter\/auto · auto · .* · never\/danger-full-access/,
    "stats line should show model, mode, and permission stats below the band",
  );
  assertIncludes(capture.stdout(), "\x1b[48;5;254m", "composer band should use the grey TTY background");
  assertMatch(capture.stdout(), /\x1b\[1A\x1b\[4G/, "composer should reposition the cursor into the band");
  assertNotIncludes(beforeExit, "╭─", "flat first screen should not draw box borders");
  assertNotIncludes(beforeExit, "│", "flat first screen should not draw box gutters");
  assertNotIncludes(beforeExit, "ctx ▕", "fresh first screen should not show context meter noise");
  assertNotIncludes(beforeExit, "cwd: ", "TTY first screen should not use the plain status footer");
  assertNotIncludes(capture.stderr(), "test-key", "stderr should not leak the smoke API key");

  console.log("tty first-screen smoke passed");
} finally {
  restoreNoColor(inheritedNoColor);
  rmSync(tempRoot, { recursive: true, force: true });
}

function createTtyIo() {
  let stdoutText = "";
  let stderrText = "";
  const stdin = Readable.from(["/exit\n"]);
  stdin.isTTY = true;
  const stdout = {
    isTTY: true,
    columns: 100,
    write(chunk) {
      stdoutText += String(chunk);
      return true;
    },
  };
  const stderr = {
    isTTY: true,
    columns: 100,
    write(chunk) {
      stderrText += String(chunk);
      return true;
    },
  };

  return {
    io: {
      stdin,
      stdout,
      stderr,
      cwd: join(tempRoot, "workspace"),
      fetch: async () => {
        throw new Error("first-screen smoke should not call fetch");
      },
    },
    stdout: () => stdoutText,
    stderr: () => stderrText,
  };
}

function smokeEnv() {
  return {
    ...process.env,
    HOME: join(tempRoot, "home"),
    USERPROFILE: join(tempRoot, "home"),
    OPENROUTER_API_KEY: "test-key",
    BRAVE_SEARCH_API_KEY: "",
    ORX_CONFIG_PATH: join(tempRoot, "config.toml"),
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
    NO_COLOR: "",
  };
}

function stripAnsi(value) {
  return value.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
}

function restoreNoColor(value) {
  if (value === undefined) {
    delete process.env.NO_COLOR;
  } else {
    process.env.NO_COLOR = value;
  }
}

function assertIncludes(text, expected, message) {
  if (!text.includes(expected)) {
    throw new Error(`${message}: missing ${JSON.stringify(expected)} in ${JSON.stringify(text)}`);
  }
}

function assertNotIncludes(text, expected, message) {
  if (text.includes(expected)) {
    throw new Error(`${message}: found ${JSON.stringify(expected)} in ${JSON.stringify(text)}`);
  }
}

function assertMatch(text, pattern, message) {
  if (!pattern.test(text)) {
    throw new Error(`${message}: ${JSON.stringify(text)} did not match ${String(pattern)}`);
  }
}
