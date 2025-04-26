import { z } from "zod";
import { defineTool } from "./index.ts";
import OpenAI, { toFile } from "@openai/openai";
import * as path from "@std/path";
import { ensureDir } from "@std/fs";
import { APIError } from "@openai/openai";
import { formatError } from "../utils/error.ts";
import { fileExists } from "../utils/index.ts";

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: Deno.env.get("OPENAI_API_KEY"),
});

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

export const ImageGenTool = defineTool({
  name: "generate_image",
  description:
    "Generate an image using OpenAI's gpt-image-1 model based on a text description.\n\n" +
    "Features:\n" +
    "- Generates high-quality images from text descriptions\n" +
    "- Saves images to the specified file path\n\n" +
    "Best Practices for Prompts:\n" +
    "- Be specific and detailed in descriptions\n" +
    "- Mention style, lighting, perspective if relevant\n" +
    "- Avoid prohibited content (violence, adult content, etc)\n\n" +
    "Size/Quality Trade-offs:\n" +
    "- Standard quality: Good for most uses. Use standard quality unless you need better details to save tokens.\n",
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
      .enum(["auto", "1024x1024", "1536x1024", "1024x1536"])
      .default("auto")
      .describe("The size of the generated image"),

    imageQuality: z
      .enum(["auto", "low", "medium", "high"])
      .default("auto")
      .describe(
        "The quality of the image that will be generated.",
      ),

    background: z.enum(["auto", "transparent", "opaque"])
      .default("auto")
      .describe(
        "Allows to set transparency for the background of the generated image(s).",
      ),

    destinationPath: z
      .string()
      .describe(
        "The full file path where the image should be saved (e.g., public/images/zypher-agent-sota.png)",
      ),

    explanation: z
      .string()
      .optional()
      .describe("One sentence explanation as to why this tool is being used"),
  }),

  execute: async ({
    prompt,
    size,
    imageQuality,
    background,
    destinationPath,
  }): Promise<string> => {
    try {
      // Create parent directory if it doesn't exist
      const parentDir = path.dirname(destinationPath);
      await ensureDir(parentDir);

      // Generate image using gpt-image-1
      const response = await openai.images.generate({
        model: "gpt-image-1",
        prompt: prompt,
        size: size,
        quality: imageQuality,
        background: background,
        n: 1,
      });

      if (!response.data || response.data.length === 0) {
        throw new Error(
          "OpenAI didn't return any images. This is unusual - please try again.",
        );
      }

      // Track generated files
      const generatedFiles: string[] = await saveImages(
        destinationPath,
        response.data,
      );

      // Build success message including all generated files
      const fileCount = generatedFiles.length;
      const fileList = generatedFiles.map((file) => `- ${file}`).join("\n");

      return `${fileCount} images successfully generated and saved to:\n${fileList}`;
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

      // Handle other errors
      return `Something went wrong while creating your image. Please try again. ${
        formatError(error)
      }`;
    }
  },
});

export const ImageEditTool = defineTool({
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
    "- Avoid prohibited content (violence, adult content, etc)\n\n" +
    "Size/Quality Trade-offs:\n" +
    "- Standard quality: Good for most uses. Use standard quality unless you need better details to save tokens.\n",
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

    size: z
      .enum(["auto", "1024x1024", "1536x1024", "1024x1536"])
      .default("auto")
      .describe("The size of the edited image"),

    imageQuality: z
      .enum(["auto", "low", "medium", "high"])
      .default("auto")
      .describe(
        "The quality of the image that will be generated.",
      ),

    background: z.enum(["auto", "transparent", "opaque"])
      .default("auto")
      .describe(
        "Allows to set transparency for the background of the edited image(s).",
      ),

    destinationPath: z
      .string()
      .describe(
        "The full file path where the edited image should be saved (e.g., public/images/edited-image.png)",
      ),

    explanation: z
      .string()
      .optional()
      .describe("One sentence explanation as to why this tool is being used"),
  }),

  execute: async ({
    sourcePath,
    mimeType,
    prompt,
    size,
    imageQuality,
    background,
    destinationPath,
  }): Promise<string> => {
    let fileStream: Deno.FsFile | null = null;
    try {
      // Validate source image exists
      if (!fileExists(sourcePath)) {
        throw new Error(`Source image not found: ${sourcePath}`);
      }

      // Create parent directory for destination if it doesn't exist
      const parentDir = path.dirname(destinationPath);
      await ensureDir(parentDir);

      // Create a file read stream using Deno's API
      fileStream = await Deno.open(sourcePath, { read: true });

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
        // TODO: OpenAI SDK issue, see https://platform.openai.com/docs/api-reference/images/createEdit for API reference
        // Disable type checking until the SDK fixes the issue
        //@ts-ignore-next-line
        size: size,
        quality: imageQuality,
        background: background,
        n: 1,
      });

      if (!response.data || response.data.length === 0) {
        throw new Error(
          "OpenAI didn't return any edited images. This is unusual - please try again.",
        );
      }

      // Track generated files
      const generatedFiles: string[] = [];

      // Process the edited images
      for (let i = 0; i < response.data.length; i++) {
        const image = response.data[i];
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

      // Build success message including all generated files
      const fileCount = generatedFiles.length;
      const fileList = generatedFiles.map((file) => `- ${file}`).join("\n");

      return `${fileCount} edited images successfully generated and saved to:\n${fileList}`;
    } catch (error: unknown) {
      // Handle OpenAI API specific errors
      if (error instanceof APIError) {
        switch (error.status) {
          case 429:
            return `OpenAI's servers are busy right now. Please wait a few minutes before trying again. (Error: ${error.message})`;
          case 400:
            return `OpenAI couldn't process your request. This might be because your description contains content they don't allow or there's an issue with the image format. Please try a different description or image. (Error: ${error.message})`;
          case 401:
            return `There's an issue with the OpenAI API key. Please check if your API key is set correctly in the environment variables. (Error: ${error.message})`;
          default:
            return `OpenAI encountered an error while processing your request. This is on their end - please try again in a few minutes. (Error: ${error.message})`;
        }
      }

      // Handle other errors
      return `Something went wrong while editing your image. Please try again. ${
        formatError(error)
      }`;
    } finally {
      // try {
      //   fileStream?.close();
      // } catch (error: unknown) {
      //   console.log("Failed to close file stream", error);
      // }
    }
  },
});
