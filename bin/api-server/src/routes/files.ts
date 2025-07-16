import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { StorageService } from "../../../../src/storage/StorageService.ts";
import { SUPPORTED_FILE_TYPES } from "../../../../src/message.ts";
import { ApiError } from "../error.ts";

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
  size: z.number().int().positive()
    .lte(1024 * 1024 * 32), // 32MB
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

  // FileId validation schema
  const fileIdSchema = z
    .string()
    .min(1, "File ID is required")
    .max(256, "File ID is too long");

  // File response schema for JSON responses
  const fileResponseSchema = z.object({
    fileId: z.string(),
    url: z.string().url(),
    contentType: z.string(),
    filename: z.string(),
    size: z.number().optional(),
    uploadedAt: z.date().optional(),
  });

  type FileResponse = z.infer<typeof fileResponseSchema>;

  // File access endpoint that returns JSON or redirects to a signed URL
  // This follows the HTTP/2 Server Push deprecation lessons - let clients fetch what they need
  // and properly cache the results rather than pushing everything
  filesRouter.get(
    "/:fileId",
    zValidator("param", z.object({ fileId: fileIdSchema })),
    async (c) => {
      const { fileId } = c.req.valid("param");

      // Check if the file exists and get its metadata
      const metadata = await storageService.getFileMetadata(fileId);
      if (!metadata) {
        throw new ApiError(
          404,
          "file_not_found",
          "File not found, your file may have been deleted or already expired.",
        );
      }

      // Generate a signed URL valid for 1 hour
      const signedUrl = await storageService.getSignedUrl(fileId, 3600);

      // Set cache headers to allow client-side caching but prevent intermediary caching
      // Cache-Control: private allows browsers to cache but CDNs and proxies won't
      c.header("Cache-Control", "private, max-age=3540"); // 59 minutes (slightly less than URL expiry)

      // Check if client wants JSON response
      const acceptHeader = c.req.header("accept") ?? "";
      if (acceptHeader.includes("application/json")) {
        // Return JSON response with file metadata and signed URL
        return c.json<FileResponse>({
          fileId,
          url: signedUrl,
          contentType: metadata.contentType,
          filename: metadata.filename,
          size: metadata.size,
          uploadedAt: metadata.uploadedAt,
        });
      }

      // Default behavior: redirect to the signed URL
      return c.redirect(signedUrl, 302); // 302 Found - temporary redirect
    },
  );

  return filesRouter;
}
