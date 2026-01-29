import { hexoid } from "hexoid";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { TaskApiClient, TaskConnection } from "./task_api_client.ts";
import type { ContentBlock } from "@zypher/agent";
import type { HttpTaskEvent as TaskEvent } from "@zypher/http";
import type { Observable } from "rxjs";
import { eachValueFrom } from "rxjs-for-await";
import useSWR, { type Key } from "swr";

export interface CompleteMessage {
  type: "complete";
  id: string;
  role: "user" | "assistant";
  content: ContentBlock[];
  timestamp: Date;
  checkpointId?: string;
}

export type StreamingMessage = StreamingTextMessage | StreamingToolUseMessage;

export interface StreamingTextMessage {
  type: "streaming_text";
  id: string;
  text: string;
  timestamp: Date;
}

export interface StreamingToolUseMessage {
  type: "streaming_tool_use";
  id: string;
  toolUseName: string;
  partialInput: string;
  timestamp: Date;
}

const generateId = hexoid();

function generateMessageId(
  prefix: "message" | "delta" | "optimistic" | "greeting",
): string {
  return `${prefix}-${generateId()}`;
}

export function getFormattedToolName(toolName: string): string {
  if (toolName.startsWith("mcp_")) {
    return toolName.replace("mcp_", "");
  }
  return toolName;
}

export interface UseAgentOptions {
  messageQueryKey: Key;
  client: TaskApiClient;
  agentId?: string;
}

export interface UseAgentReturn {
  messages: CompleteMessage[];
  streamingMessages: StreamingMessage[];
  isLoadingMessages: boolean;
  isTaskRunning: boolean;
  isClearingMessages: boolean;
  runTask: (input: string, model?: string) => void;
  clearMessageHistory: () => void;
  cancelCurrentTask: () => void;
}

export function useAgent(options: UseAgentOptions): UseAgentReturn {
  const { client, agentId } = options;
  // We use the bound mutate from useSWR for simpler access, but we can also use global mutate if needed.
  // actually, we need global mutate if we want to mutate other keys, but here we only mutate messageQueryKey.

  const [streamingMessages, setStreamingMessages] = useState<
    StreamingMessage[]
  >([]);
  const [isTaskRunning, setIsTaskRunning] = useState(false);

  const agentSocketRef = useRef<TaskConnection | null>(null);
  const hasAttemptedResumeRef = useRef(false);

  // Helper function to create a greeting message
  const createGreetingMessage = (): CompleteMessage => {
    return {
      type: "complete",
      id: generateMessageId("greeting"),
      role: "assistant",
      content: [
        {
          type: "text",
          text: "Hello! How can I help you today?",
        },
      ],
      timestamp: new Date(),
    };
  };

  // === MESSAGE, TASK AND CHECKPOINT OPERATIONS ===

  const {
    data: messages = [],
    isLoading: isLoadingMessages,
    mutate: mutateMessages,
  } = useSWR(
    options.messageQueryKey,
    async () => {
      const messages = await client.getMessages();

      return [
        createGreetingMessage(),
        ...messages.map(
          (message) =>
            ({
              type: "complete",
              id: generateMessageId("message"),
              role: message.role,
              content: message.content,
              timestamp: new Date(message.timestamp),
              checkpointId: message.checkpointId,
            }) satisfies CompleteMessage,
        ),
      ];
    },
    {
      revalidateOnFocus: false,
      revalidateIfStale: false,
      dedupingInterval: 60000, // Keep cache for a while
    },
  );

  const handleTaskEvents = useCallback(
    async (events$: Observable<TaskEvent>) => {
      try {
        for await (const e of eachValueFrom(events$)) {
          switch (e.type) {
            case "text": {
              // ... same logic for streaming messages ...
              // Handle streaming text content - append to streaming message
              setStreamingMessages((prev: StreamingMessage[]) => {
                // Check if the last message is a streaming text message
                const lastMessage = prev.length > 0
                  ? prev[prev.length - 1]
                  : null;

                if (lastMessage?.type === "streaming_text") {
                  // Append to existing streaming text message
                  const updated = [...prev];
                  updated[prev.length - 1] = {
                    ...lastMessage,
                    text: lastMessage.text + e.content,
                  };
                  return updated;
                } else {
                  // Create new streaming text message
                  return [
                    ...prev,
                    {
                      type: "streaming_text",
                      id: generateMessageId("delta"),
                      text: e.content,
                      timestamp: new Date(),
                    },
                  ];
                }
              });
              break;
            }

            case "tool_use": {
              // ... same logic ...
              setStreamingMessages((prev: StreamingMessage[]) => {
                return [
                  ...prev,
                  {
                    type: "streaming_tool_use",
                    id: generateMessageId("delta"),
                    toolUseName: e.toolName,
                    partialInput: "",
                    timestamp: new Date(),
                  },
                ];
              });
              break;
            }

            case "tool_use_input": {
              // ... same logic ...
              setStreamingMessages((prev: StreamingMessage[]) => {
                // Check if the last message is a streaming tool use message with matching tool name
                const lastMessage = prev.length > 0
                  ? prev[prev.length - 1]
                  : null;

                if (
                  lastMessage?.type === "streaming_tool_use" &&
                  lastMessage.toolUseName === e.toolName
                ) {
                  // Update existing streaming tool use message
                  const updated = [...prev];
                  const accumulatedInput = lastMessage.partialInput +
                    e.partialInput;

                  updated[prev.length - 1] = {
                    ...lastMessage,
                    partialInput: accumulatedInput,
                  };

                  return updated;
                } else {
                  // Create new streaming tool use message if it doesn't exist
                  return [
                    ...prev,
                    {
                      type: "streaming_tool_use",
                      id: generateMessageId("delta"),
                      toolUseName: e.toolName,
                      partialInput: e.partialInput,
                      timestamp: new Date(),
                    },
                  ];
                }
              });
              break;
            }

            case "message": {
              // Handle complete message - add to message history
              const completeMessage: CompleteMessage = {
                type: "complete",
                id: generateMessageId("message"),
                role: e.message.role,
                content: e.message.content,
                timestamp: new Date(e.message.timestamp),
                checkpointId: e.message.checkpointId,
              };

              // queryClient.setQueryData replacement
              // mutateMessages(newData, false)
              mutateMessages(
                (prev: CompleteMessage[] | undefined) => [
                  ...(prev ?? []),
                  completeMessage,
                ],
                false, // do not revalidate yet
              );

              // Clear streaming messages since we have a complete message
              setStreamingMessages([]);
              break;
            }

            case "history_changed": {
              // History was modified - refetch all messages
              await mutateMessages();
              break;
            }

            case "cancelled": {
              // Task was cancelled
              console.log("Task cancelled:", e.reason);
              break;
            }

            case "completed": {
              break;
            }
          }
        }
        // Normal completion - task finished successfully
        console.log("[useAgent] Task completed, agentId:", agentId);
      } catch (error) {
        // Handle WebSocket errors (including "task_not_running")
        console.error("Task error:", error);
      } finally {
        setIsTaskRunning(false);
        setStreamingMessages([]);
      }
    },
    [agentId, mutateMessages],
  );

  // Function to clear message history
  const [isClearingMessages, startClearingMessagesTransition] = useTransition();
  const clearMessageHistory = useCallback(() => {
    if (isTaskRunning) {
      return;
    }

    startClearingMessagesTransition(async () => {
      try {
        await client.clearMessages();
        // Invalidate/Revalidate
        await mutateMessages();
      } catch (error) {
        console.error("Failed to clear message history:", error);
      }
    });
  }, [isTaskRunning, client, mutateMessages]);

  // Function to cancel the current task
  const cancelCurrentTask = useCallback(() => {
    if (!isTaskRunning) return;

    try {
      if (agentSocketRef.current === null) {
        throw new Error("No agent socket found");
      }

      agentSocketRef.current.cancelTask();

      // Success handling
      // Socket should handle cleanup via events, but we can force state reset
      setIsTaskRunning(false);
    } catch (error) {
      console.error("Failed to cancel task:", error);
    }
  }, [isTaskRunning]);

  const runTask = useCallback(
    async (input: string) => {
      if (!input.trim()) return;

      // Create the user message object immediately after user input is sent
      const optimisticUserMessage: CompleteMessage = {
        type: "complete",
        id: generateMessageId("optimistic"),
        role: "user",
        content: [
          {
            type: "text",
            text: input,
          },
        ],
        timestamp: new Date(),
      };

      // Add user message to the chat immediately via optimistic update
      mutateMessages(
        (prev: CompleteMessage[] | undefined) => [
          ...(prev ?? []),
          optimisticUserMessage,
        ],
        false,
      );

      // Clear any streaming messages
      setStreamingMessages([]);
      // Set task running state
      setIsTaskRunning(true);

      try {
        const taskConnection = await client.startTask(input, {
          fileAttachments: [],
        });
        agentSocketRef.current = taskConnection;
        handleTaskEvents(taskConnection.events$);
      } catch (error) {
        console.error("Failed to start task:", error);
        setIsTaskRunning(false);
      }
    },
    [client, mutateMessages, handleTaskEvents],
  );

  // Resume a running task from agent (if exists)
  const resumeTask = useCallback(async () => {
    if (agentSocketRef.current !== null) {
      // Already have a connection
      return;
    }
    try {
      const taskConnection = await client.resumeTask();
      agentSocketRef.current = taskConnection;
      handleTaskEvents(taskConnection.events$);
    } catch (error) {
      console.error("Failed to resume task:", error);
      // If resume fails, we assume no task is running
      setIsTaskRunning(false);
    }
  }, [client, handleTaskEvents]);

  // Try to resume task ONLY ONCE if there is one after messages are loaded
  useEffect(() => {
    // Note: checking messages.length > 0 might be better than just messages truthy?
    // But since we initialize with [] fallback, we check if we have data loaded.
    // If isLoadingMessages is false and we have data.
    if (!isLoadingMessages && messages && !hasAttemptedResumeRef.current) {
      hasAttemptedResumeRef.current = true;
      resumeTask();
    }
  }, [messages, isLoadingMessages, resumeTask]);

  return {
    messages,
    streamingMessages,
    isLoadingMessages,
    isTaskRunning,
    isClearingMessages,
    runTask,
    clearMessageHistory,
    cancelCurrentTask,
  };
}
