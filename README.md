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

The local TypeScript CLI can be run from source or built output:

```sh
npm install
npm run build
node dist/cli.js --help
node dist/cli.js --version
node dist/cli.js status
```

To install the source checkout as a global `orx` command without manually running a build:

```sh
npm install
npm install -g .
orx --version
orx status
OPENROUTER_API_KEY=... orx
```

The npm `prepare` lifecycle builds `dist/cli.js` for local source installs. `orx` with no command starts interactive chat from the current directory; use `orx help` or `orx --help` for help output.

Config is discovered from repo-local `.orx/config.toml` development defaults and `~/.orx/config.toml`. `OPENROUTER_API_KEY` takes precedence for API key detection. The `status` command reports whether a key is present without printing it.

Saved local profiles can bundle model, mode, Fusion preset, theme, and permission posture without storing API keys:

```sh
orx profile save daily
orx profile list
orx profile inspect daily
OPENROUTER_API_KEY=... orx --profile daily
```

Profiles are stored outside repos at `~/.orx/profiles.json`; set `ORX_PROFILE_CONFIG_PATH` to isolate or test that registry.

Plugin registry management is also available outside chat:

```sh
orx plugins list
orx plugins install ./orx-plugin.json
orx plugins inspect acme.example@1.0.0
orx plugins enable acme.example@1.0.0
orx plugins disable acme.example@1.0.0
```

Plugin install/register stores an inert local registry record plus an ORX-owned cache snapshot of the sanitized manifest and declared components. By default the registry lives at `~/.orx/plugins/registry.json` and the cache at `~/.orx/plugins/cache`; use `ORX_PLUGIN_REGISTRY_PATH` and `ORX_PLUGIN_CACHE_DIR` to isolate them. Enabling a plugin only enables its metadata/skills surface where supported; hooks, bins, plugin MCP servers, plugin commands, and plugin code execution remain inactive in the current scaffold.

Send one non-interactive streaming request with:

```sh
OPENROUTER_API_KEY=... npm run dev -- ask "Say hello"
```

Useful overrides:

```sh
OPENROUTER_API_KEY=... npm run dev -- ask "Say hello" --model anthropic/claude-sonnet-4.5
OPENROUTER_API_KEY=... npm run dev -- ask "Say hello" --mode auto
OPENROUTER_API_KEY=... npm run dev -- ask "Say hello" --mode fusion --fusion general-budget
```

After the streamed assistant text, ORX prints a compact metadata summary when OpenRouter provides details such as requested/resolved model, generation id, token counts, reasoning tokens, and cost. Secrets are never printed.

Start an interactive chat session with:

```sh
OPENROUTER_API_KEY=... npm run dev -- chat
```

The chat UI keeps in-session message history for the current process, streams assistant text as it arrives, and shows a compact header/footer with cwd, mode, model, API key presence, and permission posture. Supported slash commands:

```text
/help
/status
/model <openrouter-model-slug>
/mode auto
/mode fusion
/fusion [preset]
/theme [default|mono|vivid]
/profile [list|save|use|inspect|delete]
/plugins [list|inspect|register|install|enable|disable]
/models
/clear
/new
/quit
/exit
```

Ctrl+C aborts the active OpenRouter request when one is streaming, or exits the chat when idle.

## Project Memory

This repo includes a Codex-friendly memory system:

- `AGENTS.md` gives new Codex sessions the startup protocol.
- `memory/00_INDEX.md` is the retrieval map.
- `memory/09_CURRENT_CONTEXT.md` tracks the current repo state.
- `memory/10_BACKLOG.md` tracks next implementation work.

Start future sessions from the repository root and read `memory/00_INDEX.md` first.
