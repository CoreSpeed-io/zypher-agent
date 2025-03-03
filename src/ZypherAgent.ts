import { Anthropic } from '@anthropic-ai/sdk';
import type {
  Message,
  MessageParam,
  ToolUseBlock,
  ToolResultBlockParam,
  ToolUnion,
} from '@anthropic-ai/sdk/resources/messages';
import type { Tool } from './tools';
import { printMessage, getCurrentUserInfo } from './utils';
import { getSystemPrompt } from './prompt';

const DEFAULT_MODEL = 'claude-3-5-sonnet-20241022';
const DEFAULT_MAX_TOKENS = 4096;

export interface ZypherAgentConfig {
  anthropicApiKey?: string;
  model?: string;
  maxTokens?: number;
}

export class ZypherAgent {
  private readonly client: Anthropic;
  private readonly _tools: Map<string, Tool>;
  private readonly system: string;
  private readonly maxTokens: number;
  private _messages: MessageParam[]; 

  constructor(config: ZypherAgentConfig = {}) {
    const apiKey = config.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        'API key is required. Provide it in config or set ANTHROPIC_API_KEY environment variable.',
      );
    }

    this.client = new Anthropic({ apiKey });
    this._tools = new Map();
    this._messages = [];
    this.system = getSystemPrompt(getCurrentUserInfo());
    this.maxTokens = config.maxTokens ?? DEFAULT_MAX_TOKENS;
  }

  get messages(): MessageParam[] {
    return [...this._messages];
  }

  get tools(): Map<string, Tool> {
    return new Map(this._tools);
  }

  registerTool(tool: Tool): void {
    this._tools.set(tool.name, tool);
  }

  private async executeToolCall(toolCall: {
    name: string;
    parameters: Record<string, unknown>;
  }): Promise<string> {
    const tool = this._tools.get(toolCall.name);
    if (!tool) {
      return `Error: Tool '${toolCall.name}' not found`;
    }

    try {
      return await tool.execute(toolCall.parameters);
    } catch (error) {
      if (error instanceof Error) {
        return `Error executing tool '${toolCall.name}': ${error.message}`;
      }
      return `Error executing tool '${toolCall.name}': Unknown error`;
    }
  }

  async runTaskLoop(taskDescription: string, maxIterations: number = 5): Promise<MessageParam[]> {
    let iterations = 0;
    const messages: MessageParam[] = [...this._messages];

    // Add user message
    const userMessage: MessageParam = {
      role: 'user',
      content: taskDescription,
    };
    messages.push(userMessage);
    printMessage(userMessage);

    while (iterations < maxIterations) {
      const response = await this.client.messages.create({
        model: DEFAULT_MODEL,
        max_tokens: this.maxTokens,
        system: this.system,
        messages,
        tools: Array.from(this._tools.values()).map(
          (tool): ToolUnion => ({
            name: tool.name,
            description: tool.description,
            input_schema: {
              type: 'object',
              properties: tool.parameters.properties,
              required: tool.parameters.required,
            },
          }),
        ),
      });

      // Add assistant response
      const assistantMessage: MessageParam = {
        role: 'assistant',
        content: response.content,
      };
      messages.push(assistantMessage);

      // Print the response
      printMessage(assistantMessage);

      // Check if we need to continue the loop
      const shouldContinue = response.content.some(
        (block): block is ToolUseBlock => block.type === 'tool_use',
      );

      if (!shouldContinue) {
        break;
      }

      // Execute tool calls
      for (const block of response.content) {
        if (block.type === 'tool_use') {
          const result = await this.executeToolCall({
            name: block.name,
            parameters: block.input as Record<string, unknown>,
          });

          // Add tool response
          const toolMessage: MessageParam = {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: block.id,
                content: result,
              } as ToolResultBlockParam,
            ],
          };
          messages.push(toolMessage);
          printMessage(toolMessage);
        }
      }

      iterations++;
    }

    this._messages = messages as Message[];
    return this.messages;
  }
}
