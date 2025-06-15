/* ------------------------------------------------------------------------- */
/* LLMProvider - provider-agnostic abstraction for streaming chat models     */
/* ------------------------------------------------------------------------- */

/**
 * Generic wrapper around a streaming chat completion.
 *
 * The contract is intentionally minimal and *structural* so that the concrete
 * provider can simply return the underlying SDK stream object as long as it
 * exposes the listed methods.  This mirrors the subset of functionality used
 * by `ZypherAgent`.
 */
export interface LLMStream {
  on(
    event: "text",
    handler: (delta: string) => void,
  ): LLMStream;
  on(
    event: "streamEvent",
    handler: (evt: unknown) => void,
  ): LLMStream;
  on(
    event: "inputJson",
    handler: (partial: string) => void,
  ): LLMStream;

  /** Resolves when the stream has produced the final assistant message. */
  finalMessage(): Promise<unknown>;
}

/**
 * Parameter object accepted by `streamChat`.  It intentionally mirrors the
 * shape forwarded by `ZypherAgent` so that the agent can remain unchanged
 * regardless of the concrete provider selected at runtime.
 */
export interface StreamChatParams {
  model: string;
  max_tokens?: number;
  system: unknown;
  messages: unknown[];
  tools?: unknown[];
  metadata?: Record<string, unknown>;
  thinking?: {
    type: "enabled" | "disabled";
    budget_tokens?: number;
  };
}

/**
 * Abstraction that a concrete large-language-model provider (Anthropic,
 * OpenAI, etc.) must implement.  At present only streaming chat completions
 * are required, but the interface can evolve as the code-base grows.
 */
export interface LLMProvider {
  /**
   * Request a streaming chat completion.  The returned object must satisfy the
   * structural `LLMStream` interface so that downstream code can interact with
   * it in a provider-agnostic manner.
   */
  streamChat(
    params: StreamChatParams,
    options?: { signal?: AbortSignal },
  ): LLMStream;
}
