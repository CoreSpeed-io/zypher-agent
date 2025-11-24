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
import {
  DELEGATE_TASK_MERGE_MARKER,
  getAndClearPendingMerge,
} from "../agents/mod.ts";

export type ToolApprovalHandler = (
  name: string,
  args: Record<string, unknown>,
  options?: { signal?: AbortSignal },
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
      } else {
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

    const toolExecutionContext = {
      workingDirectory: context.workingDirectory,
    } satisfies ToolExecutionContext;

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

    // Check if any tool result contains the delegate_task merge marker
    const mightContainMerge = toolResults.some((r) =>
      r.name === "delegate_task" &&
      r.content.length === 1 &&
      r.content[0].type === "text" &&
      (r.content[0].text as string).startsWith(DELEGATE_TASK_MERGE_MARKER)
    );

    if (!mightContainMerge) {
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

    const processedResults: ToolResultBlock[] = [];

    for (let i = 0; i < toolResults.length; i++) {
      const result = toolResults[i];
      const toolBlock = toolBlocks[i];

      try {
        if (
          result.name === "delegate_task" &&
          result.content.length === 1 &&
          result.content[0].type === "text"
        ) {
          const resultText = result.content[0].text;
          if (resultText.startsWith(DELEGATE_TASK_MERGE_MARKER)) {
            const parts = resultText.split("|||");
            if (parts.length >= 3) {
              const tempId = parts[1];
              const actualResult = parts.slice(2).join("|||");

              let pendingMessages;
              try {
                pendingMessages = getAndClearPendingMerge(tempId);
              } catch (_error) {
                pendingMessages = undefined;
              }

              if (pendingMessages && pendingMessages.length > 0) {
                const subAgentTextContent = pendingMessages
                  .map((msg) => {
                    return msg.content
                      .filter((block) => block.type === "text")
                      .map((block) => (block as TextBlock).text)
                      .join("\n");
                  })
                  .filter((text) => text.length > 0)
                  .join("\n\n");

                const targetAgent = (toolBlock.input as Record<string, unknown>)
                  ?.targetAgent as string ?? "unknown";
                context.eventSubject.next({
                  type: "handoff_completed",
                  toolName: "delegate_task",
                  targetAgent,
                  messageCount: pendingMessages.length,
                });

                const enhancedResult = subAgentTextContent.length > 0
                  ? `${actualResult}\n\nSub-agent conversation:\n${subAgentTextContent}`
                  : actualResult;

                processedResults.push({
                  type: "tool_result" as const,
                  toolUseId: result.toolUseId,
                  name: result.name,
                  input: result.input,
                  success: true,
                  content: [
                    { type: "text", text: enhancedResult },
                  ],
                });
                continue;
              } else {
                processedResults.push({
                  ...result,
                  content: [{ type: "text", text: actualResult }],
                });
                continue;
              }
            }
          }
        }

        processedResults.push(result);
      } catch (error) {
        console.error("Error processing tool result:", error);
        try {
          if (
            result.name === "delegate_task" &&
            result.content[0]?.type === "text"
          ) {
            const text = result.content[0].text as string;
            if (text.includes(DELEGATE_TASK_MERGE_MARKER)) {
              const parts = text.split("|||");
              if (parts.length >= 2) {
                const tempId = parts[1];
                try {
                  getAndClearPendingMerge(tempId);
                } catch (_error) {
                  // Ignore
                }
              }
            }
          }
        } catch (_error) {
          // Ignore
        }

        processedResults.push({
          type: "tool_result" as const,
          toolUseId: result.toolUseId,
          name: result.name,
          input: result.input,
          success: false,
          content: [{
            type: "text",
            text: `Error processing tool result ${result.name}: ${
              formatError(error)
            }`,
          }],
        });
      }
    }

    context.messages.push({
      role: "user",
      content: processedResults,
      timestamp: new Date(),
    });

    return {
      decision: LoopDecision.CONTINUE,
      reasoning: `Executed ${toolBlocks.length} tool call(s)`,
    };
  }
}
