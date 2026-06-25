#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BIN_NAME } from "./constants.js";
import { loadConfig, validateApiKey } from "./config/index.js";
import { formatStatus } from "./status.js";

interface PackageJson {
  version: string;
}

interface CliResult {
  exitCode: number;
  output?: string;
  error?: string;
}

export function runCli(argv: string[], env: NodeJS.ProcessEnv = process.env): CliResult {
  const args = argv.slice(2);
  const first = args[0];

  if (!first || first === "help" || first === "--help" || first === "-h") {
    return {
      exitCode: 0,
      output: helpText(),
    };
  }

  if (first === "--version" || first === "-v" || first === "version") {
    return {
      exitCode: 0,
      output: getVersion(),
    };
  }

  if (first === "status") {
    const loadedConfig = loadConfig({ env });
    return {
      exitCode: 0,
      output: formatStatus({
        cwd: process.cwd(),
        loadedConfig,
      }),
    };
  }

  const loadedConfig = loadConfig({ env });
  const apiKeyError = validateApiKey(loadedConfig);
  if (apiKeyError) {
    return {
      exitCode: 1,
      error: apiKeyError,
    };
  }

  return {
    exitCode: 1,
    error: `Unknown command: ${first}\n\n${helpText()}`,
  };
}

function helpText(): string {
  return [
    "ORX",
    "",
    "OpenRouter-native terminal coding agent.",
    "",
    "Usage:",
    `  ${BIN_NAME} [command] [options]`,
    "",
    "Commands:",
    "  status        Show runtime status and config defaults",
    "  help          Show this help message",
    "  version       Show the current version",
    "",
    "Options:",
    "  -h, --help    Show this help message",
    "  -v, --version Show the current version",
  ].join("\n");
}

function getVersion(): string {
  const packagePath = join(dirname(fileURLToPath(import.meta.url)), "..", "package.json");
  const packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as PackageJson;
  return packageJson.version;
}

const result = runCli(process.argv);

if (result.output) {
  console.log(result.output);
}

if (result.error) {
  console.error(result.error);
}

process.exitCode = result.exitCode;
