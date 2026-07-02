# TUI Design

Last updated: 2026-07-02

## Interface Goals

The UI should feel like a professional terminal coding agent:

- responsive streaming output
- bottom composer
- compact status footer
- colored tool-call blocks
- syntax-highlighted diffs
- clear model and mode badges
- subtle spinner or progress animation
- command palette for slash commands

Do not use Codex branding, exact assets, or proprietary UI code.

## Urgent UX Recovery

The Phase 12 Slice 1 meter foundation is functional but not visually sufficient. The next UI slice should replace the current readline header/footer style with a TTY-only bottom composer and status notch inspired by modern coding CLIs such as Codex and Claude, without copying their branding or private implementation.

Requirements:

- no long raw status line at the top
- no repeated full footer line after every assistant turn in TTY mode
- width-aware bottom status/composer that stays aligned
- activity spinner or subtle progress animation while the assistant/tools run; TTY-only assistant/tool activity is now implemented
- color-coded badges for model, mode, permissions, context, cost, and credits
- selectable TTY themes for default color, monochrome terminals, and higher-contrast color
- accurate labels for approximate context, observed generation cost, and live credits
- non-TTY and `NO_COLOR=1` fallback stays plain and script-safe

## Core Layout

```text
message scrollback
tool output blocks
diff summaries
status / warning line
composer
footer: cwd | mode | model | cost | context | permissions
```

Current MVP:

- `orx chat` uses a readline-based terminal loop.
- TTY chat uses a compact bottom status notch and `orx ›` composer instead of the older long header/footer. Non-TTY and `NO_COLOR=1` keep the plain `orx>` line-oriented fallback.
- TTY transcript scrollback renders user and assistant turns as distinct blocks with better vertical rhythm, sanitizes terminal-control characters in displayed TTY transcript chunks, and renders tool call starts/results as compact multi-line product blocks. Non-TTY and `NO_COLOR=1` keep the script-safe plain transcript and one-line `[tool]` summaries.
- The status notch shows cwd, mode, model, permissions, session id, local approximate context, OpenRouter metadata cost, and account credits after `/credits` has succeeded in the current process.
- The TTY model badge uses compact route labels for OpenRouter routing shortcuts: `openrouter/auto` renders as `route auto`, and `openrouter/fusion` renders as `route fusion`. On wide TTY layouts exact `provider/model` ids render as separate `provider` and `model` badges; narrow layouts keep a single compact model badge. Full ids remain visible in plain status and request/config surfaces.
- TTY render helpers support `default`, `mono`, and `vivid` themes. Theme can be set in config as `theme = "default" | "mono" | "vivid"`, overridden with `ORX_TTY_THEME`/`ORX_THEME`, or changed in chat with `/theme [default|mono|vivid]`. `NO_COLOR=1` and non-TTY output still force plain text.
- Saved profile controls persist named local config snapshots outside repos at `~/.orx/profiles.json`. Use `orx profile ...`, global `orx --profile <id>`, or chat `/profile [list|save <id> [options]|use|inspect|delete]` to manage/apply them. `profile save` captures the current config by default and supports inline non-secret overrides for model, mode, Fusion preset, theme, approval policy, and sandbox mode. Profiles do not store API keys or enable MCP/plugin executable surfaces.
- Chat config controls mirror the safe CLI config surface through `/config show|path|set`. They render redacted config/path state, edit only supported non-secret keys, update the active chat snapshot after successful edits, and keep API keys/manual secret storage out of slash arguments.
- Chat auth controls mirror the core OpenRouter auth helper surface through `/auth status|setup|env|init|env-file`. They report API-key readiness without values, print placeholder exports only, create private commented env templates when requested, do not auto-load env files, and redact secret-shaped unexpected arguments.
- TTY prompt history is durable, local, and private. Readline chat preloads single-line entries from `~/.orx/history.json` or `ORX_CHAT_HISTORY_PATH`; only sanitized user prompts are stored, slash commands and secret-like input are skipped, non-TTY/scripted chat does not persist history, and `/history [search|clear]` plus `orx history [search|clear]` inspect or clear the same prompt-only file.
- TTY chat shows a subtle `work <spinner> assistant` activity state while waiting for assistant output and `work <spinner> tool <name>` while native tools run. The activity composer clears in place before assistant/tool scrollback is printed.
- Readline Tab completion now covers slash command names, aliases, and deterministic arguments for common command families such as routing, web, MCP, plugins, skills, orchestration, resume, help, and palette filtering.
- Multiline prompt continuation is implemented without a raw-mode rewrite: an input line ending with an unescaped `\` keeps collecting lines, TTY mode renders a continuation `orx …` composer, non-TTY mode renders `...>`, and the collected lines are submitted as one user message with internal newlines preserved.
- Assistant responses stream inline as chunks arrive.
- `scripts/probe-tty-render.mjs` provides a dependency-free built-output render probe for representative 80- and 120-column TTY transcript/status output. Browser/pixel terminal verification remains a later phase.
- In-process user/assistant history is sent with follow-up turns.
- Ctrl+C aborts an active response or exits when idle, and active TTY activity is cleared before the interruption message.
- ANSI styling is light and TTY-only; non-TTY output and `NO_COLOR=1` remain plain text.

Target next iteration:

```text
message scrollback
assistant and tool output

bottom status notch: model | mode | context | cost | credits | permissions
bottom composer: orx › current input
```

Next TTY polish should focus only on optional future raw-mode editing if it can preserve the current script-safe fallback.

## Slash Commands

Initial commands:

```text
/model
/help
/models
/mode auto
/mode fusion
/fusion
/theme
/auth
/credits
/cost
/status
/diff
/shell
/web
/mcp
/compact
/profile
/history
/orchestrator
/delegate
/delegates
/team
/clear
/new
/quit
```

Implemented MVP commands:

```text
/help
/status
/model <slug>
/mode auto
/mode fusion
/fusion [preset]
/auth [status|setup|env|init|env-file]
/models
/clear
/new
/quit
/exit
```

Future orchestration commands:

```text
/orchestrator openrouter <model-slug>
/orchestrator codex [profile]
/delegate add <name> openrouter <model-slug>
/delegate add <name> codex [options]
/delegate add <name> devin [options]
/delegate remove <name>
/delegates
/team save <name>
/team load <name>
```

## Visual Semantics

- Assistant text: primary terminal foreground.
- User text: clear prompt block.
- Tool call start: dim label plus spinner.
- Tool success: green accent.
- Tool failure: red accent.
- Warnings: yellow accent.
- Metadata: dim.
- Meters: ASCII `#`/`-` bars with explicit source labels. Context meters are local approximate bytes versus ORX's configured budget, not provider-token context. Cost meters are OpenRouter metadata coverage/latest/known costs only. Credits meters are live OpenRouter account credits only after the credits endpoint is fetched.
- Diffs: green additions, red removals.
- Delegation: show the delegate name, adapter type, status, elapsed time, and cost or external budget when available.

## Keyboard Expectations

- Enter submits.
- Trailing unescaped `\` continues a multiline prompt and submits the collected lines together.
- Shift+Enter can be added later if a raw-mode editor is introduced safely.
- Ctrl+C interrupts the current task before quitting.
- Arrow keys navigate durable prompt history in interactive readline/TTY chat.
- Slash command menu filters as the user types.
- Tab completes slash command names, aliases, and deterministic subcommands/arguments where ORX has stable choices.
