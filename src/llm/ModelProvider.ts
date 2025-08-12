import { Observable } from "rxjs";
import type { Message } from "../message.ts";
import type { Tool } from "../tools/mod.ts";
import type { FileAttachmentCacheMap } from "../storage/mod.ts";

export interface StreamChatParams {
  model: string;
  maxTokens: number;
  system: string;
  messages: Message[];
  tools?: Tool[];
  metadata?: Record<string, unknown>;
  thinking?: {
    type: "enabled" | "disabled";
    budget_tokens?: number;
  };
  signal?: AbortSignal;
}

/**
 * Provider capabilities
 */
export type ProviderCapability =
  | "caching"
  | "thinking"
  | "web_search"
  | "vision"
  | "documents"
  | "json_mode"
  | "tool_calling";

/**
 * Provider information
 */
export interface ProviderInfo {
  name: string;
  version: string;
  capabilities: ProviderCapability[];
}

/**
 * Abstraction that a concrete large-language-model provider (Anthropic,
 * OpenAI, etc.) must implement.  At present only streaming chat completions
 * are required, but the interface can evolve as the code-base grows.
 */
export interface ModelProvider {
  /**
   * Get provider information.
   */
  get info(): ProviderInfo;

  /**
   * Request a streaming chat completion.  The returned object must satisfy the
   * structural `LLMStream` interface so that downstream code can interact with
   * it in a provider-agnostic manner.
   */
  streamChat(
    params: StreamChatParams,
    fileAttachmentCacheMap?: FileAttachmentCacheMap,
  ): ModelStream;
}

export interface ModelStream {
  /**
   * Get an observable that emits the next message in the stream.
   */
  get events(): Observable<ModelEvent>;

  /**
   * Wait for the stream to complete and get the final message
   */
  finalMessage(): Promise<FinalMessage>;
}

// "end_turn": the model reached a natural stopping point
// "max_tokens": we exceeded the requested max_tokens or the model's maximum
// "stop_sequence": one of your provided custom stop_sequences was generated
// "tool_use": the model invoked one or more tools

export interface FinalMessage extends Message {
  stop_reason:
    | "end_turn" // the model reached a natural stopping point
    | "max_tokens" // we exceeded the requested max_tokens or the model's maximum
    | "stop_sequence" // one of your provided custom stop_sequences was generated
    | "tool_use"; // the model invoked one or more tools
}

export type ModelEvent = MessageEvent | TextEvent;

export interface MessageEvent {
  type: "message";
  message: FinalMessage;
}

export interface TextEvent {
  type: "text";
  text: string;
}

export interface ToolUseEvent {
  type: "tool_use";
  partialInput: string;
}
