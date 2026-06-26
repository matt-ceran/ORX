# Implementation Plan

Last updated: 2026-06-26

## Phase 0: Project Setup

- Create local repo and GitHub repo.
- Add README, implementation plan, and memory system.
- Establish durable project guidance through `AGENTS.md`.

Status: complete.

## Phase 1: CLI Skeleton

- Create TypeScript project.
- Add package scripts for build, lint, test, and dev.
- Add `orx` executable entry point.
- Load config from `~/.orx/config.toml` or repo-local development defaults.
- Validate required `OPENROUTER_API_KEY`.

Done when `orx --help` and `orx --version` work locally.

Status: complete and independently verified on 2026-06-25.

## Phase 2: OpenRouter Streaming

- Implement OpenRouter client against `https://openrouter.ai/api/v1`.
- Support streaming chat completions.
- Support exact model slugs.
- Capture returned model, token usage, generation id, and cost metadata when available.

Done when the CLI can stream one response from a configured model.

Status: complete and independently verified on 2026-06-25.

## Phase 3: TUI MVP

- Add terminal UI with message list, streaming output, composer, footer, and status indicators.
- Add keyboard handling for submit, interrupt, history, and quit.
- Add colored tool call blocks and dimmed metadata.

Done when a user can chat interactively in the TUI.

Status: complete and independently verified on 2026-06-25.

## Phase 4: Slash Commands

- Implement slash command parser and registry.
- Add `/model`, `/models`, `/mode`, `/fusion`, `/status`, `/clear`, `/new`, and `/quit`.
- Make `/mode auto` select `openrouter/auto`.
- Make `/mode fusion` select `openrouter/fusion`.
- Make `/fusion general-budget` send Fusion plugin config.

Done when OpenRouter routing modes can be changed without restarting the CLI.

Status: complete and independently verified on 2026-06-25.

## Phase 5: Local Coding Tools

- Add `read_file`, `list_files`, `search_files`, `shell`, `git_diff`, and `apply_patch`.
- Use `rg` for search when available.
- Run shell commands without prompts by default.
- Show file changes and diffs clearly in the TUI.

Done when ORX can inspect and modify a repo end to end.

Status: complete and independently verified on 2026-06-25.

## Phase 6: Agent Runtime

Handoff: `memory/14_PHASE_6_AGENT_RUNTIME.md`.

- Add tool-call loop.
- Add tool result truncation.
- Add context management and message compaction.
- Add model-aware request shaping.
- Add interruption handling.
- Keep the runtime structured so a future `delegate_task` tool can call model or agent adapters without changing the core loop.

Done when the agent can complete multi-step coding tasks reliably.

## Phase 7: Sessions And Memory

- Persist transcripts under `~/.orx/sessions`.
- Add `/resume`, `/compact`, and session metadata.
- Track model, mode, cost, cwd, and git state per session.

Done when sessions can be resumed after terminal restart.

## Phase 8: OpenRouter MCP And MCP Policy

- Add MCP client support.
- Connect to OpenRouter MCP for live model search, rankings, benchmarks, credits, and generation lookup.
- Keep OpenRouter API as the actual inference path.
- Add explicit MCP profiles.
- Add MCP schema hashing, tool allow/deny lists, secret redaction, and local audit logs.

Done when `/models`, `/credits`, and model recommendations can use live OpenRouter data.

## Phase 9: Plugins And Advanced Tooling

- Add ORX plugin manifest support, install cache, lockfile pins, and enabled/installed state separation.
- Add Agent Skills `SKILL.md` loader with progressive disclosure.
- Add plugin-provided slash commands/prompts, rules, lifecycle hooks, and MCP presets.
- Add `/plugins` and hook/plugin inspection workflow.
- Add tree-sitter, ast-grep, LSP/SCIP research spike, Sourcegraph read-only profile, and scanner profiles.

Done when ORX can install and enable a locked plugin bundle without auto-enabling risky executable or auth-bearing surfaces.

## Phase 10: Web, Browser, And Research Tools

- Add web search integration.
- Add optional Playwright browser automation.
- Add prompt-injection safeguards for fetched content.
- Add research profiles for web, crawl, scholar, docs, browser, RAG, and memory.
- Add research evidence ledger and citation commands.

Done when ORX can research current information, verify sources, and cite evidence in task work.

## Phase 11: Orchestration And Delegation

- Add orchestration profiles with one controller and a delegate pool.
- Allow the controller to be either an OpenRouter model or an external agent adapter such as Codex.
- Add delegate adapters for OpenRouter models first, then Codex and Devin when the local/API surfaces are available.
- Add slash commands for selecting the orchestrator, adding/removing/listing delegates, and saving/loading teams.
- Expose delegation through an ORX-owned `delegate_task` tool so ORX enforces credentials, permissions, budgets, and result merging.
- Persist the active orchestration profile and delegate results in session metadata.

Done when an ORX session can ask a selected controller to delegate subtasks to configured models or agent adapters and summarize their results back into the main thread.

## Phase 12: Polish

- Improve visual design, command palette, animations, themes, and model badges.
- Add tests for core command parsing and tool execution.
- Package for global install.

Done when `npm install -g` or equivalent exposes a stable `orx` command.
