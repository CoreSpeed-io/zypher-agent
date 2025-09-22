import type {
  ContentBlock,
  ImageBlock,
  Message,
  TextBlock,
} from "../message.ts";
import type { McpServerManager } from "../mcp/McpServerManager.ts";
import {
  type InterceptorContext,
  type InterceptorResult,
  LoopDecision,
  type LoopInterceptor,
} from "./interface.ts";
import type { ToolExecutionContext } from "../tools/mod.ts";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export type ToolApprovalHandler = (
  name: string,
  args: Record<string, unknown>,
  options: { signal?: AbortSignal },
) => Promise<boolean>;

/**
 * Interceptor that handles tool execution when the LLM requests tool calls
 */
export class ToolExecutionInterceptor implements LoopInterceptor {
  readonly name = "tool-execution";
  readonly description = "Executes tool calls requested by the LLM";

  readonly #mcpServerManager: McpServerManager;
  readonly #handleToolApproval?: ToolApprovalHandler;

  constructor(
    mcpServerManager: McpServerManager,
    handleToolApproval?: ToolApprovalHandler,
  ) {
    this.#mcpServerManager = mcpServerManager;
    this.#handleToolApproval = handleToolApproval;
  }

  /**
   * Execute a tool call with approval handling
   */
  async #executeToolCall(
    name: string,
    parameters: Record<string, unknown>,
    ctx: ToolExecutionContext,
    options?: {
      signal?: AbortSignal;
    },
  ): Promise<CallToolResult> {
    const tool = this.#mcpServerManager.getTool(name);
    if (!tool) {
      throw new Error(`Tool '${name}' not found`);
    }

    const approved = this.#handleToolApproval
      ? await this.#handleToolApproval(name, parameters, options || {})
      : true;
    console.log(`Tool call ${name} approved: ${approved}`);
    if (!approved) {
      throw new Error(`Tool call ${name} rejected by user`);
    }

    const result = await tool.execute(parameters, ctx);
    if (typeof result === "string") {
      return {
        content: [
          { type: "text", text: result },
        ],
      };
    } else {
      return result;
    }
  }

  async intercept(context: InterceptorContext): Promise<InterceptorResult> {
    // Check if there are any tool calls in the latest assistant message
    const lastMessage = context.messages[context.messages.length - 1];
    if (!lastMessage || lastMessage.role !== "assistant") {
      return { decision: LoopDecision.COMPLETE };
    }

    const toolBlocks = lastMessage.content.filter((block) =>
      block.type === "tool_use"
    );
    if (toolBlocks.length === 0) {
      return { decision: LoopDecision.COMPLETE };
    }

    // Execute all tool calls
    for (const block of toolBlocks) {
      if (block.type === "tool_use") {
        const params = (block.input ?? {}) as Record<string, unknown>;

        const result = await this.#executeToolCall(
          block.name,
          params,
          {
            workingDirectory: context.workingDirectory,
          } satisfies ToolExecutionContext,
          {
            signal: context.signal,
          },
        );

        let toolResultContent: ContentBlock[];
        if (result.structuredContent) {
          toolResultContent = [
            {
              type: "tool_result" as const,
              toolUseId: block.id,
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result.structuredContent),
                },
              ],
            },
          ];
        } else {
          toolResultContent = [
            {
              type: "tool_result" as const,
              toolUseId: block.id,
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
            },
          ];
        }
        context.messages.push(
          {
            role: "user",
            content: toolResultContent,
            timestamp: new Date(),
          } satisfies Message,
        );
      }
    }

    return {
      decision: LoopDecision.CONTINUE,
      reasoning: `Executed ${toolBlocks.length} tool call(s)`,
    };
  }
}
