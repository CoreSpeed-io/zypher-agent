import type {
  ImageBlock,
  TextBlock,
  ToolResultBlock,
  ToolUseBlock,
} from "../message.ts";
import type { McpServerManager } from "../mcp/mcp_server_manager.ts";
import {
  type InterceptorContext,
  type InterceptorResult,
  LoopDecision,
  type LoopInterceptor,
} from "./interface.ts";
import { formatError, isAbortError } from "@zypher/utils";

/**
 * Interceptor that handles tool execution when the LLM requests tool calls
 */
export class ToolExecutionInterceptor implements LoopInterceptor {
  readonly name = "tool-execution";
  readonly description = "Executes tool calls requested by the LLM";

  readonly #mcpServerManager: McpServerManager;

  constructor(mcpServerManager: McpServerManager) {
    this.#mcpServerManager = mcpServerManager;
  }

  async #executeToolCall(
    name: string,
    toolUseId: string,
    input: unknown,
    options?: {
      signal?: AbortSignal;
    },
  ): Promise<ToolResultBlock> {
    try {
      const result = await this.#mcpServerManager.callTool(
        toolUseId,
        name,
        input,
        { signal: options?.signal },
      );

      if (typeof result === "string") {
        return {
          type: "tool_result" as const,
          toolUseId,
          name,
          input,
          success: true,
          content: [
            { type: "text", text: result },
          ],
        };
      } else if (result.structuredContent) {
        return {
          type: "tool_result" as const,
          toolUseId,
          name,
          input,
          success: !result.isError,
          content: [
            { type: "text", text: JSON.stringify(result.structuredContent) },
          ],
        };
      } else {
        return {
          type: "tool_result" as const,
          toolUseId,
          name,
          input,
          success: !result.isError,
          content: result.content.map((c): TextBlock | ImageBlock => {
            if (c.type === "text") {
              return {
                type: "text",
                text: c.text,
              };
            } else if (c.type === "image") {
              return {
                type: "image",
                source: {
                  data: c.data,
                  mediaType: c.mimeType,
                  type: "base64",
                },
              };
            } else {
              return {
                type: "text",
                text: JSON.stringify(c),
              };
            }
          }),
        };
      }
    } catch (error) {
      if (isAbortError(error)) {
        return {
          type: "tool_result" as const,
          toolUseId,
          name,
          input,
          success: false,
          content: [{
            type: "text",
            text: `Tool execution cancelled`,
          }],
        };
      }
      return {
        type: "tool_result" as const,
        toolUseId,
        name,
        input,
        success: false,
        content: [{
          type: "text",
          text: `Error executing tool ${name}: ${formatError(error)}`,
        }],
      };
    }
  }

  async intercept(context: InterceptorContext): Promise<InterceptorResult> {
    // Check if there are any tool calls in the latest assistant message
    const lastMessage = context.messages[context.messages.length - 1];
    if (!lastMessage || lastMessage.role !== "assistant") {
      return { decision: LoopDecision.COMPLETE };
    }

    const toolBlocks = lastMessage.content.filter((
      block,
    ): block is ToolUseBlock => block.type === "tool_use");
    if (toolBlocks.length === 0) {
      return { decision: LoopDecision.COMPLETE };
    }

    const toolResults = await Promise.all(
      toolBlocks.map(async (block) => {
        const input = block.input ?? {};
        return await this.#executeToolCall(
          block.name,
          block.toolUseId,
          input,
          {
            signal: context.signal,
          },
        );
      }),
    );

    context.messages.push({
      role: "user",
      content: toolResults,
      timestamp: new Date(),
    });

    return {
      decision: LoopDecision.CONTINUE,
      reasoning: `Executed ${toolBlocks.length} tool call(s)`,
    };
  }
}
