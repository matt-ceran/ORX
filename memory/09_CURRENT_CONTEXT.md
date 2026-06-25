# Current Context

Last updated: 2026-06-25

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

Start Phase 4 slash command expansion:

- Extract the inline chat slash handling into a registry/parser.
- Add `/mode auto`, `/mode fusion`, `/fusion <preset>`, `/models`, `/new`, and improved `/status`.
- Keep `/model`, `/clear`, `/help`, `/quit`, and `/exit` working.
- Add focused parser/handler tests before commit.

Do not implement orchestration before the core OpenRouter streaming loop, tool-call loop, and session metadata exist.

## Active Constraints

- Keep ORX OpenRouter-native.
- Keep default ORX permissions unrestricted.
- Keep UI inspired by professional terminal coding agents without copying Codex branding or proprietary assets.
- Keep memory files concise and indexed.
- Commit and push only after the current implementation step has passed independent verification.
