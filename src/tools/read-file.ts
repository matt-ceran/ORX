import { readFile, stat } from "node:fs/promises";
import { DEFAULT_MAX_TEXT_BYTES, DEFAULT_MAX_TEXT_LINES, truncateText } from "./truncation.js";
import { errorFromUnknown, resolveToolPath } from "./path.js";
import type { TextTruncation, TextTruncationOptions, ToolResult } from "./types.js";

export interface ReadFileOptions extends TextTruncationOptions {
  path: string;
  cwd?: string;
  encoding?: BufferEncoding;
}

export type ReadFileResult = ToolResult<{
  path: string;
  sizeBytes: number;
  content: string;
  truncation: TextTruncation;
}>;

export async function readFileTool(options: ReadFileOptions): Promise<ReadFileResult> {
  const absolutePath = resolveToolPath(options.path, options.cwd);

  try {
    const fileStat = await stat(absolutePath);
    if (!fileStat.isFile()) {
      return {
        ok: false,
        error: {
          code: "EISDIR",
          message: `Path is not a regular file: ${absolutePath}`,
          path: absolutePath,
        },
      };
    }

    const raw = await readFile(absolutePath, options.encoding ?? "utf8");
    const truncated = truncateText(raw, {
      maxBytes: options.maxBytes ?? DEFAULT_MAX_TEXT_BYTES,
      maxLines: options.maxLines ?? DEFAULT_MAX_TEXT_LINES,
    });

    return {
      ok: true,
      path: absolutePath,
      sizeBytes: fileStat.size,
      content: truncated.text,
      truncation: truncated.truncation,
    };
  } catch (error) {
    return {
      ok: false,
      error: errorFromUnknown(error, "READ_FILE_ERROR", absolutePath),
    };
  }
}
