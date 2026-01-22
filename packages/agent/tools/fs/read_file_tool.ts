import { z } from "zod";
import {
  createTool,
  type Tool,
  type ToolExecuteOptions,
  type ToolExecutionContext,
  type ToolResult,
} from "../mod.ts";
import * as path from "@std/path";
import { encodeBase64 } from "@std/encoding/base64";

// Supported image types that can be displayed as rich content
const SUPPORTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

// File extension to MIME type mapping
const FILE_EXTENSION_TO_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

function getMimeTypeFromPath(filePath: string): string | undefined {
  const ext = path.extname(filePath).toLowerCase();
  return FILE_EXTENSION_TO_MIME[ext];
}

function isSupportedImageType(
  mimeType: string,
): mimeType is typeof SUPPORTED_IMAGE_TYPES[number] {
  return SUPPORTED_IMAGE_TYPES.includes(
    mimeType as typeof SUPPORTED_IMAGE_TYPES[number],
  );
}

/**
 * Detects if a file is likely binary by checking for null bytes in the first 1KB.
 * This is a heuristic approach - text files typically don't contain null bytes,
 * while binary files (executables, images, archives, etc.) often do.
 * Not 100% accurate but catches most common binary formats.
 */
async function isLikelyBinaryFile(
  filePath: string,
  options?: { signal?: AbortSignal },
): Promise<boolean> {
  options?.signal?.throwIfAborted();
  const file = await Deno.open(filePath, { read: true });
  const buffer = new Uint8Array(1024); // Sample first 1KB

  let bytesRead: number | null = null;
  try {
    bytesRead = await file.read(buffer);
  } finally {
    file.close();
  }

  if (bytesRead === null || bytesRead === 0) {
    return false; // Empty file, treat as text
  }

  const chunk = buffer.slice(0, bytesRead);
  // Check for null bytes (0x00) which are common in binary files
  return chunk.some((byte) => byte === 0);
}

export const ReadFileTool: Tool<{
  filePath: string;
  startLine?: number;
  endLine?: number;
  explanation?: string | undefined;
}> = createTool({
  name: "read_file",
  description:
    `Read the contents of a file. Supports text files (with line-based reading) and images (JPEG, PNG, GIF, WebP, SVG) as rich content.

For text files: if startLine and endLine are provided, reads the specified line range (1-indexed, inclusive).
If no line range is specified, reads the entire file.

For images: the entire file content will be returned as rich media that can be displayed inline.

For binary files: detects binary content and provides file metadata instead of attempting text display.

When using this tool to gather information from text files, it's your responsibility to ensure you have the COMPLETE context.
Specifically, each time you call this command you should:
1) Assess if the contents you viewed are sufficient to proceed with your task.
2) Take note of where there are lines not shown.
3) If the file contents you have viewed are insufficient, and you suspect they may be in lines not shown, proactively call the tool again to view those lines.
4) When in doubt, call this tool again to gather more information. Remember that partial file views may miss critical dependencies, imports, or functionality.`,
  schema: z.object({
    filePath: z
      .string()
      .describe(
        "The path of the file to read (relative or absolute). Supports text files and images (JPEG, PNG, GIF, WebP, SVG).",
      ),
    startLine: z
      .number()
      .optional()
      .describe(
        "The one-indexed line number to start reading from (inclusive). If not provided, reads entire file.",
      ),
    endLine: z
      .number()
      .optional()
      .describe(
        "The one-indexed line number to end reading at (inclusive). If not provided, reads entire file.",
      ),
    explanation: z
      .string()
      .optional()
      .describe(
        "One sentence explanation as to why this tool is being used, and how it contributes to the goal.",
      ),
  }),
  execute: async (
    {
      filePath,
      startLine,
      endLine,
    },
    ctx: ToolExecutionContext,
    options?: ToolExecuteOptions,
  ): Promise<ToolResult> => {
    // Check if already aborted before file read
    options?.signal?.throwIfAborted();

    const resolvedPath = path.resolve(ctx.workingDirectory, filePath);
    const mimeType = getMimeTypeFromPath(filePath);

    // Handle images
    if (mimeType && isSupportedImageType(mimeType)) {
      const fileBytes = await Deno.readFile(resolvedPath, {
        signal: options?.signal,
      });
      const base64Data = encodeBase64(fileBytes);

      return {
        content: [
          {
            type: "text",
            text: `Reading image file: ${filePath} (${mimeType})`,
          },
          {
            type: "image",
            data: base64Data,
            mimeType: mimeType,
          },
        ],
      };
    }

    // Check if file is binary before attempting to read as text
    const isLikelyBinary = await isLikelyBinaryFile(resolvedPath, {
      signal: options?.signal,
    });
    if (isLikelyBinary) {
      const fileStats = await Deno.stat(resolvedPath);
      return {
        content: [{
          type: "text",
          text: `Unable to read ${filePath} as text (likely a binary file)`,
        }],
        structuredContent: {
          type: "file_info",
          path: filePath,
          fileType: "binary",
          size: fileStats.size,
          lastModified: fileStats.mtime?.toISOString(),
        },
      };
    }

    const content = await Deno.readTextFile(resolvedPath, {
      signal: options?.signal,
    });

    // If no line range specified, return entire file
    if (startLine === undefined || endLine === undefined) {
      return content;
    }

    const lines = content.split("\n");

    const startIdx = Math.max(0, startLine - 1);
    const endIdx = Math.min(lines.length, endLine - 1);

    const selectedLines = lines.slice(startIdx, endIdx + 1); // +1 for slice exclusivity
    let result = "";

    // Add summary of lines before selection
    if (startIdx > 0) {
      result += `[Lines 1-${startIdx} not shown]\n\n`;
    }

    result += selectedLines.join("\n");

    // Add summary of lines after selection
    if (endLine < lines.length) {
      result += `\n\n[Lines ${endLine + 1}-${lines.length} not shown]`;
    }

    return result;
  },
});
