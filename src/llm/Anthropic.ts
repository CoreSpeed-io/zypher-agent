import { Anthropic } from "@anthropic-ai/sdk";

type AnthropicOptions = ConstructorParameters<typeof Anthropic>[0];
import type {
  LLMProvider,
  LLMStream,
  StreamChatParams,
} from "./LLMProvider.ts";

/* ------------------------------------------------------------------------- */
/* AnthropicProvider                                                         */
/* ------------------------------------------------------------------------- */
/**
 * Thin wrapper around `@anthropic-ai/sdk` that satisfies the `LLMProvider`
 * abstraction.  All heavy lifting is delegated to the upstream SDK so we keep
 * the implementation surface minimal.
 */
export class AnthropicProvider implements LLMProvider {
  readonly #client: Anthropic;

  /**
   * @param options Anthropic SDK options.  `apiKey` is mandatory unless it is
   *                provided via the `ANTHROPIC_API_KEY` environment variable.
   */
  constructor(options: AnthropicOptions = {}) {
    const apiKey = options.apiKey ?? Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      throw new Error(
        "AnthropicProvider: missing API key – supply via constructor or " +
          "ANTHROPIC_API_KEY env var.",
      );
    }

    this.#client = new Anthropic(options.apiKey ? options : { ...options, apiKey });
  }

  /* --------------------------------------------------------------------- */
  /* LLMProvider                                                            */
  /* --------------------------------------------------------------------- */

  streamChat(
    params: StreamChatParams,
    { signal }: { signal?: AbortSignal } = {},
  ): LLMStream {
    // The Anthropic SDK already exposes the exact events consumed by
    // `ZypherAgent`, so we forward the parameters verbatim.
    //
    // We cast the result to `LLMStream` because the structural type matches
    // (same methods).  No runtime wrapper is necessary.
    return this.#client.messages.stream(params as never, { signal }) as unknown as LLMStream;
  }
}
