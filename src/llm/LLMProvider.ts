/* ------------------------------------------------------------------------- */
/* LLMProvider - provider-agnostic abstraction for streaming chat models     */
/* ------------------------------------------------------------------------- */

/**
 * Unified message format that can be converted to provider-specific formats
 */
export interface UnifiedMessage {
  role: 'user' | 'assistant' | 'system';
  content: UnifiedContent[];
  metadata?: MessageMetadata;
}

/**
 * Message metadata
 */
export interface MessageMetadata {
  timestamp?: Date;
  checkpointId?: string;
  [key: string]: unknown;
}

/**
 * Unified content types that abstract over provider-specific formats
 */
export type UnifiedContent =
  | TextContent
  | ImageContent
  | DocumentContent
  | ToolCallContent
  | ToolResultContent;

export interface TextContent {
  type: 'text';
  text: string;
  cacheControl?: CacheControl;
}

export interface ImageContent {
  type: 'image';
  source: {
    type: 'url' | 'base64';
    data: string;
    mediaType?: string;
  };
}

export interface DocumentContent {
  type: 'document';
  source: {
    type: 'url' | 'base64';
    data: string;
    mediaType?: string;
  };
}

export interface ToolCallContent {
  type: 'tool_call';
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResultContent {
  type: 'tool_result';
  toolCallId: string;
  content: string;
  isError?: boolean;
}

export interface CacheControl {
  type: 'ephemeral';
}

/**
 * Unified tool definition
 */
export interface UnifiedTool {
  name: string;
  description: string;
  parameters: JsonSchema;
}

/**
 * JSON Schema type for tool parameters
 */
export interface JsonSchema {
  type: string;
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
  [key: string]: unknown;
}

/**
 * Stream event types
 */
export type StreamEvent = 
  | ContentDeltaEvent
  | ToolCallEvent
  | MessageCompleteEvent
  | ErrorEvent
  | MetadataEvent;

export interface ContentDeltaEvent {
  type: 'content_delta';
  delta: string;
  index: number;
}

export interface ToolCallEvent {
  type: 'tool_call';
  toolCall: {
    id: string;
    name: string;
    arguments: string; // Partial JSON string
  };
}

export interface MessageCompleteEvent {
  type: 'message_complete';
  message: UnifiedMessage;
  stopReason: 'stop' | 'max_tokens' | 'tool_use';
}

export interface ErrorEvent {
  type: 'error';
  error: Error;
}

export interface MetadataEvent {
  type: 'metadata';
  data: Record<string, unknown>;
}

/**
 * Generic wrapper around a streaming chat completion
 */
export interface LLMStream {
  /**
   * Subscribe to stream events
   */
  on(event: 'content_delta', handler: (event: ContentDeltaEvent) => void): LLMStream;
  on(event: 'tool_call', handler: (event: ToolCallEvent) => void): LLMStream;
  on(event: 'message_complete', handler: (event: MessageCompleteEvent) => void): LLMStream;
  on(event: 'error', handler: (event: ErrorEvent) => void): LLMStream;
  on(event: 'metadata', handler: (event: MetadataEvent) => void): LLMStream;
  
  /**
   * Access provider-specific raw events
   */
  onRaw(handler: (event: unknown) => void): LLMStream;
  
  /**
   * Wait for the stream to complete and get the final message
   */
  getFinalMessage(): Promise<UnifiedMessage>;
  
  /**
   * Abort the stream
   */
  abort(): void;
}

/**
 * Parameters for streaming chat
 */
export interface StreamChatParams {
  model: string;
  messages: UnifiedMessage[];
  tools?: UnifiedTool[];
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  metadata?: Record<string, unknown>;
  
  // Provider-specific options
  providerOptions?: {
    anthropic?: {
      enableCaching?: boolean;
      thinking?: {
        enabled: boolean;
        budgetTokens?: number;
      };
    };
    openai?: {
      responseFormat?: 'text' | 'json_object';
      seed?: number;
    };
  };
}

/**
 * Stream options
 */
export interface StreamOptions {
  signal?: AbortSignal;
}

/**
 * Provider capabilities
 */
export type ProviderCapability = 
  | 'caching'
  | 'thinking'
  | 'web_search'
  | 'vision'
  | 'documents'
  | 'json_mode'
  | 'tool_calling';

/**
 * Provider information
 */
export interface ProviderInfo {
  name: string;
  version: string;
  capabilities: ProviderCapability[];
}

/**
 * Abstraction that a concrete large-language-model provider must implement
 */
export interface LLMProvider {
  /**
   * Get provider information
   */
  getInfo(): ProviderInfo;
  
  /**
   * Check if a specific capability is supported
   */
  supportsCapability(capability: ProviderCapability): boolean;
  
  /**
   * Request a streaming chat completion
   */
  streamChat(params: StreamChatParams, options?: StreamOptions): LLMStream;
  
  /**
   * Convert a unified message to provider-specific format
   * This is useful for providers that need custom message formatting
   */
  formatMessage?(message: UnifiedMessage): unknown;
  
  /**
   * Convert a unified tool to provider-specific format
   */
  formatTool?(tool: UnifiedTool): unknown;
}
