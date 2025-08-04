// VideoDownloadTool.ts
import { z } from "zod";
import { defineTool } from "./mod.ts";
import { RunTerminalCmdTool } from "./RunTerminalCmdTool.ts";

export const VideoDownloadTool = defineTool({
  name: "video_download",
  description: `Download a video from a given URL using the yt-dlp command-line tool.

This tool supports popular video hosting platforms such as YouTube, Bilibili, Vimeo, and more.
It executes the download command via a secure terminal interface and requires explicit user approval.

LLMs should use this tool when a video file is required for offline access, transcription, summarization, or analysis.

Parameters:
- url: The video URL to download.
- outputDir: Optional directory to store the downloaded file (default is ./downloads).
- isBackground: Whether to run the download in the background (non-blocking).
- explanation: Short sentence explaining the reason for this download.

The tool routes through RunTerminalCmdTool and will not execute unless approved by the user.`,
  parameters: z.object({
    url: z.string().url().describe("The full video URL to download"),
    outputDir: z
      .string()
      .default("./downloads")
      .describe("Directory to store the downloaded file"),
    isBackground: z
      .boolean()
      .default(false)
      .describe("Whether to run the command in background"),
    explanation: z
      .string()
      .describe("One-sentence reason for downloading the video"),
  }),
  execute: async ({ url, outputDir, isBackground, explanation }) => {
    const command = `mkdir -p "${outputDir}" && yt-dlp -o "${outputDir}/%(title)s.%(ext)s" "${url}"`;

    return await RunTerminalCmdTool.execute({
      command,
      isBackground,
      requireUserApproval: true,
      explanation: explanation || `Download video from ${url}`,
    });
  },
});
