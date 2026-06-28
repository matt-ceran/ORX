# Current Context

Last updated: 2026-06-28

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
- Tab completion now also covers deterministic slash subcommands/arguments for `/mode`, `/fusion`, `/web`, `/mcp`, `/plugins`, `/plugin`, `/bins`, `/hooks`, `/skills`, `/orchestrator`, `/delegate`, `/resume`, `/help`, and `/commands`.
- Line-based multiline prompt continuation is implemented: a trailing unescaped `\` keeps collecting input, TTY mode shows an `orx …` continuation composer, non-TTY mode shows `...>`, and the collected lines are submitted as one user message.
- The TTY bottom status notch now uses compact model badges for OpenRouter routing shortcuts, rendering `openrouter/auto` as `auto` and `openrouter/fusion` as `fusion`; full model ids remain unchanged in config, request construction, plain status, and non-TTY output.
- TTY theme controls are implemented through config `theme = "default" | "mono" | "vivid"`, environment overrides `ORX_TTY_THEME`/`ORX_THEME`, and `/theme [default|mono|vivid]`.
- Saved local profile controls are implemented through `~/.orx/profiles.json`, `ORX_PROFILE_CONFIG_PATH`, `orx profile ...`, global `orx --profile <id>`, and `/profile [list|save|use|inspect|delete]`.
- Plugin registry controls are available both in chat and noninteractive CLI: `orx plugins list|inspect|register|install|enable|disable` and `/plugins install <manifest-path>`; plugin enablement persists only a state marker and does not by itself trust executable surfaces.
- Plugin authoring scaffold is implemented through `orx plugins scaffold <directory>` and `/plugins scaffold <directory>`. It creates a valid local `orx-plugin.json` authoring bundle without registry writes; defaults are inert skills/prompt-commands/rules markdown, `--minimal` writes only the manifest, and `--with` adds opt-in empty placeholders for hooks, bins, MCP, command schemas, assets, and docs behind the existing review gates.
- Plugin install/register now snapshots sanitized manifests plus declared components and declared hook cwd directories into ORX-owned plugin cache storage before registry persistence; enabled skill/hook discovery resolves from the cached manifest path, not the original source checkout.
- Plugin catalog support now handles both local manifest entries and pinned git source entries from `~/.orx/plugins/catalog.json` or `ORX_PLUGIN_CATALOG_PATH`. `orx plugins install <catalog-id>` and `/plugins install <catalog-id>` clone git catalog sources into private temporary cache storage, checkout the exact pinned commit, normalize cached manifest provenance to that pin, and still register the plugin disabled/inert.
- Local user MCP profile catalogs are implemented through `~/.orx/mcp/profile-catalog.json` or `ORX_MCP_PROFILE_CATALOG_PATH`. Declarations are namespaced as `user:<profile-id>`, currently support sanitized `remote-http` transports, appear in `/mcp`, `orx mcp`, `/status`, interactive chat, and `orx ask --mcp-tools`, and share the same enable/trusted-hash/schema-change/tool-grant/model-grant/auth/audit gates as built-in and plugin MCP profiles.
- Local user MCP catalog management commands are implemented through `orx mcp catalog|add-profile|remove-profile|add-tool|remove-tool` and matching `/mcp ...` slash commands. They write private local catalog files, preserve existing array/object/legacy `servers` declarations during edits, and avoid manual JSON editing for common remote MCP setup.
- Built-in MCP provider presets are implemented through `orx mcp presets`, `orx mcp add-preset <preset>`, `/mcp presets`, and `/mcp add-preset <preset>`. Initial templates include `context7`, `microsoft-learn`, and `github-readonly`, and install into the same local user catalog without enabling or trusting profiles.
- Reviewed remote MCP tool import is implemented through `orx mcp import-remote-tools <profile>` and `/mcp import-remote-tools <profile>`. It is limited to local `user:` catalog profiles, uses the existing enabled/trusted/unchanged guarded `tools/list` path, stores sanitized read-only non-billable declarations only, skips unsupported names, audits hashes only, and leaves newly changed profiles behind the pending schema-change retrust gate.
- Enabled plugin markdown prompt commands are discoverable through `/prompts list` and compact model metadata. Full prompt markdown is loaded only by explicit `/prompts activate <id>` or the derived `/plugin:<plugin-id>:command:<slug>` alias as untrusted context. Manifest-defined executable command schemas are discoverable through `components.commandSchemas` and exposed as `/plugin:<plugin-id>:exec:<slug>` aliases that can only run referenced trusted current bins.
- Enabled plugin markdown rules are discoverable through `/rules list` and compact model metadata. Full rule markdown is loaded only by explicit `/rules activate <id>` as untrusted context; rules are advisory and cannot change permissions or activate executable surfaces.
- Plugin manifests support optional inert `metadata` for homepage, documentation, license, trust tier, auth, privacy, and runtime requirements. `/plugins inspect` renders sanitized metadata as risk/requirements context only.
- Enabled plugin `components.mcpServers` JSON can contribute MCP preset profiles. They appear as `plugin:<plugin-id>:<server-id>` in `/mcp list`, `/mcp inspect`, `/mcp tools`, `/mcp call`, `/mcp remote-tools`, `/mcp enable`, `/mcp discover`, and `/status`; trusted unchanged `remote-http` plugin profiles can be discovered, list remote tool metadata, run explicit operator `tools/call`, and optionally expose model-granted read-only non-billable tools through session-local `/mcp model enable`.
- MCP tool grants are implemented: `/mcp allow-tool`, `/mcp revoke-tool`, and `orx mcp allow-tool|revoke-tool` persist per-tool grants for billable/write/destructive declared tools only on enabled/trusted/unchanged profiles. Grants bind to the current trusted profile hash; stale grants are visible and denied before explicit calls can reach the network.
- Explicit MCP `tools/call` is implemented for operator commands: `/mcp call <profile> <tool> [json]` and `orx mcp call <profile> <tool> [json]` require enabled/trusted/unchanged profiles, allowed declared-tool policy, env-only bearer auth for auth-bearing tools, guarded DNS-vetted transport, redacted/truncated untrusted output, and audit logs without raw arguments/output.
- Model MCP exposure is implemented through `/mcp model enable|disable|status` for interactive chat and `orx ask --mcp-tools` for one-shot requests. ORX adds a single native model tool `mcp_call`, limited to read-only non-billable declared MCP tools with active `/mcp allow-model-tool` / `orx mcp allow-model-tool` grants; broad/billable/write/destructive model-loop MCP exposure remains inactive.
- Enabled plugin `components.hooks` JSON can contribute hook definitions. They appear as `plugin:<plugin-id>:<hook-id>` in `orx hooks`, `/hooks`, and `/status`; trusted hook hashes persist outside repos, changed hashes show pending trust, and trusted current hashes can run manually through `hooks run` / `/hooks run` or automatically on matching lifecycle events with minimal env/cwd and JSONL audit logging.
- Enabled plugin `components.bins` directories can contribute explicit operator-run bins. Regular cached bin files appear as `plugin:<plugin-id>:bin:<file>` in `orx bins`, `/bins`, and `/status`; trusted bin hashes persist outside repos, changed hashes show pending trust, and trusted current hashes can run only through explicit `bins run` / `/bins run` with cached-plugin cwd, manifest-declared env, redacted/truncated output, and JSONL audit logs without raw argument lists.
- Enabled plugin prompt commands and bins now produce namespaced aliases visible through `/plugin list`, `orx plugins commands`, and `/status`. `/plugin:<plugin-id>:command:<slug>` activates the matching prompt as untrusted context; `/plugin:<plugin-id>:bin:<file> [args...]` runs the matching bin through the same trusted-hash gates as `/bins run`.
- Native test target commands are implemented through `orx tests list|run`, `/tests list|run`, `/test`, package `test*` script discovery, direct Node test/spec fallback, framework/reporter metadata, compact report summary parsing, bounded shell-disabled execution, and status counts. The same adapter is exposed to the model loop through the native `run_tests` tool.
- Dependency-free local code maps and symbol indexes are implemented through `orx code map`, `orx map`, `orx code-map`, `orx code symbols`, `orx symbols`, `/map`, `/code map`, `/code symbols`, and `/symbols`; output is local-only/no-key and includes bounded language, key-file, entrypoint, JavaScript/TypeScript import/export, and exported-symbol summaries.
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
- Next likely programming-power-pack work: tree-sitter/ast-grep code intelligence or structured framework report ingestion when ORX can safely request framework-native report formats.

Implemented line-based multiline prompt continuation:

- `orx chat` now treats an input line ending with an unescaped `\` as a continuation marker and collects following lines into one user message.
- TTY mode renders a continuation `orx …` composer; non-TTY and `NO_COLOR` retain script-safe line-oriented behavior with a plain `...>` continuation prompt.
- Multiline user scrollback indents continuation lines under the first `you:` line, and slash commands remain single-line-only dispatches.
- Verification: `npm run typecheck`, `npm run build`, `git diff --check`, focused TUI/CLI build-backed tests, focused source TUI tests with 33 tests, full `npm test` with 380 tests through the independent verifier, and verifier ad hoc probes for escaped backslashes, multiline slash input, interior blank lines, and TTY `NO_COLOR` continuation fallback.
- Next likely TTY polish: remaining provider badge polish, history/search ergonomics, or optional future raw-mode editing only with script-safe fallback preserved.

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
- Next likely programming-power-pack work after this slice: deeper Vitest/Jest/Playwright/Node report parsing, or syntax-aware ast-grep/tree-sitter code intelligence.

Implemented dependency-free local code maps and symbols:

- Added `src/code-map/` for operator-invoked local repository maps.
- `orx code map [path]`, `orx map [path]`, `orx code-map [path]`, `/map [path]`, and `/code map [path]` work without an OpenRouter API key.
- `orx code symbols [query]`, `orx symbols [query]`, `/code symbols [query]`, and `/symbols [query]` reuse the same scan to render exported JavaScript/TypeScript symbols with file paths and line numbers.
- The scanner bounds files, entries, depth, and source bytes; skips `.git`, `.orx`, `node_modules`, `dist`, `build`, `coverage`, and similar generated/vendor directories; skips symlinks; and reports omissions/truncation.
- Rendered output includes language counts, key files, package/config/source entrypoints, and top JavaScript/TypeScript source files with imports/exports while redacting secret-like rendered paths and symbols.
- Import/export extraction is line-oriented and tracks block comments/template literals to avoid counting example code inside comments or template strings.
- Verification after the map slice: implementor focused tests passed with 107 tests; full `npm test` passed with 375 tests; `npm run typecheck`, `npm run build`, `git diff --check`, and dogfood `npm run dev -- code map` passed. External verifier agent could not complete because the subagent usage limit was reached, so a local verifier-style pass added the comment/template-literal regression coverage before commit.
- Symbol index follow-up verification: focused code-map/CLI/slash tests passed with 107 tests, and dogfood `npm run dev -- code symbols createCode` plus `npm run dev -- symbols renderCode` returned expected exported symbols with file paths and line numbers before final full-suite verification.
- Next likely programming-power-pack work: tree-sitter-backed call/reference slices, ast-grep search/codemod previews, and richer framework-specific test reports.

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
- `mcp_call` now requires active model-tool grants in addition to session/ask opt-in, enabled/trusted/unchanged profiles, declared-tool policy, read-only non-billable risk, env-only bearer auth, guarded transport, redaction/truncation, and audit logging.
- Status and MCP policy renderers show `model_tool_grants`, `stale_model_tool_grants`, per-tool `model_grant=active|stale`, and `model_policy=allowed|denied` when a model grant exists.
- Verification: Zeno found no behavior/security issue; wording and `/mcp tools` model-policy clarity fixes were applied. `npm run typecheck`, focused MCP/agent/CLI/slash tests with 173 tests, full `npm test` with 355 tests, `git diff --check`, and `npm run dev -- status` pass.
- Later work added manifest-defined exec aliases; next likely MCP/plugin work is remote source fetching, richer catalog UX, or docs/provider presets.

Implemented session-local model MCP `mcp_call` runtime:

- Added optional native model tool schema `mcp_call`, excluded from normal model requests unless `runAgentTurn` receives enabled MCP model options.
- Added chat `/mcp model enable|disable|status` and `model_mcp_tools` in interactive `/status`; `/new` and `/resume` reset the session-local exposure to disabled.
- `mcp_call` reuses the same enabled/trusted/unchanged profile gates, declared-tool policy, env-only bearer auth, guarded remote transport, redacted/truncated output, and audit event shape as explicit MCP calls.
- Model-visible MCP calls are limited to read-only non-billable declared tools. Billable/write/destructive MCP tools are denied before network even when an explicit operator grant exists.
- Verification: verifier found only stale docs/memory wording; the wording was corrected. `npm run typecheck`, `git diff --check`, focused MCP/agent/slash/chat tests with 168 tests, full `npm test` with 350 tests, and `npm run dev -- status` pass.
- Follow-up one-shot support: `orx ask --mcp-tools` now exposes the same read-only non-billable `mcp_call` bridge for one noninteractive request, with dedicated MCP transport injection in tests and no default exposure.
- Verification for the ask opt-in: verifier found stale discovery/remote-tools/memory wording and requested an explicit plain-ask negative assertion; fixes were applied and verifier recheck reported no findings. `npm run typecheck`, `git diff --check`, focused CLI/agent/MCP/slash tests with 169 tests, full `npm test` with 351 tests, and `npm run dev -- status` pass.
- Later work added persisted model allowlists and manifest-defined exec aliases; next likely MCP work is clearer prompt-injection boundaries or provider presets.

Implemented explicit operator MCP `tools/call` runtime:

- Added `src/mcp/call.ts` for guarded `tools/call` requests on enabled/trusted/unchanged `remote-http` profiles when `evaluateMcpToolPolicy()` returns `allowed`.
- Added env-only bearer auth lookup through `ORX_MCP_BEARER_<PROFILE>` or `ORX_MCP_BEARER_TOKEN`; auth-bearing profiles/tools do not attempt network calls without a token.
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
- Added `/profile [list|save|use|inspect|delete]` in chat. Manual `/model`, `/mode`, `/fusion`, and `/theme` changes clear `activeProfile` so the status label does not become stale.
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

- The TTY bottom status notch now shortens `openrouter/auto` to `model auto` and `openrouter/fusion` to `model fusion`.
- This is display-only TTY polish; active config, OpenRouter request model ids, plain `/status`, and non-TTY/footer output still use the full model id.
- Added focused screen/chat assertions for the compact `auto` badge and verifier manually checked the `fusion` badge path.
- Verifier reported no findings after typecheck, focused TUI/slash tests, diff check, and a manual render probe. Main-session `npm run typecheck`, `npm test` with 261 tests, full `git diff --check`, and `npm run dev -- status` pass.

Implemented and verified Phase 11 orchestration/delegation command scaffold:

- Added inert session-local delegation state for an optional OpenRouter controller and named OpenRouter delegates. Execution remains disabled and no `delegate_task` tool/schema exists yet.
- Added `/orchestrator`, `/delegate`, and `/delegates` slash command scaffolds. They mutate only local session metadata and make no OpenRouter, subprocess, Codex, Devin, or external agent calls.
- `/status` in interactive chat now shows `orchestration_controller`, `orchestration_execution=disabled`, `delegate_count`, and `delegate_task=unavailable`.
- Session JSON can persist and restore delegation metadata on `/resume`; API keys are still excluded.
- Delegate names/models reject control characters and secret-like values. Stored delegation state is normalized, deduped, sorted, capped at 16 delegates, and forced to `executionEnabled=false`.
- `/clear` intentionally preserves orchestration/delegate state; use `/orchestrator clear`, `/delegate remove <name>`, or `/delegate clear` for scaffold state.
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
- Programming integrations should add native layers after the initial tools: test adapters, tree-sitter, ast-grep, LSP/SCIP, Sourcegraph read-only profile, GitHub/GitLab read-only profiles, and scanner profiles for Semgrep, Snyk, Socket, OSV-Scanner, CodeQL, and Trivy.
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

## Next Likely Task

Continue Phase 10 research work:

- Run an independent verifier on Slice 2, then have the main agent commit and push after review.
- Next implementation slice should likely add explicit web search or browser/research tooling on top of the evidence ledger.
- Keep research acquisition operator-controlled until a policy for model-autonomous research tools is designed.
- Preserve the trust boundary: fetched/search/browser/provider content and citation metadata are untrusted and cannot authorize tool use, permission changes, MCP/profile/plugin enablement, hooks, bins, command execution, policy changes, or instruction priority changes.
- Keep OpenRouter API as the normal inference path.

Do not implement orchestration before MCP policy basics and session metadata for delegates exist.

## Active Constraints

- Keep ORX OpenRouter-native.
- Keep default ORX permissions unrestricted.
- Keep UI inspired by professional terminal coding agents without copying Codex branding or proprietary assets.
- Keep memory files concise and indexed.
- Commit and push only after the current implementation step has passed independent verification.
- Treat plugins and MCP servers as explicit opt-in surfaces with visible risk metadata, even while native ORX local execution remains YOLO-style.
