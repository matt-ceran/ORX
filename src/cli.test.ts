import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { runCli } from "./cli.js";
import { allowMcpModelToolGrant, setMcpProfilePersistentState } from "./mcp/index.js";
import {
  discoverEnabledPluginHooks,
  registerPluginManifest,
  setPluginEnabledState,
  trustPluginHook,
} from "./plugins/index.js";
import { saveCurrentProfile } from "./profiles/index.js";

const encoder = new TextEncoder();

test("help, version, and status work without an API key", async () => {
  for (const helpArg of ["help", "--help", "-h"]) {
    const help = createIo();
    assert.equal(await runCli(["node", "cli", helpArg], {}, help.io), 0);
    assert.match(help.stdout(), /Commands:/);
    assert.match(help.stdout(), /\(no command\)  Start an interactive OpenRouter chat session/);
    assert.match(help.stdout(), /mcp\s+List, inspect, enable, disable, and grant MCP tool policy/);
    assert.match(help.stdout(), /plugins\s+List catalog entries, command aliases, inspect, install, enable, or disable plugins/);
    assert.match(help.stdout(), /bins\s+List, inspect, trust, untrust, or run plugin bins/);
    assert.match(help.stdout(), /hooks\s+List, inspect, trust, untrust, or run plugin hook definitions/);
    assert.match(help.stdout(), /tests\s+Discover or run native test targets/);
    assert.doesNotMatch(help.stdout(), /ORX chat/);
    assert.equal(help.stderr(), "");
  }

  const version = createIo();
  assert.equal(await runCli(["node", "cli", "--version"], {}, version.io), 0);
  assert.match(version.stdout(), /\d+\.\d+\.\d+/);

  const cwd = createTempDir();
  try {
    const status = createIo();
    assert.equal(
      await runCli(
        ["node", "cli", "status"],
        {
          ORX_MCP_CONFIG_PATH: join(cwd, "mcp", "profiles.json"),
          ORX_PLUGIN_BINS_CONFIG_PATH: join(cwd, "plugins", "bins.json"),
          ORX_PLUGIN_HOOKS_CONFIG_PATH: join(cwd, "plugins", "hooks.json"),
          ORX_PROFILE_CONFIG_PATH: join(cwd, "profiles.json"),
        },
        status.io,
      ),
      0,
    );
    assert.match(status.stdout(), /api_key_present: no/);
    assert.match(status.stdout(), /mcp_active_profiles: none/);
    assert.match(status.stdout(), /mcp_billable_tools: 0/);
    assert.match(status.stdout(), /mcp_policy_allowed_tools: 0/);
    assert.match(status.stdout(), /mcp_policy_denied_tools: 0/);
    assert.match(status.stdout(), /mcp_configured_denied_tools: 1/);
    assert.match(status.stdout(), /mcp_configured_billable_tools: 1/);
    assert.match(status.stdout(), /mcp_configured_risky_tools: 1/);
    assert.match(status.stdout(), /mcp_tool_grants: 0/);
    assert.match(status.stdout(), /mcp_model_tool_grants: 0/);
    assert.match(status.stdout(), /mcp_stale_tool_grants: 0/);
    assert.match(status.stdout(), /mcp_registry_hash: sha256:[a-f0-9]{64}/);
    assert.match(status.stdout(), /mcp_pending_schema_changes: none/);
    assert.match(status.stdout(), /mcp_profile: profile=openrouter state=disabled/);
    assert.match(status.stdout(), /hash=sha256:[a-f0-9]{64}/);
    assert.match(status.stdout(), /plugin_installed_count: 0/);
    assert.match(status.stdout(), /plugin_enabled_count: 0/);
    assert.match(status.stdout(), /plugin_command_aliases: 0/);
    assert.match(status.stdout(), /plugin_prompt_aliases: 0/);
    assert.match(status.stdout(), /plugin_bin_aliases: 0/);
    assert.match(status.stdout(), /plugin_trusted_bin_aliases: 0/);
    assert.match(status.stdout(), /plugin_bin_runtime: explicit_trusted_operator_run/);
    assert.match(status.stdout(), /plugin_bin_definitions: 0/);
    assert.match(status.stdout(), /plugin_trusted_bins: 0/);
    assert.match(status.stdout(), /plugin_pending_bin_trust: 0/);
    assert.match(status.stdout(), /plugin_enabled_hooks: 0/);
    assert.match(status.stdout(), /plugin_hook_definitions: 0/);
    assert.match(status.stdout(), /plugin_trusted_hooks: 0/);
    assert.match(status.stdout(), /plugin_pending_hook_trust: 0/);
    assert.match(status.stdout(), /plugin_enabled_bins: 0/);
    assert.match(status.stdout(), /plugin_enabled_mcp: 0/);
    assert.match(status.stdout(), /plugin_enabled_skills: 0/);
    assert.match(status.stdout(), /test_targets: 0/);
    assert.match(status.stdout(), /test_default_target: none/);
    assert.match(status.stdout(), /active_profile: none/);
    assert.match(status.stdout(), /profile_count: 0/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("cli tests commands list and run package scripts without an API key", async () => {
  const cwd = createTempDir();
  try {
    writeFileSync(
      join(cwd, "package.json"),
      JSON.stringify({
        scripts: {
          test: "node ./cli-test.mjs",
          "test:unit": "node ./cli-test.mjs unit",
        },
      }),
    );
    writeFileSync(
      join(cwd, "cli-test.mjs"),
      "console.log(`cli-test ${process.argv.slice(2).join(',')}`);\n",
    );

    const listed = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "tests", "list"], {}, listed.io), 0);
    assert.match(listed.stdout(), /Test Targets/);
    assert.match(listed.stdout(), /id=script:test/);
    assert.match(listed.stdout(), /id=script:test:unit/);
    assert.equal(listed.stderr(), "");

    const ran = createIo({ cwd });
    assert.equal(
      await runCli(["node", "cli", "tests", "run", "script:test:unit", "--", "--flag"], {}, ran.io),
      0,
    );
    assert.match(ran.stdout(), /Test run: script:test:unit/);
    assert.match(ran.stdout(), /status: ok/);
    assert.match(ran.stdout(), /cli-test unit,--flag/);
    assert.equal(ran.stderr(), "");

    const unknown = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "tests", "unknown"], {}, unknown.io), 1);
    assert.match(unknown.stderr(), /Usage: orx tests/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("cli profile commands manage saved config profiles without an API key", async () => {
  const cwd = createTempDir();
  const profileConfigPath = join(cwd, "profiles.json");

  try {
    const save = createIo({ cwd });
    assert.equal(
      await runCli(
        ["node", "cli", "profile", "save", "daily"],
        {
          ORX_PROFILE_CONFIG_PATH: profileConfigPath,
        },
        save.io,
      ),
      0,
    );
    assert.match(save.stdout(), /Profile daily saved/);
    assert.doesNotMatch(readFileSync(profileConfigPath, "utf8"), /OPENROUTER/);

    const list = createIo({ cwd });
    assert.equal(
      await runCli(
        ["node", "cli", "profile"],
        {
          ORX_PROFILE_CONFIG_PATH: profileConfigPath,
        },
        list.io,
      ),
      0,
    );
    assert.match(list.stdout(), /saved_profiles: 1/);
    assert.match(list.stdout(), /daily mode=auto model=openrouter\/auto/);

    const inspect = createIo({ cwd });
    assert.equal(
      await runCli(
        ["node", "cli", "profile", "inspect", "daily"],
        {
          ORX_PROFILE_CONFIG_PATH: profileConfigPath,
        },
        inspect.io,
      ),
      0,
    );
    assert.match(inspect.stdout(), /ORX profile: daily/);
    assert.match(inspect.stdout(), /api_key: not stored/);

    const deleted = createIo({ cwd });
    assert.equal(
      await runCli(
        ["node", "cli", "profile", "delete", "daily"],
        {
          ORX_PROFILE_CONFIG_PATH: profileConfigPath,
        },
        deleted.io,
      ),
      0,
    );
    assert.match(deleted.stdout(), /Profile daily deleted/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("cli --profile applies saved profiles to status", async () => {
  const cwd = createTempDir();
  const profileConfigPath = join(cwd, "profiles.json");

  try {
    saveCurrentProfile(
      "fusion-vivid",
      {
        mode: "fusion",
        model: "openrouter/fusion",
        fusionPreset: "general-budget",
        theme: "vivid",
        permissions: {
          approvalPolicy: "never",
          sandboxMode: "danger-full-access",
        },
      },
      { configPath: profileConfigPath },
    );

    const status = createIo({ cwd });
    assert.equal(
      await runCli(
        ["node", "cli", "--profile", "fusion-vivid", "status"],
        {
          ORX_PROFILE_CONFIG_PATH: profileConfigPath,
          ORX_MCP_CONFIG_PATH: join(cwd, "mcp", "profiles.json"),
        },
        status.io,
      ),
      0,
    );
    assert.match(status.stdout(), /mode: fusion/);
    assert.match(status.stdout(), /model: openrouter\/fusion/);
    assert.match(status.stdout(), /fusion_preset: general-budget/);
    assert.match(status.stdout(), /theme: vivid/);
    assert.match(status.stdout(), /active_profile: fusion-vivid/);
    assert.match(status.stdout(), /profile_count: 1/);

    const missing = createIo({ cwd });
    assert.equal(
      await runCli(
        ["node", "cli", "--profile", "missing", "status"],
        {
          ORX_PROFILE_CONFIG_PATH: profileConfigPath,
        },
        missing.io,
      ),
      1,
    );
    assert.match(missing.stderr(), /Unknown profile: missing/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("cli status reflects persisted MCP profile config", async () => {
  const cwd = createTempDir();
  const mcpConfigPath = join(cwd, "mcp", "profiles.json");
  try {
    setMcpProfilePersistentState("openrouter", "enabled", { configPath: mcpConfigPath });

    const status = createIo();
    assert.equal(
      await runCli(["node", "cli", "status"], { ORX_MCP_CONFIG_PATH: mcpConfigPath }, status.io),
      0,
    );
    assert.match(status.stdout(), /mcp_active_profiles: openrouter/);
    assert.match(status.stdout(), /mcp_billable_tools: 1/);
    assert.match(status.stdout(), /mcp_policy_allowed_tools: 12/);
    assert.match(status.stdout(), /mcp_policy_denied_tools: 1/);
    assert.match(status.stdout(), /mcp_tool_grants: 0/);
    assert.match(status.stdout(), /mcp_model_tool_grants: 0/);
    assert.match(status.stdout(), /mcp_profile: profile=openrouter state=enabled/);
    assert.match(status.stdout(), /trusted_hash=sha256:[a-f0-9]{64}/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("cli mcp commands manage local profile and tool grant policy without an API key", async () => {
  const cwd = createTempDir();
  const mcpConfigPath = join(cwd, "mcp", "profiles.json");
  const auditLogPath = join(cwd, "audit", "mcp.jsonl");
  const env = {
    ORX_MCP_CONFIG_PATH: mcpConfigPath,
    ORX_MCP_AUDIT_PATH: auditLogPath,
  };

  try {
    const list = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "mcp"], env, list.io), 0);
    assert.match(list.stdout(), /active_profiles: none/);
    assert.match(list.stdout(), /tool_grants: 0/);

    const blocked = createIo({ cwd });
    assert.equal(
      await runCli(["node", "cli", "mcp", "allow-tool", "openrouter", "chat-send"], env, blocked.io),
      1,
    );
    assert.match(blocked.stderr(), /Cannot grant MCP tool openrouter\/chat-send: profile is disabled/);

    const blockedModel = createIo({ cwd });
    assert.equal(
      await runCli(
        ["node", "cli", "mcp", "allow-model-tool", "openrouter", "models-list"],
        env,
        blockedModel.io,
      ),
      1,
    );
    assert.match(blockedModel.stderr(), /Cannot grant model MCP tool openrouter\/models-list: profile is disabled/);

    const enabled = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "mcp", "enable", "openrouter"], env, enabled.io), 0);
    assert.match(enabled.stdout(), /MCP profile openrouter enabled/);

    const modelAllowed = createIo({ cwd });
    assert.equal(
      await runCli(
        ["node", "cli", "mcp", "allow-model-tool", "openrouter", "models-list"],
        env,
        modelAllowed.io,
      ),
      0,
    );
    assert.match(modelAllowed.stdout(), /Model MCP tool grant stored for openrouter\/models-list/);
    assert.match(readFileSync(mcpConfigPath, "utf8"), /"modelToolGrants"/);

    const allowed = createIo({ cwd });
    assert.equal(
      await runCli(["node", "cli", "mcp", "allow-tool", "openrouter", "chat-send"], env, allowed.io),
      0,
    );
    assert.match(allowed.stdout(), /MCP tool grant stored for openrouter\/chat-send/);
    assert.match(readFileSync(mcpConfigPath, "utf8"), /"toolName": "chat-send"/);

    const inspected = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "mcp", "inspect", "openrouter"], env, inspected.io), 0);
    assert.match(inspected.stdout(), /tool_grants: 1/);
    assert.match(inspected.stdout(), /model_tool_grants: 1/);
    assert.match(inspected.stdout(), /models-list risk=read auth=yes billable=no model_grant=active model_policy=allowed policy=allowed/);
    assert.match(inspected.stdout(), /chat-send risk=billable auth=yes billable=yes grant=active policy=allowed/);

    const tools = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "mcp", "tools", "openrouter"], env, tools.io), 0);
    assert.match(tools.stdout(), /tool_grants: 1/);
    assert.match(tools.stdout(), /model_tool_grants: 1/);
    assert.match(tools.stdout(), /chat-send risk=billable auth=yes billable=yes grant=active policy=allowed/);

    const stored = JSON.parse(readFileSync(mcpConfigPath, "utf8")) as {
      toolGrants: Record<string, { profileHash: string }>;
      modelToolGrants: Record<string, { profileHash: string }>;
    };
    stored.toolGrants["openrouter/chat-send"].profileHash =
      "sha256:1111111111111111111111111111111111111111111111111111111111111111";
    stored.modelToolGrants["openrouter/models-list"].profileHash =
      "sha256:2222222222222222222222222222222222222222222222222222222222222222";
    writeFileSync(mcpConfigPath, `${JSON.stringify(stored, null, 2)}\n`);

    const staleInspect = createIo({ cwd });
    assert.equal(
      await runCli(["node", "cli", "mcp", "inspect", "openrouter"], env, staleInspect.io),
      0,
    );
    assert.match(staleInspect.stdout(), /stale_tool_grants: 1/);
    assert.match(staleInspect.stdout(), /stale_model_tool_grants: 1/);
    assert.match(staleInspect.stdout(), /models-list risk=read auth=yes billable=no model_grant=stale model_policy=denied policy=allowed/);
    assert.match(staleInspect.stdout(), /chat-send risk=billable auth=yes billable=yes grant=stale policy=denied/);

    const modelRevoked = createIo({ cwd });
    assert.equal(
      await runCli(
        ["node", "cli", "mcp", "revoke-model-tool", "openrouter", "models-list"],
        env,
        modelRevoked.io,
      ),
      0,
    );
    assert.match(modelRevoked.stdout(), /Model MCP tool grant revoked for openrouter\/models-list/);

    const revoked = createIo({ cwd });
    assert.equal(
      await runCli(["node", "cli", "mcp", "revoke-tool", "openrouter", "chat-send"], env, revoked.io),
      0,
    );
    assert.match(revoked.stdout(), /MCP tool grant revoked for openrouter\/chat-send/);

    const status = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "status"], env, status.io), 0);
    assert.match(status.stdout(), /mcp_policy_allowed_tools: 12/);
    assert.match(status.stdout(), /mcp_policy_denied_tools: 1/);
    assert.match(status.stdout(), /mcp_tool_grants: 0/);
    assert.match(status.stdout(), /mcp_model_tool_grants: 0/);

    const audit = readFileSync(auditLogPath, "utf8");
    assert.match(audit, /"type":"mcp.tool.allow_attempt"/);
    assert.match(audit, /"type":"mcp.tool.revoke_attempt"/);
    assert.match(audit, /"type":"mcp.model_tool.allow_attempt"/);
    assert.match(audit, /"type":"mcp.model_tool.revoke_attempt"/);
    assert.doesNotMatch(audit, /sk-or-v1/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("cli mcp call executes allowed remote tools through dedicated auth and transport", async () => {
  let generalFetchCalls = 0;
  const seenRequests: Array<{ authorization: string | null; body: string }> = [];
  const cwd = createTempDir();
  const mcpConfigPath = join(cwd, "mcp", "profiles.json");
  const auditLogPath = join(cwd, "audit", "mcp.jsonl");
  const env = {
    ORX_MCP_CONFIG_PATH: mcpConfigPath,
    ORX_MCP_AUDIT_PATH: auditLogPath,
    ORX_MCP_BEARER_OPENROUTER: "mcp-secret-token",
  };

  try {
    const blocked = createIo({
      cwd,
      fetch: async () => {
        generalFetchCalls += 1;
        throw new Error("general fetch should not be used");
      },
      mcpCallFetch: async () => {
        throw new Error("MCP call fetch should not run before enablement");
      },
    });
    assert.equal(
      await runCli(["node", "cli", "mcp", "call", "openrouter", "models-list", "{}"], env, blocked.io),
      1,
    );
    assert.match(blocked.stderr(), /profile openrouter is disabled/);

    const enabled = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "mcp", "enable", "openrouter"], env, enabled.io), 0);

    const called = createIo({
      cwd,
      fetch: async () => {
        generalFetchCalls += 1;
        throw new Error("general fetch should not be used");
      },
      mcpCallFetch: async (_input, init) => {
        const headers = new Headers(init?.headers as HeadersInit);
        seenRequests.push({
          authorization: headers.get("authorization"),
          body: String(init?.body),
        });
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: "orx-tools-call-1",
            result: {
              content: [{ type: "text", text: "ok access_token=abcd1234" }],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    });
    assert.equal(
      await runCli(
        ["node", "cli", "mcp", "call", "openrouter", "models-list", '{"query":"claude"}'],
        env,
        called.io,
      ),
      0,
    );

    assert.equal(generalFetchCalls, 0);
    assert.equal(seenRequests.length, 1);
    assert.equal(seenRequests[0].authorization, "Bearer mcp-secret-token");
    assert.match(seenRequests[0].body, /"method":"tools\/call"/);
    assert.match(seenRequests[0].body, /"query":"claude"/);
    assert.match(called.stdout(), /MCP tool call: openrouter\/models-list/);
    assert.match(called.stdout(), /status: ok/);
    assert.match(called.stdout(), /access_token=\[redacted\]/);
    assert.doesNotMatch(called.stdout(), /abcd1234|mcp-secret-token/);

    const audit = readFileSync(auditLogPath, "utf8");
    assert.match(audit, /"type":"mcp.tool.call_attempt"/);
    assert.match(audit, /"resultHash":"sha256:[a-f0-9]{64}"/);
    assert.doesNotMatch(audit, /abcd1234|mcp-secret-token/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("cli status reflects plugin registry override without enabling executable surfaces", async () => {
  const cwd = createTempDir();
  const registryPath = join(cwd, "plugins", "registry.json");
  const manifestPath = join(cwd, "manifest.json");
  mkdirSync(join(cwd, "skills"), { recursive: true });
  writeFileSync(
    join(cwd, "skills", "SKILL.md"),
    ["---", "name: Status Skill", "description: Status skill metadata.", "---", ""].join("\n"),
  );
  writeFileSync(
    manifestPath,
    JSON.stringify({
      schemaVersion: "1",
      name: "demo-plugin",
      version: "1.0.0",
      description: "Demo plugin.",
      publisher: "acme",
      source: {
        type: "local",
        path: ".",
      },
      components: {
        skills: "./skills",
        hooks: "./hooks/hooks.json",
        bins: "./bin",
        mcpServers: "./mcp.json",
      },
      permissions: {
        filesystem: [],
        network: [],
        env: [],
        mcp: [],
      },
    }),
  );

  try {
    registerPluginManifest(manifestPath, { registryPath });
    setPluginEnabledState("acme.demo-plugin@1.0.0", true, { registryPath });

    const status = createIo();
    assert.equal(
      await runCli(
        ["node", "cli", "status"],
        {
          ORX_MCP_CONFIG_PATH: join(cwd, "mcp", "profiles.json"),
          ORX_PLUGIN_REGISTRY_PATH: registryPath,
        },
        status.io,
      ),
      0,
    );

    assert.match(status.stdout(), /plugin_installed_count: 1/);
    assert.match(status.stdout(), /plugin_enabled_count: 1/);
    assert.match(status.stdout(), /plugin_enabled_hooks: 0/);
    assert.match(status.stdout(), /plugin_enabled_bins: 0/);
    assert.match(status.stdout(), /plugin_enabled_mcp: 0/);
    assert.match(status.stdout(), /plugin_enabled_skills: 1/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("cli plugins install list inspect enable and disable without an API key", async () => {
  const cwd = createTempDir();
  const registryPath = join(cwd, "plugins", "registry.json");
  const manifestPath = join(cwd, "plugin", "orx-plugin.json");
  let fetchCalls = 0;
  mkdirSync(join(cwd, "plugin", "skills"), { recursive: true });
  writeFileSync(join(cwd, "plugin", "skills", "SKILL.md"), "# Demo skill\n");
  writeFileSync(
    manifestPath,
    JSON.stringify({
      schemaVersion: "1",
      name: "cli-plugin",
      version: "1.0.0",
      description: "CLI plugin.",
      publisher: "acme",
      source: {
        type: "local",
        path: ".",
      },
      components: {
        skills: "./skills",
        hooks: "./hooks/hooks.json",
        bins: "./bin",
        mcpServers: "./mcp.json",
      },
      permissions: {
        filesystem: [],
        network: [],
        env: [],
        mcp: [],
      },
    }),
  );
  const env = { ORX_PLUGIN_REGISTRY_PATH: registryPath };
  const createNoFetchIo = () =>
    createIo({
      cwd,
      fetch: async () => {
        fetchCalls += 1;
        throw new Error("plugin CLI commands should not call fetch");
      },
    });

  try {
    const installed = createNoFetchIo();
    assert.equal(
      await runCli(["node", "cli", "plugins", "install", manifestPath], env, installed.io),
      0,
    );
    assert.match(installed.stdout(), /Plugin acme\.cli-plugin@1\.0\.0 registered disabled/);
    assert.match(installed.stdout(), /No hooks, bins, MCP servers, or plugin code are active/);

    const listed = createNoFetchIo();
    assert.equal(await runCli(["node", "cli", "plugins", "list"], env, listed.io), 0);
    assert.match(listed.stdout(), /installed: 1/);
    assert.match(listed.stdout(), /enabled: 0/);
    assert.match(listed.stdout(), /plugin=acme\.cli-plugin@1\.0\.0 enabled=no/);

    const inspected = createNoFetchIo();
    assert.equal(
      await runCli(
        ["node", "cli", "plugins", "inspect", "acme.cli-plugin@1.0.0"],
        env,
        inspected.io,
      ),
      0,
    );
    assert.match(inspected.stdout(), /Plugin: acme\.cli-plugin@1\.0\.0/);
    assert.match(inspected.stdout(), /executable_surfaces: hooks=hash_trust_required bins=hash_trust_required mcp=gated commands=inactive/);
    assert.match(inspected.stdout(), /plugin_code_execution: trusted current hooks run manually\/on lifecycle; trusted bins run only by explicit operator command/);

    const enabled = createNoFetchIo();
    assert.equal(
      await runCli(
        ["node", "cli", "plugins", "enable", "acme.cli-plugin@1.0.0"],
        env,
        enabled.io,
      ),
      0,
    );
    assert.match(enabled.stdout(), /Plugin acme\.cli-plugin@1\.0\.0 enabled/);
    assert.match(enabled.stdout(), /hooks and bins require separate hash trust, and MCP\/commands remain gated/);

    const disabled = createNoFetchIo();
    assert.equal(
      await runCli(
        ["node", "cli", "plugins", "disable", "acme.cli-plugin@1.0.0"],
        env,
        disabled.io,
      ),
      0,
    );
    assert.match(disabled.stdout(), /Plugin acme\.cli-plugin@1\.0\.0 disabled/);

    const missing = createNoFetchIo();
    assert.equal(
      await runCli(["node", "cli", "plugins", "inspect", "missing"], env, missing.io),
      1,
    );
    assert.match(missing.stderr(), /Unknown plugin: missing/);

    const unsafeMissing = createNoFetchIo();
    assert.equal(
      await runCli(["node", "cli", "plugins", "inspect", "bad\u001b[31m"], env, unsafeMissing.io),
      1,
    );
    assert.doesNotMatch(unsafeMissing.stderr(), /\u001b/);
    assert.match(unsafeMissing.stderr(), /Unknown plugin: \[invalid plugin id\]/);
    assert.equal(fetchCalls, 0);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("cli hooks list inspect trust run and untrust without an API key or fetch", async () => {
  const cwd = createTempDir();
  const registryPath = join(cwd, "plugins", "registry.json");
  const hooksConfigPath = join(cwd, "hooks", "trust.json");
  const hooksAuditLogPath = join(cwd, "audit", "hooks.jsonl");
  const manifestPath = join(cwd, "plugin", "orx-plugin.json");
  const hookCommand = `${JSON.stringify(process.execPath)} -e ${JSON.stringify(
    "console.log('cli=' + process.env.CI)",
  )}`;
  let fetchCalls = 0;
  mkdirSync(join(cwd, "plugin"), { recursive: true });
  writeFileSync(
    join(cwd, "plugin", "hooks.json"),
    JSON.stringify({
      hooks: {
        format: {
          event: "post_tool_use",
          command: hookCommand,
          env: ["CI"],
          timeoutMs: 5000,
        },
      },
    }),
  );
  writeFileSync(
    manifestPath,
    JSON.stringify({
      schemaVersion: "1",
      name: "hook-cli-plugin",
      version: "1.0.0",
      description: "CLI hook plugin.",
      publisher: "acme",
      source: {
        type: "local",
        path: ".",
      },
      components: {
        hooks: "./hooks.json",
      },
      permissions: {
        filesystem: [],
        network: [],
        env: ["CI"],
        mcp: [],
      },
    }),
  );
  const env = {
    CI: "cli-ci",
    ORX_PLUGIN_HOOKS_AUDIT_PATH: hooksAuditLogPath,
    ORX_PLUGIN_HOOKS_CONFIG_PATH: hooksConfigPath,
    ORX_PLUGIN_REGISTRY_PATH: registryPath,
  };
  const createNoFetchIo = () =>
    createIo({
      cwd,
      fetch: async () => {
        fetchCalls += 1;
        throw new Error("hook CLI commands should not call fetch");
      },
    });
  const hookId = "plugin:acme.hook-cli-plugin@1.0.0:format";

  try {
    const installed = createNoFetchIo();
    assert.equal(
      await runCli(["node", "cli", "plugins", "install", manifestPath], env, installed.io),
      0,
    );
    const enabled = createNoFetchIo();
    assert.equal(
      await runCli(
        ["node", "cli", "plugins", "enable", "acme.hook-cli-plugin@1.0.0"],
        env,
        enabled.io,
      ),
      0,
    );

    const listed = createNoFetchIo();
    assert.equal(await runCli(["node", "cli", "hooks", "list"], env, listed.io), 0);
    assert.match(listed.stdout(), /discovered_hooks: 1/);
    assert.match(listed.stdout(), /trusted=no/);
    assert.match(listed.stdout(), /execution=trust-required/);

    const inspected = createNoFetchIo();
    assert.equal(await runCli(["node", "cli", "hooks", "inspect", hookId], env, inspected.io), 0);
    assert.match(inspected.stdout(), /Hook: plugin:acme\.hook-cli-plugin@1\.0\.0:format/);
    assert.match(inspected.stdout(), /command: .*cli=/);
    assert.match(inspected.stdout(), /execution: manual_and_lifecycle/);

    const blocked = createNoFetchIo();
    assert.equal(await runCli(["node", "cli", "hooks", "run", hookId], env, blocked.io), 1);
    assert.match(blocked.stderr(), /status: untrusted/);
    assert.doesNotMatch(blocked.stderr(), /cli=cli-ci/);

    const trusted = createNoFetchIo();
    assert.equal(await runCli(["node", "cli", "hooks", "trust", hookId], env, trusted.io), 0);
    assert.match(trusted.stdout(), /trusted at sha256:[a-f0-9]{64}/);
    assert.match(readFileSync(hooksConfigPath, "utf8"), /plugin:acme\.hook-cli-plugin@1\.0\.0:format/);

    const ran = createNoFetchIo();
    assert.equal(await runCli(["node", "cli", "hooks", "run", hookId], env, ran.io), 0);
    assert.match(ran.stdout(), /Hook run: plugin:acme\.hook-cli-plugin@1\.0\.0:format/);
    assert.match(ran.stdout(), /status: ok/);
    assert.match(ran.stdout(), /stdout: "cli=\[redacted-env:CI\]\\n"/);
    assert.match(readFileSync(hooksAuditLogPath, "utf8"), /"type":"plugin.hook.run"/);

    const pluginList = createNoFetchIo();
    assert.equal(await runCli(["node", "cli", "plugins", "list"], env, pluginList.io), 0);
    assert.match(pluginList.stdout(), /enabled_hooks: 1/);

    const status = createNoFetchIo();
    assert.equal(await runCli(["node", "cli", "status"], env, status.io), 0);
    assert.match(status.stdout(), /plugin_hook_definitions: 1/);
    assert.match(status.stdout(), /plugin_trusted_hooks: 1/);
    assert.match(status.stdout(), /plugin_hook_runtime: manual_and_lifecycle/);
    assert.match(status.stdout(), /plugin_enabled_hooks: 1/);

    const untrusted = createNoFetchIo();
    assert.equal(await runCli(["node", "cli", "hooks", "untrust", hookId], env, untrusted.io), 0);
    assert.match(untrusted.stdout(), /trust removed/);
    assert.equal(fetchCalls, 0);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("cli bins list inspect trust run and untrust without an API key or fetch", async () => {
  const cwd = createTempDir();
  const registryPath = join(cwd, "plugins", "registry.json");
  const binsConfigPath = join(cwd, "bins", "trust.json");
  const binsAuditLogPath = join(cwd, "audit", "bins.jsonl");
  const manifestPath = join(cwd, "plugin", "orx-plugin.json");
  let fetchCalls = 0;
  mkdirSync(join(cwd, "plugin", "bin"), { recursive: true });
  writeFileSync(
    join(cwd, "plugin", "bin", "hello"),
    "printf 'cli-bin=%s\\n' \"$1\"\nprintf 'secret=%s\\n' \"$PLUGIN_TOKEN\" >&2\n",
  );
  writeFileSync(
    manifestPath,
    JSON.stringify({
      schemaVersion: "1",
      name: "bin-cli-plugin",
      version: "1.0.0",
      description: "CLI bin plugin.",
      publisher: "acme",
      source: {
        type: "local",
        path: ".",
      },
      components: {
        bins: "./bin",
      },
      permissions: {
        filesystem: [],
        network: [],
        env: ["PLUGIN_TOKEN"],
        mcp: [],
      },
    }),
  );
  const env = {
    ORX_PLUGIN_BINS_AUDIT_PATH: binsAuditLogPath,
    ORX_PLUGIN_BINS_CONFIG_PATH: binsConfigPath,
    ORX_PLUGIN_REGISTRY_PATH: registryPath,
    PLUGIN_TOKEN: "cli-bin-secret-12345",
  };
  const createNoFetchIo = () =>
    createIo({
      cwd,
      fetch: async () => {
        fetchCalls += 1;
        throw new Error("bin CLI commands should not call fetch");
      },
    });
  const binId = "plugin:acme.bin-cli-plugin@1.0.0:bin:hello";

  try {
    const installed = createNoFetchIo();
    assert.equal(
      await runCli(["node", "cli", "plugins", "install", manifestPath], env, installed.io),
      0,
    );
    const enabled = createNoFetchIo();
    assert.equal(
      await runCli(
        ["node", "cli", "plugins", "enable", "acme.bin-cli-plugin@1.0.0"],
        env,
        enabled.io,
      ),
      0,
    );
    assert.match(enabled.stdout(), /hooks and bins require separate hash trust/);

    const listed = createNoFetchIo();
    assert.equal(await runCli(["node", "cli", "bins", "list"], env, listed.io), 0);
    assert.match(listed.stdout(), /discovered_bins: 1/);
    assert.match(listed.stdout(), /trusted=no/);
    assert.match(listed.stdout(), /execution=trust-required/);

    const inspected = createNoFetchIo();
    assert.equal(await runCli(["node", "cli", "bins", "inspect", binId], env, inspected.io), 0);
    assert.match(inspected.stdout(), /Bin: plugin:acme\.bin-cli-plugin@1\.0\.0:bin:hello/);
    assert.match(inspected.stdout(), /runner: sh/);
    assert.match(inspected.stdout(), /execution: explicit trusted operator run only/);

    const blocked = createNoFetchIo();
    assert.equal(await runCli(["node", "cli", "bins", "run", binId, "world"], env, blocked.io), 1);
    assert.match(blocked.stderr(), /status: untrusted/);
    assert.doesNotMatch(blocked.stderr(), /cli-bin=world/);

    const trusted = createNoFetchIo();
    assert.equal(await runCli(["node", "cli", "bins", "trust", binId], env, trusted.io), 0);
    assert.match(trusted.stdout(), /trusted at sha256:[a-f0-9]{64}/);
    assert.match(readFileSync(binsConfigPath, "utf8"), /plugin:acme\.bin-cli-plugin@1\.0\.0:bin:hello/);

    const ran = createNoFetchIo();
    assert.equal(await runCli(["node", "cli", "bins", "run", binId, "world"], env, ran.io), 0);
    assert.match(ran.stdout(), /Bin run: plugin:acme\.bin-cli-plugin@1\.0\.0:bin:hello/);
    assert.match(ran.stdout(), /status: ok/);
    assert.match(ran.stdout(), /arg_count: 1/);
    assert.match(ran.stdout(), /stdout: "cli-bin=world\\n"/);
    assert.match(ran.stdout(), /stderr: "secret=\[redacted-env:PLUGIN_TOKEN\]\\n"/);
    assert.match(readFileSync(binsAuditLogPath, "utf8"), /"type":"plugin.bin.run"/);
    assert.doesNotMatch(readFileSync(binsAuditLogPath, "utf8"), /cli-bin-secret-12345/);

    const pluginCommands = createNoFetchIo();
    assert.equal(await runCli(["node", "cli", "plugins", "commands"], env, pluginCommands.io), 0);
    assert.match(pluginCommands.stdout(), /Plugin Commands/);
    assert.match(pluginCommands.stdout(), /aliases: 1/);
    assert.match(pluginCommands.stdout(), /alias=\/plugin:acme\.bin-cli-plugin@1\.0\.0:bin:hello/);
    assert.match(pluginCommands.stdout(), /state=trusted/);

    const pluginList = createNoFetchIo();
    assert.equal(await runCli(["node", "cli", "plugins", "list"], env, pluginList.io), 0);
    assert.match(pluginList.stdout(), /enabled_bins: 1/);

    const status = createNoFetchIo();
    assert.equal(await runCli(["node", "cli", "status"], env, status.io), 0);
    assert.match(status.stdout(), /plugin_bin_definitions: 1/);
    assert.match(status.stdout(), /plugin_trusted_bins: 1/);
    assert.match(status.stdout(), /plugin_bin_runtime: explicit_trusted_operator_run/);
    assert.match(status.stdout(), /plugin_enabled_bins: 1/);
    assert.match(status.stdout(), /plugin_command_aliases: 1/);
    assert.match(status.stdout(), /plugin_bin_aliases: 1/);
    assert.match(status.stdout(), /plugin_trusted_bin_aliases: 1/);

    const untrusted = createNoFetchIo();
    assert.equal(await runCli(["node", "cli", "bins", "untrust", binId], env, untrusted.io), 0);
    assert.match(untrusted.stdout(), /trust removed/);
    assert.equal(fetchCalls, 0);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("cli plugins catalog lists and installs local catalog entries without fetch", async () => {
  const cwd = createTempDir();
  const registryPath = join(cwd, "plugins", "registry.json");
  const catalogPath = join(cwd, "catalog", "plugins.json");
  const manifestPath = join(cwd, "plugin", "orx-plugin.json");
  let fetchCalls = 0;
  mkdirSync(join(cwd, "catalog"), { recursive: true });
  mkdirSync(join(cwd, "plugin", "skills"), { recursive: true });
  writeFileSync(join(cwd, "plugin", "skills", "SKILL.md"), "# Catalog skill\n");
  writeFileSync(
    manifestPath,
    JSON.stringify({
      schemaVersion: "1",
      name: "catalog-plugin",
      version: "1.0.0",
      description: "Catalog plugin.",
      publisher: "acme",
      source: {
        type: "local",
        path: ".",
      },
      components: {
        skills: "./skills",
      },
      permissions: {
        filesystem: [],
        network: [],
        env: [],
        mcp: [],
      },
    }),
  );
  writeFileSync(
    catalogPath,
    JSON.stringify({
      version: 1,
      entries: [
        {
          id: "acme.catalog-plugin@1.0.0",
          description: "Install from catalog.",
          manifestPath: "../plugin/orx-plugin.json",
          tags: ["demo"],
        },
      ],
    }),
  );
  const env = {
    ORX_PLUGIN_REGISTRY_PATH: registryPath,
    ORX_PLUGIN_CATALOG_PATH: catalogPath,
  };
  const createNoFetchIo = () =>
    createIo({
      cwd,
      fetch: async () => {
        fetchCalls += 1;
        throw new Error("plugin catalog commands should not call fetch");
      },
    });

  try {
    const catalog = createNoFetchIo();
    assert.equal(await runCli(["node", "cli", "plugins", "catalog"], env, catalog.io), 0);
    assert.match(catalog.stdout(), /Plugin Catalog/);
    assert.match(catalog.stdout(), /entries: 1/);
    assert.match(catalog.stdout(), /id=acme\.catalog-plugin@1\.0\.0/);

    const installed = createNoFetchIo();
    assert.equal(
      await runCli(
        ["node", "cli", "plugins", "install", "acme.catalog-plugin@1.0.0"],
        env,
        installed.io,
      ),
      0,
    );
    assert.match(installed.stdout(), /Catalog entry acme\.catalog-plugin@1\.0\.0 resolved to/);
    assert.match(installed.stdout(), /Plugin acme\.catalog-plugin@1\.0\.0 registered disabled/);
    assert.match(readFileSync(registryPath, "utf8"), /acme\.catalog-plugin@1\.0\.0/);
    assert.equal(fetchCalls, 0);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("ask and chat require an OpenRouter API key", async () => {
  const capture = createIo();
  const exitCode = await runCli(["node", "cli", "ask", "Say hello"], {}, capture.io);

  assert.equal(exitCode, 1);
  assert.match(capture.stderr(), /OpenRouter API key not found/);

  const chat = createIo({
    stdin: Readable.from(["/exit\n"]),
  });
  const chatExitCode = await runCli(["node", "cli", "chat"], {}, chat.io);

  assert.equal(chatExitCode, 1);
  assert.match(chat.stderr(), /OpenRouter API key not found/);

  const noArg = createIo({
    stdin: Readable.from(["/exit\n"]),
  });
  const noArgExitCode = await runCli(["node", "cli"], {}, noArg.io);

  assert.equal(noArgExitCode, 1);
  assert.match(noArg.stderr(), /OpenRouter API key not found/);
  assert.doesNotMatch(noArg.stdout(), /Commands:/);
});

test("no-arg cli starts chat in the current working directory", async () => {
  const cwd = createTempDir();
  const sessionDirectory = createTempDir();

  try {
    const capture = createIo({
      cwd,
      stdin: Readable.from(["/status\n", "/exit\n"]),
      fetch: async () => {
        throw new Error("no-arg chat launch should not fetch without a prompt");
      },
    });

    const exitCode = await runCli(
      ["node", "cli"],
      {
        OPENROUTER_API_KEY: "test-key",
        ORX_SESSION_DIR: sessionDirectory,
        ORX_MCP_CONFIG_PATH: join(sessionDirectory, "mcp", "profiles.json"),
      },
      capture.io,
    );

    assert.equal(exitCode, 0);
    assert.match(capture.stdout(), /ORX chat/);
    assert.match(capture.stdout(), new RegExp(`cwd: ${escapeRegExp(cwd)}`));
    assert.match(capture.stdout(), /Exiting ORX chat/);
    assert.equal(capture.stderr(), "");

    const sessionFiles = readdirSync(sessionDirectory).filter((file) => file.endsWith(".json"));
    assert.equal(sessionFiles.length, 1);
    const session = JSON.parse(readFileSync(join(sessionDirectory, sessionFiles[0]), "utf8")) as {
      cwd: string;
    };
    assert.equal(session.cwd, cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
    rmSync(sessionDirectory, { recursive: true, force: true });
  }
});

test("ask streams text and prints compact metadata summary", async () => {
  const capture = createIo({
    fetch: async (input, init) => {
      assert.equal(String(input), "https://openrouter.ai/api/v1/chat/completions");
      assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer test-key");

      const body = JSON.parse(String(init?.body));
      assert.equal(body.model, "anthropic/claude-sonnet-4.5");
      assert.equal(body.stream, true);
      assert.deepEqual(body.messages, [{ role: "user", content: "Say hello" }]);
      assert.equal(body.plugins, undefined);
      assertNativeTools(body.tools);

      return new Response(
        streamFrom([
          'data: {"model":"anthropic/claude-sonnet-4.5","choices":[{"delta":{"content":"Hello"}}]}\n\n',
          'data: {"usage":{"prompt_tokens":2,"completion_tokens":1,"total_tokens":3,"cost":0.0001},"choices":[]}\n\n',
          "data: [DONE]\n\n",
        ]),
        {
          status: 200,
        },
      );
    },
  });

  const exitCode = await runCli(
    ["node", "cli", "ask", "Say", "hello", "--model", "anthropic/claude-sonnet-4.5"],
    {
      OPENROUTER_API_KEY: "test-key",
    },
    capture.io,
  );

  assert.equal(exitCode, 0);
  assert.match(capture.stdout(), /^Hello\nmetadata:/);
  assert.match(capture.stdout(), /requested_model: anthropic\/claude-sonnet-4\.5/);
  assert.match(capture.stdout(), /resolved_model: anthropic\/claude-sonnet-4\.5/);
  assert.match(capture.stdout(), /tokens: prompt=2, completion=1, total=3/);
  assert.match(capture.stdout(), /cost: \$0\.000100/);
  assert.equal(capture.stderr(), "");
});

test("ask --mcp-tools exposes read-only MCP calls through dedicated transport", async () => {
  const cwd = createTempDir();
  const mcpConfigPath = join(cwd, "mcp", "profiles.json");
  const auditLogPath = join(cwd, "audit", "mcp.jsonl");
  const seenMcpRequests: Array<{ authorization: string | null; body: string }> = [];
  let chatRequestCount = 0;

  try {
    setMcpProfilePersistentState("openrouter", "enabled", { configPath: mcpConfigPath });
    const modelGrant = allowMcpModelToolGrant("openrouter", "models-list", {
      configPath: mcpConfigPath,
    });
    assert.equal(modelGrant.ok, true);
    const capture = createIo({
      cwd,
      fetch: async (_input, init) => {
        const body = JSON.parse(String(init?.body));
        chatRequestCount += 1;

        if (chatRequestCount === 1) {
          assert.ok(
            body.tools.some((tool: { function: { name: string } }) => tool.function.name === "mcp_call"),
          );
          return new Response(
            streamFrom([
              sse({
                choices: [
                  {
                    delta: {
                      tool_calls: [
                        {
                          index: 0,
                          id: "call_mcp",
                          type: "function",
                          function: {
                            name: "mcp_call",
                            arguments: JSON.stringify({
                              profile: "openrouter",
                              tool: "models-list",
                              arguments: { query: "claude" },
                            }),
                          },
                        },
                      ],
                    },
                    finish_reason: "tool_calls",
                  },
                ],
              }),
              "data: [DONE]\n\n",
            ]),
            { status: 200 },
          );
        }

        assert.equal(body.messages.at(-1).role, "tool");
        assert.equal(body.messages.at(-1).tool_call_id, "call_mcp");
        const envelope = JSON.parse(String(body.messages.at(-1).content));
        assert.equal(envelope.tool, "mcp_call");
        assert.doesNotMatch(envelope.output, /remote-secret|mcp-secret-token/);
        assert.match(envelope.output, /returned_to_model_as_untrusted_tool_result/);
        return new Response(
          streamFrom([
            sse({
              choices: [
                {
                  delta: {
                    content: "Used MCP.",
                  },
                },
              ],
            }),
            "data: [DONE]\n\n",
          ]),
          { status: 200 },
        );
      },
      mcpCallFetch: async (_input, init) => {
        const headers = new Headers(init?.headers as HeadersInit);
        seenMcpRequests.push({
          authorization: headers.get("authorization"),
          body: String(init?.body),
        });
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: "orx-tools-call-1",
            result: {
              content: [{ type: "text", text: "ok token=remote-secret" }],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    });

    const exitCode = await runCli(
      ["node", "cli", "ask", "Use MCP", "--mcp-tools"],
      {
        OPENROUTER_API_KEY: "test-key",
        ORX_MCP_AUDIT_PATH: auditLogPath,
        ORX_MCP_BEARER_OPENROUTER: "mcp-secret-token",
        ORX_MCP_CONFIG_PATH: mcpConfigPath,
      },
      capture.io,
    );

    assert.equal(exitCode, 0);
    assert.equal(chatRequestCount, 2);
    assert.equal(seenMcpRequests.length, 1);
    assert.equal(seenMcpRequests[0].authorization, "Bearer mcp-secret-token");
    assert.match(seenMcpRequests[0].body, /"method":"tools\/call"/);
    assert.match(stripAnsi(capture.stdout()), /\[tool\] mcp_call profile="openrouter" tool="models-list" arguments=<object>/);
    assert.match(stripAnsi(capture.stdout()), /\[tool\] mcp_call ok duration=\d+ms status=ok policy=allowed network=attempted result_hash=sha256:[a-f0-9]{64}/);
    assert.match(capture.stdout(), /Used MCP\./);
    assert.doesNotMatch(capture.stdout(), /remote-secret|mcp-secret-token/);

    const audit = readFileSync(auditLogPath, "utf8");
    assert.match(audit, /"source":"model_loop"/);
    assert.match(audit, /"status":"ok"/);
    assert.doesNotMatch(audit, /remote-secret|mcp-secret-token|claude/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("ask prepends enabled plugin skill metadata without full SKILL content", async () => {
  const cwd = createTempDir();
  const registryPath = join(cwd, "plugins", "registry.json");
  const manifestPath = join(cwd, "plugin", "orx-plugin.json");
  mkdirSync(join(cwd, "plugin", "skills"), { recursive: true });
  writeFileSync(
    join(cwd, "plugin", "skills", "SKILL.md"),
    [
      "---",
      "name: Ask Skill",
      "description: Ask skill metadata.",
      "---",
      "# Ask Skill",
      "FULL ASK SKILL BODY",
      "",
    ].join("\n"),
  );
  writeFileSync(
    manifestPath,
    JSON.stringify({
      schemaVersion: "1",
      name: "ask-plugin",
      version: "1.0.0",
      description: "Ask plugin.",
      publisher: "acme",
      source: {
        type: "local",
        path: ".",
      },
      components: {
        skills: "./skills",
      },
      permissions: {
        filesystem: [],
        network: [],
        env: [],
        mcp: [],
      },
    }),
  );

  try {
    registerPluginManifest(manifestPath, { registryPath });
    setPluginEnabledState("acme.ask-plugin@1.0.0", true, { registryPath });

    const capture = createIo({
      cwd,
      fetch: async (_input, init) => {
        const body = JSON.parse(String(init?.body));
        assert.equal(body.messages[0].role, "system");
        assert.match(body.messages[0].content, /ORX enabled plugin skills \(compact metadata only\)/);
        assert.match(body.messages[0].content, /plugin:acme\.ask-plugin@1\.0\.0:ask-skill/);
        assert.match(body.messages[0].content, /description=Ask skill metadata\./);
        assert.doesNotMatch(body.messages[0].content, /FULL ASK SKILL BODY/);
        assert.deepEqual(body.messages[1], { role: "user", content: "Use a skill" });
        assertNativeTools(body.tools);

        return new Response(
          streamFrom([
            'data: {"choices":[{"delta":{"content":"Skill metadata seen."}}]}\n\n',
            "data: [DONE]\n\n",
          ]),
          { status: 200 },
        );
      },
    });

    const exitCode = await runCli(
      ["node", "cli", "ask", "Use a skill"],
      {
        OPENROUTER_API_KEY: "test-key",
        ORX_PLUGIN_REGISTRY_PATH: registryPath,
      },
      capture.io,
    );

    assert.equal(exitCode, 0);
    assert.match(capture.stdout(), /Skill metadata seen\./);
    assert.equal(capture.stderr(), "");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("ask prepends enabled plugin prompt metadata without full prompt content", async () => {
  const cwd = createTempDir();
  const registryPath = join(cwd, "plugins", "registry.json");
  const manifestPath = join(cwd, "plugin", "orx-plugin.json");
  mkdirSync(join(cwd, "plugin", "commands"), { recursive: true });
  writeFileSync(
    join(cwd, "plugin", "commands", "ask-review.md"),
    [
      "---",
      "name: Ask Review Prompt",
      "description: Ask prompt metadata.",
      "---",
      "# Ask Review Prompt",
      "FULL ASK PROMPT BODY",
      "",
    ].join("\n"),
  );
  writeFileSync(
    manifestPath,
    JSON.stringify({
      schemaVersion: "1",
      name: "ask-prompt-plugin",
      version: "1.0.0",
      description: "Ask prompt plugin.",
      publisher: "acme",
      source: {
        type: "local",
        path: ".",
      },
      components: {
        commands: "./commands",
      },
      permissions: {
        filesystem: [],
        network: [],
        env: [],
        mcp: [],
      },
    }),
  );

  try {
    registerPluginManifest(manifestPath, { registryPath });
    setPluginEnabledState("acme.ask-prompt-plugin@1.0.0", true, { registryPath });

    const capture = createIo({
      cwd,
      fetch: async (_input, init) => {
        const body = JSON.parse(String(init?.body));
        assert.equal(body.messages[0].role, "system");
        assert.match(body.messages[0].content, /ORX enabled plugin prompts \(compact metadata only\)/);
        assert.match(
          body.messages[0].content,
          /plugin:acme\.ask-prompt-plugin@1\.0\.0:command:ask-review-prompt/,
        );
        assert.match(body.messages[0].content, /description=Ask prompt metadata\./);
        assert.doesNotMatch(body.messages[0].content, /FULL ASK PROMPT BODY/);
        assert.deepEqual(body.messages[1], { role: "user", content: "Use a prompt" });
        assertNativeTools(body.tools);

        return new Response(
          streamFrom([
            'data: {"choices":[{"delta":{"content":"Prompt metadata seen."}}]}\n\n',
            "data: [DONE]\n\n",
          ]),
          { status: 200 },
        );
      },
    });

    const exitCode = await runCli(
      ["node", "cli", "ask", "Use a prompt"],
      {
        OPENROUTER_API_KEY: "test-key",
        ORX_PLUGIN_REGISTRY_PATH: registryPath,
      },
      capture.io,
    );

    assert.equal(exitCode, 0);
    assert.match(capture.stdout(), /Prompt metadata seen\./);
    assert.equal(capture.stderr(), "");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("ask prepends enabled plugin rule metadata without full rule content", async () => {
  const cwd = createTempDir();
  const registryPath = join(cwd, "plugins", "registry.json");
  const manifestPath = join(cwd, "plugin", "orx-plugin.json");
  mkdirSync(join(cwd, "plugin", "rules"), { recursive: true });
  writeFileSync(
    join(cwd, "plugin", "rules", "ask-guardrail.md"),
    [
      "---",
      "name: Ask Guardrail Rule",
      "description: Ask rule metadata.",
      "---",
      "# Ask Guardrail Rule",
      "FULL ASK RULE BODY",
      "",
    ].join("\n"),
  );
  writeFileSync(
    manifestPath,
    JSON.stringify({
      schemaVersion: "1",
      name: "ask-rule-plugin",
      version: "1.0.0",
      description: "Ask rule plugin.",
      publisher: "acme",
      source: {
        type: "local",
        path: ".",
      },
      components: {
        rules: "./rules",
      },
      permissions: {
        filesystem: [],
        network: [],
        env: [],
        mcp: [],
      },
    }),
  );

  try {
    registerPluginManifest(manifestPath, { registryPath });
    setPluginEnabledState("acme.ask-rule-plugin@1.0.0", true, { registryPath });

    const capture = createIo({
      cwd,
      fetch: async (_input, init) => {
        const body = JSON.parse(String(init?.body));
        assert.equal(body.messages[0].role, "system");
        assert.match(body.messages[0].content, /ORX enabled plugin rules \(compact metadata only\)/);
        assert.match(
          body.messages[0].content,
          /plugin:acme\.ask-rule-plugin@1\.0\.0:rule:ask-guardrail-rule/,
        );
        assert.match(body.messages[0].content, /description=Ask rule metadata\./);
        assert.doesNotMatch(body.messages[0].content, /FULL ASK RULE BODY/);
        assert.deepEqual(body.messages[1], { role: "user", content: "Use a rule" });
        assertNativeTools(body.tools);

        return new Response(
          streamFrom([
            'data: {"choices":[{"delta":{"content":"Rule metadata seen."}}]}\n\n',
            "data: [DONE]\n\n",
          ]),
          { status: 200 },
        );
      },
    });

    const exitCode = await runCli(
      ["node", "cli", "ask", "Use a rule"],
      {
        OPENROUTER_API_KEY: "test-key",
        ORX_PLUGIN_REGISTRY_PATH: registryPath,
      },
      capture.io,
    );

    assert.equal(exitCode, 0);
    assert.match(capture.stdout(), /Rule metadata seen\./);
    assert.equal(capture.stderr(), "");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("ask supports Fusion preset override", async () => {
  const capture = createIo({
    fetch: async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.model, "openrouter/fusion");
      assert.deepEqual(body.plugins, [{ id: "fusion", preset: "general-budget" }]);
      assertNativeTools(body.tools);

      return new Response(streamFrom(["data: [DONE]\n\n"]), { status: 200 });
    },
  });

  const exitCode = await runCli(
    ["node", "cli", "ask", "Say hello", "--fusion", "general-budget"],
    {
      OPENROUTER_API_KEY: "test-key",
    },
    capture.io,
  );

  assert.equal(exitCode, 0);
  assert.match(capture.stdout(), /requested_model: openrouter\/fusion/);
});

test("metadata CLI commands use live OpenRouter APIs", async () => {
  const seenUrls: string[] = [];
  const capture = createIo({
    fetch: async (input) => {
      seenUrls.push(String(input));
      if (String(input).endsWith("/models")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: "openai/gpt-5.5",
                name: "GPT 5.5",
                context_length: 200000,
                pricing: { prompt: "0.000001", completion: "0.000004" },
              },
              {
                id: "anthropic/claude-sonnet-4.5",
                name: "Claude Sonnet 4.5",
                context_length: 200000,
              },
            ],
          }),
          { status: 200 },
        );
      }

      if (String(input).endsWith("/credits")) {
        return new Response(
          JSON.stringify({ data: { total_credits: 12, total_usage: 3 } }),
          { status: 200 },
        );
      }

      if (String(input).endsWith("/generation?id=gen_123")) {
        return new Response(
          JSON.stringify({
            data: {
              id: "gen_123",
              model: "openai/gpt-5.5",
              provider_name: "OpenAI",
              tokens_prompt: 5,
              tokens_completion: 7,
              total_cost: 0.002,
            },
          }),
          { status: 200 },
        );
      }

      throw new Error(`unexpected URL ${String(input)}`);
    },
  });
  const env = { OPENROUTER_API_KEY: "test-key" };

  assert.equal(await runCli(["node", "cli", "models", "claude"], env, capture.io), 0);
  assert.equal(await runCli(["node", "cli", "credits"], env, capture.io), 0);
  assert.equal(await runCli(["node", "cli", "generation", "gen_123"], env, capture.io), 0);

  assert.deepEqual(seenUrls, [
    "https://openrouter.ai/api/v1/models",
    "https://openrouter.ai/api/v1/credits",
    "https://openrouter.ai/api/v1/generation?id=gen_123",
  ]);
  assert.match(capture.stdout(), /OpenRouter models matching "claude": 1/);
  assert.match(capture.stdout(), /remaining: \$9\.000000/);
  assert.match(capture.stdout(), /usage_meter: \[###---------\] 25\.00%/);
  assert.match(capture.stdout(), /id: gen_123/);
  assert.match(capture.stdout(), /provider: OpenAI/);
  assert.equal(capture.stderr(), "");
});

test("metadata CLI command failures are sanitized", async () => {
  const capture = createIo({
    fetch: async () => new Response("bad test-key Bearer test-key", { status: 403 }),
  });

  const exitCode = await runCli(
    ["node", "cli", "credits"],
    { OPENROUTER_API_KEY: "test-key" },
    capture.io,
  );

  assert.equal(exitCode, 1);
  assert.doesNotMatch(capture.stderr(), /test-key/);
  assert.match(capture.stderr(), /\[redacted\]/);
  assert.match(capture.stderr(), /may lack OpenRouter management permission/);
});

test("ask prints visible tool start and result summaries", async () => {
  const cwd = createTempDir();
  const previousNoColor = process.env.NO_COLOR;
  delete process.env.NO_COLOR;
  const patch = [
    "*** Begin Patch",
    "*** Add File: created.txt",
    "+SHOULD_NOT_APPEAR_IN_TOOL_SUMMARY",
    "*** End Patch",
    "",
  ].join("\n");
  let callCount = 0;

  try {
    mkdirSync(join(cwd, ".orx"), { recursive: true });
    writeFileSync(join(cwd, ".orx", "config.toml"), ['theme = "vivid"', ""].join("\n"));

    const capture = createIo({
      cwd,
      tty: true,
      fetch: async (_input, init) => {
        const body = JSON.parse(String(init?.body));
        callCount += 1;

        if (callCount === 1) {
          assert.equal(body.messages.at(-1).role, "user");
          return new Response(
            streamFrom([
              sse({
                choices: [
                  {
                    delta: {
                      tool_calls: [
                        {
                          index: 0,
                          id: "call_patch",
                          type: "function",
                          function: {
                            name: "apply_patch",
                            arguments: JSON.stringify({ patch }),
                          },
                        },
                      ],
                    },
                    finish_reason: "tool_calls",
                  },
                ],
              }),
              "data: [DONE]\n\n",
            ]),
            { status: 200 },
          );
        }

        assert.equal(body.messages.at(-1).role, "tool");
        assert.equal(body.messages.at(-1).tool_call_id, "call_patch");
        return new Response(
          streamFrom([
            sse({
              choices: [
                {
                  delta: {
                    content: "Patched.",
                  },
                },
              ],
            }),
            "data: [DONE]\n\n",
          ]),
          { status: 200 },
        );
      },
    });

    const exitCode = await runCli(
      ["node", "cli", "ask", "Create a file"],
      {
        OPENROUTER_API_KEY: "test-key",
      },
      capture.io,
    );

    assert.equal(exitCode, 0);
    assert.equal(readFileSync(join(cwd, "created.txt"), "utf8"), "SHOULD_NOT_APPEAR_IN_TOOL_SUMMARY\n");
    assert.match(capture.stdout(), /\x1b\[96m\[tool\]\x1b\[0m apply_patch/);
    assert.match(capture.stdout(), /\x1b\[92mok\x1b\[0m/);
    const stdout = stripAnsi(capture.stdout());
    assert.match(stdout, /\[tool\] apply_patch patch=<\d+B, 4 lines>/);
    assert.match(
      stdout,
      /\[tool\] apply_patch ok duration=\d+ms changed_files=1 \["created\.txt"\]/,
    );
    assert.match(stdout, /Patched\./);
    assert.doesNotMatch(stdout, /\+SHOULD_NOT_APPEAR_IN_TOOL_SUMMARY/);
    assert.equal(capture.stderr(), "");
  } finally {
    if (previousNoColor === undefined) {
      delete process.env.NO_COLOR;
    } else {
      process.env.NO_COLOR = previousNoColor;
    }
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("ask runs trusted plugin lifecycle hooks for prompt, tools, and stop", async () => {
  const cwd = createTempDir();
  const registryPath = join(cwd, "plugins", "registry.json");
  const hooksConfigPath = join(cwd, "hooks", "trust.json");
  const hooksAuditLogPath = join(cwd, "audit", "hooks.jsonl");
  const eventLogPath = join(cwd, "events.log");
  const pluginDirectory = join(cwd, "plugin");
  const manifestPath = join(pluginDirectory, "orx-plugin.json");
  const hookEvents = [
    ["sessionstart", "session_start"],
    ["usersubmit", "user_prompt_submit"],
    ["pretool", "pre_tool_use"],
    ["posttool", "post_tool_use"],
    ["stop", "stop"],
  ] as const;
  const commandFor = (event: string) =>
    `${JSON.stringify(process.execPath)} -e ${JSON.stringify(
      `require("node:fs").appendFileSync(${JSON.stringify(eventLogPath)}, ${JSON.stringify(
        `${event}\n`,
      )})`,
    )}`;
  let callCount = 0;

  try {
    mkdirSync(pluginDirectory, { recursive: true });
    writeFileSync(join(cwd, "sample.txt"), "ask hook sample\n");
    writeFileSync(
      join(pluginDirectory, "hooks.json"),
      JSON.stringify({
        hooks: Object.fromEntries(
          hookEvents.map(([hookId, event]) => [
            hookId,
            {
              event,
              command: commandFor(event),
            },
          ]),
        ),
      }),
    );
    writeFileSync(
      manifestPath,
      JSON.stringify({
        schemaVersion: "1",
        name: "ask-hook-plugin",
        version: "1.0.0",
        description: "Ask hook plugin.",
        publisher: "acme",
        source: {
          type: "local",
          path: ".",
        },
        components: {
          hooks: "./hooks.json",
        },
        permissions: {
          filesystem: [],
          network: [],
          env: [],
          mcp: [],
        },
      }),
    );
    registerPluginManifest(manifestPath, { registryPath });
    setPluginEnabledState("acme.ask-hook-plugin@1.0.0", true, { registryPath });
    const discovery = discoverEnabledPluginHooks({ registryPath });
    assert.equal(discovery.hooks.length, hookEvents.length);
    for (const hook of discovery.hooks) {
      trustPluginHook(hook.id, { registryPath, configPath: hooksConfigPath });
    }

    const capture = createIo({
      cwd,
      fetch: async (_input, init) => {
        callCount += 1;
        const body = JSON.parse(String(init?.body));

        if (callCount === 1) {
          assert.equal(body.messages.at(-1).content, "Read sample");
          return new Response(
            streamFrom([
              sse({
                choices: [
                  {
                    delta: {
                      tool_calls: [
                        {
                          index: 0,
                          id: "call_read",
                          type: "function",
                          function: {
                            name: "read_file",
                            arguments: JSON.stringify({ path: "sample.txt" }),
                          },
                        },
                      ],
                    },
                    finish_reason: "tool_calls",
                  },
                ],
              }),
              "data: [DONE]\n\n",
            ]),
            { status: 200 },
          );
        }

        assert.equal(body.messages.at(-1).role, "tool");
        return new Response(
          streamFrom([
            sse({
              choices: [
                {
                  delta: {
                    content: "Read complete.",
                  },
                },
              ],
            }),
            "data: [DONE]\n\n",
          ]),
          { status: 200 },
        );
      },
    });

    const exitCode = await runCli(
      ["node", "cli", "ask", "Read sample"],
      {
        OPENROUTER_API_KEY: "test-key",
        ORX_PLUGIN_HOOKS_AUDIT_PATH: hooksAuditLogPath,
        ORX_PLUGIN_HOOKS_CONFIG_PATH: hooksConfigPath,
        ORX_PLUGIN_REGISTRY_PATH: registryPath,
      },
      capture.io,
    );

    assert.equal(exitCode, 0);
    assert.equal(callCount, 2);
    assert.deepEqual(readFileSync(eventLogPath, "utf8").trimEnd().split("\n"), [
      "session_start",
      "user_prompt_submit",
      "pre_tool_use",
      "post_tool_use",
      "stop",
    ]);
    const auditEvents = readFileSync(hooksAuditLogPath, "utf8")
      .trimEnd()
      .split("\n")
      .map((line) => JSON.parse(line) as { hookId: string; hookEvent: string; ok: boolean });
    for (const [hookId, event] of hookEvents) {
      assert.ok(
        auditEvents.some(
          (entry) =>
            entry.hookId === `plugin:acme.ask-hook-plugin@1.0.0:${hookId}` &&
            entry.hookEvent === event &&
            entry.ok,
        ),
      );
    }
    assert.match(capture.stdout(), /Read complete\./);
    assert.equal(capture.stderr(), "");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("chat streams turns, keeps history, and handles slash commands", async () => {
  const sessionDirectory = createTempDir();
  const requests: unknown[] = [];
  let callCount = 0;

  try {
    const capture = createIo({
      stdin: Readable.from([
        "Hello\n",
        "/status\n",
        "/mode fusion\n",
        "/fusion general-budget\n",
        "/models\n",
        "Follow up\n",
        "/new\n",
        "/mode auto\n",
        "After new\n",
        "/exit\n",
      ]),
      fetch: async (input, init) => {
        if (String(input).endsWith("/models")) {
          return new Response(
            JSON.stringify({
              data: [
                {
                  id: "anthropic/claude-sonnet-4.5",
                  name: "Claude Sonnet 4.5",
                  context_length: 200000,
                },
              ],
            }),
            { status: 200 },
          );
        }

        const body = JSON.parse(String(init?.body));
        assertNativeTools(body.tools);
        delete body.tools;
        requests.push(body);
        const text = callCount === 0 ? "First reply" : "Second reply";
        callCount += 1;

        return new Response(
          streamFrom([
            `data: {"model":"${body.model}","choices":[{"delta":{"content":"${text}"}}]}\n\n`,
            "data: [DONE]\n\n",
          ]),
          { status: 200 },
        );
      },
    });

    const exitCode = await runCli(
      ["node", "cli", "chat"],
      {
        OPENROUTER_API_KEY: "test-key",
        ORX_SESSION_DIR: sessionDirectory,
        ORX_MCP_CONFIG_PATH: join(sessionDirectory, "mcp", "profiles.json"),
      },
      capture.io,
    );

    assert.equal(exitCode, 0);
    assert.equal(requests.length, 3);
    assert.deepEqual(requests[0], {
      model: "openrouter/auto",
      messages: [{ role: "user", content: "Hello" }],
      stream: true,
    });
    assert.deepEqual(requests[1], {
      model: "openrouter/fusion",
      messages: [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "First reply" },
        { role: "user", content: "Follow up" },
      ],
      stream: true,
      plugins: [{ id: "fusion", preset: "general-budget" }],
    });
    assert.deepEqual(requests[2], {
      model: "openrouter/auto",
      messages: [{ role: "user", content: "After new" }],
      stream: true,
    });
    assert.match(capture.stdout(), /ORX chat/);
    assert.match(capture.stdout(), /session: \d{8}T\d{6}Z-[a-f0-9]{8}/);
    assert.match(capture.stdout(), /assistant: First reply/);
    assert.match(capture.stdout(), /history_messages: 2/);
    assert.match(capture.stdout(), /session: .*\.json\)/);
    assert.match(capture.stdout(), /Mode set to fusion/);
    assert.match(capture.stdout(), /Fusion preset set to general-budget/);
    assert.match(capture.stdout(), /OpenRouter models: 1/);
    assert.match(capture.stdout(), /anthropic\/claude-sonnet-4\.5/);
    assert.match(capture.stdout(), /New chat started/);
    assert.match(capture.stdout(), /Mode set to auto/);
    assert.match(capture.stdout(), /Exiting ORX chat/);
    assert.equal(capture.stderr(), "");

    const sessionFiles = readdirSync(sessionDirectory).filter((file) => file.endsWith(".json"));
    assert.equal(sessionFiles.length, 2);
    const sessions = sessionFiles.map(
      (file) =>
        JSON.parse(readFileSync(join(sessionDirectory, file), "utf8")) as {
          activeConfig: { mode: string; model: string; fusionPreset?: string };
          messageCount: number;
          summary: { firstUserMessage?: string };
        },
    );
    const originalSession = sessions.find(
      (session) => session.summary.firstUserMessage === "Hello",
    );
    const newSession = sessions.find(
      (session) => session.summary.firstUserMessage === "After new",
    );

    assert.equal(originalSession?.activeConfig.mode, "fusion");
    assert.equal(originalSession?.activeConfig.model, "openrouter/fusion");
    assert.equal(originalSession?.activeConfig.fusionPreset, "general-budget");
    assert.equal(originalSession?.messageCount, 4);
    assert.equal(newSession?.activeConfig.mode, "auto");
    assert.equal(newSession?.activeConfig.model, "openrouter/auto");
    assert.equal(newSession?.messageCount, 2);
  } finally {
    rmSync(sessionDirectory, { recursive: true, force: true });
  }
});

test("chat metadata slash commands do not make chat completion requests", async () => {
  const sessionDirectory = createTempDir();
  const auditLogPath = join(sessionDirectory, "audit", "mcp.jsonl");
  const seenUrls: string[] = [];

  try {
    const capture = createIo({
      stdin: Readable.from([
        "/models claude\n",
        "/credits\n",
        "/generation gen_123\n",
        "/mcp\n",
        "/exit\n",
      ]),
      fetch: async (input) => {
        const url = String(input);
        seenUrls.push(url);
        assert.doesNotMatch(url, /\/chat\/completions$/);

        if (url.endsWith("/models")) {
          return new Response(
            JSON.stringify({
              data: [
                {
                  id: "anthropic/claude-sonnet-4.5",
                  name: "Claude Sonnet 4.5",
                  context_length: 200000,
                },
              ],
            }),
            { status: 200 },
          );
        }

        if (url.endsWith("/credits")) {
          return new Response(
            JSON.stringify({ data: { total_credits: 5, total_usage: 1 } }),
            { status: 200 },
          );
        }

        if (url.endsWith("/generation?id=gen_123")) {
          return new Response(
            JSON.stringify({
              data: {
                id: "gen_123",
                model: "anthropic/claude-sonnet-4.5",
                provider_name: "Anthropic",
                total_cost: 0.003,
              },
            }),
            { status: 200 },
          );
        }

        throw new Error(`unexpected URL ${url}`);
      },
    });

    const exitCode = await runCli(
      ["node", "cli", "chat"],
      {
        OPENROUTER_API_KEY: "test-key",
        ORX_SESSION_DIR: sessionDirectory,
        ORX_MCP_AUDIT_PATH: auditLogPath,
        ORX_MCP_CONFIG_PATH: join(sessionDirectory, "mcp", "profiles.json"),
      },
      capture.io,
    );

    assert.equal(exitCode, 0);
    assert.deepEqual(seenUrls, [
      "https://openrouter.ai/api/v1/models",
      "https://openrouter.ai/api/v1/credits",
      "https://openrouter.ai/api/v1/generation?id=gen_123",
    ]);
    assert.match(capture.stdout(), /OpenRouter models matching "claude": 1/);
    assert.match(capture.stdout(), /OpenRouter credits/);
    assert.match(capture.stdout(), /OpenRouter generation/);
    assert.match(capture.stdout(), /profile=openrouter state=disabled/);
    assert.equal(capture.stderr(), "");
  } finally {
    rmSync(sessionDirectory, { recursive: true, force: true });
  }
});

test("chat web search uses cli env Brave key and fetch injection", async () => {
  const sessionDirectory = createTempDir();
  const seenUrls: string[] = [];
  try {
    const capture = createIo({
      stdin: Readable.from(["/search cli env query\n", "/exit\n"]),
      fetch: async (input, init) => {
        const url = String(input);
        seenUrls.push(url);
        assert.match(url, /^https:\/\/api\.search\.brave\.com\/res\/v1\/web\/search\?/);
        assert.equal((init?.headers as Record<string, string>)["x-subscription-token"], "brave-cli-key");
        return new Response(
          JSON.stringify({
            web: {
              results: [
                {
                  title: "CLI Search Result",
                  url: "https://example.com/cli-search",
                  description: "Search snippet from CLI env.",
                },
              ],
            },
          }),
          { status: 200 },
        );
      },
    });

    const exitCode = await runCli(
      ["node", "cli", "chat"],
      {
        OPENROUTER_API_KEY: "test-key",
        BRAVE_SEARCH_API_KEY: "brave-cli-key",
        ORX_SESSION_DIR: sessionDirectory,
      },
      capture.io,
    );

    assert.equal(exitCode, 0);
    assert.equal(seenUrls.length, 1);
    assert.match(seenUrls[0], /q=cli\+env\+query/);
    assert.match(capture.stdout(), /Search results: 1 source/);
    assert.match(capture.stdout(), /CLI Search Result/);
    assert.equal(capture.stderr(), "");
  } finally {
    rmSync(sessionDirectory, { recursive: true, force: true });
  }
});

test("chat prints visible tool start and result summaries", async () => {
  const cwd = createTempDir();
  const sessionDirectory = createTempDir();
  let callCount = 0;
  const patch = [
    "*** Begin Patch",
    "*** Add File: later-change.txt",
    "+dirty",
    "*** End Patch",
    "",
  ].join("\n");

  try {
    git(cwd, "init");
    git(cwd, "config", "user.email", "orx@example.test");
    git(cwd, "config", "user.name", "ORX Test");
    writeFileSync(join(cwd, "sample.txt"), "alpha from chat\n");
    git(cwd, "add", "sample.txt");
    git(cwd, "commit", "-m", "initial");

    const capture = createIo({
      cwd,
      stdin: Readable.from(["Patch sample\n", "/exit\n"]),
      fetch: async (_input, init) => {
        callCount += 1;
        const body = JSON.parse(String(init?.body));

        if (callCount === 1) {
          assert.equal(body.messages.at(-1).content, "Patch sample");
          return new Response(
            streamFrom([
              sse({
                choices: [
                  {
                    delta: {
                      tool_calls: [
                        {
                          index: 0,
                          id: "call_patch",
                          type: "function",
                          function: {
                            name: "apply_patch",
                            arguments: JSON.stringify({ patch }),
                          },
                        },
                      ],
                    },
                    finish_reason: "tool_calls",
                  },
                ],
              }),
              "data: [DONE]\n\n",
            ]),
            { status: 200 },
          );
        }

        assert.equal(body.messages.at(-1).role, "tool");
        return new Response(
          streamFrom([
            sse({
              choices: [
                {
                  delta: {
                    content: "Patched sample.",
                  },
                },
              ],
            }),
            "data: [DONE]\n\n",
          ]),
          { status: 200 },
        );
      },
    });

    const exitCode = await runCli(
      ["node", "cli", "chat"],
      {
        OPENROUTER_API_KEY: "test-key",
        ORX_SESSION_DIR: sessionDirectory,
      },
      capture.io,
    );

    assert.equal(exitCode, 0);
    assert.match(capture.stdout(), /\[tool\] apply_patch patch=<\d+B, 4 lines>/);
    assert.match(
      capture.stdout(),
      /\[tool\] apply_patch ok duration=\d+ms changed_files=1 \["later-change\.txt"\]/,
    );
    assert.match(capture.stdout(), /assistant: Patched sample\./);
    assert.equal(capture.stderr(), "");

    const sessionFiles = readdirSync(sessionDirectory).filter((file) => file.endsWith(".json"));
    assert.equal(sessionFiles.length, 1);
    const session = JSON.parse(
      readFileSync(join(sessionDirectory, sessionFiles[0]), "utf8"),
    ) as {
      git?: { dirty: boolean };
    };
    assert.equal(session.git?.dirty, true);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
    rmSync(sessionDirectory, { recursive: true, force: true });
  }
});

function createIo(
  options: {
    fetch?: typeof fetch;
    mcpCallFetch?: typeof fetch;
    stdin?: NodeJS.ReadableStream;
    cwd?: string;
    tty?: boolean;
  } = {},
) {
  let stdoutText = "";
  let stderrText = "";
  const stdout: Pick<NodeJS.WriteStream, "write"> & { isTTY?: boolean } = {
    write(chunk: string | Uint8Array) {
      stdoutText += String(chunk);
      return true;
    },
  };
  if (options.tty) {
    stdout.isTTY = true;
  }

  return {
    io: {
      stdin: options.stdin,
      stdout,
      stderr: {
        write(chunk: string | Uint8Array) {
          stderrText += String(chunk);
          return true;
        },
      },
      cwd: options.cwd ?? "/tmp/orx-test",
      fetch: options.fetch ?? globalThis.fetch,
      mcpCallFetch: options.mcpCallFetch,
    },
    stdout() {
      return stdoutText;
    },
    stderr() {
      return stderrText;
    },
  };
}

function stripAnsi(value: string): string {
  return value.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
}

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), "orx-cli-"));
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
  });
}

function streamFrom(chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

function assertNativeTools(tools: unknown) {
  assert.equal(Array.isArray(tools), true);
  const names = (tools as Array<{ function: { name: string } }>)
    .map((tool) => tool.function.name)
    .sort();
  assert.doesNotMatch(names.join(","), /mcp_call/);
  assert.deepEqual(names, [
    "apply_patch",
    "git_diff",
    "list_files",
    "read_file",
    "search_files",
    "shell",
  ]);
}

function sse(value: unknown): string {
  return `data: ${JSON.stringify(value)}\n\n`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
