# Decisions

Last updated: 2026-06-26

Use this file for durable technical and product decisions. Add newest decisions at the top.

## 2026-06-26: Expose Native Local Tools By Default In Agent Turns

Decision: `orx ask` and `orx chat` should send ORX-owned native local coding tool schemas by default and let OpenRouter models call those tools automatically during the guarded agent loop.

Reasoning: ORX is intended to be a coding agent, not only a chat client. The native tools are deterministic, locally owned, bounded, and aligned with ORX's YOLO-style default permissions. Automatic use lets capable models inspect, search, run commands, view diffs, and apply patches when useful, while plugin/MCP surfaces remain explicit trust boundaries.

## 2026-06-25: Add ORX Plugins As Installable Bundles

Decision: ORX should support a first-class plugin system where a plugin can bundle skills, slash commands/prompts, rules, lifecycle hooks, MCP server presets, named delegates, docs/context providers, assets, and optional scoped binaries.

Reasoning: Second-pass ecosystem research showed that mature coding-agent extension systems are converging on installable bundles, while MCP is only one component inside those bundles. ORX should treat the open Agent Skills `SKILL.md` format as the portable workflow unit and use progressive loading to keep context small.

## 2026-06-25: Treat Plugin And MCP Enablement As The Trust Boundary

Decision: ORX can keep YOLO-style native local execution, but plugins and MCP servers must require explicit install/profile enablement, source pinning, schema hashing, secrets isolation, risk visibility, and audit logging.

Reasoning: MCP servers, plugin hooks, and plugin binaries are executable supply-chain surface. Tool descriptions, schemas, resources, fetched content, and plugin instructions can also carry prompt-injection or tool-poisoning attacks. Since ORX will not prompt on every local action by default, policy must be enforced at install/profile/runtime boundaries outside the model loop.

## 2026-06-25: Use Evidence Ledgers For Deep Research

Decision: ORX research tools should store an evidence ledger for each research run, including source identifiers, canonical URLs or DOI/PMID/arXiv ids, fetched dates, content hashes, extracted spans, provider/query metadata, and trust tier.

Reasoning: Deep research needs reproducible citation handling and source verification. Provider summaries from web or research APIs should be treated as secondary until ORX fetches and records the cited primary sources directly.

## 2026-06-25: Prefer Native Core Tools And Profile-Scoped MCP

Decision: ORX should implement core local coding capabilities natively and use MCP as an explicit, profile-scoped integration layer for external systems.

Reasoning: File/search/shell/git/patch operations are central to ORX and need predictable behavior, concise schemas, diff visibility, and tight session metadata. MCP is better for vendor APIs, docs, provider metadata, SaaS tools, databases, cloud services, and optional browser/debug integrations, but each server expands tool surface, token load, credential exposure, and prompt-injection risk.

## 2026-06-25: Use Official MCP Servers First

Decision: ORX should prefer official or first-party MCP servers and avoid low-signal community wrappers unless there is a specific need and the package is pinned/audited.

Reasoning: Current MCP discovery is fragmented. Official registries and community directories are useful for discovery but are not sufficient trust signals. Mature first-party sources now exist for GitHub, Playwright, Chrome DevTools, Context7, Figma, Supabase, Linear, Atlassian, Sentry, Cloudflare, AWS, Azure, and others.

## 2026-06-25: Commit Verified Implementation Steps

Decision: Each bounded implementation step should be independently verified, then committed and pushed to GitHub before the next step begins.

Reasoning: ORX development should preserve professional checkpoints with clean, reviewable history. The implementor/verifier loop catches structural issues before changes become the baseline for the next phase.

## 2026-06-25: Add Orchestration Profiles Later

Decision: ORX should eventually support orchestration profiles with one selectable controller and a pool of named delegates.

Reasoning: The operator wants to choose whether the controller is an OpenRouter model or an external agent such as Codex, then let that controller delegate subtasks to OpenRouter models, Codex, Devin, or future adapters. ORX should own this routing and expose it through a `delegate_task` tool instead of treating external agents as OpenRouter models.

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
