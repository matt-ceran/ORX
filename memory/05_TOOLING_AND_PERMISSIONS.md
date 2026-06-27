# Tooling And Permissions

Last updated: 2026-06-26

## Default Permission Policy

ORX is intended to default to unrestricted execution:

```toml
approval_policy = "never"
sandbox_mode = "danger-full-access"
```

The CLI should not ask for permission before running local shell commands, editing files, searching, or using network-enabled tools. This is deliberate for personal use.

## Visibility Requirement

Even though prompts are bypassed, `/status` must show:

- permission mode
- current working directory
- whether shell access is enabled
- whether network tools are enabled
- whether destructive command warnings are enabled

## Initial Tool Set

| Tool | Purpose |
| --- | --- |
| `read_file` | Read text files with truncation controls |
| `list_files` | List directory contents |
| `search_files` | Search with `rg` when available |
| `shell` | Run shell commands |
| `git_diff` | Show working tree changes |
| `apply_patch` | Apply structured file edits |

## Patch Policy

- Prefer structured patches over blind rewrites.
- Show changed files in the TUI after edits.
- Keep a session-level diff summary for `/diff`.
- Structured patches are preflighted before writes so malformed patch plans do not partially mutate files.
- Unified patches use `git apply --check` before `git apply`.

## Shell Policy

- Use a PTY when interactive output matters.
- Use plain execution for deterministic commands.
- Capture exit code, stdout, stderr, duration, and cwd.
- Truncate very large output before returning it to the model.
- Preserve UTF-8 byte bounds when truncating output.
- Honor active `AbortSignal` cancellation for shell/process execution and return a bounded `ABORTED` tool error instead of leaking uncaught errors.

## Current Native Tool Modules

Implemented under `src/tools/`:

- `read_file`
- `list_files`
- `search_files`
- `shell`
- `git_diff`
- `apply_patch`

The tools remain standalone and testable. Phase 6 now exposes them to models through `src/agent/` with OpenRouter-compatible schemas, argument sanitation, and bounded JSON result envelopes.

## MCP And Third-Party Tool Policy

- Keep core local coding tools native: file reads, file writes, search, shell, patches, and local git.
- Use MCP for external systems, vendor SaaS, live provider metadata, docs lookup, and optional browser/debug integrations.
- MCP servers should be explicit config, not automatic defaults, even though ORX's local runtime defaults to unrestricted execution.
- Plugins should also be explicit install/enable surfaces. Installing a plugin should not automatically enable its hooks, MCP servers, binaries, or write-capable commands.
- Prefer official or first-party MCP servers over community wrappers.
- Pin local MCP packages, plugin sources, or container images when practical.
- Show MCP/plugin risk metadata in `/status`: server/plugin name, transport, source URL/package, version pin, resolved commit/digest, tool count, auth source, write-enabled flag, enabled hooks/bins, and last tool-schema change when known.
- Use profiles to separate read-only, browser, docs, database, cloud-readonly, and cloud-write tool sets.
- Treat all fetched web, issue tracker, database, browser, MCP output, MCP schemas, plugin skills, plugin rules, plugin docs, and plugin command prompts as untrusted model context.
- Block or warn on MCP/plugin tools that can expose secrets, execute arbitrary commands, mutate production data, or access broad cloud credentials.
- Store MCP schema hashes and hook definition hashes. Changed schemas or hooks require visible status before use.
- Keep secrets out of model context, plugin files, logs, transcripts, and crash reports. Forward only declared env vars to child processes.
- Prefer containerized MCP/plugin execution through Docker MCP Toolkit or ToolHive-style isolation for untrusted executable surfaces.
- Add local audit logs for plugin install/enable, MCP startup, tool calls, hook runs, schema changes, and secret names used.

Current Phase 8 scaffold:

- `src/mcp/registry.ts` defines an explicit disabled `openrouter` profile for the official remote HTTP server.
- `src/mcp/policy.ts` exposes status counts for active profiles, active servers, auth-bearing servers, write-enabled tools, policy-allowed tools, policy-denied tools, configured default-denied tools, configured billable tools, configured risky tools, and risky transports.
- The declared-tool policy evaluator is pure and independent of live discovery. Read-only declared tools on enabled, trusted profiles with no pending schema change can be marked `allowed` for future use.
- Billable, write, and destructive declared tools are `denied` by default unless a future explicit allowlist is added. OpenRouter `chat-send` is billable and denied by default.
- Disabled profiles block tools with `blocked_by_profile`; profiles without trusted baselines block with `blocked_by_trust`; pending schema changes block with `blocked_by_schema_change`.
- `src/mcp/discovery.ts` exposes gated manual discovery for enabled/trusted remote HTTP profiles without listing/executing tools in the model loop.
- `/mcp`, `/mcp inspect`, `/mcp tools`, `/mcp discover`, and `/status` show profile state, risk metadata, OAuth/auth-required status, billable/default-denied/risky tool visibility, per-tool policy decisions, and pending schema-change gates.
- No MCP tools are executable yet; direct OpenRouter API helpers currently power models, credits, generation metadata, and normal chat/ask inference.

Current Phase 9 plugin scaffold:

- `src/plugins/` validates and sanitizes ORX plugin manifests before storing them.
- Plugin registry state is ORX-owned operator state outside repositories, defaulting to `~/.orx/plugins/registry.json` with `ORX_PLUGIN_REGISTRY_PATH` for tests and isolated runs.
- Registering a local manifest computes a stable plugin id, manifest hash, lock-style integrity record, install time, source metadata, and bounded local component hashes when files/directories are available.
- Git source manifests must include a pinned `resolvedCommit`; floating refs can be recorded as context but cannot be the lock pin.
- Manifest and loaded registry display fields reject secret-like values and terminal control characters before they can be stored or rendered.
- Registering stores plugins disabled by default. `/plugins enable` and `/plugins disable` persist only an inert enabled flag.
- Enabled plugins can contribute Agent Skills metadata only. Skill discovery is bounded to `components.skills` root `SKILL.md` files and immediate child `SKILL.md` files, omits unsafe/oversized metadata, and exposes compact metadata through `/skills list`, `/status`, and ephemeral model context.
- Skill discovery requires a safe absolute manifest path in the ORX-owned registry record and fails closed for malformed registry state.
- Full `SKILL.md` content is loaded only through explicit `/skills activate <id>`, rejects secret-like values and terminal control characters before model/session use, then stores safe content as an untrusted system message and records provenance in session metadata.
- Activated skill context is pruned from chat messages and session provenance when the backing plugin/skill is no longer enabled.
- Skill content and metadata cannot authorize tool use, permission changes, MCP enablement, hooks, bins, plugin commands, or command execution.
- Hooks, bins, plugin MCP servers, plugin slash commands, and all plugin code execution are inactive in this scaffold even when a plugin is marked enabled.
- `/plugins inspect`, `/skills`, and `/status` show this trust boundary explicitly; enabled hook/bin/MCP counts remain `0`.

Current Phase 10 research scaffold:

- `src/research/` exposes slash-only direct URL fetch/extract helpers and evidence ledger metadata.
- `/web fetch <url>` and `/fetch <url>` are explicit operator commands; there is no model-autonomous `fetch_url` tool yet.
- Production web fetch uses ORX's Node-native guarded transport, not the generic OpenRouter metadata `fetch` hook. Tests can inject a separate `webFetch` transport.
- The transport resolves DNS before connecting, rejects any local/private/shared/reserved/documentation/multicast or metadata resolved address, then binds the request to a vetted address while preserving the original hostname for host/SNI/certificate validation.
- Fetch uses timeout coverage across DNS/request/header/body-read phases, byte/text bounds, guarded redirects, sanitized errors, terminal-control stripping before rendering/context insertion, canonical URL redaction for secret-like path/query data, and stable SHA-256 content/text hashes.
- URL guard defaults allow only `http`/`https` and block localhost, loopback, private IPv4, link-local, shared/reserved/documentation/multicast IPv4, IPv6 loopback/link-local/unique-local/multicast, IPv4-mapped local IPv6, obvious cloud metadata hosts/IPs, and embedded credentials before network.
- Fetched content is always marked untrusted in chat context and cannot authorize tool use, permission changes, MCP/profile/plugin enablement, hooks, bins, command execution, policy changes, or instruction priority changes.
- `/sources` renders source ids, URLs, titles, fetchedAt, hashes, trust tier, and provider, not full page text.
