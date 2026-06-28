import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { runCli } from "./cli.js";
import { setMcpProfilePersistentState } from "./mcp/index.js";
import { registerPluginManifest, setPluginEnabledState } from "./plugins/index.js";
import { saveCurrentProfile } from "./profiles/index.js";

const encoder = new TextEncoder();

test("help, version, and status work without an API key", async () => {
  for (const helpArg of ["help", "--help", "-h"]) {
    const help = createIo();
    assert.equal(await runCli(["node", "cli", helpArg], {}, help.io), 0);
    assert.match(help.stdout(), /Commands:/);
    assert.match(help.stdout(), /\(no command\)  Start an interactive OpenRouter chat session/);
    assert.match(help.stdout(), /plugins\s+List catalog entries, inspect, register\/install, enable, or disable plugins/);
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
    assert.match(status.stdout(), /mcp_registry_hash: sha256:[a-f0-9]{64}/);
    assert.match(status.stdout(), /mcp_pending_schema_changes: none/);
    assert.match(status.stdout(), /mcp_profile: profile=openrouter state=disabled/);
    assert.match(status.stdout(), /hash=sha256:[a-f0-9]{64}/);
    assert.match(status.stdout(), /plugin_installed_count: 0/);
    assert.match(status.stdout(), /plugin_enabled_count: 0/);
    assert.match(status.stdout(), /plugin_enabled_hooks: 0/);
    assert.match(status.stdout(), /plugin_enabled_bins: 0/);
    assert.match(status.stdout(), /plugin_enabled_mcp: 0/);
    assert.match(status.stdout(), /plugin_enabled_skills: 0/);
    assert.match(status.stdout(), /active_profile: none/);
    assert.match(status.stdout(), /profile_count: 0/);
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
    assert.match(status.stdout(), /mcp_profile: profile=openrouter state=enabled/);
    assert.match(status.stdout(), /trusted_hash=sha256:[a-f0-9]{64}/);
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
    assert.match(inspected.stdout(), /executable_surfaces: hooks=inactive bins=inactive mcp=inactive/);
    assert.match(inspected.stdout(), /plugin_code_execution: disabled in this scaffold/);

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
    assert.match(enabled.stdout(), /executable surfaces remain inactive/);

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
  options: { fetch?: typeof fetch; stdin?: NodeJS.ReadableStream; cwd?: string; tty?: boolean } = {},
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
