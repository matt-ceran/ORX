import { createHash } from "node:crypto";
import type { McpProfile } from "./registry.js";

export interface McpProfileHashInput {
  id: string;
  name: string;
  notes: string;
  transport: {
    kind: string;
    url?: string;
  };
  riskLevel: string;
  authRequired: boolean;
  writeCapable: boolean;
  tools: Array<{
    name: string;
    risk: string;
    authRequired: boolean;
    billable: boolean;
  }>;
  source?: {
    kind: string;
    pluginId?: string;
    manifestHash?: string;
    componentPath?: string;
    componentHash?: string;
  };
}

export function mcpProfileHashInput(profile: McpProfile): McpProfileHashInput {
  return {
    id: profile.id,
    name: profile.name,
    notes: profile.notes,
    transport: {
      kind: profile.transport.kind,
      url: profile.transport.url,
    },
    riskLevel: profile.riskLevel,
    authRequired: profile.authRequired,
    writeCapable: profile.writeCapable,
    tools: [...profile.tools]
      .map((tool) => ({
        name: tool.name,
        risk: tool.risk,
        authRequired: tool.authRequired,
        billable: tool.billable,
      }))
      .sort(compareToolHashInput),
    source: profile.source
      ? {
          kind: profile.source.kind,
          pluginId: profile.source.pluginId,
          manifestHash: profile.source.manifestHash,
          componentPath: profile.source.componentPath,
          componentHash: profile.source.componentHash,
        }
      : undefined,
  };
}

export function hashMcpProfile(profile: McpProfile): string {
  return sha256(canonicalJson(mcpProfileHashInput(profile)));
}

export function hashMcpProfiles(profiles: McpProfile[]): string {
  const inputs = profiles
    .map((profile) => mcpProfileHashInput(profile))
    .sort((left, right) => left.id.localeCompare(right.id));
  return sha256(canonicalJson(inputs));
}

function sha256(input: string): string {
  return `sha256:${createHash("sha256").update(input).digest("hex")}`;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function compareToolHashInput(
  left: McpProfileHashInput["tools"][number],
  right: McpProfileHashInput["tools"][number],
): number {
  return (
    left.name.localeCompare(right.name) ||
    left.risk.localeCompare(right.risk) ||
    Number(left.authRequired) - Number(right.authRequired) ||
    Number(left.billable) - Number(right.billable)
  );
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
