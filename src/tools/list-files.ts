import { lstat, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { errorFromUnknown, resolveToolPath } from "./path.js";
import type { FileType, ToolResult } from "./types.js";

export interface ListFilesOptions {
  path: string;
  cwd?: string;
  recursive?: boolean;
  maxDepth?: number;
  maxEntries?: number;
}

export interface ListedFile {
  path: string;
  name: string;
  type: FileType;
  sizeBytes?: number;
  depth: number;
}

export type ListFilesResult = ToolResult<{
  path: string;
  entries: ListedFile[];
  truncated: boolean;
}>;

export async function listFilesTool(options: ListFilesOptions): Promise<ListFilesResult> {
  const rootPath = resolveToolPath(options.path, options.cwd);
  const recursive = options.recursive ?? false;
  const maxDepth = options.maxDepth ?? (recursive ? Number.POSITIVE_INFINITY : 1);
  const maxEntries = options.maxEntries ?? 1_000;

  if (!Number.isInteger(maxEntries) || maxEntries < 1) {
    return invalidOption("maxEntries must be a positive integer.", rootPath);
  }

  if (maxDepth !== Number.POSITIVE_INFINITY && (!Number.isInteger(maxDepth) || maxDepth < 1)) {
    return invalidOption("maxDepth must be a positive integer when provided.", rootPath);
  }

  try {
    const rootStat = await lstat(rootPath);
    if (!rootStat.isDirectory()) {
      return {
        ok: false,
        error: {
          code: "ENOTDIR",
          message: `Path is not a directory: ${rootPath}`,
          path: rootPath,
        },
      };
    }

    const entries: ListedFile[] = [];
    let truncated = false;

    async function visit(directory: string, depth: number): Promise<void> {
      if (truncated) {
        return;
      }

      const children = await readdir(directory, { withFileTypes: true });
      children.sort((left, right) => left.name.localeCompare(right.name));

      for (const child of children) {
        if (entries.length >= maxEntries) {
          truncated = true;
          return;
        }

        const absolutePath = join(directory, child.name);
        const childStat = await lstat(absolutePath);
        const entryDepth = depth + 1;
        const entry: ListedFile = {
          path: relative(rootPath, absolutePath) || child.name,
          name: child.name,
          type: fileType(childStat),
          sizeBytes: childStat.size,
          depth: entryDepth,
        };
        entries.push(entry);

        if (recursive && childStat.isDirectory() && entryDepth < maxDepth) {
          await visit(absolutePath, entryDepth);
        }
      }
    }

    await visit(rootPath, 0);

    return {
      ok: true,
      path: rootPath,
      entries,
      truncated,
    };
  } catch (error) {
    return {
      ok: false,
      error: errorFromUnknown(error, "LIST_FILES_ERROR", rootPath),
    };
  }
}

function fileType(stat: Awaited<ReturnType<typeof lstat>>): FileType {
  if (stat.isFile()) {
    return "file";
  }
  if (stat.isDirectory()) {
    return "directory";
  }
  if (stat.isSymbolicLink()) {
    return "symlink";
  }
  return "other";
}

function invalidOption(message: string, path: string): ListFilesResult {
  return {
    ok: false,
    error: {
      code: "EINVAL",
      message,
      path,
    },
  };
}
