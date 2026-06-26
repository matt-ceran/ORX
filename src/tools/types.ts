export interface ToolError {
  code: string;
  message: string;
  path?: string;
}

export interface TextTruncation {
  truncated: boolean;
  originalBytes: number;
  returnedBytes: number;
  originalLines: number;
  returnedLines: number;
  omittedBytes: number;
  omittedLines: number;
}

export interface TextTruncationOptions {
  maxBytes?: number;
  maxLines?: number;
}

export interface TruncatedText {
  text: string;
  truncation: TextTruncation;
}

export type ToolResult<T> =
  | ({ ok: true } & T)
  | {
      ok: false;
      error: ToolError;
    };

export type FileType = "file" | "directory" | "symlink" | "other";
