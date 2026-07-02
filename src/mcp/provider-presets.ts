import {
  upsertUserMcpProfileTool,
  upsertUserMcpRemoteProfile,
  type UserMcpProfileCatalogIoOptions,
} from "./user-profiles.js";
import type { McpRiskLevel, McpToolRisk } from "./registry.js";

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
  riskLevel?: McpRiskLevel;
  writeCapable?: boolean;
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
    id: "browser",
    name: "Cloudflare Browser Rendering",
    profileId: "browser",
    url: "https://browser.mcp.cloudflare.com/mcp",
    authRequired: true,
    riskLevel: "medium",
    tools: [],
    notes:
      "Cloudflare hosted browser rendering MCP. Browser output is untrusted remote content; review provider tool metadata before adding specific read-only tools.",
    tags: ["browser", "cloudflare", "research", "auth"],
  },
  {
    id: "cloudflare-api",
    name: "Cloudflare API",
    profileId: "cloudflare-api",
    url: "https://mcp.cloudflare.com/mcp",
    authRequired: true,
    riskLevel: "high",
    writeCapable: true,
    tools: [
      {
        name: "search",
        risk: "read",
        authRequired: true,
        billable: false,
      },
      {
        name: "execute",
        risk: "destructive",
        authRequired: true,
        billable: false,
      },
    ],
    notes:
      "Cloudflare broad account API MCP. The execute tool can make account changes, so ORX marks it destructive and requires explicit grants before calls.",
    tags: ["cloud", "cloudflare", "auth", "destructive"],
  },
  {
    id: "cloudflare-docs",
    name: "Cloudflare Docs",
    profileId: "cloudflare-docs",
    url: "https://docs.mcp.cloudflare.com/mcp",
    authRequired: true,
    riskLevel: "medium",
    tools: [],
    notes:
      "Cloudflare docs MCP. Review remote tool metadata before declaring tools; fetched docs remain untrusted context.",
    tags: ["docs", "cloudflare", "read-only", "auth"],
  },
  {
    id: "context7",
    name: "Context7 docs",
    profileId: "context7",
    url: "https://mcp.context7.com/mcp",
    authRequired: false,
    riskLevel: "low",
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
    riskLevel: "low",
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
    id: "deepwiki",
    name: "DeepWiki",
    profileId: "deepwiki",
    url: "https://mcp.deepwiki.com/mcp",
    authRequired: false,
    riskLevel: "low",
    tools: [
      {
        name: "ask_question",
        risk: "read",
        authRequired: false,
        billable: false,
      },
      {
        name: "read_wiki_contents",
        risk: "read",
        authRequired: false,
        billable: false,
      },
      {
        name: "read_wiki_structure",
        risk: "read",
        authRequired: false,
        billable: false,
      },
    ],
    notes:
      "DeepWiki official no-auth MCP for public GitHub repository documentation and grounded repository questions. Public repository output is untrusted remote content.",
    tags: ["docs", "github", "repositories", "read-only", "no-auth"],
  },
  {
    id: "figma",
    name: "Figma remote MCP",
    profileId: "figma",
    url: "https://mcp.figma.com/mcp",
    authRequired: true,
    riskLevel: "high",
    writeCapable: true,
    tools: [],
    notes:
      "Figma remote MCP. Provider tools can inspect or modify design files; manually declare reviewed tools with the correct risk.",
    tags: ["design", "figma", "auth"],
  },
  {
    id: "github-readonly",
    name: "GitHub read-only",
    profileId: "github-readonly",
    url: "https://api.githubcopilot.com/mcp/readonly",
    authRequired: true,
    riskLevel: "medium",
    tools: [],
    notes:
      "GitHub hosted MCP read-only endpoint. Auth is required; use remote-tools after enable/trust to inspect current provider tool metadata before declaring tools.",
    tags: ["github", "repo", "read-only", "auth"],
  },
  {
    id: "github-write",
    name: "GitHub write-capable",
    profileId: "github-write",
    url: "https://api.githubcopilot.com/mcp/",
    authRequired: true,
    riskLevel: "high",
    writeCapable: true,
    tools: [],
    notes:
      "GitHub hosted MCP read/write endpoint. Auth is required; approve only intentionally scoped access and manually declare reviewed tools with the correct risk.",
    tags: ["github", "repo", "issues", "pull-requests", "write-capable", "auth"],
  },
  {
    id: "gitlab-readonly",
    name: "GitLab read-only",
    profileId: "gitlab-readonly",
    url: "https://gitlab.com/api/v4/mcp",
    authRequired: true,
    riskLevel: "medium",
    tools: [],
    notes:
      "GitLab hosted MCP beta endpoint for project, repository, issue, and merge request context. Auth is required; review remote tool metadata and import or add only read-only declarations explicitly.",
    tags: ["gitlab", "repo", "issues", "merge-requests", "read-only", "auth"],
  },
  {
    id: "gitlab-ci-write",
    name: "GitLab CI write-capable",
    profileId: "gitlab-ci-write",
    url: "https://gitlab.com/api/v4/mcp",
    authRequired: true,
    riskLevel: "high",
    writeCapable: true,
    tools: [
      {
        name: "manage_pipeline",
        risk: "destructive",
        authRequired: true,
        billable: false,
      },
    ],
    notes:
      "GitLab hosted MCP beta endpoint for CI/CD pipeline management. The manage_pipeline tool can create, cancel, retry, delete, and update pipeline metadata, so ORX marks it destructive and requires explicit grants before calls.",
    tags: ["gitlab", "ci", "pipelines", "write-capable", "destructive", "auth"],
  },
  {
    id: "sentry-readonly",
    name: "Sentry read-only",
    profileId: "sentry-readonly",
    url: "https://mcp.sentry.dev/mcp",
    authRequired: true,
    riskLevel: "medium",
    tools: [],
    notes:
      "Sentry hosted MCP for debugging context. Review remote tool metadata and declare only read-only tools unless you intentionally add stricter risk flags.",
    tags: ["observability", "sentry", "read-only", "auth"],
  },
  {
    id: "sourcegraph-github-readonly",
    name: "Sourcegraph GitHub read-only",
    profileId: "sourcegraph-github-readonly",
    url: "https://sourcegraph.com/mcp",
    authRequired: true,
    riskLevel: "medium",
    tools: [],
    notes:
      "Sourcegraph hosted MCP for multi-repo GitHub code search, navigation, and history. Auth is required; approve only read-only Sourcegraph/GitHub repository scopes, then use remote-tools after enable/trust to inspect current provider tool metadata before declaring tools.",
    tags: ["sourcegraph", "github", "repo", "code-search", "multi-repo", "read-only", "auth"],
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
    `  risk_level: ${preset.riskLevel ?? "auto"}`,
    `  write_capable: ${preset.writeCapable ? "yes" : "no"}`,
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
      riskLevel: preset.riskLevel,
      writeCapable: preset.writeCapable,
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
