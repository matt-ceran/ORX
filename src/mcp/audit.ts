import { appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type McpAuditEventType =
  | "mcp.profile.status"
  | "mcp.profile.inspect"
  | "mcp.profile.tools"
  | "mcp.profile.remote_tools_attempt"
  | "mcp.profile.discovery_attempt"
  | "mcp.profile.enable_attempt"
  | "mcp.profile.disable_attempt"
  | "mcp.tool.allow_attempt"
  | "mcp.tool.revoke_attempt"
  | "mcp.model_tool.allow_attempt"
  | "mcp.model_tool.revoke_attempt"
  | "mcp.tool.call_attempt";

export interface McpAuditEvent {
  type: McpAuditEventType;
  profileId?: string;
  ok: boolean;
  details?: Record<string, unknown>;
  timestamp?: string;
}

export interface McpAuditOptions {
  auditLogPath?: string;
  now?: () => Date;
}

const SENSITIVE_KEY_PATTERN = /(api[_-]?key|authorization|bearer|token|secret|password|credential)/i;
const BEARER_PATTERN = /bearer\s+[a-z0-9._~+/=-]+/gi;
const API_KEY_LIKE_PATTERN = /(sk-or-v1-[a-z0-9._-]+)/gi;
const SENSITIVE_QUERY_PATTERN =
  /([?&](?:api[_-]?key|authorization|bearer|token|secret|password|credential)=)([^&#\s]+)/gi;
const SENSITIVE_ASSIGNMENT_PATTERN =
  /\b(api[_-]?key|access[_-]?token|auth[_-]?token|token|secret|password|passwd|key)(\s*[:=]\s*)([a-z0-9._~+/=-]{4,})/gi;

export function defaultMcpAuditLogPath(): string {
  return join(homedir(), ".orx", "audit", "mcp.jsonl");
}

export function writeMcpAuditEvent(event: McpAuditEvent, options: McpAuditOptions = {}): void {
  const path = options.auditLogPath ?? defaultMcpAuditLogPath();
  const timestamp = event.timestamp ?? (options.now?.() ?? new Date()).toISOString();
  const sanitized = redactSecrets({
    timestamp,
    type: event.type,
    profileId: event.profileId,
    ok: event.ok,
    details: event.details,
  });

  mkdirSync(dirname(path), {
    recursive: true,
    mode: 0o700,
  });
  appendFileSync(path, `${JSON.stringify(sanitized)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item));
  }

  if (value && typeof value === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      sanitized[key] = SENSITIVE_KEY_PATTERN.test(key) ? "[redacted]" : redactSecrets(nestedValue);
    }
    return sanitized;
  }

  if (typeof value === "string") {
    return value
      .replace(SENSITIVE_QUERY_PATTERN, "$1[redacted]")
      .replace(SENSITIVE_ASSIGNMENT_PATTERN, "$1$2[redacted]")
      .replace(BEARER_PATTERN, "Bearer [redacted]")
      .replace(API_KEY_LIKE_PATTERN, "[redacted]");
  }

  return value;
}
