# ORX

OpenRouter-native terminal coding agent.

ORX is planned as a personal CLI for using OpenRouter models with a polished terminal interface, model routing, Fusion support, local coding tools, and YOLO-style permissions by default.

## Goals

- Launch with a dedicated `orx` command.
- Switch between exact models, `openrouter/auto`, and `openrouter/fusion`.
- Support OpenRouter Fusion presets and custom panel configuration.
- Provide local coding-agent tools for file reads, search, patching, shell commands, diffs, and session history.
- Track model, mode, token usage, and estimated cost.
- Use a professional terminal UI with streaming output, slash commands, status footer, and colored tool output.

## Default Permissions

The intended default is unrestricted local execution for personal use:

```toml
approval_policy = "never"
sandbox_mode = "danger-full-access"
```

This should remain visible in `/status` and configurable later.

## Local CLI

Phase 1 exposes a local TypeScript CLI skeleton:

```sh
npm install
npm run build
node dist/cli.js --help
node dist/cli.js --version
node dist/cli.js status
```

Config is discovered from repo-local `.orx/config.toml` development defaults and `~/.orx/config.toml`. `OPENROUTER_API_KEY` takes precedence for API key detection. The `status` command reports whether a key is present without printing it.

## Project Memory

This repo includes a Codex-friendly memory system:

- `AGENTS.md` gives new Codex sessions the startup protocol.
- `memory/00_INDEX.md` is the retrieval map.
- `memory/09_CURRENT_CONTEXT.md` tracks the current repo state.
- `memory/10_BACKLOG.md` tracks next implementation work.

Start future sessions from the repository root and read `memory/00_INDEX.md` first.
