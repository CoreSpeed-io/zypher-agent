import type { Message } from "@ag-ui/core";
import type {
  ContentBlock,
  ImageBlock,
  Message as ZypherMessage,
  TextBlock,
  ToolResultBlock,
  ToolUseBlock,
} from "@zypher/agent";

export function convertAGUIMessagesToZypher(
  aguiMessages: Message[],
): ZypherMessage[] {
  const result: ZypherMessage[] = [];
  let systemContext = "";

  // First pass: collect system/developer messages as context
  for (const msg of aguiMessages) {
    if (msg.role === "system" || msg.role === "developer") {
      if (systemContext) systemContext += "\n\n";
      systemContext += msg.content;
    }
  }

  // Second pass: convert other messages
  for (const msg of aguiMessages) {
    if (msg.role === "system" || msg.role === "developer") continue;

    if (msg.role === "user") {
      const content = convertUserContent(msg, systemContext);
      systemContext = "";
      result.push({ role: "user", content, timestamp: new Date() });
    } else if (msg.role === "assistant") {
      result.push({
        role: "assistant",
        content: convertAssistantContent(msg),
        timestamp: new Date(),
      });
    } else if (msg.role === "tool") {
      result.push({
        role: "user",
        content: [convertToolResult(msg)],
        timestamp: new Date(),
      });
    }
  }

  return result;
}

function convertUserContent(
  msg: Message & { role: "user" },
  systemContext: string,
): ContentBlock[] {
  const blocks: ContentBlock[] = [];

  if (systemContext) {
    blocks.push(
      {
        type: "text",
        text: `[System Context]\n${systemContext}\n\n[User Message]`,
      } satisfies TextBlock,
    );
  }

  const content = msg.content;
  if (typeof content === "string") {
    blocks.push({ type: "text", text: content } satisfies TextBlock);
  } else if (Array.isArray(content)) {
    for (const item of content) {
      if (item.type === "text") {
        blocks.push({ type: "text", text: item.text } satisfies TextBlock);
      } else if (
        item.type === "binary" && item.mimeType?.startsWith("image/")
      ) {
        // AG-UI uses 'binary' type for images
        if (item.data) {
          blocks.push(
            {
              type: "image",
              source: {
                type: "base64",
                mediaType: item.mimeType,
                data: item.data,
              },
            } satisfies ImageBlock,
          );
        } else if (item.url) {
          blocks.push(
            {
              type: "image",
              source: { type: "url", url: item.url, mediaType: item.mimeType },
            } satisfies ImageBlock,
          );
        }
      }
    }
  }

  return blocks;
}

function convertAssistantContent(
  msg: Message & { role: "assistant" },
): ContentBlock[] {
  const blocks: ContentBlock[] = [];

  if (msg.content) {
    blocks.push({ type: "text", text: msg.content } satisfies TextBlock);
  }

  if (msg.toolCalls) {
    for (const toolCall of msg.toolCalls) {
      let input: unknown;
      try {
        input = JSON.parse(toolCall.function.arguments);
      } catch {
        input = toolCall.function.arguments;
      }
      blocks.push(
        {
          type: "tool_use",
          toolUseId: toolCall.id,
          name: toolCall.function.name,
          input,
        } satisfies ToolUseBlock,
      );
    }
  }

  return blocks;
}

function convertToolResult(msg: Message & { role: "tool" }): ToolResultBlock {
  return {
    type: "tool_result",
    toolUseId: msg.toolCallId,
    name: "unknown",
    input: undefined,
    success: true,
    content: [{ type: "text", text: msg.content }],
  };
}

export function extractTaskDescription(aguiMessages: Message[]): string {
  for (let i = aguiMessages.length - 1; i >= 0; i--) {
    const msg = aguiMessages[i];
    if (msg.role === "user") {
      const content = msg.content;
      if (typeof content === "string") return content;
      if (Array.isArray(content)) {
        return content
          .filter((c): c is { type: "text"; text: string } => c.type === "text")
          .map((c) => c.text)
          .join("\n");
      }
    }
  }
  return "Continue the conversation";
}

export function convertZypherMessagesToAGUI(
  zypherMessages: ZypherMessage[],
): Message[] {
  const result: Message[] = [];

  for (const msg of zypherMessages) {
    if (msg.role === "user") {
      const toolResults = msg.content.filter(
        (b): b is ToolResultBlock => b.type === "tool_result",
      );

      if (toolResults.length > 0) {
        for (const tr of toolResults) {
          result.push({
            id: crypto.randomUUID(),
            role: "tool",
            toolCallId: tr.toolUseId,
            content: tr.content
              .filter((c): c is TextBlock => c.type === "text")
              .map((c) => c.text)
              .join("\n"),
          } as Message);
        }
      } else {
        const textContent = msg.content
          .filter((b): b is TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n");
        result.push({
          id: crypto.randomUUID(),
          role: "user",
          content: textContent,
        } as Message);
      }
    } else if (msg.role === "assistant") {
      const textContent = msg.content
        .filter((b): b is TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");

      const toolUses = msg.content.filter(
        (b): b is ToolUseBlock => b.type === "tool_use",
      );

      const aguiMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: textContent || undefined,
      } as Message;

      if (toolUses.length > 0) {
        (aguiMsg as Message & { role: "assistant" }).toolCalls = toolUses.map((
          tu,
        ) => ({
          id: tu.toolUseId,
          type: "function" as const,
          function: {
            name: tu.name,
            arguments: JSON.stringify(tu.input),
          },
        }));
      }

      result.push(aguiMsg);
    }
  }

  return result;
}
