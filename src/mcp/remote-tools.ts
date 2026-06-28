import { redactSecrets } from "./audit.js";
import { getMcpStatusSummary } from "./policy.js";
import type { McpRegistryOptions } from "./registry.js";
import { postMcpJsonRpc, type McpRemoteHttpOptions } from "./transport.js";
import { sha256, stripTerminalControlChars } from "../research/extract.js";
import { guardFetchUrl, type UrlGuardAllowed } from "../research/url-guard.js";

export type McpRemoteToolsStatus =
  | "ok"
  | "auth_required"
  | "disabled"
  | "untrusted"
  | "schema_change_pending"
  | "blocked_url"
  | "unsupported_transport"
  | "not_found"
  | "remote_error"
  | "network_error"
  | "invalid_response"
  | "too_many_pages";

export interface McpRemoteToolSummary {
  name: string;
  title?: string;
  description?: string;
  toolHash: string;
  inputSchemaHash?: string;
  outputSchemaHash?: string;
  annotationKeys?: string[];
}

export interface McpRemoteToolsResult {
  profileId: string;
  status: McpRemoteToolsStatus;
  ok: boolean;
  networkAttempted: boolean;
  message: string;
  transport?: string;
  url?: string;
  authRequired?: boolean;
  profileHash?: string;
  trustedProfileHash?: string;
  schemaChangePending?: boolean;
  httpStatus?: number;
  tools?: McpRemoteToolSummary[];
  toolCount?: number;
  nextCursorPresent?: boolean;
  truncated?: boolean;
  error?: string;
}

export interface McpRemoteToolsOptions extends McpRegistryOptions, McpRemoteHttpOptions {
  maxTools?: number;
  maxPages?: number;
}

const TOOLS_LIST_REQUEST_ID_PREFIX = "orx-tools-list-";
const MAX_REMOTE_TOOL_FIELD_CHARS = 160;
const MAX_REMOTE_TOOL_DESCRIPTION_CHARS = 240;
const MAX_REMOTE_TOOL_ERROR_CHARS = 500;
const MAX_REMOTE_TOOL_ANNOTATION_KEYS = 20;
const DEFAULT_MAX_REMOTE_TOOLS = 50;
const DEFAULT_MAX_REMOTE_TOOL_PAGES = 3;
const SECRET_ASSIGNMENT_PATTERN =
  /((?:api[_-]?key|access[_-]?token|auth[_-]?token|token|secret|password|passwd|key)=)[^&\s]+/gi;
const BEARER_PATTERN = /bearer\s+[a-z0-9._~+/=-]+/gi;
const API_KEY_LIKE_PATTERN = /(sk-or-v1-[a-z0-9._-]+)/gi;

export async function listRemoteMcpTools(
  profileId: string,
  options: McpRemoteToolsOptions = {},
): Promise<McpRemoteToolsResult> {
  const summary = getMcpStatusSummary(options);
  const profile = summary.profiles.find((candidate) => candidate.id === profileId);

  if (!profile) {
    return {
      profileId,
      status: "not_found",
      ok: false,
      networkAttempted: false,
      message: `Unknown MCP profile: ${profileId}`,
    };
  }

  const base = {
    profileId,
    transport: profile.transport.kind,
    url: profile.transport.url,
    authRequired: profile.authRequired,
    profileHash: summary.profileHashes[profile.id],
    trustedProfileHash: summary.trustedProfileHashes[profile.id],
    schemaChangePending: summary.pendingSchemaChangeProfileIds.includes(profile.id),
  };

  if (profile.state !== "enabled") {
    return {
      ...base,
      status: "disabled",
      ok: true,
      networkAttempted: false,
      message: `MCP profile ${profileId} is disabled. Enable and trust it with /mcp enable ${profileId} before listing remote tools.`,
    };
  }

  if (!base.trustedProfileHash) {
    return {
      ...base,
      status: "untrusted",
      ok: true,
      networkAttempted: false,
      message: `MCP profile ${profileId} is enabled but has no trusted profile hash baseline. Re-enable it with /mcp enable ${profileId}.`,
    };
  }

  if (base.schemaChangePending) {
    return {
      ...base,
      status: "schema_change_pending",
      ok: true,
      networkAttempted: false,
      message: `MCP profile ${profileId} has a pending schema change. Review /mcp inspect ${profileId} and re-enable it before listing remote tools.`,
    };
  }

  if (profile.transport.kind !== "remote-http" || !profile.transport.url) {
    return {
      ...base,
      status: "unsupported_transport",
      ok: true,
      networkAttempted: false,
      message: `MCP profile ${profileId} uses unsupported remote tool transport: ${profile.transport.kind}.`,
    };
  }

  const guardedUrl = guardFetchUrl(profile.transport.url);
  if (!guardedUrl.ok) {
    return {
      ...base,
      status: "blocked_url",
      ok: true,
      networkAttempted: false,
      message: `MCP profile ${profileId} remote tool URL is blocked: ${guardedUrl.reason}`,
    };
  }

  return attemptRemoteToolsList(
    profileId,
    guardedUrl,
    {
      ...base,
      url: guardedUrl.canonicalUrl,
    },
    options,
  );
}

export function formatMcpRemoteToolsResult(result: McpRemoteToolsResult): string {
  const lines = [
    `MCP remote tools: ${result.profileId}`,
    `  status: ${result.status}`,
    `  network: ${result.networkAttempted ? "attempted" : "not_attempted"}`,
    result.transport ? `  transport: ${result.transport}` : undefined,
    result.url ? `  url: ${result.url}` : undefined,
    result.authRequired !== undefined
      ? `  auth: ${result.authRequired ? "required (OAuth or dedicated expiring key)" : "not required"}`
      : undefined,
    result.profileHash ? `  profile_hash: ${result.profileHash}` : undefined,
    result.trustedProfileHash ? `  trusted_hash: ${result.trustedProfileHash}` : undefined,
    result.schemaChangePending ? "  schema_change: pending" : undefined,
    result.httpStatus ? `  http_status: ${result.httpStatus}` : undefined,
    result.toolCount !== undefined ? `  remote_tool_count: ${result.toolCount}` : undefined,
    result.truncated ? "  truncated: yes" : undefined,
    result.nextCursorPresent ? "  next_cursor: present" : undefined,
    result.error ? `  error: ${result.error}` : undefined,
    `  detail: ${result.message}`,
    "  trust_boundary: remote tool metadata is untrusted",
    "  tool_execution: explicit /mcp call or orx mcp call; tools/list metadata is untrusted operator output; /mcp model enable or orx ask --mcp-tools exposes read-only non-billable model-granted mcp_call only",
    result.tools && result.tools.length > 0 ? "  tools:" : undefined,
    ...(result.tools ?? []).map((tool) => `    - ${formatRemoteToolSummary(tool)}`),
  ];

  return lines.filter((line): line is string => typeof line === "string").join("\n");
}

async function attemptRemoteToolsList(
  profileId: string,
  guardedUrl: UrlGuardAllowed,
  base: Pick<
    McpRemoteToolsResult,
    | "transport"
    | "url"
    | "authRequired"
    | "profileHash"
    | "trustedProfileHash"
    | "schemaChangePending"
  >,
  options: McpRemoteToolsOptions,
): Promise<McpRemoteToolsResult> {
  const maxTools = normalizePositiveInt(options.maxTools, DEFAULT_MAX_REMOTE_TOOLS);
  const maxPages = normalizePositiveInt(options.maxPages, DEFAULT_MAX_REMOTE_TOOL_PAGES);
  const tools: McpRemoteToolSummary[] = [];
  let cursor: string | undefined;
  let httpStatus: number | undefined;
  let nextCursorPresent = false;

  try {
    for (let page = 1; page <= maxPages; page += 1) {
      const requestId = `${TOOLS_LIST_REQUEST_ID_PREFIX}${page}`;
      const response = await postMcpJsonRpc(
        guardedUrl,
        JSON.stringify({
          jsonrpc: "2.0",
          id: requestId,
          method: "tools/list",
          params: cursor ? { cursor } : {},
        }),
        options,
      );
      httpStatus = response.status;

      if (response.status === 401 || response.status === 403) {
        return {
          ...base,
          profileId,
          status: "auth_required",
          ok: true,
          networkAttempted: true,
          httpStatus: response.status,
          message:
            "Remote MCP endpoint requires OAuth or a dedicated expiring MCP key. No MCP tools were executed.",
        };
      }

      if (!response.ok) {
        const error = await readBoundedSanitizedText(response);
        return {
          ...base,
          profileId,
          status: "remote_error",
          ok: false,
          networkAttempted: true,
          httpStatus: response.status,
          error,
          message: `Remote MCP tools/list failed with HTTP ${response.status}.`,
        };
      }

      const payload = await readRemoteToolsJson(response);
      const parsed = parseToolsListResponse(payload, requestId);
      if (parsed.kind === "error") {
        return {
          ...base,
          profileId,
          status: parsed.status,
          ok: false,
          networkAttempted: true,
          httpStatus: response.status,
          error: parsed.error,
          message: parsed.message,
        };
      }

      for (const tool of parsed.tools) {
        if (tools.length >= maxTools) {
          return {
            ...base,
            profileId,
            status: "ok",
            ok: true,
            networkAttempted: true,
            httpStatus,
            tools,
            toolCount: tools.length,
            nextCursorPresent: Boolean(parsed.nextCursor),
            truncated: true,
            message: "Remote MCP tools/list completed with local tool-count truncation. No tools were executed.",
          };
        }
        tools.push(tool);
      }

      cursor = parsed.nextCursor;
      if (cursor && tools.length >= maxTools) {
        return {
          ...base,
          profileId,
          status: "ok",
          ok: true,
          networkAttempted: true,
          httpStatus,
          tools,
          toolCount: tools.length,
          nextCursorPresent: true,
          truncated: true,
          message: "Remote MCP tools/list completed with local tool-count truncation. No tools were executed.",
        };
      }

      if (!cursor) {
        return {
          ...base,
          profileId,
          status: "ok",
          ok: true,
          networkAttempted: true,
          httpStatus,
          tools,
          toolCount: tools.length,
          nextCursorPresent: false,
          truncated: false,
          message: "Remote MCP tools/list completed. No tools were executed.",
        };
      }
      nextCursorPresent = true;
    }

    return {
      ...base,
      profileId,
      status: "too_many_pages",
      ok: false,
      networkAttempted: true,
      httpStatus,
      tools,
      toolCount: tools.length,
      nextCursorPresent,
      truncated: true,
      message: `Remote MCP tools/list exceeded the local page limit of ${maxPages}. No tools were executed.`,
    };
  } catch (error) {
    return {
      ...base,
      profileId,
      status: "network_error",
      ok: false,
      networkAttempted: true,
      error: sanitizeText(error instanceof Error ? error.message : String(error)).slice(
        0,
        MAX_REMOTE_TOOL_ERROR_CHARS,
      ),
      message: "Remote MCP tools/list failed before receiving a usable HTTP response.",
    };
  }
}

type ParsedToolsList =
  | {
      kind: "ok";
      tools: McpRemoteToolSummary[];
      nextCursor?: string;
    }
  | {
      kind: "error";
      status: "remote_error" | "invalid_response";
      message: string;
      error?: string;
    };

function parseToolsListResponse(payload: unknown, requestId: string): ParsedToolsList {
  if (!payload) {
    return {
      kind: "error",
      status: "invalid_response",
      message: "Remote MCP tools/list returned a non-JSON response.",
    };
  }

  const root = asRecord(payload);
  const error = asRecord(root?.error);
  if (error) {
    return {
      kind: "error",
      status: "remote_error",
      error: (boundedStringFromUnknown(error.message, MAX_REMOTE_TOOL_ERROR_CHARS) ??
        sanitizeText(JSON.stringify(redactSecrets(error)))).slice(0, MAX_REMOTE_TOOL_ERROR_CHARS),
      message: "Remote MCP tools/list returned a JSON-RPC error.",
    };
  }

  const result = asRecord(root?.result);
  if (root?.jsonrpc !== "2.0" || root.id !== requestId || !result || !Array.isArray(result.tools)) {
    return {
      kind: "error",
      status: "invalid_response",
      message: "Remote MCP tools/list returned an invalid JSON-RPC response.",
    };
  }

  const tools = result.tools
    .map(parseRemoteTool)
    .filter((tool): tool is McpRemoteToolSummary => Boolean(tool));
  const nextCursor = boundedStringFromUnknown(result.nextCursor, MAX_REMOTE_TOOL_FIELD_CHARS);

  return {
    kind: "ok",
    tools,
    nextCursor,
  };
}

function parseRemoteTool(value: unknown): McpRemoteToolSummary | undefined {
  const record = asRecord(value);
  const name = boundedStringFromUnknown(record?.name, MAX_REMOTE_TOOL_FIELD_CHARS);
  if (!record || !name) {
    return undefined;
  }

  const annotations = asRecord(record.annotations);
  const inputSchema = asRecord(record.inputSchema);
  const outputSchema = asRecord(record.outputSchema);

  return {
    name,
    title: boundedStringFromUnknown(record.title, MAX_REMOTE_TOOL_FIELD_CHARS),
    description: boundedStringFromUnknown(record.description, MAX_REMOTE_TOOL_DESCRIPTION_CHARS),
    toolHash: hashUnknown({
      name: record.name,
      title: record.title,
      description: record.description,
      inputSchema: record.inputSchema,
      outputSchema: record.outputSchema,
      annotations: record.annotations,
    }),
    inputSchemaHash: inputSchema ? hashUnknown(inputSchema) : undefined,
    outputSchemaHash: outputSchema ? hashUnknown(outputSchema) : undefined,
    annotationKeys: annotations ? boundedKeys(annotations, MAX_REMOTE_TOOL_ANNOTATION_KEYS) : undefined,
  };
}

async function readRemoteToolsJson(response: Response): Promise<unknown | undefined> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("json")) {
    return undefined;
  }

  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

async function readBoundedSanitizedText(response: Response): Promise<string | undefined> {
  const text = await response.text();
  const sanitized = sanitizeText(text).trim();
  return sanitized ? sanitized.slice(0, MAX_REMOTE_TOOL_ERROR_CHARS) : undefined;
}

function formatRemoteToolSummary(tool: McpRemoteToolSummary): string {
  return [
    tool.name,
    tool.title ? `title=${JSON.stringify(tool.title)}` : undefined,
    tool.description ? `description=${JSON.stringify(tool.description)}` : undefined,
    `tool_hash=${tool.toolHash}`,
    tool.inputSchemaHash ? `input_schema_hash=${tool.inputSchemaHash}` : undefined,
    tool.outputSchemaHash ? `output_schema_hash=${tool.outputSchemaHash}` : undefined,
    tool.annotationKeys && tool.annotationKeys.length > 0
      ? `annotation_keys=${tool.annotationKeys.join(",")}`
      : undefined,
  ]
    .filter((part): part is string => typeof part === "string")
    .join(" ");
}

function hashUnknown(value: unknown): string {
  return sha256(canonicalJson(redactSecrets(value)));
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      const nextValue = record[key];
      if (typeof nextValue !== "undefined") {
        sorted[key] = canonicalize(nextValue);
      }
    }
    return sorted;
  }

  return value;
}

function boundedKeys(record: Record<string, unknown>, maxKeys: number): string[] | undefined {
  const keys = Object.keys(record)
    .map((key) => sanitizeText(key).slice(0, MAX_REMOTE_TOOL_FIELD_CHARS))
    .filter(Boolean)
    .sort()
    .slice(0, maxKeys);
  return keys.length > 0 ? keys : undefined;
}

function boundedStringFromUnknown(value: unknown, maxChars: number): string | undefined {
  if (typeof value !== "string" || !value) {
    return undefined;
  }
  return sanitizeText(value).slice(0, maxChars);
}

function sanitizeText(text: string): string {
  return String(redactSecrets(stripTerminalControlChars(text)))
    .replace(BEARER_PATTERN, "Bearer [redacted]")
    .replace(API_KEY_LIKE_PATTERN, "[redacted]")
    .replace(SECRET_ASSIGNMENT_PATTERN, "$1[redacted]")
    .replace(/[\r\n\t]+/g, " ")
    .trim();
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function normalizePositiveInt(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(1, Math.min(100, Math.floor(value)));
}
