# Tooling And Permissions

Last updated: 2026-06-30

## Default Permission Policy

ORX is intended to default to unrestricted execution:

```toml
approval_policy = "never"
sandbox_mode = "danger-full-access"
```

The CLI should not ask for permission before running local shell commands, editing files, searching, or using network-enabled tools. This is deliberate for personal use.

## Visibility Requirement

Even though prompts are bypassed, `/status` must show:

- permission mode
- current working directory
- whether shell access is enabled
- whether network tools are enabled
- whether destructive command warnings are enabled

`orx doctor` is the top-level operator readiness summary. It may read local ORX config/state and may render either human text or `--json`, but it must not call OpenRouter, remote MCP endpoints, plugin bins, or plugin hooks. It should point operators to deeper status surfaces rather than becoming a hidden execution path.

`orx config set` is a local configuration editor for non-secret setup fields. It must not call network/subprocesses and must refuse API-key or secret-like values in CLI arguments; keys belong in `OPENROUTER_API_KEY` or deliberate manual config editing.

TTY prompt history is local operator state, not model context. It stores sanitized user prompts only, skips slash commands and secret-like input, defaults to `~/.orx/history.json`, supports `ORX_CHAT_HISTORY_PATH` for isolated runs, uses private `0700`/`0600` modes, and refuses nested symlink parent paths. `orx history` and `/history` may inspect/search/clear that file without API keys, network calls, subprocesses, transcript indexing, or model exposure.

## Initial Tool Set

| Tool | Purpose |
| --- | --- |
| `read_file` | Read text files with truncation controls |
| `list_files` | List directory contents |
| `search_files` | Search with `rg` when available |
| `shell` | Run shell commands |
| `git_diff` | Show working tree changes |
| `apply_patch` | Apply structured file edits |

## Patch Policy

- Prefer structured patches over blind rewrites.
- Show changed files in the TUI after edits.
- Keep a session-level diff summary for `/diff`.
- Structured patches are preflighted before writes so malformed patch plans do not partially mutate files.
- Unified patches use `git apply --check` before `git apply`.

## Shell Policy

- Use a PTY when interactive output matters.
- Use plain execution for deterministic commands.
- Capture exit code, stdout, stderr, duration, and cwd.
- Truncate very large output before returning it to the model.
- Preserve UTF-8 byte bounds when truncating output.
- Honor active `AbortSignal` cancellation for shell/process execution and return a bounded `ABORTED` tool error instead of leaking uncaught errors.

## Current Native Tool Modules

Implemented under `src/tools/`:

- `read_file`
- `list_files`
- `search_files`
- `shell`
- `git_diff`
- `apply_patch`

The tools remain standalone and testable. Phase 6 now exposes them to models through `src/agent/` with OpenRouter-compatible schemas, argument sanitation, and bounded JSON result envelopes.

Implemented under `src/testing/`:

- package-script test target discovery for safe `test*` scripts
- inferred Node/Vitest/Jest/Playwright/unknown framework metadata and simple reporter hints for package-script targets
- direct Node test file fallback when no `test` package script exists
- compact parsed report counts from direct Node JUnit, whole-object Jest/Vitest/Playwright JSON already emitted to stdout/stderr, and common Node/Vitest/Jest/Playwright summary output
- explicit operator commands `orx tests list|run` and `/tests list|run`
- model-visible native tool `run_tests`

The test adapter is available to the operator and model loop. Runs use the shared process runner with shell disabled, bounded output, timeout coverage, and sanitized extra arguments. Report parsing reads only the private direct Node JUnit temp report and already-captured sanitized stdout/stderr, then stores numeric summary fields. `/status` and `orx status` show discovered target counts, framework counts, and the default target.

Implemented under `src/code-map/`:

- bounded local tree scanning for repository overview
- generated/vendor directory skips for `.git`, `.orx`, `node_modules`, `dist`, `build`, `coverage`, and similar caches
- language, key-file, package/config/source entrypoint, and JavaScript/TypeScript import/export summaries
- exported-symbol indexes with file paths and line numbers
- bounded JavaScript/TypeScript code-reference indexes that skip comments, strings, and template literals
- local JavaScript/TypeScript import-edge graphs with static import, re-export, require, dynamic import, relative resolution, and visible per-file cap omissions where possible
- conservative lexical JavaScript/TypeScript call graphs that infer local callable definitions and direct local call edges without AST precision, marking duplicate callee names ambiguous
- optional ast-grep syntax-aware search/codemod previews through an installed local `sg` or `ast-grep` binary, with shell disabled, cleaned env, cwd-confined path guards, bounded/redacted output, and no mutation flags
- optional tree-sitter AST parse and outline previews through an installed local `tree-sitter` binary and local grammars, with shell disabled, cleaned env, cwd-confined file guards, bounded/redacted output, source-range name extraction for outlines when possible, and no mutation flags
- explicit operator commands `orx code map`, `orx map`, `orx code-map`, `orx code symbols`, `orx symbols`, `orx code refs`, `orx refs`, `orx code imports`, `orx imports`, `orx code calls`, `orx calls`, `orx call-graph`, `orx code ast-grep`, `orx ast-grep`, `orx code tree-sitter`, `orx code outline`, `orx tree-sitter`, `orx outline`, `/map`, `/code map`, `/code symbols`, `/symbols`, `/code refs`, `/refs`, `/code imports`, `/imports`, `/code calls`, `/calls`, `/call-graph`, `/code ast-grep`, `/ast-grep`, `/code tree-sitter`, `/code outline`, `/tree-sitter`, and `/outline`

The code-map adapter is local-only, no-key, and not model-autonomous. It reads bounded local file metadata/content, redacts secret-like rendered paths, symbols, references, and call graph fields, skips symlinks, and reports omissions/truncation instead of following unbounded trees. The ast-grep and tree-sitter adapters are also explicit/operator-only: ORX never installs ast-grep, tree-sitter, or parser grammars, never calls network, never exposes these surfaces as model tools, and never mutates files; missing local binaries return setup guidance and a nonzero CLI exit while lexical code intelligence remains available.

Implemented under `src/security/`:

- scanner profile catalog for Semgrep, Snyk, Socket, OSV-Scanner, CodeQL, and Trivy
- explicit operator commands `orx scanners list`, `orx scanners inspect <profile>`, `orx scanners run semgrep <path> --config <local-config-path> [--json]`, `orx scan semgrep ...`, `/scanners ...`, and `/scan ...`
- runnable Semgrep adapter only when a local `semgrep` binary is already installed and an explicit local config file under cwd is provided

The scanner adapter is local-only, no-key, and not model-autonomous. ORX never installs Semgrep, never uses Semgrep registry/URL configs, never forwards ORX/OpenRouter/Brave/API token-like env values, and never exposes scanners as model tools. Semgrep runs use shell-disabled process execution, `--metrics off`, cwd-confined target/config path guards with symlink realpath checks, dash-prefixed operand rejection, secret/control-character argument rejection, and bounded/redacted stdout/stderr. Snyk, Socket, OSV-Scanner, CodeQL, and Trivy remain catalog/readiness-only until a no-network/no-auth local command shape is proven.

Implemented under `src/diagnostics/`:

- diagnostics profile catalog for TypeScript, TypeScript Language Server, Pyright, rust-analyzer, gopls, clangd, and SCIP TypeScript
- explicit operator commands `orx diagnostics list`, `orx diagnostics inspect <profile>`, `orx diagnostics run <typescript|pyright> [--project <local-project-path>] [--json]`, `orx diag run ...`, `/diagnostics ...`, and `/diag ...`
- runnable TypeScript adapter only when an already-installed local or PATH `tsc` binary is available
- runnable Pyright adapter only when an already-installed local or PATH `pyright` binary is available

The diagnostics adapter is local-only, no-key, and not model-autonomous. ORX never installs TypeScript, Pyright, or Python packages, never invokes package managers or launchers, never forwards ORX/OpenRouter/Brave/API token-like env values, and never exposes diagnostics as model tools. TypeScript runs use shell-disabled process execution, `tsc --noEmit --pretty false --project <tsconfig>`, cwd-confined project-file guards with symlink realpath checks, URL/registry/package/dash/control/secret-like argument rejection, bounded/redacted stdout/stderr, parsed TypeScript diagnostic summaries, and optional ORX-owned JSON metadata. Pyright runs use the same process/env guards with `pyright --outputjson --project <project-file-or-directory>`, a cwd-confined file-or-directory project target defaulting to `.`, parsed `generalDiagnostics`, and optional ORX-owned JSON metadata. TypeScript Language Server, rust-analyzer, gopls, clangd, and SCIP TypeScript remain catalog/readiness-only until a no-network/no-auth local command shape is proven.

## MCP And Third-Party Tool Policy

- Keep core local coding tools native: file reads, file writes, search, shell, patches, and local git.
- Use MCP for external systems, vendor SaaS, live provider metadata, docs lookup, and optional browser/debug integrations.
- MCP servers should be explicit config, not automatic defaults, even though ORX's local runtime defaults to unrestricted execution.
- Plugins should also be explicit install/enable surfaces. Installing a plugin should not automatically enable its hooks, MCP servers, binaries, or write-capable commands.
- Prefer official or first-party MCP servers over community wrappers.
- Pin local MCP packages, plugin sources, or container images when practical.
- Show MCP/plugin risk metadata in `/status`: server/plugin name, transport, source URL/package, version pin, resolved commit/digest, tool count, auth source, write-enabled flag, enabled hooks/bins, and last tool-schema change when known.
- Use profiles to separate read-only, browser, docs, database, cloud-readonly, and cloud-write tool sets.
- Treat all fetched web, issue tracker, database, browser, MCP output, MCP schemas, plugin skills, plugin rules, plugin docs, and plugin prompt commands as untrusted model context.
- Block or warn on MCP/plugin tools that can expose secrets, execute arbitrary commands, mutate production data, or access broad cloud credentials.
- Store MCP schema hashes and hook definition hashes. Changed schemas or hooks require visible status before use.
- Keep secrets out of model context, plugin files, logs, transcripts, and crash reports. Forward only declared env vars to child processes.
- Prefer containerized MCP/plugin execution through Docker MCP Toolkit or ToolHive-style isolation for untrusted executable surfaces.
- Add local audit logs for plugin install/enable, MCP startup, tool calls, hook runs, schema changes, and secret names used.

Current Phase 8 scaffold:

- `src/mcp/registry.ts` defines an explicit disabled `openrouter` profile for the official remote HTTP server.
- `src/mcp/policy.ts` exposes status counts for active profiles, active servers, auth-bearing servers, write-enabled tools, policy-allowed tools, policy-denied tools, configured default-denied tools, configured billable tools, configured risky tools, explicit tool grants, stale tool grants, and risky transports.
- The declared-tool policy evaluator is pure and independent of live discovery. Read-only declared tools on enabled, trusted profiles with no pending schema change can be marked `allowed` for future use.
- Billable, write, and destructive declared tools are `denied` by default unless an explicit per-tool grant exists for the current trusted profile hash. OpenRouter `chat-send` is billable and denied by default.
- Disabled profiles block tools with `blocked_by_profile`; profiles without trusted baselines block with `blocked_by_trust`; pending schema changes block with `blocked_by_schema_change`.
- `src/mcp/config.ts` stores explicit MCP tool grants in the private profile config as profile id, tool name, profile hash, risk, billable flag, and granted timestamp only. Stale grant hashes are visible but denied.
- `src/mcp/discovery.ts` exposes gated manual discovery for enabled/trusted remote HTTP profiles without listing or executing tools.
- `/mcp`, `/mcp inspect`, `/mcp tools`, `/mcp call`, `/mcp remote-tools`, `/mcp import-remote-tools`, `/mcp discover`, `/mcp allow-tool`, `/mcp revoke-tool`, `/mcp allow-model-tool`, `/mcp revoke-model-tool`, `orx mcp ...`, and `/status` show or mutate profile state, risk metadata, OAuth/auth-required status, billable/default-denied/risky tool visibility, per-tool policy decisions, explicit grant state, model grant state, remote `tools/list` hashes/summaries, reviewed local user-catalog declarations, explicit `tools/call` output, and pending schema-change gates.
- MCP `tools/call` is executable by explicit operator command and, when `/mcp model enable` is set in an interactive chat or `orx ask --mcp-tools` is passed for one noninteractive request, by the ORX-owned `mcp_call` native model tool for read-only non-billable declared MCP tools with active model-tool grants only. Calls require enabled/trusted/unchanged profiles, an `allowed` declared-tool policy decision, env bearer auth or explicit `ORX_MCP_KEYCHAIN=1` macOS Keychain opt-in for auth-bearing profiles/tools, guarded DNS-vetted transport, redacted/truncated untrusted output, and audit logging without raw arguments or raw output. Model-visible `mcp_call` text results are wrapped with explicit untrusted-output markers and policy reminders before they are returned to the model loop. Direct OpenRouter API helpers still power models, credits, generation metadata, and normal chat/ask inference.

Current Phase 9 plugin scaffold:

- `src/plugins/` validates and sanitizes ORX plugin manifests before storing them.
- Plugin registry/cache state is ORX-owned operator state outside repositories, defaulting to `~/.orx/plugins/registry.json` and `~/.orx/plugins/cache` with `ORX_PLUGIN_REGISTRY_PATH` / `ORX_PLUGIN_CACHE_DIR` for tests and isolated runs.
- Optional local plugin catalog metadata is read from `~/.orx/plugins/catalog.json` or `ORX_PLUGIN_CATALOG_PATH`; catalog entries are sanitized, local-only, and can resolve `orx plugins install <catalog-id>` / `/plugins install <catalog-id>` to a manifest path without network access.
- Registering a local manifest snapshots the sanitized manifest plus declared component paths and declared hook cwd directories into the ORX-owned cache before writing the registry record; unknown manifest fields and unreferenced local files are not copied.
- Registering a local manifest computes a stable plugin id, manifest hash, lock-style integrity record, install time, source metadata, cached manifest path, original manifest path provenance, and bounded component hashes from the cached snapshot when files/directories are available.
- Optional plugin manifest `metadata` fields for homepage, docs, license, trust tier, auth, privacy, and runtime requirements are sanitized and rendered as inert risk/requirements context in `/plugins inspect`; they do not grant permissions or enable executable surfaces.
- Enabled plugins can declare MCP presets through cached `components.mcpServers` JSON. ORX namespaces these profiles as `plugin:<plugin-id>:<server-id>`, includes plugin manifest/component hashes in the MCP profile hash, and shows them through `/mcp list`, `/mcp inspect`, `/mcp tools`, `/mcp call`, `/mcp remote-tools`, `/mcp enable`, `/mcp discover`, and `/status`. `/mcp discover` may contact enabled, trusted, unchanged plugin `remote-http` endpoints only through the guarded DNS-vetted transport and only for a minimal initialize handshake. `/mcp remote-tools` may call `tools/list` through the same gates, but renders only bounded untrusted metadata and hashes. `/mcp import-remote-tools` is limited to local `user:` catalog profiles and stores only sanitized reviewed names as read-only/free declarations; plugin and built-in profiles remain immutable through this path. `/mcp call` and `orx mcp call` may execute declared plugin MCP tools only through explicit operator commands and the same policy/auth/audit gates. `/mcp allow-model-tool` / `orx mcp allow-model-tool` persist active model grants for read-only non-billable plugin MCP tools, and `/mcp model enable` or `orx ask --mcp-tools` can expose only those model-granted tools through `mcp_call`; billable/write/destructive model-loop plugin MCP tools remain inactive.
- Enabled plugins can declare hook definitions through cached `components.hooks` JSON. ORX namespaces hooks as `plugin:<plugin-id>:<hook-id>`, computes hook hashes from sanitized declarations plus plugin provenance, stores trusted hook hashes in private operator state at `~/.orx/plugins/hooks.json` or `ORX_PLUGIN_HOOKS_CONFIG_PATH`, and shows discovered/trusted/pending counts in `/status`.
- Trusted current hook hashes can run through explicit `orx hooks run <id>` / `/hooks run <id>` and through matching automatic lifecycle events: `session_start`, `user_prompt_submit`, `pre_tool_use`, `post_tool_use`, `pre_compact`, `post_compact`, and `stop`. Hook runs use the cached plugin root plus optional safe relative cwd, disable inherited env, forward only declared env names, apply timeout/output caps, redact forwarded env values in rendered/audited output, and append JSONL audit events under `~/.orx/audit/hooks.jsonl` or `ORX_PLUGIN_HOOKS_AUDIT_PATH`. A hook command that succeeds but cannot persist its audit event is treated as a failed run.
- Git source manifests must include a pinned `resolvedCommit`; floating refs can be recorded as context but cannot be the lock pin.
- Manifest and loaded registry display fields reject secret-like values and terminal control characters before they can be stored or rendered.
- Registering stores plugins disabled by default. `/plugins enable` and `/plugins disable` persist only an inert enabled flag.
- Enabled plugins can contribute Agent Skills metadata, markdown prompt-command metadata, and markdown rule metadata only. Skill discovery is bounded to `components.skills` root `SKILL.md` files and immediate child `SKILL.md` files; prompt discovery is bounded to immediate `.md` files under `components.commands`; rule discovery is bounded to immediate `.md` files under `components.rules`. Prompt command and rule names/descriptions come only from explicit frontmatter or filenames, never markdown body text. Unsafe/oversized metadata is omitted, and compact metadata is exposed through `/skills list`, `/prompts list`, `/rules list`, `/status`, and ephemeral model context.
- Skill discovery requires a safe absolute cached manifest path in the ORX-owned registry record and fails closed for malformed registry state.
- Full `SKILL.md` content is loaded only through explicit `/skills activate <id>`, rejects secret-like values and terminal control characters before model/session use, then stores safe content as an untrusted system message and records provenance in session metadata.
- Full prompt-command markdown is loaded only through explicit `/prompts activate <id>`, rejects secret-like values and terminal control characters before model/session use, then stores safe content as an untrusted system message and records provenance in session metadata.
- Full rule markdown is loaded only through explicit `/rules activate <id>`, rejects secret-like values and terminal control characters before model/session use, then stores safe content as an untrusted system message and records provenance in session metadata.
- Activated skill, prompt, and rule context is pruned from chat messages and session provenance when the backing plugin component is no longer enabled.
- Skill, prompt, or rule content and metadata cannot authorize tool use, permission changes, MCP enablement, hooks, bins, executable plugin commands, or command execution.
- Bins require trusted current hashes before execution, including when run through `/plugin:<plugin-id>:bin:<file>` aliases or schema-backed `/plugin:<plugin-id>:exec:<slug>` aliases. Derived prompt aliases only activate untrusted prompt context. Manifest-defined executable plugin command schemas provide bounded alias metadata and `maxArgs` checks only; they reuse the referenced bin's trust hash and runtime. Plugin-declared MCP tools require separate MCP profile enablement/trust and explicit `/mcp call`, `orx mcp call`, or read-only model grants plus `/mcp model enable` / `orx ask --mcp-tools` before model-visible execution.
- `/plugins inspect`, `/skills`, `/prompts`, `/rules`, `/hooks`, `/bins`, `/plugin list`, and `/status` show this trust boundary explicitly; enabled hook/bin/exec counts reflect trusted current hashes or bin-backed alias state.

Current Phase 10 research scaffold:

- `src/research/` exposes slash-only direct URL fetch/extract helpers and evidence ledger metadata.
- `/web fetch <url>` and `/fetch <url>` are explicit operator commands; there is no model-autonomous `fetch_url` tool yet.
- `/web search <query>` and `/search <query>` are explicit operator commands backed by Brave Web Search when `BRAVE_SEARCH_API_KEY` is configured; there is still no model-autonomous web-search tool.
- `/web browse <url>` and `/browse <url>` are explicit operator commands for browser evidence snapshots; there is still no model-autonomous browser tool.
- Search requests are bounded to Brave's documented query limits before network dispatch, and the CLI passes the key/fetch transport through the normal `runCli(argv, env, io)` boundary for testability.
- Search result URLs go through the same public URL guard; local/private/reserved/metadata-style URLs are skipped before they enter evidence state or chat context.
- Search results are stored as secondary `brave-search-snippet` evidence with sanitized provider title/snippet metadata and stable hashes. `/cite` and `/bibliography` mark them as provider snippets, not fetched primary-page evidence.
- Browser snapshots use `kind=browser` and `provider=playwright-browser-snapshot` evidence metadata, persist with sessions, and appear in `/sources`, `/cite`, and `/bibliography`.
- The default browser path dynamically imports Playwright when available but does not let Chromium resolve/connect to remote URLs in the foundation slice. ORX first fetches the target document with a DNS-bound Node transport, guards redirects/final URLs, loads the bounded document into a browser context with JavaScript disabled, aborts all browser-routed network requests, and hashes only bounded HTML/text inputs.
- Production web fetch uses ORX's Node-native guarded transport, not the generic OpenRouter metadata `fetch` hook. Tests can inject a separate `webFetch` transport.
- The transport resolves DNS before connecting, rejects any local/private/shared/reserved/documentation/multicast or metadata resolved address, then binds the request to a vetted address while preserving the original hostname for host/SNI/certificate validation.
- Fetch uses timeout coverage across DNS/request/header/body-read phases, byte/text bounds, guarded redirects, sanitized errors, terminal-control stripping before rendering/context insertion, canonical URL redaction for secret-like path/query data, and stable SHA-256 content/text hashes.
- URL guard defaults allow only `http`/`https` and block localhost, loopback, private IPv4, link-local, shared/reserved/documentation/multicast IPv4, IPv6 loopback/link-local/unique-local/multicast, IPv4-mapped local IPv6, obvious cloud metadata hosts/IPs, and embedded credentials before network.
- Fetched content, search snippets, and browser output are always marked untrusted in chat context and cannot authorize tool use, permission changes, MCP/profile/plugin enablement, hooks, bins, command execution, policy changes, or instruction priority changes.
- `/sources` renders source ids, URLs, titles, fetchedAt, hashes, trust tier, and provider, not full page text.
- `/cite <source-id>` and `/bibliography` render deterministic citation text from `EvidenceSource` metadata only. They include source hashes/provenance/trust-boundary text, sort bibliography entries stably, sanitize terminal/ANSI/OSC sequences in rendered fields, rely on redacted canonical URLs, omit invalid canonical URLs, and never dump fetched page text or perform network calls.

Current orchestration/delegation boundary:

- `src/delegation/` stores session-local metadata for an optional OpenRouter controller and named OpenRouter delegates, private saved disabled team snapshots, explicit execution policy, and hash-only delegation audit metadata.
- `/orchestrator`, `/delegate`, and `/delegates` mutate or render only local session metadata. They do not call OpenRouter while handling the slash commands themselves, spawn subprocess agents, contact Codex/Devin, or expose a `delegate_task` tool unless the delegation policy is explicitly enabled and a delegate is configured for the chat turn.
- `/orchestrator plan`, `/delegate plan`, and `/delegates plan` render readiness blockers only and do not mutate session metadata.
- `orx orchestrator`, `orx delegate`, and `orx delegates` are noninteractive no-key/session-less parity commands. They render delegation status/readiness without an API key; `orx delegates plan <saved-team-id>` and `orx delegate plan <saved-team-id>` preview a saved team against the current policy without loading it; live-session mutating forms validate arguments and refuse because there is no active chat session to mutate.
- Delegation execution policy storage is private local operator state at `~/.orx/delegation/policy.json` or `ORX_DELEGATION_POLICY_PATH`. It writes `0600` files under private default directories, refuses symlink paths, stores execution enablement plus bounded numeric limits and fixed policy strings, and never stores API keys, credentials, prompts, or delegate outputs.
- `orx delegates policy`, `orx delegate policy`, `/delegates policy`, and `/delegate policy` render and update the policy. `policy set` can tune max task cost, timeout, result bytes, max concurrent delegates, explicit `--execution enabled|disabled`, and `--result-merge manual_summary|metadata_only`; credential forwarding remains `none` and result persistence remains `none`.
- The internal `delegate_task` runtime contract now has a policy-gated OpenRouter adapter. Normal `ask` does not expose its schema. Interactive chat exposes it only when policy execution is enabled and the chat session has at least one delegate. Live dispatch validates safe bounded args, rejects provider-token/bearer/assignment-shaped secret-like live payloads before network, streams one OpenRouter delegate call, returns explicitly wrapped untrusted output with begin/end markers and structured `untrustedOutputPolicy` for `manual_summary`, omits delegate text from model-facing tool output for `metadata_only`, records hash-only audit metadata at `~/.orx/audit/delegation.jsonl` or `ORX_DELEGATION_AUDIT_PATH`, and never stores raw prompts, raw context, expected output text, API keys, or raw delegate output in audit.
- Delegate timeout and result-byte limits are enforced directly. Cost is checked from observed OpenRouter generation metadata after the call; result envelopes and audit metadata expose effective cap, observed cost, and over-limit status when available, while terminal tool summaries show observed cost plus cost-limit status.
- `/status` and `orx status` show `delegation_audit_path`, `delegate_task_runtime: policy_enforced_disabled` or `policy_gated_openrouter_adapter`, `delegate_task_model_exposure`, and `delegate_task_adapter: openrouter_available`.
- Saved delegation team storage is private local operator state at `~/.orx/delegation/teams.json` or `ORX_DELEGATION_TEAMS_PATH`. It is bounded to sanitized disabled controller/delegate metadata plus timestamps/optional display metadata, writes `0600` files under private default directories, refuses symlink registry paths, and never stores API keys or delegate outputs.
- `orx delegates teams|save|inspect|use|delete`, `orx delegates plan <saved-team-id>`, `orx delegate plan <saved-team-id>`, `orx delegate team ...`, `/delegates teams|save|inspect|use|delete`, and `/delegate team ...` manage or preview saved disabled teams. Noninteractive CLI save requires explicit safe `--controller` / `--delegate` args; CLI `plan` and `use` are read-only/sessionless, while slash `use` loads the saved disabled metadata into the current chat session.
- Delegation state is sanitized before storage/rendering: delegate names and models reject control characters and secret-like values, persisted delegates are sorted/deduped, at most 16 delegates are stored, and execution is always forced disabled.
- Session JSON persists delegation metadata for `/resume`; API keys are still excluded.
- Interactive `/status` shows orchestration controller, current policy-driven execution state, delegate count, saved delegation team count, delegation policy path/limits, and `delegate_task` exposure state.
- `/clear` preserves orchestration/delegate metadata; only `/orchestrator clear`, `/delegate remove <name>`, and `/delegate clear` intentionally remove that state.
- Delegation readiness output must continue to render from both policy and session delegate state: before readiness, it shows concrete blockers; after policy is enabled and a delegate exists in chat, it shows `delegate_task: available_in_chat` and `readiness_blockers: none`.
