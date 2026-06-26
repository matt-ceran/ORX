# Phase 6 Agent Runtime Handoff

Last updated: 2026-06-26

Use this shard when starting Phase 6 from a fresh session. It is the fastest path from the completed CLI/tool foundation to the OpenRouter tool-call runtime.

## Startup Retrieval Path

Read these files in order:

1. `memory/00_INDEX.md`
2. `memory/01_PROJECT_BRIEF.md`
3. `memory/09_CURRENT_CONTEXT.md`
4. `memory/14_PHASE_6_AGENT_RUNTIME.md`
5. `memory/03_ARCHITECTURE.md`
6. `memory/04_OPENROUTER_INTEGRATION.md`
7. `memory/05_TOOLING_AND_PERMISSIONS.md`

Open `memory/06_TUI_DESIGN.md` only when wiring chat UI behavior, and `memory/10_BACKLOG.md` only when slicing or reprioritizing work.

## Verified Foundation

The following checkpoints are complete, verified, committed, and pushed:

| Phase | Commit | Result |
| --- | --- | --- |
| Phase 1 | `c9d20c4` | TypeScript CLI scaffold, config loading, status command |
| Phase 2 | `54869be` | OpenRouter streaming `ask` command |
| Phase 3 | `8e1d91f` | Readline chat MVP with streaming and basic slash commands |
| Phase 4 | `00a11bf` | Slash command registry, routing modes, Fusion controls |
| Phase 5 | `68781b1` | Native local coding tools and tests |

Current working command surface:

```bash
npm run dev -- status
npm run dev -- ask "Say hello"
npm run dev -- chat
```

The API key can come from `OPENROUTER_API_KEY` or ignored local config at `.orx/config.toml`. Never commit secrets.

## Existing Runtime Pieces

- `src/cli.ts` owns top-level command parsing.
- `src/tui/chat.ts` owns the readline chat loop, streaming display, in-process history, and slash dispatch.
- `src/slash/` owns slash command parsing and handlers.
- `src/openrouter/` owns request construction, streaming SSE parsing, metadata capture, and Fusion plugin config shaping.
- `src/tools/` owns native local tools: `read_file`, `list_files`, `search_files`, `shell`, `git_diff`, and `apply_patch`.
- `src/agent/` owns native tool schemas, native tool dispatch, bounded tool-result envelopes, and the guarded multi-turn tool-call loop now used by `ask` and `chat`.

Phase 6 now connects these pieces through `src/agent/` rather than expanding `src/tui/chat.ts` with ad hoc logic.

## Phase 6 Scope

Implement the first OpenRouter-native agent loop:

- Add `src/agent/` for message state, request shaping, model/tool interaction, tool dispatch, and interruption handling.
- Convert native tool definitions into OpenRouter-compatible tool schemas.
- Execute OpenRouter tool calls through the local tool registry.
- Return bounded tool results to the model with truncation metadata.
- Preserve streaming assistant output for normal responses.
- Keep `ask` and `chat` behavior stable while adding tool-capable runtime paths.
- Keep the loop shaped for future `delegate_task`, sessions, MCP profiles, and plugins.

Do not implement sessions, MCP, plugins, web research, or multi-agent orchestration in Phase 6 except for narrow interface boundaries needed to avoid rewrites later.

## Suggested Step Slices

Use bounded steps. After each step, verify in a separate agent context when possible, fix findings, then commit and push before starting the next step.

1. Add `src/agent/` message/request types and a minimal no-tool runtime wrapper around the existing OpenRouter stream.
2. Add OpenRouter tool schema generation for the native tool registry, with unit tests for names, descriptions, parameters, and disabled/future-tool boundaries.
3. Add local tool dispatch from model tool calls, with result shaping, UTF-8-safe truncation, error envelopes, and tests that do not call the network.
4. Add the multi-turn tool-call loop around OpenRouter chat completions, including max-iteration guards and mocked streaming/tool-call tests.
5. Wire `ask` and `chat` through the agent runtime while preserving current CLI flags, slash commands, Ctrl+C behavior, and status metadata.
6. Add smoke documentation and update memory/backlog once Phase 6 is testable with the user's OpenRouter API key.

Status on 2026-06-26: steps 1-5 are implemented and verified. A real OpenRouter smoke prompt selected `openai/gpt-5.5-20260423` through `openrouter/auto`, called `read_file`, and returned the package scripts. Visible tool execution summaries are also implemented for `ask` and `chat`, including compact arguments, result status/duration, truncation metadata, `git_diff` diff metadata, and `apply_patch` changed files. Active shell-tool interruption is implemented through `AbortSignal` propagation into native dispatch and process execution. Runtime context management, in-process `/compact`, session diff state, `/diff`, and concise `/status` state are also implemented. Remaining Phase 6 work should focus on final runtime polish before later sessions, MCP, plugins, and orchestration.

## Guardrails

- Keep ORX OpenRouter-native; do not wrap Codex.
- Do not copy Codex branding, private prompts, exact assets, or proprietary implementation details.
- Keep default local permissions unrestricted and visible in `/status`.
- Do not prompt for approval before native local tools.
- Never print, log, commit, or return the OpenRouter API key to the model.
- Treat tool output as untrusted context when it returns to the model.
- Keep tool outputs bounded, with explicit truncation fields.
- Prefer native local tools for core repo work; reserve MCP/plugins for later explicit profiles.
- Preserve compatibility with future `delegate_task` by keeping tool dispatch behind ORX-owned interfaces.

## Verification Targets

Before each commit:

- `npm run typecheck`
- `npm test`

For steps that touch build output or command wiring:

- `npm run build`
- `npm run dev -- status`
- A no-network mocked test for the new agent behavior

Once tool calls are wired and the user's API key is configured:

```bash
npm run dev -- ask "Inspect this repo and summarize package scripts."
npm run dev -- chat
```
