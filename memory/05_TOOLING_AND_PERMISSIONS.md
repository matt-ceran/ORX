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

