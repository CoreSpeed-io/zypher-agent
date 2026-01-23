import { AgentProvider, useAgentContext } from "@zypher/ui";
import { AgentChat, AgentInput } from "./components/agent";
import { Button } from "./components/ui/button";
import { PlusIcon } from "lucide-react";

const AGENT_URL = import.meta.env.VITE_AGENT_URL || "http://localhost:8080/user-agent";

function AppContent() {
  const { messages, streaming, running, clear } = useAgentContext();
  const empty = messages.length === 0 && streaming.length === 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header - sticky top */}
      <header className="sticky top-0 z-10 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 px-4 py-3 flex items-center justify-between">
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

      {/* Messages - natural flow, body scrolls */}
      <AgentChat />

      {/* Spacer - prevents content hidden behind input */}
      <div className="h-28" aria-hidden="true" />

      {/* Input - sticky bottom */}
      <AgentInput />
    </div>
  );
}

export default function App() {
  return (
    <AgentProvider config={{ url: AGENT_URL }}>
      <AppContent />
    </AgentProvider>
  );
}
