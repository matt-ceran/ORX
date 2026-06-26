import { lstat, readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { runProcess } from "./process.js";
import { errorFromUnknown, resolveToolPath } from "./path.js";
import type { ToolResult } from "./types.js";

export interface SearchFilesOptions {
  pattern: string;
  path?: string;
  cwd?: string;
  maxMatches?: number;
  useRipgrep?: boolean;
  rgPath?: string;
}

export interface SearchMatch {
  path: string;
  line: number;
  column: number;
  text: string;
}

export type SearchFilesResult = ToolResult<{
  pattern: string;
  path: string;
  matches: SearchMatch[];
  engine: "rg" | "fallback";
  truncated: boolean;
}>;

export async function searchFilesTool(options: SearchFilesOptions): Promise<SearchFilesResult> {
  const cwd = options.cwd ?? process.cwd();
  const searchPath = resolveToolPath(options.path ?? ".", cwd);
  const maxMatches = options.maxMatches ?? 100;

  if (!Number.isInteger(maxMatches) || maxMatches < 1) {
    return {
      ok: false,
      error: {
        code: "EINVAL",
        message: "maxMatches must be a positive integer.",
        path: searchPath,
      },
    };
  }

  try {
    await lstat(searchPath);
  } catch (error) {
    return {
      ok: false,
      error: errorFromUnknown(error, "SEARCH_PATH_ERROR", searchPath),
    };
  }

  if (options.useRipgrep !== false) {
    const rgResult = await searchWithRipgrep({
      pattern: options.pattern,
      path: options.path ?? ".",
      cwd,
      maxMatches,
      rgPath: options.rgPath ?? "rg",
    });

    if (rgResult.ok || rgResult.error.code !== "ENOENT") {
      return rgResult;
    }
  }

  return searchWithFallback({
    pattern: options.pattern,
    path: searchPath,
    cwd,
    maxMatches,
  });
}

async function searchWithRipgrep(options: {
  pattern: string;
  path: string;
  cwd: string;
  maxMatches: number;
  rgPath: string;
}): Promise<SearchFilesResult> {
  const result = await runProcess({
    command: options.rgPath,
    args: [
      "--json",
      "--color",
      "never",
      "--max-count",
      String(options.maxMatches),
      "--",
      options.pattern,
      options.path,
    ],
    cwd: options.cwd,
    shell: false,
    maxBytes: 2 * 1024 * 1024,
  });

  if (result.error) {
    return {
      ok: false,
      error: result.error,
    };
  }

  if (result.exitCode !== 0 && result.exitCode !== 1) {
    return {
      ok: false,
      error: {
        code: "RG_ERROR",
        message: result.stderr.trim() || `rg exited with code ${result.exitCode}.`,
      },
    };
  }

  const matches: SearchMatch[] = [];
  try {
    for (const line of result.stdout.split("\n")) {
      if (!line.trim()) {
        continue;
      }
      const event = JSON.parse(line) as RipgrepEvent;
      if (event.type !== "match") {
        continue;
      }

      matches.push({
        path: normalizeMatchPath(event.data.path.text, options.cwd),
        line: event.data.line_number,
        column: event.data.submatches[0]?.start + 1 || 1,
        text: event.data.lines.text.replace(/\r?\n$/, ""),
      });

      if (matches.length >= options.maxMatches) {
        break;
      }
    }
  } catch (error) {
    return {
      ok: false,
      error: errorFromUnknown(error, "RG_PARSE_ERROR"),
    };
  }

  return {
    ok: true,
    pattern: options.pattern,
    path: resolveToolPath(options.path, options.cwd),
    matches,
    engine: "rg",
    truncated: matches.length >= options.maxMatches,
  };
}

async function searchWithFallback(options: {
  pattern: string;
  path: string;
  cwd: string;
  maxMatches: number;
}): Promise<SearchFilesResult> {
  let regex: RegExp;
  try {
    regex = new RegExp(options.pattern);
  } catch (error) {
    return {
      ok: false,
      error: errorFromUnknown(error, "INVALID_PATTERN", options.path),
    };
  }

  const matches: SearchMatch[] = [];

  try {
    await visitSearchPath(
      options.path,
      async (filePath) => {
        if (matches.length >= options.maxMatches) {
          return;
        }

        const buffer = await readFile(filePath);
        if (buffer.includes(0)) {
          return;
        }

        const lines = buffer.toString("utf8").split(/\r\n|\n|\r/);
        for (let index = 0; index < lines.length; index += 1) {
          const line = lines[index];
          const match = regex.exec(line);
          regex.lastIndex = 0;
          if (!match) {
            continue;
          }

          matches.push({
            path: normalizeMatchPath(filePath, options.cwd),
            line: index + 1,
            column: (match.index ?? 0) + 1,
            text: line,
          });

          if (matches.length >= options.maxMatches) {
            break;
          }
        }
      },
      () => matches.length >= options.maxMatches,
    );
  } catch (error) {
    return {
      ok: false,
      error: errorFromUnknown(error, "SEARCH_ERROR", options.path),
    };
  }

  return {
    ok: true,
    pattern: options.pattern,
    path: options.path,
    matches,
    engine: "fallback",
    truncated: matches.length >= options.maxMatches,
  };
}

async function visitSearchPath(
  path: string,
  onFile: (path: string) => Promise<void>,
  shouldStop: () => boolean,
): Promise<void> {
  if (shouldStop()) {
    return;
  }

  const stat = await lstat(path);
  if (stat.isFile()) {
    await onFile(path);
    return;
  }

  if (!stat.isDirectory()) {
    return;
  }

  const children = await readdir(path, { withFileTypes: true });
  children.sort((left, right) => left.name.localeCompare(right.name));

  for (const child of children) {
    if (shouldStop()) {
      return;
    }
    if (child.name === ".git" || child.name === "node_modules") {
      continue;
    }
    await visitSearchPath(join(path, child.name), onFile, shouldStop);
  }
}

function normalizeMatchPath(path: string, cwd: string): string {
  const relativePath = path.startsWith("/") ? relative(cwd, path) || "." : path;
  return relativePath.startsWith("./") ? relativePath.slice(2) : relativePath;
}

interface RipgrepEvent {
  type: string;
  data: {
    path: {
      text: string;
    };
    lines: {
      text: string;
    };
    line_number: number;
    submatches: Array<{
      start: number;
      end: number;
      match: {
        text: string;
      };
    }>;
  };
}
