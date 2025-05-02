/**
 * Represents attachment metadata for files stored in remote storage
 */
export interface AttachmentMetadata {
  /** Original filename provided by user */
  filename: string;
  /** MIME type of the attachment */
  contentType: string;
  /** Size of the file in bytes */
  size?: number;
  /** Timestamp when the file was uploaded */
  uploadedAt: Date;
  /** Any additional metadata that might be storage-provider specific */
  additionalMetadata?: Record<string, unknown>;
}

/**
 * Result of a successful file upload
 */
export interface UploadResult {
  /** Unique identifier for the file within the storage system */
  id: string;
  /** URL that can be used to access the file */
  url: string;
  /** When the URL will expire, if applicable */
  expiresAt?: Date;
  /** Metadata about the uploaded file */
  metadata: AttachmentMetadata;
}

/**
 * Options for uploading a file
 */
export interface UploadOptions {
  /** Content type (MIME type) of the file */
  contentType: string;
  /** Original filename */
  filename: string;
  /** Size of the file in bytes */
  size?: number;
  /** How long the URL should be valid for (in seconds) */
  urlExpirySeconds?: number;
  /** Additional metadata to store with the file */
  metadata?: Record<string, unknown>;
}

/**
 * Result of generating a pre-signed upload URL
 */
export interface GenerateUploadUrlResult {
  /** The pre-signed URL for uploading */
  url: string;
  /** The file ID that will be assigned to the uploaded file */
  fileId: string;
}

/**
 * Abstract interface for file storage services
 */
export interface StorageService {
  /**
   * Upload file data to storage using streams
   * @param data ReadableStream containing the file data
   * @param options Upload options
   * @returns Promise resolving to upload result with access URL
   */
  uploadFile(
    data: ReadableStream<Uint8Array>,
    options: UploadOptions,
  ): Promise<UploadResult>;

  /**
   * Upload file data from a buffer (for backward compatibility and small files)
   * @param buffer The file data as a Buffer or Uint8Array
   * @param options Upload options
   * @returns Promise resolving to upload result with access URL
   */
  uploadFromBuffer(
    buffer: Uint8Array,
    options: UploadOptions,
  ): Promise<UploadResult>;

  /**
   * Download a file from storage
   * @param fileId ID of the file to download
   * @param destinationPath Path to save the downloaded file
   * @throws {FileNotFoundError} When the requested file does not exist or expired
   * @returns Promise that resolves when the file has been successfully downloaded
   */
  downloadFile(fileId: string, destinationPath: string): Promise<void>;

  /**
   * Generate a pre-signed URL for accessing a previously uploaded file
   * @param fileId ID of the file to generate URL for
   * @param expirySeconds How long the URL should be valid (in seconds)
   * @returns Promise resolving to a pre-signed URL that is publicly accessible from the **internet** for the specified duration.
   */
  getSignedUrl(fileId: string, expirySeconds?: number): Promise<string>;

  /**
   * Generate a pre-signed URL for directly uploading a file to storage
   * @param options Upload options
   * @returns Promise resolving to a pre-signed URL and file ID that can be used to upload and later reference the file
   */
  generateUploadUrl(options: UploadOptions): Promise<GenerateUploadUrlResult>;

  /**
   * Get metadata for a file
   * @param fileId ID of the file to get metadata for
   * @returns Promise resolving to file metadata, or null if the file ID does not exist
   */
  getFileMetadata(fileId: string): Promise<AttachmentMetadata | null>;

  /**
   * Delete a file from storage
   * @param fileId ID of the file to delete
   * @returns Promise resolving when deletion is complete
   */
  deleteFile(fileId: string): Promise<void>;

  /**
   * Check if a file exists in storage
   * @param fileId ID of the file to check
   * @returns Promise resolving to boolean indicating if file exists
   */
  fileExists(fileId: string): Promise<boolean>;
}
