import { createHash } from "node:crypto";

export function sha256(input: string | Uint8Array): string {
  return `sha256:${createHash("sha256").update(input).digest("hex")}`;
}

export function canonicalJson(value: unknown): string {
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
