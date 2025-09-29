import { assertEquals } from "@std/assert";
import { JsonMessageHistoryRepository } from "../src/message/JsonMessageHistoryRepository.ts";
import type { Message } from "../src/message/Message.ts";
import { createZypherContext } from "../src/utils/mod.ts";

// Test workspace directory - use temp directory from Deno API
const TEST_DATA_DIR = () => Deno.makeTempDirSync({ prefix: "zypher-test-" });

// Helper function to create test messages
function createTestMessage(role: "user" | "assistant", text: string): Message {
  return {
    role,
    content: [{ type: "text", text }],
    timestamp: new Date(),
  };
}

// Helper function to clean up test directory
async function cleanupTestDir(testDir: string) {
  try {
    await Deno.remove(testDir, { recursive: true });
  } catch {
    // Directory might not exist, ignore
  }
}

Deno.test("JsonMessageHistoryRepository - basic operations", async () => {
  const testDir = TEST_DATA_DIR();
  const workingDirectory = "/test/workspace";

  const context = await createZypherContext(workingDirectory, testDir);
  const repository = new JsonMessageHistoryRepository(context);

  // Test loading empty history
  const emptyHistory = await repository.load();
  assertEquals(emptyHistory, []);

  // Test saving and loading messages
  const messages: Message[] = [
    createTestMessage("user", "Hello"),
    createTestMessage("assistant", "Hi there!"),
  ];

  await repository.save(messages);

  const loadedMessages = await repository.load();
  assertEquals(loadedMessages.length, 2);
  assertEquals(loadedMessages[0].role, "user");
  assertEquals(loadedMessages[1].role, "assistant");

  // Test clearing messages
  await repository.clear();
  const clearedHistory = await repository.load();
  assertEquals(clearedHistory, []);

  await cleanupTestDir(testDir);
});

Deno.test("JsonMessageHistoryRepository - working directory consistency", async () => {
  const testDir = TEST_DATA_DIR();

  const workingDir1 = "/Users/test/project";
  const workingDir2 = "/Users/test/other-project";

  // Create separate contexts for each working directory
  const context1 = await createZypherContext(workingDir1, testDir);
  const context2 = await createZypherContext(workingDir2, testDir);
  const repository1 = new JsonMessageHistoryRepository(context1);
  const repository2 = new JsonMessageHistoryRepository(context2);

  // Test that the same working directory produces consistent results
  const message1 = createTestMessage("user", "Test 1");
  await repository1.save([message1]);

  const loaded1 = await repository1.load();
  assertEquals(loaded1.length, 1);

  // Test that different working directories are isolated
  const message2 = createTestMessage("user", "Test 2");
  await repository2.save([message2]);

  const loaded2 = await repository2.load();
  assertEquals(loaded2.length, 1);

  // First workspace should still have its data
  const reloaded1 = await repository1.load();
  assertEquals(reloaded1.length, 1);

  await cleanupTestDir(testDir);
});

Deno.test("JsonMessageHistoryRepository - invalid working directory", async () => {
  const testDir = TEST_DATA_DIR();
  const workingDirectory = "../invalid";

  // Test that problematic working directories are handled gracefully
  // This will create a context but the actual path operations might fail gracefully
  const context = await createZypherContext(workingDirectory, testDir);
  const repository = new JsonMessageHistoryRepository(context);

  // load() returns empty array for problematic directories (graceful degradation)
  const result = await repository.load();
  assertEquals(result, []);

  // save() also handles problematic directories gracefully (logs warning but doesn't throw)
  // This is safer for production usage
  await repository.save([]); // Should not throw, just warn
});
