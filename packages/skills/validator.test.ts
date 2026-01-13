/**
 * Tests for skill validation functions.
 */

import { assertEquals } from "@std/assert";
import { expect } from "@std/expect";
import { join } from "@std/path";
import { validateSkillDir, validateSkillMetadata } from "./validator.ts";

// validateSkillMetadata tests

Deno.test("validateSkillMetadata - valid metadata passes", () => {
  const result = validateSkillMetadata({
    name: "my-skill",
    description: "A test skill",
  });

  assertEquals(result.valid, true);
  assertEquals(result.errors.length, 0);
});

Deno.test("validateSkillMetadata - name too long fails", () => {
  const longName = "a".repeat(70);
  const result = validateSkillMetadata({
    name: longName,
    description: "A test skill",
  });

  assertEquals(result.valid, false);
  expect(result.errors.some((e) => e.includes("exceeds"))).toBe(true);
  expect(result.errors.some((e) => e.includes("64"))).toBe(true);
});

Deno.test("validateSkillMetadata - uppercase name fails", () => {
  const result = validateSkillMetadata({
    name: "MySkill",
    description: "A test skill",
  });

  assertEquals(result.valid, false);
  expect(result.errors.some((e) => e.includes("lowercase"))).toBe(true);
});

Deno.test("validateSkillMetadata - leading hyphen fails", () => {
  const result = validateSkillMetadata({
    name: "-my-skill",
    description: "A test skill",
  });

  assertEquals(result.valid, false);
  expect(result.errors.some((e) => e.includes("cannot start or end"))).toBe(
    true,
  );
});

Deno.test("validateSkillMetadata - trailing hyphen fails", () => {
  const result = validateSkillMetadata({
    name: "my-skill-",
    description: "A test skill",
  });

  assertEquals(result.valid, false);
  expect(result.errors.some((e) => e.includes("cannot start or end"))).toBe(
    true,
  );
});

Deno.test("validateSkillMetadata - consecutive hyphens fails", () => {
  const result = validateSkillMetadata({
    name: "my--skill",
    description: "A test skill",
  });

  assertEquals(result.valid, false);
  expect(result.errors.some((e) => e.includes("consecutive hyphens"))).toBe(
    true,
  );
});

Deno.test("validateSkillMetadata - underscore (invalid character) fails", () => {
  const result = validateSkillMetadata({
    name: "my_skill",
    description: "A test skill",
  });

  assertEquals(result.valid, false);
  expect(result.errors.some((e) => e.includes("invalid characters"))).toBe(
    true,
  );
});

Deno.test("validateSkillMetadata - description too long fails", () => {
  const longDesc = "x".repeat(1100);
  const result = validateSkillMetadata({
    name: "my-skill",
    description: longDesc,
  });

  assertEquals(result.valid, false);
  expect(result.errors.some((e) => e.includes("1024"))).toBe(true);
});

Deno.test("validateSkillMetadata - compatibility too long fails", () => {
  const longCompat = "x".repeat(550);
  const result = validateSkillMetadata({
    name: "my-skill",
    description: "A test skill",
    compatibility: longCompat,
  });

  assertEquals(result.valid, false);
  expect(result.errors.some((e) => e.includes("500"))).toBe(true);
});

// Unicode / i18n tests

Deno.test("validateSkillMetadata - Chinese name valid", () => {
  const result = validateSkillMetadata({
    name: "技能",
    description: "A skill with Chinese name",
  });

  assertEquals(result.valid, true);
  assertEquals(result.errors.length, 0);
});

Deno.test("validateSkillMetadata - Russian lowercase valid", () => {
  const result = validateSkillMetadata({
    name: "навык",
    description: "A skill with Russian name",
  });

  assertEquals(result.valid, true);
  assertEquals(result.errors.length, 0);
});

Deno.test("validateSkillMetadata - Russian with hyphens valid", () => {
  const result = validateSkillMetadata({
    name: "мой-навык",
    description: "A skill with Russian name and hyphen",
  });

  assertEquals(result.valid, true);
  assertEquals(result.errors.length, 0);
});

Deno.test("validateSkillMetadata - Russian uppercase fails", () => {
  const result = validateSkillMetadata({
    name: "НАВЫК",
    description: "A skill with Russian uppercase name",
  });

  assertEquals(result.valid, false);
  expect(result.errors.some((e) => e.includes("lowercase"))).toBe(true);
});

Deno.test("validateSkillMetadata - NFKC normalization", () => {
  // decomposed form: 'cafe' + combining acute accent (U+0301)
  const decomposedName = "cafe\u0301";

  const result = validateSkillMetadata({
    name: decomposedName,
    description: "A test skill",
  });

  // Should be valid after normalization
  assertEquals(result.valid, true);
});

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
