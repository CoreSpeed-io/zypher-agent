import { z } from "zod";
import { defineTool } from "./mod.ts";
import { RunTerminalCmdTool } from "./RunTerminalCmdTool.ts";


export const VideoFrameAtTimeTool = defineTool({
  name: "video_frame_at_time",
  description: `Extract a single frame from a video at a specified time using ffmpeg.

This tool captures a video frame at a precise timestamp (e.g., 00:02:15.500) from a local video file,
and saves it as an image (e.g., .jpg or .png). It is helpful for generating thumbnails, visualizing scenes,
or performing static frame analysis.

Parameters:
- 'inputFile': Full path to the local video file.
- 'timestamp': Time in format HH:MM:SS[.ms] or seconds (e.g., "00:01:23.456" or "83.5").
- 'outputDir': Directory where the extracted frame will be saved. Default is './images'.
- 'outputImage': Name of the output image file (should end with .jpg or .png).
- 'isBackground': Whether to run the command asynchronously.
- 'explanation': One-sentence purpose for extracting this frame.

Note:
- Uses 'ffmpeg -ss [timestamp] -i [file] -frames:v 1 [output]'.
- If image already exists, it will be overwritten.
- Requires ffmpeg to be installed and accessible.`,
  parameters: z.object({
    inputFile: z.string().describe("Path to the local video file"),
    timestamp: z.string().describe("Timestamp to capture frame (e.g., '00:01:23.456' or '83.5')"),
    outputDir: z
      .string()
      .default("./images")
      .describe("Directory to save the extracted frame"),
    outputImage: z
      .string()
      .describe("Path to output image file (should end in .jpg or .png)"),
    isBackground: z
      .boolean()
      .default(false)
      .describe("Whether to extract the frame in background"),
    explanation: z
      .string()
      .describe("Why this frame is being extracted"),
  }),
  execute: async ({ inputFile, timestamp, outputDir, outputImage, isBackground, explanation }) => {
    const cmd = `ffmpeg -ss ${timestamp} -i "${inputFile}" -frames:v 1 "${outputDir}/${outputImage}" -y`;
    return await RunTerminalCmdTool.execute({
      command: cmd,
      isBackground,
      requireUserApproval: true,
      explanation: explanation || `Extract frame at ${timestamp}`,
    });
  },
});
