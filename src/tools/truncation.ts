import type { TextTruncation, TextTruncationOptions, TruncatedText } from "./types.js";

export const DEFAULT_MAX_TEXT_BYTES = 64 * 1024;
export const DEFAULT_MAX_TEXT_LINES = 2_000;

export function truncateText(
  text: string,
  options: TextTruncationOptions = {},
): TruncatedText {
  const originalBytes = Buffer.byteLength(text, "utf8");
  const originalLines = countLines(text);
  let nextText = text;
  let lineTruncated = false;

  if (options.maxLines !== undefined) {
    assertNonNegativeInteger(options.maxLines, "maxLines");
    const lines = splitLines(nextText);
    if (lines.length > options.maxLines) {
      nextText = lines.slice(0, options.maxLines).join("\n");
      lineTruncated = true;
    }
  }

  let byteTruncated = false;
  if (options.maxBytes !== undefined) {
    assertNonNegativeInteger(options.maxBytes, "maxBytes");
    if (Buffer.byteLength(nextText, "utf8") > options.maxBytes) {
      nextText = truncateUtf8StringToByteLimit(nextText, options.maxBytes);
      byteTruncated = true;
    }
  }

  const returnedBytes = Buffer.byteLength(nextText, "utf8");
  const returnedLines = countLines(nextText);
  const truncation: TextTruncation = {
    truncated: lineTruncated || byteTruncated,
    originalBytes,
    returnedBytes,
    originalLines,
    returnedLines,
    omittedBytes: Math.max(0, originalBytes - returnedBytes),
    omittedLines: Math.max(0, originalLines - returnedLines),
  };

  return {
    text: nextText,
    truncation,
  };
}

export class ByteAccumulator {
  private readonly chunks: Buffer[] = [];
  private totalBytes = 0;

  constructor(private readonly maxBytes: number = DEFAULT_MAX_TEXT_BYTES) {
    assertNonNegativeInteger(maxBytes, "maxBytes");
  }

  append(chunk: Buffer | string): void {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, "utf8");
    this.totalBytes += buffer.length;

    const keptBytes = this.chunks.reduce((sum, next) => sum + next.length, 0);
    const remainingBytes = this.maxBytes - keptBytes;
    if (remainingBytes <= 0) {
      return;
    }

    this.chunks.push(buffer.subarray(0, remainingBytes));
  }

  toTruncatedText(): TruncatedText {
    const text = decodeValidUtf8Prefix(Buffer.concat(this.chunks));
    const returnedBytes = Buffer.byteLength(text, "utf8");
    const originalLines = countLines(text) + estimateOmittedLines(this.totalBytes, returnedBytes);
    const returnedLines = countLines(text);

    return {
      text,
      truncation: {
        truncated: this.totalBytes > returnedBytes,
        originalBytes: this.totalBytes,
        returnedBytes,
        originalLines,
        returnedLines,
        omittedBytes: Math.max(0, this.totalBytes - returnedBytes),
        omittedLines: Math.max(0, originalLines - returnedLines),
      },
    };
  }
}

function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
}

function countLines(text: string): number {
  if (text.length === 0) {
    return 0;
  }

  const normalized = text.replace(/\r\n|\r/g, "\n");
  const withoutTrailingNewline = normalized.endsWith("\n")
    ? normalized.slice(0, -1)
    : normalized;

  return withoutTrailingNewline.length === 0 ? 0 : withoutTrailingNewline.split("\n").length;
}

function splitLines(text: string): string[] {
  return text.split(/\r\n|\n|\r/);
}

function estimateOmittedLines(totalBytes: number, returnedBytes: number): number {
  return totalBytes > returnedBytes ? 1 : 0;
}

function truncateUtf8StringToByteLimit(text: string, maxBytes: number): string {
  let bytes = 0;
  let output = "";

  for (const char of text) {
    const charBytes = Buffer.byteLength(char, "utf8");
    if (bytes + charBytes > maxBytes) {
      break;
    }
    output += char;
    bytes += charBytes;
  }

  return output;
}

function decodeValidUtf8Prefix(buffer: Buffer): string {
  for (let end = buffer.length; end >= Math.max(0, buffer.length - 3); end -= 1) {
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, end));
    } catch {
      continue;
    }
  }

  return "";
}
