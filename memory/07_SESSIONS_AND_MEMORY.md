# Sessions And Memory

Last updated: 2026-06-25

## Session Storage

Target location:

```text
~/.orx/sessions/
```

Each session should store:

- session id
- started and updated timestamps
- cwd
- git repo metadata
- active model and mode
- Fusion config
- messages
- tool calls and summarized outputs
- token and cost metadata

## Resume

`/resume` should list previous sessions by:

- title or first prompt
- cwd
- last updated time
- model and mode
- cost

## Context Compaction

`/compact` should summarize older turns while preserving:

- active task
- relevant files
- decisions made
- commands run
- failures and fixes
- next steps

## Repo Memory

The `memory/` directory is for durable project context, not full transcripts. Keep it curated.

Use:

- `09_CURRENT_CONTEXT.md` for the current repo state.
- `08_DECISIONS.md` for durable decisions.
- `10_BACKLOG.md` for next work.

