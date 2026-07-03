# TUI Codex-Style Flat Restyle — Design

Date: 2026-07-02
Status: approved by user (interactive), implementation in progress
Constraint: do not commit until the user reviews the result.

## Goal

Replace ORX's box-drawn terminal chrome (`╭─`/`│`/`╰─` transcript blocks, framed
`input` composer, battery-bar meters) with a flat, marker-based visual language
modeled on modern coding CLIs (Codex-class look, no borrowed branding/assets):

- flowing transcript with `•` bullet markers and 2-space indented bodies
- generous vertical whitespace between entries
- user messages as full-width grey bands prefixed with `›`
- tool results as `└` follow-up lines (green ok / red failed)
- turn metadata as a dim `─`-prefixed line
- a grey full-width input band with the readline cursor inside it
- ONE color-coded stats line rendered BELOW the input band
- no box borders anywhere, including `orx status`, `/help`, command capture
  blocks, and warnings

Non-TTY and `NO_COLOR=1` output stays plain and script-safe. Themes
(default/mono/vivid) keep working.

## Visual spec

Startup (no rules, no boxes):

```
ORX  OpenRouter coding workbench

  model    openrouter/auto            mode     auto
  cwd      ~/Documents/ORX            perm     never/danger-full-access
  key      yes (env)                  session  4f3a2b

  /help commands · Ctrl+G editor · Ctrl+L clear · Ctrl+O copy · Ctrl+R history
```

Transcript:

```
 › fix the failing tests                ← grey band, wraps at width

• Sure — the mock in src/foo.ts was stale;
  I fixed it and all 42 tests pass.      ← assistant: dim bullet, body flows

• tool shell  command="npm test"         ← accent bullet + dim args
  └ ok · exit=0 · 1.2s                   ← green (ok) / red (failed)

  ─ openrouter/auto · 1.2k tokens · $0.0002   ← dim metadata rule line

• /diff                                  ← command capture: accent bullet
  <body indented 2 spaces, diff coloring preserved>
  └ 12 lines                             ← dim footer line
```

Composer (bottom of screen):

```
 › current input…                        ← grey band, full width, cursor inside
  ⠋ assistant · route auto · auto · ~/ORX · main · never/danger · ctx 3% · $0.0002
```

Footer stat coloring: spinner+activity accent (only while a turn runs), model
accent, mode green, cwd/git/session dim, permissions yellow, ctx% auto-toned
(green/amber/red by usage), cost/credits green. Battery bars are removed from
the composer; `/status` keeps detailed meters.

Slash suggestions: while the buffer starts with `/`, a single dim suggestion
line temporarily replaces the stats line; the stats line returns when
suggestions clear.

## Architecture / mechanics

Box chrome is centralized in exactly two files; the restyle keeps every public
API signature intact so ~20 call-site files do not change.

1. `src/terminal/ui.ts`
   - `renderTerminalHeader` → `• title subtitle` (bullet+title toned, subtitle dim)
   - body prefix `  ` (2 spaces); wrapping logic unchanged
   - `renderTerminalFooter` → dim `  └ footer`; empty footer renders nothing
     (callers filter empty strings)
   - `prefixTerminalBodyLine(line)` → `  line`
   - empty body → dim `  no output`

2. `src/tui/screen.ts`
   - startup card: flat grid, no thin rules
   - composer: renders `\n` + grey prompt band + `\n` + stats line, then
     repositions the cursor up into the band (`ESC[1A CR ESC[<n>C`) and
     re-arms the band SGR (bg+fg, no reset) so typed characters stay grey.
     Real newlines guarantee correct scrolling at the bottom of the screen.
   - `renderTtyReadlinePrompt` embeds the band SGR in the prompt string so
     readline refreshes (backspace/history) repaint the band; Node readline
     strips VT sequences for width math. BCE paints clear-to-EOL grey.
   - stats line built by `renderTtyStatusNotch` as ONE `fitStatusLine` row
     with ` · ` separators; battery meters removed; `formatBatteryMeter`
     deleted along with per-meter helpers.
   - queued follow-ups: flat dim lines (`  queued (2)` / `  1 › text`).

3. `src/tui/chat.ts`
   - user echo in transcript: grey band lines via new `renderUserBand` helper
     in screen.ts (wraps at width, `› ` prefix).
   - assistant streaming writer: no header line; first chunk starts on the
     bullet line (`• `), continuations indent 2 spaces; `finish(footer)`
     writes dim `\n  ─ footer`.
   - tool events: `• tool <name> <args>` on call; `  └ ok/failed · details`
     on result (result line replaces the old second block).
   - Clear-math changes because ONE real line now exists below the prompt row:
     - cursor-on-prompt-row clears emit `ESC[1B` first, then clear
       `composerLines` upward (footer row is part of countLines already);
     - after-Enter clears use `composerLines + submittedRows − 1` because the
       cursor lands ON the stats row instead of one past the prompt.
     Both paths funnel through one helper to keep the math in one place.
   - `countSubmittedInputExtraRows` computes from the readline prompt string
     (width 3) instead of parsing the last composer line (now the stats row).
   - suggestions: rewritten to overwrite the stats row in place (save cursor,
     down 1, clear line, write, restore), single line only; clearing restores
     the stats row. The stats row always exists, so `ESC[1B` is safe.

4. `scripts/assert-tty-first-screen.mjs` — assertions updated to the new
   first screen (no `╭─ input`, grey band present, stats line below prompt).

5. Tests updated in place: `src/terminal/ui.test.ts`, `src/tui/screen.test.ts`,
   `src/tui/chat.test.ts`, plus any suite asserting box glyphs
   (`src/status.test.ts`, `src/slash/index.test.ts`, `src/cli.test.ts`, ...).

6. `memory/06_TUI_DESIGN.md` rewritten to describe the flat language.

## Error handling / edge cases

- `NO_COLOR=1` / non-TTY: plain fallbacks unchanged (`orx>` loop, plain
  block text). The grey band and stats line are TTY-only.
- mono theme: band renders as bold prompt, no background; stats line uses
  bold/dim only.
- Narrow widths: stats line degrades through the existing `fitStatusLine`
  proportional truncation; grid rows collapse to single column (existing
  logic).
- Multiline continuation input: band prompt shows `…` instead of `›`.
- Wrapped input rows: after-Enter clear count already accounts for wraps via
  `submittedRows`; the −1 offset is wrap-independent (verified by row math).

## Testing

- `npm test` (builds + runs all `node --test` suites)
- `npm run verify:tty-first-screen`
- Manual: drive `orx chat` under a PTY and eyeball spacing/band/stats.
