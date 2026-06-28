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
orx plugins catalog
orx plugins install ./orx-plugin.json
orx plugins install acme.example@1.0.0
orx plugins inspect acme.example@1.0.0
orx plugins enable acme.example@1.0.0
orx plugins disable acme.example@1.0.0
orx hooks list
orx hooks inspect plugin:acme.example@1.0.0:format
orx hooks trust plugin:acme.example@1.0.0:format
orx hooks run plugin:acme.example@1.0.0:format
orx hooks untrust plugin:acme.example@1.0.0:format
```

Plugin install/register stores an inert local registry record plus an ORX-owned cache snapshot of the sanitized manifest, declared components, and declared hook cwd directories. By default the registry lives at `~/.orx/plugins/registry.json`, the cache at `~/.orx/plugins/cache`, the hook trust file at `~/.orx/plugins/hooks.json`, the hook audit log at `~/.orx/audit/hooks.jsonl`, and the optional local catalog at `~/.orx/plugins/catalog.json`; use `ORX_PLUGIN_REGISTRY_PATH`, `ORX_PLUGIN_CACHE_DIR`, `ORX_PLUGIN_HOOKS_CONFIG_PATH`, `ORX_PLUGIN_HOOKS_AUDIT_PATH`, and `ORX_PLUGIN_CATALOG_PATH` to isolate them. Enabling a plugin only enables its metadata, skills, prompt-command, rules, MCP preset, and hook review/trust surfaces where supported. Trusted current hooks can run manually or on matching lifecycle events. Plugin-declared MCP tools run only after the resulting MCP profile is separately enabled/trusted and invoked through the explicit or read-only model MCP gates; bins and executable plugin commands remain inactive.

Catalog files are local JSON:

```json
{
  "version": 1,
  "entries": [
    {
      "id": "acme.example@1.0.0",
      "description": "Example plugin.",
      "manifestPath": "./example/orx-plugin.json",
      "tags": ["example"]
    }
  ]
}
```

Plugin manifests may include optional inert `metadata` for risk display, such as `trustTier`, `homepage`, `documentation`, `license`, `auth`, `privacy`, and `runtime`. ORX sanitizes those fields for `/plugins inspect`; they do not grant permissions or activate executable surfaces.

Enabled plugins can declare MCP presets through `components.mcpServers`. ORX reads these declarations from the cached plugin snapshot, namespaces them as `plugin:<plugin-id>:<server-id>`, includes them in `/mcp list`, `/mcp inspect`, `/mcp tools`, `/mcp call`, `/mcp remote-tools`, `/mcp enable`, `/mcp discover`, and `/status`, and hashes plugin manifest/component provenance for schema-change visibility. `orx mcp ...` also exposes local profile/policy inspection, profile enable/disable, per-tool grant/revoke, and explicit tool calls without requiring an OpenRouter chat API key. `/mcp discover` may contact enabled, trusted, unchanged plugin `remote-http` endpoints through ORX's guarded DNS-vetted discovery transport, but it performs only the minimal initialize handshake. `/mcp remote-tools` can list and hash remote `tools/list` metadata through the same guards; tool schemas are rendered only as hashes/summaries. `/mcp call <profile> <tool> [json]` and `orx mcp call <profile> <tool> [json]` call `tools/call` only for enabled/trusted/unchanged profiles when policy allows the declared tool and required bearer auth is supplied through `ORX_MCP_BEARER_<PROFILE>` or `ORX_MCP_BEARER_TOKEN`. Billable/write/destructive MCP tools require explicit per-tool grants bound to the current trusted profile hash, and stale grants are visible and denied. In interactive chat, `/mcp model enable` exposes one model-visible native tool, `mcp_call`, for read-only non-billable declared MCP tools only; `/mcp model disable` removes it again. Broad/billable/write model-loop MCP exposure remains inactive.

Enabled plugins can declare hook definitions through `components.hooks`. ORX reads those declarations from the cached plugin snapshot, namespaces them as `plugin:<plugin-id>:<hook-id>`, shows them through `orx hooks`, `/hooks`, and `/status`, and lets the operator persist a trusted hook hash. `orx hooks run <id>` and `/hooks run <id>` execute only trusted current hashes, run from the cached plugin root or declared relative cwd, forward only declared env names, truncate/redact output, and append JSONL audit events. Trusted current hooks also run automatically on matching `session_start`, `user_prompt_submit`, `pre_tool_use`, `post_tool_use`, `pre_compact`, `post_compact`, and `stop` lifecycle events. Hook failures are written to stderr and audited; successful hook commands whose audit event cannot be persisted are treated as failed runs. Changed hook hashes show as pending trust until re-trusted.

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
/plugins [catalog|list|inspect|register|install|enable|disable]
/skills [list|status|activate]
/prompts [list|status|activate]
/rules [list|status|activate]
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
