# Commands

Last updated: 2026-06-28

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
orx help
orx --mode auto
orx --mode fusion
orx --model anthropic/claude-sonnet-4.5
orx --profile deep-review
```

Planned behavior:

- `orx` with no args starts interactive chat in the current directory. This is now implemented for the source/dev CLI.
- `orx help`, `orx --help`, and `orx -h` show help.
- `orx ask "prompt"` remains the explicit one-shot command.
- Global install exposes `orx` from any directory after `npm install` and `npm install -g .`; `prepare` builds `dist/cli.js` for source installs.

## Current CLI Commands

```bash
npm run dev -- --help
npm run dev -- --version
npm run dev -- status
OPENROUTER_API_KEY="sk-or-..." npm run dev -- ask "Say hello from ORX"
OPENROUTER_API_KEY="sk-or-..." npm run dev -- ask "Say hello" --model anthropic/claude-sonnet-4.5
OPENROUTER_API_KEY="sk-or-..." npm run dev -- ask "Say hello" --mode fusion --fusion general-budget
npm run dev -- mcp enable openrouter
npm run dev -- mcp allow-model-tool openrouter models-list
OPENROUTER_API_KEY="sk-or-..." ORX_MCP_BEARER_OPENROUTER="..." npm run dev -- ask "Use OpenRouter MCP metadata" --mcp-tools
npm run dev -- tests list
npm run dev -- tests run
npm run dev -- code map
npm run dev -- code symbols
npm run dev -- symbols renderCode
npm run dev -- map src
OPENROUTER_API_KEY="sk-or-..." npm run dev -- models claude
OPENROUTER_API_KEY="sk-or-..." npm run dev -- credits
OPENROUTER_API_KEY="sk-or-..." npm run dev -- generation "gen_..."
OPENROUTER_API_KEY="sk-or-..." npm run dev -- profile save daily
OPENROUTER_API_KEY="sk-or-..." npm run dev -- --profile daily status
OPENROUTER_API_KEY="sk-or-..." npm run dev -- --profile daily ask "Say hello"
OPENROUTER_API_KEY="sk-or-..." npm run dev -- chat
printf '/mode fusion\n/fusion general-budget\n/theme vivid\n/profile save daily\n/profile use daily\n/models claude\n/credits\n/generation gen_...\n/tests list\n/tests run\n/map\n/code map src\n/code symbols render\n/symbols create\n/web\n/web fetch https://example.com\n/web search openrouter models\n/web browse https://example.com\n/search orx cli\n/browse https://example.com\n/orchestrator openrouter openrouter/fusion\n/delegate add reviewer openrouter anthropic/claude-sonnet-4.5\n/delegates\n/sources\n/cite src-1\n/bibliography\n/mcp\n/mcp enable openrouter\n/mcp allow-model-tool openrouter models-list\n/mcp model enable\n/status\n/new\n/exit\n' | OPENROUTER_API_KEY="sk-or-..." BRAVE_SEARCH_API_KEY="..." npm run dev -- chat
```

If `.orx/config.toml` contains the API key, the `OPENROUTER_API_KEY=...` prefix is not needed. The `.orx/` directory is ignored and must remain uncommitted.

Optional TTY theme config:

```toml
theme = "vivid"
```

Allowed theme values are `default`, `mono`, and `vivid`. Chat supports `/theme` to inspect the current theme and `/theme <value>` to change it for the active session/config. `ORX_TTY_THEME` or `ORX_THEME` can override the configured theme for rendering. `NO_COLOR=1` still forces plain output.

Saved profiles:

```bash
npm run dev -- profile list
npm run dev -- profile save daily
npm run dev -- profile inspect daily
npm run dev -- profile delete daily
npm run dev -- plugins list
npm run dev -- plugins install ./orx-plugin.json
npm run dev -- plugins inspect acme.example@1.0.0
npm run dev -- plugins enable acme.example@1.0.0
npm run dev -- plugins disable acme.example@1.0.0
npm run dev -- --profile daily status
OPENROUTER_API_KEY="sk-or-..." npm run dev -- --profile daily ask "Say hello"
```

Profiles persist model, mode, Fusion preset, theme, and permission posture under `~/.orx/profiles.json`; use `ORX_PROFILE_CONFIG_PATH` for isolated runs. Profiles do not store API keys. In chat, `/profile list`, `/profile save <id>`, `/profile use <id>`, `/profile inspect <id>`, and `/profile delete <id>` manage the same registry. Manual `/model`, `/mode`, `/fusion`, or `/theme` changes clear the active profile label.

Plugin registry commands are no-key and no-network by default. `orx plugins install <manifest-path>` and `/plugins install <manifest-path>` are aliases for inert local manifest registration. Installed plugins remain disabled; enabling a plugin persists only the enabled marker. `orx plugins commands` and `/plugin list` render namespaced aliases derived from enabled prompt commands and bins. `/plugin:<plugin-id>:command:<slug>` activates the matching prompt as untrusted chat context. Trusted current bin hashes can run only through explicit `orx bins run <id> [args...]`, `/bins run <id> [args...]`, or `/plugin:<plugin-id>:bin:<file> [args...]`, with cached-plugin cwd, manifest-declared env only, redacted/truncated output, and JSONL audit logging without raw argument lists. Trusted current hook hashes can run through explicit `orx hooks run <id>` / `/hooks run <id>` and matching lifecycle events with minimal env/cwd and JSONL audit logging. Plugin MCP presets require separate MCP profile enablement/trust plus explicit `/mcp call`/`orx mcp call` or read-only model grants through `/mcp allow-model-tool`/`orx mcp allow-model-tool` before tool execution; custom manifest-defined executable command schemas and other plugin code execution remain inactive.

Native test commands are no-key and local-only. `orx tests list` and `/tests list` discover safe package `test*` scripts, default to `script:test` when present, and fall back to a direct `node --test` target for Node test/spec files when no `test` package script exists. `orx tests run [target-id] [-- args...]` and `/tests run [target-id] [-- args...]` run the default or named target with bounded output and sanitized extra arguments. `/status` and `orx status` show discovered test target counts and the default target. The model-visible native `run_tests` tool runs the same adapter inside `ask`/`chat`, so routine model verification can avoid raw shell commands.

Native code-map commands are no-key and local-only. `orx code map [path]`, `orx map [path]`, `orx code-map [path]`, `/map [path]`, and `/code map [path]` scan a bounded local tree, skip generated/vendor directories, and render language counts, key files, package/config/source entrypoints, and top JavaScript/TypeScript source imports/exports with rendered secret redaction. `orx code symbols [query]`, `orx symbols [query]`, `/code symbols [query]`, and `/symbols [query]` reuse that scan to render exported JavaScript/TypeScript symbols with file paths and line numbers.

In chat, `/model <id-or-search>` resolves through the OpenRouter catalog before changing active state. Exact `provider/model` slugs still work, but unknown friendly names such as `/model deepseek v4` are refused with a `/models <query>` suggestion instead of becoming invalid model ids.

Slash help is grouped and filterable: `/help` shows common commands, `/help all` includes advanced commands, and `/help <query>` filters by name, alias, group, usage, or description. Current aliases include `/m` for `/model`, `/s` for `/status`, `/q` for `/quit`, `/h` for `/help`, and `/exit` as a quit alias.

Command discovery also has `/commands [query]`, with `/palette` as an alias. In TTY/color-capable chat this renders a compact command palette; in non-TTY and `NO_COLOR=1` it renders the deterministic grouped plain palette. Interactive readline sessions complete slash command names and aliases with Tab, for example `/sta<Tab>` -> `/status `. They also complete deterministic subcommands/arguments such as `/mode a<Tab>` -> `auto`, `/web h<Tab>` -> `help`, `/tests r<Tab>` -> `run`, `/code m<Tab>` -> `map`, `/code s<Tab>` -> `symbols`, and `/mcp inspect o<Tab>` -> `openrouter`.

Web research commands are explicit slash commands, not model-autonomous browsing. `/web fetch <url>` fetches a guarded URL directly. `/web search <query>` and `/search <query>` call Brave Web Search only when `BRAVE_SEARCH_API_KEY` is configured; results are stored as secondary provider-snippet evidence and cited as snippets rather than fetched primary pages. `/web browse <url>` and `/browse <url>` create browser evidence snapshots when Playwright is available, using ORX's guarded document fetch before local browser DOM extraction.

Orchestration commands are scaffolds only. `/orchestrator` shows local controller state, `/orchestrator openrouter <model>` stores an inert OpenRouter controller, `/orchestrator clear` clears the controller, `/delegate add <name> openrouter <model>` stores an inert named delegate, `/delegate remove <name>` and `/delegate clear` remove delegates, and `/delegates` lists them. No external calls or `delegate_task` execution exist yet.

`/status` now includes local approximate context and OpenRouter metadata cost meters. `/credits` and `orx credits` now include a live OpenRouter credits usage meter when the credits endpoint returns usable fields. Set `NO_COLOR=1` to force plain output.

TTY chat uses compact model badges in the bottom status notch for OpenRouter routing shortcuts: `openrouter/auto` appears as `model auto` and `openrouter/fusion` appears as `model fusion`. Plain status and non-TTY output keep the full configured model id.

`/status` and `orx status` include the active theme, active profile, and saved profile count. TTY status/composer output, tool summaries, `/credits`, `/commands`, `/palette`, CLI `credits`, and one-shot `ask` tool summaries all use the active theme when color is enabled.

## Planned Environment

```bash
export OPENROUTER_API_KEY="sk-or-..."
export BRAVE_SEARCH_API_KEY="..."
```

## Development Commands

These commands exist after the Phase 1 scaffold.

```bash
npm run dev
npm run build
npm run typecheck
npm test
npm run verify:global-install
```
