import type { OrxMode, PermissionConfig } from "../config/types.js";
import type { OpenRouterMessage, OpenRouterStreamMetadata } from "../openrouter/types.js";
import type { EvidenceSource } from "../research/index.js";

export const SESSION_SCHEMA_VERSION = 1;

export interface SessionConfigSnapshot {
  model: string;
  mode: OrxMode;
  fusionPreset?: string;
  permissions: PermissionConfig;
}

export interface GitRepositoryMetadata {
  root: string;
  branch?: string;
  commit?: string;
  remoteUrl?: string;
  dirty: boolean;
}

export interface SessionSummary {
  firstUserMessage?: string;
  title?: string;
}

export interface SessionActivatedSkill {
  id: string;
  pluginId: string;
  name: string;
  filePath: string;
  contentHash: string;
  sourceManifestHash: string;
  activatedAt: string;
}

export interface OrxSessionRecord {
  schemaVersion: typeof SESSION_SCHEMA_VERSION;
  id: string;
  startedAt: string;
  updatedAt: string;
  cwd: string;
  git?: GitRepositoryMetadata;
  activeConfig: SessionConfigSnapshot;
  messages: OpenRouterMessage[];
  latestMetadata?: OpenRouterStreamMetadata;
  activatedSkills?: SessionActivatedSkill[];
  evidenceSources?: EvidenceSource[];
  messageCount: number;
  summary: SessionSummary;
}

export interface SessionLocation {
  id: string;
  filePath: string;
}

export interface ListedSessionRecord extends SessionLocation {
  record: OrxSessionRecord;
}
