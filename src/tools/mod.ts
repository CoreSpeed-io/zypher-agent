import * as z from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ZypherContext } from "../ZypherAgent.ts";

/** Caller type - who invoked the tool call */
export type CallerType = "direct" | "programmatic";

export type Caller = {
  type: CallerType;
};

export const DEFAULT_ALLOWED_CALLERS: CallerType[] = ["direct"];

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
export type ToolResult = CallToolResult | string | {
  [x: string]: unknown;
};

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
  readonly parameters: InputSchema;

  readonly allowedCallers?: CallerType[];

  readonly programmaticTools?: Tool[];

  /**
   * Execute the tool with the given parameters
   */
  execute(params: P, ctx: ToolExecutionContext): Promise<ToolResult>;
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

type InferParams<T extends z.ZodType> = z.infer<T>;

/**
 * Helper function to create a tool with a simpler API
 */
export function createTool<T extends z.ZodObject<z.ZodRawShape>>(options: {
  name: string;
  description: string;
  schema: T;
  allowedCallers?: CallerType[];
  execute: (
    params: InferParams<T>,
    ctx: ToolExecutionContext,
  ) => Promise<ToolResult>;
}): Tool<InferParams<T>> {
  // Convert Zod schema to JSON Schema
  const jsonSchema = z.toJSONSchema(options.schema);

  return {
    name: options.name,
    description: options.description,
    parameters: jsonSchema as InputSchema,
    allowedCallers: options.allowedCallers ?? (["direct"] as CallerType[]),
    execute: async (params: InferParams<T>, ctx: ToolExecutionContext) => {
      // Validate params using Zod schema
      const validatedParams = await options.schema.parseAsync(params);
      return options.execute(validatedParams, ctx);
    },
  };
}

// Filesystem tools
export * from "./fs/mod.ts";

// Other tools
export { RunTerminalCmdTool } from "./RunTerminalCmdTool.ts";
export { createImageTools } from "./ImageTools.ts";
export {
  programmatic,
  type ProgrammaticOptions,
} from "./codeExecution/mod.ts";
