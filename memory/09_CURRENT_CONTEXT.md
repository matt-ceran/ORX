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

## Next Likely Task

Implement Phase 2 OpenRouter streaming:

- OpenRouter client for `https://openrouter.ai/api/v1`
- a non-interactive command that sends one prompt and streams the response
- exact model slug support plus existing default `openrouter/auto`
- returned model, generation id, token usage, and cost metadata capture when available
- independent verifier pass before commit

Do not implement orchestration before the core OpenRouter streaming loop, tool-call loop, and session metadata exist.

## Active Constraints

- Keep ORX OpenRouter-native.
- Keep default ORX permissions unrestricted.
- Keep UI inspired by professional terminal coding agents without copying Codex branding or proprietary assets.
- Keep memory files concise and indexed.
- Commit and push only after the current implementation step has passed independent verification.
