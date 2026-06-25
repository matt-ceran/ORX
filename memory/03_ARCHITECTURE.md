# Architecture

Last updated: 2026-06-25

## Target Stack

- Language: TypeScript
- Runtime: Node.js
- TUI: Ink or React Blessed
- Validation: zod
- Shell execution: node-pty or execa
- Search: ripgrep wrapper
- Browser: Playwright
- MCP: TypeScript MCP SDK
- Config: TOML or JSONC

## Module Boundaries

```text
src/cli.ts                 executable entry and argument parsing
src/config/                config discovery, profiles, validation
src/tui/                   terminal rendering and input handling
src/agent/                 agent loop, messages, tool dispatch, compaction
src/openrouter/            API client, models, routing modes, cost tracking
src/tools/                 local tools: files, shell, search, git, patch
src/slash/                 slash command registry and handlers
src/permissions/           permission policy, YOLO defaults, future safe modes
src/mcp/                   MCP client and server registry
src/delegation/            orchestration profiles, delegate adapters, result merging
src/sessions/              transcript persistence and resume
src/web/                   search and browser tools
```

## Request Flow

1. User submits text in the TUI.
2. Slash router handles commands that start with `/`.
3. Normal prompts enter the agent loop.
4. Agent builds an OpenRouter request from current mode, model, config, messages, and tools.
5. OpenRouter streams a response.
6. Tool calls are executed locally by the tool registry.
7. Results are summarized into the next model turn.
8. Session state, usage, and cost metadata are persisted.

Future delegation uses the same loop: the active controller can request a `delegate_task` tool call, then ORX dispatches that task to a configured adapter and returns the summarized result to the controller.

## Mode Flow

```text
exact model -> configured OpenRouter model slug
auto        -> openrouter/auto
fusion      -> openrouter/fusion
fusion+cfg  -> openrouter/fusion plus plugins config
```

## Design Principle

Keep provider behavior behind `src/openrouter/` so the rest of the runtime talks in terms of model mode, request options, messages, tools, and usage.

Keep cross-agent orchestration behind `src/delegation/` so OpenRouter model calls, Codex subprocess/SDK calls, Devin MCP/API calls, and future adapters share one controller/delegate contract.

## Current Implementation Notes

`src/openrouter/` currently owns the one-shot streaming client, request construction, SSE parsing, metadata capture, and metadata formatting used by `orx ask`.
