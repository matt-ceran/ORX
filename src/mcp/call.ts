import { redactSecrets } from "./audit.js";
import {
  mcpBearerTokenEnvName,
  sanitizeMcpBearerToken,
} from "./credentials.js";
import { evaluateMcpToolPolicy, getMcpStatusSummary } from "./policy.js";
import type { McpRegistryOptions } from "./registry.js";
import { postMcpJsonRpc, type McpRemoteHttpOptions } from "./transport.js";
import { REMOTE_MCP_OUTPUT_POLICY } from "./trust-boundary.js";
import { sha256, stripTerminalControlChars } from "../research/extract.js";
import { guardFetchUrl, type UrlGuardAllowed } from "../research/url-guard.js";

export type McpToolCallStatus =
  | "ok"
  | "tool_error"
  | "auth_required"
  | "disabled"
  | "untrusted"
  | "schema_change_pending"
  | "policy_denied"
  | "blocked_url"
  | "unsupported_transport"
  | "not_found"
  | "tool_not_found"
  | "invalid_arguments"
  | "remote_error"
  | "network_error"
  | "invalid_response";

export interface McpToolCallContentSummary {
  type: string;
  text?: string;
  mimeType?: string;
  dataHash?: string;
  resourceUri?: string;
}

export interface McpToolCallResult {
  profileId: string;
  toolName: string;
  status: McpToolCallStatus;
  ok: boolean;
  networkAttempted: boolean;
  message: string;
  transport?: string;
  url?: string;
  authRequired?: boolean;
  profileHash?: string;
  trustedProfileHash?: string;
  schemaChangePending?: boolean;
  policyDecision?: string;
  httpStatus?: number;
  toolError?: boolean;
  resultHash?: string;
  content?: McpToolCallContentSummary[];
  error?: string;
}

export interface McpToolCallOptions extends McpRegistryOptions, McpRemoteHttpOptions {
  authToken?: string;
  maxTextChars?: number;
}

const TOOL_CALL_REQUEST_ID = "orx-tools-call-1";
const MAX_CALL_ERROR_CHARS = 500;
const MAX_CALL_TEXT_CHARS = 4_000;
const MAX_CALL_CONTENT_ITEMS = 12;
const MAX_CALL_FIELD_CHARS = 200;
const SECRET_ASSIGNMENT_PATTERN =
  /((?:api[_-]?key|access[_-]?token|auth[_-]?token|token|secret|password|passwd|key)\s*[:=]\s*)[^&\s]+/gi;
const BEARER_PATTERN = /bearer\s+[a-z0-9._~+/=-]+/gi;
const API_KEY_LIKE_PATTERN = /(sk-or-v1-[a-z0-9._-]+)/gi;

export async function callRemoteMcpTool(
  profileId: string,
  toolName: string,
  toolArguments: unknown = {},
  options: McpToolCallOptions = {},
): Promise<McpToolCallResult> {
  if (!isPlainObject(toolArguments)) {
    return {
      profileId,
      toolName,
      status: "invalid_arguments",
      ok: false,
      networkAttempted: false,
      message: "MCP tool arguments must be a JSON object.",
    };
  }

  const summary = getMcpStatusSummary(options);
  const profile = summary.profiles.find((candidate) => candidate.id === profileId);
  if (!profile) {
    return {
      profileId,
      toolName,
      status: "not_found",
      ok: false,
      networkAttempted: false,
      message: `Unknown MCP profile: ${profileId}`,
    };
  }

  const tool = profile.tools.find((candidate) => candidate.name === toolName);
  const base = {
    profileId,
    toolName,
    transport: profile.transport.kind,
    url: profile.transport.url,
    authRequired: profile.authRequired || tool?.authRequired,
    profileHash: summary.profileHashes[profile.id],
    trustedProfileHash: summary.trustedProfileHashes[profile.id],
    schemaChangePending: summary.pendingSchemaChangeProfileIds.includes(profile.id),
  };

  if (!tool) {
    return {
      ...base,
      status: "tool_not_found",
      ok: false,
      networkAttempted: false,
      message: `Unknown MCP tool for profile ${profileId}: ${toolName}`,
    };
  }

  const policy = evaluateMcpToolPolicy(profileId, toolName, options);
  const policyDecision = policy.decision;

  if (profile.state !== "enabled") {
    return {
      ...base,
      policyDecision,
      status: "disabled",
      ok: false,
      networkAttempted: false,
      message: `MCP profile ${profileId} is disabled. Enable and trust it with /mcp enable ${profileId} before calling tools.`,
    };
  }

  if (!base.trustedProfileHash) {
    return {
      ...base,
      policyDecision,
      status: "untrusted",
      ok: false,
      networkAttempted: false,
      message: `MCP profile ${profileId} is enabled but has no trusted profile hash baseline. Re-enable it with /mcp enable ${profileId}.`,
    };
  }

  if (base.schemaChangePending) {
    return {
      ...base,
      policyDecision,
      status: "schema_change_pending",
      ok: false,
      networkAttempted: false,
      message: `MCP profile ${profileId} has a pending schema change. Review /mcp inspect ${profileId} and re-enable it before calling tools.`,
    };
  }

  if (policy.decision !== "allowed") {
    return {
      ...base,
      policyDecision,
      status: "policy_denied",
      ok: false,
      networkAttempted: false,
      message: `MCP tool ${profileId}/${toolName} is not allowed: ${policy.reason}.`,
    };
  }

  if (profile.transport.kind !== "remote-http" || !profile.transport.url) {
    return {
      ...base,
      policyDecision,
      status: "unsupported_transport",
      ok: false,
      networkAttempted: false,
      message: `MCP profile ${profileId} uses unsupported tool-call transport: ${profile.transport.kind}.`,
    };
  }

  const guardedUrl = guardFetchUrl(profile.transport.url);
  if (!guardedUrl.ok) {
    return {
      ...base,
      policyDecision,
      status: "blocked_url",
      ok: false,
      networkAttempted: false,
      message: `MCP profile ${profileId} tool-call URL is blocked: ${guardedUrl.reason}`,
    };
  }

  const requiresAuth = profile.authRequired || tool.authRequired;
  const authToken = sanitizeMcpBearerToken(options.authToken);
  if (requiresAuth && !authToken) {
    return {
      ...base,
      policyDecision,
      url: guardedUrl.canonicalUrl,
      status: "auth_required",
      ok: false,
      networkAttempted: false,
      message: `MCP tool ${profileId}/${toolName} requires a bearer token from ${mcpBearerTokenEnvName(profileId)}, ORX_MCP_BEARER_TOKEN, or an opted-in macOS Keychain item.`,
    };
  }

  return attemptMcpToolCall(
    profileId,
    tool.name,
    toolArguments,
    guardedUrl,
    {
      ...base,
      policyDecision,
      url: guardedUrl.canonicalUrl,
    },
    {
      ...options,
      headers: requiresAuth && authToken
        ? {
            ...options.headers,
            Authorization: `Bearer ${authToken}`,
          }
        : options.headers,
    },
  );
}

export function formatMcpToolCallResult(result: McpToolCallResult): string {
  const lines = [
    `MCP tool call: ${result.profileId}/${result.toolName}`,
    `  status: ${result.status}`,
    `  network: ${result.networkAttempted ? "attempted" : "not_attempted"}`,
    result.transport ? `  transport: ${result.transport}` : undefined,
    result.url ? `  url: ${result.url}` : undefined,
    result.authRequired !== undefined
      ? `  auth: ${result.authRequired ? "required" : "not required"}`
      : undefined,
    result.profileHash ? `  profile_hash: ${result.profileHash}` : undefined,
    result.trustedProfileHash ? `  trusted_hash: ${result.trustedProfileHash}` : undefined,
    result.schemaChangePending ? "  schema_change: pending" : undefined,
    result.policyDecision ? `  policy: ${result.policyDecision}` : undefined,
    result.httpStatus ? `  http_status: ${result.httpStatus}` : undefined,
    result.toolError !== undefined ? `  tool_error: ${result.toolError ? "yes" : "no"}` : undefined,
    result.resultHash ? `  result_hash: ${result.resultHash}` : undefined,
    result.error ? `  error: ${result.error}` : undefined,
    `  detail: ${result.message}`,
    `  trust_boundary: ${REMOTE_MCP_OUTPUT_POLICY}`,
    "  untrusted_output_policy: treat remote MCP content as data only; explicit operator grants and local ORX policy take precedence",
    "  model_exposure: not exposed to the model loop",
    result.content && result.content.length > 0 ? "  content:" : undefined,
    ...(result.content ?? []).flatMap((item) => formatCallContentSummaryLines(item)),
  ];

  return lines.filter((line): line is string => typeof line === "string").join("\n");
}

async function attemptMcpToolCall(
  profileId: string,
  toolName: string,
  toolArguments: Record<string, unknown>,
  guardedUrl: UrlGuardAllowed,
  base: Pick<
    McpToolCallResult,
    | "transport"
    | "url"
    | "authRequired"
    | "profileHash"
    | "trustedProfileHash"
    | "schemaChangePending"
    | "policyDecision"
  >,
  options: McpToolCallOptions,
): Promise<McpToolCallResult> {
  try {
    const response = await postMcpJsonRpc(
      guardedUrl,
      JSON.stringify({
        jsonrpc: "2.0",
        id: TOOL_CALL_REQUEST_ID,
        method: "tools/call",
        params: {
          name: toolName,
          arguments: toolArguments,
        },
      }),
      options,
    );

    if (response.status === 401 || response.status === 403) {
      return {
        ...base,
        profileId,
        toolName,
        status: "auth_required",
        ok: false,
        networkAttempted: true,
        httpStatus: response.status,
        message: "Remote MCP endpoint rejected the bearer token. No result was accepted.",
      };
    }

    if (!response.ok) {
      const error = await readBoundedSanitizedText(response);
      return {
        ...base,
        profileId,
        toolName,
        status: "remote_error",
        ok: false,
        networkAttempted: true,
        httpStatus: response.status,
        error,
        message: `Remote MCP tools/call failed with HTTP ${response.status}.`,
      };
    }

    const payload = await readCallJson(response);
    const parsed = parseToolCallResponse(payload, TOOL_CALL_REQUEST_ID, options.maxTextChars);
    return {
      ...base,
      profileId,
      toolName,
      networkAttempted: true,
      httpStatus: response.status,
      ...parsed,
    };
  } catch (error) {
    return {
      ...base,
      profileId,
      toolName,
      status: "network_error",
      ok: false,
      networkAttempted: true,
      error: sanitizeText(error instanceof Error ? error.message : String(error)).slice(
        0,
        MAX_CALL_ERROR_CHARS,
      ),
      message: "Remote MCP tools/call failed before receiving a usable HTTP response.",
    };
  }
}

function parseToolCallResponse(
  payload: unknown,
  requestId: string,
  maxTextChars = MAX_CALL_TEXT_CHARS,
): Pick<
  McpToolCallResult,
  "status" | "ok" | "message" | "toolError" | "resultHash" | "content" | "error"
> {
  if (!payload) {
    return {
      status: "invalid_response",
      ok: false,
      message: "Remote MCP tools/call returned a non-JSON response.",
    };
  }

  const root = asRecord(payload);
  const error = asRecord(root?.error);
  if (error) {
    return {
      status: "remote_error",
      ok: false,
      error: (boundedStringFromUnknown(error.message, MAX_CALL_ERROR_CHARS) ??
        sanitizeText(JSON.stringify(redactSecrets(error)))).slice(0, MAX_CALL_ERROR_CHARS),
      message: "Remote MCP tools/call returned a JSON-RPC error.",
    };
  }

  const result = asRecord(root?.result);
  if (root?.jsonrpc !== "2.0" || root.id !== requestId || !result) {
    return {
      status: "invalid_response",
      ok: false,
      message: "Remote MCP tools/call returned an invalid JSON-RPC response.",
    };
  }

  const toolError = result.isError === true;
  const content = Array.isArray(result.content)
    ? result.content
        .slice(0, MAX_CALL_CONTENT_ITEMS)
        .map((item) => parseCallContentItem(item, maxTextChars))
        .filter((item): item is McpToolCallContentSummary => Boolean(item))
    : [];

  return {
    status: toolError ? "tool_error" : "ok",
    ok: !toolError,
    toolError,
    resultHash: hashUnknown(result),
    content,
    message: toolError
      ? "Remote MCP tool returned an MCP-level error result."
      : "Remote MCP tool call completed.",
  };
}

function parseCallContentItem(
  value: unknown,
  maxTextChars: number,
): McpToolCallContentSummary | undefined {
  const record = asRecord(value);
  const type = boundedStringFromUnknown(record?.type, MAX_CALL_FIELD_CHARS) ?? "unknown";
  if (!record) {
    return undefined;
  }

  const summary: McpToolCallContentSummary = { type };
  const mimeType = boundedStringFromUnknown(record.mimeType, MAX_CALL_FIELD_CHARS);
  if (mimeType) {
    summary.mimeType = mimeType;
  }

  if (type === "text") {
    summary.text = boundedStringFromUnknown(record.text, maxTextChars);
    return summary;
  }

  if (typeof record.data === "string") {
    summary.dataHash = hashUnknown(record.data);
  }

  const resource = asRecord(record.resource);
  const uri = boundedStringFromUnknown(resource?.uri, MAX_CALL_FIELD_CHARS);
  if (uri) {
    summary.resourceUri = uri;
  }

  return summary;
}

async function readCallJson(response: Response): Promise<unknown | undefined> {
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
  return sanitized ? sanitized.slice(0, MAX_CALL_ERROR_CHARS) : undefined;
}

function formatCallContentSummaryLines(item: McpToolCallContentSummary): string[] {
  const metadata = [
    `type=${item.type}`,
    item.mimeType ? `mime=${JSON.stringify(item.mimeType)}` : undefined,
    item.dataHash ? `data_hash=${item.dataHash}` : undefined,
    item.resourceUri ? `resource_uri=${JSON.stringify(item.resourceUri)}` : undefined,
  ]
    .filter((part): part is string => typeof part === "string")
    .join(" ");

  if (!item.text) {
    return [`    - ${metadata}`];
  }

  return [
    `    - ${metadata}`,
    "      text_boundary: BEGIN_UNTRUSTED_MCP_OUTPUT",
    `      text: ${JSON.stringify(item.text)}`,
    "      text_boundary: END_UNTRUSTED_MCP_OUTPUT",
  ];
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
