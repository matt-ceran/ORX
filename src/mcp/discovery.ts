import { redactSecrets } from "./audit.js";
import { getMcpStatusSummary } from "./policy.js";
import type { McpRegistryOptions } from "./registry.js";
import { postMcpJsonRpc, type McpRemoteHttpOptions } from "./transport.js";
import { stripTerminalControlChars } from "../research/extract.js";
import { guardFetchUrl, type UrlGuardAllowed } from "../research/url-guard.js";

export type { ResolvedMcpHostAddress, ResolveMcpHost } from "./transport.js";

export type McpDiscoveryStatus =
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
  | "invalid_response";

export interface McpDiscoveryResult {
  profileId: string;
  status: McpDiscoveryStatus;
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
  serverInfo?: {
    name?: string;
    version?: string;
  };
  protocolVersion?: string;
  capabilityKeys?: string[];
  error?: string;
}

export interface McpDiscoveryOptions extends McpRegistryOptions, McpRemoteHttpOptions {}

const DISCOVERY_REQUEST_ID = "orx-discovery-1";
const MAX_DISCOVERY_FIELD_CHARS = 160;
const MAX_DISCOVERY_ERROR_CHARS = 500;
const MAX_DISCOVERY_CAPABILITIES = 20;

export async function discoverMcpProfile(
  profileId: string,
  options: McpDiscoveryOptions = {},
): Promise<McpDiscoveryResult> {
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
      message: `MCP profile ${profileId} is disabled. Enable and trust it with /mcp enable ${profileId} before discovery.`,
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
      message: `MCP profile ${profileId} has a pending schema change. Review /mcp inspect ${profileId} and re-enable it before discovery.`,
    };
  }

  if (profile.transport.kind !== "remote-http" || !profile.transport.url) {
    return {
      ...base,
      status: "unsupported_transport",
      ok: true,
      networkAttempted: false,
      message: `MCP profile ${profileId} uses unsupported discovery transport: ${profile.transport.kind}.`,
    };
  }

  const guardedUrl = guardFetchUrl(profile.transport.url);
  if (!guardedUrl.ok) {
    return {
      ...base,
      status: "blocked_url",
      ok: true,
      networkAttempted: false,
      message: `MCP profile ${profileId} discovery URL is blocked: ${guardedUrl.reason}`,
    };
  }

  return attemptRemoteHttpDiscovery(
    profileId,
    guardedUrl,
    {
      ...base,
      url: guardedUrl.canonicalUrl,
    },
    options,
  );
}

export function formatMcpDiscoveryResult(result: McpDiscoveryResult): string {
  const lines = [
    `MCP discovery: ${result.profileId}`,
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
    result.serverInfo?.name ? `  server_name: ${result.serverInfo.name}` : undefined,
    result.serverInfo?.version ? `  server_version: ${result.serverInfo.version}` : undefined,
    result.protocolVersion ? `  protocol_version: ${result.protocolVersion}` : undefined,
    result.capabilityKeys && result.capabilityKeys.length > 0
      ? `  capabilities: ${result.capabilityKeys.join(",")}`
      : undefined,
    result.error ? `  error: ${result.error}` : undefined,
    `  detail: ${result.message}`,
    "  tool_execution: not implemented; remote MCP tools are not exposed to the model loop",
  ];

  return lines.filter((line): line is string => typeof line === "string").join("\n");
}

async function attemptRemoteHttpDiscovery(
  profileId: string,
  guardedUrl: UrlGuardAllowed,
  base: Pick<
    McpDiscoveryResult,
    | "transport"
    | "url"
    | "authRequired"
    | "profileHash"
    | "trustedProfileHash"
    | "schemaChangePending"
  >,
  options: McpDiscoveryOptions,
): Promise<McpDiscoveryResult> {
  try {
    const response = await fetchMcpInitializeResponse(guardedUrl, options);

    if (response.status === 401 || response.status === 403) {
      return {
        ...base,
        profileId,
        status: "auth_required",
        ok: true,
        networkAttempted: true,
        httpStatus: response.status,
        message:
          "Remote MCP endpoint requires OAuth or a dedicated expiring MCP key. No MCP tools were listed or executed.",
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
        message: `Remote MCP discovery failed with HTTP ${response.status}.`,
      };
    }

    const payload = await readDiscoveryJson(response);
    if (!payload) {
      return {
        ...base,
        profileId,
        status: "invalid_response",
        ok: false,
        networkAttempted: true,
        httpStatus: response.status,
        message: "Remote MCP discovery returned a non-JSON response.",
      };
    }

    const root = asRecord(payload);
    const error = asRecord(root?.error);
    if (error) {
      return {
        ...base,
        profileId,
        status: "remote_error",
        ok: false,
        networkAttempted: true,
        httpStatus: response.status,
        error: (boundedStringFromUnknown(error.message) ?? sanitizeText(JSON.stringify(redactSecrets(error)))).slice(
          0,
          MAX_DISCOVERY_ERROR_CHARS,
        ),
        message: "Remote MCP initialize returned a JSON-RPC error.",
      };
    }

    const result = asRecord(root?.result);
    if (
      root?.jsonrpc !== "2.0" ||
      root.id !== DISCOVERY_REQUEST_ID ||
      !result ||
      typeof result.protocolVersion !== "string"
    ) {
      return {
        ...base,
        profileId,
        status: "invalid_response",
        ok: false,
        networkAttempted: true,
        httpStatus: response.status,
        message: "Remote MCP discovery returned an invalid JSON-RPC initialize response.",
      };
    }

    const serverInfo = asRecord(result?.serverInfo);
    const capabilities = asRecord(result?.capabilities);

    return {
      ...base,
      profileId,
      status: "ok",
      ok: true,
      networkAttempted: true,
      httpStatus: response.status,
      serverInfo: serverInfo
        ? {
            name: boundedStringFromUnknown(serverInfo.name),
            version: boundedStringFromUnknown(serverInfo.version),
          }
        : undefined,
      protocolVersion: boundedStringFromUnknown(result?.protocolVersion),
      capabilityKeys: capabilities ? boundedCapabilityKeys(capabilities) : undefined,
      message: "Remote MCP initialize handshake completed. No MCP tools were executed.",
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
        MAX_DISCOVERY_ERROR_CHARS,
      ),
      message: "Remote MCP discovery failed before receiving a usable HTTP response.",
    };
  }
}

async function fetchMcpInitializeResponse(
  guardedUrl: UrlGuardAllowed,
  options: McpDiscoveryOptions,
): Promise<Response> {
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: DISCOVERY_REQUEST_ID,
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: {
        name: "orx",
        version: "0.0.0",
      },
    },
  });

  return postMcpJsonRpc(guardedUrl, body, options);
}

async function readDiscoveryJson(response: Response): Promise<unknown | undefined> {
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
  return sanitized ? sanitized.slice(0, MAX_DISCOVERY_ERROR_CHARS) : undefined;
}

function sanitizeText(text: string): string {
  return String(redactSecrets(stripTerminalControlChars(text)));
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function boundedStringFromUnknown(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) {
    return undefined;
  }

  return sanitizeText(value).slice(0, MAX_DISCOVERY_FIELD_CHARS);
}

function boundedCapabilityKeys(capabilities: Record<string, unknown>): string[] | undefined {
  const keys = Object.keys(capabilities)
    .map((key) => sanitizeText(key).slice(0, MAX_DISCOVERY_FIELD_CHARS))
    .filter(Boolean)
    .sort()
    .slice(0, MAX_DISCOVERY_CAPABILITIES);

  return keys.length > 0 ? keys : undefined;
}
