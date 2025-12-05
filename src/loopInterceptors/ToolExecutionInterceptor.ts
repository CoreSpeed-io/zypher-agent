import type {
  ImageBlock,
  TextBlock,
  ToolResultBlock,
  ToolUseBlock,
} from "../message.ts";
import type { McpServerManager } from "../mcp/McpServerManager.ts";
import {
  type InterceptorContext,
  type InterceptorResult,
  LoopDecision,
  type LoopInterceptor,
} from "./interface.ts";
import type { ToolExecutionContext } from "../tools/mod.ts";
import { formatError } from "../error.ts";
import type { Subject } from "rxjs";
import type { TaskEvent } from "../TaskEvents.ts";

export type ToolApprovalHandler = (
  name: string,
  args: Record<string, unknown>,
  options?: { signal?: AbortSignal },
) => Promise<boolean>;

/**
 * Callback invoked before a tool is executed.
 */
export type OnBeforeToolCallHandler = (
  toolName: string,
  args: unknown,
) => void | Promise<void>;

/**
 * Interceptor that handles tool execution when the LLM requests tool calls
 */
export class ToolExecutionInterceptor implements LoopInterceptor {
  readonly name = "tool-execution";
  readonly description = "Executes tool calls requested by the LLM";

  readonly #mcpServerManager: McpServerManager;
  readonly #handleToolApproval?: ToolApprovalHandler;
  readonly #onBeforeToolCall?: OnBeforeToolCallHandler;

  constructor(
    mcpServerManager: McpServerManager,
    handleToolApproval?: ToolApprovalHandler,
    onBeforeToolCall?: OnBeforeToolCallHandler,
  ) {
    this.#mcpServerManager = mcpServerManager;
    this.#handleToolApproval = handleToolApproval;
    this.#onBeforeToolCall = onBeforeToolCall;
  }

  /**
   * Execute a tool call with approval handling
   */
  async #executeToolCall(
    name: string,
    toolUseId: string,
    parameters: Record<string, unknown>,
    ctx: ToolExecutionContext,
    eventSubject: Subject<TaskEvent>,
    options?: {
      signal?: AbortSignal;
    },
  ): Promise<ToolResultBlock> {
    try {
      const tool = this.#mcpServerManager.getTool(name);
      if (!tool) {
        throw new Error(`Tool '${name}' not found`);
      }

      if (this.#handleToolApproval) {
        eventSubject.next({
          type: "tool_use_pending_approval",
          toolName: name,
          parameters,
        });
        const approved = await this.#handleToolApproval(
          name,
          parameters,
          options,
        );

        if (!approved) {
          throw new Error(`Tool call ${name} rejected by user`);
        }
      }

      // auto approve if no approval handler is provided
      eventSubject.next({
        type: "tool_use_approved",
        toolName: name,
      });

      // Call onBeforeToolCall hook if provided
      if (this.#onBeforeToolCall) {
        await this.#onBeforeToolCall(name, parameters);
      }

      const result = await tool.execute(parameters, ctx);

      if (typeof result === "string") {
        return {
          type: "tool_result" as const,
          toolUseId,
          name,
          input: parameters,
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
          input: parameters,
          success: !result.isError,
          content: [
            { type: "text", text: JSON.stringify(result.structuredContent) },
          ],
        };
      } else if (result.content && Array.isArray(result.content)) {
        return {
          type: "tool_result" as const,
          toolUseId,
          name,
          input: parameters,
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
      } else {
        // Plain object case - stringify it
        return {
          type: "tool_result" as const,
          toolUseId,
          name,
          input: parameters,
          success: true,
          content: [
            { type: "text", text: JSON.stringify(result) },
          ],
        };
      }
    } catch (error) {
      console.error(`Error executing tool ${name}:`, error);
      return {
        type: "tool_result" as const,
        toolUseId,
        name,
        input: parameters,
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

    const toolExecutionContext: ToolExecutionContext = context.zypherContext;

    const toolResults = await Promise.all(
      toolBlocks.map(async (block) => {
        const params = (block.input ?? {}) as Record<string, unknown>;
        return await this.#executeToolCall(
          block.name,
          block.toolUseId,
          params,
          toolExecutionContext,
          context.eventSubject,
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
