# Commands

Last updated: 2026-06-30

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
npm run dev -- ask --help
npm run dev -- chat --help
npm run dev -- models --help
npm run dev -- credits --help
npm run dev -- generation --help
npm run dev -- mcp plan --help
npm run dev -- mcp add-preset --help
npm run dev -- plugins scaffold --help
npm run dev -- plugins install --help
npm run dev -- mcp help
npm run dev -- plugins --help
npm run dev -- profile -h
npm run dev -- init
npm run dev -- init --local
npm run dev -- auth
npm run dev -- auth setup
npm run dev -- auth init
npm run dev -- status
npm run dev -- doctor
npm run dev -- doctor --strict
npm run dev -- doctor --json
npm run dev -- guide
npm run dev -- quickstart
npm run verify:release
npm run pack:dry-run
npm run overnight:init -- --reset
npm run overnight:dashboard
OPENROUTER_API_KEY="sk-or-..." npm run overnight -- --max-slices 1 --commit
npm run dev -- config init
npm run dev -- config show
npm run dev -- config path
npm run dev -- config set theme vivid
npm run dev -- history
npm run dev -- history search provider
npm run dev -- history clear
OPENROUTER_API_KEY="sk-or-..." npm run dev -- ask "Say hello from ORX"
OPENROUTER_API_KEY="sk-or-..." npm run dev -- ask "Say hello" --model anthropic/claude-sonnet-4.5
OPENROUTER_API_KEY="sk-or-..." npm run dev -- ask "Say hello" --mode fusion --fusion general-budget
npm run dev -- mcp plan context7
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
npm run dev -- code refs renderCode
npm run dev -- code imports renderCode
npm run dev -- code calls renderCode
npm run dev -- code ast-grep 'console.log($A)' src --lang ts
npm run dev -- ast-grep 'console.log($A)' src --lang ts --rewrite 'logger($A)' --preview
npm run dev -- code tree-sitter src/cli.ts
npm run dev -- tree-sitter src/cli.ts
npm run dev -- scanners list
npm run dev -- scanners inspect semgrep
npm run dev -- scanners run semgrep src --config semgrep.yml
npm run dev -- scan semgrep src --config semgrep.yml --json
npm run dev -- diagnostics list
npm run dev -- diagnostics inspect typescript
npm run dev -- diagnostics run typescript
npm run dev -- diag run typescript --json
npm run dev -- refs renderCode
npm run dev -- symbols renderCode
npm run dev -- imports renderCode
npm run dev -- calls renderCode
npm run dev -- map src
npm run dev -- orchestrator
npm run dev -- orchestrator plan
npm run dev -- delegates
npm run dev -- delegate add reviewer openrouter anthropic/claude-sonnet-4.5
OPENROUTER_API_KEY="sk-or-..." npm run dev -- models claude
OPENROUTER_API_KEY="sk-or-..." npm run dev -- credits
OPENROUTER_API_KEY="sk-or-..." npm run dev -- generation "gen_..."
OPENROUTER_API_KEY="sk-or-..." npm run dev -- profile save daily --model openrouter/fusion --mode fusion --fusion general-budget --theme vivid
OPENROUTER_API_KEY="sk-or-..." npm run dev -- --profile daily status
OPENROUTER_API_KEY="sk-or-..." npm run dev -- --profile daily ask "Say hello"
OPENROUTER_API_KEY="sk-or-..." npm run dev -- chat
printf '/mode fusion\n/fusion general-budget\n/theme vivid\n/config show\n/config path\n/config set theme mono\n/auth setup\n/profile save daily --model openrouter/fusion --mode fusion --fusion general-budget --theme vivid\n/profile use daily\n/history search provider\n/models claude\n/credits\n/generation gen_...\n/tests list\n/tests run\n/map\n/code map src\n/code symbols render\n/code refs render\n/code imports render\n/code calls render\n/code ast-grep "console.log($A)" src --lang ts\n/code tree-sitter src/cli.ts\n/symbols create\n/refs create\n/imports create\n/calls create\n/ast-grep "console.log($A)" src --lang ts\n/tree-sitter src/cli.ts\n/scanners list\n/scanners inspect semgrep\n/scan semgrep src --config semgrep.yml\n/diagnostics list\n/diagnostics inspect typescript\n/diag run typescript --json\n/web\n/web fetch https://example.com\n/web search openrouter models\n/web browse https://example.com\n/search orx cli\n/browse https://example.com\n/orchestrator openrouter openrouter/fusion\n/delegate add reviewer openrouter anthropic/claude-sonnet-4.5\n/delegates\n/sources\n/cite src-1\n/bibliography\n/mcp\n/mcp plan context7\n/mcp enable openrouter\n/mcp auth setup openrouter\n/mcp allow-model-tool openrouter models-list\n/mcp model enable\n/status\n/new\n/exit\n' | OPENROUTER_API_KEY="sk-or-..." BRAVE_SEARCH_API_KEY="..." npm run dev -- chat
```

If `.orx/config.toml` contains the API key, the `OPENROUTER_API_KEY=...` prefix is not needed. The `.orx/` directory is ignored and must remain uncommitted.

`orx init` and `orx setup` create a private starter config for first-run setup. Default scope writes the user config path, honoring `ORX_CONFIG_PATH`; `orx init --local` writes a repo-local `.orx/config.toml`. `orx config init` is the same initializer under the config namespace. Init writes model/mode/theme/permission defaults only, never writes API keys, leaves existing regular config files unchanged, refuses symlink config paths, and points users to `OPENROUTER_API_KEY`, `orx doctor --strict`, and `orx`.

`orx auth`, `orx auth status`, `orx auth setup`, `orx auth env`, `orx auth init`, `orx auth env-file`, and matching `/auth status|setup|env|init|env-file` slash commands are no-key/no-network setup helpers for the core OpenRouter API key. Status reports whether a key is available from `OPENROUTER_API_KEY`, config, or neither without printing values, and it degrades to `config_unreadable` without leaking malformed config contents. Setup prints a placeholder shell export only. Init creates a private commented template at `~/.orx/auth/openrouter.env` or `ORX_AUTH_ENV_DIR`, with `0700` directory and `0600` file modes, no token values, no overwrite of existing files, no automatic loading, no config writes, and symlink path refusal. Edit and source the file yourself, then run `orx doctor --strict`.

Namespace help is available without reading config: `orx auth help`, `orx config --help`, `orx profile -h`, `orx history help`, `orx mcp help`, `orx plugins --help`, `orx bins -h`, `orx hooks help`, `orx tests --help`, `orx code help`, `orx scanners --help`, `orx scan --help`, `orx diagnostics --help`, `orx diag --help`, `orx orchestrator help`, `orx delegate --help`, and `orx delegates -h` print usage on stdout and exit 0. Aliases such as `profiles`, `plugin`, `bin`, `hook`, `test`, and `scanner` render the canonical namespace usage.

API-key command flag help is also available before config/profile loading: `orx ask --help`, `orx chat --help`, `orx models --help`, `orx credits --help`, and `orx generation --help` print usage on stdout and exit 0 even if the config is malformed or a global `--profile` value is missing. Bare values are still command input, so `orx ask help` remains a prompt rather than a help alias.

MCP/plugin onboarding subcommand flag help is available before config/profile loading for exact supported help shapes: `orx mcp plan --help`, `orx mcp add-preset --help`, `orx mcp presets --help`, `orx mcp presets inspect --help`, `orx plugins scaffold --help`, `orx plugins validate --help`, `orx plugins install --help`, `orx plugins register --help`, and `orx plugins catalog --help`. Unsupported nested shapes such as `orx plugins catalog bogus --help` still fail through the normal command path.

`orx mcp plan [preset-or-profile]` and `/mcp plan [preset-or-profile]` are onboarding planners for MCP. Use them before and after `orx mcp add-preset`, `orx mcp enable`, auth setup, remote-tool import, or model grants to see the next concrete commands without installing, enabling, trusting, granting, fetching, calling, auditing, or exposing tools to the model. Existing loose MCP state file permissions may still be tightened while local state is read.

`orx config show` and `/config show` render the effective local/user config with API-key values redacted. `orx config path` and `/config path` show the local and user config paths, including `ORX_CONFIG_PATH` overrides. If config parsing fails, normal commands fail with a sanitized message, while `orx config path` still renders a recovery path report with `effective_sources: not_evaluated_config_unreadable`. `orx config set <key> <value> [--user|--local]` and `/config set <key> <value> [--user|--local]` edit supported non-secret keys only: `model`, `mode`, `fusion_preset`, `theme`, `approval_policy`, and `sandbox_mode`. Edits default to the user config path, write private files, do not call network/subprocesses, refuse API-key storage through CLI/slash args, and redact secret-like/control-character unknown keys; slash edits also update the active chat config snapshot for the edited key. Use `OPENROUTER_API_KEY` or manual config editing for keys.

Optional TTY theme config:

```toml
theme = "vivid"
```

Allowed theme values are `default`, `mono`, and `vivid`. Chat supports `/theme` to inspect the current theme and `/theme <value>` to change it for the active session/config. `ORX_TTY_THEME` or `ORX_THEME` can override the configured theme for rendering. `NO_COLOR=1` still forces plain output.

Saved profiles and plugin scaffold flow:

```bash
npm run dev -- profile list
npm run dev -- profile save daily --model openrouter/fusion --mode fusion --fusion general-budget --theme vivid
npm run dev -- profile inspect daily
npm run dev -- profile delete daily
npm run dev -- plugins list
npm run dev -- plugins scaffold ./my-plugin
npm run dev -- plugins validate ./my-plugin
npm run dev -- plugins install ./my-plugin
npm run dev -- plugins install ./orx-plugin.json
npm run dev -- plugins inspect acme.example
npm run dev -- plugins enable acme.example
npm run dev -- plugins disable acme.example
npm run dev -- --profile daily status
OPENROUTER_API_KEY="sk-or-..." npm run dev -- --profile daily ask "Say hello"
```

`orx plugins scaffold <directory>` prints next steps that use the manifest path for review, then the directory path for `orx plugins validate <directory>` and `orx plugins install <directory>`.

Profiles persist model, mode, Fusion preset, theme, and permission posture under `~/.orx/profiles.json`; use `ORX_PROFILE_CONFIG_PATH` for isolated runs. Profiles do not store API keys. `orx profile save <id>` and `/profile save <id>` capture the current config by default and can save non-secret overrides with `--model`, `--mode`, `--fusion`/`--fusion-preset`, `--theme`, `--approval-policy`, and `--sandbox-mode` without mutating active config/session state. In chat, `/profile list`, `/profile save <id> [options]`, `/profile use <id>`, `/profile inspect <id>`, and `/profile delete <id>` manage the same registry. Manual `/model`, `/mode`, `/fusion`, or `/theme` changes clear the active profile label.

`orx doctor` is a no-key setup overview that starts with `overall`, `ready_to_use`, `core_cli`, `chat`, `mcp`, `plugins`, and `delegation` readiness labels, then aggregates local runtime defaults, API-key presence, saved profiles, test targets, MCP profile/policy counts, plugin review counts, saved delegation teams, delegation policy state, and concrete next commands. When the core API key is missing, doctor points to `orx auth setup` and `orx auth init` before broader MCP/plugin/delegation follow-ups. `orx doctor --strict` renders the same report and exits nonzero unless `ready_to_use: yes`, so it can gate local install/release readiness. `orx doctor --json` emits the same readiness data as redacted structured JSON with `schema_version`, `strict_ready`, summary, runtime, MCP, plugins, delegation, and next-step fields; it can be combined with `--strict`. `orx guide` and `orx quickstart` render a no-network operator path over the same readiness data, covering chat launch, config/profile/theme customization, tests, code maps/symbols/refs/imports/calls, MCP preset setup, plugin scaffold/install/review, and delegation setup. These commands do not call OpenRouter, remote MCP endpoints, plugin bins, plugin hooks, or write config/trust/grant/catalog/plugin/delegation/data content; existing loose local state file permissions may still be tightened while reading readiness. Use `orx status`, `orx mcp status`, `orx plugins doctor`, and `orx delegates plan` for detailed follow-up.

TTY prompt history is local and private. Interactive readline chat stores sanitized user prompts under `~/.orx/history.json` or `ORX_CHAT_HISTORY_PATH` with `0700` parent and `0600` file modes; slash commands and secret-like input are skipped. Readline preloads single-line entries for up-arrow recall. `orx history`, `orx history search <query>`, `orx history clear`, `/history`, `/history search <query>`, and `/history clear` inspect or clear the same file without API keys, network calls, subprocesses, model exposure, or transcript indexing.

Plugin registry commands are no-key and no-network by default. `orx plugins install <manifest-path-or-directory-or-catalog-id>` and `/plugins install <manifest-path-or-directory-or-catalog-id>` are aliases for inert local manifest or catalog registration; existing local directories resolve to `orx-plugin.json` so scaffold -> validate -> install can reuse the same directory argument. Installed plugins remain disabled; enabling a plugin persists only the enabled marker. Installed-plugin commands accept exact `publisher.name@version` ids or unversioned `publisher.name` ids when exactly one installed version matches; ambiguous multiple-version installs require the exact versioned id. `orx plugins review|doctor|audit --help|-h` prints usage before config/profile loading, and review aliases reject trailing operands instead of silently ignoring them. `orx plugins commands` and `/plugin list` render namespaced aliases derived from enabled prompt commands, bins, and executable command schemas. `/plugin:<plugin-id>:command:<slug>` activates the matching prompt as untrusted chat context. Trusted current bin hashes can run only through explicit `orx bins run <id> [args...]`, `/bins run <id> [args...]`, or `/plugin:<plugin-id>:bin:<file> [args...]`, with cached-plugin cwd, manifest-declared env only, redacted/truncated output, and JSONL audit logging without raw argument lists. `/plugin:<plugin-id>:exec:<slug> [args...]` aliases come from `components.commandSchemas`, enforce optional `maxArgs`, and then delegate to the referenced trusted current bin through the same runtime. Trusted current hook hashes can run through explicit `orx hooks run <id>` / `/hooks run <id>` and matching lifecycle events with minimal env/cwd and JSONL audit logging. Plugin MCP presets require separate MCP profile enablement/trust plus explicit `/mcp call`/`orx mcp call` or read-only model grants through `/mcp allow-model-tool`/`orx mcp allow-model-tool` before tool execution.

MCP auth setup does not call network or write config. It may still write normal redacted MCP audit metadata. `orx mcp auth <profile>` and `/mcp auth <profile>` show effective env readiness, macOS Keychain opt-in status, managed env-file path, and provider-specific credential source/lifetime/scope/setup hints for recognized provider endpoints; no-auth profiles render credential mode, effective bearer, and Keychain state as `not_required`. `orx mcp auth setup <profile>`, `orx mcp auth env <profile>`, `/mcp auth setup <profile>`, and `/mcp auth env <profile>` print copyable shell export placeholders for auth-required profiles without showing token values. Provider guidance is selected only from exact parsed HTTPS MCP endpoint hosts/paths; spoofed or unknown endpoints render generic bearer guidance. `orx mcp auth init <profile>`, `orx mcp auth env-file <profile>`, `/mcp auth init <profile>`, and `/mcp auth env-file <profile>` create a private commented shell env template under `~/.orx/mcp/auth-env` or `ORX_MCP_AUTH_ENV_DIR`, with `0700` directory and `0600` file modes, no token values, no overwrite of existing files, and symlink-parent refusal. On macOS, `orx mcp auth keychain [status|set|delete] <profile>` and `/mcp auth keychain ...` manage an optional bearer item through `/usr/bin/security`; `set` prompts through macOS Security, ORX never prints token values, and MCP calls read Keychain only after explicit `ORX_MCP_KEYCHAIN=1` opt-in. No-auth profiles render `shell_exports: not required` and `auth init` skips file creation.

Native test commands are no-key and local-only. `orx tests list` and `/tests list` discover safe package `test*` scripts, infer Node/Vitest/Jest/Playwright/unknown framework metadata plus simple reporter hints, default to `script:test` when present, and fall back to a direct `node --test` target for Node test/spec files when no `test` package script exists. `orx tests run [target-id] [-- args...]` and `/tests run [target-id] [-- args...]` run the default or named target with bounded output and sanitized extra arguments. If the bounded output contains common Node/Vitest/Jest/Playwright summary lines, run output includes compact parsed report counts. `/status` and `orx status` show discovered test target counts, framework counts, and the default target. The model-visible native `run_tests` tool runs the same framework/report-aware adapter inside `ask`/`chat`, so routine model verification can avoid raw shell commands.

Native code-map commands are no-key and local-only. `orx code map [path]`, `orx map [path]`, `orx code-map [path]`, `/map [path]`, and `/code map [path]` scan a bounded local tree, skip generated/vendor directories, and render language counts, key files, package/config/source entrypoints, and top JavaScript/TypeScript source imports/exports with rendered secret redaction. `orx code symbols [query]`, `orx symbols [query]`, `/code symbols [query]`, and `/symbols [query]` reuse that scan to render exported JavaScript/TypeScript symbols with file paths and line numbers. `orx code refs <query>`, `orx refs <query>`, `/code refs <query>`, and `/refs <query>` reuse the same bounds to render JavaScript/TypeScript code-reference matches with path, line, column, language, and redacted excerpts while skipping comments, string literals, and template literals. `orx code imports [query]`, `orx imports [query]`, `/code imports [query]`, and `/imports [query]` reuse the same bounds to render JavaScript/TypeScript import edges across static imports, re-export-from edges, CommonJS `require(...)`, and string-literal dynamic `import(...)`, resolve local relative imports to scanned source files where possible, surface per-file cap omissions, and count external plus unresolved local imports separately. `orx code calls [query]`, `orx calls [query]`, `orx call-graph [query]`, `/code calls [query]`, `/calls [query]`, and `/call-graph [query]` reuse the same bounds to render conservative lexical JavaScript/TypeScript callable definitions and direct local call edges. The call graph is not AST-backed and reports duplicate callee names as ambiguous instead of claiming exact target resolution. `orx code ast-grep <pattern> [path] [--lang <lang>] [--json] [--rewrite <template> [--preview]]`, `orx ast-grep ...`, `/code ast-grep ...`, and `/ast-grep ...` run an installed local `sg` or `ast-grep` binary with shell disabled, cleaned env, cwd-confined path guards, bounded/redacted output, no install/network behavior, and no mutation; rewrite is preview-only because ORX never passes ast-grep update/apply flags. `orx code tree-sitter <file>`, `orx tree-sitter <file>`, `/code tree-sitter <file>`, and `/tree-sitter <file>` run an installed local `tree-sitter parse` with the same no-network/no-mutation boundary, cleaned env, cwd-confined file guard, bounded/redacted output, and lexical fallback guidance.

Native scanner profile commands are no-key and local-only by command selection. `orx scanners list`, `orx scanners inspect <profile>`, `/scanners list`, and `/scanners inspect <profile>` render the scanner catalog without process execution. `orx scanners run semgrep <path> --config <local-config-path> [--json]`, `orx scan semgrep ...`, `/scanners run semgrep ...`, and `/scan semgrep ...` run only an already-installed local `semgrep` binary with shell disabled, `--metrics off`, bounded/redacted output, and a minimal env that excludes ORX/OpenRouter/Brave/API token-like values. Semgrep runs require both the target path and config file to stay under the current working directory, with symlink realpath checks; registry configs such as `auto`, `p/default`, `p/...`, `r/...`, URLs, dash-prefixed operands, control characters, and secret-like arguments are rejected before spawn. `--json` prints redacted Semgrep stdout only on successful runs. `snyk`, `socket`, `osv-scanner`, `codeql`, and `trivy` are catalog/readiness-only profiles in this slice.

Native diagnostics profile commands are no-key and local-only by command selection. `orx diagnostics list`, `orx diagnostics inspect <profile>`, `/diagnostics list`, and `/diagnostics inspect <profile>` render the diagnostics catalog without process execution. `orx diagnostics run typescript [--project <local-tsconfig-path>] [--json]`, `orx diag run typescript ...`, `/diagnostics run typescript ...`, and `/diag run typescript ...` run only an already-installed TypeScript compiler, preferring `cwd/node_modules/.bin/tsc` over `PATH` and using `tsc --noEmit --pretty false --project <tsconfig>`. Project paths must stay under the current working directory, with symlink realpath checks; URLs, registry/package/launcher-like values, dash-prefixed values, control characters, and secret-like values are rejected before spawn. Runs use shell-disabled process execution, bounded/redacted output, and a minimal env that excludes ORX/OpenRouter/Brave/API token-like values. `--json` prints ORX-owned structured metadata with hashes and parsed TypeScript diagnostics. TypeScript Language Server, Pyright, rust-analyzer, gopls, clangd, and SCIP TypeScript are catalog/readiness-only profiles in this slice.

`npm run verify:release` is the local v0.1 release-boundary gate. It clears real operator API/search keys, runs `git diff --check`, `npm run typecheck`, full `npm test`, `npm run verify:global-install`, and built CLI smokes for `doctor --json`, `guide`, `code calls`, `plugins review`, and `mcp presets` against temporary isolated ORX state. It is no-real-key/no-network by command selection: the nested global-install chat-launch smoke uses only a non-secret placeholder key to start chat and immediately run `/exit`, and the gate does not call OpenRouter, remote MCP endpoints, plugin bins, or plugin hooks. Use `npm run pack:dry-run` to inspect package contents without publishing; v0.1 release handoff notes live in `RELEASE_NOTES.md`.

`npm run overnight:init`, `npm run overnight`, and `npm run overnight:dashboard` are local operator commands for unattended implementor/verifier work. Init creates gitignored `.orx/overnight/latest` state, prompts, logs, events, and isolated session/history paths. The dashboard renders a fixed alternate-screen TTY view or one bounded sanitized frame with `--once`, reading only local state. The runner executes implementor -> local checks -> verifier for queued slices, requires final-line `VERDICT: PASS` in the verifier log, then optionally commits only paths newly changed during the verified slice and optionally pushes; `--require-clean` is an opt-in dirty-worktree preflight. By default roles use built ORX via `node dist/cli.js ask --max-tool-iterations 32 <prompt>`, or operators can set `ORX_OVERNIGHT_IMPLEMENTOR_CMD` / `ORX_OVERNIGHT_VERIFIER_CMD` templates using `{promptFile}`, `{runDir}`, `{sliceId}`, and `{role}`.

Delegation CLI commands are no-key and sessionless. `orx orchestrator`, `orx orchestrator plan`, `orx delegate`, `orx delegate plan [saved-team-id]`, `orx delegates`, and `orx delegates plan [saved-team-id]` render delegation status, readiness blockers, saved-team guidance, and policy state. Live-session forms such as `orx orchestrator openrouter <model>`, `orx orchestrator clear`, `orx delegate add <name> openrouter <model>`, `orx delegate remove <name>`, and `orx delegate clear` validate safe names/models and then refuse because noninteractive CLI has no active chat session to mutate. Delegation execution policy can be inspected or tuned with `orx delegates policy` / `orx delegate policy` and `policy set --execution enabled|disabled --max-cost-usd <n> --timeout-ms <ms> --max-result-bytes <bytes> --max-concurrent <n> --credentials none --result-persistence none --result-merge manual_summary|metadata_only`; policy defaults to disabled and setting it does not call OpenRouter or spawn subprocesses by itself. Interactive chat exposes `delegate_task` only when policy execution is enabled and at least one delegate is configured in that chat session. Live calls use the OpenRouter adapter, reject secret-like task/context payloads before network, cap model-requested timeout/result/cost limits to operator policy, default blank delegate names to the sole configured delegate, omit blank optional context/expected-output fields, return wrapped untrusted delegate output with begin/end markers and structured `untrustedOutputPolicy` for `manual_summary`, omit delegate text from model-facing tool output for `metadata_only`, and write hash-only audit metadata to `~/.orx/audit/delegation.jsonl` or `ORX_DELEGATION_AUDIT_PATH`; observed cost is reported from OpenRouter generation metadata when available. Saved disabled teams can be managed with `orx delegates teams`, `orx delegates save <id> --controller <model> [--delegate <name> <model>...]`, `orx delegates inspect <id>`, `orx delegates plan <id>`, `orx delegates use <id>`, `orx delegates delete <id>`, and `orx delegate team ...`; CLI `plan <id>` previews saved-team readiness against current policy without loading it, CLI `use` remains read-only, and `/delegate team use <id>` loads metadata into the active chat. `orx ask` does not expose `delegate_task`.

In chat, `/model <id-or-search>` resolves through the OpenRouter catalog before changing active state. Exact `provider/model` slugs still work, but unknown friendly names such as `/model deepseek v4` are refused with a `/models <query>` suggestion instead of becoming invalid model ids.

Slash help is grouped and filterable: `/help` shows common commands, `/help all` includes advanced commands, and `/help <query>` filters by name, alias, group, usage, or description. Current aliases include `/m` for `/model`, `/s` for `/status`, `/q` for `/quit`, `/h` for `/help`, and `/exit` as a quit alias.

Command discovery also has `/commands [query]`, with `/palette` as an alias. In TTY/color-capable chat this renders a compact command palette; in non-TTY and `NO_COLOR=1` it renders the deterministic grouped plain palette. Interactive readline sessions complete slash command names and aliases with Tab, for example `/sta<Tab>` -> `/status `. They also complete deterministic subcommands/arguments such as `/mode a<Tab>` -> `auto`, `/auth e<Tab>` -> `env`/`env-file`, `/web h<Tab>` -> `help`, `/tests r<Tab>` -> `run`, `/code m<Tab>` -> `map`, `/code s<Tab>` -> `symbols`, `/code i<Tab>` -> `imports`, `/code c<Tab>` -> `calls`, `/code a<Tab>` -> `ast-grep`, `/code t<Tab>` -> `tree-sitter`, `/scanners r<Tab>` -> `run`, `/scan s<Tab>` -> `semgrep`, `/diagnostics r<Tab>` -> `run`, `/diag run typescript --p<Tab>` -> `--project`, and `/mcp inspect o<Tab>` -> `openrouter`.

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
npm run verify:release
```
