import type {
  FinalMessage,
  ModelEvent,
  ModelProvider,
  ModelStream,
  ProviderInfo,
  StreamChatParams,
} from "./ModelProvider.ts";
import { Anthropic } from "@anthropic-ai/sdk";
import { isFileAttachment, type Message } from "../message.ts";
import { Observable } from "rxjs";

const SUPPORTED_FILE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
] as const;

type AnthropicSupportedFileTypes = typeof SUPPORTED_FILE_TYPES[number];

function isFileTypeSupported(
  type: string,
): type is AnthropicSupportedFileTypes {
  return SUPPORTED_FILE_TYPES.includes(type as AnthropicSupportedFileTypes);
}

function mapStopReason(reason: string | null): FinalMessage["stop_reason"] {
  switch (reason) {
    case "end_turn":
      return "stop_sequence";
    case "max_tokens":
      return "max_tokens";
    case "tool_use":
      return "tool_use";
    case "content_block_limit":
      return "content_block_limit";
    case "length":
      return "length";
    default:
      return "stop_sequence";
  }
}

function mapMessage(message: Anthropic.Message): FinalMessage {
  return {
    role: message.role,
    content: message.content,
    timestamp: new Date(),
    stop_reason: mapStopReason(message.stop_reason),
  };
}

export class AnthropicModelProvider implements ModelProvider {
  #client: Anthropic;
  #enablePromptCaching: boolean;

  constructor(
    apiKey: string,
    enablePromptCaching: boolean,
  ) {
    this.#client = new Anthropic({ apiKey });
    this.#enablePromptCaching = enablePromptCaching;
  }

  get info(): ProviderInfo {
    return {
      name: "anthropic",
      version: "1.0.0",
      capabilities: [
        "caching",
        "thinking",
        "web_search",
        "vision",
        "documents",
        "json_mode",
        "tool_calling",
      ],
    };
  }

  streamChat(params: StreamChatParams): ModelStream {
    // Convert our internal Message[] to Anthropic's MessageParam[]
    const anthropicMessages = params.messages.map((msg) =>
      this.#formatMessageForApi(msg, false)
    );

    // Convert our internal Tool[] to Anthropic's Tool[]
    const anthropicTools = params.tools?.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
    }));

    const stream = this.#client.messages.stream({
      model: params.model,
      max_tokens: params.maxTokens,
      system: params.system,
      messages: anthropicMessages,
      tools: anthropicTools,
    });

    return new AnthropicModelStream(stream);
  }

  /**
   * Formats a message for the Anthropic API, converting content to blocks and adding cache control
   * for incremental caching of conversation history.
   *
   * @param message - The extended message parameter
   * @param isLastMessage - Whether this is the last message in the turn
   * @returns A clean message parameter for the Anthropic API
   */
  #formatMessageForApi(
    message: Message,
    isLastMessage: boolean,
  ): Anthropic.MessageParam {
    const { role, content } = message;

    // Track file attachment count separately from content index
    let fileAttachmentCount = 0;

    // For string content, convert to array format
    let contentArray = typeof content === "string"
      ? [
        {
          type: "text" as const,
          text: content,
        } satisfies Anthropic.TextBlockParam,
      ]
      : content.map((block) => {
        if (isFileAttachment(block)) {
          // Increment the file attachment counter for each file attachment
          fileAttachmentCount++;

          if (!isFileTypeSupported(block.mimeType)) {
            console.warn(
              `Skipping file attachment as this file is not supported by Anthropic. File type must be one of ${
                SUPPORTED_FILE_TYPES.join(", ")
              }. File ID: ${block.fileId}`,
            );
            return null;
          }

          const attachmentIndex = fileAttachmentCount;

          // Text block is always included for both image and PDF files
          const textBlock: Anthropic.TextBlockParam = {
            type: "text" as const,
            text: `Attachment ${attachmentIndex}:
MIME type: ${block.mimeType}
Cached at: ${block.cachePath}`,
          };

          // Handle different file types with appropriate block types
          if (block.mimeType.startsWith("image/")) {
            return [
              textBlock,
              {
                type: "image" as const,
                source: {
                  type: "url" as const,
                  url: block.signedUrl,
                },
              } satisfies Anthropic.ImageBlockParam,
            ];
          } else if (block.mimeType === "application/pdf") {
            return [
              textBlock,
              {
                type: "document" as const,
                source: {
                  type: "url" as const,
                  url: block.signedUrl,
                },
              } satisfies Anthropic.DocumentBlockParam,
            ];
          }

          // Fall back to just the text block for unsupported types
          return [textBlock];
        }
        return block;
      })
        .filter((block): block is Anthropic.ContentBlockParam => block !== null)
        .flat();

    // Add cache control to the last block of the last message
    if (isLastMessage && this.#enablePromptCaching && contentArray.length > 0) {
      // Only create new array for the last message to avoid mutating the original array
      contentArray = [
        ...contentArray.slice(0, -1), // Keep all but the last block
        // inject cache control to the last block
        // refer to https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching#continuing-a-multi-turn-conversation
        {
          ...contentArray[contentArray.length - 1],
          cache_control: { type: "ephemeral" },
        } as Anthropic.ContentBlockParam,
      ];
    }

    return { role, content: contentArray };
  }
}

class AnthropicModelStream implements ModelStream {
  #stream: ReturnType<Anthropic["messages"]["stream"]>;

  constructor(stream: ReturnType<Anthropic["messages"]["stream"]>) {
    this.#stream = stream;
  }

  events(): Observable<ModelEvent> {
    return new Observable((subscriber) => {
      this.#stream.on("text", (text) => {
        subscriber.next({ type: "text", text });
      });

      this.#stream.on("message", (message) => {
        subscriber.next({
          type: "message",
          message: mapMessage(message),
        });
      });

      this.#stream.on("error", (error) => {
        subscriber.error(error);
      });

      this.#stream.on("end", () => {
        subscriber.complete();
      });
    });
  }

  async finalMessage(): Promise<FinalMessage> {
    const finalMessage = await this.#stream.finalMessage();
    return mapMessage(finalMessage);
  }
}
