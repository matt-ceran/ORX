import { isIP } from "node:net";

export interface UrlGuardAllowed {
  ok: true;
  fetchUrl: string;
  canonicalUrl: string;
  hostname: string;
}

export interface UrlGuardBlocked {
  ok: false;
  reason: string;
}

export type UrlGuardResult = UrlGuardAllowed | UrlGuardBlocked;

const SECRET_QUERY_KEYS = /(?:^|[_-])(?:api[_-]?key|access[_-]?token|auth[_-]?token|token|secret|password|passwd|key)(?:$|[_-])/i;
const SECRET_LIKE_VALUE =
  /\b(?:sk-or-v1-[A-Za-z0-9_-]+|github_pat_[A-Za-z0-9_]+|ghp_[A-Za-z0-9_]+|glpat-[A-Za-z0-9_-]+|xox[baprs]-[A-Za-z0-9-]+)\b/g;

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata",
  "metadata.google.internal",
  "metadata.azure.internal",
  "instance-data",
  "instance-data.ec2.internal",
]);

const CLOUD_METADATA_IPV4 = new Set(["169.254.169.254", "169.254.170.2", "100.100.100.200", "168.63.129.16"]);

export function guardFetchUrl(rawUrl: string): UrlGuardResult {
  const parsed = parseUrl(rawUrl);
  if (!parsed) {
    return { ok: false, reason: "Invalid URL." };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: "Only http and https URLs are allowed." };
  }

  if (parsed.username || parsed.password) {
    return { ok: false, reason: "URLs with embedded credentials are not allowed." };
  }

  const hostname = normalizeHostname(parsed.hostname);
  if (!hostname) {
    return { ok: false, reason: "URL host is required." };
  }

  if (isBlockedHostname(hostname)) {
    return { ok: false, reason: `Blocked local or metadata host: ${hostname}.` };
  }

  const ipVersion = isIP(hostname);
  if (ipVersion === 4 && isBlockedIpv4(hostname)) {
    return { ok: false, reason: `Blocked local or private IPv4 address: ${hostname}.` };
  }

  if (ipVersion === 6 && isBlockedIpv6(hostname)) {
    return { ok: false, reason: `Blocked local IPv6 address: ${hostname}.` };
  }

  return {
    ok: true,
    fetchUrl: parsed.toString(),
    canonicalUrl: canonicalizeUrl(parsed),
    hostname,
  };
}

export function isBlockedIpAddress(address: string): boolean {
  const ipVersion = isIP(address);
  if (ipVersion === 4) {
    return isBlockedIpv4(address);
  }
  if (ipVersion === 6) {
    return isBlockedIpv6(address);
  }
  return true;
}

export function canonicalizeUrl(url: URL): string {
  const safeUrl = new URL(url.toString());
  safeUrl.hash = "";
  safeUrl.username = "";
  safeUrl.password = "";
  safeUrl.pathname = safeUrl.pathname.replace(SECRET_LIKE_VALUE, "REDACTED");

  for (const [key, value] of Array.from(safeUrl.searchParams.entries())) {
    if (SECRET_QUERY_KEYS.test(key) || SECRET_LIKE_VALUE.test(value)) {
      safeUrl.searchParams.set(key, "REDACTED");
    }
    SECRET_LIKE_VALUE.lastIndex = 0;
  }

  return safeUrl.toString();
}

function parseUrl(rawUrl: string): URL | undefined {
  try {
    return new URL(rawUrl.trim());
  } catch {
    return undefined;
  }
}

function normalizeHostname(hostname: string): string {
  let normalized = hostname.trim().toLowerCase();
  if (normalized.startsWith("[") && normalized.endsWith("]")) {
    normalized = normalized.slice(1, -1);
  }
  while (normalized.endsWith(".")) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

function isBlockedHostname(hostname: string): boolean {
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return true;
  }

  return hostname.endsWith(".localhost") || hostname.endsWith(".metadata.google.internal");
}

function isBlockedIpv4(address: string): boolean {
  if (CLOUD_METADATA_IPV4.has(address)) {
    return true;
  }

  const octets = address.split(".").map((part) => Number(part));
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return true;
  }

  const [a, b, c] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    (a >= 224 && a <= 239) ||
    a >= 240
  );
}

function isBlockedIpv6(address: string): boolean {
  const groups = parseIpv6Groups(address);
  if (!groups) {
    return true;
  }

  const first = groups[0];
  if (groups.every((group) => group === 0)) {
    return true;
  }

  if (groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1) {
    return true;
  }

  if ((first & 0xfe00) === 0xfc00) {
    return true;
  }

  if ((first & 0xffc0) === 0xfe80) {
    return true;
  }

  if ((first & 0xff00) === 0xff00) {
    return true;
  }

  const mappedIpv4 = ipv4FromMappedIpv6(groups);
  return mappedIpv4 ? isBlockedIpv4(mappedIpv4) : false;
}

function ipv4FromMappedIpv6(groups: number[]): string | undefined {
  const isMapped =
    groups[0] === 0 &&
    groups[1] === 0 &&
    groups[2] === 0 &&
    groups[3] === 0 &&
    groups[4] === 0 &&
    groups[5] === 0xffff;

  if (!isMapped) {
    return undefined;
  }

  return [
    (groups[6] >> 8) & 0xff,
    groups[6] & 0xff,
    (groups[7] >> 8) & 0xff,
    groups[7] & 0xff,
  ].join(".");
}

function parseIpv6Groups(address: string): number[] | undefined {
  const withoutZone = address.split("%", 1)[0].toLowerCase();
  if (withoutZone.includes(".")) {
    return parseIpv6Groups(expandEmbeddedIpv4(withoutZone));
  }

  const halves = withoutZone.split("::");
  if (halves.length > 2) {
    return undefined;
  }

  const head = splitIpv6Half(halves[0]);
  const tail = halves.length === 2 ? splitIpv6Half(halves[1]) : [];
  if (!head || !tail) {
    return undefined;
  }

  const missing = 8 - head.length - tail.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) {
    return undefined;
  }

  return [...head, ...Array.from({ length: missing }, () => 0), ...tail];
}

function splitIpv6Half(value: string): number[] | undefined {
  if (!value) {
    return [];
  }

  const groups: number[] = [];
  for (const part of value.split(":")) {
    if (!/^[0-9a-f]{1,4}$/i.test(part)) {
      return undefined;
    }
    groups.push(Number.parseInt(part, 16));
  }
  return groups;
}

function expandEmbeddedIpv4(address: string): string {
  const lastColon = address.lastIndexOf(":");
  const ipv4 = address.slice(lastColon + 1);
  const octets = ipv4.split(".").map((part) => Number(part));
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return address;
  }

  const high = ((octets[0] << 8) | octets[1]).toString(16);
  const low = ((octets[2] << 8) | octets[3]).toString(16);
  return `${address.slice(0, lastColon + 1)}${high}:${low}`;
}
