/**
 * Code Execution Module - Programmatic Tool Calling (PTC) implementation.
 *
 * Exports:
 * - Protocol types and interfaces
 * - DenoWebWorker implementation
 * - Utility functions
 */

// Protocol
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
} from "./ProgrammaticToolCallingProtocol.ts";

// DenoWebWorker Implementation
export {
  DenoWebWorkerController,
  type DenoWebWorkerControllerOptions,
} from "./implementation/denowebworker/controller.ts";

// Utilities
export {
  buildToolDefinitions,
  generateCodeExecutionToolsPrompt,
} from "./ToolDefinitionBuilder.ts";
