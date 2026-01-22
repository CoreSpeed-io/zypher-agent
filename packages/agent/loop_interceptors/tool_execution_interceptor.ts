import type {
  ImageBlock,
  TextBlock,
  ToolResultBlock,
  ToolUseBlock,
} from "../message.ts";
import type { McpServerManager } from "../mcp/mcp_server_manager.ts";
import type {
  InterceptorContext,
  InterceptorResult,
  LoopInterceptor,
} from "./interface.ts";
import { formatError } from "@zypher/utils";

/**
 * Interceptor that handles tool execution when the LLM requests tool calls
 */
export class ToolExecutionInterceptor implements LoopInterceptor {
  readonly name = "tool-execution";

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
      return { complete: true };
    }

    const toolBlocks = lastMessage.content.filter((
      block,
    ): block is ToolUseBlock => block.type === "tool_use");
    if (toolBlocks.length === 0) {
      return { complete: true };
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

    // Manually inject tool results (no reason needed - manager won't auto-inject)
    context.messages.push({
      role: "user",
      content: toolResults,
      timestamp: new Date(),
    });

    return { complete: false };
  }
}

/**
 * Creates a tool execution interceptor that handles LLM tool calls.
 *
 * This is the main interceptor for executing tools requested by the LLM.
 * It extracts tool calls from the assistant's response, executes them via
 * the MCP server manager, and injects the results back into the conversation.
 *
 * @example
 * ```typescript
 * const agent = await createZypherAgent({
 *   model: "claude-sonnet-4-5-20250929",
 *   loopInterceptors: [
 *     executeTools(mcpManager),
 *     continueOnMaxTokens(),
 *   ],
 * });
 * ```
 *
 * @param mcpServerManager The MCP server manager for executing tools
 * @returns A LoopInterceptor that executes tool calls
 */
export function executeTools(
  mcpServerManager: McpServerManager,
): LoopInterceptor {
  return new ToolExecutionInterceptor(mcpServerManager);
}
