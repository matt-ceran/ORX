# MCP And Integrations Research

Last updated: 2026-06-25

## Research Summary

Current MCP discovery is broad but uneven. Use official registries, GitHub stars/downloads, release recency, vendor ownership, and security posture as signals, but do not treat any registry as a trust boundary.

## ORX Integration Principle

- Build native tools for core local coding: filesystem reads/writes, search, shell, patching, and local git.
- Use MCP for external systems and optional integrations: OpenRouter metadata, GitHub API, docs lookup, browser automation/debugging, issue trackers, databases, cloud/devops, design tools, and observability.
- Prefer official/first-party MCP servers.
- Enable MCP through explicit profiles rather than automatic defaults.

## Highest-Value Candidates

| Priority | Integration | Recommended ORX Shape |
| --- | --- | --- |
| P0 | OpenRouter MCP or equivalent | Use for live model search, pricing, rankings, benchmarks, credits, docs, and generation lookup. Keep normal inference in ORX's direct OpenRouter API client. |
| P0 | Native filesystem/search/shell/git/patch | Build directly in ORX for predictability, concise schemas, diffs, truncation, and session metadata. |
| P0 | GitHub MCP | Add official GitHub MCP as read-only/scoped profile first; keep local git native. |
| P1 | Context7, DeepWiki, OpenAI Docs, Microsoft Learn | Add docs/retrieval profile for current library, repo, and platform docs. |
| P1 | Playwright and Chrome DevTools | Build native Playwright tools for common browser workflows; add MCP profiles for persistent browser/debug/perf workflows. |
| P1 | Web search/fetch: Brave, Exa, Tavily, Firecrawl | Add explicit web profile with citation, truncation, SSRF guards, and prompt-injection treatment. |
| P1 | Memory/session tools | Keep ORX session memory native; optionally support MCP memory per project/profile later. |
| P2 | Sentry, Linear, Atlassian, Figma | Add optional workflow profiles with read-only defaults where possible. |
| P2 | Supabase, Prisma, Postgres, SQLite, MongoDB, Redis, Qdrant | Prefer dev/read-only profiles with query limits, explicit connection names, and no production default. |
| P3 | Docker, Kubernetes, AWS, GCP, Azure, Cloudflare, Terraform | Use native CLI wrappers for local dev ergonomics and official MCP/docs for provider APIs. Cloud and cluster writes require explicit profile. |

## Risk Rules

- Do not enable auth-bearing MCP servers by default.
- Do not enable write-capable GitHub, database, cloud, issue tracker, Slack/Notion, Figma, or browser profile without explicit config.
- Treat fetched web pages, issue text, database rows, browser DOM, and MCP tool descriptions as untrusted input.
- Pin MCP packages/containers where practical.
- Show enabled MCP servers and risk flags in `/status`.
- Keep cloud account/project/region, kube context/namespace, database name, and GitHub owner/repo visible when relevant.

## Avoid By Default

- Deprecated community wrappers when an official server exists.
- Low-signal OpenRouter wrappers now that official OpenRouter MCP exists.
- Anonymous npm MCP servers that touch email, payment, database, cloud, or shell execution.
- Broad filesystem/git MCP servers for core ORX local work.
- Production database, cloud-write, and Kubernetes mutation profiles.
