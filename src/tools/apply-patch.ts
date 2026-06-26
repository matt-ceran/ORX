import { lstat, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { runProcess } from "./process.js";
import { errorFromUnknown, resolveToolPath } from "./path.js";
import type { ToolResult } from "./types.js";

export interface ApplyPatchOptions {
  patch: string;
  cwd?: string;
}

export type ApplyPatchResult = ToolResult<{
  cwd: string;
  changedFiles: string[];
}>;

export async function applyPatchTool(options: ApplyPatchOptions): Promise<ApplyPatchResult> {
  const cwd = options.cwd ?? process.cwd();
  const patch = options.patch;

  if (!patch.trim()) {
    return {
      ok: false,
      error: {
        code: "EINVAL",
        message: "Patch text is empty.",
      },
    };
  }

  if (patch.trimStart().startsWith("*** Begin Patch")) {
    return applyStructuredPatch(patch, cwd);
  }

  const changedFiles = parseUnifiedPatchFiles(patch);
  const check = await runProcess({
    command: "git",
    args: ["apply", "--check", "--whitespace=nowarn", "-"],
    cwd,
    shell: false,
    stdin: patch,
  });

  if (check.error) {
    return {
      ok: false,
      error: check.error,
    };
  }

  if (check.exitCode !== 0) {
    return {
      ok: false,
      error: {
        code: "PATCH_CHECK_FAILED",
        message: check.stderr.trim() || `git apply --check exited with code ${check.exitCode}.`,
      },
    };
  }

  const apply = await runProcess({
    command: "git",
    args: ["apply", "--whitespace=nowarn", "-"],
    cwd,
    shell: false,
    stdin: patch,
  });

  if (apply.error) {
    return {
      ok: false,
      error: apply.error,
    };
  }

  if (apply.exitCode !== 0) {
    return {
      ok: false,
      error: {
        code: "PATCH_APPLY_FAILED",
        message: apply.stderr.trim() || `git apply exited with code ${apply.exitCode}.`,
      },
    };
  }

  return {
    ok: true,
    cwd,
    changedFiles,
  };
}

function parseUnifiedPatchFiles(patch: string): string[] {
  const files = new Set<string>();

  for (const line of patch.split(/\r?\n/)) {
    const gitMatch = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
    if (gitMatch) {
      files.add(gitMatch[2]);
      continue;
    }

    const newMatch = /^\+\+\+ b\/(.+)$/.exec(line);
    if (newMatch) {
      files.add(newMatch[1]);
      continue;
    }

    const deletedMatch = /^--- a\/(.+)$/.exec(line);
    if (deletedMatch) {
      files.add(deletedMatch[1]);
    }
  }

  return [...files].filter((file) => file !== "/dev/null");
}

async function applyStructuredPatch(patch: string, cwd: string): Promise<ApplyPatchResult> {
  try {
    const operations = parseStructuredPatch(patch);
    const preparedOperations = await prepareStructuredPatchOperations(operations, cwd);
    const changedFiles = new Set<string>();

    for (const operation of preparedOperations) {
      if (operation.kind === "add") {
        await mkdir(dirname(operation.absolutePath), { recursive: true });
        await writeFile(operation.absolutePath, operation.content, { flag: "wx" });
        changedFiles.add(operation.path);
        continue;
      }

      if (operation.kind === "delete") {
        await rm(operation.absolutePath);
        changedFiles.add(operation.path);
        continue;
      }

      await mkdir(dirname(operation.finalPath), { recursive: true });

      if (operation.moveTo) {
        await writeFile(operation.finalPath, operation.content, { flag: "wx" });
        await rm(operation.absolutePath);
        changedFiles.add(operation.moveTo);
      } else {
        await writeFile(operation.finalPath, operation.content);
        changedFiles.add(operation.path);
      }
    }

    return {
      ok: true,
      cwd,
      changedFiles: [...changedFiles],
    };
  } catch (error) {
    return {
      ok: false,
      error: errorFromUnknown(error, "STRUCTURED_PATCH_ERROR"),
    };
  }
}

type PreparedStructuredOperation =
  | {
      kind: "add";
      path: string;
      absolutePath: string;
      content: string;
    }
  | {
      kind: "delete";
      path: string;
      absolutePath: string;
    }
  | {
      kind: "update";
      path: string;
      moveTo?: string;
      absolutePath: string;
      finalPath: string;
      content: string;
    };

async function prepareStructuredPatchOperations(
  operations: StructuredOperation[],
  cwd: string,
): Promise<PreparedStructuredOperation[]> {
  const preparedOperations: PreparedStructuredOperation[] = [];
  const plannedWrites = new Set<string>();
  const plannedDeletes = new Set<string>();

  for (const operation of operations) {
    if (operation.kind === "add") {
      const absolutePath = resolveToolPath(operation.path, cwd);
      if (await pathExists(absolutePath)) {
        throw new Error(`Cannot add existing file: ${operation.path}`);
      }
      reservePlannedPath(absolutePath, operation.path, plannedWrites, "write");
      preparedOperations.push({
        kind: "add",
        path: operation.path,
        absolutePath,
        content: operation.content,
      });
      continue;
    }

    if (operation.kind === "delete") {
      const absolutePath = resolveToolPath(operation.path, cwd);
      await assertPathExists(absolutePath, operation.path);
      reservePlannedPath(absolutePath, operation.path, plannedDeletes, "delete");
      preparedOperations.push({
        kind: "delete",
        path: operation.path,
        absolutePath,
      });
      continue;
    }

    const absolutePath = resolveToolPath(operation.path, cwd);
    await assertPathExists(absolutePath, operation.path);
    if (plannedDeletes.has(absolutePath)) {
      throw new Error(`Cannot update file already planned for deletion: ${operation.path}`);
    }
    const current = await readFile(absolutePath, "utf8");
    let next = current;

    for (const section of operation.sections) {
      next = replaceUniqueLineBlock(next, section.oldLines, section.newLines, operation.path);
    }

    const finalPath = operation.moveTo ? resolveToolPath(operation.moveTo, cwd) : absolutePath;
    if (operation.moveTo && (await pathExists(finalPath))) {
      throw new Error(`Cannot move ${operation.path} to existing file: ${operation.moveTo}`);
    }
    reservePlannedPath(
      finalPath,
      operation.moveTo ?? operation.path,
      plannedWrites,
      "write",
    );
    if (operation.moveTo) {
      reservePlannedPath(absolutePath, operation.path, plannedDeletes, "delete");
    }

    preparedOperations.push({
      kind: "update",
      path: operation.path,
      moveTo: operation.moveTo,
      absolutePath,
      finalPath,
      content: next,
    });
  }

  return preparedOperations;
}

function reservePlannedPath(
  absolutePath: string,
  displayPath: string,
  plannedPaths: Set<string>,
  operation: "write" | "delete",
): void {
  if (plannedPaths.has(absolutePath)) {
    throw new Error(`Structured patch has duplicate ${operation} target: ${displayPath}`);
  }
  plannedPaths.add(absolutePath);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (isNotFoundError(error)) {
      return false;
    }
    throw error;
  }
}

async function assertPathExists(absolutePath: string, displayPath: string): Promise<void> {
  if (!(await pathExists(absolutePath))) {
    throw new Error(`Path does not exist: ${displayPath}`);
  }
}

function isNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string" &&
    error.code === "ENOENT"
  );
}

type StructuredOperation =
  | {
      kind: "add";
      path: string;
      content: string;
    }
  | {
      kind: "delete";
      path: string;
    }
  | {
      kind: "update";
      path: string;
      moveTo?: string;
      sections: Array<{
        oldLines: string[];
        newLines: string[];
      }>;
    };

function parseStructuredPatch(patch: string): StructuredOperation[] {
  const lines = patch.split(/\r?\n/);
  if (lines[0] !== "*** Begin Patch") {
    throw new Error("Structured patch must start with *** Begin Patch.");
  }

  const operations: StructuredOperation[] = [];
  let index = 1;
  let foundEndPatch = false;

  while (index < lines.length) {
    const line = lines[index];
    if (line === "*** End Patch") {
      foundEndPatch = true;
      index += 1;
      break;
    }

    if (line === "") {
      throw new Error("Structured patch ended before *** End Patch.");
    }

    if (line.startsWith("*** Add File: ")) {
      const path = line.slice("*** Add File: ".length);
      const contentLines: string[] = [];
      index += 1;
      while (
        index < lines.length &&
        (!lines[index].startsWith("*** ") || lines[index] === "*** End of File")
      ) {
        if (!lines[index].startsWith("+")) {
          throw new Error(`Invalid add-file line for ${path}: ${lines[index]}`);
        }
        contentLines.push(lines[index].slice(1));
        index += 1;
      }
      operations.push({
        kind: "add",
        path,
        content: `${contentLines.join("\n")}\n`,
      });
      continue;
    }

    if (line.startsWith("*** Delete File: ")) {
      operations.push({
        kind: "delete",
        path: line.slice("*** Delete File: ".length),
      });
      index += 1;
      continue;
    }

    if (line.startsWith("*** Update File: ")) {
      const path = line.slice("*** Update File: ".length);
      let moveTo: string | undefined;
      const sections: Array<{ oldLines: string[]; newLines: string[] }> = [];
      let currentSection = createStructuredSection();
      index += 1;

      if (lines[index]?.startsWith("*** Move to: ")) {
        moveTo = lines[index].slice("*** Move to: ".length);
        index += 1;
      }

      while (index < lines.length && isStructuredChangeLine(lines[index])) {
        const changeLine = lines[index];
        if (changeLine.startsWith("@@")) {
          pushSection(sections, currentSection);
          currentSection = createStructuredSection();
          index += 1;
          continue;
        }
        if (changeLine === "*** End of File") {
          index += 1;
          continue;
        }
        if (changeLine.startsWith(" ")) {
          currentSection.oldLines.push(changeLine.slice(1));
          currentSection.newLines.push(changeLine.slice(1));
        } else if (changeLine.startsWith("-")) {
          currentSection.oldLines.push(changeLine.slice(1));
        } else if (changeLine.startsWith("+")) {
          currentSection.newLines.push(changeLine.slice(1));
        } else if (changeLine !== "") {
          throw new Error(`Invalid update line for ${path}: ${changeLine}`);
        }
        index += 1;
      }

      pushSection(sections, currentSection);
      operations.push({
        kind: "update",
        path,
        moveTo,
        sections,
      });
      continue;
    }

    throw new Error(`Unsupported structured patch line: ${line}`);
  }

  if (!foundEndPatch) {
    throw new Error("Structured patch must end with *** End Patch.");
  }

  for (; index < lines.length; index += 1) {
    if (lines[index].trim() !== "") {
      throw new Error(`Unexpected content after *** End Patch: ${lines[index]}`);
    }
  }

  return operations;
}

function isStructuredChangeLine(line: string): boolean {
  return !line.startsWith("*** ") || line === "*** End of File";
}

function createStructuredSection() {
  return {
    oldLines: [] as string[],
    newLines: [] as string[],
  };
}

function pushSection(
  sections: Array<{ oldLines: string[]; newLines: string[] }>,
  section: { oldLines: string[]; newLines: string[] },
) {
  if (section.oldLines.length > 0 || section.newLines.length > 0) {
    sections.push(section);
  }
}

function replaceUniqueLineBlock(
  content: string,
  oldLines: string[],
  newLines: string[],
  path: string,
): string {
  const lines = content.split("\n");
  const indexes: number[] = [];

  for (let index = 0; index <= lines.length - oldLines.length; index += 1) {
    if (oldLines.every((line, offset) => lines[index + offset] === line)) {
      indexes.push(index);
    }
  }

  if (indexes.length !== 1) {
    throw new Error(
      `Structured patch for ${path} expected one matching block, found ${indexes.length}.`,
    );
  }

  lines.splice(indexes[0], oldLines.length, ...newLines);
  return lines.join("\n");
}
