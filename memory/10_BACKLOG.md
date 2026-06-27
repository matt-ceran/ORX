# Backlog

Last updated: 2026-06-27

## P0

Completed:

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

Next:

- Add authenticated OpenRouter MCP schema/tool listing after OAuth or dedicated expiring MCP key handling is designed.
- Design explicit future allowlist storage for billable/write/destructive MCP tools before any remote tool execution.
- Persist active orchestrator and delegate metadata in sessions.
- Add MCP policy engine outside the model loop.
- Add secret redaction and minimal env forwarding for MCP child processes.

## P4

- Completed:
  - Add Phase 9 Slice 1 plugin substrate: sanitized manifest parsing, stable plugin ids, private registry persistence under `~/.orx/plugins/registry.json`, local lock-style records, inert installed/enabled state separation, bounded component hashing, pinned git source records, `/plugins list|inspect|register|enable|disable`, and `/status` plugin counts with hooks/bins/MCP remaining inactive.
  - Add Phase 9 Slice 2 Agent Skills progressive loader: bounded enabled-plugin-only `SKILL.md` discovery, compact metadata in model context through ephemeral system messages, `/skills list`, `/skills activate <id>`, activated skill provenance in sessions, and `/status` enabled skill count while keeping hooks/bins/plugin commands/MCP/code execution inactive.
  - Add Phase 10 Slice 1 research foundation: `src/research/` evidence source model, slash-only `/web fetch <url>` and `/fetch <url>`, `/sources`, bounded direct fetch/extract, layered SSRF-style URL guard, DNS-vetted Node-native fetch transport, untrusted web context messages, session-persisted `evidenceSources`, and interactive `/status` source count.
  - Add Phase 10 Slice 2 citation/bibliography MVP: deterministic metadata-only citation formatting, `/cite <source-id>`, no-arg `/cite` usage/available-id listing, `/bibliography`, stable source-id ordering, citation provenance/hashes, sanitized rendered fields, and resume-aware use of persisted `evidenceSources`.

- Add web search.
- Add Playwright browser automation.
- Extend prompt-injection safeguards beyond direct fetched content to search/crawl/browser/provider outputs.
- Follow `memory/13_IMPLEMENTOR_HANDOFF_PLUGINS_MCP.md` for the full-stack plugin/MCP/research build order.
- Add MCP presets: `openrouter`, `context7`, `github-readonly`, `browser`, `sentry-readonly`, `figma`, `db-dev`, `cloud-readonly`, and `cloud-write`.
- Extend the plugin system beyond the Slice 1 substrate with install cache, marketplace/catalog metadata, source fetching, lockfile pins for remote sources, and namespacing.
- Add plugin-provided slash commands/prompts and rules.
- Add hook runtime with hash trust and `/status` visibility.
- Add plugin-provided MCP server presets routed through ORX policy.
- Add plugin metadata fields for source, integrity, permissions, auth/privacy, runtime requirements, trust tier, and component lists.
- Add `/plugins` command for list/install/enable/disable/inspect.
- Add `/hooks` or plugin hook inspection workflow.
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
- Add orchestration profiles: `/orchestrator`, `/delegate`, `/delegates`, and `/team`.
- Add OpenRouter delegate adapter.
- Add Codex delegate adapter.
- Add Devin delegate adapter through MCP/API when credentials are configured.
- Add budget, permission, timeout, and result-truncation controls for delegated tasks.
- Add tests for slash parsing, config loading, and tool execution.
- Completed Phase 12 Slice 1 CLI polish foundation: internal terminal render helpers, ASCII-safe context/cost/credits meters, TTY-only color styling, `/status` context/cost meters, `/credits` usage meter, chat footer meters, and focused render/status/credits/chat tests.
- Add next Phase 12 UI polish slices: command palette/help filtering, theme profiles, compact model/provider badges, and package/global install hardening.
- Add packaging for global install.
