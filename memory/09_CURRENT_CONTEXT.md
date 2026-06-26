# Current Context

Last updated: 2026-06-26

## Fast Phase 6 Handoff

To start Phase 6 in a fresh session, read:

1. `memory/00_INDEX.md`
2. `memory/01_PROJECT_BRIEF.md`
3. `memory/09_CURRENT_CONTEXT.md`
4. `memory/14_PHASE_6_AGENT_RUNTIME.md`

Then retrieve supporting shards from the index as needed. The Phase 6 shard is the focused handoff for the agent runtime and tool-call loop.

## Current State

The ORX project has been created locally and on GitHub.

Local path:

```text
/Users/draingang/Documents/ORX
```

GitHub repository:

```text
https://github.com/matt-ceran/ORX
```

Current files:

- `README.md`
- `IMPLEMENTATION_PLAN.md`
- `.gitignore`
- `AGENTS.md`
- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `src/`
- `memory/`

## Latest Work

Implemented and verified the first Phase 6 agent-runtime slice:

- Added `src/agent/` with native tool schemas, dispatch, and a guarded multi-turn runtime.
- Extended OpenRouter streaming to aggregate tool-call deltas and return tool calls with finish reasons.
- Added OpenRouter-compatible tool schemas for `read_file`, `list_files`, `search_files`, `shell`, `git_diff`, and `apply_patch`.
- Tool dispatch now parses model arguments, drops undeclared risky surfaces such as arbitrary env forwarding, runs native local tools, and returns bounded JSON result envelopes as tool messages.
- `orx ask` and `orx chat` now use the agent runtime, so enabled models can automatically call native ORX tools when they decide it is useful.
- Added no-network tests for streamed tool calls, schema inclusion, native dispatch, guarded tool-loop execution, and CLI compatibility.
- `npm run typecheck`, `npm run build`, `npm test`, and `npm run dev -- status` pass with 43 tests.
- Real OpenRouter smoke passed: `npm run dev -- ask "...Read package.json..."` selected `openai/gpt-5.5-20260423` through `openrouter/auto`, called `read_file`, and answered with the package scripts. Reported cost was `$0.006115`.

Updated the roadmap so the later full-stack integration phase explicitly follows `memory/13_IMPLEMENTOR_HANDOFF_PLUGINS_MCP.md`:

- Phase 8 remains MCP policy and official OpenRouter MCP.
- Phase 9 is now explicitly the full-stack plugin/MCP preset/advanced tooling phase.
- Phase 10 remains web, browser, and research tooling with evidence-ledger work.

Created a focused Phase 6 handoff for the OpenRouter agent runtime:

- Added `memory/14_PHASE_6_AGENT_RUNTIME.md`.
- Indexed it as `phase6` in `memory/00_INDEX.md`.
- The handoff records verified foundation commits, existing runtime files, Phase 6 scope, suggested bounded step slices, guardrails, and verification targets.
- The later-phase plugin/MCP handoff remains separate as `integration-handoff`.

Created the later-phase implementor handoff for full-stacking ORX with plugins, MCP, advanced programming tools, and deep research:

- Added `memory/13_IMPLEMENTOR_HANDOFF_PLUGINS_MCP.md`.
- The handoff defines prerequisites, phased slices, module boundaries, config sketches, plugin metadata, MCP policy, OpenRouter MCP usage, Agent Skills loading, plugin hooks, advanced code intelligence, scanner profiles, research profiles, evidence ledgers, security rules, and verification expectations.
- Updated the memory index so future implementor sessions can discover the handoff.
- This handoff does not change the immediate next task: Phase 6 agent runtime remains next.

Implemented and independently verified the Phase 5 native local coding tools:

- Added `src/tools/` registry with `read_file`, `list_files`, `search_files`, `shell`, `git_diff`, and `apply_patch`.
- Added shared truncation utilities that preserve UTF-8 byte bounds.
- `read_file` supports line and byte truncation with clear file errors.
- `list_files` reports type, size, recursion depth, and max-entry truncation.
- `search_files` uses `rg` when available, supports dash-leading patterns, and has a bounded fallback search.
- `shell` runs without approval prompts and captures exit code, stdout, stderr, cwd, duration, timeout, signal, and truncation metadata.
- `git_diff` supports working-tree diffs with optional path scopes.
- `apply_patch` supports `git apply` unified patches and structured patches with preflight validation to avoid partial mutation on malformed structured patch plans.
- Added temp-dir based tests covering success, failures, truncation, search, shell, git diff, patch application, malformed structured patches, and edge cases found by independent verifiers.
- `npm run typecheck`, `npm run build`, and `npm test` pass with 36 tests.

Continued the second-pass integration research after a context-window failure and recorded the expanded findings:

- Prior research already concluded that ORX should keep core local work native and use MCP through explicit profiles for external systems.
- New research confirmed ORX should add a first-class plugin system, not only MCP presets.
- Plugins should be installable bundles of Agent Skills `SKILL.md` workflows, slash commands/prompts, rules, lifecycle hooks, MCP server presets, named delegates, docs/context providers, assets, and optional scoped binaries.
- OpenRouter has an official hosted MCP server as of 2026-06-25 for live model catalog, pricing, benchmarks, rankings, credits, docs search, providers, generation lookup, and billable test calls. ORX should use it as a development assistant while keeping normal inference on the direct OpenRouter API client.
- Programming integrations should add native layers after the initial tools: test adapters, tree-sitter, ast-grep, LSP/SCIP, Sourcegraph read-only profile, GitHub/GitLab read-only profiles, and scanner profiles for Semgrep, Snyk, Socket, OSV-Scanner, CodeQL, and Trivy.
- Deep research should be profile-scoped with web search, crawl/scrape, scholarly metadata, document parsing, browser research, local RAG cache, research notes, and an evidence ledger for citations.
- Plugin/MCP security should require explicit install/profile enablement, source pinning, schema hashing, secrets isolation, SSRF guards, sandboxing where practical, and local audit logs.

Implemented and independently verified the Phase 4 slash command expansion:

- Extracted chat slash parsing and handling into `src/slash/`.
- Preserved `/help`, `/status`, `/model <slug>`, `/clear`, `/quit`, and `/exit`.
- Added `/mode auto`, `/mode fusion`, `/fusion [preset]`, `/models`, and `/new`.
- `/mode auto` selects `openrouter/auto` and clears Fusion preset.
- `/mode fusion` selects `openrouter/fusion`.
- `/fusion <preset>` selects Fusion mode/model and sends Fusion plugin config on later requests.
- `/models` is a no-network placeholder until OpenRouter MCP is implemented.
- `/status` now shows active routing, Fusion preset, history count, latest metadata, cwd, config source, API key source, and permissions.
- Added parser/handler tests and chat integration coverage; `npm run typecheck`, `npm run build`, and `npm test` pass.

Implemented and independently verified the Phase 3 interactive chat MVP:

- `orx chat` starts a readline-based interactive session.
- Chat uses the existing OpenRouter streaming client and request builder.
- Header/footer show cwd, mode, model, API key presence/source, and permission posture.
- `orx>` composer prompt accepts user messages.
- Assistant responses stream as chunks arrive.
- In-session history is preserved for follow-up turns during the current process.
- MVP slash commands are `/help`, `/status`, `/model <slug>`, `/clear`, `/quit`, and `/exit`.
- Ctrl+C aborts an active request through `AbortController` or exits when idle.
- `ask`, `status`, `--help`, and `--version` remain intact.
- Verified with mocked fetch/stream tests and a real short OpenRouter chat smoke test.

Implemented and independently verified the Phase 2 OpenRouter streaming command:

- `src/openrouter/` client, request builder, metadata formatter, and types
- `orx ask "prompt"` one-shot command
- streaming chat completions against `https://openrouter.ai/api/v1/chat/completions`
- `--model`, `--mode auto|fusion|exact`, and `--fusion` overrides
- API key validation for API commands while help, version, and status remain no-key safe
- SSE comment and `[DONE]` handling
- generation id capture from `X-Generation-Id`
- usage and cost metadata summary when OpenRouter returns it
- non-2xx OpenRouter error sanitization to avoid printing secrets
- mocked fetch/stream tests with no real API key required
- `npm run typecheck`, `npm run build`, and `npm test` passing

Scaffolded and independently verified the Phase 1 TypeScript CLI:

- `orx` binary mapped to compiled `dist/cli.js`
- `--help` and `--version`
- `status` command
- config discovery from repo-local `.orx/config.toml` and `~/.orx/config.toml`
- API key detection from `OPENROUTER_API_KEY` or config without printing secrets
- unrestricted permission defaults visible in status
- `npm run typecheck`, `npm run build`, and `npm test` passing

Added a mandatory workflow rule:

- implement bounded steps
- verify each step in a separate agent context when possible
- fix verifier findings before moving on
- commit and push each verified step to GitHub before starting the next step

Previously added the project memory system:

- root `AGENTS.md`
- indexed memory files under `memory/`
- project brief
- implementation plan
- architecture notes
- OpenRouter integration notes
- tooling and permissions notes
- TUI design notes
- sessions and memory notes
- decisions log
- backlog
- commands reference

Recorded future orchestration/delegation support:

- orchestration profiles with one controller and named delegates
- controller can be an OpenRouter model or external adapter such as Codex
- delegates can include OpenRouter models, Codex, Devin, and future adapters
- delegation should run through an ORX-owned `delegate_task` tool
- roadmap, architecture, OpenRouter notes, TUI command notes, sessions, backlog, and decisions now reference this direction

Recorded MCP/tooling research conclusions:

- keep file/search/shell/git/patch native instead of relying on MCP for core local work
- use official OpenRouter MCP or equivalent for live models, pricing, rankings, credits, benchmarks, docs, and generation lookup
- add profile-scoped MCP presets for docs, browser, GitHub read-only, Sentry read-only, Figma, database dev, and cloud read-only/write modes
- prefer official/first-party MCP servers; treat community registries as discovery, not trust
- show MCP server risk metadata in `/status`
- require explicit config for auth-bearing, write-capable, cloud, database, browser, and web-fetch tools

## Next Likely Task

Continue Phase 6 agent runtime:

- Add runtime context management and message compaction boundaries.
- Add better visible tool execution summaries for chat and ask.
- Add interruption handling for active local tool execution, especially shell commands.
- Add visible diff summaries after file edits.
- Keep the runtime shaped for future `delegate_task`, sessions, and MCP/plugin policy.

Do not implement orchestration before the core OpenRouter streaming loop, tool-call loop, and session metadata exist.

Do not implement the plugin system before native local tools, the tool-call loop, sessions, and MCP policy basics exist. The plugin system should build on those foundations and follow `memory/13_IMPLEMENTOR_HANDOFF_PLUGINS_MCP.md`.

## Active Constraints

- Keep ORX OpenRouter-native.
- Keep default ORX permissions unrestricted.
- Keep UI inspired by professional terminal coding agents without copying Codex branding or proprietary assets.
- Keep memory files concise and indexed.
- Commit and push only after the current implementation step has passed independent verification.
- Treat plugins and MCP servers as explicit opt-in surfaces with visible risk metadata, even while native ORX local execution remains YOLO-style.
