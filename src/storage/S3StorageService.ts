import type {
  AttachmentMetadata,
  GenerateUploadUrlResult,
  StorageService,
  UploadOptions,
  UploadResult,
} from "./StorageService.ts";
import { FileNotFoundError } from "./StorageErrors.ts";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  type HeadObjectCommandOutput,
  NoSuchKey,
  NotFound,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { generateFileId } from "./utils.ts";
import { ensureDir } from "@std/fs";
import * as path from "@std/path";

/**
 * S3-specific provider options
 */
export interface S3Options {
  bucket: string;
  region: string;
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
  };
  endpoint?: string;

  /**
   * Custom domain for the pre-signed URL
   * This will not affect the actual file operations in S3 SDK
   *
   * After pre-signed URL is generated, the host will be replaced with this custom domain.
   */
  customDomain?: string;
}

/**
 * Implementation of StorageService that uses AWS S3 for storage
 */
export class S3StorageService implements StorageService {
  readonly #s3Client: S3Client;
  readonly #bucket: string;
  readonly #customDomain?: string;

  constructor(s3Options: S3Options) {
    this.#bucket = s3Options.bucket;
    this.#customDomain = s3Options.customDomain;

    // Validate required options
    if (!s3Options.bucket) {
      throw new Error("S3 bucket name is required");
    }
    if (!s3Options.region) {
      throw new Error("S3 region is required");
    }

    // Initialize S3 client configuration
    const clientConfig: S3ClientConfig = {
      region: s3Options.region,
      endpoint: s3Options.endpoint,
    };

    // Only add credentials if provided, otherwise let S3Client use default credential chain
    if (s3Options.credentials) {
      clientConfig.credentials = s3Options.credentials;
    }

    // Initialize S3 client
    this.#s3Client = new S3Client(clientConfig);
  }

  /**
   * Convert S3 object metadata to attachment metadata
   */
  #objectToMetadata(
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
    // Generate a unique key for this upload
    const key = await generateFileId();

    // Prepare metadata (S3 only supports string values)
    const metadata: Record<string, string> = {
      "original-filename": options.filename,
    };

    if (options.metadata) {
      Object.entries(options.metadata).forEach(([k, v]) => {
        metadata[k] = String(v);
      });
    }

    let size: number | undefined = options.size;

    // For streams, use the size provided in options if available, then do multipart upload
    // This ensures we maintain the correct size from the original buffer
    const streamSize = await this.#uploadStreamMultipart(data, {
      key,
      contentType: options.contentType,
      metadata,
    });

    // Prefer the size from options if provided, otherwise use calculated size from stream
    size = options.size ?? streamSize;

    // Generate a pre‑signed URL so the caller can access the file
    const url = await this.getSignedUrl(key, options.urlExpirySeconds);
    if (!url) {
      throw new Error(
        "Failed to generate pre-signed URL. File should have been uploaded successfully but not found in S3.",
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
        size,
        uploadedAt: new Date(),
        additionalMetadata: options.metadata,
      },
    };
  }

  /**
   * Upload a ReadableStream using S3 multipart upload
   * @private
   */
  async #uploadStreamMultipart(
    stream: ReadableStream<Uint8Array>,
    options: {
      key: string;
      contentType?: string;
      metadata?: Record<string, string>;
    },
  ): Promise<number> {
    // Step 1: Create a multipart upload
    const createMultipartResponse = await this.#s3Client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.#bucket,
        Key: options.key,
        ContentType: options.contentType,
        Metadata: options.metadata,
      }),
    );

    const uploadId = createMultipartResponse.UploadId;
    if (!uploadId) {
      throw new Error("Failed to initiate multipart upload");
    }

    try {
      // Step 2: Upload parts - 5MB minimum part size for S3
      const PART_SIZE = 5 * 1024 * 1024; // 5MB in bytes
      const reader = stream.getReader();
      const parts: { ETag: string; PartNumber: number }[] = [];
      let partNumber = 1;
      let currentBuffer = new Uint8Array(0);
      let totalSize = 0;

      let done = false;
      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;

        if (value) {
          // Append the new chunk to our buffer
          const newBuffer = new Uint8Array(currentBuffer.length + value.length);
          newBuffer.set(currentBuffer);
          newBuffer.set(value, currentBuffer.length);
          currentBuffer = newBuffer;
          totalSize += value.length;
        }

        // Upload a part when we reach the minimum part size or when stream is done
        if (
          currentBuffer.length >= PART_SIZE ||
          (done && currentBuffer.length > 0)
        ) {
          const uploadPartResponse = await this.#s3Client.send(
            new UploadPartCommand({
              Bucket: this.#bucket,
              Key: options.key,
              UploadId: uploadId,
              PartNumber: partNumber,
              Body: currentBuffer,
              ContentLength: currentBuffer.length,
            }),
          );

          if (!uploadPartResponse.ETag) {
            throw new Error(`Failed to upload part ${partNumber}`);
          }

          parts.push({
            ETag: uploadPartResponse.ETag,
            PartNumber: partNumber,
          });

          partNumber++;
          currentBuffer = new Uint8Array(0);
        }
      }

      // Step 3: Complete the multipart upload
      await this.#s3Client.send(
        new CompleteMultipartUploadCommand({
          Bucket: this.#bucket,
          Key: options.key,
          UploadId: uploadId,
          MultipartUpload: { Parts: parts },
        }),
      );

      return totalSize;
    } catch (error) {
      // Abort the multipart upload on failure
      await this.#s3Client.send(
        new AbortMultipartUploadCommand({
          Bucket: this.#bucket,
          Key: options.key,
          UploadId: uploadId,
        }),
      );
      throw error;
    }
  }

  async uploadFromBuffer(
    buffer: Uint8Array,
    options: UploadOptions,
  ): Promise<UploadResult> {
    const key = await generateFileId();

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
      Bucket: this.#bucket,
      Key: key,
      Body: buffer,
      ContentType: options.contentType,
      ContentLength: buffer.length,
      Metadata: metadata,
    });

    await this.#s3Client.send(command);

    // Generate URL
    const url = await this.getSignedUrl(key, options.urlExpirySeconds);
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

  async downloadFile(fileId: string, destinationPath: string): Promise<void> {
    const command = new GetObjectCommand({
      Bucket: this.#bucket,
      Key: fileId,
    });

    let bodyStream: ReadableStream<Uint8Array> | null = null;
    try {
      const response = await this.#s3Client.send(command);
      const body = response.Body;
      if (!body) {
        throw new FileNotFoundError(fileId);
      }

      bodyStream = body.transformToWebStream();

      await ensureDir(path.dirname(destinationPath));
      const fileWriter = await Deno.open(destinationPath, {
        write: true,
        create: true,
      });
      await bodyStream.pipeTo(fileWriter.writable);
    } catch (error) {
      if (error instanceof NoSuchKey || error instanceof NotFound) {
        throw new FileNotFoundError(fileId);
      }
      throw error;
    } finally {
      await bodyStream?.cancel();
    }
  }

  /**
   * Generate a pre-signed URL for an S3 command and apply custom domain if configured
   * @private
   */
  async #generateSignedUrl(
    command: GetObjectCommand | PutObjectCommand,
    expirySeconds = 3600,
  ): Promise<string> {
    // Generate a pre-signed URL that is valid for the specified duration
    let signedUrl = await getSignedUrl(this.#s3Client, command, {
      expiresIn: expirySeconds,
    });

    // Apply custom domain if configured
    if (this.#customDomain) {
      // Replace the host part of the URL with the custom domain
      const urlObj = new URL(signedUrl);
      urlObj.host = this.#customDomain;
      signedUrl = urlObj.toString();
    }

    return signedUrl;
  }

  async getSignedUrl(
    fileId: string,
    expirySeconds = 3600,
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.#bucket,
      Key: fileId,
    });

    return await this.#generateSignedUrl(command, expirySeconds);
  }

  /**
   * Generate a pre-signed URL for direct file upload to S3
   */
  async generateUploadUrl(
    options: UploadOptions,
  ): Promise<GenerateUploadUrlResult> {
    // Generate a unique key for this upload
    const key = await generateFileId();

    // Prepare metadata
    const metadata: Record<string, string> = {
      "original-filename": options.filename,
    };

    if (options.metadata) {
      Object.entries(options.metadata).forEach(([k, v]) => {
        metadata[k] = String(v);
      });
    }

    // Create a PutObject command
    const command = new PutObjectCommand({
      Bucket: this.#bucket,
      Key: key,
      ContentType: options.contentType,
      ContentLength: options.size,
      Metadata: metadata,
    });

    // Generate a pre-signed URL for PUT operation
    const signedUrl = await this.#generateSignedUrl(
      command,
      options.urlExpirySeconds ?? 3600,
    );

    return {
      url: signedUrl,
      fileId: key,
    };
  }

  async getFileMetadata(fileId: string): Promise<AttachmentMetadata | null> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.#bucket,
        Key: fileId,
      });

      const response = await this.#s3Client.send(command);
      return this.#objectToMetadata(fileId, response);
    } catch (error) {
      if (error instanceof NoSuchKey || error instanceof NotFound) {
        return null;
      }
      throw error;
    }
  }

  async deleteFile(fileId: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.#bucket,
      Key: fileId,
    });

    await this.#s3Client.send(command);
  }

  async fileExists(fileId: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.#bucket,
        Key: fileId,
      });

      await this.#s3Client.send(command);
      return true;
    } catch (error) {
      if (error instanceof NoSuchKey || error instanceof NotFound) {
        return false;
      }
      throw error;
    }
  }
}
