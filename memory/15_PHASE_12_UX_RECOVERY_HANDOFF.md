# Phase 12 UX Recovery Handoff

Last updated: 2026-06-27

Status: local handoff only. Do not commit or push this handoff unless the user explicitly asks.

## Why This Exists

After Phase 12 Slice 1, the CLI has functional plain-text meters, but the user tested `orx chat` and reported that the experience is not close enough to modern coding-agent CLIs.

User-reported failures to treat as first-class product blockers:

- `/model deepseek v4` was accepted as an exact model id, then OpenRouter returned HTTP 400 because `deepseek v4` is not a valid model slug.
- The chat UI prints a long raw status line at the top and after turns. It is visually noisy, poorly aligned, and not the bottom status/composer experience the user wants.
- Launching ORX should be simple: `orx` from any directory should start the interactive agent for that cwd after global install.
- Commands should be simpler, better grouped, and easier to discover, with a modern command palette/help flow.
- Input ergonomics should keep improving incrementally: command palette, slash-name completion, deterministic slash argument completion, then theme/profile and badge polish.

The user explicitly wants the CLI to be inspired by Codex and Claude style terminal UX: polished, animated, color-coded, bottom-oriented, and user friendly. Do not copy Codex/Claude branding, private prompts, exact assets, or proprietary implementation details.

## Startup For Next Session

Read these files before implementing:

1. `memory/00_INDEX.md`
2. `memory/01_PROJECT_BRIEF.md`
3. `memory/09_CURRENT_CONTEXT.md`
4. `memory/06_TUI_DESIGN.md`
5. `memory/10_BACKLOG.md`
6. `memory/11_COMMANDS.md`
7. `memory/15_PHASE_12_UX_RECOVERY_HANDOFF.md`

Then inspect:

- `src/cli.ts`
- `src/tui/chat.ts`
- `src/slash/index.ts`
- `src/terminal/render.ts`
- `src/terminal/meters.ts`
- `src/openrouter/live.ts`

## Non-Negotiable UX Goals

- ORX remains OpenRouter-native and independent.
- TTY chat should feel like a real terminal application, not a stream of status text.
- The composer and status/meters belong at the bottom.
- Context, cost, and credits must remain accurate to their data sources:
  - context meter is approximate local ORX context bytes/messages, labeled as approximate
  - cost meter is only OpenRouter generation metadata ORX has actually received
  - credits meter is only live OpenRouter account data after fetching `/credits`
- Invalid model names must not mutate chat state.
- Exact OpenRouter slugs must remain supported for power users.
- Non-TTY output and `NO_COLOR=1` must stay plain and script-friendly.
- Default permissions remain visible: `never/danger-full-access`.

## Slice 1: Model Resolver And Safer `/model`

Current bug:

- `src/slash/index.ts` sets `activeConfig.model = command.argText` for `/model <slug>` without validating the id.
- That makes friendly inputs like `deepseek v4` become exact invalid OpenRouter model IDs.

Implement:

- Add a model resolver module, likely `src/openrouter/model-resolver.ts`.
- Use the live OpenRouter model catalog via the existing `listOpenRouterModels` helper when a key is available.
- Normalize friendly input by lowercasing, collapsing spaces/punctuation, and matching against model id/name/provider fields.
- Accept exact slugs directly when the catalog confirms them.
- If the catalog cannot confirm an exact slug due to network/API failure, preserve an explicit slug path only for inputs that look like OpenRouter ids, for example `provider/model`.
- Refuse to switch for free-form unknown names. Render a concise error with suggested `/models <query>` usage.
- For multiple matches, do not mutate state. Show the best bounded matches with exact `/model <id>` commands.
- Keep `/models [query]` as the model search command.
- Consider aliases after the safe resolver is in place:
  - `/auto` -> `openrouter/auto`
  - `/fusion [preset]` remains Fusion
  - `/m <query>` as an alias for `/model <query>`

Required tests:

- `/model deepseek v4` with no catalog match does not change `activeConfig`.
- `/model <exact-valid-id>` changes state.
- friendly query with one mocked catalog match changes to the returned exact id.
- friendly query with multiple mocked matches prints choices and does not change state.
- network/live metadata failure does not leak API keys.

## Slice 2: Bottom-Oriented TUI Rewrite

Current state:

- `src/tui/chat.ts` uses Node readline.
- `renderHeader` prints `ORX chat` plus a huge one-line footer at startup.
- `renderFooter` prints another one-line status block after turns.
- `writePrompt` prints a plain `orx>`.

Target:

- A TTY-only screen controller that keeps a compact status notch/composer at the bottom while scrollback stays above it.
- A non-TTY fallback that keeps the current line-oriented behavior for tests, pipes, and automation.
- Status should update in place instead of reprinting noisy full lines.
- Use subtle animation while the assistant or a tool call is active:
  - spinner/progress glyph in TTY
  - no animation in non-TTY
- Use color-coded labels and meters:
  - model/mode badge
  - context meter
  - session cost
  - account credits after `/credits`
  - permissions
  - cwd/session shorthand
- Use Unicode box/notch styling only in TTY, with ASCII fallback for non-TTY and `NO_COLOR`.

Suggested implementation shape:

- `src/tui/screen.ts`: screen controller, width-aware truncation, bottom status render, resize handling.
- `src/tui/composer.ts`: prompt rendering, input state, history, Ctrl+C behavior.
- `src/tui/palette.ts`: slash command palette/filtering above composer.
- Keep meter formatting in `src/terminal/meters.ts`; add compact badge helpers rather than duplicating math.

Acceptance target:

```text
message scrollback...

assistant: streamed response

╭─ orx  openrouter/auto  auto  ctx [##--------] 12%  cost $0.0041  credits $17.25
╰─ ~/project  never/danger-full-access  session 1851d3e4
orx › 
```

The exact visual design can differ, but it must be bottom-oriented, aligned, compact, and professional.

Required tests:

- Pure render snapshots at narrow and wide widths.
- Footer/composer truncates long cwd, model id, and session paths without overlap.
- `NO_COLOR=1` and non-TTY output contain no ANSI escape codes.
- Context/cost/credits values match the underlying meter data.
- Ctrl+C still aborts an active request before exiting idle chat.

## Slice 3: Simpler Commands And Global Launch

Current state:

- `orx` with no args prints help.
- `orx chat` starts the interactive agent.
- `package.json` already has `"bin": { "orx": "./dist/cli.js" }`, but the global install workflow is not hardened.

Implement:

- Make `orx` with no args start chat from the current directory.
- Keep `orx help`, `orx --help`, and `orx -h` for help.
- Keep `orx ask "prompt"` for one-shot mode.
- Consider `orx "prompt"` as a one-shot shortcut only if it does not create ambiguous parsing.
- Add package/global install hardening:
  - confirm `npm run build`
  - confirm `npm link` or `npm install -g .` exposes `orx`
  - add the minimal lifecycle script needed for source installs if required
  - test `orx --version`, `orx status`, and `orx` from a directory outside the repo
- Workspace/session behavior:
  - `orx` should use the current terminal cwd as the active workspace.
  - Session files can remain under `~/.orx/sessions`.
  - Add a private workspace cache under `~/.orx/workspaces/<workspace-id>` if project-level memory is needed.
  - Do not write new files into arbitrary user projects unless the behavior is explicit and documented.

Slash command simplification:

- `/help` should show common commands first.
- `/help all` can show advanced/plugin/MCP/research commands.
- `/help <query>` should filter commands.
- Add aliases only when they reduce real friction:
  - `/m` for `/model`
  - `/q` for `/quit`
  - `/s` for `/status`
- Avoid a giant ungrouped command dump.

## Suggested Order

Do these before adding more large feature phases:

1. Slice 1: model resolver and safer `/model`.
2. Slice 3 first half: `orx` no-arg chat launch and concise top-level help.
3. Slice 2: bottom-oriented TTY screen/composer/status.
4. Slice 3 second half: command palette/help filtering, aliases, and global install validation.
   - Done: grouped help, `/commands`/`/palette`, slash-name completion, deterministic slash argument completion, and global install validation are implemented.
5. Resume Phase 10: web search providers and browser automation.
6. Resume Phase 11: orchestration/delegation command scaffolds and OpenRouter delegate adapter.
7. Resume Phase 9: plugin install cache, marketplace/catalog, hooks, commands, MCP presets.
8. Finish Phase 12 packaging/theme polish.

## Implementor And Verifier Loop

Use a fresh implementor and fresh verifier context per slice.

Implementor responsibilities:

- Read the startup files above.
- Make one bounded slice of changes.
- Add or update tests.
- Run `npm run typecheck`, targeted tests, `git diff --check`, and `npm test` when practical.
- Update memory files for the changed behavior.

Verifier responsibilities:

- Start from the implementor diff, not their explanation.
- Reproduce the user-reported issue when relevant.
- Check behavior, tests, and edge cases.
- Report findings with file/line references.
- Do not make broad unrelated refactors.

Only after verifier findings are fixed should the implementation slice be committed and pushed. This handoff itself should remain uncommitted unless the user explicitly requests otherwise.
