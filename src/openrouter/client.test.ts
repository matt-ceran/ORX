import test from "node:test";
import assert from "node:assert/strict";
import { OpenRouterApiError, streamOpenRouterAsk } from "./client.js";
import type { OpenRouterChatRequest, OpenRouterRequestMetadata } from "./types.js";

const encoder = new TextEncoder();

const request: OpenRouterChatRequest = {
  model: "openrouter/auto",
  messages: [{ role: "user", content: "Say hello" }],
  stream: true,
};

const requestMetadata: OpenRouterRequestMetadata = {
  mode: "auto",
  requestedModel: "openrouter/auto",
};

test("streams SSE text chunks and captures final metadata", async () => {
  let streamedText = "";
  const seenUrls: string[] = [];
  const seenBodies: unknown[] = [];
  const mockFetch: typeof fetch = async (input, init) => {
    seenUrls.push(String(input));
    if (init?.body) {
      seenBodies.push(JSON.parse(String(init.body)));
    }

    if (String(input).endsWith("/chat/completions")) {
      return new Response(
        streamFrom([
          ": keepalive\n\n",
          'data: {"model":"openrouter/auto","choices":[{"delta":{"content":"Hello"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
          'data: {"usage":{"prompt_tokens":2,"completion_tokens":3,"total_tokens":5,"completion_tokens_details":{"reasoning_tokens":1}},"choices":[]}\n\n',
          "data: [DONE]\n\n",
        ]),
        {
          status: 200,
          headers: {
            "content-type": "text/event-stream",
            "x-generation-id": "gen_123",
          },
        },
      );
    }

    assert.equal(String(input), "https://example.test/generation?id=gen_123");
    return new Response(
      JSON.stringify({
        data: {
          model: "anthropic/claude-sonnet-4.5",
          total_cost: "0.00042",
        },
      }),
      { status: 200 },
    );
  };

  const result = await streamOpenRouterAsk(
    {
      apiKey: "test-key",
      baseUrl: "https://example.test",
      prompt: "Say hello",
      request,
      requestMetadata,
      fetch: mockFetch,
    },
    {
      onText(text) {
        streamedText += text;
      },
    },
  );

  assert.equal(streamedText, "Hello world");
  assert.deepEqual(seenUrls, [
    "https://example.test/chat/completions",
    "https://example.test/generation?id=gen_123",
  ]);
  assert.deepEqual(seenBodies, [request]);
  assert.equal(result.metadata.requestedModel, "openrouter/auto");
  assert.equal(result.metadata.resolvedModel, "anthropic/claude-sonnet-4.5");
  assert.equal(result.metadata.generationId, "gen_123");
  assert.equal(result.metadata.promptTokens, 2);
  assert.equal(result.metadata.completionTokens, 3);
  assert.equal(result.metadata.totalTokens, 5);
  assert.equal(result.metadata.reasoningTokens, 1);
  assert.equal(result.metadata.cost, 0.00042);
});

test("does not fail a successful stream when generation lookup is unavailable", async () => {
  const mockFetch: typeof fetch = async (input) => {
    if (String(input).endsWith("/chat/completions")) {
      return new Response(
        streamFrom([
          'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
          "data: [DONE]\n\n",
        ]),
        {
          status: 200,
          headers: {
            "x-generation-id": "gen_missing",
          },
        },
      );
    }

    return new Response("not found", { status: 404 });
  };

  const result = await streamOpenRouterAsk(
    {
      apiKey: "test-key",
      baseUrl: "https://example.test",
      prompt: "Say hello",
      request,
      requestMetadata,
      fetch: mockFetch,
    },
    {
      onText() {},
    },
  );

  assert.equal(result.metadata.generationId, "gen_missing");
});

test("reports non-2xx OpenRouter errors without leaking secrets", async () => {
  const mockFetch: typeof fetch = async () =>
    new Response('bad key test-key Authorization: Bearer test-key', {
      status: 401,
    });

  await assert.rejects(
    streamOpenRouterAsk(
      {
        apiKey: "test-key",
        baseUrl: "https://example.test",
        prompt: "Say hello",
        request,
        requestMetadata,
        fetch: mockFetch,
      },
      {
        onText() {},
      },
    ),
    (error) => {
      assert.ok(error instanceof OpenRouterApiError);
      assert.equal(error.status, 401);
      assert.match(error.message, /HTTP 401/);
      assert.doesNotMatch(error.message, /test-key/);
      assert.match(error.message, /\[redacted\]/);
      return true;
    },
  );
});

function streamFrom(chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}
