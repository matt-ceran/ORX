import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { stripTerminalControlChars } from "../research/extract.js";
import { isBlockedIpAddress, type UrlGuardAllowed } from "../research/url-guard.js";

export interface McpRemoteHttpOptions {
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

const DEFAULT_MCP_REMOTE_TIMEOUT_MS = 10_000;
const MAX_MCP_REMOTE_RESPONSE_BYTES = 64_000;

export async function postMcpJsonRpc(
  guardedUrl: UrlGuardAllowed,
  body: string,
  options: McpRemoteHttpOptions,
): Promise<Response> {
  return runWithMcpRemoteAbort(options, (signal) => {
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

    return postWithNativeTransport(guardedUrl, body, {
      resolveHost: options.resolveHost ?? defaultResolveMcpHost,
      signal,
    });
  });
}

async function postWithNativeTransport(
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
          "User-Agent": "ORX MCP remote HTTP",
        },
        lookup: (_hostname, _options, callback) => {
          callback(null, resolved.address, resolved.family);
        },
      },
      (incoming) => {
        readNativeResponseBytes(incoming, MAX_MCP_REMOTE_RESPONSE_BYTES, signal).then(
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
    throw new Error(`DNS lookup failed: ${sanitizeTransportErrorText(message)}`);
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

async function runWithMcpRemoteAbort<T>(
  options: McpRemoteHttpOptions,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const timeoutMs = Math.max(1, options.timeoutMs ?? DEFAULT_MCP_REMOTE_TIMEOUT_MS);
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

function sanitizeTransportErrorText(value: string): string {
  return stripTerminalControlChars(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer REDACTED")
    .replace(/sk-or-v1-[A-Za-z0-9_-]+/gi, "sk-or-v1-REDACTED")
    .replace(/(https?:\/\/)[^/@\s]+@/gi, "$1REDACTED@")
    .replace(/((?:api[_-]?key|access[_-]?token|auth[_-]?token|token|secret|password|passwd)=)[^&\s]+/gi, "$1REDACTED");
}
