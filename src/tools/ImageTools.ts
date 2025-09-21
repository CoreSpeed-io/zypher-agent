import { z } from "zod";
import { defineTool, type Tool, type ToolExecutionContext } from "./mod.ts";
import OpenAI, { toFile } from "@openai/openai";
import * as path from "@std/path";
import { ensureDir } from "@std/fs";
import { fileExists } from "../utils/mod.ts";

// Common parameter schemas
const sizeSchema = z
  .enum(["auto", "1024x1024", "1536x1024", "1024x1536"])
  .default("auto")
  .describe("The size of the generated image");

const qualitySchema = z
  .enum(["auto", "low", "medium", "high"])
  .default("auto")
  .describe("The quality of the image that will be generated.");

const backgroundSchema = z
  .enum(["auto", "transparent", "opaque"])
  .default("auto")
  .describe(
    "Allows to set transparency for the background of the generated image(s).",
  );

const destinationPathSchema = z
  .string()
  .describe(
    "The full file path where the image should be saved (e.g., public/images/zypher-agent-sota.png)",
  );

const explanationSchema = z
  .string()
  .optional()
  .describe("One sentence explanation as to why this tool is being used");

/**
 * Format success message for image operations
 *
 * @param generatedFiles - Array of generated image file paths
 * @param successMessage - Message to include in the success response
 * @returns Formatted success message string
 */
function formatSuccessMessage(
  generatedFiles: string[],
  successMessage: string,
): string {
  const fileCount = generatedFiles.length;
  const fileList = generatedFiles.map((file) => `- ${file}`).join("\n");
  return `${fileCount} ${successMessage} and saved to:\n${fileList}`;
}

/**
 * Save images to the specified destination path.
 *
 * @param destinationPath - The destination path for the images.
 * @param images - The images to save. If multiple images are provided,
 * the first image will be saved to the exact destinationPath,
 * and the rest will be saved to destinationPath with suffixes.
 * @returns A promise that resolves to an array of the saved image paths.
 */
async function saveImages(
  destinationPath: string,
  images: OpenAI.Image[],
): Promise<string[]> {
  // Track generated files
  const generatedFiles: string[] = [];

  for (let i = 0; i < images.length; i++) {
    const image = images[i];
    let currentDestination = destinationPath;

    // Add a suffix for additional images
    if (i > 0) {
      const extName = path.extname(destinationPath);
      const baseName = path.basename(destinationPath, extName);
      const dirName = path.dirname(destinationPath);
      currentDestination = path.join(dirName, `${baseName}_${i}${extName}`);
    }

    // Process base64 JSON data
    if (image.b64_json) {
      // Decode base64 data to Uint8Array
      const binaryData = Uint8Array.from(
        atob(image.b64_json),
        (c) => c.charCodeAt(0),
      );

      // Write the data to the file
      await Deno.writeFile(currentDestination, binaryData);

      // Add to list of generated files
      generatedFiles.push(currentDestination);
    } else {
      throw new Error("OpenAI returned an image without base64 JSON data.");
    }
  }

  return generatedFiles;
}

/**
 * Define image tools with a specific OpenAI API key
 *
 * @param openaiApiKey - The OpenAI API key to use for image operations
 * @returns An object containing the configured image generation and editing tools
 */
export function defineImageTools(openaiApiKey: string): {
  ImageGenTool: Tool<{
    prompt: string;
    size: "auto" | "1024x1024" | "1536x1024" | "1024x1536";
    quality: "auto" | "low" | "medium" | "high";
    background: "auto" | "transparent" | "opaque";
    destinationPath: string;
    explanation?: string | undefined;
  }>;
  ImageEditTool: Tool<{
    sourcePath: string;
    mimeType: "image/jpeg" | "image/png" | "image/webp";
    prompt: string;
    size: "auto" | "1024x1024" | "1536x1024" | "1024x1536";
    quality: "auto" | "low" | "medium" | "high";
    destinationPath: string;
    explanation?: string | undefined;
  }>;
} {
  // Initialize OpenAI client with the provided API key
  const openai = new OpenAI({
    apiKey: openaiApiKey,
  });

  const ImageGenTool = defineTool({
    name: "generate_image",
    description:
      "Generate an image using OpenAI's gpt-image-1 model based on a text description.\n\n" +
      "Features:\n" +
      "- Generates high-quality images from text descriptions\n" +
      "- Saves images to the specified file path\n\n" +
      "Best Practices for Prompts:\n" +
      "- Be specific and detailed in descriptions\n" +
      "- Mention style, lighting, perspective if relevant\n" +
      "- Avoid prohibited content (violence, adult content, etc)\n\n",
    parameters: z.object({
      prompt: z
        .string()
        .min(
          5,
          "Your description is too short. Please provide more details about the image you want.",
        )
        .max(
          32000,
          "Your description is too long. Please keep it under 2000 characters.",
        )
        .describe("Natural language description for image generation"),

      size: sizeSchema,
      quality: qualitySchema,
      background: backgroundSchema,
      destinationPath: destinationPathSchema,
      explanation: explanationSchema,
    }),

    execute: async (
      {
        prompt,
        size,
        quality,
        background,
        destinationPath,
      },
      ctx: ToolExecutionContext,
    ): Promise<string> => {
      const resolvedDestination = path.resolve(
        ctx.workingDirectory,
        destinationPath,
      );
      // Create parent directory if it doesn't exist
      const parentDir = path.dirname(resolvedDestination);
      await ensureDir(parentDir);

      // Generate image using gpt-image-1
      const response = await openai.images.generate({
        model: "gpt-image-1",
        prompt: prompt,
        size: size,
        quality,
        background: background,
        n: 1,
      });

      if (!response.data || response.data.length === 0) {
        throw new Error(
          "OpenAI didn't return any images. This is unusual - please try again.",
        );
      }

      // Save images to the destination path
      const generatedFiles = await saveImages(
        resolvedDestination,
        response.data,
      );

      // Return success message
      return formatSuccessMessage(
        generatedFiles,
        "images successfully generated",
      );
    },
  });

  const ImageEditTool = defineTool({
    name: "edit_image",
    description:
      "Edit an existing image using OpenAI's gpt-image-1 model based on a text description.\n\n" +
      "Features:\n" +
      "- Edits existing images based on text instructions\n" +
      "- Can make precise edits while preserving key elements of the original image\n" +
      "- Saves edited images to the specified file path\n\n" +
      "Best Practices for Edit Instructions:\n" +
      "- Be specific about what you want to change in the image\n" +
      "- Describe both what to change and how to change it\n" +
      "- Avoid prohibited content (violence, adult content, etc)\n\n",
    parameters: z.object({
      sourcePath: z
        .string()
        .describe(
          "The full file path to the source image to be edited. The image must be a JPEG, PNG, or WebP file.",
        ),
      mimeType: z
        .enum(["image/jpeg", "image/png", "image/webp"])
        .describe("The MIME type of the source image."),

      prompt: z
        .string()
        .min(
          5,
          "Your description is too short. Please provide more details about the edits you want to make.",
        )
        .max(
          2000,
          "Your description is too long. Please keep it under 2000 characters.",
        )
        .describe("Natural language instructions for how to edit the image"),

      size: sizeSchema,
      quality: qualitySchema,
      destinationPath: destinationPathSchema,
      explanation: explanationSchema,
    }),

    execute: async (
      {
        sourcePath,
        mimeType,
        prompt,
        size,
        quality,
        destinationPath,
      },
      ctx: ToolExecutionContext,
    ): Promise<string> => {
      const resolvedSource = path.resolve(ctx.workingDirectory, sourcePath);
      const resolvedDestination = path.resolve(
        ctx.workingDirectory,
        destinationPath,
      );

      // Validate source image exists
      if (!(await fileExists(resolvedSource))) {
        throw new Error(`Source image not found: ${resolvedSource}`);
      }

      // Create parent directory for destination if it doesn't exist
      const parentDir = path.dirname(resolvedDestination);
      await ensureDir(parentDir);

      // Create a file read stream using Deno's API
      const fileStream = await Deno.open(resolvedSource, { read: true });

      // Use OpenAI's toFile function to convert the stream to a file
      const imageFile = await toFile(
        fileStream.readable,
        path.basename(sourcePath),
        {
          type: mimeType,
        },
      );

      // Generate edited image using OpenAI's gpt-image-1 model
      const response = await openai.images.edit({
        model: "gpt-image-1",
        image: imageFile,
        prompt: prompt,
        size: size,
        quality: quality,
        n: 1,
      });

      if (!response.data || response.data.length === 0) {
        throw new Error(
          "OpenAI didn't return any edited images. This is unusual - please try again.",
        );
      }

      // Save edited images to the destination path
      const generatedFiles = await saveImages(
        resolvedDestination,
        response.data,
      );

      // Return success message
      return formatSuccessMessage(
        generatedFiles,
        "edited images successfully generated",
      );
    },
  });

  return {
    ImageGenTool,
    ImageEditTool,
  };
}
