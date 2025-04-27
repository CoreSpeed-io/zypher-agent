import { afterEach, beforeAll, describe, test } from "@std/testing/bdd";
import { expect } from "@std/expect";
import "@std/dotenv/load";
import { S3StorageService } from "../src/storage/S3StorageService.ts";
import { UploadOptions } from "../src/storage/StorageService.ts";

// Skip tests if environment variables are not set
const testCloudflareR2 = !Deno.env.get("CLOUDFLARE_ACCOUNT_ID") ||
  !Deno.env.get("CLOUDFLARE_R2_ACCESS_KEY_ID") ||
  !Deno.env.get("CLOUDFLARE_R2_SECRET_ACCESS_KEY") ||
  !Deno.env.get("CLOUDFLARE_R2_BUCKET_NAME");

const testAwsS3 = !Deno.env.get("AWS_ACCESS_KEY_ID") ||
  !Deno.env.get("AWS_SECRET_ACCESS_KEY") ||
  !Deno.env.get("AWS_BUCKET_NAME") ||
  !Deno.env.get("AWS_REGION");

describe("S3 Storage Integration Tests (S3-compatible)", {
  ignore: testCloudflareR2 && testAwsS3,
}, () => {
  let storageService: S3StorageService;
  const testFileIds: string[] = [];

  // Setup before all tests
  beforeAll(() => {
    let endpoint: string | undefined;
    if (testCloudflareR2) {
      endpoint = Deno.env.get("CLOUDFLARE_R2_CUSTON_DOMAIN")
        ? `https://${Deno.env.get("CLOUDFLARE_R2_CUSTON_DOMAIN")}`
        : `https://${
          Deno.env.get("CLOUDFLARE_ACCOUNT_ID")
        }.r2.cloudflarestorage.com`;
    }

    // Create S3StorageService instance
    storageService = new S3StorageService({
      bucket: Deno.env.get("CLOUDFLARE_R2_BUCKET_NAME")!,
      region: testCloudflareR2 ? "auto" : Deno.env.get("AWS_REGION")!,
      credentials: {
        accessKeyId: Deno.env.get("CLOUDFLARE_R2_ACCESS_KEY_ID")!,
        secretAccessKey: Deno.env.get("CLOUDFLARE_R2_SECRET_ACCESS_KEY")!,
      },
      endpoint: testCloudflareR2 ? endpoint : undefined,
    });
  });

  // Clean up test files after each test
  afterEach(async () => {
    // Delete any test files that were created
    for (const fileId of testFileIds) {
      try {
        await storageService.deleteFile(fileId);
      } catch (error) {
        console.warn(`Failed to delete test file ${fileId}:`, error);
      }
    }
    // Clear the array
    testFileIds.length = 0;
  });

  test("should upload a file from buffer and retrieve its metadata", async () => {
    // Create a test file buffer
    const testContent = "Hello, S3 Storage!";
    const encoder = new TextEncoder();
    const testBuffer = encoder.encode(testContent);

    const uploadOptions: UploadOptions = {
      contentType: "text/plain",
      filename: "test-file.txt",
      metadata: {
        test: "metadata",
        testNumber: 123,
      },
    };

    // Upload the file
    const uploadResult = await storageService.uploadFromBuffer(
      testBuffer,
      uploadOptions,
    );

    // Keep track of file ID for cleanup
    testFileIds.push(uploadResult.id);

    // Verify upload result
    expect(uploadResult.id).toBeDefined();
    expect(uploadResult.url).toBeDefined();
    expect(uploadResult.metadata.contentType).toBe(uploadOptions.contentType);
    expect(uploadResult.metadata.filename).toBe(uploadOptions.filename);
    expect(uploadResult.metadata.size).toBe(testBuffer.length);
    expect(uploadResult.metadata.additionalMetadata?.test).toBe(
      uploadOptions.metadata?.test,
    );
    expect(uploadResult.metadata.additionalMetadata?.testNumber).toBe(
      uploadOptions.metadata?.testNumber,
    );

    // Retrieve metadata
    const metadata = await storageService.getFileMetadata(uploadResult.id);

    // Verify metadata
    expect(metadata).not.toBeNull();
    if (metadata) {
      expect(metadata.filename).toBe(uploadOptions.filename);
      expect(metadata.contentType).toBe(uploadOptions.contentType);
      expect(metadata.size).toBe(testBuffer.length);
      expect(metadata.additionalMetadata?.test).toBe(
        uploadOptions.metadata?.test,
      );
      // We have `testNumber` in the uploadOptions, but it gets converted (lowercase) to `testnumber` in the received metadata
      // This is by design of the S3 protocol, as S3 metadata keys are case-insensitive
      expect(metadata.additionalMetadata?.testnumber).toBe(
        String(uploadOptions.metadata?.testNumber),
      );
    }
  });

  test("should generate pre-signed upload URL and verify file existence", async () => {
    const uploadOptions: UploadOptions = {
      contentType: "application/json",
      filename: "test-data.json",
      urlExpirySeconds: 600, // 10 minutes
    };

    // Generate upload URL
    const result = await storageService.generateUploadUrl(uploadOptions);

    // Keep track of file ID for cleanup
    testFileIds.push(result.fileId);

    // Verify result
    expect(result.url).toBeDefined();
    expect(result.fileId).toBeDefined();

    // For a complete test, you would use fetch to upload to this URL
    // but that's beyond the scope of this integration test

    // Initially the file should not exist yet (since we only generated the URL)
    const existsBefore = await storageService.fileExists(result.fileId);
    expect(existsBefore).toBe(false);

    // We'd need to actually PUT to the URL to make the file exist
    // This is a limitation of the integration test without actually uploading
  });

  test("should upload a file from stream", async () => {
    // Create a test stream
    const testContent = "Streaming content to S3";
    const encoder = new TextEncoder();
    const testBuffer = encoder.encode(testContent);

    // Create a ReadableStream from the buffer
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(testBuffer);
        controller.close();
      },
      type: "bytes",
    });

    const uploadOptions: UploadOptions = {
      contentType: "text/plain",
      filename: "stream-test.txt",
      size: testBuffer.length,
    };

    // Upload from stream
    const uploadResult = await storageService.uploadFile(
      stream,
      uploadOptions,
    );

    // Keep track for cleanup
    testFileIds.push(uploadResult.id);

    // Verify upload result
    expect(uploadResult.id).toBeDefined();
    expect(uploadResult.url).toBeDefined();
    expect(uploadResult.metadata.contentType).toBe(uploadOptions.contentType);
    expect(uploadResult.metadata.filename).toBe(uploadOptions.filename);
    expect(uploadResult.metadata.size).toBe(testBuffer.length);

    // Verify file exists
    const exists = await storageService.fileExists(uploadResult.id);
    expect(exists).toBe(true);
  });

  test("should delete a file and confirm it no longer exists", async () => {
    // Create and upload a test file
    const testContent = "File to be deleted";
    const encoder = new TextEncoder();
    const testBuffer = encoder.encode(testContent);

    const uploadOptions: UploadOptions = {
      contentType: "text/plain",
      filename: "file-to-delete.txt",
    };

    // Upload the file
    const uploadResult = await storageService.uploadFromBuffer(
      testBuffer,
      uploadOptions,
    );
    const fileId = uploadResult.id;

    // Verify file exists
    let exists = await storageService.fileExists(fileId);
    expect(exists).toBe(true);

    // Delete the file
    await storageService.deleteFile(fileId);

    // Verify file no longer exists
    exists = await storageService.fileExists(fileId);
    expect(exists).toBe(false);

    // No need to add to testFileIds since we deleted it ourselves
  });

  test("should generate signed URL for existing file", async () => {
    // Create and upload a test file
    const testContent = "File for signed URL test";
    const encoder = new TextEncoder();
    const testBuffer = encoder.encode(testContent);

    const uploadOptions: UploadOptions = {
      contentType: "text/plain",
      filename: "signed-url-test.txt",
    };

    // Upload the file
    const uploadResult = await storageService.uploadFromBuffer(
      testBuffer,
      uploadOptions,
    );
    testFileIds.push(uploadResult.id);

    // Generate a signed URL with 5 minute expiry
    const signedUrl = await storageService.getSignedUrl(uploadResult.id, 300);

    // Verify signed URL
    console.log("signedUrl", signedUrl);
    expect(signedUrl).not.toBeNull();
    expect(typeof signedUrl).toBe("string");
    // The URL should contain the bucket name and endpoint
    if (testCloudflareR2) {
      expect(signedUrl).toContain(Deno.env.get("CLOUDFLARE_R2_BUCKET_NAME")!);
      expect(signedUrl).toContain("r2.cloudflarestorage.com");
    } else {
      expect(signedUrl).toContain(Deno.env.get("AWS_BUCKET_NAME")!);
      expect(signedUrl).toContain(Deno.env.get("AWS_REGION")!);
    }
  });

  test("should return null for non-existent file operations", async () => {
    const nonExistentFileId = "non-existent-file-id";

    // Check existence
    const exists = await storageService.fileExists(nonExistentFileId);
    expect(exists).toBe(false);

    // Try to get metadata
    const metadata = await storageService.getFileMetadata(nonExistentFileId);
    expect(metadata).toBeNull();

    // Try to get signed URL
    const signedUrl = await storageService.getSignedUrl(nonExistentFileId);
    expect(signedUrl).toBeNull();
  });
});
