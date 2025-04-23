import { Anthropic } from "@anthropic-ai/sdk";

export type ContentBlock = Anthropic.ContentBlockParam | ImageAttachment;

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
export interface ImageAttachment {
  type: "image_attachment";
  /** The ID of the file in storage */
  fileId: string;
  /** The content type must be an image type */
  contentType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
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

export function isImageAttachment(value: unknown): value is ImageAttachment {
  return typeof value === "object" && value !== null &&
    "type" in value && value.type === "image_attachment" &&
    "fileId" in value && typeof value.fileId === "string" &&
    "contentType" in value && typeof value.contentType === "string";
}
