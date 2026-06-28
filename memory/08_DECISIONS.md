# Decisions

Last updated: 2026-06-28

Use this file for durable technical and product decisions. Add newest decisions at the top.

## 2026-06-28: Save Delegation Teams As Disabled Local Metadata Only

Decision: ORX saved delegation teams should be private local operator state containing only sanitized disabled controller/delegate metadata and minimal timestamps/display metadata. Loading a team in chat may update session-local scaffold metadata, but it must not enable execution, register a model-visible `delegate_task`, call OpenRouter delegates, spawn subprocesses, persist delegate outputs, or define result merge semantics.

Reasoning: The user wants reusable teams before execution policy exists. Keeping saved teams bounded, local, and inert lets ORX improve configuration ergonomics without crossing the harder boundaries around budgets, timeouts, credentials, result truncation, output trust, and merge/persistence policy.

## 2026-06-28: Plugin Review Is A Read-Only Local Audit Surface

Decision: ORX may provide `orx plugins review` and `/plugins review`, with `doctor` and `audit` aliases, to summarize installed/enabled plugin state, local catalog pin drift, bin and hook trust state, plugin MCP profiles, plugin command aliases, omissions, and concrete next commands. Review must be local and read-only: it must not fetch, install, enable, trust, grant, execute plugin surfaces, mutate registry/cache/catalog/trust files, or tighten existing file permissions.

Reasoning: A comfortable plugin system needs one command that tells the operator what is installed, stale, untrusted, exposed through MCP, or available as an alias. That command is guidance, not authority. Keeping it strictly read-only preserves the established boundary where install, enable, trust, grants, network calls, and execution remain separate explicit operator steps.

## 2026-06-28: Plugin Catalog Updates Register Disabled Snapshots

Decision: ORX may provide `orx plugins catalog update <id>` and `/plugins catalog update <id>` to apply a local pinned git catalog update only when `plugins catalog updates` reports `update_available`. Apply reuses the existing pinned git install path and registers the updated cached snapshot disabled, even if the previous install was enabled. Current, not-installed, local-only, source-mismatch, and unknown entries must refuse without mutating registry/cache/catalog runtime state. Update apply must not fetch remote update discovery, preserve enabled state, trust hooks/bins, grant MCP tools, expose model MCP, or execute plugin surfaces.

Reasoning: Updating an installed plugin crosses the same supply-chain boundary as a fresh pinned git install. The local catalog pin is enough to select the exact snapshot, but the operator still needs to re-enable and re-trust any executable or remote integration surfaces after reviewing the new cache/provenance state.

## 2026-06-28: MCP Auth Readiness Is Secretless And Env-Only

Decision: ORX may provide `orx mcp auth <profile>` and `/mcp auth <profile>` as readiness inspection commands for MCP bearer credentials. These commands may report profile-specific env names, fallback env names, set/unset status, effective configured/missing state, auth-required tool counts, and profile hash state, but they must not fetch, start OAuth, persist tokens, print token values, or include bearer/credential values in audit logs. Managed OAuth remains a future explicit design.

Reasoning: MCP setup needs a comfortable way to see which credential name a profile expects before running discovery or calls. Keeping the command read-only and value-free improves usability without creating a new secret store or implying that ORX can safely manage every provider's OAuth flow yet.

## 2026-06-28: Remote MCP Tool Import Cannot Weaken Local Risk

Decision: Reviewed remote MCP tool import may refresh local `user:` catalog declarations from provider `tools/list` metadata, but it must never downgrade an existing same-name local declaration. Existing stricter risk, auth-required, and billable state win over imported defaults. For profiles marked high-risk or write-capable, import may only refresh tools that already have a local declaration; undeclared remote tool names must be skipped until the operator manually adds them with an explicit risk.

Reasoning: Remote MCP metadata is untrusted provider data and cannot become an authority boundary. This is especially important for broad providers such as Cloudflare API, where a known `execute` tool must remain destructive, and for dynamic write-capable providers such as Figma, where ORX cannot safely infer tool risk from a name alone. The operator-owned catalog remains the source of tool authority.

## 2026-06-28: Plugin Catalog Update Checks Are Local Pin Comparisons

Decision: ORX may provide `orx plugins catalog updates [id]` and `/plugins catalog updates [id]` to compare installed plugin registry provenance against the local plugin catalog's pinned git entries. These checks must be read-only and local-only: they may load the catalog and registry, but must not fetch remotes, install plugins, enable plugins, trust hashes, grant tools, execute plugin surfaces, or mutate registry/cache/catalog state.

Reasoning: Operators need to know when a locally managed catalog pin differs from what is installed, but remote update discovery is a separate network action with different trust and provenance implications. A local pin comparison gives useful maintenance visibility while preserving the catalog boundary: changing a catalog declaration is not installation, update checking is not fetching, and install/enable/trust remain explicit later steps.

## 2026-06-28: Plugin Catalog Editing Is Local Declaration Management

Decision: ORX may provide `orx plugins catalog inspect|add-local|add-git|remove` and `/plugins catalog inspect|add-local|add-git|remove` to review and edit the private local plugin catalog, but these commands must only read or write operator-owned catalog declarations. They must not install, enable, trust, grant, fetch, execute, or write plugin registry/cache runtime state. Installing a catalog entry remains a separate explicit `plugins install <catalog-id>` step, and executable surfaces remain behind the existing enable plus hash-trust or MCP grant gates.

Reasoning: A usable plugin authoring workflow needs more than manual JSON editing, especially after scaffold and validation. Keeping catalog editing as declaration management makes the workflow comfortable while preserving the supply-chain boundary: catalog presence is not installation, installation is not enablement, and enablement is not executable trust.

## 2026-06-28: Plugin Validation Is Read-Only Authoring Feedback

Decision: ORX may provide `orx plugins validate <manifest-path-or-directory>` and `/plugins validate <manifest-path-or-directory>` as a manifest preview/check command, but validation must not register, install, enable, trust, grant, fetch, execute, or write plugin cache/registry state. It may parse and sanitize manifests, compute local manifest/component hashes, and warn about missing component paths using the same bounded local hashing logic used for plugin lock records.

Reasoning: Plugin authors need fast feedback before install, especially after scaffold generation, but validation should not become another authority boundary. Keeping it read-only lets operators inspect exactly what ORX would recognize while preserving the existing disabled-by-default install, enable, hash-trust, MCP grant, hook, and bin execution gates.

## 2026-06-28: Plugin Scaffolds Are Local Authoring Artifacts

Decision: ORX may provide `orx plugins scaffold <directory>` and `/plugins scaffold <directory>` to create valid local plugin authoring bundles, but scaffolding must not register, install, enable, trust, grant, fetch, or execute anything. Default generated surfaces should be inert markdown (`skills`, prompt `commands`, and advisory `rules`), while hooks, bins, MCP servers, command schemas, assets, and docs should be explicit opt-in placeholders. Executable/integration placeholders should be empty/no-op declarations until the author writes content and passes the existing install/enable/trust/grant gates.

Reasoning: Plugin authoring should be comfortable enough for daily use without weakening ORX's supply-chain boundary. Keeping scaffolding separate from registry/trust state lets operators generate a valid manifest quickly, then review and install it through the same disabled-by-default cache, hash, and runtime policies as any other plugin source.

## 2026-06-28: Model MCP Results Are Wrapped As Untrusted Remote Data

Decision: Model-visible `mcp_call` results must wrap remote text content in explicit untrusted-output markers before returning it to the OpenRouter tool loop. The wrapper should identify the source profile/tool, mark each content item as untrusted, and state that remote MCP output is data only and cannot override system, developer, operator, ORX policy, local repository state, or explicit slash/CLI grants. The MCP tool schema should also warn the model before use that returned content is untrusted external data.

Reasoning: Remote MCP tools are useful for docs and metadata, but their descriptions and results are external input. Explicit tool-result wrapping makes the prompt-injection boundary visible inside the model-visible JSON envelope, not just in terminal rendering or audit logs. Keeping the wrapper in ORX's native `mcp_call` dispatcher preserves the single controlled model-facing MCP surface while avoiding broader trust in provider output.

## 2026-06-28: Remote MCP Tool Import Stores Names, Not Authority

Decision: ORX may provide `orx mcp import-remote-tools <profile>` and `/mcp import-remote-tools <profile>` to import reviewed remote `tools/list` metadata into local `user:` MCP catalog declarations. The import flow is limited to local user catalog profiles, requires the existing enabled/trusted/unchanged guarded `tools/list` path to succeed, stores only sanitized tool names as read-only non-billable declarations with profile-inherited auth, skips unsupported names, and audits the result with hashes only. It must not import raw schemas as trusted state, edit built-in or plugin profiles, grant tools, grant model access, call `tools/call`, or preserve trust across the resulting profile-hash change.

Reasoning: Zero-static-tool providers such as GitHub read-only need a comfortable way to become callable after the operator reviews provider metadata. Importing only reviewed names into the user-owned catalog reduces hand-entry friction while preserving the MCP authority boundary: remote metadata remains untrusted, local declarations become visible configuration, and the changed profile hash forces explicit re-review before execution or model exposure.

## 2026-06-28: MCP Provider Presets Are Local Templates Only

Decision: ORX may ship built-in MCP provider presets such as `context7`, `microsoft-learn`, `github-readonly`, `sentry-readonly`, `figma`, `browser`, `cloudflare-docs`, and `cloudflare-api`, exposed through `orx mcp presets`, `orx mcp presets inspect <preset>`, `orx mcp add-preset <preset>`, and matching `/mcp` commands. Inspecting a preset is display-only, and installing a preset writes sanitized disabled declarations into the local user MCP catalog only. These commands must not enable a profile, trust a profile hash, grant tools, expose model MCP, fetch remote metadata, or bypass the existing guarded discovery/call/audit gates. Presets may carry profile-level risk/write-capable metadata and static tools only when the provider surface is stable enough to classify conservatively.

Reasoning: Provider presets make real MCP setup comfortable without making provider metadata an authority boundary. Keeping presets as local declaration templates preserves the existing operator-owned flow: review the profile, enable/trust the current hash, inspect remote tools when needed, grant specific tools, and only then call tools or expose read-only model MCP.

## 2026-06-28: User MCP Catalog Editing Is Local Configuration Only

Decision: ORX may provide `orx mcp catalog|add-profile|remove-profile|add-tool|remove-tool` and matching `/mcp ...` slash commands to edit the private local user MCP catalog. These commands write only local operator configuration, preserve existing declarations when possible, keep profiles disabled by default, and do not bypass profile enablement, trusted hashes, schema-change gates, tool grants, model-tool grants, bearer-auth policy, guarded transport, or audit logging.

Reasoning: Manual JSON editing is a usability barrier for real MCP provider setup, but catalog editing should not become a new authority boundary. Treating editor commands as local declaration management keeps the workflow comfortable while preserving the existing MCP policy model where only enabled, trusted, unchanged profiles can be discovered, called, or exposed to the model.

## 2026-06-28: Local User MCP Catalogs Share The Profile Trust Model

Decision: ORX may load local user MCP profile declarations from `~/.orx/mcp/profile-catalog.json` or `ORX_MCP_PROFILE_CATALOG_PATH`. User declarations are namespaced as `user:<profile-id>`, limited initially to `remote-http` transports, sanitized for safe IDs, tools, URLs, and secret-like values, disabled by default, and routed through the same enable, trusted-profile-hash, schema-change, per-tool grant, model-tool grant, guarded transport, bearer-auth, and audit gates as built-in and plugin MCP profiles.

Reasoning: Users need a comfortable way to add real remote MCP providers without packaging every provider as a plugin. Treating the catalog as local operator configuration keeps provider setup lightweight while preserving the existing MCP authority boundary: declarations are not enabled by being present, trust is hash-bound, stale declarations are denied, bearer tokens stay env-only, and remote output remains untrusted.

## 2026-06-28: Treat Catalog Git Pins As Authoritative Install Provenance

Decision: For catalog git installs, ORX should treat the catalog entry's repository/ref/resolvedCommit as the authoritative source pin. The installer checks out that exact commit, rejects unsafe transports and manifest path escapes, normalizes the cached manifest source to the catalog pin, and then registers the plugin disabled/inert through the normal cache flow.

Reasoning: A manifest committed inside a git repository cannot reliably contain the exact commit hash of the commit that contains that same manifest, because updating the manifest changes the commit hash. Catalog pins solve that self-reference problem while preserving lockfile provenance and keeping plugin executable surfaces behind the existing enable/trust/policy gates.

## 2026-06-28: Executable Plugin Commands Reuse Bin Trust

Decision: ORX may load manifest-defined executable command schemas from enabled plugins through `components.commandSchemas` and expose them as `/plugin:<plugin-id>:exec:<slug>` aliases. These schemas provide sanitized command metadata, usage text, bin references, and optional max-argument counts only. Execution must delegate to the existing trusted-current plugin bin runtime for the referenced bin; command schemas do not create a separate trust store, environment policy, cwd policy, audit path, or model-visible tool.

Reasoning: Schema-backed aliases make plugins feel more like a polished CLI without adding a new plugin execution authority. Reusing bin hash trust preserves the reviewed executable boundary, catches changed cached plugin files, keeps audit/redaction behavior centralized, and prevents plugin manifests, fetched content, or model output from authorizing new code execution semantics.

## 2026-06-28: Parse Test Reports From Captured Output Only

Decision: ORX test report summaries should initially be parsed from the already-captured, sanitized stdout/stderr of `run_tests` executions. The parser may recognize common Node, Vitest, Jest, and Playwright summary lines and store only numeric counts/durations. ORX should not yet rewrite project test commands to force JSON reporters or read framework-generated report files.

Reasoning: Summary-line parsing improves operator and model-visible verification context without changing test execution semantics, adding dependencies, or expanding filesystem reads. Structured framework report ingestion can be added later, but it needs a separate design for opt-in reporter flags, generated-file bounds, cleanup, and trust treatment.

## 2026-06-28: Add Multiline Input Without Raw-Mode Rewrite First

Decision: ORX should support multiline chat prompts through line-based continuation before introducing a custom raw-mode editor. A trailing unescaped `\` continues input collection; the collected lines are submitted as one user message. TTY mode renders a distinct continuation composer, while non-TTY and `NO_COLOR` keep deterministic line-oriented prompts.

Reasoning: Multiline prompts and pasted code are important for daily CLI comfort, but a full raw-mode editor would touch keyboard handling, history, completion, signal handling, and scriptability at once. Line-based continuation improves the workflow now while preserving Node readline behavior, Tab completion, Ctrl+C handling, and pipe/test compatibility.

## 2026-06-28: Keep Framework Test Adapters Metadata-First

Decision: ORX should infer Node, Vitest, Jest, Playwright, and unknown framework metadata for discovered test targets without introducing separate framework-specific process runners yet. Package-script targets continue to execute through the package manager with shell disabled and sanitized extra arguments; direct Node fallback continues to use `node --test`. Framework and reporter hints are reporting/context metadata for operators and model-visible `run_tests` summaries.

Reasoning: Package scripts are the source of truth for project-specific test setup. Metadata-first framework detection makes `orx tests list`, `/status`, and `run_tests` more useful while preserving the already-verified execution boundary. Rich framework report parsing can be added later on top of this metadata without weakening process, argument, timeout, or output caps.

## 2026-06-28: Model MCP Requires Per-Tool Model Grants

Decision: ORX model-visible MCP calls require explicit, persisted model-tool grants in addition to `/mcp model enable` or `orx ask --mcp-tools`. `/mcp allow-model-tool`, `/mcp revoke-model-tool`, and `orx mcp allow-model-tool|revoke-model-tool` store only profile id, tool name, current profile hash, risk, billable flag, and granted timestamp in the private MCP config. Grants are allowed only for read-only non-billable declared tools on enabled, trusted, unchanged profiles. Stale model grants are visible in status/tool output and denied before network. Billable, write, and destructive MCP tools remain unavailable to the model loop even if explicit operator `/mcp call` grants exist.

Reasoning: Session-local model MCP opt-in prevents accidental exposure, but exposing every read-only tool from every enabled trusted profile is still broader than needed. A second, profile-hash-bound model allowlist lets the operator choose which remote tools the model can call while preserving the existing MCP trust model: profile/schema drift invalidates approval, remote output remains untrusted, and billable/write/destructive model autonomy stays out of scope.

## 2026-06-28: Plugin Bins Require Hash Trust And Explicit Operator Runs

Decision: Enabled plugin `components.bins` files are discoverable from the ORX-owned plugin cache but remain non-executable until the operator trusts the current bin hash. `orx bins run <id> [args...]` and `/bins run <id> [args...]` execute only trusted current hashes, from the cached plugin root, with manifest-declared env only, bounded redacted output, and JSONL audit events that omit raw argument lists.

Reasoning: Bins are useful for comfortable plugin workflows but are executable plugin code. Keeping trust hash-bound and run-only-by-operator preserves the install/enable boundary, catches changed cached files, avoids making cache files globally executable, and keeps plugin text/model output unable to authorize execution.

## 2026-06-28: Plugin Slash Aliases Derive From Existing Trusted Surfaces

Decision: ORX exposes namespaced `/plugin:<plugin-id>:command:<slug>` and `/plugin:<plugin-id>:bin:<file>` aliases derived from enabled plugin prompt and bin discovery. Prompt aliases call the existing explicit prompt activation path and bin aliases call the existing trusted bin runtime. `/plugin list` and `orx plugins commands` render the derived alias list; no manifest-defined executable command schema is active yet.

Reasoning: Aliases make plugin workflows comfortable without creating another permission model. They preserve the existing trust boundaries: prompt content remains untrusted chat context, bins still require trusted current hashes, and plugin manifests cannot create new executable command semantics beyond the reviewed bin surface.

## 2026-06-28: Model-Visible MCP Starts Session-Local And Read-Only

Decision: ORX may expose one native model tool, `mcp_call`, only after the operator enables it in the current interactive chat with `/mcp model enable`. The tool is not present in normal model requests by default and `/mcp model disable`, `/new`, or `/resume` remove the session-local exposure. `mcp_call` reuses MCP profile state, trusted profile hashes, schema-change gates, declared-tool policy, env-only bearer auth, DNS-vetted transport, redaction/truncation, and MCP audit events. In this first model-loop slice, model-visible calls are limited to read-only non-billable declared tools, even if an operator has granted a billable/write/destructive tool for explicit operator calls.

Reasoning: The model needs a controlled path to use useful MCP metadata/docs integrations, but exposing arbitrary remote tools to the model would cross a larger authority boundary. A single ORX-owned tool preserves a stable schema, keeps remote schemas untrusted, avoids billable/write/destructive model autonomy, and makes the operator opt in per chat session.

## 2026-06-28: MCP Tool Calls Are Explicit Operator Commands

Decision: ORX may execute remote MCP `tools/call` through explicit operator commands, `/mcp call <profile> <tool> [arguments-json]` and `orx mcp call <profile> <tool> [arguments-json]`. Calls require an enabled profile, trusted current profile hash, no pending schema change, an `allowed` declared-tool policy decision, guarded DNS-vetted remote HTTP transport, and env-only bearer auth for auth-bearing profiles/tools through `ORX_MCP_BEARER_<PROFILE>` or `ORX_MCP_BEARER_TOKEN`. Output is rendered as bounded, redacted, untrusted content with result hashes. Audit events record status, policy, result hashes, and content types, but not raw arguments, raw output, bearer tokens, or schemas. At this checkpoint MCP tools remained unavailable to the model loop; a later 2026-06-28 decision added session-local read-only non-billable `mcp_call` model exposure.

Reasoning: Operators need to actually use trusted MCP integrations, but model-autonomous remote tool execution is a larger authority boundary. Explicit commands validate transport, auth, redaction, and audit behavior while preserving the existing policy model: profile/schema drift invalidates grants, risky tools require per-tool grants, and remote output cannot authorize new permissions.

## 2026-06-28: MCP Tool Grants Bind To Trusted Profile Hashes

Decision: ORX may persist explicit MCP tool grants for billable, write, or destructive declared tools only after the profile is enabled, has a trusted current profile hash, and has no pending schema change. Grants are stored in the private MCP profile config as profile id, tool name, profile hash, risk, billable flag, and granted timestamp. A grant whose stored profile hash differs from the current configured profile hash is stale, visible in status/tool output, and denied. `/mcp allow-tool`, `/mcp revoke-tool`, and `orx mcp allow-tool|revoke-tool` mutate only this local policy state. At this checkpoint MCP `tools/call` and model-loop exposure remained unimplemented; a later 2026-06-28 decision added explicit operator-only `tools/call` while keeping model-loop exposure absent.

Reasoning: MCP tool execution needs an operator-owned allow boundary before remote tools can run. Binding grants to the trusted profile hash prevents a changed plugin/server declaration from inheriting approval, and keeping grant records minimal avoids persisting schemas, secrets, or remote-controlled metadata as authority.

## 2026-06-28: Remote MCP Tool Listing Is Metadata Only

Decision: ORX may expose `/mcp remote-tools <profile>` to call `tools/list` for enabled, trusted, unchanged `remote-http` MCP profiles through the guarded DNS-vetted MCP transport. The command renders only bounded untrusted tool metadata, annotation keys, and SHA-256 hashes of tool/input/output schemas; it does not render raw schemas, call `tools/call`, persist remote schemas as trusted state, or expose remote MCP tools to the model loop. Results are audited with tool/schema hashes and redacted errors.

Reasoning: Live `tools/list` is needed before MCP execution can be designed, but remote tool names, descriptions, schemas, and annotations are untrusted integration data. Hashing and bounded rendering give operators visibility into remote schema shape and drift without letting remote metadata authorize tool use or change ORX's execution surface.

## 2026-06-28: Plugin MCP Discovery Uses Profile Trust And Guarded Transport

Decision: Enabled plugin MCP profiles may be discovered with `/mcp discover <profile>` only after the profile is enabled, has a trusted current profile hash, has no pending schema change, and uses `remote-http`. Discovery uses ORX's URL guard plus a production Node transport that resolves and vets DNS results before connecting and binds the request to a public resolved address while preserving the original host for HTTP/SNI behavior. Discovery performs only the minimal JSON-RPC initialize handshake, reports auth/network/schema states, audits the result, and does not list, execute, or expose plugin MCP tools to the model loop.

Reasoning: Plugin MCP endpoints are remote supply-chain and prompt-injection surface, but operators need a real readiness check before tool execution exists. Reusing profile hash trust plus guarded DNS-vetted network behavior makes endpoint discovery explicit and auditable while keeping tool execution as a separate future policy decision.

## 2026-06-28: Trusted Hooks May Run On Explicit Lifecycle Events

Decision: ORX may automatically run enabled plugin hooks on `session_start`, `user_prompt_submit`, `pre_tool_use`, `post_tool_use`, `pre_compact`, `post_compact`, and `stop` only when the cached hook definition matches an operator-trusted current hash. Lifecycle hooks reuse the manual hook runtime: cached plugin cwd confinement, minimal declared env forwarding, timeout/output caps, redaction, private JSONL audit events, and fail-closed audit persistence. Untrusted and pending-hash hooks are skipped. Hook failures are visible on stderr and audited, but they do not silently mutate session state or implicitly authorize plugin/MCP/binary execution.

Reasoning: Lifecycle hooks are useful for local formatting, logging, guardrails, and workflow automation, but they are executable plugin code. Reusing the trusted manual runtime keeps the trust boundary hash-based and operator-owned while allowing ORX sessions, tool use, compaction, and shutdown to trigger reviewed hooks predictably.

## 2026-06-27: Trusted Hook Runtime Is Manual Before Lifecycle Automation

Decision: ORX may execute plugin hooks only through explicit operator commands, `orx hooks run <id>` or `/hooks run <id>`, and only when the enabled cached hook definition still matches a trusted hook hash. Hook runs use the cached plugin root plus optional safe relative cwd, disable inherited env, forward only hook-declared env names, cap timeout/output, redact forwarded env values from rendered/audited output, and append private JSONL audit events. A successful hook command whose audit event cannot be persisted is treated as a failed run. Automatic lifecycle hook events remain unwired.

Reasoning: Manual execution validates the executable hook policy without letting plugin install/enable events or model/session lifecycle events run plugin code automatically. Hash trust, cached provenance, minimal env, cwd confinement, output truncation/redaction, and audit logs are the runtime boundary before ORX can safely wire session_start, user_prompt_submit, tool-use, compaction, or stop events.

## 2026-06-27: Hook Hash Trust Comes Before Hook Execution

Decision: Enabled ORX plugins may contribute hook definitions from cached `components.hooks` JSON, and ORX may show, inspect, trust, and untrust those definitions through `orx hooks`, `/hooks`, and `/status`. Trust records persist only hook id, trusted hook hash, and trustedAt in private operator state outside repositories. Hook execution remains unimplemented and inactive even when a hook is trusted.

Reasoning: Hooks are a high-risk executable surface because they run around session and tool events. Operators need a stable review/trust workflow and visible pending hash changes before any runtime can safely invoke hooks. Keeping trust state separate from repo-controlled plugin manifests prevents repositories, fetched content, or model output from silently approving changed hook commands.

## 2026-06-27: Plugin MCP Presets Are Policy Metadata Before Runtime

Decision: Enabled ORX plugins may contribute MCP preset declarations from cached `components.mcpServers` JSON, and ORX may show those profiles through `/mcp list`, `/mcp inspect`, `/mcp tools`, `/mcp enable`, and `/status` using namespaced ids and profile hashes that include plugin manifest/component provenance. At this checkpoint, plugin-sourced profiles remained render-only: `/mcp discover` refused to contact plugin-declared endpoints, and no plugin MCP tools were exposed to the model loop or executable runtime. Later 2026-06-28 work enabled guarded plugin endpoint discovery, explicit operator MCP calls, and session-local read-only non-billable `mcp_call` model exposure.

Reasoning: Plugin MCP declarations are useful integration metadata, but plugin-controlled endpoint URLs, transports, schemas, and tool descriptions are supply-chain and prompt-injection surface. Routing declarations through the existing MCP policy vocabulary gives operators visibility into auth, transport, risk, tool policy, trust hashes, and schema changes without letting a plugin install or enable event create network calls or executable tools.

## 2026-06-27: Saved Profiles Are Local Config Snapshots Only

Decision: ORX saved profiles should persist local configuration snapshots outside repositories at `~/.orx/profiles.json`, with `ORX_PROFILE_CONFIG_PATH` for isolated runs. A profile can store model, mode, Fusion preset, TTY theme, and permission posture, but must not store API keys. Applying a profile changes the active local config and labels the session with `activeProfile`; it must not by itself enable MCP tools, plugin executable surfaces, hooks, bins, delegates, or network permissions.

Reasoning: Profiles are a usability layer for comfortable daily operation, not an authority boundary. Keeping them local, private-mode, and no-secret makes customization useful while preserving the existing plugin/MCP trust model where integrations require explicit enablement, hash/trust checks, and policy visibility.

## 2026-06-27: Keep TTY Themes Small And Built In

Decision: ORX TTY rendering should use a small built-in theme enum: `default`, `mono`, and `vivid`. Theme can be configured with `theme = "..."`, overridden at render time with `ORX_TTY_THEME` or `ORX_THEME`, and changed for the active chat session with `/theme [default|mono|vivid]`. `NO_COLOR=1` and non-TTY output still force plain rendering. Arbitrary color customization should wait until there is a stronger product need.

Reasoning: Phase 12 needs useful polish without creating a large styling API. A small enum covers normal terminals, monochrome/screenshot-safe output, and higher-contrast color while keeping tests deterministic and preserving script-safe output.

## 2026-06-27: Terminal Meters Must State Their Data Source

Decision: ORX terminal meters should be deterministic local renderings with explicit source labels. Context meters use local approximate serialized-message bytes against ORX's configured local budget, not provider-token context. Cost meters use only OpenRouter generation/usage metadata ORX has received and show `n/a` when unavailable. Account credits meters use live OpenRouter credits data only after the credits endpoint has been fetched. ANSI styling should be light, TTY-only, and disabled by `NO_COLOR`.

Reasoning: Phase 12 polish should improve operator visibility without implying precision ORX does not have. Distinguishing local approximations, in-session metadata, and live account credits keeps the UI useful while preserving OpenRouter-native behavior and avoiding fake balances or exact-context claims.

## 2026-06-27: Keep Citations Metadata-Only And Local

Decision: ORX citations and bibliographies should be deterministic local renderings of persisted `EvidenceSource` metadata only. `/cite <source-id>` renders one source with hashes/provenance; `/bibliography` renders all current evidence sources in stable source-id order. These commands must not fetch, search, call providers, or render extracted page text. Rendered fields should strip terminal/ANSI/OSC control sequences, bound inline values, use redacted `canonicalUrl` metadata, and omit invalid canonical URLs rather than displaying potentially secret-bearing malformed URLs.

Reasoning: Citations improve reproducibility but source metadata is still untrusted data. A local metadata-only layer preserves the evidence-ledger boundary and prevents fetched pages, provider output, browser DOM, or citation fields from authorizing tool use, permission changes, MCP/profile/plugin enablement, hooks, bins, command execution, policy changes, or instruction priority changes.

## 2026-06-27: Plugin Prompt Commands Use Progressive Disclosure Only

Decision: ORX should discover plugin prompt commands only from enabled plugins and expose compact, sanitized metadata automatically. Full prompt markdown under `components.commands` is loaded only after an explicit `/prompts activate <id>` action, rejected if it contains secret-like values or terminal control characters, appended as an untrusted system message with provenance, and recorded in session metadata. Compact prompt metadata may be injected into model requests as ephemeral system context so it does not become normal conversation history.

Reasoning: Plugin prompt commands are useful operator-selectable workflow context, but they are plugin-controlled text, not authority. Progressive disclosure keeps token load small, prevents disabled plugins from affecting the model, and preserves the plugin trust boundary: prompt text cannot authorize tool use, permission changes, MCP enablement, hooks, bins, executable plugin commands, or command execution.

## 2026-06-27: Plugin Rules Are Advisory Until Explicitly Activated

Decision: ORX should discover plugin rules only from enabled plugins and expose compact, sanitized metadata automatically. Full rule markdown under `components.rules` is loaded only after an explicit `/rules activate <id>` action, rejected if it contains secret-like values or terminal control characters, appended as an untrusted system message with provenance, and recorded in session metadata. Rule names/descriptions come only from explicit frontmatter or filenames, never markdown body text.

Reasoning: Plugin rules sound policy-like, but they are plugin-controlled text and cannot outrank ORX/operator instructions. Treating rules as advisory progressive-disclosure context prevents installed or fetched plugin content from changing permissions, enabling MCP/hooks/bins/executable commands, or silently altering instruction priority.

## 2026-06-27: Plugin Manifest Metadata Is Display-Only Until Policy Uses It

Decision: ORX plugin manifests may include sanitized metadata for homepage, documentation, license, trust tier, auth, privacy, and runtime requirements. ORX renders this metadata in `/plugins inspect` and summaries as operator-facing risk/requirements context only; it does not grant permissions, mark a plugin trusted, satisfy MCP schema trust, or activate hooks, bins, MCP servers, executable commands, or plugin code.

Reasoning: Metadata improves operator visibility before remote/plugin execution exists, but it is still plugin-controlled. Keeping it display-only avoids confusing self-declared trust/auth/privacy claims with ORX-owned policy decisions.

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
