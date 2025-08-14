import { Observable } from "rxjs";
import type { FileAttachmentCacheMap } from "../storage/FileAttachmentManager.ts";
import type {
  FinalMessage,
  ModelEvent,
  ModelProvider,
  ModelStream,
  ProviderInfo,
  StreamChatParams,
} from "./ModelProvider.ts";
import { OpenAI } from "@openai/openai";
import { isFileAttachment, type Message } from "../message.ts";

const SUPPORTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

function isSupportedImageType(
  type: string,
): type is typeof SUPPORTED_IMAGE_TYPES[number] {
  return SUPPORTED_IMAGE_TYPES.includes(
    type as typeof SUPPORTED_IMAGE_TYPES[number],
  );
}

export class OpenAIModelProvider implements ModelProvider {
  #client: OpenAI;
  constructor(apiKey: string) {
    this.#client = new OpenAI({ apiKey });
  }

  get info(): ProviderInfo {
    return {
      name: "openai",
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

  streamChat(
    params: StreamChatParams,
    fileAttachmentCacheMap?: FileAttachmentCacheMap,
  ): ModelStream {
    const openaiTools: OpenAI.Chat.ChatCompletionTool[] | undefined = params
      .tools?.map((tool) => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
          strict: false, // in strict mode, no optional parameters are allowed
        },
      }));

    const formattedMessages = params.messages.map(
      (m) => formatInputMessage(m, fileAttachmentCacheMap),
    );

    // console.log(formattedMessages);

    const stream = this.#client.chat.completions.stream({
      model: params.model,
      messages: [
        {
          role: "system",
          content: params.system,
        },
        ...formattedMessages,
      ],
      max_completion_tokens: params.maxTokens,
      tools: openaiTools,
    });

    const observable = new Observable<ModelEvent>((subscriber) => {
      stream.on("content.delta", (event) => {
        subscriber.next({ type: "text", text: event.delta });
      });

      stream.on("error", (error) => {
        subscriber.error(error);
      });

      stream.on("end", () => {
        subscriber.complete();
      });
    });
    return {
      events: observable,
      finalMessage: async (): Promise<FinalMessage> => {
        const message = await stream.finalMessage();
        // console.log(message);
        return {
          role: message.role,
          content: [
            { type: "text", text: message.content ?? "" },
            ...(
              message.tool_calls?.map((c) => ({
                type: "tool_use" as const,
                id: c.id,
                name: c.function.name,
                input: JSON.parse(c.function.arguments),
              })) ?? []
            ),
          ],
          stop_reason: message.tool_calls?.length ? "tool_use" : "end_turn",
          timestamp: new Date(),
        };
      },
    };
  }
}

function formatInputMessage(
  message: Message,
  fileAttachmentCacheMap?: FileAttachmentCacheMap,
): OpenAI.Chat.ChatCompletionMessageParam {
  if (message.role === "user") {
    if (
      message.content.length === 1 && message.content[0].type === "tool_result"
    ) {
      return {
        role: "tool",
        content: message.content[0].content?.toString() ?? "",
        tool_call_id: message.content[0].tool_use_id,
      };
    }

    // Track file attachment count separately from content index
    let attachmentIndex = 0;

    return {
      role: message.role,
      content: message.content.map(
        (
          c,
        ):
          | OpenAI.Chat.ChatCompletionContentPart
          | OpenAI.Chat.ChatCompletionContentPart[]
          | null => {
          if (c.type === "text") {
            return {
              type: "text",
              text: c.text,
            };
          } else if (isFileAttachment(c)) {
            const cache = fileAttachmentCacheMap?.[c.fileId];
            if (!cache) {
              console.warn(
                `Skipping file attachment as it is not cached. File ID: ${c.fileId}`,
              );
              return null;
            }

            // Increment the file attachment counter for each file attachment
            attachmentIndex++;

            const textBlock = {
              type: "text" as const,
              text: `Attachment ${attachmentIndex}:
MIME type: ${c.mimeType}
Cached at: ${cache.cachePath}`,
            };

            if (isSupportedImageType(c.mimeType)) {
              return [
                textBlock,
                {
                  type: "image_url",
                  image_url: {
                    url: cache.signedUrl,
                    detail: "high",
                  },
                },
              ];
            }

            // Fall back to just the text block for unsupported types
            console.warn(
              `File attachment ${c.fileId} is not supported by OpenAI's Chat Completion API (MIME type: ${c.mimeType}), this file will not be shown to the model.`,
            );
            return textBlock;
          }

          return null;
        },
      ).filter((c) => c !== null).flat(),
    };
  } else {
    const toolCalls = message.content.filter((c) => c.type === "tool_use");
    return {
      role: message.role,
      content: message.content.map((c):
        | OpenAI.Chat.ChatCompletionContentPartText
        | null => {
        if (c.type === "text") {
          return {
            type: "text",
            text: c.text,
          };
        }

        return null;
      })
        .filter((c) => c !== null),
      ...(toolCalls.length > 0
        ? {
          tool_calls: toolCalls.map((
            c,
          ) => ({
            id: c.id,
            type: "function",
            function: {
              name: c.name,
              arguments: JSON.stringify(c.input),
            },
          })),
        }
        : {}),
    };
  }
}
