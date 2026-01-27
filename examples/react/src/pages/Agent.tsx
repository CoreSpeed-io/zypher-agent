import { AgentProvider, useAgentContext } from "@zypher/ui";
import { AgentChat, AgentInput } from "../components/agent";
import { Button } from "../components/ui/button";
import { PlusIcon } from "lucide-react";

const AGENT_URL = import.meta.env.VITE_AGENT_URL ||
  "http://localhost:8080/user-agent";

function AgentContent() {
  const { messages, streaming, running, clear } = useAgentContext();
  const empty = messages.length === 0 && streaming.length === 0;

  return (
    <div className="grid h-dvh grid-rows-[auto_1fr_auto] bg-background overflow-hidden">
      {/* Header */}
      <header className="border-b bg-background px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Agent Chat</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={() => clear()}
          disabled={running || empty}
        >
          <PlusIcon className="size-4" />
          New Session
        </Button>
      </header>

      {/* Messages - scrolls internally */}
      <AgentChat />

      {/* Input - fixed at bottom */}
      <AgentInput />
    </div>
  );
}

export default function Agent() {
  return (
    <AgentProvider config={{ url: AGENT_URL }}>
      <AgentContent />
    </AgentProvider>
  );
}
