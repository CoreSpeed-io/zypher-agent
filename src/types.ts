import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";

/**
 * Base interface for tool parameters
 */
export interface BaseParams {
  [key: string]: unknown;
}

/**
 * Base interface for all tools
 */
export interface Tool<P extends BaseParams = BaseParams> {
  /**
   * The name of the tool
   */
  readonly name: string;

  /**
   * A description of what the tool does
   */
  readonly description: string;

  /**
   * The JSON schema for the tool's parameters
   */
  readonly parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };

  /**
   * Execute the tool with the given parameters
   */
  execute(params: P): Promise<string>;
}

/**
 * Configuration options for ZypherAgent
 */
export interface ZypherAgentConfig {
  anthropicApiKey?: string;
  model?: string;
  maxTokens?: number;
}

/**
 * Interface for the ZypherAgent class
 */
export interface ZypherAgent {
  /**
   * The system prompt used by the agent
   */
  readonly system: string;

  /**
   * The conversation history
   */
  readonly messages: MessageParam[];

  /**
   * The registered tools
   */
  readonly tools: Map<string, Tool>;

  /**
   * Register a new tool with the agent
   */
  registerTool(tool: Tool): void;

  /**
   * Run a task with the agent
   */
  runTaskLoop(taskDescription: string, maxIterations?: number): Promise<MessageParam[]>;
}

/**
 * Parameters for reading a file
 */
export interface ReadFileParams extends BaseParams {
  filePath: string;
  startLine: number;
  endLine?: number;
}

/**
 * Parameters for listing directory contents
 */
export interface ListDirParams extends BaseParams {
  dirPath: string;
}

/**
 * Parameters for editing a file
 */
export interface EditFileParams extends BaseParams {
  filePath: string;
  content: string;
  append?: boolean;
} 