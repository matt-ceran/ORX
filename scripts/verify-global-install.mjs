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
const sessionDir = join(tempRoot, "sessions");
const mcpConfigPath = join(tempRoot, "mcp", "profiles.json");
const pluginRegistryPath = join(tempRoot, "plugins", "registry.json");

const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";
const orxBin =
  process.platform === "win32" ? join(prefixDir, "orx.cmd") : join(prefixDir, "bin", "orx");

try {
  copySourceTree();
  mkdirSync(prefixDir, { recursive: true });
  mkdirSync(outsideCwd, { recursive: true });
  mkdirSync(homeDir, { recursive: true });
  mkdirSync(sessionDir, { recursive: true });
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
    ...process.env,
    HOME: homeDir,
    USERPROFILE: homeDir,
    OPENROUTER_API_KEY: "",
    ORX_SESSION_DIR: sessionDir,
    ORX_MCP_CONFIG_PATH: mcpConfigPath,
    ORX_PLUGIN_REGISTRY_PATH: pluginRegistryPath,
    NO_COLOR: "1",
    ...overrides,
  };
}

function assertIncludes(text, expected, message) {
  if (!text.includes(expected)) {
    throw new Error(`${message}: missing ${JSON.stringify(expected)} in ${JSON.stringify(text)}`);
  }
}
