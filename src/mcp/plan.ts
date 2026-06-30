import { getMcpProfileAuthReport, type McpProfileAuthReport } from "./auth.js";
import {
  findMcpProviderPreset,
  formatMcpProviderPresetIdForMessage,
  listMcpProviderPresets,
  type McpProviderPreset,
} from "./provider-presets.js";
import {
  getMcpProfileToolPolicyReport,
  getMcpStatusSummary,
  type McpProfileToolPolicyReport,
  type McpToolPolicyEvaluation,
} from "./policy.js";
import type { McpProfile, McpRegistryOptions } from "./registry.js";

export interface McpSetupPlanOptions extends McpRegistryOptions {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  authEnvDirectory?: string;
}

export type McpSetupPlanStatus =
  | "overview"
  | "preset_available"
  | "installed_disabled"
  | "schema_change_pending"
  | "auth_setup_needed"
  | "remote_tool_review_needed"
  | "ready_for_model_grants"
  | "ready_for_operator_calls"
  | "operator_grants_required"
  | "configured_no_allowed_tools"
  | "unknown_target";

export type McpSetupPlanKind = "overview" | "preset" | "profile" | "unknown";

export interface McpSetupPlan {
  kind: McpSetupPlanKind;
  target?: string;
  status: McpSetupPlanStatus;
  preset?: McpProviderPreset;
  report?: McpProfileToolPolicyReport;
  authReport?: McpProfileAuthReport;
  nextCommands: string[];
  notes: string[];
}

const CONTROL_CHAR_PATTERN = /[\x00-\x1F\x7F]/;
const CONTROL_CHAR_GLOBAL_PATTERN = /[\x00-\x1F\x7F]/g;
const SECRET_LIKE_PATTERN =
  /\b(?:bearer\s+[A-Za-z0-9._~+/=-]{8,}|authorization:\s*bearer|access[_-]?token|api[_-]?key|token=|key=|secret=|sk-or-v1-[A-Za-z0-9_-]+|github_pat_[A-Za-z0-9_]+|ghp_[A-Za-z0-9_]+|glpat-[A-Za-z0-9_-]+|xox[baprs]-[A-Za-z0-9-]+)\b/i;

export function createMcpSetupPlan(
  target?: string,
  options: McpSetupPlanOptions = {},
): McpSetupPlan {
  const normalizedTarget = target?.trim();
  if (!normalizedTarget) {
    const summary = getMcpStatusSummary(options);
    const active = summary.activeProfileIds.length > 0 ? summary.activeProfileIds[0] : undefined;
    return {
      kind: "overview",
      status: "overview",
      nextCommands: [
        "orx mcp presets",
        "orx mcp plan <preset-or-profile>",
        active ? `orx mcp tools ${active}` : "orx mcp plan context7",
      ],
      notes: [
        `profiles=${summary.profiles.length}`,
        `active_profiles=${summary.activeProfileIds.length}`,
        `pending_schema_changes=${summary.pendingSchemaChangeCount}`,
      ],
    };
  }

  const directReport = getMcpProfileToolPolicyReport(normalizedTarget, options);
  if (directReport) {
    return createProfilePlan(normalizedTarget, directReport, options, findPresetForProfile(directReport.profile));
  }

  if (normalizedTarget.includes(":")) {
    return createUnknownPlan(normalizedTarget);
  }

  const preset = findMcpProviderPreset(normalizedTarget);
  if (preset) {
    const installedReport = getMcpProfileToolPolicyReport(`user:${preset.profileId}`, options);
    if (!installedReport) {
      return createPresetAvailablePlan(normalizedTarget, preset);
    }
    return createProfilePlan(
      normalizedTarget,
      installedReport,
      options,
      profileMatchesPreset(installedReport.profile, preset) ? preset : undefined,
    );
  }

  if (!normalizedTarget.startsWith("user:")) {
    const userReport = getMcpProfileToolPolicyReport(`user:${normalizedTarget}`, options);
    if (userReport) {
      return createProfilePlan(normalizedTarget, userReport, options, findPresetForProfile(userReport.profile));
    }
  }

  return createUnknownPlan(normalizedTarget);
}

function createUnknownPlan(target: string): McpSetupPlan {
  return {
    kind: "unknown",
    target: formatMcpPlanTargetForMessage(target),
    status: "unknown_target",
    nextCommands: ["orx mcp presets", "orx mcp list"],
    notes: ["target was not an installed MCP profile or built-in provider preset"],
  };
}

export function renderMcpSetupPlan(plan: McpSetupPlan): string {
  if (plan.kind === "overview") {
    return [
      "MCP setup plan",
      "  target: all",
      "  status: overview",
      "  network_calls: none",
      "  data_state_writes: none",
      "  permission_tightening: possible_on_existing_mcp_state_reads",
      "  notes:",
      ...plan.notes.map((note) => `    - ${note}`),
      "  next:",
      ...plan.nextCommands.map((command) => `    - ${command}`),
      ...renderAuthority(),
    ].join("\n");
  }

  if (plan.kind === "preset" && plan.preset) {
    return [
      `MCP setup plan: ${plan.preset.id}`,
      `  target: ${plan.target ?? plan.preset.id}`,
      `  status: ${plan.status}`,
      `  preset: ${plan.preset.id}`,
      `  profile: user:${plan.preset.profileId}`,
      "  installed: no",
      `  auth_required: ${plan.preset.authRequired ? "yes" : "no"}`,
      `  risk_level: ${plan.preset.riskLevel ?? "auto"}`,
      `  write_capable: ${plan.preset.writeCapable ? "yes" : "no"}`,
      `  static_tools: ${plan.preset.tools.length}`,
      "  network_calls: none",
      "  data_state_writes: none",
      "  permission_tightening: possible_on_existing_mcp_state_reads",
      ...renderNotes(plan.notes),
      "  next:",
      ...plan.nextCommands.map((command) => `    - ${command}`),
      ...renderAuthority(),
    ].join("\n");
  }

  if (plan.kind === "unknown") {
    return [
      `MCP setup plan: ${plan.target ?? "[redacted]"}`,
      `  target: ${plan.target ?? "[redacted]"}`,
      `  status: ${plan.status}`,
      "  network_calls: none",
      "  data_state_writes: none",
      "  permission_tightening: possible_on_existing_mcp_state_reads",
      ...renderNotes(plan.notes),
      "  next:",
      ...plan.nextCommands.map((command) => `    - ${command}`),
      ...renderAuthority(),
    ].join("\n");
  }

  const report = plan.report;
  if (!report) {
    return renderMcpSetupPlan({
      kind: "unknown",
      target: plan.target,
      status: "unknown_target",
      nextCommands: plan.nextCommands,
      notes: plan.notes,
    });
  }

  const counts = countProfilePlanTools(report.evaluations);
  const authStatus = formatAuthStatus(plan.authReport);
  return [
    `MCP setup plan: ${report.profile.id}`,
    `  target: ${plan.target ?? report.profile.id}`,
    `  status: ${plan.status}`,
    plan.preset ? `  preset: ${plan.preset.id}` : undefined,
    `  profile: ${report.profile.id}`,
    `  source: ${report.profile.source?.kind ?? "builtin"}`,
    `  state: ${report.profile.state}`,
    `  transport: ${report.profile.transport.kind}`,
    report.profile.transport.url ? `  url: ${report.profile.transport.url}` : undefined,
    `  auth_required: ${plan.authReport ? (profileNeedsBearer(plan.authReport) ? "yes" : "no") : report.profile.authRequired ? "yes" : "no"}`,
    `  auth_status: ${authStatus}`,
    `  risk_level: ${report.profile.riskLevel}`,
    `  write_capable: ${report.profile.writeCapable ? "yes" : "no"}`,
    report.profile.writeCapable || report.profile.riskLevel === "high"
      ? "  risk_warning: high_risk_or_write_capable_profile"
      : undefined,
    `  profile_hash: ${report.profileHash}`,
    report.trustedProfileHash ? `  trusted_hash: ${report.trustedProfileHash}` : undefined,
    report.schemaChangePending ? "  schema_change: pending" : undefined,
    `  tools: total=${report.evaluations.length} allowed=${counts.allowed} denied=${counts.denied} blocked=${counts.blocked} model_grantable=${counts.modelGrantable} risky_denied=${counts.riskyDenied}`,
    `  grants: tool=${report.toolGrantCount} stale_tool=${report.staleToolGrantCount} model=${report.modelToolGrantCount} stale_model=${report.staleModelToolGrantCount}`,
    "  network_calls: none",
    "  data_state_writes: none",
    "  permission_tightening: possible_on_existing_mcp_state_reads",
    ...renderNotes(plan.notes),
    "  next:",
    ...plan.nextCommands.map((command) => `    - ${command}`),
    ...renderAuthority(),
  ].filter((line): line is string => typeof line === "string").join("\n");
}

function createPresetAvailablePlan(target: string, preset: McpProviderPreset): McpSetupPlan {
  return {
    kind: "preset",
    target: formatMcpPlanTargetForMessage(target),
    status: "preset_available",
    preset,
    nextCommands: [
      `orx mcp presets inspect ${preset.id}`,
      `orx mcp add-preset ${preset.id}`,
      `orx mcp plan ${preset.id}`,
    ],
    notes: [
      "preset install stores a disabled local user profile only",
      "enable, trust, auth, grants, calls, and model exposure stay separate",
    ],
  };
}

function createProfilePlan(
  target: string,
  report: McpProfileToolPolicyReport,
  options: McpSetupPlanOptions,
  preset?: McpProviderPreset,
): McpSetupPlan {
  const authReport = getMcpProfileAuthReport(report.profile.id, options);
  const status = getProfilePlanStatus(report, authReport);
  return {
    kind: "profile",
    target: formatMcpPlanTargetForMessage(target),
    status,
    preset,
    report,
    authReport,
    nextCommands: buildProfileNextCommands(report, authReport, status),
    notes: buildProfileNotes(report, authReport),
  };
}

function getProfilePlanStatus(
  report: McpProfileToolPolicyReport,
  authReport: McpProfileAuthReport | undefined,
): McpSetupPlanStatus {
  if (report.profile.state !== "enabled") {
    return "installed_disabled";
  }
  if (report.schemaChangePending) {
    return "schema_change_pending";
  }
  if (authReport && profileNeedsBearer(authReport) && !authReport.authReady) {
    return "auth_setup_needed";
  }
  if (report.profile.tools.length === 0) {
    return "remote_tool_review_needed";
  }

  const counts = countProfilePlanTools(report.evaluations);
  if (counts.modelGrantable > 0) {
    return "ready_for_model_grants";
  }
  if (counts.allowed > 0) {
    return "ready_for_operator_calls";
  }
  if (counts.riskyDenied > 0) {
    return "operator_grants_required";
  }
  return "configured_no_allowed_tools";
}

function buildProfileNextCommands(
  report: McpProfileToolPolicyReport,
  authReport: McpProfileAuthReport | undefined,
  status: McpSetupPlanStatus,
): string[] {
  const profileId = report.profile.id;
  const commands = [`orx mcp inspect ${profileId}`];

  if (report.profile.state !== "enabled") {
    if (authReport && profileNeedsBearer(authReport)) {
      commands.push(`orx mcp auth ${profileId}`);
    }
    commands.push(`orx mcp enable ${profileId}`, `orx mcp plan ${profileId}`);
    return commands;
  }

  if (report.schemaChangePending) {
    commands.push(`orx mcp enable ${profileId}`, `orx mcp plan ${profileId}`);
    return commands;
  }

  if (authReport && profileNeedsBearer(authReport) && !authReport.authReady) {
    commands.push(
      `orx mcp auth setup ${profileId}`,
      `orx mcp auth init ${profileId}`,
      `orx mcp auth keychain status ${profileId}`,
    );
    return appendUnique(commands, [`orx mcp plan ${profileId}`]);
  }

  if (report.profile.tools.length === 0 || status === "remote_tool_review_needed") {
    commands.push(`orx mcp remote-tools ${profileId}`);
    if (report.profile.source?.kind === "user") {
      commands.push(`orx mcp import-remote-tools ${profileId}`);
    }
    return appendUnique(commands, [`orx mcp plan ${profileId}`]);
  }

  commands.push(`orx mcp tools ${profileId}`);

  const allowed = report.evaluations.find((evaluation) => evaluation.decision === "allowed");
  if (allowed) {
    commands.push(`orx mcp call ${profileId} ${allowed.toolName} '{}'`);
  }

  const riskyDenied = report.evaluations.find(
    (evaluation) => evaluation.decision === "denied" && isDefaultDeniedEvaluation(evaluation),
  );
  if (riskyDenied) {
    commands.push(`orx mcp allow-tool ${profileId} ${riskyDenied.toolName}`);
  }

  const modelGrantable = report.evaluations.find(isModelGrantableEvaluation);
  if (modelGrantable) {
    commands.push(
      `orx mcp allow-model-tool ${profileId} ${modelGrantable.toolName}`,
      `orx ask --mcp-tools "Use ${modelGrantable.toolName} from ${profileId}"`,
      "in chat: /mcp model enable",
    );
  }

  return appendUnique(commands, [`orx mcp plan ${profileId}`]);
}

function buildProfileNotes(
  report: McpProfileToolPolicyReport,
  authReport: McpProfileAuthReport | undefined,
): string[] {
  const notes = [
    "enable records a trusted local schema hash only; it does not contact the provider",
    "remote output remains untrusted and model-visible MCP is limited to read-only non-billable granted tools",
  ];

  if (authReport && profileNeedsBearer(authReport) && !authReport.authReady) {
    notes.push(`auth bearer missing; prefer ${authReport.profileEnvName} over fallback env when multiple MCP profiles are configured`);
  }

  if (report.profile.tools.length === 0) {
    notes.push("no local tools are declared yet; review remote tool metadata before importing or adding declarations");
  }

  if (report.profile.writeCapable || report.profile.riskLevel === "high") {
    notes.push("high-risk/write-capable profile; grant only reviewed tools and least-privilege provider scopes");
  }

  const deniedRisky = report.evaluations
    .filter((evaluation) => evaluation.decision === "denied" && isDefaultDeniedEvaluation(evaluation))
    .map((evaluation) => evaluation.toolName);
  if (deniedRisky.length > 0) {
    notes.push(`operator-grant-only tools=${deniedRisky.join(",")}`);
  }

  return notes;
}

function findPresetForProfile(profile: McpProfile): McpProviderPreset | undefined {
  return listMcpProviderPresets().find((preset) => profileMatchesPreset(profile, preset));
}

function profileMatchesPreset(profile: McpProfile, preset: McpProviderPreset): boolean {
  if (`user:${preset.profileId}` !== profile.id) {
    return false;
  }

  if (
    profile.transport.kind !== "remote-http" ||
    profile.transport.url !== preset.url ||
    profile.authRequired !== preset.authRequired ||
    profile.riskLevel !== (preset.riskLevel ?? "medium") ||
    profile.writeCapable !== Boolean(preset.writeCapable) ||
    profile.tools.length !== preset.tools.length
  ) {
    return false;
  }

  return preset.tools.every((presetTool) =>
    profile.tools.some(
      (tool) =>
        tool.name === presetTool.name &&
        tool.risk === presetTool.risk &&
        tool.authRequired === presetTool.authRequired &&
        tool.billable === presetTool.billable,
    ),
  );
}

function stripUserPrefix(target: string): string {
  return target.startsWith("user:") ? target.slice("user:".length) : target;
}

function countProfilePlanTools(evaluations: McpToolPolicyEvaluation[]): {
  allowed: number;
  denied: number;
  blocked: number;
  modelGrantable: number;
  riskyDenied: number;
} {
  return {
    allowed: evaluations.filter((evaluation) => evaluation.decision === "allowed").length,
    denied: evaluations.filter((evaluation) => evaluation.decision === "denied").length,
    blocked: evaluations.filter((evaluation) => evaluation.decision.startsWith("blocked_by_")).length,
    modelGrantable: evaluations.filter(isModelGrantableEvaluation).length,
    riskyDenied: evaluations.filter(
      (evaluation) => evaluation.decision === "denied" && isDefaultDeniedEvaluation(evaluation),
    ).length,
  };
}

function isModelGrantableEvaluation(evaluation: McpToolPolicyEvaluation): boolean {
  return (
    evaluation.decision === "allowed" &&
    evaluation.tool?.risk === "read" &&
    !evaluation.tool.billable &&
    evaluation.modelGrantStatus !== "active"
  );
}

function isDefaultDeniedEvaluation(evaluation: McpToolPolicyEvaluation): boolean {
  const tool = evaluation.tool;
  return Boolean(
    tool &&
      (tool.billable ||
        tool.risk === "billable" ||
        tool.risk === "write" ||
        tool.risk === "destructive"),
  );
}

function profileNeedsBearer(report: McpProfileAuthReport): boolean {
  return report.profile.authRequired || report.authRequiredToolCount > 0;
}

function formatAuthStatus(report: McpProfileAuthReport | undefined): string {
  if (!report) {
    return "unknown";
  }
  if (!profileNeedsBearer(report)) {
    return "not_required";
  }
  return report.authReady ? "configured" : "missing";
}

function renderNotes(notes: string[]): string[] {
  return notes.length > 0 ? ["  notes:", ...notes.map((note) => `    - ${note}`)] : [];
}

function renderAuthority(): string[] {
  return [
    "  authority:",
    "    plan_side_effects: no install, enable, trust, grant, fetch, call, audit, or model exposure; existing MCP state permissions may be tightened while reading",
    "    install_enable_auth_grant_fetch_call_model_exposure: separate_explicit_steps",
  ];
}

function appendUnique(commands: string[], extra: string[]): string[] {
  const seen = new Set(commands);
  for (const command of extra) {
    if (!seen.has(command)) {
      seen.add(command);
      commands.push(command);
    }
  }
  return commands;
}

function formatMcpPlanTargetForMessage(target: string): string {
  if (CONTROL_CHAR_PATTERN.test(target) || SECRET_LIKE_PATTERN.test(target)) {
    return "[redacted]";
  }

  const cleaned = target.replace(CONTROL_CHAR_GLOBAL_PATTERN, "").trim();
  if (!cleaned) {
    return "[redacted]";
  }

  if (findMcpProviderPreset(stripUserPrefix(cleaned))) {
    return formatMcpProviderPresetIdForMessage(stripUserPrefix(cleaned));
  }

  return cleaned.length > 120 ? `${cleaned.slice(0, 120)}...` : cleaned;
}
