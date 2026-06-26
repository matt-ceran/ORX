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
- activated plugin skill provenance when `/skills activate <id>` has been used

Session config snapshots do not persist API keys. Git remote URLs redact credential userinfo before persistence.

Activated skill provenance stores ids, plugin ids, names, file paths, content hashes, source manifest hashes, and activation timestamps. The full activated `SKILL.md` text lives in the explicit untrusted system message that was added to the transcript during activation.

Future session fields should add:

- active orchestrator
- configured delegates
- tool calls and summarized outputs
- delegate task inputs and summarized results
- aggregate token and cost metadata

## Resume

Implemented for interactive chat.

`/resume` with no selector lists recent transcript-bearing sessions by:

- title or first prompt
- cwd
- last updated time
- model and mode
- cost
- message count

`/resume <number|id|prefix|latest>` loads a saved session and restores:

- transcript messages
- latest OpenRouter metadata
- active model, mode, and Fusion preset
- active chat cwd from the saved session

Exact id and prefix selection search all transcript-bearing saved sessions, not only the displayed recent list. Ambiguous prefix output is capped, non-numbered, and asks for an exact id or longer unique prefix.

Blank startup session files are omitted from `/resume` lists.

## Context Compaction

Current behavior:

- `runAgentTurn` applies default request-shaping boundaries before OpenRouter requests.
- `/compact` performs local extractive compaction on chat messages and persists compacted messages to the active session JSON.
- Resuming a compacted session restores the compacted summary and recent suffix.
- `/status` reports `compacted=yes` after a compacted session is resumed.
- Compacted summaries use clear provenance: `ORX compacted prior context locally`.
- Minimal sessions with no compactable prefix are left unchanged and reported as unchanged.

Persistent compaction summarizes older turns while preserving:

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
