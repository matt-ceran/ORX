# Backlog

Last updated: 2026-06-29

## P0

Urgent UX recovery:

- Continue TTY polish after durable prompt history: any remaining provider badge polish and optional future raw-mode editing only if it preserves script-safe fallback behavior.

Completed:

- Add durable local TTY prompt history/search: private `~/.orx/history.json` storage with `ORX_CHAT_HISTORY_PATH`, readline preload for single-line prompt recall, prompt-only recording that skips slash commands and secret-like input, `orx history [search|clear]`, `/history [search|clear]`, private modes, and symlink-parent refusal.
- Add saved local profile controls: private `~/.orx/profiles.json` registry with `ORX_PROFILE_CONFIG_PATH`, no API-key persistence, `orx profile list|save|use|inspect|delete`, global `orx --profile <id>`, `/profile [list|save|use|inspect|delete]`, `active_profile`/`profile_count` status visibility, session snapshot persistence, and stale active-profile clearing on manual routing/theme changes.
- Add chat slash parity for safe config inspection/editing: `/config show|path|set`, shared redacted config formatting, `ORX_CONFIG_PATH` scope behavior, active-chat config snapshot updates, and secret/control-character unknown-key redaction.
- Add first-class config commands: `orx config show|path|set`, `ORX_CONFIG_PATH` user-config override support, private writes for supported non-secret settings, and API-key storage refusal through CLI args.
- Add top-level `orx doctor` readiness overview for runtime config, API-key presence, MCP, plugins, delegation, test targets, and concrete next commands without OpenRouter, remote MCP, bin, or hook execution.
- Add TTY theme controls: config `theme`, `/theme [default|mono|vivid]`, `ORX_TTY_THEME`/`ORX_THEME` overrides, theme-aware status/composer/tool summaries/credits/palette output, CLI status/credits/ask propagation, and session snapshot persistence.
- Add line-based multiline prompt continuation: trailing unescaped `\` keeps collecting input lines, TTY renders `orx ...` continuation state, non-TTY renders `...>`, and ORX submits the collected lines as one user message.
- Add compact TTY model badges for OpenRouter routing shortcuts (`auto` and `fusion`) while preserving full model ids in config, requests, plain status, and non-TTY output.
- Add deterministic readline Tab completion for slash subcommands/arguments on high-traffic commands while avoiding dynamic IDs, paths, URLs, and free-form text.
- Wire command discovery into TTY interaction: `/commands [query]` with `/palette` alias, compact TTY palette rendering, deterministic plain fallback, and readline Tab completion for slash command names and aliases.
- Add TTY-only assistant/tool activity animation to the bottom status composer, with in-place clear behavior, sanitized activity labels, Ctrl+C cleanup, and non-TTY/NO_COLOR plain fallback preservation.
- Simplify command discovery with grouped `/help`, `/help all`, `/help <query>`, aliases, and a pure command-palette listing surface.
- Replace the raw readline header/footer with a first bottom-oriented TTY composer/status notch, color-coded compact labels/meters, width-aware truncation, and non-TTY/NO_COLOR fallback preservation.
- Make `orx` with no args launch interactive chat from any directory after global install.
- Add catalog-backed model resolution so `/model deepseek v4` and similar friendly names cannot become invalid exact OpenRouter ids.
- Scaffold TypeScript project.
- Add `orx` executable.
- Add config loader.
- Add OpenRouter API key validation.
- Add basic `status` command.
- Add basic OpenRouter streaming request.

## P1

Completed:

- Add TUI composer, in-process history, footer/status, and streaming output.
- Add initial inline slash handling.
- Add `/model`, `/status`, `/clear`, `/help`, `/quit`, and `/exit`.
- Add exact model, auto-router, and Fusion request support for `ask`.
- Add token and cost display for streamed responses.
- Extract slash command parser/registry.
- Add `/models`, `/mode auto`, `/mode fusion`, `/fusion`, and `/new`.
- Add richer chat status for mode/Fusion changes.

## P2

Completed:

- Add local tools: read file, list files, search files, shell, git diff, apply patch.
- Add shell output truncation.
- Create later-phase implementor handoff for plugins, MCP policy, advanced tooling, and research stack.
- Create focused Phase 6 handoff for the OpenRouter agent runtime and tool-call loop.
- Add Phase 6 `src/agent/` runtime wrapper around existing OpenRouter streaming.
- Add OpenRouter-compatible native tool schemas.
- Add local tool dispatch from model tool calls.
- Add guarded multi-turn tool-call loop.
- Wire `ask` and `chat` through the agent runtime.
- Add visible tool execution summaries for chat and ask.
- Add visible changed-file summaries after file-editing tools.
- Add git diff truncation metadata to visible tool summaries without dumping diffs.
- Add interruption handling for active local tool execution, especially shell commands.
- Add runtime context management and message compaction boundaries.
- Add in-process `/compact` for local chat context compaction.
- Add context message/byte state to interactive `/status`.
- Add richer session-level diff state and `/diff` behavior after file edits.
- Add native test-runner adapters: package `test*` script discovery/run, direct Node test fallback, `orx tests list|run`, `/tests list|run`, and status visibility.
- Add model-visible native `run_tests` tool that reuses the test adapter with shell disabled, bounded output, timeout coverage, sanitized extra arguments, and compact tool summaries.
- Add framework-aware test target metadata: infer Node/Vitest/Jest/Playwright/unknown frameworks and simple reporter hints for package-script targets, render framework counts in status, and include framework metadata in `run_tests` summaries.
- Add compact test report parsing for common Node/Vitest/Jest/Playwright summary lines in `orx tests run`, `/tests run`, and model-visible `run_tests` summaries.
- Add dependency-free local code maps: bounded tree scan, language/key-file/entrypoint summaries, JavaScript/TypeScript import/export extraction, `orx code map`, `orx map`, `orx code-map`, `/map`, and `/code map`.
- Add dependency-free local symbol indexes: exported JavaScript/TypeScript symbol names with file paths and line numbers through `orx code symbols`, `orx symbols`, `/code symbols`, and `/symbols`.

Next:

- Read `memory/14_PHASE_6_AGENT_RUNTIME.md` before starting Phase 6 implementation.
- Keep the tool-call loop compatible with a future `delegate_task` tool.

## P3

Completed:

- Add session persistence foundation for interactive chat.
- Add session JSON storage helpers, git metadata snapshots, API-key-free config snapshots, and `ORX_SESSION_DIR` override.
- Add `/resume` for listing and restoring saved chat sessions after restart.
- Replace the Phase 6 in-process `/compact` scaffold with persistent-session-aware compaction.
- Add direct OpenRouter live metadata helpers for models, credits, and generation lookup.
- Replace `/models` placeholder with live model catalog lookup and optional text filtering.
- Add `/credits`, `/generation <id>`, `orx models [query]`, `orx credits`, and `orx generation <id>`.
- Add disabled-by-default OpenRouter MCP profile scaffolding and `/mcp` status/list output.
- Add MCP policy/profile visibility to `/status`.
- Add deterministic MCP profile/registry hashing for configured profile metadata and declared tool risk.
- Add local redacted MCP audit JSONL scaffolding for status, inspect, and enable/disable attempts.
- Add `/mcp inspect <profile>` plus in-process-only `/mcp enable <profile>` and `/mcp disable <profile>` simulation.
- Add `/status` visibility for MCP hashes, pending schema changes, and active/configured billable MCP tool counts.
- Persist MCP profile enable/disable trust state under `~/.orx/mcp/profiles.json` with `ORX_MCP_CONFIG_PATH` test override.
- Add trusted profile hash baselines and pending schema-change visibility for persisted MCP profiles.
- Add gated `/mcp discover <profile>` for official OpenRouter remote HTTP MCP discovery/status without exposing remote MCP tools to the model loop.
- Update the declared OpenRouter MCP tool surface to current docs and keep `chat-send` visibly billable.
- Add MCP declared-tool allow/deny policy evaluation and `/mcp tools <profile>` render-only visibility.
- Add `/status`, `/mcp list`, and `/mcp inspect` visibility for MCP policy-allowed, policy-denied, configured default-denied, and risky declared tool counts.
- Add Phase 11 initial orchestration/delegation command metadata: session-local OpenRouter controller/delegate metadata, `/orchestrator`, `/delegate`, `/delegates`, interactive `/status` visibility, session persistence/resume, count-bounded sanitized state, and no execution in the initial slice.
- Add Phase 11 delegation readiness parity: `orx orchestrator`, `orx delegate`, `orx delegates`, and read-only slash `plan/status` variants render delegation status/blockers; mutating CLI forms validate arguments then refuse because CLI has no delegation session store.
- Add Phase 11 saved disabled delegation teams: private `~/.orx/delegation/teams.json` registry with `ORX_DELEGATION_TEAMS_PATH`, `orx delegates teams|save|inspect|use|delete`, `orx delegate team ...`, `/delegates teams|save|inspect|use|delete`, `/delegate team ...`, slash load into session-local disabled metadata, and separate policy-controlled execution.
- Add Phase 11 delegation execution policy: private `~/.orx/delegation/policy.json` storage with `ORX_DELEGATION_POLICY_PATH`, `orx delegate policy`, `orx delegates policy`, `/delegate policy`, `/delegates policy`, explicit `--execution enabled|disabled`, policy limits for cost/timeout/result bytes/concurrency, fixed credential/result modes, and `/status` visibility.
- Add Phase 11 `delegate_task` runtime contract: optional native schema, dispatch path, policy-bounded argument validation, sanitized delegate resolution, result envelope, hash-only audit JSONL at `~/.orx/audit/delegation.jsonl` with `ORX_DELEGATION_AUDIT_PATH`, status/readiness visibility, and later policy-gated OpenRouter delegate calls in interactive chat only.
- Add policy-gated OpenRouter delegate adapter: explicit `--execution enabled|disabled`, chat-only `delegate_task` exposure when policy plus delegate state are present, OpenRouter streaming delegate calls, untrusted result wrapping, secret-like live payload refusal, hash-only audit metadata, and no subprocess or credential forwarding.
- Add delegation result merge controls: `--result-merge manual_summary|metadata_only`, model-facing omission of delegate text in metadata-only mode, hash/result metadata preservation, terminal summary/status visibility, and no automatic result merge.
- Add saved delegation team readiness previews: `orx delegates plan <saved-team-id>` and `orx delegate plan <saved-team-id>` render a stored team against current execution policy without mutating chat state, calling OpenRouter, or changing policy.
- Add MCP managed auth env-file templates: `orx mcp auth init <profile>` / `env-file` and matching slash commands create private commented shell env templates under `~/.orx/mcp/auth-env` or `ORX_MCP_AUTH_ENV_DIR` without token persistence, network calls, subprocesses, overwrite of existing files, or symlink-parent writes.
- Add MCP macOS Keychain bearer support: `orx mcp auth keychain [status|set|delete] <profile>` and matching slash commands manage optional Keychain items through `/usr/bin/security`; MCP calls read Keychain only after explicit `ORX_MCP_KEYCHAIN=1` opt-in.

Next:

- Add actual managed OAuth/provider credential flows beyond bearer storage, such as provider-specific auth helpers, refresh guidance, or provider-issued short-lived token helpers with explicit trust and no model-visible secrets.
- Dogfood policy-enabled OpenRouter delegation with a real key using isolated policy/audit paths, then tighten remaining delegate team/profile ergonomics and any stronger pre-spend budget strategy OpenRouter can support.
- Add secret redaction and minimal env forwarding for future stdio/child-process MCP runners if ORX adds them beyond the current remote HTTP path.

## P4

- Completed:
  - Add Phase 9 Slice 1 plugin substrate: sanitized manifest parsing, stable plugin ids, private registry persistence under `~/.orx/plugins/registry.json`, local lock-style records, inert installed/enabled state separation, bounded component hashing, pinned git source records, `/plugins list|inspect|register|enable|disable`, and `/status` plugin counts with hooks/bins/MCP remaining inactive.
  - Add Phase 9 Slice 2 Agent Skills progressive loader: bounded enabled-plugin-only `SKILL.md` discovery, compact metadata in model context through ephemeral system messages, `/skills list`, `/skills activate <id>`, activated skill provenance in sessions, and `/status` enabled skill count while keeping hooks/bins/plugin commands/MCP/code execution inactive.
  - Add Phase 10 Slice 1 research foundation: `src/research/` evidence source model, slash-only `/web fetch <url>` and `/fetch <url>`, `/sources`, bounded direct fetch/extract, layered SSRF-style URL guard, DNS-vetted Node-native fetch transport, untrusted web context messages, session-persisted `evidenceSources`, and interactive `/status` source count.
  - Add Phase 10 Slice 2 citation/bibliography MVP: deterministic metadata-only citation formatting, `/cite <source-id>`, no-arg `/cite` usage/available-id listing, `/bibliography`, stable source-id ordering, citation provenance/hashes, sanitized rendered fields, and resume-aware use of persisted `evidenceSources`.
  - Add Phase 10 slash-only web search MVP: `/web search <query>` and `/search <query>` backed by `BRAVE_SEARCH_API_KEY`, bounded Brave queries, blocked-result URL filtering, secondary snippet evidence, untrusted search context insertion, and citation provenance marking for provider snippets.
  - Add Phase 10 browser automation foundation: `/web browse <url>` and `/browse <url>` slash-only browser snapshots, `kind=browser` evidence, bounded untrusted browser context insertion, session persistence, DNS-bound document fetch before browser rendering, disabled JavaScript, aborted browser network routes, guarded redirects/final URLs, and optional dynamic Playwright runtime.
  - Add plugin management CLI ergonomics: `orx plugins list|inspect|register|install|enable|disable`, `/plugins install <manifest-path>` alias, no-API-key/no-fetch operation, sanitized unknown-plugin errors, override parent permission preservation, and tests preserving inert hooks/bins/MCP/plugin-command/code-execution surfaces.
  - Add ORX-owned local plugin install cache: `~/.orx/plugins/cache` with `ORX_PLUGIN_CACHE_DIR`, sanitized cached manifests, declared-component-only snapshots, cached lock manifest paths with original-path provenance, `/status` cache path visibility, and skill discovery from cache after source removal.
  - Add local plugin catalog groundwork: `~/.orx/plugins/catalog.json` with `ORX_PLUGIN_CATALOG_PATH`, sanitized local catalog entries, `orx plugins catalog`, `/plugins catalog`, and install-by-catalog-id resolution into the existing inert register/cache flow.
  - Add pinned git plugin catalog installs: sanitized catalog `source.type = "git"` entries with repository/ref/full commit/manifest path metadata, shell-disabled bounded git clone/checkout into private temp cache storage, catalog pin provenance normalization, manifest symlink escape rejection, unsafe git transport rejection, and reuse of the existing disabled inert register/cache flow.
  - Add local plugin catalog inspect/editor/update-check/apply commands: `orx plugins catalog inspect|updates|update|add-local|add-git|remove` and `/plugins catalog inspect|updates|update|add-local|add-git|remove` review local declarations, compare installed registry provenance against local pinned git catalog commits, explicitly apply available pinned git catalog updates through the existing install path as disabled snapshots, or write private local catalog declarations with safe local path, pinned git source, tag, and description parsing while keeping enable/trust/grant/fetch/execution as separate explicit steps.
  - Add read-only plugin review/doctor/audit: `orx plugins review` and `/plugins review`, with `doctor` and `audit` aliases, summarize installed/enabled state, local catalog pin drift, bin/hook trust, plugin MCP profiles, plugin command aliases, omissions, and concrete next commands without network, execution, install/enable/trust/grant mutation, state writes, or chmod side effects.
  - Add local user MCP profile catalogs: `~/.orx/mcp/profile-catalog.json` with `ORX_MCP_PROFILE_CATALOG_PATH`, sanitized namespaced `user:<profile-id>` `remote-http` declarations, `/mcp`/`orx mcp`/`/status` visibility, and shared enable/trusted-hash/schema-change/tool-grant/model-grant/auth/audit gates with built-in and plugin MCP profiles.
  - Add local user MCP catalog management commands: `orx mcp catalog|add-profile|remove-profile|add-tool|remove-tool` and matching `/mcp ...` slash commands, private catalog writes, declared-tool editing, and preservation of existing `servers`-shape declarations.
  - Add built-in MCP provider preset inspect/install UX: `orx mcp presets`, `orx mcp presets inspect <preset>`, `orx mcp add-preset <preset>`, `/mcp presets`, `/mcp presets inspect <preset>`, and `/mcp add-preset <preset>` review templates or install disabled local user catalog declarations for `context7`, `microsoft-learn`, `github-readonly`, `sentry-readonly`, `figma`, `browser`, `cloudflare-docs`, and `cloudflare-api`.
  - Add profile-level risk and write-capable metadata to MCP provider presets, and preserve stricter existing same-name tool declarations during remote tool import so remote metadata cannot downgrade local risk/auth/billable policy. High-risk/write-capable profiles skip undeclared remote tools until the operator manually declares an explicit risk.
  - Add MCP auth readiness inspection: `orx mcp auth <profile>` and `/mcp auth <profile>` render profile-specific/fallback bearer env status, effective readiness, hash state, OAuth limitation, and no-secret-persistence guidance without network calls.
  - Add MCP auth setup guidance: `orx mcp auth setup <profile>`, `orx mcp auth env <profile>`, `/mcp auth setup <profile>`, and `/mcp auth env <profile>` render copyable bearer env placeholders only for auth-required profiles, suppress token snippets for no-auth profiles, audit neutral metadata only, and make no network/subprocess/config writes.
  - Add plugin markdown prompt-command activation: enabled-plugin-only `components.commands` discovery from cached manifests, metadata-only `/prompts list`, explicit `/prompts activate <id>`, activated prompt provenance in sessions, and untrusted prompt system messages; later derived aliases activate the same prompts, and manifest-defined exec aliases are now implemented separately as trusted-bin wrappers.
  - Add plugin markdown rule activation: enabled-plugin-only `components.rules` discovery from cached manifests, metadata-only `/rules list`, explicit `/rules activate <id>`, activated rule provenance in sessions, and untrusted advisory rule system messages; later slices added separately trusted bin, hook, and MCP execution surfaces.
  - Add inert plugin manifest metadata: sanitized homepage/docs/license/trust tier/auth/privacy/runtime fields, `/plugins inspect` risk/requirements rendering, summary trust/auth state, and secret/control-character rejection while metadata remains display-only.
  - Add render-only plugin MCP presets: enabled-plugin-only cached `components.mcpServers` JSON discovery, namespaced `plugin:<plugin-id>:<server-id>` profiles, MCP policy/status/inspect/tools visibility, profile hashes with plugin provenance, and no plugin tool runtime; later work adds guarded endpoint discovery.
  - Add render-only plugin hook discovery and hash trust: enabled-plugin-only cached `components.hooks` JSON discovery, namespaced `plugin:<plugin-id>:<hook-id>` hooks, `orx hooks` and `/hooks` list/inspect/trust/untrust, private trusted hash state, status counts for definitions/trusted/pending, and no hook execution.
  - Add trusted hook manual runtime: `orx hooks run <id>` and `/hooks run <id>` execute only trusted current hook hashes from the cached plugin root/safe relative cwd, copy declared hook cwd directories into the cache, forward only declared env names, apply timeout/output caps, redact forwarded env values, fail closed on audit-write failures, and audit to private JSONL.
  - Add automatic trusted plugin lifecycle hook dispatch: trusted current hook hashes run on `session_start`, `user_prompt_submit`, `pre_tool_use`, `post_tool_use`, `pre_compact`, `post_compact`, and `stop`, while untrusted/pending hooks are skipped and failures are visible/audited.
  - Add trusted plugin MCP endpoint discovery: enabled/trusted/unchanged plugin `remote-http` profiles can run a guarded DNS-vetted `/mcp discover` initialize handshake without listing/executing tools or exposing them to the model loop.
  - Add read-only remote MCP tool listing: `/mcp remote-tools <profile>` calls guarded `tools/list` for enabled/trusted/unchanged profiles, renders bounded untrusted metadata plus schema hashes, audits results, and does not call `tools/call`.
  - Add reviewed remote MCP tool import: `orx mcp import-remote-tools <profile>` and `/mcp import-remote-tools <profile>` use guarded `tools/list` metadata to import sanitized read-only/free tool names into local `user:` catalog profiles only, then require profile retrust if the declaration hash changed.
  - Add noninteractive MCP discovery/listing parity: `orx mcp discover` and `orx mcp remote-tools` now use the same guarded/audited behavior as the slash commands.
  - Add MCP per-tool grant policy storage: `/mcp allow-tool`, `/mcp revoke-tool`, and `orx mcp allow-tool|revoke-tool` persist profile-hash-bound grants for billable/write/destructive declared tools, render active/stale grant state, audit mutations, and still do not execute MCP tools.
  - Add explicit operator MCP tool calls: `/mcp call` and `orx mcp call` execute guarded `tools/call` only for enabled/trusted/unchanged profiles with allowed declared-tool policy, env bearer auth or explicit macOS Keychain opt-in, redacted/truncated untrusted output, and audit logs without raw arguments/output.
  - Add session-local model MCP read-only bridge: `/mcp model enable` exposes one native `mcp_call` model tool for read-only non-billable declared MCP tools, later narrowed by active model-tool grants; broad/billable/write model-loop MCP exposure remains inactive.
  - Add one-shot model MCP read-only opt-in: `orx ask --mcp-tools` exposes the same `mcp_call` bridge for one noninteractive request only.
  - Add persisted model MCP read-only allowlists: `/mcp allow-model-tool`, `/mcp revoke-model-tool`, and `orx mcp allow-model-tool|revoke-model-tool` store profile-hash-bound grants for model-visible read-only non-billable tools, with stale grants visible and denied.
  - Add model-visible MCP prompt-injection boundary wrapping: `mcp_call` text results returned to the model are marked untrusted, wrapped in begin/end untrusted remote-output markers, and include policy reminders that remote MCP content cannot override ORX/operator/tool permissions.
  - Add explicit plugin bin runtime: `orx bins` and `/bins` list/inspect/trust/run/untrust enabled plugin `components.bins` files from the cached plugin snapshot, execute only trusted current hashes with manifest-declared env, and audit redacted bounded output without raw argument lists.
  - Add namespaced plugin command aliases: `/plugin:<plugin-id>:command:<slug>` activates enabled prompt commands as untrusted context, `/plugin:<plugin-id>:bin:<file>` runs trusted current bins through the existing bin runtime, and `/plugin list` / `orx plugins commands` render aliases.
  - Add manifest-defined executable command schemas: enabled plugin `components.commandSchemas` JSON can declare `/plugin:<plugin-id>:exec:<slug>` aliases with bounded metadata, direct bin references, optional `maxArgs`, and execution through the existing trusted-current bin runtime only.
  - Add local plugin authoring scaffold: `orx plugins scaffold <directory>` and `/plugins scaffold <directory>` create valid local `orx-plugin.json` authoring bundles without registry writes, default to inert skills/prompt-commands/rules markdown, support `--minimal`, and add opt-in empty placeholders for hooks, bins, MCP, command schemas, assets, and docs behind existing review gates.
  - Add no-side-effect plugin manifest validation: `orx plugins validate <manifest-path-or-directory>` and `/plugins validate <manifest-path-or-directory>` parse sanitized manifests, render manifest/component hashes, permission counts, and missing component warnings, and leave registry/cache/trust/runtime state unchanged.
  - Add initial local code intelligence: `src/code-map/` dependency-free bounded repository maps and exported-symbol indexes exposed through `orx code map`, `orx map`, `orx code-map`, `orx code symbols`, `orx symbols`, `/map`, `/code map`, `/code symbols`, and `/symbols`, with language/key-file/entrypoint and JavaScript/TypeScript import/export summaries.

- Extend browser automation beyond static DNS-bound document snapshots when a safe browser-network/proxy design can preserve SSRF protections.
- Extend prompt-injection safeguards beyond direct fetched content to search/crawl/browser/provider outputs.
- Follow `memory/13_IMPLEMENTOR_HANDOFF_PLUGINS_MCP.md` for the full-stack plugin/MCP/research build order.
- Extend documented provider preset packs/templates beyond the current hosted remote HTTP set with database dev/read-only profiles, cloud write profiles only as explicit opt-ins, and any additional official providers after current transport/auth docs are rechecked.
- Extend the plugin system beyond the registry/CLI/cache/catalog/git-source/catalog-editor/update-check/update-apply/review/scaffold/validate substrate with expanded authoring docs/templates, explicit remote update discovery if fetch policy is designed, and optional stronger provenance/signing.
- Extend manifest-defined executable command schemas with richer argument forms only if they can stay bin-backed and operator-explicit.
- Extend model-loop MCP controls with clearer prompt-injection boundaries and optional operator grants for any future billable/write model exposure.
- Extend plugin metadata further only where needed for remote source UX, marketplace/catalog trust, or executable surface policy decisions.
- Add tree-sitter and ast-grep code intelligence for richer call/reference slices, syntax-aware search, and codemod previews beyond the dependency-free code map and exported-symbol index.
- Add structured Vitest/Jest/Playwright/Node report ingestion beyond current summary-line parsing when framework-native JSON/report files can be requested safely.
- Add LSP/SCIP bridge research spike for diagnostics, references, hover, and go-to-definition.
- Add Sourcegraph read-only profile for multi-repo search/navigation/history.
- Add docs/retrieval providers: Context7, DeepWiki, OpenAI Docs, Microsoft Learn, AWS docs, Google Developer Knowledge.
- Add official GitHub MCP read-only integration before write-capable GitHub operations.
- Add GitLab read-only profile, then CI-write only as explicit opt-in.
- Add security scanner profiles: Semgrep, Snyk, Socket, OSV-Scanner, CodeQL, and Trivy.
- Add optional Chrome DevTools MCP profile for frontend debugging and performance traces.
- Add database profiles with read-only defaults, row limits, query logging, and explicit connection names.
- Add cloud/devops profiles only as explicit opt-ins with account/project/region visible in `/status`.
- Add research profiles: `research-web`, `research-crawl`, `research-scholar`, `research-docs`, `research-browser`, `research-rag`, and `research-memory`.
- Extend citation support later with style selection and richer paper/PDF identifiers after scholarly/document source adapters exist.
- Extend saved orchestration teams with active execution policy selection after model-visible `delegate_task` boundaries, live policy enforcement, and audit semantics are implemented.
- Add stronger live delegated-task pre-spend budget strategy if provider APIs support it.
- Add Codex delegate adapter.
- Add Devin delegate adapter through MCP/API when credentials are configured.
- Add live budget, permission, timeout, and result-truncation enforcement for delegated tasks.
- Add tests for slash parsing, config loading, and tool execution.
- Completed Phase 12 UX Recovery Slice 4 grouped command help: common/advanced tiers, filtered help, palette renderer, aliases `/m` `/s` `/q` `/h`, and concise unknown-command guidance.
- Completed Phase 12 UX Recovery Slice 3 first TTY screen pass: pure `src/tui/screen.ts` renderer, compact bottom status/composer, long-footer suppression in TTY mode, width-aware truncation tests, and readline/NO_COLOR separation.
- Completed Phase 12 UX Recovery Slice 2 no-arg launch: `orx` starts chat from cwd, explicit help remains `orx help`/`--help`/`-h`, no-key no-arg fails like `orx chat`, and cwd is persisted in session JSON.
- Completed Phase 12 UX Recovery Slice 1 model resolver: catalog-backed `/model <id-or-search>`, safe friendly-name resolution, bounded multiple-match choices, explicit slug fallback on catalog outage, and redacted live metadata errors.
- Completed Phase 12 Slice 1 CLI polish foundation: internal terminal render helpers, ASCII-safe context/cost/credits meters, TTY-only color styling, `/status` context/cost meters, `/credits` usage meter, chat footer meters, and focused render/status/credits/chat tests.
- Add next Phase 12 UI polish slices: richer multiline/input ergonomics and compact provider badge polish.
- Completed Phase 12 saved profile controls: local profile registry, CLI/global profile application, chat `/profile`, status/session visibility, and no-key persisted snapshots.
- Completed Phase 12 TTY theme controls: config/env/slash theme selection with default, mono, and vivid render themes across status, composer, tool summaries, credits, palette, CLI status/credits/ask, and session snapshots.
- Completed Phase 12 package/global install hardening: npm `prepare`, temp-prefix `verify:global-install`, symlink-aware bin entrypoint detection, and README source-global install docs.
