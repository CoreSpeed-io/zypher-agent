/**
 * Tests for skill parsing functions.
 */

import { assertEquals, assertExists } from "@std/assert";
import { expect } from "@std/expect";
import { join } from "@std/path";
import {
  discoverSkills,
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

// discoverSkills tests

Deno.test("discoverSkills - discovers multiple valid skills", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    // Create two valid skill directories
    const skill1Dir = join(tmpDir, "skill-one");
    const skill2Dir = join(tmpDir, "skill-two");
    await Deno.mkdir(skill1Dir);
    await Deno.mkdir(skill2Dir);

    await Deno.writeTextFile(
      join(skill1Dir, "SKILL.md"),
      `---
name: skill-one
description: First skill
---
Body
`,
    );

    await Deno.writeTextFile(
      join(skill2Dir, "SKILL.md"),
      `---
name: skill-two
description: Second skill
---
Body
`,
    );

    const skills = await discoverSkills(tmpDir);
    assertEquals(skills.length, 2);

    const names = skills.map((s) => s.metadata.name).sort();
    assertEquals(names, ["skill-one", "skill-two"]);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("discoverSkills - returns empty array for nonexistent directory", async () => {
  const skills = await discoverSkills("/nonexistent/path");
  assertEquals(skills, []);
});

Deno.test("discoverSkills - returns empty array for empty directory", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const skills = await discoverSkills(tmpDir);
    assertEquals(skills, []);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("discoverSkills - skips directories without SKILL.md", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    // Create one valid skill and one without SKILL.md
    const validDir = join(tmpDir, "valid-skill");
    const invalidDir = join(tmpDir, "no-skill-md");
    await Deno.mkdir(validDir);
    await Deno.mkdir(invalidDir);

    await Deno.writeTextFile(
      join(validDir, "SKILL.md"),
      `---
name: valid-skill
description: A valid skill
---
Body
`,
    );

    // invalidDir has no SKILL.md

    const skills = await discoverSkills(tmpDir);
    assertEquals(skills.length, 1);
    assertEquals(skills[0].metadata.name, "valid-skill");
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("discoverSkills - skips skills with invalid metadata", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const validDir = join(tmpDir, "valid-skill");
    const invalidDir = join(tmpDir, "invalid-skill");
    await Deno.mkdir(validDir);
    await Deno.mkdir(invalidDir);

    await Deno.writeTextFile(
      join(validDir, "SKILL.md"),
      `---
name: valid-skill
description: A valid skill
---
Body
`,
    );

    // Invalid: uppercase name
    await Deno.writeTextFile(
      join(invalidDir, "SKILL.md"),
      `---
name: InvalidSkill
description: Has uppercase
---
Body
`,
    );

    const skills = await discoverSkills(tmpDir);
    assertEquals(skills.length, 1);
    assertEquals(skills[0].metadata.name, "valid-skill");
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("discoverSkills - calls onMissingSkillMd callback", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const noSkillDir = join(tmpDir, "no-skill");
    await Deno.mkdir(noSkillDir);

    const missingDirs: string[] = [];
    await discoverSkills(tmpDir, {
      onMissingSkillMd: (dirName) => missingDirs.push(dirName),
    });

    assertEquals(missingDirs, ["no-skill"]);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("discoverSkills - calls onInvalidMetadata callback", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const invalidDir = join(tmpDir, "invalid");
    await Deno.mkdir(invalidDir);

    await Deno.writeTextFile(
      join(invalidDir, "SKILL.md"),
      `---
name: UPPERCASE
description: Invalid name
---
Body
`,
    );

    const invalidPaths: string[] = [];
    await discoverSkills(tmpDir, {
      onInvalidMetadata: (path) => invalidPaths.push(path),
    });

    assertEquals(invalidPaths.length, 1);
    expect(invalidPaths[0]).toContain("SKILL.md");
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("discoverSkills - ignores non-directory entries", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    // Create a file at the top level (not a directory)
    await Deno.writeTextFile(join(tmpDir, "not-a-dir.txt"), "just a file");

    // Create a valid skill directory
    const skillDir = join(tmpDir, "my-skill");
    await Deno.mkdir(skillDir);
    await Deno.writeTextFile(
      join(skillDir, "SKILL.md"),
      `---
name: my-skill
description: A skill
---
Body
`,
    );

    const skills = await discoverSkills(tmpDir);
    assertEquals(skills.length, 1);
    assertEquals(skills[0].metadata.name, "my-skill");
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});
