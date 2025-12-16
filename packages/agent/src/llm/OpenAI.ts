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
  TokenUsage,
} from "./ModelProvider.ts";
import { type ClientOptions, OpenAI } from "@openai/openai";
import { type ImageBlock, isFileAttachment, type Message } from "../message.ts";
import * as z from "zod";
import { injectOutputSchema } from "./utils.ts";

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
        type: "function" as const,
        function: {
          name: tool.name,
          description: injectOutputSchema(tool.description, tool.outputSchema),
          parameters: z.toJSONSchema(tool.schema) as OpenAI.FunctionParameters,
          strict: false, // in strict mode, no optional parameters are allowed
        },
      }));

    const formattedMessages = params.messages.map(
      (m) => formatInputMessage(m, fileAttachmentCacheMap),
    );

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
      // Track which tool calls we've already emitted events for
      const emittedToolCalls = new Set<string>();

      stream.on("content.delta", (event) => {
        subscriber.next({ type: "text", content: event.delta });
      });

      // Listen for tool call deltas
      stream.on("tool_calls.function.arguments.delta", (event) => {
        const toolName = event.name;
        const toolIndex = event.index;

        // Use index as the unique identifier for this tool call
        const toolKey = `${toolIndex}`;

        // Emit initial tool_use event when we first see this tool call
        if (!emittedToolCalls.has(toolKey)) {
          emittedToolCalls.add(toolKey);
          subscriber.next({
            type: "tool_use",
            toolName: toolName,
          });
        }

        // Emit tool_use_input event with delta partial input
        subscriber.next({
          type: "tool_use_input",
          toolName: toolName,
          partialInput: event.arguments_delta,
        });
      });

      stream.on("error", (error) => {
        subscriber.error(error);
      });

      stream.on("finalChatCompletion", (completion) => {
        const message = completion.choices[0].message;
        subscriber.next({
          type: "message",
          message: mapOaiMessageToMessage(message, completion.usage),
        });
      });

      stream.on("end", () => {
        subscriber.complete();
      });
    });

    return {
      events: observable,
      finalMessage: async (): Promise<FinalMessage> => {
        const completion = await stream.finalChatCompletion();
        return mapOaiMessageToMessage(
          completion.choices[0].message,
          completion.usage,
        );
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

/** Map OpenAI ChatCompletionMessage to our internal FinalMessage */
function mapOaiMessageToMessage(
  message: OpenAI.Chat.Completions.ChatCompletionMessage,
  usage?: OpenAI.Completions.CompletionUsage,
): FinalMessage {
  return {
    role: message.role,
    content: [
      { type: "text", text: message.content ?? "" },
      ...(
        // We currently only support `function` type tool calls; others are ignored.
        message.tool_calls?.filter((c) => c.type === "function").map((c) => ({
          type: "tool_use" as const,
          toolUseId: c.id,
          name: c.function.name,
          input: JSON.parse(c.function.arguments),
        })) ?? []
      ),
    ],
    stop_reason: message.tool_calls?.length ? "tool_use" : "end_turn",
    timestamp: new Date(),
    usage: usage ? mapOaiUsage(usage) : undefined,
  };
}

/** Map OpenAI usage to our internal TokenUsage */
function mapOaiUsage(usage: OpenAI.Completions.CompletionUsage): TokenUsage {
  return {
    input: {
      total: usage.prompt_tokens,
      cacheRead: usage.prompt_tokens_details?.cached_tokens ?? undefined,
    },
    output: {
      total: usage.completion_tokens,
      thinking: usage.completion_tokens_details?.reasoning_tokens ?? undefined,
    },
    total: usage.total_tokens,
  };
}

/** Map our internal image block to OpenAI image block */
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
