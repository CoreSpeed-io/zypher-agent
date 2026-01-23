import { useState, useCallback, useRef } from "react";
import useSWR from "swr";
import type { Observable } from "rxjs";
import { eachValueFrom } from "rxjs-for-await";
import type { AgentClient, AgentWebSocketConnection, StartTaskOptions } from "../client";
import type { Message, TaskEvent, ContentBlock, AgentInfo } from "../types";

export interface UseAgentOptions {
  client: AgentClient;
  messageKey?: string;
}

export interface UseAgentReturn {
  agentInfo: AgentInfo | undefined;
  messages: CompleteMessage[];
  streaming: StreamingMessage[];
  loading: boolean;
  running: boolean;
  pendingApproval: PendingApproval | null;
  send: (task: string, options?: StartTaskOptions) => void;
  resume: () => void;
  cancel: () => void;
  approve: (yes: boolean) => void;
  clear: () => Promise<void>;
}

export interface CompleteMessage {
  type: "complete";
  id: string;
  role: "user" | "assistant";
  content: ContentBlock[];
  timestamp: Date;
  checkpointId?: string;
}

export type StreamingMessage = StreamingText | StreamingToolUse;

export interface StreamingText {
  type: "streaming_text";
  id: string;
  text: string;
  timestamp: Date;
}

export interface StreamingToolUse {
  type: "streaming_tool_use";
  id: string;
  toolUseId: string;
  toolName: string;
  partialInput: string;
  timestamp: Date;
}

export interface PendingApproval {
  toolUseId: string;
  toolName: string;
  input: unknown;
}

const uid = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

const toComplete = (msg: Message): CompleteMessage => ({
  type: "complete",
  id: uid("msg"),
  role: msg.role,
  content: msg.content,
  timestamp: new Date(msg.timestamp),
  checkpointId: msg.checkpointId,
});

export function useAgent({ client, messageKey = "agent-messages" }: UseAgentOptions): UseAgentReturn {
  const [streaming, setStreaming] = useState<StreamingMessage[]>([]);
  const [running, setRunning] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);

  const connRef = useRef<AgentWebSocketConnection | null>(null);
  const lastEventIdRef = useRef<string | undefined>(undefined);

  const { data: agentInfo } = useSWR<AgentInfo>(
    "agent-info",
    async () => client.info(),
    { revalidateOnFocus: false, revalidateOnReconnect: false }
  );

  const { data: messages = [], isLoading: loading, mutate } = useSWR<CompleteMessage[]>(
    messageKey,
    async () => (await client.messages()).map(toComplete),
    { revalidateOnFocus: false, revalidateOnReconnect: false }
  );

  const onEventRef = useRef<((e: TaskEvent) => void) | undefined>(undefined);
  onEventRef.current = (e: TaskEvent) => {
    switch (e.type) {
      case "text":
        setStreaming((prev) => {
          const last = prev.at(-1);
          if (last?.type === "streaming_text") {
            return [...prev.slice(0, -1), { ...last, text: last.text + e.content }];
          }
          return [...prev, { type: "streaming_text", id: uid("txt"), text: e.content, timestamp: new Date() }];
        });
        break;

      case "tool_use":
        setStreaming((prev) => [...prev, { type: "streaming_tool_use", id: uid("tool"), toolUseId: e.toolUseId, toolName: e.toolName, partialInput: "", timestamp: new Date() }]);
        break;

      case "tool_use_input":
        setStreaming((prev) => {
          const i = prev.findIndex((m) => m.type === "streaming_tool_use" && m.toolUseId === e.toolUseId);
          if (i === -1) return prev;
          const m = prev[i] as StreamingToolUse;
          return [...prev.slice(0, i), { ...m, partialInput: m.partialInput + e.partialInput }, ...prev.slice(i + 1)];
        });
        break;

      case "tool_use_pending_approval":
        setPendingApproval({ toolUseId: e.toolUseId, toolName: e.toolName, input: e.input });
        break;

      case "tool_use_approved":
      case "tool_use_rejected":
        setPendingApproval(null);
        break;

      case "message":
        mutate((prev) => [...(prev ?? []), toComplete(e.message)], { revalidate: false });
        setStreaming([]);
        break;

      case "history_changed":
        mutate();
        break;

      case "completed":
      case "cancelled":
      case "error":
        if (e.type === "error") console.error("Task error:", e.error);
        setRunning(false);
        setStreaming([]);
        setPendingApproval(null);
        break;
    }
  };

  const consume = useCallback(async (events$: Observable<TaskEvent>) => {
    try {
      for await (const e of eachValueFrom(events$)) {
        if ("eventId" in e && e.eventId) lastEventIdRef.current = e.eventId;
        onEventRef.current?.(e);
      }
    } catch (err) {
      console.error("Event error:", err);
    } finally {
      setRunning(false);
      setStreaming([]);
      setPendingApproval(null);
    }
  }, []);

  const send = useCallback(
    async (task: string, opts?: StartTaskOptions) => {
      mutate((prev) => [...(prev ?? []), { type: "complete", id: uid("user"), role: "user", content: [{ type: "text", text: task }], timestamp: new Date() }], { revalidate: false });
      setStreaming([]);
      setRunning(true);
      setPendingApproval(null);

      try {
        const { connection, events$ } = await client.start(task, opts);
        connRef.current = connection;
        consume(events$);
      } catch (err) {
        console.error("Failed to start:", err);
        setRunning(false);
      }
    },
    [client, mutate, consume]
  );

  const resume = useCallback(async () => {
    setRunning(true);
    try {
      const { connection, events$ } = await client.resume(lastEventIdRef.current);
      connRef.current = connection;
      consume(events$);
    } catch (err) {
      console.error("Failed to resume:", err);
      setRunning(false);
    }
  }, [client, consume]);

  const cancel = useCallback(() => connRef.current?.cancel(), []);
  const approve = useCallback((yes: boolean) => connRef.current?.approve(yes), []);
  const clear = useCallback(async () => { await client.clear(); mutate([], { revalidate: false }); }, [client, mutate]);

  return { agentInfo, messages, streaming, loading, running, pendingApproval, send, resume, cancel, approve, clear };
}
