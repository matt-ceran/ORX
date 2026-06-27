# Current Context

Last updated: 2026-06-27

## Fast Phase 10 Handoff

To continue Phase 10 in a fresh session, read:

1. `memory/00_INDEX.md`
2. `memory/01_PROJECT_BRIEF.md`
3. `memory/09_CURRENT_CONTEXT.md`
4. `memory/13_IMPLEMENTOR_HANDOFF_PLUGINS_MCP.md`

Then retrieve supporting shards from the index as needed.

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

Implemented and verified the bounded Phase 10 Slice 2 citation/bibliography MVP:

- Added `src/research/citation.ts` with deterministic metadata-only citation rendering on top of existing `EvidenceSource` records.
- Added `/cite <source-id>` and `/bibliography` slash commands. `/cite` with no args shows usage plus available source ids; missing ids return a bounded metadata-only error.
- Citation output includes a concise source line, source hash, text hashes, provenance, and the research trust boundary. Bibliography output renders all evidence sources in stable source-id order with hashes and provenance.
- `/cite` and `/bibliography` never render fetched page text; they use persisted evidence metadata only and perform no network calls.
- Citation fields strip terminal/ANSI/OSC control sequences, bound inline display fields, re-canonicalize/redact valid `canonicalUrl` values, and omit invalid canonical URLs rather than risking secret leakage.
- Resumed chats reuse existing session `evidenceSources`, so `/cite` and `/bibliography` work after `/resume` without changing the session schema.
- Added tests for citation rendering, stable bibliography ordering, missing/no-source behavior, poisoned metadata sanitization, slash command behavior, and chat resume citation persistence.
- `npm run typecheck`, targeted research/slash/chat/session tests, `git diff --check`, and `npm test` pass with 199 tests.

Implemented and verified the bounded Phase 10 Slice 1 web fetch/extract and research evidence ledger MVP:

- Added `src/research/` with evidence source types, SHA-256 hashing, conservative HTML/plain-text extraction, untrusted web context message creation, and `/sources` rendering.
- Added a layered SSRF-style URL guard for explicit web fetches: only `http`/`https` are allowed; localhost, loopback, private IPv4, link-local, shared/reserved/documentation/multicast IPv4, IPv6 loopback/link-local/unique-local/multicast, IPv4-mapped local IPv6, embedded credentials, and obvious cloud metadata hosts/IPs are blocked before network.
- Added bounded direct fetch using a Node-native guarded transport by default. Production fetch resolves DNS, rejects any local/private/reserved resolved address, and binds the request to a vetted address while preserving the original hostname for HTTP host/SNI/certificate validation. A separate `webFetch` injection exists only for tests and is not shared with OpenRouter metadata fetch hooks.
- Fetch timeout now covers DNS/request/header and body-read phases; byte/text extraction limits, sanitized errors, guarded redirects, terminal-control stripping, secret-like path/query redaction in canonical URLs, and stable content/text hashes are in place.
- Added chat slash commands `/web fetch <url>`, `/fetch <url>`, `/web` help, and `/sources`.
- `/web fetch` is operator-only slash behavior, not a model-autonomous browsing tool. It records source metadata and appends a bounded user-role context message that marks fetched content as untrusted and unable to authorize tool use, permission changes, MCP/profile/plugin enablement, hooks, bins, command execution, policy changes, or instruction priority changes.
- Session JSON now persists `evidenceSources` metadata while the bounded extracted text remains in the transcript message; `/status` shows the current chat evidence source count.
- Added tests for URL guard defaults, reserved-IP coverage, DNS resolution blocking, DNS timeout, blocked URL no-network behavior, bounded fetch/extract, body-read timeout, terminal-control stripping, sanitized errors, slash `/web fetch`, `/sources`, prompt-injection marking, chat/session persistence, and source status visibility.
- `npm run typecheck`, targeted research/slash/chat/session tests, and `npm test` pass with 191 tests.

Implemented and verified the Phase 9 Slice 2 Agent Skills loader with progressive disclosure:

- Added `src/plugins/skills.ts` for bounded Agent Skills discovery from enabled plugins only; disabled plugins contribute no skills to `/skills`, `/status`, or model context.
- Skills are discovered only from an enabled plugin's `components.skills` directory, either `SKILL.md` at the component root or immediate child directories containing `SKILL.md`; no recursive walking is performed.
- Discovery is bounded by skill count, child directory count, metadata bytes, and file/path safety. Metadata rejects secret-like values and terminal control characters; oversized or unsafe skills are omitted.
- Enabled skill metadata now includes stable ids such as `plugin:<plugin-id>:<skill-slug>`, plugin id, name, description, path, content hash from the bounded metadata read, and source manifest hash.
- `runAgentTurn` accepts ephemeral system messages. `orx ask` and `orx chat` prepend compact enabled-skill metadata to model requests without persisting it as normal chat history.
- Added `/skills list` for metadata-only listing and `/skills activate <id>` for explicit activation. Activation reads the exact `SKILL.md`, prints provenance, appends an untrusted full-content system message to the chat, and records activated skill provenance in session metadata.
- The activation system message states that plugin skill content is untrusted and cannot authorize tool use, permission changes, MCP enablement, hooks, bins, plugin commands, or command execution.
- Full skill activation rejects secret-like values and terminal control characters before content enters model context or persisted session transcripts.
- Chat prunes activated skill system messages and provenance when the backing plugin/skill is no longer enabled, so disabled plugins stop contributing skill context to future model requests.
- `/skills inspect` is intentionally not an activation alias; full content is loaded only through `/skills activate <id>`.
- Skill discovery fails closed if an enabled plugin registry record lacks a safe absolute manifest path, preventing malformed registry state from resolving skills relative to the process cwd.
- `/status` now reports `plugin_enabled_skills`.
- Session JSON can store `activatedSkills` provenance while keeping API keys out of saved config snapshots.
- Hooks, bins, plugin commands, plugin MCP servers, network/fetch, and plugin code execution remain inactive.
- `npm run typecheck`, `git diff --check`, targeted plugin/slash/runtime/session/CLI/chat tests, and `npm test` pass with 177 tests.

Implemented and verified the Phase 9 Slice 1 plugin manifest/registry/lockfile foundation:

- Added `src/plugins/` with sanitized ORX plugin manifest parsing, stable plugin ids, deterministic manifest hashes, local lock-style records, and component hashes for local files/directories when available.
- Added private plugin registry persistence under `~/.orx/plugins/registry.json`, with `ORX_PLUGIN_REGISTRY_PATH` override support and `0700` directory / `0600` file writes.
- Added installed vs enabled plugin state. Registering a local manifest stores the plugin disabled by default; enable/disable persist only an inert state marker.
- Added `/plugins list`, `/plugins inspect <id>`, `/plugins register <manifest-path>`, `/plugins enable <id>`, and `/plugins disable <id>`.
- `/plugins` and `/status` explicitly show that hooks, bins, plugin MCP servers, commands, and plugin code execution remain inactive in this scaffold.
- Added status visibility for installed plugin count, enabled plugin count, enabled hooks, enabled bins, and enabled MCP count; executable counts remain `0` in this slice.
- Hardened manifests and loaded registry records against secret-like values, terminal control characters, credential/query-bearing git URLs, unpinned git sources, poisoned display metadata, and unbounded local component hashing.
- Added tests for local register/list/inspect/enable/disable, invalid manifest rejection, no network/fetch, secret-field dropping, private registry file modes, registry override paths, status visibility, git source pinning, bounded component hashing, and poisoned registry sanitization.
- `npm run typecheck`, `git diff --check`, targeted plugin/slash/CLI tests, and `npm test` pass with 165 tests.

Implemented and verified the Phase 8 MCP declared-tool policy evaluation scaffold:

- Added pure MCP tool policy evaluation for configured declared tools without live discovery or remote execution.
- Default policy now allows only read-only declared tools on enabled, trusted profiles with no pending schema change.
- Billable/write/destructive declared tools are denied unless a future explicit allowlist is provided; OpenRouter `chat-send` is denied by default and remains visibly billable.
- Added `/mcp tools <profile>` to render each declared tool with risk, auth, billable flag, and policy decision. The command is render-only and does not fetch, discover, or execute tools.
- Extended `/mcp inspect`, `/mcp list`, and `/status` with concise policy/default-denied/risky tool visibility.
- Added redacted audit events for `/mcp tools`.
- Added tests for disabled-profile blocking without network, enabled/trusted read-tool allowance, billable `chat-send` denial, pending schema-change blocking, unknown profile/tool handling, and status/inspect/tools output.
- `npm run typecheck`, build-backed targeted MCP/slash/CLI tests, `git diff --check`, and `npm test` pass with 150 tests.

Implemented and verified the Phase 8 official OpenRouter MCP discovery scaffold:

- Added `src/mcp/discovery.ts` with a gated, testable discovery result surface and a minimal remote HTTP JSON-RPC `initialize` attempt.
- Added `/mcp discover <profile>` for manual profile discovery/status; it only attempts network discovery when the persisted profile exists, is enabled/trusted, has no pending schema change, and uses `remote-http`.
- Disabled, untrusted, and pending-schema-change profiles return explanatory no-network results.
- `401`/`403` discovery responses are treated as `auth_required` for OpenRouter OAuth or dedicated expiring MCP keys, with sanitized bounded errors and no secret leakage.
- Remote MCP tool execution remains unimplemented and is explicitly rendered in `/mcp inspect` and discovery output; normal chat/ask inference and REST metadata commands still use direct OpenRouter APIs.
- Updated the OpenRouter MCP declared tools to the current documented surface: `models-list`, `model-get`, `model-endpoints`, `providers-list`, `rankings-daily`, `app-rankings`, `credits-get`, `generation-get`, `benchmarks`, `docs-search`, `view-skill`, `ping`, and billable `chat-send`.
- Added redacted MCP audit events for discovery attempts/results.
- Added tests for discovery gating, mocked enabled discovery, auth-required handling, secret redaction, slash audit output, and REST metadata independence.
- `npm run typecheck`, `git diff --check`, targeted MCP/slash/CLI tests, and `npm test` pass with 142 tests.

Implemented and verified the Phase 8 persistent MCP profile trust/config slice:

- Added `src/mcp/config.ts` for private MCP profile config resolution, load/save, sanitization, and default storage under `~/.orx/mcp/profiles.json`, with `ORX_MCP_CONFIG_PATH` override support.
- Replaced process-local `/mcp enable/disable` behavior with persisted profile state records containing only profile id, enabled/disabled state, trusted profile hash baseline, and updatedAt.
- Threaded MCP config paths through noninteractive `orx status`, `orx chat`, slash command context, `/mcp`, and interactive `/status`.
- `/mcp enable openrouter` now persists enabled state and trusts the current configured hash; `/mcp disable openrouter` persists disabled state while preserving the trusted hash baseline.
- `/mcp list`, `/mcp inspect`, and `/status` show persisted profile state, trusted hash/update metadata when available, and pending schema-change visibility when the current configured hash differs from the trusted baseline.
- Added tests for persistent enable/disable across fresh status contexts, CLI status with `ORX_MCP_CONFIG_PATH`, config file shape/sanitization, trusted-hash preservation, pending schema-change calculation, and no-network `/mcp` behavior.
- `npm run typecheck`, `npm run build`, targeted MCP/slash/CLI/chat tests, `npm test` with 128 tests, and `git diff --check` pass.

Implemented and verified the next Phase 8 MCP policy foundation checkpoint:

- Added deterministic SHA-256 profile/registry hashing for configured MCP profiles based on profile metadata, transport/auth/write flags, and declared tool metadata rather than runtime enabled state.
- Expanded the OpenRouter MCP profile metadata from bare tool names to declared tools with auth, risk, and billable flags; `chat-send` is marked billable/risky while the profile remains `writeCapable=false`.
- Added local MCP audit JSONL scaffolding under `~/.orx/audit/mcp.jsonl`, with `ORX_MCP_AUDIT_PATH`/test override support, private file creation, and secret redaction for status, inspect, enable, and disable attempts.
- Added `/mcp list`/default, `/mcp inspect <profile>`, `/mcp enable <profile>`, and `/mcp disable <profile>`. Enable/disable are in-process policy simulations only and do not persist config or execute MCP tools.
- Extended `/mcp` and `/status` with profile hashes, registry hash, pending schema-change visibility (`none`), active/configured billable tool counts, and existing MCP risk/auth/server counts.
- Added no-network tests for stable and changed MCP hashes, audit JSONL redaction/shape, `/mcp` inspect/list/enable/disable behavior, `/status` visibility, and no fetch calls from MCP slash commands.
- `npm run typecheck`, `git diff --check`, and `npm test` pass with 118 tests.

Implemented and verified a bounded Phase 8 live metadata and MCP policy scaffold checkpoint:

- Added direct OpenRouter live metadata helpers for `GET /models`, `GET /credits`, and `GET /generation?id=...` with sanitized errors that redact API keys and bearer tokens.
- Replaced chat `/models` placeholder with live model catalog lookup when an OpenRouter API key is available, including optional text filtering and concise id/name/context/pricing output.
- Added chat `/credits` and `/generation <id>` slash commands for live credits and generation metadata; `/generation` can fall back to latest in-session generation id when present.
- Added non-interactive `orx models [query]`, `orx credits`, and `orx generation <id>` commands.
- Added `src/mcp/` registry/policy scaffolding with an explicit disabled-by-default `openrouter` remote HTTP profile for `https://mcp.openrouter.ai/mcp`; no MCP tool execution is implemented.
- Added chat `/mcp` status output and `/status` MCP visibility for active profiles, server counts, auth-bearing servers, write-enabled tools, risky transports, and the disabled OpenRouter profile.
- Kept normal `ask` and chat inference on the direct OpenRouter chat completions path.
- Added no-network tests for live models, credits, generation success, sanitized failures, metadata CLI commands, slash command behavior, no chat-completion request for metadata slash commands, and MCP status visibility.
- `npm run typecheck` and `npm test` pass with 108 tests.

Implemented and verified the remaining Phase 7 persistent `/compact` slice:

- `/compact` still uses the shared local extractive compactor and preserves the provenance text `ORX compacted prior context locally`.
- Chat persists the compacted message list through the normal post-slash session save path.
- Persisted session JSON stores the compacted summary plus the recent suffix and remains API-key-free.
- Resuming a compacted session restores the compacted summary, and `/status` after resume reports `compacted=yes`.
- Minimal sessions with no compactable prefix are reported as unchanged and persist predictably without adding a summary.
- Added no-network tests for compact persistence to session JSON, resume loading of compacted summaries, `/status` after resume, and minimal-session `/compact` behavior.
- `npm run typecheck` and `npm test` pass with 99 tests.

Implemented and verified the Phase 7 `/resume` slice:

- Added tolerant session listing for saved JSON records, sorted newest-first and excluding the active session.
- Chat `/resume` with no selector lists recent transcript-bearing sessions with title, cwd, updated time, model, mode, cost, and message count.
- Chat `/resume <number|id|prefix|latest>` loads a saved session, restores messages, latest metadata, active routing/Fusion config, and switches the active chat cwd to the saved session cwd.
- Exact id and prefix selection search all transcript-bearing saved sessions, not only the displayed recent list.
- Ambiguous prefix output is capped, non-numbered, and instructs users to use an exact id or longer unique prefix so `/resume 1` cannot be confused with ambiguous-match numbering.
- Blank startup session files are omitted from `/resume` listings.
- Added no-network tests for session listing, missing/malformed session files, slash `/resume` list/resume/error/ambiguous output, full chat resume with restored Fusion routing, exact-id resume outside the recent display window, and bounded ambiguous output.
- `npm run typecheck`, `git diff --check`, and `npm test` pass with 95 tests.
- Independent verifier found and rechecked exact-id and ambiguous-output edge cases; final pass reported no findings.

Implemented and verified the first Phase 7 session persistence foundation:

- Added `src/sessions/` with session ids, JSON save/load helpers, session directory resolution, config snapshots without API keys, summaries, and best-effort git repository metadata.
- Interactive `orx chat` now creates a session record and persists active config, messages, latest OpenRouter metadata, cwd, and git metadata under `~/.orx/sessions/`.
- Session directories/files are written with private `0700`/`0600` modes, and credential userinfo is redacted from persisted git remote URLs.
- Chat refreshes best-effort git metadata when saving after turns and slash commands.
- `ORX_SESSION_DIR` can override the session directory, including relative paths resolved from cwd, which keeps tests isolated from the real home directory.
- Chat header and interactive `/status` now show the active session id/path.
- `/new` rotates to a fresh session file while keeping the current process alive.
- Added no-network tests for session id safety, directory resolution, save/load without API key leakage, record updates, git metadata, chat persistence, and CLI chat session-directory override.
- `npm run typecheck` and `npm test` pass with 89 tests.

Implemented and verified the Phase 6 session diff state and `/diff` slice:

- Added lightweight in-process `SessionDiffState` tracking under `src/agent/`.
- `runAgentTurn` can now update session diff state from successful edit-capable tool outputs that report `changedFiles`, including `apply_patch` and future compatible native edit tools.
- Model-requested `git_diff` and chat `/diff` update the latest diff snapshot metadata without leaking diff text into `/status`.
- Added chat `/diff [path...]`, backed by the native `git_diff` tool, with untracked new-file diffs and a concise `No working tree changes.` clean-tree message.
- Interactive `/status` now includes one concise `diff_state` line when chat provides session diff state.
- Added no-network tests for generic edit-capable diff state, `apply_patch` runtime state updates, slash `/diff` dirty/clean behavior, `/status` diff state, and chat-level `/diff` without OpenRouter calls.
- `npm run typecheck` and `npm test` pass with 81 tests.

Implemented and verified the Phase 6 runtime context-management slice:

- Added `src/agent/context.ts` for UTF-8 byte/message estimates, default context budgets, and deterministic local compaction.
- `runAgentTurn` now bounds messages before each OpenRouter request, including tool-loop iterations.
- Chat uses the shared context budget for in-process history shaping.
- Added `/compact` to apply local extractive in-memory compaction without persistent session storage.
- `/status` now includes concise context state with message count, approximate bytes, budget, and compaction presence.
- Local compaction inserts an assistant-role summary with provenance: `ORX compacted prior context locally`.
- Recent user turns, assistant tool calls, and tool results are preserved as a contiguous suffix for immediate continuity.
- Added no-network tests for byte estimates, compaction boundaries, runtime request shaping, chat history bounding, `/compact`, and `/status`.
- `npm run typecheck` and `npm test` pass with 69 tests.

Implemented and verified the Phase 6 active local-tool interruption slice:

- Threaded `AbortSignal` from `runAgentTurn` into native tool dispatch.
- `shellTool` now passes abort signals into `runProcess`.
- `runProcess` now handles already-aborted signals before spawning and aborts active child processes with process-group termination on POSIX plus a SIGKILL fallback.
- Aborted shell/process execution returns a bounded `ok: false` tool error with code `ABORTED`.
- `runAgentTurn` stops after delivering an aborted tool result instead of starting another OpenRouter request with an aborted signal.
- Added no-network tests for abort-before-spawn, abort-during-shell execution, runtime signal threading into active shell tools, timeout cleanup of descendants, SIGKILL fallback for descendants that ignore SIGTERM, and one-shot process exit behavior.
- `npm run typecheck`, `npm run build`, `npm test`, `git diff --check`, targeted tools tests, and `npm run dev -- status` pass. The full test suite now has 57 tests.
- Separate verifier session found process-tree timeout/fallback issues; these were fixed and the final verifier pass reported no findings. Windows `taskkill` tree termination was reviewed statically on macOS.

Implemented and verified the Phase 6 visible native tool summary slice:

- Added reusable tool event formatting in `src/agent/tool-summaries.ts`.
- `orx ask` and `orx chat` now print compact tool-call start summaries with tool name and bounded arguments.
- Tool results now print success/failure, duration, result truncation when applicable, shell exit/truncation details, `git_diff` diff size/truncation metadata, and `apply_patch` changed files.
- The model-facing tool result envelope remains compatible; dispatch now separately exposes raw native tool output for UI-only summaries.
- Added no-network tests for compact patch argument summaries, changed-file summaries, git diff truncation summaries without diff leakage, and ask/chat visible tool summary output.
- `npm run typecheck`, `npm run build`, `npm test`, `git diff --check`, and `npm run dev -- status` pass. The full test suite now has 51 tests.
- Separate verifier session reviewed the uncommitted diff and the follow-up test additions; no findings were reported.

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

Continue Phase 10 research work:

- Run an independent verifier on Slice 2, then have the main agent commit and push after review.
- Next implementation slice should likely add explicit web search or browser/research tooling on top of the evidence ledger.
- Keep research acquisition operator-controlled until a policy for model-autonomous research tools is designed.
- Preserve the trust boundary: fetched/search/browser/provider content and citation metadata are untrusted and cannot authorize tool use, permission changes, MCP/profile/plugin enablement, hooks, bins, command execution, policy changes, or instruction priority changes.
- Keep OpenRouter API as the normal inference path.

Do not implement orchestration before MCP policy basics and session metadata for delegates exist.

## Active Constraints

- Keep ORX OpenRouter-native.
- Keep default ORX permissions unrestricted.
- Keep UI inspired by professional terminal coding agents without copying Codex branding or proprietary assets.
- Keep memory files concise and indexed.
- Commit and push only after the current implementation step has passed independent verification.
- Treat plugins and MCP servers as explicit opt-in surfaces with visible risk metadata, even while native ORX local execution remains YOLO-style.
