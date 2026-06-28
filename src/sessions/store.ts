import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import type { OrxConfig } from "../config/types.js";
import { compactDelegationStateForStorage } from "../delegation/index.js";
import type { DelegationState } from "../delegation/index.js";
import type { OpenRouterMessage, OpenRouterStreamMetadata } from "../openrouter/types.js";
import type { EvidenceSource } from "../research/index.js";
import { resolveGitRepositoryMetadata } from "./git.js";
import {
  SESSION_SCHEMA_VERSION,
  type GitRepositoryMetadata,
  type ListedSessionRecord,
  type OrxSessionRecord,
  type SessionActivatedPrompt,
  type SessionActivatedSkill,
  type SessionConfigSnapshot,
  type SessionSummary,
} from "./types.js";

export interface ResolveSessionDirectoryOptions {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  cwd?: string;
  sessionDir?: string;
}

export interface CreateSessionRecordOptions {
  id?: string;
  cwd: string;
  activeConfig: OrxConfig;
  messages?: OpenRouterMessage[];
  latestMetadata?: OpenRouterStreamMetadata;
  activatedSkills?: SessionActivatedSkill[];
  activatedPrompts?: SessionActivatedPrompt[];
  evidenceSources?: EvidenceSource[];
  delegation?: DelegationState;
  git?: GitRepositoryMetadata;
  now?: Date;
}

export interface UpdateSessionRecordOptions {
  cwd?: string;
  git?: GitRepositoryMetadata;
  activeConfig?: OrxConfig;
  messages?: OpenRouterMessage[];
  latestMetadata?: OpenRouterStreamMetadata;
  activatedSkills?: SessionActivatedSkill[];
  activatedPrompts?: SessionActivatedPrompt[];
  evidenceSources?: EvidenceSource[];
  delegation?: DelegationState;
  now?: Date;
}

const SAFE_SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SESSION_DIRECTORY_MODE = 0o700;
const SESSION_FILE_MODE = 0o600;

export function createSessionId(options: { now?: Date; random?: Uint8Array } = {}): string {
  const now = options.now ?? new Date();
  const timestamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const suffix = Buffer.from(options.random ?? randomBytes(4)).toString("hex");
  return `${timestamp}-${suffix}`;
}

export function resolveSessionDirectory(options: ResolveSessionDirectoryOptions = {}): string {
  const override = cleanString(options.sessionDir ?? options.env?.ORX_SESSION_DIR);
  if (override) {
    return resolve(options.cwd ?? process.cwd(), override);
  }

  return join(options.homeDir ?? homedir(), ".orx", "sessions");
}

export function getSessionFilePath(sessionDir: string, sessionId: string): string {
  assertSafeSessionId(sessionId);
  return join(sessionDir, `${sessionId}.json`);
}

export async function createSessionRecord(
  options: CreateSessionRecordOptions,
): Promise<OrxSessionRecord> {
  const now = (options.now ?? new Date()).toISOString();
  const messages = cloneJson(options.messages ?? []);
  const git = options.git ?? (await resolveGitRepositoryMetadata(options.cwd));

  return {
    schemaVersion: SESSION_SCHEMA_VERSION,
    id: options.id ?? createSessionId({ now: new Date(now) }),
    startedAt: now,
    updatedAt: now,
    cwd: options.cwd,
    git,
    activeConfig: snapshotConfig(options.activeConfig),
    messages,
    latestMetadata: cloneOptionalJson(options.latestMetadata),
    activatedSkills: cloneOptionalJson(options.activatedSkills),
    activatedPrompts: cloneOptionalJson(options.activatedPrompts),
    evidenceSources: cloneOptionalJson(options.evidenceSources),
    delegation: cloneOptionalJson(compactDelegationStateForStorage(options.delegation)),
    messageCount: messages.length,
    summary: summarizeMessages(messages),
  };
}

export function updateSessionRecord(
  record: OrxSessionRecord,
  options: UpdateSessionRecordOptions,
): OrxSessionRecord {
  record.updatedAt = (options.now ?? new Date()).toISOString();

  if (options.cwd !== undefined) {
    record.cwd = options.cwd;
  }

  if ("git" in options) {
    record.git = options.git;
  }

  if (options.activeConfig !== undefined) {
    record.activeConfig = snapshotConfig(options.activeConfig);
  }

  if (options.messages !== undefined) {
    record.messages = cloneJson(options.messages);
    record.messageCount = record.messages.length;
    record.summary = summarizeMessages(record.messages);
  }

  if ("latestMetadata" in options) {
    record.latestMetadata = cloneOptionalJson(options.latestMetadata);
  }

  if ("activatedSkills" in options) {
    record.activatedSkills = cloneOptionalJson(options.activatedSkills);
  }

  if ("activatedPrompts" in options) {
    record.activatedPrompts = cloneOptionalJson(options.activatedPrompts);
  }

  if ("evidenceSources" in options) {
    record.evidenceSources = cloneOptionalJson(options.evidenceSources);
  }

  if ("delegation" in options) {
    record.delegation = cloneOptionalJson(compactDelegationStateForStorage(options.delegation));
  }

  return record;
}

export async function saveSessionRecord(
  record: OrxSessionRecord,
  options: ResolveSessionDirectoryOptions = {},
): Promise<string> {
  const sessionDir = resolveSessionDirectory(options);
  const filePath = getSessionFilePath(sessionDir, record.id);
  await mkdir(sessionDir, { recursive: true, mode: SESSION_DIRECTORY_MODE });
  await chmod(sessionDir, SESSION_DIRECTORY_MODE);

  const tempPath = join(sessionDir, `.${basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  await writeFile(tempPath, `${JSON.stringify(record, null, 2)}\n`, {
    encoding: "utf8",
    mode: SESSION_FILE_MODE,
  });
  await rename(tempPath, filePath);
  return filePath;
}

export async function refreshSessionGitMetadata(record: OrxSessionRecord): Promise<void> {
  record.git = await resolveGitRepositoryMetadata(record.cwd);
}

export async function loadSessionRecord(filePath: string): Promise<OrxSessionRecord> {
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  return parseSessionRecord(parsed, filePath);
}

export async function listSessionRecords(
  options: ResolveSessionDirectoryOptions & {
    excludeIds?: string[];
    limit?: number;
  } = {},
): Promise<ListedSessionRecord[]> {
  const sessionDir = resolveSessionDirectory(options);
  let names: string[];

  try {
    names = await readdir(sessionDir);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const excluded = new Set(options.excludeIds ?? []);
  const records: ListedSessionRecord[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) {
      continue;
    }

    const filePath = join(sessionDir, name);
    try {
      const record = await loadSessionRecord(filePath);
      if (!excluded.has(record.id)) {
        records.push({
          id: record.id,
          filePath,
          record,
        });
      }
    } catch {
      // Ignore malformed session files so one bad file does not break /resume.
    }
  }

  records.sort(compareListedSessions);
  return typeof options.limit === "number" ? records.slice(0, options.limit) : records;
}

export function snapshotConfig(config: OrxConfig): SessionConfigSnapshot {
  return {
    model: config.model,
    mode: config.mode,
    fusionPreset: config.fusionPreset,
    theme: config.theme,
    activeProfile: config.activeProfile,
    permissions: {
      approvalPolicy: config.permissions.approvalPolicy,
      sandboxMode: config.permissions.sandboxMode,
    },
  };
}

function summarizeMessages(messages: OpenRouterMessage[]): SessionSummary {
  const firstUser = messages.find(
    (message) => message.role === "user" && typeof message.content === "string",
  );
  const firstUserMessage = firstUser?.content?.trim();
  if (!firstUserMessage) {
    return {};
  }

  const title =
    firstUserMessage.length > 80 ? `${firstUserMessage.slice(0, 77).trimEnd()}...` : firstUserMessage;

  return {
    firstUserMessage,
    title,
  };
}

function parseSessionRecord(value: unknown, filePath: string): OrxSessionRecord {
  if (!isObject(value)) {
    throw new Error(`Invalid ORX session JSON in ${filePath}: expected an object.`);
  }

  if (value.schemaVersion !== SESSION_SCHEMA_VERSION) {
    throw new Error(
      `Invalid ORX session JSON in ${filePath}: unsupported schemaVersion ${String(
        value.schemaVersion,
      )}.`,
    );
  }

  if (
    typeof value.id !== "string" ||
    typeof value.startedAt !== "string" ||
    typeof value.updatedAt !== "string" ||
    typeof value.cwd !== "string" ||
    !isObject(value.activeConfig) ||
    !Array.isArray(value.messages)
  ) {
    throw new Error(`Invalid ORX session JSON in ${filePath}: missing required fields.`);
  }

  assertSafeSessionId(value.id);
  value.delegation = compactDelegationStateForStorage(value.delegation);
  return value as unknown as OrxSessionRecord;
}

function assertSafeSessionId(sessionId: string): void {
  if (!SAFE_SESSION_ID.test(sessionId)) {
    throw new Error(`Invalid session id: ${sessionId}`);
  }
}

function cleanString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function cloneOptionalJson<T>(value: T | undefined): T | undefined {
  return value === undefined ? undefined : cloneJson(value);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function compareListedSessions(a: ListedSessionRecord, b: ListedSessionRecord): number {
  const byUpdatedAt = Date.parse(b.record.updatedAt) - Date.parse(a.record.updatedAt);
  if (Number.isFinite(byUpdatedAt) && byUpdatedAt !== 0) {
    return byUpdatedAt;
  }

  return b.id.localeCompare(a.id);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return Boolean(error && typeof error === "object" && "code" in error);
}
