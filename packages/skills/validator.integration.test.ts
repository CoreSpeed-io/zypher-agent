/**
 * Integration tests for skill directory validation.
 * These tests require filesystem access and use temp directories.
 */

import { assertEquals } from "@std/assert";
import { expect } from "@std/expect";
import { join } from "@std/path";
import { validateSkillDir } from "./validator.ts";

// validateSkillDir tests

Deno.test("validateSkillDir - valid skill directory", async () => {
  const tmpDir = await Deno.makeTempDir();
  const skillDir = join(tmpDir, "my-skill");
  await Deno.mkdir(skillDir);

  try {
    await Deno.writeTextFile(
      join(skillDir, "SKILL.md"),
      `---
name: my-skill
description: A test skill
---
# My Skill
`,
    );

    const errors = await validateSkillDir(skillDir);
    assertEquals(errors.length, 0);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("validateSkillDir - nonexistent path", async () => {
  const errors = await validateSkillDir("/nonexistent/path/to/skill");
  assertEquals(errors.length, 1);
  expect(errors[0]).toContain("does not exist");
});

Deno.test("validateSkillDir - not a directory", async () => {
  const tmpFile = await Deno.makeTempFile();
  try {
    const errors = await validateSkillDir(tmpFile);
    assertEquals(errors.length, 1);
    expect(errors[0]).toContain("Not a directory");
  } finally {
    await Deno.remove(tmpFile);
  }
});

Deno.test("validateSkillDir - missing SKILL.md", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const errors = await validateSkillDir(tmpDir);
    assertEquals(errors.length, 1);
    expect(errors[0]).toContain("Missing required file: SKILL.md");
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("validateSkillDir - directory name mismatch", async () => {
  const tmpDir = await Deno.makeTempDir();
  const skillDir = join(tmpDir, "wrong-name");
  await Deno.mkdir(skillDir);

  try {
    await Deno.writeTextFile(
      join(skillDir, "SKILL.md"),
      `---
name: correct-name
description: A test skill
---
Body
`,
    );

    const errors = await validateSkillDir(skillDir);
    expect(errors.some((e) => e.includes("must match skill name"))).toBe(true);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("validateSkillDir - unexpected fields", async () => {
  const tmpDir = await Deno.makeTempDir();
  const skillDir = join(tmpDir, "my-skill");
  await Deno.mkdir(skillDir);

  try {
    await Deno.writeTextFile(
      join(skillDir, "SKILL.md"),
      `---
name: my-skill
description: A test skill
unknown_field: should not be here
---
Body
`,
    );

    const errors = await validateSkillDir(skillDir);
    expect(errors.some((e) => e.includes("Unexpected fields"))).toBe(true);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("validateSkillDir - all valid fields accepted", async () => {
  const tmpDir = await Deno.makeTempDir();
  const skillDir = join(tmpDir, "my-skill");
  await Deno.mkdir(skillDir);

  try {
    await Deno.writeTextFile(
      join(skillDir, "SKILL.md"),
      `---
name: my-skill
description: A test skill
license: MIT
compatibility: Requires Python 3.11+
allowed-tools: Bash(jq:*) Bash(git:*)
metadata:
  author: Test
---
Body
`,
    );

    const errors = await validateSkillDir(skillDir);
    assertEquals(errors.length, 0);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("validateSkillDir - NFKC normalization for directory match", async () => {
  const tmpDir = await Deno.makeTempDir();
  // Use composed form for directory: 'café' (precomposed)
  const composedName = "caf\u00e9";
  const skillDir = join(tmpDir, composedName);
  await Deno.mkdir(skillDir);

  try {
    // Use decomposed form in SKILL.md: 'cafe' + combining accent
    const decomposedName = "cafe\u0301";
    await Deno.writeTextFile(
      join(skillDir, "SKILL.md"),
      `---
name: ${decomposedName}
description: A test skill
---
Body
`,
    );

    const errors = await validateSkillDir(skillDir);
    // Should match after NFKC normalization
    assertEquals(errors.length, 0);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("validateSkillDir - Chinese skill name", async () => {
  const tmpDir = await Deno.makeTempDir();
  const skillDir = join(tmpDir, "技能");
  await Deno.mkdir(skillDir);

  try {
    await Deno.writeTextFile(
      join(skillDir, "SKILL.md"),
      `---
name: 技能
description: A skill with Chinese name
---
Body
`,
    );

    const errors = await validateSkillDir(skillDir);
    assertEquals(errors.length, 0);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});
