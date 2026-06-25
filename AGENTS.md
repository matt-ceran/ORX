# ORX Agent Guidance

## Purpose

ORX is an OpenRouter-native terminal coding agent. It should feel like a polished professional coding CLI while remaining independent from Codex branding and private internals.

## Startup Context Protocol

At the start of a new Codex session in this repository:

1. Read `memory/00_INDEX.md`.
2. Read `memory/01_PROJECT_BRIEF.md`.
3. Read `memory/09_CURRENT_CONTEXT.md`.
4. Read additional memory files only as needed using the retrieval map in `memory/00_INDEX.md`.

This keeps startup context small while preserving a complete project memory system.

## Working Rules

- Prefer TypeScript and Node.js for the CLI unless a later decision record changes this.
- Keep the CLI OpenRouter-native, not a wrapper around Codex.
- Implement user-facing behavior through clear slash commands and config profiles.
- Default ORX runtime permissions are intended to be YOLO-style: no approval prompts and full local access. Keep that visible in `/status`.
- Never copy Codex branding, private prompts, exact assets, or proprietary implementation details.
- Use local structured memory files for durable project context instead of relying on chat history.
- For implementation work, use bounded implementor/verifier loops when possible: implement a step, verify it in a separate agent context, fix any findings, then commit and push the verified step before starting the next step.

## Memory Update Rules

After meaningful project work:

- Update `memory/09_CURRENT_CONTEXT.md` with what changed and the next likely task.
- Update `memory/10_BACKLOG.md` when adding, completing, or reprioritizing tasks.
- Append to `memory/08_DECISIONS.md` when a durable technical decision is made.
- Update the relevant topic file when architecture, API behavior, UI behavior, permissions, or tooling changes.

Keep memory entries concise, factual, and easy to scan.
