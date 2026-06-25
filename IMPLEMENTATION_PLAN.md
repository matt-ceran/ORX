# ORX Implementation Plan

## Stack

- Runtime: Node.js and TypeScript
- TUI: Ink or React Blessed
- OpenRouter API: OpenAI-compatible chat completions endpoint
- Validation: zod
- Shell execution: node-pty or execa
- File search: ripgrep wrapper
- Browser and web: Playwright plus search integration
- MCP: TypeScript MCP SDK
- Config: TOML or JSONC under `~/.orx`

## Architecture

```text
src/cli.ts
src/tui/
src/agent/
src/openrouter/
src/tools/
src/slash/
src/permissions/
src/mcp/
src/sessions/
```

## MVP

1. Scaffold CLI, config loader, and OpenRouter streaming.
2. Add terminal UI with composer, message stream, footer, and slash command router.
3. Add `/model`, `/models`, `/mode`, `/fusion`, `/status`, `/clear`, `/new`, and `/quit`.
4. Add OpenRouter modes:
   - exact model slugs
   - `openrouter/auto`
   - `openrouter/fusion`
   - Fusion plugin presets
5. Add local tools:
   - `read_file`
   - `list_files`
   - `search_files`
   - `shell`
   - `apply_patch`
   - `git_diff`
6. Add session persistence and resume.
7. Add OpenRouter MCP integration for live model, benchmark, pricing, credit, and generation lookup.
8. Add web search and browser automation.
9. Polish UI, theming, keyboard behavior, and command palette.

## Command Shape

```bash
orx
orx --mode auto
orx --mode fusion
orx --model anthropic/claude-sonnet-4.5
orx --profile deep-review
```

## Slash Commands

```text
/model
/models
/mode auto
/mode fusion
/fusion
/credits
/cost
/status
/diff
/shell
/web
/mcp
/compact
/profile
```

