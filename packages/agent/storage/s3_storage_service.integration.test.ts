// deno-lint-ignore-file no-console -- Test file uses console for debugging output
import { afterEach, beforeAll, describe, test } from "@std/testing/bdd";
import { expect } from "@std/expect";
import { assertRejects } from "@std/assert";
import "@std/dotenv/load";
import { S3StorageService } from "./s3_storage_service.ts";
import type { UploadOptions } from "./storage_service.ts";
import { FileNotFoundError } from "./storage_errors.ts";

// Skip tests if environment variables are not set
const skipTests = !Deno.env.get("S3_ACCESS_KEY_ID") ||
  !Deno.env.get("S3_SECRET_ACCESS_KEY") ||
  !Deno.env.get("S3_REGION") ||
  !Deno.env.get("S3_BUCKET_NAME");

describe("S3 Storage Integration Tests (S3-compatible)", {
  ignore: skipTests,
}, () => {
  let storageService: S3StorageService;
  const testFileIds: string[] = [];

  // Setup before all tests
  beforeAll(() => {
    // Create S3StorageService instance
    storageService = new S3StorageService({
      bucket: Deno.env.get("S3_BUCKET_NAME")!,
      region: Deno.env.get("S3_REGION")!,
      credentials: {
        accessKeyId: Deno.env.get("S3_ACCESS_KEY_ID")!,
        secretAccessKey: Deno.env.get("S3_SECRET_ACCESS_KEY")!,
      },
      endpoint: Deno.env.get("S3_ENDPOINT") || undefined,
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
    // Prepare test content to upload
    const testContent = JSON.stringify({ test: "data", value: 123 });

    const uploadOptions: UploadOptions = {
      contentType: "application/json",
      filename: "test-data.json",
      urlExpirySeconds: 600, // 10 minutes
    };

    // Generate pre-signed upload URL
    const result = await storageService.generateUploadUrl(uploadOptions);

    // Keep track of file ID for cleanup
    testFileIds.push(result.fileId);

    // Verify result format
    expect(result.url).toBeDefined();
    expect(result.fileId).toBeDefined();

    // Initially the file should not exist yet (since we only generated the URL)
    const existsBefore = await storageService.fileExists(result.fileId);
    expect(existsBefore).toBe(false);

    // Actually upload to the pre-signed URL using PUT
    const putResponse = await fetch(result.url, {
      method: "PUT",
      headers: {
        "Content-Type": uploadOptions.contentType,
      },
      body: testContent,
    });

    // Verify upload was successful
    expect(putResponse.ok).toBe(true);
    await putResponse.body!.cancel();

    // Now the file should exist
    const existsAfter = await storageService.fileExists(result.fileId);
    expect(existsAfter).toBe(true);

    // Verify we can access the uploaded content
    const signedUrl = await storageService.getSignedUrl(result.fileId);
    const getResponse = await fetch(signedUrl!);
    expect(getResponse.ok).toBe(true);

    // Verify the content is what we uploaded
    const retrievedContent = await getResponse.text();
    expect(retrievedContent).toBe(testContent);

    // Create an unsigned URL to verify access control is working
    const unsignedUrl = new URL(signedUrl!);
    unsignedUrl.search = "";

    // Verify that the unsigned URL results in access denial
    const unsignedResponse = await fetch(unsignedUrl.toString());
    expect(unsignedResponse.ok).toBe(false);
    expect(unsignedResponse.status).toBe(403); // Access Denied
    await unsignedResponse.body?.cancel();
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

    // Verify signed URL format
    expect(signedUrl).not.toBeNull();
    expect(typeof signedUrl).toBe("string");

    // Verify that the properly signed URL grants access
    const response = await fetch(signedUrl!);
    expect(response.ok).toBe(true);
    expect(await response.text()).toBe(testContent);

    // Create an unsigned URL by removing the query parameters that contain signing information
    const unsignedUrl = new URL(signedUrl!);
    unsignedUrl.search = "";

    // Verify that the unsigned URL results in access denial (without pre-signed params)
    const unsignedResponse = await fetch(unsignedUrl.toString());
    // AWS S3 returns 403 Forbidden for unsigned URLs
    expect(unsignedResponse.ok).toBe(false);
    expect(unsignedResponse.status).toBe(403);
    await unsignedResponse.body?.cancel();
  });

  test("should use custom domain for signed URL when configured", async () => {
    // Only run this test if custom domain is configured
    if (!Deno.env.get("S3_CUSTOM_DOMAIN")) {
      console.log("Skipping custom domain test - S3_CUSTOM_DOMAIN not set");
      return;
    }

    const customDomain = Deno.env.get("S3_CUSTOM_DOMAIN")!;

    // Create a separate S3StorageService instance with custom domain
    const customDomainStorage = new S3StorageService({
      bucket: Deno.env.get("S3_BUCKET_NAME")!,
      region: Deno.env.get("S3_REGION")!,
      credentials: {
        accessKeyId: Deno.env.get("S3_ACCESS_KEY_ID")!,
        secretAccessKey: Deno.env.get("S3_SECRET_ACCESS_KEY")!,
      },
      endpoint: Deno.env.get("S3_ENDPOINT") || undefined,
      customDomain,
    });

    // Create and upload a test file
    const testContent = "Custom domain test content";
    const encoder = new TextEncoder();
    const testBuffer = encoder.encode(testContent);

    const uploadOptions: UploadOptions = {
      contentType: "text/plain",
      filename: "custom-domain-test.txt",
    };

    // Upload the file using the custom domain service
    const uploadResult = await customDomainStorage.uploadFromBuffer(
      testBuffer,
      uploadOptions,
    );

    // Keep track for cleanup
    testFileIds.push(uploadResult.id);

    // Verify the upload result has a URL with custom domain
    expect(uploadResult.url).toBeDefined();
    expect(uploadResult.url).toContain(customDomain);

    // Also test generateUploadUrl functionality
    const presignedUploadResult = await customDomainStorage.generateUploadUrl(
      uploadOptions,
    );
    expect(presignedUploadResult.url).toContain(customDomain);
    testFileIds.push(presignedUploadResult.fileId); // track for cleanup

    // Generate a signed URL for an existing file with 5 minute expiry
    const signedUrl = await customDomainStorage.getSignedUrl(
      uploadResult.id,
      300,
    );

    // Verify signed URL uses custom domain
    expect(signedUrl).not.toBeNull();
    expect(typeof signedUrl).toBe("string");
    expect(signedUrl).toContain(customDomain);

    // Verify that the signed URL grants access
    const response = await fetch(signedUrl!);
    expect(response.ok).toBe(true);
    expect(await response.text()).toBe(testContent);

    // Create an unsigned URL by removing the query parameters that contain signing information
    const unsignedUrl = new URL(signedUrl!);
    unsignedUrl.search = "";

    // Verify that the unsigned URL results in access denial (without pre-signed params)
    const unsignedResponse = await fetch(unsignedUrl.toString());
    // AWS S3 returns 403 Forbidden for unsigned URLs
    expect(unsignedResponse.ok).toBe(false);
    expect(unsignedResponse.status).toBe(403);
  });

  test("should return null for non-existent file operations", async () => {
    const nonExistentFileId = "non-existent-file-id";

    // Check existence
    const exists = await storageService.fileExists(nonExistentFileId);
    expect(exists).toBe(false);

    // Try to get metadata
    const metadata = await storageService.getFileMetadata(nonExistentFileId);
    expect(metadata).toBeNull();
  });

  test("should throw FileNotFoundError when trying to download a non-existent file", async () => {
    const nonExistentFileId = "non-existent-file-id";
    const tempDir = await Deno.makeTempDir();
    const destinationPath = `${tempDir}/non-existent-file.txt`;

    try {
      await assertRejects(
        async () => {
          await storageService.downloadFile(nonExistentFileId, destinationPath);
        },
        FileNotFoundError,
      );
    } finally {
      // Clean up the temporary directory
      await Deno.remove(tempDir, { recursive: true });
    }
  });

  test("should download a file to a local destination", async () => {
    // Create a test file buffer with content
    const testContent = "Hello, this is a file to download!";
    const encoder = new TextEncoder();
    const testBuffer = encoder.encode(testContent);

    const uploadOptions: UploadOptions = {
      contentType: "text/plain",
      filename: "download-test.txt",
    };

    // Upload the file first
    const uploadResult = await storageService.uploadFromBuffer(
      testBuffer,
      uploadOptions,
    );

    // Keep track of file ID for cleanup
    testFileIds.push(uploadResult.id);

    // Create a temporary destination path
    const tempDir = await Deno.makeTempDir();
    const destinationPath = `${tempDir}/downloaded-file.txt`;

    try {
      // Download the file
      await storageService.downloadFile(uploadResult.id, destinationPath);

      // Verify the file exists
      const fileInfo = await Deno.stat(destinationPath);
      expect(fileInfo.isFile).toBe(true);

      // Read the downloaded file
      const downloadedContent = await Deno.readTextFile(destinationPath);

      // Verify content matches what we uploaded
      expect(downloadedContent).toBe(testContent);
    } finally {
      // Clean up the temporary directory
      try {
        await Deno.remove(tempDir, { recursive: true });
      } catch (error) {
        console.warn(`Failed to delete temp directory ${tempDir}:`, error);
      }
    }
  });
});
