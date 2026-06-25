# Tooling And Permissions

Last updated: 2026-06-25

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

## Shell Policy

- Use a PTY when interactive output matters.
- Use plain execution for deterministic commands.
- Capture exit code, stdout, stderr, duration, and cwd.
- Truncate very large output before returning it to the model.

## MCP And Third-Party Tool Policy

- Keep core local coding tools native: file reads, file writes, search, shell, patches, and local git.
- Use MCP for external systems, vendor SaaS, live provider metadata, docs lookup, and optional browser/debug integrations.
- MCP servers should be explicit config, not automatic defaults, even though ORX's local runtime defaults to unrestricted execution.
- Prefer official or first-party MCP servers over community wrappers.
- Pin local MCP packages or container images when practical.
- Show MCP risk metadata in `/status`: server name, transport, source URL/package, version pin, tool count, auth source, write-enabled flag, and last tool-schema change when known.
- Use profiles to separate read-only, browser, docs, database, cloud-readonly, and cloud-write tool sets.
- Treat all fetched web, issue tracker, database, browser, and MCP output as untrusted model context.
- Block or warn on MCP tools that can expose secrets, execute arbitrary commands, mutate production data, or access broad cloud credentials.
