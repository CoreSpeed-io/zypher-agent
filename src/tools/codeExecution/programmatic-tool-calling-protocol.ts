

/**
 * Programmatic Tool Calling (PTC) Protocol - defines communication between
 * CodeExecutionController <--> CodeExecutionRunner.
 * Transport-agnostic: works over WebWorker, HTTP, or direct execution.
 */

import type { InputSchema } from "../mod.ts";

// ============================================================================
// Protocol Messages
// ============================================================================

/** Request to execute code (Controller → Runner) */
export interface CodeExecutionRequest {
  type: "execute";
  /** Code language (e.g., "javascript", "python") */
  language: string;
  /** Function body to execute */
  code: string;
  /** Available tools: serverId → tool signatures */
  toolDefinitions: ToolDefinitions;
}

/** Tool call request (Runner → Controller) */
export interface ToolCallRequest {
  type: "tool_call";
  /** Unique ID for matching response */
  callId: string;
  serverId: string;
  toolName: string;
  args: unknown;
}

/** Tool call response (Controller → Runner) */
export interface ToolCallResponse {
  type: "tool_response";
  /** Matches callId from request */
  callId: string;
  result?: unknown;
  error?: string;
}

/** Final execution result (Runner → Controller) */
export interface CodeExecutionResult {
  type: "result";
  success: boolean;
  data?: unknown;
  error?: string;
  /** Captured console output */
  logs?: string[];
  timedOut?: boolean;
}

/** Messages: Controller → Runner */
export type ControllerMessage = CodeExecutionRequest | ToolCallResponse;

/** Messages: Runner → Controller */
export type RunnerMessage = ToolCallRequest | CodeExecutionResult;

// ============================================================================
// Tool Definitions
// ============================================================================
export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly parameters: InputSchema;
}

/** Tool definitions: serverId → tool signatures (serializable) */
export type ToolDefinitions = Record<string, ToolDefinition[]>;

// ============================================================================
// CodeExecutionController Interface
// ============================================================================

/** Routes tool calls to MCP servers */
export type ToolCallHandler = (
  serverId: string,
  toolName: string,
  args: unknown,
) => Promise<unknown>;

/**
 * Controller side of the protocol (main thread).
 * Manages execution session, provides tool call routing to MCP servers.
 */
export interface CodeExecutionController {
  /** Handler for tool calls from Runner */
  onToolCall: ToolCallHandler;

  execute(
    code: string,
    language: string,
    toolDefinitions: ToolDefinitions,
  ): Promise<CodeExecutionResult>;

  /** Clean up resources */
  dispose(): void;
}

// ============================================================================
// CodeExecutionRunner Interface
// ============================================================================

/**
 * Runner side of the protocol (sandbox).
 * Executes code, requests tool calls from Controller.
 */
export interface CodeExecutionRunner {
  /**
   * Request a tool call from Controller.
   * @param serverId - MCP server ID
   * @param toolName - Tool name (without server prefix)
   * @param args - Tool arguments
   */
  toolCall(serverId: string, toolName: string, args: unknown): Promise<unknown>;

  /** Send final execution result to Controller */
  sendResult(result: Omit<CodeExecutionResult, "type">): void;
}
