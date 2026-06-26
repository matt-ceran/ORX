import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { GitRepositoryMetadata } from "./types.js";

const execFileAsync = promisify(execFile);
const GIT_METADATA_TIMEOUT_MS = 1_000;
const GIT_METADATA_MAX_BUFFER = 256 * 1024;

export async function resolveGitRepositoryMetadata(
  cwd: string,
): Promise<GitRepositoryMetadata | undefined> {
  const root = await git(cwd, ["rev-parse", "--show-toplevel"]);
  if (!root) {
    return undefined;
  }

  const [branch, commit, remoteUrl, status] = await Promise.all([
    git(cwd, ["branch", "--show-current"]),
    git(cwd, ["rev-parse", "HEAD"]),
    git(cwd, ["config", "--get", "remote.origin.url"]),
    git(cwd, ["status", "--porcelain=v1"]),
  ]);

  return {
    root,
    branch: branch || undefined,
    commit: commit || undefined,
    remoteUrl: redactRemoteUrl(remoteUrl),
    dirty: Boolean(status),
  };
}

export function redactRemoteUrl(remoteUrl: string | undefined): string | undefined {
  if (!remoteUrl) {
    return undefined;
  }

  try {
    const url = new URL(remoteUrl);
    const isHttp = url.protocol === "http:" || url.protocol === "https:";
    if ((isHttp && (url.username || url.password)) || url.password) {
      url.username = "REDACTED";
      url.password = "";
    }
    return url.toString();
  } catch {
    return remoteUrl.replace(
      /^([A-Za-z][A-Za-z0-9+.-]*:\/\/)([^/@\s]+)@/,
      "$1REDACTED@",
    );
  }
}

async function git(cwd: string, args: string[]): Promise<string | undefined> {
  try {
    const result = await execFileAsync("git", args, {
      cwd,
      timeout: GIT_METADATA_TIMEOUT_MS,
      maxBuffer: GIT_METADATA_MAX_BUFFER,
      encoding: "utf8",
    });
    return String(result.stdout).trim();
  } catch {
    return undefined;
  }
}
