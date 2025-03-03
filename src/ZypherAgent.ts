import { Anthropic } from '@anthropic-ai/sdk';
import type {
  Message,
  MessageParam,
  ToolUseBlock,
  ToolResultBlockParam,
  ToolUnion,
} from '@anthropic-ai/sdk/resources/messages';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { Tool, ZypherAgent as IZypherAgent, ZypherAgentConfig } from './types';

const DEFAULT_MODEL = 'claude-3-5-sonnet-20241022';
const DEFAULT_MAX_TOKENS = 4096;

export class ZypherAgent implements IZypherAgent {
  private readonly client: Anthropic;
  private readonly _tools: Map<string, Tool>;
  private _messages: MessageParam[];
  private readonly _system: string;
  private readonly maxTokens: number;

  constructor(config: ZypherAgentConfig = {}) {
    const apiKey = config.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        'API key is required. Provide it in config or set ANTHROPIC_API_KEY environment variable.'
      );
    }

    this.client = new Anthropic({ apiKey });
    this._tools = new Map();
    this._messages = [];
    this._system = this.loadSystemPrompt();
    this.maxTokens = config.maxTokens ?? DEFAULT_MAX_TOKENS;
  }

  private loadSystemPrompt(): string {
    try {
      const promptPath = join(__dirname, 'system_prompt.txt');
      return readFileSync(promptPath, 'utf-8');
    } catch (error) {
      return 'You are a helpful AI assistant with access to tools.';
    }
  }

  get system(): string {
    return this._system;
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

  async runTaskLoop(
    taskDescription: string,
    maxIterations: number = 5
  ): Promise<Message[]> {
    let iterations = 0;
    const messages: MessageParam[] = [...this._messages];

    // Add user message
    messages.push({
      role: 'user',
      content: taskDescription,
    });

    while (iterations < maxIterations) {
      const response = await this.client.messages.create({
        model: DEFAULT_MODEL,
        max_tokens: this.maxTokens,
        system: this._system,
        messages,
        tools: Array.from(this._tools.values()).map((tool): ToolUnion => ({
          name: tool.name,
          description: tool.description,
          input_schema: {
            type: 'object',
            properties: tool.parameters.properties,
            required: tool.parameters.required,
          },
        })),
      });

      // Add assistant response
      messages.push({
        role: 'assistant',
        content: response.content,
      } as MessageParam);

      // Check if we need to continue the loop
      const shouldContinue = response.content.some(
        (block): block is ToolUseBlock => block.type === 'tool_use'
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
          messages.push({
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: block.id,
                content: result,
              } as ToolResultBlockParam,
            ],
          });
        }
      }

      iterations++;
    }

    this._messages = messages as Message[];
    return this.messages;
  }
} 