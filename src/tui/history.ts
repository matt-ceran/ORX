import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, parse, relative, resolve, sep } from "node:path";

export interface ChatHistoryPathOptions {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  historyPath?: string;
  homeDir?: string;
}

export interface ChatHistoryIoOptions {
  historyPath?: string;
}

export interface ChatHistoryEntry {
  text: string;
  createdAt: string;
}

export interface ChatHistoryFile {
  version: 1;
  entries: ChatHistoryEntry[];
}

export interface AppendChatHistoryEntryOptions extends ChatHistoryIoOptions {
  now?: () => Date;
}

export interface AppendChatHistoryEntryResult {
  recorded: boolean;
  reason?: string;
  entries: ChatHistoryEntry[];
}

export interface ClearChatHistoryResult {
  historyPath: string;
  removed: boolean;
}

export interface RenderChatHistoryOptions {
  query?: string;
  limit?: number;
  historyPath?: string;
}

const HISTORY_VERSION = 1;
const HISTORY_DIRECTORY_MODE = 0o700;
const HISTORY_FILE_MODE = 0o600;
const MAX_HISTORY_ENTRIES = 500;
const DEFAULT_RENDER_LIMIT = 20;
const MAX_RENDER_LIMIT = 100;
const MAX_HISTORY_TEXT_CHARS = 4_000;
const MAX_RENDER_TEXT_CHARS = 160;
const CONTROL_PATTERN = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g;
const ANSI_PATTERN = /\x1B\[[0-?]*[ -/]*[@-~]/g;
const SECRET_LIKE_HISTORY_PATTERN =
  /\b(?:sk-or-v1-[A-Za-z0-9_-]+|github_pat_[A-Za-z0-9_]+|ghp_[A-Za-z0-9_]+|glpat-[A-Za-z0-9_-]+|xox[baprs]-[A-Za-z0-9-]+|bearer\s+[A-Za-z0-9._~+/=-]{16,}|(?:api[_-]?key|token|password|secret)\s*[:=]\s*\S+)/i;

export class ChatHistoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatHistoryError";
  }
}

export function defaultChatHistoryPath(homeDir: string = homedir()): string {
  return join(homeDir, ".orx", "history.json");
}

export function resolveChatHistoryPath(options: ChatHistoryPathOptions = {}): string {
  const explicitPath = options.historyPath ?? options.env?.ORX_CHAT_HISTORY_PATH;
  if (!explicitPath) {
    return defaultChatHistoryPath(options.homeDir);
  }

  return resolve(options.cwd ?? process.cwd(), explicitPath);
}

export function emptyChatHistoryFile(): ChatHistoryFile {
  return {
    version: HISTORY_VERSION,
    entries: [],
  };
}

export function loadChatHistory(options: ChatHistoryIoOptions = {}): ChatHistoryEntry[] {
  const path = options.historyPath ?? defaultChatHistoryPath();
  if (!existsSync(path)) {
    return [];
  }

  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) {
    throw new ChatHistoryError("Chat history path must not be a symlink.");
  }
  if (!stat.isFile()) {
    throw new ChatHistoryError("Chat history path must resolve to a regular file.");
  }

  try {
    chmodSync(path, HISTORY_FILE_MODE);
  } catch {
    // Best effort on load; writes will fail loudly if the file cannot be tightened.
  }

  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return sanitizeChatHistoryFile(parsed).entries;
  } catch (error) {
    if (error instanceof ChatHistoryError) {
      throw error;
    }
    return [];
  }
}

export function appendChatHistoryEntry(
  text: string,
  options: AppendChatHistoryEntryOptions = {},
): AppendChatHistoryEntryResult {
  const normalizedText = normalizeHistoryInput(text);
  const existingEntries = loadChatHistory(options);
  const skipReason = historySkipReason(normalizedText);
  if (skipReason) {
    return {
      recorded: false,
      reason: skipReason,
      entries: existingEntries,
    };
  }

  const now = (options.now?.() ?? new Date()).toISOString();
  const entry: ChatHistoryEntry = {
    text: normalizedText,
    createdAt: now,
  };
  const entries = [entry, ...existingEntries.filter((candidate) => candidate.text !== normalizedText)]
    .slice(0, MAX_HISTORY_ENTRIES);
  saveChatHistory({ version: HISTORY_VERSION, entries }, options);
  return {
    recorded: true,
    entries,
  };
}

export function clearChatHistory(options: ChatHistoryIoOptions = {}): ClearChatHistoryResult {
  const path = options.historyPath ?? defaultChatHistoryPath();
  assertParentPathHasNoSymlinks(path);
  const removed = existsSync(path);
  if (removed) {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) {
      throw new ChatHistoryError("Chat history path must not be a symlink.");
    }
    if (!stat.isFile()) {
      throw new ChatHistoryError("Chat history path must resolve to a regular file.");
    }
    rmSync(path);
  }
  return {
    historyPath: path,
    removed,
  };
}

export function renderChatHistory(
  entries: ChatHistoryEntry[],
  options: RenderChatHistoryOptions = {},
): string {
  const query = normalizeHistoryQuery(options.query ?? "");
  const limit = normalizeRenderLimit(options.limit);
  const matches = query ? filterHistoryEntries(entries, query) : entries;
  const visible = matches.slice(0, limit);
  const title = query ? `Prompt history matching "${query}":` : "Prompt history:";
  const lines = [title];

  if (visible.length === 0) {
    lines.push("  No prompt history found.");
  } else {
    visible.forEach((entry, index) => {
      lines.push(`  ${index + 1}. ${formatHistoryEntryText(entry.text)}`);
    });
  }

  const omitted = matches.length - visible.length;
  if (omitted > 0) {
    lines.push(`  ... ${omitted} more`);
  }

  if (options.historyPath) {
    lines.push(`history_path: ${options.historyPath}`);
  }
  lines.push("storage: local prompts only; slash commands and secret-like input are skipped");
  return lines.join("\n");
}

export function renderChatHistoryCleared(result: ClearChatHistoryResult): string {
  return [
    "Prompt history cleared.",
    `history_path: ${result.historyPath}`,
    `state_changed: ${result.removed ? "yes" : "no"}`,
  ].join("\n");
}

export function chatHistoryEntriesForReadline(
  entries: ChatHistoryEntry[],
  limit: number = 100,
): string[] {
  return entries
    .map((entry) => entry.text)
    .filter((text) => text.length > 0 && !text.includes("\n"))
    .slice(0, Math.max(0, Math.min(limit, MAX_HISTORY_ENTRIES)));
}

function saveChatHistory(
  file: ChatHistoryFile,
  options: ChatHistoryIoOptions = {},
): void {
  const path = options.historyPath ?? defaultChatHistoryPath();
  const sanitized = sanitizeChatHistoryFile(file);
  assertParentPathHasNoSymlinks(path);
  const parentDir = dirname(path);
  const parentExisted = existsSync(parentDir);
  mkdirSync(parentDir, {
    recursive: true,
    mode: HISTORY_DIRECTORY_MODE,
  });
  if (!parentExisted || resolve(path) === resolve(defaultChatHistoryPath())) {
    chmodSync(parentDir, HISTORY_DIRECTORY_MODE);
  }

  if (existsSync(path)) {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) {
      throw new ChatHistoryError("Chat history path must not be a symlink.");
    }
    if (!stat.isFile()) {
      throw new ChatHistoryError("Chat history path must resolve to a regular file.");
    }
  }

  writeFileSync(path, `${JSON.stringify(sanitized, null, 2)}\n`, {
    encoding: "utf8",
    mode: HISTORY_FILE_MODE,
  });
  chmodSync(path, HISTORY_FILE_MODE);
}

function sanitizeChatHistoryFile(input: unknown): ChatHistoryFile {
  if (!input || typeof input !== "object") {
    return emptyChatHistoryFile();
  }

  const source = input as { entries?: unknown };
  const entries = Array.isArray(source.entries)
    ? source.entries
        .map(sanitizeHistoryEntry)
        .filter((entry): entry is ChatHistoryEntry => typeof entry !== "undefined")
        .slice(0, MAX_HISTORY_ENTRIES)
    : [];

  return {
    version: HISTORY_VERSION,
    entries,
  };
}

function sanitizeHistoryEntry(input: unknown): ChatHistoryEntry | undefined {
  if (!input || typeof input !== "object") {
    return undefined;
  }

  const source = input as {
    text?: unknown;
    createdAt?: unknown;
  };
  const text = normalizeHistoryInput(typeof source.text === "string" ? source.text : "");
  if (historySkipReason(text)) {
    return undefined;
  }

  const createdAt = normalizeIsoDate(source.createdAt);
  return {
    text,
    createdAt,
  };
}

function normalizeHistoryInput(input: string): string {
  return input
    .replace(ANSI_PATTERN, "")
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL_PATTERN, "")
    .trim()
    .slice(0, MAX_HISTORY_TEXT_CHARS);
}

function historySkipReason(text: string): string | undefined {
  if (!text) {
    return "empty";
  }
  if (text.startsWith("/")) {
    return "slash_command";
  }
  if (SECRET_LIKE_HISTORY_PATTERN.test(text)) {
    return "secret_like";
  }
  return undefined;
}

function normalizeIsoDate(value: unknown): string {
  if (typeof value !== "string") {
    return new Date(0).toISOString();
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date(0).toISOString();
  }
  return date.toISOString();
}

function normalizeHistoryQuery(query: string): string {
  return query.replace(ANSI_PATTERN, "").replace(CONTROL_PATTERN, "").trim().slice(0, 120);
}

function normalizeRenderLimit(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return DEFAULT_RENDER_LIMIT;
  }
  return Math.max(1, Math.min(MAX_RENDER_LIMIT, Math.floor(limit)));
}

function filterHistoryEntries(entries: ChatHistoryEntry[], query: string): ChatHistoryEntry[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  return entries.filter((entry) => {
    const haystack = entry.text.toLowerCase();
    return tokens.every((token) => haystack.includes(token));
  });
}

function formatHistoryEntryText(text: string): string {
  const singleLine = text.replace(/\s*\n\s*/g, " / ");
  return singleLine.length > MAX_RENDER_TEXT_CHARS
    ? `${singleLine.slice(0, MAX_RENDER_TEXT_CHARS - 3).trimEnd()}...`
    : singleLine;
}

function assertParentPathHasNoSymlinks(path: string): void {
  const parentDir = resolve(dirname(path));
  const root = parse(parentDir).root;
  const segments = relative(root, parentDir).split(sep).filter(Boolean);
  let current = root;
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    current = join(current, segment);
    if (!existsSync(current)) {
      continue;
    }
    const stat = lstatSync(current);
    const isTopLevelPosixComponent = root === sep && index === 0;
    if (isTopLevelPosixComponent && stat.isSymbolicLink()) {
      continue;
    }
    if (stat.isSymbolicLink()) {
      throw new ChatHistoryError("Chat history parent path must not contain symlinks.");
    }
    if (!stat.isDirectory()) {
      throw new ChatHistoryError("Chat history parent path must be a directory.");
    }
  }
}
