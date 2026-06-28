# ORX Memory Index

Last updated: 2026-06-28

This directory is the durable memory system for ORX. New Codex sessions should use this file as the routing table, then open only the memory files needed for the task.

## Minimum Startup Read

Always read these first:

1. `memory/00_INDEX.md`
2. `memory/01_PROJECT_BRIEF.md`
3. `memory/09_CURRENT_CONTEXT.md`

## Retrieval Map

| Key | File | Read when you need |
| --- | --- | --- |
| `brief` | `01_PROJECT_BRIEF.md` | Product goal, non-goals, default posture |
| `plan` | `02_IMPLEMENTATION_PLAN.md` | Phased build plan and milestone order |
| `arch` | `03_ARCHITECTURE.md` | Runtime architecture, module boundaries, data flow |
| `openrouter` | `04_OPENROUTER_INTEGRATION.md` | Model modes, Fusion, API, cost tracking, MCP usage |
| `tools` | `05_TOOLING_AND_PERMISSIONS.md` | Local tools, shell behavior, file edits, YOLO defaults |
| `ui` | `06_TUI_DESIGN.md` | Terminal interface structure, slash commands, visual behavior |
| `sessions` | `07_SESSIONS_AND_MEMORY.md` | Transcript storage, context compaction, memory update protocol |
| `decisions` | `08_DECISIONS.md` | Durable architecture and product decisions |
| `current` | `09_CURRENT_CONTEXT.md` | Current repo state, latest changes, next likely work |
| `backlog` | `10_BACKLOG.md` | Prioritized implementation tasks |
| `commands` | `11_COMMANDS.md` | Local commands, setup steps, GitHub repo details |
| `integrations` | `12_INTEGRATIONS_RESEARCH.md` | MCP/plugin/tool research, integration priorities, security posture |
| `integration-handoff` | `13_IMPLEMENTOR_HANDOFF_PLUGINS_MCP.md` | Later-phase implementor handoff for plugins, MCP policy, advanced tooling, and research stack |
| `phase6` | `14_PHASE_6_AGENT_RUNTIME.md` | Focused handoff for the OpenRouter agent runtime and tool-call loop |
| `ux-recovery` | `15_PHASE_12_UX_RECOVERY_HANDOFF.md` | Urgent handoff for model resolution, bottom-oriented TUI polish, simpler commands, and global `orx` launch |

## Retrieval Patterns

- For implementation work, read `brief`, `current`, `plan`, and the specific topic file for the change.
- For Phase 6 agent-runtime work, read `phase6`, then `arch`, `openrouter`, and `tools`.
- For UI work, read `ui`, `current`, and `decisions`.
- For the next UX recovery session, read `ux-recovery`, `ui`, `commands`, `backlog`, and `current`.
- For OpenRouter behavior, read `openrouter`, `plan`, and `decisions`.
- For tool execution or local file editing behavior, read `tools`, `sessions`, and `decisions`.
- For planning a new milestone, read `plan`, `backlog`, `current`, and `decisions`.
- For plugin/MCP/research implementation, read `integrations`, `integration-handoff`, `arch`, `tools`, and `decisions`.

## Update Protocol

After a substantive change:

1. Update `09_CURRENT_CONTEXT.md`.
2. Update `10_BACKLOG.md`.
3. Append a decision to `08_DECISIONS.md` if the change affects long-term direction.
4. Update the relevant topic file if implementation reality has diverged from the documented plan.

Use absolute dates in memory updates.
