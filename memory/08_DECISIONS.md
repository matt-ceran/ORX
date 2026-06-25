# Decisions

Last updated: 2026-06-25

Use this file for durable technical and product decisions. Add newest decisions at the top.

## 2026-06-25: Build ORX As OpenRouter-Native

Decision: ORX will call OpenRouter directly instead of wrapping Codex CLI.

Reasoning: Direct OpenRouter integration gives full control over model slugs, `openrouter/auto`, `openrouter/fusion`, plugin config, cost tracking, and provider-specific features.

## 2026-06-25: Use A Codex-Friendly Memory System

Decision: Add root `AGENTS.md` plus numbered files in `memory/`.

Reasoning: Codex automatically loads `AGENTS.md`, while the indexed memory directory keeps broader project context retrievable without overloading every session.

## 2026-06-25: Default ORX Permissions Are YOLO-Style

Decision: ORX should default to no approval prompts and full local execution.

Reasoning: The CLI is for personal use, and the operator explicitly wants speed and no permission interruptions. The current permission state must still be visible in `/status`.

## 2026-06-25: Use TypeScript And Node.js First

Decision: Use TypeScript and Node.js unless later implementation evidence justifies a change.

Reasoning: OpenRouter-compatible clients, MCP SDKs, Playwright, terminal UI libraries, validation libraries, and shell tooling are strongest and fastest to wire together in this ecosystem.

