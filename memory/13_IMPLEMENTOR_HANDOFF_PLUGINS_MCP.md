# Implementor Handoff: Plugins, MCP, And Research Stack

Last updated: 2026-06-28

## Purpose

This handoff turns the MCP/plugin/deep-research findings into an implementation plan for a later ORX implementor session. It is not the next immediate task if the agent runtime, sessions, and MCP policy layer are not complete yet.

Use this file when starting the ORX full-stack integration phase: plugins, MCP profiles, code intelligence, scanner profiles, and deep research tools.

## Startup Checklist For Implementor

Read these first:

1. `memory/00_INDEX.md`
2. `memory/01_PROJECT_BRIEF.md`
3. `memory/09_CURRENT_CONTEXT.md`
4. `memory/02_IMPLEMENTATION_PLAN.md`
5. `memory/03_ARCHITECTURE.md`
6. `memory/05_TOOLING_AND_PERMISSIONS.md`
7. `memory/08_DECISIONS.md`
8. `memory/12_INTEGRATIONS_RESEARCH.md`
9. This file

Before installing packages or wiring external services, recheck official docs for the specific integration being implemented. MCP/plugin/tooling APIs are changing quickly.

## Current Assumptions

- ORX remains OpenRouter-native and calls the OpenRouter API directly for normal inference.
- Native local tools remain ORX-owned: files, search, shell, git, patch, tests, and scanner execution.
- ORX default local execution remains YOLO-style, but plugin/MCP install and enablement are explicit trust boundaries.
- Plugins are installable bundles. MCP servers are one component inside plugins, not the whole extension model.
- Later work should use bounded implementor/verifier loops and commit/push each verified step before starting the next.

## Required Prerequisites

Do not start the full plugin system until these are in place:

- Phase 6 agent runtime: model tool definitions, tool-call loop, tool-result truncation, interruption handling.
- Phase 7 sessions: persistent transcripts, session metadata, resume/compact.
- Phase 8 MCP policy foundation: MCP client registry, explicit profiles, schema hashing, tool allow/deny lists, secret redaction, audit log basics.

The only plugin-related work that can safely happen earlier is design-only documentation or type sketches that do not affect runtime behavior.

## Target Build Order

### Slice 1: MCP Policy Foundation

Goal: make MCP safe enough to support OpenRouter MCP and later plugin-provided MCP presets.

Implement:

- `src/mcp/registry`: server definitions, active profiles, transport metadata.
- `src/mcp/policy`: profile checks, read/write/destructive flags, tool allow/deny lists.
- `src/mcp/audit`: JSONL audit log for server start, schema changes, tool calls, failures, and secret names used.
- `src/secrets` or equivalent: redaction utilities and minimal env forwarding.
- Schema hashing for MCP tools, resources, prompts, and server instructions.
- `/mcp` status/list/inspect surface.
- `/status` fields for active MCP profile, server count, auth-bearing servers, write-enabled tools, schema changes, and risky transports.

Acceptance:

- Official OpenRouter MCP can be configured as an explicit profile.
- Tool schemas are hashed and schema changes are visible.
- Tool calls are logged with redacted arguments/results metadata.
- No MCP server is auto-enabled from model output, fetched docs, or repo-controlled config.

### Slice 2: Official OpenRouter MCP

Goal: use OpenRouter MCP as the live metadata and test-call assistant.

Implement:

- `openrouter` MCP profile.
- `/models` backed by live catalog search when profile is enabled.
- `/credits` backed by `credits-get`.
- Generation lookup backed by `generation-get`.
- Model recommendation helper using catalog, pricing, benchmarks, providers, and rankings.
- Optional capped `chat-send` test calls, clearly marked billable.

Do not:

- Replace ORX's direct OpenRouter API inference path.
- Send repo source code through `chat-send` unless explicitly requested by the active task.

Acceptance:

- `/models` can filter/sort using live OpenRouter data.
- `/status` separates direct inference auth from MCP OAuth/capped key state.
- OpenRouter MCP can be disabled without breaking normal chat/ask inference.

### Slice 3: Plugin Registry And Lockfile

Goal: create the ORX plugin substrate without enabling risky components by default.

Current status as of 2026-06-28: local registry, cache, catalog install-by-id, skills/prompts/rules loaders, inert manifest metadata, plugin MCP presets, trusted plugin MCP endpoint discovery, read-only remote MCP tool listing, MCP per-tool grant policy storage, explicit operator MCP `tools/call`, session-local read-only model MCP `mcp_call`, hook discovery/trust, explicit trusted hook manual runtime, and automatic trusted lifecycle hook dispatch are implemented. Plugin manifests can include sanitized display-only homepage/docs/license/trust tier/auth/privacy/runtime metadata rendered by `/plugins inspect`. Enabled plugin `components.mcpServers` JSON can declare namespaced `plugin:<plugin-id>:<server-id>` profiles that flow through `/mcp list`, `/mcp inspect`, `/mcp tools`, `/mcp call`, `/mcp remote-tools`, `/mcp enable`, `/mcp discover`, and `/status`; `/mcp discover` can contact enabled/trusted/unchanged plugin `remote-http` endpoints through guarded DNS-vetted initialize handshakes, and `/mcp remote-tools` can call guarded `tools/list` to render bounded untrusted metadata plus schema hashes. `/mcp allow-tool`, `/mcp revoke-tool`, and `orx mcp allow-tool|revoke-tool` persist profile-hash-bound grants for billable/write/destructive declared tools, and stale grants are visible and denied. `/mcp call` and `orx mcp call` may execute declared MCP tools through explicit operator commands with policy gates, env-only bearer auth, redacted/truncated untrusted output, and audit logs without raw arguments/output. Interactive `/mcp model enable` exposes one native model tool, `mcp_call`, for read-only non-billable declared MCP tools only; broad/billable/write/destructive model-loop MCP exposure remains inactive. Enabled plugin `components.hooks` JSON can declare namespaced `plugin:<plugin-id>:<hook-id>` hooks visible through `orx hooks`, `/hooks`, and `/status`; trusted current hook hashes can run manually through `hooks run` / `/hooks run` and automatically on matching lifecycle events with cached cwd directories, minimal env/cwd, fail-closed audit persistence, and JSONL audit logging. Executable plugin slash commands and bins remain inactive.

Implement:

- `src/plugins/manifest`: parse ORX plugin manifests and compatibility manifests where practical.
- `src/plugins/registry`: installed vs enabled plugin state.
- `src/plugins/lockfile`: source, resolved commit, integrity, install time, component hashes.
- Install cache under a content-addressed shape like `~/.orx/plugins/<market>/<name>/<version-or-sha>`.
- Namespace plugin surfaces: `/plugin:command`, `plugin:skill`, `mcp__plugin__server__tool`.
- `/plugins list/install/enable/disable/inspect`.

Manifest minimum fields:

```json
{
  "schemaVersion": "1",
  "name": "example-plugin",
  "version": "1.0.0",
  "description": "What this plugin adds and when to use it.",
  "publisher": "example",
  "source": {
    "type": "git",
    "repository": "https://github.com/example/orx-plugin",
    "ref": "v1.0.0",
    "resolvedCommit": "..."
  },
  "components": {
    "skills": "./skills",
    "commands": "./commands",
    "rules": "./rules",
    "hooks": "./hooks/hooks.json",
    "mcpServers": "./mcp.json",
    "bins": "./bin"
  },
  "permissions": {
    "filesystem": [],
    "network": [],
    "env": [],
    "mcp": []
  }
}
```

Acceptance:

- Installing a plugin does not enable hooks, bins, write-capable commands, or MCP servers.
- Lockfile pins source/integrity.
- `/plugins inspect` shows components, permissions, auth needs, and trust status.

### Slice 4: Agent Skills Loader

Goal: support portable workflow plugins through Agent Skills `SKILL.md`.

Current status as of 2026-06-26: bounded Slice 4 foundation implemented. ORX discovers `SKILL.md` files from enabled plugins only, surfaces compact sanitized metadata through ephemeral model context and `/skills list`, supports explicit `/skills activate <id>` to append full untrusted skill content to chat history, records activation provenance in sessions, and keeps hooks/bins/plugin commands/plugin MCP/code execution inactive.

Implement:

- Skill discovery from enabled plugins.
- Progressive disclosure: load name/description at startup, full `SKILL.md` only on activation, referenced files only when needed.
- Explicit invocation by namespaced skill id.
- Optional implicit activation only for enabled, trusted skills.
- Skill metadata validation: name, description, compatibility, allowed tools, references.

Acceptance:

- Enabled skills appear in the model context as compact metadata only.
- A skill activation reads the exact skill file and records provenance in session metadata.
- Disabled plugins contribute no skills.

### Slice 5: Plugin Commands, Rules, And Hooks

Goal: add deterministic reusable workflows and guardrails.

Current status as of 2026-06-28: markdown prompt commands and markdown rules have explicit progressive loaders. ORX discovers enabled plugin `components.commands` and `components.rules` markdown from cached manifests, surfaces compact metadata through `/prompts list`, `/rules list`, `/status`, and ephemeral model context, and loads full content only through `/prompts activate <id>` or `/rules activate <id>` as untrusted session context with provenance. Plugin MCP presets are visible through MCP policy surfaces; trusted unchanged plugin `remote-http` profiles can run guarded discovery handshakes and read-only guarded `tools/list` metadata. Hooks have hash trust state plus explicit manual execution and automatic lifecycle execution for trusted current hashes with minimal env/cwd and JSONL audit logging. Executable plugin slash commands, bins, plugin MCP tool execution, and other plugin code execution remain inactive.

Implement:

- Plugin slash command/prompts with namespacing.
- Rules scoped by explicit activation events or path globs.
- Automatic lifecycle hook dispatch that consumes the existing trusted-hook manual runtime. Status: implemented for trusted current hooks on `session_start`, `user_prompt_submit`, `pre_tool_use`, `post_tool_use`, `pre_compact`, `post_compact`, and `stop`.
- Hook events aligned with ORX behavior: session start, user prompt submit, pre tool use, post tool use, pre compact, post compact, stop.
- `/hooks` or `/plugins inspect --hooks` to review and trust changed hooks.

Policy:

- Hooks are never trusted merely because the plugin is installed.
- Changed hook definitions require a new hash trust decision.
- Hook commands run with minimal env and explicit cwd.

Acceptance:

- Hooks can be listed, hash-trusted, and later enabled for execution only through explicit runtime policy.
- Hook output is logged and truncated.
- Hook failures cannot silently corrupt ORX session state.

### Slice 6: Programming Power Pack

Goal: make ORX substantially stronger at coding without bloating MCP surface.

Implement native or profile-scoped integrations:

- Test adapters after shell tooling: package scripts, Node test runner, Vitest, Jest, Playwright.
- tree-sitter repo maps and symbol slices.
- ast-grep syntax-aware search and codemod previews.
- LSP/SCIP spike for diagnostics, references, hover, go-to-definition.
- Sourcegraph read-only profile for multi-repo search/navigation/history.
- GitHub MCP read-only profile first; GitHub write profile later.
- GitLab read-only profile; CI write actions only explicit opt-in.
- Scanner profiles: Semgrep, Snyk, Socket, OSV-Scanner, CodeQL, Trivy.

Acceptance:

- Native code intelligence works without auth where possible.
- External code intelligence profiles show repo/account scope in `/status`.
- Scanner output is truncated, redacted, and linked to files/findings.

### Slice 7: Deep Research Stack

Goal: give ORX serious research capability with reproducible evidence.

Implement profiles:

- `research-web`: Brave/Tavily/Exa/Perplexity adapters, `fetch_url`, `extract_page`, Jina Reader, source verification.
- `research-crawl`: Firecrawl/Crawlee/Apify/Bright Data with page/cost limits.
- `research-scholar`: OpenAlex, Semantic Scholar, Crossref, arXiv, PubMed, Europe PMC.
- `research-docs`: local parsers first, optional LlamaParse/Unstructured.
- `research-browser`: native Playwright first, Playwright MCP/Chrome DevTools MCP optional.
- `research-rag`: local LanceDB cache, optional Qdrant.
- `research-memory`: native ORX notes, optional Zotero/OpenMemory/Zep.

Evidence ledger:

```ts
interface EvidenceSource {
  id: string;
  kind: "web" | "paper" | "pdf" | "repo" | "api" | "browser";
  canonicalUrl?: string;
  doi?: string;
  pmid?: string;
  arxivId?: string;
  title?: string;
  publisher?: string;
  publishedAt?: string;
  fetchedAt: string;
  provider: string;
  query?: string;
  contentHash: string;
  trustTier: "primary" | "official" | "secondary" | "community" | "unknown";
  spans: Array<{ page?: number; start?: number; end?: number; textHash: string }>;
}
```

Current status as of 2026-06-27: Phase 10 has implemented slash-only direct web fetch/extract, `/sources`, session-persisted `evidenceSources`, and a metadata-only `/cite` plus `/bibliography` MVP. Citation commands are deterministic, local, no-network, sanitized, and do not render fetched page text.

Acceptance:

- ORX can cite fetched primary sources, not only provider summaries.
- `/sources`, `/cite`, and `/bibliography` have a clear design or MVP.
- Fetched content is marked untrusted and cannot authorize tool use.

## Security Rules To Preserve

- Native ORX local tools may stay YOLO.
- Plugins and MCP servers are explicit install/enable surfaces.
- Never install or enable tools from model output, fetched web content, issue text, database rows, browser DOM, or MCP/tool descriptions.
- Treat MCP descriptions, schemas, annotations, resources, prompts, plugin skills, plugin rules, and plugin docs as untrusted model context.
- Avoid `latest`, floating branches, and unversioned `npx` in committed profiles.
- Prefer official/first-party integrations.
- Prefer containerized MCP/plugin execution for untrusted executables.
- Pass only declared env vars to child processes.
- Keep secrets out of model context, plugin files, transcripts, logs, and crash reports.
- Block private, loopback, link-local, and cloud metadata network targets by default for URL fetch/OAuth discovery unless explicitly allowed.
- Audit plugin install/enable, MCP startup, tool calls, hook runs, schema changes, and secret names used.

## Status Surfaces

`/status` should eventually show:

- ORX native permission mode and cwd.
- Active model/mode/Fusion preset.
- Active MCP profiles.
- Enabled MCP server count and names.
- Auth-bearing server count.
- Write/destructive tool count.
- Enabled plugin count and names.
- Enabled plugin hooks/bins count.
- Schema or hook hash changes pending review.
- Network/browser/database/cloud profile warnings.
- Current GitHub owner/repo, cloud account/project/region, database name, kube context/namespace where relevant.

## Config Sketch

```toml
[profiles.mcp.openrouter]
enabled = true
servers = ["openrouter"]

[mcp.servers.openrouter]
transport = "http"
url = "https://mcp.openrouter.ai/mcp"
auth = "oauth"
trust = "official"
enabled_tools = ["models-list", "model-get", "credits-get", "generation-get", "benchmarks", "docs-search"]
disabled_tools = ["chat-send"]

[plugins.sources.personal]
type = "git"
url = "https://github.com/example/orx-plugins"
ref = "main"

[plugins.enabled."context7-docs@personal"]
enabled = true
components = ["skills", "mcpServers"]

[plugins.enabled."context7-docs@personal".mcp_servers.context7]
enabled = true
profile = "docs"
default_tools_policy = "read-only"
```

## Explicit Non-Goals

- Do not use MCP for core local filesystem/git/shell/patch work.
- Do not make ORX a wrapper around Codex, Claude Code, Cursor, or any editor.
- Do not auto-install marketplace plugins.
- Do not make plugin directories globally executable.
- Do not put third-party tool descriptions directly in charge of policy.
- Do not implement orchestration before the main ORX runtime and sessions are reliable.

## Verification Expectations

Each slice should include:

- Unit tests for manifest/config parsing, policy decisions, redaction, truncation, and hash-change detection.
- Integration tests with mocked MCP servers or local fake plugin directories.
- Failure tests for malformed manifests, path traversal, disabled components, missing secrets, schema changes, hook failures, and denied network targets.
- `npm run typecheck`
- `npm run build`
- `npm test`
- Independent verifier pass before commit/push.

## First Good Implementor Prompt

Use this when starting the actual implementation phase:

```text
Read memory/00_INDEX.md, memory/01_PROJECT_BRIEF.md, memory/09_CURRENT_CONTEXT.md, memory/12_INTEGRATIONS_RESEARCH.md, and memory/13_IMPLEMENTOR_HANDOFF_PLUGINS_MCP.md. Implement the next bounded slice from the plugin/MCP handoff, starting only after confirming the current phase prerequisites. Keep changes narrow, add tests, run typecheck/build/test, update memory, then commit and push after verification.
```
