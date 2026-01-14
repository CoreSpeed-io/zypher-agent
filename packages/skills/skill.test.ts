/**
 * Unit tests for skill parsing functions.
 * These tests do not require filesystem access.
 */

import { assertEquals, assertExists } from "@std/assert";
import { expect } from "@std/expect";
import { parseFrontmatter, toSkillMetadata } from "./skill.ts";

// parseFrontmatter tests

Deno.test("parseFrontmatter - valid YAML with required fields", () => {
  const content = `---
name: my-skill
description: A test skill
---
# My Skill

Body content here.
`;

  const result = parseFrontmatter(content);
  assertExists(result);
  assertEquals(result.name, "my-skill");
  assertEquals(result.description, "A test skill");
});

Deno.test("parseFrontmatter - all optional fields", () => {
  const content = `---
name: my-skill
description: A test skill
license: MIT
compatibility: Requires Python 3.11+
allowed-tools: Bash(jq:*) Bash(git:*)
---
Body
`;

  const result = parseFrontmatter(content);
  assertExists(result);
  assertEquals(result.name, "my-skill");
  assertEquals(result.description, "A test skill");
  assertEquals(result.license, "MIT");
  assertEquals(result.compatibility, "Requires Python 3.11+");
  assertEquals(result["allowed-tools"], "Bash(jq:*) Bash(git:*)");
});

Deno.test("parseFrontmatter - nested metadata object", () => {
  const content = `---
name: my-skill
description: A test skill
metadata:
  author: Test User
  version: 1.0.0
---
Body
`;

  const result = parseFrontmatter(content);
  assertExists(result);
  assertEquals(result.name, "my-skill");
  assertExists(result.metadata);
  expect(result.metadata).toEqual({ author: "Test User", version: "1.0.0" });
});

Deno.test("parseFrontmatter - no frontmatter returns undefined", () => {
  const content = `# My Skill

No frontmatter here.
`;

  const result = parseFrontmatter(content);
  assertEquals(result, undefined);
});

Deno.test("parseFrontmatter - unclosed frontmatter returns undefined", () => {
  const content = `---
name: my-skill
description: A test skill
`;

  const result = parseFrontmatter(content);
  assertEquals(result, undefined);
});

Deno.test("parseFrontmatter - empty frontmatter returns undefined", () => {
  const content = `---
---
Body
`;

  const result = parseFrontmatter(content);
  assertEquals(result, undefined);
});

// toSkillMetadata tests

Deno.test("toSkillMetadata - valid data", () => {
  const raw = {
    name: "my-skill",
    description: "A test skill",
    license: "MIT",
  };

  const result = toSkillMetadata(raw);
  assertExists(result);
  assertEquals(result.name, "my-skill");
  assertEquals(result.description, "A test skill");
  assertEquals(result.license, "MIT");
});

Deno.test("toSkillMetadata - missing name returns undefined", () => {
  const raw = {
    description: "A test skill",
  };

  const result = toSkillMetadata(raw);
  assertEquals(result, undefined);
});

Deno.test("toSkillMetadata - missing description returns undefined", () => {
  const raw = {
    name: "my-skill",
  };

  const result = toSkillMetadata(raw);
  assertEquals(result, undefined);
});

Deno.test("toSkillMetadata - empty name returns undefined", () => {
  const raw = {
    name: "   ",
    description: "A test skill",
  };

  const result = toSkillMetadata(raw);
  assertEquals(result, undefined);
});

Deno.test("toSkillMetadata - allowed-tools converted to allowedTools", () => {
  const raw = {
    name: "my-skill",
    description: "A test skill",
    "allowed-tools": "Bash(git:*)",
  };

  const result = toSkillMetadata(raw);
  assertExists(result);
  assertEquals(result.allowedTools, "Bash(git:*)");
});
