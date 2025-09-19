import type { Message } from "../message.ts";
import { formatError } from "../error.ts";
import type { McpServerManager } from "../mcp/McpServerManager.ts";
import {
  type InterceptorContext,
  type InterceptorResult,
  LoopDecision,
  type LoopInterceptor,
} from "./interface.ts";
import type { ToolExecutionContext } from "../tools/mod.ts";

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
  ): Promise<string> {
    const tool = this.#mcpServerManager.getTool(name);
    if (!tool) {
      return `Error: Tool '${name}' not found`;
    }

    const approved = this.#handleToolApproval
      ? await this.#handleToolApproval(name, parameters, options || {})
      : true;
    console.log(`Tool call ${name} approved: ${approved}`);
    if (!approved) {
      return `Tool call ${name} rejected by user`;
    }

    try {
      return await tool.execute(parameters, ctx);
    } catch (error) {
      return `Error executing tool '${name}': ${formatError(error)}`;
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

        // Add tool response to messages
        const toolMessage: Message = {
          role: "user",
          content: [
            {
              type: "tool_result" as const,
              tool_use_id: block.id,
              content: result,
            },
          ],
          timestamp: new Date(),
        };

        context.messages.push(toolMessage);
      }
    }

    return {
      decision: LoopDecision.CONTINUE,
      reasoning: `Executed ${toolBlocks.length} tool call(s)`,
    };
  }
}
