import OpenAI from "@openai/openai";
import type {
  LLMProvider,
  LLMStream,
  StreamChatParams,
} from "./LLMProvider.ts";

/* ------------------------------------------------------------------------- */
/* Internal helper: minimal Event-like stream wrapper                        */
/* ------------------------------------------------------------------------- */

class OpenAIStream implements LLMStream {
  #textHandlers: Array<(d: string) => void> = [];
  #streamEventHandlers: Array<(e: unknown) => void> = [];
  #inputJsonHandlers: Array<(j: string) => void> = [];

  #finalMessagePromise: Promise<unknown>;

  constructor(streamIterator: AsyncIterable<any>) {
    let fullContent = "";

    this.#finalMessagePromise = (async () => {
      for await (const chunk of streamIterator) {
        const choice = chunk.choices?.[0];
        if (!choice) continue;

        // Emit text delta (OpenAI returns content deltas)
        const deltaText = choice.delta?.content ?? "";
        if (deltaText) {
          fullContent += deltaText;
          for (const h of this.#textHandlers) h(deltaText);
        }
      }

      // Final assistant message shape mirrors Anthropic's `{ role, content }`
      return {
        role: "assistant",
        content: fullContent,
        finish_reason: "stop",
      };
    })();
  }

  /* -------------------- LLMStream interface ----------------------------- */

  on(event: "text", handler: (delta: string) => void): LLMStream;
  on(event: "streamEvent", handler: (evt: unknown) => void): LLMStream;
  on(event: "inputJson", handler: (partial: string) => void): LLMStream;
  on(
    event: "text" | "streamEvent" | "inputJson",
    handler: (arg: unknown) => void,
  ): LLMStream {
    if (event === "text") this.#textHandlers.push(handler as (d: string) => void);
    else if (event === "streamEvent") {
      this.#streamEventHandlers.push(handler as (e: unknown) => void);
      // No real OpenAI equivalent – emit nothing for now
    } else if (event === "inputJson") {
      this.#inputJsonHandlers.push(handler as (j: string) => void);
      // No OpenAI equivalent
    }

    return this;
  }

  finalMessage(): Promise<unknown> {
    return this.#finalMessagePromise;
  }
}

/* ------------------------------------------------------------------------- */
/* OpenAIProvider                                                            */
/* ------------------------------------------------------------------------- */

type OpenAIOptions = ConstructorParameters<typeof OpenAI>[0];

export class OpenAIProvider implements LLMProvider {
  readonly #client: OpenAI;

  constructor(options: OpenAIOptions = {}) {
    const apiKey = options.apiKey ?? Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      throw new Error(
        "OpenAIProvider: missing API key – supply via constructor or " +
          "OPENAI_API_KEY env var.",
      );
    }

    this.#client = new OpenAI({ ...options, apiKey });
  }

  streamChat(
    params: StreamChatParams,
    { signal }: { signal?: AbortSignal } = {},
  ): LLMStream {
    // Transform Anthropic-shaped params to OpenAI chat completion payload
    const { model, max_tokens, system, messages, tools, metadata } = params;

    const chatMessages: OpenAI.ChatCompletionMessageParam[] = [
      ...(system
        ? [{
          role: "system",
          content:
            typeof system === "string" ? system : JSON.stringify(system),
        }] as const
        : []),
      // Assume downstream code already provides messages in OpenAI format
      ...(messages as OpenAI.ChatCompletionMessageParam[]),
    ];

    // `create()` returns a `Stream`, which is async-iterable
    const streamPromise = this.#client.chat.completions.create(
      {
        model,
        max_tokens,
        messages: chatMessages,
        tools: tools as OpenAI.ChatCompletionTool[], // may be undefined
        stream: true,
        user: (metadata?.user_id as string | undefined) ?? undefined,
      },
      { signal },
    );

    // Wrap the async iterator once it resolves
    const wrapped = new OpenAIStream(asyncIterable(streamPromise));

    return wrapped;
  }
}

/* Utility: ensure both Promise and AsyncIterable are available */
function asyncIterable<T>(
  p: Promise<AsyncIterable<T> | { [Symbol.asyncIterator](): AsyncIterator<T> }>,
): AsyncIterable<T> {
  // OpenAI SDK resolves to a proper AsyncIterable already; but the Promise
  // wrapper maintains structural compatibility with our helper class
  return {
    async *[Symbol.asyncIterator]() {
      const it = await p;
      for await (const v of it as AsyncIterable<T>) {
        yield v;
      }
    },
  };
}
