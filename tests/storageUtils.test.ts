import { assertNotEquals } from "@std/assert";
import { generateFileId } from "../src/storage/utils.ts";

Deno.test("generateFileId - generates unique ids when called multiple times", () => {
  const fileId1 = generateFileId();
  const fileId2 = generateFileId();
  const fileId3 = generateFileId();

  assertNotEquals(fileId1, fileId2, "Generated IDs are not unique");
  assertNotEquals(fileId1, fileId3, "Generated IDs are not unique");
  assertNotEquals(fileId2, fileId3, "Generated IDs are not unique");
});
