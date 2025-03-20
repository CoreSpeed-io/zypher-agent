import type { MessageParam as AnthropicMessageParam } from "@anthropic-ai/sdk/resources/messages";

/**
 * Extended message parameter type that includes checkpoint information
 */
export interface Message extends AnthropicMessageParam {
  /**
   * Timestamp indicating when the message was created
   */
  timestamp: Date;

  /**
   * Optional reference to a checkpoint created before this message
   */
  checkpointId?: string;

  /**
   * Optional metadata about the checkpoint
   */
  checkpoint?: {
    id: string;
    name: string;
    timestamp: string;
  };
}
