/**
 * Common types shared between LLM providers and the agent
 */

import type { UnifiedContent, UnifiedMessage } from "./LLMProvider.ts";

/**
 * Extended message type used by ZypherAgent
 * Includes additional metadata beyond the unified message format
 */
export interface AgentMessage extends UnifiedMessage {
  timestamp: Date;
  checkpointId?: string;
  checkpoint?: {
    id: string;
    name: string;
    createdAt: Date;
  };
}

/**
 * File attachment representation in agent messages
 */
export interface FileAttachment {
  type: 'file_attachment';
  fileId: string;
  mimeType: string;
}

/**
 * Check if content is a file attachment
 */
export function isFileAttachment(content: unknown): content is FileAttachment {
  return typeof content === 'object' && 
    content !== null && 
    'type' in content && 
    content.type === 'file_attachment';
}

/**
 * Convert file attachment to appropriate unified content
 */
export async function fileAttachmentToContent(
  attachment: FileAttachment,
  signedUrl: string
): Promise<UnifiedContent[]> {
  const contents: UnifiedContent[] = [];
  
  // Add descriptive text
  contents.push({
    type: 'text',
    text: `File attachment:\nMIME type: ${attachment.mimeType}\nFile ID: ${attachment.fileId}`
  });
  
  // Add appropriate content based on MIME type
  if (attachment.mimeType.startsWith('image/')) {
    contents.push({
      type: 'image',
      source: {
        type: 'url',
        data: signedUrl,
        mediaType: attachment.mimeType
      }
    });
  } else if (attachment.mimeType === 'application/pdf') {
    contents.push({
      type: 'document', 
      source: {
        type: 'url',
        data: signedUrl,
        mediaType: attachment.mimeType
      }
    });
  }
  
  return contents;
}
