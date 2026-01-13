/**
 * Tests for skill parsing functions.
 */

import { assertEquals, assertExists } from "@std/assert";
import { expect } from "@std/expect";
import { join } from "@std/path";
import {
  findSkillMd,
  parseFrontmatter,
  readSkill,
  toSkillMetadata,
} from "./skill.ts";

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

Deno.test("parseFrontmatter - no frontmatter returns null", () => {
  const content = `# My Skill

No frontmatter here.
`;

  const result = parseFrontmatter(content);
  assertEquals(result, null);
});

Deno.test("parseFrontmatter - unclosed frontmatter returns null", () => {
  const content = `---
name: my-skill
description: A test skill
`;

  const result = parseFrontmatter(content);
  assertEquals(result, null);
});

Deno.test("parseFrontmatter - empty frontmatter returns null", () => {
  const content = `---
---
Body
`;

  const result = parseFrontmatter(content);
  assertEquals(result, null);
});

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

Deno.test("toSkillMetadata - missing name returns null", () => {
  const raw = {
    description: "A test skill",
  };

  const result = toSkillMetadata(raw);
  assertEquals(result, null);
});

Deno.test("toSkillMetadata - missing description returns null", () => {
  const raw = {
    name: "my-skill",
  };

  const result = toSkillMetadata(raw);
  assertEquals(result, null);
});

Deno.test("toSkillMetadata - empty name returns null", () => {
  const raw = {
    name: "   ",
    description: "A test skill",
  };

  const result = toSkillMetadata(raw);
  assertEquals(result, null);
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

Deno.test("findSkillMd - finds uppercase SKILL.md", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    // Create uppercase file
    await Deno.writeTextFile(join(tmpDir, "SKILL.md"), "content");

    const result = await findSkillMd(tmpDir);
    assertExists(result);
    // On case-insensitive filesystems (macOS), path may differ in case
    expect(result.toLowerCase()).toContain("skill.md");
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("findSkillMd - finds lowercase skill.md", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    // Only create lowercase
    await Deno.writeTextFile(join(tmpDir, "skill.md"), "lowercase");

    const result = await findSkillMd(tmpDir);
    assertExists(result);
    // On case-insensitive filesystems (macOS), path may differ in case
    expect(result.toLowerCase()).toContain("skill.md");
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("findSkillMd - returns null when not found", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const result = await findSkillMd(tmpDir);
    assertEquals(result, null);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("readSkill - valid skill directory", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(
      join(tmpDir, "SKILL.md"),
      `---
name: test-skill
description: A test skill
license: MIT
---
# Test Skill
`,
    );

    const result = await readSkill(tmpDir);
    assertExists(result);
    assertEquals(result.metadata.name, "test-skill");
    assertEquals(result.metadata.description, "A test skill");
    assertEquals(result.metadata.license, "MIT");
    expect(result.location).toContain("SKILL.md");
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("readSkill - returns null for missing SKILL.md", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const result = await readSkill(tmpDir);
    assertEquals(result, null);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("readSkill - returns null for invalid frontmatter", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(
      join(tmpDir, "SKILL.md"),
      `# No frontmatter here`,
    );

    const result = await readSkill(tmpDir);
    assertEquals(result, null);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});
