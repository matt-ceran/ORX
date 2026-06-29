import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";
import { runCli } from "./cli.js";
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
    assert.match(help.stdout(), /mcp\s+List, edit, inspect, enable, disable, and grant MCP tool policy/);
    assert.match(help.stdout(), /plugins\s+List catalog entries, scaffold, validate, install, enable, or disable plugins/);
    assert.match(help.stdout(), /bins\s+List, inspect, trust, untrust, or run plugin bins/);
    assert.match(help.stdout(), /hooks\s+List, inspect, trust, untrust, or run plugin hook definitions/);
    assert.match(help.stdout(), /tests\s+Discover or run native test targets/);
    assert.match(help.stdout(), /code\s+Render local code maps or symbol indexes/);
    assert.match(help.stdout(), /orchestrator\s+Show delegation readiness or refuse session-less changes/);
    assert.match(help.stdout(), /delegate\s+Show\/refuse session delegate changes, policy, or saved teams/);
    assert.match(help.stdout(), /delegates\s+Show delegate readiness, execution policy, or saved teams/);
    assert.match(help.stdout(), /doctor\s+Run a no-network readiness check; use --strict to fail when not ready/);
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
    assert.match(status.stdout(), /test_frameworks: node=0, vitest=0, jest=0, playwright=0, unknown=0/);
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
    assert.equal(fetchCalls, 0);
    assert.equal(doctor.stderr(), "");

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
    assert.match(jsonReport.next_steps[0], /OPENROUTER_API_KEY/);
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
      "import './side-effect.js';\nexport function start() { return 'ok'; }\n",
    );

    const mapped = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "code", "map"], {}, mapped.io), 0);
    assert.match(mapped.stdout(), /Code Map/);
    assert.match(mapped.stdout(), /TypeScript: 1/);
    assert.match(mapped.stdout(), /kind=package label="main"/);
    assert.match(mapped.stdout(), /path="src\/index\.ts"/);
    assert.match(mapped.stdout(), /exports="start"/);
    assert.equal(mapped.stderr(), "");

    const alias = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "map", "src"], {}, alias.io), 0);
    assert.match(alias.stdout(), /root: .*src/);
    assert.match(alias.stdout(), /source_files: 1/);

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
  const auditLogPath = join(cwd, "audit", "mcp.jsonl");
  const authEnvDir = join(cwd, "mcp", "auth-env");
  const env = {
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
    assert.match(listed.stdout(), /id=figma/);
    assert.match(listed.stdout(), /id=microsoft-learn/);
    assert.match(listed.stdout(), /id=sentry-readonly/);

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

    const shorthandInspect = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "mcp", "presets", "github-readonly"], env, shorthandInspect.io), 0);
    assert.match(shorthandInspect.stdout(), /MCP Provider Preset: github-readonly/);
    assert.match(shorthandInspect.stdout(), /tools: none/);
    assert.match(shorthandInspect.stdout(), /remote_tool_review:/);

    const cloudflareInspect = createIo({ cwd });
    assert.equal(
      await runCli(["node", "cli", "mcp", "presets", "inspect", "cloudflare-api"], env, cloudflareInspect.io),
      0,
    );
    assert.match(cloudflareInspect.stdout(), /MCP Provider Preset: cloudflare-api/);
    assert.match(cloudflareInspect.stdout(), /risk_level: high/);
    assert.match(cloudflareInspect.stdout(), /write_capable: yes/);
    assert.match(cloudflareInspect.stdout(), /execute risk=destructive auth=yes billable=no/);

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

    const inspected = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "mcp", "inspect", "user:docs"], env, inspected.io), 0);
    assert.match(inspected.stdout(), /name: Context7 docs/);
    assert.match(inspected.stdout(), /url: https:\/\/mcp\.context7\.com\/mcp/);
    assert.match(inspected.stdout(), /resolve-library-id risk=read auth=no billable=no/);
    assert.match(inspected.stdout(), /query-docs risk=read auth=no billable=no/);

    const noAuth = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "mcp", "auth", "user:docs"], env, noAuth.io), 0);
    assert.match(noAuth.stdout(), /auth_status: not_required/);
    assert.match(noAuth.stdout(), /effective_bearer: missing/);
    assert.match(noAuth.stdout(), /provider_auth: context7/);
    assert.match(noAuth.stdout(), /setup_url: https:\/\/context7\.com\/docs/);
    assert.match(noAuth.stdout(), /next_step: no bearer token required by current local declarations/);

    const noAuthSetup = createIo({ cwd });
    assert.equal(await runCli(["node", "cli", "mcp", "auth", "setup", "user:docs"], env, noAuthSetup.io), 0);
    assert.match(noAuthSetup.stdout(), /MCP auth setup: user:docs/);
    assert.match(noAuthSetup.stdout(), /auth_required: no/);
    assert.match(noAuthSetup.stdout(), /auth_status: not_required/);
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
    assert.match(remote.stdout(), /get_file_contents description="Read files"/);

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
        ["node", "cli", "plugins", "inspect", "acme.cli-plugin@1.0.0"],
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

    const listed = createNoFetchIo();
    assert.equal(await runCli(["node", "cli", "plugins", "list"], env, listed.io), 0);
    assert.match(listed.stdout(), /installed: 0/);

    const installed = createNoFetchIo();
    assert.equal(
      await runCli(
        ["node", "cli", "plugins", "install", join(targetDirectory, "orx-plugin.json")],
        env,
        installed.io,
      ),
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

    const doctor = createNoFetchIo();
    assert.equal(await runCli(["node", "cli", "plugins", "doctor"], env, doctor.io), 0);
    assert.match(doctor.stdout(), /Plugin Review/);
    assert.match(doctor.stdout(), /catalog_updates_available: 1/);
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
