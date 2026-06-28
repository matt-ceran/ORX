import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import type { IncomingMessage } from "node:http";
import { redactSecrets } from "./audit.js";
import { getMcpStatusSummary } from "./policy.js";
import type { McpRegistryOptions } from "./registry.js";
import { stripTerminalControlChars } from "../research/extract.js";
import {
  guardFetchUrl,
  isBlockedIpAddress,
  type UrlGuardAllowed,
} from "../research/url-guard.js";

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

export interface McpDiscoveryOptions extends McpRegistryOptions {
  /**
   * Test-only transport hook. Production callers should omit this so ORX uses
   * the guarded Node transport with DNS vetting and address binding.
   */
  fetch?: typeof fetch;
  resolveHost?: ResolveMcpHost;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface ResolvedMcpHostAddress {
  address: string;
  family: 4 | 6;
}

export type ResolveMcpHost = (hostname: string) => Promise<ResolvedMcpHostAddress[]>;

const DISCOVERY_REQUEST_ID = "orx-discovery-1";
const MAX_DISCOVERY_FIELD_CHARS = 160;
const MAX_DISCOVERY_ERROR_CHARS = 500;
const MAX_DISCOVERY_CAPABILITIES = 20;
const MAX_DISCOVERY_RESPONSE_BYTES = 64_000;
const DEFAULT_DISCOVERY_TIMEOUT_MS = 10_000;

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

  return runWithDiscoveryAbort(options, (signal) => {
    if (options.fetch) {
      return options.fetch(guardedUrl.fetchUrl, {
        method: "POST",
        redirect: "manual",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body,
        signal,
      });
    }

    return fetchWithNativeTransport(guardedUrl, body, {
      resolveHost: options.resolveHost ?? defaultResolveMcpHost,
      signal,
    });
  });
}

async function fetchWithNativeTransport(
  guardedUrl: UrlGuardAllowed,
  body: string,
  {
    resolveHost,
    signal,
  }: {
    resolveHost: ResolveMcpHost;
    signal: AbortSignal;
  },
): Promise<Response> {
  throwIfAborted(signal);
  const url = new URL(guardedUrl.fetchUrl);
  const resolved = await resolveVettedMcpAddress(guardedUrl.hostname, resolveHost, signal);
  throwIfAborted(signal);

  const requestImpl = url.protocol === "https:" ? httpsRequest : httpRequest;

  return new Promise((resolve, reject) => {
    let settled = false;
    const request = requestImpl(
      url,
      {
        method: "POST",
        signal,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body).toString(),
          "User-Agent": "ORX MCP discovery",
        },
        lookup: (_hostname, _options, callback) => {
          callback(null, resolved.address, resolved.family);
        },
      },
      (incoming) => {
        readNativeResponseBytes(incoming, MAX_DISCOVERY_RESPONSE_BYTES, signal).then(
          (bytes) => {
            if (settled) {
              return;
            }
            settled = true;
            const bodyBuffer = bytes.buffer.slice(
              bytes.byteOffset,
              bytes.byteOffset + bytes.byteLength,
            ) as ArrayBuffer;
            resolve(
              new Response(bodyBuffer, {
                status: incoming.statusCode ?? 0,
                statusText: incoming.statusMessage,
                headers: headersFromIncomingMessage(incoming),
              }),
            );
          },
          (error) => {
            if (settled) {
              return;
            }
            settled = true;
            reject(error);
          },
        );
      },
    );

    request.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      reject(error);
    });

    request.end(body);
  });
}

async function resolveVettedMcpAddress(
  hostname: string,
  resolveHost: ResolveMcpHost,
  signal: AbortSignal,
): Promise<ResolvedMcpHostAddress> {
  throwIfAborted(signal);
  const ipVersion = isIP(hostname);
  if (ipVersion === 4 || ipVersion === 6) {
    if (isBlockedIpAddress(hostname)) {
      throw new Error(`Blocked resolved local or private IP address: ${hostname}.`);
    }
    return { address: hostname, family: ipVersion };
  }

  let addresses: ResolvedMcpHostAddress[];
  try {
    addresses = await runWithAbort(resolveHost(hostname), signal);
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`DNS lookup failed: ${sanitizeText(message)}`);
  }

  if (addresses.length === 0) {
    throw new Error("DNS lookup returned no addresses.");
  }

  for (const record of addresses) {
    if ((record.family !== 4 && record.family !== 6) || isBlockedIpAddress(record.address)) {
      throw new Error(`Blocked resolved local or private IP address: ${record.address}.`);
    }
  }

  return addresses[0];
}

async function defaultResolveMcpHost(hostname: string): Promise<ResolvedMcpHostAddress[]> {
  const records = await dnsLookup(hostname, { all: true, verbatim: true });
  return records.map((record) => ({
    address: record.address,
    family: record.family === 6 ? 6 : 4,
  }));
}

function readNativeResponseBytes(
  incoming: IncomingMessage,
  maxBytes: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  const limit = Math.max(0, maxBytes);
  const chunks: Uint8Array[] = [];
  let returnedBytes = 0;

  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(concatBytes(chunks, returnedBytes));
    };

    const fail = (error: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(error);
    };

    const onAbort = () => {
      incoming.destroy(createAbortError());
      fail(createAbortError());
    };

    const onData = (chunk: Buffer | string) => {
      const value = typeof chunk === "string" ? new TextEncoder().encode(chunk) : new Uint8Array(chunk);
      const remaining = limit - returnedBytes;

      if (remaining <= 0) {
        incoming.destroy();
        finish();
        return;
      }

      if (value.byteLength > remaining) {
        chunks.push(value.slice(0, remaining));
        returnedBytes += remaining;
        incoming.destroy();
        finish();
        return;
      }

      chunks.push(value);
      returnedBytes += value.byteLength;
    };

    const cleanup = () => {
      signal.removeEventListener("abort", onAbort);
      incoming.off("data", onData);
      incoming.off("end", finish);
      incoming.off("error", fail);
    };

    if (signal.aborted) {
      onAbort();
      return;
    }

    signal.addEventListener("abort", onAbort, { once: true });
    incoming.on("data", onData);
    incoming.on("end", finish);
    incoming.on("error", fail);
  });
}

function headersFromIncomingMessage(incoming: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(incoming.headers)) {
    if (Array.isArray(value)) {
      headers.set(name, value.join(", "));
    } else if (value !== undefined) {
      headers.set(name, value);
    }
  }
  return headers;
}

async function runWithDiscoveryAbort<T>(
  options: McpDiscoveryOptions,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const timeoutMs = Math.max(1, options.timeoutMs ?? DEFAULT_DISCOVERY_TIMEOUT_MS);
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const abortFromOuterSignal = () => controller.abort();

  if (options.signal?.aborted) {
    controller.abort();
  } else {
    options.signal?.addEventListener("abort", abortFromOuterSignal, { once: true });
  }

  try {
    return await operation(controller.signal);
  } catch (error) {
    if (timedOut && isAbortError(error)) {
      throw new Error(`Fetch timed out after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abortFromOuterSignal);
  }
}

function runWithAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(createAbortError());
  }

  return new Promise((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener("abort", abort);
      reject(createAbortError());
    };
    const cleanup = () => {
      signal.removeEventListener("abort", abort);
    };

    signal.addEventListener("abort", abort, { once: true });
    operation.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
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

function concatBytes(chunks: Uint8Array[], length: number): Uint8Array {
  const combined = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return combined;
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw createAbortError();
  }
}

function createAbortError(): Error {
  const error = new Error("AbortError");
  error.name = "AbortError";
  return error;
}

function isAbortError(error: unknown): boolean {
  return (
    (typeof DOMException !== "undefined" &&
      error instanceof DOMException &&
      error.name === "AbortError") ||
    (error instanceof Error && (error.name === "AbortError" || error.message === "AbortError"))
  );
}
