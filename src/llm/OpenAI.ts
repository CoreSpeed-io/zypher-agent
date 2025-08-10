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
import {
  type ContentBlock,
  isFileAttachment,
  type Message,
} from "../message.ts";

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
    const openaiTools = params.tools?.map((tool) => ({
      type: "function",
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      strict: false, // in strict mode, no optional parameters are allowed
    } satisfies OpenAI.Responses.Tool));

    const stream = this.#client.responses.stream({
      model: params.model,
      instructions: params.system,
      input: params.messages.map(
        (m) => formatInputMessage(m),
      ),
      tools: openaiTools,
    });

    return new OpenAIModelStream(stream);
  }
}

class OpenAIModelStream implements ModelStream {
  #stream: ReturnType<OpenAI["responses"]["stream"]>;
  #events: Observable<ModelEvent>;

  constructor(stream: ReturnType<OpenAI["responses"]["stream"]>) {
    this.#stream = stream;
    this.#events = new Observable((subscriber) => {
      stream.on("response.created", (event) => {
        console.log("response.created");
      });

      stream.on("response.output_text.delta", (event) => {
        subscriber.next({ type: "text", text: event.delta });
      });

      stream.on("response.completed", (event) => {
        subscriber.next({
          type: "message",
          message: buildMessageFromResponse(event.response),
        });
      });

      stream.on("error", (error) => {
        subscriber.error(error);
      });

      stream.on("end", () => {
        subscriber.complete();
      });
    });
  }

  get events(): Observable<ModelEvent> {
    return this.#events;
  }

  async finalMessage(): Promise<FinalMessage> {
    const finalResponse = await this.#stream.finalResponse();
    return buildMessageFromResponse(finalResponse);
  }
}

function formatInputMessage(
  message: Message,
): OpenAI.Responses.ResponseInputItem {
  return {
    role: message.role,
    content: message.content.map(
      (c): OpenAI.Responses.ResponseInputContent | null => {
        if (c.type === "text") {
          return {
            type: "input_text",
            text: c.text,
          };
        } else if (isFileAttachment(c)) {
          return {
            type: "input_file",
            file_id: c.fileId,
          };
        }

        console.warn(`Unsupported content type: ${c.type} will be ignored.`);
        return null;
      },
    ).filter((c) => c !== null),
  };
}

function mapOutputItem(
  output: OpenAI.Responses.ResponseOutputItem,
): ContentBlock[] | null {
  if (output.type === "message") {
    return output.content.map((c) => ({
      type: "text",
      text: c.type === "output_text" ? c.text : c.refusal,
    }));
  } else if (output.type === "function_call") {
    return [
      {
        type: "tool_use",
        id: output.call_id,
        name: output.name,
        input: output.arguments,
      },
    ];
  }

  console.warn(`Unsupported output type: ${output.type}.`);
  return null;
}

function buildMessageFromResponse(
  response: OpenAI.Responses.Response,
): FinalMessage {
  return {
    role: "assistant",
    content: response.output
      .map(mapOutputItem)
      .filter((c) => c !== null)
      .flat(),
    stop_reason: response.output.find((o) => o.type === "function_call")
      ? "tool_use"
      : "end_turn",
    timestamp: new Date(),
  };
}
