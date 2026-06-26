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
