import OpenAI from "@openai/openai";
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

type OpenAIOptions = ConstructorParameters<typeof OpenAI>[0];

/**
 * Implementation of LLMStream for OpenAI
 */
class OpenAIStream implements LLMStream {
  private handlers: Map<string, Array<(event: any) => void>> = new Map();
  private rawHandlers: Array<(event: unknown) => void> = [];
  private abortController: AbortController;
  private finalMessagePromise: Promise<UnifiedMessage>;
  
  constructor(stream: AsyncIterable<OpenAI.ChatCompletionChunk>, abortController: AbortController) {
    this.abortController = abortController;
    this.finalMessagePromise = this.processStream(stream);
  }
  
  private async processStream(stream: AsyncIterable<OpenAI.ChatCompletionChunk>): Promise<UnifiedMessage> {
    const content: UnifiedContent[] = [];
    let currentText = '';
    const toolCalls: Map<number, { id: string; name: string; arguments: string }> = new Map();
    let stopReason: 'stop' | 'max_tokens' | 'tool_use' = 'stop';
    
    try {
      for await (const chunk of stream) {
        // Emit raw event
        this.rawHandlers.forEach(handler => handler(chunk));
        
        const choice = chunk.choices[0];
        if (!choice) continue;
        
        // Handle content delta
        if (choice.delta.content) {
          currentText += choice.delta.content;
          const event: ContentDeltaEvent = {
            type: 'content_delta',
            delta: choice.delta.content,
            index: choice.index
          };
          this.emit('content_delta', event);
        }
        
        // Handle tool calls
        if (choice.delta.tool_calls) {
          for (const toolCallDelta of choice.delta.tool_calls) {
            const index = toolCallDelta.index;
            
            if (!toolCalls.has(index)) {
              toolCalls.set(index, {
                id: toolCallDelta.id || '',
                name: toolCallDelta.function?.name || '',
                arguments: ''
              });
            }
            
            const toolCall = toolCalls.get(index)!;
            if (toolCallDelta.id) toolCall.id = toolCallDelta.id;
            if (toolCallDelta.function?.name) toolCall.name = toolCallDelta.function.name;
            if (toolCallDelta.function?.arguments) {
              toolCall.arguments += toolCallDelta.function.arguments;
            }
            
            const event: ToolCallEvent = {
              type: 'tool_call',
              toolCall: { ...toolCall }
            };
            this.emit('tool_call', event);
          }
        }
        
        // Check finish reason
        if (choice.finish_reason) {
          if (choice.finish_reason === 'tool_calls') {
            stopReason = 'tool_use';
          } else if (choice.finish_reason === 'length') {
            stopReason = 'max_tokens';
          }
        }
      }
    } catch (error) {
      const errorEvent: ErrorEvent = {
        type: 'error',
        error: error instanceof Error ? error : new Error(String(error))
      };
      this.emit('error', errorEvent);
      throw error;
    }
    
    // Build final content
    if (currentText) {
      content.push({ type: 'text', text: currentText });
    }
    
    // Add tool calls to content
    for (const [_, toolCall] of toolCalls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(toolCall.arguments);
      } catch {
        // If parsing fails, pass raw string
        args = { raw: toolCall.arguments };
      }
      
      content.push({
        type: 'tool_call',
        id: toolCall.id,
        name: toolCall.name,
        arguments: args
      });
    }
    
    const message: UnifiedMessage = {
      role: 'assistant',
      content
    };
    
    // Emit complete event
    const completeEvent: MessageCompleteEvent = {
      type: 'message_complete',
      message,
      stopReason
    };
    this.emit('message_complete', completeEvent);
    
    return message;
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
    return this.finalMessagePromise;
  }
  
  abort(): void {
    this.abortController.abort();
  }
}

/**
 * OpenAI provider implementation
 */
export class OpenAIProvider implements LLMProvider {
  readonly #client: OpenAI;

  constructor(options: OpenAIOptions = {}) {
    const apiKey = options.apiKey ?? Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      throw new Error(
        "OpenAIProvider: missing API key – supply via constructor or " +
          "OPENAI_API_KEY env var.",
      );
    }

    this.#client = new OpenAI({ ...options, apiKey });
  }

  getInfo(): ProviderInfo {
    return {
      name: 'openai',
      version: '1.0.0',
      capabilities: [
        'vision',
        'json_mode',
        'tool_calling'
      ]
    };
  }
  
  supportsCapability(capability: ProviderCapability): boolean {
    return this.getInfo().capabilities.includes(capability);
  }

  streamChat(params: StreamChatParams, options: StreamOptions = {}): LLMStream {
    const openAIParams = this.convertToOpenAIParams(params);
    const abortController = new AbortController();
    
    // Merge signals
    const signal = options.signal 
      ? AbortSignal.any([options.signal, abortController.signal])
      : abortController.signal;
    
    // Use proper typing for the streaming API
    const stream = this.#client.chat.completions.create({
      model: openAIParams.model,
      messages: openAIParams.messages,
      stream: true,
      ...(openAIParams.temperature !== undefined && { temperature: openAIParams.temperature }),
      ...(openAIParams.max_tokens && { max_tokens: openAIParams.max_tokens }),
      ...(openAIParams.tools && { tools: openAIParams.tools }),
      ...(openAIParams.user && { user: openAIParams.user }),
      ...(openAIParams.response_format && { response_format: openAIParams.response_format }),
      ...(openAIParams.seed !== undefined && { seed: openAIParams.seed })
    } as OpenAI.ChatCompletionCreateParamsStreaming, { signal });
    
    return new OpenAIStream(stream as any, abortController);
  }
  
  private convertToOpenAIParams(params: StreamChatParams): any {
    const messages = this.convertMessages(params);
    
    const openAIParams: any = {
      model: params.model,
      messages
    };
    
    // Add optional parameters
    if (params.temperature !== undefined) {
      openAIParams.temperature = params.temperature;
    }
    if (params.maxTokens) {
      openAIParams.max_tokens = params.maxTokens;
    }
    if (params.tools) {
      openAIParams.tools = params.tools.map(t => this.convertTool(t));
    }
    if (params.metadata?.user_id) {
      openAIParams.user = String(params.metadata.user_id);
    }
    
    // Add OpenAI-specific options
    if (params.providerOptions?.openai) {
      const { responseFormat, seed } = params.providerOptions.openai;
      if (responseFormat) {
        openAIParams.response_format = { type: responseFormat };
      }
      if (seed !== undefined) {
        openAIParams.seed = seed;
      }
    }
    
    return openAIParams;
  }
  
  private convertMessages(params: StreamChatParams): OpenAI.ChatCompletionMessageParam[] {
    const messages: OpenAI.ChatCompletionMessageParam[] = [];
    
    // Add system prompt if provided
    if (params.systemPrompt) {
      messages.push({
        role: 'system',
        content: params.systemPrompt
      });
    }
    
    // Convert all messages
    for (const msg of params.messages) {
      if (msg.role === 'system') {
        // System messages
        const systemContent = msg.content
          .filter(c => c.type === 'text')
          .map(c => (c as any).text)
          .join('\n');
        
        if (systemContent && !params.systemPrompt) {
          messages.push({
            role: 'system',
            content: systemContent
          });
        }
      } else if (msg.role === 'user') {
        // User messages
        const converted = this.convertUserMessage(msg);
        if (converted) messages.push(converted);
      } else if (msg.role === 'assistant') {
        // Assistant messages
        const converted = this.convertAssistantMessage(msg);
        if (converted) messages.push(converted);
      }
    }
    
    return messages;
  }
  
  private convertUserMessage(message: UnifiedMessage): OpenAI.ChatCompletionUserMessageParam | OpenAI.ChatCompletionToolMessageParam | null {
    // Check if this is a tool result message
    const toolResults = message.content.filter(c => c.type === 'tool_result');
    if (toolResults.length > 0) {
      // OpenAI expects tool results as separate tool messages
      // For now, we'll skip these as they need to be handled differently
      // In a full implementation, we'd need to track tool call IDs
      return null;
    }
    
    // Handle regular user messages
    const content: Array<OpenAI.ChatCompletionContentPartText | OpenAI.ChatCompletionContentPartImage> = [];
    
    for (const block of message.content) {
      switch (block.type) {
        case 'text':
          content.push({
            type: 'text',
            text: block.text
          });
          break;
          
        case 'image':
          if (block.source.type === 'url') {
            content.push({
              type: 'image_url',
              image_url: { url: block.source.data }
            });
          } else {
            // For base64, need to format as data URL
            const dataUrl = `data:${block.source.mediaType || 'image/jpeg'};base64,${block.source.data}`;
            content.push({
              type: 'image_url', 
              image_url: { url: dataUrl }
            });
          }
          break;
      }
    }
    
    if (content.length === 0) return null;
    
    // If only text content, can use string format
    if (content.length === 1 && content[0].type === 'text') {
      return {
        role: 'user',
        content: content[0].text
      };
    }
    
    return {
      role: 'user',
      content
    };
  }
  
  private convertAssistantMessage(message: UnifiedMessage): OpenAI.ChatCompletionAssistantMessageParam | null {
    let textContent = '';
    const toolCalls: OpenAI.ChatCompletionMessageToolCall[] = [];
    
    for (const block of message.content) {
      switch (block.type) {
        case 'text':
          textContent += block.text;
          break;
          
        case 'tool_call':
          toolCalls.push({
            id: block.id,
            type: 'function',
            function: {
              name: block.name,
              arguments: JSON.stringify(block.arguments)
            }
          });
          break;
      }
    }
    
    if (!textContent && toolCalls.length === 0) return null;
    
    return {
      role: 'assistant',
      ...(textContent && { content: textContent }),
      ...(toolCalls.length > 0 && { tool_calls: toolCalls })
    };
  }
  
  private convertTool(tool: UnifiedTool): OpenAI.ChatCompletionTool {
    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }
    };
  }
}
