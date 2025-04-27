import { Anthropic } from "@anthropic-ai/sdk";

export type ContentBlock = Anthropic.ContentBlockParam | FileAttachment;

/**
 * Extended message parameter type that includes checkpoint information
 */
export interface Message {
  content: string | Array<ContentBlock>;

  role: "user" | "assistant";

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

/**
 * Represents an image attachment in the message history
 */
export interface FileAttachment {
  type: "file_attachment";
  /** The ID of the file in storage */
  fileId: string;
}

/**
 * Type guard to validate if an unknown value is a Message object.
 * Also handles converting string timestamps to Date objects.
 *
 * @param value - The value to check
 * @returns True if the value is a valid Message object
 */
export function isMessage(value: unknown): value is Message {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const hasRequiredProps = "role" in value && "content" in value &&
    "timestamp" in value;

  if (!hasRequiredProps) {
    return false;
  }

  // Convert timestamp string to Date object if needed
  if (typeof (value as Message).timestamp === "string") {
    (value as Message).timestamp = new Date((value as Message).timestamp);
  }

  return true;
}

export function isFileAttachment(value: unknown): value is FileAttachment {
  return typeof value === "object" && value !== null &&
    "type" in value && value.type === "file_attachment" &&
    "fileId" in value && typeof value.fileId === "string";
}
/**
 * Prints a message from the agent's conversation to the console with proper formatting.
 * Handles different types of message blocks including text, tool use, and tool results.
 *
 * @param {MessageParam} message - The message to print
 *
 * @example
 * printMessage({
 *   role: 'assistant',
 *   content: 'Hello, how can I help you?'
 * });
 *
 * printMessage({
 *   role: 'user',
 *   content: [{
 *     type: 'tool_result',
 *     tool_use_id: '123',
 *     content: 'Tool execution result'
 *   }]
 * });
 */
export function printMessage(message: Message): void {
  console.log(`\n🗣️ Role: ${message.role}`);
  console.log("════════════════════");

  const content = Array.isArray(message.content)
    ? message.content
    : [{ type: "text", text: message.content, citations: [] }];

  for (const block of content) {
    if (block.type === "text") {
      console.log(block.text);
    } else if (
      block.type === "tool_use" &&
      "name" in block &&
      "input" in block
    ) {
      console.log(`🔧 Using tool: ${block.name}`);
      console.log("Parameters:", JSON.stringify(block.input, null, 2));
    } else if (block.type === "tool_result" && "content" in block) {
      console.log("📋 Tool result:");
      console.log(block.content);
    } else {
      console.log("Unknown block type:", block);
    }
    console.log("---");
  }
}
