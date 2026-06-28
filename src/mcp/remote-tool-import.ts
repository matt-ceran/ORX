import type { McpRegistryOptions, McpToolRisk } from "./registry.js";
import {
  listRemoteMcpTools,
  type McpRemoteToolSummary,
  type McpRemoteToolsOptions,
  type McpRemoteToolsResult,
} from "./remote-tools.js";
import { getMcpStatusSummary } from "./policy.js";
import {
  upsertUserMcpProfileTools,
  validateUserMcpToolName,
  type UserMcpProfileCatalogIoOptions,
} from "./user-profiles.js";
import { redactSecrets } from "./audit.js";
import { stripTerminalControlChars } from "../research/extract.js";

export type McpRemoteToolImportStatus =
  | "ok"
  | "not_found"
  | "unsupported_profile"
  | "remote_tools_unavailable"
  | "no_importable_tools"
  | "write_error";

export interface ImportedRemoteMcpTool {
  name: string;
  risk: McpToolRisk;
  authRequired: boolean;
  billable: boolean;
  remoteToolHash?: string;
}

export interface SkippedRemoteMcpTool {
  name: string;
  reason: string;
  remoteToolHash?: string;
}

export interface McpRemoteToolImportResult {
  profileId: string;
  status: McpRemoteToolImportStatus;
  ok: boolean;
  networkAttempted: boolean;
  message: string;
  path?: string;
  profileHashBefore?: string;
  trustedProfileHashBefore?: string;
  profileHashAfter?: string;
  trustedProfileHashAfter?: string;
  schemaChangePendingAfter?: boolean;
  remoteToolsResult?: McpRemoteToolsResult;
  importedTools?: ImportedRemoteMcpTool[];
  skippedTools?: SkippedRemoteMcpTool[];
}

export interface McpRemoteToolImportOptions
  extends McpRegistryOptions,
    McpRemoteToolsOptions,
    UserMcpProfileCatalogIoOptions {
  maxTools?: number;
}

export async function importRemoteMcpTools(
  profileIdInput: string,
  options: McpRemoteToolImportOptions = {},
): Promise<McpRemoteToolImportResult> {
  const requestedProfileId = profileIdInput.trim();
  const summary = getMcpStatusSummary(options);
  const exactProfile = summary.profiles.find((candidate) => candidate.id === requestedProfileId);
  const profileId = exactProfile ? exactProfile.id : normalizeImportProfileId(requestedProfileId);
  const profile =
    exactProfile ?? summary.profiles.find((candidate) => candidate.id === profileId);

  if (!profile) {
    return {
      profileId,
      status: "not_found",
      ok: false,
      networkAttempted: false,
      message: `Unknown MCP profile: ${profileId}`,
    };
  }

  if (profile.source?.kind !== "user") {
    return {
      profileId,
      status: "unsupported_profile",
      ok: false,
      networkAttempted: false,
      profileHashBefore: summary.profileHashes[profile.id],
      trustedProfileHashBefore: summary.trustedProfileHashes[profile.id],
      message:
        "Remote MCP tool import only edits local user catalog profiles. Use /mcp add-tool for reviewed built-in or plugin tools.",
    };
  }

  const remoteToolsResult = await listRemoteMcpTools(profile.id, options);
  if (remoteToolsResult.status !== "ok") {
    return {
      profileId: profile.id,
      status: "remote_tools_unavailable",
      ok: false,
      networkAttempted: remoteToolsResult.networkAttempted,
      profileHashBefore: summary.profileHashes[profile.id],
      trustedProfileHashBefore: summary.trustedProfileHashes[profile.id],
      remoteToolsResult,
      message: `Remote MCP tools were not imported: ${remoteToolsResult.message}`,
    };
  }

  const { importedTools, skippedTools } = buildImportTools(
    remoteToolsResult.tools ?? [],
    remoteToolsResult.authRequired ?? profile.authRequired,
  );

  if (importedTools.length === 0) {
    return {
      profileId: profile.id,
      status: "no_importable_tools",
      ok: true,
      networkAttempted: remoteToolsResult.networkAttempted,
      profileHashBefore: summary.profileHashes[profile.id],
      trustedProfileHashBefore: summary.trustedProfileHashes[profile.id],
      remoteToolsResult,
      importedTools,
      skippedTools,
      message: "Remote MCP tools/list completed, but no importable tool names were returned.",
    };
  }

  try {
    const mutation = upsertUserMcpProfileTools(
      profile.id,
      importedTools.map((tool) => ({
        name: tool.name,
        risk: tool.risk,
        authRequired: tool.authRequired,
        billable: tool.billable,
      })),
      { profileCatalogPath: options.profileCatalogPath },
    );
    if (!mutation.ok) {
      return {
        profileId: profile.id,
        status: "write_error",
        ok: false,
        networkAttempted: remoteToolsResult.networkAttempted,
        profileHashBefore: summary.profileHashes[profile.id],
        trustedProfileHashBefore: summary.trustedProfileHashes[profile.id],
        remoteToolsResult,
        importedTools,
        skippedTools,
        path: mutation.path,
        message: mutation.message,
      };
    }

    const afterSummary = getMcpStatusSummary(options);
    return {
      profileId: profile.id,
      status: "ok",
      ok: true,
      networkAttempted: remoteToolsResult.networkAttempted,
      path: mutation.path,
      profileHashBefore: summary.profileHashes[profile.id],
      trustedProfileHashBefore: summary.trustedProfileHashes[profile.id],
      profileHashAfter: afterSummary.profileHashes[profile.id],
      trustedProfileHashAfter: afterSummary.trustedProfileHashes[profile.id],
      schemaChangePendingAfter: afterSummary.pendingSchemaChangeProfileIds.includes(profile.id),
      remoteToolsResult,
      importedTools,
      skippedTools,
      message: `Imported ${importedTools.length} reviewed remote MCP tool declarations into ${profile.id}. Review the catalog and re-enable the profile if schema_change_after is pending before calling or granting model access.`,
    };
  } catch (error) {
    return {
      profileId: profile.id,
      status: "write_error",
      ok: false,
      networkAttempted: remoteToolsResult.networkAttempted,
      profileHashBefore: summary.profileHashes[profile.id],
      trustedProfileHashBefore: summary.trustedProfileHashes[profile.id],
      remoteToolsResult,
      importedTools,
      skippedTools,
      message: error instanceof Error ? error.message : "Unable to store imported remote MCP tools.",
    };
  }
}

export function formatMcpRemoteToolImportResult(result: McpRemoteToolImportResult): string {
  const lines = [
    `MCP remote tool import: ${result.profileId}`,
    `  status: ${result.status}`,
    `  network: ${result.networkAttempted ? "attempted" : "not_attempted"}`,
    result.path ? `  catalog: ${result.path}` : undefined,
    result.profileHashBefore ? `  profile_hash_before: ${result.profileHashBefore}` : undefined,
    result.trustedProfileHashBefore
      ? `  trusted_hash_before: ${result.trustedProfileHashBefore}`
      : undefined,
    result.profileHashAfter ? `  profile_hash_after: ${result.profileHashAfter}` : undefined,
    result.trustedProfileHashAfter ? `  trusted_hash_after: ${result.trustedProfileHashAfter}` : undefined,
    typeof result.schemaChangePendingAfter === "boolean"
      ? `  schema_change_after: ${result.schemaChangePendingAfter ? "pending" : "current"}`
      : undefined,
    result.remoteToolsResult?.toolCount !== undefined
      ? `  remote_tool_count: ${result.remoteToolsResult.toolCount}`
      : undefined,
    result.importedTools ? `  imported_tools: ${result.importedTools.length}` : undefined,
    result.skippedTools && result.skippedTools.length > 0
      ? `  skipped_tools: ${result.skippedTools.length}`
      : undefined,
    "  risk_default: read",
    "  billable_default: no",
    "  trust_boundary: remote tool metadata remains untrusted; only reviewed names are stored",
    `  detail: ${result.message}`,
    result.importedTools && result.importedTools.length > 0 ? "  tools:" : undefined,
    ...(result.importedTools ?? []).map((tool) =>
      [
        `    - ${tool.name}`,
        `risk=${tool.risk}`,
        `auth=${tool.authRequired ? "yes" : "no"}`,
        `billable=${tool.billable ? "yes" : "no"}`,
        tool.remoteToolHash ? `remote_tool_hash=${tool.remoteToolHash}` : undefined,
      ]
        .filter((part): part is string => typeof part === "string")
        .join(" "),
    ),
    result.skippedTools && result.skippedTools.length > 0 ? "  skipped:" : undefined,
    ...(result.skippedTools ?? []).map((tool) =>
      [
        `    - ${JSON.stringify(tool.name)}`,
        `reason=${JSON.stringify(tool.reason)}`,
        tool.remoteToolHash ? `remote_tool_hash=${tool.remoteToolHash}` : undefined,
      ]
        .filter((part): part is string => typeof part === "string")
        .join(" "),
    ),
  ];

  return lines.filter((line): line is string => typeof line === "string").join("\n");
}

function buildImportTools(
  tools: McpRemoteToolSummary[],
  authRequired: boolean,
): {
  importedTools: ImportedRemoteMcpTool[];
  skippedTools: SkippedRemoteMcpTool[];
} {
  const importedByName = new Map<string, ImportedRemoteMcpTool>();
  const skippedTools: SkippedRemoteMcpTool[] = [];

  for (const tool of tools) {
    try {
      const name = validateUserMcpToolName(tool.name);
      importedByName.set(name, {
        name,
        risk: "read",
        authRequired,
        billable: false,
        remoteToolHash: tool.toolHash,
      });
    } catch (error) {
      skippedTools.push({
        name: sanitizeSkippedRemoteToolName(tool.name),
        reason: error instanceof Error ? error.message : "unsupported remote tool name",
        remoteToolHash: tool.toolHash,
      });
    }
  }

  return {
    importedTools: [...importedByName.values()].sort((left, right) =>
      left.name.localeCompare(right.name),
    ),
    skippedTools,
  };
}

function normalizeImportProfileId(profileId: string): string {
  const trimmed = profileId.trim();
  if (trimmed.includes(":")) {
    return trimmed;
  }
  return `user:${trimmed}`;
}

function sanitizeSkippedRemoteToolName(name: string): string {
  const sanitized = String(redactSecrets(stripTerminalControlChars(name)))
    .replace(/[\r\n\t]+/g, " ")
    .trim();
  return sanitized.slice(0, 160) || "[omitted]";
}
