# TUI Design

Last updated: 2026-07-02

## Interface Goals

The UI is a flat, marker-based terminal experience modeled on modern coding
CLIs (Codex-class look, no borrowed branding, assets, or proprietary code):

- flowing transcript with `•` bullets and 2-space indented bodies
- generous vertical whitespace; no box borders anywhere
- user messages as full-width grey bands prefixed with `›`
- grey input band at the bottom with the readline cursor inside it
- ONE color-coded stats line rendered BELOW the input band
- tool results as `└` follow-up lines (green ok / red failed)
- turn metadata as a dim `─`-prefixed line
- muted professional color palette (256-color)
- slash command autocomplete on the stats row
- non-TTY and `NO_COLOR=1` output stays plain and script-safe

## Color Palette

The TUI uses muted 256-color tones for a professional, low-glare aesthetic:

- **default theme**: accent = dusty blue (110), success = sage green (108), warning = warm amber (179), danger = muted coral (167)
- **vivid theme**: accent = sky blue (75), success = light green (114), warning = light amber (221), danger = salmon (203)
- **mono theme**: bold/dim only, no color codes; the input band uses reverse video
- **input band**: background 254, foreground 235 (default/vivid)

Text colors are centralized in `src/terminal/render.ts` (`THEME_ANSI_CODES`);
band colors live in `src/tui/screen.ts`.

## Core Layout

```text
 ORX  OpenRouter-native coding workbench

  model    openrouter/auto            mode     auto
  cwd      ~/Documents/ORX            perm     never/danger-full-access
  key      yes (env)                  session  4f3a2b

  /help commands · Ctrl+G editor · Ctrl+O copy · Ctrl+R history · Ctrl+L clear

 › fix the failing tests                ← grey band (user msg in transcript)

• Sure — the mock in src/foo.ts was stale;
  I fixed it and all 42 tests pass.      ← assistant: dim bullet, body flows

• tool shell command="npm test"          ← accent bullet + dim args
  └ ok · exit=0 · duration=1.2s          ← green when ok, red when failed

  ─ openrouter/auto · 63 tokens · $0.000214   ← dim turn-metadata line

 › current input…                        ← grey full-width band, cursor inside
  openrouter/auto · auto · ~/ORX · main · never/danger… · ctx 3% · $0.0002
```

## Shared Block Language (`src/terminal/ui.ts`)

`renderTerminalBlock` renders `• title subtitle` (bullet + title toned,
subtitle dim), a 2-space indented wrapped body, and a dim `  └ footer` line
(omitted when there is no footer). This is used by chat command/warning
capture blocks AND direct CLI surfaces (`orx status`, `orx help`, `orx
doctor`, `orx mcp`, code intelligence commands, ...), so every surface shares
the flat style. Diff bodies keep green/red/amber diff coloring.

## Composer Mechanics (`src/tui/screen.ts` + `src/tui/chat.ts`)

- `renderTtyStatusComposer` emits: queued follow-up lines, a blank spacer
  line, the grey band row, and the stats line — then repositions the cursor
  up into the band (`ESC[1A ESC[4G`) and re-arms the band SGR so typed
  characters stay grey. The stats line is a REAL row (written with `\n`), so
  bottom-of-screen scrolling stays correct.
- The readline prompt (`renderTtyReadlinePrompt`) embeds the band SGR with no
  trailing reset; readline refreshes repaint the band and BCE paints
  clear-to-EOL grey. Visible prompt width is `TTY_PROMPT_PREFIX_WIDTH` (3).
- Clear math: the stats row is part of the composer line count.
  - cursor on band row → step down one row (`TTY_COMPOSER_ROWS_BELOW_PROMPT`)
    then clear the full count upward (`clearComposerFromPromptRow`)
  - after Enter → cursor lands ON the stats row, so clear
    `count + submittedRows − 1` (`clearSubmittedTtyComposer`)
- Slash suggestions render as a single dim `try …` line that temporarily
  replaces the stats row. A debounced keypress handler
  (`refreshBelowPromptRow`) always repaints the below-band row (suggestions
  or stats) because readline's own line refresh (backspace, history nav)
  clears the screen below the prompt and takes the stats row with it.
- The stats line degrades at narrow widths by dropping parts whole
  (session → git → truncate cwd → drop cwd → drop perm) before per-part
  ellipsis truncation.
- Readline's output stream is wrapped (`wrapTtyReadlineOutput`). Readline
  refreshes as cursor-to-col-1 → clear-screen-down → rewrite prompt+line;
  with the band SGR armed, BCE terminals flood everything below the prompt
  grey. The filter rewrites each `ESC[0J` to reset → clear → re-arm band →
  `ESC[0K` so the input row stays a full-width grey band and nothing below
  floods. The same wrapper MUTES readline echoes while the assistant is
  streaming (turn active, no activity composer on screen) so typed
  follow-ups cannot corrupt the streaming transcript block — they surface
  in the queued list instead.
- `writeBelowPromptRow` uses explicit cursor movement computed from
  `rl.line`/`rl.cursor` (wrap-aware), NOT DECSC/DECRC — save/restore records
  absolute coordinates and lands on the wrong row after the screen scrolls.
  It also grey-fills from end-of-text on the last input row, erasing stats
  residue left by terminal auto-wrap.
- Every composer clear that starts from the band row (activity spinner
  ticks, resize, shortcuts, idle Ctrl+C) MUST go through
  `clearComposerFromPromptRow` so the stats row below the cursor is
  included; clearing only `countLines` from the band row leaves one orphan
  stats line per redraw and eats one transcript line above (the Phase-13
  spinner-stacking bug).

## Stats Line Content

`[spinner activity?] model · mode · cwd · git · perm · [ctx N% · $cost ·
bal $credits | session]`

- spinner + activity label accent, only while an assistant/tool turn runs
- model accent, mode green, cwd/git/session dim, permissions amber
- ctx % auto-toned (green / amber ≥75% / red ≥90%) against ORX's local
  approximate context-byte budget
- cost = observed OpenRouter metadata dollars (green); credits appear after
  `/credits` succeeds (`bal $…`)
- battery bars were removed from the composer; `/status` keeps detailed
  meters with explicit source labels

## Transcript Semantics

- user: grey band rows (`›` first row, 2-space continuation), mirrors the
  composer band
- assistant: dim `•`, text streams on the bullet line, wraps at 2-space
  indent; closes with dim `  ─ model · tokens · cost`
- tool call: accent `• tool <name>` + dim compact args; result `  └ ok/failed
  · details` (green/red status word, dim details)
- command capture: `• command /x` accent; warnings `• warning /x` amber
- diffs keep green additions / red removals / amber hunk headers

## Full-Screen Helpers

`src/tui/fullscreen.ts` provides alt-screen entry/exit, scroll-region and
cursor helpers, and the resize handler used to redraw the composer at the new
width. Ctrl+L clears the visible terminal and redraws startup card + composer
without resetting the session.

## Keyboard

- Enter submits; trailing unescaped `\` continues a multiline prompt (band
  marker switches to `…`)
- Ctrl+C interrupts the active turn, or clears the composer and exits when idle
- Ctrl+L clear/redraw · Ctrl+O copy latest assistant output · Ctrl+R history
  search · Ctrl+G external editor (all queue as visible commands mid-turn)
- Arrow keys navigate durable prompt history; Tab completes slash commands

## Verification

- `npm test` covers `src/terminal/ui.test.ts`, `src/tui/screen.test.ts`,
  `src/tui/chat.test.ts` (composer, band, stats, queueing, themes, NO_COLOR)
- `npm run verify:tty-first-screen` pins the flat first screen (no box
  chrome, grey band 48;5;254, cursor reposition `ESC[1A ESC[4G`)
- Real-PTY spot check: run the CLI inside `tmux -L <sock>` with a mocked
  `globalThis.fetch` preloaded via `NODE_OPTIONS=--import`, then
  `capture-pane` to inspect the rendered screen (see
  `docs/superpowers/specs/2026-07-02-tui-codex-flat-restyle-design.md`)
- The PTY mock MUST stream SSE chunks with real delays (~1s apart). An
  instant mock never runs the activity spinner or mid-stream typing paths,
  which is exactly where the spinner-stacking and echo-corruption bugs
  lived. Probe at minimum: multi-second turn, typing + Enter during
  streaming, backspace after the turn (checks the clear-screen-down
  filter), wrapped input, resize, Ctrl+C.

## Behavioral Notes That Still Hold

- Queued follow-ups render as dim `queued (N) · runs after current turn`
  lines above the composer and are consumed after the active turn
- TTY chat accepts input while a turn is active; echoes are cleared and
  re-rendered through the composer clear math
- Interactive TTY requests prepend a short ORX coding-agent system message
- Prompt history is durable, local, sanitized (`~/.orx/history.json`)
- Saved profiles, `/config`, `/auth`, `/theme`, `/models` behavior unchanged
- Non-TTY and `NO_COLOR=1` keep the plain `orx>` line-oriented fallback
