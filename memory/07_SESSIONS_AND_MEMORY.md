# Sessions And Memory

Last updated: 2026-06-26

## Session Storage

Current target location:

```text
~/.orx/sessions/
```

The directory can be overridden with `ORX_SESSION_DIR`. Relative overrides resolve from the active cwd.

Session directories are created with `0700` permissions and JSON session files with `0600` permissions.

Current Phase 7 foundation stores:

- session id
- started and updated timestamps
- cwd
- git repo metadata
- active model and mode
- Fusion config
- messages
- latest OpenRouter metadata
- first-user-message summary/title
- message count

Session config snapshots do not persist API keys. Git remote URLs redact credential userinfo before persistence.

Future session fields should add:

- active orchestrator
- configured delegates
- tool calls and summarized outputs
- delegate task inputs and summarized results
- aggregate token and cost metadata

## Resume

Not implemented yet.

`/resume` should list previous sessions by:

- title or first prompt
- cwd
- last updated time
- model and mode
- cost

## Context Compaction

Current runtime scaffold:

- `runAgentTurn` applies default request-shaping boundaries before OpenRouter requests.
- `/compact` performs local extractive compaction on in-process chat messages.
- Compacted summaries use clear provenance: `ORX compacted prior context locally`.
- Persistent transcript/session-aware compaction remains Phase 7 work.

Future persistent sessions:

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
