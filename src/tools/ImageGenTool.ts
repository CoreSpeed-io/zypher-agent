import { z } from "zod";
import { defineTool } from "./index";
import OpenAI from "openai";
import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import { APIError } from "openai";

// Get the current directory
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const ImageGenTool = defineTool({
  name: "generate_image",
  description:
    "Generate an image using DALL-E-3 API based on a text description.\n\n" +
    "Features:\n" +
    "- Generates high-quality images from text descriptions\n" +
    "- Supports sizes: 1024x1024 (square), 1024x1792 (portrait), 1792x1024 (landscape)\n" +
    "- Quality options: standard (default) or hd (2x credits)\n" +
    "- Saves images to the specified file path\n\n" +
    "Best Practices for Prompts:\n" +
    "- Be specific and detailed in descriptions\n" +
    "- Mention style, lighting, perspective if relevant\n" +
    "- Avoid prohibited content (violence, adult content, etc)\n\n" +
    "Size/Quality Trade-offs:\n" +
    "- Standard quality: Good for most uses (4 credits)\n" +
    "- HD quality: Better details but 2x credits (8 credits)\n" +
    "- Larger sizes may be better for detailed scenes\n\n" +
    "Note: Requires OPENAI_API_KEY environment variable to be set.",

  parameters: z.object({
    prompt: z
      .string()
      .min(
        5,
        "Your description is too short. Please provide more details about the image you want.",
      )
      .max(
        2000,
        "Your description is too long. Please keep it under 2000 characters.",
      )
      .describe("Natural language description for image generation"),

    size: z
      .enum(["1024x1024", "1024x1792", "1792x1024"])
      .default("1024x1024")
      .describe("The size of the generated image"),

    imageQuality: z
      .enum(["standard", "hd"])
      .default("standard")
      .describe("Image quality setting. 'hd' for DALL-E 3 provides higher quality but uses more credits"),

    destinationPath: z
      .string()
      .describe("The full file path where the image should be saved (e.g., public/images/zypher-agent-sota.png)"),

    explanation: z
      .string()
      .optional()
      .describe("One sentence explanation as to why this tool is being used"),
  }),

  execute: async ({ prompt, size, imageQuality, destinationPath }): Promise<string> => {
    try {
      // Create parent directory if it doesn't exist
      const parentDir = path.dirname(destinationPath);
      try {
        await fs.mkdir(parentDir, { recursive: true });
      } catch (error) {
        throw new Error(
          `Failed to create directory for saving the image. Please check if you have write permissions: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        );
      }

      // Generate image using DALL-E
      const response = await openai.images.generate({
        model: "dall-e-3",
        prompt: prompt,
        size: size,
        quality: imageQuality,
        n: 1,
      });

      if (!response.data[0]?.url) {
        throw new Error(
          "OpenAI didn't return an image URL. This is unusual - please try again.",
        );
      }

      // Download the image
      const imageResponse = await fetch(response.data[0].url);
      if (!imageResponse.ok) {
        throw new Error(
          `We couldn't download the image from OpenAI's servers. This might be a temporary issue. Please try again in a few minutes. (Error: ${imageResponse.statusText})`,
        );
      }

      const imageBuffer = await imageResponse.arrayBuffer();

      // Save the image
      await fs.writeFile(destinationPath, Buffer.from(imageBuffer));

      return JSON.stringify({
        success: true,
        message: `Great! Your image has been created successfully!`,
        data: {
          filepath: destinationPath,
          url: response.data[0].url,
          size,
          imageQuality,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error: unknown) {
      // Handle OpenAI API specific errors
      if (error instanceof APIError) {
        switch (error.status) {
          case 429:
            return `OpenAI's servers are busy right now. Please wait a few minutes before trying again. (Error: ${error.message})`;
          case 400:
            return `OpenAI couldn't process your request. This might be because your description contains content they don't allow. Please try a different description. (Error: ${error.message})`;
          case 401:
            return `There's an issue with the OpenAI API key. Please check if your API key is set correctly in the environment variables. (Error: ${error.message})`;
          default:
            return `OpenAI encountered an error while processing your request. This is on their end - please try again in a few minutes. (Error: ${error.message})`;
        }
      }

      // Handle network errors
      if (error instanceof TypeError && error.message.includes("fetch")) {
        return `We couldn't connect to OpenAI's servers. Please check your internet connection and try again. (Error: ${error.message})`;
      }

      // Handle other errors
      return `Something went wrong while creating your image. Please try again. (Error: ${
        error instanceof Error ? error.message : "Unknown error"
      })`;
    }
  },
});