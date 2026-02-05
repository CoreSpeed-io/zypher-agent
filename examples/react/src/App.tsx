import {
  AgentProvider,
  type CompleteMessage,
  type CustomContentBlock,
  type StreamingMessage,
  TaskApiClient,
  useAgentContext,
} from "@zypher/ui";
import type { ContentBlock } from "@zypher/agent";
import { Button } from "@/components/ui/button.tsx";
import { Loader } from "@/components/ai-elements/loader.tsx";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation.tsx";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message.tsx";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input.tsx";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool.tsx";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning.tsx";
import { Trash2Icon } from "lucide-react";

const client = new TaskApiClient({
  baseUrl: import.meta.env.VITE_API_URL ?? "http://localhost:8080",
});

function App() {
  return (
    <AgentProvider client={client}>
      <ChatUI />
    </AgentProvider>
  );
}

function ChatUI() {
  const {
    messages,
    streamingMessages,
    isTaskRunning,
    isLoadingMessages,
    isClearingMessages,
    runTask,
    clearMessageHistory,
    cancelCurrentTask,
  } = useAgentContext();

  const handleSubmit = ({ text }: { text: string }) => {
    runTask(text);
  };

  return (
    <div className="flex flex-col h-screen">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <h1 className="font-semibold text-lg">Zypher Agent</h1>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => clearMessageHistory()}
          disabled={isClearingMessages || isTaskRunning}
        >
          <Trash2Icon className="size-4" />
        </Button>
      </header>

      <Conversation>
        <ConversationContent>
          {isLoadingMessages && (
            <div className="flex items-center justify-center py-8">
              <Loader size={24} />
            </div>
          )}

          {messages.map((msg) => <MessageBlock key={msg.id} message={msg} />)}

          {streamingMessages.length > 0 && (
            <Message from="assistant">
              <MessageContent>
                {streamingMessages.map((sm) => (
                  <StreamingBlock key={sm.id} message={sm} />
                ))}
              </MessageContent>
            </Message>
          )}

          {isTaskRunning && streamingMessages.length === 0 &&
            !isLoadingMessages && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader size={16} />
              <span>Thinking...</span>
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="border-t p-4">
        <PromptInput onSubmit={handleSubmit}>
          <PromptInputTextarea disabled={isTaskRunning} />
          <PromptInputFooter>
            <div />
            <PromptInputSubmit
              status={isTaskRunning ? "streaming" : "ready"}
              onStop={cancelCurrentTask}
            />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Message rendering
// ---------------------------------------------------------------------------

function MessageBlock({ message }: { message: CompleteMessage }) {
  // Hide user messages that only contain tool results (system-generated)
  if (message.role === "user") {
    const hasText = message.content.some((b) => b.type === "text");
    if (!hasText) return null;
  }

  return (
    <Message from={message.role}>
      <MessageContent>
        {message.content.map((block, i) => (
          <ContentBlockRenderer key={i} block={block} />
        ))}
      </MessageContent>
    </Message>
  );
}

/** Known ContentBlock types that we handle */
const KNOWN_BLOCK_TYPES = ["text", "tool_use", "tool_result", "thinking", "image"] as const;

function isContentBlock(block: ContentBlock | CustomContentBlock): block is ContentBlock {
  return KNOWN_BLOCK_TYPES.includes(block.type as typeof KNOWN_BLOCK_TYPES[number]);
}

function ContentBlockRenderer({ block }: { block: ContentBlock | CustomContentBlock }) {
  // Skip custom content blocks - this example only renders standard ContentBlock types
  if (!isContentBlock(block)) {
    return null;
  }

  switch (block.type) {
    case "text":
      return block.text
        ? <MessageResponse>{block.text}</MessageResponse>
        : null;

    case "tool_use":
      return (
        <Tool>
          <ToolHeader title={block.name} state="input-available" />
          <ToolContent>
            <ToolInput input={block.input} />
          </ToolContent>
        </Tool>
      );

    case "tool_result": {
      const outputText = block.content
        .filter((c): c is Extract<typeof c, { type: "text" }> =>
          c.type === "text"
        )
        .map((c) => c.text)
        .join("\n");
      return (
        <Tool>
          <ToolHeader
            title={block.name}
            state={block.success ? "output-available" : "output-error"}
          />
          <ToolContent>
            <ToolInput input={block.input} />
            <ToolOutput
              output={block.success ? outputText : undefined}
              errorText={!block.success ? outputText : undefined}
            />
          </ToolContent>
        </Tool>
      );
    }

    case "thinking":
      return (
        <Reasoning>
          <ReasoningTrigger />
          <ReasoningContent>{block.thinking}</ReasoningContent>
        </Reasoning>
      );

    case "image": {
      const src = block.source.type === "url"
        ? block.source.url
        : `data:${block.source.mediaType};base64,${block.source.data}`;
      return <img src={src} alt="" className="max-w-full rounded-md" />;
    }

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Streaming message rendering
// ---------------------------------------------------------------------------

function StreamingBlock({ message }: { message: StreamingMessage }) {
  if (message.type === "streaming_text") {
    return <MessageResponse>{message.text}</MessageResponse>;
  }

  if (message.type === "streaming_tool_use") {
    let input: unknown;
    try {
      input = JSON.parse(message.partialInput);
    } catch {
      input = message.partialInput;
    }
    return (
      <Tool>
        <ToolHeader title={message.toolUseName} state="input-streaming" />
        <ToolContent>
          <ToolInput input={input} />
        </ToolContent>
      </Tool>
    );
  }

  return null;
}

export default App;
