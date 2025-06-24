import { z } from "zod";
import { defineTool } from "./mod.ts";
import * as path from "@std/path";
import { APIError } from "@openai/openai";
import { formatError } from "../error.ts";
import { fileExists } from "../utils/mod.ts";
import { S3StorageService } from "../storage/S3StorageService.ts";

// Only initialize S3 if AWS credentials are available
const awsAccessKeyId = Deno.env.get("S3_ACCESS_KEY_ID")!;
const awsSecretAccessKey = Deno.env.get("S3_SECRET_ACCESS_KEY")!;
const awsRegion = Deno.env.get("S3_REGION")!;
const s3Bucket = Deno.env.get("S3_BUCKET_NAME")!;

const storageService = new S3StorageService({
  bucket: s3Bucket,
  region: awsRegion,
  credentials: {
    accessKeyId: awsAccessKeyId,
    secretAccessKey: awsSecretAccessKey,
  },
});

const explanationSchema = z.string().optional().describe(
  "One-sentence explanation as to why this tool is being used",
);

function handleQuestionToolError(error: unknown): string {
  if (error instanceof APIError) {
    switch (error.status) {
      case 429:
        return `OpenAI's servers are busy right now. Please wait a few minutes then try again. (Error: ${error.message})`;
      case 400:
        return `OpenAI couldn't process your request. This may be due to an unsupported image or question format. (Error: ${error.message})`;
      case 401:
        return `There's an issue with the OpenAI API key. Please check that it is set correctly in the environment variables. (Error: ${error.message})`;
      default:
        return `OpenAI encountered an error while answering your question. Please try again in a few minutes. (Error: ${error.message})`;
    }
  }
  return `Something went wrong while answering your question. ${formatError(error)
    }`;
}

async function getImageResponse(
  apiKey: string,
  imageUrl: string,
  userQuestion: string,
) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "o3-pro-2025-06-10",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: userQuestion },
            { type: "input_image", image_url: imageUrl },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Error: ${response.status} - ${response.statusText}`);
  }

  const data = await response.json();
  return data;
}

export const AskImageQuestionTool = defineTool({
  name: "ask_image_question",
  description:
    "Answer a natural-language question about the content of an image using OpenAI's GPT-4o vision capabilities.\n\n" +
    "Features:\n" +
    "- Accepts a local image (JPEG, PNG, or WebP)\n" +
    "- Uploads the image securely to OpenAI for vision processing\n" +
    "- Returns a concise, text-only answer to the provided question\n\n" +
    "Best Practices for Questions:\n" +
    "- Ask direct questions (e.g., “What breed of dog is this?”)\n" +
    "- Keep questions under 2,000 characters\n",
  parameters: z.object({
    imagePath: z.string().describe(
      "Full file path to the image that should be analyzed.",
    ),
    mimeType: z
      .enum(["image/jpeg", "image/png", "image/webp"])
      .describe("The MIME type of the image."),
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
      .describe("The natural-language question about the image."),
    explanation: explanationSchema,
  }),

  execute: async ({
    imagePath,
    mimeType,
    question,
  }): Promise<string> => {
    try {
      if (!fileExists(imagePath)) {
        throw new Error(`Image not found: ${imagePath}`);
      }

      const fileBuffer = await Deno.readFile(imagePath);

      const uploadResult = await storageService.uploadFromBuffer(fileBuffer, {
        filename: path.basename(imagePath),
        contentType: mimeType,
        size: fileBuffer.length,
      });

      const answer = await getImageResponse(Deno.env.get("OPENAI_API_KEY")!, uploadResult.url, question)

      if (!answer) {
        throw new Error("OpenAI did not return an answer. Please try again.");
      }

      return  JSON.stringify(answer["output"], null, 2);
    } catch (error: unknown) {
      return handleQuestionToolError(error);
    }
  },
});
