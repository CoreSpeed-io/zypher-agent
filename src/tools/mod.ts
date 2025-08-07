import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { Tool as AnthropicTool } from "@anthropic-ai/sdk/resources/messages";

/**
 * Base interface for tool parameters
 */
export type BaseParams = Record<string, unknown>;

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
  readonly parameters: AnthropicTool.InputSchema;

  /**
   * Execute the tool with the given parameters
   */
  execute(params: P): Promise<string>;
}

type InferParams<T extends z.ZodType> = z.infer<T>;

export function createTool<T extends z.ZodObject<z.ZodRawShape>>(
  name: string,
  description: string,
  schema: T,
  execute: (params: InferParams<T>) => Promise<string>,
): Tool<InferParams<T>> {
  // Convert Zod schema to JSON Schema
  const jsonSchema = zodToJsonSchema(schema, { target: "jsonSchema7" });

  return {
    name,
    description,
    parameters: jsonSchema as AnthropicTool.InputSchema,
    execute: async (params: InferParams<T>) => {
      // Validate params using Zod schema
      const validatedParams = await schema.parseAsync(params);
      return execute(validatedParams);
    },
  };
}

// Helper function to create a tool with a simpler API
export function defineTool<T extends z.ZodObject<z.ZodRawShape>>(options: {
  name: string;
  description: string;
  parameters: T;
  execute: (params: InferParams<T>) => Promise<string>;
}): Tool<InferParams<T>> {
  return createTool(
    options.name,
    options.description,
    options.parameters,
    options.execute,
  );
}

// Tool exports
export { ReadFileTool } from "./ReadFileTool.ts";
export { ListDirTool } from "./ListDirTool.ts";
export { EditFileTool } from "./EditFileTool.ts";
export { RunTerminalCmdTool } from "./RunTerminalCmdTool.ts";
export { GrepSearchTool } from "./GrepSearchTool.ts";
export { FileSearchTool } from "./FileSearchTool.ts";
export { CopyFileTool, DeleteFileTool } from "./FileTools.ts";
export { ImageEditTool, ImageGenTool } from "./ImageTools.ts";
export { YouTubeVideoAccessTool } from "./YoutubeVideoAccessTool.ts"
export { WebSearchTool } from "./WebSearchTool.ts"
export { WebsiteAccessTool } from "./WebsiteAccessTool.ts"
export { AudioToTextTool } from "./AudioToTextTool.ts"
export { AskImageQuestionTool } from "./AskImageQuestionTool.ts"
export { AskFileUrlQuestionTool } from "./AskFileUrlQuestionTool.ts"
// export { AccessWebsiteInBrowserTool, ClickWebsiteElementInBrowserTool, FillInputElementInBrowserTool } from "./BrowserUseTools.ts"
export { WebsiteInfoSearchTool } from "./BrowserUseTool/WebsiteInfoSearchTool.ts"
export { WebsiteSurfTool } from "./BrowserUseTool/WebsiteSurfTool.ts"
export { SearchWikipediaTool } from "./SearchWikipediaTool.ts";
export { VideoAudioExtractTool } from "./VideoAudioExtractTool.ts";
export { VideoDownloadTool } from "./VideoDownloadTool.ts";
export { VideoFrameAtTimeTool } from "./VideoFrameAtTimeTool.ts";
export { VideoToGifClipTool } from "./VideoToGifClipTool.ts";
export { VideoInferenceTool } from "./VideoInferenceTool.ts";
