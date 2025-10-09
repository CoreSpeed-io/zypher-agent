import * as path from "@std/path";
import {
  type FileAttachment,
  isFileAttachment,
  type Message,
} from "../message.ts";
import type { StorageService } from "./StorageService.ts";
import { fileExists } from "../utils/mod.ts";
import { getLogger } from "@logtape/logtape";
import { formatError } from "../error.ts";

const logger = getLogger(["zypher", "storage"]);

/**
 * A map of file attachment IDs to their cached file paths and signed URLs
 */
export interface FileAttachmentCacheMap {
  [fileId: string]: FileAttachmentCache;
}

export interface FileAttachmentCache {
  /**
   * The local cache file path for the file attachment, this can be used to read the file from local file system
   */
  cachePath: string;

  /**
   * The signed URL for the file attachment, this can be used to download the file attachment from public internet
   */
  signedUrl: string;
}

export class FileAttachmentManager {
  constructor(
    private readonly storageService: StorageService,
    readonly cacheDir: string,
  ) {}

  /**
   * Retrieves a file attachment from storage service
   * @param fileId ID of the file to retrieve
   * @returns Promise resolving to a FileAttachment object or null if file doesn't exist or isn't supported
   */
  async getFileAttachment(fileId: string): Promise<FileAttachment | null> {
    if (!this.storageService) {
      logger.warn(
        "Unable to get file attachment {fileId} because storage service is not initialized",
        {
          fileId,
        },
      );
      return null;
    }

    // Get metadata and check if the file exists
    const metadata = await this.storageService.getFileMetadata(fileId);
    if (!metadata) {
      logger.error("Metadata for file {fileId} could not be retrieved", {
        fileId,
      });
      return null;
    }

    // Return formatted file attachment
    return {
      type: "file_attachment",
      fileId,
      mimeType: metadata.contentType,
    };
  }

  /**
   * Get the local cache file path for a file attachment
   * @param fileId ID of the file attachment
   * @returns Promise resolving to the cache file path
   */
  getFileAttachmentCachePath(fileId: string): string {
    return path.join(this.cacheDir, fileId);
  }

  /**
   * Caches all file attachments in a messages
   * @param messages The messages to cache file attachments from
   * @returns Promise resolving to a dictionary of file attachment caches
   */
  async cacheMessageFileAttachments(
    messages: Message[],
  ): Promise<FileAttachmentCacheMap> {
    if (!this.storageService) {
      logger.warn(
        "Unable to cache file attachments because storage service is not initialized",
      );
      return {};
    }

    const cacheDict: FileAttachmentCacheMap = {};
    for (const message of messages) {
      for (const block of message.content) {
        if (isFileAttachment(block)) {
          const cache = await this.cacheFileAttachment(block.fileId);
          if (cache) {
            cacheDict[block.fileId] = cache;
          }
        }
      }
    }
    return cacheDict;
  }

  /**
   * Caches a file attachment if it's not already cached if possible
   * @param fileId ID of the file attachment
   * @returns Promise resolving to a FileAttachmentCache object,
   * or null if:
   * - the file ID does not exist on storage service
   * - fails to cache the file attachment
   * - the storage service is not initialized
   */
  async cacheFileAttachment(
    fileId: string,
  ): Promise<FileAttachmentCache | null> {
    if (!this.storageService) {
      logger.warn(
        "Unable to cache file attachment {fileId} because storage service is not initialized",
        {
          fileId,
        },
      );
      return null;
    }

    const cachePath = this.getFileAttachmentCachePath(fileId);
    if (!await fileExists(cachePath)) {
      // Download the file attachment from storage service to cache path
      try {
        await this.storageService.downloadFile(fileId, cachePath);
        logger.debug("Cached file attachment {fileId} at {cachePath}", {
          fileId,
          cachePath,
        });
      } catch (error) {
        logger.error(
          "Failed to cache file attachment {fileId}: {errorMessage}",
          {
            fileId,
            errorMessage: formatError(error),
            error,
          },
        );
        return null;
      }
    }

    return {
      cachePath,
      signedUrl: await this.storageService.getSignedUrl(fileId),
    };
  }
}
