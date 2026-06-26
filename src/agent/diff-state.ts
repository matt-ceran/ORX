import type { ToolDispatchResult } from "./tool-dispatch.js";

export interface SessionDiffSnapshot {
  hasChanges: boolean;
  originalBytes: number;
  returnedBytes: number;
  originalLines: number;
  returnedLines: number;
  truncated: boolean;
}

export interface SessionDiffChange {
  tool: string;
  toolCallId: string;
  changedFiles: string[];
}

export interface SessionDiffState {
  editToolCalls: number;
  changedFiles: string[];
  lastToolName?: string;
  lastChange?: SessionDiffChange;
  lastDiff?: SessionDiffSnapshot;
}

export type AgentDiffState = SessionDiffState;

interface JsonObject {
  [key: string]: unknown;
}

interface DiffTruncation {
  truncated: boolean;
  originalBytes: number;
  returnedBytes: number;
  originalLines: number;
  returnedLines: number;
}

export function createSessionDiffState(): SessionDiffState {
  return {
    editToolCalls: 0,
    changedFiles: [],
  };
}

export function createAgentDiffState(): AgentDiffState {
  return createSessionDiffState();
}

export function resetSessionDiffState(state: SessionDiffState): void {
  state.editToolCalls = 0;
  state.changedFiles = [];
  delete state.lastToolName;
  delete state.lastChange;
  delete state.lastDiff;
}

export function clearAgentDiffState(state: AgentDiffState): void {
  resetSessionDiffState(state);
}

export function recordToolResultForDiffState(
  state: SessionDiffState,
  result: ToolDispatchResult,
): void {
  if (result.toolCall.function.name === "git_diff") {
    recordGitDiffOutputForDiffState(state, result.output);
  }

  if (!result.ok) {
    return;
  }

  const changedFiles = extractChangedFiles(result.output);
  if (changedFiles.length === 0) {
    return;
  }

  state.editToolCalls += 1;
  state.changedFiles = mergeUnique(state.changedFiles, changedFiles);
  state.lastToolName = result.toolCall.function.name;
  state.lastChange = {
    tool: result.toolCall.function.name,
    toolCallId: result.toolCall.id,
    changedFiles,
  };
}

export function recordDiffStateFromToolResult(
  state: AgentDiffState,
  result: ToolDispatchResult,
): void {
  recordToolResultForDiffState(state, result);
}

export function recordGitDiffOutputForDiffState(
  state: SessionDiffState,
  output: unknown,
): void {
  if (!isObject(output) || output.ok !== true || typeof output.diff !== "string") {
    return;
  }

  const truncation = getDiffTruncation(output.truncation);
  state.lastDiff = {
    hasChanges:
      truncation !== undefined ? truncation.originalBytes > 0 : output.diff.length > 0,
    originalBytes: truncation?.originalBytes ?? Buffer.byteLength(output.diff, "utf8"),
    returnedBytes: truncation?.returnedBytes ?? Buffer.byteLength(output.diff, "utf8"),
    originalLines: truncation?.originalLines ?? countLines(output.diff),
    returnedLines: truncation?.returnedLines ?? countLines(output.diff),
    truncated: truncation?.truncated ?? false,
  };
}

export function formatSessionDiffState(
  state: SessionDiffState,
  options: { maxFiles?: number } = {},
): string {
  const parts = [formatObservedChanges(state, options.maxFiles)];

  if (state.lastDiff) {
    parts.push(`last diff ${formatDiffSnapshot(state.lastDiff)}`);
  }

  return parts.join("; ");
}

export function formatAgentDiffState(
  state: AgentDiffState,
  options: { maxFiles?: number } = {},
): string {
  return formatSessionDiffState(state, options);
}

function formatObservedChanges(state: SessionDiffState, maxFiles: number | undefined): string {
  if (state.editToolCalls === 0) {
    return "no edit tools observed";
  }

  const fileCount = state.changedFiles.length;
  const fileText =
    fileCount === 0
      ? "no files observed"
      : `${fileCount} ${plural(fileCount, "file")} observed (${formatFileList(
          state.changedFiles,
          maxFiles,
        )})`;

  return `${state.editToolCalls} edit ${plural(state.editToolCalls, "tool call")}, ${fileText}`;
}

function formatDiffSnapshot(snapshot: SessionDiffSnapshot): string {
  if (!snapshot.hasChanges) {
    return "clean";
  }

  const size = `${snapshot.returnedBytes}B/${snapshot.returnedLines} ${plural(
    snapshot.returnedLines,
    "line",
  )}`;
  return snapshot.truncated ? `${size}, truncated` : size;
}

function formatFileList(files: string[], maxFiles = 4): string {
  const shown = files.slice(0, maxFiles).join(", ");
  return files.length > maxFiles ? `${shown}, +${files.length - maxFiles} more` : shown;
}

function extractChangedFiles(output: unknown): string[] {
  if (!isObject(output) || !Array.isArray(output.changedFiles)) {
    return [];
  }

  return uniqueStrings(output.changedFiles);
}

function mergeUnique(existing: string[], next: string[]): string[] {
  return uniqueStrings([...existing, ...next]);
}

function uniqueStrings(values: unknown[]): string[] {
  const seen = new Set<string>();
  const strings: string[] = [];

  for (const value of values) {
    if (typeof value !== "string" || value.length === 0 || seen.has(value)) {
      continue;
    }
    seen.add(value);
    strings.push(value);
  }

  return strings;
}

function getDiffTruncation(value: unknown): DiffTruncation | undefined {
  if (!isObject(value)) {
    return undefined;
  }

  return typeof value.truncated === "boolean" &&
    typeof value.originalBytes === "number" &&
    typeof value.returnedBytes === "number" &&
    typeof value.originalLines === "number" &&
    typeof value.returnedLines === "number"
    ? {
        truncated: value.truncated,
        originalBytes: value.originalBytes,
        returnedBytes: value.returnedBytes,
        originalLines: value.originalLines,
        returnedLines: value.returnedLines,
      }
    : undefined;
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

function plural(count: number, singular: string): string {
  return count === 1 ? singular : `${singular}s`;
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
