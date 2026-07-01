import test from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  OPENROUTER_MCP_PROFILE,
  allowMcpModelToolGrant,
  allowMcpToolGrant,
  callRemoteMcpTool,
  createMcpSetupPlan,
  deleteMcpMacosKeychainBearer,
  discoverMcpProfile,
  evaluateMcpModelToolPolicy,
  evaluateMcpToolPolicy,
  formatMcpToolCallResult,
  formatMcpDiscoveryResult,
  formatMcpRemoteToolImportResult,
  formatMcpRemoteToolsResult,
  getMcpMacosKeychainStatus,
  importRemoteMcpTools,
  installMcpProviderPreset,
  initializeMcpAuthEnvFile,
  getMcpModelToolGrantRecord,
  getMcpProfileAuthReport,
  getMcpToolGrantRecord,
  getMcpStatusSummary,
  getMcpProfileToolPolicyReport,
  hashMcpProfile,
  listMcpProviderPresets,
  listRemoteMcpTools,
  loadUserMcpProfileCatalog,
  loadMcpProfilesConfig,
  renderMcpProviderPresetInspect,
  renderMcpAuthEnvFileInitResult,
  renderMcpMacosKeychainResult,
  renderMcpProfileAuthReport,
  renderMcpProfileAuthSetup,
  renderMcpProfileTools,
  renderMcpProviderPresets,
  renderMcpSetupPlan,
  renderUserMcpProfileCatalog,
  redactSecrets,
  removeUserMcpProfile,
  removeUserMcpProfileTool,
  revokeMcpModelToolGrant,
  revokeMcpToolGrant,
  resolveMcpBearerCredential,
  saveMcpProfilesConfig,
  setMcpMacosKeychainBearerPrompt,
  setMcpProfilePersistentState,
  upsertUserMcpProfileTool,
  upsertUserMcpRemoteProfile,
  writeMcpAuditEvent,
  type McpMacosKeychainCommandRunner,
  type McpProfile,
} from "./index.js";
import {
  loadPluginRegistry,
  registerPluginManifest,
  setPluginEnabledState,
} from "../plugins/index.js";

test("openrouter mcp profile declares current official tools and billable chat-send", () => {
  assert.deepEqual(
    OPENROUTER_MCP_PROFILE.tools.map((tool) => tool.name),
    [
      "models-list",
      "model-get",
      "model-endpoints",
      "providers-list",
      "rankings-daily",
      "app-rankings",
      "credits-get",
      "generation-get",
      "benchmarks",
      "docs-search",
      "view-skill",
      "ping",
      "chat-send",
    ],
  );
  assert.deepEqual(
    OPENROUTER_MCP_PROFILE.tools.filter((tool) => tool.billable).map((tool) => tool.name),
    ["chat-send"],
  );
  assert.equal(OPENROUTER_MCP_PROFILE.transport.kind, "remote-http");
  assert.equal(OPENROUTER_MCP_PROFILE.transport.url, "https://mcp.openrouter.ai/mcp");
});

test("mcp profile hashing is deterministic and excludes runtime state", () => {
  const first = hashMcpProfile(OPENROUTER_MCP_PROFILE);
  const second = hashMcpProfile({
    ...OPENROUTER_MCP_PROFILE,
    state: "enabled",
    tools: [...OPENROUTER_MCP_PROFILE.tools].reverse(),
  });

  assert.equal(first, second);
  assert.match(first, /^sha256:[a-f0-9]{64}$/);
});

test("mcp profile hash changes when declared tool metadata changes", () => {
  const changed: McpProfile = {
    ...OPENROUTER_MCP_PROFILE,
    tools: OPENROUTER_MCP_PROFILE.tools.map((tool) =>
      tool.name === "chat-send" ? { ...tool, billable: false, risk: "read" } : tool,
    ),
  };

  assert.notEqual(hashMcpProfile(changed), hashMcpProfile(OPENROUTER_MCP_PROFILE));
});

test("mcp profile hash changes when operator-facing notes change", () => {
  const changed: McpProfile = {
    ...OPENROUTER_MCP_PROFILE,
    notes: "Changed trust guidance.",
  };

  assert.notEqual(hashMcpProfile(changed), hashMcpProfile(OPENROUTER_MCP_PROFILE));
});

test("enabled plugin MCP declarations become disabled namespaced profiles", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-plugin-mcp-profile-"));
  const registryPath = join(cwd, "plugins", "registry.json");
  const manifestPath = writePluginWithMcpProfile(cwd);
  const profileId = "plugin:acme.mcp-plugin@1.0.0:context7";

  try {
    registerPluginManifest(manifestPath, {
      registryPath,
      now: () => new Date("2026-06-27T12:00:00.000Z"),
    });

    let summary = getMcpStatusSummary({ pluginRegistryPath: registryPath });
    assert.equal(summary.profiles.some((profile) => profile.id === profileId), false);

    setPluginEnabledState("acme.mcp-plugin@1.0.0", true, {
      registryPath,
      now: () => new Date("2026-06-27T12:01:00.000Z"),
    });
    summary = getMcpStatusSummary({ pluginRegistryPath: registryPath });
    const profile = summary.profiles.find((candidate) => candidate.id === profileId);

    assert.ok(profile);
    assert.equal(profile.state, "disabled");
    assert.equal(profile.source?.kind, "plugin");
    assert.equal(profile.source?.pluginId, "acme.mcp-plugin@1.0.0");
    assert.equal(profile.source?.componentPath, "mcp.json");
    assert.match(profile.source?.componentHash ?? "", /^sha256:[a-f0-9]{64}$/);
    assert.equal(profile.transport.kind, "remote-http");
    assert.equal(profile.transport.url, "https://mcp.context7.example/mcp");
    assert.deepEqual(
      profile.tools.map((tool) => `${tool.name}:${tool.risk}:${tool.billable ? "billable" : "free"}`),
      ["resolve-library-id:read:free", "write-doc-cache:write:free"],
    );
    assert.match(summary.profileHashes[profileId], /^sha256:[a-f0-9]{64}$/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("plugin MCP profiles use persisted trust state and policy gates", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-plugin-mcp-policy-"));
  const registryPath = join(cwd, "plugins", "registry.json");
  const configPath = join(cwd, "mcp", "profiles.json");
  const manifestPath = writePluginWithMcpProfile(cwd);
  const profileId = "plugin:acme.mcp-plugin@1.0.0:context7";

  try {
    registerPluginManifest(manifestPath, { registryPath });
    setPluginEnabledState("acme.mcp-plugin@1.0.0", true, { registryPath });
    const enabled = setMcpProfilePersistentState(profileId, "enabled", {
      configPath,
      pluginRegistryPath: registryPath,
      now: () => new Date("2026-06-27T12:00:00.000Z"),
    });

    assert.equal(enabled.ok, true);
    assert.match(enabled.trustedProfileHash ?? "", /^sha256:[a-f0-9]{64}$/);

    const readTool = evaluateMcpToolPolicy(profileId, "resolve-library-id", {
      configPath,
      pluginRegistryPath: registryPath,
    });
    const writeTool = evaluateMcpToolPolicy(profileId, "write-doc-cache", {
      configPath,
      pluginRegistryPath: registryPath,
    });
    const summary = getMcpStatusSummary({ configPath, pluginRegistryPath: registryPath });

    assert.equal(readTool.decision, "allowed");
    assert.equal(writeTool.decision, "denied");
    assert.match(writeTool.reason, /write MCP tools require an explicit MCP tool grant/);
    assert.deepEqual(summary.activeProfileIds, [profileId]);
    assert.equal(summary.policyAllowedToolCount, 1);
    assert.equal(summary.policyDeniedToolCount, 1);
    assert.equal(summary.configuredRiskyToolCount, 2);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("user MCP catalog declarations become disabled namespaced profiles", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-user-mcp-profile-"));
  const profileCatalogPath = join(cwd, "mcp", "profile-catalog.json");

  try {
    writeUserMcpProfileCatalog(profileCatalogPath);
    const summary = getMcpStatusSummary({ profileCatalogPath });
    const profile = summary.profiles.find((candidate) => candidate.id === "user:context7");

    assert.ok(profile);
    assert.equal(profile.state, "disabled");
    assert.equal(profile.source?.kind, "user");
    assert.equal(profile.source?.componentPath, profileCatalogPath);
    assert.match(profile.source?.componentHash ?? "", /^sha256:[a-f0-9]{64}$/);
    assert.equal(profile.transport.kind, "remote-http");
    assert.equal(profile.transport.url, "https://mcp.context7.example/mcp");
    assert.deepEqual(
      profile.tools.map((tool) => `${tool.name}:${tool.risk}:${tool.billable ? "billable" : "free"}`),
      ["resolve-library-id:read:free", "write-doc-cache:write:free"],
    );
    assert.match(summary.profileHashes["user:context7"], /^sha256:[a-f0-9]{64}$/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("user MCP profiles use persisted trust state and policy gates", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-user-mcp-policy-"));
  const profileCatalogPath = join(cwd, "mcp", "profile-catalog.json");
  const configPath = join(cwd, "mcp", "profiles.json");

  try {
    writeUserMcpProfileCatalog(profileCatalogPath);
    const enabled = setMcpProfilePersistentState("user:context7", "enabled", {
      configPath,
      profileCatalogPath,
      now: () => new Date("2026-06-28T12:00:00.000Z"),
    });

    assert.equal(enabled.ok, true);
    assert.match(enabled.trustedProfileHash ?? "", /^sha256:[a-f0-9]{64}$/);

    const readTool = evaluateMcpToolPolicy("user:context7", "resolve-library-id", {
      configPath,
      profileCatalogPath,
    });
    const writeTool = evaluateMcpToolPolicy("user:context7", "write-doc-cache", {
      configPath,
      profileCatalogPath,
    });
    const summary = getMcpStatusSummary({ configPath, profileCatalogPath });

    assert.equal(readTool.decision, "allowed");
    assert.equal(writeTool.decision, "denied");
    assert.match(writeTool.reason, /write MCP tools require an explicit MCP tool grant/);
    assert.deepEqual(summary.activeProfileIds, ["user:context7"]);
    assert.equal(summary.policyAllowedToolCount, 1);
    assert.equal(summary.policyDeniedToolCount, 1);
    assert.equal(summary.configuredRiskyToolCount, 2);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("user MCP catalog mutation helpers write private profiles and tools", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-user-mcp-edit-"));
  const profileCatalogPath = join(cwd, "mcp", "profile-catalog.json");

  try {
    const profileResult = upsertUserMcpRemoteProfile(
      "context7",
      {
        name: "Context7 docs",
        url: "https://mcp.context7.example/mcp",
        authRequired: true,
        notes: "Local docs profile.",
      },
      { profileCatalogPath },
    );
    assert.equal(profileResult.ok, true);
    assert.equal(profileResult.profileId, "user:context7");
    assert.equal((statSync(dirname(profileCatalogPath)).mode & 0o777).toString(8), "700");
    assert.equal((statSync(profileCatalogPath).mode & 0o777).toString(8), "600");

    const toolResult = upsertUserMcpProfileTool(
      "user:context7",
      {
        name: "resolve-library-id",
        risk: "read",
        authRequired: true,
        billable: false,
      },
      { profileCatalogPath },
    );
    assert.equal(toolResult.ok, true);

    let loaded = loadUserMcpProfileCatalog({ profileCatalogPath });
    assert.equal(loaded.profiles.length, 1);
    assert.match(renderUserMcpProfileCatalog(loaded), /profile=user:context7/);
    assert.deepEqual(
      loaded.profiles[0].tools.map((tool) => `${tool.name}:${tool.risk}:${tool.authRequired}`),
      ["resolve-library-id:read:true"],
    );

    const removedTool = removeUserMcpProfileTool("context7", "resolve-library-id", {
      profileCatalogPath,
    });
    assert.equal(removedTool.ok, true);
    loaded = loadUserMcpProfileCatalog({ profileCatalogPath });
    assert.equal(loaded.profiles[0].tools.length, 0);

    const removedProfile = removeUserMcpProfile("context7", { profileCatalogPath });
    assert.equal(removedProfile.ok, true);
    loaded = loadUserMcpProfileCatalog({ profileCatalogPath });
    assert.equal(loaded.profiles.length, 0);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("MCP provider presets install local user catalog profiles", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-provider-preset-"));
  const profileCatalogPath = join(cwd, "mcp", "profile-catalog.json");

  try {
    const rendered = renderMcpProviderPresets();
    assert.match(rendered, /id=browser/);
    assert.match(rendered, /id=cloudflare-api/);
    assert.match(rendered, /id=cloudflare-docs/);
    assert.match(rendered, /id=context7/);
    assert.match(rendered, /id=figma/);
    assert.match(rendered, /id=github-readonly/);
    assert.match(rendered, /id=github-write/);
    assert.match(rendered, /id=gitlab-readonly/);
    assert.match(rendered, /id=microsoft-learn/);
    assert.match(rendered, /id=sentry-readonly/);
    assert.match(rendered, /id=sourcegraph-github-readonly/);

    const inspected = renderMcpProviderPresetInspect(listMcpProviderPresets()[0]!);
    assert.match(inspected, /MCP Provider Preset:/);
    assert.match(inspected, /result_state: local_user_profile_disabled/);
    assert.match(inspected, /inspect_side_effects: none/);
    assert.match(inspected, /install_enable_trust_grant_call_model_exposure: separate_explicit_steps/);

    const result = installMcpProviderPreset("microsoft-learn", {
      profileCatalogPath,
      profileId: "mslearn",
    });
    assert.equal(result.ok, true);
    assert.equal(result.profileId, "user:mslearn");
    assert.equal(result.toolCount, 3);

    const loaded = loadUserMcpProfileCatalog({ profileCatalogPath });
    assert.equal(loaded.profiles.length, 1);
    assert.equal(loaded.profiles[0].id, "user:mslearn");
    assert.equal(loaded.profiles[0].state, "disabled");
    assert.equal(loaded.profiles[0].transport.url, "https://learn.microsoft.com/api/mcp");
    assert.deepEqual(
      loaded.profiles[0].tools.map((tool) => `${tool.name}:${tool.risk}:${tool.authRequired}`),
      [
        "microsoft_code_sample_search:read:false",
        "microsoft_docs_fetch:read:false",
        "microsoft_docs_search:read:false",
      ],
    );

    const cloudflareResult = installMcpProviderPreset("cloudflare-api", {
      profileCatalogPath,
    });
    assert.equal(cloudflareResult.ok, true);
    assert.equal(cloudflareResult.profileId, "user:cloudflare-api");
    assert.equal(cloudflareResult.toolCount, 2);

    const loadedWithCloudflare = loadUserMcpProfileCatalog({ profileCatalogPath });
    const cloudflareProfile = loadedWithCloudflare.profiles.find(
      (profile) => profile.id === "user:cloudflare-api",
    );
    assert.ok(cloudflareProfile);
    assert.equal(cloudflareProfile.transport.url, "https://mcp.cloudflare.com/mcp");
    assert.equal(cloudflareProfile.riskLevel, "high");
    assert.equal(cloudflareProfile.writeCapable, true);
    assert.deepEqual(
      cloudflareProfile.tools.map((tool) => `${tool.name}:${tool.risk}:${tool.authRequired}`),
      ["execute:destructive:true", "search:read:true"],
    );

    const figmaResult = installMcpProviderPreset("figma", {
      profileCatalogPath,
    });
    assert.equal(figmaResult.ok, true);
    assert.equal(figmaResult.profileId, "user:figma");
    assert.equal(figmaResult.toolCount, 0);

    const loadedWithFigma = loadUserMcpProfileCatalog({ profileCatalogPath });
    const figmaProfile = loadedWithFigma.profiles.find((profile) => profile.id === "user:figma");
    assert.ok(figmaProfile);
    assert.equal(figmaProfile.riskLevel, "high");
    assert.equal(figmaProfile.writeCapable, true);
    assert.equal(figmaProfile.tools.length, 0);

    const sourcegraphResult = installMcpProviderPreset("sourcegraph-github-readonly", {
      profileCatalogPath,
    });
    assert.equal(sourcegraphResult.ok, true);
    assert.equal(sourcegraphResult.profileId, "user:sourcegraph-github-readonly");
    assert.equal(sourcegraphResult.toolCount, 0);

    const loadedWithSourcegraph = loadUserMcpProfileCatalog({ profileCatalogPath });
    const sourcegraphProfile = loadedWithSourcegraph.profiles.find(
      (profile) => profile.id === "user:sourcegraph-github-readonly",
    );
    assert.ok(sourcegraphProfile);
    assert.equal(sourcegraphProfile.transport.url, "https://sourcegraph.com/mcp");
    assert.equal(sourcegraphProfile.authRequired, true);
    assert.equal(sourcegraphProfile.riskLevel, "medium");
    assert.equal(sourcegraphProfile.writeCapable, false);
    assert.equal(sourcegraphProfile.tools.length, 0);

    const gitlabResult = installMcpProviderPreset("gitlab-readonly", {
      profileCatalogPath,
    });
    assert.equal(gitlabResult.ok, true);
    assert.equal(gitlabResult.profileId, "user:gitlab-readonly");
    assert.equal(gitlabResult.toolCount, 0);

    const loadedWithGitLab = loadUserMcpProfileCatalog({ profileCatalogPath });
    const gitlabProfile = loadedWithGitLab.profiles.find(
      (profile) => profile.id === "user:gitlab-readonly",
    );
    assert.ok(gitlabProfile);
    assert.equal(gitlabProfile.transport.url, "https://gitlab.com/api/v4/mcp");
    assert.equal(gitlabProfile.authRequired, true);
    assert.equal(gitlabProfile.riskLevel, "medium");
    assert.equal(gitlabProfile.writeCapable, false);
    assert.equal(gitlabProfile.tools.length, 0);

    const githubWriteResult = installMcpProviderPreset("github-write", {
      profileCatalogPath,
    });
    assert.equal(githubWriteResult.ok, true);
    assert.equal(githubWriteResult.profileId, "user:github-write");
    assert.equal(githubWriteResult.toolCount, 0);

    const loadedWithGithubWrite = loadUserMcpProfileCatalog({ profileCatalogPath });
    const githubWriteProfile = loadedWithGithubWrite.profiles.find(
      (profile) => profile.id === "user:github-write",
    );
    assert.ok(githubWriteProfile);
    assert.equal(githubWriteProfile.transport.url, "https://api.githubcopilot.com/mcp/");
    assert.equal(githubWriteProfile.authRequired, true);
    assert.equal(githubWriteProfile.riskLevel, "high");
    assert.equal(githubWriteProfile.writeCapable, true);
    assert.equal(githubWriteProfile.tools.length, 0);

    const unknown = installMcpProviderPreset("missing", { profileCatalogPath });
    assert.equal(unknown.ok, false);
    assert.match(unknown.message, /Unknown MCP provider preset/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("MCP setup planner guides preset, profile, auth, and grant next steps without data mutations", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-plan-"));
  const profileCatalogPath = join(cwd, "mcp", "profile-catalog.json");
  const configPath = join(cwd, "mcp", "profiles.json");

  try {
    const presetPlan = renderMcpSetupPlan(
      createMcpSetupPlan("context7", { profileCatalogPath, configPath }),
    );
    assert.match(presetPlan, /status: preset_available/);
    assert.match(presetPlan, /profile: user:context7/);
    assert.match(presetPlan, /orx mcp add-preset context7/);
    assert.match(presetPlan, /data_state_writes: none/);
    assert.match(presetPlan, /permission_tightening: possible_on_existing_mcp_state_reads/);
    assert.match(presetPlan, /plan_side_effects: no install, enable, trust, grant, fetch, call, audit, or model exposure/);
    assert.equal(existsSync(profileCatalogPath), false);
    assert.equal(existsSync(configPath), false);

    installMcpProviderPreset("context7", { profileCatalogPath });
    const disabledPlan = renderMcpSetupPlan(
      createMcpSetupPlan("context7", { profileCatalogPath, configPath }),
    );
    assert.match(disabledPlan, /status: installed_disabled/);
    assert.match(disabledPlan, /state: disabled/);
    assert.match(disabledPlan, /orx mcp enable user:context7/);
    assert.doesNotMatch(disabledPlan, /orx mcp allow-model-tool/);

    setMcpProfilePersistentState("user:context7", "enabled", {
      profileCatalogPath,
      configPath,
    });
    const enabledPlan = renderMcpSetupPlan(
      createMcpSetupPlan("context7", { profileCatalogPath, configPath }),
    );
    assert.match(enabledPlan, /status: ready_for_model_grants/);
    assert.match(enabledPlan, /auth_status: not_required/);
    assert.match(enabledPlan, /model_grantable=2/);
    assert.match(enabledPlan, /orx mcp allow-model-tool user:context7 query-docs/);
    assert.doesNotMatch(enabledPlan, /orx ask --mcp-tools/);
    assert.doesNotMatch(enabledPlan, /in chat: \/mcp model enable/);

    const modelGrant = allowMcpModelToolGrant("user:context7", "query-docs", {
      profileCatalogPath,
      configPath,
      now: () => new Date("2026-06-30T01:30:00.000Z"),
    });
    assert.equal(modelGrant.ok, true);
    const modelUsePlan = renderMcpSetupPlan(
      createMcpSetupPlan("context7", { profileCatalogPath, configPath }),
    );
    assert.match(modelUsePlan, /status: ready_for_model_use/);
    assert.match(modelUsePlan, /model_grantable=1/);
    assert.match(modelUsePlan, /grants: tool=0 stale_tool=0 model=1 stale_model=0/);
    assert.match(modelUsePlan, /orx ask --mcp-tools "Use query-docs from user:context7"/);
    assert.match(modelUsePlan, /orx mcp allow-model-tool user:context7 resolve-library-id/);
    assert.doesNotMatch(modelUsePlan, /orx mcp allow-model-tool user:context7 query-docs/);

    installMcpProviderPreset("github-readonly", { profileCatalogPath });
    setMcpProfilePersistentState("user:github-readonly", "enabled", {
      profileCatalogPath,
      configPath,
    });
    const githubPlan = renderMcpSetupPlan(
      createMcpSetupPlan("github-readonly", { profileCatalogPath, configPath, env: {} }),
    );
    assert.match(githubPlan, /status: auth_setup_needed/);
    assert.match(githubPlan, /auth_status: missing/);
    assert.match(githubPlan, /orx mcp auth setup user:github-readonly/);
    assert.match(githubPlan, /orx mcp auth init user:github-readonly/);
    assert.doesNotMatch(githubPlan, /orx mcp remote-tools user:github-readonly/);
    assert.doesNotMatch(githubPlan, /orx mcp import-remote-tools user:github-readonly/);
    assert.doesNotMatch(githubPlan, /orx mcp call user:github-readonly/);
    assert.doesNotMatch(githubPlan, /orx mcp allow-model-tool user:github-readonly/);

    installMcpProviderPreset("cloudflare-api", { profileCatalogPath });
    setMcpProfilePersistentState("user:cloudflare-api", "enabled", {
      profileCatalogPath,
      configPath,
    });
    const cloudflarePlan = renderMcpSetupPlan(
      createMcpSetupPlan("cloudflare-api", {
        profileCatalogPath,
        configPath,
        env: { ORX_MCP_BEARER_USER_CLOUDFLARE_API: "bearer-token" },
      }),
    );
    assert.match(cloudflarePlan, /risk_warning: high_risk_or_write_capable_profile/);
    assert.match(cloudflarePlan, /operator-grant-only tools=execute/);
    assert.match(cloudflarePlan, /orx mcp allow-tool user:cloudflare-api execute/);
    assert.doesNotMatch(cloudflarePlan, /allow-model-tool user:cloudflare-api execute/);

    const unknownPlan = renderMcpSetupPlan(
      createMcpSetupPlan("sk-or-v1-secret-plan-target", { profileCatalogPath, configPath }),
    );
    assert.match(unknownPlan, /target: \[redacted\]/);
    assert.doesNotMatch(unknownPlan, /sk-or-v1-secret-plan-target/);

    upsertUserMcpRemoteProfile(
      "context7",
      {
        name: "Private docs",
        url: "https://mcp.private.example/mcp",
        authRequired: true,
        notes: "User profile reusing a preset id.",
      },
      { profileCatalogPath },
    );
    const customContextPlan = renderMcpSetupPlan(
      createMcpSetupPlan("user:context7", { profileCatalogPath, configPath }),
    );
    assert.match(customContextPlan, /profile: user:context7/);
    assert.match(customContextPlan, /url: https:\/\/mcp\.private\.example\/mcp/);
    assert.doesNotMatch(customContextPlan, /preset: context7/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("MCP setup planner discloses read-time permission tightening on existing state", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-plan-permissions-"));
  const configDir = join(cwd, "mcp");
  const configPath = join(configDir, "profiles.json");

  try {
    mkdirSync(configDir, { recursive: true, mode: 0o777 });
    writeFileSync(
      configPath,
      JSON.stringify({ version: 1, profiles: {}, toolGrants: {}, modelToolGrants: {} }),
      { mode: 0o666 },
    );
    chmodSync(configDir, 0o777);
    chmodSync(configPath, 0o666);

    const rendered = renderMcpSetupPlan(createMcpSetupPlan("context7", { configPath }));
    assert.match(rendered, /data_state_writes: none/);
    assert.match(rendered, /permission_tightening: possible_on_existing_mcp_state_reads/);
    assert.match(rendered, /plan_side_effects: no install, enable, trust, grant, fetch, call, audit, or model exposure/);
    assert.equal(statSync(configDir).mode & 0o777, 0o700);
    assert.equal(statSync(configPath).mode & 0o777, 0o600);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("MCP setup planner does not treat unsafe active model grants as ready for model use", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-plan-unsafe-model-grant-"));
  const configPath = join(cwd, "mcp", "profiles.json");

  try {
    setMcpProfilePersistentState("openrouter", "enabled", { configPath });
    const summary = getMcpStatusSummary({ configPath });
    const openrouterHash = summary.profileHashes.openrouter;
    assert.ok(openrouterHash);

    const config = loadMcpProfilesConfig({ configPath });
    config.modelToolGrants["openrouter/chat-send"] = {
      profileId: "openrouter",
      toolName: "chat-send",
      profileHash: openrouterHash,
      risk: "billable",
      billable: true,
      grantedAt: "2026-06-30T01:40:00.000Z",
    };
    saveMcpProfilesConfig(config, { configPath });

    const rendered = renderMcpSetupPlan(
      createMcpSetupPlan("openrouter", {
        configPath,
        env: { ORX_MCP_BEARER_OPENROUTER: "test-bearer" },
      }),
    );
    assert.match(rendered, /model=1 stale_model=0/);
    assert.match(rendered, /status: ready_for_model_grants/);
    assert.match(rendered, /orx mcp allow-model-tool openrouter models-list/);
    assert.doesNotMatch(rendered, /status: ready_for_model_use/);
    assert.doesNotMatch(rendered, /orx ask --mcp-tools "Use chat-send from openrouter"/);
    assert.doesNotMatch(rendered, /in chat: \/mcp model enable/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("user MCP catalog edits preserve existing servers-shape declarations", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-user-mcp-edit-servers-"));
  const profileCatalogPath = join(cwd, "mcp", "profile-catalog.json");

  try {
    mkdirSync(dirname(profileCatalogPath), { recursive: true });
    writeFileSync(
      profileCatalogPath,
      JSON.stringify({
        version: 1,
        servers: {
          existing: {
            transport: {
              kind: "remote-http",
              url: "https://mcp.existing.example/mcp",
            },
            tools: [
              {
                name: "lookup",
                risk: "read",
                authRequired: false,
                billable: false,
              },
            ],
          },
        },
      }),
    );

    const result = upsertUserMcpRemoteProfile(
      "context7",
      {
        url: "https://mcp.context7.example/mcp",
      },
      { profileCatalogPath },
    );
    assert.equal(result.ok, true);

    const loaded = loadUserMcpProfileCatalog({ profileCatalogPath });
    assert.deepEqual(
      loaded.profiles.map((profile) => profile.id),
      ["user:context7", "user:existing"],
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("user MCP catalog edits preserve existing array-shape declarations", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-user-mcp-edit-array-"));
  const profileCatalogPath = join(cwd, "mcp", "profile-catalog.json");

  try {
    mkdirSync(dirname(profileCatalogPath), { recursive: true });
    writeFileSync(
      profileCatalogPath,
      JSON.stringify({
        version: 1,
        profiles: [
          {
            id: "existing",
            transport: {
              kind: "remote-http",
              url: "https://mcp.existing.example/mcp",
            },
            tools: [
              {
                name: "lookup",
                risk: "read",
                authRequired: false,
                billable: false,
              },
            ],
          },
        ],
      }),
    );

    const result = upsertUserMcpRemoteProfile(
      "context7",
      {
        url: "https://mcp.context7.example/mcp",
      },
      { profileCatalogPath },
    );
    assert.equal(result.ok, true);

    const loaded = loadUserMcpProfileCatalog({ profileCatalogPath });
    assert.deepEqual(
      loaded.profiles.map((profile) => profile.id),
      ["user:context7", "user:existing"],
    );
    const saved = JSON.parse(readFileSync(profileCatalogPath, "utf8")) as {
      profiles: Record<string, unknown>;
    };
    assert.equal(Array.isArray(saved.profiles), false);
    assert.equal(typeof saved.profiles.existing, "object");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("user MCP catalog edits normalize saved declarations to supported fields", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-user-mcp-edit-normalize-"));
  const profileCatalogPath = join(cwd, "mcp", "profile-catalog.json");

  try {
    mkdirSync(dirname(profileCatalogPath), { recursive: true });
    writeFileSync(
      profileCatalogPath,
      JSON.stringify({
        version: 1,
        profiles: {
          context7: {
            name: "Context7 docs",
            transport: {
              kind: "remote-http",
              url: "https://mcp.context7.example/mcp",
            },
            authRequired: false,
            customJunk: "drop me",
            tools: [
              {
                name: "resolve-library-id",
                risk: "read",
                authRequired: false,
                billable: false,
                extra: "drop me too",
              },
            ],
          },
        },
      }),
    );

    const result = upsertUserMcpProfileTool(
      "context7",
      {
        name: "get-docs",
        risk: "read",
        authRequired: false,
        billable: false,
      },
      { profileCatalogPath },
    );
    assert.equal(result.ok, true);

    const saved = JSON.parse(readFileSync(profileCatalogPath, "utf8")) as {
      profiles: Record<string, Record<string, unknown>>;
    };
    assert.equal(saved.profiles.context7.customJunk, undefined);
    assert.deepEqual(
      (saved.profiles.context7.tools as Array<Record<string, unknown>>).map((tool) =>
        Object.keys(tool).sort(),
      ),
      [
        ["authRequired", "billable", "name", "risk"],
        ["authRequired", "billable", "name", "risk"],
      ],
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("user MCP catalog rejects unsafe declarations", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-user-mcp-unsafe-"));
  const profileCatalogPath = join(cwd, "mcp", "profile-catalog.json");

  try {
    mkdirSync(dirname(profileCatalogPath), { recursive: true });
    writeFileSync(
      profileCatalogPath,
      JSON.stringify({
        version: 1,
        profiles: {
          unsafe: {
            transport: {
              kind: "remote-http",
              url: "https://mcp.example.test/mcp?v=1",
            },
          },
        },
      }),
    );
    const loaded = loadUserMcpProfileCatalog({ profileCatalogPath });
    const summary = getMcpStatusSummary({ profileCatalogPath });

    assert.equal(loaded.profiles.length, 0);
    assert.equal(loaded.omissions.length, 1);
    assert.match(loaded.omissions[0].reason, /query strings or fragments/);
    assert.equal(summary.profiles.some((profile) => profile.id === "user:unsafe"), false);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("plugin MCP profile hash changes when cached component declarations change", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-plugin-mcp-schema-change-"));
  const registryPath = join(cwd, "plugins", "registry.json");
  const configPath = join(cwd, "mcp", "profiles.json");
  const manifestPath = writePluginWithMcpProfile(cwd);
  const profileId = "plugin:acme.mcp-plugin@1.0.0:context7";

  try {
    registerPluginManifest(manifestPath, { registryPath });
    setPluginEnabledState("acme.mcp-plugin@1.0.0", true, { registryPath });
    setMcpProfilePersistentState(profileId, "enabled", {
      configPath,
      pluginRegistryPath: registryPath,
    });
    const before = getMcpStatusSummary({ configPath, pluginRegistryPath: registryPath });
    const cachedPlugin = loadPluginRegistry({ registryPath }).plugins["acme.mcp-plugin@1.0.0"];
    writeFileSync(
      join(dirname(cachedPlugin.lock.source.manifestPath), "mcp.json"),
      JSON.stringify({
        servers: {
          context7: {
            name: "Context7 docs",
            transport: {
              kind: "remote-http",
              url: "https://mcp.context7.example/mcp",
            },
            tools: [
              {
                name: "resolve-library-id",
                risk: "read",
                authRequired: false,
                billable: false,
              },
            ],
          },
        },
      }),
    );

    const after = getMcpStatusSummary({ configPath, pluginRegistryPath: registryPath });
    const readTool = evaluateMcpToolPolicy(profileId, "resolve-library-id", {
      configPath,
      pluginRegistryPath: registryPath,
    });

    assert.notEqual(after.profileHashes[profileId], before.profileHashes[profileId]);
    assert.deepEqual(after.pendingSchemaChangeProfileIds, [profileId]);
    assert.equal(readTool.decision, "blocked_by_schema_change");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("plugin MCP discovery contacts enabled trusted remote-http endpoints without executing tools", async () => {
  const seenRequests: Array<{ url: string; method?: string; body?: string }> = [];
  const cwd = mkdtempSync(join(tmpdir(), "orx-plugin-mcp-discovery-"));
  const registryPath = join(cwd, "plugins", "registry.json");
  const configPath = join(cwd, "mcp", "profiles.json");
  const manifestPath = writePluginWithMcpProfile(cwd);
  const profileId = "plugin:acme.mcp-plugin@1.0.0:context7";

  try {
    registerPluginManifest(manifestPath, { registryPath });
    setPluginEnabledState("acme.mcp-plugin@1.0.0", true, { registryPath });
    setMcpProfilePersistentState(profileId, "enabled", {
      configPath,
      pluginRegistryPath: registryPath,
    });

    const result = await discoverMcpProfile(profileId, {
      configPath,
      pluginRegistryPath: registryPath,
      fetch: async (input, init) => {
        seenRequests.push({
          url: String(input),
          method: init?.method,
          body: String(init?.body),
        });
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: "orx-discovery-1",
            result: {
              protocolVersion: "2025-03-26",
              capabilities: {
                tools: {},
              },
              serverInfo: {
                name: "context7",
                version: "test",
              },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    });

    assert.equal(seenRequests.length, 1);
    assert.equal(seenRequests[0].url, "https://mcp.context7.example/mcp");
    assert.equal(seenRequests[0].method, "POST");
    assert.match(seenRequests[0].body ?? "", /"method":"initialize"/);
    assert.equal(result.status, "ok");
    assert.equal(result.networkAttempted, true);
    assert.equal(result.serverInfo?.name, "context7");
    assert.match(
      formatMcpDiscoveryResult(result),
      /tool_execution: explicit \/mcp call or orx mcp call; \/mcp model enable or orx ask --mcp-tools exposes read-only non-billable model-granted mcp_call only/,
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("plugin MCP discovery blocks guarded plugin URLs before fetch", async () => {
  let fetchCalls = 0;
  const cwd = mkdtempSync(join(tmpdir(), "orx-plugin-mcp-discovery-blocked-"));
  const registryPath = join(cwd, "plugins", "registry.json");
  const configPath = join(cwd, "mcp", "profiles.json");
  const manifestPath = writePluginWithMcpProfile(cwd, "http://127.0.0.1/mcp");
  const profileId = "plugin:acme.mcp-plugin@1.0.0:context7";

  try {
    registerPluginManifest(manifestPath, { registryPath });
    setPluginEnabledState("acme.mcp-plugin@1.0.0", true, { registryPath });
    setMcpProfilePersistentState(profileId, "enabled", {
      configPath,
      pluginRegistryPath: registryPath,
    });

    const result = await discoverMcpProfile(profileId, {
      configPath,
      pluginRegistryPath: registryPath,
      fetch: async () => {
        fetchCalls += 1;
        throw new Error("fetch should not be called");
      },
    });

    assert.equal(fetchCalls, 0);
    assert.equal(result.status, "blocked_url");
    assert.equal(result.networkAttempted, false);
    assert.match(formatMcpDiscoveryResult(result), /Blocked local or private IPv4 address/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("plugin MCP discovery vets DNS before native endpoint requests", async () => {
  const resolvedHosts: string[] = [];
  const cwd = mkdtempSync(join(tmpdir(), "orx-plugin-mcp-discovery-dns-"));
  const registryPath = join(cwd, "plugins", "registry.json");
  const configPath = join(cwd, "mcp", "profiles.json");
  const manifestPath = writePluginWithMcpProfile(cwd);
  const profileId = "plugin:acme.mcp-plugin@1.0.0:context7";

  try {
    registerPluginManifest(manifestPath, { registryPath });
    setPluginEnabledState("acme.mcp-plugin@1.0.0", true, { registryPath });
    setMcpProfilePersistentState(profileId, "enabled", {
      configPath,
      pluginRegistryPath: registryPath,
    });

    const result = await discoverMcpProfile(profileId, {
      configPath,
      pluginRegistryPath: registryPath,
      resolveHost: async (hostname) => {
        resolvedHosts.push(hostname);
        return [{ address: "127.0.0.1", family: 4 }];
      },
    });

    assert.deepEqual(resolvedHosts, ["mcp.context7.example"]);
    assert.equal(result.status, "network_error");
    assert.equal(result.networkAttempted, true);
    assert.match(result.error ?? "", /Blocked resolved local or private IP address: 127\.0\.0\.1/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("remote MCP tools/list does not fetch disabled profiles", async () => {
  let fetchCalls = 0;
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-remote-tools-disabled-"));
  const configPath = join(cwd, "mcp", "profiles.json");

  try {
    const result = await listRemoteMcpTools("openrouter", {
      configPath,
      fetch: async () => {
        fetchCalls += 1;
        throw new Error("fetch should not be called");
      },
    });

    assert.equal(fetchCalls, 0);
    assert.equal(result.status, "disabled");
    assert.equal(result.networkAttempted, false);
    assert.match(formatMcpRemoteToolsResult(result), /Enable and trust it with \/mcp enable openrouter/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("remote MCP tools/list reads bounded untrusted tool metadata without executing tools", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-remote-tools-ok-"));
  const configPath = join(cwd, "mcp", "profiles.json");
  const seenRequests: string[] = [];

  try {
    setMcpProfilePersistentState("openrouter", "enabled", { configPath });

    const result = await listRemoteMcpTools("openrouter", {
      configPath,
      fetch: async (input, init) => {
        seenRequests.push(`${String(input)} ${init?.method ?? ""} ${String(init?.body)}`);
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: "orx-tools-list-1",
            result: {
              tools: [
                {
                  name: "models-list",
                  title: "List models",
                  description: "List OpenRouter models",
                  inputSchema: {
                    type: "object",
                    properties: {
                      query: { type: "string" },
                    },
                  },
                  annotations: {
                    readOnlyHint: true,
                    destructiveHint: false,
                  },
                },
                {
                  name: "chat-send",
                  description: "Send a billable chat request",
                  inputSchema: {
                    type: "object",
                    properties: {
                      prompt: { type: "string" },
                    },
                  },
                },
              ],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    });

    assert.equal(seenRequests.length, 1);
    assert.match(seenRequests[0], /^https:\/\/mcp\.openrouter\.ai\/mcp POST /);
    assert.match(seenRequests[0], /"method":"tools\/list"/);
    assert.doesNotMatch(seenRequests[0], /tools\/call/);
    assert.equal(result.status, "ok");
    assert.equal(result.networkAttempted, true);
    assert.equal(result.toolCount, 2);
    assert.equal(result.tools?.[0].name, "models-list");
    assert.match(result.tools?.[0].toolHash ?? "", /^sha256:[a-f0-9]{64}$/);
    assert.match(result.tools?.[0].inputSchemaHash ?? "", /^sha256:[a-f0-9]{64}$/);
    assert.deepEqual(result.tools?.[0].annotationKeys, ["destructiveHint", "readOnlyHint"]);
    const formatted = formatMcpRemoteToolsResult(result);
    assert.match(formatted, /trust_boundary: remote tool metadata is untrusted/);
    assert.match(
      formatted,
      /tool_execution: explicit \/mcp call or orx mcp call; tools\/list metadata is untrusted operator output; \/mcp model enable or orx ask --mcp-tools exposes read-only non-billable model-granted mcp_call only/,
    );
    assert.doesNotMatch(formatted, /"type":"object"/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("remote MCP tool import stores reviewed names in user catalog and requires retrust", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-remote-tool-import-"));
  const configPath = join(cwd, "mcp", "profiles.json");
  const profileCatalogPath = join(cwd, "mcp", "profile-catalog.json");
  const seenRequests: string[] = [];

  try {
    const preset = installMcpProviderPreset("github-readonly", { profileCatalogPath });
    assert.equal(preset.ok, true);
    assert.equal(setMcpProfilePersistentState("user:github-readonly", "enabled", {
      configPath,
      profileCatalogPath,
    }).ok, true);

    const result = await importRemoteMcpTools("github-readonly", {
      configPath,
      profileCatalogPath,
      fetch: async (_input, init) => {
        seenRequests.push(String(init?.body));
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: "orx-tools-list-1",
            result: {
              tools: [
                {
                  name: "get_file_contents",
                  description: "Read files from a repository",
                  inputSchema: { type: "object" },
                },
                {
                  name: "list_issues",
                  annotations: { readOnlyHint: true },
                },
                {
                  name: "bad tool name",
                },
              ],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    });

    assert.equal(seenRequests.length, 1);
    assert.match(seenRequests[0], /"method":"tools\/list"/);
    assert.doesNotMatch(seenRequests[0], /tools\/call/);
    assert.equal(result.status, "ok");
    assert.equal(result.profileId, "user:github-readonly");
    assert.equal(result.importedTools?.length, 2);
    assert.deepEqual(result.importedTools?.map((tool) => tool.name), [
      "get_file_contents",
      "list_issues",
    ]);
    assert.equal(result.importedTools?.[0].risk, "read");
    assert.equal(result.importedTools?.[0].authRequired, true);
    assert.equal(result.importedTools?.[0].billable, false);
    assert.equal(result.skippedTools?.length, 1);
    assert.equal(result.schemaChangePendingAfter, true);
    assert.notEqual(result.profileHashBefore, result.profileHashAfter);

    const report = getMcpProfileToolPolicyReport("user:github-readonly", {
      configPath,
      profileCatalogPath,
    });
    assert.ok(report);
    assert.equal(report.schemaChangePending, true);
    assert.deepEqual(report.profile.tools.map((tool) => tool.name), [
      "get_file_contents",
      "list_issues",
    ]);
    assert.deepEqual(report.profile.tools.map((tool) => tool.risk), ["read", "read"]);
    assert.deepEqual(report.profile.tools.map((tool) => tool.authRequired), [true, true]);

    const formatted = formatMcpRemoteToolImportResult(result);
    assert.match(formatted, /MCP remote tool import: user:github-readonly/);
    assert.match(formatted, /schema_change_after: pending/);
    assert.match(formatted, /risk_default: read/);
    assert.match(formatted, /bad tool name/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("remote MCP tool import preserves stricter existing risk declarations", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-remote-tool-import-risk-"));
  const configPath = join(cwd, "mcp", "profiles.json");
  const profileCatalogPath = join(cwd, "mcp", "profile-catalog.json");

  try {
    const preset = installMcpProviderPreset("cloudflare-api", { profileCatalogPath });
    assert.equal(preset.ok, true);
    assert.equal(setMcpProfilePersistentState("user:cloudflare-api", "enabled", {
      configPath,
      profileCatalogPath,
    }).ok, true);

    const result = await importRemoteMcpTools("cloudflare-api", {
      configPath,
      profileCatalogPath,
      fetch: async () =>
        new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: "orx-tools-list-1",
            result: {
              tools: [
                { name: "execute", description: "Run a Cloudflare API operation" },
                { name: "search", description: "Search Cloudflare API resources" },
                { name: "delete_zone", description: "Undeclared dynamic write-like tool" },
              ],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    });

    assert.equal(result.status, "ok");
    assert.deepEqual(result.importedTools?.map((tool) => `${tool.name}:${tool.risk}`), [
      "execute:destructive",
      "search:read",
    ]);
    assert.deepEqual(result.skippedTools?.map((tool) => tool.name), ["delete_zone"]);
    assert.match(result.skippedTools?.[0]?.reason ?? "", /high-risk or write-capable/);

    const pendingReport = getMcpProfileToolPolicyReport("user:cloudflare-api", {
      configPath,
      profileCatalogPath,
    });
    assert.ok(pendingReport);
    assert.deepEqual(
      pendingReport.profile.tools.map((tool) => `${tool.name}:${tool.risk}:${tool.authRequired}`),
      ["execute:destructive:true", "search:read:true"],
    );

    assert.equal(setMcpProfilePersistentState("user:cloudflare-api", "enabled", {
      configPath,
      profileCatalogPath,
    }).ok, true);
    const executeModelGrant = allowMcpModelToolGrant("user:cloudflare-api", "execute", {
      configPath,
      profileCatalogPath,
    });
    assert.equal(executeModelGrant.ok, false);
    assert.match(executeModelGrant.message, /destructive MCP tools require an explicit MCP tool grant/);

    const executeToolPolicy = evaluateMcpToolPolicy("user:cloudflare-api", "execute", {
      configPath,
      profileCatalogPath,
    });
    assert.equal(executeToolPolicy.decision, "denied");
    assert.match(executeToolPolicy.reason, /explicit MCP tool grant/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("remote MCP tool import skips undeclared dynamic tools for write-capable profiles", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-remote-tool-import-write-capable-"));
  const configPath = join(cwd, "mcp", "profiles.json");
  const profileCatalogPath = join(cwd, "mcp", "profile-catalog.json");

  try {
    const preset = installMcpProviderPreset("figma", { profileCatalogPath });
    assert.equal(preset.ok, true);
    assert.equal(setMcpProfilePersistentState("user:figma", "enabled", {
      configPath,
      profileCatalogPath,
    }).ok, true);

    const result = await importRemoteMcpTools("figma", {
      configPath,
      profileCatalogPath,
      fetch: async () =>
        new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: "orx-tools-list-1",
            result: {
              tools: [{ name: "get_design_context" }, { name: "modify_variable" }],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    });

    assert.equal(result.status, "no_importable_tools");
    assert.deepEqual(result.importedTools, []);
    assert.deepEqual(result.skippedTools?.map((tool) => tool.name), [
      "get_design_context",
      "modify_variable",
    ]);
    assert.match(result.skippedTools?.[0]?.reason ?? "", /high-risk or write-capable/);

    const report = getMcpProfileToolPolicyReport("user:figma", {
      configPath,
      profileCatalogPath,
    });
    assert.ok(report);
    assert.equal(report.profile.riskLevel, "high");
    assert.equal(report.profile.writeCapable, true);
    assert.equal(report.profile.tools.length, 0);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("remote MCP tool import rejects built-in profiles before network", async () => {
  let fetchCalls = 0;
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-remote-tool-import-builtin-"));
  const configPath = join(cwd, "mcp", "profiles.json");

  try {
    setMcpProfilePersistentState("openrouter", "enabled", { configPath });
    const result = await importRemoteMcpTools("openrouter", {
      configPath,
      fetch: async () => {
        fetchCalls += 1;
        throw new Error("fetch should not be called");
      },
    });

    assert.equal(fetchCalls, 0);
    assert.equal(result.status, "unsupported_profile");
    assert.equal(result.ok, false);
    assert.equal(result.networkAttempted, false);
    assert.match(result.message, /only edits local user catalog profiles/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("remote MCP tool import redacts skipped secret-like remote names", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-remote-tool-import-redact-"));
  const configPath = join(cwd, "mcp", "profiles.json");
  const profileCatalogPath = join(cwd, "mcp", "profile-catalog.json");

  try {
    const preset = installMcpProviderPreset("github-readonly", { profileCatalogPath });
    assert.equal(preset.ok, true);
    assert.equal(setMcpProfilePersistentState("user:github-readonly", "enabled", {
      configPath,
      profileCatalogPath,
    }).ok, true);

    const result = await importRemoteMcpTools("github-readonly", {
      configPath,
      profileCatalogPath,
      fetch: async () =>
        new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: "orx-tools-list-1",
            result: {
              tools: [
                { name: "ghp_fakeSecretToken1234567890" },
                { name: "github_pat_fakeSecretToken_1234567890" },
                { name: "glpat-fakeSecretToken1234567890" },
                { name: "xoxb-fakeSecretToken1234567890" },
              ],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    });

    assert.equal(result.status, "no_importable_tools");
    assert.equal(result.importedTools?.length, 0);
    assert.equal(result.skippedTools?.length, 4);
    const serialized = JSON.stringify(result);
    const formatted = formatMcpRemoteToolImportResult(result);
    assert.doesNotMatch(serialized, /fakeSecretToken|ghp_|github_pat_|glpat-|xoxb-/);
    assert.doesNotMatch(formatted, /fakeSecretToken|ghp_|github_pat_|glpat-|xoxb-/);
    assert.match(formatted, /\[redacted\]/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("remote MCP tools/list paginates and locally truncates without executing tools", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-remote-tools-page-"));
  const configPath = join(cwd, "mcp", "profiles.json");
  const requestBodies: string[] = [];

  try {
    setMcpProfilePersistentState("openrouter", "enabled", { configPath });

    const result = await listRemoteMcpTools("openrouter", {
      configPath,
      maxTools: 2,
      fetch: async (_input, init) => {
        requestBodies.push(String(init?.body));
        const page = requestBodies.length;
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: `orx-tools-list-${page}`,
            result: {
              tools: [{ name: `tool-${page}-a` }, { name: `tool-${page}-b` }],
              nextCursor: page === 1 ? "next-page" : undefined,
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    });

    assert.equal(requestBodies.length, 1);
    assert.doesNotMatch(requestBodies.join("\n"), /tools\/call/);
    assert.equal(result.status, "ok");
    assert.equal(result.toolCount, 2);
    assert.equal(result.truncated, true);
    assert.equal(result.nextCursorPresent, true);
    assert.deepEqual(result.tools?.map((tool) => tool.name), ["tool-1-a", "tool-1-b"]);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("remote MCP tools/list blocks guarded plugin URLs before fetch", async () => {
  let fetchCalls = 0;
  const cwd = mkdtempSync(join(tmpdir(), "orx-plugin-mcp-remote-tools-blocked-"));
  const registryPath = join(cwd, "plugins", "registry.json");
  const configPath = join(cwd, "mcp", "profiles.json");
  const manifestPath = writePluginWithMcpProfile(cwd, "http://127.0.0.1/mcp");
  const profileId = "plugin:acme.mcp-plugin@1.0.0:context7";

  try {
    registerPluginManifest(manifestPath, { registryPath });
    setPluginEnabledState("acme.mcp-plugin@1.0.0", true, { registryPath });
    setMcpProfilePersistentState(profileId, "enabled", {
      configPath,
      pluginRegistryPath: registryPath,
    });

    const result = await listRemoteMcpTools(profileId, {
      configPath,
      pluginRegistryPath: registryPath,
      fetch: async () => {
        fetchCalls += 1;
        throw new Error("fetch should not be called");
      },
    });

    assert.equal(fetchCalls, 0);
    assert.equal(result.status, "blocked_url");
    assert.equal(result.networkAttempted, false);
    assert.match(formatMcpRemoteToolsResult(result), /Blocked local or private IPv4 address/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("remote MCP tools/list blocks untrusted and pending schema profiles without network", async () => {
  let fetchCalls = 0;
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-remote-tools-gates-"));
  const configPath = join(cwd, "mcp", "profiles.json");

  try {
    mkdirSync(join(cwd, "mcp"), { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify({
        version: 1,
        profiles: {
          openrouter: {
            id: "openrouter",
            state: "enabled",
            updatedAt: "2026-06-28T12:00:00.000Z",
          },
        },
      }),
    );

    const untrusted = await listRemoteMcpTools("openrouter", {
      configPath,
      fetch: async () => {
        fetchCalls += 1;
        throw new Error("fetch should not be called");
      },
    });

    writeFileSync(
      configPath,
      JSON.stringify({
        version: 1,
        profiles: {
          openrouter: {
            id: "openrouter",
            state: "enabled",
            trustedProfileHash: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
            updatedAt: "2026-06-28T12:01:00.000Z",
          },
        },
      }),
    );

    const pending = await listRemoteMcpTools("openrouter", {
      configPath,
      fetch: async () => {
        fetchCalls += 1;
        throw new Error("fetch should not be called");
      },
    });

    assert.equal(fetchCalls, 0);
    assert.equal(untrusted.status, "untrusted");
    assert.equal(untrusted.networkAttempted, false);
    assert.equal(pending.status, "schema_change_pending");
    assert.equal(pending.networkAttempted, false);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("remote MCP tools/list sanitizes auth and remote errors", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-remote-tools-auth-"));
  const configPath = join(cwd, "mcp", "profiles.json");

  try {
    setMcpProfilePersistentState("openrouter", "enabled", { configPath });

    const authRequired = await listRemoteMcpTools("openrouter", {
      configPath,
      fetch: async () => new Response("Bearer sk-or-v1-secret", { status: 403 }),
    });
    assert.equal(authRequired.status, "auth_required");
    assert.doesNotMatch(JSON.stringify(authRequired), /sk-or-v1-secret/);

    const remoteError = await listRemoteMcpTools("openrouter", {
      configPath,
      fetch: async () =>
        new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: "orx-tools-list-1",
            error: {
              code: -32000,
              message: "bad Bearer sk-or-v1-secret access_token=abcd1234",
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    });
    assert.equal(remoteError.status, "remote_error");
    assert.match(remoteError.error ?? "", /\[redacted\]/);
    assert.doesNotMatch(formatMcpRemoteToolsResult(remoteError), /sk-or-v1-secret/);
    assert.doesNotMatch(formatMcpRemoteToolsResult(remoteError), /access_token=abcd1234/);
    assert.match(formatMcpRemoteToolsResult(remoteError), /access_token=\[redacted\]/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("remote MCP tools/list renders remote-controlled text as sanitized single-line metadata", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-remote-tools-line-safe-"));
  const configPath = join(cwd, "mcp", "profiles.json");

  try {
    setMcpProfilePersistentState("openrouter", "enabled", { configPath });

    const result = await listRemoteMcpTools("openrouter", {
      configPath,
      fetch: async () =>
        new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: "orx-tools-list-1",
            result: {
              tools: [
                {
                  name: "safe\nstatus: forged",
                  title: "title\tsecret=abc123",
                  description: "desc\r\naccess_token=abcd1234",
                  annotations: {
                    "key\nforged": true,
                  },
                },
              ],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    });

    const formatted = formatMcpRemoteToolsResult(result);
    assert.equal(result.status, "ok");
    assert.doesNotMatch(formatted, /\nstatus: forged/);
    assert.doesNotMatch(formatted, /secret=abc123/);
    assert.doesNotMatch(formatted, /access_token=abcd1234/);
    assert.match(formatted, /safe status: forged/);
    assert.match(formatted, /secret=\[redacted\]/);
    assert.match(formatted, /access_token=\[redacted\]/);
    assert.match(formatted, /annotation_keys=key forged/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("remote MCP tools/call requires auth tokens before network", async () => {
  let fetchCalls = 0;
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-call-auth-"));
  const configPath = join(cwd, "mcp", "profiles.json");

  try {
    setMcpProfilePersistentState("openrouter", "enabled", { configPath });

    const result = await callRemoteMcpTool("openrouter", "models-list", {}, {
      configPath,
      fetch: async () => {
        fetchCalls += 1;
        throw new Error("fetch should not be called without auth");
      },
    });

    assert.equal(result.status, "auth_required");
    assert.equal(result.networkAttempted, false);
    assert.equal(result.policyDecision, "allowed");
    assert.match(result.message, /ORX_MCP_BEARER_OPENROUTER/);
    assert.equal(fetchCalls, 0);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("remote MCP tools/call sends JSON-RPC call and sanitizes returned content", async () => {
  const seenRequests: Array<{ url: string; authorization: string | null; body: string }> = [];
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-call-ok-"));
  const configPath = join(cwd, "mcp", "profiles.json");

  try {
    setMcpProfilePersistentState("openrouter", "enabled", { configPath });

    const result = await callRemoteMcpTool(
      "openrouter",
      "models-list",
      { query: "claude" },
      {
        configPath,
        authToken: "mcp-secret-token",
        fetch: async (input, init) => {
          const headers = new Headers(init?.headers as HeadersInit);
          seenRequests.push({
            url: String(input),
            authorization: headers.get("authorization"),
            body: String(init?.body),
          });
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: "orx-tools-call-1",
              result: {
                content: [
                  {
                    type: "text",
                    text: "model list\naccess_token=abcd1234",
                  },
                ],
              },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        },
      },
    );
    const formatted = formatMcpToolCallResult(result);

    assert.equal(seenRequests.length, 1);
    assert.equal(seenRequests[0].url, "https://mcp.openrouter.ai/mcp");
    assert.equal(seenRequests[0].authorization, "Bearer mcp-secret-token");
    assert.match(seenRequests[0].body, /"method":"tools\/call"/);
    assert.match(seenRequests[0].body, /"name":"models-list"/);
    assert.match(seenRequests[0].body, /"query":"claude"/);
    assert.equal(result.status, "ok");
    assert.equal(result.ok, true);
    assert.equal(result.networkAttempted, true);
    assert.match(result.resultHash ?? "", /^sha256:[a-f0-9]{64}$/);
    assert.doesNotMatch(formatted, /access_token=abcd1234/);
    assert.doesNotMatch(formatted, /\naccess_token/);
    assert.match(formatted, /access_token=\[redacted\]/);
    assert.match(formatted, /model_exposure: not exposed to the model loop/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("remote MCP tools/call does not send bearer token to non-auth profiles", async () => {
  const seenHeaders: Array<string | null> = [];
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-call-no-auth-plugin-"));
  const registryPath = join(cwd, "plugins", "registry.json");
  const configPath = join(cwd, "mcp", "profiles.json");
  const manifestPath = writePluginWithMcpProfile(cwd);
  const profileId = "plugin:acme.mcp-plugin@1.0.0:context7";

  try {
    registerPluginManifest(manifestPath, { registryPath });
    setPluginEnabledState("acme.mcp-plugin@1.0.0", true, { registryPath });
    setMcpProfilePersistentState(profileId, "enabled", {
      configPath,
      pluginRegistryPath: registryPath,
    });

    const result = await callRemoteMcpTool(profileId, "resolve-library-id", { library: "react" }, {
      authToken: "global-token-that-must-not-be-forwarded",
      configPath,
      pluginRegistryPath: registryPath,
      fetch: async (_input, init) => {
        const headers = new Headers(init?.headers as HeadersInit);
        seenHeaders.push(headers.get("authorization"));
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: "orx-tools-call-1",
            result: { content: [{ type: "text", text: "ok" }] },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    });

    assert.equal(result.status, "ok");
    assert.deepEqual(seenHeaders, [null]);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("remote MCP tools/call denies billable tools until granted", async () => {
  let fetchCalls = 0;
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-call-billable-"));
  const configPath = join(cwd, "mcp", "profiles.json");

  try {
    setMcpProfilePersistentState("openrouter", "enabled", { configPath });

    const denied = await callRemoteMcpTool("openrouter", "chat-send", { prompt: "hi" }, {
      configPath,
      authToken: "mcp-secret-token",
      fetch: async () => {
        fetchCalls += 1;
        throw new Error("fetch should not be called before grant");
      },
    });
    assert.equal(denied.status, "policy_denied");
    assert.equal(denied.networkAttempted, false);
    assert.equal(fetchCalls, 0);

    allowMcpToolGrant("openrouter", "chat-send", { configPath });
    const allowed = await callRemoteMcpTool("openrouter", "chat-send", { prompt: "hi" }, {
      configPath,
      authToken: "mcp-secret-token",
      fetch: async () => {
        fetchCalls += 1;
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: "orx-tools-call-1",
            result: { content: [{ type: "text", text: "sent" }] },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    });

    assert.equal(allowed.status, "ok");
    assert.equal(allowed.policyDecision, "allowed");
    assert.equal(fetchCalls, 1);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("remote MCP tools/call denies stale grants before network", async () => {
  let fetchCalls = 0;
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-call-stale-grant-"));
  const configPath = join(cwd, "mcp", "profiles.json");

  try {
    setMcpProfilePersistentState("openrouter", "enabled", { configPath });
    allowMcpToolGrant("openrouter", "chat-send", { configPath });
    const stored = JSON.parse(readFileSync(configPath, "utf8")) as {
      toolGrants: Record<string, { profileHash: string }>;
    };
    stored.toolGrants["openrouter/chat-send"].profileHash =
      "sha256:1111111111111111111111111111111111111111111111111111111111111111";
    writeFileSync(configPath, `${JSON.stringify(stored, null, 2)}\n`);

    const result = await callRemoteMcpTool("openrouter", "chat-send", {}, {
      configPath,
      authToken: "mcp-secret-token",
      fetch: async () => {
        fetchCalls += 1;
        throw new Error("fetch should not be called for stale grants");
      },
    });

    assert.equal(result.status, "policy_denied");
    assert.match(result.message, /stale/);
    assert.equal(result.networkAttempted, false);
    assert.equal(fetchCalls, 0);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("mcp profile hashing is deterministic for duplicate declared tool names", () => {
  const profile: McpProfile = {
    ...OPENROUTER_MCP_PROFILE,
    tools: [
      { name: "duplicate", risk: "read", authRequired: true, billable: false },
      { name: "duplicate", risk: "billable", authRequired: true, billable: true },
    ],
  };

  assert.equal(hashMcpProfile(profile), hashMcpProfile({ ...profile, tools: [...profile.tools].reverse() }));
});

test("mcp persistent profile config stores only state and trusted hash baseline", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-config-"));
  const configPath = join(cwd, "mcp", "profiles.json");
  try {
    const result = setMcpProfilePersistentState("openrouter", "enabled", {
      configPath,
      now: () => new Date("2026-06-26T12:00:00.000Z"),
    });

    assert.equal(result.ok, true);
    assert.equal(result.nextState, "enabled");
    assert.equal(result.trustedProfileHash, hashMcpProfile(OPENROUTER_MCP_PROFILE));

    const raw = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
    assert.deepEqual(Object.keys(raw).sort(), ["modelToolGrants", "profiles", "toolGrants", "version"]);
    const profiles = raw.profiles as Record<string, Record<string, unknown>>;
    assert.deepEqual(Object.keys(profiles.openrouter).sort(), [
      "id",
      "state",
      "trustedProfileHash",
      "updatedAt",
    ]);
    assert.equal(profiles.openrouter.id, "openrouter");
    assert.equal(profiles.openrouter.state, "enabled");
    assert.equal(profiles.openrouter.trustedProfileHash, hashMcpProfile(OPENROUTER_MCP_PROFILE));
    assert.equal(profiles.openrouter.updatedAt, "2026-06-26T12:00:00.000Z");

    const loaded = loadMcpProfilesConfig({ configPath });
    assert.equal(loaded.profiles.openrouter.state, "enabled");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("mcp disabling persists disabled state and keeps trusted hash visible", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-disable-config-"));
  const configPath = join(cwd, "mcp", "profiles.json");
  try {
    setMcpProfilePersistentState("openrouter", "enabled", {
      configPath,
      now: () => new Date("2026-06-26T12:00:00.000Z"),
    });
    const result = setMcpProfilePersistentState("openrouter", "disabled", {
      configPath,
      now: () => new Date("2026-06-26T12:05:00.000Z"),
    });

    assert.equal(result.ok, true);
    assert.equal(result.nextState, "disabled");
    assert.equal(result.trustedProfileHash, hashMcpProfile(OPENROUTER_MCP_PROFILE));

    const summary = getMcpStatusSummary({ configPath });
    assert.deepEqual(summary.activeProfileIds, []);
    assert.equal(summary.trustedProfileHashes.openrouter, hashMcpProfile(OPENROUTER_MCP_PROFILE));
    assert.equal(summary.profileUpdatedAt.openrouter, "2026-06-26T12:05:00.000Z");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("mcp disabling without prior trust does not create a trusted hash baseline", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-disable-untrusted-"));
  const configPath = join(cwd, "mcp", "profiles.json");
  try {
    const result = setMcpProfilePersistentState("openrouter", "disabled", {
      configPath,
      now: () => new Date("2026-06-26T12:00:00.000Z"),
    });

    assert.equal(result.ok, true);
    assert.equal(result.nextState, "disabled");
    assert.equal(result.trustedProfileHash, undefined);

    const loaded = loadMcpProfilesConfig({ configPath });
    assert.equal(loaded.profiles.openrouter.state, "disabled");
    assert.equal(loaded.profiles.openrouter.trustedProfileHash, undefined);
    assert.doesNotMatch(readFileSync(configPath, "utf8"), /trustedProfileHash/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("mcp status counts pending schema changes against trusted baselines", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-pending-config-"));
  const configPath = join(cwd, "mcp", "profiles.json");
  try {
    saveMcpProfilesConfig(
      {
        version: 1,
        profiles: {
          openrouter: {
            id: "openrouter",
            state: "enabled",
            trustedProfileHash: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
            updatedAt: "2026-06-26T12:00:00.000Z",
          },
        },
      },
      { configPath },
    );

    const summary = getMcpStatusSummary({ configPath });
    assert.equal(summary.pendingSchemaChangeCount, 1);
    assert.deepEqual(summary.pendingSchemaChangeProfileIds, ["openrouter"]);
    assert.equal(summary.activeProfileIds[0], "openrouter");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("mcp tool policy blocks disabled profiles without network", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-policy-disabled-"));
  const configPath = join(cwd, "mcp", "profiles.json");
  try {
    const evaluation = evaluateMcpToolPolicy("openrouter", "models-list", { configPath });
    const report = getMcpProfileToolPolicyReport("openrouter", { configPath });

    assert.equal(evaluation.decision, "blocked_by_profile");
    assert.equal(evaluation.reason, "profile is disabled");
    assert.equal(report?.evaluations.length, OPENROUTER_MCP_PROFILE.tools.length);
    assert.equal(
      report?.evaluations.every((candidate) => candidate.decision === "blocked_by_profile"),
      true,
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("mcp tool policy allows enabled trusted read tools and denies billable chat-send", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-policy-enabled-"));
  const configPath = join(cwd, "mcp", "profiles.json");
  try {
    setMcpProfilePersistentState("openrouter", "enabled", { configPath });

    const readTool = evaluateMcpToolPolicy("openrouter", "models-list", { configPath });
    const chatSend = evaluateMcpToolPolicy("openrouter", "chat-send", { configPath });
    const explicitlyAllowedChatSend = evaluateMcpToolPolicy("openrouter", "chat-send", {
      configPath,
      futureAllowedToolIds: ["openrouter/chat-send"],
    });
    const summary = getMcpStatusSummary({ configPath });

    assert.equal(readTool.decision, "allowed");
    assert.equal(readTool.reason, "read-only declared tool on enabled trusted profile");
    assert.equal(chatSend.decision, "denied");
    assert.match(chatSend.reason, /billable MCP tools require an explicit MCP tool grant/);
    assert.equal(chatSend.tool?.billable, true);
    assert.equal(explicitlyAllowedChatSend.decision, "allowed");
    assert.equal(
      explicitlyAllowedChatSend.reason,
      "explicit future allowlist permits this MCP tool",
    );
    assert.equal(summary.policyAllowedToolCount, 12);
    assert.equal(summary.policyDeniedToolCount, 1);
    assert.equal(summary.configuredDeniedToolCount, 1);
    assert.equal(summary.configuredRiskyToolCount, 1);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("mcp tool grants persist and allow risky tools for the current trusted profile hash", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-policy-grant-"));
  const configPath = join(cwd, "mcp", "profiles.json");
  try {
    setMcpProfilePersistentState("openrouter", "enabled", { configPath });

    const result = allowMcpToolGrant("openrouter", "chat-send", {
      configPath,
      now: () => new Date("2026-06-28T12:00:00.000Z"),
    });
    const loaded = loadMcpProfilesConfig({ configPath });
    const grant = getMcpToolGrantRecord(loaded, "openrouter", "chat-send");
    const chatSend = evaluateMcpToolPolicy("openrouter", "chat-send", { configPath });
    const summary = getMcpStatusSummary({ configPath });
    const report = getMcpProfileToolPolicyReport("openrouter", { configPath });
    assert.ok(report);
    const rendered = renderMcpProfileTools(report);

    assert.equal(result.ok, true);
    assert.match(result.message, /Execution is available only through explicit operator calls/);
    assert.equal(grant?.toolName, "chat-send");
    assert.equal(grant?.profileHash, hashMcpProfile(OPENROUTER_MCP_PROFILE));
    assert.equal(grant?.risk, "billable");
    assert.equal(grant?.billable, true);
    assert.equal(grant?.grantedAt, "2026-06-28T12:00:00.000Z");
    assert.equal(chatSend.decision, "allowed");
    assert.equal(chatSend.grantStatus, "active");
    assert.match(chatSend.reason, /explicit MCP tool grant permits/);
    assert.equal(summary.policyAllowedToolCount, 13);
    assert.equal(summary.policyDeniedToolCount, 0);
    assert.equal(summary.toolGrantCount, 1);
    assert.equal(summary.staleToolGrantCount, 0);
    assert.equal(report.toolGrantCount, 1);
    assert.equal(report.staleToolGrantCount, 0);
    assert.match(rendered, /tool_grants: 1/);
    assert.match(rendered, /chat-send risk=billable auth=yes billable=yes grant=active policy=allowed/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("mcp tool grants do not bypass disabled untrusted or changed profiles", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-policy-grant-blocks-"));
  const configPath = join(cwd, "mcp", "profiles.json");
  try {
    const disabled = allowMcpToolGrant("openrouter", "chat-send", { configPath });
    assert.equal(disabled.ok, false);
    assert.match(disabled.message, /profile is disabled/);
    assert.equal(loadMcpProfilesConfig({ configPath }).toolGrants["openrouter/chat-send"], undefined);

    saveMcpProfilesConfig(
      {
        version: 1,
        profiles: {
          openrouter: {
            id: "openrouter",
            state: "enabled",
            updatedAt: "2026-06-28T12:00:00.000Z",
          },
        },
      },
      { configPath },
    );
    const untrusted = allowMcpToolGrant("openrouter", "chat-send", { configPath });
    assert.equal(untrusted.ok, false);
    assert.match(untrusted.message, /no trusted schema hash baseline/);

    saveMcpProfilesConfig(
      {
        version: 1,
        profiles: {
          openrouter: {
            id: "openrouter",
            state: "enabled",
            trustedProfileHash: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
            updatedAt: "2026-06-28T12:00:00.000Z",
          },
        },
      },
      { configPath },
    );
    const changed = allowMcpToolGrant("openrouter", "chat-send", { configPath });
    assert.equal(changed.ok, false);
    assert.match(changed.message, /schema changed/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("mcp stale tool grants are denied and visible", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-policy-stale-grant-"));
  const configPath = join(cwd, "mcp", "profiles.json");
  try {
    saveMcpProfilesConfig(
      {
        version: 1,
        profiles: {
          openrouter: {
            id: "openrouter",
            state: "enabled",
            trustedProfileHash: hashMcpProfile(OPENROUTER_MCP_PROFILE),
            updatedAt: "2026-06-28T12:00:00.000Z",
          },
        },
        toolGrants: {
          "openrouter/chat-send": {
            profileId: "openrouter",
            toolName: "chat-send",
            profileHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
            risk: "billable",
            billable: true,
            grantedAt: "2026-06-28T12:01:00.000Z",
          },
        },
      },
      { configPath },
    );

    const chatSend = evaluateMcpToolPolicy("openrouter", "chat-send", { configPath });
    const summary = getMcpStatusSummary({ configPath });
    const report = getMcpProfileToolPolicyReport("openrouter", { configPath });
    assert.ok(report);

    assert.equal(chatSend.decision, "denied");
    assert.equal(chatSend.grantStatus, "stale");
    assert.match(chatSend.reason, /stale for the current profile hash/);
    assert.equal(summary.toolGrantCount, 1);
    assert.equal(summary.staleToolGrantCount, 1);
    assert.equal(report.toolGrantCount, 1);
    assert.equal(report.staleToolGrantCount, 1);
    assert.match(renderMcpProfileTools(report), /chat-send risk=billable auth=yes billable=yes grant=stale policy=denied/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("mcp tool grant revoke removes stored grant", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-policy-revoke-grant-"));
  const configPath = join(cwd, "mcp", "profiles.json");
  try {
    setMcpProfilePersistentState("openrouter", "enabled", { configPath });
    allowMcpToolGrant("openrouter", "chat-send", { configPath });

    const revoked = revokeMcpToolGrant("openrouter", "chat-send", { configPath });
    const missing = revokeMcpToolGrant("openrouter", "chat-send", { configPath });
    const chatSend = evaluateMcpToolPolicy("openrouter", "chat-send", { configPath });

    assert.equal(revoked.ok, true);
    assert.match(revoked.message, /revoked/);
    assert.equal(missing.ok, false);
    assert.match(missing.message, /No MCP tool grant stored/);
    assert.equal(getMcpToolGrantRecord(loadMcpProfilesConfig({ configPath }), "openrouter", "chat-send"), undefined);
    assert.equal(chatSend.decision, "denied");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("mcp model tool grants persist and gate read-only model exposure", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-model-policy-grant-"));
  const configPath = join(cwd, "mcp", "profiles.json");
  try {
    setMcpProfilePersistentState("openrouter", "enabled", { configPath });

    const missingGrant = evaluateMcpModelToolPolicy("openrouter", "models-list", { configPath });
    const grant = allowMcpModelToolGrant("openrouter", "models-list", {
      configPath,
      now: () => new Date("2026-06-28T13:00:00.000Z"),
    });
    const loaded = loadMcpProfilesConfig({ configPath });
    const storedGrant = getMcpModelToolGrantRecord(loaded, "openrouter", "models-list");
    const allowed = evaluateMcpModelToolPolicy("openrouter", "models-list", { configPath });
    const summary = getMcpStatusSummary({ configPath });
    const report = getMcpProfileToolPolicyReport("openrouter", { configPath });
    assert.ok(report);
    const rendered = renderMcpProfileTools(report);

    assert.equal(missingGrant.decision, "denied");
    assert.match(missingGrant.reason, /explicit model-tool grant/);
    assert.equal(grant.ok, true);
    assert.match(grant.message, /Model MCP tool grant stored/);
    assert.equal(storedGrant?.toolName, "models-list");
    assert.equal(storedGrant?.profileHash, hashMcpProfile(OPENROUTER_MCP_PROFILE));
    assert.equal(storedGrant?.risk, "read");
    assert.equal(storedGrant?.billable, false);
    assert.equal(storedGrant?.grantedAt, "2026-06-28T13:00:00.000Z");
    assert.equal(allowed.decision, "allowed");
    assert.equal(allowed.modelGrantStatus, "active");
    assert.match(allowed.reason, /explicit model MCP tool grant permits/);
    assert.equal(summary.modelToolGrantCount, 1);
    assert.equal(summary.staleModelToolGrantCount, 0);
    assert.equal(report.modelToolGrantCount, 1);
    assert.equal(report.staleModelToolGrantCount, 0);
    assert.match(rendered, /model_tool_grants: 1/);
    assert.match(rendered, /models-list risk=read auth=yes billable=no model_grant=active model_policy=allowed policy=allowed/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("mcp model tool grants reject billable tools and stale grants are denied", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-model-policy-stale-"));
  const configPath = join(cwd, "mcp", "profiles.json");
  try {
    setMcpProfilePersistentState("openrouter", "enabled", { configPath });
    allowMcpToolGrant("openrouter", "chat-send", { configPath });

    const billable = allowMcpModelToolGrant("openrouter", "chat-send", { configPath });
    assert.equal(billable.ok, false);
    assert.match(billable.message, /read-only non-billable/);

    saveMcpProfilesConfig(
      {
        version: 1,
        profiles: {
          openrouter: {
            id: "openrouter",
            state: "enabled",
            trustedProfileHash: hashMcpProfile(OPENROUTER_MCP_PROFILE),
            updatedAt: "2026-06-28T13:00:00.000Z",
          },
        },
        modelToolGrants: {
          "openrouter/models-list": {
            profileId: "openrouter",
            toolName: "models-list",
            profileHash: "sha256:3333333333333333333333333333333333333333333333333333333333333333",
            risk: "read",
            billable: false,
            grantedAt: "2026-06-28T13:01:00.000Z",
          },
        },
      },
      { configPath },
    );

    const stale = evaluateMcpModelToolPolicy("openrouter", "models-list", { configPath });
    const summary = getMcpStatusSummary({ configPath });
    const report = getMcpProfileToolPolicyReport("openrouter", { configPath });
    assert.ok(report);

    assert.equal(stale.decision, "denied");
    assert.equal(stale.modelGrantStatus, "stale");
    assert.match(stale.reason, /stale for the current profile hash/);
    assert.equal(summary.modelToolGrantCount, 1);
    assert.equal(summary.staleModelToolGrantCount, 1);
    assert.equal(report.modelToolGrantCount, 1);
    assert.equal(report.staleModelToolGrantCount, 1);
    assert.match(renderMcpProfileTools(report), /models-list risk=read auth=yes billable=no model_grant=stale model_policy=denied policy=allowed/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("mcp model tool grant revoke removes stored grant", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-model-policy-revoke-"));
  const configPath = join(cwd, "mcp", "profiles.json");
  try {
    setMcpProfilePersistentState("openrouter", "enabled", { configPath });
    allowMcpModelToolGrant("openrouter", "models-list", { configPath });

    const revoked = revokeMcpModelToolGrant("openrouter", "models-list", { configPath });
    const missing = revokeMcpModelToolGrant("openrouter", "models-list", { configPath });
    const modelPolicy = evaluateMcpModelToolPolicy("openrouter", "models-list", { configPath });

    assert.equal(revoked.ok, true);
    assert.match(revoked.message, /revoked/);
    assert.equal(missing.ok, false);
    assert.match(missing.message, /No model MCP tool grant stored/);
    assert.equal(getMcpModelToolGrantRecord(loadMcpProfilesConfig({ configPath }), "openrouter", "models-list"), undefined);
    assert.equal(modelPolicy.decision, "denied");
    assert.match(modelPolicy.reason, /explicit model-tool grant/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("mcp tool policy blocks pending schema changes before tool risk checks", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-policy-pending-"));
  const configPath = join(cwd, "mcp", "profiles.json");
  try {
    saveMcpProfilesConfig(
      {
        version: 1,
        profiles: {
          openrouter: {
            id: "openrouter",
            state: "enabled",
            trustedProfileHash: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
            updatedAt: "2026-06-26T12:00:00.000Z",
          },
        },
      },
      { configPath },
    );

    const readTool = evaluateMcpToolPolicy("openrouter", "models-list", { configPath });
    const chatSend = evaluateMcpToolPolicy("openrouter", "chat-send", { configPath });
    const report = getMcpProfileToolPolicyReport("openrouter", { configPath });

    assert.equal(readTool.decision, "blocked_by_schema_change");
    assert.equal(chatSend.decision, "blocked_by_schema_change");
    assert.equal(report?.schemaChangePending, true);
    assert.equal(
      report?.evaluations.every((candidate) => candidate.decision === "blocked_by_schema_change"),
      true,
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("mcp tool policy handles unknown profile and tool safely", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-policy-unknown-"));
  const configPath = join(cwd, "mcp", "profiles.json");
  try {
    assert.equal(evaluateMcpToolPolicy("missing", "models-list", { configPath }).decision, "unknown_profile");
    assert.equal(evaluateMcpToolPolicy("openrouter", "missing-tool", { configPath }).decision, "unknown_tool");
    assert.equal(getMcpProfileToolPolicyReport("missing", { configPath }), undefined);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("mcp tools renderer includes risk auth billable and policy decisions", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-policy-render-"));
  const configPath = join(cwd, "mcp", "profiles.json");
  try {
    setMcpProfilePersistentState("openrouter", "enabled", { configPath });
    const report = getMcpProfileToolPolicyReport("openrouter", { configPath });
    assert.ok(report);

    const rendered = renderMcpProfileTools(report);
    assert.match(rendered, /MCP tools: openrouter/);
    assert.match(
      rendered,
      /remote_tool_execution: explicit \/mcp call or orx mcp call; \/mcp model enable or orx ask --mcp-tools exposes read-only non-billable model-granted mcp_call only/,
    );
    assert.match(rendered, /decisions: allowed=12 denied=1/);
    assert.match(rendered, /models-list risk=read auth=yes billable=no policy=allowed/);
    assert.match(rendered, /chat-send risk=billable auth=yes billable=yes policy=denied/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("mcp config load fails closed on malformed JSON and tightens existing modes", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-malformed-config-"));
  const configDir = join(cwd, "mcp");
  const configPath = join(configDir, "profiles.json");
  try {
    mkdirSync(configDir, { recursive: true, mode: 0o777 });
    writeFileSync(configPath, "{not-json", { mode: 0o666 });
    chmodSync(configDir, 0o777);
    chmodSync(configPath, 0o666);

    const loaded = loadMcpProfilesConfig({ configPath });
    assert.deepEqual(loaded.profiles, {});
    assert.equal(statSync(configDir).mode & 0o777, 0o700);
    assert.equal(statSync(configPath).mode & 0o777, 0o600);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("mcp config save repairs existing loose permissions", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-save-mode-"));
  const configDir = join(cwd, "mcp");
  const configPath = join(configDir, "profiles.json");
  try {
    mkdirSync(configDir, { recursive: true, mode: 0o777 });
    writeFileSync(configPath, "{}\n", { mode: 0o666 });
    chmodSync(configDir, 0o777);
    chmodSync(configPath, 0o666);

    saveMcpProfilesConfig(emptyConfigWithOpenRouter(), { configPath });
    assert.equal(statSync(configDir).mode & 0o777, 0o700);
    assert.equal(statSync(configPath).mode & 0o777, 0o600);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("mcp config loader drops unrelated fields instead of preserving secrets", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-secret-config-"));
  const configPath = join(cwd, "profiles.json");
  try {
    writeFileSync(
      configPath,
      JSON.stringify({
        version: 1,
        apiKey: "sk-or-v1-secret",
        profiles: {
          openrouter: {
            id: "openrouter",
            state: "enabled",
            trustedProfileHash: hashMcpProfile(OPENROUTER_MCP_PROFILE),
            updatedAt: "2026-06-26T12:00:00.000Z",
            token: "secret",
          },
        },
        toolGrants: {
          bad: {
            profileId: "openrouter",
            toolName: "chat-send\nforged",
            profileHash: "not-a-hash",
            risk: "billable",
            billable: true,
            grantedAt: "2026-06-28T12:00:00.000Z",
            token: "secret",
          },
        },
        modelToolGrants: {
          bad: {
            profileId: "openrouter",
            toolName: "models-list",
            profileHash: "not-a-hash",
            risk: "read",
            billable: false,
            grantedAt: "2026-06-28T12:00:00.000Z",
            token: "secret",
          },
        },
      }),
    );

    const loaded = loadMcpProfilesConfig({ configPath });
    assert.deepEqual(Object.keys(loaded.profiles.openrouter).sort(), [
      "id",
      "state",
      "trustedProfileHash",
      "updatedAt",
    ]);
    assert.deepEqual(loaded.toolGrants, {});
    assert.deepEqual(loaded.modelToolGrants, {});
    assert.doesNotMatch(JSON.stringify(loaded), /sk-or-v1-secret|token|secret/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

function emptyConfigWithOpenRouter() {
  return {
    version: 1 as const,
    profiles: {
      openrouter: {
        id: "openrouter",
        state: "disabled" as const,
        updatedAt: "2026-06-26T12:00:00.000Z",
      },
    },
  };
}

test("mcp audit JSONL writes redacted event shape", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-audit-"));
  const auditLogPath = join(cwd, "audit", "mcp.jsonl");
  try {
    writeMcpAuditEvent(
      {
        type: "mcp.profile.inspect",
        profileId: "openrouter",
        ok: true,
        details: {
          authorization: "Bearer sk-or-v1-secret",
          message: "access_token=abcd1234 secret: abcdef",
          url: "https://example.test/?token=plain-token&safe=ok&api_key=abc123",
          nested: {
            apiKey: "sk-or-v1-nested",
          },
        },
      },
      {
        auditLogPath,
        now: () => new Date("2026-06-26T12:00:00.000Z"),
      },
    );

    const lines = readFileSync(auditLogPath, "utf8").trim().split("\n");
    assert.equal(lines.length, 1);
    const event = JSON.parse(lines[0]) as {
      timestamp: string;
      type: string;
      profileId: string;
      ok: boolean;
      details: Record<string, unknown>;
    };
    assert.equal(event.timestamp, "2026-06-26T12:00:00.000Z");
    assert.equal(event.type, "mcp.profile.inspect");
    assert.equal(event.profileId, "openrouter");
    assert.equal(event.ok, true);
    assert.equal(event.details.authorization, "[redacted]");
    assert.equal(event.details.message, "access_token=[redacted] secret: [redacted]");
    assert.equal(event.details.url, "https://example.test/?token=[redacted]&safe=ok&api_key=[redacted]");
    assert.deepEqual(event.details.nested, { apiKey: "[redacted]" });
    assert.doesNotMatch(
      JSON.stringify(event),
      /sk-or-v1-secret|plain-token|abc123|abcd1234|abcdef|sk-or-v1-nested/,
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("mcp redaction handles bearer strings and sensitive object keys", () => {
  assert.deepEqual(
    redactSecrets({
      message: "Authorization: Bearer sk-or-v1-test",
      assignment: "access_token=abcd1234 secret: abcdef token=toktok",
      password: "plain",
      credentialSource: "macos_keychain",
      nested: [{ token: "abc" }],
    }),
    {
      message: "Authorization: Bearer [redacted]",
      assignment: "access_token=[redacted] secret: [redacted] token=[redacted]",
      password: "[redacted]",
      credentialSource: "macos_keychain",
      nested: [{ token: "[redacted]" }],
    },
  );
});

test("mcp auth env file init writes a private commented template without overwriting existing files", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-auth-env-file-"));
  const authEnvDirectory = join(cwd, "mcp", "auth-env");
  try {
    const report = getMcpProfileAuthReport("openrouter", {
      env: { ORX_MCP_AUTH_ENV_DIR: authEnvDirectory },
      cwd,
    });
    assert.ok(report);

    const result = initializeMcpAuthEnvFile(report, {
      env: { ORX_MCP_AUTH_ENV_DIR: authEnvDirectory },
      cwd,
    });
    assert.equal(result.created, true);
    assert.equal(result.stateChanged, true);
    assert.equal(result.permissionsTightened, false);
    assert.equal(result.directoryPermissionsTightened, false);
    assert.equal(result.path, join(authEnvDirectory, "openrouter.env"));
    assert.equal(statSync(authEnvDirectory).mode & 0o777, 0o700);
    assert.equal(statSync(result.path).mode & 0o777, 0o600);
    const template = readFileSync(result.path, "utf8");
    assert.match(template, /# export ORX_MCP_BEARER_OPENROUTER="<bearer-token>"/);
    assert.match(template, /ORX does not read this file automatically/);
    assert.doesNotMatch(template, /^export ORX_MCP_BEARER_OPENROUTER/m);
    assert.doesNotMatch(template, /sk-or-v1|mcp-secret-token/);

    const rendered = renderMcpAuthEnvFileInitResult(result);
    assert.match(rendered, /MCP auth env file: openrouter/);
    assert.match(rendered, /credential_mode: env_file_template/);
    assert.match(rendered, /state_changed: yes/);
    assert.match(rendered, /shell_source:/);
    assert.doesNotMatch(rendered, /sk-or-v1|mcp-secret-token/);

    writeFileSync(result.path, "# user managed content\nexport ORX_MCP_BEARER_OPENROUTER=\"filled-value\"\n", {
      mode: 0o644,
    });
    chmodSync(result.path, 0o644);
    const again = initializeMcpAuthEnvFile(report, {
      env: { ORX_MCP_AUTH_ENV_DIR: authEnvDirectory },
      cwd,
    });
    assert.equal(again.created, false);
    assert.equal(again.existing, true);
    assert.equal(again.stateChanged, true);
    assert.equal(again.permissionsTightened, true);
    assert.equal(again.directoryPermissionsTightened, false);
    assert.match(readFileSync(result.path, "utf8"), /filled-value/);
    assert.equal(statSync(result.path).mode & 0o777, 0o600);

    chmodSync(authEnvDirectory, 0o755);
    const directoryOnly = initializeMcpAuthEnvFile(report, {
      env: { ORX_MCP_AUTH_ENV_DIR: authEnvDirectory },
      cwd,
    });
    assert.equal(directoryOnly.created, false);
    assert.equal(directoryOnly.existing, true);
    assert.equal(directoryOnly.stateChanged, true);
    assert.equal(directoryOnly.permissionsTightened, false);
    assert.equal(directoryOnly.directoryPermissionsTightened, true);
    assert.equal(statSync(authEnvDirectory).mode & 0o777, 0o700);
    assert.equal(statSync(result.path).mode & 0o777, 0o600);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("mcp auth renderers include provider-specific setup guidance without leaking bearer values", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-auth-provider-guidance-"));
  const profileCatalogPath = join(cwd, "mcp", "profile-catalog.json");
  const authEnvDirectory = join(cwd, "mcp", "auth-env");
  const env = {
    ORX_MCP_AUTH_ENV_DIR: authEnvDirectory,
    ORX_MCP_BEARER_OPENROUTER: "mcp-secret-token",
  };

  try {
    const openrouterReport = getMcpProfileAuthReport("openrouter", {
      cwd,
      env,
      profileCatalogPath,
    });
    assert.ok(openrouterReport);
    const openrouterStatus = renderMcpProfileAuthReport(openrouterReport);
    const openrouterSetup = renderMcpProfileAuthSetup(openrouterReport);

    assert.match(openrouterStatus, /provider_auth: openrouter/);
    assert.match(openrouterStatus, /credential_lifetime: provider default: 7 days for OAuth-created MCP keys/);
    assert.match(openrouterStatus, /setup_url: https:\/\/openrouter\.ai\/docs\/mcp-server/);
    assert.match(openrouterStatus, /oauth: provider-managed/);
    assert.match(openrouterSetup, /orx_support: paste the provider-issued key/);
    assert.doesNotMatch(openrouterStatus, /mcp-secret-token/);
    assert.doesNotMatch(openrouterSetup, /mcp-secret-token/);

    assert.equal(installMcpProviderPreset("github-readonly", { profileCatalogPath }).ok, true);
    const githubReport = getMcpProfileAuthReport("user:github-readonly", {
      cwd,
      env,
      profileCatalogPath,
    });
    assert.ok(githubReport);
    const githubSetup = renderMcpProfileAuthSetup(githubReport);

    assert.match(githubSetup, /provider_auth: github/);
    assert.match(githubSetup, /setup_url: https:\/\/docs\.github\.com\/en\/copilot\/how-tos\/provide-context\/use-mcp-in-your-ide\/set-up-the-github-mcp-server/);
    assert.match(githubSetup, /scope_hint: approve only read-only repository scopes/);

    assert.equal(installMcpProviderPreset("github-write", { profileCatalogPath }).ok, true);
    const githubWriteReport = getMcpProfileAuthReport("user:github-write", {
      cwd,
      env,
      profileCatalogPath,
    });
    assert.ok(githubWriteReport);
    const githubWriteSetup = renderMcpProfileAuthSetup(githubWriteReport);

    assert.match(githubWriteSetup, /provider_auth: github/);
    assert.match(githubWriteSetup, /setup_url: https:\/\/docs\.github\.com\/en\/copilot\/how-tos\/provide-context\/use-mcp-in-your-ide\/set-up-the-github-mcp-server/);
    assert.match(githubWriteSetup, /scope_hint: high-risk\/write-capable: approve only the repositories/);
    assert.match(githubWriteSetup, /provider_warning: this profile is write-capable/);
    assert.match(githubWriteSetup, /network_calls: none/);
    assert.doesNotMatch(githubWriteSetup, /mcp-secret-token/);

    assert.equal(installMcpProviderPreset("sourcegraph-github-readonly", { profileCatalogPath }).ok, true);
    const sourcegraphReport = getMcpProfileAuthReport("user:sourcegraph-github-readonly", {
      cwd,
      env,
      profileCatalogPath,
    });
    assert.ok(sourcegraphReport);
    const sourcegraphSetup = renderMcpProfileAuthSetup(sourcegraphReport);

    assert.match(sourcegraphSetup, /provider_auth: sourcegraph/);
    assert.match(sourcegraphSetup, /setup_url: https:\/\/sourcegraph\.com\/mcp/);
    assert.match(sourcegraphSetup, /scope_hint: grant Sourcegraph\/GitHub read-only repository access only/);
    assert.match(sourcegraphSetup, /network_calls: none/);
    assert.doesNotMatch(sourcegraphSetup, /mcp-secret-token/);

    assert.equal(installMcpProviderPreset("gitlab-readonly", { profileCatalogPath }).ok, true);
    const gitlabReport = getMcpProfileAuthReport("user:gitlab-readonly", {
      cwd,
      env,
      profileCatalogPath,
    });
    assert.ok(gitlabReport);
    const gitlabSetup = renderMcpProfileAuthSetup(gitlabReport);

    assert.match(gitlabSetup, /provider_auth: gitlab/);
    assert.match(gitlabSetup, /setup_url: https:\/\/docs\.gitlab\.com\/user\/gitlab_duo\/model_context_protocol\/mcp_server\//);
    assert.match(gitlabSetup, /scope_hint: approve read-only repository\/project scopes only/);
    assert.match(gitlabSetup, /provider_warning: GitLab documents the MCP server as beta/);
    assert.match(gitlabSetup, /network_calls: none/);
    assert.doesNotMatch(gitlabSetup, /mcp-secret-token/);

    assert.equal(installMcpProviderPreset("figma", { profileCatalogPath }).ok, true);
    const figmaReport = getMcpProfileAuthReport("user:figma", {
      cwd,
      env,
      profileCatalogPath,
    });
    assert.ok(figmaReport);
    const figmaSetup = renderMcpProfileAuthSetup(figmaReport);

    assert.match(figmaSetup, /provider_auth: figma/);
    assert.match(figmaSetup, /provider_warning: Figma documents a supported client catalog/);

    assert.equal(installMcpProviderPreset("context7", { profileCatalogPath }).ok, true);
    const context7Report = getMcpProfileAuthReport("user:context7", {
      cwd,
      env,
      profileCatalogPath,
    });
    assert.ok(context7Report);
    const context7Status = renderMcpProfileAuthReport(context7Report);

    assert.match(context7Status, /auth_status: not_required/);
    assert.match(context7Status, /credential_mode: not_required/);
    assert.match(context7Status, /effective_bearer: not_required/);
    assert.match(context7Status, /macos_keychain: supported=(yes|no) opt_in=disabled status=not_required/);
    assert.match(context7Status, /provider_auth: context7/);
    assert.match(context7Status, /setup_url: https:\/\/context7\.com\/docs/);
    assert.match(context7Status, /next_step: no bearer token required by current local declarations/);

    assert.equal(
      upsertUserMcpRemoteProfile(
        "openrouter-spoof",
        {
          name: "OpenRouter-looking profile",
          url: "https://openrouter.ai.evil.test/mcp",
          authRequired: true,
        },
        { profileCatalogPath },
      ).ok,
      true,
    );
    assert.equal(
      upsertUserMcpRemoteProfile(
        "github-spoof",
        {
          name: "GitHub-looking profile",
          url: "https://evil.example/mcp",
          authRequired: true,
        },
        { profileCatalogPath },
      ).ok,
      true,
    );
    assert.equal(
      upsertUserMcpRemoteProfile(
        "gitlab-spoof",
        {
          name: "GitLab-looking profile",
          url: "https://gitlab.com.evil.test/api/v4/mcp",
          authRequired: true,
        },
        { profileCatalogPath },
      ).ok,
      true,
    );
    assert.equal(
      upsertUserMcpRemoteProfile(
        "gitlab-subpath",
        {
          name: "GitLab subpath profile",
          url: "https://gitlab.com/api/v4/mcp/extra",
          authRequired: true,
        },
        { profileCatalogPath },
      ).ok,
      true,
    );
    assert.equal(
      upsertUserMcpRemoteProfile(
        "cloudflare-spoof",
        {
          name: "Cloudflare-looking profile",
          url: "https://mcp.cloudflare.com.evil.test/mcp",
          authRequired: true,
        },
        { profileCatalogPath },
      ).ok,
      true,
    );

    for (const spoofProfileId of [
      "user:openrouter-spoof",
      "user:github-spoof",
      "user:gitlab-spoof",
      "user:gitlab-subpath",
      "user:cloudflare-spoof",
    ]) {
      const spoofReport = getMcpProfileAuthReport(spoofProfileId, {
        cwd,
        env,
        profileCatalogPath,
      });
      assert.ok(spoofReport);
      const spoofStatus = renderMcpProfileAuthReport(spoofReport);
      assert.match(spoofStatus, /provider_auth: generic/);
      assert.doesNotMatch(spoofStatus, /provider_auth: openrouter/);
      assert.doesNotMatch(spoofStatus, /provider_auth: github/);
      assert.doesNotMatch(spoofStatus, /provider_auth: gitlab/);
      assert.doesNotMatch(spoofStatus, /provider_auth: cloudflare/);
      assert.doesNotMatch(spoofStatus, /setup_url: https:\/\/openrouter\.ai\/docs\/mcp-server/);
      assert.doesNotMatch(spoofStatus, /setup_url: https:\/\/docs\.github\.com/);
      assert.doesNotMatch(spoofStatus, /setup_url: https:\/\/docs\.gitlab\.com/);
      assert.doesNotMatch(spoofStatus, /setup_url: https:\/\/github\.com\/cloudflare\/mcp/);
    }
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("mcp auth env file init refuses symlink parent paths", () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-auth-env-file-symlink-"));
  try {
    const targetDirectory = join(cwd, "target");
    const linkDirectory = join(cwd, "link");
    mkdirSync(targetDirectory, { recursive: true });
    symlinkSync(targetDirectory, linkDirectory, "dir");

    const report = getMcpProfileAuthReport("openrouter", {
      env: { ORX_MCP_AUTH_ENV_DIR: join(linkDirectory, "auth-env") },
      cwd,
    });
    assert.ok(report);
    assert.throws(
      () =>
        initializeMcpAuthEnvFile(report, {
          env: { ORX_MCP_AUTH_ENV_DIR: join(linkDirectory, "auth-env") },
          cwd,
        }),
      /parent path must not contain symlinks/,
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("mcp macos keychain helpers require opt-in and never render token values", async () => {
  const calls: Array<{ args: string[]; stdio: string }> = [];
  const runner: McpMacosKeychainCommandRunner = async (args, options) => {
    calls.push({ args, stdio: options.stdio });
    if (args[0] === "find-generic-password" && args.includes("-w")) {
      return { code: 0, stdout: "keychain-secret-token\n", stderr: "" };
    }
    if (args[0] === "find-generic-password") {
      return { code: 0, stdout: "keychain item metadata\n", stderr: "" };
    }
    if (args[0] === "add-generic-password") {
      return { code: 0, stdout: "", stderr: "" };
    }
    if (args[0] === "delete-generic-password") {
      return { code: 0, stdout: "", stderr: "" };
    }
    return { code: 1, stdout: "", stderr: "unexpected" };
  };

  const envPreferred = await resolveMcpBearerCredential("openrouter", {
    env: {
      ORX_MCP_BEARER_OPENROUTER: "env-secret-token",
      ORX_MCP_KEYCHAIN: "1",
    },
    platform: "darwin",
    runner,
  });
  assert.equal(envPreferred.source, "profile_env");
  assert.equal(envPreferred.token, "env-secret-token");
  assert.equal(envPreferred.keychainAttempted, false);
  assert.equal(calls.length, 0);

  const disabled = await resolveMcpBearerCredential("openrouter", {
    env: {},
    platform: "darwin",
    runner,
  });
  assert.equal(disabled.source, "none");
  assert.equal(disabled.keychainAttempted, false);
  assert.equal(disabled.keychainStatus, "disabled");

  const resolved = await resolveMcpBearerCredential("openrouter", {
    env: { ORX_MCP_KEYCHAIN: "1" },
    platform: "darwin",
    runner,
  });
  assert.equal(resolved.source, "macos_keychain");
  assert.equal(resolved.token, "keychain-secret-token");
  assert.equal(resolved.keychainAttempted, true);
  assert.equal(resolved.keychainStatus, "configured");
  assert.deepEqual(calls[0], {
    args: ["find-generic-password", "-w", "-a", "openrouter", "-s", "orx.mcp.bearer"],
    stdio: "capture",
  });

  const status = await getMcpMacosKeychainStatus("openrouter", {
    platform: "darwin",
    runner,
  });
  assert.equal(status.ok, true);
  assert.equal(status.status, "configured");
  assert.equal(status.tokenConfigured, true);
  assert.doesNotMatch(renderMcpMacosKeychainResult(status), /keychain-secret-token|env-secret-token/);

  const set = await setMcpMacosKeychainBearerPrompt("openrouter", {
    platform: "darwin",
    runner,
  });
  assert.equal(set.ok, true);
  assert.equal(set.status, "configured");
  assert.equal(calls.at(-1)?.stdio, "inherit");
  const setArgs = calls.at(-1)?.args ?? [];
  assert.equal(setArgs.at(-3), "-T");
  assert.equal(setArgs.at(-2), "");
  assert.equal(setArgs.at(-1), "-w");
  assert.doesNotMatch(renderMcpMacosKeychainResult(set), /keychain-secret-token|env-secret-token/);
  assert.match(renderMcpMacosKeychainResult(set), /ORX_MCP_KEYCHAIN=1/);

  const deleted = await deleteMcpMacosKeychainBearer("openrouter", {
    platform: "darwin",
    runner,
  });
  assert.equal(deleted.ok, true);
  assert.equal(deleted.status, "missing");
  assert.equal(deleted.stateChanged, true);

  const unsupported = await getMcpMacosKeychainStatus("openrouter", {
    platform: "linux",
    runner,
  });
  assert.equal(unsupported.ok, false);
  assert.equal(unsupported.status, "unsupported");
  assert.match(renderMcpMacosKeychainResult(unsupported), /only available on darwin/);
});

test("mcp discovery does not fetch disabled profiles", async () => {
  let fetchCalls = 0;
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-discovery-disabled-"));
  const configPath = join(cwd, "mcp", "profiles.json");
  try {
    const result = await discoverMcpProfile("openrouter", {
      configPath,
      fetch: async () => {
        fetchCalls += 1;
        throw new Error("fetch should not be called");
      },
    });

    assert.equal(fetchCalls, 0);
    assert.equal(result.status, "disabled");
    assert.equal(result.networkAttempted, false);
    assert.match(formatMcpDiscoveryResult(result), /Enable and trust it with \/mcp enable openrouter/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("mcp discovery does not fetch enabled profiles without trusted hash baseline", async () => {
  let fetchCalls = 0;
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-discovery-untrusted-"));
  const configPath = join(cwd, "mcp", "profiles.json");
  try {
    saveMcpProfilesConfig(
      {
        version: 1,
        profiles: {
          openrouter: {
            id: "openrouter",
            state: "enabled",
            updatedAt: "2026-06-26T12:00:00.000Z",
          },
        },
      },
      { configPath },
    );

    const result = await discoverMcpProfile("openrouter", {
      configPath,
      fetch: async () => {
        fetchCalls += 1;
        throw new Error("fetch should not be called");
      },
    });

    assert.equal(fetchCalls, 0);
    assert.equal(result.status, "untrusted");
    assert.equal(result.networkAttempted, false);
    assert.match(result.message, /no trusted profile hash baseline/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("mcp discovery does not fetch profiles with pending schema changes", async () => {
  let fetchCalls = 0;
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-discovery-pending-"));
  const configPath = join(cwd, "mcp", "profiles.json");
  try {
    saveMcpProfilesConfig(
      {
        version: 1,
        profiles: {
          openrouter: {
            id: "openrouter",
            state: "enabled",
            trustedProfileHash: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
            updatedAt: "2026-06-26T12:00:00.000Z",
          },
        },
      },
      { configPath },
    );

    const result = await discoverMcpProfile("openrouter", {
      configPath,
      fetch: async () => {
        fetchCalls += 1;
        throw new Error("fetch should not be called");
      },
    });

    assert.equal(fetchCalls, 0);
    assert.equal(result.status, "schema_change_pending");
    assert.equal(result.schemaChangePending, true);
    assert.equal(result.networkAttempted, false);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("mcp discovery calls provided fetch for enabled trusted remote-http profile", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-discovery-ok-"));
  const configPath = join(cwd, "mcp", "profiles.json");
  const seenRequests: Array<{ url: string; method?: string; accept?: string | null; body?: string }> =
    [];
  try {
    setMcpProfilePersistentState("openrouter", "enabled", {
      configPath,
      now: () => new Date("2026-06-26T12:00:00.000Z"),
    });

    const result = await discoverMcpProfile("openrouter", {
      configPath,
      fetch: async (input, init) => {
        seenRequests.push({
          url: String(input),
          method: init?.method,
          accept:
            init?.headers instanceof Headers
              ? init.headers.get("accept")
              : ((init?.headers as Record<string, string> | undefined)?.Accept ?? null),
          body: String(init?.body),
        });
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: "orx-discovery-1",
            result: {
              protocolVersion: "2025-03-26",
              capabilities: {
                tools: {},
                resources: {},
              },
              serverInfo: {
                name: "openrouter",
                version: "test",
              },
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      },
    });

    assert.equal(seenRequests.length, 1);
    assert.equal(seenRequests[0].url, "https://mcp.openrouter.ai/mcp");
    assert.equal(seenRequests[0].method, "POST");
    assert.equal(seenRequests[0].accept, "application/json");
    assert.match(seenRequests[0].body ?? "", /"method":"initialize"/);
    assert.equal(result.status, "ok");
    assert.equal(result.networkAttempted, true);
    assert.equal(result.serverInfo?.name, "openrouter");
    assert.deepEqual(result.capabilityKeys, ["resources", "tools"]);
    assert.match(
      formatMcpDiscoveryResult(result),
      /tool_execution: explicit \/mcp call or orx mcp call; \/mcp model enable or orx ask --mcp-tools exposes read-only non-billable model-granted mcp_call only/,
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("mcp discovery rejects malformed JSON-RPC initialize responses", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-discovery-invalid-"));
  const configPath = join(cwd, "mcp", "profiles.json");
  try {
    setMcpProfilePersistentState("openrouter", "enabled", { configPath });

    const result = await discoverMcpProfile("openrouter", {
      configPath,
      fetch: async () =>
        new Response(JSON.stringify({ result: { protocolVersion: "2025-03-26" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    });

    assert.equal(result.status, "invalid_response");
    assert.equal(result.networkAttempted, true);
    assert.match(result.message, /invalid JSON-RPC initialize response/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("mcp discovery bounds remote-controlled initialize fields", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-discovery-bounds-"));
  const configPath = join(cwd, "mcp", "profiles.json");
  const long = "x".repeat(500);
  try {
    setMcpProfilePersistentState("openrouter", "enabled", { configPath });

    const result = await discoverMcpProfile("openrouter", {
      configPath,
      fetch: async () =>
        new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: "orx-discovery-1",
            result: {
              protocolVersion: long,
              capabilities: Object.fromEntries(
                Array.from({ length: 25 }, (_, index) => [`cap-${index}-${long}`, {}]),
              ),
              serverInfo: {
                name: `openrouter-${long}`,
                version: long,
              },
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
    });

    assert.equal(result.status, "ok");
    assert.ok((result.serverInfo?.name?.length ?? 0) <= 160);
    assert.ok((result.serverInfo?.version?.length ?? 0) <= 160);
    assert.ok((result.protocolVersion?.length ?? 0) <= 160);
    assert.ok((result.capabilityKeys?.length ?? 0) <= 20);
    assert.ok(result.capabilityKeys?.every((key) => key.length <= 160));
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("mcp discovery treats 401 and 403 as auth-required without leaking response body", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-discovery-auth-"));
  const configPath = join(cwd, "mcp", "profiles.json");
  try {
    setMcpProfilePersistentState("openrouter", "enabled", { configPath });

    const result = await discoverMcpProfile("openrouter", {
      configPath,
      fetch: async () => new Response("Bearer sk-or-v1-secret", { status: 401 }),
    });
    const formatted = formatMcpDiscoveryResult(result);

    assert.equal(result.status, "auth_required");
    assert.equal(result.httpStatus, 401);
    assert.equal(result.networkAttempted, true);
    assert.doesNotMatch(JSON.stringify(result), /sk-or-v1-secret/);
    assert.doesNotMatch(formatted, /sk-or-v1-secret/);
    assert.match(formatted, /OAuth or a dedicated expiring MCP key/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("mcp discovery sanitizes network errors", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-discovery-network-error-"));
  const configPath = join(cwd, "mcp", "profiles.json");
  try {
    setMcpProfilePersistentState("openrouter", "enabled", { configPath });

    const result = await discoverMcpProfile("openrouter", {
      configPath,
      fetch: async () => {
        throw new Error("failed with Authorization: Bearer sk-or-v1-secret");
      },
    });

    assert.equal(result.status, "network_error");
    assert.equal(result.networkAttempted, true);
    assert.match(result.error ?? "", /\[redacted\]/);
    assert.ok((result.error?.length ?? 0) <= 500);
    assert.doesNotMatch(formatMcpDiscoveryResult(result), /sk-or-v1-secret/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("mcp discovery bounds long thrown network errors", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "orx-mcp-discovery-long-network-error-"));
  const configPath = join(cwd, "mcp", "profiles.json");
  try {
    setMcpProfilePersistentState("openrouter", "enabled", { configPath });

    const result = await discoverMcpProfile("openrouter", {
      configPath,
      fetch: async () => {
        throw new Error("x".repeat(2_000));
      },
    });

    assert.equal(result.status, "network_error");
    assert.ok((result.error?.length ?? 0) <= 500);
    assert.ok(formatMcpDiscoveryResult(result).length < 1_500);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

function writePluginWithMcpProfile(
  cwd: string,
  url = "https://mcp.context7.example/mcp",
): string {
  const pluginDirectory = join(cwd, "plugin");
  const manifestPath = join(pluginDirectory, "orx-plugin.json");
  mkdirSync(pluginDirectory, { recursive: true });
  writeFileSync(
    join(pluginDirectory, "mcp.json"),
    JSON.stringify({
      servers: {
        context7: {
          name: "Context7 docs",
          transport: {
            kind: "remote-http",
            url,
          },
          authRequired: false,
          tools: [
            {
              name: "resolve-library-id",
              risk: "read",
              authRequired: false,
              billable: false,
            },
            {
              name: "write-doc-cache",
              risk: "write",
              authRequired: false,
              billable: false,
            },
          ],
          notes: "Docs lookup profile declared by a local plugin.",
        },
      },
    }),
  );
  writeFileSync(
    manifestPath,
    JSON.stringify({
      schemaVersion: "1",
      name: "mcp-plugin",
      version: "1.0.0",
      description: "Declares an MCP profile.",
      publisher: "acme",
      source: {
        type: "local",
        path: ".",
      },
      components: {
        mcpServers: "./mcp.json",
      },
      permissions: {
        filesystem: [],
        network: ["mcp.context7.example"],
        env: [],
        mcp: ["context7"],
      },
    }),
  );
  return manifestPath;
}

function writeUserMcpProfileCatalog(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    JSON.stringify({
      version: 1,
      profiles: {
        context7: {
          name: "Context7 docs",
          transport: {
            kind: "remote-http",
            url: "https://mcp.context7.example/mcp",
          },
          authRequired: false,
          tools: [
            {
              name: "resolve-library-id",
              risk: "read",
              authRequired: false,
              billable: false,
            },
            {
              name: "write-doc-cache",
              risk: "write",
              authRequired: false,
              billable: false,
            },
          ],
          notes: "Docs lookup profile declared by the local user catalog.",
        },
      },
    }),
  );
}
