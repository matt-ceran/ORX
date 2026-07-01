# ORX v0.1 Release Notes

ORX v0.1 is the first release-boundary baseline for the OpenRouter-native terminal coding agent. It is intended for local source/global installs and personal dogfooding, with explicit readiness checks before handoff.

## Install and first run

Source checkout:

```sh
npm install
npm run build
node dist/cli.js --help
node dist/cli.js init
node dist/cli.js auth setup
node dist/cli.js auth init
node dist/cli.js doctor --strict
OPENROUTER_API_KEY=... node dist/cli.js
```

Global install from the checkout:

```sh
npm install
npm install -g .
orx --version
orx init
orx auth setup
orx auth init
orx doctor --strict
OPENROUTER_API_KEY=... orx
```

`orx init` creates a private no-secret starter config. `orx auth setup` prints placeholder environment exports only, and `orx auth init` creates a private commented env template that ORX does not load automatically. Source installs build via the npm `prepare` lifecycle.

## Release verification

Use this as the final local gate before tagging, publishing, or handing off a v0.1 package candidate:

```sh
npm run verify:release
```

The release verifier clears real `OPENROUTER_API_KEY` and `BRAVE_SEARCH_API_KEY` values, checks whitespace, runs TypeScript typecheck, runs the full test suite, verifies a temp global source install, and performs isolated built-CLI smokes for doctor JSON, guide, code calls, plugin review, and MCP presets. It does not call OpenRouter, remote MCP endpoints, plugin bins, or plugin hooks by command selection.

For package contents inspection without publishing:

```sh
npm run pack:dry-run
```

## Current CLI surfaces

- First-run/readiness: `orx init`, `orx auth`, `orx auth setup`, `orx auth init`, `orx doctor`, `orx doctor --strict`, `orx doctor --json`, `orx guide`, `orx quickstart`, `orx status`.
- OpenRouter interaction: `orx` / `orx chat`, `orx ask`, `orx models`, `orx credits`, `orx generation`, exact model ids, `openrouter/auto`, `openrouter/fusion`, Fusion presets, streaming metadata, and cost/token summaries when OpenRouter returns them.
- Config/local UX: `orx config show|path|set`, profiles, themes, prompt history, TTY status/composer polish, multiline input, command discovery, and slash-command completion.
- Local coding tools: file/search/shell/diff/patch model tools, native `run_tests`, `orx tests` with structured report summaries, code maps, symbols, refs, imports, lexical call graphs, and optional local ast-grep previews.
- Explicit operator integrations: TypeScript/Pyright/gopls diagnostics, Semgrep scanner profile, MCP preset/profile management, guarded MCP calls/model grants, plugin scaffold/validate/install/review, trusted plugin bins/hooks, skills/prompts/rules, and policy-gated delegation.
- Automation: `npm run verify:release`, `npm run verify:global-install`, and `npm run pack:dry-run`.

## Security and boundary notes

ORX keeps the personal-use YOLO local permission posture visible by default:

```toml
approval_policy = "never"
sandbox_mode = "danger-full-access"
```

OpenRouter remains the normal inference path. Credentials are detected from environment/config but redacted from status, doctor, config, audit, and error surfaces. MCP profiles, plugins, scanners, diagnostics, browser/web research, and delegation remain explicit opt-in surfaces with separate trust/grant/policy gates where implemented.

## Known optional post-v0.1 work

- LSP/SCIP and deeper semantic tree-sitter-backed reference/call/dependency intelligence beyond the current outline, single-file import/ref/call extraction, bounded repo AST outline previews, bounded repo AST identifier refs, bounded repo AST call previews, bounded repo AST import-source previews, bounded local-relative repo dependency previews, and dependency-free indexes.
- Broader test report integrations for additional non-JSON/custom reporters or wrapper commands beyond the current direct Node, captured TAP/Mocha/pytest/Cargo/Deno/Go/RSpec/Minitest/Karma/Bun/Python-unittest/JUnit-text/PHPUnit/dotnet/CTest/XCTest-style summaries, declared/config JSON output, existing JSON reporter, and exact default Jest/Vitest/Playwright runner paths.
- Sourcegraph/GitHub/GitLab read-only profiles with the same explicit operator boundaries as existing MCP/plugin surfaces.
- Managed OAuth/device/browser credential flows for MCP providers beyond bearer env vars and opt-in macOS Keychain support.
- Additional scanner/diagnostics profiles only after deterministic no-network/no-auth command shapes are proven.
- Further TTY editor polish if script-safe fallback behavior remains intact.
- Publishing automation/tagging/signing, if ORX moves from local checkout installs to a public npm release process.
