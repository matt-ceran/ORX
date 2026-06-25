# Implementation Plan

Last updated: 2026-06-25

## Phase 0: Project Setup

- Create local repo and GitHub repo.
- Add README, implementation plan, and memory system.
- Establish durable project guidance through `AGENTS.md`.

Status: in progress.

## Phase 1: CLI Skeleton

- Create TypeScript project.
- Add package scripts for build, lint, test, and dev.
- Add `orx` executable entry point.
- Load config from `~/.orx/config.toml` or repo-local development defaults.
- Validate required `OPENROUTER_API_KEY`.

Done when `orx --help` and `orx --version` work locally.

## Phase 2: OpenRouter Streaming

- Implement OpenRouter client against `https://openrouter.ai/api/v1`.
- Support streaming chat completions.
- Support exact model slugs.
- Capture returned model, token usage, generation id, and cost metadata when available.

Done when the CLI can stream one response from a configured model.

## Phase 3: TUI MVP

- Add terminal UI with message list, streaming output, composer, footer, and status indicators.
- Add keyboard handling for submit, interrupt, history, and quit.
- Add colored tool call blocks and dimmed metadata.

Done when a user can chat interactively in the TUI.

## Phase 4: Slash Commands

- Implement slash command parser and registry.
- Add `/model`, `/models`, `/mode`, `/fusion`, `/status`, `/clear`, `/new`, and `/quit`.
- Make `/mode auto` select `openrouter/auto`.
- Make `/mode fusion` select `openrouter/fusion`.
- Make `/fusion general-budget` send Fusion plugin config.

Done when OpenRouter routing modes can be changed without restarting the CLI.

## Phase 5: Local Coding Tools

- Add `read_file`, `list_files`, `search_files`, `shell`, `git_diff`, and `apply_patch`.
- Use `rg` for search when available.
- Run shell commands without prompts by default.
- Show file changes and diffs clearly in the TUI.

Done when ORX can inspect and modify a repo end to end.

## Phase 6: Agent Runtime

- Add tool-call loop.
- Add tool result truncation.
- Add context management and message compaction.
- Add model-aware request shaping.
- Add interruption handling.

Done when the agent can complete multi-step coding tasks reliably.

## Phase 7: Sessions And Memory

- Persist transcripts under `~/.orx/sessions`.
- Add `/resume`, `/compact`, and session metadata.
- Track model, mode, cost, cwd, and git state per session.

Done when sessions can be resumed after terminal restart.

## Phase 8: OpenRouter MCP

- Add MCP client support.
- Connect to OpenRouter MCP for live model search, rankings, benchmarks, credits, and generation lookup.
- Keep OpenRouter API as the actual inference path.

Done when `/models`, `/credits`, and model recommendations can use live OpenRouter data.

## Phase 9: Web And Browser Tools

- Add web search integration.
- Add optional Playwright browser automation.
- Add prompt-injection safeguards for fetched content.

Done when ORX can research current information and cite sources in task work.

## Phase 10: Polish

- Improve visual design, command palette, animations, themes, and model badges.
- Add tests for core command parsing and tool execution.
- Package for global install.

Done when `npm install -g` or equivalent exposes a stable `orx` command.

