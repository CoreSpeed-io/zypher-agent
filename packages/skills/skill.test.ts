/**
 * Unit tests for skill parsing functions.
 * These tests do not require filesystem access.
 *
 * Note: Frontmatter parsing is handled by @std/front-matter and not tested here.
 */

import { assertEquals, assertExists } from "@std/assert";
import { parseSkill, toSkillMetadata } from "./skill.ts";

// parseSkill tests

Deno.test("parseSkill - valid content", () => {
  const content = `---
name: my-skill
description: A test skill
license: MIT
---
# My Skill

Instructions here.
`;

  const result = parseSkill(content);
  assertExists(result);
  assertEquals(result.name, "my-skill");
  assertEquals(result.description, "A test skill");
  assertEquals(result.license, "MIT");
});

Deno.test("parseSkill - invalid frontmatter returns undefined", () => {
  const content = `No frontmatter here`;
  const result = parseSkill(content);
  assertEquals(result, undefined);
});

Deno.test("parseSkill - missing required fields returns undefined", () => {
  const content = `---
name: my-skill
---
Missing description.
`;

  const result = parseSkill(content);
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
