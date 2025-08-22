import type { Message } from "../message.ts";
import {
  type InterceptorContext,
  type InterceptorResult,
  LoopDecision,
  type LoopInterceptor,
} from "./interface.ts";

/**
 * Loop interceptor that handles automatic continuation when max tokens are reached.
 * When the LLM response is truncated due to max tokens, this interceptor can
 * automatically continue the conversation.
 */
export class MaxTokensInterceptor implements LoopInterceptor {
  readonly name = "max-tokens";
  readonly description =
    "Automatically continues conversation when max tokens are reached";

  constructor(
    private options: {
      enabled?: boolean;
      continueMessage?: string;
      maxContinuations?: number;
    } = {},
  ) {}

  async isApplicable(context: InterceptorContext): Promise<boolean> {
    const enabled = this.options.enabled ?? true;
    return enabled && context.stopReason === "max_tokens";
  }

  async intercept(context: InterceptorContext): Promise<InterceptorResult> {
    // Check if we've already continued too many times
    if (this.options.maxContinuations !== undefined) {
      const continueCount = this.countContinueMessages(context.messages);
      if (continueCount >= this.options.maxContinuations) {
        return {
          decision: LoopDecision.COMPLETE,
          reasoning:
            `Reached maximum continuations (${this.options.maxContinuations})`,
        };
      }
    }

    const continueMessage = this.options.continueMessage ?? "Continue";

    return {
      decision: LoopDecision.CONTINUE,
      contextInjections: [{
        message: continueMessage,
        priority: "high",
        source: this.name,
      }],
      reasoning: "Response was truncated due to max tokens, continuing",
    };
  }

  /**
   * Count how many "Continue" messages are in the recent conversation
   * This helps prevent infinite continuation loops
   */
  private countContinueMessages(messages: Message[]): number {
    // Look at the last 10 messages to count recent continuations
    const recentMessages = messages.slice(-10);
    const continueMessage = this.options.continueMessage ?? "Continue";

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
   * @param enabled Whether continuation should be enabled
   */
  setEnabled(enabled: boolean): void {
    this.options.enabled = enabled;
  }

  /**
   * Set custom continue message
   * @param message The message to send when continuing
   */
  setContinueMessage(message: string): void {
    this.options.continueMessage = message;
  }

  /**
   * Set maximum number of continuations allowed
   * @param max Maximum continuations (undefined for unlimited)
   */
  setMaxContinuations(max: number | undefined): void {
    this.options.maxContinuations = max;
  }

  /**
   * Check if max tokens continuation is enabled
   * @returns boolean True if enabled
   */
  isEnabled(): boolean {
    return this.options.enabled ?? true;
  }
}
