import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { Readable } from "node:stream";
import { extractContent, redactSecretLikeValues, sha256, stripTerminalControlChars } from "./extract.js";
import { guardFetchUrl, isBlockedIpAddress, type UrlGuardAllowed } from "./url-guard.js";
import type { EvidenceSource, ResearchFetchResult } from "./types.js";

export interface ResolvedHostAddress {
  address: string;
  family: 4 | 6;
}

export type ResolveHost = (hostname: string) => Promise<ResolvedHostAddress[]>;

export interface FetchUrlOptions {
  url: string;
  sourceId: string;
  /**
   * Test-only transport hook. Production callers should omit this so ORX uses
   * the guarded Node transport with DNS vetting and address binding.
   */
  fetch?: typeof fetch;
  resolveHost?: ResolveHost;
  now?: Date;
  timeoutMs?: number;
  maxBytes?: number;
  maxExtractedTextChars?: number;
}

export class ResearchFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResearchFetchError";
  }
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 256_000;
const MAX_REDIRECTS = 5;

interface NativeResearchResponse {
  kind: "native";
  status: number;
  statusText: string;
  ok: boolean;
  headers: {
    get(name: string): string | null;
  };
  body: Readable;
}

type ResearchResponse = Response | NativeResearchResponse;

export async function fetchUrl({
  url,
  sourceId,
  fetch: fetchImpl,
  resolveHost = defaultResolveHost,
  now = new Date(),
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxBytes = DEFAULT_MAX_BYTES,
  maxExtractedTextChars,
}: FetchUrlOptions): Promise<ResearchFetchResult> {
  let guarded = guardFetchUrl(url);
  if (!guarded.ok) {
    throw new ResearchFetchError(guarded.reason);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));

  let response: ResearchResponse | undefined;
  try {
    for (let redirectCount = 0; ; redirectCount += 1) {
      response = fetchImpl
        ? await fetchWithInjectedTransport(guarded.fetchUrl, fetchImpl, controller.signal)
        : await fetchWithNativeTransport(guarded, resolveHost, controller.signal);

      if (!isRedirectStatus(response.status)) {
        break;
      }

      if (redirectCount >= MAX_REDIRECTS) {
        throw new ResearchFetchError(`Too many redirects; maximum is ${MAX_REDIRECTS}.`);
      }

      const location = response.headers.get("location");
      if (!location) {
        closeResponseBody(response);
        throw new ResearchFetchError(`HTTP ${response.status} redirect without Location header.`);
      }

      const redirectedUrl = new URL(location, guarded.fetchUrl).toString();
      const nextGuarded = guardFetchUrl(redirectedUrl);
      if (!nextGuarded.ok) {
        closeResponseBody(response);
        throw new ResearchFetchError(`Blocked redirect: ${nextGuarded.reason}`);
      }
      closeResponseBody(response);
      guarded = nextGuarded;
    }

    if (!response.ok) {
      closeResponseBody(response);
      throw new ResearchFetchError(`HTTP ${response.status} ${sanitizeErrorText(response.statusText)}`.trim());
    }

    const { bytes, returnedBytes, truncated } = await readResponseBytes(
      response,
      maxBytes,
      controller.signal,
    );
    const contentType = response.headers.get("content-type") ?? undefined;
    const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    const extracted = extractContent({
      body: decoded,
      contentType,
      maxTextChars: maxExtractedTextChars,
    });
    const source: EvidenceSource = {
      id: sourceId,
      kind: "web",
      canonicalUrl: guarded.canonicalUrl,
      title: extracted.title ? redactSecretLikeValues(stripTerminalControlChars(extracted.title)) : undefined,
      fetchedAt: now.toISOString(),
      provider: "direct-fetch",
      contentHash: sha256(bytes),
      trustTier: "unknown",
      spans: [
        {
          start: 0,
          end: extracted.text.length,
          textHash: extracted.textHash,
        },
      ],
    };

    return {
      source,
      extracted,
      status: response.status,
      contentType,
      returnedBytes,
      truncatedBytes: truncated,
    };
  } catch (error) {
    if (error instanceof ResearchFetchError) {
      throw error;
    }
    throw new ResearchFetchError(formatFetchFailure(error, timeoutMs));
  } finally {
    clearTimeout(timeout);
  }
}

export function formatResearchFetchError(error: unknown): string {
  if (error instanceof ResearchFetchError) {
    return error.message;
  }

  if (error instanceof Error) {
    return sanitizeErrorText(error.message);
  }

  return sanitizeErrorText(String(error));
}

function formatFetchFailure(error: unknown, timeoutMs: number): string {
  if (isAbortError(error)) {
    return `Fetch timed out after ${timeoutMs}ms.`;
  }

  const message = error instanceof Error ? error.message : String(error);
  return `Fetch failed: ${sanitizeErrorText(message)}`;
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

async function fetchWithInjectedTransport(
  url: string,
  fetchImpl: typeof fetch,
  signal: AbortSignal,
): Promise<Response> {
  return fetchImpl(url, {
    redirect: "manual",
    signal,
    headers: {
      "user-agent": "ORX research fetch",
      accept: "text/html,text/plain;q=0.9,*/*;q=0.5",
    },
  });
}

async function fetchWithNativeTransport(
  guarded: UrlGuardAllowed,
  resolveHost: ResolveHost,
  signal: AbortSignal,
): Promise<NativeResearchResponse> {
  throwIfAborted(signal);
  const url = new URL(guarded.fetchUrl);
  const resolved = await resolveVettedAddress(guarded.hostname, resolveHost, signal);
  throwIfAborted(signal);

  const requestImpl = url.protocol === "https:" ? httpsRequest : httpRequest;

  return new Promise((resolve, reject) => {
    const request = requestImpl(
      url,
      {
        method: "GET",
        signal,
        headers: {
          "user-agent": "ORX research fetch",
          accept: "text/html,text/plain;q=0.9,*/*;q=0.5",
        },
        lookup: (_hostname, _options, callback) => {
          callback(null, resolved.address, resolved.family);
        },
      },
      (incoming) => {
        const status = incoming.statusCode ?? 0;
        resolve({
          kind: "native",
          status,
          statusText: incoming.statusMessage ?? "",
          ok: status >= 200 && status <= 299,
          headers: {
            get(name: string) {
              const value = incoming.headers[name.toLowerCase()];
              if (Array.isArray(value)) {
                return value.join(", ");
              }
              return value ?? null;
            },
          },
          body: incoming,
        });
      },
    );

    request.on("error", reject);
    request.end();
  });
}

async function resolveVettedAddress(
  hostname: string,
  resolveHost: ResolveHost,
  signal: AbortSignal,
): Promise<ResolvedHostAddress> {
  throwIfAborted(signal);
  const ipVersion = isIP(hostname);
  if (ipVersion === 4 || ipVersion === 6) {
    if (isBlockedIpAddress(hostname)) {
      throw new ResearchFetchError(`Blocked resolved local or private IP address: ${hostname}.`);
    }
    return { address: hostname, family: ipVersion };
  }

  let addresses: ResolvedHostAddress[];
  try {
    addresses = await runWithAbort(resolveHost(hostname), signal);
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new ResearchFetchError(`DNS lookup failed: ${sanitizeErrorText(message)}`);
  }

  if (addresses.length === 0) {
    throw new ResearchFetchError("DNS lookup returned no addresses.");
  }

  for (const record of addresses) {
    if ((record.family !== 4 && record.family !== 6) || isBlockedIpAddress(record.address)) {
      throw new ResearchFetchError(
        `Blocked resolved local or private IP address: ${record.address}.`,
      );
    }
  }

  return addresses[0];
}

async function defaultResolveHost(hostname: string): Promise<ResolvedHostAddress[]> {
  const records = await dnsLookup(hostname, { all: true, verbatim: true });
  return records.map((record) => ({
    address: record.address,
    family: record.family === 6 ? 6 : 4,
  }));
}

async function readResponseBytes(
  response: ResearchResponse,
  maxBytes: number,
  signal: AbortSignal,
): Promise<{ bytes: Uint8Array; returnedBytes: number; truncated: boolean }> {
  if (isNativeResponse(response)) {
    return readNodeStreamBytes(response.body, maxBytes, signal);
  }

  const limit = Math.max(0, maxBytes);
  if (!response.body) {
    const bytes = new Uint8Array(await runWithAbort(response.arrayBuffer(), signal));
    return {
      bytes: bytes.slice(0, limit),
      returnedBytes: Math.min(bytes.byteLength, limit),
      truncated: bytes.byteLength > limit,
    };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let returnedBytes = 0;
  let truncated = false;

  try {
    while (returnedBytes < limit) {
      const result = await readWebStreamChunk(reader, signal);
      if (result.done) {
        break;
      }

      const value = result.value;
      const remaining = limit - returnedBytes;
      if (value.byteLength > remaining) {
        chunks.push(value.slice(0, remaining));
        returnedBytes += remaining;
        truncated = true;
        void reader.cancel().catch(() => undefined);
        break;
      }

      chunks.push(value);
      returnedBytes += value.byteLength;
    }

    if (returnedBytes >= limit) {
      const next = await readWebStreamChunk(reader, signal);
      if (!next.done) {
        truncated = true;
        void reader.cancel().catch(() => undefined);
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // Abort races can leave a pending read while cancellation settles.
    }
  }

  return {
    bytes: concatBytes(chunks, returnedBytes),
    returnedBytes,
    truncated,
  };
}

function isNativeResponse(response: ResearchResponse): response is NativeResearchResponse {
  return "kind" in response && response.kind === "native";
}

function closeResponseBody(response: ResearchResponse): void {
  if (isNativeResponse(response)) {
    response.body.destroy();
    return;
  }

  void response.body?.cancel().catch(() => undefined);
}

function readWebStreamChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  return runWithAbort(reader.read(), signal, () => {
    void reader.cancel().catch(() => undefined);
  });
}

function readNodeStreamBytes(
  stream: Readable,
  maxBytes: number,
  signal: AbortSignal,
): Promise<{ bytes: Uint8Array; returnedBytes: number; truncated: boolean }> {
  const limit = Math.max(0, maxBytes);
  const chunks: Uint8Array[] = [];
  let returnedBytes = 0;
  let truncated = false;

  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve({
        bytes: concatBytes(chunks, returnedBytes),
        returnedBytes,
        truncated,
      });
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
      stream.destroy(createAbortError());
      fail(createAbortError());
    };

    const onData = (chunk: Buffer | string) => {
      const value = typeof chunk === "string" ? new TextEncoder().encode(chunk) : new Uint8Array(chunk);
      const remaining = limit - returnedBytes;

      if (remaining <= 0) {
        truncated = true;
        stream.destroy();
        finish();
        return;
      }

      if (value.byteLength > remaining) {
        chunks.push(value.slice(0, remaining));
        returnedBytes += remaining;
        truncated = true;
        stream.destroy();
        finish();
        return;
      }

      chunks.push(value);
      returnedBytes += value.byteLength;
    };

    const cleanup = () => {
      signal.removeEventListener("abort", onAbort);
      stream.off("data", onData);
      stream.off("end", finish);
      stream.off("error", fail);
    };

    if (signal.aborted) {
      onAbort();
      return;
    }

    signal.addEventListener("abort", onAbort, { once: true });
    stream.on("data", onData);
    stream.on("end", finish);
    stream.on("error", fail);
  });
}

function runWithAbort<T>(
  operation: Promise<T>,
  signal: AbortSignal,
  onAbort?: () => void,
): Promise<T> {
  if (signal.aborted) {
    onAbort?.();
    return Promise.reject(createAbortError());
  }

  return new Promise((resolve, reject) => {
    const abort = () => {
      onAbort?.();
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

function sanitizeErrorText(value: string): string {
  return stripTerminalControlChars(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer REDACTED")
    .replace(/sk-or-v1-[A-Za-z0-9_-]+/gi, "sk-or-v1-REDACTED")
    .replace(/(https?:\/\/)[^/@\s]+@/gi, "$1REDACTED@")
    .replace(/((?:api[_-]?key|access[_-]?token|auth[_-]?token|token|secret|password|passwd)=)[^&\s]+/gi, "$1REDACTED");
}

function isAbortError(error: unknown): boolean {
  return (
    (typeof DOMException !== "undefined" &&
      error instanceof DOMException &&
      error.name === "AbortError") ||
    (error instanceof Error && (error.name === "AbortError" || error.message === "AbortError"))
  );
}
