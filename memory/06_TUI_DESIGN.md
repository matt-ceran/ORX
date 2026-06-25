# TUI Design

Last updated: 2026-06-25

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

## Core Layout

```text
message scrollback
tool output blocks
diff summaries
status / warning line
composer
footer: cwd | mode | model | cost | context | permissions
```

## Slash Commands

Initial commands:

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
/clear
/new
/quit
```

## Visual Semantics

- Assistant text: primary terminal foreground.
- User text: clear prompt block.
- Tool call start: dim label plus spinner.
- Tool success: green accent.
- Tool failure: red accent.
- Warnings: yellow accent.
- Metadata: dim.
- Diffs: green additions, red removals.

## Keyboard Expectations

- Enter submits.
- Shift+Enter inserts newline when supported.
- Ctrl+C interrupts the current task before quitting.
- Arrow keys navigate command history.
- Slash command menu filters as the user types.

