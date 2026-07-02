export const RESEARCH_USAGE =
  "Usage: orx research [fetch <url>|search <query>|browse <url>|profiles [list [--json]|status [--json]|inspect <profile> [--json]|show <profile> [--json]|plan <profile> [--json]|setup-plan <profile> [--json]]]";
export const CLI_WEB_USAGE =
  "Usage: orx web [fetch <url>|search <query>|browse <url>|profiles [list [--json]|status [--json]|inspect <profile> [--json]|show <profile> [--json]|plan <profile> [--json]|setup-plan <profile> [--json]]]";
export const RESEARCH_PROFILES_USAGE =
  "Usage: orx research profiles [list [--json]|status [--json]|inspect <profile> [--json]|show <profile> [--json]|plan <profile> [--json]|setup-plan <profile> [--json]]";
export const CLI_WEB_PROFILES_USAGE =
  "Usage: orx web profiles [list [--json]|status [--json]|inspect <profile> [--json]|show <profile> [--json]|plan <profile> [--json]|setup-plan <profile> [--json]]";
export const SLASH_WEB_USAGE =
  "Usage: /web [help|fetch <url>|search <query>|browse <url>|profiles [list [--json]|status [--json]|inspect <profile> [--json]|show <profile> [--json]|plan <profile> [--json]|setup-plan <profile> [--json]]]";
export const SLASH_WEB_PROFILES_USAGE =
  "Usage: /web profiles [list [--json]|status [--json]|inspect <profile> [--json]|show <profile> [--json]|plan <profile> [--json]|setup-plan <profile> [--json]]";

export type ResearchProfileId =
  | "research-web"
  | "research-browser"
  | "research-crawl"
  | "research-scholar"
  | "research-docs"
  | "research-rag"
  | "research-memory";

export interface ResearchProfile {
  id: ResearchProfileId;
  label: string;
  state: "available" | "catalog_only";
  summary: string;
  currentSupport: string;
  networkBoundary: string;
}

export interface ResearchSetupPlan {
  profile: ResearchProfile;
  status: "available_now" | "catalog_only";
  nextAction: string;
  currentCommands: string[];
  futureIntegration?: string;
  blockers: string[];
  boundaries: {
    execution: "none";
    processSpawn: "none";
    network: "none";
    stateWrites: "none";
    modelTool: "not_exposed";
  };
}

const RESEARCH_PROFILES: ResearchProfile[] = [
  {
    id: "research-web",
    label: "Research Web",
    state: "available",
    summary: "Explicit CLI/chat web fetch and Brave search snippet evidence.",
    currentSupport: "available through `orx web fetch <url>`, `orx research fetch <url>`, `orx web search <query>`, `orx research search <query>`, `/web fetch <url>`, `/fetch <url>`, `/web search <query>`, and `/search <query>`; search requires `BRAVE_SEARCH_API_KEY`",
    networkBoundary: "operator-explicit fetch/search only; URL/DNS guards, Brave-key requirement, bounded extraction, redaction, and untrusted context markers apply",
  },
  {
    id: "research-browser",
    label: "Research Browser",
    state: "available",
    summary: "Explicit CLI/chat browser DOM text snapshots when the local browser runtime is available.",
    currentSupport: "available through `orx web browse <url>`, `orx research browse <url>`, `/web browse <url>`, and `/browse <url>` when the browser snapshot runtime is available",
    networkBoundary: "operator-explicit browse only; guarded document fetch, DNS checks, browser final-URL checks, bounded DOM text, redaction, and untrusted context markers apply",
  },
  {
    id: "research-crawl",
    label: "Research Crawl",
    state: "catalog_only",
    summary: "Catalog placeholder for future bounded multi-page crawl workflows.",
    currentSupport: "not runnable in this slice",
    networkBoundary: "no crawl budget, host allowlist, robots/cache, redirect, or persistence contract is enabled yet",
  },
  {
    id: "research-scholar",
    label: "Research Scholar",
    state: "catalog_only",
    summary: "Catalog placeholder for future scholarly source adapters.",
    currentSupport: "not runnable in this slice",
    networkBoundary: "no scholarly provider, PDF acquisition, identifier normalization, or source-tier contract is enabled yet",
  },
  {
    id: "research-docs",
    label: "Research Docs",
    state: "catalog_only",
    summary: "Catalog placeholder for future docs-provider orchestration across official documentation sources.",
    currentSupport: "not runnable in this slice",
    networkBoundary: "no dedicated docs-provider router, source allowlist, or cross-provider citation contract is enabled yet",
  },
  {
    id: "research-rag",
    label: "Research RAG",
    state: "catalog_only",
    summary: "Catalog placeholder for future retrieval-augmented local or remote research indexes.",
    currentSupport: "not runnable in this slice",
    networkBoundary: "no index storage/delete/readback, embedding, vector-store, or model-visible retrieval contract is enabled yet",
  },
  {
    id: "research-memory",
    label: "Research Memory",
    state: "catalog_only",
    summary: "Catalog placeholder for future durable research memory retrieval.",
    currentSupport: "not runnable in this slice",
    networkBoundary: "no durable evidence store, retention policy, search scope, or model-visible memory retrieval contract is enabled yet",
  },
];

export function listResearchProfiles(): ResearchProfile[] {
  return [...RESEARCH_PROFILES];
}

export function findResearchProfile(profileId: string): ResearchProfile | undefined {
  const normalized = normalizeProfileId(profileId);
  return RESEARCH_PROFILES.find((profile) => profile.id === normalized);
}

export function renderResearchProfiles(profiles = listResearchProfiles()): string {
  const lines = [
    "Research profiles",
    "  execution: metadata_only",
    "  network: none_for_list_inspect_or_plan",
    "  model_tool: not_exposed",
    "  profiles:",
  ];
  for (const profile of profiles) {
    lines.push(
      [
        `    - id=${profile.id}`,
        `state=${profile.state}`,
        `support=${JSON.stringify(profile.currentSupport)}`,
      ].join(" "),
    );
  }
  return lines.join("\n");
}

export function renderResearchProfilesJson(profiles = listResearchProfiles()): string {
  return JSON.stringify({
    schema_version: 1,
    surface: "orx.research_profiles",
    operator_only: true,
    model_tool: "not_exposed",
    execution: "metadata_only",
    network: "none_for_list_inspect_or_plan",
    profiles: profiles.map(researchProfileJson),
  }, null, 2);
}

export function renderResearchProfileInspect(profile: ResearchProfile): string {
  return [
    `Research profile: ${profile.id}`,
    `  label: ${profile.label}`,
    `  state: ${profile.state}`,
    `  summary: ${profile.summary}`,
    `  current_support: ${profile.currentSupport}`,
    `  network_boundary: ${profile.networkBoundary}`,
    "  execution: metadata_only",
    "  model_tool: not_exposed",
  ].join("\n");
}

export function renderResearchProfileInspectJson(profile: ResearchProfile): string {
  return JSON.stringify({
    schema_version: 1,
    surface: "orx.research_profile",
    profile: researchProfileJson(profile),
  }, null, 2);
}

export function createResearchSetupPlan(profile: ResearchProfile): ResearchSetupPlan {
  if (profile.state === "available") {
    return {
      profile,
      status: "available_now",
      nextAction: "Use the existing explicit CLI or chat research commands when an operator requests them.",
      currentCommands: currentResearchCommands(profile.id),
      blockers: [],
      boundaries: researchPlanBoundaries(),
    };
  }

  return {
    profile,
    status: "catalog_only",
    nextAction: "Keep this profile in list/inspect/plan metadata until a deterministic research integration contract is implemented.",
    currentCommands: [],
    futureIntegration: futureResearchIntegrationForProfile(profile.id),
    blockers: catalogOnlyResearchBlockers(profile.id),
    boundaries: researchPlanBoundaries(),
  };
}

export function renderResearchSetupPlan(profile: ResearchProfile): string {
  const plan = createResearchSetupPlan(profile);
  const lines = [
    `Research setup plan: ${plan.profile.id}`,
    `  label: ${plan.profile.label}`,
    `  state: ${plan.profile.state}`,
    `  status: ${plan.status}`,
    `  next_action: ${plan.nextAction}`,
    plan.futureIntegration ? `  future_integration: ${plan.futureIntegration}` : undefined,
    "  execution: none",
    "  process_spawn: none",
    "  network: none",
    "  state_writes: none",
    "  model_tool: not_exposed",
    "  current_commands:",
    ...(plan.currentCommands.length > 0
      ? plan.currentCommands.map((command) => `    - ${command}`)
      : ["    - none"]),
    "  blockers:",
    ...(plan.blockers.length > 0
      ? plan.blockers.map((blocker) => `    - ${blocker}`)
      : ["    - none"]),
  ];

  return lines.filter((line): line is string => typeof line === "string").join("\n");
}

export function renderResearchSetupPlanJson(profile: ResearchProfile): string {
  const plan = createResearchSetupPlan(profile);
  return JSON.stringify({
    schema_version: 1,
    surface: "orx.research_setup_plan",
    operator_only: true,
    profile: researchProfileJson(profile),
    status: plan.status,
    next_action: plan.nextAction,
    current_commands: plan.currentCommands,
    future_integration: plan.futureIntegration,
    blockers: plan.blockers,
    authority: {
      execution: plan.boundaries.execution,
      process_spawn: plan.boundaries.processSpawn,
      network: plan.boundaries.network,
      state_writes: plan.boundaries.stateWrites,
      model_tool: plan.boundaries.modelTool,
    },
  }, null, 2);
}

export function renderMissingResearchProfile(profileId: string): string {
  return `Unknown research profile: ${sanitizeInline(profileId)}. Available profiles: ${RESEARCH_PROFILES.map((profile) => profile.id).join(", ")}.`;
}

export function renderResearchInspectUsage(usage: string): string {
  return usage.replace(
    /\[list(?: \[--json\])?\|status(?: \[--json\])?\|inspect <profile>(?: \[--json\])?\|show <profile>(?: \[--json\])?\|plan <profile>(?: \[--json\])?\|setup-plan <profile>(?: \[--json\])?\]$/,
    "[inspect|show] <profile> [--json]",
  );
}

export function renderResearchPlanUsage(usage: string): string {
  return usage.replace(
    /\[list(?: \[--json\])?\|status(?: \[--json\])?\|inspect <profile>(?: \[--json\])?\|show <profile>(?: \[--json\])?\|plan <profile>(?: \[--json\])?\|setup-plan <profile>(?: \[--json\])?\]$/,
    "[plan|setup-plan] <profile> [--json]",
  );
}

export function parseResearchReadinessJsonFlag(
  args: string[],
  usage: string,
): { ok: true; json: boolean } | { ok: false; message: string } {
  if (args.length === 0) {
    return { ok: true, json: false };
  }
  if (args.length === 1 && args[0] === "--json") {
    return { ok: true, json: true };
  }
  const option = args.find((arg) => arg.startsWith("-"));
  if (option) {
    return { ok: false, message: `${usage}\nUnknown research option: ${sanitizeInline(option)}` };
  }
  return { ok: false, message: usage };
}

function researchProfileJson(profile: ResearchProfile): Record<string, unknown> {
  return {
    id: profile.id,
    label: profile.label,
    state: profile.state,
    summary: profile.summary,
    current_support: profile.currentSupport,
    network_boundary: profile.networkBoundary,
    execution: "metadata_only",
    model_tool: "not_exposed",
  };
}

function researchPlanBoundaries(): ResearchSetupPlan["boundaries"] {
  return {
    execution: "none",
    processSpawn: "none",
    network: "none",
    stateWrites: "none",
    modelTool: "not_exposed",
  };
}

function currentResearchCommands(profile: ResearchProfileId): string[] {
  if (profile === "research-web") {
    return [
      "orx web fetch <url>",
      "orx research fetch <url>",
      "orx web search <query>",
      "orx research search <query>",
      "/web fetch <url>",
      "/fetch <url>",
      "/web search <query>",
      "/search <query>",
      "/sources",
      "/cite <source-id>",
      "/bibliography",
    ];
  }
  if (profile === "research-browser") {
    return [
      "orx web browse <url>",
      "orx research browse <url>",
      "/web browse <url>",
      "/browse <url>",
      "/sources",
      "/cite <source-id>",
      "/bibliography",
    ];
  }
  return [];
}

function futureResearchIntegrationForProfile(profile: ResearchProfileId): string | undefined {
  if (profile === "research-crawl") {
    return "bounded multi-page crawl with host/depth/page budgets, SSRF guards, redirect policy, source ledger output, and cancellation semantics";
  }
  if (profile === "research-scholar") {
    return "scholarly source adapters with DOI/arXiv/PubMed identifiers, PDF/source-tier handling, citation metadata, and provider-specific rate/auth boundaries";
  }
  if (profile === "research-docs") {
    return "official documentation routing across reviewed provider presets and guarded fetch/search surfaces with source-tier metadata";
  }
  if (profile === "research-rag") {
    return "retrieval index lifecycle with explicit storage/delete/readback contracts, embedding/provider boundaries, and model-visible retrieval policy";
  }
  if (profile === "research-memory") {
    return "durable evidence-memory retrieval with retention, scope, redaction, provenance, and model-visible context boundaries";
  }
  return undefined;
}

function catalogOnlyResearchBlockers(profile: ResearchProfileId): string[] {
  if (profile === "research-crawl") {
    return [
      "crawl depth, page, host, redirect, and byte budgets are not implemented",
      "robots/cache/persistence behavior is not specified",
      "source-ledger merge and cancellation semantics are not implemented",
    ];
  }
  if (profile === "research-scholar") {
    return [
      "scholarly providers and auth/rate boundaries are not selected",
      "PDF acquisition, extraction, and citation metadata contracts are not implemented",
      "source-tier and identifier normalization rules are not implemented",
    ];
  }
  if (profile === "research-docs") {
    return [
      "official docs provider allowlists and routing rules are not implemented",
      "cross-provider citation/source-tier behavior is not implemented",
      "model-visible docs retrieval policy is not implemented",
    ];
  }
  if (profile === "research-rag") {
    return [
      "index storage/delete/readback lifecycle is not implemented",
      "embedding or vector-store provider boundaries are not selected",
      "model-visible retrieval and citation policy is not implemented",
    ];
  }
  if (profile === "research-memory") {
    return [
      "durable evidence memory store and retention policy are not implemented",
      "retrieval scope, redaction, and provenance contracts are not implemented",
      "model-visible memory context policy is not implemented",
    ];
  }
  return [];
}

function normalizeProfileId(profileId: string): string {
  return profileId.trim().toLowerCase();
}

function sanitizeInline(value: string): string {
  return value.replace(/[\x00-\x1F\x7F]/g, "").trim().slice(0, 160) || "[empty]";
}
