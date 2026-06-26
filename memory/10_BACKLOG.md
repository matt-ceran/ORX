# Backlog

Last updated: 2026-06-26

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

Next:

- Add `/resume`.
- Replace the Phase 6 in-process `/compact` scaffold with persistent-session-aware compaction.
- Add official OpenRouter MCP integration for live model catalog, pricing, rankings, benchmarks, credits, docs search, providers, and generation lookup.
- Add `/credits` and generation lookup.
- Add MCP client registry/config support with explicit profiles.
- Add `/mcp` status/list/enable/disable command design.
- Add `/status` fields for MCP server risk metadata.
- Persist active orchestrator and delegate metadata in sessions.
- Add MCP policy engine outside the model loop.
- Add MCP schema hashing and schema-change status.
- Add local MCP audit logs.
- Add secret redaction and minimal env forwarding for MCP child processes.

## P4

- Add web search.
- Add Playwright browser automation.
- Add prompt-injection safeguards for fetched content.
- Follow `memory/13_IMPLEMENTOR_HANDOFF_PLUGINS_MCP.md` for the full-stack plugin/MCP/research build order.
- Add MCP presets: `openrouter`, `context7`, `github-readonly`, `browser`, `sentry-readonly`, `figma`, `db-dev`, `cloud-readonly`, and `cloud-write`.
- Add first-class plugin system: install cache, marketplace/catalog metadata, lockfile pins, installed/enabled state separation, and namespacing.
- Add Agent Skills `SKILL.md` loader with progressive disclosure.
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
- Add research evidence ledger and `/sources`, `/cite`, and `/bibliography` command design.
- Add orchestration profiles: `/orchestrator`, `/delegate`, `/delegates`, and `/team`.
- Add OpenRouter delegate adapter.
- Add Codex delegate adapter.
- Add Devin delegate adapter through MCP/API when credentials are configured.
- Add budget, permission, timeout, and result-truncation controls for delegated tasks.
- Add tests for slash parsing, config loading, and tool execution.
- Add packaging for global install.
