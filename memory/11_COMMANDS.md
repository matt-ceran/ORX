# Commands

Last updated: 2026-06-29

## Repository

```bash
cd /Users/draingang/Documents/ORX
git status --short --branch
git remote -v
```

## GitHub

```bash
gh repo view matt-ceran/ORX --web
```

Repo URL:

```text
https://github.com/matt-ceran/ORX
```

## Planned CLI Commands

```bash
orx
orx help
orx --mode auto
orx --mode fusion
orx --model anthropic/claude-sonnet-4.5
orx --profile deep-review
```

Planned behavior:

- `orx` with no args starts interactive chat in the current directory. This is now implemented for the source/dev CLI.
- `orx help`, `orx --help`, and `orx -h` show help.
- `orx ask "prompt"` remains the explicit one-shot command.
- Global install exposes `orx` from any directory after `npm install` and `npm install -g .`; `prepare` builds `dist/cli.js` for source installs.

## Current CLI Commands

```bash
npm run dev -- --help
npm run dev -- --version
npm run dev -- status
npm run dev -- doctor
npm run dev -- doctor --strict
npm run dev -- config show
npm run dev -- config path
npm run dev -- config set theme vivid
npm run dev -- history
npm run dev -- history search provider
npm run dev -- history clear
OPENROUTER_API_KEY="sk-or-..." npm run dev -- ask "Say hello from ORX"
OPENROUTER_API_KEY="sk-or-..." npm run dev -- ask "Say hello" --model anthropic/claude-sonnet-4.5
OPENROUTER_API_KEY="sk-or-..." npm run dev -- ask "Say hello" --mode fusion --fusion general-budget
npm run dev -- mcp enable openrouter
npm run dev -- mcp auth setup openrouter
npm run dev -- mcp auth env openrouter
npm run dev -- mcp auth init openrouter
npm run dev -- mcp auth keychain status openrouter
npm run dev -- mcp auth keychain set openrouter
npm run dev -- mcp allow-model-tool openrouter models-list
OPENROUTER_API_KEY="sk-or-..." ORX_MCP_BEARER_OPENROUTER="..." npm run dev -- ask "Use OpenRouter MCP metadata" --mcp-tools
npm run dev -- tests list
npm run dev -- tests run
npm run dev -- code map
npm run dev -- code symbols
npm run dev -- symbols renderCode
npm run dev -- map src
npm run dev -- orchestrator
npm run dev -- orchestrator plan
npm run dev -- delegates
npm run dev -- delegate add reviewer openrouter anthropic/claude-sonnet-4.5
OPENROUTER_API_KEY="sk-or-..." npm run dev -- models claude
OPENROUTER_API_KEY="sk-or-..." npm run dev -- credits
OPENROUTER_API_KEY="sk-or-..." npm run dev -- generation "gen_..."
OPENROUTER_API_KEY="sk-or-..." npm run dev -- profile save daily
OPENROUTER_API_KEY="sk-or-..." npm run dev -- --profile daily status
OPENROUTER_API_KEY="sk-or-..." npm run dev -- --profile daily ask "Say hello"
OPENROUTER_API_KEY="sk-or-..." npm run dev -- chat
printf '/mode fusion\n/fusion general-budget\n/theme vivid\n/config show\n/config path\n/config set theme mono\n/profile save daily\n/profile use daily\n/history search provider\n/models claude\n/credits\n/generation gen_...\n/tests list\n/tests run\n/map\n/code map src\n/code symbols render\n/symbols create\n/web\n/web fetch https://example.com\n/web search openrouter models\n/web browse https://example.com\n/search orx cli\n/browse https://example.com\n/orchestrator openrouter openrouter/fusion\n/delegate add reviewer openrouter anthropic/claude-sonnet-4.5\n/delegates\n/sources\n/cite src-1\n/bibliography\n/mcp\n/mcp enable openrouter\n/mcp auth setup openrouter\n/mcp allow-model-tool openrouter models-list\n/mcp model enable\n/status\n/new\n/exit\n' | OPENROUTER_API_KEY="sk-or-..." BRAVE_SEARCH_API_KEY="..." npm run dev -- chat
```

If `.orx/config.toml` contains the API key, the `OPENROUTER_API_KEY=...` prefix is not needed. The `.orx/` directory is ignored and must remain uncommitted.

`orx config show` and `/config show` render the effective local/user config with API-key values redacted. `orx config path` and `/config path` show the local and user config paths, including `ORX_CONFIG_PATH` overrides. `orx config set <key> <value> [--user|--local]` and `/config set <key> <value> [--user|--local]` edit supported non-secret keys only: `model`, `mode`, `fusion_preset`, `theme`, `approval_policy`, and `sandbox_mode`. Edits default to the user config path, write private files, do not call network/subprocesses, refuse API-key storage through CLI/slash args, and redact secret-like/control-character unknown keys; slash edits also update the active chat config snapshot for the edited key. Use `OPENROUTER_API_KEY` or manual config editing for keys.

Optional TTY theme config:

```toml
theme = "vivid"
```

Allowed theme values are `default`, `mono`, and `vivid`. Chat supports `/theme` to inspect the current theme and `/theme <value>` to change it for the active session/config. `ORX_TTY_THEME` or `ORX_THEME` can override the configured theme for rendering. `NO_COLOR=1` still forces plain output.

Saved profiles:

```bash
npm run dev -- profile list
npm run dev -- profile save daily
npm run dev -- profile inspect daily
npm run dev -- profile delete daily
npm run dev -- plugins list
npm run dev -- plugins install ./orx-plugin.json
npm run dev -- plugins inspect acme.example@1.0.0
npm run dev -- plugins enable acme.example@1.0.0
npm run dev -- plugins disable acme.example@1.0.0
npm run dev -- --profile daily status
OPENROUTER_API_KEY="sk-or-..." npm run dev -- --profile daily ask "Say hello"
```

Profiles persist model, mode, Fusion preset, theme, and permission posture under `~/.orx/profiles.json`; use `ORX_PROFILE_CONFIG_PATH` for isolated runs. Profiles do not store API keys. In chat, `/profile list`, `/profile save <id>`, `/profile use <id>`, `/profile inspect <id>`, and `/profile delete <id>` manage the same registry. Manual `/model`, `/mode`, `/fusion`, or `/theme` changes clear the active profile label.

`orx doctor` is a no-key setup overview that starts with `overall`, `ready_to_use`, `core_cli`, `chat`, `mcp`, `plugins`, and `delegation` readiness labels, then aggregates local runtime defaults, API-key presence, saved profiles, test targets, MCP profile/policy counts, plugin review counts, saved delegation teams, delegation policy state, and concrete next commands. `orx doctor --strict` renders the same report and exits nonzero unless `ready_to_use: yes`, so it can gate local install/release readiness. It does not call OpenRouter, remote MCP endpoints, plugin bins, or plugin hooks. Use `orx status`, `orx mcp status`, `orx plugins doctor`, and `orx delegates plan` for detailed follow-up.

TTY prompt history is local and private. Interactive readline chat stores sanitized user prompts under `~/.orx/history.json` or `ORX_CHAT_HISTORY_PATH` with `0700` parent and `0600` file modes; slash commands and secret-like input are skipped. Readline preloads single-line entries for up-arrow recall. `orx history`, `orx history search <query>`, `orx history clear`, `/history`, `/history search <query>`, and `/history clear` inspect or clear the same file without API keys, network calls, subprocesses, model exposure, or transcript indexing.

Plugin registry commands are no-key and no-network by default. `orx plugins install <manifest-path>` and `/plugins install <manifest-path>` are aliases for inert local manifest registration. Installed plugins remain disabled; enabling a plugin persists only the enabled marker. `orx plugins commands` and `/plugin list` render namespaced aliases derived from enabled prompt commands, bins, and executable command schemas. `/plugin:<plugin-id>:command:<slug>` activates the matching prompt as untrusted chat context. Trusted current bin hashes can run only through explicit `orx bins run <id> [args...]`, `/bins run <id> [args...]`, or `/plugin:<plugin-id>:bin:<file> [args...]`, with cached-plugin cwd, manifest-declared env only, redacted/truncated output, and JSONL audit logging without raw argument lists. `/plugin:<plugin-id>:exec:<slug> [args...]` aliases come from `components.commandSchemas`, enforce optional `maxArgs`, and then delegate to the referenced trusted current bin through the same runtime. Trusted current hook hashes can run through explicit `orx hooks run <id>` / `/hooks run <id>` and matching lifecycle events with minimal env/cwd and JSONL audit logging. Plugin MCP presets require separate MCP profile enablement/trust plus explicit `/mcp call`/`orx mcp call` or read-only model grants through `/mcp allow-model-tool`/`orx mcp allow-model-tool` before tool execution.

MCP auth setup does not call network or write config. It may still write normal redacted MCP audit metadata. `orx mcp auth <profile>` and `/mcp auth <profile>` show effective env readiness, macOS Keychain opt-in status, managed env-file path, and provider-specific credential source/lifetime/scope/setup hints for recognized provider endpoints; `orx mcp auth setup <profile>`, `orx mcp auth env <profile>`, `/mcp auth setup <profile>`, and `/mcp auth env <profile>` print copyable shell export placeholders for auth-required profiles without showing token values. Provider guidance is selected only from exact parsed HTTPS MCP endpoint hosts/paths; spoofed or unknown endpoints render generic bearer guidance. `orx mcp auth init <profile>`, `orx mcp auth env-file <profile>`, `/mcp auth init <profile>`, and `/mcp auth env-file <profile>` create a private commented shell env template under `~/.orx/mcp/auth-env` or `ORX_MCP_AUTH_ENV_DIR`, with `0700` directory and `0600` file modes, no token values, no overwrite of existing files, and symlink-parent refusal. On macOS, `orx mcp auth keychain [status|set|delete] <profile>` and `/mcp auth keychain ...` manage an optional bearer item through `/usr/bin/security`; `set` prompts through macOS Security, ORX never prints token values, and MCP calls read Keychain only after explicit `ORX_MCP_KEYCHAIN=1` opt-in. No-auth profiles render `shell_exports: not required` and `auth init` skips file creation.

Native test commands are no-key and local-only. `orx tests list` and `/tests list` discover safe package `test*` scripts, infer Node/Vitest/Jest/Playwright/unknown framework metadata plus simple reporter hints, default to `script:test` when present, and fall back to a direct `node --test` target for Node test/spec files when no `test` package script exists. `orx tests run [target-id] [-- args...]` and `/tests run [target-id] [-- args...]` run the default or named target with bounded output and sanitized extra arguments. If the bounded output contains common Node/Vitest/Jest/Playwright summary lines, run output includes compact parsed report counts. `/status` and `orx status` show discovered test target counts, framework counts, and the default target. The model-visible native `run_tests` tool runs the same framework/report-aware adapter inside `ask`/`chat`, so routine model verification can avoid raw shell commands.

Native code-map commands are no-key and local-only. `orx code map [path]`, `orx map [path]`, `orx code-map [path]`, `/map [path]`, and `/code map [path]` scan a bounded local tree, skip generated/vendor directories, and render language counts, key files, package/config/source entrypoints, and top JavaScript/TypeScript source imports/exports with rendered secret redaction. `orx code symbols [query]`, `orx symbols [query]`, `/code symbols [query]`, and `/symbols [query]` reuse that scan to render exported JavaScript/TypeScript symbols with file paths and line numbers.

Delegation CLI commands are no-key and sessionless. `orx orchestrator`, `orx orchestrator plan`, `orx delegate`, `orx delegate plan [saved-team-id]`, `orx delegates`, and `orx delegates plan [saved-team-id]` render delegation status, readiness blockers, saved-team guidance, and policy state. Live-session forms such as `orx orchestrator openrouter <model>`, `orx orchestrator clear`, `orx delegate add <name> openrouter <model>`, `orx delegate remove <name>`, and `orx delegate clear` validate safe names/models and then refuse because noninteractive CLI has no active chat session to mutate. Delegation execution policy can be inspected or tuned with `orx delegates policy` / `orx delegate policy` and `policy set --execution enabled|disabled --max-cost-usd <n> --timeout-ms <ms> --max-result-bytes <bytes> --max-concurrent <n> --credentials none --result-persistence none --result-merge manual_summary|metadata_only`; policy defaults to disabled and setting it does not call OpenRouter or spawn subprocesses by itself. Interactive chat exposes `delegate_task` only when policy execution is enabled and at least one delegate is configured in that chat session. Live calls use the OpenRouter adapter, reject secret-like task/context payloads before network, cap model-requested timeout/result/cost limits to operator policy, default blank delegate names to the sole configured delegate, omit blank optional context/expected-output fields, return wrapped untrusted delegate output with begin/end markers and structured `untrustedOutputPolicy` for `manual_summary`, omit delegate text from model-facing tool output for `metadata_only`, and write hash-only audit metadata to `~/.orx/audit/delegation.jsonl` or `ORX_DELEGATION_AUDIT_PATH`; observed cost is reported from OpenRouter generation metadata when available. Saved disabled teams can be managed with `orx delegates teams`, `orx delegates save <id> --controller <model> [--delegate <name> <model>...]`, `orx delegates inspect <id>`, `orx delegates plan <id>`, `orx delegates use <id>`, `orx delegates delete <id>`, and `orx delegate team ...`; CLI `plan <id>` previews saved-team readiness against current policy without loading it, CLI `use` remains read-only, and `/delegate team use <id>` loads metadata into the active chat. `orx ask` does not expose `delegate_task`.

In chat, `/model <id-or-search>` resolves through the OpenRouter catalog before changing active state. Exact `provider/model` slugs still work, but unknown friendly names such as `/model deepseek v4` are refused with a `/models <query>` suggestion instead of becoming invalid model ids.

Slash help is grouped and filterable: `/help` shows common commands, `/help all` includes advanced commands, and `/help <query>` filters by name, alias, group, usage, or description. Current aliases include `/m` for `/model`, `/s` for `/status`, `/q` for `/quit`, `/h` for `/help`, and `/exit` as a quit alias.

Command discovery also has `/commands [query]`, with `/palette` as an alias. In TTY/color-capable chat this renders a compact command palette; in non-TTY and `NO_COLOR=1` it renders the deterministic grouped plain palette. Interactive readline sessions complete slash command names and aliases with Tab, for example `/sta<Tab>` -> `/status `. They also complete deterministic subcommands/arguments such as `/mode a<Tab>` -> `auto`, `/web h<Tab>` -> `help`, `/tests r<Tab>` -> `run`, `/code m<Tab>` -> `map`, `/code s<Tab>` -> `symbols`, and `/mcp inspect o<Tab>` -> `openrouter`.

Interactive chat supports line-based multiline prompts. End a line with an unescaped `\` to continue collecting input; TTY mode shows an `orx …` continuation composer, non-TTY mode shows `...>`, and ORX submits the collected lines as one user message.

Web research commands are explicit slash commands, not model-autonomous browsing. `/web fetch <url>` fetches a guarded URL directly. `/web search <query>` and `/search <query>` call Brave Web Search only when `BRAVE_SEARCH_API_KEY` is configured; results are stored as secondary provider-snippet evidence and cited as snippets rather than fetched primary pages. `/web browse <url>` and `/browse <url>` create browser evidence snapshots when Playwright is available, using ORX's guarded document fetch before local browser DOM extraction.

Orchestration slash commands are chat-session delegation controls. `/orchestrator` shows local controller state, `/orchestrator plan` renders readiness blockers, `/orchestrator openrouter <model>` stores an OpenRouter controller, and `/orchestrator clear` clears it. `/delegate status` and `/delegate plan` render delegate state/readiness, `/delegate add <name> openrouter <model>` stores a named delegate, `/delegate remove <name>` and `/delegate clear` remove delegates, `/delegate policy` and `/delegates policy` show or tune explicit execution limits, and `/delegates [list|status|plan|policy|teams|save|use|inspect|delete]` lists delegates/readiness or manages saved disabled teams. `/delegate team save <id>` captures current disabled chat metadata and `/delegate team use <id>` loads a saved disabled team into the current chat session. `delegate_task` is model-visible only when execution policy is enabled and at least one chat delegate is configured; external subprocess agents and automatic delegated result merge do not exist yet, while policy-controlled manual-summary versus metadata-only model exposure is implemented.

`/status` now includes local approximate context and OpenRouter metadata cost meters. `/credits` and `orx credits` now include a live OpenRouter credits usage meter when the credits endpoint returns usable fields. Set `NO_COLOR=1` to force plain output.

TTY chat uses compact route/model badges in the bottom status notch. OpenRouter routing shortcuts appear as `route auto` and `route fusion`; wide exact `provider/model` ids split into provider/model badges, while narrow TTY, plain status, and non-TTY output keep compact/full configured model ids as appropriate.

`/status` and `orx status` include the active theme, active profile, and saved profile count. TTY status/composer output, tool summaries, `/credits`, `/commands`, `/palette`, CLI `credits`, and one-shot `ask` tool summaries all use the active theme when color is enabled.

## Planned Environment

```bash
export OPENROUTER_API_KEY="sk-or-..."
export BRAVE_SEARCH_API_KEY="..."
```

## Development Commands

These commands exist after the Phase 1 scaffold.

```bash
npm run dev
npm run build
npm run typecheck
npm test
npm run verify:global-install
```
