# Commands

Last updated: 2026-06-27

## Repository

```bash
cd /Users/draingang/Documents/ORX
git status --short --branch
git remote -v
```

## GitHub

```bash
gh repo view matt-ceran/ORX --web
```

Repo URL:

```text
https://github.com/matt-ceran/ORX
```

## Planned CLI Commands

```bash
orx
orx --mode auto
orx --mode fusion
orx --model anthropic/claude-sonnet-4.5
orx --profile deep-review
```

## Current CLI Commands

```bash
npm run dev -- --help
npm run dev -- --version
npm run dev -- status
OPENROUTER_API_KEY="sk-or-..." npm run dev -- ask "Say hello from ORX"
OPENROUTER_API_KEY="sk-or-..." npm run dev -- ask "Say hello" --model anthropic/claude-sonnet-4.5
OPENROUTER_API_KEY="sk-or-..." npm run dev -- ask "Say hello" --mode fusion --fusion general-budget
OPENROUTER_API_KEY="sk-or-..." npm run dev -- models claude
OPENROUTER_API_KEY="sk-or-..." npm run dev -- credits
OPENROUTER_API_KEY="sk-or-..." npm run dev -- generation "gen_..."
OPENROUTER_API_KEY="sk-or-..." npm run dev -- chat
printf '/mode fusion\n/fusion general-budget\n/models claude\n/credits\n/generation gen_...\n/web\n/web fetch https://example.com\n/sources\n/cite src-1\n/bibliography\n/mcp\n/status\n/new\n/exit\n' | OPENROUTER_API_KEY="sk-or-..." npm run dev -- chat
```

If `.orx/config.toml` contains the API key, the `OPENROUTER_API_KEY=...` prefix is not needed. The `.orx/` directory is ignored and must remain uncommitted.

`/status` now includes local approximate context and OpenRouter metadata cost meters. `/credits` and `orx credits` now include a live OpenRouter credits usage meter when the credits endpoint returns usable fields. Set `NO_COLOR=1` to force plain output.

## Planned Environment

```bash
export OPENROUTER_API_KEY="sk-or-..."
```

## Development Commands

These commands exist after the Phase 1 scaffold.

```bash
npm run dev
npm run build
npm run typecheck
npm test
```
