/**
 * Programmatic Tool Calling (PTC) Protocol - defines communication between
 * CodeExecutionController <--> CodeExecutionRunner.
 * Transport-agnostic: works over WebWorker, HTTP, or direct execution.
 *
 * Tool Naming Convention:
 * - MCP tools: "mcp__{serverId}__{toolName}" (e.g., "mcp__slack__send_message")
 * - Non-MCP tools: just "{toolName}" (e.g., "read_file") - no prefix
 */

import type { ToolDefinition } from "../mod.ts";

// Re-export ToolDefinition from mod.ts
export type { ToolDefinition } from "../mod.ts";

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
  /** Available tools: flat array of tool definitions with prefixed names */
  toolDefinitions: ToolDefinitions;
}

/** Tool call request (Runner → Controller) */
export interface ToolCallRequest {
  type: "tool_call";
  /** Unique ID for matching response */
  callId: string;
  /** Full prefixed tool name (e.g., "mcp__slack__send_message") */
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
  logs?: string[];
  /** True if execution was terminated due to timeout */
  timedOut?: boolean;
}

/** Messages: Controller → Runner */
export type ControllerMessage = CodeExecutionRequest | ToolCallResponse;

/** Messages: Runner → Controller */
export type RunnerMessage = ToolCallRequest | CodeExecutionResult;

// ============================================================================
// Tool Definitions (flat array with prefixed names)
// ============================================================================

/** Flat array of tool definitions with prefixed names */
export type ToolDefinitions = ToolDefinition[];

// ============================================================================
// CodeExecutionController Interface
// ============================================================================

/**
 * Routes tool calls - receives prefixed toolName, resolves to appropriate handler.
 * @param toolName - Full prefixed tool name (e.g., "mcp__slack__send_message")
 * @param args - Tool arguments
 */
export type CallToolHandler = (
  toolName: string,
  args: unknown,
) => Promise<unknown>;

/**
 * Controller side of the protocol (main thread).
 * Manages execution session, provides tool call routing to MCP servers.
 */
export interface CodeExecutionController {
  /** Handler for tool calls from Runner */
  onCallTool: CallToolHandler;

  execute(
    code: string,
    language: string,
    toolDefinitions: ToolDefinitions,
  ): Promise<CodeExecutionResult>;
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
   * @param toolName - Full prefixed tool name (e.g., "mcp__slack__send_message")
   * @param args - Tool arguments
   */
  callTool(toolName: string, args: unknown): Promise<unknown>;

  /** Send final execution result to Controller */
  sendResult(result: Omit<CodeExecutionResult, "type">): void;
}
