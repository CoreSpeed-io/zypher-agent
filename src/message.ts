export type ContentBlock =
  | TextBlock
  | ImageBlock
  | ToolUseBlock
  | ToolResultBlock
  | FileAttachment
  | ThinkingBlock;

/**
 * Extended message parameter type that includes checkpoint information
 */
export interface Message {
  content: Array<ContentBlock>;

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
 * Regular text content
 */
export interface TextBlock {
  type: "text";
  text: string;
}

/**
 * Image content
 */
export interface ImageBlock {
  type: "image";
  source: Base64ImageSource | UrlImageSource;
}

/**
 * Base64 image source
 */
export interface Base64ImageSource {
  type: "base64";
  /** The base64 encoded image data */
  data: string;
  /** The MIME type of the image */
  mediaType: string;
}

/**
 * URL image source
 */
export interface UrlImageSource {
  type: "url";
  /** The URL of the image */
  url: string;
  /** The MIME type of the image */
  mediaType: string;
}

export interface ToolUseBlock {
  type: "tool_use";
  /** The ID of the tool use */
  toolUseId: string;
  /** The name of the tool the agent requested to use */
  name: string;
  /** The input parameters for the tool */
  input: unknown;
}

export interface ToolResultBlock {
  type: "tool_result";
  /** The ID of the tool use */
  toolUseId: string;
  /** The name of the tool that was used */
  name: string;
  /** The input parameters for the tool */
  input: unknown;
  /** Whether the tool execution was successful */
  success: boolean;
  /** The content of the tool result */
  content: (TextBlock | ImageBlock)[];
}

/**
 * File attachment content
 */
export interface FileAttachment {
  type: "file_attachment";
  /** The ID of the file in storage */
  fileId: string;
  /** The MIME type of the file */
  mimeType: string;
}

/**
 * Thinking block content
 */
export interface ThinkingBlock {
  type: "thinking";
  /** An opaque field and should not be interpreted or parsed - it exists solely for verification purposes. */
  signature: string;
  /** The content of the thinking block */
  thinking: string;
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
