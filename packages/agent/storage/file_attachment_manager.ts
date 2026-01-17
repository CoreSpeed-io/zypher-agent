import { exists } from "@std/fs";
import * as path from "@std/path";
import {
  type FileAttachment,
  isFileAttachment,
  type Message,
} from "../message.ts";
import type { StorageService } from "./storage_service.ts";

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
    // Get metadata and check if the file exists
    const metadata = await this.storageService.getFileMetadata(fileId);
    if (!metadata) {
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
   */
  async cacheFileAttachment(
    fileId: string,
  ): Promise<FileAttachmentCache | null> {
    const cachePath = this.getFileAttachmentCachePath(fileId);
    if (!await exists(cachePath)) {
      // Download the file attachment from storage service to cache path
      await this.storageService.downloadFile(fileId, cachePath);
    }

    return {
      cachePath,
      signedUrl: await this.storageService.getSignedUrl(fileId),
    };
  }
}
