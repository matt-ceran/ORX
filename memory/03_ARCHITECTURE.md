# Architecture

Last updated: 2026-07-01

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

`src/testing/` owns test target discovery and execution. It discovers safe package `test*` scripts, infers Node/Vitest/Jest/Playwright/AVA/unknown framework metadata and simple reporter hints from sanitized package script commands, falls back to direct Node test files when no `test` package script exists, parses direct Node JUnit reports, private temporary Jest/Vitest/Playwright JSON report files for package scripts that already declare append-safe JSON reporters or exact final default framework runner invocations, changed cwd-confined JSON report output files already declared by package scripts, per-run args, or fixed local framework config files for exact final direct runner scripts, whole-object Jest/Vitest/Playwright/Mocha/RSpec JSON already emitted to stdout/stderr, common Node/Vitest/Jest/Playwright report summary lines, Cypress run-summary aggregate lines, AVA report summary lines for AVA-inferred targets, TAP reporter output, Mocha-style summary lines, pytest-style summary lines, Cargo/Rust `test result:` summary lines, cargo-nextest summary lines, Cucumber scenario summary lines, Behat full summary footers, Behave summary footers, testthat bracket summary lines, GoogleTest summary lines, Catch2 summary lines, Dart compact final lines, Deno-style `test result:` summary lines, ExUnit final summary lines, Gradle-style completion summary lines, JUnit Platform console summary lines, ScalaTest summary lines, TestNG summary lines, NUnit summary lines, Robot Framework summary lines, Jasmine summary lines, Go test verbose summary lines, `go test -json` event lines, RSpec summary lines, Minitest summary lines, Karma-style `TOTAL:` summary lines, Bun-style pass/fail/run summary lines, Tasty console summary lines, Zig native test summary lines, Python unittest summary lines, JUnit/Surefire-style text summary lines, whole captured JUnit XML reports, whole captured TestNG XML reports, whole captured NUnit XML reports, whole captured xUnit XML reports, whole captured TRX XML reports, TeamCity service-message output, Pest summary lines, PHPUnit-style text summary lines, `.NET test`/xUnit summary lines, CTest summary lines, Meson summary lines, Unity summary footers, LLVM lit summary lines, Bazel aggregate summary lines, and XCTest summary lines into compact numeric counts, renders `orx tests` / `/tests` output, and reuses the shared process runner with bounded output and argument sanitation. Wrapper commands, additional non-JSON/custom reporters, config-only outputs for non-direct scripts, and unsafe multi-step package-script shapes stay on stdout/stderr fallback. It is available through explicit operator commands and through the model-visible native `run_tests` tool.

`src/code-map/` owns operator-invoked local code-map, symbol-index, reference-index, import-graph, call-graph, ast-grep, and tree-sitter rendering. It scans a bounded local tree, skips generated/vendor directories, summarizes languages, key files, package/config/source entrypoints, top JavaScript/TypeScript imports/exports, exported symbols with file paths and line numbers, code-reference matches, local import edges with relative import resolution where possible, and conservative lexical JavaScript/TypeScript callable definitions plus local call edges. It redacts secret-like rendered paths, symbols, excerpts, call graph fields, ast-grep output, and tree-sitter output. It is exposed through `orx code map`, `orx map`, `orx code-map`, `orx code symbols`, `orx symbols`, `orx code refs`, `orx refs`, `orx code imports`, `orx imports`, `orx code calls`, `orx calls`, `orx call-graph`, `orx code ast-grep`, `orx ast-grep`, `orx code tree-sitter`, `orx code outline`, `orx tree-sitter`, `orx outline`, `/map`, `/code map`, `/code symbols`, `/symbols`, `/code refs`, `/refs`, `/code imports`, `/imports`, `/code calls`, `/calls`, `/call-graph`, `/code ast-grep`, `/ast-grep`, `/code tree-sitter`, `/code outline`, `/tree-sitter`, and `/outline` without requiring an OpenRouter API key. The dependency-free call graph is lexical, not AST-backed, and marks duplicate callee names ambiguous instead of claiming exact resolution. The ast-grep adapter is optional and operator-invoked: it runs an installed local `sg`/`ast-grep` binary with shell disabled, cleaned env, cwd-confined path guards, bounded output, no network/install behavior, and no mutation; rewrite is preview-only. The tree-sitter adapter is also optional and operator-invoked: it runs installed local `tree-sitter parse` calls with shell disabled, cleaned env, cwd-confined regular-file or bounded repo path guards, bounded/redacted output, no network/install behavior, and no mutation; parse, outline, bounded repo outline preview, single-file import extraction, single-file refs matching, bounded repo refs matching, single-file call extraction, bounded repo call preview, bounded repo import preview, and bounded local-relative plus safe root tsconfig/jsconfig path/baseUrl repo dependency preview modes all use guarded parse paths. Tree-sitter repo outline entries are path-aware AST definition-like previews, tree-sitter refs are exact AST identifier matches, tree-sitter calls are AST call-expression previews, tree-sitter repo imports are AST import-source previews, and tree-sitter repo deps resolve local relative AST import sources plus safe root `tsconfig.json` or `jsconfig.json` `paths`/`baseUrl` aliases against the scanned source set; these modes are not semantic symbol/reference/call, package-manager, or full dependency resolution.

`src/security/` owns operator-invoked local scanner profiles. Readiness surfaces are available through `orx scanners list|status [--json]` and `orx scanners inspect|show <profile> [--json]` plus matching slash commands. The current runnable adapters are Semgrep through `orx scanners run semgrep <path> --config <local-config-path> [--json]`, `orx scan semgrep ...`, `/scanners run semgrep ...`, and `/scan semgrep ...`, plus Trivy filesystem secret scanning through `orx scanners run trivy <path> [--json]`, `orx scan trivy ...`, `/scanners run trivy ...`, and `/scan trivy ...`. Semgrep requires an installed local `semgrep` binary and a config file under the current working directory, rejects registry configs/URLs/dash-prefixed operands/symlink escapes/control characters/secret-like arguments before spawning, and runs with `--metrics off`. Trivy requires an installed local `trivy` binary, rejects `--config`, runs only `trivy fs --scanners secret --format json --offline-scan --skip-db-update --skip-java-db-update --skip-check-update --skip-version-check --disable-telemetry --no-progress <path>`, and does not enable vulnerability, misconfiguration, license, image, or registry scanning. Both runners use shell-disabled execution, a minimal no-token env, cwd-confined symlink-aware path guards, bounded/redacted output, and no model-tool exposure. Snyk, Socket, OSV-Scanner, and CodeQL are catalog/readiness profiles only.

`src/diagnostics/` owns operator-invoked local diagnostics profiles. Readiness surfaces are available through `orx diagnostics list|status [--json]` and `orx diagnostics inspect|show <profile> [--json]` plus matching `orx diag`, `/diagnostics`, and `/diag` commands. The current runnable adapters are TypeScript through `orx diagnostics run typescript [--project <local-tsconfig-path>] [--json]`, Pyright through `orx diagnostics run pyright [--project <local-project-path>] [--json]`, ESLint through `orx diagnostics run eslint [--project <local-file-or-directory>] [--json]`, Ruff through `orx diagnostics run ruff [--project <local-file-or-directory>] [--json]`, Mypy through `orx diagnostics run mypy [--project <local-file-or-directory>] [--json]`, gopls through `orx diagnostics run gopls --project <local-go-file> [--json]`, and clangd through `orx diagnostics run clangd --project <local-c-cpp-source-or-header-file> [--json]`. They prefer project-local `node_modules/.bin/<binary>` entries, Ruff and Mypy can also use cwd virtualenv binaries before falling back to PATH, validate that project targets and symlink realpaths stay under the current working directory, reject URL/registry/package/dash/control/secret-like arguments before spawning, run with shell disabled and a minimal no-token env, bound/redact output, parse TypeScript text diagnostics, Pyright `--outputjson` `generalDiagnostics`, ESLint JSON `messages`, Ruff JSON diagnostics, Mypy text diagnostics, `gopls check` text diagnostics, or `clangd --check` stderr diagnostics, and are not exposed as model tools. The ESLint runner defaults to `.`, accepts only regular local files or directories, and runs `eslint --format json <file-or-directory>` without installs, package-manager calls, network calls, or Node package changes by command selection. The Ruff runner defaults to `.`, accepts only regular local files or directories, and runs `ruff check --output-format json --no-cache <file-or-directory>` without installs, package-manager calls, network calls, Python package changes, or cache writes by command selection. The Mypy runner defaults to `.`, accepts only regular local files or directories, and runs `mypy --no-color-output --no-error-summary --show-column-numbers --no-incremental --cache-dir <null-device> <file-or-directory>` without installs, package-manager calls, network calls, Python package changes, or `.mypy_cache` writes by command selection. The gopls runner requires a regular local `.go` file, probes PATH with `gopls version`, and pins `GOPROXY=off`, `GOSUMDB=off`, and `GOTOOLCHAIN=local` in the child env to avoid proxy/checksum/toolchain download paths by command selection. The clangd runner requires a regular local C/C++/Objective-C source or header file, probes PATH with `clangd --version`, and runs `clangd --log=error --check=<file>` to avoid LSP-server mode and default setup-log noise. TypeScript Language Server, rust-analyzer, and SCIP TypeScript are catalog/readiness profiles only.

`src/agent/` now owns OpenRouter-compatible native tool schemas, native tool dispatch, bounded tool-result envelopes, and the guarded multi-turn tool-call loop used by `orx ask` and `orx chat`.

`src/plugins/` now owns the inert plugin substrate plus progressive text-component loaders: sanitized ORX plugin manifests, optional display-only manifest metadata, stable plugin ids, manifest hashes, local lock-style records, local component hashes, ORX-owned install cache, local catalog metadata, private registry persistence, installed/enabled state separation, `/plugins` rendering, bounded enabled-plugin-only `SKILL.md` discovery, bounded markdown prompt/rule discovery, compact metadata rendering, plugin command alias discovery, plugin executable command-schema discovery, plugin MCP preset discovery, bin discovery/trust/manual runtime, hook discovery/trust state, trusted-hook manual runtime, automatic trusted lifecycle hook dispatch, and explicit skill/prompt/rule activation. Plugin enablement is only a persisted state marker plus metadata/preset/review eligibility; prompt aliases activate existing prompt commands as untrusted context, trusted current bins can run through explicit `bins run` / `/bins run` or namespaced `/plugin:<plugin-id>:bin:<file>` aliases, schema-backed `/plugin:<plugin-id>:exec:<slug>` aliases can only run referenced trusted current bins with bounded argument metadata, and trusted current hooks can run through explicit `hooks run` / `/hooks run` or matching lifecycle events. Plugin-declared MCP tools require separate MCP profile enablement/trust and explicit/read-only model MCP gates before execution.

`src/mcp/` now merges the built-in OpenRouter MCP profile with enabled-plugin MCP preset declarations when a plugin registry path is supplied. Plugin MCP profile ids are namespaced as `plugin:<plugin-id>:<server-id>`, include plugin manifest/component provenance in profile hashes, and flow through the existing `/mcp list`, `/mcp inspect`, `/mcp tools`, `/mcp call`, `/mcp remote-tools`, `/mcp enable`, `/mcp discover`, `/status`, and schema-change policy surfaces. `/mcp discover` and `orx mcp discover` can contact enabled, trusted, unchanged `remote-http` endpoints through ORX's guarded DNS-vetted discovery transport for a minimal initialize handshake. `/mcp remote-tools` and `orx mcp remote-tools` can call `tools/list` through the same guarded transport, render bounded untrusted metadata plus schema hashes, and audit the result. `/mcp import-remote-tools` and `orx mcp import-remote-tools` can import reviewed remote tool names into local user catalog profiles only; changed declarations create pending schema-change state until re-enabled. `/mcp call` and `orx mcp call` can execute guarded `tools/call` through explicit operator commands. Interactive `/mcp model enable` and one-shot `orx ask --mcp-tools` add one ORX-owned native model tool, `mcp_call`, limited to read-only non-billable declared MCP tools with active model-tool grants through the same profile/hash/auth/transport gates; `src/agent/tool-dispatch.ts` wraps model-visible MCP text results as explicitly untrusted remote data before returning them to the tool loop.

`src/agent/` supports ephemeral system messages for request-only context such as compact enabled plugin skill, prompt, and rule metadata. These messages are prepended to OpenRouter requests but are not returned as persisted conversation history unless the operator explicitly activates the corresponding text component.

`src/sessions/` can store activated plugin skill, prompt, and rule provenance in `activatedSkills`, `activatedPrompts`, and `activatedRules`; full activated content is represented by explicit untrusted system messages in the transcript.

`src/research/` now owns the Phase 10 direct research foundation: evidence source types, source ids, stable content/text hashes, conservative HTML/plain-text extraction, untrusted context message formatting, `/sources` rendering, deterministic metadata-only citation/bibliography formatting, a layered SSRF-style URL guard, and a Node-native DNS-vetted web fetch transport. Production fetch resolves and vets every hostname before connecting, binds the request to an allowed address, rechecks redirects, covers body reads with the same timeout, and strips terminal control characters before rendering or context insertion. `orx chat` stores evidence source metadata in session `evidenceSources`; bounded extracted text is represented by an explicit untrusted user-role context message in the transcript. `/cite <source-id>` and `/bibliography` render only source metadata, hashes, provenance, and the trust boundary; they do not render fetched text or perform network calls. Research fetch is currently reachable only through explicit operator slash commands, not model tool calls.

The next programming power-pack work should add richer code intelligence such as semantic tree-sitter-backed references or dependency resolution beyond the current parse/outline/repo-outline/single-file-import/single-file-ref/repo-ref/single-file-call/repo-call/repo-import/repo-dep previews, LSP/SCIP diagnostics beyond the current compiler/CLI diagnostics profiles, or broader test report integrations for additional non-JSON/custom reporters and wrapper commands beyond the current direct Node JUnit, captured TAP/Mocha JSON/RSpec JSON/Mocha-style/pytest/Cargo/Cucumber/Behat/Behave/testthat/GoogleTest/Catch2/Dart/Deno/ExUnit/Gradle/JUnit-Platform/TestNG/NUnit/Go/go-json/Cypress/RSpec/Minitest/Karma/Bun/Tasty/Zig/Python-unittest/JUnit-text/JUnit-XML/TestNG-XML/NUnit-XML/xUnit-XML/TRX-XML/TeamCity/PHPUnit/dotnet-xUnit/CTest/Meson/Unity/lit/Bazel/XCTest-style summaries, and JSON-report package-script paths, model-visible `run_tests`, dependency-free code map, exported-symbol index, reference index, import graph, lexical call graph, optional ast-grep adapter, current local scanner profile adapters, and current local diagnostics adapters.
