import { Observable } from "rxjs";
import type { FileAttachmentCacheMap } from "../storage/FileAttachmentManager.ts";
import type {
  FinalMessage,
  ModelEvent,
  ModelProvider,
  ModelProviderOptions,
  ModelStream,
  ProviderInfo,
  StreamChatParams,
} from "./ModelProvider.ts";
import { type ClientOptions, OpenAI } from "@openai/openai";
import { type ImageBlock, isFileAttachment, type Message } from "../message.ts";
import { getLogger } from "@logtape/logtape";

const logger = getLogger(["zypher", "llm", "openai"]);

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

export interface OpenAIModelProviderOptions extends ModelProviderOptions {
  /**
   * The reasoning effort to use.
   * @see https://platform.openai.com/docs/api-reference/chat/create#chat_create-reasoning_effort
   */
  reasoningEffort?: "low" | "medium" | "high";
  openaiClientOptions?: ClientOptions;
}

function isReasoningModel(model: string): boolean {
  return model.startsWith("o1") ||
    model.startsWith("o3") ||
    model.startsWith("o4") ||
    (model.startsWith("gpt-5") && !model.startsWith("gpt-5-chat"));
}

export class OpenAIModelProvider implements ModelProvider {
  #client: OpenAI;
  #reasoningEffort: "low" | "medium" | "high";

  constructor(options: OpenAIModelProviderOptions) {
    this.#client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseUrl,
      ...options.openaiClientOptions,
    });
    this.#reasoningEffort = options.reasoningEffort ?? "low";
  }

  get info(): ProviderInfo {
    return {
      name: "openai",
      version: "1.0.0",
      capabilities: [
        "caching",
        "thinking",
        "vision",
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
        ...formattedMessages.flat(),
      ],
      max_completion_tokens: params.maxTokens,
      tools: openaiTools,
      ...(isReasoningModel(params.model) &&
        { reasoning_effort: this.#reasoningEffort }),
      safety_identifier: params.userId,
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
                toolUseId: c.id,
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

/** Format our internal message to OpenAI message to be used as input to the OpenAI API */
function formatInputMessage(
  message: Message,
  fileAttachmentCacheMap?: FileAttachmentCacheMap,
):
  | OpenAI.Chat.ChatCompletionMessageParam
  | OpenAI.Chat.ChatCompletionMessageParam[] {
  if (message.role === "user") {
    // Track file attachment count separately from content index
    let attachmentIndex = 0;
    // Track images from tool results that need to be included in user message
    let toolResultImageIndex = 0;

    const toolMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    const mainMessage = {
      role: message.role,
      content: message.content
        .map((c):
          | OpenAI.Chat.ChatCompletionContentPart
          | OpenAI.Chat.ChatCompletionContentPart[]
          | null => {
          if (c.type === "text") {
            return {
              type: "text",
              text: c.text,
            };
          } else if (c.type === "tool_result") {
            // Collect images and text separately for OpenAI format
            const toolResultParts: string[] = [];
            const imageParts: OpenAI.Chat.ChatCompletionContentPartImage[] = [];

            for (const block of c.content) {
              if (block.type === "text") {
                toolResultParts.push(block.text);
              } else if (block.type === "image") {
                const imageBlock = mapImageBlockToOpenAI(block);
                toolResultImageIndex++;
                if (imageBlock.type === "image_url") {
                  toolResultParts.push(
                    `[See image ${toolResultImageIndex} below]`,
                  );
                  imageParts.push(imageBlock);
                } else {
                  // For unsupported image types, just include the descriptive text
                  toolResultParts.push(imageBlock.text);
                }
              }
            }

            // OpenAI expects tool results as separate messages with role "tool",
            // not embedded in user message content. Extract and create separate tool message.
            toolMessages.push({
              role: "tool",
              content: toolResultParts.join("\n"),
              tool_call_id: c.toolUseId,
            });

            // Return images to be included in main user message
            return imageParts;
          } else if (c.type === "image") {
            return mapImageBlockToOpenAI(c);
          } else if (isFileAttachment(c)) {
            const cache = fileAttachmentCacheMap?.[c.fileId];
            if (!cache) {
              logger.warn(
                "Skipping file attachment {fileId} as it is not cached",
                {
                  fileId: c.fileId,
                },
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
            logger.warn(
              "File attachment {fileId} with MIME type {mimeType} is not supported by OpenAI's Chat Completion API, this file will not be shown to the model",
              {
                fileId: c.fileId,
                mimeType: c.mimeType,
              },
            );
            return textBlock;
          }

          return null;
        })
        .filter((c) => c !== null)
        .flat(),
    };

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    // Add tool messages first
    // because message with 'tool_calls' must be followed by tool messages responding to each 'tool_call_id'
    if (toolMessages.length > 0) {
      messages.push(...toolMessages);
    }

    // Add main message only if it has content
    if (mainMessage.content.length > 0) {
      messages.push(mainMessage);
    }

    return messages;
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
            id: c.toolUseId,
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

function mapImageBlockToOpenAI(block: ImageBlock):
  | OpenAI.Chat.ChatCompletionContentPartImage
  | OpenAI.Chat.ChatCompletionContentPartText {
  if (isSupportedImageType(block.source.mediaType)) {
    if (block.source.type === "base64") {
      return {
        type: "image_url",
        image_url: {
          url: `data:${block.source.mediaType};base64,${block.source.data}`,
          detail: "high",
        },
      };
    } else {
      return {
        type: "image_url",
        image_url: {
          url: block.source.url,
          detail: "high",
        },
      };
    }
  } else {
    // For unsupported image types, return descriptive text
    return {
      type: "text",
      text: `[Unsupported image type: ${block.source.mediaType}]`,
    };
  }
}
