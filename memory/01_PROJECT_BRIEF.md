# Project Brief

Last updated: 2026-06-25

## One-Liner

ORX is a personal OpenRouter-native terminal coding agent with a professional TUI, strong model-routing controls, Fusion support, local coding tools, and unrestricted default execution.

## Primary Goal

Build a dedicated CLI that makes OpenRouter feel first-class for coding-agent workflows:

- exact model selection
- `openrouter/auto` routing
- `openrouter/fusion`
- Fusion presets and later custom panels
- local codebase editing
- shell execution
- file search
- diffs and patches
- persistent sessions
- cost and token visibility

## Non-Goals

- Do not build a branded Codex clone.
- Do not depend on Codex CLI as the runtime.
- Do not copy proprietary prompts, UI assets, or internal implementation details.
- Do not commercialize assumptions into the design unless the project direction changes.

## Default Posture

ORX is for personal use. The intended default is unrestricted:

```toml
approval_policy = "never"
sandbox_mode = "danger-full-access"
```

The CLI should still make this visible in `/status` so the operator always knows the current risk posture.

## Repository

- Local path: `/Users/draingang/Documents/ORX`
- GitHub: `https://github.com/matt-ceran/ORX`
- Visibility: public
- Default branch: `main`

