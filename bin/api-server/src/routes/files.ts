import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { StorageService } from "../../../../src/storage/StorageService.ts";
import { SUPPORTED_FILE_TYPES } from "../../../../src/ZypherAgent.ts";

// File upload request schema
const fileUploadRequestSchema = z.object({
  filename: z.string().min(1, "Filename is required"),
  contentType: z.enum(SUPPORTED_FILE_TYPES, {
    errorMap: () => ({
      message: `File must be one of the supported types: ${
        SUPPORTED_FILE_TYPES.join(", ")
      }`,
    }),
  }),
  size: z.number().int().positive().optional(),
});

// File upload response schema
const fileUploadResponseSchema = z.object({
  fileId: z.string(),
  url: z.string().url(),
  contentType: z.enum(SUPPORTED_FILE_TYPES),
  expiresAt: z.date(),
});

type FileUploadResponse = z.infer<typeof fileUploadResponseSchema>;

const filesRouter = new Hono();

export function createFilesRouter(storageService: StorageService): Hono {
  // Generate upload URL for file attachments
  filesRouter.post(
    "/upload",
    zValidator("json", fileUploadRequestSchema),
    async (c) => {
      const { filename, contentType, size } = c.req.valid("json");

      // Get a pre-signed upload URL (valid for 15 minutes)
      const uploadResult = await storageService.generateUploadUrl({
        contentType,
        filename,
        size,
        urlExpirySeconds: 15 * 60, // 15 minutes
      });

      return c.json<FileUploadResponse>({
        fileId: uploadResult.fileId,
        url: uploadResult.url,
        contentType,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      });
    },
  );

  return filesRouter;
}
