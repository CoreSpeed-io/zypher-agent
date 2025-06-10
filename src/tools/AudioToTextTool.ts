import { z } from "zod";
import { defineTool } from "./mod.ts";
import OpenAI from "npm:openai";

const openai = new OpenAI({
  apiKey: Deno.env.get("OPENAI_API_KEY"),
});
/**
 * Audio → text transcription tool (Deno & Node compatible).
 */
export const AudioToTextTool = defineTool({
  name: "transcribe_audio",
  description:
    "Transcribes an audio file to plain text using OpenAI Whisper. " +
    "Use when you have a path to an audio file and need its spoken content.",
  parameters: z.object({
    file_path: z
      .string()
      .describe("Absolute or relative path to the audio file on disk"),
    explanation: z
      .string()
      .describe(
        "One-sentence explanation of why this tool is being used and how it helps the goal.",
      ),
  }),
  execute: async ({ file_path }) => {
    try {
      // ---- 1. Load the bytes into memory ----
      // Works in both Deno and Node:
      const bytes: Uint8Array =
        typeof Deno !== "undefined"
          ? await Deno.readFile(file_path) // Deno
          : await import("node:fs/promises").then((fs) => fs.readFile(file_path)); // Node

      // ---- 2. Wrap as a File/Blob so the SDK sees a ready-to-go object ----
      const mime =
        file_path.endsWith(".mp3")
          ? "audio/mpeg"
          : file_path.endsWith(".wav")
          ? "audio/wav"
          : file_path.endsWith(".m4a")
          ? "audio/x-m4a"
          : "application/octet-stream";

      // Deno and modern Node both have `File` in the global scope.
      const file = new File([bytes], file_path.split("/").pop() ?? "audio", {
        type: mime,
      });

      // ---- 3. Transcribe ----
      const text = await openai.audio.transcriptions.create({
        file,
        model: "whisper-1",
        response_format: "text",
      });

      return text;
    } catch (error) {
      if (error instanceof Error) {
        return `Error transcribing audio: ${error.message}`;
      }
      return "Error transcribing audio: Unknown error";
    }
  },
});
