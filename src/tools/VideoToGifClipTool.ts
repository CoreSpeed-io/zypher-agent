import { z } from "zod";
import { defineTool } from "./mod.ts";
import { RunTerminalCmdTool } from "./RunTerminalCmdTool.ts";

export const VideoToGifClipTool = defineTool({
  name: "video_to_gif_clip",
  description: `Extract a short segment from a local video file and convert it to a compressed animated GIF using ffmpeg.

This tool is useful for generating visual previews, lightweight examples, or sharing small parts of a video in a visual format.

Parameters:
- inputFile: Path to the local video file (e.g., ./downloads/video.mp4)
- startTime: Start time in format hh:mm:ss (e.g., 00:01:30)
- duration: Duration of the clip in seconds (e.g., 5)
- outputDir: Directory to save the GIF (default: ./images)
- scale: Width of the output GIF in pixels (default: 480)
- fps: Frame rate of the GIF (default: 10)
- isBackground: Whether to run the command in background
- explanation: Why this GIF is being generated

The output GIF will be saved as <video_basename>_<start>_<duration>.gif in the output directory.`,
  parameters: z.object({
    inputFile: z.string().describe("Path to the local video file"),
    startTime: z.string().describe("Start time (format: hh:mm:ss)"),
    duration: z.number().min(1).describe("Duration of the clip in seconds"),
    outputDir: z
      .string()
      .default("./images")
      .describe("Directory to save the generated GIF"),
    scale: z
      .number()
      .default(480)
      .describe("Width of the GIF in pixels (height auto-adjusted)"),
    fps: z
      .number()
      .default(10)
      .describe("Frame rate of the GIF (frames per second)"),
    isBackground: z
      .boolean()
      .default(false)
      .describe("Whether to run the process in background"),
    explanation: z
      .string()
      .describe("One-sentence explanation of why the GIF is being generated"),
  }),
  execute: async ({
    inputFile,
    startTime,
    duration,
    outputDir,
    scale,
    fps,
    isBackground,
    explanation,
  }) => {
    const inputName = inputFile.split("/").pop()!;
    const baseName = inputName.replace(/\.[^/.]+$/, "");
    const gifName = `${baseName}_${startTime.replace(/:/g, "-")}_${duration}s.gif`;
    const outputPath = `${outputDir}/${gifName}`;

    const command = `ffmpeg -ss ${startTime} -t ${duration} -i "${inputFile}" -vf "fps=${fps},scale=${scale}:-1:flags=lanczos" -loop 0 "${outputPath}" -y`;

    return await RunTerminalCmdTool.execute({
      command,
      isBackground,
      requireUserApproval: true,
      explanation:
        explanation ||
        `Generate a GIF from ${startTime} for ${duration}s in ${inputFile}`,
    });
  },
});
