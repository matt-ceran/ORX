import type { OrxConfig } from "../config/types.js";
import { streamOpenRouterAsk } from "../openrouter/client.js";
import { buildChatRequest } from "../openrouter/request.js";
import type { OpenRouterMessage, OpenRouterStreamMetadata, OpenRouterToolCall } from "../openrouter/types.js";
import { dispatchNativeToolCall, type ToolDispatchResult } from "./tool-dispatch.js";
import { nativeToolDefinitions } from "./tool-schemas.js";

export interface AgentTurnCallbacks {
  onText?: (text: string) => void;
  onToolCall?: (toolCall: OpenRouterToolCall) => void;
  onToolResult?: (result: ToolDispatchResult) => void;
}

export interface RunAgentTurnOptions {
  apiKey: string;
  config: OrxConfig;
  messages: OpenRouterMessage[];
  cwd: string;
  fetch?: typeof fetch;
  signal?: AbortSignal;
  enableTools?: boolean;
  maxToolIterations?: number;
  callbacks?: AgentTurnCallbacks;
}

export interface AgentTurnResult {
  messages: OpenRouterMessage[];
  assistantText: string;
  metadata: OpenRouterStreamMetadata;
  toolResults: ToolDispatchResult[];
}

const DEFAULT_MAX_TOOL_ITERATIONS = 8;

export async function runAgentTurn(options: RunAgentTurnOptions): Promise<AgentTurnResult> {
  const enableTools = options.enableTools ?? true;
  const maxToolIterations = options.maxToolIterations ?? DEFAULT_MAX_TOOL_ITERATIONS;
  const messages = [...options.messages];
  const toolResults: ToolDispatchResult[] = [];
  let finalMetadata: OpenRouterStreamMetadata | undefined;
  let visibleAssistantText = "";

  for (let iteration = 0; ; iteration += 1) {
    throwIfAborted(options.signal);
    const built = buildChatRequest({
      config: options.config,
      messages,
      tools: enableTools ? nativeToolDefinitions : undefined,
    });
    let assistantText = "";
    const result = await streamOpenRouterAsk(
      {
        apiKey: options.apiKey,
        request: built.request,
        requestMetadata: built.metadata,
        fetch: options.fetch,
        signal: options.signal,
      },
      {
        onText(text) {
          assistantText += text;
          visibleAssistantText += text;
          options.callbacks?.onText?.(text);
        },
      },
    );
    finalMetadata = result.metadata;

    if (result.toolCalls.length === 0) {
      messages.push({
        role: "assistant",
        content: assistantText,
      });

      return {
        messages,
        assistantText: visibleAssistantText,
        metadata: finalMetadata,
        toolResults,
      };
    }

    if (iteration >= maxToolIterations) {
      throw new Error(`Tool-call loop exceeded ${maxToolIterations} iterations.`);
    }

    messages.push({
      role: "assistant",
      content: assistantText.length > 0 ? assistantText : null,
      tool_calls: result.toolCalls,
    });

    for (const toolCall of result.toolCalls) {
      options.callbacks?.onToolCall?.(toolCall);
      const toolResult = await dispatchNativeToolCall(toolCall, {
        cwd: options.cwd,
        signal: options.signal,
      });
      toolResults.push(toolResult);
      messages.push(toolResult.message);
      options.callbacks?.onToolResult?.(toolResult);
      throwIfAborted(options.signal);
    }
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) {
    return;
  }

  throw createAbortError();
}

function createAbortError(): Error {
  if (typeof DOMException !== "undefined") {
    return new DOMException("This operation was aborted.", "AbortError");
  }

  const error = new Error("AbortError");
  error.name = "AbortError";
  return error;
}
