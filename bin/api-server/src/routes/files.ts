import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { StorageService } from "../../../../src/storage/StorageService.ts";
import { SUPPORTED_ATTACHMENT_TYPES } from "../constants.ts";

// File upload request schema
const fileUploadRequestSchema = z.object({
  filename: z.string().min(1, "Filename is required"),
  contentType: z.enum(SUPPORTED_ATTACHMENT_TYPES, {
    errorMap: () => ({
      message: `File must be one of the supported types: ${
        SUPPORTED_ATTACHMENT_TYPES.join(", ")
      }`,
    }),
  }),
  size: z.number().int().positive().optional(),
});

const filesRouter = new Hono();

export function createFilesRouter(storageService: StorageService): Hono {
  // Generate upload URL for file attachments
  filesRouter.post(
    "/upload-url",
    zValidator("json", fileUploadRequestSchema),
    async (c) => {
      const { filename, contentType, size } = c.req.valid("json");

      // Generate a UUID to use as a temporary file path
      const fileId = crypto.randomUUID();
      const path = `uploads/${fileId}`;

      // Get a pre-signed upload URL (valid for 15 minutes)
      const url = await storageService.generateUploadUrl({
        contentType,
        filename,
        size,
        path,
        urlExpirySeconds: 15 * 60, // 15 minutes
      });

      return c.json({
        fileId: path,
        uploadUrl: url,
        contentType,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      });
    },
  );

  return filesRouter;
}
