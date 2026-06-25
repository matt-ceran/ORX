# Backlog

Last updated: 2026-06-25

## P0

Completed:

- Scaffold TypeScript project.
- Add `orx` executable.
- Add config loader.
- Add OpenRouter API key validation.
- Add basic `status` command.

Remaining:

- Add basic OpenRouter streaming request.

## P1

- Add TUI composer, scrollback, footer, and streaming output.
- Add slash command parser.
- Add `/model`, `/models`, `/mode auto`, `/mode fusion`, and `/fusion`.
- Add exact model, auto-router, and Fusion request support.
- Add token and cost display.

## P2

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
- Persist active orchestrator and delegate metadata in sessions.

## P4

- Add web search.
- Add Playwright browser automation.
- Add prompt-injection safeguards for fetched content.
- Add orchestration profiles: `/orchestrator`, `/delegate`, `/delegates`, and `/team`.
- Add OpenRouter delegate adapter.
- Add Codex delegate adapter.
- Add Devin delegate adapter through MCP/API when credentials are configured.
- Add budget, permission, timeout, and result-truncation controls for delegated tasks.
- Add tests for slash parsing, config loading, and tool execution.
- Add packaging for global install.
