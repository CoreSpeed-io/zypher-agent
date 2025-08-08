import { z } from "zod";
import { defineTool } from "./mod.ts";
import { RunTerminalCmdTool } from "./RunTerminalCmdTool.ts";

export const VideoCompressionTool = defineTool({
  name: "video_compression",
  description: `Compress a local video file using ffmpeg, preserving visual quality for LLM video analysis (e.g. Gemini).
The tool uses H.264 video codec and AAC audio to reduce file size while keeping important details.

Parameters:
- inputFile: Full path to the video file.
- outputDir: Directory to save the compressed video (default is './compressed').
- outputFile: Filename for the compressed video (e.g., 'compressed.mp4').
- isBackground: Whether to run ffmpeg in the background.
- explanation: One-line purpose for compression (used for logging or prompting).

Note:
- Uses ffmpeg with libx264 codec, 2Mbps target bitrate, and faststart for streaming compatibility.
- If the output file exists, it will be overwritten.
- Requires ffmpeg to be installed and accessible in PATH.`,
  parameters: z.object({
    inputFile: z.string().describe("Path to the local video file to compress"),
    outputDir: z.string().default("./compressed").describe("Directory to save the compressed video"),
    outputFile: z.string().describe("Name of the output compressed video file (e.g., 'small.mp4')"),
    isBackground: z.boolean().default(false).describe("Run the compression in background"),
    explanation: z.string().describe("Why this video is being compressed"),
  }),
  execute: async ({ inputFile, outputDir, outputFile, isBackground, explanation }) => {
    const outputPath = `${outputDir}/${outputFile}`;

    const cmd = `ffmpeg -i "${inputFile}" -vcodec libx264 -preset fast -b:v 2M -maxrate 2.5M -bufsize 3M -acodec aac -b:a 128k -movflags +faststart -y "${outputPath}"`;

    return await RunTerminalCmdTool.execute({
      command: cmd,
      isBackground,
      requireUserApproval: true,
      explanation: explanation || `Compress video ${inputFile}`,
    });
  },
});
