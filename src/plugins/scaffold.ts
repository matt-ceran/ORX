import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import {
  pluginManifestId,
  sanitizePluginManifest,
  type PluginComponentKey,
  type PluginManifest,
} from "./manifest.js";

export interface PluginScaffoldOptions {
  cwd?: string;
  targetDirectory: string;
  name?: string;
  publisher?: string;
  version?: string;
  description?: string;
  components?: PluginComponentKey[];
}

export interface PluginScaffoldResult {
  pluginId: string;
  targetDirectory: string;
  manifestPath: string;
  manifest: PluginManifest;
  components: PluginComponentKey[];
  createdPaths: string[];
}

export class PluginScaffoldError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PluginScaffoldError";
  }
}

const DIRECTORY_MODE = 0o755;
const FILE_MODE = 0o644;
const DEFAULT_COMPONENTS: PluginComponentKey[] = ["skills", "commands", "rules"];
const ALL_COMPONENTS: PluginComponentKey[] = [
  "skills",
  "commands",
  "commandSchemas",
  "rules",
  "hooks",
  "mcpServers",
  "bins",
  "assets",
  "docs",
];
const ID_PART_PATTERN = /^[a-z0-9][a-z0-9._-]{0,79}$/;
const VERSION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z.+-]{0,63}$/;
const CONTROL_CHAR_PATTERN = /[\x00-\x1F\x7F]/;
const SECRET_LIKE_PATTERN =
  /\b(?:bearer\s+[A-Za-z0-9._~+/=-]{8,}|authorization:\s*bearer\s+[A-Za-z0-9._~+/=-]{8,}|(?:access[_-]?token|api[_-]?key|token|key|secret)\s*[=:]\s*[A-Za-z0-9._~+/=-]{4,}|sk-or-v1-[A-Za-z0-9_-]+|github_pat_[A-Za-z0-9_]+|ghp_[A-Za-z0-9_]+|glpat-[A-Za-z0-9_-]+|xox[baprs]-[A-Za-z0-9-]+)\b/i;
const COMPONENT_PATHS: Record<PluginComponentKey, string> = {
  skills: "skills",
  commands: "commands",
  commandSchemas: "command-schemas.json",
  rules: "rules",
  hooks: "hooks/hooks.json",
  mcpServers: "mcp.json",
  bins: "bin",
  assets: "assets",
  docs: "docs",
};

export function parsePluginScaffoldArgs(args: string[], cwd = process.cwd()): PluginScaffoldOptions {
  let targetDirectory: string | undefined;
  let name: string | undefined;
  let publisher: string | undefined;
  let version: string | undefined;
  let description: string | undefined;
  let minimal = false;
  const requestedComponents = new Set<PluginComponentKey>();
  let hasExplicitComponents = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? "";
    if (!arg.startsWith("--")) {
      if (targetDirectory) {
        throw new PluginScaffoldError("Usage: orx plugins scaffold <directory> [--name <id>] [--publisher <id>] [--version <version>] [--description <text>] [--with <components>] [--minimal]");
      }
      targetDirectory = arg;
      continue;
    }

    if (arg === "--minimal") {
      minimal = true;
      continue;
    }

    const [rawFlag, inlineValue] = arg.split("=", 2);
    const flag = rawFlag.toLowerCase();
    const value = inlineValue ?? args[index + 1];
    if (typeof value === "undefined" || value.startsWith("--")) {
      throw new PluginScaffoldError(`Missing value for ${rawFlag}.`);
    }
    if (typeof inlineValue === "undefined") {
      index += 1;
    }

    if (flag === "--name") {
      name = value;
    } else if (flag === "--publisher") {
      publisher = value;
    } else if (flag === "--version") {
      version = value;
    } else if (flag === "--description") {
      description = value;
    } else if (flag === "--with") {
      hasExplicitComponents = true;
      for (const component of parseComponentList(value)) {
        requestedComponents.add(component);
      }
    } else {
      throw new PluginScaffoldError(`Unknown scaffold option: ${rawFlag}`);
    }
  }

  if (!targetDirectory) {
    throw new PluginScaffoldError("Usage: orx plugins scaffold <directory> [--name <id>] [--publisher <id>] [--version <version>] [--description <text>] [--with <components>] [--minimal]");
  }

  if (minimal && hasExplicitComponents) {
    throw new PluginScaffoldError("Use either --minimal or --with, not both.");
  }

  return {
    cwd,
    targetDirectory,
    name,
    publisher,
    version,
    description,
    components: hasExplicitComponents
      ? sortComponents([...DEFAULT_COMPONENTS, ...requestedComponents])
      : minimal
        ? []
        : [...DEFAULT_COMPONENTS],
  };
}

export function scaffoldPlugin(options: PluginScaffoldOptions): PluginScaffoldResult {
  const cwd = options.cwd ?? process.cwd();
  const targetDirectory = resolve(cwd, requiredSafeText(options.targetDirectory, "directory", 1, 2048));
  assertTargetDirectoryAvailable(targetDirectory);
  mkdirSync(targetDirectory, { recursive: true, mode: DIRECTORY_MODE });

  const name = sanitizeIdPart(options.name ?? slugifyId(basename(targetDirectory)) ?? "demo-plugin", "name");
  const publisher = sanitizeIdPart(options.publisher ?? "local", "publisher");
  const version = sanitizeVersion(options.version ?? "0.1.0");
  const description =
    optionalSafeText(options.description, "description", 1, 500) ??
    `Local ORX plugin scaffold for ${name}.`;
  const components = sortComponents(options.components ?? DEFAULT_COMPONENTS);
  const manifest = sanitizePluginManifest({
    schemaVersion: "1",
    name,
    version,
    description,
    publisher,
    source: {
      type: "local",
      path: ".",
    },
    metadata: {
      trustTier: "local",
      runtime: {
        node: ">=20",
        notes: "Generated by ORX plugin scaffold; review generated files before installing or enabling.",
      },
    },
    components: Object.fromEntries(
      components.map((component) => [component, COMPONENT_PATHS[component]]),
    ),
    permissions: {
      filesystem: [],
      network: [],
      env: [],
      mcp: [],
    },
  });

  const createdPaths: string[] = [];
  const writeJson = (path: string, value: unknown) => {
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: FILE_MODE });
    createdPaths.push(path);
  };
  const writeText = (path: string, value: string) => {
    writeFileSync(path, value, { encoding: "utf8", mode: FILE_MODE });
    createdPaths.push(path);
  };
  const ensureDirectory = (path: string) => {
    mkdirSync(path, { recursive: true, mode: DIRECTORY_MODE });
  };

  const manifestPath = join(targetDirectory, "orx-plugin.json");
  writeJson(manifestPath, manifest);

  if (components.includes("skills")) {
    const directory = join(targetDirectory, "skills");
    ensureDirectory(directory);
    writeText(
      join(directory, "SKILL.md"),
      [
        "---",
        `name: ${titleFromId(name)} Skill`,
        "description: Replace this with concise activation guidance for this ORX plugin skill.",
        "---",
        "",
        `# ${titleFromId(name)} Skill`,
        "",
        "Describe when this skill should be used and the workflow ORX should follow after the operator activates it.",
        "",
      ].join("\n"),
    );
  }

  if (components.includes("commands")) {
    const directory = join(targetDirectory, "commands");
    ensureDirectory(directory);
    writeText(
      join(directory, "example.md"),
      [
        "---",
        "name: Example Prompt",
        "description: Replace this with an operator-activated plugin prompt.",
        "---",
        "",
        "# Example Prompt",
        "",
        "Write plugin prompt context here. ORX treats activated plugin prompt content as untrusted context.",
        "",
      ].join("\n"),
    );
  }

  if (components.includes("rules")) {
    const directory = join(targetDirectory, "rules");
    ensureDirectory(directory);
    writeText(
      join(directory, "example.md"),
      [
        "---",
        "name: Example Rule",
        "description: Replace this with advisory plugin rule guidance.",
        "---",
        "",
        "# Example Rule",
        "",
        "Write advisory rule context here. Rules cannot grant tool permissions, enable MCP, trust hooks, or run bins.",
        "",
      ].join("\n"),
    );
  }

  if (components.includes("hooks")) {
    const directory = join(targetDirectory, "hooks");
    ensureDirectory(directory);
    writeJson(join(directory, "hooks.json"), { hooks: {} });
  }

  if (components.includes("mcpServers")) {
    writeJson(join(targetDirectory, "mcp.json"), { servers: {} });
  }

  if (components.includes("commandSchemas")) {
    writeJson(join(targetDirectory, "command-schemas.json"), { commands: {} });
  }

  if (components.includes("bins")) {
    ensureDirectory(join(targetDirectory, "bin"));
  }

  if (components.includes("assets")) {
    const directory = join(targetDirectory, "assets");
    ensureDirectory(directory);
    writeText(join(directory, "README.md"), "# Assets\n\nPlace non-executable plugin assets here.\n");
  }

  if (components.includes("docs")) {
    const directory = join(targetDirectory, "docs");
    ensureDirectory(directory);
    writeText(join(directory, "README.md"), "# Plugin Docs\n\nDocument local usage, trust requirements, and review notes here.\n");
  }

  return {
    pluginId: pluginManifestId(manifest),
    targetDirectory,
    manifestPath,
    manifest,
    components,
    createdPaths,
  };
}

export function renderPluginScaffoldResult(result: PluginScaffoldResult): string {
  const relativeCreated = result.createdPaths
    .map((path) => path.slice(result.targetDirectory.length + 1))
    .sort((left, right) => left.localeCompare(right));
  return [
    `Plugin scaffolded: ${result.pluginId}`,
    `  directory: ${result.targetDirectory}`,
    `  manifest: ${result.manifestPath}`,
    `  components: ${result.components.length > 0 ? result.components.join(",") : "none"}`,
    "  registry_state: unchanged",
    "  execution_state: disabled; hooks, bins, command schemas, and MCP require the normal ORX review gates after install",
    "  created:",
    ...relativeCreated.map((path) => `    - ${path}`),
    "  next:",
    `    - review ${result.manifestPath}`,
    `    - orx plugins validate ${result.targetDirectory}`,
    `    - orx plugins install ${result.targetDirectory}`,
  ].join("\n");
}

function parseComponentList(value: string): PluginComponentKey[] {
  const normalized = requiredSafeText(value, "components", 1, 500);
  const components: PluginComponentKey[] = [];
  for (const entry of normalized.split(",").map((part) => part.trim()).filter(Boolean)) {
    if (entry.toLowerCase() === "none") {
      continue;
    }
    if (entry.toLowerCase() === "all") {
      components.push(...ALL_COMPONENTS);
      continue;
    }
    components.push(normalizeComponent(entry));
  }
  return sortComponents(components);
}

function normalizeComponent(value: string): PluginComponentKey {
  const normalized = value.toLowerCase().replace(/_/g, "-");
  if (normalized === "skills") {
    return "skills";
  }
  if (normalized === "commands" || normalized === "prompts") {
    return "commands";
  }
  if (normalized === "rules") {
    return "rules";
  }
  if (normalized === "hooks") {
    return "hooks";
  }
  if (normalized === "bins" || normalized === "bin") {
    return "bins";
  }
  if (normalized === "mcp" || normalized === "mcp-servers" || normalized === "mcpservers") {
    return "mcpServers";
  }
  if (
    normalized === "command-schemas" ||
    normalized === "commandschemas" ||
    normalized === "exec" ||
    normalized === "exec-commands"
  ) {
    return "commandSchemas";
  }
  if (normalized === "assets") {
    return "assets";
  }
  if (normalized === "docs") {
    return "docs";
  }
  throw new PluginScaffoldError(`Unknown scaffold component: ${value}`);
}

function sortComponents(components: PluginComponentKey[]): PluginComponentKey[] {
  const requested = new Set(components);
  return ALL_COMPONENTS.filter((component) => requested.has(component));
}

function assertTargetDirectoryAvailable(targetDirectory: string): void {
  if (!existsSync(targetDirectory)) {
    return;
  }

  const stat = lstatSync(targetDirectory);
  if (!stat.isDirectory()) {
    throw new PluginScaffoldError("Plugin scaffold target exists and is not a directory.");
  }
  if (readdirSync(targetDirectory).length > 0) {
    throw new PluginScaffoldError("Plugin scaffold target directory must be empty.");
  }
}

function sanitizeIdPart(value: string, field: string): string {
  const normalized = requiredSafeText(value, field, 1, 80).toLowerCase();
  if (!ID_PART_PATTERN.test(normalized)) {
    throw new PluginScaffoldError(`${field} must use lowercase letters, numbers, dots, underscores, or dashes.`);
  }
  return normalized;
}

function sanitizeVersion(value: string): string {
  const version = requiredSafeText(value, "version", 1, 64);
  if (!VERSION_PATTERN.test(version)) {
    throw new PluginScaffoldError("version contains unsupported characters.");
  }
  return version;
}

function optionalSafeText(
  value: string | undefined,
  field: string,
  minimum: number,
  maximum: number,
): string | undefined {
  if (typeof value === "undefined") {
    return undefined;
  }
  return requiredSafeText(value, field, minimum, maximum);
}

function requiredSafeText(value: string, field: string, minimum: number, maximum: number): string {
  const trimmed = value.trim();
  if (trimmed.length < minimum || trimmed.length > maximum) {
    throw new PluginScaffoldError(`${field} must be ${minimum}-${maximum} characters.`);
  }
  if (CONTROL_CHAR_PATTERN.test(trimmed)) {
    throw new PluginScaffoldError(`${field} contains a control character.`);
  }
  if (SECRET_LIKE_PATTERN.test(trimmed)) {
    throw new PluginScaffoldError(`${field} must not contain secret-like values.`);
  }
  return trimmed;
}

function slugifyId(value: string): string | undefined {
  const lower = value.toLowerCase();
  const slug = lower
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[^a-z0-9]+/, "")
    .replace(/[^a-z0-9]+$/, "")
    .slice(0, 80);
  return ID_PART_PATTERN.test(slug) ? slug : undefined;
}

function titleFromId(value: string): string {
  return value
    .split(/[._-]+/g)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ") || "Plugin";
}
