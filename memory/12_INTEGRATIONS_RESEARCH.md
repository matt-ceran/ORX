# MCP, Plugins, And Integrations Research

Last updated: 2026-06-29

## Research Summary

Current MCP and plugin discovery is broad but uneven. Use official registries, vendor ownership, GitHub stars/downloads, release recency, package/container provenance, and security posture as signals, but do not treat any registry or marketplace as a trust boundary.

Second-pass research expanded beyond MCP servers into installable plugin systems, coding-agent skills, hooks, slash commands, browser/research tooling, code intelligence, scanner profiles, and plugin security.

## ORX Integration Principle

- Build native tools for core local coding: filesystem reads/writes, search, shell, patching, local git, tests, and local scanner execution.
- Treat plugins as installable bundles. MCP servers are one plugin component, not the whole plugin system.
- Use MCP for external systems and optional integrations: OpenRouter metadata, GitHub API, docs lookup, browser automation/debugging, issue trackers, databases, cloud/devops, design tools, and observability.
- Prefer official/first-party MCP servers.
- Enable plugins and MCP through explicit profiles rather than automatic defaults.

## What Was Already Found

- Keep file/search/shell/git/patch native instead of relying on broad filesystem/git MCP servers.
- Use OpenRouter MCP or equivalent for live models, pricing, rankings, credits, benchmarks, docs, and generation lookup.
- Add profile-scoped MCP presets for docs, browser, GitHub read-only, Sentry read-only, Figma, database dev, and cloud read-only/write modes.
- Prefer official/first-party MCP servers; treat community registries as discovery, not trust.
- Show MCP server risk metadata in `/status`.
- Require explicit config for auth-bearing, write-capable, cloud, database, browser, and web-fetch tools.

## Second-Pass Findings

- OpenRouter now has an official hosted MCP server, announced on 2026-06-25, exposing live model catalog, pricing, benchmarks, rankings, credits, generation lookup, docs search, providers, and billable test calls. Use it as a development assistant, not as ORX's inference path.
- Plugin systems in Codex, Claude Code, Cursor, VS Code, Windsurf, Continue, and OpenHands converge around bundles of skills, commands/prompts, rules, hooks, MCP config, subagents, docs/context, and optional executables.
- The open Agent Skills `SKILL.md` format is the strongest portable workflow unit. ORX should support progressive skill loading: startup sees only names/descriptions, full instructions load only when used, and references load on demand.
- Programming depth needs native layers beyond MCP: tree-sitter, ast-grep, LSP, SCIP/LSIF-style indexes, test-runner adapters, security scanners, and CI readers.
- Deep research should be profile-based: web search, crawl/scrape, scholarly metadata, document parsing, browser research, local RAG cache, and an evidence ledger.
- MCP/plugin security needs install/profile consent, package/container pinning, schema hashing, secret isolation, SSRF guards, sandboxed execution where possible, and local audit logs.

## ORX Plugin Model

ORX plugins should be installable directories or locked Git/catalog entries that can include:

- `skills/` using Agent Skills `SKILL.md`
- slash commands or prompt files
- rules/instructions scoped by path or activation event
- lifecycle hooks
- MCP server presets
- named subagents/delegates
- docs/context providers
- optional `bin/` scripts or helper executables
- assets and templates

Install/runtime shape:

- Store installs under a content-addressed cache such as `~/.orx/plugins/<market>/<name>/<version-or-sha>`.
- Keep installed state separate from enabled state.
- Namespace all plugin-provided surfaces: `/plugin:command`, `plugin:skill`, and `mcp__plugin__server__tool`.
- Keep plugin binaries scoped to ORX execution; do not add them to the user's global `PATH`.
- Current implementation supports local manifest paths, local catalog manifest paths, and pinned git catalog entries. Git catalog installs require a full commit pin, clone with shell-disabled bounded `git`, checkout that exact commit, normalize cached manifest provenance to the catalog pin, and then register the plugin disabled/inert.
- Current implementation supports local plugin catalog inspect/editor/update-check/update-apply commands, `orx plugins catalog inspect|updates|update|add-local|add-git|remove` and `/plugins catalog inspect|updates|update|add-local|add-git|remove`, as private local declaration review, local pinned-commit comparison, explicit pinned update application, and management only. Update apply reuses the existing pinned git install path and registers the updated snapshot disabled; the catalog commands do not discover remote updates, preserve enabled state automatically, trust, grant, or execute plugin surfaces. `orx plugins review [--json]` and `/plugins review [--json]`, with `doctor` and `audit` aliases, summarize installed/enabled state, local catalog pin drift, bin/hook trust, plugin MCP profiles, command aliases, and next commands without network, execution, state mutation, or chmod side effects; JSON output emits ORX-owned read-only metadata with explicit no-side-effect authority fields.
- Current implementation also supports local user MCP profile catalogs at `~/.orx/mcp/profile-catalog.json` or `ORX_MCP_PROFILE_CATALOG_PATH`. These are operator-controlled `remote-http` declarations namespaced as `user:<profile-id>` and routed through the same MCP enable/trust/tool-grant/model-grant gates as built-in and plugin profiles. `orx mcp catalog|add-profile|remove-profile|add-tool|remove-tool` and matching `/mcp ...` commands edit that private local catalog without hand-writing JSON. `orx mcp presets`, `orx mcp presets inspect <preset>`, `orx mcp add-preset <preset>`, and matching slash commands review or install disabled provider templates for `context7`, `microsoft-learn`, `github-readonly`, `github-write`, `gitlab-readonly`, `gitlab-ci-write`, `sourcegraph-github-readonly`, `sentry-readonly`, `figma`, `browser`, `cloudflare-docs`, and `cloudflare-api` into the same catalog. Presets can carry profile-level risk/write-capable metadata; remote tool import preserves stricter existing declarations and skips undeclared remote tools on high-risk/write-capable profiles. `orx mcp auth <profile>` and `/mcp auth <profile>` provide no-network bearer readiness checks for env credentials plus optional macOS Keychain opt-in status without persisting or printing secrets, and now render provider-specific credential source/lifetime/scope/setup hints for recognized exact OpenRouter, GitHub, GitLab, Sourcegraph, Cloudflare, Figma, Sentry, Context7, and Microsoft Learn MCP endpoints. `orx mcp auth setup|env <profile>` and `/mcp auth setup|env <profile>` render copyable placeholders only for auth-required profiles and do not call network, spawn subprocesses, or write config beyond normal redacted audit metadata. Provider-specific guidance is selected only by parsed HTTPS endpoint host/path; spoofed or unknown profiles render generic bearer guidance. `orx mcp auth init|env-file <profile>` and matching slash commands create private commented shell env templates under `~/.orx/mcp/auth-env` or `ORX_MCP_AUTH_ENV_DIR`, refuse symlink parent paths, avoid overwriting existing files, and still do not store token values. `orx mcp auth keychain [status|set|delete] <profile>` and `/mcp auth keychain ...` manage optional macOS Keychain bearer items through `/usr/bin/security`; `set` prompts through macOS Security, and MCP calls read Keychain only after explicit `ORX_MCP_KEYCHAIN=1` opt-in.
- GitHub's write-capable hosted MCP preset is `github-write`, pointed at `https://api.githubcopilot.com/mcp/`. It is deliberately high-risk/write-capable with zero static tools; ORX requires provider auth, profile enable/trust, remote metadata review, manual tool declaration with correct risk, and explicit grants before use.
- GitLab's hosted MCP presets point at `https://gitlab.com/api/v4/mcp`. `gitlab-readonly` is kept read-only by local declaration: auth-required, medium-risk, write-capable=no, zero static tools until remote metadata is reviewed and imported or added explicitly. `gitlab-ci-write` is auth-required, high-risk, write-capable=yes, and declares GitLab's beta `manage_pipeline` tool as destructive so profile trust, compatible auth, and explicit operator grants remain required before calls.
- Support GitHub shorthand, richer marketplace JSON, update checks, and optional signing/provenance layers later.
- Maintain a lockfile with source, resolved commit, integrity, install time, and enabled components.

Minimum plugin metadata:

- `schemaVersion`, `name`, `version`, `description`, `publisher`
- `source`, `repository`, `ref`, `resolvedCommit`, `integrity`, `marketplace`, `installedAt`
- component lists: `skills`, `commands`, `rules`, `hooks`, `mcpServers`, `agents`, `bins`, `docs`, `assets`
- activation rules: `defaultEnabled`, `activationEvents`, `pathGlobs`, `manualOnly`
- permissions: filesystem scopes, shell/binary execution, network domains, MCP read/write/destructive flags, browser access, requested env vars
- runtime requirements: minimum ORX version, OS/arch, package managers, external binaries
- auth/privacy: OAuth/env requirements, telemetry disclosure, data retention, privacy policy, terms
- trust: signing/checksum, review status, marketplace tier, dependency list, SBOM/lockfile when available

## Highest-Value Candidates

| Priority | Integration | Recommended ORX Shape |
| --- | --- | --- |
| P0 | Official OpenRouter MCP | Use for live model search, pricing, rankings, benchmarks, credits, docs, providers, generation lookup, and prompt/model test calls. Keep normal inference in ORX's direct OpenRouter API client. |
| P0 | Native filesystem/search/shell/git/patch | Build directly in ORX for predictability, concise schemas, diffs, truncation, and session metadata. |
| P0 | Native test runner adapters | Detect and run package scripts, Node test runner, Vitest, Jest, Playwright, and similar project commands with parsed/truncated output. |
| P1 | Tree-sitter and ast-grep | Add richer repo maps, symbol slices, syntax-aware search, import/dependency graphs, and codemod previews beyond the dependency-free code intelligence. |
| P1 | LSP/SCIP bridge | Add diagnostics, go-to-definition, references, hover, and safe code-action/rename paths where practical. |
| P1 | GitHub MCP | Read-only and write-capable provider presets now exist; add reviewed tool declaration packs only after current remote metadata is inspected. Keep local git native. |
| P1 | Sourcegraph MCP/API | Add optional read-only profile for multi-repo code search, navigation, history, and deep search. |
| P1 | Context7, DeepWiki, OpenAI Docs, Microsoft Learn, Google Developer Knowledge | Add docs/retrieval profile for current library, repo, and platform docs. |
| P1 | Playwright and Chrome DevTools | Build native Playwright tools for common browser workflows; add MCP profiles for persistent browser/debug/perf workflows. |
| P1 | Web search/fetch: Brave, Tavily, Exa, Perplexity, Firecrawl, Jina Reader | Add explicit web/research profiles with citation, truncation, SSRF guards, and prompt-injection treatment. |
| P1 | Security scanners: Semgrep, Snyk, Socket, OSV-Scanner, CodeQL, Trivy | Prefer native CLI scanner profiles where deterministic; add MCP/plugin integrations for agent-triggered scans and managed findings. |
| P1 | Plugin system | Add manifest reader, plugin cache/lockfile, skills loader, command/rules surfaces, hook trust, and plugin-provided MCP config. |
| P2 | Scholarly/document research | Add OpenAlex, Semantic Scholar, Crossref, arXiv, PubMed, Europe PMC, local PDF parsers, and optional LlamaParse/Unstructured profiles. |
| P2 | RAG and memory | Keep ORX session memory native; add local LanceDB research cache and optional Qdrant/Zotero/OpenMemory/Zep profiles later. |
| P2 | Sentry, Linear, Atlassian, Figma | Add optional workflow profiles with read-only defaults where possible. |
| P2 | Supabase, Prisma, Postgres, SQLite, MongoDB, Redis, Qdrant | Prefer dev/read-only profiles with query limits, explicit connection names, and no production default. |
| P3 | Docker, Kubernetes, AWS, GCP, Azure, Cloudflare, Terraform | Use native CLI wrappers for local dev ergonomics and official MCP/docs for provider APIs. Cloud and cluster writes require explicit profile. |

## Research Profiles

- `research-web`: Brave/Tavily/Exa/Perplexity adapters, `fetch_url`, `extract_page`, Jina Reader, source verification.
- `research-crawl`: Firecrawl/Crawlee/Apify/Bright Data with `max_pages`, `max_cost_usd`, robots/TOS warnings, and cache.
- `research-scholar`: OpenAlex, Semantic Scholar, Crossref, arXiv, PubMed, Europe PMC.
- `research-docs`: local parser first, optional LlamaParse/Unstructured for complex scans/tables/charts.
- `research-browser`: native Playwright first, Playwright MCP/Chrome DevTools MCP optional.
- `research-rag`: local LanceDB cache, optional Qdrant server/MCP.
- `research-memory`: native ORX notes, optional Zotero/OpenMemory/Zep.

Every research run should maintain an evidence ledger with source id, canonical URL/DOI/PMID/arXiv id, title, publisher/author, published date, fetched date, provider, query, content hash, extracted spans, and trust tier. Prefer primary sources and official APIs; label provider/model summaries as secondary until ORX fetches cited sources directly.

## Risk Rules

- Do not auto-enable plugins or MCP servers.
- Do not auto-enable local user MCP catalog profiles merely because they are present.
- Do not enable auth-bearing MCP servers by default.
- Do not enable write-capable GitHub, database, cloud, issue tracker, Slack/Notion, Figma, browser, or plugin executable profiles without explicit config.
- Treat fetched web pages, issue text, database rows, browser DOM, MCP tool descriptions, tool schemas, tool annotations, plugin rules, plugin skills, and plugin docs as untrusted input.
- Pin MCP packages/containers/plugins where practical. Avoid `latest`, floating Git refs, and unversioned `npx` in committed profiles.
- Store MCP tool schema hashes and surface changes in `/status`.
- Show enabled plugins, MCP servers, hooks, bins, auth sources, network scopes, write flags, and risk flags in `/status`.
- Keep cloud account/project/region, kube context/namespace, database name, and GitHub owner/repo visible when relevant.
- Keep secrets out of model context, plugin files, logs, transcripts, and crash reports. Pass only minimal env vars to child MCP/plugin processes.
- Prefer containerized MCP/plugin execution through Docker MCP Toolkit or ToolHive-style isolation when practical.
- Add local audit logs for plugin install/enable, MCP server startup, schema changes, tool calls, hook runs, and secret names used.

## Avoid By Default

- Deprecated community wrappers when an official server exists.
- Low-signal OpenRouter wrappers now that official OpenRouter MCP exists.
- Anonymous npm MCP servers that touch email, payment, database, cloud, or shell execution.
- Broad filesystem/git MCP servers for core ORX local work.
- Production database, cloud-write, and Kubernetes mutation profiles.
- Plugin marketplaces that auto-update without lockfile pins.
- Plugin-provided hooks, bins, or stdio MCP commands from repo-controlled files without explicit trust.

## Primary Sources To Recheck

- OpenRouter MCP: `https://openrouter.ai/docs/mcp-server`
- MCP Registry: `https://registry.modelcontextprotocol.io/`
- MCP tools spec: `https://modelcontextprotocol.io/specification/2025-11-25/server/tools`
- Docker MCP Catalog/Toolkit: `https://docs.docker.com/ai/mcp-catalog-and-toolkit/`
- Agent Skills spec: `https://agentskills.io/specification`
- Codex skills/plugins/MCP/hooks docs: `https://developers.openai.com/codex/skills`
- Claude Code skills/plugins docs: `https://code.claude.com/docs/en/skills`
- GitHub MCP: `https://github.com/github/github-mcp-server`
- Sourcegraph MCP: `https://sourcegraph.com/mcp`
- Context7: `https://github.com/upstash/context7`
- Playwright MCP: `https://playwright.dev/docs/getting-started-mcp`
- Chrome DevTools MCP: `https://developer.chrome.com/docs/devtools/agents`
- Semgrep Guardian/MCP: `https://docs.semgrep.dev/guardian`
