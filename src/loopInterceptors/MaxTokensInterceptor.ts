import type { Message } from "../message.ts";
import {
  type InterceptorContext,
  type InterceptorResult,
  LoopDecision,
  type LoopInterceptor,
} from "./interface.ts";

export interface MaxTokensInterceptorOptions {
  enabled?: boolean;
  continueMessage?: string;
  maxContinuations?: number;
}

/**
 * Loop interceptor that handles automatic continuation when max tokens are reached.
 * When the LLM response is truncated due to max tokens, this interceptor can
 * automatically continue the conversation.
 */
export class MaxTokensInterceptor implements LoopInterceptor {
  readonly name = "max-tokens";
  readonly description =
    "Automatically continues conversation when max tokens are reached";
  readonly #defaultContinueMessage = "Continue";

  #options: MaxTokensInterceptorOptions = {};

  constructor(
    options: MaxTokensInterceptorOptions = {},
  ) {
    this.#options = options;
  }

  isApplicable(context: InterceptorContext): Promise<boolean> {
    const enabled = this.#options.enabled ?? true;
    return Promise.resolve(enabled && context.stopReason === "max_tokens");
  }

  intercept(context: InterceptorContext): Promise<InterceptorResult> {
    // Check if we've already continued too many times
    if (this.#options.maxContinuations !== undefined) {
      const continueCount = this.#countContinueMessages(context.messages);
      if (continueCount >= this.#options.maxContinuations) {
        return Promise.resolve({
          decision: LoopDecision.COMPLETE,
          reasoning:
            `Reached maximum continuations (${this.#options.maxContinuations})`,
        });
      }
    }

    const continueMessage = this.#options.continueMessage ??
      this.#defaultContinueMessage;

    return Promise.resolve({
      decision: LoopDecision.CONTINUE,
      contextInjections: [{
        message: continueMessage,
        priority: "high",
        source: this.name,
      }],
      reasoning: "Response was truncated due to max tokens, continuing",
    });
  }

  /**
   * Count how many "Continue" messages are in the recent conversation
   * This helps prevent infinite continuation loops
   */
  #countContinueMessages(messages: Message[]): number {
    // Look at the last 10 messages to count recent continuations
    const recentMessages = messages.slice(-10);
    const continueMessage = this.#options.continueMessage ??
      this.#defaultContinueMessage;

    return recentMessages.filter((msg) =>
      msg.role === "user" &&
      msg.content.some((block) =>
        block.type === "text" &&
        block.text.trim().toLowerCase() === continueMessage.toLowerCase()
      )
    ).length;
  }

  /**
   * Enable or disable max tokens continuation
   */
  set enabled(value: boolean) {
    this.#options.enabled = value;
  }

  /**
   * Check if max tokens continuation is enabled
   */
  get enabled(): boolean {
    return this.#options.enabled ?? true;
  }

  /**
   * Set custom continue message
   */
  set continueMessage(message: string) {
    this.#options.continueMessage = message;
  }

  /**
   * Get the current continue message
   */
  get continueMessage(): string {
    return this.#options.continueMessage ?? this.#defaultContinueMessage;
  }

  /**
   * Set maximum number of continuations allowed
   */
  set maxContinuations(max: number | undefined) {
    this.#options.maxContinuations = max;
  }

  /**
   * Get maximum number of continuations allowed
   */
  get maxContinuations(): number | undefined {
    return this.#options.maxContinuations;
  }
}
