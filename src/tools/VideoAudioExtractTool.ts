// VideoAudioExtractTool.ts
import { z } from "zod";
import { defineTool } from "./mod.ts";
import { RunTerminalCmdTool } from "./RunTerminalCmdTool.ts";


export const VideoAudioExtractTool = defineTool({
  name: "video_audio_extract",
  description: `Extracts audio from a local video file using ffmpeg and saves it as a separate audio file.

Use this tool when audio-only output is needed for transcription, speech analysis, or music extraction.
The input must be a valid path to a local video file.

Parameters:
- 'inputFile': Full path to the local video file (e.g., ./downloads/video.mp4)
- 'audioFormat': Output audio format (e.g., mp3, wav, m4a). Default is mp3.
- 'outputDir': Directory where the extracted audio file will be saved. Default is './audio'.
- 'isBackground': Whether to run the command in background.
- 'explanation': One-sentence reason for extraction (used in approval message).

The output filename will be automatically derived from the input filename with the selected audio extension.
This tool requires user approval before executing.`,
  parameters: z.object({
    inputFile: z.string().describe("Path to the local video file"),
    audioFormat: z
      .enum(["mp3", "wav", "m4a", "aac", "flac"])
      .default("mp3")
      .describe("Desired audio output format"),
    outputDir: z
      .string()
      .default("./audio")
      .describe("Directory to save the extracted audio"),
    isBackground: z
      .boolean()
      .default(false)
      .describe("Whether to run extraction in the background"),
    explanation: z
      .string()
      .describe("Reason for extracting audio from the video"),
  }),
  execute: async ({ inputFile, audioFormat, outputDir, isBackground, explanation }) => {
    const inputName = inputFile.split("/").pop()!;
    const baseName = inputName.replace(/\.[^/.]+$/, "");
    const outputPath = `${outputDir}/${baseName}.${audioFormat}`;
    const command = `mkdir -p ${outputDir} && ffmpeg -i "${inputFile}" -vn -acodec ${audioFormat} "${outputPath}" -y`;

    return await RunTerminalCmdTool.execute({
      command,
      isBackground,
      requireUserApproval: true,
      explanation: explanation || `Extract audio as ${audioFormat} from ${inputFile}`,
    });
  },
});
