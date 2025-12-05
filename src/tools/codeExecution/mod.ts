/**
 * Code Execution Module - Programmatic Tool Calling (PTC) implementation.
 *
 * Exports:
 * - Protocol types and interfaces
 * - DenoWebWorker implementation
 * - Utility functions
 * - Programmatic function for wrapping tools
 */

// Re-export from programmatic module
export type {
  CallToolHandler,
  CodeExecutionController,
  CodeExecutionRequest,
  CodeExecutionResult,
  CodeExecutionRunner,
  ControllerMessage,
  RunnerMessage,
  ToolCallRequest,
  ToolCallResponse,
  ToolDefinition,
  ToolDefinitions,
} from "./programmatic/mod.ts";

export {
  generateCodeExecutionToolsPrompt,
  type OnBeforeToolCallCallback,
  programmatic,
  type ProgrammaticOptions,
} from "./programmatic/mod.ts";

// DenoWebWorker Implementation
export {
  DenoWebWorkerController,
  type DenoWebWorkerControllerOptions,
} from "./implementation/denowebworker/controller.ts";
