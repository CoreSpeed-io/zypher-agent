/**
 * Unit tests for skill validation functions.
 * These tests do not require filesystem access.
 */

import { assertEquals } from "@std/assert";
import { expect } from "@std/expect";
import { validateSkillMetadata } from "./validator.ts";

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
