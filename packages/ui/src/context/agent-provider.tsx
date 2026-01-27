import { createContext, useContext, useMemo, type ReactNode } from "react";
import { SWRConfig } from "swr";
import { AgentClient } from "../client";
import { useAgent, type UseAgentReturn } from "../hooks";

export interface AgentProviderProps {
  children: ReactNode;
  config: {
    url: string;
    getAccessToken?: () => Promise<string>;
  };
  messageKey?: string;
}

const AgentContext = createContext<UseAgentReturn | null>(null);

export function AgentProvider({ children, config, messageKey }: AgentProviderProps) {
  const client = useMemo(() => {
    const baseUrl = config.url
      .replace(/^ws(s)?:\/\//, (_, s) => `http${s ? "s" : ""}://`)
      .replace(/\/task\/ws$/, "");
    return new AgentClient({ baseUrl, getAccessToken: config.getAccessToken });
  }, [config.url, config.getAccessToken]);

  return (
    <SWRConfig value={{ revalidateOnFocus: false, revalidateOnReconnect: false }}>
      <AgentProviderInner client={client} messageKey={messageKey}>
        {children}
      </AgentProviderInner>
    </SWRConfig>
  );
}

function AgentProviderInner({ children, client, messageKey }: { children: ReactNode; client: AgentClient; messageKey?: string }) {
  const agent = useAgent({ client, messageKey });
  return <AgentContext.Provider value={agent}>{children}</AgentContext.Provider>;
}

export function useAgentContext(): UseAgentReturn {
  const context = useContext(AgentContext);
  if (!context) {
    throw new Error("useAgentContext must be used within AgentProvider");
  }
  return context;
}
