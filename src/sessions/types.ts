import type { OrxMode, PermissionConfig } from "../config/types.js";
import type { OpenRouterMessage, OpenRouterStreamMetadata } from "../openrouter/types.js";

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
  messageCount: number;
  summary: SessionSummary;
}

export interface SessionLocation {
  id: string;
  filePath: string;
}
