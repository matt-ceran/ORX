# Decisions

Last updated: 2026-06-27

Use this file for durable technical and product decisions. Add newest decisions at the top.

## 2026-06-27: Terminal Meters Must State Their Data Source

Decision: ORX terminal meters should be deterministic local renderings with explicit source labels. Context meters use local approximate serialized-message bytes against ORX's configured local budget, not provider-token context. Cost meters use only OpenRouter generation/usage metadata ORX has received and show `n/a` when unavailable. Account credits meters use live OpenRouter credits data only after the credits endpoint has been fetched. ANSI styling should be light, TTY-only, and disabled by `NO_COLOR`.

Reasoning: Phase 12 polish should improve operator visibility without implying precision ORX does not have. Distinguishing local approximations, in-session metadata, and live account credits keeps the UI useful while preserving OpenRouter-native behavior and avoiding fake balances or exact-context claims.

## 2026-06-27: Keep Citations Metadata-Only And Local

Decision: ORX citations and bibliographies should be deterministic local renderings of persisted `EvidenceSource` metadata only. `/cite <source-id>` renders one source with hashes/provenance; `/bibliography` renders all current evidence sources in stable source-id order. These commands must not fetch, search, call providers, or render extracted page text. Rendered fields should strip terminal/ANSI/OSC control sequences, bound inline values, use redacted `canonicalUrl` metadata, and omit invalid canonical URLs rather than displaying potentially secret-bearing malformed URLs.

Reasoning: Citations improve reproducibility but source metadata is still untrusted data. A local metadata-only layer preserves the evidence-ledger boundary and prevents fetched pages, provider output, browser DOM, or citation fields from authorizing tool use, permission changes, MCP/profile/plugin enablement, hooks, bins, command execution, policy changes, or instruction priority changes.

## 2026-06-26: Keep Initial Web Fetch Slash-Only And Untrusted

Decision: ORX's first web/research implementation should expose direct URL fetch/extract only through explicit operator slash commands (`/web fetch <url>` and `/fetch <url>`), not as a model-autonomous browsing tool. Fetched pages are stored as evidence source metadata plus a bounded user-role untrusted context message. A testable URL guard blocks localhost, loopback, private/link-local/shared/reserved/documentation/multicast IP ranges, IPv6 local ranges, obvious cloud metadata hosts/IPs, and embedded credentials before network. Production fetch must use ORX's DNS-vetted Node transport rather than the generic OpenRouter fetch hook: resolve every hostname, reject any blocked resolved address, and bind the request to a vetted address while preserving the original hostname for host/SNI/certificate validation. Redirects are followed only after each `Location` is rechecked by the same guard, canonical source URLs redact secret-like path/query data, fetch timeouts cover body reads, and terminal control characters are stripped before rendering or context insertion.

Reasoning: Web pages are prompt-injection surface, not authority. Slash-only fetch gives the operator current-source retrieval and source ledgers without allowing model output or fetched text to expand ORX's tool surface, enable plugins/MCP/profiles/hooks/bins, change permissions, execute commands, or alter policy.

## 2026-06-26: Plugin Skills Use Progressive Disclosure Only

Decision: ORX should discover Agent Skills only from enabled plugins and expose compact, sanitized metadata automatically. Full `SKILL.md` content is loaded only after an explicit `/skills activate <id>` action, then rejected if it contains secret-like values or terminal control characters, appended as an untrusted system message with provenance, and recorded in session metadata. Compact metadata may be injected into model requests as ephemeral system context so it does not become normal conversation history.

Reasoning: Agent Skills are useful workflow context but are plugin-controlled text, not authority. Progressive disclosure keeps token load small, prevents disabled plugins from affecting the model, and preserves the Phase 9 trust boundary: skill text cannot authorize tool use, permission changes, MCP enablement, hooks, bins, plugin commands, or command execution.

## 2026-06-26: Plugin Enablement Starts As An Inert Registry Marker

Decision: ORX plugin registration should first create an ORX-owned private registry record with sanitized manifest data, stable id, manifest integrity, local lock-style metadata, pinned git source commits, bounded component hashing, and installed/enabled state separation. Registering a plugin must leave it disabled by default. Enabling a plugin in the initial scaffold should persist only an enabled marker and must not activate hooks, bins, plugin slash commands, plugin MCP servers, or any plugin code execution.

Reasoning: Plugins are supply-chain and execution surface even though ORX native tools remain YOLO-style. A private registry and inert enable marker let `/plugins` and `/status` expose trust/integrity state early without allowing repo-controlled manifests, model output, or fetched content to expand ORX's executable surface. Secret-like values and terminal control characters must be rejected or dropped before plugin metadata is stored or rendered.

## 2026-06-26: Evaluate Declared MCP Tools Before Remote Execution Exists

Decision: ORX should evaluate declared MCP tools with a pure local policy before any remote MCP tool execution is implemented. Read-only declared tools on enabled, trusted profiles with no pending schema change may be marked `allowed` for future use, while billable, write, and destructive tools remain denied unless a future explicit allowlist is designed. Disabled, untrusted, and schema-changed profiles block every declared tool. The OpenRouter `chat-send` tool is billable and denied by default.

Reasoning: MCP tool descriptions and schemas are remote integration surface, not authority to execute. A render-only evaluator lets `/mcp tools`, `/mcp inspect`, and `/status` show future eligibility and risk without discovering, fetching, or calling tools, and keeps the direct OpenRouter REST inference path separate from MCP policy work.

## 2026-06-26: Keep OpenRouter MCP Discovery Manual And Gated

Decision: ORX should expose official OpenRouter MCP discovery only through explicit ORX-owned commands such as `/mcp discover <profile>`, and only after the persisted profile is enabled, trusted, free of pending schema changes, and configured for remote HTTP. Discovery may perform a minimal initialize handshake and report `auth_required` for OAuth or dedicated expiring MCP keys, but remote MCP tools remain unexecutable and absent from the model loop.

Reasoning: OpenRouter MCP is useful for profile/status discovery and future lookup tools, but its remote auth-bearing surface includes a billable `chat-send` tool. Gating discovery behind persisted trust and keeping normal inference on direct OpenRouter REST prevents a profile/schema change or fetched MCP metadata from expanding ORX's tool surface without operator review.

## 2026-06-26: Persist MCP Profile Trust Outside Repositories

Decision: ORX should persist MCP profile enablement and trusted configured-profile hash baselines in an ORX-owned user config file outside repositories, defaulting to `~/.orx/mcp/profiles.json` with `ORX_MCP_CONFIG_PATH` for tests and isolated runs. The file should store only profile id, enabled/disabled state, trusted hash baseline, and updatedAt.

Reasoning: MCP profile trust is operator state, not repo-controlled state. Keeping it outside the working tree prevents a repository or model-generated file from enabling remote MCP surfaces, while the trusted hash baseline lets ORX show pending schema changes before any future remote MCP tool execution.

## 2026-06-26: Hash MCP Profile Declarations Before Tool Discovery

Decision: Until live MCP discovery exists, ORX should hash configured MCP profile declarations as the stable baseline: profile identity, transport metadata, auth/write flags, profile risk, and declared tool names/risk/billable metadata. Runtime enablement state is excluded from the hash. At this earlier checkpoint, `/mcp enable` and `/mcp disable` were kept as in-process simulations until persistent profile trust/config was implemented.

Reasoning: Plugin work needs a visible schema/profile trust boundary before remote MCP tools become executable. Declaration hashes make changed configured profiles visible immediately, while excluding runtime state keeps policy simulation from changing the trust hash. In-process enablement lets the CLI surface the future workflow without writing persistent config or executing remote tools prematurely.

## 2026-06-26: Keep Live Metadata Direct Until MCP Policy Is Enforced

Decision: ORX should use direct OpenRouter REST helpers for models, credits, and generation metadata while MCP remains disabled-by-default policy scaffolding. The official OpenRouter MCP profile can be listed in `/mcp` and `/status`, but MCP tool execution should wait for schema hashing, audit logging, explicit enablement, and policy checks.

Reasoning: Models, credits, and generation lookup are narrow first-party API calls that can be tested and sanitized without expanding model tool surface. MCP introduces remote tool descriptions, auth-bearing transports, schema-change risk, and optional billable tools such as `chat-send`; those should not become executable until ORX has the intended trust boundary in place.

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
