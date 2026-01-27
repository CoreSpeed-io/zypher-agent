import { AgentProvider, TaskApiClient, useAgentContext } from "@zypher/ui";

const client = new TaskApiClient({
  baseUrl: "http://localhost:3000",
});

function App() {
  return (
    <AgentProvider client={client} messageQueryKey="messages">
      <ChatUI />
    </AgentProvider>
  );
}

function ChatUI() {
  const { messages, isTaskRunning, runTask } = useAgentContext();

  return (
    <>
      <h1>Messages Length: {messages.length}</h1>
      <h1>Is Task Running: {isTaskRunning ? "Yes" : "No"}</h1>
      <button onClick={() => runTask("Hello, how are you?")}>Run Task</button>
    </>
  );
}

export default App;
