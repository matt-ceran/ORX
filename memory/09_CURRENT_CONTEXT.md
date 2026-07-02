# Current Context

Last updated: 2026-07-02

## Fast Phase 12 Handoff

To continue Phase 12 in a fresh session, read:

1. `memory/00_INDEX.md`
2. `memory/01_PROJECT_BRIEF.md`
3. `memory/09_CURRENT_CONTEXT.md`
4. `memory/06_TUI_DESIGN.md`
5. `memory/15_PHASE_12_UX_RECOVERY_HANDOFF.md`

Urgent UX recovery additions from user testing:

- Catalog-backed `/model` resolution is implemented. Unknown friendly names such as `/model deepseek v4` are refused without mutating state; exact provider/model slugs still work.
- The first bottom-oriented TTY composer/status notch pass is implemented.
- TTY-only assistant/tool activity animation is implemented in the bottom status composer; continue polishing richer command discovery and input ergonomics.
- TTY command discovery now has `/commands [query]` / `/palette [query]`, a compact TTY palette, and Tab completion for slash command names and aliases.
- Tab completion now also covers deterministic slash subcommands/arguments for `/mode`, `/fusion`, `/web`, `/mcp`, `/plugins`, `/plugin`, `/bins`, `/hooks`, `/skills`, `/scanners`, `/scan`, `/diagnostics`, `/diag`, `/orchestrator`, `/delegate`, `/resume`, `/help`, and `/commands`.
- Line-based multiline prompt continuation is implemented: a trailing unescaped `\` keeps collecting input, TTY mode shows an `orx …` continuation composer, non-TTY mode shows `...>`, and the collected lines are submitted as one user message.
- The TTY bottom status notch now uses compact route badges for OpenRouter routing shortcuts, rendering `openrouter/auto` as `route auto` and `openrouter/fusion` as `route fusion`. Wide TTY layouts split exact `provider/model` ids into separate provider/model badges, while narrow TTY layouts keep a single compact model badge; full model ids remain unchanged in config, request construction, plain status, and non-TTY output.
- TTY theme controls are implemented through config `theme = "default" | "mono" | "vivid"`, environment overrides `ORX_TTY_THEME`/`ORX_THEME`, and `/theme [default|mono|vivid]`.
- Durable TTY prompt history is implemented through private `~/.orx/history.json`, `ORX_CHAT_HISTORY_PATH`, readline preload, `orx history [search|clear]`, and `/history [search|clear]`; it stores sanitized user prompts only and skips slash commands/secret-like input.
- Saved local profile controls are implemented through `~/.orx/profiles.json`, `ORX_PROFILE_CONFIG_PATH`, `orx profile ...`, global `orx --profile <id>`, and `/profile [list|save <id> [options]|use|inspect|delete]`. `profile save` captures the current config by default and can save inline non-secret overrides for model, mode, Fusion preset, theme, approval policy, and sandbox mode without mutating active config or storing API keys.
- CLI namespace help is implemented for `auth`, `config`, `profile`/`profiles`, `history`, `mcp`, `plugins`/`plugin`, `bins`/`bin`, `hooks`/`hook`, `tests`/`test`, `code`, `scanners`/`scanner`, `scan`, `diagnostics`, `diag`, `orchestrator`, `delegate`, and `delegates`. `orx <namespace> help|--help|-h` exits 0, prints usage on stdout, leaves stderr empty, and runs before config loading so malformed configs cannot block help.
- API-key command flag help is implemented for `ask`, `chat`, `models`, `credits`, and `generation`. `orx <api-command> --help|-h` exits 0 before config/profile loading, while bare prompt/filter values such as `orx ask help` remain normal command input.
- MCP/plugin onboarding subcommand flag help is implemented for exact supported shapes such as `orx mcp plan --help`, `orx mcp add-preset --help`, `orx mcp presets --help`, `orx mcp presets inspect --help`, `orx plugins scaffold --help`, `orx plugins validate --help`, `orx plugins install --help`, `orx plugins register --help`, `orx plugins review --help`, `orx plugins doctor --help`, `orx plugins audit --help`, and `orx plugins catalog --help`. Unsupported nested shapes such as `orx plugins catalog bogus --help` and `orx plugins doctor bogus --help` still fail instead of being promoted to success.
- First-run config initialization is implemented through `orx init`, `orx setup`, and `orx config init`. It creates private no-secret starter config files for user or local scope, leaves existing regular config files unchanged, refuses symlink config paths, and tells users to provide credentials through `OPENROUTER_API_KEY` or deliberate manual editing.
- Core OpenRouter auth ergonomics are implemented through `orx auth`, `orx auth status`, `orx auth setup`, `orx auth env`, `orx auth init`, `orx auth env-file`, and matching `/auth status|setup|env|init|env-file` chat commands. They report API-key readiness without values, print only placeholder exports, create private commented env templates under `~/.orx/auth` or `ORX_AUTH_ENV_DIR`, avoid automatic env-file loading, and refuse auth env-file symlink paths.
- Safe config inspection/editing is available in both CLI and chat through `orx config show|path|set` and `/config [show|path|set]`. It redacts API-key values, refuses API-key/secret-like arguments, honors `ORX_CONFIG_PATH`, writes private config files through the shared guards, updates the active chat snapshot for edited keys, and keeps `orx config path` usable as a sanitized recovery surface when config parsing fails.
- `orx doctor` is the top-level no-network readiness overview. It now starts with concise `overall`, `ready_to_use`, `core_cli`, `chat`, `mcp`, `plugins`, and `delegation` labels before local runtime/MCP/plugin/delegation details and next commands; missing-key next steps point to `orx auth setup` and `orx auth init`; `orx doctor --strict` renders the same report and exits nonzero unless `ready_to_use: yes`, and `orx doctor --json` emits the same readiness data as redacted structured JSON for automation. `orx guide` and `orx quickstart` render a no-network operator path over the same readiness data for chat launch, profiles/themes, local tests/code intelligence, MCP setup, plugin setup, and delegation setup without config/trust/grant/catalog/plugin/delegation/data-content writes; existing loose local state file permissions may still be tightened while reading readiness.
- Plugin registry controls are available both in chat and noninteractive CLI: `orx plugins list|inspect|register|install|enable|disable` and matching `/plugins ...` commands; installed-plugin inspect/enable/disable accept exact `publisher.name@version` ids or unversioned `publisher.name` ids when exactly one installed version matches. Plugin enablement persists only a state marker and does not by itself trust executable surfaces.
- Plugin authoring scaffold is implemented through `orx plugins scaffold <directory>` and `/plugins scaffold <directory>`. It creates a valid local `orx-plugin.json` authoring bundle without registry writes; non-minimal scaffolds include a non-runtime `AUTHORING.md` guide, defaults are inert skills/prompt-commands/rules markdown, `--minimal` writes only the manifest, and `--with` adds opt-in empty placeholders for hooks, bins, MCP, command schemas, assets, and docs behind the existing review gates.
- Plugin manifest validation is implemented through `orx plugins validate <manifest-path-or-directory> [--json]` and `/plugins validate <manifest-path-or-directory> [--json]`. It parses/sanitizes manifests, renders manifest/component hashes, permission counts, missing component warnings, and explicitly leaves registry/cache/trust/runtime state unchanged. JSON output emits ORX-owned read-only validation metadata with explicit unchanged-state authority fields.
- Plugin install/register accepts local manifest paths, local plugin directories containing `orx-plugin.json`, or catalog ids through `orx plugins install|register <manifest-path-or-directory-or-catalog-id>` and matching `/plugins ...` commands. This keeps scaffold -> validate -> install usable with the same directory argument while preserving pinned git catalog installs.
- Plugin install/register now snapshots sanitized manifests plus declared components and declared hook cwd directories into ORX-owned plugin cache storage before registry persistence; enabled skill/hook discovery resolves from the cached manifest path, not the original source checkout.
- Plugin catalog support now handles both local manifest entries and pinned git source entries from `~/.orx/plugins/catalog.json` or `ORX_PLUGIN_CATALOG_PATH`. `orx plugins install <catalog-id>` and `/plugins install <catalog-id>` clone git catalog sources into private temporary cache storage, checkout the exact pinned commit, normalize cached manifest provenance to that pin, and still register the plugin disabled/inert.
- Local plugin catalog inspect/editor/update-check/apply commands are implemented through `orx plugins catalog inspect|updates|update|add-local|add-git|remove` and `/plugins catalog inspect|updates|update|add-local|add-git|remove`. They review local declarations, compare installed registry provenance against local catalog pins, apply explicit pinned git catalog updates when available, or edit local catalog declarations while preserving enable/trust/grant/fetch/execution as separate explicit steps.
- Plugin review/doctor/audit is implemented through `orx plugins review [--json]` and `/plugins review [--json]`, with `doctor` and `audit` aliases. It summarizes installed/enabled state, local catalog pin drift, bin/hook trust, plugin MCP profiles, command aliases, omissions, and concrete next commands without network calls, execution, state mutation, or chmod side effects. JSON output emits ORX-owned read-only review metadata with explicit no-side-effect authority fields. The CLI aliases reject unsupported trailing operands; exact `--help`/`-h` prints usage before config/profile loading.
- Local user MCP profile catalogs are implemented through `~/.orx/mcp/profile-catalog.json` or `ORX_MCP_PROFILE_CATALOG_PATH`. Declarations are namespaced as `user:<profile-id>`, currently support sanitized `remote-http` transports, appear in `/mcp`, `orx mcp`, `/status`, interactive chat, and `orx ask --mcp-tools`, and share the same enable/trusted-hash/schema-change/tool-grant/model-grant/auth/audit gates as built-in and plugin MCP profiles.
- Local user MCP catalog management commands are implemented through `orx mcp catalog [--json]|add-profile|remove-profile|add-tool|remove-tool` and matching `/mcp ...` slash commands. The catalog view can emit ORX-owned structured JSON for local automation without install/enable/trust/grant/fetch/call/audit/model-exposure/catalog-write side effects. Edit commands write private local catalog files, preserve existing array/object/legacy `servers` declarations during edits, and avoid manual JSON editing for common remote MCP setup.
- Built-in MCP provider presets are implemented through `orx mcp presets [--json]`, `orx mcp presets inspect <preset> [--json]`, `orx mcp add-preset <preset>`, `/mcp presets [--json]`, `/mcp presets inspect <preset> [--json]`, and `/mcp add-preset <preset>`. Templates now include `context7`, `deepwiki`, `microsoft-learn`, `github-readonly`, `github-write`, `gitlab-readonly`, `gitlab-ci-write`, `sourcegraph-github-readonly`, `sentry-readonly`, `figma`, `browser`, `cloudflare-docs`, and `cloudflare-api`. Preset list/inspect JSON emits ORX-owned structured declaration metadata only, with no install, enable, trust, grant, fetch, call, audit, model exposure, or catalog-write side effects; install flows still create disabled local user profiles only and leave enablement, trust, grants, calls, and model exposure as separate explicit steps.
- Read-only MCP setup planning is implemented through `orx mcp plan [preset-or-profile] [--json]`, `orx mcp setup-plan [preset-or-profile] [--json]`, `/mcp plan [preset-or-profile] [--json]`, and `/mcp setup-plan [preset-or-profile] [--json]`. It accepts provider preset ids or installed MCP profile ids, reports whether the next step is preset install, enable/trust, auth setup, remote tool review/import, operator grants, or read-only model grants, and emits ORX-owned structured JSON plan metadata when requested. It performs no install/enable/trust/grant/fetch/call/model-exposure side effects; existing loose MCP state file permissions may still be tightened while local state is read.
- MCP setup planner JSON verification passed with `npm run typecheck`, `npm run build`, focused source and compiled MCP/CLI/slash tests, built CLI smokes for preset/overview/rejected-order/redacted-unknown JSON, `git diff --check`, full `npm run verify:release` with a temporary `HOME`, and independent verifier `019f204b-312f-76e0-a636-626337d6b56c`.
- Local user MCP catalog JSON output is implemented through `orx mcp catalog --json`, `orx mcp user-catalog --json`, `/mcp catalog --json`, and `/mcp user-catalog --json`. It reports schema version, surface, local path/existence, profile/tool/source metadata, omissions/truncation, and explicit authority fields while making no network calls and no state writes. Verification passed with `npm run typecheck`, focused source MCP/CLI/slash tests with 221 tests, `npm run build`, focused compiled MCP/CLI/slash tests with 221 tests, built CLI smokes for empty/populated/alias/invalid catalog JSON, `git diff --check`, and full `npm run verify:release` with a temporary `HOME`. Independent verifier `019f205b-06e6-7290-8b36-8f3687793740` found no blocking issues and confirmed read-only JSON behavior plus alias coverage.
- Next likely task is another small no-network structured-output or onboarding-polish slice; keep using bounded implementor/verifier loops and commit/push each verified step before starting the next one.
- Reviewed remote MCP tool import is implemented through `orx mcp import-remote-tools <profile>` and `/mcp import-remote-tools <profile>`. It is limited to local `user:` catalog profiles, uses the existing enabled/trusted/unchanged guarded `tools/list` path, stores sanitized read-only non-billable declarations only, skips unsupported names, audits hashes only, and leaves newly changed profiles behind the pending schema-change retrust gate.
- MCP auth readiness inspection is implemented through `orx mcp auth <profile>` and `/mcp auth <profile>`. It shows profile-specific and fallback bearer env names, managed env-file path, set/unset status, effective readiness, profile hashes, provider-specific credential guidance for recognized exact MCP endpoints including Sourcegraph and GitLab, and OAuth limitations without network calls or secret persistence.
- MCP auth setup guidance is implemented through `orx mcp auth setup <profile>`, `orx mcp auth env <profile>`, `/mcp auth setup <profile>`, and `/mcp auth env <profile>`. It prints copyable placeholder exports only for auth-required profiles, shows no-auth profiles as not requiring setup with `credential_mode`, `effective_bearer`, and Keychain status all rendered as `not_required`, renders provider-specific setup URLs/scope hints only after exact HTTPS host/path matching, never displays token values, and performs no network calls, subprocess calls, or config writes beyond normal redacted audit metadata.
- MCP managed auth env-file templates are implemented through `orx mcp auth init <profile>`, `orx mcp auth env-file <profile>`, `/mcp auth init <profile>`, and `/mcp auth env-file <profile>`. They create commented shell templates under `~/.orx/mcp/auth-env` or `ORX_MCP_AUTH_ENV_DIR`, use private modes, skip no-auth profiles, avoid overwriting existing files, and refuse symlink parent paths.
- MCP macOS Keychain bearer support is implemented through `orx mcp auth keychain [status|set|delete] <profile>` and `/mcp auth keychain ...`. It uses `/usr/bin/security`, prompts for `set`, never prints token values, records only redacted audit metadata, and MCP calls read Keychain only after explicit `ORX_MCP_KEYCHAIN=1` opt-in.
- GitHub write-capable MCP planning is implemented as built-in provider preset `github-write` (`https://api.githubcopilot.com/mcp/`). It is auth-required, high-risk, write-capable=yes, declares no static tools before reviewed remote metadata, surfaces GitHub-specific high-risk/write-scope guidance, and remains behind the existing enable/trust/auth/remote-tool review/manual tool declaration/operator-grant/model-grant gates with no network calls during list/inspect/plan.
- GitHub write-capable preset verification passed focused MCP/CLI/slash tests with 221 tests, `npm run typecheck`, `npm run build`, `git diff --check`, full `npm test` with 547 tests, and `npm run verify:release`. Independent verifier `019f1fb6-3c9b-7372-a2ca-1aded9e7f175` found stale current-context wording that still described GitHub write profiles as future work; those memory references now point to reviewed GitHub/Sourcegraph tool declaration packs after remote metadata inspection.
- Sourcegraph GitHub read-only MCP planning is implemented as built-in provider preset `sourcegraph-github-readonly` (`https://sourcegraph.com/mcp`). It is auth-required, medium-risk, write-capable=no, declares no static tools before reviewed remote metadata, surfaces Sourcegraph-specific auth guidance, and remains behind the existing enable/trust/auth/remote-tool review/operator-grant/read-only model-grant gates with no network calls during list/inspect/plan.
- GitLab read-only MCP planning is implemented as built-in provider preset `gitlab-readonly` (`https://gitlab.com/api/v4/mcp`). It is auth-required, medium-risk, write-capable=no, declares no static tools before reviewed remote metadata, surfaces GitLab-specific beta/OAuth/read-only-scope guidance for the exact GitLab.com endpoint, and remains behind the existing enable/trust/auth/remote-tool review/operator-grant/read-only model-grant gates with no network calls during list/inspect/plan.
- GitLab CI write-capable MCP planning is implemented as built-in provider preset `gitlab-ci-write` (`https://gitlab.com/api/v4/mcp`). It is auth-required, high-risk, write-capable=yes, declares GitLab's beta `manage_pipeline` tool as destructive, surfaces GitLab-specific high-risk CI/write-scope guidance, and remains behind the existing disabled-profile install, enable/trust/auth/operator-grant gates with no network calls during list/inspect/plan.
- GitLab CI write-capable preset verification passed focused MCP/CLI/slash tests with 221 tests, `npm run typecheck`, `npm run build`, built CLI smokes for inspect/plan/add-preset/auth setup, `git diff --check`, full `npm test` with 547 tests, `npm run verify:release`, and independent verifier `019f2004-b6da-7de1-9c0e-db65db77bb0c` with no findings.
- GitLab read-only preset verification passed focused MCP/CLI/slash tests with 221 tests, `npm run typecheck`, `npm run build`, `git diff --check`, full `npm test` with 547 tests, and `npm run verify:release`. Independent verifier found an exact-path auth-guidance gap for same-host subpaths; GitLab guidance now requires the exact `/api/v4/mcp` path and has a regression test.
- Enabled plugin markdown prompt commands are discoverable through `/prompts list` and compact model metadata. Full prompt markdown is loaded only by explicit `/prompts activate <id>` or the derived `/plugin:<plugin-id>:command:<slug>` alias as untrusted context. Manifest-defined executable command schemas are discoverable through `components.commandSchemas` and exposed as `/plugin:<plugin-id>:exec:<slug>` aliases that can only run referenced trusted current bins.
- Enabled plugin markdown rules are discoverable through `/rules list` and compact model metadata. Full rule markdown is loaded only by explicit `/rules activate <id>` as untrusted context; rules are advisory and cannot change permissions or activate executable surfaces.
- Plugin manifests support optional inert `metadata` for homepage, documentation, license, trust tier, auth, privacy, and runtime requirements. `/plugins inspect` renders sanitized metadata as risk/requirements context only.
- Enabled plugin `components.mcpServers` JSON can contribute MCP preset profiles. They appear as `plugin:<plugin-id>:<server-id>` in `/mcp list`, `/mcp inspect`, `/mcp tools`, `/mcp call`, `/mcp remote-tools`, `/mcp enable`, `/mcp discover`, and `/status`; trusted unchanged `remote-http` plugin profiles can be discovered, list remote tool metadata, run explicit operator `tools/call`, and optionally expose model-granted read-only non-billable tools through session-local `/mcp model enable`.
- MCP tool grants are implemented: `/mcp allow-tool`, `/mcp revoke-tool`, and `orx mcp allow-tool|revoke-tool` persist per-tool grants for billable/write/destructive declared tools only on enabled/trusted/unchanged profiles. Grants bind to the current trusted profile hash; stale grants are visible and denied before explicit calls can reach the network.
- Explicit MCP `tools/call` is implemented for operator commands: `/mcp call <profile> <tool> [json]` and `orx mcp call <profile> <tool> [json]` require enabled/trusted/unchanged profiles, allowed declared-tool policy, env bearer auth or explicit `ORX_MCP_KEYCHAIN=1` macOS Keychain opt-in for auth-bearing tools, guarded DNS-vetted transport, redacted/truncated untrusted output with operator-visible begin/end untrusted markers, and audit logs without raw arguments/output. Remote `tools/list` metadata descriptions are also rendered inside begin/end untrusted metadata markers.
- Model MCP exposure is implemented through `/mcp model enable|disable|status` for interactive chat and `orx ask --mcp-tools` for one-shot requests. ORX adds a single native model tool `mcp_call`, limited to read-only non-billable declared MCP tools with active `/mcp allow-model-tool` / `orx mcp allow-model-tool` grants; broad/billable/write/destructive model-loop MCP exposure remains inactive.
- Enabled plugin `components.hooks` JSON can contribute hook definitions. They appear as `plugin:<plugin-id>:<hook-id>` in `orx hooks`, `/hooks`, and `/status`; trusted hook hashes persist outside repos, changed hashes show pending trust, and trusted current hashes can run manually through `hooks run` / `/hooks run` or automatically on matching lifecycle events with minimal env/cwd and JSONL audit logging.
- Enabled plugin `components.bins` directories can contribute explicit operator-run bins. Regular cached bin files appear as `plugin:<plugin-id>:bin:<file>` in `orx bins`, `/bins`, and `/status`; trusted bin hashes persist outside repos, changed hashes show pending trust, and trusted current hashes can run only through explicit `bins run` / `/bins run` with cached-plugin cwd, manifest-declared env, redacted/truncated output, and JSONL audit logs without raw argument lists.
- Enabled plugin prompt commands and bins now produce namespaced aliases visible through `/plugin list`, `orx plugins commands`, and `/status`. `/plugin:<plugin-id>:command:<slug>` activates the matching prompt as untrusted context; `/plugin:<plugin-id>:bin:<file> [args...]` runs the matching bin through the same trusted-hash gates as `/bins run`.
- Native test target commands are implemented through `orx tests list|run`, `/tests list|run`, `/test`, package `test*` script discovery, direct Node test/spec fallback, framework/reporter metadata including AVA package-script inference, direct Node JUnit parsing, private temporary Jest/Vitest/Playwright JSON report files for package scripts that already declare append-safe JSON reporters or exact final default framework runner invocations, changed cwd-confined JSON report files already declared by package scripts, per-run args, or fixed local framework config files for exact final direct runner scripts, whole-object framework JSON stdout/stderr parsing, captured TAP reporter output parsing, captured Mocha-style summary parsing, captured pytest-style summary parsing, captured Cargo/Rust summary parsing, captured cargo-nextest summary parsing, captured AVA summary parsing for AVA-inferred targets, captured Cucumber scenario summary parsing, captured Behat full summary footer parsing, captured Behave summary footer parsing, captured testthat bracket summary parsing, captured GoogleTest summary parsing, captured Catch2 summary parsing, captured Dart compact final-line parsing, captured Deno-style summary parsing, captured ExUnit summary parsing, captured Gradle-style summary parsing, captured JUnit Platform console summary parsing, captured ScalaTest summary parsing, captured TestNG summary parsing, captured NUnit summary parsing, captured Robot Framework summary parsing, captured Jasmine summary parsing, captured Go test verbose and `go test -json` summary parsing, captured Cypress run-summary parsing, captured RSpec summary parsing, captured Minitest summary parsing, captured Karma-style summary parsing, captured Bun-style summary parsing, captured Tasty console summary parsing, captured Zig native summary parsing, captured Python unittest summary parsing, captured JUnit/Surefire-style text summary parsing, captured whole JUnit XML report parsing, captured whole TestNG XML report parsing, captured whole NUnit XML report parsing, captured whole xUnit XML report parsing, captured whole TRX XML report parsing, captured whole Robot Framework XML report parsing, captured whole CTest XML report parsing, captured TeamCity service-message parsing, captured Pest summary parsing, captured PHPUnit-style text summary parsing, captured `.NET test`/xUnit summary parsing, captured CTest summary parsing, captured Meson summary parsing, captured Unity summary footer parsing, captured LLVM lit summary parsing, captured Bazel aggregate summary parsing, captured XCTest summary parsing, compact summary-line parsing, bounded shell-disabled execution, and status counts. Wrapper commands, additional non-JSON/custom reporters, config-only outputs for non-direct scripts, and unsafe multi-step package-script shapes stay on stdout/stderr fallback. The same adapter is exposed to the model loop through the native `run_tests` tool.
- Test run JSON output is implemented through `orx tests run [target-id] --json` and `/tests run [target-id] --json`. It emits ORX-owned structured run metadata after the explicit operator test execution, including status, target, command, process, parsed report counts, and bounded redacted stdout/stderr hashes; `--json` after `--` remains a test-runner argument.
- Behat full English summary footers are also parsed when a scenario counter, step counter, and timer/memory line are all present; this avoids reclassifying ordinary Cucumber-style scenario summaries.
- Dependency-free local code maps, symbol indexes, reference indexes, import graphs, call graphs, optional ast-grep syntax-aware search/codemod previews, and optional tree-sitter parse/outline/repo-outline/repo-symbols/import/ref/repo-ref/call/repo-call/repo-import/repo-dep previews are implemented through `orx code map`, `orx map`, `orx code-map`, `orx code symbols`, `orx symbols`, `orx code refs`, `orx refs`, `orx code imports`, `orx imports`, `orx code calls`, `orx calls`, `orx call-graph`, `orx code ast-grep`, `orx ast-grep`, `orx code tree-sitter`, `orx code outline`, `orx tree-sitter`, `orx outline`, `/map`, `/code map`, `/code symbols`, `/symbols`, `/code refs`, `/refs`, `/code imports`, `/imports`, `/code calls`, `/calls`, `/call-graph`, `/code ast-grep`, `/ast-grep`, `/code tree-sitter`, `/code outline`, `/tree-sitter`, and `/outline`; output is local-only/no-key and includes bounded language, key-file, entrypoint, JavaScript/TypeScript import/export, exported-symbol, code-reference, local import-edge summaries, conservative lexical call-edge summaries, shell-disabled ast-grep output when `sg` or `ast-grep` is installed, and shell-disabled tree-sitter raw parse, definition-like outline, bounded repo AST definition-like outline/symbol previews, single-file AST import-like sources, exact single-file AST identifier refs, bounded repo AST identifier refs, single-file AST call-edge output, bounded repo AST call-expression previews, bounded repo AST import-source previews, or bounded local-relative plus safe root tsconfig/jsconfig path/baseUrl repo dependency previews when `tree-sitter` plus grammars are installed.
- Dependency-free code-map, symbol, ref, import, and call graph commands now support `--json` on CLI and slash aliases. The flag only changes output format for the same bounded local scans; `--json` after `--` stays part of the query/path.
- Optional tree-sitter parse/outline/import/ref/call/repo-file/repo-outline/repo-symbol/repo-ref/repo-call/repo-import/repo-dep commands now support `--json` on CLI and slash aliases. The flag only changes output format for the same bounded local result; `repo-files --json` remains a filesystem inventory and does not invoke `tree-sitter`.
- Tree-sitter repo file inventory is implemented through `orx code tree-sitter repo-files [path]`, `orx tree-sitter repo-files [path]`, `/code tree-sitter repo-files [path]`, and `/tree-sitter repo-files [path]`. It reuses the bounded cwd-confined source-file discovery and omission reporting used by repo tree-sitter modes, does not invoke `tree-sitter parse`, does not require `tree-sitter` on PATH, and makes no parsing or semantic-analysis claims.
- Local security scanner profiles are implemented through `orx scanners list|status [--json]`, `orx scanners inspect|show <profile> [--json]`, `orx scanners run <semgrep|trivy|codeql> <path> [--config <local-config-path>] [--query <local-query-or-suite>] [--json]`, `orx scan <semgrep|trivy|codeql> ...`, `/scanners ...`, and `/scan ...`; list/status and inspect/show readiness surfaces can emit ORX-owned structured JSON without process execution. Semgrep is runnable only as an explicit operator command with an installed local binary plus cwd-confined local config, shell disabled, minimal env, bounded/redacted output, and no model-tool exposure. Trivy is runnable only as an explicit operator command with an installed local binary, cwd-confined regular-file-or-directory target, rejected `--config`, shell disabled, minimal env, bounded/redacted output, no model-tool exposure, and filesystem secret scanning only through offline/update-skip/no-telemetry flags. CodeQL is runnable only as an explicit operator command with an installed local `codeql`, existing cwd-confined database directory, cwd-confined local query/suite path via `--query`, shell disabled, minimal env, bounded/redacted output, temp SARIF output, `--no-download`, no database creation, no remote pack resolution, no `--config`, and no model-tool exposure. Snyk/Socket/OSV-Scanner remain catalog-only readiness profiles.
- Local diagnostics profiles are implemented through `orx diagnostics list|status [--json]`, `orx diagnostics inspect|show <profile> [--json]`, `orx diagnostics run <typescript|pyright|eslint|ruff|mypy|gopls|clangd> [--project <local-project-path>] [--json]`, `orx diag ...`, `/diagnostics ...`, and `/diag ...`; list/status and inspect/show readiness surfaces can emit ORX-owned structured JSON without process execution. TypeScript, Pyright, ESLint, Ruff, Mypy, gopls, and clangd are runnable only as explicit operator commands with installed local, virtualenv, or PATH binaries as applicable, cwd-confined local project targets, shell disabled, minimal env, bounded/redacted output, parsed TypeScript text diagnostics, Pyright `generalDiagnostics`, ESLint JSON `messages`, Ruff JSON diagnostics, Mypy text diagnostics, `gopls check` text diagnostics, or `clangd --check` stderr diagnostics, ORX-owned JSON metadata, and no model-tool exposure. ESLint runs default to `.`, use `eslint --format json <file-or-directory>`, and accept cwd-confined regular file or directory targets. Ruff runs default to `.`, use `ruff check --output-format json --no-cache <file-or-directory>`, prefer local `node_modules/.bin/ruff`, then cwd `.venv/bin/ruff` or `venv/bin/ruff`, then PATH `ruff`, and accept cwd-confined regular file or directory targets. Mypy runs default to `.`, use `mypy --no-color-output --no-error-summary --show-column-numbers --no-incremental --cache-dir <null-device> <file-or-directory>`, prefer local `node_modules/.bin/mypy`, then cwd `.venv/bin/mypy` or `venv/bin/mypy`, then PATH `mypy`, accept cwd-confined regular file or directory targets, and avoid `.mypy_cache` writes by command selection. gopls runs require `--project <local-go-file>`, probe PATH with `gopls version`, pin `GOPROXY=off`, `GOSUMDB=off`, and `GOTOOLCHAIN=local`, and reject directory/default targets. clangd runs require `--project <local-c-cpp-source-or-header-file>`, probe PATH with `clangd --version`, run `clangd --log=error --check=<file>`, and reject directories/default targets/non-C/C++/Objective-C file extensions. TypeScript Language Server/rust-analyzer/SCIP TypeScript are catalog-only readiness profiles.
- Scanner and diagnostics help/docs parity is current: namespace usage, focused missing-profile usage, slash help, README examples, and command reference all advertise the already-implemented readiness aliases `status` and `show`; this did not change scanner or diagnostics run behavior.
- `npm run verify:release` is implemented as the v0.1 release-boundary gate. It clears real operator API/search keys, runs whitespace/typecheck/test/global-install checks, then runs isolated built CLI no-network smokes for doctor JSON, guide, code calls, plugin review, and MCP presets without OpenRouter, remote MCP, plugin bin, or plugin hook calls. The nested global-install chat-launch smoke uses only a non-secret placeholder key to start chat and immediately run `/exit`.
- Delegation readiness rendering is implemented through noninteractive `orx orchestrator`, `orx delegate`, `orx delegates`, and read-only slash `plan/status` variants. CLI status/readiness is session-less and no-key; mutating CLI forms validate arguments then refuse, while slash mutations remain session-local only. OpenRouter delegate execution now exists behind explicit policy enablement and interactive chat delegate state; subprocess/external-agent delegation remains unavailable.
- Saved disabled delegation teams are implemented through private local `~/.orx/delegation/teams.json` storage with `ORX_DELEGATION_TEAMS_PATH`, plus `orx delegates teams|save|inspect|use|delete`, `/delegates teams|save|inspect|use|delete`, and `/delegate team ...`. Saved records contain only normalized disabled controller/delegates plus metadata; CLI `use` is read-only because there is no active chat session, while slash `use` loads disabled metadata into the current session.
- Delegation execution policy storage is implemented through private local `~/.orx/delegation/policy.json` storage with `ORX_DELEGATION_POLICY_PATH`, plus `orx delegate policy`, `orx delegates policy`, `/delegate policy`, and `/delegates policy`. Policy can tune max task cost, timeout, result byte cap, max concurrent delegates, explicit `--execution enabled|disabled`, and `--result-merge manual_summary|metadata_only`; credential forwarding/result persistence remain fixed to `none`/`none`.
- The internal `delegate_task` runtime contract and OpenRouter delegate adapter are implemented and real-key dogfooded. Normal `ask` does not expose it; interactive chat exposes the schema only when policy execution is enabled and at least one delegate is configured. Live calls use env/provided OpenRouter API credentials, reject secret-like task/context payloads before network, return untrusted wrapped delegate output with structured `untrustedOutputPolicy`, and write hash-only audit metadata to `~/.orx/audit/delegation.jsonl` or `ORX_DELEGATION_AUDIT_PATH`. If exactly one delegate is configured, omitted or blank model-supplied delegate names select it; blank optional context/expected-output fields are omitted; model-requested timeout/result/cost limits above policy are capped to the operator policy.
- `orx` with no args now launches interactive chat from the current directory. Help remains available through `orx help`/`--help`.
- Slash commands now have grouped common help, `/help all`, `/help <query>`, aliases, and a pure command-palette listing surface.

Then retrieve supporting shards from the index as needed.

## Current State

The ORX project has been created locally and on GitHub.

Local path:

```text
/Users/draingang/Documents/ORX
```

GitHub repository:

```text
https://github.com/matt-ceran/ORX
```

Current files:

- `README.md`
- `IMPLEMENTATION_PLAN.md`
- `.gitignore`
- `AGENTS.md`
- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `src/`
- `memory/`

## Latest Work

Added operator-visible remote MCP trust boundaries:

- Added shared MCP authority-boundary wording for remote MCP metadata and remote MCP tool output, covering tool use, permission changes, MCP/profile/plugin enablement, hooks, bins, command execution, policy changes, and instruction priority changes.
- `orx mcp remote-tools` and `/mcp remote-tools` still only call guarded `tools/list`, but remote tool descriptions now render inside `BEGIN_UNTRUSTED_MCP_METADATA` / `END_UNTRUSTED_MCP_METADATA` blocks and the terminal summary explicitly says remote metadata is untrusted data only.
- `orx mcp call` and `/mcp call` still require enabled/trusted/unchanged profiles, auth, grants, guarded transport, redaction, truncation, and audit logging, but text content summaries now render inside `BEGIN_UNTRUSTED_MCP_OUTPUT` / `END_UNTRUSTED_MCP_OUTPUT` blocks with an explicit data-only policy. Model exposure remains `not exposed to the model loop`.
- Verification passed: focused source `node --import tsx --test src/mcp/mcp.test.ts`, isolated-home focused source `node --import tsx --test src/slash/index.test.ts src/cli.test.ts`, `npm run typecheck`, `npm run build`, isolated-home full `npm test` with 548 tests, `git diff --check`, isolated-home `npm run verify:release` with all 12 steps passing, and independent verifier `019f2094-5bb5-72d3-9519-7ec75e5f51ad` with no findings.
- Next likely work remains another bounded optional completion slice such as semantic tree-sitter/LSP/SCIP depth, provider preset/tool declaration packs after current docs/metadata review, scanner adapters after deterministic no-network/no-auth shapes are proven, or future crawl/scholar/RAG research profiles with the same untrusted-output policy.

Previous latest work:

Added MCP provider preset JSON output:

- Added `--json` to provider preset list/inspect surfaces: `orx mcp presets --json`, `orx mcp presets inspect <preset> --json`, shorthand `orx mcp presets <preset> --json`, `/mcp presets --json`, and `/mcp presets inspect <preset> --json`.
- JSON output is ORX-owned declaration metadata with explicit `execution: none`, `network: none`, `data_state_writes: none`, `model_tool: none`, preset static-tool metadata, and install/authority fields. It does not install, enable, trust, grant, fetch, call, audit, expose model tools, or write catalog state.
- Parser behavior keeps text forms unchanged, accepts `--json` only on preset list/inspect forms, and rejects `mcp presets inspect --json` as usage rather than treating `--json` as a preset id.
- Slash completion now includes the `deepwiki` preset plus `--json` in relevant preset list/inspect positions.
- README and command memory document preset JSON examples and the no-side-effect boundary.
- Verification passed: focused source `node --import tsx --test src/mcp/mcp.test.ts src/cli.test.ts src/slash/index.test.ts` with 221 tests, `npm run typecheck`, `npm run build`, compiled MCP/CLI/slash tests with 221 tests, built CLI JSON smokes for `mcp presets --json`, `mcp presets inspect deepwiki --json`, and `mcp presets inspect --json` usage rejection, `git diff --check`, full `npm test` with 547 tests, and `npm run verify:release`. Independent verifier `019f2038-012d-7281-be09-eab7845497e1` first found only a memory-completeness gap after behavioral checks passed; current context, backlog, and integration handoff were updated with the no-side-effect JSON boundary, and the verifier rechecked PASS.
- Next likely work after this slice remains another bounded optional completion slice such as semantic tree-sitter refs/calls/dependency depth, LSP/SCIP diagnostics/references, wrapper-safe report integration, reviewed GitHub/Sourcegraph tool declaration packs, or scanner adapters/additional Trivy modes only after deterministic no-network/no-auth local command shapes are proven.

Earlier latest work:

Added DeepWiki MCP provider preset:

- Added built-in provider preset `deepwiki` for DeepWiki's official no-auth streamable HTTP endpoint `https://mcp.deepwiki.com/mcp`, with static read-only non-billable tools `ask_question`, `read_wiki_contents`, and `read_wiki_structure`.
- Install/inspect/plan behavior matches existing provider presets: `orx mcp presets inspect deepwiki`, `orx mcp plan deepwiki`, `orx mcp add-preset deepwiki`, and `/mcp add-preset deepwiki` only create a disabled local `user:deepwiki` catalog profile; enablement, trust, operator grants, model grants, discovery, remote tool listing, and calls remain separate explicit steps. Model exposure still requires explicit read-only model grants.
- Auth guidance now recognizes the exact `mcp.deepwiki.com/mcp` endpoint as no-auth for public repositories, rendering `auth_status: not_required`, provider setup URL `https://docs.devin.ai/work-with-devin/deepwiki-mcp`, and no bearer-token next step.
- README, command memory, backlog, and integration handoff document the DeepWiki preset and mark DeepWiki as implemented in the docs/retrieval provider list.
- Verification passed: official DeepWiki docs were rechecked; focused MCP regression `node --import tsx --test src/mcp/mcp.test.ts` with 73 tests, focused source `node --import tsx --test src/mcp/mcp.test.ts src/cli.test.ts src/slash/index.test.ts` with 221 tests, `npm run typecheck`, `npm run build`, compiled MCP/CLI/slash tests with 221 tests, built CLI smokes for `mcp presets inspect deepwiki`, `mcp plan deepwiki`, temp-catalog `mcp add-preset deepwiki`, and `mcp auth user:deepwiki`, `git diff --check`, full `npm test` with 547 tests, and `npm run verify:release`. Independent verifier `019f2027-b9f0-7252-bb5a-300f33112984` initially found DeepWiki auth guidance was using a prefix endpoint match; the final patch uses exact `/mcp` endpoint matching and adds a `/mcp/not-exact` generic-guidance regression, then the verifier rechecked PASS.
- Next likely work after this slice remains another bounded optional completion slice such as semantic tree-sitter refs/calls/dependency depth, LSP/SCIP diagnostics/references, wrapper-safe report integration, reviewed GitHub/Sourcegraph tool declaration packs, or scanner adapters/additional Trivy modes only after deterministic no-network/no-auth local command shapes are proven.

Earlier latest work:

Added tree-sitter JSON output:

- Added `--json` to optional tree-sitter CLI and slash surfaces: `orx code tree-sitter ...`, `orx tree-sitter ...`, `orx code outline <file>`, `orx outline <file>`, `/code tree-sitter ...`, `/tree-sitter ...`, `/code outline <file>`, and `/outline <file>`.
- JSON output serializes ORX-owned structured metadata for the same bounded tree-sitter result objects, including explicit operator-only/no-model-tool/no-network/no-mutation/shell-disabled labels, process/truncation metadata, mode-specific counts, warnings, omissions, and AST/repo payloads. `repo-files --json` remains local filesystem inventory only and does not spawn or require the `tree-sitter` binary.
- Verification passed: focused source `node --import tsx --test src/code-map/code-map.test.ts src/cli.test.ts src/slash/index.test.ts` with 171 tests, `npm run typecheck`, `npm run build`, `git diff --check`, built CLI smokes for `code tree-sitter repo-files src --json` and `outline src/cli.ts --json` with a temporary fake `tree-sitter`, full `npm test` with 547 tests, `npm run verify:release`, and independent read-only verifier `019f1ff8-cb6f-7133-9937-21c14e16ef84` with no findings.
- Next likely work after this slice remains another bounded optional completion slice such as semantic tree-sitter refs/calls/dependency depth, LSP/SCIP diagnostics/references, wrapper-safe report integration, reviewed GitHub/Sourcegraph tool declaration packs, or scanner adapters/additional Trivy modes only after deterministic no-network/no-auth local command shapes are proven.

Earlier latest work:

Added dependency-free code-intelligence JSON output:

- Added `--json` to `orx code map`, `orx map`, `orx code-map`, `orx code symbols`, `orx symbols`, `orx code refs`, `orx refs`, `orx code imports`, `orx imports`, `orx code calls`, `orx calls`, `orx call-graph`, and matching `/map`, `/code ...`, `/symbols`, `/refs`, `/imports`, `/calls`, and `/call-graph` forms.
- JSON output is ORX-owned structured metadata over the same bounded local no-key scans as the text renderers; it labels map/symbol/ref/import/call surfaces, preserves local-only/no-network/no-model-tool boundaries, keeps call graph marked lexical/not AST-backed/not semantic, and treats `--json` after `--` as part of the query or path.
- Verification passed: focused source `node --import tsx --test src/code-map/code-map.test.ts src/cli.test.ts src/slash/index.test.ts` with 171 tests, `npm run typecheck`, `npm run build`, `git diff --check`, built CLI smokes for all code-intelligence JSON surfaces plus `refs -- --json` passthrough, full `npm test` with 547 tests, `npm run verify:release`, and independent read-only verifier `019f1fec-a051-7bc2-8f7f-af4e88b0c9ac` with no findings.
- Next likely work after this slice remains another bounded optional completion slice such as semantic tree-sitter refs/calls/dependency depth, LSP/SCIP diagnostics/references, wrapper-safe report integration, reviewed GitHub/Sourcegraph tool declaration packs, or scanner adapters/additional Trivy modes only after deterministic no-network/no-auth local command shapes are proven.

Earlier latest work:

Added test run JSON output:

- Added `--json` to `orx tests run [target-id]` and `/tests run [target-id]`, producing `orx.test_run` metadata with explicit operator-only/model-tool boundary labels, target metadata, shell-disabled command details, process state, parsed report counts, and bounded redacted stdout/stderr text plus hashes.
- The shared parser treats `--json` only before `--` as an ORX output flag; `--json` after `--` is passed through to the test runner, unknown run options fail with usage, and slash completion now suggests `--json` for `/tests run --`.
- Verification passed: focused source `node --import tsx --test src/testing/test-adapters.test.ts src/cli.test.ts src/slash/index.test.ts` with 169 tests, `npm run typecheck`, `npm run build`, `git diff --check`, built CLI smokes for `tests run --json`, passthrough `--json` after `--`, and unknown run-option rejection, full `npm test` with 547 tests, `npm run verify:release`, and independent read-only verifier `019f1fdd-8303-71c1-b1f5-69ac5836ca6b` with no findings.
- Next likely work after this slice remains another bounded optional completion slice such as semantic tree-sitter refs/calls/dependency depth, LSP/SCIP diagnostics/references, wrapper-safe report integration, reviewed GitHub/Sourcegraph tool declaration packs, or scanner adapters/additional Trivy modes only after deterministic no-network/no-auth local command shapes are proven.

Earlier latest work:

Added tree-sitter repo file inventory:

- Added `repo-files` mode to the optional local tree-sitter adapter. `orx code tree-sitter repo-files [path]`, `orx tree-sitter repo-files [path]`, `/code tree-sitter repo-files [path]`, and `/tree-sitter repo-files [path]` report the exact bounded source-file set and omissions used by repo tree-sitter modes.
- The mode reuses cwd-confined repo target guards, generated/vendor skips, symlink refusal, supported source-extension filtering, source-size/file-count bounds, redacted rendering, and slash completions, but does not spawn or require the `tree-sitter` binary.
- README, release notes, command memory, backlog, and integration handoff now document `repo-files` as a non-parsing inventory preview. Remaining tree-sitter work is semantic reference/call/dependency depth beyond the current safe local previews.
- Verification passed: focused source `node --import tsx --test src/code-map/code-map.test.ts src/cli.test.ts src/slash/index.test.ts` with 171 tests, `npm run typecheck`, `npm run build`, `git diff --check`, built CLI smokes for `code tree-sitter repo-files`, top-level `tree-sitter repo-files`, and invalid-path guard behavior, full `npm test` with 547 tests, `npm run verify:release`, and independent read-only verifier `019f1fcf-c354-7150-90de-85ec39a632e2` with no findings.
- Next likely work after this slice remains another bounded optional completion slice such as semantic tree-sitter refs/calls/dependency depth, LSP/SCIP diagnostics/references, wrapper-safe report integration, reviewed GitHub/Sourcegraph tool declaration packs, or scanner adapters/additional Trivy modes only after deterministic no-network/no-auth local command shapes are proven.

Earlier latest work:

Added tree-sitter bounded repo symbol previews:

- Added `repo-symbols` mode to the optional local tree-sitter adapter. `orx code tree-sitter repo-symbols [path]`, `orx tree-sitter repo-symbols [path]`, `/code tree-sitter repo-symbols [path]`, and `/tree-sitter repo-symbols [path]` reuse the existing bounded repo-outline scan, cwd-confined path guards, generated/vendor skips, shell-disabled `tree-sitter parse`, cleaned env, bounded/redacted output, omissions, and warnings.
- The renderer is distinct as `Code tree-sitter repo symbols`, with `files_with_symbols` and `symbols` counts, but it intentionally reports definition-like AST symbol previews only and does not claim semantic symbol resolution.
- README, release notes, command memory, backlog, and the integration handoff now document repo-symbols as implemented; remaining tree-sitter work is deeper semantic reference/call/dependency intelligence beyond the current safe local previews.
- Verification passed: focused source `node --import tsx --test src/code-map/code-map.test.ts src/cli.test.ts src/slash/index.test.ts` with 171 tests, `npm run typecheck`, `npm run build`, `git diff --check`, built CLI missing-tool smokes for both `code tree-sitter repo-symbols` and top-level `tree-sitter repo-symbols`, full `npm test` with 547 tests, `npm run verify:release`, and independent read-only verifier `019f1fc1-67ca-7cc1-94b8-90bf641291cb` with no findings. Live grammar-backed tree-sitter success smoke was unavailable because `tree-sitter` is not installed on PATH in this environment.
- Next likely work after this slice remains another bounded optional completion slice such as semantic tree-sitter refs/calls/dependency depth, LSP/SCIP diagnostics/references, additional non-JSON/custom reporter parsing, reviewed GitHub/Sourcegraph tool declaration packs, or scanner adapters/additional Trivy modes only after deterministic no-network/no-auth local command shapes are proven.

Previous latest work:

Added captured CTest XML report parsing:

- The test report parser now recognizes bounded already-captured whole CTest `Test.xml` rooted at `<Site>` with one or more `<Testing>` blocks, counts direct `site/testing/test` result entries with strict `Status="passed"`, `Status="failed"`, or `Status="notrun"`, maps `notrun` to skipped, and renders compact `source=ctest-xml` counts in `orx tests run`, `/tests run`, and model-visible `run_tests` summaries.
- CTest `<TestList>` reference entries are ignored for totals; malformed CTest-shaped XML, including missing or unknown test statuses, missing direct result tests, or incomplete whole-root XML, is treated as invalid structured report data and does not fall through to looser text summaries. Mixed logs plus CTest XML remain on existing text/generic fallback.
- This slice does not add reporter flags, report files, installs, invocation changes, network calls, subprocess shape changes, model-tool exposure changes, duration parsing, or broader wrapper/custom-reporter support.
- README, release notes, command memory, architecture/tooling notes, backlog, and integration handoff now document CTest XML parsing as already-captured output only.
- Verification passed: focused source `node --import tsx --test src/testing/test-adapters.test.ts`, `npm run typecheck`, `npm run build`, `git diff --check`, full `npm test` (547 tests), and `npm run verify:release`. Independent read-only verifier `019f1f99-b6ca-7661-bae0-659ebb78b17b` found mixed/uppercase CTest `Status` values were being accepted; fixed by requiring exact lowercase `passed`/`failed`/`notrun` values and adding regression coverage, then reran the full gate bundle successfully.
- Next likely work after this slice remains another bounded optional completion slice such as LSP/SCIP diagnostics/references, semantic tree-sitter refs/dependency depth, additional non-JSON/custom reporter parsing, reviewed GitHub and Sourcegraph tool declaration packs, or scanner adapters/additional Trivy modes only after deterministic no-network/no-auth local command shapes are proven.

Previous latest work:

Added captured Robot Framework XML report parsing:

- The test report parser now recognizes bounded already-captured whole-object Robot Framework `output.xml` rooted at `<robot>`, requires exactly one `robot/statistics/total/stat` aggregate, validates strict `pass` and `fail` attributes plus optional `skip`, and renders compact `source=robot-xml` counts in `orx tests run`, `/tests run`, and model-visible `run_tests` summaries.
- Tag and suite statistics are ignored for totals; malformed Robot-shaped XML, including bad numeric attributes, missing total stats, duplicate total stats, or incomplete whole-root XML, is treated as invalid structured report data and does not fall through to looser text summaries. Mixed logs plus Robot XML remain on existing text fallback.
- This slice does not add reporter flags, report files, installs, invocation changes, network calls, subprocess shape changes, model-tool exposure changes, or broader wrapper/custom-reporter support.
- README, release notes, command memory, architecture/tooling notes, backlog, and integration handoff now document Robot XML parsing as already-captured output only.
- Verification passed: focused source `node --import tsx --test src/testing/test-adapters.test.ts`, `npm run typecheck`, `npm run build`, `git diff --check`, full `npm test` (546 tests), and `npm run verify:release`. Independent read-only verifier `019f1f8b-0272-72b3-a516-885288e86069` reported no findings after focused probes for valid whole Robot XML, malformed whole Robot XML, duplicate/missing aggregate stats, closing-tag mismatch, tag/suite stat ignoring, and mixed-log fallback.
- Next likely work after this slice remains another bounded optional completion slice such as LSP/SCIP diagnostics/references, semantic tree-sitter refs/dependency depth, additional non-JSON/custom reporter parsing, reviewed GitHub and Sourcegraph tool declaration packs, or scanner adapters/additional Trivy modes only after deterministic no-network/no-auth local command shapes are proven.

Previous latest work:

Added captured TRX XML report parsing:

- The test report parser now recognizes bounded already-captured whole-object Visual Studio/MSTest TRX output rooted at `<TestRun>`, requires exactly one `<ResultSummary>` and one `<Counters>` aggregate tag, validates strict `total`, `passed`, and `failed` attributes, and renders compact `source=trx-xml` counts in `orx tests run`, `/tests run`, and model-visible `run_tests` summaries.
- TRX `error`, `timeout`, and `aborted` counters are folded into failures. The parser derives skipped as the remaining non-passed/non-failed total, validates optional legacy outcome counters such as `inconclusive`, `notRunnable`, `notExecuted`, `disconnected`, `warning`, `completed`, `inProgress`, `pending`, and `passedButRunAborted` against that remainder, and treats malformed TRX-shaped XML as invalid structured report data before looser text fallback. Mixed logs plus TRX XML remain on existing text fallback.
- This slice does not add reporter flags, report files, installs, invocation changes, network calls, subprocess shape changes, model-tool exposure changes, or broader wrapper/custom-reporter support.
- README, release notes, command memory, architecture/tooling notes, backlog, and integration handoff now document TRX XML parsing as already-captured output only.
- Verification: focused source `node --import tsx --test src/testing/test-adapters.test.ts`, `npm run typecheck`, `npm run build`, `git diff --check`, full `npm test` with 545 tests, `npm run verify:release`, and independent re-verifier `019f1f7b-9b58-7032-bb68-c9f0e7461196` passed. Initial verifier `019f1f74-f053-7b13-ab16-92a504dbb37f` found misplaced direct-child `<Counters>` and impossible `executed` counter gaps; both are fixed with regression coverage.
- Next likely work after this slice remains another bounded optional completion slice such as LSP/SCIP diagnostics/references, semantic tree-sitter refs/dependency depth, additional non-JSON/custom reporter parsing, reviewed GitHub and Sourcegraph tool declaration packs, or scanner adapters/additional Trivy modes only after deterministic no-network/no-auth local command shapes are proven.

Previous latest work:

Added captured xUnit XML report parsing:

- The test report parser now recognizes bounded already-captured whole-object xUnit.net XML reporter output rooted at `<assemblies>`, requires one or more `<assembly>` aggregate tags, validates strict assembly `total`, `passed`, `failed`, and `skipped` attributes, accepts optional `errors`, and sums optional seconds `time` attributes into `durationMs`.
- Per-assembly `passed + failed + skipped` must match the assembly `total` before optional `errors` are added. Assembly-level errors are counted as additional failures and additional total tests so out-of-test xUnit errors are not underreported. Malformed xUnit-shaped XML blocks fallback to looser text summaries, while mixed logs plus XML remain on existing text fallback.
- This slice does not add reporter flags, report files, installs, invocation changes, network calls, subprocess shape changes, model-tool exposure changes, or broader wrapper/custom-reporter support.
- README, release notes, command memory, architecture/tooling notes, backlog, and integration handoff now document xUnit XML parsing as already-captured output only.
- Verification: focused source `node --import tsx --test src/testing/test-adapters.test.ts`, `npm run typecheck`, `npm run build`, `git diff --check`, full `npm test` with 544 tests, `npm run verify:release`, and independent verifier `019f1f66-d324-7ac3-8c3c-8c96d388321f` passed.
- Next likely work after this slice remains another bounded optional completion slice such as LSP/SCIP diagnostics/references, semantic tree-sitter refs/dependency depth, additional non-JSON/custom reporter parsing, reviewed GitHub and Sourcegraph tool declaration packs, or scanner adapters/additional Trivy modes only after deterministic no-network/no-auth local command shapes are proven.

Previous latest work:

Extended captured NUnit XML report parsing to NUnit 2:

- The `source=nunit-xml` parser now also recognizes bounded already-captured whole-object NUnit 2 XML reporter output rooted at `<test-results>`, validates strict root aggregate `total`, `errors`, `failures`, `not-run`, `inconclusive`, `ignored`, `skipped`, and `invalid` attributes, maps `failed = errors + failures`, maps `skipped = not-run`, derives passed from the remaining total, and requires the not-run component counts to agree.
- Existing NUnit 3 `<test-run>` XML behavior is preserved. Malformed NUnit 2-shaped XML, including not-run component mismatches, malformed numeric attributes, impossible totals, or incomplete whole-root XML, is treated as invalid structured report data and does not fall through to looser text summaries.
- This slice does not add reporter flags, report files, installs, invocation changes, network calls, subprocess shape changes, model-tool exposure changes, or broader wrapper/custom-reporter support.
- README, release notes, command memory, architecture/tooling notes, backlog, and integration handoff already document the broader NUnit XML captured-output surface; backlog and handoff now specify NUnit 2/3 coverage.
- Verification: focused source `node --import tsx --test src/testing/test-adapters.test.ts`, `npm run typecheck`, `npm run build`, `git diff --check`, full `npm test` with 543 tests, `npm run verify:release`, and independent verifier `019f1eb6-1cd4-7bb1-bfa7-456607ab2499` passed. The verifier also ran focused source and built tests, typecheck, diff-check, and direct parser probes; missing required NUnit 2 root attributes now have explicit regression coverage.
- Next likely work after this slice remains another bounded optional completion slice such as LSP/SCIP diagnostics/references, semantic tree-sitter refs/dependency depth, additional non-JSON/custom reporter parsing, reviewed GitHub and Sourcegraph tool declaration packs, or scanner adapters/additional Trivy modes only after deterministic no-network/no-auth local command shapes are proven.

Previous latest work:

Added captured NUnit XML report parsing:

- The test report parser now recognizes bounded already-captured whole-object NUnit 3 XML reporter output rooted at `<test-run>`, validates strict root aggregate `total`, `passed`, `failed`, optional `warnings`, optional `inconclusive`, optional `skipped`, optional `testcasecount`, and optional seconds `duration` attributes, then renders compact `source=nunit-xml` counts in `orx tests run`, `/tests run`, and model-visible `run_tests` summaries.
- Warnings are folded into passed and inconclusive cases are folded into skipped, matching the existing NUnit console summary parser so compact counts preserve NUnit's total. Malformed NUnit-shaped XML, including impossible totals, malformed numeric attributes, testcase count mismatches, malformed duration values, or incomplete whole-root XML, is treated as invalid structured report data and does not fall through to looser text summaries.
- This slice does not add reporter flags, report files, installs, invocation changes, network calls, subprocess shape changes, model-tool exposure changes, or broader wrapper/custom-reporter support.
- README, release notes, command memory, architecture/tooling notes, backlog, and integration handoff now document NUnit XML parsing as already-captured output only.
- Verification: focused source `node --import tsx --test src/testing/test-adapters.test.ts`, `npm run typecheck`, `npm run build`, `git diff --check`, full `npm test` with 543 tests, `npm run verify:release`, and independent verifier `019f1eaf-a8bc-7180-95d1-0c80461e6bd4` passed. The verifier also ran focused source tests, typecheck, diff-check, and direct parser probes; malformed optional `warnings`, `inconclusive`, and `skipped` XML attributes now have explicit regression coverage.
- Next likely work after this slice remains another bounded optional completion slice such as LSP/SCIP diagnostics/references, semantic tree-sitter refs/dependency depth, additional non-JSON/custom reporter parsing, reviewed GitHub and Sourcegraph tool declaration packs, or scanner adapters/additional Trivy modes only after deterministic no-network/no-auth local command shapes are proven.

Previous latest work:

Added captured TestNG XML report parsing:

- The test report parser now recognizes bounded already-captured whole-object TestNG XML reporter output rooted at `<testng-results>`, validates strict root aggregate `total`, `passed`, `failed`, optional `skipped`, and optional `ignored` counts, maps `skipped + ignored` to skipped, sums optional suite `duration-ms` values, and renders compact `source=testng-xml` counts in `orx tests run`, `/tests run`, and model-visible `run_tests` summaries.
- Malformed TestNG-shaped XML, including impossible aggregate totals, malformed numeric attributes, malformed suite durations, or incomplete whole-root XML, is treated as invalid structured report data and does not fall through to looser text summaries. Mixed logs plus XML remain on the existing text fallback path.
- This slice does not add reporter flags, report files, installs, invocation changes, network calls, subprocess shape changes, model-tool exposure changes, or broader wrapper/custom-reporter support.
- README, release notes, command memory, architecture/tooling notes, backlog, and integration handoff now document TestNG XML parsing as already-captured output only.
- Verification: focused source `node --import tsx --test src/testing/test-adapters.test.ts`, `npm run typecheck`, `npm run build`, `git diff --check`, full `npm test` with 542 tests, `npm run verify:release`, and independent verifier `019f1ea8-b6d3-7663-959c-20031f7f758c` passed. The verifier also ran focused source tests, typecheck, diff-check, and direct parser probes.
- Next likely work after this slice remains another bounded optional completion slice such as LSP/SCIP diagnostics/references, semantic tree-sitter refs/dependency depth, additional non-JSON/custom reporter parsing, reviewed GitHub and Sourcegraph tool declaration packs, or scanner adapters/additional Trivy modes only after deterministic no-network/no-auth local command shapes are proven.

Previous latest work:

Added captured RSpec JSON report parsing:

- The test report parser now recognizes bounded already-captured whole-object RSpec JSON reporter output with `summary.example_count`, `summary.failure_count`, `summary.pending_count`, optional numeric `summary.errors_outside_of_examples_count`, numeric seconds `summary.duration`, and matching `examples[].status` values, then renders compact `source=rspec-json` counts in `orx tests run`, `/tests run`, and model-visible `run_tests` summaries.
- Outside-example RSpec errors are counted as additional failures and additional total tests. Malformed RSpec-shaped JSON, including invalid present outside-error counts or missing/mismatched example statuses, is treated as invalid structured report data and does not fall through to looser text summaries.
- This slice does not add reporter flags, report files, installs, invocation changes, network calls, subprocess shape changes, model-tool exposure changes, or broader wrapper/custom-reporter support.
- README, release notes, command memory, architecture/tooling notes, backlog, and integration handoff now document RSpec JSON parsing as already-captured output only.
- Verification: focused source `node --import tsx --test src/testing/test-adapters.test.ts`, `npm run typecheck`, `npm run build`, `git diff --check`, direct malformed/valid outside-error probes, and independent verifier `019f1e9b-7b56-7430-bead-3bd990722f86` recheck passed.
- Next likely work after this slice remains another bounded optional completion slice such as LSP/SCIP diagnostics/references, semantic tree-sitter refs/dependency depth, additional non-JSON/custom reporter parsing, reviewed GitHub and Sourcegraph tool declaration packs, or scanner adapters/additional Trivy modes only after deterministic no-network/no-auth local command shapes are proven.

Previous latest work:

Added captured Mocha JSON report parsing:

- The test report parser now recognizes bounded already-captured whole-object Mocha JSON reporter output with consistent `stats.tests`, `stats.passes`, `stats.failures`, `stats.pending`, matching top-level `tests`/`passes`/`failures`/`pending` arrays, optional `stats.suites`, and optional `stats.duration`, then renders compact `source=mocha-json` counts in `orx tests run`, `/tests run`, and model-visible `run_tests` summaries.
- The parser runs in the existing captured structured JSON phase before text summary fallback, accepts Mocha JSON regardless of the inferred package-script framework when the whole object shape is valid, falls back to existing bounded stdout/stderr summary parsing for count-inconsistent Mocha-looking JSON, and rejects incomplete Mocha JSON without treating it as a valid report.
- This slice does not add reporter flags, report files, installs, invocation changes, network calls, subprocess shape changes, model-tool exposure changes, or broader wrapper/custom-reporter support.
- README, release notes, command memory, architecture/tooling notes, backlog, and integration handoff now document Mocha JSON parsing as already-captured output only.
- Verification: focused source `node --import tsx --test src/testing/test-adapters.test.ts`, `npm run typecheck`, `npm run build`, `git diff --check`, full `npm test` with 541 tests, `npm run verify:release`, and independent read-only verifier `019f1e92-6e8b-74e0-8346-99446263b388` passed. The verifier also ran full source tests and found no issues.
- Next likely work after this slice remains another bounded optional completion slice such as LSP/SCIP diagnostics/references, semantic tree-sitter refs/dependency depth, additional non-JSON/custom reporter parsing, reviewed GitHub and Sourcegraph tool declaration packs, or scanner adapters/additional Trivy modes only after deterministic no-network/no-auth local command shapes are proven.

Previous latest work:

Added runnable Mypy diagnostics profile:

- Promoted `mypy` into the guarded local diagnostics runner set. `orx diagnostics run mypy [--project <local-file-or-directory>] [--json]`, `orx diag run mypy ...`, `/diagnostics run mypy ...`, and `/diag run mypy ...` use an already-installed project-local, cwd virtualenv, or PATH `mypy`.
- Mypy runs use shell-disabled process execution, `inheritEnv: false`, the diagnostics minimal no-token env, command args `--no-color-output --no-error-summary --show-column-numbers --no-incremental --cache-dir <null-device> <file-or-directory>`, default project `.`, cwd-confined regular file-or-directory guards with symlink realpath checks, URL/registry/package/dash/control/secret-like rejection, bounded/redacted output, and ORX-owned JSON metadata. Parsed Mypy text diagnostics become ORX diagnostics with file, line, one-based column, severity, trailing bracket code, and sanitized message.
- The resolver checks project-local `node_modules/.bin/mypy`, then cwd `.venv/bin/mypy` or `venv/bin/mypy`, then PATH `mypy` with a `mypy --version` probe. The profile remains explicit-operator only: no installs, package-manager calls, Python package changes, network calls, MCP calls, cache writes by command selection, or model-tool exposure.
- README, release notes, guide examples, command memory, architecture/tooling notes, backlog, and integration handoff now document the Mypy diagnostics boundary and remaining LSP/SCIP diagnostics expansion path.
- Verification: `npm run typecheck`, focused source `node --import tsx --test src/cli.test.ts src/slash/index.test.ts` with 148 tests, `npm run build`, focused built `node --test dist/cli.test.js dist/slash/index.test.js` with 148 tests, direct compiled fake-Mypy smoke for exact args/redaction/no-token-env/no-cache-write/registry rejection/URL rejection/symlink rejection, `git diff --check`, full `npm test` with 541 tests, `npm run verify:release`, and independent read-only verifier `019f1e75-fcd1-77e2-a5ce-831fc6cda165`. The verifier found one stale latest-work note, fixed here, and no runtime or CLI/slash consistency issues.
- Next likely work after this slice remains another bounded optional completion slice such as LSP/SCIP diagnostics/references, semantic tree-sitter refs/dependency depth, non-JSON/custom reporter parsing, reviewed GitHub and Sourcegraph tool declaration packs, or scanner adapters/additional Trivy modes only after deterministic no-network/no-auth local command shapes are proven.

Latest work:

Added runnable CodeQL database-analysis scanner profile:

- Promoted CodeQL from catalog-only to a guarded local database-analysis profile. `orx scanners run codeql <database-dir> --query <local-query-or-suite> [--json]`, `orx scan codeql ...`, `/scanners run codeql ...`, and `/scan codeql ...` use an already-installed local `codeql`; ORX does not install CodeQL, create databases, resolve remote packs, expose scanner runs as model tools, or load CodeQL `--config`.
- CodeQL runs probe with `codeql --version`, require an existing cwd-confined CodeQL database directory, require a cwd-confined local `.ql`, `.qls`, or query directory via `--query`, reject URLs, pack names, dash-prefixed operands, control characters, secret-like values, and symlink escapes before spawn, and run `codeql database analyze --format=sarifv2.1.0 --output=<orx-temp-sarif> --no-download --no-sarif-add-file-contents --no-sarif-add-snippets --sarif-include-query-help=never --no-print-diagnostics-summary --no-print-metrics-summary --threads=0 -- <database> <query>`.
- Execution uses shell-disabled process spawning, `inheritEnv: false`, the scanner minimal no-token env, ORX-owned temporary SARIF output, bounded stdout/stderr, bounded SARIF file reads before redaction/rendering, SARIF summary rendering for non-JSON runs, and redacted bounded SARIF passthrough only for successful `--json` runs. Semgrep remains config-required with `--metrics off`; Trivy remains filesystem-secret-only; Snyk/Socket/OSV-Scanner remain catalog/readiness-only.
- README, release notes, command memory, backlog, and integration handoff now document the CodeQL boundary and remaining scanner expansion path.
- Verification: `npm run typecheck`, focused source `node --import tsx --test src/cli.test.ts src/slash/index.test.ts` with 148 tests, `npm run build`, focused built `node --test dist/cli.test.js dist/slash/index.test.js` with 148 tests, built CLI smokes for `scanners inspect codeql`, `scanners list --json`, and missing `--query` rejection, `git diff --check`, full `npm test` with 547 tests, `npm run verify:release`, and independent read-only verifier `019f2016-bcbc-7fd1-957f-45eba9b3ac20`. The verifier first found an unbounded SARIF temp-file read; the final patch replaced it with a bounded file read/truncation path and added an oversized SARIF regression before the verifier passed.
- Next likely work after this slice remains another bounded optional completion slice such as LSP/SCIP diagnostics/references, semantic tree-sitter refs/dependency depth, non-JSON/custom reporter parsing, reviewed GitHub and Sourcegraph tool declaration packs, or scanner adapters/additional Trivy modes only after deterministic no-network/no-auth local command shapes are proven.

Previous latest work:

Added runnable Ruff diagnostics profile:

- Promoted `ruff` into the guarded local diagnostics runner set. `orx diagnostics run ruff [--project <local-file-or-directory>] [--json]`, `orx diag run ruff ...`, `/diagnostics run ruff ...`, and `/diag run ruff ...` use an already-installed project-local, cwd virtualenv, or PATH `ruff`.
- Ruff runs use shell-disabled process execution, `inheritEnv: false`, the diagnostics minimal no-token env, command args `check --output-format json --no-cache <file-or-directory>`, default project `.`, cwd-confined regular file-or-directory guards with symlink realpath checks, URL/registry/package/dash/control/secret-like rejection, bounded/redacted output, and ORX-owned JSON metadata. Parsed Ruff JSON entries become ORX diagnostics with filename, row/column, rule code, and sanitized messages.
- The resolver checks project-local `node_modules/.bin/ruff`, then cwd `.venv/bin/ruff` or `venv/bin/ruff`, then PATH `ruff` with a `ruff --version` probe. The profile remains explicit-operator only: no installs, package-manager calls, Python package changes, network calls, MCP calls, or model-tool exposure by command selection.
- README, release notes, guide examples, command memory, architecture/tooling notes, backlog, and integration handoff now document the Ruff diagnostics boundary and remaining LSP/SCIP diagnostics expansion path.
- Verification: `npm run typecheck`, focused source `node --import tsx --test src/cli.test.ts src/slash/index.test.ts` with 148 tests, `npm run build`, focused built `node --test dist/cli.test.js dist/slash/index.test.js` with 148 tests, direct compiled fake-Ruff smoke for exact args/redaction/no-token-env/URL rejection/symlink rejection, `git diff --check`, full `npm test` with 541 tests, `npm run verify:release`, and independent read-only verifier `019f1e63-5f3e-7aa3-911d-63880ebdb469`. The verifier found no issues and separately confirmed local `node_modules/.bin/ruff` precedence over `.venv`, parser guard rejection, help/list/inspect consistency, shell-disabled execution, and no token env forwarding.
- Next likely work after this slice remains another bounded optional completion slice such as LSP/SCIP diagnostics/references, semantic tree-sitter refs/dependency depth, non-JSON/custom reporter parsing, reviewed GitHub and Sourcegraph tool declaration packs, or scanner adapters/additional Trivy modes only after deterministic no-network/no-auth local command shapes are proven.

Previous latest work:

Added runnable Trivy secret scanner profile:

- Promoted Trivy from catalog-only to a guarded local filesystem secret scanner. `orx scanners run trivy <local-file-or-directory> [--json]`, `orx scan trivy ...`, `/scanners run trivy ...`, and `/scan trivy ...` use an already-installed local `trivy` on PATH; ORX does not install Trivy, load Trivy config files, expose scanners as model tools, or enable vulnerability, misconfiguration, license, image, or registry scanning.
- Trivy runs probe with `trivy --version`, require cwd-confined regular file or directory targets with symlink realpath checks, reject `--config` in all forms including `--config=` and `--config ""`, and run `trivy fs --scanners secret --format json --offline-scan --skip-db-update --skip-java-db-update --skip-check-update --skip-version-check --disable-telemetry --no-progress <path>`.
- Execution uses shell-disabled process spawning, `inheritEnv: false`, the scanner minimal no-token env, bounded stdout/stderr, JSON-aware scanner redaction that preserves structural keys such as `Secrets`, and redacted JSON stdout passthrough only for successful `--json` runs. Semgrep remains config-required with `--metrics off`; CodeQL is now a separate local database-analysis profile; Snyk/Socket/OSV-Scanner remain catalog/readiness-only.
- README, release notes, guide examples, command memory, architecture/tooling notes, backlog, and integration handoff now document the Trivy-secret boundary and remaining scanner expansion path.
- Verification: `npm run typecheck`, focused source `node --import tsx --test src/cli.test.ts src/slash/index.test.ts` with 148 tests, parser smoke for empty Trivy config shapes, `npm run build`, focused built `node --test dist/cli.test.js dist/slash/index.test.js` with 148 tests, direct compiled fake-Trivy smoke for exact args/redaction/no-token-env/config rejection/symlink rejection, `git diff --check`, full `npm test` with 541 tests, `npm run verify:release`, and independent read-only verifier `019f1e4c-556e-7220-872a-40cbe961d195`. The verifier found the empty Trivy `--config` bypass; parser tracking and regression tests fixed it before the final recheck and release gates.
- Next likely work after this slice remains another bounded optional completion slice such as LSP/SCIP diagnostics/references, semantic tree-sitter refs/dependency depth, non-JSON/custom reporter parsing, reviewed GitHub and Sourcegraph tool declaration packs, or scanner adapters/additional Trivy modes only after deterministic no-network/no-auth local command shapes are proven.

Previous latest work:

Added runnable ESLint diagnostics profile:

- Promoted ESLint into the guarded local diagnostics runner set. `orx diagnostics run eslint [--project <local-file-or-directory>] [--json]`, `orx diag run eslint ...`, `/diagnostics run eslint ...`, and `/diag run eslint ...` use an already-installed `node_modules/.bin/eslint` or PATH `eslint`, with local `node_modules/.bin` preferred.
- ESLint runs use shell-disabled process execution, a minimal no-token env, command args `--format json <file-or-directory>`, default project `.`, cwd-confined regular file-or-directory guards with symlink realpath checks, URL/registry/package/dash/control/secret-like rejection, bounded/redacted output, and ORX-owned JSON metadata. Parsed ESLint JSON `messages` become ORX diagnostics with rule ids, line/column, error/warning severity, and sanitized messages.
- The profile remains explicit-operator only: no installs, package-manager calls, Node package changes, network calls, MCP calls, or model-tool exposure by command selection. TypeScript Language Server, rust-analyzer, and SCIP TypeScript remain catalog/readiness-only.
- Verification: `npm run typecheck`, focused source `node --import tsx --test src/cli.test.ts src/slash/index.test.ts`, `npm run build`, `git diff --check`, focused built `node --test dist/cli.test.js dist/slash/index.test.js`, direct compiled temp-project ESLint smoke with a fake local `node_modules/.bin/eslint`, full `npm test` with 541 tests, `npm run verify:release`, and independent read-only verifier `019f1e36-2d81-7b12-874b-6c2536cefbe5`. The verifier found stale memory references only; architecture, tooling, command, backlog, handoff, and current-context notes were updated before final gates.
- Next likely work after this slice remains another bounded optional completion slice such as LSP/SCIP diagnostics/references, semantic tree-sitter refs/dependency depth, non-JSON/custom reporter parsing, or scanner adapters only after a deterministic no-network/no-auth local command shape is proven.

Previous latest work:

Added tests readiness JSON output:

- `orx tests --json`, `orx tests list --json`, `orx tests status --json`, and matching `/tests` / `/test` list/status forms now render ORX-owned structured discovery JSON for native test targets.
- This only serializes existing discovery metadata: no `tests run` behavior changes, no test execution for list/status, no binary probing, no report-file reads, no installs, no network calls, and no model-tool exposure changes. JSON includes `schema_version`, `surface`, explicit operator/model/execution/network/report-file boundary fields, target/default/framework counts, bounded target metadata, bounded omissions, and the run usage string.
- Top-level `--json` maps to list, list/status accept only `--json`, extra readiness operands and unknown readiness options reject with usage, and slash completion/help now covers `--json` while preserving `run [target-id] [-- args...]` passthrough documentation.
- Verification: `node --import tsx --test src/cli.test.ts src/slash/index.test.ts`, `npm run typecheck`, `npm run build`, `node --test dist/cli.test.js dist/slash/index.test.js`, direct built CLI JSON/invalid-operand smokes, `git diff --check`, full `npm test` with 541 tests, `npm run verify:release`, and independent read-only verifier `019f1e24-5f86-7142-8c83-7b0eb3eb90c0`. The verifier found a low slash help/docs passthrough wording regression, which was fixed before the final focused checks and release verifier rerun.
- Next likely work after this slice remains another bounded optional completion slice such as LSP/SCIP diagnostics/references, semantic tree-sitter refs/dependency depth, non-JSON/custom reporter parsing, or scanner adapters only after a deterministic no-network/no-auth local command shape is proven.

Previous latest work:

Added exact no-install npx framework report support:

- Package-script JSON report handling now treats only exact no-prefix `npx --no-install <runner>` final runner shapes as safe framework runners, where `<runner>` is exactly `jest`, `vitest`, `playwright`, `playwright-core`, or `@playwright/test`.
- These exact no-install npx scripts can use the same private temporary JSON report capture, declared JSON output-file reads, and fixed local config-declared JSON output-file reads already used for direct Jest/Vitest/Playwright scripts. The existing boundaries remain: no installs, no network, no model-tool exposure changes, no config execution, no declared report mutation/deletion, and stale/out-of-cwd/symlink/oversized reports stay ignored.
- Plain `npx`, path-like `npx`, path-like runners, env/cross-env-prefixed npx, separator forms, duplicate or non-lowercase `--no-install`, other npx options, custom wrappers, custom reporters, and unsafe multi-step/post-step shapes stay on stdout/stderr fallback.
- Verification: `node --import tsx --test src/testing/test-adapters.test.ts`, `npm run typecheck`, `npm run build`, `node --test dist/testing/test-adapters.test.js`, `git diff --check`, full `npm test` with 541 tests, `npm run verify:release`, and independent read-only verifier `019f1e07-3e9c-7100-86bd-ab0b2b3b2642` after tightening path, separator, duplicate option, env-prefix, and raw lowercase option boundary findings.
- Next likely work after this slice remains another bounded optional completion slice such as LSP/SCIP diagnostics/references, semantic tree-sitter refs/dependency depth, non-JSON/custom reporter parsing, or scanner adapters only after a deterministic no-network/no-auth local command shape is proven.

Previous latest work:

Added scanner readiness JSON output:

- `orx scanners --json`, `orx scanners list --json`, `orx scanners status --json`, `orx scanners inspect <profile> --json`, `orx scanners show <profile> --json`, and matching `/scanners` forms now render ORX-owned structured readiness JSON for scanner catalog/profile metadata.
- This only serializes existing readiness metadata: no Semgrep run behavior changes, no `scan semgrep ... --json` changes, no new scanner adapters, no process execution for list/inspect, no installs, no network, and no model-tool exposure.
- Readiness JSON includes `surface`, `schema_version`, explicit operator/model/network boundary fields, profile state/binary/run support, install behavior, network boundary, and Semgrep guard details. Extra readiness operands and unknown readiness options reject with usage; slash completion now covers `--json` for list/status and inspect/show plus the `status`/`show` aliases.
- Verification: `npm run typecheck`, focused source `node --import tsx --test src/cli.test.ts src/slash/index.test.ts`, `npm run build`, focused built `node --test dist/cli.test.js dist/slash/index.test.js`, direct built CLI JSON/invalid-operand smokes, `git diff --check`, full `npm test` with 540 tests, `npm run verify:release`, and independent read-only verifier `019f1dfd-9074-7c91-8658-077ec15d6b4c` with no findings.
- Next likely work after this slice remains another bounded optional completion slice such as LSP/SCIP diagnostics/references, wrapper-safe report integration, semantic tree-sitter refs/dependency depth, or scanner adapters only after a deterministic no-network/no-auth local command shape is proven.

Previous latest work:

Added diagnostics readiness JSON output:

- `orx diagnostics --json`, `orx diagnostics list --json`, `orx diagnostics status --json`, `orx diagnostics inspect <profile> --json`, `orx diagnostics show <profile> --json`, and matching `/diagnostics`/`/diag` forms now render ORX-owned structured readiness JSON for the diagnostics catalog/profile metadata.
- This only serializes existing readiness metadata: no runnable profile set changes, no process execution for list/inspect, no installs, no network, no model-tool exposure, and no changes to `diagnostics run` behavior.
- Readiness JSON includes `surface`, `schema_version`, explicit operator/model/network boundary fields, profile state/binary/run support, install behavior, network boundary, and runner-specific guard details for runnable TypeScript/Pyright/ESLint/Ruff/Mypy/gopls/clangd profiles. Extra readiness operands and unknown readiness options reject with usage; slash completion now covers `--json` for list/status and inspect/show.
- Verification: `npm run typecheck`, focused source `node --import tsx --test src/slash/index.test.ts src/cli.test.ts`, `git diff --check`, full `npm test` with 540 tests, `npm run verify:release`, direct built CLI JSON/invalid-operand smokes before the final alias fix, and independent read-only verifier review/recheck `019f1df1-af95-7bf1-b72c-e9906321e8fb`. The verifier found a low `show` completion gap; it was fixed by completing `status`/`show` aliases and rechecked with no findings.
- Next likely work after this slice remains another bounded optional completion slice such as LSP/SCIP diagnostics/references, wrapper-safe report integration, semantic tree-sitter refs/dependency depth, or scanner adapters only after a deterministic no-network/no-auth local command shape is proven.

Previous latest work:

Added safe root tsconfig/jsconfig path/baseUrl resolution for tree-sitter repo deps:

- `repo-deps` now reads a small regular root `tsconfig.json` or `jsconfig.json` when present, accepts JSONC-style comments/trailing commas, and resolves safe `compilerOptions.paths` and `baseUrl` aliases only to files already inside the bounded scanned source set.
- Rendered dependency edges include `resolution_detail=relative`, `resolution_detail=config_path`, or `resolution_detail=config_base_url` for local edges. Unsafe alias targets are skipped with warnings, matched aliases with no scanned target count as `unresolved_local`, and unmatched package imports remain `external`.
- The boundary remains explicit operator-only, no-install, no-network, shell-disabled, cwd-confined, no model-tool exposure, and not package-manager, semantic, or full dependency resolution.
- Verification: `npm run typecheck`, focused `npm run build && node --test dist/code-map/code-map.test.js`, `git diff --check`, full `npm test` with 540 tests, `npm run verify:release`, and independent verifier review/recheck passed. The first verifier found and rechecked a config `paths` precedence overclaim; `repo-deps` now stops at the first matching path pattern instead of falling through to broader aliases. The follow-up verifier found no issues with the `jsconfig.json` fallback, neutral `config_*` rendered detail labels, or `tsconfig.json` precedence when both config files exist; explicit regression coverage now asserts `tsconfig.json` wins over `jsconfig.json` when both define the same alias.

Added captured TeamCity service-message parsing:

- The test report parser now recognizes bounded already-captured TeamCity test service messages such as `##teamcity[testSuiteStarted name='suite']`, `##teamcity[testFinished name='test' duration='12']`, `##teamcity[testFailed name='test']`, and `##teamcity[testIgnored name='test']`, then renders compact `source=teamcity` counts in `orx tests run`, `/tests run`, and model-visible `run_tests` summaries.
- The parser decodes TeamCity service-message escapes, counts repeated names separately by active per-`flowId` suite path/occurrence, maps failed and ignored messages to failed/skipped counts, sums safe millisecond `duration` attributes from finished messages, and reports unique suite counts when suite messages are present.
- Known malformed TeamCity test messages, missing names, unsafe/leading-zero durations, duplicate active starts, and started-only incomplete cases reject before generic fallback. Suite-only and unrelated TeamCity build messages do not parse as test reports and can still use existing fallback.
- This slice does not add reporter flags, report files, installs, invocation changes, network calls, subprocess shape changes, or model-tool exposure changes.
- Verification passed: `npm run typecheck`, focused source `node --test --import tsx src/testing/test-adapters.test.ts`, `git diff --check`, `npm run build`, focused built `node --test dist/testing/test-adapters.test.js`, direct built parser probes for valid interleaved `flowId` TeamCity output, invalid-duration fail-closed behavior, and suite-only fallback, full `npm test` (539 tests), and `npm run verify:release`. Initial independent verifier `019f1dc4-7496-70a1-8722-783385b90216` found a global-suite-stack `flowId` issue, which was fixed with per-flow suite stacks; follow-up verifier `019f1dc4-7496-70a1-8722-783385b90216` reported no findings.
- Next likely work after this slice is another optional completion slice such as wrapper-safe report integration, semantic tree-sitter refs/dependency resolution, LSP/SCIP diagnostics/references, or additional scanner adapters only after a deterministic no-network/no-auth local command shape is proven.

Previous latest work:

Added captured JUnit XML report parsing:

- The test report parser now recognizes bounded already-captured whole JUnit XML streams with `<testsuite>` or `<testsuites>` roots, then renders compact `source=junit-xml` counts in `orx tests run`, `/tests run`, and model-visible `run_tests` summaries.
- The parser maps `tests`, `failures`, `errors`, `skipped`, `disabled`, `suites`, and `time` attributes when aggregate counts are present, falls back to counting `<testcase>`, `<failure>`, `<error>`, and `<skipped>` tags when suite count attributes are absent, and derives passed as total minus failed minus skipped.
- Whole malformed, count-inconsistent, unsafe-count, leading-zero-count, or impossible JUnit XML reports reject before text/generic fallback. Mixed logs plus XML do not parse as JUnit XML and can still use existing text fallback. The lightweight XML scanner preserves valid quoted `>` attributes, CDATA, and quoted count-looking strings in non-count attributes without miscounting.
- This slice does not add reporter flags, report files, installs, invocation changes, network calls, subprocess shape changes, or model-tool exposure changes.
- Verification passed: `npm run typecheck`, focused source `node --import tsx --test src/testing/test-adapters.test.ts`, `git diff --check`, `npm run build`, focused built `node --test dist/testing/test-adapters.test.js`, direct source and built parser probes for valid XML, fail-closed XML, mixed-log fallback, and Node structured-report precedence, full `npm test` (538 tests), `npm run verify:release`, and independent read-only verifier `019f1db2-ae80-7df1-bdb6-31d327936bfc` after fixing earlier verifier findings.
- Next likely work after this slice is another optional completion slice such as wrapper-safe report integration, semantic tree-sitter refs/dependency resolution, LSP/SCIP diagnostics/references, or additional scanner adapters only after a deterministic no-network/no-auth local command shape is proven.

Previous latest work:

Added captured Tasty console summary parsing:

- The test report parser now recognizes bounded already-captured Tasty console reporter statistic lines such as `All 3 tests passed`, `All 2 tests passed (0.12s)`, and `1 out of 3 tests failed (1.23s)`, then renders compact `source=tasty` counts in `orx tests run`, `/tests run`, and model-visible `run_tests` summaries.
- `All N tests passed` maps all tests to passed; `N out of M tests failed` maps failures directly and derives passed as total minus failed. Optional exact two-decimal seconds suffixes map to `duration_ms`. The parser runs before Zig so Tasty's no-period all-pass line does not trip Zig's period-based summary grammar.
- The parser uses the last exact Tasty statistic line, rejects zero totals, zero-failure failed summaries, impossible counts, unsafe or leading-zero counts, singular/malformed Tasty-looking lines, non-two-decimal duration suffixes, and arbitrary trailing prose before Zig/generic fallback, and does not add reporter flags, report files, installs, Tasty invocation changes, network, or model-tool exposure changes.
- Verification passed: `npm run typecheck`, focused source `node --import tsx --test src/testing/test-adapters.test.ts`, `git diff --check`, `npm run build`, focused built `node --test dist/testing/test-adapters.test.js`, direct built parser smokes for Tasty valid/malformed, Zig period-form, and Python unittest non-regression, full `npm test` (537 tests), `npm run verify:release`, and independent read-only verifier `019f1d80-3ab7-7a40-a6e3-64bd2faeca5e` after tightening two-decimal duration and safe-count handling.
- Next likely work after this slice is another optional completion slice such as wrapper-safe report integration, semantic tree-sitter refs/dependency resolution, LSP/SCIP diagnostics/references, or additional scanner adapters only after a deterministic no-network/no-auth local command shape is proven.

Earlier recent work:

Added captured Dart compact final-line parsing:

- The test report parser now recognizes bounded already-captured Dart `package:test` compact final lines such as `00:02 +3 ~1: All tests passed!`, `01:02 +2 -1 ~1: Some tests failed.`, and `01:02:03 +0 ~2: All tests skipped.`, then renders compact `source=dart` counts in `orx tests run`, `/tests run`, and model-visible `run_tests` summaries.
- Dart `+` counts map to passed, `-` counts map to failed, `~` counts map to skipped, and `MM:SS` or `HH:MM:SS` clock durations map to `duration_ms`. Progress lines stay ignored, malformed Dart-looking final lines reject without generic fallback, `Some tests failed.` requires a failing count, and all-skipped output must use `All tests skipped.`.
- This slice does not add reporter flags, report files, installs, network calls, subprocess shape changes, or model-tool exposure changes.
- Verification passed: `npm run typecheck`, focused source `node --import tsx --test src/testing/test-adapters.test.ts`, `git diff --check`, `npm run build`, focused built `node --test dist/testing/test-adapters.test.js`, full `npm test` (537 tests), `npm run verify:release`, independent read-only verifier `019f1d1c-77c0-72b3-999d-1f1317aac99f` finding fixed, and follow-up verifier `019f1d20-487c-77f0-aea0-e23c7361ea27` with no findings.
- Next likely work after this slice is another optional completion slice such as additional non-JSON/custom reporter parsing, wrapper-safe report integration, semantic tree-sitter dependency resolution, LSP/SCIP references/hover/go-to-definition, or scanner expansion only after a deterministic no-network/no-auth local command shape is proven.

Earlier recent work:

Added captured Cypress run-summary parsing:

- The test report parser now recognizes bounded already-captured Cypress aggregate run-summary table rows such as `All specs passed! ... Tests Passing Failing Pending Skipped` and `N of M failed (...) ...`, then renders compact `source=cypress` counts in `orx tests run`, `/tests run`, and model-visible `run_tests` summaries.
- Pending maps to ORX `todo`, skipped maps to `skipped`, duration is parsed from Cypress clock-style duration cells, passing rows must not contain failures, failed rows must include valid failed-spec counters plus at least one failing test, and the parser validates that passing/failing/pending/skipped counts sum to total.
- The parser accepts bare rows and raw table-bordered rows, rejects malformed Cypress-looking rows without generic fallback, and does not add reporter flags, report files, installs, network calls, subprocess shape changes, or model-tool exposure changes.
- Verification passed: `npm run typecheck`, focused source `node --import tsx --test src/testing/test-adapters.test.ts`, `git diff --check`, `npm run build`, focused built `node --test dist/testing/test-adapters.test.js`, full `npm test` (537 tests), `npm run verify:release`, independent read-only verifier `019f1d0f-071f-7861-ac75-b3073d53ab64` finding fixed, and follow-up verifier `019f1d13-3f85-7ec0-8d50-600fc4711c97` with no findings.
- Next likely work after this slice is another optional completion slice such as additional non-JSON/custom reporter parsing, wrapper-safe report integration, semantic tree-sitter dependency resolution, LSP/SCIP references/hover/go-to-definition, or scanner expansion only after a deterministic no-network/no-auth local command shape is proven.

Added captured `go test -json` summary parsing:

- The test report parser now recognizes bounded already-captured line-delimited `go test -json` events when scripts already emit them, counting terminal test-level `pass`/`fail`/`skip` actions as `source=go-json` in `orx tests run`, `/tests run`, and model-visible `run_tests` summaries.
- Package-level Go JSON `pass`/`fail` events contribute duration only and do not create fake test counts. Repeated test events use the last terminal action for the same package/test, while package-only, run-only, output-only, and malformed JSON lines stay on fallback.
- This slice does not add reporter flags, report files, installs, network calls, subprocess shape changes, or model-tool exposure changes.
- Verification passed: `npm run typecheck`, focused source `node --import tsx --test src/testing/test-adapters.test.ts`, `git diff --check`, `npm run build`, focused built `node --test dist/testing/test-adapters.test.js`, full `npm test` (537 tests), `npm run verify:release`, and independent read-only verifier `019f1d02-b2f7-7a72-91c7-856175fb551d`.
- Next likely work after this slice is another optional completion slice such as additional non-JSON/custom reporter parsing, wrapper-safe report integration, semantic tree-sitter dependency resolution, LSP/SCIP references/hover/go-to-definition, or scanner expansion only after a deterministic no-network/no-auth local command shape is proven.

Added runnable clangd diagnostics profile:

- Promoted `clangd` from diagnostics catalog-only to a guarded explicit local runner. `orx diagnostics run clangd --project <local-c-cpp-source-or-header-file> [--json]`, `orx diag run clangd ...`, `/diagnostics run clangd ...`, and `/diag run clangd ...` use an already-installed `node_modules/.bin/clangd` or PATH `clangd`, probe PATH with `clangd --version`, run `clangd --log=error --check=<file>`, parse bounded clangd `E/W/I[...] [code] Line N: message` stderr diagnostics, and keep ORX-owned JSON metadata.
- The clangd runner reuses the diagnostics trust boundary: no installs, no package-manager/launcher calls, no network calls, no model-tool exposure, shell disabled, cleaned env without ORX/OpenRouter/Brave/API token-like values, cwd-confined regular C/C++/Objective-C source/header file guard with symlink realpath checks, URL/registry/package/dash/control/secret-like rejection, and bounded/redacted stdout/stderr.
- Verification: `npm run typecheck`, focused source CLI/slash diagnostics tests, `npm run build`, `git diff --check`, focused built CLI/slash tests, a live compiled CLI smoke against PATH `clangd`, full `npm test` (537 tests), `npm run verify:release`, and an independent read-only verifier pass all passed. The verifier confirmed missing project, directory, non-C/C++/Objective-C extension, URL, registry, dash, secret-like value, symlink escape, and catalog-only profile cases are rejected before clangd spawn.
- Next likely work after this slice is another optional completion slice such as LSP/SCIP references/hover/go-to-definition, semantic tree-sitter dependency resolution, additional non-JSON/custom reporter parsing, wrapper-safe report integration, or scanner expansion only after a deterministic no-network/no-auth local command shape is proven.

Earlier latest work:

Added AVA package-script metadata and captured summary parsing:

- The test adapter now infers direct `ava` package scripts as `framework=ava`, shows AVA in framework counts/status output, and recognizes bounded already-captured AVA default-reporter summary lines such as `1 test passed`, `13 tests failed`, `1 known failure`, `1 test skipped`, and `1 test todo`.
- AVA parsing is framework-gated to AVA-inferred targets so generic unknown output such as a stray `1 test failed` is not newly parsed. Known failures are folded into passed, matching AVA's TAP reporter treatment of expected failures, and the parser uses the last contiguous AVA summary block to avoid mixing older watch-mode run summaries into the final counts.
- Verification passed: `npm run typecheck`, focused source `node --import tsx --test src/testing/test-adapters.test.ts`, source CLI `node --import tsx --test src/cli.test.ts`, `git diff --check`, `npm run build`, focused built `node --test dist/testing/test-adapters.test.js`, direct AVA/unknown parser repro, direct AVA-vs-wrapper discovery repro, full `npm test` (537), `npm run verify:release`, initial independent verifier `019f1cdc-75be-7f21-9c0d-dc137c305129` finding fixed, and verifier follow-up with no findings.
- Next likely work after this slice is another optional completion slice such as wrapper-safe report integration, semantic tree-sitter refs/dependency resolution, LSP/SCIP diagnostics/references, or additional scanner adapters only after a deterministic no-network/no-auth local command shape is proven.

Added captured cargo-nextest summary parsing:

- The test report parser now recognizes bounded already-captured nextest final summary lines such as `Summary [   0.021s] 14 tests run: 14 passed, 177 skipped` and `Summary [  15.750s] 8/10 tests run: 5 passed (1 slow, 1 flaky, 1 leaky), 2 failed, 1 exec failed, 1 timed out, 2 skipped`, including ANSI-colored output, then renders compact `source=nextest` counts in `orx tests run`, `/tests run`, and model-visible `run_tests` summaries.
- The parser maps passed directly, folds failed/exec failed/timed out into failed, maps skipped directly, exposes nextest's flaky annotation as ORX `flaky`, runs before Cargo `test result:` fallback so embedded libtest failure output does not win, rejects malformed nextest-looking summary lines without falling through, and does not add reporter flags, report files, installs, network, or model-tool exposure changes.
- Verification passed: `npm run typecheck`, focused source `node --import tsx --test src/testing/test-adapters.test.ts`, `git diff --check`, `npm run build`, focused built `node --test dist/testing/test-adapters.test.js`, direct embedded-Cargo-line repro, full `npm test` (537), `npm run verify:release`, and independent verifier `019f1ccc-a1ee-7843-b929-3fab9ba6e689`.
- Next likely work after this slice is another optional completion slice such as wrapper-safe report integration, semantic tree-sitter refs/dependency resolution, LSP/SCIP diagnostics/references, or additional scanner adapters only after a deterministic no-network/no-auth local command shape is proven.

Added captured ScalaTest summary parsing:

- The test report parser now recognizes bounded already-captured ScalaTest summary blocks with exact `Run completed in ...`, `Total number of tests run: N`, `Suites: completed N, aborted N`, and `Tests: succeeded N, failed N, canceled N, ignored N, pending N` lines, including common sbt `[info]` prefixes, then renders compact `source=scalatest` counts in `orx tests run`, `/tests run`, and model-visible `run_tests` summaries.
- The parser maps succeeded to passed, failed to failed, canceled/ignored to skipped, pending to todo, publishes ScalaTest's total-tests count rather than the completed-only `Total number of tests run` line, validates that completed tests equal succeeded plus failed, rejects malformed ScalaTest-looking summaries without falling through, and does not add reporter flags, report files, installs, network, or model-tool exposure changes.
- Verification passed: `npm run typecheck`, focused source `node --import tsx --test src/testing/test-adapters.test.ts`, `git diff --check`, `npm run build`, focused built `node --test dist/testing/test-adapters.test.js`, full `npm test` with 537 tests, `npm run verify:release`, direct malformed ScalaTest repro returning `undefined`, first independent verifier `019f1cb9-a62e-7921-9cb4-0d52bbb7f6ca` finding fixed, and second independent verifier `019f1cc0-311d-70a1-9417-38b5832eaa44` with no findings.
- Next likely work after this slice is another optional completion slice such as wrapper-safe report integration, semantic tree-sitter refs/dependency resolution, LSP/SCIP diagnostics/references, or additional scanner adapters only after a deterministic no-network/no-auth local command shape is proven.

Added captured Behat summary parsing:

- The test report parser now recognizes bounded already-captured Behat full English summary footers with exact scenario counter, step counter, and timer/memory lines such as `6 scenarios (1 passed, 3 failed, 1 undefined, 1 pending)`, `23 steps (16 passed, 3 failed, 1 undefined, 1 pending, 2 skipped)`, and `0m0.02s (18.50Mb)`, then renders compact `source=behat` counts in `orx tests run`, `/tests run`, and model-visible `run_tests` summaries.
- The parser maps failed scenarios to failed, skipped scenarios to skipped, pending/undefined scenarios to todo, validates scenario and step totals, requires Behat's timer/memory footer to avoid reclassifying ordinary Cucumber-style `N scenarios (...)` output, rejects malformed Behat-looking footers without falling through, and does not add reporter flags, report files, installs, network, or model-tool exposure changes.
- Verification passed: `npm run typecheck`, focused source `node --import tsx --test src/testing/test-adapters.test.ts`, `npm run build`, focused built `node --test dist/testing/test-adapters.test.js`, `git diff --check`, full `npm test` with 537 tests, `npm run verify:release`, and independent verifier `019f1cab-b076-7803-b1cb-e7219efdf362` with no parser/code findings.
- Next likely work after this slice is another optional completion slice such as wrapper-safe report integration, semantic tree-sitter refs/dependency resolution, LSP/SCIP diagnostics/references, or additional scanner adapters only after a deterministic no-network/no-auth local command shape is proven.

Added captured Pest summary parsing:

- The test report parser now recognizes bounded already-captured Pest console summary lines such as `Tests:    2 passed (2 assertions)`, `Tests:    1 failed, 1 passed (1 assertions)`, and richer comma-separated outcome lines with `deprecated`, `warnings`, `incomplete`, `notices`, `todos`, `skipped`, and `passed`, then renders compact `source=pest` counts in `orx tests run`, `/tests run`, and model-visible `run_tests` summaries.
- The parser maps failures directly, skipped directly, incomplete/todos to todo, and warning/deprecation/notice statuses into passed to preserve Pest's total; it runs before Jest/Vitest/Node/PHPUnit/generic fallbacks for node and non-node targets, uses the last exact Pest summary line, rejects trailing status prose, duplicate/unknown Pest labels, and malformed Pest-looking lines without falling through, and does not add reporter flags, report files, installs, network, or model-tool exposure changes.
- Verification passed: `npm run typecheck`, focused source `node --import tsx --test src/testing/test-adapters.test.ts`, `npm run build`, focused built `node --test dist/testing/test-adapters.test.js`, `git diff --check`, full `npm test`, `npm run verify:release`, independent verifier review, and corrected no-fallthrough punctuation regression review.
- Next likely work after this slice is another optional completion slice such as wrapper-safe report integration, semantic tree-sitter refs/dependency resolution, LSP/SCIP diagnostics/references, or additional scanner adapters only after a deterministic no-network/no-auth local command shape is proven.

Added captured Jasmine summary parsing:

- The test report parser now recognizes bounded already-captured Jasmine console summary lines such as `1 spec, 0 failures` and `3 specs, 1 failure, 1 pending spec`, then renders compact `source=jasmine` counts in `orx tests run`, `/tests run`, and model-visible `run_tests` summaries.
- The parser maps failure counts directly, treats pending specs as skipped, derives passed specs from the executable spec total, runs before Node/framework/generic fallbacks for node and non-node targets, uses the last exact Jasmine summary line, rejects trailing status prose, impossible totals, unknown outcome labels, and malformed Jasmine-looking lines without falling through, and does not add reporter flags, report files, installs, network, or model-tool exposure changes.
- Verification passed: `npm run typecheck`, focused source `node --import tsx --test src/testing/test-adapters.test.ts`, `npm run build`, focused built `node --test dist/testing/test-adapters.test.js`, `git diff --check`, full `npm test`, `npm run verify:release`, and independent verifier parser review.
- Next likely work after this slice is another optional completion slice such as wrapper-safe report integration, semantic tree-sitter refs/dependency resolution, LSP/SCIP diagnostics/references, or additional scanner adapters only after a deterministic no-network/no-auth local command shape is proven.

Added captured Robot Framework summary parsing:

- The test report parser now recognizes bounded already-captured Robot Framework console summary lines such as `2 tests, 1 passed, 1 failed` and `3 tests, 1 passed, 1 failed, 1 skipped`, then renders compact `source=robot` counts in `orx tests run`, `/tests run`, and model-visible `run_tests` summaries.
- The parser maps passed, failed, and optional skipped counts, validates totals, runs before Node/framework/generic fallbacks for node and non-node targets, uses the last exact Robot summary line, rejects trailing status prose, mismatched totals, unknown outcome labels, and malformed Robot-looking lines without falling through, and does not add reporter flags, report files, installs, network, or model-tool exposure changes.
- Verification passed: `npm run typecheck`, focused source `node --import tsx --test src/testing/test-adapters.test.ts`, `npm run build`, focused built `node --test dist/testing/test-adapters.test.js`, `git diff --check`, full `npm test`, `npm run verify:release`, and independent verifier parser review.
- Next likely work after this slice is another optional completion slice such as wrapper-safe report integration, semantic tree-sitter refs/dependency resolution, LSP/SCIP diagnostics/references, or additional scanner adapters only after a deterministic no-network/no-auth local command shape is proven.

Extended captured `.NET test`/xUnit summary parsing:

- The test report parser now recognizes bounded already-captured xUnit/dotnet one-line summaries such as `Test summary: total: 4, failed: 1, succeeded: 2, skipped: 1, duration: 0.4s`, then renders compact `source=dotnet` counts in `orx tests run`, `/tests run`, and model-visible `run_tests` summaries.
- The parser maps `succeeded`, `failed`, and `skipped` to passed, failed, and skipped; validates totals and duration; runs before Node/framework fallbacks for node and non-node targets; uses the last exact dotnet summary line; rejects malformed `Passed!`/`Failed!` or `Test summary:` dotnet-looking lines without falling through; and does not add reporter flags, report files, installs, network, or model-tool exposure changes.
- Verification passed: `npm run typecheck`, focused source `node --import tsx --test src/testing/test-adapters.test.ts`, `npm run build`, focused built `node --test dist/testing/test-adapters.test.js`, `git diff --check`, full `npm test`, `npm run verify:release`, and independent verifier parser review.
- Next likely work after this slice is another optional completion slice such as wrapper-safe report integration, semantic tree-sitter refs/dependency resolution, LSP/SCIP diagnostics/references, or additional scanner adapters only after a deterministic no-network/no-auth local command shape is proven.

Added captured NUnit console summary parsing:

- The test report parser now recognizes bounded already-captured NUnit console summary lines such as `Test Count: 5, Passed: 2, Failed: 1, Warnings: 1, Inconclusive: 1, Skipped: 0`, then renders compact `source=nunit` counts in `orx tests run`, `/tests run`, and model-visible `run_tests` summaries.
- `Passed` and `Failed` map directly; `Warnings` are folded into passed and `Inconclusive` is folded into skipped so compact counts preserve NUnit's total. The parser runs for node and non-node framework targets, uses the last exact NUnit summary line, rejects mismatched totals, unknown outcome labels, trailing status prose, and malformed NUnit-looking lines, and does not add reporter flags, report files, installs, network, or model-tool exposure changes.
- Verification passed: `npm run typecheck`, focused source `node --import tsx --test src/testing/test-adapters.test.ts`, `npm run build`, focused built `node --test dist/testing/test-adapters.test.js`, `git diff --check`, full `npm test`, `npm run verify:release`, and independent verifier parser review.
- Next likely work after this slice is another optional completion slice such as wrapper-safe report integration, semantic tree-sitter refs/dependency resolution, LSP/SCIP diagnostics/references, or additional scanner adapters only after a deterministic no-network/no-auth local command shape is proven.

Added captured TestNG summary parsing:

- The test report parser now recognizes bounded already-captured TestNG summary lines such as `Total tests run: 4, Passes: 2, Failures: 1, Skips: 1` and `Total tests run: 3, Failures: 1, Skips: 1`, then renders compact `source=testng` counts in `orx tests run`, `/tests run`, and model-visible `run_tests` summaries.
- `Passes`, `Failures`, and `Skips` map to passed, failed, and skipped; when `Passes` is omitted the parser derives passed as total minus failures and skips. The parser runs for node and non-node framework targets, uses the last exact TestNG summary line, rejects mismatched totals, unknown outcome labels, trailing status prose, and malformed TestNG-looking lines, and does not add reporter flags, report files, installs, network, or model-tool exposure changes.
- Verification passed: `npm run typecheck`, focused source `node --import tsx --test src/testing/test-adapters.test.ts`, `npm run build`, focused built `node --test dist/testing/test-adapters.test.js`, `git diff --check`, full `npm test`, `npm run verify:release`, and independent verifier parser review.
- Next likely work after this slice is another optional completion slice such as wrapper-safe report integration, semantic tree-sitter refs/dependency resolution, LSP/SCIP diagnostics/references, or additional scanner adapters only after a deterministic no-network/no-auth local command shape is proven.

Added captured Catch2 summary parsing:

- The test report parser now recognizes bounded already-captured Catch2 summary lines such as `All tests passed (4 assertions in 2 test cases)` and `test cases: 4 | 2 passed | 1 failed | 1 skipped`, then renders compact `source=catch2` counts in `orx tests run`, `/tests run`, and model-visible `run_tests` summaries.
- `passed`, `failed`, and `skipped` outcome segments map directly; `All tests passed (...)` maps all test cases to passed. The parser runs for node and non-node framework targets, uses the last exact Catch2 summary line, rejects mismatched totals, unknown outcome labels, malformed `All tests passed` lines, and trailing status prose, and does not add reporter flags, report files, installs, network, or model-tool exposure changes.
- Verification passed: `npm run typecheck`, focused source `node --import tsx --test src/testing/test-adapters.test.ts`, `npm run build`, focused built `node --test dist/testing/test-adapters.test.js`, `git diff --check`, full `npm test`, `npm run verify:release`, and independent verifier parser review.
- Next likely work after this slice is another optional completion slice such as wrapper-safe report integration, semantic tree-sitter refs/dependency resolution, LSP/SCIP diagnostics/references, or additional scanner adapters only after a deterministic no-network/no-auth local command shape is proven.

Added captured GoogleTest summary parsing:

- The test report parser now recognizes bounded already-captured GoogleTest final summary lines such as `[==========] 4 tests from 2 test suites ran. (12 ms total)`, `[  PASSED  ] 2 tests.`, `[  FAILED  ] 1 test, listed below:`, and `[  SKIPPED ] 1 test, listed below:`, then renders compact `source=gtest` counts in `orx tests run`, `/tests run`, and model-visible `run_tests` summaries.
- `PASSED`, `FAILED`, and `SKIPPED` map to passed, failed, and skipped; the final `[==========] ... ran.` line maps to total and duration when present. The parser runs for node and non-node framework targets, resets counts on the last final total line, rejects mismatched totals, unknown status labels with numeric test counts, malformed final total/status lines, and trailing status prose, and does not add reporter flags, report files, installs, network, or model-tool exposure changes.
- Verification passed: `npm run typecheck`, focused source `node --import tsx --test src/testing/test-adapters.test.ts`, `npm run build`, focused built `node --test dist/testing/test-adapters.test.js`, `git diff --check`, full `npm test`, `npm run verify:release`, and independent verifier parser review.
- Next likely work after this slice is another optional completion slice such as wrapper-safe report integration, semantic tree-sitter refs/dependency resolution, LSP/SCIP diagnostics/references, or additional scanner adapters only after a deterministic no-network/no-auth local command shape is proven.

Added captured testthat bracket summary parsing:

- The test report parser now recognizes bounded already-captured testthat bracket lines such as `[ FAIL 1 | WARN 0 | SKIP 2 | PASS 5 ]`, then renders compact `source=testthat` counts in `orx tests run`, `/tests run`, and model-visible `run_tests` summaries.
- `FAIL`, `SKIP`, and `PASS` map to failed, skipped, and passed; `WARN` is required for exact testthat summary shape but does not inflate totals. The parser runs for node and non-node framework targets, uses the last exact bracket summary line, rejects missing, unknown, duplicate-label, and trailing status-prose bracket summaries, and does not add reporter flags, report files, installs, network, or model-tool exposure changes.
- Verification passed: `npm run typecheck`, focused source `node --import tsx --test src/testing/test-adapters.test.ts`, `npm run build`, focused built `node --test dist/testing/test-adapters.test.js`, `git diff --check`, full `npm test`, `npm run verify:release`, and independent verifier parser review.
- Next likely work after this slice is another optional completion slice such as wrapper-safe report integration, semantic tree-sitter refs/dependency resolution, LSP/SCIP diagnostics/references, or additional scanner adapters only after a deterministic no-network/no-auth local command shape is proven.

Added captured Cucumber scenario summary parsing:

- The test report parser now recognizes bounded already-captured Cucumber scenario lines such as `3 scenarios (1 failed, 2 passed)`, then renders compact `source=cucumber` counts in `orx tests run`, `/tests run`, and model-visible `run_tests` summaries.
- Scenario totals map to total; `passed` and `failed` map directly; `skipped`, `pending`, `undefined`, `ambiguous`, and `unused` map to skipped. The parser runs for node and non-node framework targets, uses the last exact scenario summary line, rejects mismatched totals, unknown outcome labels, and trailing status prose, and does not add reporter flags, report files, installs, network, or model-tool exposure changes.
- Verification passed: `npm run typecheck`, focused source `node --import tsx --test src/testing/test-adapters.test.ts`, `npm run build`, focused built `node --test dist/testing/test-adapters.test.js`, `git diff --check`, full `npm test`, `npm run verify:release`, and independent verifier parser review.
- Next likely work after this slice is another optional completion slice such as wrapper-safe report integration, semantic tree-sitter refs/dependency resolution, LSP/SCIP diagnostics/references, or additional scanner adapters only after a deterministic no-network/no-auth local command shape is proven.

Added captured JUnit Platform console summary parsing:

- The test report parser now recognizes bounded already-captured JUnit Platform console lines such as `[ 4 tests found ]`, `[ 2 tests successful ]`, `[ 1 tests failed ]`, and `[ 1 tests aborted ]`, plus exact `Test run finished after ...` duration lines, then renders compact `source=junit-platform` counts in `orx tests run`, `/tests run`, and model-visible `run_tests` summaries.
- `tests found` maps to total when present; `tests successful`, `tests failed`, and `tests skipped`/`tests aborted` map to passed, failed, and skipped; passed/skipped can be derived as zero only when exact counts exhaust the known total. The parser runs for node and non-node framework targets, rejects impossible counts and trailing bracketed status prose, and does not add reporter flags, report files, installs, network, or model-tool exposure changes.
- Verification passed: `npm run typecheck`, focused source `node --import tsx --test src/testing/test-adapters.test.ts`, `npm run build`, focused built `node --test dist/testing/test-adapters.test.js`, `git diff --check`, full `npm test`, `npm run verify:release`, and independent verifier parser recheck.
- Next likely work after this slice is another optional completion slice such as wrapper-safe report integration, semantic tree-sitter refs/dependency resolution, LSP/SCIP diagnostics/references, or additional scanner adapters only after a deterministic no-network/no-auth local command shape is proven.

Added captured Gradle-style summary parsing:

- The test report parser now recognizes bounded already-captured Gradle completion lines such as `3 tests completed, 1 failed, 1 skipped`, then renders compact `source=gradle` counts in `orx tests run`, `/tests run`, and model-visible `run_tests` summaries.
- `tests completed` maps to total, `failed` and optional `skipped` map to failed and skipped, and passed is derived from the remaining total. The parser runs for node and non-node framework targets, uses the last exact Gradle-style summary line, rejects impossible counts and trailing status prose, and does not add reporter flags, report files, installs, network, or model-tool exposure changes.
- Verification passed: `npm run typecheck`, focused source `node --import tsx --test src/testing/test-adapters.test.ts`, `npm run build`, focused built `node --test dist/testing/test-adapters.test.js`, `git diff --check`, full `npm test`, `npm run verify:release`, and independent verifier parser review.
- Next likely work after this slice is another optional completion slice such as wrapper-safe report integration, semantic tree-sitter refs/dependency resolution, LSP/SCIP diagnostics/references, or additional scanner adapters only after a deterministic no-network/no-auth local command shape is proven.

Added captured ExUnit summary parsing:

- The test report parser now recognizes bounded already-captured ExUnit final lines such as `3 tests, 1 failure, 1 skipped`, optional `N doctests, ...` prefixes, and exact `Finished in ... seconds` duration lines, then renders compact `source=exunit` counts in `orx tests run`, `/tests run`, and model-visible `run_tests` summaries.
- `tests` plus optional `doctests` provide the total; `failures` and optional `skipped` map to failed and skipped; passed is derived from the remaining total. The parser runs for node and non-node framework targets, uses the last exact ExUnit summary line, rejects impossible counts and trailing status prose, and does not add reporter flags, report files, installs, network, or model-tool exposure changes.
- Verification passed: `npm run typecheck`, focused source `node --import tsx --test src/testing/test-adapters.test.ts`, `npm run build`, focused built `node --test dist/testing/test-adapters.test.js`, `git diff --check`, full `npm test`, `npm run verify:release`, and independent verifier parser recheck.
- Next likely work after this slice is another optional completion slice such as wrapper-safe report integration, semantic tree-sitter refs/dependency resolution, LSP/SCIP diagnostics/references, or additional scanner adapters only after a deterministic no-network/no-auth local command shape is proven.

Added captured Deno-style summary parsing:

- The test report parser now recognizes bounded already-captured Deno final lines such as `test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out (2ms)`, then renders compact `source=deno` counts in `orx tests run`, `/tests run`, and model-visible `run_tests` summaries.
- `passed`, `failed`, and `ignored` map to passed, failed, and skipped; measured and filtered-out counts are ignored for test totals; parenthesized `ms` or `s` duration is captured; the parser runs for node and non-node framework targets. The status label must match whether failures are present, the parser uses the last exact Deno-style summary line, rejects trailing status prose, and does not add reporter flags, report files, installs, network, or model-tool exposure changes.
- Verification passed: `npm run typecheck`, focused source `node --import tsx --test src/testing/test-adapters.test.ts`, `npm run build`, focused built `node --test dist/testing/test-adapters.test.js`, `git diff --check`, full `npm test`, `npm run verify:release`, and independent verifier parser recheck.
- Next likely work after this slice is another optional completion slice such as wrapper-safe report integration, semantic tree-sitter refs/dependency resolution, LSP/SCIP diagnostics/references, or additional scanner adapters only after a deterministic no-network/no-auth local command shape is proven.

Added captured Zig native summary parsing:

- The test report parser now recognizes bounded already-captured Zig native test runner final lines such as `All 3 tests passed.`, `2 passed; 1 skipped; 1 failed.`, and simple-backend `2 passed, 1 skipped, 0 failed`, then renders compact `source=zig` counts in `orx tests run`, `/tests run`, and model-visible `run_tests` summaries.
- The parser maps Zig passed/skipped/failed directly, accepts Zig's known post-summary diagnostics (`errors were logged`, `tests leaked memory`, and `fuzz tests found`) without changing counts, uses the last exact Zig summary line, rejects malformed Zig-looking lines and arbitrary trailing prose before generic fallback, and does not add reporter flags, report files, installs, Zig invocation changes, network, or model-tool exposure changes.
- Verification passed: `npm run typecheck`, focused source `node --import tsx --test src/testing/test-adapters.test.ts`, `git diff --check`, `npm run build`, focused built `node --test dist/testing/test-adapters.test.js`, direct built parser smoke for Zig positive/fail-closed cases, full `npm test` (537 tests), `npm run verify:release`, and independent read-only verifier `019f1d72-6dfc-7763-b516-c4670b04fce7` with no findings.
- Next likely work after this slice is another optional completion slice such as wrapper-safe report integration, semantic tree-sitter refs/dependency resolution, LSP/SCIP diagnostics/references, or additional scanner adapters only after a deterministic no-network/no-auth local command shape is proven.

Added captured Bun-style summary parsing:

- The test report parser now recognizes bounded already-captured Bun default-console summary lines such as `4 pass`, `0 fail`, and `Ran 4 tests in 1.44ms` or `Ran 3 tests across 2 files. [50.00ms]`, then renders compact `source=bun` counts in `orx tests run`, `/tests run`, and model-visible `run_tests` summaries.
- `pass` maps to passed, `fail` maps to failed, total is validated against the `Ran` line, optional file counts and durations are captured, and the parser runs for node and non-node framework targets. The parser uses the last exact Bun-style summary group, rejects inconsistent totals, missing pass/fail/run lines, trailing run-line prose, and malformed count labels, and does not add reporter flags, report files, installs, network, or model-tool exposure changes.
- Verification: `npm run typecheck`, focused source parser test, `npm run build`, focused built parser test, `git diff --check`, full `npm test` (537 tests), `npm run verify:release`, and independent verifier review/recheck passed.
- Next likely work after this slice is another optional completion slice such as wrapper-safe report integration, semantic tree-sitter refs/dependency resolution, LSP/SCIP diagnostics/references, or additional scanner adapters only after a deterministic no-network/no-auth local command shape is proven.

Added captured Karma-style summary parsing:

- The test report parser now recognizes bounded already-captured Karma progress-reporter final `TOTAL:` lines such as `TOTAL: 1 FAILED, 2 SUCCESS, 1 SKIPPED`, then renders compact `source=karma` counts in `orx tests run`, `/tests run`, and model-visible `run_tests` summaries.
- `SUCCESS` maps to passed, `FAILED` maps to failed, `SKIPPED` maps to skipped, and total is derived from those segments. The parser runs for node and non-node framework targets, uses the last exact Karma-style `TOTAL:` summary line, rejects trailing status prose, unknown labels, and non-uppercase `TOTAL:` shapes, and does not add reporter flags, report files, installs, network, or model-tool exposure changes.
- Verification: `npm run typecheck`, focused source parser test, `npm run build`, focused built parser test, `git diff --check`, full `npm test` (537 tests), `npm run verify:release`, and independent verifier review passed.
- Next likely work after this slice is another optional completion slice such as wrapper-safe report integration, semantic tree-sitter refs/dependency resolution, LSP/SCIP diagnostics/references, or additional scanner adapters only after a deterministic no-network/no-auth local command shape is proven.

Added captured Bazel aggregate summary parsing:

- The test report parser now recognizes bounded already-captured Bazel final aggregate lines such as `Executed 2 out of 3 tests: 1 test passes, 1 fails locally, and 1 was skipped.`, then renders compact `source=bazel` target counts in `orx tests run`, `/tests run`, and model-visible `run_tests` summaries.
- The parser maps Bazel pass targets to passed, folds failed-to-build/local-failure/remote-failure buckets into failed, maps no-status/skipped targets to skipped, validates the aggregate phrase sums to the reported target total, allows executed targets to be lower for cached results, uses the last exact Bazel aggregate line, rejects malformed Bazel-looking lines before generic fallback, and does not add reporter flags, report files, installs, Bazel invocation changes, network, or model-tool exposure changes.
- Verification passed: `npm run typecheck`, focused source `node --import tsx --test src/testing/test-adapters.test.ts`, `git diff --check`, `npm run build`, focused built `node --test dist/testing/test-adapters.test.js`, direct built parser smoke for Bazel/XCTest/fail-closed fallback, full `npm test` (537 tests), `npm run verify:release`, and independent read-only verifier `019f1d68-f16e-7be0-86f8-234828b04dd0` with no findings.
- Next likely work after this slice is another optional completion slice such as wrapper-safe report integration, semantic tree-sitter refs/dependency resolution, LSP/SCIP diagnostics/references, or additional scanner adapters only after a deterministic no-network/no-auth local command shape is proven.

Added captured Ruby Minitest summary parsing:

- The test report parser now recognizes bounded already-captured Ruby Minitest final lines such as `3 runs, 6 assertions, 1 failures, 1 errors, 1 skips` plus optional exact `Finished in 0.123456s, 24.3000 runs/s, 48.6000 assertions/s.`, then renders compact `source=minitest` counts in `orx tests run`, `/tests run`, and model-visible `run_tests` summaries.
- `Failures` plus `Errors` map to failed, `Skips` maps to skipped, and passed is derived from `Runs` minus failed and skipped. The parser runs for node and non-node framework targets, uses the last exact Minitest summary line, rejects overcounted totals and trailing status prose, ignores malformed duration lines that are not exact Minitest timing summaries, and does not add reporter flags, report files, installs, network, or model-tool exposure changes.
- Verification: `npm run typecheck`, focused source parser test, `npm run build`, focused built parser test, `git diff --check`, full `npm test` (537 tests), `npm run verify:release`, and independent verifier review passed.
- Next likely work after this slice is another optional completion slice such as wrapper-safe report integration, semantic tree-sitter refs/dependency resolution, LSP/SCIP diagnostics/references, or additional scanner adapters only after a deterministic no-network/no-auth local command shape is proven.

Added captured XCTest summary parsing:

- The test report parser now recognizes bounded already-captured XCTest final lines such as `Executed 3 tests, with 1 failure (1 unexpected) in 0.123 (0.124) seconds`, then renders compact `source=xctest` counts in `orx tests run`, `/tests run`, and model-visible `run_tests` summaries.
- The parser derives passed as total minus failures, validates that failures do not exceed total and unexpected failures do not exceed failures, uses the last exact XCTest summary line, rejects zero-total summaries and trailing prose, and does not add reporter flags, report files, installs, network, or model-tool exposure changes.
- Verification: `npm run typecheck`, focused source parser test, focused source shell-summary test, `npm run build`, focused built parser test, focused built shell-summary test, `git diff --check`, full `npm test` (537 tests), `npm run verify:release`, and independent verifier review/recheck passed. Verifier-requested newline-trailing-prose and generic-fallback regressions were fixed before final gates; the shell-summary duration assertion was also hardened to accept the existing seconds-format output under slow full-suite runs.
- Next likely work after this slice is another optional completion slice such as wrapper-safe report integration, semantic tree-sitter refs/dependency resolution, LSP/SCIP diagnostics/references, or additional scanner adapters only after a deterministic no-network/no-auth local command shape is proven.

Added captured CTest summary parsing:

- The test report parser now recognizes bounded already-captured CTest final lines such as `100% tests passed, 0 tests failed out of 5` plus optional exact `Total Test time (real) = 0.12 sec`, then renders compact `source=ctest` counts in `orx tests run`, `/tests run`, and model-visible `run_tests` summaries.
- The parser validates failed/total counts against the reported percentage, derives passed as total minus failed, uses the last exact CTest summary line, rejects inconsistent percentages, zero-total summaries, summary trailing prose, and malformed `Total Test time` lines, and does not add reporter flags, report files, installs, network, or model-tool exposure changes.
- Verification: `npm run typecheck`, focused source parser test, `npm run build`, focused built parser test, `git diff --check`, full `npm test` (537 tests), `npm run verify:release`, and independent verifier review passed.
- Next likely work after this slice is another optional completion slice such as wrapper-safe report integration, semantic tree-sitter refs/dependency resolution, LSP/SCIP diagnostics/references, or additional scanner adapters only after a deterministic no-network/no-auth local command shape is proven.

Added captured `.NET test` summary parsing:

- The test report parser now recognizes bounded already-captured `.NET test` final lines such as `Passed! - Failed: 0, Passed: 10, Skipped: 1, Total: 11, Duration: 123 ms - Example.Tests.dll (net8.0)` and `Failed! - Failed: 1, Passed: 2, Skipped: 1, Total: 4`, then renders compact `source=dotnet` counts in `orx tests run`, `/tests run`, and model-visible `run_tests` summaries.
- The parser validates the ordered `Failed`/`Passed`/`Skipped`/`Total` counts, requires the status label to match whether failures are present, derives no counts from prose, uses the last exact `.NET test` summary line, rejects inconsistent totals and trailing duration prose, and does not add reporter flags, report files, installs, network, or model-tool exposure changes.
- Verification: `npm run typecheck`, focused source parser test, `npm run build`, focused built parser test, `git diff --check`, full `npm test` (537 tests), `npm run verify:release`, and independent verifier review/recheck passed. The verifier-requested dashed duration prose regression was fixed before final gates.
- Next likely work after this slice is another optional completion slice such as wrapper-safe report integration, semantic tree-sitter refs/dependency resolution, LSP/SCIP diagnostics/references, or additional scanner adapters only after a deterministic no-network/no-auth local command shape is proven.

Added captured PHPUnit-style text summary parsing:

- The test report parser now recognizes bounded already-captured PHPUnit final lines such as `OK (3 tests, 5 assertions)` and `Tests: 6, Assertions: 8, Errors: 1, Failures: 1, Skipped: 1, Incomplete: 1, Risky: 1.`, then renders compact `source=phpunit` counts in `orx tests run`, `/tests run`, and model-visible `run_tests` summaries.
- `Errors`, `Failures`, and `Risky` map to failed, `Skipped` maps to skipped, `Incomplete` maps to todo, and passed is derived from `Tests` minus failed, skipped, and todo. The parser runs for node and non-node framework targets, uses the last exact PHPUnit-style text summary line, rejects overcounted totals and trailing prose, and does not add reporter flags, report files, installs, network, or model-tool exposure changes.
- Verification: `npm run typecheck`, focused source parser test, `npm run build`, focused built parser test, `git diff --check`, full `npm test` (537 tests), `npm run verify:release`, and independent verifier review passed.
- Next likely work after this slice is another optional completion slice such as wrapper-safe report integration, semantic tree-sitter refs/dependency resolution, LSP/SCIP diagnostics/references, or additional scanner adapters only after a deterministic no-network/no-auth local command shape is proven.

Added captured JUnit/Surefire-style text summary parsing:

- The test report parser now recognizes bounded already-captured lines such as `Tests run: 6, Failures: 1, Errors: 1, Skipped: 2, Time elapsed: 0.123 s -- in com.example.FooTest`, with optional Maven log prefixes, failure/error markers, elapsed time, and class suffixes, then renders compact `source=junit-text` counts in `orx tests run`, `/tests run`, and model-visible `run_tests` summaries.
- `Failures` plus `Errors` map to failed, `Skipped` maps to skipped, and passed is derived from `Tests run` minus failed and skipped. The parser runs for node and non-node framework targets, uses the last exact JUnit/Surefire-style text summary line, rejects overcounted totals and trailing prose, and does not add reporter flags, report files, installs, network, or model-tool exposure changes.
- Verification: `npm run typecheck`, focused source parser test, `npm run build`, focused built parser test, `git diff --check`, full `npm test` (537 tests), `npm run verify:release`, and independent verifier review/recheck passed. Verifier-requested marker/suffix independence and node-framework parser-list regressions were fixed before final gates.
- Next likely work after this slice is another optional completion slice such as wrapper-safe report integration, semantic tree-sitter refs/dependency resolution, LSP/SCIP diagnostics/references, or additional scanner adapters only after a deterministic no-network/no-auth local command shape is proven.

Added captured Python unittest summary parsing:

- The test report parser now recognizes bounded already-captured Python `unittest` final summaries with exact `Ran N tests in Ns` plus `OK` or `FAILED (...)` lines, then renders compact `source=unittest` counts in `orx tests run`, `/tests run`, and model-visible `run_tests` summaries.
- `failures`, `errors`, and `unexpected successes` map to failed; `skipped` maps to skipped; `expected failures` maps to todo. The parser rejects trailing prose, unknown detail keys, `OK` lines with failure counts, `FAILED` lines without failure counts, and inconsistent totals.
- Verification: `npm run typecheck`, focused source parser test, direct trailing-prose parser probe, `npm run build`, focused built parser test, `git diff --check`, full `npm test` (537 tests), `npm run verify:release`, and independent verifier review/recheck passed. The verifier-requested post-status trailing-prose regression was fixed before final gates.
- Next likely work after this slice is another optional completion slice such as wrapper-safe report integration, semantic tree-sitter refs/dependency resolution, LSP/SCIP diagnostics/references, or additional scanner adapters only after a deterministic no-network/no-auth local command shape is proven.

Added runnable gopls diagnostics profile:

- Promoted `gopls` from diagnostics catalog-only to a guarded explicit local runner. `orx diagnostics run gopls --project <local-go-file> [--json]`, `orx diag run gopls ...`, `/diagnostics run gopls ...`, and `/diag run gopls ...` use an already-installed `node_modules/.bin/gopls` or PATH `gopls`, probe PATH with `gopls version`, run `gopls check <go-file>`, parse bounded `file:line:column: message` diagnostics, and keep ORX-owned JSON metadata.
- The gopls runner reuses the diagnostics trust boundary: no installs, no package-manager/launcher calls, no model-tool exposure, shell disabled, cleaned env without ORX/OpenRouter/Brave/API token-like values, cwd-confined regular `.go` file guard with symlink realpath checks, and bounded/redacted stdout/stderr. The child env pins `GOPROXY=off`, `GOSUMDB=off`, and `GOTOOLCHAIN=local` to avoid proxy/checksum/toolchain download paths by command selection.
- Verification after fixing verifier findings: `npm run typecheck`, focused source diagnostics tests, `npm run build`, focused built diagnostics tests, `git diff --check`, full `npm test` (537 tests), `npm run verify:release`, and an independent read-only verifier recheck passed. The verifier specifically confirmed missing/default gopls project targets and directory targets are rejected before spawn, PATH discovery uses `gopls version`, and runnable gopls then calls `gopls check <go-file>`.
- Next likely work after this slice is another optional completion slice such as LSP/SCIP diagnostics/references, wrapper-safe report integration, semantic tree-sitter refs/dependency resolution, or additional scanner adapters only after a deterministic no-network/no-auth local command shape is proven.

Added captured RSpec summary parsing:

- The test report parser now recognizes bounded already-captured RSpec summary lines such as `3 examples, 1 failure, 1 pending`, then renders compact `source=rspec` counts in `orx tests run`, `/tests run`, and model-visible `run_tests` summaries.
- Optional canonical RSpec duration lines such as `Finished in 0.123 seconds (files took 0.456 seconds to load)` are parsed when present. The parser requires the exact examples/failures/pending summary shape, rejects inconsistent totals, and ignores trailing non-RSpec duration prose.
- Verification: `npm run typecheck`, `npm run build`, focused `node --import tsx --test src/testing/test-adapters.test.ts` and `node --test dist/testing/test-adapters.test.js` with 12 tests each, `git diff --check`, full `npm test` with 537 tests, `npm run verify:release`, and independent verifier review/recheck passed. The verifier-requested `failures + pending > examples` regression was added before final gates.
- Next likely work after this slice is another optional completion slice such as additional non-JSON/custom reporter parsing, wrapper-safe report integration, semantic tree-sitter refs/dependency resolution, or LSP/SCIP diagnostics/references.

Added captured Go test verbose report parsing:

- The test report parser now recognizes bounded already-captured Go verbose test lines such as `--- PASS: TestAlpha (0.01s)`, `--- FAIL: TestBeta (0.02s)`, and `--- SKIP: TestSkip (0.00s)`, then renders compact `source=go` counts in `orx tests run`, `/tests run`, and model-visible `run_tests` summaries.
- Package summary durations such as `ok example.com/pkg 0.12s` or `FAIL example.com/pkg 0.12s` are aggregated when present. The parser requires Go's explicit verbose `--- PASS/FAIL/SKIP:` shape and ignores bare `PASS:` lines, prose with spaces where a test name should be, and trailing non-Go text.
- Verification: `npm run typecheck`, `npm run build`, focused `node --import tsx --test src/testing/test-adapters.test.ts` and `node --test dist/testing/test-adapters.test.js` with 12 tests each, `git diff --check`, full `npm test` with 537 tests, `npm run verify:release`, and independent verifier review/recheck passed. The initial verifier finding for lowercase status-marker false positives was fixed with exact marker matching plus regression assertions before final gates.
- Next likely work after this slice is another optional completion slice such as additional non-JSON/custom reporter parsing, wrapper-safe report integration, semantic tree-sitter refs/dependency resolution, or LSP/SCIP diagnostics/references.

Added captured Cargo/Rust test report parsing:

- The test report parser now recognizes bounded already-captured Rust/Cargo `test result: ok/FAILED.` summary lines, then renders compact `source=cargo` counts in `orx tests run`, `/tests run`, and model-visible `run_tests` summaries.
- Multiple valid Cargo harness summary lines are aggregated across the captured output; `passed` maps to passed, `failed` maps to failed, `ignored` maps to skipped, and `measured` / `filtered out` do not inflate totals. The parser requires the explicit `test result:` prefix and ignores bare count lines such as `3 passed; 2 failed; finished in 0.42s`.
- The slice is parser-only: it does not add reporter flags, create report files, execute configs, install packages, call network, expose a new model tool, or relax wrapper/custom-runner/post-step fallback behavior.
- Verification: `npm run typecheck`, `npm run build`, focused `node --import tsx --test src/testing/test-adapters.test.ts` and `node --test dist/testing/test-adapters.test.js` with 12 tests each, `git diff --check`, full `npm test` with 537 tests, `npm run verify:release`, and independent verifier review/recheck passed. The initial verifier finding for multiple Cargo harness summaries was fixed with aggregation plus regression assertions before final gates.
- Next likely work after this slice is another optional completion slice such as additional non-JSON/custom reporter parsing, wrapper-safe report integration, semantic tree-sitter refs/dependency resolution, or LSP/SCIP diagnostics/references.

Added captured pytest-style test report parsing:

- The test report parser now recognizes bounded already-captured pytest-style summary lines such as `2 failed, 3 passed, 1 skipped, 1 xfailed in 1.23s`, then renders compact `source=pytest` counts in `orx tests run`, `/tests run`, and model-visible `run_tests` summaries.
- The parser requires a strict comma-separated outcome summary with an `in <seconds>s` duration and rejects near misses such as `2 failed network requests in 1.2s` or warning-only summaries. The slice is parser-only: it does not add reporter flags, create report files, execute configs, install packages, call network, expose a new model tool, or relax wrapper/custom-runner/post-step fallback behavior.
- Verification: `npm run typecheck`, `npm run build`, focused `node --import tsx --test src/testing/test-adapters.test.ts` and `node --test dist/testing/test-adapters.test.js` with 12 tests each, `git diff --check`, full `npm test` with 537 tests, `npm run verify:release`, and independent verifier review/recheck passed. The initial verifier finding for trailing text after the pytest duration was fixed with an end-of-line duration guard plus regression assertion before final gates.
- Next likely work after this slice is another optional completion slice such as additional non-JSON/custom reporter parsing, wrapper-safe report integration, semantic tree-sitter refs/dependency resolution, or LSP/SCIP diagnostics/references.

Added captured Mocha-style test report parsing:

- The test report parser now recognizes bounded already-captured Mocha-style summary lines such as `2 passing (35ms)`, `1 failing`, and `1 pending`, then renders compact `source=mocha` counts in `orx tests run`, `/tests run`, and model-visible `run_tests` summaries.
- The parser requires a passing or failing line so a lone pending/status-like line does not become a report. The slice is parser-only: it does not add reporter flags, create report files, execute configs, install packages, call network, expose a new model tool, or relax wrapper/custom-runner/post-step fallback behavior.
- Verification: `npm run typecheck`, `npm run build`, focused `node --import tsx --test src/testing/test-adapters.test.ts` and `node --test dist/testing/test-adapters.test.js` with 12 tests each, `git diff --check`, full `npm test` with 537 tests, `npm run verify:release`, and independent verifier review passed.
- Next likely work after this slice is another optional completion slice such as additional non-JSON/custom reporter parsing, wrapper-safe report integration, semantic tree-sitter refs/dependency resolution, or LSP/SCIP diagnostics/references.

Added captured TAP test report parsing:

- The test report parser now recognizes bounded already-captured TAP output with `TAP version` markers, `1..N` plans, top-level `ok` / `not ok` result lines, and `# pass` / `# fail` / `# skipped` / `# todo` / `# duration_ms` summaries, then renders compact `source=tap` counts in `orx tests run`, `/tests run`, and model-visible `run_tests` summaries.
- The slice is parser-only: it does not add reporter flags, create report files, execute configs, install packages, call network, expose a new model tool, or relax wrapper/custom-runner/post-step fallback behavior.
- Verification: `npm run typecheck`, `npm run build`, focused `node --import tsx --test src/testing/test-adapters.test.ts` and `node --test dist/testing/test-adapters.test.js` with 12 tests each, `git diff --check`, full `npm test` with 537 tests, `npm run verify:release`, and independent verifier review/recheck passed. The initial verifier finding for plan-only `1..4` false positives was fixed with a guard plus regression assertion before final gates.
- Next likely work after this slice is another optional completion slice such as additional non-JSON/custom reporter parsing, wrapper-safe report integration, semantic tree-sitter refs/dependency resolution, or LSP/SCIP diagnostics/references.

Added tree-sitter bounded repo outline previews:

- Added `repo-outline` mode to the optional local tree-sitter adapter. `orx code tree-sitter repo-outline [path]`, `orx tree-sitter repo-outline [path]`, `/code tree-sitter repo-outline [path]`, and `/tree-sitter repo-outline [path]` scan bounded cwd-confined source files, skip generated/vendor directories, and render path-aware AST definition-like outline previews across files.
- Repo-outline extraction runs installed local `tree-sitter parse` per bounded file with shell disabled and cleaned env, reuses source-range name extraction from single-file outline mode, reports file/outline omissions, and keeps the output explicitly AST-backed but not semantic symbol resolution.
- The slice preserves the existing code-intelligence boundary: no API key, no installs, no network, no mutation, no model-tool exposure, cwd-confined file/repo path guards, symlink rejection for explicit targets, generated/vendor skips, bounded file count/depth/source size/parse output/outline entries, redaction, and lexical code-map/symbol/ref/import/call commands as fallback.
- Verification: `npm run typecheck`, `npm run build`, focused `node --test dist/code-map/code-map.test.js dist/cli.test.js dist/slash/index.test.js` with 170 tests, `git diff --check`, full `npm test` with 537 tests, `npm run verify:release`, independent verifier review, and missing-tool `node dist/cli.js code tree-sitter repo-outline src/cli.ts` plus `node dist/cli.js tree-sitter repo-outline src/cli.ts` smokes passed. Live grammar-backed tree-sitter smoke was unavailable because `tree-sitter` is not installed on PATH in this environment.
- Next likely work after this slice is another optional completion slice such as semantic tree-sitter refs, package/semantic dependency resolution beyond current safe local previews, LSP/SCIP diagnostics/references, non-JSON/custom reporter integration, or wrapper-safe report integration.

Added tree-sitter bounded repo dependency previews:

- Added `repo-deps` mode to the optional local tree-sitter adapter. `orx code tree-sitter repo-deps [path]`, `orx tree-sitter repo-deps [path]`, `/code tree-sitter repo-deps [path]`, and `/tree-sitter repo-deps [path]` scan bounded cwd-confined source files, skip generated/vendor directories, and render AST import-source edges with local relative resolution against the scanned source set where possible.
- Repo-dep extraction runs installed local `tree-sitter parse` per bounded file with shell disabled and cleaned env, reuses source-range extraction for static imports, re-exports, CommonJS `require(...)`, and dynamic `import(...)`, reports file/dependency omissions, counts local/external/unresolved-local imports separately, and keeps the output explicitly AST-backed but not package-manager, semantic, or full dependency resolution.
- The slice preserves the existing code-intelligence boundary: no API key, no installs, no network, no mutation, no model-tool exposure, cwd-confined file/repo path guards, symlink rejection for explicit targets, generated/vendor skips, bounded file count/depth/source size/parse output/dependency edges, redaction, and lexical code-map/symbol/ref/import/call commands as fallback.
- Verification: `npm run typecheck`, `npm run build`, focused `node --test dist/code-map/code-map.test.js dist/cli.test.js dist/slash/index.test.js` with 168 tests, `git diff --check`, full `npm test` with 535 tests, `npm run verify:release`, independent verifier review, and missing-tool `node dist/cli.js code tree-sitter repo-deps src/cli.ts` smoke passed. Live grammar-backed tree-sitter smoke was unavailable because `tree-sitter` is not installed on PATH in this environment.
- Next likely work after this slice is another optional completion slice such as semantic tree-sitter refs, package/semantic dependency resolution beyond current safe local previews, LSP/SCIP diagnostics/references, non-JSON/custom reporter integration, or wrapper-safe report integration.

Added tree-sitter bounded repo imports:

- Added `repo-imports` mode to the optional local tree-sitter adapter. `orx code tree-sitter repo-imports [path]`, `orx tree-sitter repo-imports [path]`, `/code tree-sitter repo-imports [path]`, and `/tree-sitter repo-imports [path]` scan bounded cwd-confined source files, skip generated/vendor directories, and render path-aware AST import-source previews across files.
- Repo-import extraction runs installed local `tree-sitter parse` per bounded file with shell disabled and cleaned env, reuses source-range extraction for static imports, re-exports, CommonJS `require(...)`, and dynamic `import(...)`, reports file/import omissions, and keeps the output explicitly AST-backed but not dependency resolution.
- The slice preserves the existing code-intelligence boundary: no API key, no installs, no network, no mutation, no model-tool exposure, cwd-confined file/repo path guards, symlink rejection for explicit targets, generated/vendor skips, bounded file count/depth/source size/parse output/import edges, redaction, and lexical code-map/symbol/ref/import/call commands as fallback.
- Verification: focused `npm run typecheck`, `npm run build`, and `node --test dist/code-map/code-map.test.js dist/cli.test.js dist/slash/index.test.js` with 166 tests passed; `git diff --check`, full `npm test` with 533 tests, `npm run verify:release`, independent verifier review, and missing-tool `node dist/cli.js code tree-sitter repo-imports src/cli.ts` smoke passed. Live grammar-backed tree-sitter smoke was unavailable because `tree-sitter` is not installed on PATH in this environment.
- Next likely work after this slice is another optional completion slice such as semantic tree-sitter refs, dependency resolution, LSP/SCIP diagnostics/references, non-JSON/custom reporter integration, or wrapper-safe report integration.

Added tree-sitter bounded repo calls:

- Added `repo-calls` mode to the optional local tree-sitter adapter. `orx code tree-sitter repo-calls [path]`, `orx tree-sitter repo-calls [path]`, `/code tree-sitter repo-calls [path]`, and `/tree-sitter repo-calls [path]` scan bounded cwd-confined source files, skip generated/vendor directories, and render path-aware AST call-expression previews across files.
- Repo-call extraction runs installed local `tree-sitter parse` per bounded file with shell disabled and cleaned env, reuses source-range extraction for caller/callee names, reports file/call omissions, and keeps the output explicitly AST-backed but not semantic call resolution.
- The slice preserves the existing code-intelligence boundary: no API key, no installs, no network, no mutation, no model-tool exposure, cwd-confined file/repo path guards, symlink rejection for explicit targets, generated/vendor skips, bounded file count/depth/source size/parse output/call edges, redaction, and lexical code-map/symbol/ref/import/call commands as fallback.
- Verification: focused `npm run typecheck`, `npm run build`, and `node --test dist/code-map/code-map.test.js dist/cli.test.js dist/slash/index.test.js` with 163 tests passed; `git diff --check`, full `npm test` with 458 tests, `npm run verify:release`, and independent verifier recheck passed after adding the verifier-requested repo-call failure/timeout/truncation coverage.
- Next likely work after this slice is another optional completion slice such as semantic tree-sitter refs, cross-file dependency resolution, LSP/SCIP diagnostics/references, non-JSON/custom reporter integration, or wrapper-safe report integration.

Added tree-sitter bounded repo refs:

- Added `repo-refs` mode to the optional local tree-sitter adapter. `orx code tree-sitter repo-refs <query> [path]`, `orx tree-sitter repo-refs <query> [path]`, `/code tree-sitter repo-refs <query> [path]`, and `/tree-sitter repo-refs <query> [path]` scan bounded cwd-confined source files, skip generated/vendor directories, and render exact AST identifier matches across files for identifier-like queries.
- Repo-ref extraction runs installed local `tree-sitter parse` per bounded file with shell disabled and cleaned env, reuses source-range extraction for names/roles, reports file/match omissions, and keeps the output explicitly AST-backed but not semantic resolution.
- The slice preserves the existing code-intelligence boundary: no API key, no installs, no network, no mutation, no model-tool exposure, cwd-confined file/repo path guards, symlink rejection for explicit targets, generated/vendor skips, bounded file count/depth/source size/parse output, redaction, and lexical code-map/symbol/ref/import/call commands as fallback.
- Verification: focused `npm run typecheck`, `npm run build`, and `node --test dist/code-map/code-map.test.js dist/cli.test.js dist/slash/index.test.js` with 160 tests passed; `git diff --check`, full `npm test` with 527 tests, `npm run verify:release`, and independent verifier recheck passed after fixing the generated/vendor direct-target guard finding.
- Next likely work after this slice is another optional completion slice such as semantic tree-sitter refs, cross-file tree-sitter calls/dependencies, LSP/SCIP diagnostics/references, non-JSON/custom reporter integration, or wrapper-safe report integration.

Added config-declared framework JSON report parsing:

- `runTestTarget` can now parse changed, cwd-confined Jest/Vitest/Playwright JSON report files declared only in fixed local framework config files for exact final direct `jest`, `vitest`, or `playwright test` package-script invocations.
- Config files are read as bounded local text only; ORX does not execute them, does not add reporter/output flags for this path, and does not create, mutate, or delete the config-declared report files.
- The slice preserves the existing test adapter boundary: shell disabled, bounded output, sanitized extra args, no installs, no network, no new model tool, stale/unchanged files ignored, symlink/out-of-cwd report paths ignored, reporter/output overrides ignored, and wrapper/custom-runner/post-step scripts kept on stdout/stderr fallback.
- Verification: focused `npm run typecheck`, `npm run build`, and `node --test dist/testing/test-adapters.test.js` with 12 tests passed; `git diff --check`, full `npm test` with 526 tests, `npm run verify:release`, and independent verifier review passed.
- Next likely work after this slice is another optional completion slice such as non-JSON/custom reporter integration, wrapper-safe report integration, semantic/cross-file tree-sitter refs/calls, or LSP/SCIP diagnostics/references.

Added tree-sitter AST refs:

- Added `refs` mode to the optional local tree-sitter adapter. `orx code tree-sitter refs <file> <query>`, `orx tree-sitter refs <file> <query>`, and `/code tree-sitter refs <file> <query>` reuse the guarded `tree-sitter parse <file>` path and render bounded exact AST identifier matches for an identifier-like query.
- Ref extraction reads the already guarded target source file to map tree-sitter identifier ranges back to names, records the AST node kind and field role, and keeps the output explicitly single-file/AST-backed rather than claiming semantic or cross-file reference resolution.
- The slice preserves the existing tree-sitter boundary: installed local CLI only, shell disabled, cleaned env, cwd-confined regular-file guards, bounded/redacted output, no network, no installs, no mutation, no model-tool exposure, and lexical code-map/symbol/ref/import/call commands as fallback.
- Verification: `git diff --check`, `npm run typecheck`, `npm run build`, focused `node --test dist/code-map/code-map.test.js dist/cli.test.js dist/slash/index.test.js` with 159 tests, full `npm test` with 525 tests, `npm run verify:release`, and independent verifier recheck passed. The verifier-identified residual coverage gaps for top-level `orx tree-sitter refs`, direct `/tree-sitter refs`, and control-character query rejection were formalized in tests.
- Next likely work after this slice is another optional completion slice such as semantic/cross-file tree-sitter refs/calls, LSP/SCIP diagnostics/references, non-JSON/custom reporter integration, or wrapper-safe report integration.

Added tree-sitter AST import extraction:

- Added `imports` mode to the optional local tree-sitter adapter. `orx code tree-sitter imports <file>`, `orx tree-sitter imports <file>`, and `/code tree-sitter imports <file>` reuse the guarded `tree-sitter parse <file>` path and render bounded single-file AST import-like module specifiers.
- Import extraction reads the already guarded target source file to map tree-sitter source ranges back to module specifiers for static imports, re-exports with sources, CommonJS `require(...)`, and dynamic `import(...)`, without claiming cross-file resolution.
- The slice preserves the existing tree-sitter boundary: installed local CLI only, shell disabled, cleaned env, cwd-confined regular-file guards, bounded/redacted output, no network, no installs, no mutation, no model-tool exposure, and lexical code-map/symbol/ref/import/call commands as fallback.
- Verification: `git diff --check`, `npm run typecheck`, `npm run build`, focused `node --test dist/code-map/code-map.test.js dist/cli.test.js dist/slash/index.test.js` with 159 tests, full `npm test` with 525 tests, `npm run verify:release`, and independent verifier recheck passed. The verifier-found nested-argument false positive for non-literal `require(...)` and dynamic `import(...)` was fixed and regression-tested.
- Next likely work after this slice is another optional completion slice such as semantic/cross-file tree-sitter refs/calls, LSP/SCIP diagnostics/references, non-JSON/custom reporter integration, or wrapper-safe report integration.

Added tree-sitter AST call extraction:

- Added `calls` mode to the optional local tree-sitter adapter. `orx code tree-sitter calls <file>`, `orx tree-sitter calls <file>`, and `/code tree-sitter calls <file>` reuse the guarded `tree-sitter parse <file>` path and render bounded single-file AST call edges.
- Call extraction reads the already guarded target source file to map tree-sitter source ranges back to names, chooses the nearest named enclosing definition as the caller, and keeps the output explicitly single-file/AST-backed rather than claiming cross-file resolution.
- The slice preserves the existing tree-sitter boundary: installed local CLI only, shell disabled, cleaned env, cwd-confined regular-file guards, bounded/redacted output, no network, no installs, no mutation, no model-tool exposure, and lexical code-map/symbol/ref/import/call commands as fallback.
- Verification: `git diff --check`, `npm run typecheck`, `npm run build`, focused `node --test dist/code-map/code-map.test.js dist/cli.test.js dist/slash/index.test.js` with 158 tests, full `npm test` with 524 tests, `npm run verify:release`, and independent verifier final recheck passed. Initial verifier findings around anonymous function caller ownership and anonymous IIFE callee overclaiming were fixed and rechecked.
- Next likely work after this slice is another optional completion slice such as semantic/cross-file tree-sitter refs/calls, LSP/SCIP diagnostics/references, non-JSON/custom reporter integration, or wrapper-safe report integration.

Added parsing for declared framework JSON report files:

- `runTestTarget` can now parse changed, cwd-confined Jest/Vitest/Playwright JSON report files already declared by an append-safe package script or per-run args, including `--outputFile=<path>`, `--outputFile <path>`, `--output-file=<path>`, and `PLAYWRIGHT_JSON_OUTPUT_FILE=<path>`.
- ORX does not create, mutate, or delete declared report files. It snapshots declared report file size/mtime before the run and ignores unchanged/stale files, oversized files, symlinks/out-of-cwd paths, non-JSON/custom reporters, wrapper commands, and unsafe multi-step shapes.
- This extends the previous private temp JSON report support without weakening the shell-disabled, bounded-output, sanitized-extra-arg, no-install/no-network, and model-visible `run_tests` boundaries.
- Verification: `git diff --check`, `npm run typecheck`, focused `npm run build && node --test dist/testing/test-adapters.test.js dist/agent/runtime.test.js`, full `npm test` with 523 tests, `npm run verify:release`, and independent verifier final recheck passed. Initial verifier findings around wrapper/multi-step declared output, symlink revalidation, Jest `--reporter=json`, and non-Jest pre-step `--json` false negatives were fixed and rechecked.
- Next likely work after this slice is another optional completion slice such as tree-sitter-backed syntax-aware code intelligence, LSP/SCIP diagnostics/references, non-JSON/custom reporter integration, or wrapper-safe report integration.

Added default-reporter package-script JSON report files:

- `runTestTarget` now creates ORX-owned private temp JSON report files for exact final no-reporter `jest`, `vitest`, and `playwright test` package-script invocations that do not already declare an output file.
- Default Jest receives `--json --outputFile=<private-temp-json>`; default Vitest receives `--reporter=json --reporter=default --outputFile=<private-temp-json>`; default Playwright receives `--reporter=json` plus `PLAYWRIGHT_JSON_OUTPUT_FILE=<private-temp-json>`.
- Existing JSON reporter scripts still receive only output-file wiring where append-safe; wrapper commands such as `react-scripts test`, custom `node ... jest` runners, custom reporters, and post-step script shapes stayed on stdout/stderr fallback in that slice. Declared JSON output paths were intentionally handled by the later read-only parsing slice.
- The slice keeps the existing shell-disabled, bounded-output, sanitized-extra-arg, no-install/no-network, temp cleanup, and model-visible `run_tests` boundaries.
- Verification: `git diff --check`, `npm run typecheck`, focused `npm run build && node --test dist/testing/test-adapters.test.js dist/agent/runtime.test.js`, full `npm test` with 523 tests, `npm run verify:release`, and independent verifier recheck passed. An initial verifier finding about per-run reporter/output overrides was fixed and rechecked.
- Next likely work after this slice is another optional completion slice such as tree-sitter-backed syntax-aware code intelligence, LSP/SCIP diagnostics/references, non-JSON/custom reporter integration, or wrapper-safe report integration.

Added private JSON report files for package-script JSON reporters:

- `runTestTarget` now creates ORX-owned private temp JSON report files for Jest/Vitest/Playwright package-script targets only when the existing script already declares an append-safe JSON reporter and has not declared its own output file.
- Jest and Vitest receive only `--outputFile=<private-temp-json>` as package-script passthrough args; Playwright receives `PLAYWRIGHT_JSON_OUTPUT_FILE=<private-temp-json>` in the child env. This historical slice covered existing JSON reporters only; exact default runner support was added later.
- Structured report parsing now accepts those framework JSON temp files before stdout/stderr JSON and summary-line fallback, and the temp directory is deleted after the run.
- The slice keeps the existing shell-disabled, bounded-output, sanitized-extra-arg, no-install/no-network, and model-visible `run_tests` boundaries; it does not add a new model tool or expose report-file paths to models beyond normal rendered command args.
- Verification so far: `npm run typecheck`, `npm run build`, and focused `node --test dist/testing/test-adapters.test.js dist/agent/runtime.test.js` passed before the full release gate/verifier pass.
- Next likely work after this slice is another optional completion slice such as non-JSON/custom reporter integration, tree-sitter-backed syntax-aware code intelligence, LSP/SCIP diagnostics/references, or wrapper-safe report integration.

Added structured Jest/Vitest/Playwright JSON report ingestion:

- `parseTestReportSummary` now parses bounded whole-object JSON already emitted to stdout or stderr before summary-line fallback for Jest, Vitest, and Playwright package-script targets.
- Jest/Vitest-style JSON numeric result objects map to `source=jest-json` or `source=vitest-json`; Playwright `stats` objects map to `source=playwright-json`.
- The slice does not add reporter flags, report-file writes, installs, network calls, subprocess shape changes, or model-tool exposure changes; malformed/mixed JSON remains on the existing summary-line fallback path.
- Verification so far: `npm run typecheck`, `npm run build`, and focused `node --test dist/testing/test-adapters.test.js` passed before the full release gate/verifier pass.
- Next likely work after this slice is another optional completion slice such as non-JSON/custom reporter integration, tree-sitter-backed syntax-aware code intelligence, LSP/SCIP diagnostics/references, or wrapper-safe report integration.

Added runnable Pyright diagnostics profile:

- Promoted `pyright` from diagnostics catalog-only to a guarded explicit local runner. `orx diagnostics run pyright [--project <local-project-path>] [--json]`, `orx diag run pyright ...`, `/diagnostics run pyright ...`, and `/diag run pyright ...` use an already-installed `node_modules/.bin/pyright` or PATH `pyright`, run `pyright --outputjson --project <project-file-or-directory>`, default the project target to `.`, parse bounded `generalDiagnostics`, and keep ORX-owned JSON metadata.
- The Pyright runner reuses the existing diagnostics trust boundary: no installs, no package-manager/launcher calls, no network calls, shell disabled, cleaned env without ORX/OpenRouter/Brave/API token-like values, cwd-confined file-or-directory project guard with symlink realpath checks, bounded/redacted stdout/stderr, explicit-operator-only execution, and no model-tool exposure.
- Command discovery, README, guide, command memory, architecture/tooling notes, release notes, and backlog later promoted gopls and clangd as runnable diagnostics profiles; TypeScript Language Server, rust-analyzer, and SCIP TypeScript remain catalog/readiness-only.
- Verification so far: `npm run typecheck`, `npm run build`, and focused `node --test dist/cli.test.js dist/slash/index.test.js` passed with 148 tests before the full release gate/verifier pass.

Removed unattended queue automation:

- Removed the legacy unattended queue harness, its npm scripts, the README operator section, and command/tooling/release-note references to that harness.
- Future ORX continuation should use normal bounded implementor/verifier sessions: choose one small remaining slice, implement narrowly, run focused checks, run an independent verifier pass, fix findings, then commit/push the verified slice.
- The next fresh-session goal should not mention or launch unattended queue automation.

Added tree-sitter AST outline mode:

- Added outline mode to the optional local tree-sitter adapter. `orx code outline <file>`, `orx outline <file>`, `orx code tree-sitter outline <file>`, `orx tree-sitter outline <file>`, `/code outline <file>`, `/outline <file>`, `/code tree-sitter outline <file>`, and `/tree-sitter outline <file>` reuse guarded `tree-sitter parse` output and render bounded definition-like AST entries.
- Outline mode keeps the existing local-only boundary: shell disabled, cleaned env, cwd-confined regular-file guards, bounded/redacted output, no network/install behavior, no mutation, no model-tool exposure, and lexical code-map fallback guidance when tree-sitter is unavailable.
- The outline renderer extracts names from tree-sitter source ranges when the target source file can be read, and keeps raw parse mode available through existing `tree-sitter` commands.
- Verification: `npm run typecheck`, `npm run build`, focused `node --test dist/code-map/code-map.test.js dist/cli.test.js dist/slash/index.test.js` passed with 157 tests, built CLI missing-tool/help smokes for outline passed, independent verifier findings were fixed, `git diff --check` passed, and `npm run verify:release` passed after the fix.

Recovered and verified optional completion slices:

- Structured test reports: direct Node test fallback now requests Node's native JUnit reporter into a private temporary report file, parses bounded counts first, deletes the report directory, and falls back to existing stdout/stderr summary parsing when the structured report is missing or malformed. Child test runs strip inherited `NODE_TEST_*` variables so ORX's own `node --test` suite does not poison nested test execution.
- Tree-sitter code intelligence: added `orx code tree-sitter <file>`, `orx tree-sitter <file>`, `/code tree-sitter <file>`, and `/tree-sitter <file>` as operator-invoked optional local `tree-sitter parse` previews with shell disabled, cleaned env, cwd-confined file guards, bounded/redacted output, no network/install behavior, no file mutation, and lexical code-map fallback guidance.
- Sourcegraph/GitHub read-only planning: added built-in preset `sourcegraph-github-readonly` with Sourcegraph-specific auth guidance, no static tools before reviewed remote metadata, and existing enable/trust/auth/remote-tool review/operator grant/model grant separation.
- Verification: `npm run build`, focused `dist/testing/test-adapters.test.js`, `dist/code-map/code-map.test.js`, focused MCP/CLI/slash preset tests, `npm run typecheck`, `git diff --check`, and built CLI smokes for tree-sitter guard/help plus Sourcegraph preset inspect/plan passed.

Finished v0.1 release-polish slice:

- Added `RELEASE_NOTES.md` with source/global first-run commands, final release gate, package dry-run command, current CLI surface summary, security boundary notes, and known optional post-v0.1 work.
- Added a root MIT `LICENSE` file and package metadata for repository/bugs/homepage/keywords plus `RELEASE_NOTES.md`, `README.md`, `LICENSE`, and `dist` package contents.
- Added `npm run pack:dry-run` for local package contents inspection without publishing.
- README now points release-boundary verification at `npm run verify:release`, `npm run pack:dry-run`, and `RELEASE_NOTES.md`.
- Next likely work is to continue optional completion slices in fresh bounded sessions, not unattended queue automation.
- Verification: `npm run verify:release` passed, and `npm run pack:dry-run` passed with `LICENSE`, `README.md`, `RELEASE_NOTES.md`, `dist`, and `package.json` in the package contents.

Added initial local diagnostics profiles:

- Added `src/diagnostics/` with a diagnostics catalog and a TypeScript compiler runner, plus `orx diagnostics list`, `orx diagnostics inspect <profile>`, `orx diagnostics run typescript [--project <local-tsconfig-path>] [--json]`, and `orx diag ...`; matching chat slash surfaces are `/diagnostics ...` and `/diag ...`.
- TypeScript was the only runnable profile in this initial slice. Pyright, gopls, and clangd were later promoted to runnable local profiles; TypeScript Language Server, rust-analyzer, and SCIP TypeScript remain catalog/readiness-only until a no-network/no-auth local command shape is proven.
- The runner prefers `cwd/node_modules/.bin/tsc` before `PATH` `tsc` and runs `tsc --noEmit --pretty false --project <tsconfig>`. The project argument must be a local regular file under cwd, with symlink realpath also under cwd; URLs, registry/package/launcher-like values, dash-prefixed values, control characters, and secret-like values are rejected before spawning.
- Execution uses the shared process runner with `shell: false`, `inheritEnv: false`, bounded stdout/stderr, redacted output, parsed TypeScript diagnostics, ORX-owned JSON metadata for `--json`, and a minimal env that drops ORX/OpenRouter/Brave/API keys plus token-like values even from normally allowlisted keys such as `HOME` and `TMPDIR`.
- The diagnostics surface is explicit-operator-only and not exposed through `src/agent` model tool schemas or the native tool registry.
- README, guide, command memory, architecture/tooling notes, backlog, and the integration handoff now document the diagnostics boundary and remaining LSP/SCIP expansion path.
- Verification: `npm run typecheck`, `npm run build && node --test dist/cli.test.js dist/slash/index.test.js` with 147 tests, full `npm test` with 517 tests, `npm run verify:release`, built CLI list/inspect/help/rejected-project/real-tsc/JSON dogfood, chat slash inspect/rejected-project dogfood, and independent verifier review. Verifier-found issues for stale current-context memory and alias-specific inspect usage were fixed and rechecked.
- Next likely work after this slice is another optional completion slice such as tree-sitter-backed syntax-aware code intelligence, LSP/SCIP diagnostics beyond the initial TypeScript compiler profile, non-JSON/custom reporter integration, reviewed GitHub and Sourcegraph tool declaration packs, or wrapper-safe report integration.

Added local security scanner profiles:

- Added `src/security/` with a scanner catalog and a Semgrep runner, plus `orx scanners list`, `orx scanners inspect <profile>`, `orx scanners run semgrep <path> --config <local-config-path> [--json]`, and `orx scan semgrep ...`; matching chat slash surfaces are `/scanners ...` and `/scan ...`.
- Semgrep was the only runnable profile in that initial slice. Trivy was later promoted to a filesystem-secret-only runnable profile, and CodeQL was later promoted to a local database-analysis runnable profile; Snyk, Socket, and OSV-Scanner remain catalog/readiness-only until no-network/no-auth local command shapes are proven.
- The runner requires an already-installed local `semgrep` binary and an explicit local config file under cwd. It rejects registry configs such as `auto`, `p/...`, `r/...`, URLs, dash-prefixed operands, symlink escapes outside cwd, control characters, and secret-like arguments before spawning.
- Execution uses the shared process runner with `shell: false`, `inheritEnv: false`, `--metrics off`, bounded stdout/stderr, JSON-aware redaction for `--json`, and a minimal env that drops ORX/OpenRouter/Brave/API keys plus token-like values even from normally allowlisted keys such as `HOME` and `TMPDIR`.
- The scanner surface is explicit-operator-only and not exposed through `src/agent` model tool schemas or the native tool registry.
- README, command memory, architecture/tooling notes, backlog, and the integration handoff now document the scanner boundary and remaining expansion path.
- Verification: `npm run typecheck`, `npm run build && node --test dist/cli.test.js dist/slash/index.test.js` with 145 tests, full `npm test` with 515 tests, `npm run verify:release`, built CLI list/inspect/help/rejected-config dogfood, chat slash inspect/rejected-config dogfood, fake Semgrep env-capture probe for token-like `HOME`, and independent verifier recheck with no remaining findings after fixing env-value filtering, slash `[--json]` help, and runnable-only completion.
- Next likely work after this slice is another optional completion slice such as LSP/SCIP diagnostics/references, tree-sitter-backed code-intelligence depth, or final v0.1 packaging/release notes. Scanner expansion should wait until a deterministic no-network/no-auth command shape is proven for the next scanner.

Added ast-grep syntax-aware search and codemod preview surface:

- Added `src/code-map/ast-grep.ts` for operator-invoked local ast-grep searches through an installed `sg` or `ast-grep` binary. ORX does not install ast-grep, does not call network, and does not mutate files.
- Added `orx code ast-grep <pattern> [path] [--lang <lang>] [--json] [--rewrite <template> [--preview]]` plus top-level `orx ast-grep ...`; matching slash surfaces are `/code ast-grep ...` and `/ast-grep ...`.
- The adapter uses shell-disabled `spawnSync`, checks `sg` then `ast-grep`, keeps target paths inside the current working directory including symlink realpath checks, rejects dash-prefixed pattern/path/lang/rewrite values before spawning so mutating ast-grep flags cannot be smuggled through operands, passes a cleaned env, bounds/redacts stdout/stderr, and renders clear local setup guidance with nonzero CLI exit when no binary is available.
- Slash ast-grep parsing now supports simple quoted arguments for patterns/templates with spaces without invoking a shell.
- `--rewrite` is preview-only in ORX: the adapter does not pass mutation flags such as ast-grep update/apply options. `--json` passes ast-grep JSON output through on success.
- README, guide, command memory, backlog, architecture/tooling notes, and the integration handoff document the new surface and keep tree-sitter/LSP/SCIP diagnostics as future richer code-intelligence work.
- Verification: `npm run typecheck`, `npm run build`, focused build-backed `node --test dist/code-map/code-map.test.js dist/cli.test.js dist/slash/index.test.js` with 151 tests, full `npm test` with 513 tests, `npm run verify:release`, built CLI missing-tool/help dogfood for `code ast-grep`, `git diff --check`, and independent verifier recheck with no findings after option-injection fixes for dash-prefixed pattern/path/lang/rewrite operands.
- Caveat: this machine does not currently have `sg` or `ast-grep` installed, so live ast-grep matching was verified through mocked runners and the real missing-binary path.
- Next likely work after this slice is tree-sitter-backed richer syntax-aware call/reference/import slices, LSP/SCIP diagnostics/references, or final v0.1 packaging/release notes.

Added v0.1 release-boundary verification:

- Added `scripts/verify-release.mjs` and package script `verify:release`.
- The gate runs `git diff --check`, `npm run typecheck`, full `npm test`, `npm run verify:global-install`, npm package dry-run content assertions, and built CLI smokes for `doctor --json`, `guide`, `code calls`, `plugins review`, `plugins review --json`, `plugins validate --json`, and `mcp presets`.
- Smoke commands run with temporary isolated ORX state paths and cleared real `OPENROUTER_API_KEY`/`BRAVE_SEARCH_API_KEY` values; the nested global-install chat-launch smoke uses only a non-secret placeholder key to start chat and immediately run `/exit`. The gate does not call OpenRouter, remote MCP endpoints, plugin bins, or plugin hooks.
- Hardened `scripts/verify-global-install.mjs` to strip inherited `ORX_*`, `OPENROUTER_API_KEY`, and `BRAVE_SEARCH_API_KEY` values and pin its ORX state paths under temporary verification state.
- README and command memory now document `npm run verify:release` as the local v0.1 finalization gate.
- Verification: `node --check scripts/verify-global-install.mjs`, `node --check scripts/verify-release.mjs`, `git diff --check`, `npm run verify:global-install`, `npm run verify:release`, and independent verifier recheck all pass.
- Next likely work after this slice is final v0.1 packaging/release notes or the next bounded CLI polish slice found by release dogfooding.

Added dependency-free local call graphs:

- Added `orx code calls [query]`, `orx calls [query]`, and `orx call-graph [query]` plus matching `/code calls [query]`, `/calls [query]`, and `/call-graph [query]` slash commands for local JavaScript/TypeScript call graph summaries without an OpenRouter API key.
- The graph reuses existing bounded code-map traversal, generated/vendor skips, source-byte limits, omissions/truncation reporting, and redacted rendering. It conservatively infers function declarations, function-valued variables, arrow-function variables, and class names from a lexical scan; it emits direct local call edges only when a call token matches a scanned local definition name.
- The renderer explicitly labels the result as a conservative lexical JavaScript/TypeScript scan, not AST-backed. Duplicate callee definitions are rendered as ambiguous with candidate counts instead of claiming exact resolution.
- The operator guide now includes `orx calls <query>` in the local code checklist, and README/command memory document the new aliases and precision boundary.
- Verification: `npm run typecheck`, `npm run build`, focused build-backed code-map/CLI/slash tests with 149 tests, full `npm test` with 511 tests, `npm run verify:global-install`, built CLI no-key dogfood for `code calls`, `calls`, and `call-graph`, isolated chat slash dogfood for `/code calls`, `/calls`, and `/call-graph`, and `git diff --check`.
- Next likely work after this slice is richer syntax-aware code intelligence: tree-sitter-backed call/reference/import slices, LSP/SCIP diagnostics/references, or final v0.1 packaging/release notes.

Added dependency-free local import graphs:

- Added `orx code imports [query]` and `orx imports [query]` plus matching `/code imports [query]` and `/imports [query]` slash commands for local JavaScript/TypeScript import graph summaries without an OpenRouter API key.
- The graph reuses the existing bounded code-map traversal, generated/vendor skips, source-byte limits, omissions/truncation reporting, and redacted rendering. It captures static imports, re-export-from edges, CommonJS `require(...)`, and string-literal dynamic `import(...)`, resolves relative local imports to scanned source files when possible, including extension substitution such as `.js` imports resolving to `.ts`, and reports external plus unresolved local import counts separately.
- Per-file import extraction remains bounded; files exceeding the cap now produce visible omitted-entry output and mark the graph as truncated instead of silently underreporting.
- The operator guide now includes `orx imports <query>` in the local code checklist.
- Verification: `npm run typecheck`, focused build-backed code-map/CLI/slash tests with 146 tests, full `npm test` with 508 tests, `npm run verify:global-install`, built CLI no-key and chat slash dogfood for `code imports` / `imports`, `git diff --check`, and independent verifier review/recheck with no remaining findings after import-cap, re-export/dynamic import, and architecture-memory fixes.
- Next likely work after this slice is richer syntax-aware code intelligence: tree-sitter-backed call/reference/import slices, LSP/SCIP diagnostics/references, or final v0.1 packaging/release notes.

Added no-network operator guide:

- Added `orx guide` plus `orx quickstart` alias as a read-only first-run/daily-use guide over the existing doctor readiness report.
- The guide renders readiness, current model/mode/theme/permission/profile/MCP/plugin/test counts, doctor next steps, daily flow, customization/profile commands, local test/code intelligence commands, MCP preset setup, plugin scaffold/install/review flow, delegation setup, and explicit boundaries.
- The command does not call OpenRouter, remote MCP endpoints, plugin bins, plugin hooks, or write config/trust/grant/catalog/plugin/delegation/data content; like other readiness reads, it may tighten existing loose local state file permissions.
- Verification: `npm run typecheck`, build-backed `node --test dist/cli.test.js`, full `npm test` with 507 tests, `npm run verify:global-install`, built CLI dogfood for `guide`, `quickstart`, and help usage, `git diff --check`, and independent verifier recheck with no findings after the permission-tightening boundary wording was corrected.
- Next likely work after this slice is more first-run dogfooding or richer code intelligence: tree-sitter-backed call/reference/import slices, LSP/SCIP diagnostics/references, or final v0.1 packaging/release notes.

Added dependency-free local code references:

- Added `orx code refs <query>` and `orx refs <query>` plus matching `/code refs <query>` and `/refs <query>` slash commands for local JavaScript/TypeScript code-reference lookup without an OpenRouter API key.
- The reference index reuses the existing bounded code-map traversal, generated/vendor skips, symlink skipping, source-byte limits, omissions/truncation reporting, and redacted rendering. Identifier queries preserve identifier boundaries; matching skips comments, string literals, and template literals.
- Missing CLI queries fail with `Usage: orx code refs <query>`; missing slash queries print usage to stderr and continue the chat session.
- Verification: `npm run typecheck`, `npm run build`, `git diff --check`, focused build-backed code-map/CLI/slash tests with 145 tests, built CLI/chat dogfood for `code refs`, `refs`, missing-query usage, `/code refs`, and `/refs`, multiline quoted-string repro dogfood, full `npm test` with 507 tests, `npm run verify:global-install`, and independent verifier recheck with no findings.
- Next likely work after this slice is deeper code intelligence: tree-sitter-backed call/reference/import slices, LSP/SCIP diagnostics/references, or final v0.1 packaging/release notes.

Added plugin review alias flag help:

- Clean dogfooding of the `orx doctor` next-step path showed `orx plugins doctor --help` ran the review instead of showing usage.
- Exact `orx plugins review --help`, `orx plugins doctor --help`, and `orx plugins audit -h` now print `Usage: orx plugins review|doctor|audit` before config/profile loading, so malformed configs cannot block this advertised follow-up help.
- Malformed trailing operands such as `orx plugins doctor bogus --help` now fail with usage instead of silently running plugin review.
- Verification: `npm run typecheck`, build-backed `node --test dist/cli.test.js` with 53 tests, built CLI dogfood for exact help and malformed trailing args, full `npm test` with 507 tests, `npm run verify:global-install`, `git diff --check`, and independent verifier review with no findings.
- Next likely work is another first-run dogfood pass focused on MCP setup comfort, plugin authoring flow, code-intelligence depth, or release-hardening polish.

Polished no-auth MCP auth readiness wording:

- Clean Context7 MCP dogfooding showed `orx mcp auth user:context7` rendered `auth_status: not_required` but also `effective_bearer: missing`, which was technically true but confusing for no-auth profiles.
- No-auth MCP profiles now render `credential_mode: not_required`, `effective_bearer: not_required`, and Keychain `status=not_required` in CLI and slash auth/setup output. Auth-required profiles keep the env bearer plus optional macOS Keychain wording.
- Verification: `npm run typecheck`, focused build-backed MCP/CLI/slash auth coverage with 216 tests, isolated built CLI Context7 dogfood, full `npm test` with 507 tests, `npm run verify:global-install`, `git diff --check`, and independent verifier review with no findings.
- Next likely work is another clean first-run dogfood pass focused on MCP setup comfort, plugin authoring docs/templates, code-intelligence depth, or release-hardening polish.

Added nested MCP/plugin onboarding flag help:

- Clean first-run MCP/plugin dogfooding showed deeper onboarding commands were inconsistent: `orx plugins scaffold --help` returned `Missing value for --help`, `orx mcp plan --help` treated `--help` as a target, and `orx mcp add-preset --help` returned an unknown-preset error.
- Exact supported nested help shapes now short-circuit before config/profile loading for high-traffic onboarding commands: MCP plan, presets, presets inspect, add-preset, plugin scaffold, validate, install, register, and catalog.
- A verifier-found edge case is fixed: unsupported nested shapes such as `orx plugins catalog bogus --help` and `orx mcp presets bogus --help` are not promoted to generic help success.
- Verification: `npm run typecheck`, build-backed `node --test dist/cli.test.js` with 53 tests, built CLI dogfood for malformed config plus `--profile missing mcp plan --help`, full `npm test` with 507 tests, `npm run verify:global-install`, `git diff --check`, and independent verifier recheck with no findings after the unsupported-shape fix.
- Next likely work is another clean first-run dogfood pass focused on MCP setup comfort, plugin authoring docs/templates, code-intelligence depth, or release-hardening polish.

Added API-key command flag help preflight:

- Clean first-run dogfooding showed `orx ask --help` fell through to API-key validation and printed missing-key guidance instead of command usage.
- `orx ask --help|-h`, `orx chat --help|-h`, `orx models --help|-h`, `orx credits --help|-h`, and `orx generation --help|-h` now render usage before config/profile loading, so malformed config files and missing saved profiles cannot block help.
- Bare command values are preserved as input: `orx ask help` still follows the normal one-shot prompt path instead of being hijacked as help.
- Verification: `npm run typecheck`, `npm run build`, build-backed `node --test dist/cli.test.js` with 52 tests, built CLI dogfood for malformed config plus `--profile missing ask --help`, full `npm test` with 506 tests, `npm run verify:global-install`, `git diff --check`, and independent verifier review with no findings.
- Next likely work is another clean first-run dogfood pass focused on MCP setup comfort, plugin authoring docs/templates, code-intelligence depth, or release-hardening polish.

Refined MCP planner model-grant guidance:

- Clean MCP preset dogfooding showed `orx mcp plan` still reported `ready_for_model_grants` after a read-only model MCP grant already existed, and it did not clearly surface the immediate `orx ask --mcp-tools` path for the granted tool.
- `orx mcp plan <profile>` and `/mcp plan <profile>` now distinguish `ready_for_model_grants` from `ready_for_model_use`. Before a grant, the plan suggests `orx mcp allow-model-tool ...` and does not advertise model-use commands. After an active allowed model grant, it suggests `orx ask --mcp-tools "Use <tool> from <profile>"`, `in chat: /mcp model enable`, and any remaining eligible model grants separately.
- A verifier-found edge case is fixed: manually poisoned or legacy active-hash model grants for billable/write tools no longer trigger `ready_for_model_use`; planner model-use readiness now requires the stricter model policy decision to be `allowed`.
- Verification: `npm run typecheck`, focused build-backed MCP/CLI/slash coverage with 214 tests, built CLI Context7 grant-flow dogfood, full `npm test` with 505 tests, `npm run verify:global-install`, `git diff --check`, and independent verifier recheck with no findings after the poisoned-grant fix.
- Next likely work is another clean first-run dogfood pass focused on MCP setup comfort, plugin authoring docs/templates, code-intelligence depth, or release-hardening polish.

Added richer plugin scaffold authoring templates:

- First-run scaffold dogfooding showed the generated plugin bundle was valid but still too placeholder-like for comfortable authoring.
- Non-minimal `orx plugins scaffold <directory>` and `/plugins scaffold <directory>` now write a root `AUTHORING.md` guide that is not declared as a runtime component, plus richer inert skill, prompt-command, rule, and docs templates with explicit trust-boundary language and review commands.
- Runtime placeholders remain empty by design: `hooks/hooks.json`, `mcp.json`, `command-schemas.json`, and `bin/` still expose zero hook, MCP, executable-command, or bin entries until the author deliberately adds reviewed content.
- Verification: `npm run typecheck`, `npm run build`, focused build-backed scaffold/validate/CLI/slash coverage with 148 tests, isolated built CLI scaffold -> validate -> install -> enable -> review -> bins/hooks/commands dogfood, full `npm test` with 504 tests, `npm run verify:global-install`, and `git diff --check`. Independent verifier pass was rerun after the first verifier agent was interrupted.
- Next likely work is another clean first-run dogfood pass focused on MCP setup comfort, plugin authoring docs/templates, code-intelligence depth, or release-hardening polish.

Added MCP setup planner:

- Clean first-run dogfooding showed MCP primitives were strong but still required operators to manually assemble preset install, enable/trust, auth, remote-tool review/import, grants, calls, and model exposure steps.
- `orx mcp plan [preset-or-profile] [--json]`, `orx mcp setup-plan [preset-or-profile] [--json]`, `/mcp plan [preset-or-profile] [--json]`, and `/mcp setup-plan [preset-or-profile] [--json]` now render a shared deterministic setup plan for provider presets and installed profiles, including disabled, schema-change, auth-needed, no-tools/remote-review, operator-grant, and read-only model-grant states. JSON output emits the same ORX-owned plan metadata for automation without changing authority boundaries.
- The planner does not install, enable, trust, grant, fetch remote tools, call MCP tools, expose tools to the model, write audit logs, or contact provider endpoints; like other MCP reads, it may tighten loose existing MCP state file permissions while loading local state.
- Verification: `npm run typecheck`, `npm run build`, focused build-backed MCP/CLI/slash coverage with 213 tests, built CLI dogfood for Context7/GitHub/OpenRouter/custom-profile planner progression, full `npm test` with 504 tests, `npm run verify:global-install`, `git diff --check`, and independent verifier recheck after fixes.
- Next likely work is commit/push, then another first-run dogfood pass focused on plugin authoring docs/templates or broader release polish.

Added scaffold directory next-step guidance:

- Fresh temp-project dogfooding showed scaffold output still suggested installing the manifest path even though directory install is now supported.
- Scaffold output now keeps the manifest path for manual review, then points to `orx plugins validate <directory>` and `orx plugins install <directory>` so the generated next steps match the directory-aware install path.
- Regression coverage asserts the renderer includes directory validate/install commands and does not regress to manifest-path validate/install suggestions.
- Verification: `git diff --check`, full `npm test` with 502 tests, `npm run verify:global-install`, and independent verifier review with no findings after targeted scaffold/CLI checks.
- Next likely work is another clean first-run dogfood pass to find the next real CLI friction point, then broader release hardening around MCP/plugin authoring docs/templates, provider auth/OAuth decisions, richer code intelligence, or remaining nested-help polish.

Added plugin install directory input parity:

- Clean dogfooding found that `orx plugins validate <scaffold-directory>` worked, but `orx plugins install <scaffold-directory>` failed because install treated the directory itself as the manifest file.
- Local plugin install/register resolution now maps an existing directory input to `<directory>/orx-plugin.json`, matching the validation path, while direct manifest paths, catalog ids, and pinned git catalog installs keep their existing behavior.
- CLI and slash usage/help/palette text now advertise `manifest-path-or-directory-or-catalog-id`, and scaffold-install regressions use the directory input directly in both CLI and slash tests.
- Verification: `npm run typecheck`, `git diff --check`, `npm run build`, focused build-backed catalog/CLI/slash coverage with 146 tests, scaffold -> validate directory -> install directory -> enable -> review dogfood, full `npm test` with 502 tests, `npm run verify:global-install`, and independent verifier review/recheck with no remaining findings after stale slash help text was fixed.
- Next likely work is another clean first-run dogfood pass to find the next real CLI friction point, then broader release hardening around MCP/plugin authoring docs/templates, provider auth/OAuth decisions, richer code intelligence, or remaining nested-help polish.

Added CLI namespace help polish:

- Clean first-run dogfooding showed namespace commands such as `orx mcp help` and `orx plugins help` exited 1 even though operators naturally expect namespace help to succeed.
- A shared namespace-usage table now powers `orx <namespace> help`, `orx <namespace> --help`, and `orx <namespace> -h` for `auth`, `config`, `profile`/`profiles`, `history`, `mcp`, `plugins`/`plugin`, `bins`/`bin`, `hooks`/`hook`, `tests`/`test`, `code`, `orchestrator`, `delegate`, and `delegates`.
- Namespace help short-circuits before config/path loading, so it remains usable with malformed config files and does not leak config parser text or secret-shaped config contents.
- Verification: `npm run typecheck`, `git diff --check`, `npm run build`, build-backed `node --test dist/cli.test.js` with 51 tests, built CLI namespace-help surveys for canonical commands and aliases against malformed config, full `npm test` with 502 tests, `npm run verify:global-install`, and independent verifier recheck with no findings.
- Next likely work is another clean first-run dogfood pass and then the next release-hardening slice around MCP/plugin ergonomics, provider auth/OAuth decisions, richer plugin authoring docs/templates, or code-intelligence expansion.

Added inline profile-save customization:

- Clean first-run dogfooding showed that creating a customized profile required mutating config first, saving the profile, then optionally mutating config back.
- `orx profile save <id>` and `/profile save <id>` now accept `--model`, `--mode`, `--fusion`/`--fusion-preset`, `--theme`, `--approval-policy`, and `--sandbox-mode` to override only the saved snapshot.
- The parser rejects secret-like/control-character values, supports `--fusion none` to clear a saved Fusion preset, does not write API keys, and does not change the active config/session when saving.
- Slash Tab completion now offers deterministic profile-save flags plus mode/theme/Fusion/permission value hints.
- Verification: `npm run typecheck`, `git diff --check`, `npm run build`, build-backed CLI/slash/profile coverage with 146 tests, manual built CLI smokes for `--fusion none`, flag-as-value rejection, newline/control-character rejection, full `npm test` with 501 tests, `npm run verify:global-install`, and independent verifier recheck. The verifier-found parser and completion issues were fixed.
- Next likely work is commit/push, then another clean-profile dogfood pass to find the next first-run ORX usability gap.

Added unversioned installed-plugin id resolution:

- Dogfooding the clean MCP/plugin onboarding path showed that scaffold/install surfaces exact ids such as `local.sample-plugin@0.1.0`, while a natural `orx plugins enable local.sample-plugin` failed.
- `orx plugins inspect|enable|disable` and `/plugins inspect|enable|disable` now accept exact versioned ids or unique unversioned `publisher.name` ids. If multiple installed versions match, ORX fails closed with an ambiguous-plugin message listing exact ids.
- The change is registry-level, so state changes still write the exact stored plugin id and exact ids remain stable for aliases, bins, hooks, MCP profiles, and review output.
- Verification: `npm run typecheck`, `git diff --check`, `npm run build`, build-backed registry/CLI/slash plugin coverage with 159 tests, full `npm test` with 500 tests, `npm run verify:global-install`, isolated scaffold/install/inspect/enable/disable dogfood through both CLI and chat slash commands, and independent verifier recheck. The verifier found only stale memory wording, which was fixed.
- Next likely work is commit/push, then continue live MCP/plugin dogfooding for the broader first-run ORX flow.

Added chat slash parity for core OpenRouter auth helpers:

- `/auth`, `/auth status`, `/auth setup`, `/auth env`, `/auth init`, and `/auth env-file` now mirror the no-secret `orx auth` setup helpers inside interactive chat.
- `/auth` status reports API-key readiness without values, setup prints only a placeholder `OPENROUTER_API_KEY` export, and init creates the same private commented env template under `~/.orx/auth` or `ORX_AUTH_ENV_DIR`.
- The slash command does not auto-load env files, call network, spawn subprocesses, or write config; secret-shaped and control-character unexpected arguments are redacted.
- `/help`, `/commands`, and readline Tab completion now include the `/auth` surface.
- Verification: `npm run typecheck`, build-backed slash/auth coverage, full `npm test` with 498 tests, `git diff --check`, `npm run verify:global-install`, compiled chat smoke for `/auth` status/setup/init/env-file plus secret-shaped unknown-command redaction, and independent verifier review with no findings.
- Next likely work is broader release hardening and live MCP/plugin dogfooding.

Integrated core auth commands into doctor guidance:

- Missing-key `orx doctor` text and `orx doctor --json` next steps now point to `orx auth setup` and `orx auth init` instead of only manual env setup.
- The doctor boundary remains no-network/no-subprocess/no-remote-MCP/no-plugin-execution, and the JSON schema remains `schema_version: 1`.
- Verification: `npm run typecheck`, focused doctor coverage, full `npm test` with 497 tests, `git diff --check`, built doctor text/JSON smokes, and `npm run verify:global-install` passed.

Added malformed-config recovery for config paths:

- When general config loading fails, normal commands now return the sanitized config-load failure instead of raw parser output.
- `orx config path` now has a recovery branch that still renders local/user config paths with `effective_sources: not_evaluated_config_unreadable`, so users can locate the broken config file without exposing malformed contents or secret-looking tokens.
- Verification: `npm run typecheck`, focused build-backed CLI tests with the malformed-config recovery regression, `git diff --check`, full `npm test` with 497 tests, and `npm run verify:global-install` passed.
- Next likely work remains broader release hardening, remaining OAuth/device-flow decision work if ORX should own provider auth, delegate team/profile ergonomics, or stronger pre-spend budget strategy if OpenRouter can support it.

Added no-secret core OpenRouter auth setup helpers:

- `orx auth` / `orx auth status` now render core OpenRouter API-key readiness before normal API-key-required commands, including source (`OPENROUTER_API_KEY`, config, missing, or config-unreadable), managed env-file path, no-network/no-subprocess boundaries, and concrete next commands without printing key values.
- `orx auth setup` and `orx auth env` print placeholder `OPENROUTER_API_KEY` exports only, explicitly refuse CLI secret arguments, do not write config, and remain usable when existing config is malformed.
- `orx auth init` and `orx auth env-file` create a private commented shell template at `~/.orx/auth/openrouter.env` or `ORX_AUTH_ENV_DIR`, use `0700` directory and `0600` file modes for new files, do not overwrite existing files, do not auto-load env files, and refuse direct or parent auth env-file symlinks.
- General config loading now fails with a sanitized message instead of propagating raw parser context, closing a verifier-found leak where `orx status` could print malformed config contents containing a secret-looking token.
- Verification: `npm run typecheck`, focused build-backed CLI/auth/init tests, `git diff --check`, full `npm test` with 497 tests, `npm run verify:global-install`, built CLI smokes for auth status/setup/init plus malformed-config `orx status` redaction, and independent verifier review. The verifier found the malformed-config status leak; it was fixed with a regression test and built smoke.
- Next likely work remains broader release hardening, remaining OAuth/device-flow decision work if ORX should own provider auth, delegate team/profile ergonomics, or stronger pre-spend budget strategy if OpenRouter can support it.

Added structured JSON doctor output:

- `orx doctor --json` now emits a stable `schema_version: 1` JSON report with `strict_ready`, readiness summary, runtime, MCP, plugin, delegation, and next-step fields.
- `--json` can be combined with `--strict`, preserving strict exit behavior while keeping stdout parseable JSON and stderr limited to the strict failure line when not ready.
- The JSON report keeps the existing doctor boundary: no network calls, subprocesses, remote MCP calls, plugin execution, data-content writes, or API-key value rendering.
- Verification: `npm run typecheck`, focused build-backed CLI tests with 47 tests, `git diff --check`, full `npm test` with 494 tests, `npm run verify:global-install`, built CLI smokes for missing-key strict JSON failure, ready strict JSON success, help, and secret-shaped unknown-option redaction, and independent verifier review with no findings.
- Next likely work remains broader release hardening, remaining OAuth/device-flow decision work if ORX should own provider auth, delegate team/profile ergonomics, or stronger pre-spend budget strategy if OpenRouter can support it.

Added first-run no-secret config initialization:

- `orx init`, `orx setup`, and `orx config init` now create a starter TOML config using the existing private/symlink-resistant config writer.
- Init writes default `openrouter/auto`, `auto`, `default`, and `never/danger-full-access` values, never writes API keys, leaves existing regular config files unchanged, and reports next steps for `OPENROUTER_API_KEY`, `orx doctor --strict`, and `orx`.
- `--local` creates a repo-local `.orx/config.toml`; default user scope honors `ORX_CONFIG_PATH` for isolated runs.
- Verification: `npm run typecheck`, focused build-backed config/CLI tests with 58 tests, `git diff --check`, full `npm test` with 494 tests, `npm run verify:global-install`, built CLI smokes for init/idempotence/existing custom config/malformed secret-looking TOML/setup help/config init help/secret-shaped option redaction/direct and dangling symlink refusal, and independent verifier recheck with no code findings after fixes.
- Next likely work remains broader release hardening, remaining OAuth/device-flow decision work if ORX should own provider auth, delegate team/profile ergonomics, or stronger pre-spend budget strategy if OpenRouter can support it.

Added strict `orx doctor` readiness gating:

- `orx doctor --strict` now renders the normal doctor report and exits nonzero when `ready_to_use` is not `yes`.
- The strict gate is local-only and does not add network calls, subprocesses, remote MCP calls, plugin execution, data-content writes, or secret rendering.
- The doctor implementation now exposes a structured `DoctorReport` with text, readiness labels, and `strictReady`, while preserving the existing string formatter for other callers.
- Verification: focused compiled CLI tests with 43 tests, `npm run typecheck`, `git diff --check`, full `npm test` with 488 tests, `npm run verify:global-install`, isolated built-CLI strict doctor smokes for no-key failure, API-key success, help, and secret-shaped unknown-option redaction, and independent verifier review with no findings.
- Next likely work is broader release hardening, remaining OAuth/device-flow decision work if ORX should own provider auth, delegate team/profile ergonomics, or stronger pre-spend budget strategy if OpenRouter can support it.

Added concise `orx doctor` readiness labels:

- `orx doctor` now starts with `overall`, `ready_to_use`, `core_cli`, `chat`, `mcp`, `plugins`, and `delegation` status lines before the existing detailed local diagnostics.
- The summary distinguishes core CLI readiness from chat API-key readiness, active MCP profile state, plugin review needs, and optional delegation policy/team readiness.
- The command remains no-network/no-subprocess, performs no config/data content writes, and does not print API key values; existing local loaders may still tighten private state-file permissions while reading.
- Verification: focused compiled CLI tests with 43 tests, `npm run typecheck`, `git diff --check`, full `npm test` with 488 tests, `npm run verify:global-install`, built `orx doctor` smoke with isolated paths and no API-key leakage, and independent verifier review/recheck with no findings after memory boundary wording was corrected.
- Next likely work is broader release hardening, remaining OAuth/device-flow decision work if ORX should own provider auth, delegate team/profile ergonomics, or stronger pre-spend budget strategy if OpenRouter can support it.

Added provider-specific MCP auth guidance:

- `orx mcp auth <profile>`, `orx mcp auth setup <profile>`, and matching slash commands now render provider-specific credential source, lifetime, scope, setup URL, and ORX support notes for recognized OpenRouter, GitHub, Cloudflare, Figma, Sentry, Context7, and Microsoft Learn MCP endpoints.
- Guidance is render-only: no OAuth browser/device flow, network call, subprocess call, config write, token persistence, or secret display was added.
- Provider detection now parses the profile URL and requires exact HTTPS MCP endpoint hosts/paths, so spoofed OpenRouter/GitHub/Cloudflare-looking user profiles fall back to generic bearer guidance.
- Verification: focused compiled MCP/CLI/slash tests with 202 tests, `npm run typecheck`, `git diff --check`, and independent verifier review/recheck of the spoof-resistant detection.
- Next likely work is remaining managed OAuth/device/browser flows if desired, broader provider/plugin preset polish, delegate team/profile ergonomics, stronger pre-spend budget strategy if OpenRouter can support it, and release hardening.

Dogfooded real-key policy-enabled OpenRouter delegation and tightened delegate ergonomics:

- Used the repo-local config-backed OpenRouter API key with isolated `ORX_SESSION_DIR`, `ORX_DELEGATION_POLICY_PATH`, `ORX_DELEGATION_AUDIT_PATH`, `ORX_DELEGATION_TEAMS_PATH`, and `ORX_CHAT_HISTORY_PATH`.
- Live chat set the controller to `openai/gpt-4.1-mini`, configured delegate `reviewer` as `openai/gpt-4.1-nano`, enabled policy with `metadata_only`, and successfully executed one `delegate_task`.
- The successful dogfood selected `reviewer`, attempted the OpenRouter delegate network call, resolved `openai/gpt-4.1-nano-2025-04-14`, wrote hash-only audit metadata, reported `cost_limit=within_limit`, and observed delegate cost around `$0.000009`.
- Initial dogfood attempts exposed model-facing ergonomics gaps: blank delegate names, blank optional context, and overlarge result limits caused avoidable invalid-argument failures before network.
- Fixed `delegate_task` parsing so blank delegate names are treated as omitted and fall back to the sole configured delegate, blank optional `context`/`expected_output` values are omitted, and overlarge model-requested timeout/result/cost limits are capped by operator policy while malformed or below-minimum values still fail closed.
- Verification: focused delegation/agent runtime tests with 57 tests, isolated live delegation dogfood through the built CLI, `npm run typecheck`, `git diff --check`, full `npm test` with 487 tests, `npm run verify:global-install`, built `orx status` smoke, and independent verifier review with no findings.
- Next likely work is provider-specific OAuth/token helper polish beyond bearer storage, remaining delegate team/profile ergonomics or stronger pre-spend budget strategy, broader provider/plugin preset polish, and release hardening.

Added wide TTY provider/model badge polish:

- Exact `provider/model` ids in the bottom TTY status notch now render as separate `provider <provider>` and `model <model>` badges when the terminal is wide enough.
- OpenRouter routing shortcuts now render as `route auto` and `route fusion` in TTY status instead of looking like exact model ids.
- Narrow TTY status keeps one compact model badge so activity labels, context, cost, credits, permissions, and session markers remain width-safe.
- Full model ids remain unchanged in config, request construction, plain status, non-TTY output, and OpenRouter metadata summaries.
- Verification: `npm run build && node --test dist/tui/screen.test.js dist/tui/chat.test.js` with 38 focused tests, `npm run typecheck`, `git diff --check`, full `npm test` with 486 tests, `npm run verify:global-install`, built TTY badge smoke, built `orx status` smoke, and independent verifier recheck with only stale-memory-count feedback fixed.
- Next likely work remains provider-specific OAuth/token helper polish beyond bearer storage, real-key policy-enabled delegation dogfood when `OPENROUTER_API_KEY` is available, broader provider/plugin preset polish, optional raw-mode editing only if script-safe, and release hardening.

Added durable local TTY prompt history/search:

- Added `src/tui/history.ts` for private prompt history storage under `~/.orx/history.json` or `ORX_CHAT_HISTORY_PATH`, with `0700` parent and `0600` file modes, bounded newest-first entries, deduplication, single-line readline preload, and nested symlink-parent refusal while allowing normal macOS system temp roots.
- Interactive TTY chat now preloads single-line prompt history for readline recall and records completed user prompts after submission. Non-TTY/scripted chat does not persist prompt history, slash commands are skipped, and secret-like inputs are not stored.
- Added `orx history`, `orx history search <query>`, `orx history clear`, `/history`, `/history search <query>`, and `/history clear` as no-key/no-network/no-subprocess operator surfaces over the same local file. Prompt history is not model-visible context and is not transcript indexing.
- Updated README, command memory, tooling policy, backlog, and decisions for the prompt-history privacy boundary.
- Verification: `npm run typecheck`, `git diff --check`, focused compiled history/chat/CLI/slash tests with 168 tests after verifier fixes, full `npm test` with 484 tests, `npm run verify:global-install`, isolated built-CLI history dogfood, and independent verifier recheck with no findings. Verifier-found issues around cwd/session metadata, stale README slash-list docs, and non-TTY/no-metadata regression coverage are fixed.
- Next likely work remains provider-specific OAuth/token helper polish beyond bearer storage, real-key policy-enabled delegation dogfood when `OPENROUTER_API_KEY` is available, broader provider/plugin preset polish, optional raw-mode editing only if script-safe, and release hardening.

Added MCP macOS Keychain bearer support:

- Added `orx mcp auth keychain [status|set|delete] <profile>` and matching slash commands to inspect, store/update, or delete optional macOS Keychain bearer items for MCP profiles.
- Keychain `set` uses `/usr/bin/security add-generic-password ... -w` with the password prompt handled by macOS Security; ORX never receives or prints the token value from command arguments or rendered output.
- MCP credential resolution remains env-first and only attempts Keychain after explicit `ORX_MCP_KEYCHAIN=1`. The same resolver is used by CLI `/mcp call`, slash `/mcp call`, one-shot `orx ask --mcp-tools`, and interactive model-visible `mcp_call`.
- Audit events record credential source, keychain attempted/status, keychain service/account, action, and state changes without raw tokens or remote output. No network calls are made by keychain management commands.
- Verification: `npm run typecheck`, `npm run build`, focused compiled agent/MCP/CLI/slash tests with 230 tests, `git diff --check`, full `npm test` with 475 tests, `npm run verify:global-install`, isolated built-CLI auth/keychain dogfood, and independent verifier review with no findings. The verifier's residual model-loop Keychain concern is closed by a dedicated regression test.
- Next likely work is provider-specific OAuth/token helper polish beyond bearer storage, real-key policy-enabled delegation dogfood when `OPENROUTER_API_KEY` is available, final TTY ergonomics, broader provider/plugin preset polish, and release hardening.

Added MCP auth env-file templates:

- Added `orx mcp auth init <profile>` / `orx mcp auth env-file <profile>` and matching slash commands to create private commented shell env templates for bearer-based MCP profiles.
- Auth status/setup output now shows the managed env-file path. The default directory is `~/.orx/mcp/auth-env`; `ORX_MCP_AUTH_ENV_DIR` isolates it for tests and scripted runs.
- Templates use commented exports only, so sourcing an unedited file does not send placeholder bearer values. Existing files are never overwritten; loose existing files are permission-tightened to `0600`, and loose auth-env directories are tightened to `0700` with explicit reporting.
- No-auth profiles skip file creation. The command makes no network calls, spawns no subprocesses, writes no config, stores no token values, audits only redacted metadata, and refuses symlink parent paths.
- Verifier fix: existing auth-env directory permission tightening is now detected, rendered as `directory_permissions_tightened`, included in audit metadata, and covered by focused tests.
- Verification: `npm run typecheck`, focused MCP/CLI/slash tests with 198 tests, `git diff --check`, isolated CLI dogfood for create/no-auth skip/symlink failure/directory-only permission tightening, full `npm test` with 473 tests, `npm run verify:global-install`, and independent verifier recheck with no findings.
- Next likely work remains actual OAuth/provider credential flows beyond bearer storage, real-key policy-enabled delegation dogfood when `OPENROUTER_API_KEY` is available, final TTY ergonomics, broader provider/plugin preset polish, and release hardening.

Added saved delegation team readiness previews:

- Added `orx delegates plan <saved-team-id>` and `orx delegate plan <saved-team-id>` to preview a saved disabled team against the current delegation execution policy from the noninteractive CLI.
- The preview renders saved-team source, `state_changed: no`, current policy readiness, delegate count, controller/delegate metadata, and the existing CLI blocker that a saved team can only be loaded inside interactive chat.
- No OpenRouter calls, subprocess agents, chat-session mutation, policy mutation, or delegate output persistence are added.
- Verifier fixes: unknown secret-shaped team IDs are redacted in both `delegate plan` and `delegates plan`, and sessionless saved-team readiness renders `network_calls: none_from_sessionless_cli` even when policy is enabled.
- Verification: `npm run typecheck`, focused delegation/CLI source tests with 66 tests, `git diff --check`, full `npm test` with 470 compiled tests, `npm run verify:global-install`, and isolated CLI dogfood for saving a team, enabling metadata-only policy, previewing `orx delegates plan <id>`, and redacting missing secret-shaped team IDs.
- Independent verifier reported no findings on the patched tree. Real-key OpenRouter delegation dogfood remains blocked until `OPENROUTER_API_KEY` is available.
- Next likely work remains real-key policy-enabled delegation dogfood when an `OPENROUTER_API_KEY` is available, managed MCP auth beyond env bearer setup, broader provider/plugin preset polish, final TTY ergonomics, and release hardening.

Added delegation result merge controls:

- Added `metadata_only` alongside the existing default `manual_summary` delegation result merge policy.
- `orx delegates policy set --result-merge manual_summary|metadata_only` and matching slash commands now persist and render the selected mode through private policy storage.
- `manual_summary` keeps the prior behavior: wrapped untrusted delegate text is returned to the controller model for explicit manual summarization.
- `metadata_only` keeps internal result text, hashes, byte counts, audit metadata, and terminal summaries, but removes the raw delegate result from the model-facing `delegate_task` tool message with `modelVisibleResultOmitted: true`.
- Runtime and audit metadata now carry `resultMerge` and `modelExposure`; audit output remains hash-only and does not store raw task/context/delegate output.
- Verification: `git diff --check`, `npm run typecheck`, focused delegation/agent/CLI/slash tests with 184 tests, focused slash regression tests with 88 tests after the verifier fix, full `npm test` with 470 compiled tests, `npm run verify:global-install`, isolated CLI dogfood for `metadata_only`, and independent verifier review. Verifier found stale `/delegate help` policy text; fixed with a regression assertion.
- Next likely work remains real-key policy-enabled delegation dogfood, delegate team/profile ergonomics, managed MCP auth beyond env bearer setup, broader provider/plugin preset polish, and release hardening.

Added MCP auth setup guidance:

- Added `orx mcp auth setup <profile>` and `/mcp auth setup <profile>` with `env` aliases to render copyable bearer-token export placeholders for auth-required MCP profiles.
- Existing `orx mcp auth <profile>` and `/mcp auth <profile>` status behavior remains unchanged.
- Setup output reports auth status, profile-specific and fallback env names, storage/network/subprocess/config-write boundaries, unset guidance, and next steps without printing real env token values.
- No-auth profiles render `shell_exports: not required` and do not print `<bearer-token>` snippets.
- Setup commands write only the normal redacted MCP audit event metadata and do not call remote MCP endpoints, spawn subprocesses, or edit config/catalog/profile files.
- Verification: `git diff --check`, `npm run typecheck`, focused MCP/CLI/slash tests with 195 tests, full `npm test` with 468 tests, `npm run verify:global-install`, isolated CLI/slash dogfood for required-auth and no-auth setup paths, and independent verifier review.
- Next likely work remains final TTY ergonomics, real-key policy-enabled delegation dogfood, delegate team/profile ergonomics, managed MCP auth beyond env bearer setup, broader provider/plugin preset polish, and release hardening.

Added chat slash parity for safe config inspection/editing:

- Shared config show/path formatting and config-set argument parsing from the CLI into `src/config/index.ts`, preserving CLI output while allowing chat to reuse the same redacted surfaces.
- Added `/config [show|path|set <key> <value> [--user|--local]]` with deterministic completions for subcommands, editable keys, mode/theme values, and scope flags.
- `/config show` and `/config path` render redacted effective config/path state without OpenRouter, MCP, plugin, hook, bin, or subprocess work.
- `/config set` reuses the shared safe setter, honors `ORX_CONFIG_PATH` and local/user scope behavior, refuses API-key aliases and secret-like/control-character arguments, writes through existing private-file and symlink guards, and updates the active chat config snapshot for the edited key.
- Verifier fix: unknown config-key errors now redact any key containing terminal control bytes or secret-shaped tokens anywhere, including misplaced `safe_sk-or-v1-*` style inputs, instead of echoing unsafe text.
- Verification: `git diff --check`, `npm run typecheck`, focused config/slash/CLI source tests, full `npm test` with 468 tests, `npm run verify:global-install`, isolated source chat dogfood for `/config show|path|set`, and independent verifier review/recheck.
- Next likely work remains final TTY ergonomics, real-key policy-enabled delegation dogfood, delegate team/profile ergonomics, managed MCP auth beyond env bearer, and release hardening.

Added first-class config inspection/editing:

- Added `orx config show`, `orx config path`, and `orx config set <key> <value> [--user|--local]` before API-key validation.
- Supported editable keys are non-secret setup fields: `model`, `mode`, `fusion_preset`, `theme`, `approval_policy`, and `sandbox_mode`.
- `ORX_CONFIG_PATH` now overrides the user config path for isolated runs while preserving repo-local `.orx/config.toml` discovery. `config set` defaults to the user config path, writes private created files, refuses direct config-path and user-controlled parent symlinks, allows normal system temp roots, and refuses API-key storage through CLI arguments.
- `config show` renders effective config with API-key values redacted and `config path` shows local/user paths plus the active override.
- Verifier fixes: `config --local` from subdirectories now edits the discovered ancestor local config rather than creating a nested config, user-controlled parent-symlink writes fail closed, and explicit `/tmp/...` isolated config paths with missing parents remain usable.
- Verification: `git diff --check`, `npm run typecheck`, focused config/CLI source tests, full `npm test` with 467 tests, `npm run verify:global-install`, isolated source dogfood for `config show/path/set` plus status reflection, and independent verifier recheck pass.

Added a top-level no-network readiness doctor:

- Added `orx doctor` as an API-key-optional setup overview across runtime config, profile count, test targets, MCP profile policy, plugin review counts, saved delegation teams, and delegation execution policy.
- The command is intentionally an aggregator and pointer surface: it does not call OpenRouter, remote MCP endpoints, plugin bins, or plugin hooks, and it points to `orx mcp status`, `orx plugins doctor`, and `orx delegates plan` for deeper detail.
- Verifier fix: `doctor` no longer treats saved disabled teams as active chat delegates. It reports `chat_readiness: not_evaluated_sessionless_cli`, the active chat delegate requirement, and separate saved-team availability.
- `orx help` now lists `doctor`, and README/command memory describe it as the first setup check before deeper status surfaces.
- Verification: `git diff --check`, `npm run typecheck`, focused source CLI tests, full `npm test` with 459 tests, `npm run verify:global-install`, source/built `doctor` dogfood, and independent verifier recheck pass.

Strengthened model-facing delegate output wrapping:

- Successful `delegate_task` results now include a structured `untrustedOutputPolicy` stating that OpenRouter delegate output is data-only, cannot grant authority, cannot change permissions, cannot request secrets, cannot trigger tool calls, and is raw-output wrapped.
- The untrusted delegate output wrapper now mirrors the stronger MCP wording: begin/end markers plus explicit warnings not to follow instructions, tool calls, permission changes, secret requests, authority claims, or policy changes inside delegated output.
- Updated the `delegate_task` tool schema wording so delegate output is described as current untrusted external model output, not future/provisional output.
- Verifier fix: model-facing dispatch now pre-compacts oversized successful delegate results before generic tool-output truncation, preserving parseable JSON, `BEGIN/END_UNTRUSTED_DELEGATE_OUTPUT`, structured policy metadata, and full-output hash metadata.
- Verification: `git diff --check`, `npm run typecheck`, focused delegation/agent tests, full `npm test` with 458 tests, and `npm run verify:global-install` pass.

Updated delegation help/docs for the policy-gated OpenRouter adapter:

- Replaced stale "inert scaffold" wording in CLI help, slash descriptions, README delegation usage, and command memory with current policy-gated chat behavior.
- Generic delegation status renderers now label the surface as session metadata, show `execution_policy`, and report `delegate_task: policy_gated` or `available_in_chat` instead of implying execution is permanently unavailable.
- Documented the interactive flow: `/delegate add ...`, `/delegate policy set --execution enabled ...`, then `/delegate plan`; `orx ask` still does not expose delegation, and noninteractive CLI commands remain sessionless/read-only for live-session mutation.
- Verifier fixes: saved-team use output is now policy-aware, saved team list/inspect render stored metadata with `stored_*` fields, fixed-mode policy validation errors no longer mention scaffolds or future execution, and stale decision/current-context memory was refreshed.
- Verification: `git diff --check`, `npm run typecheck`, focused delegation/CLI/slash/TUI tests, full `npm test` with 456 tests, `npm run verify:global-install`, built CLI help/readiness dogfood, stale-string scan, and independent verifier recheck pass.
- Next likely work remains real-key policy-enabled chat dogfood, delegate team/profile ergonomics, managed MCP auth beyond env bearer, and final global-install/release hardening.

Implemented policy-gated OpenRouter delegate execution:

- Added an async OpenRouter-backed `delegate_task` adapter behind the existing policy/audit/result envelope. It streams through the existing OpenRouter client, uses the selected delegate model, applies policy/request timeout and result-byte bounds, and returns delegated content only as explicitly wrapped untrusted tool output.
- Added explicit policy execution controls through `--execution enabled|disabled`, `--enable-execution`, and `--disable-execution`; default remains disabled. `/status` and `orx status` now show `delegate_task_adapter: openrouter_available`, runtime `policy_enforced_disabled` or `policy_gated_openrouter_adapter`, and chat-only model exposure when policy plus delegate state are present.
- Wired interactive chat so `delegate_task` is model-visible only after a delegate is configured in the chat session and the local delegation policy has execution enabled. Noninteractive `orx ask` remains unchanged and does not attach session delegates.
- Added live-run safety gates: provider-token, bearer, and assignment-shaped secret-like task/context/expected-output payloads are refused before network, no subprocesses or credential forwarding are used, no raw task/context/output is written to audit, and result persistence remains limited to the normal chat/tool transcript rather than separate delegate storage. Successful delegate calls now audit top-level `ok: true`.
- Verifier fixes: broadened live secret detection after a verifier found `Authorization: Bearer ...` could be sent, fixed successful audit events that were hard-coded `ok:false`, and made readiness render from loaded policy plus delegate state so `/delegate plan` reports `available_in_chat` and `readiness_blockers: none` after policy is enabled and a delegate exists.
- Delegated-task budget UX now records `effectiveMaxTaskCostUsd`, `observedCostUsd`, `costLimitStatus`, and `costLimitExceeded` in successful result envelopes and hash-only audit metadata when OpenRouter generation metadata reports cost. Tool summaries render delegate `cost_usd` and `cost_limit` so over-limit results are visible in chat scrollback.
- Verification before the budget-UX follow-up: `npm run typecheck`, `npm run build`, `git diff --check`, focused delegation/agent/CLI/slash/chat tests, full `npm test` with 454 tests, `npm run verify:global-install`, built CLI policy/status/readiness dogfood with isolated policy/audit paths, and independent verifier recheck all pass.
- Next likely delegation work: dogfood the policy-enabled chat path with a real OpenRouter key in isolated audit/policy paths, then tighten team/profile ergonomics and any stronger pre-spend budget strategy OpenRouter can support.

Implemented the disabled `delegate_task` runtime contract and audit envelope:

- Added an internal delegation runtime that validates `delegate_task` arguments, enforces task/context/output byte bounds plus policy cost/timeout/result caps, resolves only sanitized disabled OpenRouter delegates, and always returns a disabled/fail-closed envelope until a live adapter slice changes the boundary.
- Added hash-only delegation audit JSONL writes at `~/.orx/audit/delegation.jsonl`, with `ORX_DELEGATION_AUDIT_PATH` for tests and isolated runs, `0700` parents, `0600` files, nested symlink path refusal, redaction, no raw task/context/expected output text, no raw delegate output, and no API keys.
- Added an optional `delegate_task` native tool schema and dispatch path behind explicit runtime enablement only. Normal `ask` and `chat` do not expose the schema, and an explicitly dispatched call still reports `execution_disabled` or `adapter_unavailable` without network or subprocess work.
- Added operator-visible readiness/status fields for `delegate_task_schema`, `runtime_enforcement`, `audit_log`, `delegation_audit_path`, `delegate_task_runtime`, `delegate_task_model_exposure`, and `delegate_task_adapter`.
- Added focused coverage for schema gating, dispatch output summaries, policy-bound invalid arguments, hash-only audit contents, symlink audit refusal, and status/readiness rendering.
- Verifier fix: hardened both delegation audit and policy parent checks against nested symlink components after an independent verifier reproduced a write-through case under `link/child`.
- Verification: `npm run typecheck`, `npm run build`, `git diff --check`, focused compiled tests for delegation/agent/CLI/slash/chat paths, full `npm test` passes with 450 tests, `npm run verify:global-install` passes, built CLI status/readiness dogfood passes with isolated policy/audit paths, direct `runDelegateTask` dogfood confirms no raw task/secret in audit output, nested audit symlink dogfood fails closed without writing through the target, and independent verifier recheck confirmed the nested symlink finding is resolved.
- Next likely delegation work: add the OpenRouter delegate adapter and live execution enforcement behind the existing policy/audit/result envelope, then decide when model-visible `delegate_task` can be exposed in normal chat.

Historical slice: implemented initial disabled delegation execution policy storage:

- Added private local policy storage at `~/.orx/delegation/policy.json`, with `ORX_DELEGATION_POLICY_PATH` for tests and isolated runs, `0600` files, `0700` default/private parents, bounded file reads, malformed policy fail-closed defaults, and symlink path refusal.
- Added policy fields for later execution enforcement: max task cost USD, task timeout ms, max result bytes, max concurrent delegates, credential forwarding, result persistence, and result merge. In this initial slice execution was forced disabled; credential forwarding stayed `none`, result persistence stayed `none`, and result merge stayed `manual_summary`.
- Added CLI management through `orx delegate policy` / `orx delegates policy` and `policy set --max-cost-usd <n> --timeout-ms <ms> --max-result-bytes <bytes> --max-concurrent <n> --credentials none --result-persistence none --result-merge manual_summary`.
- Added matching slash commands through `/delegate policy` and `/delegates policy`, including deterministic Tab completion and `/status` visibility for policy path and limits.
- Execution remained unavailable in that slice: no OpenRouter delegate calls, subprocess agents, normal model-visible `delegate_task`, delegate result persistence, or automatic result merge semantics were added.
- Verification: `npm run typecheck`, `npm run build`, `git diff --check`, focused source and build-backed delegation/CLI/slash tests pass with 140 tests, full build-backed `npm test` passes with 443 tests, built CLI dogfood for policy status/set/status visibility succeeds against an isolated `ORX_DELEGATION_POLICY_PATH`, symlink-parent dogfood refuses without writing through the link, and independent verifier recheck passes after fixing parent-symlink and stale usage findings.
- Superseded by the later policy-gated OpenRouter adapter slice; remaining work is real-key dogfood, observed-cost/budget UX, metadata-only dogfood, and delegate ergonomics.

Historical slice: implemented bounded saved delegation teams for the initial Phase 11 metadata surface:

- Added a private local saved-team registry at `~/.orx/delegation/teams.json`, with `ORX_DELEGATION_TEAMS_PATH` for tests and isolated runs, `0600` files, `0700` default/private parents, a 64-team bound, and oversized/invalid registry fail-closed loading.
- Saved team ids are sanitized and normalized. Saved records store only normalized disabled OpenRouter controller/delegate metadata plus timestamps/optional display metadata; persisted state is forced to `executionEnabled=false`, delegates remain capped at 16, and secret-like/control-character values are rejected or omitted.
- Follow-up verifier fixes: registry load/save now refuse symlink paths instead of chmoding or overwriting symlink targets, team descriptions strip every control character before rendering, and saving a 65th new team returns an explicit limit error instead of reporting success and dropping the record.
- Added CLI management through `orx delegates teams`, `orx delegates save <id> --controller <model> [--delegate <name> <model>...]`, `inspect`, `use`, and `delete`; `orx delegate team ...` is also available. CLI save creates/updates teams from explicit safe args, but CLI `use` is intentionally read-only because there is no active chat session state.
- Added slash management through `/delegates teams|save|inspect|use|delete` and `/delegate team ...`; slash `save` captures the current inert session-local scaffold, and slash `use` loads saved disabled metadata into the current chat session.
- `/status` now reports `delegation_team_registry_path` and `delegation_team_count` alongside the existing disabled orchestration fields.
- Execution remained unavailable in that slice: no OpenRouter delegate calls, network calls, subprocess agents, enabled execution state, normal model-visible `delegate_task`, budget policy, result persistence, or merge semantics were added.
- Verification so far: `npm run typecheck`, `npm run build`, `git diff --check`, focused build-backed `dist/delegation/delegation.test.js`, `dist/cli.test.js`, and `dist/slash/index.test.js` pass with 134 tests after the verifier fixes, full build-backed `npm test` passes with 437 tests, and a built-CLI dogfood pass for save/list/inspect/use/delete against an isolated `ORX_DELEGATION_TEAMS_PATH` registry succeeds.
- Superseded by the later policy-gated OpenRouter adapter slice; remaining work is real-key dogfood, observed-cost/budget UX, metadata-only dogfood, and delegate ergonomics.

Implemented noninteractive delegation CLI parity/readiness:

- Added `orx orchestrator`, `orx delegate`, and `orx delegates` as no-key noninteractive parity for the existing slash scaffold, and added read-only slash `plan/status` variants that use the same readiness renderer.
- The CLI renders session-less scaffold status plus readiness blockers for policy-gated execution: normal model exposure is unavailable in noninteractive CLI, the OpenRouter adapter exists for chat, result merge/persistence remain manual/no-extra-storage, and CLI session mutation remains unavailable.
- Mutating forms such as `orx orchestrator openrouter <model>`, `orx orchestrator clear`, `orx delegate add <name> openrouter <model>`, `orx delegate remove <name>`, and `orx delegate clear` validate safe arguments and then refuse because noninteractive CLI has no active delegation chat session.
- The command path remains read-only: no OpenRouter calls, subprocess agents, network calls, persisted delegation state, or normal model-visible `delegate_task` exposure.
- Verification: `npm run typecheck`, `git diff --check`, focused delegation/CLI/slash tests with 126 tests, full build-backed `npm test` with 429 tests, built-CLI dogfood for read-only status plus session-less mutation refusal, and independent verifier pass.
- Superseded by the later policy-gated OpenRouter adapter slice; remaining work is real-key dogfood, observed-cost/budget UX, metadata-only dogfood, and delegate ergonomics.

Implemented read-only plugin review/doctor/audit:

- Added `orx plugins review [--json]` plus `doctor`/`audit` aliases and matching `/plugins review|doctor|audit [--json]` slash commands.
- Review aggregates installed/enabled/disabled counts, local catalog pin drift, bin and hook trust state, plugin MCP profile counts, plugin command aliases, omissions/truncation, and concrete next commands, with structured JSON for automation.
- Review uses read-only registry/trust loading and does not fetch, install, enable, trust, grant, execute plugin surfaces, mutate registry/cache/catalog/trust state, or tighten existing file permissions.
- Verification: `npm run typecheck`, `git diff --check`, focused plugin/CLI/slash tests with 143 tests, full build-backed `npm test` with 428 tests, isolated built-CLI review/audit dogfood with mode checks, and independent verifier recheck pass.
- Next likely plugin/MCP work: actual managed OAuth/provider auth beyond bearer readiness/setup, richer catalog provenance/signing or remote update discovery policy, broader provider/research/code-intelligence integrations, or final install/dogfood hardening.

Implemented explicit plugin catalog update apply:

- Added `orx plugins catalog update <id>` and `/plugins catalog update <id>`, with `upgrade` and `apply-update` aliases, to apply local pinned git catalog updates only after `plugins catalog updates` reports `update_available`.
- Update apply reuses the existing pinned git install path, registers the updated cached snapshot disabled, and reports previous installed commit, catalog commit, previous enabled state, side-effect boundaries, and next authority steps.
- Refusal cases for current, not-installed, local-only, source-mismatch, and unknown catalog entries do not mutate registry/cache/catalog runtime state and render no-side-effect guidance.
- Update-check output now points to `orx plugins catalog update <id>` instead of reusing the broader install command.
- Verification: `npm run typecheck`, `git diff --check`, focused plugin/CLI/slash/TUI source tests with 157 tests, full build-backed `npm test` with 426 tests, built-CLI temp pinned-git dogfood, and independent verifier pass.
- Next likely plugin/MCP work: actual managed OAuth/provider auth beyond bearer readiness/setup, richer catalog provenance/signing or remote update discovery policy, broader provider/research integrations, or final install/dogfood hardening.

Implemented MCP auth readiness inspection:

- Added `orx mcp auth <profile>` and `/mcp auth <profile>` as no-network readiness checks for built-in, plugin, and user MCP profiles.
- Auth output shows profile state, auth requirement, profile-specific bearer env name, fallback bearer env status, effective readiness, auth-required tool count, profile hash/trust state, OAuth limitation, and a no-secret-persistence note.
- Auth checks use the same `ORX_MCP_BEARER_<PROFILE>` / `ORX_MCP_BEARER_TOKEN` resolution as real MCP calls, but render only set/unset/configured state and audit neutral metadata without bearer values.
- Verification: `npm run typecheck`, `git diff --check`, focused MCP/CLI/slash source tests with 186 tests, full build-backed `npm test` with 426 tests, isolated built-CLI auth/audit dogfood, and independent verifier recheck pass.
- Next likely plugin/MCP work: actual managed OAuth/provider auth beyond bearer readiness/setup, richer catalog provenance/signing, broader research/browser integrations, or final install/dogfood hardening.

Expanded built-in MCP provider presets and tightened import risk preservation:

- Added hosted remote HTTP preset templates for `browser`, `cloudflare-api`, `cloudflare-docs`, `figma`, `sentry-readonly`, and `sourcegraph-github-readonly`, alongside existing `context7`, `microsoft-learn`, and `github-readonly`.
- Provider preset inspect now renders profile-level `risk_level` and `write_capable`; installing presets persists those local user-catalog risk signals while keeping profiles disabled.
- `cloudflare-api` statically declares `search` as read-only and `execute` as destructive. `figma` is high/write-capable with zero static tools so the operator must manually declare reviewed tools with the correct risk.
- Reviewed remote MCP tool import now preserves stricter existing same-name declarations and skips undeclared remote tools for high-risk/write-capable profiles. Remote metadata can refresh known declarations, but it cannot downgrade destructive/write/billable/auth state or create new read-only tools for write-capable providers.
- Verification: `npm run typecheck`, `npm run build`, `git diff --check`, focused MCP/CLI/slash source tests with 183 tests, full build-backed `npm test` with 423 tests, built CLI temp-catalog dogfood for Cloudflare/Figma inspect/install, and independent verifier recheck pass.
- Next likely plugin/MCP work: richer catalog provenance/signing, remote OAuth/auth flow design, broader docs/research provider polish, or final install/dogfood hardening.

Implemented no-side-effect plugin catalog update checks:

- Added `orx plugins catalog updates [id]` and `/plugins catalog updates [id]`, with aliases `update-check`, `check-updates`, and `outdated`.
- Update checks compare installed plugin registry provenance against the local catalog's pinned git commits and report current, update-available, not-installed, local-catalog skipped, or source-mismatch states.
- Update checks are local-only and no-side-effect. They do not fetch remotes, install, enable, trust, grant, execute plugin surfaces, or mutate registry/cache/catalog runtime state.
- Next likely plugin/MCP work: richer catalog provenance/signing, broader provider preset packs, or final install/dogfood hardening.

Implemented no-side-effect MCP provider preset inspect commands:

- Added `orx mcp presets inspect <preset>` / `orx mcp presets <preset>` and matching `/mcp presets inspect <preset>` / `/mcp presets <preset>` review surfaces.
- Preset inspect renders static provider template metadata, default user profile id, URL, auth requirement, static tool declarations or remote-tool review guidance, install command, and explicit side-effect boundaries.
- Preset inspect is display-only. It does not write the user MCP catalog, enable or trust profiles, grant tools, fetch remote metadata, call tools, or expose model MCP.
- Next likely plugin/MCP work: broader provider preset packs, catalog update/provenance UX, or stronger prompt-injection boundaries for search/browser/research surfaces.

Implemented no-side-effect plugin catalog inspect commands:

- Added `orx plugins catalog inspect <id>` and `/plugins catalog inspect <id>` for local and pinned git catalog entries.
- Inspect output renders sanitized catalog metadata, source type, local manifest resolution or git pin details, install guidance, and explicit side-effect boundaries.
- Catalog inspect is declaration review only. It does not read plugin manifests, clone, fetch, install, enable, trust, grant, execute, or write registry/cache state.
- Next likely plugin/MCP work: catalog update/provenance UX, broader provider preset packs, or stronger prompt-injection boundaries for search/browser/research surfaces.

Implemented pinned git plugin catalog editor commands:

- Extended `src/plugins/catalog.ts` with `add-git` argument parsing and upsert helpers for pinned git catalog entries: id, repository, full resolved commit, optional ref, safe relative manifest path, description, and normalized tags.
- Added `orx plugins catalog add-git <id> <repository> <resolved-commit>` and `/plugins catalog add-git ...` so pinned git catalog entries no longer require hand-written JSON.
- `add-git` only writes private local catalog declarations. It does not clone, fetch, install, enable, trust, grant, or execute plugin surfaces; explicit `plugins install <catalog-id>` still performs the existing guarded checkout/register flow.
- Existing pinned git install tests now author the catalog entry through the new command before installing by id.
- Verification so far: `npm run typecheck`, `npm run build`, `git diff --check`, focused source and build-backed catalog/CLI/slash/TUI tests with 149 tests, and full build-backed `npm test` with 420 tests pass.
- Next likely plugin/MCP work: richer catalog inspect/update UX, broader provider preset packs, or stronger prompt-injection boundaries for search/browser/research surfaces.

Implemented local plugin catalog editor commands:

- Extended `src/plugins/catalog.ts` with private catalog save/upsert/remove helpers, safe `add-local` argument parsing, directory-to-`orx-plugin.json` resolution, tag normalization, and `0600` catalog / `0700` parent permissions.
- Added `orx plugins catalog add-local <manifest-path-or-directory>` / `orx plugins catalog remove <id>` and matching `/plugins catalog ...` slash commands, plus deterministic slash completions for nested catalog actions. Later work added `add-git` for pinned git declarations.
- Catalog edits are local declarations only: they do not install, enable, trust, grant, fetch, execute, or write registry/cache runtime state. Installing by catalog id remains a separate explicit command.
- Updated README examples for the comfortable authoring flow: scaffold, validate, add-local, install by catalog id, then enable/trust only as needed.
- Verification so far: `npm run typecheck` and focused source tests `node --test --import tsx src/plugins/catalog.test.ts src/cli.test.ts src/slash/index.test.ts` pass with 120 tests.
- Next likely plugin/MCP work: broader marketplace/catalog UX and update checks, expanded provider preset packs, or stronger prompt-injection boundaries for search/browser/research surfaces.

Implemented no-side-effect plugin manifest validation:

- Added `src/plugins/validate.ts` to resolve a manifest path or plugin directory, parse the sanitized manifest, compute the manifest hash, preview existing declared component hashes, and warn about missing declared component paths.
- Added `orx plugins validate <manifest-path-or-directory> [--json]` / `orx plugins check ... [--json]` and matching slash commands. The output includes plugin id, manifest path/hash, source metadata, component status, permission counts, warnings, and explicit `registry_state: unchanged` / no-execution messaging; JSON emits the same read-only validation metadata for automation.
- Validation is read-only authoring feedback: it does not register, install, enable, trust, grant, fetch, execute, or write plugin cache/registry state.
- Verification: `npm run typecheck`, `npm run build`, `git diff --check`, focused source and build-backed validation/scaffold/CLI/slash/TUI tests with 150 tests, built CLI dogfood for scaffold/validate/list showing installed count remains zero, full build-backed `npm test` with 416 tests, and independent verifier recheck pass.
- Next likely plugin/MCP work: richer plugin marketplace/catalog UX and authoring docs/templates, broader prompt-injection wrapping for research/browser/search context, or broader provider preset packs.

Implemented local plugin authoring scaffold:

- Added `src/plugins/scaffold.ts` with safe plugin-id/version/description parsing, component selection, existing non-empty target refusal, and local authoring bundle generation.
- Added `orx plugins scaffold <directory>` and `/plugins scaffold <directory>` plus slash completion/help. The command never registers, enables, trusts, grants, fetches, or executes anything. Default scaffold components are inert `skills`, prompt `commands`, and advisory `rules`; `--minimal` writes only the manifest; `--with` can add empty placeholders for `hooks`, `bins`, `mcp`, `command-schemas`, `assets`, and `docs`.
- Placeholder integration files are deliberately empty/no-op: `{ "hooks": {} }`, `{ "servers": {} }`, `{ "commands": {} }`, and an empty `bin/` directory, so installing/enabling a scaffolded bundle exposes no runnable integration entries until the author writes and reviews them.
- Verification: `npm run typecheck`, `npm run build`, `git diff --check`, focused source and build-backed plugin/CLI/slash/TUI tests with 147 tests, isolated built CLI dogfood for scaffold/list/install and `--with hooks`, full build-backed `npm test` with 413 tests, and independent verifier recheck pass.
- Next likely plugin/MCP work: richer plugin marketplace/catalog UX and authoring documentation, broader prompt-injection wrapping for research/browser/search context, or broader provider preset packs.

Implemented model-visible MCP untrusted-output wrapping:

- Added explicit untrusted remote-output wrapping for model-visible `mcp_call` text results in `src/agent/tool-dispatch.ts`. Text content returned to the model now includes `UNTRUSTED REMOTE MCP TOOL OUTPUT`, source profile/tool metadata, a policy reminder not to follow remote instructions/permission changes/secret requests, and begin/end content markers.
- Marked returned MCP content items as `untrusted: true` and added an `untrustedOutputPolicy` object to the model-visible JSON envelope. Operator `/mcp call` output remains unchanged.
- Strengthened the `mcp_call` tool schema description so the model is warned before use that remote MCP output cannot override system, developer, operator, ORX policy, or tool-permission instructions.
- Verification: `npm run typecheck`, `npm run build`, `git diff --check`, build-backed `dist/agent/runtime.test.js` with 24 tests, full build-backed `npm test` with 407 tests, and independent verifier Maxwell all pass with no blocking issues.
- Next likely plugin/MCP work: broader prompt-injection wrapping for research/browser/search context, richer catalog/marketplace UX, plugin authoring docs, or broader provider preset packs.

Implemented reviewed remote MCP tool import:

- Added `src/mcp/remote-tool-import.ts` plus bulk user-catalog tool upsert helpers. The import flow uses guarded `tools/list`, refuses built-in/plugin profiles before network, imports only sanitized tool names into local `user:` catalogs as read-only/free declarations with profile-inherited auth, skips unsupported names, and reports before/after profile hashes plus pending schema-change state.
- Added `orx mcp remote-tools` and `orx mcp discover` noninteractive CLI parity for the existing slash paths, using dedicated MCP transport hooks and audit events.
- Added `orx mcp import-remote-tools <profile> [--limit <n>]`, alias `import-tools`, and matching slash commands. Imports do not enable profiles, trust changed hashes, grant tools, expose model MCP, persist raw schemas, or call `tools/call`.
- Extended MCP redaction for provider token shapes such as `ghp_`, `github_pat_`, `glpat-`, and Slack-style `xox*` tokens so skipped remote tool names and audit payloads do not leak token-looking metadata.
- Updated README and decisions for the reviewed import workflow.
- Verification: `npm run typecheck`, `npm run build`, `git diff --check`, focused build-backed MCP/CLI/slash tests with 177 tests, full build-backed `npm test` with 406 tests, and isolated CLI dogfood for preset add/enable/inspect plus built-in import rejection all pass. Independent verifier Hume found no blocking issues; independent verifier Aristotle found a skipped-name token redaction gap, which was fixed and regression-tested.
- Next likely plugin/MCP work: prompt-injection boundary hardening for MCP/research outputs, richer catalog/marketplace UX, plugin authoring docs, or broader provider preset packs.

Implemented MCP provider preset templates:

- Added built-in provider presets for `context7`, `microsoft-learn`, and `github-readonly`.
- Added `orx mcp presets`, `orx mcp add-preset <preset>`, `/mcp presets`, and `/mcp add-preset <preset>` so common remote MCP profiles can be added to the local user catalog without typing URLs/tool declarations manually.
- Preset installs write only disabled local catalog declarations. They do not enable profiles, trust hashes, grant tools, expose model MCP, or bypass existing MCP call/discovery gates.
- Verification: `npm run typecheck`, `git diff --check`, focused source tests for MCP/CLI/slash with 172 tests, full build-backed `npm test` with 401 tests, and an isolated CLI dogfood pass for `mcp presets`, `mcp add-preset context7 --id docs`, `mcp add-preset github-readonly`, catalog rendering, and inspect pass. Independent verifier found no blocking issues and ran extra edge probes for GitHub zero-tool install, disabled state, no grants, and unsafe override rejection.
- Next likely plugin/MCP work: importing reviewed remote `tools/list` metadata into declared tools, prompt-injection boundary hardening for MCP/research outputs, richer catalog/marketplace UX, or plugin authoring docs.

Implemented MCP user catalog management commands:

- Added editor helpers for local user MCP catalogs so ORX can add/remove `remote-http` profiles and declared tools without hand-editing JSON. Writes create private parent directories and catalog files, preserve existing profile/tool fields when updating, and preserve existing array/object/legacy `servers` declarations.
- Added `orx mcp catalog`, `orx mcp add-profile`, `orx mcp remove-profile`, `orx mcp add-tool`, and `orx mcp remove-tool`, plus matching slash commands. The new commands reuse `ORX_MCP_PROFILE_CATALOG_PATH`, namespace profiles as `user:<profile-id>`, and keep actual enable/trust/tool-call/model-call authority in the existing MCP gates.
- Updated README examples for user MCP catalog setup.
- Verification: `npm run typecheck`, `git diff --check`, focused source tests for MCP/CLI/slash with 169 tests, full build-backed `npm test` with 398 tests, and an isolated CLI dogfood pass for array-catalog edit plus multi-word names pass. Independent verifier recheck found no blocking issues after ad hoc CLI/slash probes for array catalogs and quoted multi-word `--name`/`--notes`.
- Next likely plugin/MCP work: provider preset packs/docs for common remote MCP services, prompt-injection boundary hardening for MCP/research outputs, richer catalog/marketplace UX, or plugin authoring docs.

Implemented local user MCP profile catalogs:

- Added `src/mcp/user-profiles.ts` with a bounded, sanitized local profile catalog loader. Default path is `~/.orx/mcp/profile-catalog.json`; `ORX_MCP_PROFILE_CATALOG_PATH` overrides it for tests or alternate local setups.
- User catalog profiles are namespaced as `user:<profile-id>`, support `profiles` arrays, `profiles` objects, or `servers` objects, currently accept `remote-http` transports only, reject credentials/query/fragment/secret-like values, and store per-profile declaration hashes in source provenance.
- The MCP registry now includes catalog profiles alongside built-in and plugin profiles, so `/mcp list|inspect|tools|enable|disable|call|remote-tools|discover`, `orx mcp ...`, `/status`, chat `/mcp model ...`, and `orx ask --mcp-tools` all use the same enable/trusted-hash/schema-change/tool-grant/model-grant gates.
- Verification so far: `npm run typecheck`, `git diff --check`, focused source tests for MCP/CLI/slash with 165 tests, and full build-backed `npm test` with 394 tests pass, including a one-shot `ask --mcp-tools` model bridge test against a catalog-backed `user:context7` profile.
- Next likely plugin/MCP work: provider preset packs/docs for common remote MCP services, prompt-injection boundary hardening for MCP/research outputs, richer catalog/marketplace UX, or plugin authoring docs.

Implemented pinned git plugin catalog installs:

- Extended catalog entries with sanitized `source.type = "git"` metadata: repository, optional ref, required full `resolvedCommit`, and safe relative manifest path.
- Added `src/plugins/installer.ts` so `orx plugins install <catalog-id>` and `/plugins install <catalog-id>` can clone a catalog git source with shell-disabled bounded `git`, checkout the exact commit, reject unsafe git transports/credentials/query strings/fragments, reject manifest symlink escapes, normalize cached manifest provenance to the catalog pin, and then reuse the existing ORX-owned inert register/cache flow.
- Direct manifest installs and local catalog manifest-path installs keep their existing behavior; git catalog installs still leave plugins disabled, and hooks/bins/MCP/exec aliases remain separately gated by enablement plus trust/policy.
- Manifest git repository validation now allows normal SSH usernames such as `ssh://git@host/repo.git` while still rejecting passwords, unsafe transports, query strings, fragments, and secret-like values.
- Verification so far: `npm run typecheck`, `npm run build`, and focused build-backed plugin/CLI/slash tests pass with 130 tests after verifier-found fixes for ambient Git filter/config inheritance and malformed direct-manifest git repository strings.
- Next likely plugin/MCP work: richer catalog/marketplace UX, provider preset packs, prompt-injection boundary hardening for MCP/research outputs, or broader docs around plugin authoring.

Implemented manifest-defined executable plugin command schemas:

- Added sanitized `components.commandSchemas` support for enabled plugins. The JSON schema declares bounded command metadata, a direct plugin bin reference, optional usage text, and optional `maxArgs`.
- `/plugin list` and `orx plugins commands` now show `exec` aliases as `/plugin:<plugin-id>:exec:<slug>` with command hashes, target bins, trust state inherited from the referenced bin, and missing-bin visibility.
- Slash execution for `exec` aliases enforces `maxArgs` and then delegates to the existing trusted-current bin runtime, preserving cached-plugin cwd, manifest-declared env only, redacted/truncated output, and JSONL audit behavior.
- Verification: `npm run typecheck`, `git diff --check`, focused source tests for plugin command aliases/slash/CLI/registry, build-backed focused plugin/slash/CLI tests, full `npm test` with 383 tests, and independent verifier recheck pass.
- Later work added pinned git catalog installs; next likely plugin/MCP work is richer marketplace/catalog UX, provider presets, prompt-injection boundary hardening, or broader docs/provider presets.

Implemented compact test report parsing:

- `src/testing/` now parses common Node, Vitest, Jest, and Playwright summary lines from already-captured sanitized test output into numeric report counts.
- `orx tests run`, `/tests run`, and rendered run results show compact `report:` fields when counts are available.
- Model-visible `run_tests` output includes the same report object, and visible tool summaries include compact report counts such as tests, passed, failed, skipped, files, suites, and duration.
- Verification: `npm run typecheck`, `npm run build`, `git diff --check`, focused source tests for `src/testing/test-adapters.test.ts` plus `src/agent/runtime.test.ts`, build-backed focused runtime/CLI/slash/test-adapter tests, full `npm test` with 381 tests, and independent verifier recheck after parser-conservatism fixes.
- Next likely programming-power-pack work: tree-sitter-backed code intelligence or non-JSON/custom reporter integration when ORX can safely request it.

Implemented line-based multiline prompt continuation:

- `orx chat` now treats an input line ending with an unescaped `\` as a continuation marker and collects following lines into one user message.
- TTY mode renders a continuation `orx …` composer; non-TTY and `NO_COLOR` retain script-safe line-oriented behavior with a plain `...>` continuation prompt.
- Multiline user scrollback indents continuation lines under the first `you:` line, and slash commands remain single-line-only dispatches.
- Verification: `npm run typecheck`, `npm run build`, `git diff --check`, focused TUI/CLI build-backed tests, focused source TUI tests with 33 tests, full `npm test` with 380 tests through the independent verifier, and verifier ad hoc probes for escaped backslashes, multiline slash input, interior blank lines, and TTY `NO_COLOR` continuation fallback.
- That slice's next likely history/search ergonomics work is now complete; provider badge polish is now complete; remaining TTY polish is optional future raw-mode editing only with script-safe fallback preserved.

Implemented framework-aware test metadata:

- `src/testing/` now annotates discovered package-script and Node fallback test targets with framework metadata: `node`, `vitest`, `jest`, `playwright`, or `unknown`.
- Package-script discovery infers framework labels and simple reporter hints from sanitized script commands without changing execution semantics.
- `orx tests list`, `/tests list`, and rendered test run output now show framework/reporter metadata where available.
- `/status` and `orx status` now show `test_frameworks` counts; model-visible `run_tests` summaries include the target framework.
- Verification: `npm run typecheck`, `npm run build`, `git diff --check`, focused build-backed runtime/CLI/slash/test-adapter tests with 134 tests, full `npm test` with 377 tests, dogfood temp-project `tests list` probes, and an independent verifier recheck pass.
- Next likely test-adapter work after this slice: parse framework-specific Vitest/Jest/Playwright/Node report output into richer result summaries.

Implemented model-visible native `run_tests`:

- Added `src/tools/run-tests.ts` and registered `run_tests` in the native local coding tool registry.
- Added the OpenRouter tool schema for `run_tests` with optional `targetId`, `extraArgs`, `timeoutMs`, and `maxBytes`.
- `dispatchNativeToolCall` now routes `run_tests` to the existing `src/testing/` adapter with the active cwd, abort signal, shell-disabled process runner, timeout/output bounds, and sanitized extra arguments.
- Visible tool summaries show test status, target id, exit/timed-out state, and stdout/stderr truncation flags without dumping test output into the terminal summary.
- Verification: `npm run typecheck`, `npm run build`, `git diff --check`, focused build-backed runtime/tools/CLI tests with 76 tests, full `npm test` with 376 tests, and dogfood `npm run dev -- tests run script:test -- --test-name-pattern ...` pass.
- Next likely programming-power-pack work after this slice: deeper Vitest/Jest/Playwright/Node report parsing or tree-sitter-backed code intelligence.

Implemented dependency-free local code maps and symbols:

- Added `src/code-map/` for operator-invoked local repository maps.
- `orx code map [path]`, `orx map [path]`, `orx code-map [path]`, `/map [path]`, and `/code map [path]` work without an OpenRouter API key.
- `orx code symbols [query]`, `orx symbols [query]`, `/code symbols [query]`, and `/symbols [query]` reuse the same scan to render exported JavaScript/TypeScript symbols with file paths and line numbers.
- The scanner bounds files, entries, depth, and source bytes; skips `.git`, `.orx`, `node_modules`, `dist`, `build`, `coverage`, and similar generated/vendor directories; skips symlinks; and reports omissions/truncation.
- Rendered output includes language counts, key files, package/config/source entrypoints, and top JavaScript/TypeScript source files with imports/exports while redacting secret-like rendered paths and symbols.
- Import/export extraction is line-oriented and tracks block comments/template literals to avoid counting example code inside comments or template strings.
- Verification after the map slice: implementor focused tests passed with 107 tests; full `npm test` passed with 375 tests; `npm run typecheck`, `npm run build`, `git diff --check`, and dogfood `npm run dev -- code map` passed. External verifier agent could not complete because the subagent usage limit was reached, so a local verifier-style pass added the comment/template-literal regression coverage before commit.
- Symbol index follow-up verification: focused code-map/CLI/slash tests passed with 107 tests, and dogfood `npm run dev -- code symbols createCode` plus `npm run dev -- symbols renderCode` returned expected exported symbols with file paths and line numbers before final full-suite verification.
- Next likely programming-power-pack work: tree-sitter-backed call/reference slices, LSP/SCIP diagnostics, and richer framework-specific test reports.

Implemented native test target commands:

- Added `src/testing/` for operator-invoked test target discovery and execution.
- `orx tests list|run` and `/tests list|run` discover safe `package.json` `test*` scripts, default to `script:test` when present, and fall back to direct Node `*.test.*` / `*.spec.*` files when no package `test` script exists.
- Test runs use the shared process runner with shell disabled, output caps, timeouts, sanitized extra arguments, secret redaction in rendered stdout/stderr, redacted omitted script paths, and safe absolute paths for root dash-leading Node test files.
- `/status` and `orx status` now show `test_targets`, `test_default_target`, `test_package_scripts`, `test_node_targets`, and `test_frameworks`.
- Verification: implementor full suite passed with 371 tests; verifier rechecked redaction, unsafe omitted script names, no-key operation, command-injection probe, and dash-leading Node test fallback with no findings after fixes.
- Model-visible `run_tests` is now implemented; next likely test work is deeper Vitest/Jest/Playwright/Node report parsing.

Implemented namespaced plugin command aliases:

- Added `src/plugins/command-aliases.ts` to derive `/plugin:<plugin-id>:command:<slug>` prompt aliases and `/plugin:<plugin-id>:bin:<file>` bin aliases from enabled cached plugin surfaces.
- Added `/plugin list`, `/plugins commands`, and `orx plugins commands` to list aliases. `/status` and `orx status` now show command alias, prompt alias, bin alias, and trusted-bin-alias counts.
- Dynamic slash dispatch now recognizes `/plugin:...` aliases. Prompt aliases call the existing untrusted prompt activation path; bin aliases call the existing trusted bin runtime and preserve bin hash/env/output/audit gates.
- Verification: verifier found no issues after independent probes for prompt arg rejection, unknown alias handling, bin trust/stale mutation, env forwarding, audit arg redaction, and list/status counts. `npm run typecheck`, build-backed focused plugin/CLI/slash/TUI tests with 127 tests, `git diff --check`, full `npm test` with 364 tests, and `npm run dev -- status` pass.
- Later work added manifest-defined exec aliases; next likely plugin work is remote source fetching, richer catalog UX, or docs/provider presets.

Implemented explicit plugin bin runtime:

- Added `src/plugins/bins.ts` with enabled-plugin cached `components.bins` discovery, private `~/.orx/plugins/bins.json` trust state, private `~/.orx/audit/bins.jsonl` audit logs, and env overrides `ORX_PLUGIN_BINS_CONFIG_PATH` / `ORX_PLUGIN_BINS_AUDIT_PATH`.
- Added `orx bins list|inspect|trust|run|untrust` and `/bins list|inspect|trust|run|untrust`; bin ids use `plugin:<plugin-id>:bin:<file>`.
- Bin runs require a trusted current bin hash, run from the cached plugin root, forward only manifest-declared env names, use Node/shebang/sh runners without making cached files executable, truncate/redact output, and do not write raw argument lists to audit logs.
- `/status`, `orx status`, `/plugins list`, and `orx plugins list` show bin definitions/trust/pending counts.
- Verification: verifier found nested helper hash, arbitrary shebang interpreter, and audit runtime-arg persistence issues; fixes were applied and verifier recheck reported no findings. `npm run typecheck`, build-backed focused plugin/CLI/slash/TUI tests with 147 tests, `git diff --check`, full `npm test` with 362 tests, and `npm run dev -- status` pass.
- Next likely plugin work: executable plugin slash-command aliases around trusted bins/prompts, or richer code-intelligence adapters.

Implemented persisted model MCP tool allowlists:

- Added private MCP config `modelToolGrants` records for profile id, tool name, current profile hash, risk, billable flag, and granted timestamp.
- Added `/mcp allow-model-tool <profile> <tool>` / `/mcp revoke-model-tool <profile> <tool>` plus matching `orx mcp allow-model-tool|revoke-model-tool` commands.
- `mcp_call` now requires active model-tool grants in addition to session/ask opt-in, enabled/trusted/unchanged profiles, declared-tool policy, read-only non-billable risk, env bearer auth or explicit `ORX_MCP_KEYCHAIN=1` macOS Keychain opt-in, guarded transport, redaction/truncation, and audit logging.
- Status and MCP policy renderers show `model_tool_grants`, `stale_model_tool_grants`, per-tool `model_grant=active|stale`, and `model_policy=allowed|denied` when a model grant exists.
- Verification: Zeno found no behavior/security issue; wording and `/mcp tools` model-policy clarity fixes were applied. `npm run typecheck`, focused MCP/agent/CLI/slash tests with 173 tests, full `npm test` with 355 tests, `git diff --check`, and `npm run dev -- status` pass.
- Later work added manifest-defined exec aliases; next likely MCP/plugin work is remote source fetching, richer catalog UX, or docs/provider presets.

Implemented session-local model MCP `mcp_call` runtime:

- Added optional native model tool schema `mcp_call`, excluded from normal model requests unless `runAgentTurn` receives enabled MCP model options.
- Added chat `/mcp model enable|disable|status` and `model_mcp_tools` in interactive `/status`; `/new` and `/resume` reset the session-local exposure to disabled.
- `mcp_call` reuses the same enabled/trusted/unchanged profile gates, declared-tool policy, env bearer auth or explicit macOS Keychain opt-in, guarded remote transport, redacted/truncated output, and audit event shape as explicit MCP calls.
- Model-visible MCP calls are limited to read-only non-billable declared tools. Billable/write/destructive MCP tools are denied before network even when an explicit operator grant exists.
- Verification: verifier found only stale docs/memory wording; the wording was corrected. `npm run typecheck`, `git diff --check`, focused MCP/agent/slash/chat tests with 168 tests, full `npm test` with 350 tests, and `npm run dev -- status` pass.
- Follow-up one-shot support: `orx ask --mcp-tools` now exposes the same read-only non-billable `mcp_call` bridge for one noninteractive request, with dedicated MCP transport injection in tests and no default exposure.
- Verification for the ask opt-in: verifier found stale discovery/remote-tools/memory wording and requested an explicit plain-ask negative assertion; fixes were applied and verifier recheck reported no findings. `npm run typecheck`, `git diff --check`, focused CLI/agent/MCP/slash tests with 169 tests, full `npm test` with 351 tests, and `npm run dev -- status` pass.
- Later work added persisted model allowlists and manifest-defined exec aliases; next likely MCP work is clearer prompt-injection boundaries or provider presets.

Implemented explicit operator MCP `tools/call` runtime:

- Added `src/mcp/call.ts` for guarded `tools/call` requests on enabled/trusted/unchanged `remote-http` profiles when `evaluateMcpToolPolicy()` returns `allowed`.
- Added env bearer auth lookup through `ORX_MCP_BEARER_<PROFILE>` or `ORX_MCP_BEARER_TOKEN`; later macOS Keychain support remains explicit opt-in with `ORX_MCP_KEYCHAIN=1`, and auth-bearing profiles/tools do not attempt network calls without a resolved token.
- Added `/mcp call <profile> <tool> [arguments-json]` and `orx mcp call <profile> <tool> [arguments-json]` with dedicated MCP call fetch hooks for tests. The general OpenRouter fetch hook is not used for live MCP calls.
- Result rendering is bounded, redacted, marked untrusted, and explicitly not exposed to the model loop. Audit events record status/policy/result hashes/content types without raw arguments, raw output, bearer tokens, or schemas.
- Billable/write/destructive tools still require active profile-hash-bound grants; stale grants deny before network.
- Verification: verifier recheck reported no findings. `npm run typecheck`, `git diff --check`, focused MCP/slash/CLI tests with 146 tests, full `npm test` with 344 tests, and `npm run dev -- status` pass.
- That slice's next likely controlled model-loop exposure foundation, noninteractive opt-in, persisted model allowlists, and manifest-defined exec aliases are now implemented; remaining MCP work is clearer prompt-injection boundaries or provider presets.

Implemented MCP per-tool grant policy storage:

- Added private MCP config `toolGrants` records for profile id, tool name, current profile hash, risk, billable flag, and granted timestamp.
- Added policy evaluation support for active versus stale grants. Read-only declared tools remain allowed on enabled/trusted/unchanged profiles, while billable/write/destructive tools require an active grant; stale grants render visibly and are denied.
- Added `/mcp allow-tool <profile> <tool>` and `/mcp revoke-tool <profile> <tool>` plus matching `orx mcp allow-tool|revoke-tool` noninteractive commands. `orx mcp list|inspect|tools|enable|disable` now gives local no-key access to MCP policy/profile state.
- Added grant counts to `/status`, `orx status`, and `/mcp tools`, plus redacted audit events for grant allow/revoke attempts.
- At that checkpoint no MCP `tools/call`, remote execution, or model-loop exposure was added; explicit operator `tools/call` was implemented later while model-loop exposure remains absent.
- Verification: verifier found and rechecked fixes for audit assignment redaction and grant-aware inspect output with no remaining findings; `npm run typecheck`, `git diff --check`, focused MCP/slash/CLI tests with 139 tests, full `npm test` with 337 tests, and `npm run dev -- status` pass.
- Later work implemented guarded `tools/call`, model MCP grants, and manifest-defined exec aliases; next likely MCP work is clearer prompt-injection boundaries or provider presets.

Implemented read-only remote MCP `tools/list` metadata:

- Added shared `src/mcp/transport.ts` for guarded MCP JSON-RPC POSTs so initialize discovery and tools/list share URL guarding, DNS vetting, address binding, timeout coverage, bounded response reads, and test-only injected fetches.
- Added `src/mcp/remote-tools.ts` and `/mcp remote-tools <profile>` for enabled/trusted/unchanged `remote-http` profiles.
- `remote-tools` calls only JSON-RPC `tools/list`, supports bounded pagination, renders tool names/descriptions plus schema/tool hashes, and marks metadata as untrusted. Later work added explicit operator `tools/call`; model-loop exposure remains unimplemented.
- Slash wiring uses `mcpRemoteToolsFetch` for tests only; live ORX does not use the general OpenRouter fetch hook for MCP remote tools.
- Added redacted `mcp.profile.remote_tools_attempt` audit events with tool/schema hashes.
- Verification: verifier recheck found no remaining findings, focused MCP/slash/CLI tests pass, `npm run typecheck`, `git diff --check`, full `npm test` with 331 tests, and `npm run dev -- status` pass.
- That slice's next likely policy/storage work is now complete; next likely MCP work is a guarded, audit-first `tools/call` runtime or executable plugin slash-command design.

Implemented trusted plugin MCP endpoint discovery:

- `/mcp discover <profile>` now supports plugin-provided `remote-http` MCP profiles after the profile is enabled, has a trusted current hash, and has no pending schema change.
- Plugin discovery uses the same explicit profile trust gates as built-in MCP discovery, plus URL guarding before any network attempt.
- Production MCP discovery now uses a Node-native guarded POST transport: DNS is resolved and vetted before connecting, local/private/reserved/metadata results are rejected, requests are bound to a vetted address, responses are byte-bounded, and injected `fetch` is reserved for tests.
- Discovery performs only a minimal JSON-RPC `initialize` handshake. It reports server/protocol/capability summary, auth-required, blocked URL, DNS/network, and schema states. Later work changed the rendered execution note to explicit `/mcp call` only, still not model-loop exposure.
- Slash command wiring now separates MCP discovery test hooks from the general OpenRouter fetch hook, so live `/mcp discover` does not accidentally use generic `globalThis.fetch`.
- Focused verification: `npm run typecheck` and `npm run build && node --test dist/mcp/mcp.test.js dist/slash/index.test.js` pass with 99 tests.
- That slice's next likely remote-tool-listing and policy-storage work is now complete; next likely MCP work is a guarded, audit-first `tools/call` runtime or executable plugin slash-command design.

Implemented automatic trusted plugin lifecycle hook dispatch:

- Added `runTrustedPluginHooksForEvent` for event-scoped hook execution that discovers enabled cached hooks, runs only operator-trusted current hashes, and skips untrusted or pending-hash hooks without spawning them.
- Wired lifecycle events into chat, one-shot `ask`, and slash/runtime paths: `session_start`, `user_prompt_submit`, `pre_tool_use`, `post_tool_use`, `pre_compact`, `post_compact`, and `stop`.
- Lifecycle hooks reuse the manual trusted hook runtime: cached plugin root/safe relative cwd, declared env-only forwarding, inherited env disabled, timeout/output caps, redaction, private JSONL audit logging, and fail-closed audit persistence.
- Hook failures are rendered to stderr and audited. Core chat/tool/compact flow continues after visible hook failures; untrusted and pending-hash hooks are skipped.
- Moved readline creation until after `session_start` hooks complete so finite/non-TTY input streams cannot be consumed before the chat loop starts.
- `/status` now shows `plugin_hook_runtime: manual_and_lifecycle`, and `plugin_enabled_hooks` reflects trusted current hook hashes.
- Focused verification: `npm run typecheck`, `npm run build`, and build-backed focused CLI/plugin/slash/chat tests pass with 155 tests after verifier fixes. Full `npm test` passes with 318 tests.
- Next likely plugin work: executable plugin slash-command design or plugin MCP tool execution policy.

Implemented trusted plugin hook manual runtime:

- Added `src/plugins/hooks.ts` for bounded discovery of enabled-plugin `components.hooks` JSON from the ORX-owned cached manifest path only.
- Hook ids are namespaced as `plugin:<plugin-id>:<hook-id>` and hook hashes include sanitized hook declarations plus plugin manifest/component provenance.
- Private hook trust state lives under `~/.orx/plugins/hooks.json` with `ORX_PLUGIN_HOOKS_CONFIG_PATH`; hook audit logs default to `~/.orx/audit/hooks.jsonl` with `ORX_PLUGIN_HOOKS_AUDIT_PATH`.
- Added `orx hooks run <id>` and `/hooks run <id>` for explicit manual execution of trusted current hashes only. Unknown, untrusted, and changed-hash hooks are blocked before spawning anything.
- Hook runs use the cached plugin root plus optional safe relative `cwd`, forward only declared env names with inherited process env disabled, apply hook/default timeout and output byte caps, redact forwarded env values from rendered/audited output, and write private JSONL audit events.
- Declared hook cwd directories are copied into the ORX-owned cache during install, including when the hooks JSON file itself is nested inside the cwd, so trusted hooks continue to run from cached plugin state after the original source checkout is removed. Successful hook commands whose audit event cannot be persisted are treated as failed runs.
- That slice exposed hook audit/status fields before later lifecycle dispatch updated the runtime to `manual_and_lifecycle`.
- Verification: `npm run typecheck`, `npm run build && node --test dist/plugins/hooks.test.js dist/plugins/registry.test.js dist/cli.test.js dist/slash/index.test.js dist/tools/tools.test.js` with 136 focused tests, `git diff --check`, and `npm test` with 315 tests pass. Verifier rechecked audit-failure and nested hook-cwd cache probes with no remaining findings.
- That slice's next likely lifecycle work is now complete; current next likely plugin work is executable plugin slash-command design or plugin MCP tool execution policy.

Implemented render-only plugin MCP presets routed through MCP policy:

- Added `src/plugins/mcp-presets.ts` for bounded discovery of enabled-plugin `components.mcpServers` JSON from the ORX-owned cached manifest path only.
- Plugin MCP presets are namespaced as `plugin:<plugin-id>:<server-id>`, include plugin manifest/component provenance in MCP profile hashes, and flow through `/mcp list`, `/mcp inspect`, `/mcp tools`, `/mcp enable`, and `/status`.
- Plugin-sourced profiles default disabled and remained non-executable. At this older checkpoint, `/mcp discover` did not contact plugin-declared endpoints; later trusted guarded plugin endpoint discovery superseded that limitation while keeping tool execution inactive.
- `/status` now shows `plugin_mcp_presets` while `plugin_enabled_mcp` remains `0` for executable/plugin-server runtime.
- Focused verification: `npm run typecheck` and `npm run build && node --test dist/plugins/registry.test.js dist/mcp/mcp.test.js dist/cli.test.js dist/slash/index.test.js dist/tui/chat.test.js` pass with 156 tests.
- That slice's next likely hook-trust, endpoint-discovery, and remote-tool-listing work is now complete; current next likely plugin work is executable slash-command design or plugin MCP tool execution policy.

Implemented inert plugin metadata fields:

- Added optional manifest `metadata` fields for homepage, documentation, license, trust tier, auth requirements, privacy/data-access notes, and runtime requirements.
- Metadata is strictly sanitized: URLs reject credentials/query/fragment, env names stay names-only, arrays are bounded, and known metadata fields reject secret-like values and terminal control characters.
- `/plugins inspect` now renders trust tier, auth, privacy, and runtime requirements; later work also made bin-backed executable command schemas visible through plugin command aliases.
- Updated README and tooling memory for display-only metadata.
- Focused verification: `npm run typecheck` and `npm run build && node --test dist/plugins/registry.test.js dist/cli.test.js dist/slash/index.test.js` pass with 101 tests.
- Next likely plugin work: plugin-provided MCP preset wiring or executable slash-command design/hook trust, both still gated by explicit policy.

Implemented plugin markdown prompt-command activation:

- Added `src/plugins/prompts.ts` for bounded discovery of enabled plugin `components.commands` markdown files from the ORX-owned cached manifest path only.
- `/prompts list` and `/prompts status` expose sanitized metadata without loading full prompt content. `orx ask` and chat requests receive compact enabled-prompt metadata as ephemeral system context.
- `/prompts activate <id>` explicitly loads full markdown, rejects secret-like values and terminal control characters, appends an untrusted system message, and records activated prompt provenance in session metadata.
- Chat resume/persistence now carries activated prompt provenance and prunes activated prompt messages when the backing plugin prompt is disabled or removed.
- `/status`, help, command palette, Tab completion, README, session tests, CLI tests, slash tests, and TTY tests were updated for prompt-command visibility.
- Focused verification: `npm run typecheck` and `npm run build && node --test dist/plugins/prompts.test.js dist/cli.test.js dist/slash/index.test.js dist/tui/chat.test.js dist/sessions/store.test.js` pass with 116 tests.
- Next likely plugin work: plugin rules or richer remote/plugin metadata, then MCP preset wiring while executable hooks/bins/MCP/plugin commands remain gated.

Implemented plugin markdown rule activation:

- Added `src/plugins/rules.ts` for bounded discovery of enabled plugin `components.rules` markdown files from the ORX-owned cached manifest path only.
- `/rules list` and `/rules status` expose sanitized metadata without loading full rule content. Rule names/descriptions come only from frontmatter or filenames, never markdown body text.
- `orx ask` and chat requests receive compact enabled-rule metadata as ephemeral system context; full markdown loads only through explicit `/rules activate <id>`.
- Activated rules append untrusted system messages, record provenance in session metadata, and are pruned from chat/session state when the backing plugin rule is disabled or removed.
- `/status`, help, command palette, Tab completion, README, session tests, CLI tests, slash tests, and TTY tests were updated for rule visibility.
- Next likely plugin work: richer plugin metadata/namespacing or plugin-provided MCP preset wiring while executable hooks/bins/MCP/plugin commands remain gated.

Implemented and focused-verified ORX-owned local plugin install cache:

- Added `src/plugins/cache.ts` with `~/.orx/plugins/cache` default storage, `ORX_PLUGIN_CACHE_DIR` override support, registry-derived test isolation, private cache directories/files, bounded component snapshots, and temp-directory staging per plugin id/manifest hash.
- Plugin install/register now writes a sanitized cached `orx-plugin.json` plus declared component paths only; unknown manifest fields and unreferenced local files are not copied into ORX state.
- Plugin lock records now use the cached manifest path for runtime discovery and keep `originalManifestPath` provenance for inspection.
- CLI and slash plugin install/register resolve relative manifests from the active cwd and pass the same cache directory through chat. `/status` reports `plugin_cache_path`.
- Enabled plugin skill discovery now survives removal of the original plugin source directory because `components.skills` resolves from the cached manifest directory.
- Focused verification: `npm run typecheck` and `npm run build && node --test dist/plugins/registry.test.js dist/plugins/skills.test.js dist/cli.test.js dist/slash/index.test.js dist/tui/chat.test.js` pass with 119 tests.
- Next likely plugin work after cache/catalog groundwork: remote source fetching or richer plugin metadata/namespacing, then plugin-provided prompts/rules and MCP preset wiring while executable hooks/bins/MCP/plugin commands remain gated.

Implemented local plugin catalog metadata and install-by-id groundwork:

- Added `src/plugins/catalog.ts` for local catalog JSON under `~/.orx/plugins/catalog.json`, with `ORX_PLUGIN_CATALOG_PATH` override support, sanitized catalog ids/descriptions/tags/manifest paths, broader token-like metadata rejection, and relative manifest resolution from the catalog file location.
- Added `orx plugins catalog`, `/plugins catalog`, and `plugins install <catalog-id>` / `/plugins install <catalog-id>` resolution while preserving direct manifest-path installs.
- Initial catalog operations were local and no-fetch; later work added pinned git catalog source installs that checkout a pinned commit and then reuse the existing inert register/cache flow.
- Updated help, command palette, slash completions, README, CLI tests, slash tests, and catalog parser tests.
- Focused verification: `npm run typecheck` and `npm run build && node --test dist/plugins/catalog.test.js dist/cli.test.js dist/slash/index.test.js dist/tui/chat.test.js` pass with 101 tests.
- Next likely plugin work: remote source fetching or richer plugin metadata/namespacing, then plugin-provided prompts/rules and MCP preset wiring while executable hooks/bins/MCP/plugin commands remain gated.

Implemented and verified plugin management CLI ergonomics:

- Added `orx plugins list|inspect|register|install|enable|disable` as a no-API-key, noninteractive wrapper around the existing private plugin registry.
- Added `/plugins install <manifest-path>` as an operator-facing alias for the existing inert `/plugins register <manifest-path>` flow.
- Plugin install/register still stores a local disabled registry record only; enabling a plugin persists an enabled marker. Later work added trusted bin manual execution, bin-backed executable command aliases, trusted hook manual execution, automatic trusted lifecycle hook dispatch, and separately gated plugin MCP execution.
- Updated slash completions, help/palette usage, README, and command memory for the new `install` alias and CLI plugin commands.
- Added focused CLI coverage for install/list/inspect/enable/disable without `OPENROUTER_API_KEY`, plus updated slash completion/help assertions.
- Verifier found and fixed plugin registry override parent chmod behavior, so existing `ORX_PLUGIN_REGISTRY_PATH` parent directories keep their mode while default/new ORX-owned registry directories remain private and registry files stay `0600`.
- Verifier also sanitized unknown plugin id error rendering and updated CLI help/no-fetch coverage for plugin commands.
- Verifier `npm run typecheck`, `npm run build && node --test dist/plugins/registry.test.js dist/cli.test.js dist/slash/index.test.js`, manual no-key plugin CLI smokes, `git diff --check`, and `npm test` with 276 tests pass.

Implemented and verified Phase 12 saved profile controls:

- Added `src/profiles/` for private saved profile storage under `~/.orx/profiles.json`, with `ORX_PROFILE_CONFIG_PATH` override support, `0700` parent directories, `0600` files, malformed-record sanitization, secret-like value filtering, and no API-key persistence.
- Saved profile snapshots include model, mode, Fusion preset, theme, and permission posture. Applying a profile preserves the runtime API key and sets `activeProfile` for status/session visibility.
- Added `orx profile list|save|use|inspect|delete` and global `orx --profile <id>` application before `status`, `ask`, or chat startup.
- Added `/profile [list|save <id> [options]|use|inspect|delete]` in chat. Manual `/model`, `/mode`, `/fusion`, and `/theme` changes clear `activeProfile` so the status label does not become stale.
- `orx status` and interactive `/status` now show `active_profile` and `profile_count`; session config snapshots persist `activeProfile` while continuing to exclude API keys.
- Added focused tests for profile registry persistence, path overrides, file modes, no-key storage, CLI profile commands, `--profile` status behavior, slash profile lifecycle, completion/help, and session snapshots.
- Verifier found that existing override parent directories could be chmodded accidentally; main session fixed profile storage to preserve existing override parent permissions while keeping default/new ORX-owned profile directories private and profile files `0600`.
- Main-session `npm run typecheck`, build-backed targeted profile/slash/session/CLI/request tests, exact `/tmp` override repro, `git diff --check`, `npm test` with 273 tests, and `npm run dev -- status` pass. Verifier recheck reported no findings.

Implemented and verified Phase 12 TTY theme controls:

- Added a persisted config theme option with default `default` and allowed values `default`, `mono`, and `vivid`.
- Added `/theme [default|mono|vivid]` for interactive theme inspection and mutation; invalid values render usage and leave config unchanged.
- TTY render helpers now resolve theme from explicit render options, then `ORX_TTY_THEME`, then `ORX_THEME`, while preserving `NO_COLOR` and non-TTY plain output behavior.
- Wired the active theme through chat status/composer rendering, visible tool summaries, `/credits`, `/commands`/`/palette`, CLI `status`, CLI `credits`, and one-shot `ask` summaries.
- Session config snapshots persist `theme` while continuing to exclude API keys.
- Verifier initially found incomplete theme propagation to tool summaries, slash `/credits`, compact palette output, and CLI one-shot ask; main session fixed all findings and verifier recheck reported no findings.
- `npm run typecheck`, `npm run build`, build-backed targeted render/config/slash/session/TUI/CLI tests, `git diff --check`, `npm test` with 265 tests, and `npm run dev -- status` pass.

Implemented and verified Phase 12 TTY input ergonomics: deterministic slash argument completion:

- Extended readline Tab completion beyond command names and aliases to deterministic slash arguments.
- Completion now suggests stable values for `/mode <auto|fusion>`, `/fusion general-budget`, `/web <help|fetch|search|browse>`, `/mcp` subcommands plus the built-in `openrouter` profile, `/plugins` and `/skills` subcommands, `/orchestrator` subcommands/model shortcuts, `/delegate` subcommands/adapter/model shortcuts, `/resume latest`, `/help all`, and `/commands <slash-command>`.
- Completion intentionally avoids dynamic model IDs, plugin IDs, skill IDs, session IDs, file paths, URLs, and free-form search/model text.
- Slash dispatch, network behavior, and metadata commands are unchanged.
- Verifier found one missing deterministic `/web help` completion; main session fixed it and added focused coverage.
- `npm run typecheck`, build-backed targeted slash tests, `git diff --check -- src/slash/index.ts src/slash/index.test.ts`, `npm test` with 261 tests, full `git diff --check`, and `npm run dev -- status` pass.

Implemented and verified Phase 12 compact TTY model badge polish:

- The TTY bottom status notch now shortens `openrouter/auto` to `route auto` and `openrouter/fusion` to `route fusion`, while wide exact model ids split into `provider` and `model` badges.
- This is display-only TTY polish; active config, OpenRouter request model ids, plain `/status`, and non-TTY/footer output still use the full model id.
- Added focused screen/chat assertions for the compact `auto` badge and verifier manually checked the `fusion` badge path.
- Verifier reported no findings after typecheck, focused TUI/slash tests, diff check, and a manual render probe. Main-session `npm run typecheck`, `npm test` with 261 tests, full `git diff --check`, and `npm run dev -- status` pass.

Historical slice: implemented and verified the initial Phase 11 orchestration/delegation command metadata:

- Added session-local delegation state for an optional OpenRouter controller and named OpenRouter delegates. In this initial slice execution remained disabled and no `delegate_task` tool/schema existed yet.
- Added `/orchestrator`, `/delegate`, and `/delegates` slash command scaffolds. They mutate only local session metadata and make no OpenRouter, subprocess, Codex, Devin, or external agent calls.
- In this initial slice, `/status` in interactive chat showed `orchestration_controller`, disabled execution state, delegate count, and unavailable `delegate_task`; later policy-gated adapter work superseded that runtime status.
- Session JSON can persist and restore delegation metadata on `/resume`; API keys are still excluded.
- Delegate names/models reject control characters and secret-like values. Stored delegation state is normalized, deduped, sorted, capped at 16 delegates, and forced to `executionEnabled=false`.
- `/clear` intentionally preserves orchestration/delegate metadata; use `/orchestrator clear`, `/delegate remove <name>`, or `/delegate clear` for that state.
- Implementor and verifier agent sessions were used. Verifier found missing delegate count bounds and overly broad `/clear` behavior; main session fixed both and verifier recheck reported no findings.
- `npm run typecheck`, build-backed targeted delegation/slash/session/TUI tests, `git diff --check`, and `npm test` pass with 261 tests.

Implemented and verified Phase 10 browser automation foundation:

- Added `/web browse <url>` and `/browse <url>` as explicit operator slash commands; no model-autonomous browser tool was added.
- Browser snapshots create `EvidenceSource` records with `kind=browser`, `provider=playwright-browser-snapshot`, hashes, title/URL metadata, `/sources` visibility, and session persistence.
- Chat appends bounded untrusted browser-output context; browser output cannot authorize tool use, permission changes, MCP/profile/plugin enablement, hooks, bins, command execution, policy changes, or instruction priority changes.
- The default browser path dynamically loads Playwright if available, fetches the target document through ORX's DNS-bound Node transport, loads that HTML into the browser with `page.setContent`, disables JavaScript, and aborts all browser-routed network requests. This avoids letting Chromium resolve/connect to remote URLs in this first foundation slice.
- Initial and final URLs are guarded, DNS results are vetted against local/private/reserved/metadata addresses, redirects are guarded, and fetched document bytes are bounded.
- Default browser capture no longer serializes full `page.content()`; injected-driver HTML is bounded before hashing.
- Normal tests use injected browser drivers/resolvers and do not require launching a real browser. Clean installs without Playwright render an explicit unavailable error for `/web browse`.
- Implementor and verifier agent sessions were used. Verifier initially found a DNS-rebinding gap and unbounded DOM/HTML capture risk; main session fixed both and verifier recheck reported no browser-code findings.
- `npm run typecheck`, build-backed targeted research/slash/TUI tests, `git diff --check`, and `npm test` pass with 253 tests.

Implemented and verified Phase 10 slash-only web search MVP:

- Added `/web search <query>` and `/search <query>` as explicit operator slash commands backed by Brave Web Search when `BRAVE_SEARCH_API_KEY` is configured.
- Search requests are bounded to Brave's documented 400-character / 50-word query limits and use a dedicated injected search fetch path in tests/CLI plumbing.
- Search results become secondary evidence-source metadata with sanitized title/snippet/URL fields, stable snippet/content hashes, and `provider=brave-search-snippet`.
- Blocked local/private/reserved result URLs are skipped before they enter source state or chat context.
- Chat appends bounded untrusted search-snippet context only when usable results exist; provider snippets are explicitly unable to authorize tools, permissions, MCP/profile/plugin changes, hooks, bins, command execution, policy changes, or instruction priority changes.
- `/cite` and `/bibliography` now mark search-snippet provenance as provider snippets, not fetched primary-page evidence.
- Non-key runs do not make a network request and render a plain explanatory message.
- Implementor and verifier agent sessions were used. Verifier found Brave query-bound and CLI env plumbing issues; main session fixed both and verifier recheck reported no findings.
- `npm run typecheck`, build-backed targeted research/slash/TUI/CLI tests, `git diff --check`, and `npm test` pass with 244 tests.

Implemented and verified Phase 12 TTY command-discovery slice:

- Added `/commands [query]` with `/palette` alias as a direct command-discovery surface backed by existing slash command metadata.
- TTY/color-capable output uses a compact width-aware command palette with a bounded number of matches; non-TTY and `NO_COLOR=1` continue to render the deterministic grouped plain palette.
- Wired Node readline's completer for interactive terminal sessions only, completing slash command names and aliases such as `/sta<Tab>` to `/status ` without touching command arguments.
- Added pure tests for compact palette rendering and slash completion, slash tests for `/commands` and `/palette`, and TTY chat coverage proving `/commands` does not call OpenRouter.
- Implementor and verifier agent sessions were used. Verifier reported no findings and also ran a real PTY smoke for `/commands plugin`, `/sta<Tab>`, `/status`, and `/exit`.
- `npm run typecheck`, build-backed targeted slash/TUI tests, `git diff --check`, and `npm test` pass with 236 tests.

Implemented and verified Phase 12 TTY polish: activity animation:

- Added a TTY-only activity state to the bottom status composer: `work <spinner> assistant` while waiting for assistant text and `work <spinner> tool <name>` while native tool calls are active.
- The activity composer updates in place with terminal line clearing and is cleared before assistant/tool scrollback is printed, so stale status prompts do not remain above output.
- Activity labels strip ANSI and C0 control characters, collapse whitespace, and remain bounded before rendering.
- Non-TTY and `NO_COLOR=1` still use the existing plain/script-safe output; readline terminal mode remains independent from the styled screen gate.
- Ctrl+C still aborts an active request before idle exit, now clearing active TTY activity before printing the interruption message.
- Added pure TTY screen tests for activity rendering, width bounds, and label sanitization; added chat integration coverage for assistant activity, terminal clear sequencing, and real `read_file` tool activity.
- Implementor and verifier agent sessions were used. Verifier initially found stale activity scrollback and CR/LF label sanitization gaps; main session fixed both and verifier recheck reported no findings.
- `npm run typecheck`, build-backed targeted TUI/terminal tests, `git diff --check`, and `npm test` pass with 232 tests.

Implemented and verified Phase 12 package/global install hardening:

- Added `prepare` to `package.json` so local source/global installs build `dist/cli.js` automatically through npm lifecycle.
- Added `npm run verify:global-install`, backed by `scripts/verify-global-install.mjs`, which installs a no-`dist` source copy with a temporary npm prefix and temp HOME/session/MCP/plugin paths.
- The verifier script checks installed `orx --version`, `orx status` from outside the repo, no-arg `orx` with `/exit`, and persisted session cwd.
- Fixed CLI entrypoint detection to resolve npm symlinks before comparing the invoked bin path with `dist/cli.js`.
- Updated README with the source-global install flow: `npm install`, `npm install -g .`, then `orx`.
- `npm pack --dry-run --json` confirms packaged `dist/cli.js` is executable. Compiled test files are still included under `dist`; that packaging shape is unchanged for now.
- Verifier reported no findings. `npm run verify:global-install`, `npm run typecheck`, `npm run build`, targeted CLI tests, `git diff --check`, `npm pack --dry-run --json`, and `npm test` pass.

Implemented and verified Phase 12 UX Recovery Slice 4: grouped/help-filtered slash commands and first palette surface:

- Added grouped slash command metadata with common vs advanced tiers.
- `/help` now renders concise grouped common commands instead of a giant ungrouped dump.
- `/help all` shows common commands first, then advanced account/session/research/integration commands.
- `/help <query>` filters by command name, usage, description, aliases, tier, and group.
- Added low-friction aliases: `/m` -> `/model`, `/s` -> `/status`, `/q` and `/exit` -> `/quit`, `/h` -> `/help`.
- Added pure command listing/palette helpers: `listSlashCommands`, `filterSlashCommands`, `renderSlashHelp`, and `renderCommandPalette`.
- Unknown slash commands now point to `/help <query>` and `/help all`.
- Verifier checked help grouping/filtering, alias dispatch, canonical command behavior, and metadata completeness; no findings.
- `npm run typecheck`, `git diff --check`, targeted slash/chat tests, and `npm test` pass with 229 tests.

Implemented and verified Phase 12 UX Recovery Slice 3: first bottom-oriented TTY status/composer pass:

- Added `src/tui/screen.ts` with pure width-aware TTY status/composer rendering helpers.
- TTY chat now starts with a compact bottom-oriented `orx` status notch and `orx >`-style composer prompt instead of the old long top header/footer.
- TTY chat no longer prints the long plain footer after each assistant turn; non-TTY and `NO_COLOR` retain the script-safe line-oriented fallback.
- The notch includes compact cwd, model, mode, permissions, session id, approximate local context meter, observed OpenRouter metadata cost, and live credits when available.
- Long cwd/model/session fields truncate to the terminal width without overlapping; focused narrow/wide render tests cover this.
- Readline terminal mode is now separate from the styled screen gate, so `NO_COLOR=1` disables the styled screen without disabling interactive readline behavior.
- Verifier found the readline/NO_COLOR coupling, the issue was fixed, and a chat-level regression test now guards it.
- `npm run typecheck`, `git diff --check`, targeted TUI/terminal/CLI tests, and `npm test` pass with 224 tests.

Implemented and verified Phase 12 UX Recovery Slice 2: no-arg `orx` chat launch:

- `orx` with no args now starts the same interactive chat path as `orx chat` after config/API-key validation.
- `orx help`, `orx --help`, and `orx -h` still render help without requiring an API key.
- No-arg `orx` without an API key now fails like `orx chat` instead of silently showing help.
- The no-arg chat path preserves the terminal cwd as the active workspace/session cwd.
- Added focused CLI tests for explicit help variants, no-key no-arg failure, and no-arg chat/session cwd persistence.
- Verifier ran targeted tests, direct source-entrypoint smokes from a temp cwd, and `npm test`; no findings.
- Main session verification: `npm run typecheck`, `git diff --check`, targeted CLI tests, and `npm test` pass with 219 tests.

Implemented and verified Phase 12 UX Recovery Slice 1: model resolver and safer `/model`:

- Added `src/openrouter/model-resolver.ts` for catalog-backed model resolution.
- `/model <id-or-search>` now fetches the OpenRouter model catalog when possible and only mutates active config after resolving to an exact model id.
- Friendly single matches resolve to the exact catalog id; multiple matches render bounded `/model <id>` choices and leave state unchanged.
- Unknown friendly names such as `/model deepseek v4` show a helpful `/models <query>` suggestion and leave state unchanged.
- Exact provider/model slugs are accepted when catalog-confirmed and remain available as an explicit unverified fallback if the catalog is unavailable.
- Live OpenRouter metadata errors now redact the known API key and common OpenRouter key patterns before rendering in CLI or slash command output.
- Added focused resolver, slash command, and live-error redaction tests.
- Verifier reproduced the `/model deepseek v4` failure path and reported no findings.
- `npm run typecheck`, `git diff --check`, targeted resolver/live/slash tests, and `npm test` pass with 218 tests.

Implemented and verified Phase 12 Slice 1 CLI polish foundation:

- Added `src/terminal/render.ts` for internal ANSI styles and ASCII-safe meters. Color is disabled for non-TTY output and when `NO_COLOR` is set; tests stay readable in plain text.
- Added `src/terminal/meters.ts` for local context, OpenRouter metadata cost, and OpenRouter credits meters.
- Interactive `/status` now includes `context_meter` derived from local approximate serialized message bytes versus the configured local budget. It is labeled `approx_local_bytes` and does not claim provider-token accuracy.
- Interactive `/status` and the chat footer now include a cost meter from OpenRouter metadata ORX has actually received, showing metadata coverage, latest turn cost, and known session cost. Unknown cost metadata is rendered as `n/a`.
- `/credits` now renders a live OpenRouter credits usage meter from returned/derived total, used, remaining, and percent fields. Chat stores fetched credits only in process and shows account credits in the footer only after `/credits` succeeds.
- Chat header/footer, interactive status headings, and visible tool summaries use light TTY-only color styling while preserving plain non-TTY output.
- Extended live credits parsing to accept explicit `total`, `used`, `remaining`, and `percent` field variants while retaining the existing derived fallback.
- Added focused tests for terminal rendering, NO_COLOR/non-TTY behavior, meter formatting, `/status` context/cost meters, `/credits` meter output, and chat footer rendering.
- `npm run typecheck` and targeted build-backed terminal/openrouter/slash/chat/CLI tests pass.

Implemented and verified the bounded Phase 10 Slice 2 citation/bibliography MVP:

- Added `src/research/citation.ts` with deterministic metadata-only citation rendering on top of existing `EvidenceSource` records.
- Added `/cite <source-id>` and `/bibliography` slash commands. `/cite` with no args shows usage plus available source ids; missing ids return a bounded metadata-only error.
- Citation output includes a concise source line, source hash, text hashes, provenance, and the research trust boundary. Bibliography output renders all evidence sources in stable source-id order with hashes and provenance.
- `/cite` and `/bibliography` never render fetched page text; they use persisted evidence metadata only and perform no network calls.
- Citation fields strip terminal/ANSI/OSC control sequences, bound inline display fields, re-canonicalize/redact valid `canonicalUrl` values, and omit invalid canonical URLs rather than risking secret leakage.
- Resumed chats reuse existing session `evidenceSources`, so `/cite` and `/bibliography` work after `/resume` without changing the session schema.
- Added tests for citation rendering, stable bibliography ordering, missing/no-source behavior, poisoned metadata sanitization, slash command behavior, and chat resume citation persistence.
- `npm run typecheck`, targeted research/slash/chat/session tests, `git diff --check`, and `npm test` pass with 199 tests.

Implemented and verified the bounded Phase 10 Slice 1 web fetch/extract and research evidence ledger MVP:

- Added `src/research/` with evidence source types, SHA-256 hashing, conservative HTML/plain-text extraction, untrusted web context message creation, and `/sources` rendering.
- Added a layered SSRF-style URL guard for explicit web fetches: only `http`/`https` are allowed; localhost, loopback, private IPv4, link-local, shared/reserved/documentation/multicast IPv4, IPv6 loopback/link-local/unique-local/multicast, IPv4-mapped local IPv6, embedded credentials, and obvious cloud metadata hosts/IPs are blocked before network.
- Added bounded direct fetch using a Node-native guarded transport by default. Production fetch resolves DNS, rejects any local/private/reserved resolved address, and binds the request to a vetted address while preserving the original hostname for HTTP host/SNI/certificate validation. A separate `webFetch` injection exists only for tests and is not shared with OpenRouter metadata fetch hooks.
- Fetch timeout now covers DNS/request/header and body-read phases; byte/text extraction limits, sanitized errors, guarded redirects, terminal-control stripping, secret-like path/query redaction in canonical URLs, and stable content/text hashes are in place.
- Added chat slash commands `/web fetch <url>`, `/fetch <url>`, `/web` help, and `/sources`.
- `/web fetch` is operator-only slash behavior, not a model-autonomous browsing tool. It records source metadata and appends a bounded user-role context message that marks fetched content as untrusted and unable to authorize tool use, permission changes, MCP/profile/plugin enablement, hooks, bins, command execution, policy changes, or instruction priority changes.
- Session JSON now persists `evidenceSources` metadata while the bounded extracted text remains in the transcript message; `/status` shows the current chat evidence source count.
- Added tests for URL guard defaults, reserved-IP coverage, DNS resolution blocking, DNS timeout, blocked URL no-network behavior, bounded fetch/extract, body-read timeout, terminal-control stripping, sanitized errors, slash `/web fetch`, `/sources`, prompt-injection marking, chat/session persistence, and source status visibility.
- `npm run typecheck`, targeted research/slash/chat/session tests, and `npm test` pass with 191 tests.

Implemented and verified the Phase 9 Slice 2 Agent Skills loader with progressive disclosure:

- Added `src/plugins/skills.ts` for bounded Agent Skills discovery from enabled plugins only; disabled plugins contribute no skills to `/skills`, `/status`, or model context.
- Skills are discovered only from an enabled plugin's `components.skills` directory, either `SKILL.md` at the component root or immediate child directories containing `SKILL.md`; no recursive walking is performed.
- Discovery is bounded by skill count, child directory count, metadata bytes, and file/path safety. Metadata rejects secret-like values and terminal control characters; oversized or unsafe skills are omitted.
- Enabled skill metadata now includes stable ids such as `plugin:<plugin-id>:<skill-slug>`, plugin id, name, description, path, content hash from the bounded metadata read, and source manifest hash.
- `runAgentTurn` accepts ephemeral system messages. `orx ask` and `orx chat` prepend compact enabled-skill metadata to model requests without persisting it as normal chat history.
- Added `/skills list` for metadata-only listing and `/skills activate <id>` for explicit activation. Activation reads the exact `SKILL.md`, prints provenance, appends an untrusted full-content system message to the chat, and records activated skill provenance in session metadata.
- The activation system message states that plugin skill content is untrusted and cannot authorize tool use, permission changes, MCP enablement, hooks, bins, plugin commands, or command execution.
- Full skill activation rejects secret-like values and terminal control characters before content enters model context or persisted session transcripts.
- Chat prunes activated skill system messages and provenance when the backing plugin/skill is no longer enabled, so disabled plugins stop contributing skill context to future model requests.
- `/skills inspect` is intentionally not an activation alias; full content is loaded only through `/skills activate <id>`.
- Skill discovery fails closed if an enabled plugin registry record lacks a safe absolute manifest path, preventing malformed registry state from resolving skills relative to the process cwd.
- `/status` now reports `plugin_enabled_skills`.
- Session JSON can store `activatedSkills` provenance while keeping API keys out of saved config snapshots.
- Later work added trusted bin manual execution, bin-backed executable command aliases, trusted hook manual execution, automatic trusted lifecycle hook dispatch, and separately gated plugin MCP execution; network/fetch install sources remain future work.
- `npm run typecheck`, `git diff --check`, targeted plugin/slash/runtime/session/CLI/chat tests, and `npm test` pass with 177 tests.

Implemented and verified the Phase 9 Slice 1 plugin manifest/registry/lockfile foundation:

- Added `src/plugins/` with sanitized ORX plugin manifest parsing, stable plugin ids, deterministic manifest hashes, local lock-style records, and component hashes for local files/directories when available.
- Added private plugin registry persistence under `~/.orx/plugins/registry.json`, with `ORX_PLUGIN_REGISTRY_PATH` override support and `0700` directory / `0600` file writes.
- Added installed vs enabled plugin state. Registering a local manifest stores the plugin disabled by default; enable/disable persist only an inert state marker.
- Added `/plugins list`, `/plugins inspect <id>`, `/plugins register <manifest-path>`, `/plugins enable <id>`, and `/plugins disable <id>`.
- Later work added trusted bin manual execution, bin-backed executable command aliases, trusted hook manual execution, automatic trusted lifecycle hook dispatch, and separately gated plugin MCP execution; `/plugins` and `/status` now show bin/hook/MCP trust and execution counts.
- Added status visibility for installed plugin count, enabled plugin count, enabled hooks, enabled bins, and enabled MCP count; executable counts remain `0` in this slice.
- Hardened manifests and loaded registry records against secret-like values, terminal control characters, credential/query-bearing git URLs, unpinned git sources, poisoned display metadata, and unbounded local component hashing.
- Added tests for local register/list/inspect/enable/disable, invalid manifest rejection, no network/fetch, secret-field dropping, private registry file modes, registry override paths, status visibility, git source pinning, bounded component hashing, and poisoned registry sanitization.
- `npm run typecheck`, `git diff --check`, targeted plugin/slash/CLI tests, and `npm test` pass with 165 tests.

Implemented and verified the Phase 8 MCP declared-tool policy evaluation scaffold:

- Added pure MCP tool policy evaluation for configured declared tools without live discovery or remote execution.
- Default policy now allows only read-only declared tools on enabled, trusted profiles with no pending schema change.
- At that checkpoint, billable/write/destructive declared tools were denied unless a future explicit allowlist was provided; later work added profile-hash-bound grant policy storage while keeping OpenRouter `chat-send` and other risky tools non-executable.
- Added `/mcp tools <profile>` to render each declared tool with risk, auth, billable flag, and policy decision. The command is render-only and does not fetch, discover, or execute tools.
- Extended `/mcp inspect`, `/mcp list`, and `/status` with concise policy/default-denied/risky tool visibility.
- Added redacted audit events for `/mcp tools`.
- Added tests for disabled-profile blocking without network, enabled/trusted read-tool allowance, billable `chat-send` denial, pending schema-change blocking, unknown profile/tool handling, and status/inspect/tools output.
- `npm run typecheck`, build-backed targeted MCP/slash/CLI tests, `git diff --check`, and `npm test` pass with 150 tests.

Implemented and verified the Phase 8 official OpenRouter MCP discovery scaffold:

- Added `src/mcp/discovery.ts` with a gated, testable discovery result surface and a minimal remote HTTP JSON-RPC `initialize` attempt.
- Added `/mcp discover <profile>` for manual profile discovery/status; it only attempts network discovery when the persisted profile exists, is enabled/trusted, has no pending schema change, and uses `remote-http`.
- Disabled, untrusted, and pending-schema-change profiles return explanatory no-network results.
- `401`/`403` discovery responses are treated as `auth_required` for OpenRouter OAuth or dedicated expiring MCP keys, with sanitized bounded errors and no secret leakage.
- At that checkpoint remote MCP tool execution remained unimplemented and was explicitly rendered in `/mcp inspect` and discovery output; later work added explicit operator `tools/call` while normal chat/ask inference and REST metadata commands still use direct OpenRouter APIs.
- Updated the OpenRouter MCP declared tools to the current documented surface: `models-list`, `model-get`, `model-endpoints`, `providers-list`, `rankings-daily`, `app-rankings`, `credits-get`, `generation-get`, `benchmarks`, `docs-search`, `view-skill`, `ping`, and billable `chat-send`.
- Added redacted MCP audit events for discovery attempts/results.
- Added tests for discovery gating, mocked enabled discovery, auth-required handling, secret redaction, slash audit output, and REST metadata independence.
- `npm run typecheck`, `git diff --check`, targeted MCP/slash/CLI tests, and `npm test` pass with 142 tests.

Implemented and verified the Phase 8 persistent MCP profile trust/config slice:

- Added `src/mcp/config.ts` for private MCP profile config resolution, load/save, sanitization, and default storage under `~/.orx/mcp/profiles.json`, with `ORX_MCP_CONFIG_PATH` override support.
- Replaced process-local `/mcp enable/disable` behavior with persisted profile state records containing only profile id, enabled/disabled state, trusted profile hash baseline, and updatedAt.
- Threaded MCP config paths through noninteractive `orx status`, `orx chat`, slash command context, `/mcp`, and interactive `/status`.
- `/mcp enable openrouter` now persists enabled state and trusts the current configured hash; `/mcp disable openrouter` persists disabled state while preserving the trusted hash baseline.
- `/mcp list`, `/mcp inspect`, and `/status` show persisted profile state, trusted hash/update metadata when available, and pending schema-change visibility when the current configured hash differs from the trusted baseline.
- Added tests for persistent enable/disable across fresh status contexts, CLI status with `ORX_MCP_CONFIG_PATH`, config file shape/sanitization, trusted-hash preservation, pending schema-change calculation, and no-network `/mcp` behavior.
- `npm run typecheck`, `npm run build`, targeted MCP/slash/CLI/chat tests, `npm test` with 128 tests, and `git diff --check` pass.

Implemented and verified the next Phase 8 MCP policy foundation checkpoint:

- Added deterministic SHA-256 profile/registry hashing for configured MCP profiles based on profile metadata, transport/auth/write flags, and declared tool metadata rather than runtime enabled state.
- Expanded the OpenRouter MCP profile metadata from bare tool names to declared tools with auth, risk, and billable flags; `chat-send` is marked billable/risky while the profile remains `writeCapable=false`.
- Added local MCP audit JSONL scaffolding under `~/.orx/audit/mcp.jsonl`, with `ORX_MCP_AUDIT_PATH`/test override support, private file creation, and secret redaction for status, inspect, enable, and disable attempts.
- Added `/mcp list`/default, `/mcp inspect <profile>`, `/mcp enable <profile>`, and `/mcp disable <profile>`. Enable/disable are in-process policy simulations only and do not persist config or execute MCP tools.
- Extended `/mcp` and `/status` with profile hashes, registry hash, pending schema-change visibility (`none`), active/configured billable tool counts, and existing MCP risk/auth/server counts.
- Added no-network tests for stable and changed MCP hashes, audit JSONL redaction/shape, `/mcp` inspect/list/enable/disable behavior, `/status` visibility, and no fetch calls from MCP slash commands.
- `npm run typecheck`, `git diff --check`, and `npm test` pass with 118 tests.

Implemented and verified a bounded Phase 8 live metadata and MCP policy scaffold checkpoint:

- Added direct OpenRouter live metadata helpers for `GET /models`, `GET /credits`, and `GET /generation?id=...` with sanitized errors that redact API keys and bearer tokens.
- Replaced chat `/models` placeholder with live model catalog lookup when an OpenRouter API key is available, including optional text filtering and concise id/name/context/pricing output.
- Added chat `/credits` and `/generation <id>` slash commands for live credits and generation metadata; `/generation` can fall back to latest in-session generation id when present.
- Added non-interactive `orx models [query]`, `orx credits`, and `orx generation <id>` commands.
- Added `src/mcp/` registry/policy scaffolding with an explicit disabled-by-default `openrouter` remote HTTP profile for `https://mcp.openrouter.ai/mcp`; no MCP tool execution is implemented.
- Added chat `/mcp` status output and `/status` MCP visibility for active profiles, server counts, auth-bearing servers, write-enabled tools, risky transports, and the disabled OpenRouter profile.
- Kept normal `ask` and chat inference on the direct OpenRouter chat completions path.
- Added no-network tests for live models, credits, generation success, sanitized failures, metadata CLI commands, slash command behavior, no chat-completion request for metadata slash commands, and MCP status visibility.
- `npm run typecheck` and `npm test` pass with 108 tests.

Implemented and verified the remaining Phase 7 persistent `/compact` slice:

- `/compact` still uses the shared local extractive compactor and preserves the provenance text `ORX compacted prior context locally`.
- Chat persists the compacted message list through the normal post-slash session save path.
- Persisted session JSON stores the compacted summary plus the recent suffix and remains API-key-free.
- Resuming a compacted session restores the compacted summary, and `/status` after resume reports `compacted=yes`.
- Minimal sessions with no compactable prefix are reported as unchanged and persist predictably without adding a summary.
- Added no-network tests for compact persistence to session JSON, resume loading of compacted summaries, `/status` after resume, and minimal-session `/compact` behavior.
- `npm run typecheck` and `npm test` pass with 99 tests.

Implemented and verified the Phase 7 `/resume` slice:

- Added tolerant session listing for saved JSON records, sorted newest-first and excluding the active session.
- Chat `/resume` with no selector lists recent transcript-bearing sessions with title, cwd, updated time, model, mode, cost, and message count.
- Chat `/resume <number|id|prefix|latest>` loads a saved session, restores messages, latest metadata, active routing/Fusion config, and switches the active chat cwd to the saved session cwd.
- Exact id and prefix selection search all transcript-bearing saved sessions, not only the displayed recent list.
- Ambiguous prefix output is capped, non-numbered, and instructs users to use an exact id or longer unique prefix so `/resume 1` cannot be confused with ambiguous-match numbering.
- Blank startup session files are omitted from `/resume` listings.
- Added no-network tests for session listing, missing/malformed session files, slash `/resume` list/resume/error/ambiguous output, full chat resume with restored Fusion routing, exact-id resume outside the recent display window, and bounded ambiguous output.
- `npm run typecheck`, `git diff --check`, and `npm test` pass with 95 tests.
- Independent verifier found and rechecked exact-id and ambiguous-output edge cases; final pass reported no findings.

Implemented and verified the first Phase 7 session persistence foundation:

- Added `src/sessions/` with session ids, JSON save/load helpers, session directory resolution, config snapshots without API keys, summaries, and best-effort git repository metadata.
- Interactive `orx chat` now creates a session record and persists active config, messages, latest OpenRouter metadata, cwd, and git metadata under `~/.orx/sessions/`.
- Session directories/files are written with private `0700`/`0600` modes, and credential userinfo is redacted from persisted git remote URLs.
- Chat refreshes best-effort git metadata when saving after turns and slash commands.
- `ORX_SESSION_DIR` can override the session directory, including relative paths resolved from cwd, which keeps tests isolated from the real home directory.
- Chat header and interactive `/status` now show the active session id/path.
- `/new` rotates to a fresh session file while keeping the current process alive.
- Added no-network tests for session id safety, directory resolution, save/load without API key leakage, record updates, git metadata, chat persistence, and CLI chat session-directory override.
- `npm run typecheck` and `npm test` pass with 89 tests.

Implemented and verified the Phase 6 session diff state and `/diff` slice:

- Added lightweight in-process `SessionDiffState` tracking under `src/agent/`.
- `runAgentTurn` can now update session diff state from successful edit-capable tool outputs that report `changedFiles`, including `apply_patch` and future compatible native edit tools.
- Model-requested `git_diff` and chat `/diff` update the latest diff snapshot metadata without leaking diff text into `/status`.
- Added chat `/diff [path...]`, backed by the native `git_diff` tool, with untracked new-file diffs and a concise `No working tree changes.` clean-tree message.
- Interactive `/status` now includes one concise `diff_state` line when chat provides session diff state.
- Added no-network tests for generic edit-capable diff state, `apply_patch` runtime state updates, slash `/diff` dirty/clean behavior, `/status` diff state, and chat-level `/diff` without OpenRouter calls.
- `npm run typecheck` and `npm test` pass with 81 tests.

Implemented and verified the Phase 6 runtime context-management slice:

- Added `src/agent/context.ts` for UTF-8 byte/message estimates, default context budgets, and deterministic local compaction.
- `runAgentTurn` now bounds messages before each OpenRouter request, including tool-loop iterations.
- Chat uses the shared context budget for in-process history shaping.
- Added `/compact` to apply local extractive in-memory compaction without persistent session storage.
- `/status` now includes concise context state with message count, approximate bytes, budget, and compaction presence.
- Local compaction inserts an assistant-role summary with provenance: `ORX compacted prior context locally`.
- Recent user turns, assistant tool calls, and tool results are preserved as a contiguous suffix for immediate continuity.
- Added no-network tests for byte estimates, compaction boundaries, runtime request shaping, chat history bounding, `/compact`, and `/status`.
- `npm run typecheck` and `npm test` pass with 69 tests.

Implemented and verified the Phase 6 active local-tool interruption slice:

- Threaded `AbortSignal` from `runAgentTurn` into native tool dispatch.
- `shellTool` now passes abort signals into `runProcess`.
- `runProcess` now handles already-aborted signals before spawning and aborts active child processes with process-group termination on POSIX plus a SIGKILL fallback.
- Aborted shell/process execution returns a bounded `ok: false` tool error with code `ABORTED`.
- `runAgentTurn` stops after delivering an aborted tool result instead of starting another OpenRouter request with an aborted signal.
- Added no-network tests for abort-before-spawn, abort-during-shell execution, runtime signal threading into active shell tools, timeout cleanup of descendants, SIGKILL fallback for descendants that ignore SIGTERM, and one-shot process exit behavior.
- `npm run typecheck`, `npm run build`, `npm test`, `git diff --check`, targeted tools tests, and `npm run dev -- status` pass. The full test suite now has 57 tests.
- Separate verifier session found process-tree timeout/fallback issues; these were fixed and the final verifier pass reported no findings. Windows `taskkill` tree termination was reviewed statically on macOS.

Implemented and verified the Phase 6 visible native tool summary slice:

- Added reusable tool event formatting in `src/agent/tool-summaries.ts`.
- `orx ask` and `orx chat` now print compact tool-call start summaries with tool name and bounded arguments.
- Tool results now print success/failure, duration, result truncation when applicable, shell exit/truncation details, `git_diff` diff size/truncation metadata, and `apply_patch` changed files.
- The model-facing tool result envelope remains compatible; dispatch now separately exposes raw native tool output for UI-only summaries.
- Added no-network tests for compact patch argument summaries, changed-file summaries, git diff truncation summaries without diff leakage, and ask/chat visible tool summary output.
- `npm run typecheck`, `npm run build`, `npm test`, `git diff --check`, and `npm run dev -- status` pass. The full test suite now has 51 tests.
- Separate verifier session reviewed the uncommitted diff and the follow-up test additions; no findings were reported.

Implemented and verified the first Phase 6 agent-runtime slice:

- Added `src/agent/` with native tool schemas, dispatch, and a guarded multi-turn runtime.
- Extended OpenRouter streaming to aggregate tool-call deltas and return tool calls with finish reasons.
- Added OpenRouter-compatible tool schemas for `read_file`, `list_files`, `search_files`, `shell`, `git_diff`, and `apply_patch`.
- Tool dispatch now parses model arguments, drops undeclared risky surfaces such as arbitrary env forwarding, runs native local tools, and returns bounded JSON result envelopes as tool messages.
- `orx ask` and `orx chat` now use the agent runtime, so enabled models can automatically call native ORX tools when they decide it is useful.
- Added no-network tests for streamed tool calls, schema inclusion, native dispatch, guarded tool-loop execution, and CLI compatibility.
- `npm run typecheck`, `npm run build`, `npm test`, and `npm run dev -- status` pass with 43 tests.
- Real OpenRouter smoke passed: `npm run dev -- ask "...Read package.json..."` selected `openai/gpt-5.5-20260423` through `openrouter/auto`, called `read_file`, and answered with the package scripts. Reported cost was `$0.006115`.

Updated the roadmap so the later full-stack integration phase explicitly follows `memory/13_IMPLEMENTOR_HANDOFF_PLUGINS_MCP.md`:

- Phase 8 remains MCP policy and official OpenRouter MCP.
- Phase 9 is now explicitly the full-stack plugin/MCP preset/advanced tooling phase.
- Phase 10 remains web, browser, and research tooling with evidence-ledger work.

Created a focused Phase 6 handoff for the OpenRouter agent runtime:

- Added `memory/14_PHASE_6_AGENT_RUNTIME.md`.
- Indexed it as `phase6` in `memory/00_INDEX.md`.
- The handoff records verified foundation commits, existing runtime files, Phase 6 scope, suggested bounded step slices, guardrails, and verification targets.
- The later-phase plugin/MCP handoff remains separate as `integration-handoff`.

Created the later-phase implementor handoff for full-stacking ORX with plugins, MCP, advanced programming tools, and deep research:

- Added `memory/13_IMPLEMENTOR_HANDOFF_PLUGINS_MCP.md`.
- The handoff defines prerequisites, phased slices, module boundaries, config sketches, plugin metadata, MCP policy, OpenRouter MCP usage, Agent Skills loading, plugin hooks, advanced code intelligence, scanner profiles, research profiles, evidence ledgers, security rules, and verification expectations.
- Updated the memory index so future implementor sessions can discover the handoff.
- This handoff does not change the immediate next task: Phase 6 agent runtime remains next.

Implemented and independently verified the Phase 5 native local coding tools:

- Added `src/tools/` registry with `read_file`, `list_files`, `search_files`, `shell`, `git_diff`, and `apply_patch`.
- Added shared truncation utilities that preserve UTF-8 byte bounds.
- `read_file` supports line and byte truncation with clear file errors.
- `list_files` reports type, size, recursion depth, and max-entry truncation.
- `search_files` uses `rg` when available, supports dash-leading patterns, and has a bounded fallback search.
- `shell` runs without approval prompts and captures exit code, stdout, stderr, cwd, duration, timeout, signal, and truncation metadata.
- `git_diff` supports working-tree diffs with optional path scopes.
- `apply_patch` supports `git apply` unified patches and structured patches with preflight validation to avoid partial mutation on malformed structured patch plans.
- Added temp-dir based tests covering success, failures, truncation, search, shell, git diff, patch application, malformed structured patches, and edge cases found by independent verifiers.
- `npm run typecheck`, `npm run build`, and `npm test` pass with 36 tests.

Continued the second-pass integration research after a context-window failure and recorded the expanded findings:

- Prior research already concluded that ORX should keep core local work native and use MCP through explicit profiles for external systems.
- New research confirmed ORX should add a first-class plugin system, not only MCP presets.
- Plugins should be installable bundles of Agent Skills `SKILL.md` workflows, slash commands/prompts, rules, lifecycle hooks, MCP server presets, named delegates, docs/context providers, assets, and optional scoped binaries.
- OpenRouter has an official hosted MCP server as of 2026-06-25 for live model catalog, pricing, benchmarks, rankings, credits, docs search, providers, generation lookup, and billable test calls. ORX should use it as a development assistant while keeping normal inference on the direct OpenRouter API client.
- Programming integrations should add native layers after the initial tools: test adapters, tree-sitter, ast-grep, LSP/SCIP, reviewed GitHub/Sourcegraph tool declaration packs after remote metadata inspection, additional GitLab tool packs only as explicit opt-ins with narrow provider-tool review, and scanner profiles for Semgrep, Trivy, CodeQL, Snyk, Socket, and OSV-Scanner.
- Deep research should be profile-scoped with web search, crawl/scrape, scholarly metadata, document parsing, browser research, local RAG cache, research notes, and an evidence ledger for citations.
- Plugin/MCP security should require explicit install/profile enablement, source pinning, schema hashing, secrets isolation, SSRF guards, sandboxing where practical, and local audit logs.

Implemented and independently verified the Phase 4 slash command expansion:

- Extracted chat slash parsing and handling into `src/slash/`.
- Preserved `/help`, `/status`, `/model <slug>`, `/clear`, `/quit`, and `/exit`.
- Added `/mode auto`, `/mode fusion`, `/fusion [preset]`, `/models`, and `/new`.
- `/mode auto` selects `openrouter/auto` and clears Fusion preset.
- `/mode fusion` selects `openrouter/fusion`.
- `/fusion <preset>` selects Fusion mode/model and sends Fusion plugin config on later requests.
- `/models` is a no-network placeholder until OpenRouter MCP is implemented.
- `/status` now shows active routing, Fusion preset, history count, latest metadata, cwd, config source, API key source, and permissions.
- Added parser/handler tests and chat integration coverage; `npm run typecheck`, `npm run build`, and `npm test` pass.

Implemented and independently verified the Phase 3 interactive chat MVP:

- `orx chat` starts a readline-based interactive session.
- Chat uses the existing OpenRouter streaming client and request builder.
- Header/footer show cwd, mode, model, API key presence/source, and permission posture.
- `orx>` composer prompt accepts user messages.
- Assistant responses stream as chunks arrive.
- In-session history is preserved for follow-up turns during the current process.
- MVP slash commands are `/help`, `/status`, `/model <slug>`, `/clear`, `/quit`, and `/exit`.
- Ctrl+C aborts an active request through `AbortController` or exits when idle.
- `ask`, `status`, `--help`, and `--version` remain intact.
- Verified with mocked fetch/stream tests and a real short OpenRouter chat smoke test.

Implemented and independently verified the Phase 2 OpenRouter streaming command:

- `src/openrouter/` client, request builder, metadata formatter, and types
- `orx ask "prompt"` one-shot command
- streaming chat completions against `https://openrouter.ai/api/v1/chat/completions`
- `--model`, `--mode auto|fusion|exact`, and `--fusion` overrides
- API key validation for API commands while help, version, and status remain no-key safe
- SSE comment and `[DONE]` handling
- generation id capture from `X-Generation-Id`
- usage and cost metadata summary when OpenRouter returns it
- non-2xx OpenRouter error sanitization to avoid printing secrets
- mocked fetch/stream tests with no real API key required
- `npm run typecheck`, `npm run build`, and `npm test` passing

Scaffolded and independently verified the Phase 1 TypeScript CLI:

- `orx` binary mapped to compiled `dist/cli.js`
- `--help` and `--version`
- `status` command
- config discovery from repo-local `.orx/config.toml` and `~/.orx/config.toml`
- API key detection from `OPENROUTER_API_KEY` or config without printing secrets
- unrestricted permission defaults visible in status
- `npm run typecheck`, `npm run build`, and `npm test` passing

Added a mandatory workflow rule:

- implement bounded steps
- verify each step in a separate agent context when possible
- fix verifier findings before moving on
- commit and push each verified step to GitHub before starting the next step

Previously added the project memory system:

- root `AGENTS.md`
- indexed memory files under `memory/`
- project brief
- implementation plan
- architecture notes
- OpenRouter integration notes
- tooling and permissions notes
- TUI design notes
- sessions and memory notes
- decisions log
- backlog
- commands reference

Recorded future orchestration/delegation support:

- orchestration profiles with one controller and named delegates
- controller can be an OpenRouter model or external adapter such as Codex
- delegates can include OpenRouter models, Codex, Devin, and future adapters
- delegation should run through an ORX-owned `delegate_task` tool
- roadmap, architecture, OpenRouter notes, TUI command notes, sessions, backlog, and decisions now reference this direction

Recorded MCP/tooling research conclusions:

- keep file/search/shell/git/patch native instead of relying on MCP for core local work
- use official OpenRouter MCP or equivalent for live models, pricing, rankings, credits, benchmarks, docs, and generation lookup
- add profile-scoped MCP presets for docs, browser, GitHub read-only, Sentry read-only, Figma, database dev, and cloud read-only/write modes
- prefer official/first-party MCP servers; treat community registries as discovery, not trust
- show MCP server risk metadata in `/status`
- require explicit config for auth-bearing, write-capable, cloud, database, browser, and web-fetch tools

Added captured Behave summary footer parsing:

- The test report parser now recognizes bounded already-captured Python Behave summary footers with feature/scenario/step lines such as `1 feature passed, 0 failed, 0 skipped`, `3 scenarios passed, 1 failed, 1 skipped`, and `16 steps passed, 1 failed, 2 skipped, 1 undefined`, then renders compact `source=behave` scenario counts in `orx tests run`, `/tests run`, and model-visible `run_tests` summaries.
- The parser maps `passed` and `pending_warn` to passed, `failed`/`error`/`hook_error`/`undefined`/`pending` to failed, and skipped/untested variants to skipped; it runs after Behat's stricter timer footer parser and before Cucumber/generic fallbacks, rejects malformed Behave-looking footers without falling through, and does not add reporter flags, report files, installs, network, or model-tool exposure changes.
- Verification passed: `npm run typecheck`, focused source `node --import tsx --test src/testing/test-adapters.test.ts`, `git diff --check`, `npm run build`, focused built `node --test dist/testing/test-adapters.test.js`, direct built parser smoke for `source=behave`, full `npm test` with 537 tests, `npm run verify:release`, and independent verifier `019f1d2e-a61a-7280-80aa-3cda2ac698c8` with no findings.

Added captured Meson summary parsing:

- The test report parser now recognizes bounded already-captured Meson `mtest.py` summary rows such as `Ok: 2`, `Expected Fail: 1`, `Fail: 1`, `Unexpected Pass: 1`, `Skipped: 1`, `Ignored: 1`, and `Timeout: 1`, then renders compact `source=meson` counts in `orx tests run`, `/tests run`, and model-visible `run_tests` summaries.
- The parser requires Meson's always-printed `Ok:` and `Fail:` rows, folds expected failures into passed, unexpected passes and timeouts into failed, ignored tests into skipped, runs before framework/generic fallbacks so malformed Meson-looking rows fail closed, and does not add reporter flags, report files, installs, network, or model-tool exposure changes.
- Verification passed: `npm run typecheck`, focused source `node --import tsx --test src/testing/test-adapters.test.ts`, `git diff --check`, `npm run build`, focused built `node --test dist/testing/test-adapters.test.js`, direct built parser smoke for `source=meson`, full `npm test` with 537 tests, `npm run verify:release`, and independent verifier `019f1d3a-34f1-79d2-869a-081302a72682` with no findings.

Added captured Unity C summary footer parsing:

- The test report parser now recognizes bounded already-captured ThrowTheSwitch Unity footer rows such as `3 Tests 1 Failures 1 Ignored` followed by matching `OK`, `FAIL`, or `FAILED`, then renders compact `source=unity` counts in `orx tests run`, `/tests run`, and model-visible `run_tests` summaries.
- The parser maps failures directly, maps ignored tests to skipped, derives passed as total minus failures and ignored, validates the final status against the failure count, runs before framework/generic fallbacks so malformed Unity-looking rows fail closed, and does not add reporter flags, report files, installs, network, or model-tool exposure changes.
- Verification passed: `npm run typecheck`, focused source `node --import tsx --test src/testing/test-adapters.test.ts`, `git diff --check`, `npm run build`, focused built `node --test dist/testing/test-adapters.test.js`, direct built parser smoke for `source=unity`, full `npm test` with 537 tests, `npm run verify:release`, and independent verifier `019f1d43-c5ac-7981-a07a-bf1a9cacc990` with no findings.

Added captured LLVM lit summary parsing:

- The test report parser now recognizes bounded already-captured LLVM lit footer blocks with `Testing Time: Ns`, `Total Discovered Tests: N`, and lit result-code percentage rows such as `Passed: 2 (22.22%)`, `Expectedly Failed: 1 (11.11%)`, and `Unexpectedly Passed: 1 (11.11%)`, then renders compact `source=lit` counts in `orx tests run`, `/tests run`, and model-visible `run_tests` summaries.
- The parser maps `Unsupported` to skipped, `Expectedly Failed` to todo, `Passed With Retry` to flaky, `Unresolved`/`Timed Out`/`Failed`/`Unexpectedly Passed` to failed, validates total and percentages, runs before framework/generic fallbacks so malformed lit-looking blocks fail closed, and does not add reporter flags, report files, installs, network, or model-tool exposure changes.
- Verification passed: `npm run typecheck`, focused source `node --import tsx --test src/testing/test-adapters.test.ts`, `git diff --check`, `npm run build`, focused built `node --test dist/testing/test-adapters.test.js`, direct built parser smokes for `source=lit` and `Testing Time:` Node fallback, full `npm test` with 537 tests, `npm run verify:release`, and independent verifier `019f1d54-ccb2-7041-b03d-02d120a25a6f` after one false-positive fallback finding was fixed.

Added plugin review JSON output:

- `orx plugins review|doctor|audit [--json]` and `/plugins review|doctor|audit [--json]` now emit ORX-owned `orx.plugin_review` structured metadata for installed/enabled counts, local catalog drift, bin/hook trust, plugin MCP profiles, command aliases, omissions, plugin entries, and next commands.
- Review JSON preserves the text review authority boundary: operator-only, no model tool, no network, no execution, no registry/cache/catalog/trust/audit writes, no install/enable/trust/grant/fetch side effects, and invalid trailing operands fail with usage.
- Verification passed: `npm run typecheck`, focused source `node --import tsx --test src/plugins/review.test.ts src/cli.test.ts src/slash/index.test.ts` with 150 tests, `npm run build`, focused built `node --test dist/plugins/review.test.js dist/cli.test.js dist/slash/index.test.js` with 150 tests, direct built CLI plugin review JSON smoke, `git diff --check`, full `npm run verify:release` with 10 steps including `plugins review --json`, and independent verifier `019f206a-cadf-70f3-9617-69ecc5ee504f` with no findings.

Added plugin validation JSON output:

- `orx plugins validate <manifest-path-or-directory> [--json]` and `/plugins validate <manifest-path-or-directory> [--json]` now emit ORX-owned `orx.plugin_validation` structured metadata for sanitized manifest fields, source, manifest/component hashes, permission counts, warnings, and usage.
- Validation JSON preserves the text validation authority boundary: operator-only, no model tool, no network, no execution, no data-state writes, unchanged registry/cache/catalog/trust state, and no install/enable/trust/grant/fetch/execute side effects; misplaced `--json` fails with usage.
- Verification passed: `npm run typecheck`, focused source `node --import tsx --test src/plugins/validate.test.ts src/cli.test.ts src/slash/index.test.ts` under isolated HOME with 152 tests, `npm run build`, focused built `node --test dist/plugins/validate.test.js dist/cli.test.js dist/slash/index.test.js` with 152 tests, direct built CLI plugin validation JSON smoke plus invalid `--json` placement check, `git diff --check`, full `npm run verify:release` with 11 steps including `plugins validate --json`, and independent verifier `019f2078-e7e4-7570-8e45-77de79c5de42` with no findings.

Added release package dry-run assertions:

- `npm run verify:release` now includes a bounded release-hardening check: `npm pack --dry-run --json --ignore-scripts` verifies the package manifest includes `package.json`, `README.md`, `RELEASE_NOTES.md`, `LICENSE`, and `dist/cli.js`.
- The package assertion fails if the dry-run includes source/private/local-operational paths such as `src/`, `memory/`, `.orx/`, `scripts/`, `package-lock.json`, `tsconfig.json`, or compiled `dist/**/*.test.*` / `dist/**/*.spec.*` artifacts; build/test/global-install steps still run before it, and the check does not publish or call network by command selection.
- Verification passed: direct `npm pack --dry-run --json --ignore-scripts` manifest parse with 307 files and zero compiled test/spec artifacts, plus isolated-home `npm run verify:release` with 12 steps including `npm package dry-run contents` and existing built CLI smokes for doctor JSON, guide, code calls, plugin review, plugin review JSON, plugin validation JSON, and MCP presets.

## Next Likely Task

Continue optional completion work:

- Choose the next bounded slice from remaining higher-value optional surfaces: LSP/SCIP diagnostics/references, tree-sitter-backed code-intelligence depth, reviewed GitHub and Sourcegraph tool declaration packs, richer release packaging/release notes, or scanner expansion only after a deterministic no-network/no-auth local command shape is proven.
- Keep new integrations explicit-operator-only unless a separate model-tool policy is designed and documented.
- Preserve the existing trust boundaries for MCP, plugins, scanners, fetched/search/browser/provider content, and delegation results.
- Keep OpenRouter API as the normal inference path.

## Active Constraints

- Keep ORX OpenRouter-native.
- Keep default ORX permissions unrestricted.
- Keep UI inspired by professional terminal coding agents without copying Codex branding or proprietary assets.
- Keep memory files concise and indexed.
- Commit and push only after the current implementation step has passed independent verification.
- Treat plugins and MCP servers as explicit opt-in surfaces with visible risk metadata, even while native ORX local execution remains YOLO-style.
