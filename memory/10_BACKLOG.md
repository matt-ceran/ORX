# Backlog

Last updated: 2026-06-25

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

Next:

- Add local tools: read file, list files, search files, shell, git diff, apply patch.
- Add tool-call loop.
- Add visible diff summaries after file edits.
- Add shell output truncation.
- Keep the tool-call loop compatible with a future `delegate_task` tool.

## P3

- Add session persistence.
- Add `/resume`.
- Add `/compact`.
- Add OpenRouter MCP integration.
- Add `/credits` and generation lookup.
- Add MCP client registry/config support with explicit profiles.
- Add `/mcp` status/list/enable/disable command design.
- Add `/status` fields for MCP server risk metadata.
- Persist active orchestrator and delegate metadata in sessions.

## P4

- Add web search.
- Add Playwright browser automation.
- Add prompt-injection safeguards for fetched content.
- Add MCP presets: `openrouter`, `context7`, `github-readonly`, `browser`, `sentry-readonly`, `figma`, `db-dev`, `cloud-readonly`, and `cloud-write`.
- Add docs/retrieval providers: Context7, DeepWiki, OpenAI Docs, Microsoft Learn, AWS docs, Google Developer Knowledge.
- Add official GitHub MCP read-only integration before write-capable GitHub operations.
- Add optional Chrome DevTools MCP profile for frontend debugging and performance traces.
- Add database profiles with read-only defaults, row limits, query logging, and explicit connection names.
- Add cloud/devops profiles only as explicit opt-ins with account/project/region visible in `/status`.
- Add orchestration profiles: `/orchestrator`, `/delegate`, `/delegates`, and `/team`.
- Add OpenRouter delegate adapter.
- Add Codex delegate adapter.
- Add Devin delegate adapter through MCP/API when credentials are configured.
- Add budget, permission, timeout, and result-truncation controls for delegated tasks.
- Add tests for slash parsing, config loading, and tool execution.
- Add packaging for global install.
