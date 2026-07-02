import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";
import { runCli } from "./cli.js";
import { getNativeToolDefinitions } from "./agent/index.js";
import type { AstGrepRunner, TreeSitterRunner } from "./code-map/index.js";
import type { DiagnosticsProcessRunner } from "./diagnostics/index.js";
import type { ScannerProcessRunner } from "./security/index.js";
import type { RunProcessOptions, RunProcessResult } from "./tools/process.js";
import {
  allowMcpModelToolGrant,
  setMcpProfilePersistentState,
  type McpMacosKeychainCommandRunner,
} from "./mcp/index.js";
import {
  discoverEnabledPluginHooks,
  registerPluginManifest,
  setPluginEnabledState,
  trustPluginHook,
} from "./plugins/index.js";
import { saveCurrentProfile } from "./profiles/index.js";
import { appendChatHistoryEntry } from "./tui/history.js";

const encoder = new TextEncoder();

test("help, version, and status work without an API key", async () => {
  for (const helpArg of ["help", "--help", "-h"]) {
    const help = createIo();
    assert.equal(await runCli(["node", "cli", helpArg], {}, help.io), 0);
    assert.match(help.stdout(), /Commands:/);
    assert.match(help.stdout(), /\(no command\)  Start an interactive OpenRouter chat session/);
    assert.match(help.stdout(), /init\s+Create a no-secret starter config for first-run setup/);
    assert.match(help.stdout(), /auth\s+Show OpenRouter API-key setup status or create an env template/);
    assert.match(help.stdout(), /config\s+Show or edit local ORX configuration/);
    assert.match(help.stdout(), /history\s+Search or clear local prompt history/);
    assert.match(help.stdout(), /mcp\s+Plan, inspect, enable, auth, call, and grant MCP tool policy/);
    assert.match(help.stdout(), /plugins\s+List catalog entries, scaffold, validate, install, enable, or disable plugins/);
    assert.match(help.stdout(), /bins\s+List, inspect, trust, untrust, or run plugin bins/);
    assert.match(help.stdout(), /hooks\s+List, inspect, trust, untrust, or run plugin hook definitions/);
    assert.match(help.stdout(), /tests\s+Discover or run native test targets/);
    assert.match(help.stdout(), /code\s+Render local code maps, symbol indexes, references, imports, calls, ast-grep searches, or tree-sitter parses\/outlines\/imports\/refs\/calls/);
    assert.match(help.stdout(), /scanners\s+List, inspect, plan, or run local security scanner profiles/);
    assert.match(help.stdout(), /scan\s+Alias for a local scanner run/);
    assert.match(help.stdout(), /diagnostics\s+List, inspect, or run local diagnostics profiles/);
    assert.match(help.stdout(), /diag\s+Alias for diagnostics/);
    assert.match(help.stdout(), /orchestrator\s+Show delegation readiness or refuse session-less changes/);
    assert.match(help.stdout(), /delegate\s+Show\/refuse session delegate changes, policy, or saved teams/);
    assert.match(help.stdout(), /delegates\s+Show delegate readiness, execution policy, or saved teams/);
    assert.match(help.stdout(), /doctor\s+Run a no-network readiness check; use --strict to fail when not ready/);
    assert.match(help.stdout(), /guide\s+Show a no-network quickstart for daily use, MCP, plugins, and delegation/);
    assert.match(help.stdout(), /quickstart\s+Alias for guide/);
    assert.doesNotMatch(help.stdout(), /ORX chat/);
    assert.equal(help.stderr(), "");
  }

  const version = createIo();
  assert.equal(await runCli(["node", "cli", "--version"], {}, version.io), 0);
  assert.match(version.stdout(), /\d+\.\d+\.\d+/);

  const cwd = createTempDir();
  try {
    const diagnosticEnv = {
      ORX_MCP_CONFIG_PATH: join(cwd, "mcp", "profiles.json"),
      ORX_MCP_PROFILE_CATALOG_PATH: join(cwd, "mcp", "profile-catalog.json"),
      ORX_PLUGIN_REGISTRY_PATH: join(cwd, "plugins", "registry.json"),
      ORX_PLUGIN_CATALOG_PATH: join(cwd, "plugins", "catalog.json"),
      ORX_PLUGIN_BINS_CONFIG_PATH: join(cwd, "plugins", "bins.json"),
      ORX_PLUGIN_HOOKS_CONFIG_PATH: join(cwd, "plugins", "hooks.json"),
      ORX_PROFILE_CONFIG_PATH: join(cwd, "profiles.json"),
      ORX_DELEGATION_TEAMS_PATH: join(cwd, "delegation", "teams.json"),
      ORX_DELEGATION_POLICY_PATH: join(cwd, "delegation", "policy.json"),
      ORX_DELEGATION_AUDIT_PATH: join(cwd, "audit", "delegation.jsonl"),
    };
    const status = createIo();
    assert.equal(
      await runCli(["node", "cli", "status"], diagnosticEnv, status.io),
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
    assert.match(status.stdout(), /test_frameworks: node=0, vitest=0, jest=0, playwright=0, ava=0, unknown=0/);
    assert.match(status.stdout(), /active_profile: none/);
    assert.match(status.stdout(), /profile_count: 0/);
    assert.match(status.stdout(), /delegation_policy_execution: disabled/);
    assert.match(status.stdout(), /delegation_policy_max_task_cost_usd: 0\.25/);
    assert.match(status.stdout(), /delegation_policy_timeout_ms: 120000/);
    assert.match(status.stdout(), /delegation_policy_result_merge: manual_summary/);
    assert.match(status.stdout(), new RegExp(`delegation_audit_path: ${escapeRegExp(join(cwd, "audit", "delegation.jsonl"))}`));
    assert.match(status.stdout(), /delegate_task_runtime: policy_enforced_disabled/);
    assert.match(status.stdout(), /delegate_task_model_exposure: unavailable/);
    assert.match(status.stdout(), /delegate_task_adapter: openrouter_available/);

    let fetchCalls = 0;
    const doctor = createIo({
      cwd,
      fetch: async (): Promise<Response> => {
        fetchCalls += 1;
        throw new Error("doctor must not call fetch");
      },
    });
    assert.equal(await runCli(["node", "cli", "doctor"], diagnosticEnv, doctor.io), 0);
    assert.match(doctor.stdout(), /ORX doctor/);
    assert.match(doctor.stdout(), /overall: setup_needed_api_key/);
    assert.match(doctor.stdout(), /ready_to_use: limited_core_cli_only/);
    assert.match(doctor.stdout(), /core_cli: ready/);
    assert.match(doctor.stdout(), /chat: blocked_missing_openrouter_api_key/);
    assert.match(doctor.stdout(), /mcp: available_no_active_profiles/);
    assert.match(doctor.stdout(), /plugins: available_no_plugins_installed/);
    assert.match(doctor.stdout(), /delegation: optional_disabled/);
    assert.match(doctor.stdout(), /interactive_chat: blocked_missing_openrouter_api_key/);
    assert.match(doctor.stdout(), /network_calls: none/);
    assert.match(doctor.stdout(), /remote_mcp_calls: none/);
    assert.match(doctor.stdout(), /plugin_execution: none/);
    assert.match(doctor.stdout(), /api_key_present: no/);
    assert.match(doctor.stdout(), /approval_policy: never/);
    assert.match(doctor.stdout(), /sandbox_mode: danger-full-access/);
    assert.match(doctor.stdout(), /active_profiles: none/);
    assert.match(doctor.stdout(), /installed: 0/);
    assert.match(doctor.stdout(), /execution_policy: disabled/);
    assert.match(doctor.stdout(), /delegate_task_cli_exposure: unavailable_sessionless_cli/);
    assert.match(doctor.stdout(), /chat_readiness: not_evaluated_sessionless_cli/);
    assert.match(doctor.stdout(), /saved_team_availability: blocked_policy_disabled/);
    assert.match(doctor.stdout(), /next_steps:/);
    assert.match(doctor.stdout(), /run orx auth setup to configure OPENROUTER_API_KEY/);
    assert.match(doctor.stdout(), /run orx auth init to create a private commented env template/);
    assert.equal(fetchCalls, 0);
    assert.equal(doctor.stderr(), "");

    const guide = createIo({ cwd, fetch: doctor.io.fetch });
    assert.equal(await runCli(["node", "cli", "guide"], diagnosticEnv, guide.io), 0);
    assert.match(guide.stdout(), /ORX guide/);
    assert.match(guide.stdout(), /ready_to_use: limited_core_cli_only/);
    assert.match(guide.stdout(), /chat: blocked_missing_openrouter_api_key/);
    assert.match(guide.stdout(), /start_here:/);
    assert.match(guide.stdout(), /run orx auth setup to configure OPENROUTER_API_KEY/);
    assert.match(guide.stdout(), /customize:/);
    assert.match(guide.stdout(), /orx profile save daily --model openrouter\/fusion --mode fusion/);
    assert.match(guide.stdout(), /local_code:/);
    assert.match(guide.stdout(), /orx refs <query>/);
    assert.match(guide.stdout(), /orx calls <query>/);
    assert.match(guide.stdout(), /orx diagnostics run typescript/);
    assert.match(guide.stdout(), /mcp_setup:/);
    assert.match(guide.stdout(), /orx mcp plan context7/);
    assert.match(guide.stdout(), /plugins_setup:/);
    assert.match(guide.stdout(), /orx plugins scaffold \.\/my-plugin/);
    assert.match(guide.stdout(), /delegation_setup:/);
    assert.match(guide.stdout(), /in chat: \/delegate add reviewer openrouter <model>/);
    assert.match(guide.stdout(), /boundaries:/);
    assert.match(guide.stdout(), /network_calls: none/);
    assert.match(
      guide.stdout(),
      /state_mutation: no config, trust, grant, catalog, plugin, delegation, or data-content writes/,
    );
    assert.match(
      guide.stdout(),
      /permission_tightening: possible for existing loose local state files while reading readiness/,
    );
    assert.equal(guide.stderr(), "");
    assert.equal(fetchCalls, 0);

    const quickstart = createIo({ cwd, fetch: doctor.io.fetch });
    assert.equal(await runCli(["node", "cli", "quickstart"], diagnosticEnv, quickstart.io), 0);
    assert.match(quickstart.stdout(), /ORX guide/);
    assert.equal(quickstart.stderr(), "");
    assert.equal(fetchCalls, 0);

    const strictDoctor = createIo({ cwd, fetch: doctor.io.fetch });
    assert.equal(await runCli(["node", "cli", "doctor", "--strict"], diagnosticEnv, strictDoctor.io), 1);
    assert.match(strictDoctor.stdout(), /ready_to_use: limited_core_cli_only/);
    assert.match(
      strictDoctor.stderr(),
      /ORX doctor strict gate failed: ready_to_use=limited_core_cli_only overall=setup_needed_api_key/,
    );
    assert.equal(fetchCalls, 0);

    const jsonDoctor = createIo({ cwd, fetch: doctor.io.fetch });
    assert.equal(await runCli(["node", "cli", "doctor", "--json"], diagnosticEnv, jsonDoctor.io), 0);
    const jsonReport = JSON.parse(jsonDoctor.stdout());
    assert.equal(jsonReport.schema_version, 1);
    assert.equal(jsonReport.strict_ready, false);
    assert.equal(jsonReport.summary.overall, "setup_needed_api_key");
    assert.equal(jsonReport.summary.ready_to_use, "limited_core_cli_only");
    assert.equal(jsonReport.summary.network_calls, "none");
    assert.equal(jsonReport.runtime.api_key_present, false);
    assert.equal(jsonReport.runtime.api_key_source, "missing");
    assert.equal(jsonReport.runtime.approval_policy, "never");
    assert.equal(jsonReport.runtime.sandbox_mode, "danger-full-access");
    assert.deepEqual(jsonReport.mcp.active_profiles, []);
    assert.equal(jsonReport.plugins.installed, 0);
    assert.equal(jsonReport.delegation.execution_policy, "disabled");
    assert.equal(jsonReport.next_steps[0], "run orx auth setup to configure OPENROUTER_API_KEY");
    assert.equal(
      jsonReport.next_steps[1],
      "run orx auth init to create a private commented env template",
    );
    assert.equal(jsonDoctor.stderr(), "");
    assert.equal(fetchCalls, 0);

    const strictJsonDoctor = createIo({ cwd, fetch: doctor.io.fetch });
    assert.equal(
      await runCli(["node", "cli", "doctor", "--json", "--strict"], diagnosticEnv, strictJsonDoctor.io),
      1,
    );
    assert.equal(JSON.parse(strictJsonDoctor.stdout()).summary.ready_to_use, "limited_core_cli_only");
    assert.equal(JSON.parse(strictJsonDoctor.stdout()).strict_ready, false);
    assert.match(
      strictJsonDoctor.stderr(),
      /ORX doctor strict gate failed: ready_to_use=limited_core_cli_only overall=setup_needed_api_key/,
    );
    assert.equal(fetchCalls, 0);

    const doctorHelp = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "doctor", "--help"], diagnosticEnv, doctorHelp.io), 0);
    assert.match(doctorHelp.stdout(), /Usage: orx doctor \[--strict\] \[--json\]/);
    assert.equal(doctorHelp.stderr(), "");

    const guideHelp = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "guide", "--help"], diagnosticEnv, guideHelp.io), 0);
    assert.match(guideHelp.stdout(), /Usage: orx guide/);
    assert.equal(guideHelp.stderr(), "");

    const quickstartHelp = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "quickstart", "-h"], diagnosticEnv, quickstartHelp.io), 0);
    assert.match(quickstartHelp.stdout(), /Usage: orx guide/);
    assert.equal(quickstartHelp.stderr(), "");

    const doctorUnknown = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "doctor", "--yaml"], diagnosticEnv, doctorUnknown.io), 1);
    assert.match(doctorUnknown.stderr(), /Unknown doctor option: --yaml/);
    assert.match(doctorUnknown.stderr(), /Usage: orx doctor \[--strict\] \[--json\]/);

    const doctorSecretOption = createIo({ cwd });
    assert.equal(
      await runCli(
        ["node", "cli", "doctor", "sk-or-v1-secret-doctor-option"],
        diagnosticEnv,
        doctorSecretOption.io,
      ),
      1,
    );
    assert.match(doctorSecretOption.stderr(), /Unknown doctor option: \[redacted\]/);
    assert.doesNotMatch(doctorSecretOption.stderr(), /sk-or-v1-secret-doctor-option/);

    const guideSecretOption = createIo({ cwd });
    assert.equal(
      await runCli(
        ["node", "cli", "guide", "sk-or-v1-secret-guide-option"],
        diagnosticEnv,
        guideSecretOption.io,
      ),
      1,
    );
    assert.match(guideSecretOption.stderr(), /Unknown guide option: \[redacted\]/);
    assert.doesNotMatch(guideSecretOption.stderr(), /sk-or-v1-secret-guide-option/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("namespace help exits successfully without loading config", async () => {
  const cwd = createTempDir();
  const brokenConfigPath = join(cwd, "broken-config.toml");
  writeFileSync(
    brokenConfigPath,
    'api_key = "sk-or-secret-should-not-render"\nthis is not valid toml\n',
  );

  try {
    const env = { ORX_CONFIG_PATH: brokenConfigPath };
    const guideHelp = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "guide", "--help"], env, guideHelp.io), 0);
    assert.match(guideHelp.stdout(), /Usage: orx guide/);
    assert.doesNotMatch(guideHelp.stdout(), /sk-or-secret|Unable to load config/);
    assert.equal(guideHelp.stderr(), "");

    const quickstartHelp = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "quickstart", "-h"], env, quickstartHelp.io), 0);
    assert.match(quickstartHelp.stdout(), /Usage: orx guide/);
    assert.doesNotMatch(quickstartHelp.stdout(), /sk-or-secret|Unable to load config/);
    assert.equal(quickstartHelp.stderr(), "");

    const commands: Array<{ args: string[]; usage: RegExp }> = [
      { args: ["auth"], usage: /Usage: orx auth/ },
      { args: ["config"], usage: /Usage: orx config/ },
      { args: ["profile"], usage: /Usage: orx profile/ },
      { args: ["profiles"], usage: /Usage: orx profile/ },
      { args: ["history"], usage: /Usage: orx history/ },
      { args: ["mcp"], usage: /Usage: orx mcp/ },
      { args: ["plugins"], usage: /Usage: orx plugins/ },
      { args: ["plugin"], usage: /Usage: orx plugins/ },
      { args: ["bins"], usage: /Usage: orx bins/ },
      { args: ["bin"], usage: /Usage: orx bins/ },
      { args: ["hooks"], usage: /Usage: orx hooks/ },
      { args: ["hook"], usage: /Usage: orx hooks/ },
      { args: ["tests"], usage: /Usage: orx tests/ },
      { args: ["test"], usage: /Usage: orx tests/ },
      { args: ["code"], usage: /Usage: orx code/ },
      { args: ["scanners"], usage: /Usage: orx scanners/ },
      { args: ["scanner"], usage: /Usage: orx scanners/ },
      { args: ["scan"], usage: /Usage: orx scan/ },
      { args: ["diagnostics"], usage: /Usage: orx diagnostics/ },
      { args: ["diag"], usage: /Usage: orx diag/ },
      { args: ["orchestrator"], usage: /Usage: orx orchestrator/ },
      { args: ["delegate"], usage: /Usage: orx delegate/ },
      { args: ["delegates"], usage: /Usage: orx delegates/ },
    ];

    for (const { args, usage } of commands) {
      for (const helpArg of ["help", "--help", "-h"]) {
        const help = createIo({ cwd });
        const label = `${args.join(" ")} ${helpArg}`;
        assert.equal(await runCli(["node", "cli", ...args, helpArg], env, help.io), 0, label);
        assert.match(help.stdout(), usage, label);
        assert.doesNotMatch(help.stdout(), /sk-or-secret|Unable to load config/, label);
        assert.equal(help.stderr(), "", label);
      }
    }
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("API command flag help exits successfully without loading config", async () => {
  const cwd = createTempDir();
  const brokenConfigPath = join(cwd, "broken-config.toml");
  writeFileSync(
    brokenConfigPath,
    'api_key = "sk-or-secret-should-not-render"\nthis is not valid toml\n',
  );
  let fetchCalls = 0;
  const fetch = async (): Promise<Response> => {
    fetchCalls += 1;
    throw new Error("help must not call fetch");
  };

  try {
    const env = { ORX_CONFIG_PATH: brokenConfigPath };
    const commands: Array<{ args: string[]; usage: RegExp }> = [
      { args: ["ask", "--help"], usage: /Usage: orx ask/ },
      { args: ["ask", "-h"], usage: /Usage: orx ask/ },
      { args: ["chat", "--help"], usage: /Usage: orx chat/ },
      { args: ["models", "--help"], usage: /Usage: orx models/ },
      { args: ["credits", "--help"], usage: /Usage: orx credits/ },
      { args: ["generation", "--help"], usage: /Usage: orx generation/ },
    ];

    for (const { args, usage } of commands) {
      const help = createIo({ cwd, fetch });
      const label = args.join(" ");
      assert.equal(await runCli(["node", "cli", ...args], env, help.io), 0, label);
      assert.match(help.stdout(), usage, label);
      assert.doesNotMatch(help.stdout(), /sk-or-secret|Unable to load config/, label);
      assert.equal(help.stderr(), "", label);
    }

    const profiledHelp = createIo({ cwd, fetch });
    assert.equal(
      await runCli(["node", "cli", "--profile", "missing", "ask", "--help"], env, profiledHelp.io),
      0,
    );
    assert.match(profiledHelp.stdout(), /Usage: orx ask/);
    assert.match(profiledHelp.stdout(), /--max-tool-iterations <n>/);
    assert.doesNotMatch(profiledHelp.stdout(), /missing|sk-or-secret|Unable to load config/);
    assert.equal(profiledHelp.stderr(), "");

    const askPrompt = createIo({ cwd, fetch });
    assert.equal(await runCli(["node", "cli", "ask", "help"], {}, askPrompt.io), 1);
    assert.equal(askPrompt.stdout(), "");
    assert.match(askPrompt.stderr(), /OpenRouter API key not found/);
    assert.equal(fetchCalls, 0);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("MCP and plugin onboarding subcommand flag help exits successfully without loading config", async () => {
  const cwd = createTempDir();
  const brokenConfigPath = join(cwd, "broken-config.toml");
  writeFileSync(
    brokenConfigPath,
    'api_key = "sk-or-secret-should-not-render"\nthis is not valid toml\n',
  );
  let fetchCalls = 0;
  const fetch = async (): Promise<Response> => {
    fetchCalls += 1;
    throw new Error("help must not call fetch");
  };

  try {
    const env = { ORX_CONFIG_PATH: brokenConfigPath };
    const commands: Array<{ args: string[]; usage: RegExp }> = [
      { args: ["mcp", "plan", "--help"], usage: /Usage: orx mcp plan/ },
      { args: ["mcp", "add-preset", "--help"], usage: /Usage: orx mcp add-preset/ },
      { args: ["mcp", "presets", "--help"], usage: /Usage: orx mcp presets/ },
      { args: ["mcp", "presets", "inspect", "--help"], usage: /Usage: orx mcp presets inspect/ },
      { args: ["plugins", "scaffold", "--help"], usage: /Usage: orx plugins scaffold/ },
      { args: ["plugins", "validate", "--help"], usage: /Usage: orx plugins validate/ },
      { args: ["plugins", "install", "--help"], usage: /Usage: orx plugins install/ },
      { args: ["plugins", "register", "-h"], usage: /Usage: orx plugins register/ },
      { args: ["plugins", "review", "--help"], usage: /Usage: orx plugins review\|doctor\|audit/ },
      { args: ["plugins", "doctor", "--help"], usage: /Usage: orx plugins review\|doctor\|audit/ },
      { args: ["plugins", "audit", "-h"], usage: /Usage: orx plugins review\|doctor\|audit/ },
      { args: ["plugins", "catalog", "--help"], usage: /Usage: orx plugins catalog/ },
    ];

    for (const { args, usage } of commands) {
      const help = createIo({ cwd, fetch });
      const label = args.join(" ");
      assert.equal(await runCli(["node", "cli", ...args], env, help.io), 0, label);
      assert.match(help.stdout(), usage, label);
      assert.doesNotMatch(help.stdout(), /sk-or-secret|Unable to load config/, label);
      assert.equal(help.stderr(), "", label);
    }

    const profiledHelp = createIo({ cwd, fetch });
    assert.equal(
      await runCli(
        ["node", "cli", "--profile", "missing", "mcp", "plan", "--help"],
        env,
        profiledHelp.io,
      ),
      0,
    );
    assert.match(profiledHelp.stdout(), /Usage: orx mcp plan/);
    assert.doesNotMatch(profiledHelp.stdout(), /missing|sk-or-secret|Unable to load config/);
    assert.equal(profiledHelp.stderr(), "");

    const unsupportedCatalogHelp = createIo({ cwd, fetch });
    assert.equal(
      await runCli(["node", "cli", "plugins", "catalog", "bogus", "--help"], {}, unsupportedCatalogHelp.io),
      1,
    );
    assert.equal(unsupportedCatalogHelp.stdout(), "");
    assert.match(unsupportedCatalogHelp.stderr(), /Usage: orx plugins catalog/);

    const unsupportedPluginReviewHelp = createIo({ cwd, fetch });
    assert.equal(
      await runCli(["node", "cli", "plugins", "doctor", "bogus", "--help"], {}, unsupportedPluginReviewHelp.io),
      1,
    );
    assert.equal(unsupportedPluginReviewHelp.stdout(), "");
    assert.match(unsupportedPluginReviewHelp.stderr(), /Usage: orx plugins review\|doctor\|audit/);

    const unsupportedPresetHelp = createIo({ cwd, fetch });
    assert.equal(
      await runCli(["node", "cli", "mcp", "presets", "bogus", "--help"], env, unsupportedPresetHelp.io),
      1,
    );
    assert.equal(unsupportedPresetHelp.stdout(), "");
    assert.match(unsupportedPresetHelp.stderr(), /Usage: orx mcp presets/);
    assert.doesNotMatch(unsupportedPresetHelp.stderr(), /Unable to load config|sk-or-secret/);
    assert.equal(fetchCalls, 0);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("cli init creates a no-secret starter config and is idempotent", async () => {
  const cwd = createTempDir();
  const configPath = join(cwd, "user", "config.toml");
  const env = {
    ORX_CONFIG_PATH: configPath,
  };
  let fetchCalls = 0;
  const fetch = async (): Promise<Response> => {
    fetchCalls += 1;
    throw new Error("init must not call fetch");
  };

  try {
    const first = createIo({ cwd, fetch });
    assert.equal(await runCli(["node", "cli", "init"], env, first.io), 0);
    assert.match(first.stdout(), /ORX init/);
    assert.match(first.stdout(), /state_changed: yes/);
    assert.match(first.stdout(), /scope: user/);
    assert.match(first.stdout(), new RegExp(`path: ${escapeRegExp(configPath)}`));
    assert.match(first.stdout(), /config_exists: no/);
    assert.match(first.stdout(), /model: openrouter\/auto/);
    assert.match(first.stdout(), /mode: auto/);
    assert.match(first.stdout(), /theme: default/);
    assert.match(first.stdout(), /permissions: never\/danger-full-access/);
    assert.match(first.stdout(), /api_key_present: no/);
    assert.match(first.stdout(), /api_key_written: no/);
    assert.match(first.stdout(), /network_calls: none/);
    assert.match(first.stdout(), /subprocesses: none/);
    assert.match(first.stdout(), /set OPENROUTER_API_KEY in your shell or edit config manually/);
    assert.equal(first.stderr(), "");
    assert.equal(statSync(join(cwd, "user")).mode & 0o777, 0o700);
    assert.equal(statSync(configPath).mode & 0o777, 0o600);

    const stored = readFileSync(configPath, "utf8");
    assert.match(stored, /model = "openrouter\/auto"/);
    assert.match(stored, /mode = "auto"/);
    assert.match(stored, /theme = "default"/);
    assert.match(stored, /approval_policy = "never"/);
    assert.match(stored, /sandbox_mode = "danger-full-access"/);
    assert.doesNotMatch(stored, /api_key|openrouter_api_key|OPENROUTER_API_KEY/);

    const second = createIo({ cwd, fetch });
    assert.equal(await runCli(["node", "cli", "init"], env, second.io), 0);
    assert.match(second.stdout(), /state_changed: no/);
    assert.match(second.stdout(), /config_exists: yes/);
    assert.match(second.stdout(), /config_values: unchanged_existing_config/);
    assert.doesNotMatch(second.stdout(), /model: openrouter\/auto/);
    assert.equal(readFileSync(configPath, "utf8"), stored);

    const help = createIo({ cwd, fetch });
    assert.equal(await runCli(["node", "cli", "init", "--help"], env, help.io), 0);
    assert.match(help.stdout(), /Usage: orx init \[--user\|--local\]/);
    assert.equal(help.stderr(), "");

    const secretOption = createIo({ cwd, fetch });
    assert.equal(
      await runCli(["node", "cli", "init", "sk-or-v1-secret-init-option"], env, secretOption.io),
      1,
    );
    assert.match(secretOption.stderr(), /Unknown init option: \[redacted\]/);
    assert.doesNotMatch(secretOption.stderr(), /sk-or-v1-secret-init-option/);
    assert.equal(fetchCalls, 0);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("cli auth reports OpenRouter setup and creates a no-secret env template", async () => {
  const cwd = createTempDir();
  const envFileDir = join(cwd, "auth");
  const env = {
    ORX_AUTH_ENV_DIR: envFileDir,
    ORX_CONFIG_PATH: join(cwd, "config.toml"),
  };
  let fetchCalls = 0;
  const fetch = async (): Promise<Response> => {
    fetchCalls += 1;
    throw new Error("auth must not call fetch");
  };

  try {
    const status = createIo({ cwd, fetch });
    assert.equal(await runCli(["node", "cli", "auth"], env, status.io), 0);
    assert.match(status.stdout(), /ORX OpenRouter auth/);
    assert.match(status.stdout(), /api_key_present: no/);
    assert.match(status.stdout(), /api_key_source: missing/);
    assert.match(status.stdout(), /config_status: loaded/);
    assert.match(status.stdout(), new RegExp(`env_file: ${escapeRegExp(join(envFileDir, "openrouter.env"))}`));
    assert.match(status.stdout(), /env_file_exists: no/);
    assert.match(status.stdout(), /env_file_auto_loaded: no/);
    assert.match(status.stdout(), /cli_secret_args_accepted: no/);
    assert.match(status.stdout(), /config_writes: no/);
    assert.match(status.stdout(), /network_calls: none/);
    assert.match(status.stdout(), /subprocesses: none/);
    assert.match(status.stdout(), /orx auth setup/);
    assert.equal(status.stderr(), "");

    const setup = createIo({ cwd, fetch });
    assert.equal(await runCli(["node", "cli", "auth", "setup"], env, setup.io), 0);
    assert.match(setup.stdout(), /ORX OpenRouter auth setup/);
    assert.match(setup.stdout(), /token_display: never/);
    assert.match(setup.stdout(), /cli_secret_args: refused/);
    assert.match(setup.stdout(), /config_writes: none/);
    assert.match(setup.stdout(), /export OPENROUTER_API_KEY="<openrouter-api-key>"/);
    assert.match(setup.stdout(), /managed_template:\n  orx auth init/);
    assert.doesNotMatch(setup.stdout(), /sk-or-v1-/);
    assert.equal(setup.stderr(), "");

    const init = createIo({ cwd, fetch });
    assert.equal(await runCli(["node", "cli", "auth", "init"], env, init.io), 0);
    const envFilePath = join(envFileDir, "openrouter.env");
    assert.match(init.stdout(), /ORX OpenRouter auth env file/);
    assert.match(init.stdout(), /state_changed: yes/);
    assert.match(init.stdout(), new RegExp(`path: ${escapeRegExp(envFilePath)}`));
    assert.match(init.stdout(), /api_key_written: no/);
    assert.match(init.stdout(), /template_exports_commented: yes/);
    assert.match(init.stdout(), /directory_mode: 0700/);
    assert.match(init.stdout(), /file_mode: 0600/);
    assert.match(init.stdout(), /config_writes: none/);
    assert.match(init.stdout(), /network_calls: none/);
    assert.match(init.stdout(), /subprocesses: none/);
    assert.equal(init.stderr(), "");
    assert.equal(statSync(envFileDir).mode & 0o777, 0o700);
    assert.equal(statSync(envFilePath).mode & 0o777, 0o600);
    const stored = readFileSync(envFilePath, "utf8");
    assert.match(stored, /# ORX OpenRouter auth env template/);
    assert.match(stored, /# export OPENROUTER_API_KEY="<openrouter-api-key>"/);
    assert.doesNotMatch(stored, /^export OPENROUTER_API_KEY=/m);
    assert.doesNotMatch(stored, /sk-or-v1-/);

    const secondInit = createIo({ cwd, fetch });
    assert.equal(await runCli(["node", "cli", "auth", "env-file"], env, secondInit.io), 0);
    assert.match(secondInit.stdout(), /state_changed: no/);
    assert.match(secondInit.stdout(), /file_mode: unchanged_existing_file/);
    assert.equal(readFileSync(envFilePath, "utf8"), stored);

    const keyedStatus = createIo({ cwd, fetch });
    assert.equal(
      await runCli(
        ["node", "cli", "auth", "status"],
        { ...env, OPENROUTER_API_KEY: "sk-or-v1-test-auth-secret" },
        keyedStatus.io,
      ),
      0,
    );
    assert.match(keyedStatus.stdout(), /api_key_present: yes/);
    assert.match(keyedStatus.stdout(), /api_key_source: OPENROUTER_API_KEY/);
    assert.doesNotMatch(keyedStatus.stdout(), /sk-or-v1-test-auth-secret/);

    const help = createIo({ cwd, fetch });
    assert.equal(await runCli(["node", "cli", "auth", "--help"], env, help.io), 0);
    assert.match(help.stdout(), /Usage: orx auth \[status\|setup\|env\|init\|env-file\]/);
    assert.equal(help.stderr(), "");
    assert.equal(fetchCalls, 0);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("cli auth does not parse or leak malformed config and redacts secret-shaped args", async () => {
  const cwd = createTempDir();
  const configPath = join(cwd, "bad-config.toml");
  writeFileSync(configPath, 'api_key = "sk-or-v1-malformed-auth-secret\n');
  const env = {
    ORX_CONFIG_PATH: configPath,
    ORX_AUTH_ENV_DIR: join(cwd, "auth"),
  };

  try {
    const status = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "auth", "status"], env, status.io), 0);
    assert.match(status.stdout(), /config_status: unreadable/);
    assert.match(status.stdout(), /api_key_source: config_unreadable/);
    assert.equal(status.stderr(), "");

    const setup = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "auth", "setup"], env, setup.io), 0);
    assert.match(setup.stdout(), /config_status: unreadable|api_key_source: config_unreadable/);
    assert.equal(setup.stderr(), "");

    const unknown = createIo({ cwd });
    assert.equal(
      await runCli(["node", "cli", "auth", "sk-or-v1-secret-auth-option"], env, unknown.io),
      1,
    );
    assert.match(unknown.stderr(), /Unknown auth command: \[redacted\]/);

    const unexpected = createIo({ cwd });
    assert.equal(
      await runCli(
        ["node", "cli", "auth", "setup", "sk-or-v1-secret-auth-extra"],
        env,
        unexpected.io,
      ),
      1,
    );
    assert.match(unexpected.stderr(), /Unexpected auth argument for setup: \[redacted\]/);

    const generalStatus = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "status"], env, generalStatus.io), 1);
    assert.match(generalStatus.stderr(), /Unable to load config: config file is unreadable or invalid/);
    assert.match(generalStatus.stderr(), /Run orx auth for credential status/);

    const configPathRecovery = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "config", "path"], env, configPathRecovery.io), 0);
    assert.match(configPathRecovery.stdout(), /ORX config paths/);
    assert.match(configPathRecovery.stdout(), /effective_sources: not_evaluated_config_unreadable/);
    assert.match(configPathRecovery.stdout(), new RegExp(`user: ${escapeRegExp(configPath)}`));
    assert.equal(configPathRecovery.stderr(), "");

    const combinedOutput = [
      status.stdout(),
      status.stderr(),
      setup.stdout(),
      setup.stderr(),
      unknown.stdout(),
      unknown.stderr(),
      unexpected.stdout(),
      unexpected.stderr(),
      generalStatus.stdout(),
      generalStatus.stderr(),
      configPathRecovery.stdout(),
      configPathRecovery.stderr(),
    ].join("\n");
    assert.doesNotMatch(combinedOutput, /sk-or-v1-malformed-auth-secret/);
    assert.doesNotMatch(combinedOutput, /sk-or-v1-secret-auth-option/);
    assert.doesNotMatch(combinedOutput, /sk-or-v1-secret-auth-extra/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("cli auth init refuses direct and parent auth env-file symlinks", async () => {
  const cwd = createTempDir();

  try {
    const directDir = join(cwd, "direct");
    mkdirSync(directDir, { recursive: true });
    const targetPath = join(cwd, "target.env");
    writeFileSync(targetPath, "# target\n");
    symlinkSync(targetPath, join(directDir, "openrouter.env"));
    const direct = createIo({ cwd });
    assert.equal(
      await runCli(["node", "cli", "auth", "init"], { ORX_AUTH_ENV_DIR: directDir }, direct.io),
      1,
    );
    assert.match(direct.stderr(), /refusing to write through an auth env-file symlink/);
    assert.equal(readFileSync(targetPath, "utf8"), "# target\n");

    const actualParent = join(cwd, "actual-parent");
    const linkedParent = join(cwd, "linked-parent");
    mkdirSync(actualParent, { recursive: true });
    symlinkSync(actualParent, linkedParent);
    const parent = createIo({ cwd });
    assert.equal(
      await runCli(
        ["node", "cli", "auth", "init"],
        { ORX_AUTH_ENV_DIR: join(linkedParent, "nested") },
        parent.io,
      ),
      1,
    );
    assert.match(parent.stderr(), /refusing to write through an auth env-file parent symlink/);
    assert.equal(existsSync(join(actualParent, "nested", "openrouter.env")), false);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("cli init leaves existing config unchanged without reporting starter defaults", async () => {
  const cwd = createTempDir();
  const configPath = join(cwd, "custom-config.toml");
  const existing = [
    'model = "anthropic/claude-sonnet-4.5"',
    'mode = "exact"',
    'theme = "vivid"',
    "[permissions]",
    'approval_policy = "on-request"',
    'sandbox_mode = "workspace-write"',
    "",
  ].join("\n");
  writeFileSync(configPath, existing);

  try {
    const init = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "init"], { ORX_CONFIG_PATH: configPath }, init.io), 0);
    assert.match(init.stdout(), /state_changed: no/);
    assert.match(init.stdout(), /config_exists: yes/);
    assert.match(init.stdout(), /config_values: unchanged_existing_config/);
    assert.match(init.stdout(), /api_key_present: not_evaluated_existing_config/);
    assert.doesNotMatch(init.stdout(), /model: openrouter\/auto/);
    assert.doesNotMatch(init.stdout(), /mode: auto/);
    assert.doesNotMatch(init.stdout(), /theme: default/);
    assert.doesNotMatch(init.stdout(), /permissions: never\/danger-full-access/);
    assert.equal(init.stderr(), "");
    assert.equal(readFileSync(configPath, "utf8"), existing);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("cli init and setup do not parse or leak malformed existing config", async () => {
  const cwd = createTempDir();
  const configPath = join(cwd, "bad-config.toml");
  writeFileSync(configPath, 'api_key = "sk-or-v1-malformed-init-secret\n');
  const env = {
    ORX_CONFIG_PATH: configPath,
  };

  try {
    const initHelp = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "init", "--help"], env, initHelp.io), 0);
    assert.match(initHelp.stdout(), /Usage: orx init \[--user\|--local\]/);
    assert.equal(initHelp.stderr(), "");

    const setupHelp = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "setup", "--help"], env, setupHelp.io), 0);
    assert.match(setupHelp.stdout(), /Usage: orx setup \[--user\|--local\]/);
    assert.equal(setupHelp.stderr(), "");

    const configInitHelp = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "config", "init", "--help"], env, configInitHelp.io), 0);
    assert.match(configInitHelp.stdout(), /Usage: orx config init \[--user\|--local\]/);
    assert.equal(configInitHelp.stderr(), "");

    const init = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "init"], env, init.io), 0);
    assert.match(init.stdout(), /state_changed: no/);
    assert.match(init.stdout(), /config_values: unchanged_existing_config/);
    assert.match(init.stdout(), /api_key_present: not_evaluated_existing_config/);
    assert.equal(init.stderr(), "");

    const setupUnknown = createIo({ cwd });
    assert.equal(
      await runCli(["node", "cli", "setup", "sk-or-v1-secret-setup-option"], env, setupUnknown.io),
      1,
    );
    assert.match(setupUnknown.stderr(), /Unknown setup option: \[redacted\]/);

    const combinedOutput = [
      initHelp.stdout(),
      initHelp.stderr(),
      setupHelp.stdout(),
      setupHelp.stderr(),
      configInitHelp.stdout(),
      configInitHelp.stderr(),
      init.stdout(),
      init.stderr(),
      setupUnknown.stdout(),
      setupUnknown.stderr(),
    ].join("\n");
    assert.doesNotMatch(combinedOutput, /sk-or-v1-malformed-init-secret/);
    assert.doesNotMatch(combinedOutput, /sk-or-v1-secret-setup-option/);
    assert.equal(readFileSync(configPath, "utf8"), 'api_key = "sk-or-v1-malformed-init-secret\n');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("cli init supports local scope and config init alias", async () => {
  const cwd = createTempDir();
  const localConfigPath = join(cwd, ".orx", "config.toml");
  const userConfigPath = join(cwd, "user-config.toml");
  const env = {
    ORX_CONFIG_PATH: userConfigPath,
    OPENROUTER_API_KEY: "sk-or-v1-test-init",
  };

  try {
    const local = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "init", "--local"], env, local.io), 0);
    assert.match(local.stdout(), /state_changed: yes/);
    assert.match(local.stdout(), /scope: local/);
    assert.match(local.stdout(), new RegExp(`path: ${escapeRegExp(localConfigPath)}`));
    assert.match(local.stdout(), /api_key_present: yes/);
    assert.doesNotMatch(local.stdout(), /sk-or-v1-test-init/);
    assert.equal(existsSync(localConfigPath), true);
    assert.equal(existsSync(userConfigPath), false);

    const user = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "config", "init"], env, user.io), 0);
    assert.match(user.stdout(), /ORX init/);
    assert.match(user.stdout(), /scope: user/);
    assert.match(user.stdout(), new RegExp(`path: ${escapeRegExp(userConfigPath)}`));
    assert.equal(existsSync(userConfigPath), true);
    assert.doesNotMatch(readFileSync(localConfigPath, "utf8"), /api_key/);
    assert.doesNotMatch(readFileSync(userConfigPath, "utf8"), /api_key/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("cli doctor does not treat saved delegation teams as active chat delegates", async () => {
  const cwd = createTempDir();
  const env = {
    OPENROUTER_API_KEY: "sk-or-v1-test-doctor",
    ORX_DELEGATION_POLICY_PATH: join(cwd, "delegation", "policy.json"),
    ORX_DELEGATION_TEAMS_PATH: join(cwd, "delegation", "teams.json"),
    ORX_MCP_CONFIG_PATH: join(cwd, "mcp", "profiles.json"),
    ORX_MCP_PROFILE_CATALOG_PATH: join(cwd, "mcp", "profile-catalog.json"),
    ORX_PLUGIN_REGISTRY_PATH: join(cwd, "plugins", "registry.json"),
    ORX_PLUGIN_CATALOG_PATH: join(cwd, "plugins", "catalog.json"),
    ORX_PLUGIN_BINS_CONFIG_PATH: join(cwd, "plugins", "bins.json"),
    ORX_PLUGIN_HOOKS_CONFIG_PATH: join(cwd, "plugins", "hooks.json"),
    ORX_PROFILE_CONFIG_PATH: join(cwd, "profiles.json"),
  };
  const fetch = async (): Promise<Response> => {
    throw new Error("doctor delegation readiness test must not call fetch");
  };

  try {
    const policy = createIo({ cwd, fetch });
    assert.equal(
      await runCli(
        ["node", "cli", "delegates", "policy", "set", "--execution", "enabled"],
        env,
        policy.io,
      ),
      0,
    );

    const saved = createIo({ cwd, fetch });
    assert.equal(
      await runCli(
        [
          "node",
          "cli",
          "delegates",
          "save",
          "review",
          "--controller",
          "openrouter/fusion",
          "--delegate",
          "reviewer",
          "anthropic/claude-sonnet-4.5",
        ],
        env,
        saved.io,
      ),
      0,
    );

    const doctor = createIo({ cwd, fetch });
    assert.equal(await runCli(["node", "cli", "doctor"], env, doctor.io), 0);
    assert.match(doctor.stdout(), /overall: ready_for_interactive_coding/);
    assert.match(doctor.stdout(), /ready_to_use: yes/);
    assert.match(doctor.stdout(), /chat: ready/);
    assert.match(doctor.stdout(), /delegation: policy_enabled_saved_team_available/);
    assert.match(doctor.stdout(), /execution_policy: enabled/);
    assert.match(doctor.stdout(), /saved_teams: 1/);
    assert.match(doctor.stdout(), /chat_readiness: not_evaluated_sessionless_cli/);
    assert.match(
      doctor.stdout(),
      /chat_delegate_requirement: active_chat_session_delegate_required/,
    );
    assert.match(doctor.stdout(), /saved_team_availability: available_load_in_chat/);
    assert.doesNotMatch(doctor.stdout(), /sk-or-v1-test-doctor/);
    assert.equal(doctor.stderr(), "");

    const strictDoctor = createIo({ cwd, fetch });
    assert.equal(await runCli(["node", "cli", "doctor", "--strict"], env, strictDoctor.io), 0);
    assert.match(strictDoctor.stdout(), /ready_to_use: yes/);
    assert.doesNotMatch(strictDoctor.stdout(), /sk-or-v1-test-doctor/);
    assert.equal(strictDoctor.stderr(), "");

    const strictJsonDoctor = createIo({ cwd, fetch });
    assert.equal(await runCli(["node", "cli", "doctor", "--strict", "--json"], env, strictJsonDoctor.io), 0);
    const jsonReport = JSON.parse(strictJsonDoctor.stdout());
    assert.equal(jsonReport.summary.ready_to_use, "yes");
    assert.equal(jsonReport.strict_ready, true);
    assert.equal(jsonReport.summary.overall, "ready_for_interactive_coding");
    assert.equal(jsonReport.runtime.api_key_present, true);
    assert.equal(jsonReport.runtime.api_key_source, "OPENROUTER_API_KEY");
    assert.equal(jsonReport.delegation.execution_policy, "enabled");
    assert.equal(jsonReport.delegation.saved_teams, 1);
    assert.doesNotMatch(strictJsonDoctor.stdout(), /sk-or-v1-test-doctor/);
    assert.equal(strictJsonDoctor.stderr(), "");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("cli config commands show paths and edit non-secret settings without an API key", async () => {
  const cwd = createTempDir();
  const configPath = join(cwd, "user-config.toml");
  const env = {
    ORX_CONFIG_PATH: configPath,
  };
  let fetchCalls = 0;
  const fetch = async (): Promise<Response> => {
    fetchCalls += 1;
    throw new Error("config commands must not call fetch");
  };

  try {
    const show = createIo({ cwd, fetch });
    assert.equal(await runCli(["node", "cli", "config"], env, show.io), 0);
    assert.match(show.stdout(), /ORX config/);
    assert.match(show.stdout(), /config_source: built-in defaults/);
    assert.match(show.stdout(), /api_key: missing/);
    assert.match(show.stdout(), /editable_keys: model, mode, fusion_preset, theme, approval_policy, sandbox_mode/);
    assert.doesNotMatch(show.stdout(), /sk-or-v1/);
    assert.equal(show.stderr(), "");

    const paths = createIo({ cwd, fetch });
    assert.equal(await runCli(["node", "cli", "config", "path"], env, paths.io), 0);
    assert.match(paths.stdout(), new RegExp(`user: ${escapeRegExp(configPath)} exists=no`));
    assert.match(paths.stdout(), /user_env_override: ORX_CONFIG_PATH/);
    assert.match(paths.stdout(), /edit_default: user/);
    assert.equal(paths.stderr(), "");

    const theme = createIo({ cwd, fetch });
    assert.equal(await runCli(["node", "cli", "config", "set", "theme", "vivid"], env, theme.io), 0);
    assert.match(theme.stdout(), /ORX config updated/);
    assert.match(theme.stdout(), /key: theme/);
    assert.match(theme.stdout(), /api_key: unchanged/);

    const mode = createIo({ cwd, fetch });
    assert.equal(await runCli(["node", "cli", "config", "set", "mode", "fusion"], env, mode.io), 0);
    const model = createIo({ cwd, fetch });
    assert.equal(
      await runCli(["node", "cli", "config", "set", "model", "openrouter/fusion"], env, model.io),
      0,
    );
    const fusion = createIo({ cwd, fetch });
    assert.equal(
      await runCli(["node", "cli", "config", "set", "fusion-preset", "general-budget"], env, fusion.io),
      0,
    );

    const status = createIo({ cwd, fetch });
    assert.equal(await runCli(["node", "cli", "status"], env, status.io), 0);
    assert.match(status.stdout(), /mode: fusion/);
    assert.match(status.stdout(), /model: openrouter\/fusion/);
    assert.match(status.stdout(), /fusion_preset: general-budget/);
    assert.match(status.stdout(), /theme: vivid/);

    const stored = readFileSync(configPath, "utf8");
    assert.match(stored, /theme = "vivid"/);
    assert.match(stored, /mode = "fusion"/);
    assert.match(stored, /model = "openrouter\/fusion"/);
    assert.match(stored, /fusion_preset = "general-budget"/);
    assert.doesNotMatch(stored, /api_key/);

    const secret = createIo({ cwd, fetch });
    assert.equal(
      await runCli(["node", "cli", "config", "set", "api_key", "sk-or-v1-secret"], env, secret.io),
      1,
    );
    assert.equal(secret.stdout(), "");
    assert.match(secret.stderr(), /Refusing to store API keys/);
    assert.doesNotMatch(secret.stderr(), /sk-or-v1-secret/);
    assert.equal(fetchCalls, 0);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("cli config --local edits the discovered ancestor local config from subdirectories", async () => {
  const root = createTempDir();
  const cwd = join(root, "nested", "project");
  const localConfigPath = join(root, ".orx", "config.toml");
  const nestedConfigPath = join(cwd, ".orx", "config.toml");

  try {
    mkdirSync(join(root, ".orx"), { recursive: true });
    mkdirSync(cwd, { recursive: true });
    writeFileSync(localConfigPath, ['theme = "default"', ""].join("\n"));

    const paths = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "config", "path"], {}, paths.io), 0);
    assert.match(paths.stdout(), new RegExp(`effective_sources: ${escapeRegExp(localConfigPath)}`));
    assert.match(paths.stdout(), new RegExp(`local: ${escapeRegExp(localConfigPath)} exists=yes`));

    const set = createIo({ cwd });
    assert.equal(
      await runCli(["node", "cli", "config", "set", "theme", "mono", "--local"], {}, set.io),
      0,
    );
    assert.match(set.stdout(), new RegExp(`path: ${escapeRegExp(localConfigPath)}`));
    assert.match(readFileSync(localConfigPath, "utf8"), /theme = "mono"/);
    assert.equal(existsSync(nestedConfigPath), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("cli history searches and clears local prompt history without an API key", async () => {
  const cwd = createTempDir();
  const historyPath = join(cwd, "history", "prompts.json");
  const env = {
    ORX_CHAT_HISTORY_PATH: historyPath,
  };
  let fetchCalls = 0;
  const fetch = async (): Promise<Response> => {
    fetchCalls += 1;
    throw new Error("history commands must not call fetch");
  };

  try {
    appendChatHistoryEntry("Review MCP provider preset flow", { historyPath });
    appendChatHistoryEntry("Polish TTY prompt history", { historyPath });

    const list = createIo({ cwd, fetch });
    assert.equal(await runCli(["node", "cli", "history"], env, list.io), 0);
    assert.match(list.stdout(), /Prompt history:/);
    assert.match(list.stdout(), /Polish TTY prompt history/);
    assert.match(list.stdout(), /Review MCP provider preset flow/);
    assert.match(list.stdout(), new RegExp(`history_path: ${escapeRegExp(historyPath)}`));
    assert.equal(list.stderr(), "");

    const search = createIo({ cwd, fetch });
    assert.equal(await runCli(["node", "cli", "history", "search", "provider"], env, search.io), 0);
    assert.match(search.stdout(), /Prompt history matching "provider"/);
    assert.match(search.stdout(), /Review MCP provider preset flow/);
    assert.doesNotMatch(search.stdout(), /Polish TTY prompt history/);
    assert.equal(search.stderr(), "");

    const clear = createIo({ cwd, fetch });
    assert.equal(await runCli(["node", "cli", "history", "clear"], env, clear.io), 0);
    assert.match(clear.stdout(), /Prompt history cleared/);
    assert.match(clear.stdout(), /state_changed: yes/);
    assert.equal(clear.stderr(), "");

    const empty = createIo({ cwd, fetch });
    assert.equal(await runCli(["node", "cli", "history"], env, empty.io), 0);
    assert.match(empty.stdout(), /No prompt history found/);
    assert.equal(fetchCalls, 0);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("cli profile-independent state commands bypass saved profile loading", async () => {
  const cwd = createTempDir();
  try {
    const configPath = join(cwd, "invalid-config.toml");
    const profileConfigPath = join(cwd, "profiles.json");
    writeFileSync(configPath, 'api_key = "sk-or-v1-malformed\n');
    writeFileSync(profileConfigPath, "{}\n");

    const env = {
      ORX_CONFIG_PATH: configPath,
      ORX_PROFILE_CONFIG_PATH: profileConfigPath,
      ORX_CHAT_HISTORY_PATH: join(cwd, "history.json"),
      ORX_MCP_CONFIG_PATH: join(cwd, "mcp", "profiles.json"),
      ORX_MCP_PROFILE_CATALOG_PATH: join(cwd, "mcp", "profile-catalog.json"),
      ORX_PLUGIN_REGISTRY_PATH: join(cwd, "plugins", "registry.json"),
      ORX_PLUGIN_CATALOG_PATH: join(cwd, "plugins", "catalog.json"),
      ORX_PLUGIN_BINS_CONFIG_PATH: join(cwd, "plugins", "bins.json"),
      ORX_PLUGIN_HOOKS_CONFIG_PATH: join(cwd, "plugins", "hooks.json"),
      ORX_DELEGATION_TEAMS_PATH: join(cwd, "delegation", "teams.json"),
      ORX_DELEGATION_POLICY_PATH: join(cwd, "delegation", "policy.json"),
    };

    const cases: Array<{ argv: string[]; stdout: RegExp }> = [
      { argv: ["history"], stdout: /No prompt history found|Prompt history:/ },
      { argv: ["plugins", "review", "--json"], stdout: /"surface": "orx\.plugin_review"/ },
      { argv: ["bins", "list"], stdout: /Bins/ },
      { argv: ["hooks", "list"], stdout: /Hooks/ },
      { argv: ["mcp", "list"], stdout: /MCP\n/ },
      { argv: ["orchestrator", "status"], stdout: /ORX orchestrator session:/ },
      { argv: ["delegate", "status"], stdout: /ORX delegates/ },
      { argv: ["delegates", "status"], stdout: /ORX delegates/ },
    ];

    for (const entry of cases) {
      chmodSync(profileConfigPath, 0o666);
      const io = createIo({ cwd });
      assert.equal(await runCli(["node", "cli", "--profile", "demo", ...entry.argv], env, io.io), 0);
      assert.match(io.stdout(), entry.stdout);
      assert.equal(io.stderr(), "");
      assert.equal(statSync(profileConfigPath).mode & 0o777, 0o666);
    }
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("cli delegation commands render readiness and refuse session-less mutation without an API key", async () => {
  const fetch = async (): Promise<Response> => {
    throw new Error("delegation CLI must not make network calls");
  };

  const orchestrator = createIo({ fetch });
  assert.equal(await runCli(["node", "cli", "orchestrator"], {}, orchestrator.io), 0);
  assert.match(orchestrator.stdout(), /ORX orchestrator session:/);
  assert.match(orchestrator.stdout(), /controller: none/);
  assert.match(orchestrator.stdout(), /ORX delegation readiness:/);
  assert.match(orchestrator.stdout(), /state_scope: cli-saved-teams-available/);
  assert.match(orchestrator.stdout(), /delegate_task: unavailable/);
  assert.match(orchestrator.stdout(), /network_calls: none/);
  assert.match(orchestrator.stdout(), /subprocesses: none/);
  assert.match(orchestrator.stdout(), /noninteractive CLI cannot attach a saved team to a live chat session/);
  assert.equal(orchestrator.stderr(), "");

  const delegates = createIo({ fetch });
  assert.equal(await runCli(["node", "cli", "delegates", "plan"], {}, delegates.io), 0);
  assert.match(delegates.stdout(), /ORX delegates session:/);
  assert.match(delegates.stdout(), /delegates: 0/);
  assert.match(delegates.stdout(), /delegation execution policy must be enabled before model exposure/);
  assert.equal(delegates.stderr(), "");

  const refusedController = createIo({ fetch });
  assert.equal(
    await runCli(
      ["node", "cli", "orchestrator", "openrouter", "openrouter/fusion"],
      {},
      refusedController.io,
    ),
    1,
  );
  assert.equal(refusedController.stdout(), "");
  assert.match(refusedController.stderr(), /status: refused/);
  assert.match(refusedController.stderr(), /action: orchestrator openrouter openrouter\/fusion/);
  assert.match(refusedController.stderr(), /state_changed: no/);
  assert.match(refusedController.stderr(), /model_exposure: none/);
  assert.match(refusedController.stderr(), /network_calls: none/);
  assert.match(refusedController.stderr(), /subprocesses: none/);

  const refusedDelegate = createIo({ fetch });
  assert.equal(
    await runCli(
      ["node", "cli", "delegate", "add", "reviewer", "openrouter", "anthropic/claude-sonnet-4.5"],
      {},
      refusedDelegate.io,
    ),
    1,
  );
  assert.equal(refusedDelegate.stdout(), "");
  assert.match(
    refusedDelegate.stderr(),
    /action: delegate add reviewer openrouter anthropic\/claude-sonnet-4\.5/,
  );
  assert.match(refusedDelegate.stderr(), /delegate_task: unavailable/);

  const unsafe = createIo({ fetch });
  assert.equal(
    await runCli(
      ["node", "cli", "delegate", "add", "Reviewer", "openrouter", "openrouter/auto"],
      {},
      unsafe.io,
    ),
    1,
  );
  assert.equal(unsafe.stdout(), "");
  assert.match(unsafe.stderr(), /Delegate name must match/);
});

test("cli delegation policy commands persist gated limits without an API key or network", async () => {
  let fetchCalls = 0;
  const cwd = createTempDir();
  const policyPath = join(cwd, "delegation", "policy.json");
  const env = { ORX_DELEGATION_POLICY_PATH: policyPath };
  const fetch = async (): Promise<Response> => {
    fetchCalls += 1;
    throw new Error("delegation policy CLI must not make network calls");
  };

  try {
    const initial = createIo({ cwd, fetch });
    assert.equal(await runCli(["node", "cli", "delegate", "policy"], env, initial.io), 0);
    assert.match(initial.stdout(), /ORX delegation execution policy:/);
    assert.match(initial.stdout(), /policy_path: .*policy\.json/);
    assert.match(initial.stdout(), /execution: disabled/);
    assert.match(initial.stdout(), /delegate_task: unavailable/);
    assert.match(initial.stdout(), /max_task_cost_usd: 0\.25/);
    assert.equal(initial.stderr(), "");

    const updated = createIo({ cwd, fetch });
    assert.equal(
      await runCli(
        [
          "node",
          "cli",
          "delegates",
          "policy",
          "set",
          "--max-cost-usd",
          "0.5",
          "--timeout-ms",
          "60000",
          "--max-result-bytes",
          "50000",
          "--max-concurrent",
          "2",
          "--credentials",
          "none",
          "--result-persistence",
          "none",
          "--result-merge",
          "metadata_only",
        ],
        env,
        updated.io,
      ),
      0,
    );
    assert.match(updated.stdout(), /Delegation execution policy saved/);
    assert.match(updated.stdout(), /max_task_cost_usd: 0\.5/);
    assert.match(updated.stdout(), /task_timeout_ms: 60000/);
    assert.match(updated.stdout(), /max_result_bytes: 50000/);
    assert.match(updated.stdout(), /max_concurrent_delegates: 2/);
    assert.match(updated.stdout(), /result_merge: metadata_only/);
    assert.equal(statSync(join(cwd, "delegation")).mode & 0o777, 0o700);
    assert.equal(statSync(policyPath).mode & 0o777, 0o600);
    assert.doesNotMatch(readFileSync(policyPath, "utf8"), /test-key|OPENROUTER_API_KEY/);

    const invalid = createIo({ cwd, fetch });
    assert.equal(
      await runCli(
        ["node", "cli", "delegate", "policy", "set", "--credentials", "env"],
        env,
        invalid.io,
      ),
      1,
    );
    assert.match(invalid.stderr(), /--credentials must be none/);

    const status = createIo({ cwd, fetch });
    assert.equal(await runCli(["node", "cli", "status"], env, status.io), 0);
    assert.match(status.stdout(), /delegation_policy_path: .*policy\.json/);
    assert.match(status.stdout(), /delegation_policy_max_task_cost_usd: 0\.5/);
    assert.match(status.stdout(), /delegation_policy_max_concurrent_delegates: 2/);
    assert.equal(fetchCalls, 0);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("cli delegation team commands manage a private disabled registry without an API key", async () => {
  let fetchCalls = 0;
  const fetch = async (): Promise<Response> => {
    fetchCalls += 1;
    throw new Error("delegation team CLI must not make network calls");
  };
  const cwd = createTempDir();
  const teamsPath = join(cwd, "delegation", "teams.json");
  const policyPath = join(cwd, "delegation", "policy.json");
  const env = {
    ORX_DELEGATION_TEAMS_PATH: teamsPath,
    ORX_DELEGATION_POLICY_PATH: policyPath,
  };

  try {
    const empty = createIo({ cwd, fetch });
    assert.equal(await runCli(["node", "cli", "delegates", "teams"], env, empty.io), 0);
    assert.match(empty.stdout(), /ORX delegation teams:/);
    assert.match(empty.stdout(), /saved_teams: 0/);
    assert.equal(empty.stderr(), "");

    const saved = createIo({ cwd, fetch });
    assert.equal(
      await runCli(
        [
          "node",
          "cli",
          "delegates",
          "save",
          "Review-Team",
          "--controller",
          "openrouter/fusion",
          "--delegate",
          "reviewer",
          "anthropic/claude-sonnet-4.5",
        ],
        env,
        saved.io,
      ),
      0,
    );
    assert.match(saved.stdout(), /Delegation team review-team saved/);
    assert.match(saved.stdout(), /delegation execution stays policy-gated/);
    assert.equal(statSync(join(cwd, "delegation")).mode & 0o777, 0o700);
    assert.equal(statSync(teamsPath).mode & 0o777, 0o600);
    assert.doesNotMatch(readFileSync(teamsPath, "utf8"), /OPENROUTER_API_KEY|api_key/);

    const listed = createIo({ cwd, fetch });
    assert.equal(await runCli(["node", "cli", "delegates", "teams", "list"], env, listed.io), 0);
    assert.match(listed.stdout(), /saved_teams: 1/);
    assert.match(listed.stdout(), /review-team controller=openrouter:openrouter\/fusion delegates=1/);

    const inspected = createIo({ cwd, fetch });
    assert.equal(
      await runCli(["node", "cli", "delegates", "inspect", "review-team"], env, inspected.io),
      0,
    );
    assert.match(inspected.stdout(), /ORX delegation team: review-team/);
    assert.match(inspected.stdout(), /stored_delegate_task: unavailable/);
    assert.match(
      inspected.stdout(),
      /reviewer: provider=openrouter model=anthropic\/claude-sonnet-4\.5 execution=disabled/,
    );

    const planned = createIo({ cwd, fetch });
    assert.equal(
      await runCli(["node", "cli", "delegates", "plan", "review-team"], env, planned.io),
      0,
    );
    assert.match(planned.stdout(), /ORX delegation saved-team readiness: review-team/);
    assert.match(planned.stdout(), /state_changed: no/);
    assert.match(planned.stdout(), /source: saved_team_registry/);
    assert.match(planned.stdout(), /team_load: available_inside_interactive_chat_only/);
    assert.match(planned.stdout(), /controller: openrouter openrouter\/fusion/);
    assert.match(planned.stdout(), /delegate_count: 1/);
    assert.match(planned.stdout(), /delegation execution policy must be enabled before model exposure/);
    assert.match(planned.stdout(), /noninteractive CLI cannot attach a saved team to a live chat session/);
    assert.equal(planned.stderr(), "");

    const enabledPolicy = createIo({ cwd, fetch });
    assert.equal(
      await runCli(
        ["node", "cli", "delegate", "policy", "set", "--execution", "enabled"],
        env,
        enabledPolicy.io,
      ),
      0,
    );

    const plannedWithPolicy = createIo({ cwd, fetch });
    assert.equal(
      await runCli(["node", "cli", "delegate", "plan", "review-team"], env, plannedWithPolicy.io),
      0,
    );
    assert.match(plannedWithPolicy.stdout(), /ORX delegation saved-team readiness: review-team/);
    assert.match(plannedWithPolicy.stdout(), /execution: enabled/);
    assert.doesNotMatch(
      plannedWithPolicy.stdout(),
      /delegation execution policy must be enabled before model exposure/,
    );
    assert.match(plannedWithPolicy.stdout(), /noninteractive CLI cannot attach a saved team to a live chat session/);
    assert.match(plannedWithPolicy.stdout(), /state_changed: no/);

    const secretMissingDelegates = createIo({ cwd, fetch });
    assert.equal(
      await runCli(["node", "cli", "delegates", "plan", "sk-or-v1-abc123"], env, secretMissingDelegates.io),
      1,
    );
    assert.match(secretMissingDelegates.stderr(), /Unknown delegation team: \[redacted\]/);
    assert.doesNotMatch(secretMissingDelegates.stderr(), /sk-or-v1-abc123/);

    const secretMissingDelegate = createIo({ cwd, fetch });
    assert.equal(
      await runCli(["node", "cli", "delegate", "plan", "sk-or-v1-abc123"], env, secretMissingDelegate.io),
      1,
    );
    assert.match(secretMissingDelegate.stderr(), /Unknown delegation team: \[redacted\]/);
    assert.doesNotMatch(secretMissingDelegate.stderr(), /sk-or-v1-abc123/);

    const used = createIo({ cwd, fetch });
    assert.equal(await runCli(["node", "cli", "delegates", "use", "review-team"], env, used.io), 0);
    assert.match(used.stdout(), /state_changed: no/);
    assert.match(used.stdout(), /noninteractive CLI has no active delegation session/);
    assert.match(used.stdout(), /execution_policy: unchanged/);
    assert.match(used.stdout(), /delegate_task: unavailable_in_cli/);
    assert.doesNotMatch(used.stdout(), /scaffold metadata/);

    const deleted = createIo({ cwd, fetch });
    assert.equal(
      await runCli(["node", "cli", "delegates", "delete", "review-team"], env, deleted.io),
      0,
    );
    assert.match(deleted.stdout(), /Delegation team review-team deleted/);
    assert.equal(fetchCalls, 0);
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
    assert.match(listed.stdout(), /framework=unknown/);
    assert.equal(listed.stderr(), "");

    const listJson = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "tests", "--json"], {}, listJson.io), 0);
    const listReport = JSON.parse(listJson.stdout());
    assert.equal(listReport.schema_version, 1);
    assert.equal(listReport.surface, "orx.test_targets");
    assert.equal(listReport.operator_only, true);
    assert.equal(listReport.execution, "none_for_list_or_status");
    assert.equal(listReport.network, "none_for_list_or_status");
    assert.equal(listReport.report_files, "not_read_by_list_or_status");
    assert.equal(listReport.target_count, 2);
    assert.equal(listReport.default_target_id, "script:test");
    assert.equal(listReport.framework_counts.unknown, 2);
    assert.deepEqual(
      listReport.targets.map((target: { id: string }) => target.id),
      ["script:test", "script:test:unit"],
    );
    assert.deepEqual(listReport.targets[0].command, ["npm", "run", "test"]);
    assert.equal(listJson.stderr(), "");

    const statusJson = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "test", "status", "--json"], {}, statusJson.io), 0);
    assert.equal(JSON.parse(statusJson.stdout()).surface, "orx.test_targets");
    assert.equal(statusJson.stderr(), "");

    const badListArg = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "tests", "list", "script:test"], {}, badListArg.io), 1);
    assert.match(badListArg.stderr(), /Usage: orx tests \[list \[--json\]\|status \[--json\]\|run/);

    const badListOption = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "tests", "status", "--xml"], {}, badListOption.io), 1);
    assert.match(badListOption.stderr(), /Unknown tests option: --xml/);

    const profileConfigPath = join(cwd, "profiles.json");
    writeFileSync(profileConfigPath, "{}\n");
    chmodSync(profileConfigPath, 0o666);
    const profiled = createIo({ cwd });
    assert.equal(
      await runCli(
        ["node", "cli", "--profile", "demo", "tests", "list", "--json"],
        { ORX_PROFILE_CONFIG_PATH: profileConfigPath },
        profiled.io,
      ),
      0,
    );
    assert.equal(JSON.parse(profiled.stdout()).surface, "orx.test_targets");
    assert.equal(profiled.stderr(), "");
    assert.equal(statSync(profileConfigPath).mode & 0o777, 0o666);

    const ran = createIo({ cwd });
    assert.equal(
      await runCli(["node", "cli", "tests", "run", "script:test:unit", "--", "--flag"], {}, ran.io),
      0,
    );
    assert.match(ran.stdout(), /Test run: script:test:unit/);
    assert.match(ran.stdout(), /status: ok/);
    assert.match(ran.stdout(), /cli-test unit,--flag/);
    assert.equal(ran.stderr(), "");

    const runJson = createIo({ cwd });
    assert.equal(
      await runCli(["node", "cli", "tests", "run", "script:test:unit", "--json", "--", "--flag"], {}, runJson.io),
      0,
    );
    const runJsonReport = JSON.parse(runJson.stdout());
    assert.equal(runJsonReport.surface, "orx.test_run");
    assert.equal(runJsonReport.status, "ok");
    assert.equal(runJsonReport.ok, true);
    assert.equal(runJsonReport.target.id, "script:test:unit");
    assert.equal(runJsonReport.command.shell, false);
    assert.match(runJsonReport.raw_output.stdout.text, /cli-test unit,--flag/);
    assert.equal(runJson.stderr(), "");

    const passThroughJsonArg = createIo({ cwd });
    assert.equal(
      await runCli(["node", "cli", "tests", "run", "script:test:unit", "--", "--json"], {}, passThroughJsonArg.io),
      0,
    );
    assert.match(passThroughJsonArg.stdout(), /cli-test unit,--json/);
    assert.doesNotMatch(passThroughJsonArg.stdout(), /"surface": "orx\.test_run"/);

    const badRunOption = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "tests", "run", "--xml"], {}, badRunOption.io), 1);
    assert.match(badRunOption.stderr(), /Unknown tests run option: --xml/);

    const unknown = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "tests", "unknown"], {}, unknown.io), 1);
    assert.match(unknown.stderr(), /Usage: orx tests/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("cli code map renders a bounded repository overview without an API key", async () => {
  const cwd = createTempDir();
  try {
    mkdirSync(join(cwd, "src"), { recursive: true });
    writeFileSync(
      join(cwd, "package.json"),
      JSON.stringify({
        main: "./dist/index.js",
        scripts: { test: "node --test" },
      }),
    );
    writeFileSync(
      join(cwd, "src", "index.ts"),
      "import './side-effect.js';\nimport { feature } from './feature';\nexport function start() { return feature(); }\nfunction boot() { return start(); }\n",
    );
    writeFileSync(join(cwd, "src", "side-effect.ts"), "export const sideEffect = true;\n");
    mkdirSync(join(cwd, "src", "feature"), { recursive: true });
    writeFileSync(join(cwd, "src", "feature", "index.ts"), "export function feature() { return 'ok'; }\n");

    const mapped = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "code", "map"], {}, mapped.io), 0);
    assert.match(mapped.stdout(), /Code Map/);
    assert.match(mapped.stdout(), /TypeScript: 3/);
    assert.match(mapped.stdout(), /kind=package label="main"/);
    assert.match(mapped.stdout(), /path="src\/index\.ts"/);
    assert.match(mapped.stdout(), /exports="start"/);
    assert.equal(mapped.stderr(), "");

    const mappedJson = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "code", "--json"], {}, mappedJson.io), 0);
    const mappedJsonReport = JSON.parse(mappedJson.stdout());
    assert.equal(mappedJsonReport.surface, "orx.code_map");
    assert.equal(mappedJsonReport.source_file_count, 3);
    assert.ok(mappedJsonReport.source_files.some((file: { path: string }) => file.path === "src/index.ts"));
    assert.equal(mappedJson.stderr(), "");

    const profileConfigPath = join(cwd, "profiles.json");
    writeFileSync(profileConfigPath, "{}\n");
    chmodSync(profileConfigPath, 0o666);
    const profiled = createIo({ cwd });
    assert.equal(
      await runCli(
        ["node", "cli", "--profile", "demo", "code", "map", "--json"],
        { ORX_PROFILE_CONFIG_PATH: profileConfigPath },
        profiled.io,
      ),
      0,
    );
    assert.equal(JSON.parse(profiled.stdout()).surface, "orx.code_map");
    assert.equal(profiled.stderr(), "");
    assert.equal(statSync(profileConfigPath).mode & 0o777, 0o666);

    const alias = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "map", "src"], {}, alias.io), 0);
    assert.match(alias.stdout(), /root: .*src/);
    assert.match(alias.stdout(), /source_files: 3/);

    const aliasJson = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "map", "src", "--json"], {}, aliasJson.io), 0);
    const aliasJsonReport = JSON.parse(aliasJson.stdout());
    assert.equal(aliasJsonReport.surface, "orx.code_map");
    assert.equal(aliasJsonReport.source_file_count, 3);

    const symbols = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "code", "symbols", "start"], {}, symbols.io), 0);
    assert.match(symbols.stdout(), /Code Symbols/);
    assert.match(symbols.stdout(), /query: "start"/);
    assert.match(symbols.stdout(), /name="start"/);
    assert.match(symbols.stdout(), /path="src\/index\.ts"/);
    assert.equal(symbols.stderr(), "");

    const symbolAlias = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "symbols", "start"], {}, symbolAlias.io), 0);
    assert.match(symbolAlias.stdout(), /Code Symbols/);
    assert.match(symbolAlias.stdout(), /name="start"/);

    const symbolsJson = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "symbols", "start", "--json"], {}, symbolsJson.io), 0);
    const symbolsJsonReport = JSON.parse(symbolsJson.stdout());
    assert.equal(symbolsJsonReport.surface, "orx.code_symbols");
    assert.equal(symbolsJsonReport.query, "start");
    assert.equal(symbolsJsonReport.symbols[0].name, "start");

    const refs = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "code", "refs", "start"], {}, refs.io), 0);
    assert.match(refs.stdout(), /Code References/);
    assert.match(refs.stdout(), /query: "start"/);
    assert.match(refs.stdout(), /path="src\/index\.ts"/);
    assert.match(refs.stdout(), /line=3/);
    assert.equal(refs.stderr(), "");

    const refsAlias = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "refs", "start"], {}, refsAlias.io), 0);
    assert.match(refsAlias.stdout(), /Code References/);
    assert.match(refsAlias.stdout(), /query: "start"/);

    const refsJson = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "code", "refs", "start", "--json"], {}, refsJson.io), 0);
    const refsJsonReport = JSON.parse(refsJson.stdout());
    assert.equal(refsJsonReport.surface, "orx.code_refs");
    assert.equal(refsJsonReport.query, "start");
    assert.ok(refsJsonReport.references.some((reference: { path: string }) => reference.path === "src/index.ts"));

    const refsLiteralJsonQuery = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "code", "refs", "--", "--json"], {}, refsLiteralJsonQuery.io), 0);
    assert.match(refsLiteralJsonQuery.stdout(), /Code References/);
    assert.match(refsLiteralJsonQuery.stdout(), /query: "--json"/);
    assert.doesNotMatch(refsLiteralJsonQuery.stdout(), /"surface": "orx\.code_refs"/);

    const missingRefs = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "code", "refs"], {}, missingRefs.io), 1);
    assert.equal(missingRefs.stdout(), "");
    assert.match(missingRefs.stderr(), /Usage: orx code refs <query> \[--json\]/);

    const imports = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "code", "imports"], {}, imports.io), 0);
    assert.match(imports.stdout(), /Code Import Graph/);
    assert.match(imports.stdout(), /local_edges: 2/);
    assert.match(imports.stdout(), /from="src\/index\.ts" to="src\/feature\/index\.ts"/);
    assert.match(imports.stdout(), /from="src\/index\.ts" to="src\/side-effect\.ts"/);

    const importAlias = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "imports", "feature"], {}, importAlias.io), 0);
    assert.match(importAlias.stdout(), /Code Import Graph/);
    assert.match(importAlias.stdout(), /query: "feature"/);
    assert.match(importAlias.stdout(), /imports: 1/);
    assert.match(importAlias.stdout(), /to="src\/feature\/index\.ts"/);

    const importsJson = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "imports", "feature", "--json"], {}, importsJson.io), 0);
    const importsJsonReport = JSON.parse(importsJson.stdout());
    assert.equal(importsJsonReport.surface, "orx.code_imports");
    assert.equal(importsJsonReport.query, "feature");
    assert.equal(importsJsonReport.summary.local_edges, 1);

    const calls = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "code", "calls", "start"], {}, calls.io), 0);
    assert.match(calls.stdout(), /Code Call Graph/);
    assert.match(calls.stdout(), /query: "start"/);
    assert.match(calls.stdout(), /not AST-backed/);
    assert.match(calls.stdout(), /from="boot" from_path="src\/index\.ts" from_line=4 to="start" to_path="src\/index\.ts"/);
    assert.match(calls.stdout(), /from="start" from_path="src\/index\.ts" from_line=3 to="feature" to_path="src\/feature\/index\.ts"/);
    assert.equal(calls.stderr(), "");

    const callsAlias = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "calls", "feature"], {}, callsAlias.io), 0);
    assert.match(callsAlias.stdout(), /Code Call Graph/);
    assert.match(callsAlias.stdout(), /query: "feature"/);
    assert.match(callsAlias.stdout(), /to="feature"/);

    const callsJson = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "code", "calls", "start", "--json"], {}, callsJson.io), 0);
    const callsJsonReport = JSON.parse(callsJson.stdout());
    assert.equal(callsJsonReport.surface, "orx.code_calls");
    assert.equal(callsJsonReport.query, "start");
    assert.equal(callsJsonReport.ast_backed, false);
    assert.ok(callsJsonReport.edges.some((edge: { to_name: string }) => edge.to_name === "start"));

    const callGraphAlias = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "call-graph"], {}, callGraphAlias.io), 0);
    assert.match(callGraphAlias.stdout(), /Code Call Graph/);

    const astGrepCalls: Array<{ command: string; args: string[] }> = [];
    const astGrepRunner: AstGrepRunner = (command, args) => {
      astGrepCalls.push({ command, args });
      if (args.includes("--version")) {
        return { status: command === "sg" ? 0 : 1, signal: null, stdout: "ast-grep 0.0.0\n", stderr: "" };
      }
      return {
        status: 0,
        signal: null,
        stdout: "src/index.ts:3:export function start() { return feature(); }\n",
        stderr: "",
      };
    };
    const astGrep = createIo({ cwd, astGrepRunner });
    assert.equal(
      await runCli(["node", "cli", "code", "ast-grep", "function $A", "src", "--lang", "ts"], {}, astGrep.io),
      0,
    );
    assert.match(astGrep.stdout(), /Code ast-grep/);
    assert.match(astGrep.stdout(), /status: ok/);
    assert.match(astGrep.stdout(), /mutation: none/);
    assert.match(astGrep.stdout(), /src\/index\.ts:3:export function start/);
    assert.equal(astGrep.stderr(), "");
    assert.deepEqual(astGrepCalls.at(-1)?.args, [
      "run",
      "--pattern",
      "function $A",
      "--color",
      "never",
      "--heading",
      "never",
      "--lang",
      "ts",
      "src",
    ]);

    const astGrepAlias = createIo({ cwd, astGrepRunner });
    assert.equal(await runCli(["node", "cli", "ast-grep", "start", "src", "--json"], {}, astGrepAlias.io), 0);
    assert.equal(astGrepAlias.stdout(), "src/index.ts:3:export function start() { return feature(); }\n");

    const astGrepMissing = createIo({
      cwd,
      astGrepRunner: () => ({
        status: null,
        signal: null,
        stdout: "",
        stderr: "",
        error: Object.assign(new Error("not found"), { code: "ENOENT" }),
      }),
    });
    assert.equal(await runCli(["node", "cli", "code", "ast-grep", "start"], {}, astGrepMissing.io), 1);
    assert.match(astGrepMissing.stderr(), /ast-grep is not installed or not on PATH/);

    const astGrepDashTarget = createIo({ cwd, astGrepRunner });
    assert.equal(
      await runCli(["node", "cli", "code", "ast-grep", "pattern", "--", "--update-all"], {}, astGrepDashTarget.io),
      1,
    );
    assert.match(astGrepDashTarget.stderr(), /path must not start with a dash/);
    assert.equal(
      astGrepCalls.some((call) => call.args.includes("--update-all")),
      false,
    );

    const astGrepNormalizedDashTarget = createIo({ cwd, astGrepRunner });
    assert.equal(
      await runCli(["node", "cli", "code", "ast-grep", "pattern", "./--update-all"], {}, astGrepNormalizedDashTarget.io),
      1,
    );
    assert.match(astGrepNormalizedDashTarget.stderr(), /dash-prefixed operand/);

    const astGrepDashRewrite = createIo({ cwd, astGrepRunner });
    assert.equal(
      await runCli(["node", "cli", "code", "ast-grep", "pattern", "--rewrite", "--update-all"], {}, astGrepDashRewrite.io),
      1,
    );
    assert.match(astGrepDashRewrite.stderr(), /rewrite must not start with a dash/);
    assert.equal(
      astGrepCalls.some((call) => call.args.includes("--update-all")),
      false,
    );

    const astGrepDashPattern = createIo({ cwd, astGrepRunner });
    assert.equal(
      await runCli(["node", "cli", "code", "ast-grep", "--", "--update-all"], {}, astGrepDashPattern.io),
      1,
    );
    assert.match(astGrepDashPattern.stderr(), /pattern must not start with a dash/);
    assert.equal(
      astGrepCalls.some((call) => call.args.includes("--update-all")),
      false,
    );

    const treeSitterCalls: Array<{ command: string; args: string[] }> = [];
    const treeSitterRunner: TreeSitterRunner = (command, args) => {
      treeSitterCalls.push({ command, args });
      if (args.includes("--version")) {
        return { status: command === "tree-sitter" ? 0 : 1, signal: null, stdout: "tree-sitter 0.0.0\n", stderr: "" };
      }
      return {
        status: 0,
        signal: null,
        stdout: [
          "(program [0, 0] - [4, 0]",
          "  (import_statement [0, 0] - [0, 26]",
          "    source: (string [0, 7] - [0, 25]",
          "      (string_fragment [0, 8] - [0, 24])))",
          "  (import_statement [1, 0] - [1, 36]",
          "    source: (string [1, 24] - [1, 35]",
          "      (string_fragment [1, 25] - [1, 34])))",
          "  (export_statement [2, 0] - [2, 44]",
          "    declaration: (function_declaration [2, 7] - [2, 43]",
          "      name: (identifier [2, 16] - [2, 21])",
          "      body: (statement_block [2, 24] - [2, 43]",
          "        (return_statement [2, 26] - [2, 41]",
          "          (call_expression [2, 33] - [2, 42]",
          "            function: (identifier [2, 33] - [2, 40])))))",
          "  (function_declaration [3, 0] - [3, 35]",
          "    name: (identifier [3, 9] - [3, 13])",
          "    body: (statement_block [3, 16] - [3, 35]",
          "      (return_statement [3, 18] - [3, 32]",
          "        (call_expression [3, 25] - [3, 32]",
          "          function: (identifier [3, 25] - [3, 30]))))",
          "",
        ].join("\n"),
        stderr: "",
      };
    };

    const treeSitterRepoFiles = createIo({ cwd, treeSitterRunner });
    assert.equal(
      await runCli(["node", "cli", "code", "tree-sitter", "repo-files", "src/index.ts"], {}, treeSitterRepoFiles.io),
      0,
    );
    assert.match(treeSitterRepoFiles.stdout(), /Code tree-sitter repo files/);
    assert.match(treeSitterRepoFiles.stdout(), /no parsing or semantic analysis/);
    assert.match(treeSitterRepoFiles.stdout(), /files_scanned: 1/);
    assert.match(treeSitterRepoFiles.stdout(), /- src\/index\.ts/);
    assert.equal(treeSitterCalls.length, 0);

    const treeSitterRepoFilesJson = createIo({ cwd, treeSitterRunner });
    assert.equal(
      await runCli(["node", "cli", "code", "tree-sitter", "repo-files", "src/index.ts", "--json"], {}, treeSitterRepoFilesJson.io),
      0,
    );
    const repoFilesJson = JSON.parse(treeSitterRepoFilesJson.stdout()) as {
      surface: string;
      mode: string;
      execution: string;
      ast_backed: boolean;
      repo_files: { files_scanned: number; files: string[] };
    };
    assert.equal(repoFilesJson.surface, "orx.code_tree_sitter");
    assert.equal(repoFilesJson.mode, "repo-files");
    assert.equal(repoFilesJson.execution, "local_filesystem_scan_only");
    assert.equal(repoFilesJson.ast_backed, false);
    assert.equal(repoFilesJson.repo_files.files_scanned, 1);
    assert.deepEqual(repoFilesJson.repo_files.files, ["src/index.ts"]);
    assert.equal(treeSitterCalls.length, 0);

    const treeSitterOutline = createIo({ cwd, treeSitterRunner });
    assert.equal(
      await runCli(["node", "cli", "code", "tree-sitter", "outline", "src/index.ts"], {}, treeSitterOutline.io),
      0,
    );
    assert.match(treeSitterOutline.stdout(), /Code tree-sitter outline/);
    assert.match(treeSitterOutline.stdout(), /kind="function_declaration" name="start" line=3 column=8/);
    assert.match(treeSitterOutline.stdout(), /kind="function_declaration" name="boot" line=4 column=1/);
    assert.deepEqual(treeSitterCalls.at(-1)?.args, ["parse", "src/index.ts"]);

    const treeSitterRepoOutline = createIo({ cwd, treeSitterRunner });
    assert.equal(
      await runCli(["node", "cli", "code", "tree-sitter", "repo-outline", "src/index.ts"], {}, treeSitterRepoOutline.io),
      0,
    );
    assert.match(treeSitterRepoOutline.stdout(), /Code tree-sitter repo outline/);
    assert.match(treeSitterRepoOutline.stdout(), /not semantic symbol resolution/);
    assert.match(treeSitterRepoOutline.stdout(), /files_scanned: 1/);
    assert.match(treeSitterRepoOutline.stdout(), /path="src\/index\.ts" kind="function_declaration" name="start" line=3 column=8/);

    const treeSitterRepoSymbols = createIo({ cwd, treeSitterRunner });
    assert.equal(
      await runCli(["node", "cli", "code", "tree-sitter", "repo-symbols", "src/index.ts"], {}, treeSitterRepoSymbols.io),
      0,
    );
    assert.match(treeSitterRepoSymbols.stdout(), /Code tree-sitter repo symbols/);
    assert.match(treeSitterRepoSymbols.stdout(), /not semantic symbol resolution/);
    assert.match(treeSitterRepoSymbols.stdout(), /files_scanned: 1/);
    assert.match(treeSitterRepoSymbols.stdout(), /symbols: 2/);
    assert.match(treeSitterRepoSymbols.stdout(), /path="src\/index\.ts" kind="function_declaration" name="start" line=3 column=8/);

    const treeSitterRepoOutlineAlias = createIo({ cwd, treeSitterRunner });
    assert.equal(
      await runCli(["node", "cli", "tree-sitter", "repo-outline", "src/index.ts"], {}, treeSitterRepoOutlineAlias.io),
      0,
    );
    assert.match(treeSitterRepoOutlineAlias.stdout(), /Code tree-sitter repo outline/);

    const treeSitterRepoSymbolsAlias = createIo({ cwd, treeSitterRunner });
    assert.equal(
      await runCli(["node", "cli", "tree-sitter", "repo-symbols", "src/index.ts"], {}, treeSitterRepoSymbolsAlias.io),
      0,
    );
    assert.match(treeSitterRepoSymbolsAlias.stdout(), /Code tree-sitter repo symbols/);

    const treeSitterAstCalls = createIo({ cwd, treeSitterRunner });
    assert.equal(
      await runCli(["node", "cli", "code", "tree-sitter", "calls", "src/index.ts"], {}, treeSitterAstCalls.io),
      0,
    );
    assert.match(treeSitterAstCalls.stdout(), /Code tree-sitter calls/);
    assert.match(treeSitterAstCalls.stdout(), /caller="start" caller_kind="function_declaration" caller_line=3 callee="feature" line=3 column=34/);
    assert.match(treeSitterAstCalls.stdout(), /caller="boot" caller_kind="function_declaration" caller_line=4 callee="start" line=4 column=26/);

    const treeSitterAstImports = createIo({ cwd, treeSitterRunner });
    assert.equal(
      await runCli(["node", "cli", "code", "tree-sitter", "imports", "src/index.ts"], {}, treeSitterAstImports.io),
      0,
    );
    assert.match(treeSitterAstImports.stdout(), /Code tree-sitter imports/);
    assert.match(treeSitterAstImports.stdout(), /kind="import" source="\.\/side-effect\.js" line=1 column=1/);
    assert.match(treeSitterAstImports.stdout(), /kind="import" source="\.\/feature" line=2 column=1/);

    const treeSitterAstRefs = createIo({ cwd, treeSitterRunner });
    assert.equal(
      await runCli(["node", "cli", "code", "tree-sitter", "refs", "src/index.ts", "feature"], {}, treeSitterAstRefs.io),
      0,
    );
    assert.match(treeSitterAstRefs.stdout(), /Code tree-sitter refs/);
    assert.match(treeSitterAstRefs.stdout(), /query: "feature"/);
    assert.match(treeSitterAstRefs.stdout(), /role="function" kind="identifier" name="feature" line=3 column=34/);

    const treeSitterRefsAlias = createIo({ cwd, treeSitterRunner });
    assert.equal(
      await runCli(["node", "cli", "tree-sitter", "refs", "src/index.ts", "feature"], {}, treeSitterRefsAlias.io),
      0,
    );
    assert.match(treeSitterRefsAlias.stdout(), /Code tree-sitter refs/);
    assert.match(treeSitterRefsAlias.stdout(), /role="function" kind="identifier" name="feature" line=3 column=34/);

    const treeSitterRepoRefs = createIo({ cwd, treeSitterRunner });
    assert.equal(
      await runCli(["node", "cli", "code", "tree-sitter", "repo-refs", "feature", "src/index.ts"], {}, treeSitterRepoRefs.io),
      0,
    );
    assert.match(treeSitterRepoRefs.stdout(), /Code tree-sitter repo refs/);
    assert.match(treeSitterRepoRefs.stdout(), /not semantic resolution/);
    assert.match(treeSitterRepoRefs.stdout(), /files_scanned: 1/);
    assert.match(treeSitterRepoRefs.stdout(), /path="src\/index\.ts" role="function" kind="identifier" name="feature" line=3 column=34/);

    const treeSitterRepoCalls = createIo({ cwd, treeSitterRunner });
    assert.equal(
      await runCli(["node", "cli", "code", "tree-sitter", "repo-calls", "src/index.ts"], {}, treeSitterRepoCalls.io),
      0,
    );
    assert.match(treeSitterRepoCalls.stdout(), /Code tree-sitter repo calls/);
    assert.match(treeSitterRepoCalls.stdout(), /not semantic call resolution/);
    assert.match(treeSitterRepoCalls.stdout(), /files_scanned: 1/);
    assert.match(treeSitterRepoCalls.stdout(), /path="src\/index\.ts" caller="start" caller_kind="function_declaration" caller_line=3 callee="feature" line=3 column=34/);

    const treeSitterRepoImports = createIo({ cwd, treeSitterRunner });
    assert.equal(
      await runCli(["node", "cli", "code", "tree-sitter", "repo-imports", "src/index.ts"], {}, treeSitterRepoImports.io),
      0,
    );
    assert.match(treeSitterRepoImports.stdout(), /Code tree-sitter repo imports/);
    assert.match(treeSitterRepoImports.stdout(), /not dependency resolution/);
    assert.match(treeSitterRepoImports.stdout(), /files_scanned: 1/);
    assert.match(treeSitterRepoImports.stdout(), /path="src\/index\.ts" kind="import" source="\.\/feature" line=2 column=1/);

    const treeSitterRepoDeps = createIo({ cwd, treeSitterRunner });
    assert.equal(
      await runCli(["node", "cli", "code", "tree-sitter", "repo-deps", "src/index.ts"], {}, treeSitterRepoDeps.io),
      0,
    );
    assert.match(treeSitterRepoDeps.stdout(), /Code tree-sitter repo deps/);
    assert.match(treeSitterRepoDeps.stdout(), /not package or semantic resolution/);
    assert.match(treeSitterRepoDeps.stdout(), /files_scanned: 1/);
    assert.match(treeSitterRepoDeps.stdout(), /unresolved_local_imports: 2/);
    assert.match(treeSitterRepoDeps.stdout(), /from="src\/index\.ts" to="unresolved_local" specifier="\.\/feature" resolution=unresolved_local kind="import" line=2 column=1/);

    const outlineAlias = createIo({ cwd, treeSitterRunner });
    assert.equal(await runCli(["node", "cli", "outline", "src/index.ts"], {}, outlineAlias.io), 0);
    assert.match(outlineAlias.stdout(), /Code tree-sitter outline/);
    assert.match(outlineAlias.stdout(), /raw_parse: use tree-sitter parse mode/);

    const outlineAliasJson = createIo({ cwd, treeSitterRunner });
    assert.equal(await runCli(["node", "cli", "outline", "src/index.ts", "--json"], {}, outlineAliasJson.io), 0);
    const outlineJson = JSON.parse(outlineAliasJson.stdout()) as {
      surface: string;
      mode: string;
      execution: string;
      ast_backed: boolean;
      semantic_resolution: boolean;
      outline: { total_entries: number };
    };
    assert.equal(outlineJson.surface, "orx.code_tree_sitter");
    assert.equal(outlineJson.mode, "outline");
    assert.equal(outlineJson.execution, "local_tree_sitter_cli");
    assert.equal(outlineJson.ast_backed, true);
    assert.equal(outlineJson.semantic_resolution, false);
    assert.equal(outlineJson.outline.total_entries, 2);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("cli research profile commands render read-only catalog and setup plans without an API key", async () => {
  const cwd = createTempDir();

  try {
    const help = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "research", "--help"], {}, help.io), 0);
    assert.match(help.stdout(), /^Usage: orx research /);
    assert.equal(help.stderr(), "");

    const list = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "research", "profiles"], {}, list.io), 0);
    assert.match(list.stdout(), /Research profiles/);
    assert.match(list.stdout(), /id=research-web state=available/);
    assert.match(list.stdout(), /id=research-rag state=catalog_only/);
    assert.equal(list.stderr(), "");

    const listJson = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "research", "profiles", "--json"], {}, listJson.io), 0);
    const listReport = JSON.parse(listJson.stdout()) as {
      surface: string;
      network: string;
      profiles: Array<{ id: string; state: string }>;
    };
    assert.equal(listReport.surface, "orx.research_profiles");
    assert.equal(listReport.network, "none_for_list_inspect_or_plan");
    assert.equal(listReport.profiles.find((profile) => profile.id === "research-browser")?.state, "available");
    assert.equal(listReport.profiles.find((profile) => profile.id === "research-crawl")?.state, "catalog_only");
    assert.equal(listJson.stderr(), "");

    const inspect = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "research", "profiles", "inspect", "research-web"], {}, inspect.io), 0);
    assert.match(inspect.stdout(), /Research profile: research-web/);
    assert.match(inspect.stdout(), /\/web fetch <url>/);
    assert.match(inspect.stdout(), /network_boundary: operator-explicit fetch\/search only/);

    const plan = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "research", "profiles", "plan", "research-crawl"], {}, plan.io), 0);
    assert.match(plan.stdout(), /Research setup plan: research-crawl/);
    assert.match(plan.stdout(), /status: catalog_only/);
    assert.match(plan.stdout(), /process_spawn: none/);
    assert.match(plan.stdout(), /crawl depth, page, host, redirect, and byte budgets are not implemented/);

    const planJson = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "research", "setup-plan", "research-browser", "--json"], {}, planJson.io), 0);
    const planReport = JSON.parse(planJson.stdout()) as {
      surface: string;
      status: string;
      current_commands: string[];
      authority: { network: string; process_spawn: string; state_writes: string };
    };
    assert.equal(planReport.surface, "orx.research_setup_plan");
    assert.equal(planReport.status, "available_now");
    assert.ok(planReport.current_commands.includes("/web browse <url>"));
    assert.equal(planReport.authority.network, "none");
    assert.equal(planReport.authority.process_spawn, "none");
    assert.equal(planReport.authority.state_writes, "none");

    const badOption = createIo({ cwd });
    assert.equal(
      await runCli(["node", "cli", "research", "profiles", "plan", "research-web", "--project", "x"], {}, badOption.io),
      1,
    );
    assert.match(badOption.stderr(), /^Usage: orx research profiles \[plan\|setup-plan\] <profile> \[--json\]/);

    const profileConfigPath = join(cwd, "profiles.json");
    writeFileSync(profileConfigPath, "{}\n");
    chmodSync(profileConfigPath, 0o666);
    const profiled = createIo({ cwd });
    assert.equal(
      await runCli(
        ["node", "cli", "--profile", "demo", "research", "profiles", "--json"],
        { ORX_PROFILE_CONFIG_PATH: profileConfigPath },
        profiled.io,
      ),
      0,
    );
    assert.equal(JSON.parse(profiled.stdout()).surface, "orx.research_profiles");
    assert.equal(profiled.stderr(), "");
    assert.equal(statSync(profileConfigPath).mode & 0o777, 0o666);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("cli scanner commands list, inspect, and run guarded local profiles with mocked binaries", async () => {
  const cwd = createTempDir();
  try {
    mkdirSync(join(cwd, "src"), { recursive: true });
    mkdirSync(join(cwd, "codeql-db"), { recursive: true });
    writeFileSync(join(cwd, "src", "app.ts"), "const value = 1;\n");
    writeFileSync(join(cwd, "semgrep.yml"), "rules: []\n");
    writeFileSync(join(cwd, "query.ql"), "select \"ok\"\n");
    writeFileSync(join(cwd, "large-query.ql"), "select \"large\"\n");

    const list = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "scanners", "list"], {}, list.io), 0);
    assert.match(list.stdout(), /Security scanner profiles/);
    assert.match(list.stdout(), /id=semgrep state=runnable/);
    assert.match(list.stdout(), /id=osv-scanner state=runnable/);
    assert.match(list.stdout(), /id=snyk state=catalog_only/);

    const listJson = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "scanners", "--json"], {}, listJson.io), 0);
    const profileReport = JSON.parse(listJson.stdout());
    assert.equal(profileReport.surface, "orx.security_scanner_profiles");
    assert.equal(profileReport.model_tool, "not_exposed");
    assert.equal(profileReport.network, "none_for_list_or_inspect");
    const profileEntries = profileReport.profiles as Array<{ id: string; state: string }>;
    assert.equal(profileEntries.find((profile) => profile.id === "codeql")?.state, "runnable");
    assert.equal(profileEntries.find((profile) => profile.id === "osv-scanner")?.state, "runnable");
    assert.equal(profileEntries.find((profile) => profile.id === "semgrep")?.state, "runnable");
    assert.equal(profileEntries.find((profile) => profile.id === "trivy")?.state, "runnable");
    assert.equal(listJson.stderr(), "");

    const inspect = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "scanners", "inspect", "semgrep"], {}, inspect.io), 0);
    assert.match(inspect.stdout(), /Security scanner profile: semgrep/);
    assert.match(inspect.stdout(), /config_required: local file under cwd via --config/);

    const inspectJson = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "scanners", "inspect", "semgrep", "--json"], {}, inspectJson.io), 0);
    const inspectReport = JSON.parse(inspectJson.stdout());
    assert.equal(inspectReport.surface, "orx.security_scanner_profile");
    assert.equal(inspectReport.profile.id, "semgrep");
    assert.equal(inspectReport.profile.details.config_required, "local file under cwd via --config");
    assert.equal(inspectJson.stderr(), "");

    const inspectTrivy = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "scanners", "inspect", "trivy"], {}, inspectTrivy.io), 0);
    assert.match(inspectTrivy.stdout(), /Security scanner profile: trivy/);
    assert.match(inspectTrivy.stdout(), /command_shape: trivy fs --scanners secret --format json/);

    const inspectCodeql = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "scanners", "inspect", "codeql"], {}, inspectCodeql.io), 0);
    assert.match(inspectCodeql.stdout(), /Security scanner profile: codeql/);
    assert.match(inspectCodeql.stdout(), /command_shape: codeql database analyze --format=sarifv2\.1\.0/);
    assert.match(inspectCodeql.stdout(), /--no-download/);

    const inspectOsv = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "scanners", "inspect", "osv-scanner"], {}, inspectOsv.io), 0);
    assert.match(inspectOsv.stdout(), /Security scanner profile: osv-scanner/);
    assert.match(inspectOsv.stdout(), /command_shape: osv-scanner scan source --recursive --format json --offline --no-resolve/);
    assert.match(inspectOsv.stdout(), /does not pass --download-offline-databases/);

    const inspectCatalogOnly = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "scanners", "inspect", "snyk"], {}, inspectCatalogOnly.io), 0);
    assert.match(inspectCatalogOnly.stdout(), /state: catalog_only/);

    const planSemgrep = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "scanners", "plan", "semgrep"], {}, planSemgrep.io), 0);
    assert.match(planSemgrep.stdout(), /Security scanner setup plan: semgrep/);
    assert.match(planSemgrep.stdout(), /status: runnable_now/);
    assert.match(planSemgrep.stdout(), /current_run: orx scanners run semgrep <path> --config <local-config-path> \[--json\]/);
    assert.match(planSemgrep.stdout(), /process_spawn: none/);
    assert.match(planSemgrep.stdout(), /blockers:\n    - none/);
    assert.equal(planSemgrep.stderr(), "");

    const planOsv = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "scanners", "plan", "osv-scanner"], {}, planOsv.io), 0);
    assert.match(planOsv.stdout(), /Security scanner setup plan: osv-scanner/);
    assert.match(planOsv.stdout(), /status: runnable_now/);
    assert.match(planOsv.stdout(), /current_run: orx scanners run osv-scanner <path> \[--json\]/);
    assert.match(planOsv.stdout(), /blockers:\n    - none/);
    assert.equal(planOsv.stderr(), "");

    const setupPlanJson = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "scanners", "setup-plan", "socket", "--json"], {}, setupPlanJson.io), 0);
    const setupPlanReport = JSON.parse(setupPlanJson.stdout());
    assert.equal(setupPlanReport.surface, "orx.security_scanner_setup_plan");
    assert.equal(setupPlanReport.profile.id, "socket");
    assert.equal(setupPlanReport.status, "catalog_only");
    assert.equal(setupPlanReport.authority.process_spawn, "none");
    assert.equal(setupPlanReport.authority.network, "none");
    assert.match(setupPlanReport.future_integration, /no package-manager side effects/);
    assert.ok(setupPlanReport.blockers.some((blocker: string) => blocker.includes("dependency-risk")));
    assert.equal(setupPlanJson.stderr(), "");

    const planUnknownOption = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "scanners", "plan", "snyk", "--project", "package.json"], {}, planUnknownOption.io), 1);
    assert.match(planUnknownOption.stderr(), /^Usage: orx scanners \[plan\|setup-plan\]/);

    const listExtra = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "scanners", "list", "extra"], {}, listExtra.io), 1);
    assert.match(listExtra.stderr(), /^Usage: orx scanners/);

    const profileConfigPath = join(cwd, "profiles.json");
    writeFileSync(profileConfigPath, "{}\n");
    chmodSync(profileConfigPath, 0o666);
    const profiled = createIo({ cwd });
    assert.equal(
      await runCli(
        ["node", "cli", "--profile", "demo", "scanners", "list", "--json"],
        { ORX_PROFILE_CONFIG_PATH: profileConfigPath },
        profiled.io,
      ),
      0,
    );
    assert.equal(JSON.parse(profiled.stdout()).surface, "orx.security_scanner_profiles");
    assert.equal(profiled.stderr(), "");
    assert.equal(statSync(profileConfigPath).mode & 0o777, 0o666);

    const scannerCalls: Array<Parameters<ScannerProcessRunner>[0]> = [];
    const scannerRunner: ScannerProcessRunner = async (options) => {
      scannerCalls.push(options);
      if (options.command === "semgrep" && options.args?.includes("--version")) {
        return mockProcessResult(options, { exitCode: 0, stdout: "semgrep 1.0.0\n" });
      }
      if (options.command === "trivy" && options.args?.includes("--version")) {
        return mockProcessResult(options, { exitCode: 0, stdout: "Version: 0.63.0\n" });
      }
      if (options.command === "codeql" && options.args?.includes("--version")) {
        return mockProcessResult(options, { exitCode: 0, stdout: "CodeQL command-line toolchain release 2.22.0\n" });
      }
      if (options.command === "osv-scanner" && options.args?.includes("--version")) {
        return mockProcessResult(options, { exitCode: 0, stdout: "OSV-Scanner version: 2.3.3\n" });
      }
      if (options.command === "trivy") {
        return mockProcessResult(options, {
          exitCode: 0,
          stdout: "{\"Results\":[{\"Secrets\":[{\"RuleID\":\"generic-api-key\",\"Match\":\"api_key=trivy-secret\"}]}]}\n",
          stderr: "Authorization: Bearer should-redact\n",
        });
      }
      if (options.command === "osv-scanner") {
        return mockProcessResult(options, {
          exitCode: 0,
          stdout: "{\"results\":[{\"packages\":[{\"package\":{\"name\":\"pkg\",\"version\":\"1.0.0\"},\"vulnerabilities\":[{\"id\":\"GHSA-test\",\"summary\":\"api_key=osv-secret\"}]}]}]}\n",
          stderr: "Authorization: Bearer should-redact\n",
        });
      }
      if (options.command === "codeql") {
        const outputArg = options.args?.find((arg) => arg.startsWith("--output="));
        assert.ok(outputArg);
        const largeSarif = options.args?.includes("large-query.ql") ?? false;
        writeFileSync(
          outputArg.slice("--output=".length),
          JSON.stringify({
            version: "2.1.0",
            runs: [
              {
                tool: { driver: { name: "CodeQL", rules: [{ id: "js/test" }] } },
                results: [
                  {
                    ruleId: "js/test",
                    message: {
                      text: largeSarif ? "A".repeat(200_000) : "api_key=codeql-secret",
                    },
                  },
                ],
              },
            ],
          }),
        );
        return mockProcessResult(options, {
          exitCode: 0,
          stdout: "CodeQL analysis complete\n",
          stderr: "Authorization: Bearer should-redact\n",
        });
      }
      return mockProcessResult(options, {
        exitCode: 0,
        stdout: "src/app.ts: access_token=abcd1234\n",
        stderr: "Authorization: Bearer should-redact\n",
      });
    };
    const run = createIo({ cwd, scannerRunner });
    assert.equal(
      await runCli(
        ["node", "cli", "scanners", "run", "semgrep", "src", "--config", "semgrep.yml"],
        {
          OPENROUTER_API_KEY: "sk-or-v1-secret",
          BRAVE_SEARCH_API_KEY: "brave-secret",
          ORX_PLUGIN_REGISTRY_PATH: "should-not-forward",
          HOME: join(cwd, "sk-or-v1-home-secret"),
          PATH: "/usr/bin",
          LANG: "C",
        },
        run.io,
      ),
      0,
    );
    assert.match(run.stdout(), /Security scanner run/);
    assert.match(run.stdout(), /status: ok/);
    assert.match(run.stdout(), /network: none_by_command_selection/);
    assert.match(run.stdout(), /access_token=\[redacted\]/);
    assert.match(run.stdout(), /Authorization: Bearer \[redacted\]/);
    assert.doesNotMatch(run.stdout(), /abcd1234|should-redact|sk-or-v1-secret|brave-secret/);
    assert.equal(run.stderr(), "");
    assert.deepEqual(scannerCalls.at(-1)?.args, [
      "scan",
      "--config",
      "semgrep.yml",
      "--metrics",
      "off",
      "--error",
      "--no-suppress-errors",
      "src",
    ]);
    assert.equal(scannerCalls.at(-1)?.shell, false);
    assert.equal(scannerCalls.at(-1)?.inheritEnv, false);
    assert.equal(scannerCalls.at(-1)?.env?.PATH, "/usr/bin");
    assert.equal(scannerCalls.at(-1)?.env?.LANG, "C");
    assert.equal(scannerCalls.at(-1)?.env?.OPENROUTER_API_KEY, undefined);
    assert.equal(scannerCalls.at(-1)?.env?.BRAVE_SEARCH_API_KEY, undefined);
    assert.equal(scannerCalls.at(-1)?.env?.ORX_PLUGIN_REGISTRY_PATH, undefined);
    assert.equal(scannerCalls.at(-1)?.env?.HOME, undefined);
    assert.equal(scannerCalls.at(-1)?.env?.SEMGREP_SEND_METRICS, "off");
    assert.equal(
      scannerCalls.every((call) => call.env?.HOME === undefined),
      true,
    );

    const json = createIo({
      cwd,
      scannerRunner: async (options) => options.args?.includes("--version")
        ? mockProcessResult(options, { exitCode: 0, stdout: "semgrep 1.0.0\n" })
        : mockProcessResult(options, {
            exitCode: 0,
            stdout: "{\"results\":[{\"extra\":{\"api_key\":\"scanner-secret\",\"message\":\"ok\"}}]}\n",
          }),
    });
    assert.equal(
      await runCli(["node", "cli", "scan", "semgrep", "src", "--config", "semgrep.yml", "--json"], {}, json.io),
      0,
    );
    assert.equal(json.stdout(), "{\"results\":[{\"extra\":{\"api_key\":\"[redacted]\",\"message\":\"ok\"}}]}\n");

    const trivy = createIo({ cwd, scannerRunner });
    assert.equal(
      await runCli(
        ["node", "cli", "scanners", "run", "trivy", "src"],
        {
          OPENROUTER_API_KEY: "sk-or-v1-secret",
          BRAVE_SEARCH_API_KEY: "brave-secret",
          ORX_PLUGIN_REGISTRY_PATH: "should-not-forward",
          HOME: join(cwd, "sk-or-v1-home-secret"),
          PATH: "/usr/bin",
          LANG: "C",
        },
        trivy.io,
      ),
      0,
    );
    assert.match(trivy.stdout(), /Security scanner run/);
    assert.match(trivy.stdout(), /profile: trivy/);
    assert.match(trivy.stdout(), /command: "trivy" "fs" "--scanners" "secret" "--format" "json"/);
    assert.match(trivy.stdout(), /api_key=\[redacted\]/);
    assert.match(trivy.stdout(), /Authorization: Bearer \[redacted\]/);
    assert.doesNotMatch(trivy.stdout(), /trivy-secret|should-redact|sk-or-v1-secret|brave-secret/);
    assert.equal(trivy.stderr(), "");
    assert.deepEqual(scannerCalls.at(-1)?.args, [
      "fs",
      "--scanners",
      "secret",
      "--format",
      "json",
      "--offline-scan",
      "--skip-db-update",
      "--skip-java-db-update",
      "--skip-check-update",
      "--skip-version-check",
      "--disable-telemetry",
      "--no-progress",
      "src",
    ]);
    assert.equal(scannerCalls.at(-1)?.command, "trivy");
    assert.equal(scannerCalls.at(-1)?.shell, false);
    assert.equal(scannerCalls.at(-1)?.inheritEnv, false);
    assert.equal(scannerCalls.at(-1)?.env?.HOME, undefined);

    const osv = createIo({
      cwd,
      scannerRunner,
    });
    assert.equal(
      await runCli(
        ["node", "cli", "scanners", "run", "osv-scanner", "src"],
        {
          OPENROUTER_API_KEY: "sk-or-v1-secret",
          BRAVE_SEARCH_API_KEY: "brave-secret",
          ORX_PLUGIN_REGISTRY_PATH: "should-not-forward",
          HOME: join(cwd, "sk-or-v1-home-secret"),
          PATH: "/usr/bin",
          LANG: "C",
        },
        osv.io,
      ),
      0,
    );
    assert.match(osv.stdout(), /Security scanner run/);
    assert.match(osv.stdout(), /profile: osv-scanner/);
    assert.match(osv.stdout(), /command: "osv-scanner" "scan" "source" "--recursive" "--format" "json" "--offline" "--no-resolve" "src"/);
    assert.match(osv.stdout(), /api_key=\[redacted\]/);
    assert.match(osv.stdout(), /Authorization: Bearer \[redacted\]/);
    assert.doesNotMatch(osv.stdout(), /osv-secret|should-redact|sk-or-v1-secret|brave-secret/);
    assert.equal(osv.stderr(), "");
    assert.deepEqual(scannerCalls.at(-1)?.args, [
      "scan",
      "source",
      "--recursive",
      "--format",
      "json",
      "--offline",
      "--no-resolve",
      "src",
    ]);
    assert.equal(scannerCalls.at(-1)?.command, "osv-scanner");
    assert.equal(scannerCalls.at(-1)?.shell, false);
    assert.equal(scannerCalls.at(-1)?.inheritEnv, false);
    assert.equal(scannerCalls.at(-1)?.env?.OPENROUTER_API_KEY, undefined);
    assert.equal(scannerCalls.at(-1)?.env?.BRAVE_SEARCH_API_KEY, undefined);
    assert.equal(scannerCalls.at(-1)?.env?.HOME, undefined);

    const osvJson = createIo({ cwd, scannerRunner });
    assert.equal(await runCli(["node", "cli", "scan", "osv-scanner", "src", "--json"], {}, osvJson.io), 0);
    const osvJsonReport = JSON.parse(osvJson.stdout());
    assert.equal(osvJsonReport.results[0].packages[0].vulnerabilities[0].summary, "api_key=[redacted]");
    assert.doesNotMatch(osvJson.stdout(), /osv-secret|should-redact/);
    assert.equal(osvJson.stderr(), "");

    const trivyJson = createIo({ cwd, scannerRunner });
    assert.equal(await runCli(["node", "cli", "scan", "trivy", "src", "--json"], {}, trivyJson.io), 0);
    const trivyJsonReport = JSON.parse(trivyJson.stdout());
    assert.equal(trivyJsonReport.Results[0].Secrets[0].Match, "api_key=[redacted]");
    assert.doesNotMatch(trivyJson.stdout(), /trivy-secret|should-redact/);
    assert.equal(trivyJson.stderr(), "");

    const codeql = createIo({
      cwd,
      scannerRunner,
    });
    assert.equal(
      await runCli(
        ["node", "cli", "scanners", "run", "codeql", "codeql-db", "--query", "query.ql"],
        {
          OPENROUTER_API_KEY: "sk-or-v1-secret",
          BRAVE_SEARCH_API_KEY: "brave-secret",
          ORX_PLUGIN_REGISTRY_PATH: "should-not-forward",
          HOME: join(cwd, "sk-or-v1-home-secret"),
          PATH: "/usr/bin",
          LANG: "C",
        },
        codeql.io,
      ),
      0,
    );
    assert.match(codeql.stdout(), /Security scanner run/);
    assert.match(codeql.stdout(), /profile: codeql/);
    assert.match(codeql.stdout(), /query: query\.ql/);
    assert.match(codeql.stdout(), /CodeQL SARIF summary/);
    assert.match(codeql.stdout(), /results: 1/);
    assert.match(codeql.stdout(), /Authorization: Bearer \[redacted\]/);
    assert.doesNotMatch(codeql.stdout(), /codeql-secret|should-redact|sk-or-v1-secret|brave-secret/);
    assert.equal(codeql.stderr(), "");
    const codeqlArgs = scannerCalls.at(-1)?.args ?? [];
    assert.equal(scannerCalls.at(-1)?.command, "codeql");
    assert.equal(scannerCalls.at(-1)?.shell, false);
    assert.equal(scannerCalls.at(-1)?.inheritEnv, false);
    assert.equal(scannerCalls.at(-1)?.env?.HOME, undefined);
    assert.match(codeqlArgs.find((arg) => arg.startsWith("--output=")) ?? "", /^--output=.+results\.sarif$/);
    assert.deepEqual(
      codeqlArgs.filter((arg) => !arg.startsWith("--output=")),
      [
        "database",
        "analyze",
        "--format=sarifv2.1.0",
        "--no-download",
        "--no-sarif-add-file-contents",
        "--no-sarif-add-snippets",
        "--sarif-include-query-help=never",
        "--no-print-diagnostics-summary",
        "--no-print-metrics-summary",
        "--threads=0",
        "--",
        "codeql-db",
        "query.ql",
      ],
    );

    const codeqlJson = createIo({ cwd, scannerRunner });
    assert.equal(await runCli(["node", "cli", "scan", "codeql", "codeql-db", "--query", "query.ql", "--json"], {}, codeqlJson.io), 0);
    const codeqlJsonReport = JSON.parse(codeqlJson.stdout());
    assert.equal(codeqlJsonReport.runs[0].results[0].message.text, "api_key=[redacted]");
    assert.doesNotMatch(codeqlJson.stdout(), /codeql-secret|should-redact/);
    assert.equal(codeqlJson.stderr(), "");

    const codeqlLarge = createIo({ cwd, scannerRunner });
    assert.equal(
      await runCli(["node", "cli", "scan", "codeql", "codeql-db", "--query", "large-query.ql"], {}, codeqlLarge.io),
      0,
    );
    assert.match(codeqlLarge.stdout(), /CodeQL SARIF summary/);
    assert.match(codeqlLarge.stdout(), /results: unavailable \(SARIF output exceeded ORX output byte limit\)/);
    assert.match(codeqlLarge.stdout(), /stdout truncated:/);
    assert.doesNotMatch(codeqlLarge.stdout(), /AAAAA/);
    assert.equal(codeqlLarge.stderr(), "");

    const missing = createIo({
      cwd,
      scannerRunner: async (options) => mockProcessResult(options, {
        exitCode: null,
        error: { code: "ENOENT", message: "spawn semgrep ENOENT" },
      }),
    });
    assert.equal(
      await runCli(["node", "cli", "scanners", "run", "semgrep", "src", "--config", "semgrep.yml"], {}, missing.io),
      1,
    );
    assert.match(missing.stderr(), /Semgrep is not installed or not on PATH/);

    const beforeUnsafeCalls = scannerCalls.length;
    const unsafeRegistryConfig = createIo({ cwd, scannerRunner });
    assert.equal(
      await runCli(["node", "cli", "scanners", "run", "semgrep", "src", "--config", "p/default"], {}, unsafeRegistryConfig.io),
      1,
    );
    assert.match(unsafeRegistryConfig.stderr(), /not a Semgrep registry config/);
    assert.equal(scannerCalls.length, beforeUnsafeCalls);

    const trivyConfig = createIo({ cwd, scannerRunner });
    assert.equal(
      await runCli(["node", "cli", "scan", "trivy", "src", "--config", "semgrep.yml"], {}, trivyConfig.io),
      1,
    );
    assert.match(trivyConfig.stderr(), /Trivy secret scans do not accept --config/);
    assert.equal(scannerCalls.length, beforeUnsafeCalls);

    const osvConfig = createIo({ cwd, scannerRunner });
    assert.equal(
      await runCli(["node", "cli", "scan", "osv-scanner", "src", "--config", "semgrep.yml"], {}, osvConfig.io),
      1,
    );
    assert.match(osvConfig.stderr(), /OSV-Scanner offline source scans do not accept --config/);
    assert.equal(scannerCalls.length, beforeUnsafeCalls);

    const osvQuery = createIo({ cwd, scannerRunner });
    assert.equal(
      await runCli(["node", "cli", "scan", "osv-scanner", "src", "--query", "query.ql"], {}, osvQuery.io),
      1,
    );
    assert.match(osvQuery.stderr(), /Only the CodeQL scanner profile accepts --query/);
    assert.equal(scannerCalls.length, beforeUnsafeCalls);

    const trivyEmptyConfigEquals = createIo({ cwd, scannerRunner });
    assert.equal(await runCli(["node", "cli", "scan", "trivy", "src", "--config="], {}, trivyEmptyConfigEquals.io), 1);
    assert.match(trivyEmptyConfigEquals.stderr(), /Trivy secret scans do not accept --config/);
    assert.equal(scannerCalls.length, beforeUnsafeCalls);

    const trivyEmptyConfigValue = createIo({ cwd, scannerRunner });
    assert.equal(await runCli(["node", "cli", "scan", "trivy", "src", "--config", ""], {}, trivyEmptyConfigValue.io), 1);
    assert.match(trivyEmptyConfigValue.stderr(), /Trivy secret scans do not accept --config/);
    assert.equal(scannerCalls.length, beforeUnsafeCalls);

    const codeqlConfig = createIo({ cwd, scannerRunner });
    assert.equal(
      await runCli(["node", "cli", "scan", "codeql", "codeql-db", "--config", "semgrep.yml"], {}, codeqlConfig.io),
      1,
    );
    assert.match(codeqlConfig.stderr(), /CodeQL database analysis does not accept --config/);
    assert.equal(scannerCalls.length, beforeUnsafeCalls);

    const codeqlMissingQuery = createIo({ cwd, scannerRunner });
    assert.equal(await runCli(["node", "cli", "scan", "codeql", "codeql-db"], {}, codeqlMissingQuery.io), 1);
    assert.match(codeqlMissingQuery.stderr(), /Missing required --query/);
    assert.equal(scannerCalls.length, beforeUnsafeCalls);

    const outside = createTempDir();
    writeFileSync(join(outside, "outside.yml"), "rules: []\n");
    symlinkSync(join(outside, "outside.yml"), join(cwd, "outside-link.yml"));
    const unsafeSymlink = createIo({ cwd, scannerRunner });
    assert.equal(
      await runCli(
        ["node", "cli", "scanners", "run", "semgrep", "src", "--config", "outside-link.yml"],
        {},
        unsafeSymlink.io,
      ),
      1,
    );
    assert.match(unsafeSymlink.stderr(), /config resolves outside the current working directory/);

    symlinkSync(join(outside, "outside.yml"), join(cwd, "outside-target.yml"));
    const unsafeTrivySymlink = createIo({ cwd, scannerRunner });
    assert.equal(
      await runCli(["node", "cli", "scan", "trivy", "outside-target.yml"], {}, unsafeTrivySymlink.io),
      1,
    );
    assert.match(unsafeTrivySymlink.stderr(), /path resolves outside the current working directory/);
    assert.equal(scannerCalls.length, beforeUnsafeCalls);

    symlinkSync(join(outside, "outside.yml"), join(cwd, "outside-osv-target.yml"));
    const unsafeOsvSymlink = createIo({ cwd, scannerRunner });
    assert.equal(
      await runCli(["node", "cli", "scan", "osv-scanner", "outside-osv-target.yml"], {}, unsafeOsvSymlink.io),
      1,
    );
    assert.match(unsafeOsvSymlink.stderr(), /path resolves outside the current working directory/);
    assert.equal(scannerCalls.length, beforeUnsafeCalls);

    symlinkSync(join(outside, "outside.yml"), join(cwd, "outside-query.ql"));
    const unsafeCodeqlQuerySymlink = createIo({ cwd, scannerRunner });
    assert.equal(
      await runCli(["node", "cli", "scan", "codeql", "codeql-db", "--query", "outside-query.ql"], {}, unsafeCodeqlQuerySymlink.io),
      1,
    );
    assert.match(unsafeCodeqlQuerySymlink.stderr(), /query resolves outside the current working directory/);
    assert.equal(scannerCalls.length, beforeUnsafeCalls);
    rmSync(outside, { recursive: true, force: true });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("cli diagnostics commands list, inspect, and run TypeScript with guarded local execution", async () => {
  const cwd = createTempDir();
  try {
    mkdirSync(join(cwd, "src"), { recursive: true });
    mkdirSync(join(cwd, "config"), { recursive: true });
    mkdirSync(join(cwd, "node_modules", ".bin"), { recursive: true });
    mkdirSync(join(cwd, ".venv", "bin"), { recursive: true });
    writeFileSync(join(cwd, "src", "app.ts"), "const value: string = 1;\n");
    writeFileSync(join(cwd, "src", "app.py"), "value: str = 1\n");
    writeFileSync(join(cwd, "src", "app.js"), "console.log(missing);\n");
    writeFileSync(join(cwd, "src", "main.go"), "package main\nfunc main() {}\n");
    writeFileSync(join(cwd, "src", "main.cpp"), "int main() { return missing_symbol; }\n");
    writeFileSync(join(cwd, "src", "notes.txt"), "not a clangd source\n");
    writeFileSync(join(cwd, "tsconfig.json"), "{\"compilerOptions\":{\"strict\":true},\"include\":[\"src\"]}\n");
    writeFileSync(join(cwd, "node_modules", ".bin", "tsc"), "#!/usr/bin/env node\n");
    writeFileSync(join(cwd, "node_modules", ".bin", "pyright"), "#!/usr/bin/env node\n");
    writeFileSync(join(cwd, "node_modules", ".bin", "eslint"), "#!/usr/bin/env node\n");
    writeFileSync(join(cwd, "node_modules", ".bin", "gopls"), "#!/usr/bin/env node\n");
    writeFileSync(join(cwd, "node_modules", ".bin", "clangd"), "#!/usr/bin/env node\n");
    writeFileSync(join(cwd, ".venv", "bin", "ruff"), "#!/usr/bin/env python\n");
    writeFileSync(join(cwd, ".venv", "bin", "mypy"), "#!/usr/bin/env python\n");
    const mypyCacheDir = process.platform === "win32" ? "nul" : "/dev/null";

    const list = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "diagnostics", "list"], {}, list.io), 0);
    assert.match(list.stdout(), /Local diagnostics profiles/);
    assert.match(list.stdout(), /id=typescript state=runnable/);
    assert.match(list.stdout(), /id=pyright state=runnable/);
    assert.match(list.stdout(), /id=eslint state=runnable/);
    assert.match(list.stdout(), /id=ruff state=runnable/);
    assert.match(list.stdout(), /id=mypy state=runnable/);
    assert.match(list.stdout(), /id=gopls state=runnable/);
    assert.match(list.stdout(), /id=clangd state=runnable/);

    const listJson = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "diagnostics", "--json"], {}, listJson.io), 0);
    const profileReport = JSON.parse(listJson.stdout());
    assert.equal(profileReport.surface, "orx.local_diagnostics_profiles");
    assert.equal(profileReport.model_tool, "not_exposed");
    assert.equal(profileReport.network, "none_for_list_or_inspect");
    const profileEntries = profileReport.profiles as Array<{ id: string; state: string }>;
    assert.equal(profileEntries.find((profile) => profile.id === "typescript")?.state, "runnable");
    assert.equal(profileEntries.find((profile) => profile.id === "eslint")?.state, "runnable");
    assert.equal(profileEntries.find((profile) => profile.id === "ruff")?.state, "runnable");
    assert.equal(profileEntries.find((profile) => profile.id === "mypy")?.state, "runnable");
    assert.equal(profileEntries.find((profile) => profile.id === "rust-analyzer")?.state, "catalog_only");
    assert.equal(profileEntries.find((profile) => profile.id === "scip-typescript")?.state, "catalog_only");
    assert.equal(listJson.stderr(), "");

    const inspect = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "diag", "inspect", "typescript"], {}, inspect.io), 0);
    assert.match(inspect.stdout(), /Local diagnostics profile: typescript/);
    assert.match(inspect.stdout(), /command_shape: tsc --noEmit --pretty false --project <tsconfig>/);

    const inspectPyright = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "diag", "inspect", "pyright"], {}, inspectPyright.io), 0);
    assert.match(inspectPyright.stdout(), /Local diagnostics profile: pyright/);
    assert.match(inspectPyright.stdout(), /command_shape: pyright --outputjson --project <project-file-or-directory>/);

    const inspectEslint = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "diagnostics", "inspect", "eslint"], {}, inspectEslint.io), 0);
    assert.match(inspectEslint.stdout(), /Local diagnostics profile: eslint/);
    assert.match(inspectEslint.stdout(), /command_shape: eslint --format json <file-or-directory>/);

    const inspectRuff = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "diagnostics", "inspect", "ruff"], {}, inspectRuff.io), 0);
    assert.match(inspectRuff.stdout(), /Local diagnostics profile: ruff/);
    assert.match(inspectRuff.stdout(), /command_shape: ruff check --output-format json --no-cache <file-or-directory>/);

    const inspectMypy = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "diagnostics", "inspect", "mypy"], {}, inspectMypy.io), 0);
    assert.match(inspectMypy.stdout(), /Local diagnostics profile: mypy/);
    assert.match(inspectMypy.stdout(), /command_shape: mypy --no-color-output --no-error-summary --show-column-numbers --no-incremental --cache-dir <null-device> <file-or-directory>/);

    const inspectPyrightJson = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "diagnostics", "inspect", "pyright", "--json"], {}, inspectPyrightJson.io), 0);
    const pyrightInspectReport = JSON.parse(inspectPyrightJson.stdout());
    assert.equal(pyrightInspectReport.surface, "orx.local_diagnostics_profile");
    assert.equal(pyrightInspectReport.profile.id, "pyright");
    assert.equal(pyrightInspectReport.profile.details.command_shape, "pyright --outputjson --project <project-file-or-directory>");
    assert.equal(inspectPyrightJson.stderr(), "");

    const inspectEslintJson = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "diagnostics", "inspect", "eslint", "--json"], {}, inspectEslintJson.io), 0);
    const eslintInspectReport = JSON.parse(inspectEslintJson.stdout());
    assert.equal(eslintInspectReport.surface, "orx.local_diagnostics_profile");
    assert.equal(eslintInspectReport.profile.id, "eslint");
    assert.equal(eslintInspectReport.profile.details.command_shape, "eslint --format json <file-or-directory>");
    assert.equal(inspectEslintJson.stderr(), "");

    const inspectRuffJson = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "diagnostics", "inspect", "ruff", "--json"], {}, inspectRuffJson.io), 0);
    const ruffInspectReport = JSON.parse(inspectRuffJson.stdout());
    assert.equal(ruffInspectReport.surface, "orx.local_diagnostics_profile");
    assert.equal(ruffInspectReport.profile.id, "ruff");
    assert.equal(ruffInspectReport.profile.details.command_shape, "ruff check --output-format json --no-cache <file-or-directory>");
    assert.equal(inspectRuffJson.stderr(), "");

    const inspectMypyJson = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "diagnostics", "inspect", "mypy", "--json"], {}, inspectMypyJson.io), 0);
    const mypyInspectReport = JSON.parse(inspectMypyJson.stdout());
    assert.equal(mypyInspectReport.surface, "orx.local_diagnostics_profile");
    assert.equal(mypyInspectReport.profile.id, "mypy");
    assert.equal(
      mypyInspectReport.profile.details.command_shape,
      "mypy --no-color-output --no-error-summary --show-column-numbers --no-incremental --cache-dir <null-device> <file-or-directory>",
    );
    assert.equal(inspectMypyJson.stderr(), "");

    const inspectGopls = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "diag", "inspect", "gopls"], {}, inspectGopls.io), 0);
    assert.match(inspectGopls.stdout(), /Local diagnostics profile: gopls/);
    assert.match(inspectGopls.stdout(), /default_project: none; --project <local-go-file> is required/);
    assert.match(inspectGopls.stdout(), /command_shape: gopls check <go-file>/);
    assert.match(inspectGopls.stdout(), /GOPROXY=off GOSUMDB=off GOTOOLCHAIN=local/);

    const inspectClangd = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "diagnostics", "inspect", "clangd"], {}, inspectClangd.io), 0);
    assert.match(inspectClangd.stdout(), /state: runnable/);
    assert.match(inspectClangd.stdout(), /default_project: none; --project <local-c-cpp-source-or-header-file> is required/);
    assert.match(inspectClangd.stdout(), /command_shape: clangd --log=error --check=<file>/);

    const scipPlan = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "diagnostics", "plan", "scip-typescript"], {}, scipPlan.io), 0);
    assert.match(scipPlan.stdout(), /Diagnostics setup plan: scip-typescript/);
    assert.match(scipPlan.stdout(), /status: catalog_only/);
    assert.match(scipPlan.stdout(), /future_integration: future SCIP index generation and readback/);
    assert.match(scipPlan.stdout(), /`scip-typescript index` generates index output/);
    assert.match(scipPlan.stdout(), /execution: none/);
    assert.match(scipPlan.stdout(), /state_writes: none/);
    assert.equal(scipPlan.stderr(), "");

    const typescriptPlanJson = createIo({ cwd });
    assert.equal(
      await runCli(["node", "cli", "diagnostics", "setup-plan", "typescript", "--json"], {}, typescriptPlanJson.io),
      0,
    );
    const typescriptPlanReport = JSON.parse(typescriptPlanJson.stdout());
    assert.equal(typescriptPlanReport.surface, "orx.local_diagnostics_setup_plan");
    assert.equal(typescriptPlanReport.profile.id, "typescript");
    assert.equal(typescriptPlanReport.status, "runnable_now");
    assert.equal(typescriptPlanReport.current_run, "orx diagnostics run typescript [--project <local-tsconfig-path>] [--json]");
    assert.equal(typescriptPlanReport.authority.execution, "none");
    assert.equal(typescriptPlanReport.authority.state_writes, "none");
    assert.equal(typescriptPlanJson.stderr(), "");

    const planUsage = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "diag", "plan"], {}, planUsage.io), 1);
    assert.match(planUsage.stderr(), /^Usage: orx diag \[plan\|setup-plan\] <profile>/);

    const inspectUsage = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "diag", "inspect"], {}, inspectUsage.io), 1);
    assert.match(inspectUsage.stderr(), /^Usage: orx diag \[inspect\|show\] <profile>/);

    const listExtra = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "diagnostics", "list", "extra"], {}, listExtra.io), 1);
    assert.match(listExtra.stderr(), /^Usage: orx diagnostics/);

    const profileConfigPath = join(cwd, "profiles.json");
    writeFileSync(profileConfigPath, "{}\n");
    chmodSync(profileConfigPath, 0o666);
    const profiled = createIo({ cwd });
    assert.equal(
      await runCli(
        ["node", "cli", "--profile", "demo", "diagnostics", "list", "--json"],
        { ORX_PROFILE_CONFIG_PATH: profileConfigPath },
        profiled.io,
      ),
      0,
    );
    assert.equal(JSON.parse(profiled.stdout()).surface, "orx.local_diagnostics_profiles");
    assert.equal(profiled.stderr(), "");
    assert.equal(statSync(profileConfigPath).mode & 0o777, 0o666);

    const tscCalls: Array<Parameters<DiagnosticsProcessRunner>[0]> = [];
    const diagnosticsRunner: DiagnosticsProcessRunner = async (options) => {
      tscCalls.push(options);
      if (String(options.command).includes("gopls")) {
        return mockProcessResult(options, {
          exitCode: 1,
          stdout: "src/main.go:7:2: undefined: missing access_token=abcd1234\n",
          stderr: "Authorization: Bearer should-redact\n",
        });
      }
      if (String(options.command).includes("clangd")) {
        return mockProcessResult(options, {
          exitCode: 3,
          stdout: "",
          stderr: "E[02:01:35.987] [undeclared_var_use] Line 1: use of undeclared identifier 'missing_symbol' access_token=abcd1234\nAuthorization: Bearer should-redact\n",
        });
      }
      if (String(options.command).includes("pyright")) {
        return mockProcessResult(options, {
          exitCode: 1,
          stdout: JSON.stringify({
            version: "1.1.0",
            time: "0sec",
            generalDiagnostics: [
              {
                file: join(cwd, "src", "app.py"),
                severity: "error",
                message: "Expression of type \"Literal[1]\" cannot be assigned to declared type \"str\" access_token=abcd1234",
                range: { start: { line: 0, character: 13 }, end: { line: 0, character: 14 } },
                rule: "reportAssignmentType",
              },
            ],
            summary: { filesAnalyzed: 1, errorCount: 1, warningCount: 0, informationCount: 0, timeInSec: 0.1 },
          }),
          stderr: "Authorization: Bearer should-redact\n",
        });
      }
      if (String(options.command).includes("eslint")) {
        return mockProcessResult(options, {
          exitCode: 1,
          stdout: JSON.stringify([
            {
              filePath: join(cwd, "src", "app.js"),
              messages: [
                {
                  ruleId: "no-undef",
                  severity: 2,
                  message: "'missing' is not defined. access_token=abcd1234",
                  line: 1,
                  column: 13,
                },
                {
                  ruleId: "no-console",
                  severity: 1,
                  message: "Unexpected console statement.",
                  line: 1,
                  column: 1,
                },
              ],
            },
          ]),
          stderr: "Authorization: Bearer should-redact\n",
        });
      }
      if (String(options.command).includes("ruff")) {
        return mockProcessResult(options, {
          exitCode: 1,
          stdout: JSON.stringify([
            {
              filename: join(cwd, "src", "app.py"),
              code: "F401",
              message: "unused import access_token=abcd1234",
              location: { row: 1, column: 8 },
              end_location: { row: 1, column: 14 },
            },
          ]),
          stderr: "Authorization: Bearer should-redact\n",
        });
      }
      if (String(options.command).includes("mypy")) {
        return mockProcessResult(options, {
          exitCode: 1,
          stdout: [
            "src/app.py:1:7: error: Incompatible types in assignment access_token=abcd1234  [assignment]",
            "src/app.py: note: See https://mypy.readthedocs.io/",
            "",
          ].join("\n"),
          stderr: "Authorization: Bearer should-redact\n",
        });
      }
      return mockProcessResult(options, {
        exitCode: 0,
        stdout: "TypeScript clean\n",
      });
    };
    const run = createIo({ cwd, diagnosticsRunner });
    assert.equal(
      await runCli(
        ["node", "cli", "diagnostics", "run", "typescript"],
        {
          OPENROUTER_API_KEY: "sk-or-v1-secret",
          BRAVE_SEARCH_API_KEY: "brave-secret",
          ORX_PLUGIN_REGISTRY_PATH: "should-not-forward",
          HOME: join(cwd, "sk-or-v1-home-secret"),
          PATH: "/usr/bin",
          LANG: "C",
        },
        run.io,
      ),
      0,
    );
    assert.match(run.stdout(), /Local diagnostics run/);
    assert.match(run.stdout(), /status: ok/);
    assert.match(run.stdout(), /binary_source: local_node_modules/);
    assert.match(run.stdout(), /model_tool: not_exposed/);
    assert.doesNotMatch(run.stdout(), /sk-or-v1-secret|brave-secret|should-not-forward/);
    assert.equal(run.stderr(), "");
    assert.match(tscCalls.at(-1)?.command ?? "", /node_modules\/\.bin\/tsc$/);
    assert.deepEqual(tscCalls.at(-1)?.args, [
      "--noEmit",
      "--pretty",
      "false",
      "--project",
      "tsconfig.json",
    ]);
    assert.equal(tscCalls.at(-1)?.shell, false);
    assert.equal(tscCalls.at(-1)?.inheritEnv, false);
    assert.equal(tscCalls.at(-1)?.env?.PATH, "/usr/bin");
    assert.equal(tscCalls.at(-1)?.env?.LANG, "C");
    assert.equal(tscCalls.at(-1)?.env?.OPENROUTER_API_KEY, undefined);
    assert.equal(tscCalls.at(-1)?.env?.BRAVE_SEARCH_API_KEY, undefined);
    assert.equal(tscCalls.at(-1)?.env?.ORX_PLUGIN_REGISTRY_PATH, undefined);
    assert.equal(tscCalls.at(-1)?.env?.HOME, undefined);

    const json = createIo({
      cwd,
      diagnosticsRunner: async (options) => mockProcessResult(options, {
        exitCode: 2,
        stdout: "src/app.ts(1,7): error TS2322: Type 'number' is not assignable to type 'string'. access_token=abcd1234\n",
        stderr: "Authorization: Bearer should-redact\n",
      }),
    });
    assert.equal(
      await runCli(["node", "cli", "diag", "run", "typescript", "--json"], {}, json.io),
      1,
    );
    const report = JSON.parse(json.stdout());
    assert.equal(report.surface, "orx.local_diagnostics");
    assert.equal(report.status, "failed");
    assert.equal(report.model_tool, "not_exposed");
    assert.equal(report.command.shell, false);
    assert.equal(report.diagnostics[0].code, "TS2322");
    assert.equal(report.diagnostics[0].file, "src/app.ts");
    assert.equal(report.raw_output.stdout.truncated, false);
    assert.doesNotMatch(json.stdout(), /abcd1234|should-redact/);
    assert.equal(json.stderr(), "");

    const pyright = createIo({ cwd, diagnosticsRunner });
    assert.equal(await runCli(["node", "cli", "diagnostics", "run", "pyright"], {}, pyright.io), 1);
    assert.equal(pyright.stdout(), "");
    assert.match(pyright.stderr(), /Local diagnostics run/);
    assert.match(pyright.stderr(), /profile: pyright/);
    assert.match(pyright.stderr(), /status: failed/);
    assert.match(pyright.stderr(), /binary_source: local_node_modules/);
    assert.match(pyright.stderr(), /parsed_diagnostics: 1/);
    assert.match(pyright.stderr(), /src\/app\.py:1:14 error reportAssignmentType/);
    assert.match(pyright.stderr(), /access_token=\[redacted\]/);
    assert.match(pyright.stderr(), /Authorization: Bearer \[redacted\]/);
    assert.doesNotMatch(pyright.stderr(), /abcd1234|should-redact/);
    assert.match(tscCalls.at(-1)?.command ?? "", /node_modules\/\.bin\/pyright$/);
    assert.deepEqual(tscCalls.at(-1)?.args, [
      "--outputjson",
      "--project",
      ".",
    ]);
    assert.equal(tscCalls.at(-1)?.shell, false);
    assert.equal(tscCalls.at(-1)?.inheritEnv, false);

    const pyrightProject = createIo({ cwd, diagnosticsRunner });
    assert.equal(
      await runCli(["node", "cli", "diagnostics", "run", "pyright", "--project", "config"], {}, pyrightProject.io),
      1,
    );
    assert.match(pyrightProject.stderr(), /project: config/);
    assert.deepEqual(tscCalls.at(-1)?.args, [
      "--outputjson",
      "--project",
      "config",
    ]);

    const eslint = createIo({ cwd, diagnosticsRunner });
    assert.equal(
      await runCli(["node", "cli", "diagnostics", "run", "eslint", "--project", "src/app.js"], {}, eslint.io),
      1,
    );
    assert.equal(eslint.stdout(), "");
    assert.match(eslint.stderr(), /Local diagnostics run/);
    assert.match(eslint.stderr(), /profile: eslint/);
    assert.match(eslint.stderr(), /status: failed/);
    assert.match(eslint.stderr(), /binary_source: local_node_modules/);
    assert.match(eslint.stderr(), /parsed_diagnostics: 2/);
    assert.match(eslint.stderr(), /src\/app\.js:1:13 error no-undef 'missing' is not defined\. access_token=\[redacted\]/);
    assert.match(eslint.stderr(), /src\/app\.js:1:1 warning no-console Unexpected console statement\./);
    assert.match(eslint.stderr(), /Authorization: Bearer \[redacted\]/);
    assert.doesNotMatch(eslint.stderr(), /abcd1234|should-redact/);
    assert.match(tscCalls.at(-1)?.command ?? "", /node_modules\/\.bin\/eslint$/);
    assert.deepEqual(tscCalls.at(-1)?.args, ["--format", "json", "src/app.js"]);
    assert.equal(tscCalls.at(-1)?.shell, false);
    assert.equal(tscCalls.at(-1)?.inheritEnv, false);

    const eslintJson = createIo({ cwd, diagnosticsRunner });
    assert.equal(await runCli(["node", "cli", "diag", "run", "eslint", "--json"], {}, eslintJson.io), 1);
    const eslintReport = JSON.parse(eslintJson.stdout());
    assert.equal(eslintReport.surface, "orx.local_diagnostics");
    assert.equal(eslintReport.profile, "eslint");
    assert.equal(eslintReport.command.shell, false);
    assert.deepEqual(eslintReport.command.args, ["--format", "json", "."]);
    assert.equal(eslintReport.diagnostics[0].code, "no-undef");
    assert.equal(eslintReport.diagnostics[0].severity, "error");
    assert.equal(eslintReport.diagnostics[1].severity, "warning");
    assert.doesNotMatch(eslintJson.stdout(), /abcd1234|should-redact/);
    assert.equal(eslintJson.stderr(), "");

    const ruff = createIo({ cwd, diagnosticsRunner });
    assert.equal(
      await runCli(["node", "cli", "diagnostics", "run", "ruff", "--project", "src/app.py"], {}, ruff.io),
      1,
    );
    assert.equal(ruff.stdout(), "");
    assert.match(ruff.stderr(), /Local diagnostics run/);
    assert.match(ruff.stderr(), /profile: ruff/);
    assert.match(ruff.stderr(), /status: failed/);
    assert.match(ruff.stderr(), /binary_source: local_venv/);
    assert.match(ruff.stderr(), /parsed_diagnostics: 1/);
    assert.match(ruff.stderr(), /src\/app\.py:1:8 error F401 unused import access_token=\[redacted\]/);
    assert.match(ruff.stderr(), /Authorization: Bearer \[redacted\]/);
    assert.doesNotMatch(ruff.stderr(), /abcd1234|should-redact/);
    assert.match(tscCalls.at(-1)?.command ?? "", /\.venv\/bin\/ruff$/);
    assert.deepEqual(tscCalls.at(-1)?.args, ["check", "--output-format", "json", "--no-cache", "src/app.py"]);
    assert.equal(tscCalls.at(-1)?.shell, false);
    assert.equal(tscCalls.at(-1)?.inheritEnv, false);

    const ruffJson = createIo({ cwd, diagnosticsRunner });
    assert.equal(await runCli(["node", "cli", "diag", "run", "ruff", "--json"], {}, ruffJson.io), 1);
    const ruffReport = JSON.parse(ruffJson.stdout());
    assert.equal(ruffReport.surface, "orx.local_diagnostics");
    assert.equal(ruffReport.profile, "ruff");
    assert.equal(ruffReport.command.shell, false);
    assert.deepEqual(ruffReport.command.args, ["check", "--output-format", "json", "--no-cache", "."]);
    assert.equal(ruffReport.command.binary_source, "local_venv");
    assert.equal(ruffReport.diagnostics[0].code, "F401");
    assert.equal(ruffReport.diagnostics[0].file, "src/app.py");
    assert.doesNotMatch(ruffJson.stdout(), /abcd1234|should-redact/);
    assert.equal(ruffJson.stderr(), "");

    const mypy = createIo({ cwd, diagnosticsRunner });
    assert.equal(
      await runCli(["node", "cli", "diagnostics", "run", "mypy", "--project", "src/app.py"], {}, mypy.io),
      1,
    );
    assert.equal(mypy.stdout(), "");
    assert.match(mypy.stderr(), /Local diagnostics run/);
    assert.match(mypy.stderr(), /profile: mypy/);
    assert.match(mypy.stderr(), /status: failed/);
    assert.match(mypy.stderr(), /binary_source: local_venv/);
    assert.match(mypy.stderr(), /parsed_diagnostics: 2/);
    assert.match(mypy.stderr(), /src\/app\.py:1:8 error assignment Incompatible types in assignment access_token=\[redacted\]/);
    assert.match(mypy.stderr(), /src\/app\.py:1:1 message mypy See https:\/\/mypy\.readthedocs\.io\//);
    assert.match(mypy.stderr(), /Authorization: Bearer \[redacted\]/);
    assert.doesNotMatch(mypy.stderr(), /abcd1234|should-redact/);
    assert.match(tscCalls.at(-1)?.command ?? "", /\.venv\/bin\/mypy$/);
    assert.deepEqual(tscCalls.at(-1)?.args, [
      "--no-color-output",
      "--no-error-summary",
      "--show-column-numbers",
      "--no-incremental",
      "--cache-dir",
      mypyCacheDir,
      "src/app.py",
    ]);
    assert.equal(tscCalls.at(-1)?.shell, false);
    assert.equal(tscCalls.at(-1)?.inheritEnv, false);

    const mypyJson = createIo({ cwd, diagnosticsRunner });
    assert.equal(await runCli(["node", "cli", "diag", "run", "mypy", "--json"], {}, mypyJson.io), 1);
    const mypyReport = JSON.parse(mypyJson.stdout());
    assert.equal(mypyReport.surface, "orx.local_diagnostics");
    assert.equal(mypyReport.profile, "mypy");
    assert.equal(mypyReport.command.shell, false);
    assert.deepEqual(mypyReport.command.args, [
      "--no-color-output",
      "--no-error-summary",
      "--show-column-numbers",
      "--no-incremental",
      "--cache-dir",
      mypyCacheDir,
      ".",
    ]);
    assert.equal(mypyReport.command.binary_source, "local_venv");
    assert.equal(mypyReport.diagnostics[0].code, "assignment");
    assert.equal(mypyReport.diagnostics[0].file, "src/app.py");
    assert.equal(mypyReport.diagnostics[0].column, 8);
    assert.equal(mypyReport.diagnostics[1].severity, "message");
    assert.doesNotMatch(mypyJson.stdout(), /abcd1234|should-redact/);
    assert.equal(mypyJson.stderr(), "");

    const gopls = createIo({ cwd, diagnosticsRunner });
    assert.equal(
      await runCli(["node", "cli", "diagnostics", "run", "gopls", "--project", "src/main.go"], {}, gopls.io),
      1,
    );
    assert.equal(gopls.stdout(), "");
    assert.match(gopls.stderr(), /Local diagnostics run/);
    assert.match(gopls.stderr(), /profile: gopls/);
    assert.match(gopls.stderr(), /status: failed/);
    assert.match(gopls.stderr(), /binary_source: local_node_modules/);
    assert.match(gopls.stderr(), /parsed_diagnostics: 1/);
    assert.match(gopls.stderr(), /src\/main\.go:7:2 error gopls undefined: missing access_token=\[redacted\]/);
    assert.match(gopls.stderr(), /Authorization: Bearer \[redacted\]/);
    assert.doesNotMatch(gopls.stderr(), /abcd1234|should-redact/);
    assert.match(tscCalls.at(-1)?.command ?? "", /node_modules\/\.bin\/gopls$/);
    assert.deepEqual(tscCalls.at(-1)?.args, ["check", "src/main.go"]);
    assert.equal(tscCalls.at(-1)?.shell, false);
    assert.equal(tscCalls.at(-1)?.inheritEnv, false);
    assert.equal(tscCalls.at(-1)?.env?.GOPROXY, "off");
    assert.equal(tscCalls.at(-1)?.env?.GOSUMDB, "off");
    assert.equal(tscCalls.at(-1)?.env?.GOTOOLCHAIN, "local");

    const clangd = createIo({ cwd, diagnosticsRunner });
    assert.equal(
      await runCli(["node", "cli", "diagnostics", "run", "clangd", "--project", "src/main.cpp"], {}, clangd.io),
      1,
    );
    assert.equal(clangd.stdout(), "");
    assert.match(clangd.stderr(), /Local diagnostics run/);
    assert.match(clangd.stderr(), /profile: clangd/);
    assert.match(clangd.stderr(), /status: failed/);
    assert.match(clangd.stderr(), /binary_source: local_node_modules/);
    assert.match(clangd.stderr(), /parsed_diagnostics: 1/);
    assert.match(clangd.stderr(), /src\/main\.cpp:1:1 error undeclared_var_use use of undeclared identifier 'missing_symbol' access_token=\[redacted\]/);
    assert.match(clangd.stderr(), /Authorization: Bearer \[redacted\]/);
    assert.doesNotMatch(clangd.stderr(), /abcd1234|should-redact/);
    assert.match(tscCalls.at(-1)?.command ?? "", /node_modules\/\.bin\/clangd$/);
    assert.deepEqual(tscCalls.at(-1)?.args, ["--log=error", "--check=src/main.cpp"]);
    assert.equal(tscCalls.at(-1)?.shell, false);
    assert.equal(tscCalls.at(-1)?.inheritEnv, false);
    assert.equal(tscCalls.at(-1)?.env?.GOPROXY, undefined);
    assert.equal(tscCalls.at(-1)?.env?.GOSUMDB, undefined);
    assert.equal(tscCalls.at(-1)?.env?.GOTOOLCHAIN, undefined);

    const beforeGoplsInvalidCalls = tscCalls.length;
    const goplsMissingProject = createIo({ cwd, diagnosticsRunner });
    assert.equal(await runCli(["node", "cli", "diagnostics", "run", "gopls"], {}, goplsMissingProject.io), 1);
    assert.match(goplsMissingProject.stderr(), /gopls diagnostics require --project <local-go-file>/);
    assert.equal(tscCalls.length, beforeGoplsInvalidCalls);

    const goplsDirectoryProject = createIo({ cwd, diagnosticsRunner });
    assert.equal(
      await runCli(["node", "cli", "diagnostics", "run", "gopls", "--project", "src"], {}, goplsDirectoryProject.io),
      1,
    );
    assert.match(goplsDirectoryProject.stderr(), /project must be a regular local \.go file/);
    assert.equal(tscCalls.length, beforeGoplsInvalidCalls);

    const beforeClangdInvalidCalls = tscCalls.length;
    const clangdMissingProject = createIo({ cwd, diagnosticsRunner });
    assert.equal(await runCli(["node", "cli", "diagnostics", "run", "clangd"], {}, clangdMissingProject.io), 1);
    assert.match(clangdMissingProject.stderr(), /clangd diagnostics require --project <local-c-cpp-source-or-header-file>/);
    assert.equal(tscCalls.length, beforeClangdInvalidCalls);

    const clangdDirectoryProject = createIo({ cwd, diagnosticsRunner });
    assert.equal(
      await runCli(["node", "cli", "diagnostics", "run", "clangd", "--project", "src"], {}, clangdDirectoryProject.io),
      1,
    );
    assert.match(clangdDirectoryProject.stderr(), /project must be a regular local C\/C\+\+\/Objective-C source or header file/);
    assert.equal(tscCalls.length, beforeClangdInvalidCalls);

    const clangdTextProject = createIo({ cwd, diagnosticsRunner });
    assert.equal(
      await runCli(["node", "cli", "diagnostics", "run", "clangd", "--project", "src/notes.txt"], {}, clangdTextProject.io),
      1,
    );
    assert.match(clangdTextProject.stderr(), /project must be a local C\/C\+\+\/Objective-C source or header file/);
    assert.equal(tscCalls.length, beforeClangdInvalidCalls);

    const missingCwd = createTempDir();
    const missing = createIo({
      cwd: missingCwd,
      diagnosticsRunner: async (options) => mockProcessResult(options, {
        exitCode: null,
        error: { code: "ENOENT", message: "spawn tsc ENOENT" },
      }),
    });
    writeFileSync(join(missingCwd, "tsconfig.json"), "{}\n");
    assert.equal(await runCli(["node", "cli", "diagnostics", "run", "typescript"], {}, missing.io), 1);
    assert.match(missing.stderr(), /tsc is not installed or not on PATH/);
    rmSync(missingCwd, { recursive: true, force: true });

    const pathOnlyCwd = createTempDir();
    try {
      writeFileSync(join(pathOnlyCwd, "main.go"), "package main\nfunc main() {}\n");
      const pathCalls: Array<Parameters<DiagnosticsProcessRunner>[0]> = [];
      const pathOnly = createIo({
        cwd: pathOnlyCwd,
        diagnosticsRunner: async (options) => {
          pathCalls.push(options);
          if (String(options.command) === "gopls" && options.args?.join(" ") === "version") {
            return mockProcessResult(options, { exitCode: 0, stdout: "golang.org/x/tools/gopls v0.22.0\n" });
          }
          return mockProcessResult(options, { exitCode: 0, stdout: "" });
        },
      });
      assert.equal(
        await runCli(["node", "cli", "diagnostics", "run", "gopls", "--project", "main.go"], { PATH: "/usr/bin" }, pathOnly.io),
        0,
      );
      assert.deepEqual(pathCalls.map((call) => call.args), [
        ["version"],
        ["check", "main.go"],
      ]);
      assert.equal(pathCalls[0]?.command, "gopls");
      assert.equal(pathCalls[1]?.command, "gopls");
      assert.match(pathOnly.stdout(), /binary_source: path/);
    } finally {
      rmSync(pathOnlyCwd, { recursive: true, force: true });
    }

    const pathOnlyClangdCwd = createTempDir();
    try {
      writeFileSync(join(pathOnlyClangdCwd, "main.cpp"), "int main() { return 0; }\n");
      const pathCalls: Array<Parameters<DiagnosticsProcessRunner>[0]> = [];
      const pathOnly = createIo({
        cwd: pathOnlyClangdCwd,
        diagnosticsRunner: async (options) => {
          pathCalls.push(options);
          if (String(options.command) === "clangd" && options.args?.join(" ") === "--version") {
            return mockProcessResult(options, { exitCode: 0, stdout: "clangd version 18.0.0\n" });
          }
          return mockProcessResult(options, { exitCode: 0, stdout: "" });
        },
      });
      assert.equal(
        await runCli(["node", "cli", "diagnostics", "run", "clangd", "--project", "main.cpp"], { PATH: "/usr/bin" }, pathOnly.io),
        0,
      );
      assert.deepEqual(pathCalls.map((call) => call.args), [
        ["--version"],
        ["--log=error", "--check=main.cpp"],
      ]);
      assert.equal(pathCalls[0]?.command, "clangd");
      assert.equal(pathCalls[1]?.command, "clangd");
      assert.match(pathOnly.stdout(), /binary_source: path/);
    } finally {
      rmSync(pathOnlyClangdCwd, { recursive: true, force: true });
    }

    const pathOnlyRuffCwd = createTempDir();
    try {
      writeFileSync(join(pathOnlyRuffCwd, "app.py"), "import os\n");
      const pathCalls: Array<Parameters<DiagnosticsProcessRunner>[0]> = [];
      const pathOnly = createIo({
        cwd: pathOnlyRuffCwd,
        diagnosticsRunner: async (options) => {
          pathCalls.push(options);
          if (String(options.command) === "ruff" && options.args?.join(" ") === "--version") {
            return mockProcessResult(options, { exitCode: 0, stdout: "ruff 0.12.0\n" });
          }
          return mockProcessResult(options, { exitCode: 0, stdout: "[]\n" });
        },
      });
      assert.equal(
        await runCli(["node", "cli", "diagnostics", "run", "ruff", "--project", "app.py"], { PATH: "/usr/bin" }, pathOnly.io),
        0,
      );
      assert.deepEqual(pathCalls.map((call) => call.args), [
        ["--version"],
        ["check", "--output-format", "json", "--no-cache", "app.py"],
      ]);
      assert.equal(pathCalls[0]?.command, "ruff");
      assert.equal(pathCalls[1]?.command, "ruff");
      assert.match(pathOnly.stdout(), /binary_source: path/);
    } finally {
      rmSync(pathOnlyRuffCwd, { recursive: true, force: true });
    }

    const pathOnlyMypyCwd = createTempDir();
    try {
      writeFileSync(join(pathOnlyMypyCwd, "app.py"), "value: str = 1\n");
      const pathCalls: Array<Parameters<DiagnosticsProcessRunner>[0]> = [];
      const pathOnly = createIo({
        cwd: pathOnlyMypyCwd,
        diagnosticsRunner: async (options) => {
          pathCalls.push(options);
          if (String(options.command) === "mypy" && options.args?.join(" ") === "--version") {
            return mockProcessResult(options, { exitCode: 0, stdout: "mypy 1.18.0\n" });
          }
          return mockProcessResult(options, { exitCode: 0, stdout: "" });
        },
      });
      assert.equal(
        await runCli(["node", "cli", "diagnostics", "run", "mypy", "--project", "app.py"], { PATH: "/usr/bin" }, pathOnly.io),
        0,
      );
      assert.deepEqual(pathCalls.map((call) => call.args), [
        ["--version"],
        [
          "--no-color-output",
          "--no-error-summary",
          "--show-column-numbers",
          "--no-incremental",
          "--cache-dir",
          mypyCacheDir,
          "app.py",
        ],
      ]);
      assert.equal(pathCalls[0]?.command, "mypy");
      assert.equal(pathCalls[1]?.command, "mypy");
      assert.match(pathOnly.stdout(), /binary_source: path/);
    } finally {
      rmSync(pathOnlyMypyCwd, { recursive: true, force: true });
    }

    const beforeUnsafeCalls = tscCalls.length;
    const catalogOnly = createIo({ cwd, diagnosticsRunner });
    assert.equal(await runCli(["node", "cli", "diagnostics", "run", "rust-analyzer"], {}, catalogOnly.io), 1);
    assert.match(catalogOnly.stderr(), /catalog\/readiness-only/);
    assert.equal(tscCalls.length, beforeUnsafeCalls);

    const unsafeProject = createIo({ cwd, diagnosticsRunner });
    assert.equal(
      await runCli(["node", "cli", "diagnostics", "run", "typescript", "--project", "https://example.com/tsconfig.json"], {}, unsafeProject.io),
      1,
    );
    assert.match(unsafeProject.stderr(), /not a URL/);
    assert.equal(tscCalls.length, beforeUnsafeCalls);

    const unsafeRegistryProject = createIo({ cwd, diagnosticsRunner });
    assert.equal(
      await runCli(["node", "cli", "diagnostics", "run", "typescript", "--project", "typescript@latest"], {}, unsafeRegistryProject.io),
      1,
    );
    assert.match(unsafeRegistryProject.stderr(), /not a package, registry, or launcher value/);
    assert.equal(tscCalls.length, beforeUnsafeCalls);

    const unsafeRuffProject = createIo({ cwd, diagnosticsRunner });
    assert.equal(
      await runCli(["node", "cli", "diagnostics", "run", "ruff", "--project", "https://example.com/app.py"], {}, unsafeRuffProject.io),
      1,
    );
    assert.match(unsafeRuffProject.stderr(), /not a URL/);
    assert.equal(tscCalls.length, beforeUnsafeCalls);

    const unsafeMypyProject = createIo({ cwd, diagnosticsRunner });
    assert.equal(
      await runCli(["node", "cli", "diagnostics", "run", "mypy", "--project", "npx:mypy"], {}, unsafeMypyProject.io),
      1,
    );
    assert.match(unsafeMypyProject.stderr(), /not a package, registry, or launcher value/);
    assert.equal(tscCalls.length, beforeUnsafeCalls);

    const outside = createTempDir();
    writeFileSync(join(outside, "tsconfig.json"), "{}\n");
    symlinkSync(join(outside, "tsconfig.json"), join(cwd, "outside-tsconfig.json"));
    const unsafeSymlink = createIo({ cwd, diagnosticsRunner });
    assert.equal(
      await runCli(["node", "cli", "diagnostics", "run", "typescript", "--project", "outside-tsconfig.json"], {}, unsafeSymlink.io),
      1,
    );
    assert.match(unsafeSymlink.stderr(), /project resolves outside the current working directory/);
    writeFileSync(join(outside, "app.py"), "import os\n");
    symlinkSync(join(outside, "app.py"), join(cwd, "outside-app.py"));
    const unsafeRuffSymlink = createIo({ cwd, diagnosticsRunner });
    assert.equal(
      await runCli(["node", "cli", "diagnostics", "run", "ruff", "--project", "outside-app.py"], {}, unsafeRuffSymlink.io),
      1,
    );
    assert.match(unsafeRuffSymlink.stderr(), /project resolves outside the current working directory/);
    const unsafeMypySymlink = createIo({ cwd, diagnosticsRunner });
    assert.equal(
      await runCli(["node", "cli", "diagnostics", "run", "mypy", "--project", "outside-app.py"], {}, unsafeMypySymlink.io),
      1,
    );
    assert.match(unsafeMypySymlink.stderr(), /project resolves outside the current working directory/);
    assert.equal(tscCalls.length, beforeUnsafeCalls);
    rmSync(outside, { recursive: true, force: true });

    const toolNames = getNativeToolDefinitions().map((tool) => tool.function.name).sort();
    assert.equal(toolNames.includes("diagnostics"), false);
    assert.equal(toolNames.includes("diag"), false);
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

    const saveInline = createIo({ cwd });
    assert.equal(
      await runCli(
        [
          "node",
          "cli",
          "profile",
          "save",
          "fusion-vivid",
          "--model",
          "openrouter/fusion",
          "--mode",
          "fusion",
          "--fusion",
          "general-budget",
          "--theme",
          "vivid",
          "--approval-policy",
          "never",
          "--sandbox-mode",
          "danger-full-access",
        ],
        {
          ORX_PROFILE_CONFIG_PATH: profileConfigPath,
        },
        saveInline.io,
      ),
      0,
    );
    assert.match(saveInline.stdout(), /Profile fusion-vivid saved/);
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
    assert.match(list.stdout(), /saved_profiles: 2/);
    assert.match(list.stdout(), /daily mode=auto model=openrouter\/auto/);
    assert.match(list.stdout(), /fusion-vivid mode=fusion model=openrouter\/fusion fusion=general-budget theme=vivid/);

    const inspect = createIo({ cwd });
    assert.equal(
      await runCli(
        ["node", "cli", "profile", "inspect", "fusion-vivid"],
        {
          ORX_PROFILE_CONFIG_PATH: profileConfigPath,
        },
        inspect.io,
      ),
      0,
    );
    assert.match(inspect.stdout(), /ORX profile: fusion-vivid/);
    assert.match(inspect.stdout(), /mode: fusion/);
    assert.match(inspect.stdout(), /model: openrouter\/fusion/);
    assert.match(inspect.stdout(), /fusion_preset: general-budget/);
    assert.match(inspect.stdout(), /theme: vivid/);
    assert.match(inspect.stdout(), /api_key: not stored/);

    const unsafe = createIo({ cwd });
    assert.equal(
      await runCli(
        ["node", "cli", "profile", "save", "unsafe", "--model", "sk-or-v1-secret-profile"],
        {
          ORX_PROFILE_CONFIG_PATH: profileConfigPath,
        },
        unsafe.io,
      ),
      1,
    );
    assert.match(unsafe.stderr(), /Unsafe value for --model/);
    assert.doesNotMatch(unsafe.stderr(), /sk-or-v1-secret-profile/);

    const flagAsValue = createIo({ cwd });
    assert.equal(
      await runCli(
        ["node", "cli", "profile", "save", "flag-value", "--model", "--mode"],
        {
          ORX_PROFILE_CONFIG_PATH: profileConfigPath,
        },
        flagAsValue.io,
      ),
      1,
    );
    assert.match(flagAsValue.stderr(), /Missing value for --model/);

    const controlCharacter = createIo({ cwd });
    assert.equal(
      await runCli(
        ["node", "cli", "profile", "save", "control", "--model", "openrouter/auto\n"],
        {
          ORX_PROFILE_CONFIG_PATH: profileConfigPath,
        },
        controlCharacter.io,
      ),
      1,
    );
    assert.match(controlCharacter.stderr(), /Unsafe value for --model/);
    assert.doesNotMatch(controlCharacter.stderr(), /openrouter\/auto/);

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
  const authEnvDir = join(cwd, "mcp", "auth-env");
  const env = {
    ORX_MCP_CONFIG_PATH: mcpConfigPath,
    ORX_MCP_AUDIT_PATH: auditLogPath,
    ORX_MCP_AUTH_ENV_DIR: authEnvDir,
  };
  const keychainCalls: Array<{ args: string[]; stdio: string }> = [];
  const keychainRunner: McpMacosKeychainCommandRunner = async (args, options) => {
    keychainCalls.push({ args, stdio: options.stdio });
    if (args[0] === "find-generic-password") {
      return { code: 0, stdout: "keychain item metadata\n", stderr: "" };
    }
    if (args[0] === "add-generic-password") {
      return { code: 0, stdout: "", stderr: "" };
    }
    if (args[0] === "delete-generic-password") {
      return { code: 0, stdout: "", stderr: "" };
    }
    return { code: 1, stdout: "", stderr: "unexpected keychain command" };
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

    const missingAuth = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "mcp", "auth", "openrouter"], env, missingAuth.io), 0);
    assert.match(missingAuth.stdout(), /MCP auth: openrouter/);
    assert.match(missingAuth.stdout(), /auth_status: missing/);
    assert.match(missingAuth.stdout(), /profile_env: ORX_MCP_BEARER_OPENROUTER status=unset/);
    assert.match(missingAuth.stdout(), /fallback_env: ORX_MCP_BEARER_TOKEN status=unset/);
    assert.match(missingAuth.stdout(), /effective_bearer: missing/);
    assert.match(missingAuth.stdout(), new RegExp(`managed_env_file: ${escapeRegExp(join(authEnvDir, "openrouter.env"))}`));
    assert.match(missingAuth.stdout(), /macos_keychain: supported=(yes|no) opt_in=disabled status=not_checked/);
    assert.match(missingAuth.stdout(), /provider_auth: openrouter/);
    assert.match(missingAuth.stdout(), /credential_lifetime: provider default: 7 days for OAuth-created MCP keys/);
    assert.match(missingAuth.stdout(), /setup_url: https:\/\/openrouter\.ai\/docs\/mcp-server/);
    assert.match(missingAuth.stdout(), /storage: env vars are not persisted; optional macOS Keychain stores bearer values only after explicit keychain setup/);

    const authSetup = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "mcp", "auth", "setup", "openrouter"], env, authSetup.io), 0);
    assert.match(authSetup.stdout(), /MCP auth setup: openrouter/);
    assert.match(authSetup.stdout(), /auth_required: yes/);
    assert.match(authSetup.stdout(), /auth_status: missing/);
    assert.match(authSetup.stdout(), /credential_mode: env_bearer_then_optional_macos_keychain/);
    assert.match(authSetup.stdout(), /keychain_setup: orx mcp auth keychain set openrouter/);
    assert.match(authSetup.stdout(), /preferred_env: ORX_MCP_BEARER_OPENROUTER status=unset/);
    assert.match(authSetup.stdout(), /fallback_env: ORX_MCP_BEARER_TOKEN status=unset/);
    assert.match(authSetup.stdout(), new RegExp(`managed_env_file: ${escapeRegExp(join(authEnvDir, "openrouter.env"))}`));
    assert.match(authSetup.stdout(), /provider_auth: openrouter/);
    assert.match(authSetup.stdout(), /orx_support: paste the provider-issued key/);
    assert.match(authSetup.stdout(), /network_calls: none/);
    assert.match(authSetup.stdout(), /subprocesses: none/);
    assert.match(authSetup.stdout(), /config_writes: none/);
    assert.match(authSetup.stdout(), /bash_zsh: export ORX_MCP_BEARER_OPENROUTER="<bearer-token>"/);
    assert.match(authSetup.stdout(), /fallback_bash_zsh: export ORX_MCP_BEARER_TOKEN="<bearer-token>"/);
    assert.doesNotMatch(authSetup.stdout(), /mcp-secret-token|sk-or-v1/);

    const authEnvAlias = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "mcp", "auth", "env", "openrouter"], env, authEnvAlias.io), 0);
    assert.match(authEnvAlias.stdout(), /MCP auth setup: openrouter/);
    assert.match(authEnvAlias.stdout(), /bash_zsh: export ORX_MCP_BEARER_OPENROUTER="<bearer-token>"/);

    const authInit = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "mcp", "auth", "init", "openrouter"], env, authInit.io), 0);
    assert.match(authInit.stdout(), /MCP auth env file: openrouter/);
    assert.match(authInit.stdout(), /state_changed: yes/);
    assert.match(authInit.stdout(), /file_created: yes/);
    assert.match(authInit.stdout(), /directory_permissions_tightened: no/);
    assert.match(authInit.stdout(), /credential_mode: env_file_template/);
    assert.match(authInit.stdout(), /token_value: not written; edit the commented export locally/);
    assert.match(authInit.stdout(), /network_calls: none/);
    assert.match(authInit.stdout(), /subprocesses: none/);
    assert.match(authInit.stdout(), /config_writes: auth_env_file_only/);
    assert.match(authInit.stdout(), /bash_zsh: source /);
    const authEnvPath = join(authEnvDir, "openrouter.env");
    assert.equal(statSync(authEnvDir).mode & 0o777, 0o700);
    assert.equal(statSync(authEnvPath).mode & 0o777, 0o600);
    const authEnvTemplate = readFileSync(authEnvPath, "utf8");
    assert.match(authEnvTemplate, /# export ORX_MCP_BEARER_OPENROUTER="<bearer-token>"/);
    assert.doesNotMatch(authEnvTemplate, /^export ORX_MCP_BEARER_OPENROUTER/m);
    assert.doesNotMatch(authEnvTemplate, /mcp-secret-token|sk-or-v1/);

    writeFileSync(authEnvPath, "# user filled this later\nexport ORX_MCP_BEARER_OPENROUTER=\"filled-value\"\n", {
      mode: 0o644,
    });
    chmodSync(authEnvPath, 0o644);
    const authInitAgain = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "mcp", "auth", "env-file", "openrouter"], env, authInitAgain.io), 0);
    assert.match(authInitAgain.stdout(), /state_changed: yes/);
    assert.match(authInitAgain.stdout(), /file_created: no/);
    assert.match(authInitAgain.stdout(), /existing_file: yes/);
    assert.match(authInitAgain.stdout(), /permissions_tightened: yes/);
    assert.match(authInitAgain.stdout(), /directory_permissions_tightened: no/);
    assert.match(readFileSync(authEnvPath, "utf8"), /filled-value/);
    assert.equal(statSync(authEnvPath).mode & 0o777, 0o600);

    chmodSync(authEnvDir, 0o755);
    const authInitDirectoryOnly = createIo({ cwd });
    assert.equal(
      await runCli(["node", "cli", "mcp", "auth", "env-file", "openrouter"], env, authInitDirectoryOnly.io),
      0,
    );
    assert.match(authInitDirectoryOnly.stdout(), /state_changed: yes/);
    assert.match(authInitDirectoryOnly.stdout(), /file_created: no/);
    assert.match(authInitDirectoryOnly.stdout(), /existing_file: yes/);
    assert.match(authInitDirectoryOnly.stdout(), /permissions_tightened: no/);
    assert.match(authInitDirectoryOnly.stdout(), /directory_permissions_tightened: yes/);
    assert.equal(statSync(authEnvDir).mode & 0o777, 0o700);
    assert.equal(statSync(authEnvPath).mode & 0o777, 0o600);
    const authEnvFileEvents = readFileSync(auditLogPath, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { type: string; details?: Record<string, unknown> });
    assert.ok(
      authEnvFileEvents.some(
        (event) =>
          event.type === "mcp.profile.auth_env_file" &&
          event.details?.stateChanged === true &&
          event.details?.permissionsTightened === false &&
          event.details?.directoryPermissionsTightened === true,
      ),
    );

    const configuredAuth = createIo({ cwd });
    assert.equal(
      await runCli(
        ["node", "cli", "mcp", "auth", "openrouter"],
        {
          ...env,
          ORX_MCP_BEARER_OPENROUTER: "mcp-secret-token",
        },
        configuredAuth.io,
      ),
      0,
    );
    assert.match(configuredAuth.stdout(), /auth_status: configured/);
    assert.match(configuredAuth.stdout(), /profile_env: ORX_MCP_BEARER_OPENROUTER status=set/);
    assert.doesNotMatch(configuredAuth.stdout(), /mcp-secret-token/);

    const keychainStatus = createIo({
      cwd,
      mcpKeychainPlatform: "darwin",
      mcpKeychainRunner: keychainRunner,
    });
    assert.equal(
      await runCli(["node", "cli", "mcp", "auth", "keychain", "status", "openrouter"], env, keychainStatus.io),
      0,
    );
    assert.match(keychainStatus.stdout(), /MCP auth keychain status: openrouter/);
    assert.match(keychainStatus.stdout(), /status: configured/);
    assert.match(keychainStatus.stdout(), /token_value: never shown/);
    assert.match(keychainStatus.stdout(), /opt_in: ORX_MCP_KEYCHAIN=1 required/);
    assert.doesNotMatch(keychainStatus.stdout(), /mcp-secret-token|keychain-secret-token/);

    const keychainSet = createIo({
      cwd,
      mcpKeychainPlatform: "darwin",
      mcpKeychainRunner: keychainRunner,
    });
    assert.equal(
      await runCli(["node", "cli", "mcp", "auth", "keychain", "set", "openrouter"], env, keychainSet.io),
      0,
    );
    assert.match(keychainSet.stdout(), /MCP auth keychain set: openrouter/);
    assert.match(keychainSet.stdout(), /state_changed: yes/);
    assert.match(keychainSet.stdout(), /entered in macOS security prompt; never printed by ORX/);
    assert.equal(keychainCalls.at(-1)?.stdio, "inherit");
    assert.equal(keychainCalls.at(-1)?.args.at(-1), "-w");

    const keychainDelete = createIo({
      cwd,
      mcpKeychainPlatform: "darwin",
      mcpKeychainRunner: keychainRunner,
    });
    assert.equal(
      await runCli(["node", "cli", "mcp", "auth", "keychain", "delete", "openrouter"], env, keychainDelete.io),
      0,
    );
    assert.match(keychainDelete.stdout(), /MCP auth keychain delete: openrouter/);
    assert.match(keychainDelete.stdout(), /state_changed: yes/);

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
    assert.match(audit, /"type":"mcp.profile.auth_keychain"/);
    assert.match(audit, /"keychainService":"orx.mcp.bearer"/);
    assert.match(audit, /"type":"mcp.tool.allow_attempt"/);
    assert.match(audit, /"type":"mcp.tool.revoke_attempt"/);
    assert.match(audit, /"type":"mcp.model_tool.allow_attempt"/);
    assert.match(audit, /"type":"mcp.model_tool.revoke_attempt"/);
    assert.doesNotMatch(audit, /sk-or-v1/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("cli mcp auth init audits failed env-file writes without network or secrets", async () => {
  const cwd = createTempDir();
  const auditLogPath = join(cwd, "audit", "mcp.jsonl");
  const targetDir = join(cwd, "target");
  const linkDir = join(cwd, "link");
  mkdirSync(targetDir, { recursive: true });
  symlinkSync(targetDir, linkDir, "dir");
  const env = {
    ORX_MCP_AUDIT_PATH: auditLogPath,
    ORX_MCP_AUTH_ENV_DIR: join(linkDir, "auth-env"),
  };

  try {
    const failed = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "mcp", "auth", "init", "openrouter"], env, failed.io), 1);
    assert.match(failed.stderr(), /MCP auth env file parent path must not contain symlinks/);
    assert.doesNotMatch(failed.stderr(), /sk-or-v1|mcp-secret-token/);

    const events = readFileSync(auditLogPath, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { type: string; ok: boolean; details?: Record<string, unknown> });
    assert.equal(events.length, 1);
    assert.equal(events[0].type, "mcp.profile.auth_env_file");
    assert.equal(events[0].ok, false);
    assert.match(String(events[0].details?.message), /parent path must not contain symlinks/);
    assert.doesNotMatch(JSON.stringify(events[0]), /sk-or-v1|mcp-secret-token/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("cli mcp commands use user MCP profile catalog", async () => {
  const cwd = createTempDir();
  const mcpConfigPath = join(cwd, "mcp", "profiles.json");
  const profileCatalogPath = join(cwd, "mcp", "profile-catalog.json");
  const env = {
    ORX_MCP_CONFIG_PATH: mcpConfigPath,
    ORX_MCP_PROFILE_CATALOG_PATH: profileCatalogPath,
  };

  try {
    const emptyCatalog = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "mcp", "catalog"], env, emptyCatalog.io), 0);
    assert.match(emptyCatalog.stdout(), /profiles: 0/);

    const emptyCatalogJson = createIo({ cwd });
    assert.equal(
      await runCli(["node", "cli", "mcp", "catalog", "--json"], env, emptyCatalogJson.io),
      0,
    );
    const emptyCatalogReport = JSON.parse(emptyCatalogJson.stdout()) as {
      surface: string;
      exists: boolean;
      profile_count: number;
      data_state_writes: string;
      authority: { catalog_read_side_effects: string };
    };
    assert.equal(emptyCatalogReport.surface, "orx.mcp_user_catalog");
    assert.equal(emptyCatalogReport.exists, false);
    assert.equal(emptyCatalogReport.profile_count, 0);
    assert.equal(emptyCatalogReport.data_state_writes, "none");
    assert.equal(emptyCatalogReport.authority.catalog_read_side_effects, "none");

    const addedProfile = createIo({ cwd });
    assert.equal(
      await runCli(
        [
          "node",
          "cli",
          "mcp",
          "add-profile",
          "context7",
          "https://mcp.context7.example/mcp",
          "--name",
          "Context7",
          "docs",
          "--auth-required",
        ],
        env,
        addedProfile.io,
      ),
      0,
    );
    assert.match(addedProfile.stdout(), /User MCP profile user:context7 stored/);

    const addedTool = createIo({ cwd });
    assert.equal(
      await runCli(
        [
          "node",
          "cli",
          "mcp",
          "add-tool",
          "user:context7",
          "resolve-library-id",
          "read",
          "--auth-required",
          "--free",
        ],
        env,
        addedTool.io,
      ),
      0,
    );
    assert.match(addedTool.stdout(), /User MCP tool user:context7\/resolve-library-id stored/);

    const catalogJson = createIo({ cwd });
    assert.equal(
      await runCli(["node", "cli", "mcp", "catalog", "--json"], env, catalogJson.io),
      0,
    );
    const catalogReport = JSON.parse(catalogJson.stdout()) as {
      surface: string;
      path: string;
      profile_count: number;
      data_state_writes: string;
      authority: Record<string, string>;
      profiles: Array<{
        id: string;
        name: string;
        state: string;
        transport: string;
        auth_required: boolean;
        source: { kind: string; catalog_path: string; declaration_hash: string };
        tools: Array<{ name: string; risk: string; auth_required: boolean; billable: boolean }>;
      }>;
    };
    assert.equal(catalogReport.surface, "orx.mcp_user_catalog");
    assert.equal(catalogReport.path, profileCatalogPath);
    assert.equal(catalogReport.profile_count, 1);
    assert.equal(catalogReport.data_state_writes, "none");
    assert.equal(catalogReport.authority.catalog_read_side_effects, "none");
    assert.equal(catalogReport.profiles[0].id, "user:context7");
    assert.equal(catalogReport.profiles[0].name, "Context7 docs");
    assert.equal(catalogReport.profiles[0].state, "disabled");
    assert.equal(catalogReport.profiles[0].transport, "remote-http");
    assert.equal(catalogReport.profiles[0].auth_required, true);
    assert.equal(catalogReport.profiles[0].source.kind, "user");
    assert.equal(catalogReport.profiles[0].source.catalog_path, profileCatalogPath);
    assert.match(catalogReport.profiles[0].source.declaration_hash, /^sha256:[a-f0-9]{64}$/);
    assert.deepEqual(catalogReport.profiles[0].tools, [
      {
        name: "resolve-library-id",
        risk: "read",
        auth_required: true,
        billable: false,
      },
    ]);

    const invalidCatalogJson = createIo({ cwd });
    assert.equal(
      await runCli(["node", "cli", "mcp", "catalog", "--json", "extra"], env, invalidCatalogJson.io),
      1,
    );
    assert.equal(invalidCatalogJson.stdout(), "");
    assert.match(invalidCatalogJson.stderr(), /Usage: orx mcp catalog \[--json\]/);

    const list = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "mcp", "list"], env, list.io), 0);
    assert.match(list.stdout(), /profile=user:context7 state=disabled/);
    assert.match(list.stdout(), /source=user/);

    const status = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "status"], env, status.io), 0);
    assert.match(status.stdout(), /mcp_user_profiles: 1/);
    assert.match(status.stdout(), /mcp_profile: profile=user:context7 state=disabled/);

    const enabled = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "mcp", "enable", "user:context7"], env, enabled.io), 0);
    assert.match(enabled.stdout(), /MCP profile user:context7 enabled/);

    const inspected = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "mcp", "inspect", "user:context7"], env, inspected.io), 0);
    assert.match(inspected.stdout(), /name: Context7 docs/);
    assert.match(inspected.stdout(), /source: user catalog_path=/);
    assert.match(inspected.stdout(), /resolve-library-id risk=read auth=yes billable=no policy=allowed/);

    const removedTool = createIo({ cwd });
    assert.equal(
      await runCli(["node", "cli", "mcp", "remove-tool", "context7", "resolve-library-id"], env, removedTool.io),
      0,
    );
    assert.match(removedTool.stdout(), /User MCP tool user:context7\/resolve-library-id removed/);

    const removedProfile = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "mcp", "remove-profile", "context7"], env, removedProfile.io), 0);
    assert.match(removedProfile.stdout(), /User MCP profile user:context7 removed/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("cli mcp provider presets install local catalog profiles", async () => {
  const cwd = createTempDir();
  const profileCatalogPath = join(cwd, "mcp", "profile-catalog.json");
  const mcpConfigPath = join(cwd, "mcp", "profiles.json");
  const auditLogPath = join(cwd, "audit", "mcp.jsonl");
  const authEnvDir = join(cwd, "mcp", "auth-env");
  const env = {
    ORX_MCP_CONFIG_PATH: mcpConfigPath,
    ORX_MCP_PROFILE_CATALOG_PATH: profileCatalogPath,
    ORX_MCP_AUDIT_PATH: auditLogPath,
    ORX_MCP_AUTH_ENV_DIR: authEnvDir,
  };

  try {
    const listed = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "mcp", "presets"], env, listed.io), 0);
    assert.match(listed.stdout(), /MCP provider presets/);
    assert.match(listed.stdout(), /id=browser/);
    assert.match(listed.stdout(), /id=cloudflare-api/);
    assert.match(listed.stdout(), /id=context7/);
    assert.match(listed.stdout(), /id=deepwiki/);
    assert.match(listed.stdout(), /id=figma/);
    assert.match(listed.stdout(), /id=github-readonly/);
    assert.match(listed.stdout(), /id=github-write/);
    assert.match(listed.stdout(), /id=gitlab-ci-write/);
    assert.match(listed.stdout(), /id=gitlab-readonly/);
    assert.match(listed.stdout(), /id=microsoft-learn/);
    assert.match(listed.stdout(), /id=sentry-readonly/);
    assert.match(listed.stdout(), /id=sourcegraph-github-readonly/);

    const listedJson = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "mcp", "presets", "--json"], env, listedJson.io), 0);
    const listedReport = JSON.parse(listedJson.stdout()) as {
      surface: string;
      network: string;
      data_state_writes: string;
      presets: Array<{ id: string; profile_id: string; static_tool_count: number }>;
      authority: { install_enable_trust_grant_call_model_exposure: string };
    };
    assert.equal(listedReport.surface, "orx.mcp_provider_presets");
    assert.equal(listedReport.network, "none");
    assert.equal(listedReport.data_state_writes, "none");
    assert.equal(
      listedReport.authority.install_enable_trust_grant_call_model_exposure,
      "separate_explicit_steps",
    );
    assert.deepEqual(
      listedReport.presets
        .filter((preset) => preset.id === "deepwiki")
        .map((preset) => `${preset.profile_id}:${preset.static_tool_count}`),
      ["user:deepwiki:3"],
    );

    const search = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "mcp", "presets", "search", "github"], env, search.io), 0);
    assert.match(search.stdout(), /MCP provider preset search/);
    assert.match(search.stdout(), /query: "github"/);
    assert.match(search.stdout(), /matches: 4/);
    assert.match(search.stdout(), /id=deepwiki/);
    assert.match(search.stdout(), /id=sourcegraph-github-readonly/);
    assert.match(search.stdout(), /search_side_effects: none/);
    assert.equal(search.stderr(), "");

    const searchJson = createIo({ cwd });
    assert.equal(
      await runCli(["node", "cli", "mcp", "presets", "find", "code", "search", "--json"], env, searchJson.io),
      0,
    );
    const searchReport = JSON.parse(searchJson.stdout()) as {
      surface: string;
      network: string;
      data_state_writes: string;
      query: string;
      match_count: number;
      presets: Array<{ id: string }>;
      authority: { search_source: string; search_side_effects: string };
    };
    assert.equal(searchReport.surface, "orx.mcp_provider_preset_search");
    assert.equal(searchReport.network, "none");
    assert.equal(searchReport.data_state_writes, "none");
    assert.equal(searchReport.query, "code search");
    assert.equal(searchReport.match_count, 1);
    assert.deepEqual(searchReport.presets.map((preset) => preset.id), ["sourcegraph-github-readonly"]);
    assert.equal(searchReport.authority.search_source, "local_builtin_preset_metadata");
    assert.equal(searchReport.authority.search_side_effects, "none");
    assert.equal(searchJson.stderr(), "");

    const searchNone = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "mcp", "presets", "search", "zzzz"], env, searchNone.io), 0);
    assert.match(searchNone.stdout(), /matches: 0/);
    assert.match(searchNone.stdout(), /next: orx mcp presets/);

    const missingSearch = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "mcp", "presets", "search"], env, missingSearch.io), 1);
    assert.equal(missingSearch.stdout(), "");
    assert.match(missingSearch.stderr(), /Usage: orx mcp presets search <query> \[--json\]/);

    const secretSearch = createIo({ cwd });
    assert.equal(
      await runCli(["node", "cli", "mcp", "presets", "search", "sk-or-v1-secret"], env, secretSearch.io),
      1,
    );
    assert.equal(secretSearch.stdout(), "");
    assert.match(secretSearch.stderr(), /search query must not contain secret-like values/);
    assert.doesNotMatch(secretSearch.stderr(), /sk-or-v1-secret/);

    for (const secretQuery of ["password=abcd1234", "credential=abcd1234"]) {
      const assignedSecretSearch = createIo({ cwd });
      assert.equal(
        await runCli(["node", "cli", "mcp", "presets", "search", secretQuery], env, assignedSecretSearch.io),
        1,
      );
      assert.equal(assignedSecretSearch.stdout(), "");
      assert.match(assignedSecretSearch.stderr(), /search query must not contain secret-like values/);
      assert.equal(assignedSecretSearch.stderr().includes(secretQuery), false);
    }

    const presetInspect = createIo({ cwd });
    assert.equal(
      await runCli(["node", "cli", "mcp", "presets", "inspect", "context7"], env, presetInspect.io),
      0,
    );
    assert.match(presetInspect.stdout(), /MCP Provider Preset: context7/);
    assert.match(presetInspect.stdout(), /profile_id: user:context7/);
    assert.match(presetInspect.stdout(), /command: orx mcp add-preset context7/);
    assert.match(presetInspect.stdout(), /inspect_side_effects: none/);
    assert.match(presetInspect.stdout(), /install_enable_trust_grant_call_model_exposure: separate_explicit_steps/);

    const presetInspectJson = createIo({ cwd });
    assert.equal(
      await runCli(
        ["node", "cli", "mcp", "presets", "inspect", "deepwiki", "--json"],
        env,
        presetInspectJson.io,
      ),
      0,
    );
    const inspectReport = JSON.parse(presetInspectJson.stdout()) as {
      surface: string;
      preset: {
        id: string;
        profile_id: string;
        static_tools: Array<{ name: string; auth_required: boolean; billable: boolean }>;
      };
      install: { command: string; result_state: string };
      authority: { inspect_side_effects: string };
    };
    assert.equal(inspectReport.surface, "orx.mcp_provider_preset");
    assert.equal(inspectReport.preset.id, "deepwiki");
    assert.equal(inspectReport.preset.profile_id, "user:deepwiki");
    assert.equal(inspectReport.install.command, "orx mcp add-preset deepwiki");
    assert.equal(inspectReport.install.result_state, "local_user_profile_disabled");
    assert.equal(inspectReport.authority.inspect_side_effects, "none");
    assert.deepEqual(
      inspectReport.preset.static_tools.map((tool) => `${tool.name}:${tool.auth_required}:${tool.billable}`),
      [
        "ask_question:false:false",
        "read_wiki_contents:false:false",
        "read_wiki_structure:false:false",
      ],
    );

    const shorthandInspect = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "mcp", "presets", "github-readonly"], env, shorthandInspect.io), 0);
    assert.match(shorthandInspect.stdout(), /MCP Provider Preset: github-readonly/);
    assert.match(shorthandInspect.stdout(), /tools: none/);
    assert.match(shorthandInspect.stdout(), /remote_tool_review:/);

    const shorthandInspectJson = createIo({ cwd });
    assert.equal(
      await runCli(["node", "cli", "mcp", "presets", "github-readonly", "--json"], env, shorthandInspectJson.io),
      0,
    );
    assert.equal(JSON.parse(shorthandInspectJson.stdout()).preset.id, "github-readonly");

    const missingInspectPreset = createIo({ cwd });
    assert.equal(
      await runCli(["node", "cli", "mcp", "presets", "inspect", "--json"], env, missingInspectPreset.io),
      1,
    );
    assert.equal(missingInspectPreset.stdout(), "");
    assert.match(missingInspectPreset.stderr(), /Usage: orx mcp presets inspect <preset> \[--json\]/);

    const githubWriteInspect = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "mcp", "presets", "github-write"], env, githubWriteInspect.io), 0);
    assert.match(githubWriteInspect.stdout(), /MCP Provider Preset: github-write/);
    assert.match(githubWriteInspect.stdout(), /url: https:\/\/api\.githubcopilot\.com\/mcp\//);
    assert.match(githubWriteInspect.stdout(), /risk_level: high/);
    assert.match(githubWriteInspect.stdout(), /write_capable: yes/);
    assert.match(githubWriteInspect.stdout(), /static_tools: 0/);
    assert.match(githubWriteInspect.stdout(), /remote_tool_review:/);

    const sourcegraphInspect = createIo({ cwd });
    assert.equal(
      await runCli(["node", "cli", "mcp", "presets", "inspect", "sourcegraph-github-readonly"], env, sourcegraphInspect.io),
      0,
    );
    assert.match(sourcegraphInspect.stdout(), /MCP Provider Preset: sourcegraph-github-readonly/);
    assert.match(sourcegraphInspect.stdout(), /auth_required: yes/);
    assert.match(sourcegraphInspect.stdout(), /write_capable: no/);
    assert.match(sourcegraphInspect.stdout(), /static_tools: 0/);
    assert.match(sourcegraphInspect.stdout(), /remote_tool_review:/);
    assert.match(sourcegraphInspect.stdout(), /inspect_side_effects: none/);

    const gitlabInspect = createIo({ cwd });
    assert.equal(
      await runCli(["node", "cli", "mcp", "presets", "inspect", "gitlab-readonly"], env, gitlabInspect.io),
      0,
    );
    assert.match(gitlabInspect.stdout(), /MCP Provider Preset: gitlab-readonly/);
    assert.match(gitlabInspect.stdout(), /url: https:\/\/gitlab\.com\/api\/v4\/mcp/);
    assert.match(gitlabInspect.stdout(), /auth_required: yes/);
    assert.match(gitlabInspect.stdout(), /write_capable: no/);
    assert.match(gitlabInspect.stdout(), /static_tools: 0/);
    assert.match(gitlabInspect.stdout(), /remote_tool_review:/);

    const gitlabCiInspect = createIo({ cwd });
    assert.equal(
      await runCli(["node", "cli", "mcp", "presets", "inspect", "gitlab-ci-write"], env, gitlabCiInspect.io),
      0,
    );
    assert.match(gitlabCiInspect.stdout(), /MCP Provider Preset: gitlab-ci-write/);
    assert.match(gitlabCiInspect.stdout(), /url: https:\/\/gitlab\.com\/api\/v4\/mcp/);
    assert.match(gitlabCiInspect.stdout(), /risk_level: high/);
    assert.match(gitlabCiInspect.stdout(), /write_capable: yes/);
    assert.match(gitlabCiInspect.stdout(), /static_tools: 1/);
    assert.match(gitlabCiInspect.stdout(), /manage_pipeline risk=destructive auth=yes billable=no/);

    const cloudflareInspect = createIo({ cwd });
    assert.equal(
      await runCli(["node", "cli", "mcp", "presets", "inspect", "cloudflare-api"], env, cloudflareInspect.io),
      0,
    );
    assert.match(cloudflareInspect.stdout(), /MCP Provider Preset: cloudflare-api/);
    assert.match(cloudflareInspect.stdout(), /risk_level: high/);
    assert.match(cloudflareInspect.stdout(), /write_capable: yes/);
    assert.match(cloudflareInspect.stdout(), /execute risk=destructive auth=yes billable=no/);

    const presetPlan = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "mcp", "plan", "context7"], env, presetPlan.io), 0);
    assert.match(presetPlan.stdout(), /MCP setup plan: context7/);
    assert.match(presetPlan.stdout(), /status: preset_available/);
    assert.match(presetPlan.stdout(), /orx mcp add-preset context7/);
    assert.match(presetPlan.stdout(), /data_state_writes: none/);
    assert.match(presetPlan.stdout(), /plan_side_effects: no install, enable, trust, grant, fetch, call, audit, or model exposure/);

    const overviewPlanJson = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "mcp", "setup-plan", "--json"], env, overviewPlanJson.io), 0);
    const overviewReport = JSON.parse(overviewPlanJson.stdout()) as {
      surface: string;
      kind: string;
      target: string;
      status: string;
      network: string;
      data_state_writes: string;
      next_commands: string[];
      authority: { plan_side_effects: string };
    };
    assert.equal(overviewReport.surface, "orx.mcp_setup_plan");
    assert.equal(overviewReport.kind, "overview");
    assert.equal(overviewReport.target, "all");
    assert.equal(overviewReport.status, "overview");
    assert.equal(overviewReport.network, "none");
    assert.equal(overviewReport.data_state_writes, "none");
    assert.ok(overviewReport.next_commands.includes("orx mcp plan context7"));
    assert.match(overviewReport.authority.plan_side_effects, /no install, enable, trust, grant, fetch, call, audit, or model exposure/);

    const presetPlanJson = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "mcp", "plan", "context7", "--json"], env, presetPlanJson.io), 0);
    const presetPlanReport = JSON.parse(presetPlanJson.stdout()) as {
      surface: string;
      kind: string;
      target: string;
      status: string;
      preset: { id: string; profile_id: string };
      profile: { id: string; installed: boolean };
      tools: { total: number; static_tool_count: number };
      authority: { install_enable_auth_grant_fetch_call_model_exposure: string };
    };
    assert.equal(presetPlanReport.surface, "orx.mcp_setup_plan");
    assert.equal(presetPlanReport.kind, "preset");
    assert.equal(presetPlanReport.target, "context7");
    assert.equal(presetPlanReport.status, "preset_available");
    assert.equal(presetPlanReport.preset.id, "context7");
    assert.equal(presetPlanReport.preset.profile_id, "user:context7");
    assert.equal(presetPlanReport.profile.id, "user:context7");
    assert.equal(presetPlanReport.profile.installed, false);
    assert.equal(presetPlanReport.tools.total, 2);
    assert.equal(presetPlanReport.tools.static_tool_count, 2);
    assert.equal(
      presetPlanReport.authority.install_enable_auth_grant_fetch_call_model_exposure,
      "separate_explicit_steps",
    );

    const misplacedPlanJson = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "mcp", "plan", "--json", "context7"], env, misplacedPlanJson.io), 1);
    assert.equal(misplacedPlanJson.stdout(), "");
    assert.match(misplacedPlanJson.stderr(), /Usage: orx mcp plan \[preset-or-profile\] \[--json\]/);

    const sourcegraphPlan = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "mcp", "plan", "sourcegraph-github-readonly"], env, sourcegraphPlan.io), 0);
    assert.match(sourcegraphPlan.stdout(), /MCP setup plan: sourcegraph-github-readonly/);
    assert.match(sourcegraphPlan.stdout(), /status: preset_available/);
    assert.match(sourcegraphPlan.stdout(), /profile: user:sourcegraph-github-readonly/);
    assert.match(sourcegraphPlan.stdout(), /auth_required: yes/);
    assert.match(sourcegraphPlan.stdout(), /network_calls: none/);
    assert.match(sourcegraphPlan.stdout(), /data_state_writes: none/);
    assert.match(sourcegraphPlan.stdout(), /orx mcp add-preset sourcegraph-github-readonly/);

    const gitlabPlan = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "mcp", "plan", "gitlab-readonly"], env, gitlabPlan.io), 0);
    assert.match(gitlabPlan.stdout(), /MCP setup plan: gitlab-readonly/);
    assert.match(gitlabPlan.stdout(), /status: preset_available/);
    assert.match(gitlabPlan.stdout(), /profile: user:gitlab-readonly/);
    assert.match(gitlabPlan.stdout(), /auth_required: yes/);
    assert.match(gitlabPlan.stdout(), /network_calls: none/);
    assert.match(gitlabPlan.stdout(), /data_state_writes: none/);
    assert.match(gitlabPlan.stdout(), /orx mcp add-preset gitlab-readonly/);

    const gitlabCiPlan = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "mcp", "plan", "gitlab-ci-write"], env, gitlabCiPlan.io), 0);
    assert.match(gitlabCiPlan.stdout(), /MCP setup plan: gitlab-ci-write/);
    assert.match(gitlabCiPlan.stdout(), /status: preset_available/);
    assert.match(gitlabCiPlan.stdout(), /profile: user:gitlab-ci-write/);
    assert.match(gitlabCiPlan.stdout(), /risk_level: high/);
    assert.match(gitlabCiPlan.stdout(), /write_capable: yes/);
    assert.match(gitlabCiPlan.stdout(), /network_calls: none/);
    assert.match(gitlabCiPlan.stdout(), /data_state_writes: none/);
    assert.match(gitlabCiPlan.stdout(), /orx mcp add-preset gitlab-ci-write/);

    const githubWritePlan = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "mcp", "plan", "github-write"], env, githubWritePlan.io), 0);
    assert.match(githubWritePlan.stdout(), /MCP setup plan: github-write/);
    assert.match(githubWritePlan.stdout(), /status: preset_available/);
    assert.match(githubWritePlan.stdout(), /profile: user:github-write/);
    assert.match(githubWritePlan.stdout(), /risk_level: high/);
    assert.match(githubWritePlan.stdout(), /write_capable: yes/);
    assert.match(githubWritePlan.stdout(), /network_calls: none/);
    assert.match(githubWritePlan.stdout(), /data_state_writes: none/);
    assert.match(githubWritePlan.stdout(), /orx mcp add-preset github-write/);

    const pluginList = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "mcp", "catalog"], env, pluginList.io), 0);
    assert.match(pluginList.stdout(), /profiles: 0/);

    const added = createIo({ cwd });
    assert.equal(
      await runCli(
        ["node", "cli", "mcp", "add-preset", "context7", "--id", "docs", "--no-auth"],
        env,
        added.io,
      ),
      0,
    );
    assert.match(added.stdout(), /MCP provider preset context7 stored as user:docs/);

    const disabledPlan = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "mcp", "plan", "user:docs"], env, disabledPlan.io), 0);
    assert.match(disabledPlan.stdout(), /MCP setup plan: user:docs/);
    assert.match(disabledPlan.stdout(), /status: installed_disabled/);
    assert.match(disabledPlan.stdout(), /orx mcp enable user:docs/);
    assert.doesNotMatch(disabledPlan.stdout(), /orx mcp allow-model-tool/);

    const enabledPlanProfile = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "mcp", "enable", "user:docs"], env, enabledPlanProfile.io), 0);
    assert.match(enabledPlanProfile.stdout(), /MCP profile user:docs enabled/);

    const readyPlan = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "mcp", "plan", "user:docs"], env, readyPlan.io), 0);
    assert.match(readyPlan.stdout(), /status: ready_for_model_grants/);
    assert.match(readyPlan.stdout(), /orx mcp allow-model-tool user:docs query-docs/);
    assert.doesNotMatch(readyPlan.stdout(), /orx ask --mcp-tools/);
    assert.doesNotMatch(readyPlan.stdout(), /in chat: \/mcp model enable/);

    const readyPlanJson = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "mcp", "plan", "user:docs", "--json"], env, readyPlanJson.io), 0);
    const readyPlanReport = JSON.parse(readyPlanJson.stdout()) as {
      kind: string;
      status: string;
      profile: { id: string; state: string };
      tools: { model_grantable: number; active_model_grants: number };
      grants: { tool: number; stale_tool: number; model: number; stale_model: number };
    };
    assert.equal(readyPlanReport.kind, "profile");
    assert.equal(readyPlanReport.status, "ready_for_model_grants");
    assert.equal(readyPlanReport.profile.id, "user:docs");
    assert.equal(readyPlanReport.profile.state, "enabled");
    assert.equal(readyPlanReport.tools.model_grantable, 2);
    assert.equal(readyPlanReport.tools.active_model_grants, 0);
    assert.equal(readyPlanReport.grants.tool, 0);
    assert.equal(readyPlanReport.grants.stale_tool, 0);
    assert.equal(readyPlanReport.grants.model, 0);
    assert.equal(readyPlanReport.grants.stale_model, 0);

    const modelGrant = createIo({ cwd });
    assert.equal(
      await runCli(["node", "cli", "mcp", "allow-model-tool", "user:docs", "query-docs"], env, modelGrant.io),
      0,
    );
    assert.match(modelGrant.stdout(), /Model MCP tool grant stored for user:docs\/query-docs/);

    const modelUsePlan = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "mcp", "plan", "user:docs"], env, modelUsePlan.io), 0);
    assert.match(modelUsePlan.stdout(), /status: ready_for_model_use/);
    assert.match(modelUsePlan.stdout(), /model_grantable=1/);
    assert.match(modelUsePlan.stdout(), /grants: tool=0 stale_tool=0 model=1 stale_model=0/);
    assert.match(modelUsePlan.stdout(), /orx ask --mcp-tools "Use query-docs from user:docs"/);
    assert.match(modelUsePlan.stdout(), /orx mcp allow-model-tool user:docs resolve-library-id/);
    assert.doesNotMatch(modelUsePlan.stdout(), /orx mcp allow-model-tool user:docs query-docs/);

    const unknownPlan = createIo({ cwd });
    assert.equal(
      await runCli(["node", "cli", "mcp", "plan", "sk-or-v1-secret-plan-target"], env, unknownPlan.io),
      1,
    );
    assert.match(unknownPlan.stderr(), /target: \[redacted\]/);
    assert.doesNotMatch(unknownPlan.stderr(), /sk-or-v1-secret-plan-target/);

    const unknownPlanJson = createIo({ cwd });
    assert.equal(
      await runCli(["node", "cli", "mcp", "plan", "sk-or-v1-secret-plan-target", "--json"], env, unknownPlanJson.io),
      1,
    );
    assert.equal(unknownPlanJson.stdout(), "");
    const unknownPlanReport = JSON.parse(unknownPlanJson.stderr()) as {
      kind: string;
      target: string;
      status: string;
    };
    assert.equal(unknownPlanReport.kind, "unknown");
    assert.equal(unknownPlanReport.target, "[redacted]");
    assert.equal(unknownPlanReport.status, "unknown_target");
    assert.doesNotMatch(unknownPlanJson.stderr(), /sk-or-v1-secret-plan-target/);

    const inspected = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "mcp", "inspect", "user:docs"], env, inspected.io), 0);
    assert.match(inspected.stdout(), /name: Context7 docs/);
    assert.match(inspected.stdout(), /url: https:\/\/mcp\.context7\.com\/mcp/);
    assert.match(inspected.stdout(), /resolve-library-id risk=read auth=no billable=no/);
    assert.match(inspected.stdout(), /query-docs risk=read auth=no billable=no/);

    const noAuth = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "mcp", "auth", "user:docs"], env, noAuth.io), 0);
    assert.match(noAuth.stdout(), /auth_status: not_required/);
    assert.match(noAuth.stdout(), /credential_mode: not_required/);
    assert.match(noAuth.stdout(), /effective_bearer: not_required/);
    assert.match(noAuth.stdout(), /macos_keychain: supported=(yes|no) opt_in=disabled status=not_required/);
    assert.match(noAuth.stdout(), /provider_auth: context7/);
    assert.match(noAuth.stdout(), /setup_url: https:\/\/context7\.com\/docs/);
    assert.match(noAuth.stdout(), /next_step: no bearer token required by current local declarations/);

    const noAuthSetup = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "mcp", "auth", "setup", "user:docs"], env, noAuthSetup.io), 0);
    assert.match(noAuthSetup.stdout(), /MCP auth setup: user:docs/);
    assert.match(noAuthSetup.stdout(), /auth_required: no/);
    assert.match(noAuthSetup.stdout(), /auth_status: not_required/);
    assert.match(noAuthSetup.stdout(), /credential_mode: not_required/);
    assert.match(noAuthSetup.stdout(), /token_value: not needed by current local declarations/);
    assert.match(noAuthSetup.stdout(), /shell_exports: not required/);
    assert.match(noAuthSetup.stdout(), /provider_auth: context7/);
    assert.match(noAuthSetup.stdout(), /network_calls: none/);
    assert.doesNotMatch(noAuthSetup.stdout(), /<bearer-token>/);

    const noAuthInit = createIo({ cwd, fetch });
    assert.equal(await runCli(["node", "cli", "mcp", "auth", "init", "user:docs"], env, noAuthInit.io), 0);
    assert.match(noAuthInit.stdout(), /MCP auth env file: user:docs/);
    assert.match(noAuthInit.stdout(), /auth_required: no/);
    assert.match(noAuthInit.stdout(), /auth_status: not_required/);
    assert.match(noAuthInit.stdout(), /state_changed: no/);
    assert.match(noAuthInit.stdout(), /skipped: yes/);
    assert.match(noAuthInit.stdout(), /shell_source: not required/);
    assert.doesNotMatch(noAuthInit.stdout(), /<bearer-token>/);
    assert.equal(existsSync(join(authEnvDir, "user_docs.env")), false);

    const events = readFileSync(auditLogPath, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { type: string; profileId?: string; details?: Record<string, unknown> });
    assert.ok(
      events.some(
        (event) =>
          event.type === "mcp.profile.auth_status" &&
          event.profileId === "user:docs" &&
          event.details?.ready === true,
      ),
    );
    assert.ok(
      events.some(
        (event) =>
          event.type === "mcp.profile.auth_setup" &&
          event.profileId === "user:docs" &&
          event.details?.ready === true,
      ),
    );
    assert.ok(
      events.some(
        (event) =>
          event.type === "mcp.profile.auth_env_file" &&
          event.profileId === "user:docs" &&
          event.details?.ready === true,
      ),
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("cli mcp remote-tools and import-remote-tools use reviewed metadata for user catalog profiles", async () => {
  const cwd = createTempDir();
  const profileCatalogPath = join(cwd, "mcp", "profile-catalog.json");
  const mcpConfigPath = join(cwd, "mcp", "profiles.json");
  const auditLogPath = join(cwd, "audit", "mcp.jsonl");
  const env = {
    ORX_MCP_PROFILE_CATALOG_PATH: profileCatalogPath,
    ORX_MCP_CONFIG_PATH: mcpConfigPath,
    ORX_MCP_AUDIT_PATH: auditLogPath,
  };
  const makeRemoteToolsFetch = (seenRequests: string[]): typeof fetch => async (_input, init) => {
    seenRequests.push(String(init?.body));
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: "orx-tools-list-1",
        result: {
          tools: [
            {
              name: "get_file_contents",
              description: "Read files",
              inputSchema: { type: "object" },
            },
            {
              name: "list_issues",
            },
          ],
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  try {
    const added = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "mcp", "add-preset", "github-readonly"], env, added.io), 0);

    const enabled = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "mcp", "enable", "user:github-readonly"], env, enabled.io), 0);

    const remoteRequests: string[] = [];
    const remote = createIo({
      cwd,
      fetch: async () => {
        throw new Error("general fetch should not be used");
      },
      mcpRemoteToolsFetch: makeRemoteToolsFetch(remoteRequests),
    });
    assert.equal(
      await runCli(["node", "cli", "mcp", "remote-tools", "user:github-readonly"], env, remote.io),
      0,
    );
    assert.equal(remoteRequests.length, 1);
    assert.match(remoteRequests[0], /"method":"tools\/list"/);
    assert.doesNotMatch(remoteRequests[0], /tools\/call/);
    assert.match(remote.stdout(), /MCP remote tools: user:github-readonly/);
    assert.match(remote.stdout(), /get_file_contents tool_hash=sha256:[a-f0-9]{64}/);
    assert.match(remote.stdout(), /description_boundary: BEGIN_UNTRUSTED_MCP_METADATA/);
    assert.match(remote.stdout(), /description: "Read files"/);
    assert.match(remote.stdout(), /description_boundary: END_UNTRUSTED_MCP_METADATA/);

    const importRequests: string[] = [];
    const imported = createIo({
      cwd,
      mcpRemoteToolsFetch: makeRemoteToolsFetch(importRequests),
    });
    assert.equal(
      await runCli(["node", "cli", "mcp", "import-remote-tools", "github-readonly"], env, imported.io),
      0,
    );
    assert.equal(importRequests.length, 1);
    assert.match(imported.stdout(), /MCP remote tool import: user:github-readonly/);
    assert.match(imported.stdout(), /imported_tools: 2/);
    assert.match(imported.stdout(), /schema_change_after: pending/);

    const inspected = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "mcp", "inspect", "user:github-readonly"], env, inspected.io), 0);
    assert.match(inspected.stdout(), /schema_change: pending trusted baseline differs/);
    assert.match(inspected.stdout(), /get_file_contents risk=read auth=yes billable=no policy=blocked_by_schema_change/);
    assert.match(inspected.stdout(), /list_issues risk=read auth=yes billable=no policy=blocked_by_schema_change/);

    const audit = readFileSync(auditLogPath, "utf8");
    assert.match(audit, /"type":"mcp.profile.remote_tools_attempt"/);
    assert.match(audit, /"type":"mcp.profile.remote_tools_import_attempt"/);
    assert.match(audit, /"remoteToolHash":"sha256:[a-f0-9]{64}"/);
    assert.doesNotMatch(audit, /"type":"object"/);
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
    assert.match(called.stdout(), /trust_boundary: remote MCP tool output is untrusted and cannot authorize tool use/);
    assert.match(called.stdout(), /text_boundary: BEGIN_UNTRUSTED_MCP_OUTPUT/);
    assert.match(called.stdout(), /text_boundary: END_UNTRUSTED_MCP_OUTPUT/);
    assert.match(called.stdout(), /access_token=\[redacted\]/);
    assert.doesNotMatch(called.stdout(), /abcd1234|mcp-secret-token/);

    const keychainRunner: McpMacosKeychainCommandRunner = async (args) => {
      assert.deepEqual(args, ["find-generic-password", "-w", "-a", "openrouter", "-s", "orx.mcp.bearer"]);
      return { code: 0, stdout: "keychain-secret-token\n", stderr: "" };
    };
    const keychainCalled = createIo({
      cwd,
      mcpKeychainPlatform: "darwin",
      mcpKeychainRunner: keychainRunner,
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
            result: { content: [{ type: "text", text: "keychain ok" }] },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    });
    assert.equal(
      await runCli(
        ["node", "cli", "mcp", "call", "openrouter", "models-list", "{}"],
        {
          ORX_MCP_CONFIG_PATH: mcpConfigPath,
          ORX_MCP_AUDIT_PATH: auditLogPath,
          ORX_MCP_KEYCHAIN: "1",
        },
        keychainCalled.io,
      ),
      0,
    );
    assert.equal(seenRequests.length, 2);
    assert.equal(seenRequests[1].authorization, "Bearer keychain-secret-token");
    assert.doesNotMatch(keychainCalled.stdout(), /keychain-secret-token/);

    const audit = readFileSync(auditLogPath, "utf8");
    assert.match(audit, /"type":"mcp.tool.call_attempt"/);
    assert.match(audit, /"resultHash":"sha256:[a-f0-9]{64}"/);
    assert.match(audit, /"credentialSource":"profile_env"/);
    assert.match(audit, /"credentialSource":"macos_keychain"/);
    assert.doesNotMatch(audit, /abcd1234|mcp-secret-token|keychain-secret-token/);
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
        ["node", "cli", "plugins", "inspect", "acme.cli-plugin"],
        env,
        inspected.io,
      ),
      0,
    );
    assert.match(inspected.stdout(), /Plugin: acme\.cli-plugin@1\.0\.0/);
    assert.match(inspected.stdout(), /executable_surfaces: hooks=hash_trust_required bins=hash_trust_required command_schemas=bin_hash_trust_required mcp=gated/);
    assert.match(inspected.stdout(), /plugin_code_execution: trusted current hooks run manually\/on lifecycle; trusted bins and schema-backed exec aliases run only by explicit operator command/);

    const enabled = createNoFetchIo();
    assert.equal(
      await runCli(
        ["node", "cli", "plugins", "enable", "acme.cli-plugin"],
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
        ["node", "cli", "plugins", "disable", "acme.cli-plugin"],
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

test("cli plugins scaffold creates an installable disabled plugin bundle", async () => {
  const cwd = createTempDir();
  const registryPath = join(cwd, "plugins", "registry.json");
  const targetDirectory = join(cwd, "new-plugin");
  const env = { ORX_PLUGIN_REGISTRY_PATH: registryPath };
  let fetchCalls = 0;
  const createNoFetchIo = () =>
    createIo({
      cwd,
      fetch: async () => {
        fetchCalls += 1;
        throw new Error("plugin scaffold should not call fetch");
      },
    });

  try {
    const scaffolded = createNoFetchIo();
    assert.equal(
      await runCli(
        [
          "node",
          "cli",
          "plugins",
          "scaffold",
          "new-plugin",
          "--name",
          "new-plugin",
          "--publisher",
          "acme",
          "--with",
          "skills,commands,rules,mcp",
        ],
        env,
        scaffolded.io,
      ),
      0,
    );
    assert.match(scaffolded.stdout(), /Plugin scaffolded: acme\.new-plugin@0\.1\.0/);
    assert.match(scaffolded.stdout(), /registry_state: unchanged/);
    assert.equal(readFileSync(join(targetDirectory, "mcp.json"), "utf8"), '{\n  "servers": {}\n}\n');

    const validated = createNoFetchIo();
    assert.equal(
      await runCli(["node", "cli", "plugins", "validate", targetDirectory], env, validated.io),
      0,
    );
    assert.match(validated.stdout(), /Plugin validation: acme\.new-plugin@0\.1\.0/);
    assert.match(validated.stdout(), /skills: present directory skills sha256:[a-f0-9]{64}/);
    assert.match(validated.stdout(), /mcpServers: present file mcp\.json sha256:[a-f0-9]{64}/);
    assert.match(validated.stdout(), /registry_state: unchanged/);
    assert.match(validated.stdout(), /execution_state: no install, enable, trust, grant, fetch, or execution performed/);

    const validatedJson = createNoFetchIo();
    assert.equal(
      await runCli(["node", "cli", "plugins", "validate", targetDirectory, "--json"], env, validatedJson.io),
      0,
    );
    const validationReport = JSON.parse(validatedJson.stdout());
    assert.equal(validationReport.surface, "orx.plugin_validation");
    assert.equal(validationReport.plugin_id, "acme.new-plugin@0.1.0");
    assert.equal(validationReport.operator_only, true);
    assert.equal(validationReport.network, "none");
    assert.equal(validationReport.execution, "none");
    assert.equal(validationReport.data_state_writes, "none");
    assert.ok(validationReport.component_count >= 4);
    assert.ok(
      validationReport.components.some(
        (component: { key: string; status: string }) =>
          component.key === "mcpServers" && component.status === "present",
      ),
    );
    assert.equal(validationReport.authority.registry_cache_catalog_trust_state, "unchanged");

    const invalidValidationArgs = createNoFetchIo();
    assert.equal(
      await runCli(
        ["node", "cli", "plugins", "validate", targetDirectory, "--json", "extra"],
        env,
        invalidValidationArgs.io,
      ),
      1,
    );
    assert.equal(invalidValidationArgs.stdout(), "");
    assert.match(
      invalidValidationArgs.stderr(),
      /Usage: orx plugins validate <manifest-path-or-directory> \[--json\]/,
    );

    const listed = createNoFetchIo();
    assert.equal(await runCli(["node", "cli", "plugins", "list"], env, listed.io), 0);
    assert.match(listed.stdout(), /installed: 0/);

    const installed = createNoFetchIo();
    assert.equal(
      await runCli(["node", "cli", "plugins", "install", targetDirectory], env, installed.io),
      0,
    );
    assert.match(installed.stdout(), /Plugin acme\.new-plugin@0\.1\.0 registered disabled/);
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

test("cli plugins catalog add-local and remove edit local catalog without fetch", async () => {
  const cwd = createTempDir();
  const registryPath = join(cwd, "plugins", "registry.json");
  const catalogPath = join(cwd, "catalog", "plugins.json");
  const manifestPath = join(cwd, "plugin", "orx-plugin.json");
  let fetchCalls = 0;
  mkdirSync(join(cwd, "plugin"), { recursive: true });
  writeFileSync(
    manifestPath,
    JSON.stringify({
      schemaVersion: "1",
      name: "catalog-editor-plugin",
      version: "1.0.0",
      description: "Catalog editor plugin.",
      publisher: "acme",
      source: {
        type: "local",
        path: ".",
      },
      components: {},
      permissions: {
        filesystem: [],
        network: [],
        env: [],
        mcp: [],
      },
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
        throw new Error("plugin catalog editor commands should not call fetch");
      },
    });

  try {
    const added = createNoFetchIo();
    assert.equal(
      await runCli(
        [
          "node",
          "cli",
          "plugins",
          "catalog",
          "add-local",
          "./plugin",
          "--tag",
          "local",
          "--tags",
          "authoring,local",
        ],
        env,
        added.io,
      ),
      0,
    );
    assert.match(added.stdout(), /Catalog entry acme\.catalog-editor-plugin@1\.0\.0 added/);
    assert.match(readFileSync(catalogPath, "utf8"), /acme\.catalog-editor-plugin@1\.0\.0/);

    const catalog = createNoFetchIo();
    assert.equal(await runCli(["node", "cli", "plugins", "catalog", "list"], env, catalog.io), 0);
    assert.match(catalog.stdout(), /entries: 1/);
    assert.match(catalog.stdout(), /tags=authoring,local/);

    const pluginList = createNoFetchIo();
    assert.equal(await runCli(["node", "cli", "plugins", "list"], env, pluginList.io), 0);
    assert.match(pluginList.stdout(), /installed: 0/);

    const inspected = createNoFetchIo();
    assert.equal(
      await runCli(
        ["node", "cli", "plugins", "catalog", "inspect", "acme.catalog-editor-plugin@1.0.0"],
        env,
        inspected.io,
      ),
      0,
    );
    assert.match(inspected.stdout(), /Plugin Catalog Entry: acme\.catalog-editor-plugin@1\.0\.0/);
    assert.match(inspected.stdout(), /source_type: local/);
    assert.match(inspected.stdout(), /inspect_side_effects: none/);
    assert.match(inspected.stdout(), /command: orx plugins install acme\.catalog-editor-plugin@1\.0\.0/);

    const removed = createNoFetchIo();
    assert.equal(
      await runCli(
        ["node", "cli", "plugins", "catalog", "remove", "acme.catalog-editor-plugin@1.0.0"],
        env,
        removed.io,
      ),
      0,
    );
    assert.match(removed.stdout(), /Catalog entry acme\.catalog-editor-plugin@1\.0\.0 removed/);

    const empty = createNoFetchIo();
    assert.equal(await runCli(["node", "cli", "plugins", "catalog"], env, empty.io), 0);
    assert.match(empty.stdout(), /entries: 0/);
    assert.equal(fetchCalls, 0);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("cli plugins install supports pinned git catalog entries without fetch", async () => {
  const cwd = createTempDir();
  const repoPath = join(cwd, "repo");
  const registryPath = join(cwd, "plugins", "registry.json");
  const catalogPath = join(cwd, "catalog", "plugins.json");
  let fetchCalls = 0;
  mkdirSync(join(repoPath, "skills"), { recursive: true });
  writeFileSync(join(repoPath, "skills", "SKILL.md"), "# CLI git catalog skill\n");
  writeFileSync(
    join(repoPath, "orx-plugin.json"),
    JSON.stringify({
      schemaVersion: "1",
      name: "git-cli-plugin",
      version: "1.0.0",
      description: "Git CLI plugin.",
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
  const commit = commitRepo(repoPath);
  const env = {
    ORX_PLUGIN_REGISTRY_PATH: registryPath,
    ORX_PLUGIN_CATALOG_PATH: catalogPath,
  };
  const createNoFetchIo = () =>
    createIo({
      cwd,
      fetch: async () => {
        fetchCalls += 1;
        throw new Error("plugin git catalog install should use git, not fetch");
      },
    });

  try {
    const added = createNoFetchIo();
    assert.equal(
      await runCli(
        [
          "node",
          "cli",
          "plugins",
          "catalog",
          "add-git",
          "acme.git-cli-plugin@1.0.0",
          pathToFileURL(repoPath).href,
          commit,
          "--tag",
          "git",
        ],
        env,
        added.io,
      ),
      0,
    );
    assert.match(added.stdout(), /Catalog git entry acme\.git-cli-plugin@1\.0\.0 added/);

    const catalog = createNoFetchIo();
    assert.equal(await runCli(["node", "cli", "plugins", "catalog"], env, catalog.io), 0);
    assert.match(catalog.stdout(), /source=git/);
    assert.match(catalog.stdout(), new RegExp(commit.slice(0, 12)));
    assert.match(catalog.stdout(), /tags=git/);

    const inspected = createNoFetchIo();
    assert.equal(
      await runCli(
        ["node", "cli", "plugins", "catalog", "inspect", "acme.git-cli-plugin@1.0.0"],
        env,
        inspected.io,
      ),
      0,
    );
    assert.match(inspected.stdout(), /Plugin Catalog Entry: acme\.git-cli-plugin@1\.0\.0/);
    assert.match(inspected.stdout(), /source_type: git/);
    assert.match(inspected.stdout(), new RegExp(commit));
    assert.match(inspected.stdout(), /inspect_side_effects: none/);

    const capture = createNoFetchIo();
    assert.equal(
      await runCli(["node", "cli", "plugins", "install", "acme.git-cli-plugin@1.0.0"], env, capture.io),
      0,
    );
    assert.match(capture.stdout(), /Catalog entry acme\.git-cli-plugin@1\.0\.0 resolved to git source/);
    assert.match(capture.stdout(), new RegExp(commit));
    assert.match(capture.stdout(), /Plugin acme\.git-cli-plugin@1\.0\.0 registered disabled/);
    assert.match(readFileSync(registryPath, "utf8"), /"type": "git"/);
    assert.match(readFileSync(registryPath, "utf8"), new RegExp(commit));

    const enabled = createNoFetchIo();
    assert.equal(
      await runCli(["node", "cli", "plugins", "enable", "acme.git-cli-plugin@1.0.0"], env, enabled.io),
      0,
    );
    assert.match(enabled.stdout(), /Plugin acme\.git-cli-plugin@1\.0\.0 enabled/);
    const registryText = readFileSync(registryPath, "utf8");
    assert.match(registryText, /"enabled": true/);

    writeFileSync(join(repoPath, "README.md"), "new catalog pin\n");
    git(repoPath, "add", ".");
    git(repoPath, "commit", "-m", "next");
    const nextCommit = git(repoPath, "rev-parse", "HEAD").trim();

    const updatedPin = createNoFetchIo();
    assert.equal(
      await runCli(
        [
          "node",
          "cli",
          "plugins",
          "catalog",
          "add-git",
          "acme.git-cli-plugin@1.0.0",
          pathToFileURL(repoPath).href,
          nextCommit,
          "--tag",
          "git",
        ],
        env,
        updatedPin.io,
      ),
      0,
    );
    assert.match(updatedPin.stdout(), /Catalog git entry acme\.git-cli-plugin@1\.0\.0 updated/);

    const updates = createNoFetchIo();
    assert.equal(
      await runCli(
        ["node", "cli", "plugins", "catalog", "updates", "acme.git-cli-plugin@1.0.0"],
        env,
        updates.io,
      ),
      0,
    );
    assert.match(updates.stdout(), /Plugin Catalog Update Check/);
    assert.match(updates.stdout(), /entries_checked: 1/);
    assert.match(updates.stdout(), /updates_available: 1/);
    assert.match(updates.stdout(), /network: none/);
    assert.match(updates.stdout(), /side_effects: none/);
    assert.match(updates.stdout(), /status=update_available/);
    assert.match(updates.stdout(), /enabled=yes/);
    assert.match(updates.stdout(), new RegExp(`catalog_commit=${nextCommit.slice(0, 12)}`));
    assert.match(updates.stdout(), new RegExp(`installed_commit=${commit.slice(0, 12)}`));
    assert.match(updates.stdout(), /command: orx plugins catalog update acme\.git-cli-plugin@1\.0\.0/);
    assert.match(updates.stdout(), /fetch_install_enable_trust_grant_execute: separate_explicit_steps/);
    assert.equal(readFileSync(registryPath, "utf8"), registryText);

    const review = createNoFetchIo();
    assert.equal(await runCli(["node", "cli", "plugins", "review"], env, review.io), 0);
    assert.match(review.stdout(), /Plugin Review/);
    assert.match(review.stdout(), /installed: 1/);
    assert.match(review.stdout(), /enabled: 1/);
    assert.match(review.stdout(), /catalog_updates_available: 1/);
    assert.match(review.stdout(), /id=acme\.git-cli-plugin@1\.0\.0 enabled=yes source=git catalog=update_available/);
    assert.match(review.stdout(), /command: orx plugins catalog update acme\.git-cli-plugin@1\.0\.0/);
    assert.match(review.stdout(), /network: none/);
    assert.match(review.stdout(), /execution: none/);
    assert.match(review.stdout(), /install_enable_trust_grant_fetch_execute: separate_explicit_steps/);
    assert.equal(readFileSync(registryPath, "utf8"), registryText);

    const reviewJson = createNoFetchIo();
    assert.equal(await runCli(["node", "cli", "plugins", "review", "--json"], env, reviewJson.io), 0);
    const reviewReport = JSON.parse(reviewJson.stdout());
    assert.equal(reviewReport.surface, "orx.plugin_review");
    assert.equal(reviewReport.operator_only, true);
    assert.equal(reviewReport.network, "none");
    assert.equal(reviewReport.execution, "none");
    assert.equal(reviewReport.data_state_writes, "none");
    assert.equal(reviewReport.installed_count, 1);
    assert.equal(reviewReport.enabled_count, 1);
    assert.equal(reviewReport.catalog_update_available_count, 1);
    assert.equal(reviewReport.plugins[0].id, "acme.git-cli-plugin@1.0.0");
    assert.equal(reviewReport.plugins[0].source.type, "git");
    assert.equal(reviewReport.plugins[0].source.resolved_commit, commit);
    assert.equal(reviewReport.plugins[0].catalog.status, "update_available");
    assert.equal(reviewReport.plugins[0].catalog.catalog_commit, nextCommit);
    assert.deepEqual(reviewReport.plugins[0].next_actions, [
      "orx plugins catalog update acme.git-cli-plugin@1.0.0",
    ]);
    assert.equal(reviewReport.authority.registry_catalog_cache_trust_state, "read_only");
    assert.equal(readFileSync(registryPath, "utf8"), registryText);

    const doctor = createNoFetchIo();
    assert.equal(await runCli(["node", "cli", "plugins", "doctor", "--json"], env, doctor.io), 0);
    const doctorReport = JSON.parse(doctor.stdout());
    assert.equal(doctorReport.surface, "orx.plugin_review");
    assert.equal(doctorReport.catalog_update_available_count, 1);
    assert.equal(readFileSync(registryPath, "utf8"), registryText);

    const invalidReviewArgs = createNoFetchIo();
    assert.equal(
      await runCli(["node", "cli", "plugins", "audit", "--json", "extra"], env, invalidReviewArgs.io),
      1,
    );
    assert.equal(invalidReviewArgs.stdout(), "");
    assert.match(invalidReviewArgs.stderr(), /Usage: orx plugins review\|doctor\|audit \[--json\]/);
    assert.equal(readFileSync(registryPath, "utf8"), registryText);

    const applied = createNoFetchIo();
    assert.equal(
      await runCli(
        ["node", "cli", "plugins", "catalog", "update", "acme.git-cli-plugin@1.0.0"],
        env,
        applied.io,
      ),
      0,
    );
    assert.match(applied.stdout(), /Plugin Catalog Update Apply/);
    assert.match(applied.stdout(), /applied: yes/);
    assert.match(applied.stdout(), /status: updated/);
    assert.match(applied.stdout(), new RegExp(`previous_commit: ${commit.slice(0, 12)}`));
    assert.match(applied.stdout(), new RegExp(`catalog_commit: ${nextCommit.slice(0, 12)}`));
    assert.match(applied.stdout(), /previous_enabled: yes/);
    assert.match(applied.stdout(), /result_state: registered_disabled/);
    assert.match(applied.stdout(), /enable_trust_grant_execute: separate_explicit_steps/);
    const updatedRegistryText = readFileSync(registryPath, "utf8");
    assert.match(updatedRegistryText, new RegExp(nextCommit));
    assert.match(updatedRegistryText, /"enabled": false/);
    assert.doesNotMatch(updatedRegistryText, new RegExp(commit));

    const current = createNoFetchIo();
    assert.equal(
      await runCli(
        ["node", "cli", "plugins", "catalog", "update", "acme.git-cli-plugin@1.0.0"],
        env,
        current.io,
      ),
      1,
    );
    assert.match(current.stderr(), /applied: no/);
    assert.match(current.stderr(), /status: current/);
    assert.match(current.stderr(), /side_effects: none/);
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

test("ask validates max tool iteration override before request", async () => {
  for (const value of ["many", "8abc"]) {
    const capture = createIo({
      fetch: async () => {
        throw new Error("invalid ask options must not call fetch");
      },
    });

    const exitCode = await runCli(
      ["node", "cli", "ask", "--max-tool-iterations", value, "Say hello"],
      { OPENROUTER_API_KEY: "test-key" },
      capture.io,
    );

    assert.equal(exitCode, 1);
    assert.equal(capture.stdout(), "");
    assert.match(capture.stderr(), /Invalid --max-tool-iterations value/);
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
  const profileCatalogPath = join(cwd, "mcp", "profile-catalog.json");
  const auditLogPath = join(cwd, "audit", "mcp.jsonl");
  const seenMcpRequests: Array<{ authorization: string | null; body: string }> = [];
  let chatRequestCount = 0;

  try {
    writeUserMcpProfileCatalog(profileCatalogPath);
    setMcpProfilePersistentState("user:context7", "enabled", {
      configPath: mcpConfigPath,
      profileCatalogPath,
    });
    const modelGrant = allowMcpModelToolGrant("user:context7", "resolve-library-id", {
      configPath: mcpConfigPath,
      profileCatalogPath,
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
                              profile: "user:context7",
                              tool: "resolve-library-id",
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
        ORX_MCP_BEARER_USER_CONTEXT7: "mcp-secret-token",
        ORX_MCP_CONFIG_PATH: mcpConfigPath,
        ORX_MCP_PROFILE_CATALOG_PATH: profileCatalogPath,
      },
      capture.io,
    );

    assert.equal(exitCode, 0);
    assert.equal(chatRequestCount, 2);
    assert.equal(seenMcpRequests.length, 1);
    assert.equal(seenMcpRequests[0].authorization, "Bearer mcp-secret-token");
    assert.match(seenMcpRequests[0].body, /"method":"tools\/call"/);
    assert.match(stripAnsi(capture.stdout()), /\[tool\] mcp_call profile="user:context7" tool="resolve-library-id" arguments=<object>/);
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
    mcpDiscoveryFetch?: typeof fetch;
    mcpRemoteToolsFetch?: typeof fetch;
    mcpCallFetch?: typeof fetch;
    mcpKeychainRunner?: McpMacosKeychainCommandRunner;
    mcpKeychainPlatform?: NodeJS.Platform;
    astGrepRunner?: AstGrepRunner;
    treeSitterRunner?: TreeSitterRunner;
    scannerRunner?: ScannerProcessRunner;
    diagnosticsRunner?: DiagnosticsProcessRunner;
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
      mcpDiscoveryFetch: options.mcpDiscoveryFetch,
      mcpRemoteToolsFetch: options.mcpRemoteToolsFetch,
      mcpCallFetch: options.mcpCallFetch,
      mcpKeychainRunner: options.mcpKeychainRunner,
      mcpKeychainPlatform: options.mcpKeychainPlatform,
      astGrepRunner: options.astGrepRunner,
      treeSitterRunner: options.treeSitterRunner,
      scannerRunner: options.scannerRunner,
      diagnosticsRunner: options.diagnosticsRunner,
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
          authRequired: true,
          tools: [
            {
              name: "resolve-library-id",
              risk: "read",
              authRequired: true,
              billable: false,
            },
            {
              name: "write-doc-cache",
              risk: "write",
              authRequired: true,
              billable: false,
            },
          ],
          notes: "Docs lookup profile declared by the local user catalog.",
        },
      },
    }),
  );
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
  });
}

function commitRepo(cwd: string): string {
  git(cwd, "init");
  git(cwd, "config", "user.email", "orx@example.test");
  git(cwd, "config", "user.name", "ORX Tests");
  git(cwd, "add", ".");
  git(cwd, "commit", "-m", "initial");
  return git(cwd, "rev-parse", "HEAD").trim();
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

function mockProcessResult(
  options: RunProcessOptions,
  overrides: Partial<RunProcessResult> = {},
): RunProcessResult {
  return {
    command: options.command,
    args: options.args ?? [],
    cwd: options.cwd ?? "/tmp/orx-test",
    exitCode: overrides.exitCode ?? 0,
    signal: overrides.signal ?? null,
    stdout: overrides.stdout ?? "",
    stderr: overrides.stderr ?? "",
    stdoutTruncation: overrides.stdoutTruncation ?? emptyTextTruncation(overrides.stdout ?? ""),
    stderrTruncation: overrides.stderrTruncation ?? emptyTextTruncation(overrides.stderr ?? ""),
    durationMs: overrides.durationMs ?? 1,
    timedOut: overrides.timedOut ?? false,
    error: overrides.error,
  };
}

function emptyTextTruncation(text: string) {
  const normalized = text.replace(/\r\n|\r/g, "\n");
  const lineCount = normalized.length === 0
    ? 0
    : normalized.endsWith("\n")
      ? normalized.slice(0, -1).split("\n").filter(Boolean).length
      : normalized.split("\n").length;
  const bytes = Buffer.byteLength(text, "utf8");
  return {
    truncated: false,
    originalBytes: bytes,
    returnedBytes: bytes,
    originalLines: lineCount,
    returnedLines: lineCount,
    omittedBytes: 0,
    omittedLines: 0,
  };
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
    "run_tests",
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
