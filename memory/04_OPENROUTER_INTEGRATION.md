# OpenRouter Integration

Last updated: 2026-06-25

## API Base

Use OpenRouter's OpenAI-compatible endpoint:

```text
https://openrouter.ai/api/v1
```

The default auth source should be:

```text
OPENROUTER_API_KEY
```

## Supported Model Modes

Exact model:

```ts
model: "anthropic/claude-sonnet-4.5"
```

Auto router:

```ts
model: "openrouter/auto"
```

Fusion:

```ts
model: "openrouter/fusion"
```

Fusion preset:

```ts
model: "openrouter/fusion",
plugins: [{ id: "fusion", preset: "general-budget" }]
```

## CLI Behavior

- `orx ask "prompt"` sends one non-interactive streaming chat request.
- `orx ask "prompt" --model <slug>` selects an exact model for that request.
- `orx ask "prompt" --mode auto` selects `openrouter/auto` for that request.
- `orx ask "prompt" --mode fusion --fusion <preset>` selects `openrouter/fusion` with plugin config for that request.
- `/mode auto` selects `openrouter/auto`.
- `/mode fusion` selects `openrouter/fusion`.
- `/model <slug>` selects an exact model.
- `/fusion <preset>` sets Fusion plugin config.
- `/fusion` with no argument shows the current Fusion preset.
- `/models` currently shows local routing state and notes that live search will come from OpenRouter MCP.
- `/status` shows active mode, model, Fusion config, generation id, tokens, and spend.
- `orx ask` and `orx chat` now route through `src/agent/`, which sends native ORX tool schemas with chat requests and handles model-requested tool calls automatically.

## Streaming Metadata

The current CLI reads token and cost metadata from the streaming response when OpenRouter provides it, captures `X-Generation-Id`, and performs a best-effort `/generation?id=<id>` lookup without failing the main response if that lookup is unavailable.

The streaming parser also aggregates OpenAI-compatible `delta.tool_calls` chunks and returns completed tool calls to the agent runtime.

## Orchestration Boundary

ORX should support future orchestration profiles without making OpenRouter responsible for non-OpenRouter agents:

- OpenRouter models can act as the primary controller.
- OpenRouter models can also be delegates through exact model slugs, `openrouter/auto`, or `openrouter/fusion`.
- External agents such as Codex or Devin are adapters, not OpenRouter models.
- Delegation should be exposed to the controller as an ORX-owned `delegate_task` tool.
- ORX owns adapter selection, credentials, permissions, budgets, execution, result truncation, and merge summaries.

## MCP Boundary

OpenRouter has an official hosted MCP server as of 2026-06-25. OpenRouter MCP should be used for live lookup and testing:

- model search
- pricing
- benchmarks
- rankings
- credits
- generation lookup
- providers
- docs search
- capped test calls through `chat-send`

The ORX runtime should still call the OpenRouter API directly for normal inference. Treat the MCP server as a development assistant and model-selection/research tool, not as ORX's primary chat transport.

## Cost Tracking

Persist per-turn metadata when available:

- selected model
- provider
- prompt tokens
- completion tokens
- reasoning tokens
- generation id
- cost

Expose it through `/cost`, `/status`, and session metadata.
