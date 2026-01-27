import {
  type CompleteMessage,
  type ContentBlock,
  type StreamingMessage,
  useAgentContext,
} from "@zypher/ui";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ToolCard, ToolUseCard } from "./AgentToolCard";
import { cn } from "@/lib/utils";
import { useEffect, useRef } from "react";
import { Loader2Icon, SquareIcon } from "lucide-react";

interface AgentChatProps {
  className?: string;
}

export function AgentChat({ className }: AgentChatProps) {
  const {
    messages,
    streaming,
    loading,
    pendingApproval,
    approve,
  } = useAgentContext();

  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
        <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
        Loading...
      </div>
    );
  }

  const empty = messages.length === 0 && streaming.length === 0;

  return (
    <main className={cn("overflow-y-auto", className)}>
      <div className="w-full max-w-3xl mx-auto px-4 min-h-full flex flex-col">
        {empty
          ? (
            <div className="flex-1 flex items-center justify-center py-20">
              <div className="w-full max-w-2xl text-center">
                <h2 className="font-serif text-3xl font-medium text-foreground mb-2">
                  What can I help you with?
                </h2>
                <p className="font-serif text-base font-medium text-muted-foreground">
                  Type a message below to begin our cowork
                </p>
              </div>
            </div>
          )
          : (
            <div className="flex flex-col gap-6 py-6">
              <MessagesRenderer messages={messages} streaming={streaming} />
              <div ref={bottomRef} />
            </div>
          )}
      </div>

      {pendingApproval && (
        <ToolApprovalDialog
          toolName={pendingApproval.toolName}
          input={pendingApproval.input}
          onApprove={() => approve(true)}
          onReject={() => approve(false)}
        />
      )}
    </main>
  );
}

export function AgentInput({ className: _className }: { className?: string }) {
  const { running, streaming, pendingApproval, send, cancel } =
    useAgentContext();

  const handleSubmit = ({ text }: { text: string }) => {
    if (running && streaming.length > 0) {
      cancel();
    } else {
      send(text);
    }
  };

  const status = running ? "streaming" : "ready";

  return (
    <div className="bg-background">
      <div className="w-full max-w-3xl mx-auto px-4 py-3">
        <PromptInput
          onSubmit={handleSubmit}
          className={cn(
            "bg-background",
            "rounded-[26px]",
            "border border-border",
            "[&_[data-slot=input-group]]:border-none [&_[data-slot=input-group]]:shadow-none [&_[data-slot=input-group]]:rounded-[26px] [&_[data-slot=input-group]]:bg-transparent",
          )}
        >
          <PromptInputTextarea
            placeholder={pendingApproval
              ? "Waiting for tool approval..."
              : running
              ? "Agent is thinking..."
              : "Type a message..."}
            disabled={!!pendingApproval}
            className="min-h-6"
          />
          <PromptInputFooter className="justify-end">
            {running
              ? (
                <Button
                  type="button"
                  size="icon"
                  onClick={cancel}
                  className="rounded-full h-9 w-9 bg-foreground hover:bg-foreground/80"
                >
                  <SquareIcon className="size-3 fill-background text-background" />
                </Button>
              )
              : (
                <PromptInputSubmit
                  status={status}
                  disabled={!!pendingApproval}
                  className="rounded-full h-9 w-9"
                />
              )}
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}

// Type for tool_result block that includes name and input
type ToolResultBlockWithMeta = ContentBlock & {
  type: "tool_result";
  name: string;
  input: unknown;
};

// Groups messages and pairs tool_use with tool_result across messages
function MessagesRenderer({
  messages,
  streaming,
}: {
  messages: CompleteMessage[];
  streaming: StreamingMessage[];
}) {
  // Build a map of toolUseId -> tool_result block (from all messages)
  const toolResultMap = new Map<string, ToolResultBlockWithMeta>();
  for (const msg of messages) {
    for (const block of msg.content) {
      if (block.type === "tool_result") {
        toolResultMap.set(block.toolUseId, block as ToolResultBlockWithMeta);
      }
    }
  }

  // Build set of toolUseIds that have results (to skip standalone tool_result messages)
  const toolUseIdsWithResults = new Set(toolResultMap.keys());

  // Render messages, merging tool_use with tool_result
  const renderedItems: React.ReactNode[] = [];

  for (const msg of messages) {
    const contentItems: React.ReactNode[] = [];

    for (let i = 0; i < msg.content.length; i++) {
      const block = msg.content[i];

      if (block.type === "tool_use") {
        // Render tool_use with its result (if available)
        const toolResult = toolResultMap.get(block.toolUseId);
        contentItems.push(
          <ToolCard
            key={`tool-${block.toolUseId}`}
            toolUse={block}
            toolResult={toolResult}
          />,
        );
      } else if (block.type === "tool_result") {
        // Skip - already rendered with its tool_use
        // Only render standalone if no matching tool_use was found
        if (!toolUseIdsWithResults.has(block.toolUseId)) {
          const resultBlock = block as ToolResultBlockWithMeta;
          contentItems.push(
            <ToolCard
              key={`result-${block.toolUseId}`}
              toolUse={{
                type: "tool_use",
                toolUseId: block.toolUseId,
                name: resultBlock.name,
                input: resultBlock.input,
              }}
              toolResult={resultBlock}
            />,
          );
        }
      } else {
        contentItems.push(<ContentBlockRenderer key={i} block={block} />);
      }
    }

    // Only render message if it has content to show
    if (contentItems.length > 0) {
      renderedItems.push(
        <Message key={msg.id} from={msg.role}>
          <MessageContent>{contentItems}</MessageContent>
        </Message>,
      );
    }
  }

  // Render streaming messages
  for (const msg of streaming) {
    renderedItems.push(<StreamingAgentMessage key={msg.id} message={msg} />);
  }

  return <>{renderedItems}</>;
}

function StreamingAgentMessage({ message }: { message: StreamingMessage }) {
  if (message.type === "streaming_text") {
    return (
      <Message from="assistant">
        <MessageContent>
          <MessageResponse>{message.text}</MessageResponse>
          <span className="inline-block h-4 w-1 animate-pulse bg-current opacity-70" />
        </MessageContent>
      </Message>
    );
  }

  if (message.type === "streaming_tool_use") {
    return (
      <Message from="assistant">
        <MessageContent>
          <ToolUseCard
            block={{
              type: "tool_use",
              toolUseId: message.toolUseId,
              name: message.toolName,
              input: tryParseJson(message.partialInput),
            }}
            streaming
          />
        </MessageContent>
      </Message>
    );
  }

  return null;
}

function ContentBlockRenderer({ block }: { block: ContentBlock }) {
  switch (block.type) {
    case "text":
      return <MessageResponse>{block.text}</MessageResponse>;

    case "image":
      return (
        <img
          src={`data:${block.source.media_type};base64,${block.source.data}`}
          alt=""
          className="max-w-full rounded-md"
        />
      );

    default:
      return null;
  }
}

function tryParseJson(str: string): unknown {
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

interface ToolApprovalDialogProps {
  toolName: string;
  input: unknown;
  onApprove: () => void;
  onReject: () => void;
}

function ToolApprovalDialog({
  toolName,
  input,
  onApprove,
  onReject,
}: ToolApprovalDialogProps) {
  return (
    <Dialog open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tool Approval Required</DialogTitle>
          <DialogDescription>
            The agent wants to use the <strong>{toolName}</strong> tool.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-md bg-muted p-3 max-h-[300px] overflow-auto">
          <pre className="text-xs whitespace-pre-wrap break-all">
            {JSON.stringify(input, null, 2)}
          </pre>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onReject}>
            Reject
          </Button>
          <Button onClick={onApprove}>Approve</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
