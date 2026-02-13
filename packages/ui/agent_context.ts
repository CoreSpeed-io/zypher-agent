import { createContext, createElement, type ReactNode, use } from "react";
import type { TaskApiClient } from "./task_api_client.ts";
import { useAgent, type UseAgentReturn } from "./use_agent.ts";

// Create the context with a default undefined value
const AgentContext = createContext<UseAgentReturn | undefined>(undefined);

export interface AgentProviderOptions {
  children: ReactNode;
  client: TaskApiClient;
}

/** Provider component that wraps parts of the app that need agent state. */
export function AgentProvider({
  children,
  client,
}: AgentProviderOptions): ReactNode {
  const agentState = useAgent({ client });

  return createElement(AgentContext, { value: agentState }, children);
}

/** Hook to access agent state from within an AgentProvider. */
export function useAgentContext(): UseAgentReturn {
  const context = use(AgentContext);

  if (context === undefined) {
    throw new Error("useAgentContext must be used within a AgentProvider");
  }

  return context;
}
