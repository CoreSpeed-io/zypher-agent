import { Anthropic } from "@anthropic-ai/sdk";
import type {
  LLMProvider,
  LLMStream,
  StreamChatParams,
  StreamOptions,
  ProviderInfo,
  ProviderCapability,
  UnifiedMessage,
  UnifiedContent,
  UnifiedTool,
  StreamEvent,
  ContentDeltaEvent,
  ToolCallEvent,
  MessageCompleteEvent,
  ErrorEvent,
  MetadataEvent,
} from "./LLMProvider.ts";

type AnthropicOptions = ConstructorParameters<typeof Anthropic>[0];

/**
 * Implementation of LLMStream for Anthropic
 */
class AnthropicStream implements LLMStream {
  private handlers: Map<string, Array<(event: any) => void>> = new Map();
  private rawHandlers: Array<(event: unknown) => void> = [];
  private anthropicStream: any;
  private abortController: AbortController;
  
  constructor(anthropicStream: any, abortController: AbortController) {
    this.anthropicStream = anthropicStream;
    this.abortController = abortController;
    this.setupEventHandlers();
  }
  
  private setupEventHandlers() {
    let currentToolCall: { id: string; name: string; arguments: string } | null = null;
    
    // Handle text deltas
    this.anthropicStream.on('text', (textDelta: string, snapshot: any) => {
      const event: ContentDeltaEvent = {
        type: 'content_delta',
        delta: textDelta,
        index: 0 // Anthropic doesn't provide index in text event
      };
      this.emit('content_delta', event);
    });
    
    // Handle stream events for tool calls
    this.anthropicStream.on('streamEvent', (event: Anthropic.MessageStreamEvent) => {
      // Emit raw event
      this.rawHandlers.forEach(handler => handler(event));
      
      // Handle tool use
      if (event.type === 'content_block_start' && 
          event.content_block?.type === 'tool_use') {
        currentToolCall = {
          id: event.content_block.id,
          name: event.content_block.name,
          arguments: ''
        };
      }
    });
    
    // Handle tool input JSON
    this.anthropicStream.on('inputJson', (partialJson: string) => {
      if (currentToolCall) {
        currentToolCall.arguments = partialJson;
        const event: ToolCallEvent = {
          type: 'tool_call',
          toolCall: { ...currentToolCall }
        };
        this.emit('tool_call', event);
      }
    });
  }
  
  private emit(eventType: string, event: StreamEvent) {
    const handlers = this.handlers.get(eventType) || [];
    handlers.forEach(handler => handler(event));
  }
  
  on(event: 'content_delta', handler: (event: ContentDeltaEvent) => void): LLMStream;
  on(event: 'tool_call', handler: (event: ToolCallEvent) => void): LLMStream;
  on(event: 'message_complete', handler: (event: MessageCompleteEvent) => void): LLMStream;
  on(event: 'error', handler: (event: ErrorEvent) => void): LLMStream;
  on(event: 'metadata', handler: (event: MetadataEvent) => void): LLMStream;
  on(event: string, handler: (event: any) => void): LLMStream {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event)!.push(handler);
    return this;
  }
  
  onRaw(handler: (event: unknown) => void): LLMStream {
    this.rawHandlers.push(handler);
    return this;
  }
  
  async getFinalMessage(): Promise<UnifiedMessage> {
    const anthropicMessage = await this.anthropicStream.finalMessage();
    return this.convertToUnifiedMessage(anthropicMessage);
  }
  
  abort(): void {
    this.abortController.abort();
  }
  
  private convertToUnifiedMessage(anthropicMessage: any): UnifiedMessage {
    const unifiedContent: UnifiedContent[] = [];
    
    for (const block of anthropicMessage.content) {
      if (block.type === 'text') {
        unifiedContent.push({
          type: 'text',
          text: block.text
        });
      } else if (block.type === 'tool_use') {
        unifiedContent.push({
          type: 'tool_call',
          id: block.id,
          name: block.name,
          arguments: block.input as Record<string, unknown>
        });
      }
    }
    
    // Emit message complete event
    const event: MessageCompleteEvent = {
      type: 'message_complete',
      message: {
        role: 'assistant',
        content: unifiedContent
      },
      stopReason: anthropicMessage.stop_reason as 'stop' | 'max_tokens' | 'tool_use'
    };
    this.emit('message_complete', event);
    
    return event.message;
  }
}

/**
 * Anthropic provider implementation
 */
export class AnthropicProvider implements LLMProvider {
  readonly #client: Anthropic;

  constructor(options: AnthropicOptions = {}) {
    const apiKey = options.apiKey ?? Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      throw new Error(
        "AnthropicProvider: missing API key – supply via constructor or " +
          "ANTHROPIC_API_KEY env var.",
      );
    }

    this.#client = new Anthropic(options.apiKey ? options : { ...options, apiKey });
  }

  getInfo(): ProviderInfo {
    return {
      name: 'anthropic',
      version: '1.0.0',
      capabilities: [
        'caching',
        'thinking', 
        'web_search',
        'vision',
        'documents',
        'tool_calling'
      ]
    };
  }
  
  supportsCapability(capability: ProviderCapability): boolean {
    return this.getInfo().capabilities.includes(capability);
  }

  streamChat(params: StreamChatParams, options: StreamOptions = {}): LLMStream {
    const anthropicParams = this.convertToAnthropicParams(params);
    const abortController = new AbortController();
    
    // Merge signals
    const signal = options.signal 
      ? AbortSignal.any([options.signal, abortController.signal])
      : abortController.signal;
    
    const anthropicStream = this.#client.messages.stream(anthropicParams, { signal });
    
    return new AnthropicStream(anthropicStream, abortController);
  }
  
  private convertToAnthropicParams(params: StreamChatParams): any {
    const messages = params.messages
      .filter(msg => msg.role !== 'system')
      .map(msg => this.convertMessage(msg));
    
    // Extract system messages
    const systemMessages = params.messages
      .filter(msg => msg.role === 'system')
      .map(msg => msg.content.map(c => c.type === 'text' ? c.text : '').join('\n'))
      .join('\n');
    
    const systemPrompt = params.systemPrompt || systemMessages;
    
    const anthropicParams: any = {
      model: params.model,
      max_tokens: params.maxTokens || 4096,
      messages,
      ...(systemPrompt && { 
        system: [{
          type: 'text',
          text: systemPrompt,
          ...(params.providerOptions?.anthropic?.enableCaching && {
            cache_control: { type: 'ephemeral' }
          })
        }]
      }),
      ...(params.tools && { tools: params.tools.map(t => this.convertTool(t)) }),
      ...(params.metadata && { metadata: params.metadata })
    };
    
    // Add thinking options if supported
    if (params.providerOptions?.anthropic?.thinking) {
      anthropicParams.thinking = {
        type: params.providerOptions.anthropic.thinking.enabled ? 'enabled' : 'disabled',
        ...(params.providerOptions.anthropic.thinking.budgetTokens && {
          budget_tokens: params.providerOptions.anthropic.thinking.budgetTokens
        })
      };
    }
    
    return anthropicParams;
  }
  
  private convertMessage(message: UnifiedMessage): Anthropic.MessageParam {
    const content: Anthropic.ContentBlockParam[] = [];
    
    for (const block of message.content) {
      switch (block.type) {
        case 'text':
          content.push({
            type: 'text',
            text: block.text,
            ...(block.cacheControl && { cache_control: block.cacheControl })
          });
          break;
          
        case 'image':
          if (block.source.type === 'url') {
            content.push({
              type: 'image',
              source: {
                type: 'url',
                url: block.source.data
              }
            });
          } else {
            content.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: (block.source.mediaType || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                data: block.source.data
              }
            });
          }
          break;
          
        case 'document':
          if (block.source.type === 'url') {
            content.push({
              type: 'document',
              source: {
                type: 'url',
                url: block.source.data
              }
            });
          } else {
            content.push({
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf' as const,
                data: block.source.data
              }
            });
          }
          break;
          
        case 'tool_result':
          content.push({
            type: 'tool_result',
            tool_use_id: block.toolCallId,
            content: block.content,
            ...(block.isError && { is_error: true })
          });
          break;
      }
    }
    
    return {
      role: message.role as 'user' | 'assistant',
      content
    };
  }
  
  private convertTool(tool: UnifiedTool): Anthropic.Tool {
    return {
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters as Anthropic.Tool.InputSchema
    };
  }
}
