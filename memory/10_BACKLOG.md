# Backlog

Last updated: 2026-06-28

## P0

Urgent UX recovery:

- Continue TTY polish after saved profile controls: richer multiline/input ergonomics and any remaining provider badge polish.

Completed:

- Add saved local profile controls: private `~/.orx/profiles.json` registry with `ORX_PROFILE_CONFIG_PATH`, no API-key persistence, `orx profile list|save|use|inspect|delete`, global `orx --profile <id>`, `/profile [list|save|use|inspect|delete]`, `active_profile`/`profile_count` status visibility, session snapshot persistence, and stale active-profile clearing on manual routing/theme changes.
- Add TTY theme controls: config `theme`, `/theme [default|mono|vivid]`, `ORX_TTY_THEME`/`ORX_THEME` overrides, theme-aware status/composer/tool summaries/credits/palette output, CLI status/credits/ask propagation, and session snapshot persistence.
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

Next:

- Read `memory/14_PHASE_6_AGENT_RUNTIME.md` before starting Phase 6 implementation.
- Keep the tool-call loop compatible with a future `delegate_task` tool.
- Add native test-runner adapters after shell tooling exists.

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
- Add Phase 11 orchestration/delegation command scaffold: inert session-local OpenRouter controller/delegate metadata, `/orchestrator`, `/delegate`, `/delegates`, interactive `/status` visibility, session persistence/resume, count-bounded sanitized state, and no `delegate_task` execution/tool exposure.

Next:

- Add authenticated OpenRouter MCP schema/tool listing after OAuth or dedicated expiring MCP key handling is designed.
- Design explicit future allowlist storage for billable/write/destructive MCP tools before any remote tool execution.
- Add OpenRouter delegate adapter and ORX-owned `delegate_task` tool only after budget, timeout, credential, and result-truncation policy is designed.
- Add MCP policy engine outside the model loop.
- Add secret redaction and minimal env forwarding for MCP child processes.

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
  - Add plugin markdown prompt-command activation: enabled-plugin-only `components.commands` discovery from cached manifests, metadata-only `/prompts list`, explicit `/prompts activate <id>`, activated prompt provenance in sessions, and untrusted prompt system messages while executable plugin commands remain inactive.
  - Add plugin markdown rule activation: enabled-plugin-only `components.rules` discovery from cached manifests, metadata-only `/rules list`, explicit `/rules activate <id>`, activated rule provenance in sessions, and untrusted advisory rule system messages while executable plugin surfaces remain inactive.
  - Add inert plugin manifest metadata: sanitized homepage/docs/license/trust tier/auth/privacy/runtime fields, `/plugins inspect` risk/requirements rendering, summary trust/auth state, and secret/control-character rejection while metadata remains display-only.
  - Add render-only plugin MCP presets: enabled-plugin-only cached `components.mcpServers` JSON discovery, namespaced `plugin:<plugin-id>:<server-id>` profiles, MCP policy/status/inspect/tools visibility, profile hashes with plugin provenance, and no plugin endpoint discovery/tool execution.
  - Add render-only plugin hook discovery and hash trust: enabled-plugin-only cached `components.hooks` JSON discovery, namespaced `plugin:<plugin-id>:<hook-id>` hooks, `orx hooks` and `/hooks` list/inspect/trust/untrust, private trusted hash state, status counts for definitions/trusted/pending, and no hook execution.
  - Add trusted hook manual runtime: `orx hooks run <id>` and `/hooks run <id>` execute only trusted current hook hashes from the cached plugin root/safe relative cwd, copy declared hook cwd directories into the cache, forward only declared env names, apply timeout/output caps, redact forwarded env values, fail closed on audit-write failures, and audit to private JSONL.
  - Add automatic trusted plugin lifecycle hook dispatch: trusted current hook hashes run on `session_start`, `user_prompt_submit`, `pre_tool_use`, `post_tool_use`, `pre_compact`, `post_compact`, and `stop`, while untrusted/pending hooks are skipped and failures are visible/audited.

- Extend browser automation beyond static DNS-bound document snapshots when a safe browser-network/proxy design can preserve SSRF protections.
- Extend prompt-injection safeguards beyond direct fetched content to search/crawl/browser/provider outputs.
- Follow `memory/13_IMPLEMENTOR_HANDOFF_PLUGINS_MCP.md` for the full-stack plugin/MCP/research build order.
- Add MCP presets: `openrouter`, `context7`, `github-readonly`, `browser`, `sentry-readonly`, `figma`, `db-dev`, `cloud-readonly`, and `cloud-write`.
- Extend the plugin system beyond the local registry/CLI/cache/catalog substrate with remote source fetching, lockfile pins for remote sources, richer metadata, and namespacing.
- Add executable slash command design after the prompt/rule metadata, explicit activation surfaces, and trusted lifecycle hook runtime.
- Add plugin MCP endpoint discovery and tool execution only after explicit runtime trust, network, secret-forwarding, and audit policy is designed.
- Extend plugin metadata further only where needed for remote source UX, marketplace/catalog trust, or executable surface policy decisions.
- Add `/plugins` command for list/install/enable/disable/inspect.
- Add tree-sitter and ast-grep code intelligence for repo maps, symbol slices, syntax-aware search, and codemod previews.
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
- Extend orchestration profiles with `/team` save/load and execution policy.
- Add OpenRouter delegate adapter.
- Add Codex delegate adapter.
- Add Devin delegate adapter through MCP/API when credentials are configured.
- Add budget, permission, timeout, and result-truncation controls for delegated tasks.
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
