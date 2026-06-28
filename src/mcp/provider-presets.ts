import {
  upsertUserMcpProfileTool,
  upsertUserMcpRemoteProfile,
  type UserMcpProfileCatalogIoOptions,
} from "./user-profiles.js";
import type { McpToolRisk } from "./registry.js";

export interface McpProviderPresetTool {
  name: string;
  risk: McpToolRisk;
  authRequired: boolean;
  billable: boolean;
}

export interface McpProviderPreset {
  id: string;
  name: string;
  profileId: string;
  url: string;
  authRequired: boolean;
  tools: McpProviderPresetTool[];
  notes: string;
  tags: string[];
}

export interface InstallMcpProviderPresetOptions extends UserMcpProfileCatalogIoOptions {
  profileId?: string;
  url?: string;
  authRequired?: boolean;
}

export interface InstallMcpProviderPresetResult {
  ok: boolean;
  presetId: string;
  profileId?: string;
  path?: string;
  toolCount?: number;
  message: string;
}

const PRESET_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,79}$/;
const CONTROL_CHAR_PATTERN = /[\x00-\x1F\x7F]/;

export const MCP_PROVIDER_PRESETS: McpProviderPreset[] = [
  {
    id: "context7",
    name: "Context7 docs",
    profileId: "context7",
    url: "https://mcp.context7.com/mcp",
    authRequired: false,
    tools: [
      {
        name: "resolve-library-id",
        risk: "read",
        authRequired: false,
        billable: false,
      },
      {
        name: "query-docs",
        risk: "read",
        authRequired: false,
        billable: false,
      },
    ],
    notes:
      "Context7 documentation lookup. Basic remote usage can be no-auth; higher-rate API-key setups may require provider-specific headers outside ORX bearer auth.",
    tags: ["docs", "code", "read-only"],
  },
  {
    id: "microsoft-learn",
    name: "Microsoft Learn",
    profileId: "microsoft-learn",
    url: "https://learn.microsoft.com/api/mcp",
    authRequired: false,
    tools: [
      {
        name: "microsoft_docs_search",
        risk: "read",
        authRequired: false,
        billable: false,
      },
      {
        name: "microsoft_docs_fetch",
        risk: "read",
        authRequired: false,
        billable: false,
      },
      {
        name: "microsoft_code_sample_search",
        risk: "read",
        authRequired: false,
        billable: false,
      },
    ],
    notes:
      "Microsoft official docs and code sample lookup. No auth is required by the hosted endpoint.",
    tags: ["docs", "microsoft", "read-only"],
  },
  {
    id: "github-readonly",
    name: "GitHub read-only",
    profileId: "github-readonly",
    url: "https://api.githubcopilot.com/mcp/readonly",
    authRequired: true,
    tools: [],
    notes:
      "GitHub hosted MCP read-only endpoint. Auth is required; use remote-tools after enable/trust to inspect current provider tool metadata before declaring tools.",
    tags: ["github", "repo", "read-only", "auth"],
  },
];

export function listMcpProviderPresets(): McpProviderPreset[] {
  return [...MCP_PROVIDER_PRESETS].sort((left, right) => left.id.localeCompare(right.id));
}

export function findMcpProviderPreset(id: string): McpProviderPreset | undefined {
  const normalized = id.trim().toLowerCase();
  return MCP_PROVIDER_PRESETS.find((preset) => preset.id === normalized);
}

export function renderMcpProviderPresets(
  presets: McpProviderPreset[] = listMcpProviderPresets(),
): string {
  return [
    "MCP provider presets",
    `  presets: ${presets.length}`,
    ...presets.map((preset) =>
      [
        `  - id=${preset.id}`,
        `profile=user:${preset.profileId}`,
        `name=${JSON.stringify(preset.name)}`,
        `url=${preset.url}`,
        `auth=${preset.authRequired ? "yes" : "no"}`,
        `tools=${preset.tools.length}`,
        preset.tags.length > 0 ? `tags=${preset.tags.join(",")}` : undefined,
      ]
        .filter((part): part is string => typeof part === "string")
        .join(" "),
    ),
  ].join("\n");
}

export function renderMcpProviderPresetInspect(preset: McpProviderPreset): string {
  const lines = [
    `MCP Provider Preset: ${preset.id}`,
    `  name: ${preset.name}`,
    `  profile_id: user:${preset.profileId}`,
    `  url: ${preset.url}`,
    `  auth_required: ${preset.authRequired ? "yes" : "no"}`,
    `  tags: ${preset.tags.length > 0 ? preset.tags.join(",") : "none"}`,
    `  notes: ${preset.notes}`,
    `  static_tools: ${preset.tools.length}`,
  ];

  if (preset.tools.length > 0) {
    lines.push("  tools:");
    for (const tool of preset.tools) {
      lines.push(
        `    - ${tool.name} risk=${tool.risk} auth=${tool.authRequired ? "yes" : "no"} billable=${tool.billable ? "yes" : "no"}`,
      );
    }
  } else {
    lines.push(
      "  tools: none",
      "  remote_tool_review: enable/trust the installed profile, run orx mcp remote-tools, then import or add reviewed tools explicitly",
    );
  }

  lines.push(
    "  install:",
    `    command: orx mcp add-preset ${preset.id}`,
    "    result_state: local_user_profile_disabled",
    "  authority:",
    "    preset_template: declaration_only",
    "    inspect_side_effects: none",
    "    install_enable_trust_grant_call_model_exposure: separate_explicit_steps",
  );

  return lines.join("\n");
}

export function formatMcpProviderPresetIdForMessage(id: string): string {
  const normalized = id.trim().toLowerCase();
  return normalized &&
    normalized.length <= 80 &&
    PRESET_ID_PATTERN.test(normalized) &&
    !CONTROL_CHAR_PATTERN.test(normalized)
    ? normalized
    : "[invalid preset id]";
}

export function installMcpProviderPreset(
  presetId: string,
  options: InstallMcpProviderPresetOptions = {},
): InstallMcpProviderPresetResult {
  const preset = findMcpProviderPreset(presetId);
  if (!preset) {
    return {
      ok: false,
      presetId,
      message: "Unknown MCP provider preset. Run orx mcp presets to list available presets.",
    };
  }

  const profileId = options.profileId ?? preset.profileId;
  const profileResult = upsertUserMcpRemoteProfile(
    profileId,
    {
      name: preset.name,
      url: options.url ?? preset.url,
      authRequired: options.authRequired ?? preset.authRequired,
      notes: preset.notes,
    },
    options,
  );

  let toolCount = 0;
  for (const tool of preset.tools) {
    const toolResult = upsertUserMcpProfileTool(
      profileId,
      {
        name: tool.name,
        risk: tool.risk,
        authRequired: options.authRequired ?? tool.authRequired,
        billable: tool.billable,
      },
      options,
    );
    if (toolResult.ok) {
      toolCount += 1;
    }
  }

  const noToolsHint =
    preset.tools.length === 0
      ? " This preset declares no static tools; enable/trust it, run remote-tools, then add reviewed tools explicitly."
      : "";

  return {
    ok: true,
    presetId: preset.id,
    profileId: profileResult.profileId,
    path: profileResult.path,
    toolCount,
    message: `MCP provider preset ${preset.id} stored as ${profileResult.profileId} with ${toolCount} declared tools in ${profileResult.path}. Enable it with orx mcp enable ${profileResult.profileId}.${noToolsHint}`,
  };
}
