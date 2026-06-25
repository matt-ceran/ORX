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

- `/mode auto` selects `openrouter/auto`.
- `/mode fusion` selects `openrouter/fusion`.
- `/model <slug>` selects an exact model.
- `/fusion <preset>` sets Fusion plugin config.
- `/status` shows active mode, model, Fusion config, generation id, tokens, and spend.

## MCP Boundary

OpenRouter MCP should be used for live lookup and testing:

- model search
- pricing
- benchmarks
- rankings
- credits
- generation lookup

The ORX runtime should still call the OpenRouter API directly for normal inference.

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

