/**
 * ACP/MCP Content Block Converter
 *
 * Converts ACP ContentBlock[] to ZypherAgent prompt format.
 * Follows MCP resource specification for consistent handling.
 *
 * Note: Content block `annotations` are intentionally ignored as ZypherAgent
 * does not currently use display hints or audience targeting metadata.
 */

import type { ContentBlock as AcpContentBlock } from "acp";


export interface PromptContent {
  text: string;
}

/**
 * Converts ACP content blocks to ZypherAgent prompt format.
 */
export function convertPromptContent(blocks: AcpContentBlock[]): PromptContent {
  const parts: string[] = [];

  for (const block of blocks) {
    const result = convertBlock(block);
    if (result.text) parts.push(result.text);
      
  }

  return { text: parts.join("\n\n") };
}

function convertBlock(
  block: AcpContentBlock,
): { text: string } {
  switch (block.type) {
    case "text":
      return { text: block.text };
    
    case "resource":
      return convertResource(block.resource);

    case "resource_link":
      return { text: formatResourceLink(block) };

    case "audio":
      return { text: `[Audio: ${block.mimeType}, not transcribed]` };
    
    case "image":
      return {text: `[Image: ${block.mimeType}], not supported`};

    default:
      return {
        text: `[Unsupported content: ${(block as { type: string }).type}]`,
      };
  }
}

function convertResource(resource: {
  uri: string;
  mimeType?: string | null;
  text?: string;
  blob?: string;
}): { text: string } {
  const { uri, text } = resource;

  if (text !== undefined) {
    const mimeType = resource.mimeType ?? "text/plain";
    return {
      text: `<resource uri="${uri}" type="${mimeType}">\n${text}\n</resource>`,
    };
  }
  
  if (resource.blob !== undefined) {
    return { text: `[Binary: ${getFilename(uri)} (${resource.mimeType})]` };
  }

  return { text: `[Resource: ${uri}]` };
}

function formatResourceLink(block: {
  uri: string;
  name: string;
  mimeType?: string | null;
  title?: string | null;
  description?: string | null;
  size?: number | bigint | null;
}): string {
  const lines = [`[File: ${block.title ?? block.name}]`, `URI: ${block.uri}`];
  if (block.mimeType) lines.push(`Type: ${block.mimeType}`);
  if (block.description) lines.push(`Description: ${block.description}`);
  return lines.join("\n");
}

function getFilename(uri: string): string {
  return uri.split("/").pop() ?? "file";
}
