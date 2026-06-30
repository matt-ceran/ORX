# Architecture

Last updated: 2026-06-30

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
src/code-map/              bounded local repository overview, symbols, references, imports, call graphs, and ast-grep adapter
src/diagnostics/           local diagnostics profiles and compiler/LSP/SCIP readiness
src/slash/                 slash command registry and handlers
src/terminal/              ANSI style helpers and deterministic ASCII meters
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

`src/terminal/` owns small internal render helpers for TTY-only ANSI styling and deterministic ASCII meters. Domain-specific meters label their source explicitly: local approximate context bytes, OpenRouter metadata cost coverage, and live OpenRouter credits.

`src/tools/` currently owns standalone native local coding tools for file reads, directory listing, file search, test runs, shell execution, git diff, patch application, shared truncation, and process execution. Phase 6 now exposes these tools to models through `src/agent/`.

`src/testing/` owns test target discovery and execution. It discovers safe package `test*` scripts, infers Node/Vitest/Jest/Playwright/unknown framework metadata and simple reporter hints from sanitized package script commands, falls back to direct Node test files when no `test` package script exists, parses direct Node JUnit reports, private temporary Jest/Vitest/Playwright JSON report files for package scripts that already declare append-safe JSON reporters or exact final default framework runner invocations, changed cwd-confined JSON report output files already declared by package scripts or per-run args, whole-object framework JSON already emitted to stdout/stderr, and common Node/Vitest/Jest/Playwright report summary lines into compact numeric counts, renders `orx tests` / `/tests` output, and reuses the shared process runner with bounded output and argument sanitation. Wrapper commands, non-JSON/custom reporters, config-only report outputs, and unsafe multi-step package-script shapes stay on stdout/stderr fallback. It is available through explicit operator commands and through the model-visible native `run_tests` tool.

`src/code-map/` owns operator-invoked local code-map, symbol-index, reference-index, import-graph, call-graph, ast-grep, and tree-sitter rendering. It scans a bounded local tree, skips generated/vendor directories, summarizes languages, key files, package/config/source entrypoints, top JavaScript/TypeScript imports/exports, exported symbols with file paths and line numbers, code-reference matches, local import edges with relative import resolution where possible, and conservative lexical JavaScript/TypeScript callable definitions plus local call edges. It redacts secret-like rendered paths, symbols, excerpts, call graph fields, ast-grep output, and tree-sitter output. It is exposed through `orx code map`, `orx map`, `orx code-map`, `orx code symbols`, `orx symbols`, `orx code refs`, `orx refs`, `orx code imports`, `orx imports`, `orx code calls`, `orx calls`, `orx call-graph`, `orx code ast-grep`, `orx ast-grep`, `orx code tree-sitter`, `orx code outline`, `orx tree-sitter`, `orx outline`, `/map`, `/code map`, `/code symbols`, `/symbols`, `/code refs`, `/refs`, `/code imports`, `/imports`, `/code calls`, `/calls`, `/call-graph`, `/code ast-grep`, `/ast-grep`, `/code tree-sitter`, `/code outline`, `/tree-sitter`, and `/outline` without requiring an OpenRouter API key. The dependency-free call graph is lexical, not AST-backed, and marks duplicate callee names ambiguous instead of claiming exact resolution. The ast-grep adapter is optional and operator-invoked: it runs an installed local `sg`/`ast-grep` binary with shell disabled, cleaned env, cwd-confined path guards, bounded output, no network/install behavior, and no mutation; rewrite is preview-only. The tree-sitter adapter is also optional and operator-invoked: it runs an installed local `tree-sitter parse <file>` with shell disabled, cleaned env, cwd-confined regular-file guards, bounded/redacted output, no network/install behavior, and no mutation; parse, outline, single-file import extraction, single-file refs matching, and single-file call extraction modes all use that same guarded parse path.

`src/security/` owns operator-invoked local scanner profiles. The current runnable adapter is Semgrep through `orx scanners run semgrep <path> --config <local-config-path> [--json]`, `orx scan semgrep ...`, `/scanners run semgrep ...`, and `/scan semgrep ...`. It requires an installed local `semgrep` binary and a config file under the current working directory, rejects registry configs/URLs/dash-prefixed operands/symlink escapes/control characters/secret-like arguments before spawning, runs with shell disabled and a minimal no-token env, bounds and redacts output, and is not exposed as a model tool. Snyk, Socket, OSV-Scanner, CodeQL, and Trivy are catalog/readiness profiles only.

`src/diagnostics/` owns operator-invoked local diagnostics profiles. The current runnable adapters are TypeScript through `orx diagnostics run typescript [--project <local-tsconfig-path>] [--json]` and Pyright through `orx diagnostics run pyright [--project <local-project-path>] [--json]`, with matching `orx diag ...`, `/diagnostics ...`, and `/diag ...` surfaces. They prefer project-local `node_modules/.bin/tsc` or `node_modules/.bin/pyright`, can fall back to `PATH` binaries, validate that project targets and symlink realpaths stay under the current working directory, reject URL/registry/package/dash/control/secret-like arguments before spawning, run with shell disabled and a minimal no-token env, bound/redact output, parse TypeScript text diagnostics or Pyright `--outputjson` `generalDiagnostics`, and are not exposed as model tools. TypeScript Language Server, rust-analyzer, gopls, clangd, and SCIP TypeScript are catalog/readiness profiles only.

`src/agent/` now owns OpenRouter-compatible native tool schemas, native tool dispatch, bounded tool-result envelopes, and the guarded multi-turn tool-call loop used by `orx ask` and `orx chat`.

`src/plugins/` now owns the inert plugin substrate plus progressive text-component loaders: sanitized ORX plugin manifests, optional display-only manifest metadata, stable plugin ids, manifest hashes, local lock-style records, local component hashes, ORX-owned install cache, local catalog metadata, private registry persistence, installed/enabled state separation, `/plugins` rendering, bounded enabled-plugin-only `SKILL.md` discovery, bounded markdown prompt/rule discovery, compact metadata rendering, plugin command alias discovery, plugin executable command-schema discovery, plugin MCP preset discovery, bin discovery/trust/manual runtime, hook discovery/trust state, trusted-hook manual runtime, automatic trusted lifecycle hook dispatch, and explicit skill/prompt/rule activation. Plugin enablement is only a persisted state marker plus metadata/preset/review eligibility; prompt aliases activate existing prompt commands as untrusted context, trusted current bins can run through explicit `bins run` / `/bins run` or namespaced `/plugin:<plugin-id>:bin:<file>` aliases, schema-backed `/plugin:<plugin-id>:exec:<slug>` aliases can only run referenced trusted current bins with bounded argument metadata, and trusted current hooks can run through explicit `hooks run` / `/hooks run` or matching lifecycle events. Plugin-declared MCP tools require separate MCP profile enablement/trust and explicit/read-only model MCP gates before execution.

`src/mcp/` now merges the built-in OpenRouter MCP profile with enabled-plugin MCP preset declarations when a plugin registry path is supplied. Plugin MCP profile ids are namespaced as `plugin:<plugin-id>:<server-id>`, include plugin manifest/component provenance in profile hashes, and flow through the existing `/mcp list`, `/mcp inspect`, `/mcp tools`, `/mcp call`, `/mcp remote-tools`, `/mcp enable`, `/mcp discover`, `/status`, and schema-change policy surfaces. `/mcp discover` and `orx mcp discover` can contact enabled, trusted, unchanged `remote-http` endpoints through ORX's guarded DNS-vetted discovery transport for a minimal initialize handshake. `/mcp remote-tools` and `orx mcp remote-tools` can call `tools/list` through the same guarded transport, render bounded untrusted metadata plus schema hashes, and audit the result. `/mcp import-remote-tools` and `orx mcp import-remote-tools` can import reviewed remote tool names into local user catalog profiles only; changed declarations create pending schema-change state until re-enabled. `/mcp call` and `orx mcp call` can execute guarded `tools/call` through explicit operator commands. Interactive `/mcp model enable` and one-shot `orx ask --mcp-tools` add one ORX-owned native model tool, `mcp_call`, limited to read-only non-billable declared MCP tools with active model-tool grants through the same profile/hash/auth/transport gates; `src/agent/tool-dispatch.ts` wraps model-visible MCP text results as explicitly untrusted remote data before returning them to the tool loop.

`src/agent/` supports ephemeral system messages for request-only context such as compact enabled plugin skill, prompt, and rule metadata. These messages are prepended to OpenRouter requests but are not returned as persisted conversation history unless the operator explicitly activates the corresponding text component.

`src/sessions/` can store activated plugin skill, prompt, and rule provenance in `activatedSkills`, `activatedPrompts`, and `activatedRules`; full activated content is represented by explicit untrusted system messages in the transcript.

`src/research/` now owns the Phase 10 direct research foundation: evidence source types, source ids, stable content/text hashes, conservative HTML/plain-text extraction, untrusted context message formatting, `/sources` rendering, deterministic metadata-only citation/bibliography formatting, a layered SSRF-style URL guard, and a Node-native DNS-vetted web fetch transport. Production fetch resolves and vets every hostname before connecting, binds the request to an allowed address, rechecks redirects, covers body reads with the same timeout, and strips terminal control characters before rendering or context insertion. `orx chat` stores evidence source metadata in session `evidenceSources`; bounded extracted text is represented by an explicit untrusted user-role context message in the transcript. `/cite <source-id>` and `/bibliography` render only source metadata, hashes, provenance, and the trust boundary; they do not render fetched text or perform network calls. Research fetch is currently reachable only through explicit operator slash commands, not model tool calls.

The next programming power-pack work should add richer code intelligence such as semantic tree-sitter-backed reference/cross-file call slices beyond the current parse/outline/single-file-import/single-file-ref/single-file-call previews, LSP/SCIP diagnostics beyond the current compiler/CLI diagnostics profiles, or broader test report integrations for non-JSON/custom reporters, config-only outputs, and wrapper commands beyond the current direct Node JUnit plus JSON-report package-script test runner, model-visible `run_tests`, dependency-free code map, exported-symbol index, reference index, import graph, lexical call graph, optional ast-grep adapter, first local scanner profile adapter, and current local diagnostics adapters.
