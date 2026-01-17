import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type * as z from "zod";
import type { ZypherContext } from "../zypher_agent.ts";

/**
 * Base interface for tool parameters
 */
export type BaseParams = Record<string, unknown>;

/**
 * Execution context provided to tools
 */
export type ToolExecutionContext = ZypherContext;

/**
 * The result of a tool execution
 */
export type ToolResult = CallToolResult | string;

/**
 * Base interface for all tools
 */
export interface Tool<T extends BaseParams = BaseParams> {
  readonly name: string;
  readonly description: string;
  readonly schema: z.ZodType<T>;
  readonly outputSchema?: z.ZodType;
  execute(
    input: T,
    ctx: ToolExecutionContext,
  ): Promise<ToolResult>;
}

/**
 * [JSON schema](https://json-schema.org/draft/2020-12) for this tool's input.
 *
 * This defines the shape of the `input` that your tool accepts and that the model
 * will produce.
 */
export interface InputSchema {
  type: "object";
  properties?: unknown | null;
  required?: Array<string> | null;
  [k: string]: unknown;
}

/**
 * Helper function to create a tool with a simpler API
 */
export function createTool<T extends BaseParams>(options: {
  name: string;
  description: string;
  schema: z.ZodType<T>;
  outputSchema?: z.ZodType;
  execute: (
    params: T,
    ctx: ToolExecutionContext,
  ) => Promise<ToolResult>;
}): Tool<T> {
  return {
    name: options.name,
    description: options.description,
    schema: options.schema,
    outputSchema: options.outputSchema,
    execute: async (input: T, ctx: ToolExecutionContext) => {
      // Validate input using Zod schema
      const validatedInput = await options.schema.parseAsync(input);
      return options.execute(validatedInput, ctx);
    },
  };
}

// Code executor tool
export * from "./code_executor/mod.ts";

// Filesystem tools
export * from "./fs/mod.ts";

// Other tools
export { createImageTools } from "./image_tools.ts";
export { RunTerminalCmdTool } from "./run_terminal_cmd_tool.ts";
