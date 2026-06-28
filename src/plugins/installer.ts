import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { redactSecrets } from "../mcp/audit.js";
import { runProcess } from "../tools/process.js";
import { resolvePluginCacheDirectory } from "./cache.js";
import {
  checkPluginCatalogUpdates,
  formatPluginCatalogIdForMessage,
  resolvePluginInstallTarget,
  type PluginCatalogGitSource,
  type PluginCatalogUpdateStatus,
  type PluginInstallTarget,
} from "./catalog.js";
import {
  pluginManifestId,
  readPluginManifestFile,
  type PluginManifest,
} from "./manifest.js";
import {
  registerPluginManifest,
  type PluginRegisterResult,
  type PluginRegistryIoOptions,
} from "./registry.js";

export interface PluginInstallOptions extends PluginRegistryIoOptions {
  catalogPath?: string;
  cwd?: string;
  gitTimeoutMs?: number;
  now?: () => Date;
}

export interface PluginInstallResult extends PluginRegisterResult {
  sourceMessage?: string;
}

export interface PluginCatalogUpdateApplyResult extends PluginRegisterResult {
  id: string;
  applied: boolean;
  status: PluginCatalogUpdateStatus;
  catalogCommit?: string;
  installedCommit?: string;
  previousEnabled?: boolean;
  sourceMessage?: string;
}

class PluginInstallError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PluginInstallError";
  }
}

const PLUGIN_DIRECTORY_MODE = 0o700;
const PLUGIN_FILE_MODE = 0o600;
const DEFAULT_GIT_TIMEOUT_MS = 120_000;
const GIT_OUTPUT_MAX_BYTES = 16 * 1024;
const GIT_OUTPUT_MAX_LINES = 200;

export async function installPlugin(
  input: string,
  options: PluginInstallOptions = {},
): Promise<PluginInstallResult> {
  const target = resolvePluginInstallTarget(input, {
    cwd: options.cwd,
    catalogPath: options.catalogPath,
  });
  const prepared = await prepareInstallTarget(target, options);

  try {
    const manifest = normalizeCatalogInstallManifest(
      readPluginManifestFile(prepared.manifestPath),
      target,
    );
    validateCatalogInstallManifest(manifest, target);
    if (target.gitSource) {
      writeFileSync(prepared.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
        encoding: "utf8",
        mode: PLUGIN_FILE_MODE,
      });
      chmodSync(prepared.manifestPath, PLUGIN_FILE_MODE);
    }
    const result = registerPluginManifest(prepared.manifestPath, {
      registryPath: options.registryPath,
      cacheDirectory: options.cacheDirectory,
      now: options.now,
    });
    return {
      ...result,
      sourceMessage: formatInstallSourceMessage(target, prepared.manifestPath),
    };
  } finally {
    prepared.cleanup?.();
  }
}

export async function updatePluginFromCatalog(
  id: string,
  options: PluginInstallOptions = {},
): Promise<PluginCatalogUpdateApplyResult> {
  const safeId = formatPluginCatalogIdForMessage(id);
  const report = checkPluginCatalogUpdates({
    catalogPath: options.catalogPath,
    registryPath: options.registryPath,
    ids: [id],
  });
  const candidate = report.entries.find((entry) => entry.id === id);
  if (!candidate) {
    return {
      id,
      applied: false,
      status: "not_installed",
      ok: false,
      message: `Unknown catalog entry: ${safeId}`,
    };
  }

  if (candidate.status !== "update_available") {
    return {
      id,
      applied: false,
      status: candidate.status,
      catalogCommit: candidate.catalogCommit,
      installedCommit: candidate.installedCommit,
      previousEnabled: candidate.enabled,
      ok: false,
      message: `Plugin catalog update not applied for ${formatPluginCatalogIdForMessage(candidate.id)}: ${candidate.message}.`,
    };
  }

  const result = await installPlugin(id, options);
  return {
    ...result,
    id,
    applied: true,
    status: candidate.status,
    catalogCommit: candidate.catalogCommit,
    installedCommit: candidate.installedCommit,
    previousEnabled: candidate.enabled,
  };
}

export function renderPluginCatalogUpdateApplyResult(
  result: PluginCatalogUpdateApplyResult,
): string {
  const safeId = formatPluginCatalogIdForMessage(result.id);
  const lines = [
    "Plugin Catalog Update Apply",
    `  id: ${safeId}`,
    `  applied: ${result.applied ? "yes" : "no"}`,
    `  status: ${result.applied ? "updated" : result.status}`,
    result.installedCommit ? `  previous_commit: ${result.installedCommit.slice(0, 12)}` : undefined,
    result.catalogCommit ? `  catalog_commit: ${result.catalogCommit.slice(0, 12)}` : undefined,
    typeof result.previousEnabled === "boolean"
      ? `  previous_enabled: ${result.previousEnabled ? "yes" : "no"}`
      : undefined,
  ];

  if (result.applied) {
    lines.push(
      "  result_state: registered_disabled",
      result.sourceMessage ? `  source: ${result.sourceMessage}` : undefined,
      `  message: ${result.message}`,
      "  authority:",
      "    catalog_update: explicit_pinned_git_install",
      "    enable_trust_grant_execute: separate_explicit_steps",
    );
  } else {
    lines.push(
      `  message: ${result.message}`,
      "  side_effects: none",
      "  authority:",
      "    install_enable_trust_grant_execute: separate_explicit_steps",
    );
  }

  return lines.filter((line): line is string => typeof line === "string").join("\n");
}

interface PreparedInstallTarget {
  manifestPath: string;
  cleanup?: () => void;
}

async function prepareInstallTarget(
  target: PluginInstallTarget,
  options: PluginInstallOptions,
): Promise<PreparedInstallTarget> {
  if (target.kind !== "git" || !target.gitSource) {
    return {
      manifestPath: target.manifestPath,
    };
  }

  return checkoutCatalogGitSource(target.gitSource, options);
}

async function checkoutCatalogGitSource(
  source: PluginCatalogGitSource,
  options: PluginInstallOptions,
): Promise<PreparedInstallTarget> {
  const sourceDirectory = resolveCatalogSourceDirectory(options);
  mkdirSync(sourceDirectory, { recursive: true, mode: PLUGIN_DIRECTORY_MODE });
  chmodSync(sourceDirectory, PLUGIN_DIRECTORY_MODE);

  const tempRoot = mkdtempSync(join(sourceDirectory, "git-"));
  chmodSync(tempRoot, PLUGIN_DIRECTORY_MODE);
  const checkoutDirectory = join(tempRoot, "checkout");
  let cleanupDone = false;
  const cleanup = () => {
    if (cleanupDone) {
      return;
    }
    cleanupDone = true;
    rmSync(tempRoot, { recursive: true, force: true });
  };

  try {
    await runGit(
      ["clone", "--no-checkout", "--", source.repository, checkoutDirectory],
      {
        cwd: tempRoot,
        operation: "clone plugin git source",
        timeoutMs: options.gitTimeoutMs,
        allowFileProtocol: source.repository.startsWith("file:"),
        allowSshAuth: isSshGitRepository(source.repository),
      },
    );
    await runGit(
      ["-C", checkoutDirectory, "checkout", "--detach", source.resolvedCommit],
      {
        cwd: tempRoot,
        operation: "checkout pinned plugin commit",
        timeoutMs: options.gitTimeoutMs,
        allowFileProtocol: source.repository.startsWith("file:"),
        allowSshAuth: isSshGitRepository(source.repository),
      },
    );
    const resolvedHead = await runGit(
      ["-C", checkoutDirectory, "rev-parse", "HEAD"],
      {
        cwd: tempRoot,
        operation: "verify pinned plugin commit",
        timeoutMs: options.gitTimeoutMs,
        allowFileProtocol: source.repository.startsWith("file:"),
        allowSshAuth: isSshGitRepository(source.repository),
      },
    );
    if (resolvedHead.stdout.trim().toLowerCase() !== source.resolvedCommit.toLowerCase()) {
      throw new PluginInstallError(
        "Plugin git source resolved to a different commit than the catalog pin.",
      );
    }

    return {
      manifestPath: resolveCheckedOutManifestPath(checkoutDirectory, source.manifestPath),
      cleanup,
    };
  } catch (error) {
    cleanup();
    throw error;
  }
}

async function runGit(
  args: string[],
  options: {
    cwd: string;
    operation: string;
    timeoutMs?: number;
    allowFileProtocol?: boolean;
    allowSshAuth?: boolean;
  },
) {
  const configArgs = [
    "-c",
    "protocol.ext.allow=never",
    "-c",
    "advice.detachedHead=false",
  ];
  if (options.allowFileProtocol) {
    configArgs.push("-c", "protocol.file.allow=always");
  }

  const result = await runProcess({
    command: "git",
    args: [...configArgs, ...args],
    cwd: options.cwd,
    shell: false,
    timeoutMs: options.timeoutMs ?? DEFAULT_GIT_TIMEOUT_MS,
    maxBytes: GIT_OUTPUT_MAX_BYTES,
    maxLines: GIT_OUTPUT_MAX_LINES,
    inheritEnv: false,
    env: gitEnvironment(options.cwd, options.allowSshAuth === true),
  });

  if (result.exitCode !== 0 || result.error) {
    const detail = sanitizeGitOutput(
      result.stderr || result.stdout || result.error?.message || "",
    );
    const reason = result.timedOut
      ? ` timed out after ${options.timeoutMs ?? DEFAULT_GIT_TIMEOUT_MS}ms`
      : detail
        ? ` failed: ${detail}`
        : " failed";
    throw new PluginInstallError(`Unable to ${options.operation}; git${reason}.`);
  }

  return result;
}

function resolveCheckedOutManifestPath(
  checkoutDirectory: string,
  relativeManifestPath: string,
): string {
  const base = realpathSync(checkoutDirectory);
  const candidate = resolve(base, relativeManifestPath);
  const relativePath = relative(base, candidate);
  if (!isWithinDirectory(base, candidate)) {
    throw new PluginInstallError("Plugin catalog manifest path escapes the checked-out source.");
  }
  if (!existsSync(candidate)) {
    throw new PluginInstallError(
      `Plugin catalog manifest path was not found: ${relativePath || "."}`,
    );
  }

  const stat = lstatSync(candidate);
  if (!stat.isFile()) {
    throw new PluginInstallError(
      `Plugin catalog manifest path must resolve to a regular file: ${relativePath || "."}`,
    );
  }

  const realCandidate = realpathSync(candidate);
  if (!isWithinDirectory(base, realCandidate)) {
    throw new PluginInstallError("Plugin catalog manifest path escapes the checked-out source.");
  }

  return realCandidate;
}

function validateCatalogInstallManifest(
  manifest: PluginManifest,
  target: PluginInstallTarget,
): void {
  if (!target.catalogEntry) {
    return;
  }

  const manifestId = pluginManifestId(manifest);
  if (manifestId !== target.catalogEntry.id) {
    throw new PluginInstallError(
      `Catalog entry ${target.catalogEntry.id} resolved to manifest ${manifestId}.`,
    );
  }

  if (!target.gitSource) {
    return;
  }

  if (manifest.source.type !== "git") {
    throw new PluginInstallError(
      "Catalog git source resolved to a manifest without git source provenance.",
    );
  }
  if (manifest.source.repository !== target.gitSource.repository) {
    throw new PluginInstallError(
      "Catalog git source repository does not match manifest source.repository.",
    );
  }
  if (
    manifest.source.resolvedCommit?.toLowerCase() !==
    target.gitSource.resolvedCommit.toLowerCase()
  ) {
    throw new PluginInstallError(
      "Catalog git source commit does not match manifest source.resolvedCommit.",
    );
  }
  if (target.gitSource.ref && manifest.source.ref !== target.gitSource.ref) {
    throw new PluginInstallError(
      "Catalog git source ref does not match manifest source.ref.",
    );
  }
}

function normalizeCatalogInstallManifest(
  manifest: PluginManifest,
  target: PluginInstallTarget,
): PluginManifest {
  if (!target.gitSource) {
    return manifest;
  }

  if (
    manifest.source.type === "git" &&
    manifest.source.repository &&
    manifest.source.repository !== target.gitSource.repository
  ) {
    throw new PluginInstallError(
      "Catalog git source repository does not match manifest source.repository.",
    );
  }

  if (
    manifest.source.type === "git" &&
    target.gitSource.ref &&
    manifest.source.ref &&
    manifest.source.ref !== target.gitSource.ref
  ) {
    throw new PluginInstallError(
      "Catalog git source ref does not match manifest source.ref.",
    );
  }

  return {
    ...manifest,
    source: {
      type: "git",
      repository: target.gitSource.repository,
      ref: target.gitSource.ref,
      resolvedCommit: target.gitSource.resolvedCommit,
    },
  };
}

function formatInstallSourceMessage(
  target: PluginInstallTarget,
  manifestPath: string,
): string | undefined {
  if (!target.catalogEntry) {
    return undefined;
  }

  if (target.gitSource) {
    return [
      `Catalog entry ${target.catalogEntry.id} resolved to git source.`,
      `  repository: ${target.gitSource.repository}`,
      `  commit: ${target.gitSource.resolvedCommit}`,
      `  manifest: ${target.gitSource.manifestPath}`,
    ].join("\n");
  }

  return `Catalog entry ${target.catalogEntry.id} resolved to ${manifestPath}.`;
}

function resolveCatalogSourceDirectory(options: PluginInstallOptions): string {
  return join(
    resolvePluginCacheDirectory({
      registryPath: options.registryPath,
      cacheDirectory: options.cacheDirectory,
    }),
    ".sources",
  );
}

function sanitizeGitOutput(text: string): string {
  const withoutControls = text
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[\x00-\x08\x0B-\x1F\x7F]/g, "");
  const redacted = redactSecrets(withoutControls);
  return String(typeof redacted === "string" ? redacted : withoutControls)
    .trim()
    .split(/\r?\n/)
    .slice(0, 4)
    .join(" ")
    .slice(0, 240);
}

function gitEnvironment(homeDirectory: string, allowSshAuth: boolean): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    HOME: homeDirectory,
    XDG_CONFIG_HOME: homeDirectory,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_COUNT: "0",
    GIT_ATTR_NOSYSTEM: "1",
    GIT_LFS_SKIP_SMUDGE: "1",
    GIT_TERMINAL_PROMPT: "0",
    GIT_ASKPASS: "",
    SSH_ASKPASS: "",
    GCM_INTERACTIVE: "never",
  };

  if (allowSshAuth && process.env.SSH_AUTH_SOCK) {
    env.SSH_AUTH_SOCK = process.env.SSH_AUTH_SOCK;
  }
  if (process.platform === "win32") {
    env.SystemRoot = process.env.SystemRoot;
    env.WINDIR = process.env.WINDIR;
  }

  return env;
}

function isSshGitRepository(value: string): boolean {
  if (/^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+:[A-Za-z0-9._~/-]+(?:\.git)?$/.test(value)) {
    return true;
  }
  try {
    return new URL(value).protocol === "ssh:";
  } catch {
    return false;
  }
}

function isWithinDirectory(baseDirectory: string, candidate: string): boolean {
  const relativePath = relative(resolve(baseDirectory), resolve(candidate));
  return Boolean(
    relativePath &&
      relativePath !== ".." &&
      !relativePath.startsWith(`..${sep}`) &&
      !relativePath.startsWith("../"),
  );
}
