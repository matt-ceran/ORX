# Architecture

Last updated: 2026-06-26

## Target Stack

- Language: TypeScript
- Runtime: Node.js
- TUI: Ink or React Blessed
- Validation: zod
- Shell execution: node-pty or execa
- Search: ripgrep wrapper
- Browser: Playwright
- MCP: TypeScript MCP SDK
- Plugins: ORX manifest plus Agent Skills `SKILL.md` compatibility
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
src/plugins/               plugin install cache, manifests, skills, commands, hooks, plugin MCP presets
src/delegation/            orchestration profiles, delegate adapters, result merging
src/sessions/              transcript persistence and resume
src/web/                   search and browser tools
src/research/              search/crawl/scholar/document adapters, evidence ledger, citations
src/security/              scanner adapters, MCP/plugin audit helpers, SSRF guards
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

Future plugins load before the agent request is built. ORX should progressively expose only enabled plugin metadata, then load full skill instructions, commands, rules, hooks, MCP tools, or docs only when activated by the user, path scope, or model-selected workflow.

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

Keep plugin installation, trust, locking, and enablement behind `src/plugins/`. Plugins can contribute tools and instructions, but ORX policy decides what is enabled and what reaches the model.

Keep research provenance behind `src/research/` so search results, fetched pages, PDFs, scholarly metadata, and browser captures share one evidence-ledger and citation model.

## Current Implementation Notes

`src/openrouter/` currently owns request construction, streaming SSE parsing, metadata capture, metadata formatting, and streamed tool-call aggregation.

`src/tools/` currently owns standalone native local coding tools for file reads, directory listing, file search, shell execution, git diff, patch application, shared truncation, and process execution. Phase 6 now exposes these tools to models through `src/agent/`.

`src/agent/` now owns OpenRouter-compatible native tool schemas, native tool dispatch, bounded tool-result envelopes, and the guarded multi-turn tool-call loop used by `orx ask` and `orx chat`.

The next Phase 6 work should add context management, visible tool/diff summaries, and stronger active-tool interruption boundaries. See `memory/14_PHASE_6_AGENT_RUNTIME.md` for the implementation handoff.
