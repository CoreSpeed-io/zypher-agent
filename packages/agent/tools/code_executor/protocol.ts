import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import z from "zod";

// ============================================================================
// Host -> Worker Messages
// ============================================================================

export const ExecuteMessageSchema = z.object({
  type: z.literal("execute"),
  code: z.string(),
  tools: z
    .array(z.string().describe("The name of the tool"))
    .describe("The available tools to use"),
});

export const ToolResultSchema = z.union([z.string(), CallToolResultSchema]);

export const ToolResponseMessageSchema = z.object({
  type: z.literal("tool_response"),
  toolUseId: z.string(),
  toolName: z.string(),
  result: ToolResultSchema,
});

export const ToolErrorMessageSchema = z.object({
  type: z.literal("tool_error"),
  toolUseId: z.string(),
  toolName: z.string(),
  error: z.unknown(),
});

export const HostToWorkerMessageSchema = z.discriminatedUnion("type", [
  ExecuteMessageSchema,
  ToolResponseMessageSchema,
  ToolErrorMessageSchema,
]);

// ============================================================================
// Worker -> Host Messages
// ============================================================================

export const ToolUseMessageSchema = z.object({
  type: z.literal("tool_use"),
  toolUseId: z.string(),
  toolName: z.string(),
  input: z.unknown(),
});

export const CodeExecutionResultSchema = z.object({
  type: z.literal("code_execution_result"),
  success: z.boolean(),
  data: z.unknown().optional(),
  error: z.unknown().optional(),
  logs: z.array(z.string()),
});

export const WorkerToHostMessageSchema = z.discriminatedUnion("type", [
  ToolUseMessageSchema,
  CodeExecutionResultSchema,
]);

// ============================================================================
// Type Exports
// ============================================================================

export type ExecuteMessage = z.infer<typeof ExecuteMessageSchema>;
export type ToolResponseMessage = z.infer<typeof ToolResponseMessageSchema>;
export type ToolErrorMessage = z.infer<typeof ToolErrorMessageSchema>;
export type HostToWorkerMessage = z.infer<typeof HostToWorkerMessageSchema>;

export type ToolUseMessage = z.infer<typeof ToolUseMessageSchema>;
export type CodeExecutionResult = z.infer<typeof CodeExecutionResultSchema>;
export type WorkerToHostMessage = z.infer<typeof WorkerToHostMessageSchema>;
