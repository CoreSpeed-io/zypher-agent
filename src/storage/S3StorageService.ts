import {
  AttachmentMetadata,
  StorageService,
  UploadOptions,
  UploadResult,
} from "./StorageService.ts";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  HeadObjectCommandOutput,
  NoSuchKey,
  NotFound,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import * as uuid from "@std/uuid";
import * as path from "@std/path";

/**
 * S3-specific provider options
 */
interface S3Options {
  bucket: string;
  region: string;
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
  };
  endpoint?: string;
}

/**
 * Implementation of StorageService that uses AWS S3 for storage
 */
export class S3StorageService implements StorageService {
  private readonly s3Client: S3Client;
  private readonly bucket: string;

  constructor(s3Options: S3Options) {
    this.bucket = s3Options.bucket;

    // Validate required options
    if (!s3Options.bucket) {
      throw new Error("S3 bucket name is required");
    }
    if (!s3Options.region) {
      throw new Error("S3 region is required");
    }
    if (
      !s3Options.credentials?.accessKeyId ||
      !s3Options.credentials?.secretAccessKey
    ) {
      throw new Error(
        "S3 credentials (accessKeyId and secretAccessKey) are required",
      );
    }

    // Initialize S3 client
    this.s3Client = new S3Client({
      region: s3Options.region,
      credentials: {
        accessKeyId: s3Options.credentials.accessKeyId,
        secretAccessKey: s3Options.credentials.secretAccessKey,
      },
      endpoint: s3Options.endpoint,
    });
  }

  /**
   * Generate a unique key for S3 storage
   */
  private generateKey(options: UploadOptions): string {
    const name = new TextEncoder().encode("usercontent.deckspeed.com");
    const id = uuid.v5.generate(uuid.NAMESPACE_DNS, name);
    const basePath = options.path ?? "";
    return path.join(basePath, id);
  }

  /**
   * Convert S3 object metadata to attachment metadata
   */
  private objectToMetadata(
    key: string,
    headOutput: HeadObjectCommandOutput,
  ): AttachmentMetadata {
    const originalFilename = headOutput.Metadata?.["original-filename"] ??
      key.split("/").pop() ?? "unknown";

    return {
      filename: originalFilename,
      contentType: headOutput.ContentType || "application/octet-stream",
      size: headOutput.ContentLength,
      uploadedAt: headOutput.LastModified || new Date(0),
      additionalMetadata: {
        etag: headOutput.ETag,
        ...headOutput.Metadata,
      },
    };
  }

  async uploadFile(
    data: ReadableStream<Uint8Array>,
    options: UploadOptions,
  ): Promise<UploadResult> {
    // Stream the file directly to S3 without loading it fully into memory
    const key = this.generateKey(options);

    // Prepare metadata (S3 only supports string values)
    const metadata: Record<string, string> = {
      "original-filename": options.filename,
    };

    if (options.metadata) {
      Object.entries(options.metadata).forEach(([k, v]) => {
        metadata[k] = String(v);
      });
    }

    // Prepare the command with the stream as the Body
    // If the caller knows the size up‑front, pass it so S3 can use Content‑Length.
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: data,
      ContentType: options.contentType,
      ContentLength: options.size, // may be undefined – S3 will fall back to chunked transfer
      Metadata: metadata,
    });

    await this.s3Client.send(command);

    // Generate a pre‑signed URL so the caller can access the file
    const url = await this.getFileUrl(key, options.urlExpirySeconds);
    if (!url) {
      throw new Error(
        "Failed to generate pre‑signed URL. File should have been uploaded successfully but not found in S3.",
      );
    }

    return {
      id: key,
      url,
      expiresAt: options.urlExpirySeconds
        ? new Date(Date.now() + options.urlExpirySeconds * 1000)
        : undefined,
      metadata: {
        filename: options.filename,
        contentType: options.contentType,
        size: options.size,
        uploadedAt: new Date(),
        additionalMetadata: options.metadata,
      },
    };
  }

  async uploadFromBuffer(
    buffer: Uint8Array,
    options: UploadOptions,
  ): Promise<UploadResult> {
    const key = this.generateKey(options);

    // Prepare metadata
    const metadata: Record<string, string> = {
      "original-filename": options.filename,
    };

    if (options.metadata) {
      // Convert metadata values to strings as S3 metadata only supports string values
      Object.entries(options.metadata).forEach(([k, v]) => {
        metadata[k] = String(v);
      });
    }

    // Upload to S3
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: options.contentType,
      ContentLength: buffer.length,
      Metadata: metadata,
    });

    await this.s3Client.send(command);

    // Generate URL
    const url = await this.getFileUrl(key, options.urlExpirySeconds);
    if (!url) {
      throw new Error(
        "Failed to generate pre‑signed URL. File should have been uploaded successfully but not found in S3.",
      );
    }

    return {
      id: key,
      url,
      expiresAt: options.urlExpirySeconds
        ? new Date(Date.now() + options.urlExpirySeconds * 1000)
        : undefined,
      metadata: {
        filename: options.filename,
        contentType: options.contentType,
        size: buffer.length,
        uploadedAt: new Date(),
        additionalMetadata: options.metadata,
      },
    };
  }

  async getFileUrl(
    fileId: string,
    expirySeconds = 3600,
  ): Promise<string | null> {
    try {
      // Check if file exists
      const exists = await this.fileExists(fileId);
      if (!exists) {
        return null;
      }

      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: fileId,
      });

      // Generate a pre-signed URL that is valid for the specified duration
      const signedUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn: expirySeconds,
      });

      return signedUrl;
    } catch (error) {
      if (error instanceof NoSuchKey || error instanceof NotFound) {
        return null;
      }
      throw error;
    }
  }

  async getFileMetadata(fileId: string): Promise<AttachmentMetadata | null> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: fileId,
      });

      const response = await this.s3Client.send(command);
      return await this.objectToMetadata(fileId, response);
    } catch (error) {
      if (error instanceof NoSuchKey || error instanceof NotFound) {
        return null;
      }
      throw error;
    }
  }

  async deleteFile(fileId: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: fileId,
    });

    await this.s3Client.send(command);
  }

  async fileExists(fileId: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: fileId,
      });

      await this.s3Client.send(command);
      return true;
    } catch (error) {
      if (error instanceof NoSuchKey || error instanceof NotFound) {
        return false;
      }
      throw error;
    }
  }
}
