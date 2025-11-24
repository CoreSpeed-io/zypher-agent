import { z } from "zod";
import { createTool } from "../tools/mod.ts";
import type { Tool } from "../tools/mod.ts";
import type { ZypherAgent } from "../ZypherAgent.ts";
import { eachValueFrom } from "rxjs-for-await";
import type { Subject } from "rxjs";
import type { TaskEvent, TaskHandoffFailedEvent } from "../TaskEvents.ts";
import type { Message } from "../message.ts";

// Defines delegate_task tool parameters
const DelegateTaskParamsSchema = z.object({
  task: z.string().describe(
    "The task description to delegate to the sub-agent",
  ),
  targetAgent: z.string().describe(
    "The name of the sub-agent to delegate the task to",
  ),
});

type DelegateTaskParams = z.infer<typeof DelegateTaskParamsSchema>;

// Pending message merges from delegate_task tool
const pendingMessageMerges = new Map<string, Message[]>();

/**
 * Context for delegate_task tool
 */
export interface DelegateTaskContext {
  /** Function to get current messages from the supervisor agent */
  getMessages: () => Message[];
  /** Function to add messages to the supervisor agent's history */
  addMessages?: (messages: Message[]) => void;
  /** The supervisor agent instance */
  supervisorAgent: ZypherAgent;
  /** Map of agent names to agent instances */
  subAgents: Map<string, ZypherAgent>;
  /** The model to use for sub-agents */
  model: string;
  /** Current handoff depth, for nested handoffs */
  currentDepth?: number;
  /** Handoff chain for cycle detection */
  handoffChain?: string[];
  /** Function to get event subject for emitting handoff events */
  getEventSubject?: () => Subject<TaskEvent> | undefined;
  /** Optional maximum handoff depth */
  maxDepth?: number;
}

/**
 * Get and remove pending messages for a tool
 */
export function getAndClearPendingMerge(
  toolUseId: string,
): Message[] | undefined {
  const messages = pendingMessageMerges.get(toolUseId);
  if (messages) {
    pendingMessageMerges.delete(toolUseId);
  }
  return messages;
}

/**
 * Creates a delegate_task tool that allows a supervisor agent to delegate tasks to sub-agents.
 *
 * @param context Context for delegate_task tool
 * @returns A Tool instance for delegate_task
 */
export function createDelegateTaskTool(
  context: DelegateTaskContext,
): Tool<DelegateTaskParams> {
  return createTool({
    name: "delegate_task",
    description:
      "Delegate a task to a specialized sub-agent. Use this tool when you need to hand off work to a team member with specific expertise.",
    schema: DelegateTaskParamsSchema,
    execute: async (
      params: DelegateTaskParams,
    ): Promise<string> => {
      try {
        const { task, targetAgent } = params;

        const subAgent = context.subAgents.get(targetAgent);
        if (!subAgent) {
          const availableAgents = Array.from(context.subAgents.keys()).join(
            ", ",
          );
          return `Error: Sub-agent "${targetAgent}" not found. Available sub-agents: ${
            availableAgents || "none"
          }`;
        }

        const currentDepth = context.currentDepth ?? 0;
        const maxDepth = context.maxDepth ?? 3; // Default max depth
        if (maxDepth > 0 && currentDepth >= maxDepth) {
          return `Maximum handoff depth (${maxDepth}) reached. Cannot delegate to another agent.`;
        }

        const handoffChain = context.handoffChain ?? [];
        const targetAgentId = targetAgent;
        if (handoffChain.includes(targetAgentId)) {
          return "Circular handoff detected. Cannot delegate to an agent in the handoff chain.";
        }

        const eventSubject = context.getEventSubject?.();
        const taskEvents = subAgent.runTask(task, context.model);

        // Collect messages from the sub-agent
        const subAgentMessages: Message[] = [];
        let lastError: Error | undefined;

        try {
          for await (const event of eachValueFrom(taskEvents)) {
            if (event.type === "message") {
              subAgentMessages.push(event.message as Message);
            }
          }
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
        }

        if (lastError) {
          if (eventSubject) {
            const failedEvent: TaskHandoffFailedEvent = {
              type: "handoff_failed",
              toolName: "delegate_task",
              targetAgent: targetAgent,
              error: lastError.message,
            };
            eventSubject.next(failedEvent);
          }
          return `Delegation failed: ${lastError.message}`;
        }

        if (subAgentMessages.length === 0) {
          if (eventSubject) {
            const failedEvent: TaskHandoffFailedEvent = {
              type: "handoff_failed",
              toolName: "delegate_task",
              targetAgent: targetAgent,
              error: "No messages returned from sub-agent",
            };
            eventSubject.next(failedEvent);
          }
          return "Delegation completed but no messages were returned.";
        }

        const newHistory = subAgentMessages;

        const resultText = subAgentMessages
          .map((msg) => {
            return msg.content
              .filter((block) => block.type === "text")
              .map((block) => block.text)
              .join("\n");
          })
          .filter((text) => text.length > 0)
          .join("\n\n");

        const tempId = `temp_${Date.now()}_${Math.random()}`;
        pendingMessageMerges.set(tempId, newHistory);

        const actualResult =
          `Delegation to ${params.targetAgent} completed. The sub-agent generated ${newHistory.length} messages which will be merged into your memory. Final Result: ${resultText}`;
        // Mark the actual result with `__DELEGATE_TASK_MERGE__|||`
        return `__DELEGATE_TASK_MERGE__|||${tempId}|||${actualResult}`;
      } catch (error) {
        const errorMessage = error instanceof Error
          ? error.message
          : String(error);

        const eventSubject = context.getEventSubject?.();
        if (eventSubject) {
          const failedEvent: TaskHandoffFailedEvent = {
            type: "handoff_failed",
            toolName: "delegate_task",
            targetAgent: params.targetAgent,
            error: errorMessage,
          };
          eventSubject.next(failedEvent);
        }

        return `Delegation error: ${errorMessage}`;
      }
    },
  });
}
