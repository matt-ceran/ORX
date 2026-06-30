# ORX

OpenRouter-native terminal coding agent.

ORX is planned as a personal CLI for using OpenRouter models with a polished terminal interface, model routing, Fusion support, local coding tools, and YOLO-style permissions by default.

## Goals

- Launch with a dedicated `orx` command.
- Switch between exact models, `openrouter/auto`, and `openrouter/fusion`.
- Support OpenRouter Fusion presets and custom panel configuration.
- Provide local coding-agent tools for file reads, search, patching, shell commands, diffs, test runs, and session history.
- Track model, mode, token usage, and estimated cost.
- Use a professional terminal UI with streaming output, slash commands, status footer, and colored tool output.

## Default Permissions

The intended default is unrestricted local execution for personal use:

```toml
approval_policy = "never"
sandbox_mode = "danger-full-access"
```

This should remain visible in `/status` and configurable later.

## Local CLI

The local TypeScript CLI can be run from source or built output:

```sh
npm install
npm run build
node dist/cli.js --help
node dist/cli.js --version
node dist/cli.js init
node dist/cli.js status
node dist/cli.js doctor
node dist/cli.js doctor --strict
node dist/cli.js doctor --json
```

To install the source checkout as a global `orx` command without manually running a build:

```sh
npm install
npm install -g .
orx --version
orx init
orx auth
orx auth setup
orx auth init
orx status
orx doctor
orx doctor --strict
orx doctor --json
orx config show
orx config set theme vivid
orx history
orx tests list
orx tests run
orx code map
orx map src
orx code symbols
orx orchestrator
orx delegates plan
orx delegates policy
orx delegates policy set --max-cost-usd 0.5 --timeout-ms 60000 --max-result-bytes 50000 --max-concurrent 2
orx delegates teams
orx delegates save review --controller openrouter/fusion --delegate reviewer anthropic/claude-sonnet-4.5
orx delegates plan review
OPENROUTER_API_KEY=... orx
```

The npm `prepare` lifecycle builds `dist/cli.js` for local source installs. `orx` with no command starts interactive chat from the current directory; use `orx help` or `orx --help` for help output.

For first-run setup, `orx init` creates a private starter config at `~/.orx/config.toml` or `ORX_CONFIG_PATH`; use `orx init --local` for a repo-local `.orx/config.toml`. The generated file contains default model, mode, theme, and unrestricted local permission posture, but it never writes an API key. `orx auth`, `orx auth setup`, `orx auth init`, and matching `/auth status|setup|env|init|env-file` chat commands give the core OpenRouter credential path the same no-secret ergonomics: status/readiness rendering, a copyable placeholder `OPENROUTER_API_KEY` export, and a private commented env template at `~/.orx/auth/openrouter.env` or `ORX_AUTH_ENV_DIR`. ORX does not load that env file automatically; edit and source it from your shell, then run `orx doctor --strict` before launching `orx`.

Config is discovered from repo-local `.orx/config.toml` development defaults and `~/.orx/config.toml`. `OPENROUTER_API_KEY` takes precedence for API key detection. The `status` command reports whether a key is present without printing it. `orx config show` and `/config show` render the effective config with API-key values redacted, `orx config path` and `/config path` show the local/user config paths, and `orx config set <key> <value> [--local]` or `/config set <key> <value> [--local]` edit supported non-secret keys: `model`, `mode`, `fusion_preset`, `theme`, `approval_policy`, and `sandbox_mode`. If config parsing fails, normal commands fail with a sanitized message, while `orx config path` still renders local/user paths so the bad file can be found without leaking contents. Config edits default to the user config path, honor `ORX_CONFIG_PATH` for isolated runs, use private file modes for created files, update the current chat snapshot for the edited key, and refuse API-key storage through CLI arguments.

`orx doctor` is a no-network readiness overview for day-to-day setup checks. It starts with a concise readiness summary (`overall`, `ready_to_use`, `core_cli`, `chat`, `mcp`, `plugins`, and `delegation`), then shows runtime defaults, MCP profile state, plugin review counts, saved delegation teams, delegation policy state, and concrete next commands without calling OpenRouter, remote MCP servers, plugin bins, or plugin hooks. When the core API key is missing, doctor points to `orx auth setup` and `orx auth init`. `orx doctor --strict` renders the same report but exits nonzero unless `ready_to_use: yes`, making it suitable for local release/install checks. `orx doctor --json` renders the same readiness data as structured redacted JSON, and can be combined with `--strict`. Use `orx status`, `orx mcp status`, `orx plugins doctor`, and `orx delegates plan` for deeper detail.

Interactive TTY chat stores sanitized user prompts, but not slash commands or secret-like input, in a private local prompt history file at `~/.orx/history.json`; set `ORX_CHAT_HISTORY_PATH` to isolate it. Readline preloads that history for up-arrow recall. Use `orx history`, `orx history search <query>`, `orx history clear`, `/history`, `/history search <query>`, and `/history clear` to inspect or clear it without network calls.

Saved local profiles can bundle model, mode, Fusion preset, theme, and permission posture without storing API keys:

```sh
orx profile save daily
orx profile save fusion-vivid --model openrouter/fusion --mode fusion --fusion general-budget --theme vivid
orx profile list
orx profile inspect daily
OPENROUTER_API_KEY=... orx --profile daily
```

Profiles are stored outside repos at `~/.orx/profiles.json`; set `ORX_PROFILE_CONFIG_PATH` to isolate or test that registry. `profile save` captures the current config by default and can override the saved snapshot with `--model`, `--mode`, `--fusion`/`--fusion-preset`, `--theme`, `--approval-policy`, and `--sandbox-mode` without mutating the active config or writing API keys.

Native test discovery is available outside chat without an OpenRouter API key:

```sh
orx tests list
orx tests run
orx tests run script:test:unit -- --watch=false
```

The adapter discovers local `package.json` scripts whose names start with `test` and falls back to Node's built-in test runner for `*.test.js`, `*.test.mjs`, `*.test.cjs`, `*.spec.js`, `*.spec.mjs`, and `*.spec.cjs` files when no `test` package script exists. Target listings and run summaries include inferred framework metadata for Node, Vitest, Jest, Playwright, and unknown package-script runners, plus simple reporter hints when script flags declare them. When output contains common Node, Vitest, Jest, or Playwright summary lines, ORX also renders compact parsed report counts.

The agent loop also exposes `run_tests` as a native model tool. It runs the same discovered target with shell disabled, bounded output, timeouts, sanitized extra arguments, and compact framework/report-aware summaries, so routine verification can use the test adapter instead of raw shell commands.

Local code-map discovery is also available without an OpenRouter API key:

```sh
orx code map
orx map src
orx code-map src
orx code symbols
orx symbols renderCode
```

The code map scans a bounded local tree, skips generated/vendor directories such as `node_modules`, `.git`, `.orx`, `dist`, `build`, and `coverage`, summarizes languages, key files, package/config/source entrypoints, and top JavaScript/TypeScript source imports/exports, and redacts secret-like rendered paths or symbols. The symbol index reuses the same bounded scan to list exported JavaScript/TypeScript symbols with file paths and line numbers.

Delegation/orchestration CLI commands are no-key and sessionless. `orx orchestrator`, `orx delegate`, and `orx delegates` render delegation status, readiness blockers, saved-team guidance, and the current policy boundary. `orx delegates plan <saved-team-id>` and `orx delegate plan <saved-team-id>` preview a saved team against the current execution policy without loading it into chat. Mutating live-session forms such as `orx orchestrator openrouter <model>` and `orx delegate add <name> openrouter <model>` validate arguments, then refuse because the noninteractive CLI has no active chat session to mutate.

Delegation execution policy is stored separately at `~/.orx/delegation/policy.json`; set `ORX_DELEGATION_POLICY_PATH` to isolate it. `orx delegates policy` shows the current policy, which defaults to disabled. `orx delegates policy set --execution enabled|disabled ...` can explicitly enable or disable chat delegation and tune max task cost, timeout, result bytes, max concurrent delegates, credential forwarding, result persistence, and result merge mode. Credential forwarding and result persistence remain fixed to `none`; result merge accepts `manual_summary` or `metadata_only`. Setting policy does not call OpenRouter or spawn subprocesses by itself.

The internal `delegate_task` OpenRouter adapter is policy-gated. Normal `orx ask` does not expose it. Interactive chat exposes `delegate_task` to the controller model only when policy execution is enabled and at least one delegate is configured in that chat session. If exactly one delegate is configured, omitted or blank model-supplied delegate names select it; nonblank malformed names still fail closed. Blank optional context/expected-output fields are treated as omitted, and model-requested timeout/result/cost limits above policy are capped to the operator policy. Live delegate calls use OpenRouter API credentials from the normal ORX credential path, refuse secret-like task/context payloads before network, return delegate text only inside explicit `UNTRUSTED DELEGATE OUTPUT` begin/end markers with a structured `untrustedOutputPolicy` when result merge is `manual_summary`, omit delegate text from the controller model's tool result when result merge is `metadata_only`, and write hash-only audit metadata to `~/.orx/audit/delegation.jsonl`; set `ORX_DELEGATION_AUDIT_PATH` to isolate it. When OpenRouter generation metadata reports cost, ORX records observed cost and whether it exceeded the configured post-call limit.

A minimal interactive delegation setup looks like:

```text
/delegate add reviewer openrouter anthropic/claude-sonnet-4.5
/delegate policy set --execution enabled --max-cost-usd 0.25 --timeout-ms 120000 --max-result-bytes 60000
/delegate plan
```

Saved disabled delegation teams can be managed outside chat:

```sh
orx delegates teams
orx delegates save review --controller openrouter/fusion --delegate reviewer anthropic/claude-sonnet-4.5
orx delegates inspect review
orx delegates use review
orx delegates delete review
```

Teams are stored at `~/.orx/delegation/teams.json`; set `ORX_DELEGATION_TEAMS_PATH` to isolate the registry. Saved team records contain only normalized disabled controller/delegate metadata. CLI `use` is read-only and tells you how to load the team in chat; CLI `plan <id>` previews saved-team readiness against the current policy; `/delegate team use <id>` loads that metadata into the current chat session. Team commands do not call OpenRouter, spawn subprocess agents, or change the separate execution policy.

Plugin registry management is also available outside chat:

```sh
orx plugins list
orx plugins review
orx plugins catalog
orx plugins catalog inspect local.my-plugin@0.1.0
orx plugins catalog updates local.remote-plugin@0.1.0
orx plugins catalog update local.remote-plugin@0.1.0
orx plugins catalog add-local ./my-plugin --tag local
orx plugins catalog add-git local.remote-plugin@0.1.0 https://github.com/local/remote-plugin.git 0123456789abcdef0123456789abcdef01234567 --ref v0.1.0 --tag git
orx plugins catalog remove local.my-plugin@0.1.0
orx plugins scaffold ./my-plugin --name my-plugin --publisher local
orx plugins scaffold ./my-full-plugin --name my-full-plugin --publisher local --with skills,commands,rules,hooks,bins,mcp,command-schemas
orx plugins validate ./my-plugin
orx plugins install ./orx-plugin.json
orx plugins install acme.example@1.0.0
orx plugins inspect acme.example
orx plugins commands
orx plugins enable acme.example
orx plugins disable acme.example
orx bins list
orx bins inspect plugin:acme.example@1.0.0:bin:format
orx bins trust plugin:acme.example@1.0.0:bin:format
orx bins run plugin:acme.example@1.0.0:bin:format --check
orx bins untrust plugin:acme.example@1.0.0:bin:format
orx hooks list
orx hooks inspect plugin:acme.example@1.0.0:format
orx hooks trust plugin:acme.example@1.0.0:format
orx hooks run plugin:acme.example@1.0.0:format
orx hooks untrust plugin:acme.example@1.0.0:format
orx mcp presets
orx mcp presets inspect context7
orx mcp presets inspect sentry-readonly
orx mcp plan context7
orx mcp add-preset context7
orx mcp plan context7
orx mcp add-preset microsoft-learn --id mslearn
orx mcp add-preset github-readonly
orx mcp add-preset cloudflare-api
orx mcp add-preset figma
orx mcp remote-tools user:github-readonly
orx mcp import-remote-tools github-readonly
orx mcp catalog
orx mcp add-profile context7 https://mcp.context7.example/mcp --name "Context7 docs" --auth-required
orx mcp add-tool user:context7 resolve-library-id read --auth-required --free
orx mcp enable user:context7
orx mcp inspect user:context7
orx mcp auth user:context7
orx mcp auth init user:context7
orx mcp auth keychain status user:context7
orx mcp auth keychain set user:context7
orx mcp remove-tool user:context7 resolve-library-id
orx mcp remove-profile user:context7
```

`orx mcp plan [preset-or-profile]` and `/mcp plan [preset-or-profile]` render a setup plan for MCP onboarding. The planner accepts built-in preset ids such as `context7` or installed profile ids such as `user:context7`, reports whether the next step is preset install, enable/trust, auth setup, remote tool review/import, operator grants, or read-only model grants, and prints concrete follow-up commands. It does not install, enable, trust, grant, fetch remote tools, call MCP tools, expose tools to the model, write audit logs, or contact provider endpoints; like other MCP reads, it may tighten loose existing MCP state file permissions while loading local state.

Plugin scaffold creates a local authoring directory with a valid `orx-plugin.json` plus a non-runtime `AUTHORING.md` guide for non-minimal scaffolds. By default it writes inert `skills`, prompt `commands`, and advisory `rules` markdown. `--minimal` writes only the manifest, and `--with` can add optional component placeholders such as empty `hooks/hooks.json`, empty `mcp.json`, empty `command-schemas.json`, an intentionally empty `bin/` directory, `assets/`, and `docs/`. Scaffolding never registers, enables, trusts, grants, fetches, or executes anything. `orx plugins validate <manifest-path-or-directory>` previews the sanitized manifest, component hashes, missing component warnings, and permission counts without writing registry/cache state or running plugin code. Review the generated files and then install the manifest explicitly.

Plugin install/register stores an inert local registry record plus an ORX-owned cache snapshot of the sanitized manifest, declared components, and declared hook cwd directories. By default the registry lives at `~/.orx/plugins/registry.json`, the cache at `~/.orx/plugins/cache`, the bin trust file at `~/.orx/plugins/bins.json`, the bin audit log at `~/.orx/audit/bins.jsonl`, the hook trust file at `~/.orx/plugins/hooks.json`, the hook audit log at `~/.orx/audit/hooks.jsonl`, and the optional local catalog at `~/.orx/plugins/catalog.json`; use `ORX_PLUGIN_REGISTRY_PATH`, `ORX_PLUGIN_CACHE_DIR`, `ORX_PLUGIN_BINS_CONFIG_PATH`, `ORX_PLUGIN_BINS_AUDIT_PATH`, `ORX_PLUGIN_HOOKS_CONFIG_PATH`, `ORX_PLUGIN_HOOKS_AUDIT_PATH`, and `ORX_PLUGIN_CATALOG_PATH` to isolate them. `orx plugins review` summarizes installed/enabled state, local catalog pin drift, bin and hook trust state, plugin MCP profiles, command aliases, and concrete next commands without network calls or execution. `orx plugins catalog inspect`, `orx plugins catalog updates`, `orx plugins catalog update`, `orx plugins catalog add-local`, `orx plugins catalog add-git`, and matching `/plugins catalog ...` commands review, apply pinned updates, or write local catalog declarations with private file permissions. Catalog update checks compare installed registry provenance against the local catalog's pinned git commit only; they do not contact remotes to discover newer commits. Catalog update apply runs only when an installed pinned git plugin differs from the catalog pin, reuses the same pinned install path, and registers the updated snapshot disabled; enablement, trust, grants, fetch policy, and execution remain separate explicit steps. Catalog installs can resolve local manifest paths or pinned git sources. Pinned git catalog installs clone into a private temporary source directory, checkout the exact `resolvedCommit`, normalize cached manifest provenance to that pin, and then reuse the same inert registry/cache path. Installed-plugin commands such as `orx plugins inspect|enable|disable` and matching `/plugins ...` commands accept the exact `publisher.name@version` id, or the unversioned `publisher.name` id when exactly one installed version matches; ambiguous multiple-version installs require the exact versioned id. Enabling a plugin only enables its metadata, skills, prompt-command, rules, MCP preset, command-schema, bin review/trust, and hook review/trust surfaces where supported. Trusted current bins run only through explicit operator `bins run` / `/bins run` commands or their namespaced `/plugin:<plugin-id>:bin:<file>` aliases. Manifest-defined executable command aliases run only through referenced trusted current bins and add bounded usage/max-argument metadata; they do not create a separate execution trust store. Trusted current hooks can run manually or on matching lifecycle events. Plugin-declared MCP tools run only after the resulting MCP profile is separately enabled/trusted and invoked through the explicit or read-only model MCP gates.

Catalog files are local JSON:

```json
{
  "version": 1,
  "entries": [
    {
      "id": "acme.example@1.0.0",
      "description": "Example plugin.",
      "manifestPath": "./example/orx-plugin.json",
      "tags": ["example"]
    }
  ]
}
```

Catalog entries can also install from pinned git sources:

```json
{
  "version": 1,
  "entries": [
    {
      "id": "acme.example@1.0.0",
      "description": "Example plugin from git.",
      "source": {
        "type": "git",
        "repository": "https://github.com/acme/orx-example-plugin.git",
        "ref": "v1.0.0",
        "resolvedCommit": "0123456789abcdef0123456789abcdef01234567",
        "manifestPath": "orx-plugin.json"
      },
      "tags": ["example"]
    }
  ]
}
```

Git catalog entries must be pinned to a full 40- or 64-character commit hash. Repository URLs may not contain credentials, query strings, fragments, unsafe git transports, or secret-like values.

Plugin manifests may include optional inert `metadata` for risk display, such as `trustTier`, `homepage`, `documentation`, `license`, `auth`, `privacy`, and `runtime`. ORX sanitizes those fields for `/plugins inspect`; they do not grant permissions or activate executable surfaces.

Enabled plugins can declare MCP presets through `components.mcpServers`. ORX reads these declarations from the cached plugin snapshot, namespaces them as `plugin:<plugin-id>:<server-id>`, includes them in `/mcp list`, `/mcp inspect`, `/mcp auth`, `/mcp tools`, `/mcp call`, `/mcp remote-tools`, `/mcp enable`, `/mcp discover`, and `/status`, and hashes plugin manifest/component provenance for schema-change visibility. User MCP profiles can also be declared locally in `~/.orx/mcp/profile-catalog.json` or `ORX_MCP_PROFILE_CATALOG_PATH`; ORX namespaces them as `user:<profile-id>` and routes them through the same disabled-by-default enable/trust/hash/tool-grant gates as built-in and plugin profiles. `orx mcp presets` lists built-in provider templates, `orx mcp presets inspect <preset>` reviews a preset without writing catalog state, and `orx mcp add-preset <preset>` writes the selected template into the same private user catalog. Built-in presets include `context7`, `microsoft-learn`, `github-readonly`, `sentry-readonly`, `figma`, `browser`, `cloudflare-docs`, and `cloudflare-api`. OAuth-backed or dynamic-tool providers still require explicit enable/trust, provider credentials compatible with ORX's bearer-token path, and remote-tool review before calls. `orx mcp catalog`, `orx mcp add-profile`, `orx mcp remove-profile`, `orx mcp add-tool`, and `orx mcp remove-tool` edit that local catalog without hand-writing JSON, using private `0700` directories and `0600` files. `orx mcp import-remote-tools <profile>` and `/mcp import-remote-tools <profile>` can import reviewed names from a successful guarded `tools/list` result into a local `user:` catalog profile as read-only, non-billable declarations. Importing changes the local profile hash when new declarations are added, so the profile must be reviewed and re-enabled before calls or model grants use those tools. `orx mcp ...` also exposes local profile/policy inspection, profile enable/disable, per-tool grant/revoke, per-tool model grant/revoke, auth readiness, and explicit tool calls without requiring an OpenRouter chat API key. `orx mcp auth <profile>` and `/mcp auth <profile>` show the profile-specific bearer env name, fallback env status, managed env-file path, effective env auth readiness, macOS Keychain opt-in status, hash state, current OAuth limitation, and provider-specific credential source/lifetime/scope/setup hints for recognized provider endpoints without network calls or secret persistence. `orx mcp auth setup <profile>`, `orx mcp auth env <profile>`, `/mcp auth setup <profile>`, and `/mcp auth env <profile>` print copyable shell export placeholders for auth-required profiles plus the same provider guidance, never display token values, and make no network calls, subprocess calls, or config writes beyond normal redacted audit metadata. Provider guidance is selected only from exact parsed HTTPS MCP endpoint hosts/paths; unknown or spoofed profiles render generic bearer guidance. `orx mcp auth init <profile>`, `orx mcp auth env-file <profile>`, `/mcp auth init <profile>`, and `/mcp auth env-file <profile>` create a private `0600` commented shell env template under `~/.orx/mcp/auth-env` or `ORX_MCP_AUTH_ENV_DIR`, refuse symlink parent paths, do not overwrite existing files, and do not persist token values. On macOS, `orx mcp auth keychain [status|set|delete] <profile>` and `/mcp auth keychain ...` manage an optional Keychain bearer item through `/usr/bin/security`; `set` prompts through macOS Security, ORX never prints token values, and MCP calls read Keychain only after explicit `ORX_MCP_KEYCHAIN=1` opt-in. `orx mcp discover` and `/mcp discover` may contact enabled, trusted, unchanged `remote-http` endpoints through ORX's guarded DNS-vetted discovery transport, but they perform only the minimal initialize handshake. `orx mcp remote-tools` and `/mcp remote-tools` can list and hash remote `tools/list` metadata through the same guards; tool schemas are rendered only as hashes/summaries. `/mcp call <profile> <tool> [json]` and `orx mcp call <profile> <tool> [json]` call `tools/call` only for enabled/trusted/unchanged profiles when policy allows the declared tool and required bearer auth is supplied through `ORX_MCP_BEARER_<PROFILE>`, `ORX_MCP_BEARER_TOKEN`, or an opted-in macOS Keychain item. For `user:context7`, the profile-specific env name is `ORX_MCP_BEARER_USER_CONTEXT7`. Billable/write/destructive MCP tools require explicit per-tool grants bound to the current trusted profile hash, and stale grants are visible and denied. In interactive chat, `/mcp model enable` exposes one model-visible native tool, `mcp_call`, for read-only non-billable declared MCP tools that also have active model-tool grants; model-visible MCP text output is wrapped as untrusted remote data and cannot override system, developer, operator, ORX policy, or tool-permission instructions. `/mcp model disable` removes it again. One-shot `orx ask --mcp-tools` enables the same model-granted read-only bridge for that request only. Broad/billable/write model-loop MCP exposure remains inactive.

Example user MCP profile catalog:

```json
{
  "version": 1,
  "profiles": {
    "context7": {
      "name": "Context7 docs",
      "transport": {
        "kind": "remote-http",
        "url": "https://mcp.context7.example/mcp"
      },
      "authRequired": true,
      "tools": [
        {
          "name": "resolve-library-id",
          "risk": "read",
          "authRequired": true,
          "billable": false
        }
      ],
      "notes": "Docs lookup profile declared locally."
    }
  }
}
```

The same catalog can be edited through slash commands in chat:

```text
/mcp presets
/mcp presets inspect github-readonly
/mcp presets inspect cloudflare-api
/mcp add-preset context7
/mcp add-preset sentry-readonly
/mcp catalog
/mcp add-profile context7 https://mcp.context7.example/mcp --name "Context7 docs" --auth-required
/mcp add-tool user:context7 resolve-library-id read --auth-required --free
/mcp enable user:context7
/mcp auth user:context7
```

Enabled plugins can declare hook definitions through `components.hooks`. ORX reads those declarations from the cached plugin snapshot, namespaces them as `plugin:<plugin-id>:<hook-id>`, shows them through `orx hooks`, `/hooks`, and `/status`, and lets the operator persist a trusted hook hash. `orx hooks run <id>` and `/hooks run <id>` execute only trusted current hashes, run from the cached plugin root or declared relative cwd, forward only declared env names, truncate/redact output, and append JSONL audit events. Trusted current hooks also run automatically on matching `session_start`, `user_prompt_submit`, `pre_tool_use`, `post_tool_use`, `pre_compact`, `post_compact`, and `stop` lifecycle events. Hook failures are written to stderr and audited; successful hook commands whose audit event cannot be persisted are treated as failed runs. Changed hook hashes show as pending trust until re-trusted.

Enabled plugins can declare executable bins through `components.bins`. ORX reads regular files directly under that cached directory, namespaces them as `plugin:<plugin-id>:bin:<file>`, shows them through `orx bins`, `/bins`, and `/status`, and lets the operator persist a trusted bin hash. `orx bins run <id> [args...]` and `/bins run <id> [args...]` execute only trusted current hashes from the cached plugin root, forward only manifest-declared env names, choose a Node/shebang/sh runner without making cached files globally executable, truncate/redact output, and append JSONL audit events without raw argument lists. Changed bin hashes show as pending trust until re-trusted.

`/plugin list` and `orx plugins commands` list namespaced aliases derived from enabled plugin prompts, bins, and `components.commandSchemas` JSON. `/plugin:<plugin-id>:command:<slug>` activates the matching markdown prompt as untrusted chat context, equivalent to `/prompts activate <id>`. `/plugin:<plugin-id>:bin:<file> [args...]` runs the matching bin through the same trusted-hash, env, output, and audit gates as `/bins run`. `/plugin:<plugin-id>:exec:<slug> [args...]` runs a manifest-defined command only when its referenced bin is trusted/current, and enforces the schema's optional `maxArgs` before execution.

Send one non-interactive streaming request with:

```sh
OPENROUTER_API_KEY=... npm run dev -- ask "Say hello"
```

Useful overrides:

```sh
OPENROUTER_API_KEY=... npm run dev -- ask "Say hello" --model anthropic/claude-sonnet-4.5
OPENROUTER_API_KEY=... npm run dev -- ask "Say hello" --mode auto
OPENROUTER_API_KEY=... npm run dev -- ask "Say hello" --mode fusion --fusion general-budget
npm run dev -- mcp enable openrouter
npm run dev -- mcp auth openrouter
npm run dev -- mcp auth init openrouter
npm run dev -- mcp auth keychain status openrouter
npm run dev -- mcp auth keychain set openrouter
npm run dev -- mcp allow-model-tool openrouter models-list
npm run dev -- mcp presets
npm run dev -- mcp presets inspect context7
npm run dev -- mcp presets inspect cloudflare-api
npm run dev -- mcp add-preset context7
npm run dev -- mcp add-preset sentry-readonly
npm run dev -- mcp catalog
npm run dev -- mcp add-profile context7 https://mcp.context7.example/mcp --name "Context7 docs" --auth-required
npm run dev -- mcp add-tool user:context7 resolve-library-id read --auth-required --free
OPENROUTER_API_KEY=... ORX_MCP_BEARER_OPENROUTER=... npm run dev -- ask "Use OpenRouter MCP metadata" --mcp-tools
```

`--mcp-tools` exposes the same read-only non-billable, model-granted `mcp_call` bridge as `/mcp model enable` for that one `ask` invocation only.

Delegation is a policy-gated chat feature. Noninteractive commands such as `orx delegates plan` show blockers and never call OpenRouter because there is no live chat session to mutate. `orx delegates plan <saved-team-id>` previews a saved team against the current execution policy without loading it. `orx delegates policy` and `/delegate policy` show or tune execution limits, including explicit `--execution enabled|disabled`. Saved disabled teams can be created with explicit CLI args and loaded into an interactive chat with `/delegate team use <id>`. Live session-local delegation setup remains interactive through `/orchestrator`, `/delegate`, and `/delegate team`; `orx ask` does not expose `delegate_task`.

After the streamed assistant text, ORX prints a compact metadata summary when OpenRouter provides details such as requested/resolved model, generation id, token counts, reasoning tokens, and cost. Secrets are never printed.

Start an interactive chat session with:

```sh
OPENROUTER_API_KEY=... npm run dev -- chat
```

The chat UI keeps in-session message history for the current process, streams assistant text as it arrives, and uses a compact TTY status/composer with plain script-safe fallback. In TTY status, OpenRouter routing shortcuts appear as compact `route auto` / `route fusion` badges, and wide exact `provider/model` ids split into provider/model badges while plain and non-TTY output keep full ids. End a line with an unescaped `\` to continue a multiline prompt; ORX submits the collected lines as one user message. Supported slash commands:

```text
/help
/status
/model <openrouter-model-slug>
/mode auto
/mode fusion
/fusion [preset]
/theme [default|mono|vivid]
/config [show|path|set]
/auth [status|setup|env|init|env-file]
/profile [list|save <id> [options]|use|inspect|delete]
/history [search <query>|clear]
/tests [list|run]
/map [path]
/code [map|symbols]
/symbols [query]
/plugins [catalog [list|inspect|updates|update|add-local|add-git|remove]|list|review|commands|scaffold|validate|inspect|register|install|enable|disable]
/plugin [list|status]
/bins [list|inspect|trust|untrust|run]
/hooks [list|inspect|trust|untrust|run]
/skills [list|status|activate]
/prompts [list|status|activate]
/rules [list|status|activate]
/mcp [list|plan [preset-or-profile]|catalog|presets [inspect]|add-preset|inspect|auth|auth setup|auth env|auth init|auth env-file|auth keychain|tools|enable|disable|add-profile|remove-profile|add-tool|remove-tool|allow-tool|revoke-tool|allow-model-tool|revoke-model-tool|discover|remote-tools|import-remote-tools|call|model]
/orchestrator [status|plan|openrouter <model>|clear]
/delegate [help|status|plan|add|remove|clear|team|policy]
/delegates [list|status|plan|policy|teams|save|use|inspect|delete]
/models
/clear
/new
/quit
/exit
```

Ctrl+C aborts the active OpenRouter request when one is streaming, or exits the chat when idle.

## Project Memory

This repo includes a Codex-friendly memory system:

- `AGENTS.md` gives new Codex sessions the startup protocol.
- `memory/00_INDEX.md` is the retrieval map.
- `memory/09_CURRENT_CONTEXT.md` tracks the current repo state.
- `memory/10_BACKLOG.md` tracks next implementation work.

Start future sessions from the repository root and read `memory/00_INDEX.md` first.
