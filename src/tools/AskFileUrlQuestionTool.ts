import { z } from "zod";
import { defineTool } from "./mod.ts";
import OpenAI from "@openai/openai";


const explanationSchema = z.string().optional().describe(
  "One-sentence explanation as to why this tool is being used",
);

const client = new OpenAI({
  apiKey: Deno.env.get("OPENAI_API_KEY"),
});

/**
 * AskFileUrlQuestionTool
 * ──────────────────────
 * Accepts a publicly accessible **file URL** (image, PDF, text, etc.) plus a
 * natural-language question, and returns an answer powered by GPT-4o.
 */
export const AskFileUrlQuestionTool = defineTool({
  name: "ask_file_url_question",
  description:
    "Answer a natural-language question about the *content* of a remote file using OpenAI’s GPT-4o multimodal capabilities.\n\n" +
    "Features:\n" +
    "• Accepts any publicly reachable file URL (e.g. image, PDF, CSV, text file)\n" +
    "• No local upload needed—the URL is passed directly to OpenAI\n" +
    "• Returns a concise, text-only answer to the provided question\n\n" +
    "Best-practice tips for good answers:\n" +
    "• Ask direct questions (e.g. “What breed of dog is in this photo?”)\n" +
    "• Keep questions under 2,000 characters",
  parameters: z.object({
    fileUrl: z
      .string()
      .url("fileUrl must be a valid, publicly accessible URL.")
      .describe("The HTTPS URL of the file to analyze."),
    question: z
      .string()
      .min(
        5,
        "Your question is too short. Please provide more detail about what you want to know.",
      )
      .max(
        2000,
        "Your question is too long. Please keep it under 2,000 characters.",
      )
      .describe("The natural-language question about the file."),
    explanation: explanationSchema,
  }),

  execute: async ({ fileUrl, question }): Promise<string> => {
    try {

      const downloadedResponse = await fetch(fileUrl);
      if (!downloadedResponse.ok) {
        return `Failed to fetch file`
      }
      // const data = await downloadedResponse.bytes()
      // Deno.readFile()
      // if (!reader) {
      //   return `Failed to read file`
      // }

      const uploadedFile = await client.files.create({
        file: downloadedResponse,
        purpose: "user_data",
      });

      const response = await client.responses.create({
        model: "o3-pro-2025-06-10",
        reasoning: {
          effort: "high"
        },
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_file",
                file_id: uploadedFile.id,
              },
              {
                type: "input_text",
                text: question,
              },
            ],
          },
        ],
      });


      if (!response) {
        throw new Error("OpenAI returned an empty response. Please try again.");
      }

      return response.output_text;
    } catch (error) {
      return "Error during function call";
    }
  },
});
