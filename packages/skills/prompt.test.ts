/**
 * Tests for prompt generation functions.
 */

import { assertEquals } from "@std/assert";
import { expect } from "@std/expect";
import { escapeHtml, toPrompt } from "./prompt.ts";
import type { Skill } from "./skill.ts";

// escapeHtml tests

Deno.test("escapeHtml - ampersand escaped", () => {
  assertEquals(escapeHtml("foo & bar"), "foo &amp; bar");
});

Deno.test("escapeHtml - less than escaped", () => {
  assertEquals(escapeHtml("foo < bar"), "foo &lt; bar");
});

Deno.test("escapeHtml - greater than escaped", () => {
  assertEquals(escapeHtml("foo > bar"), "foo &gt; bar");
});

Deno.test("escapeHtml - double quote escaped", () => {
  assertEquals(escapeHtml('foo "bar"'), "foo &quot;bar&quot;");
});

Deno.test("escapeHtml - single quote escaped", () => {
  assertEquals(escapeHtml("foo 'bar'"), "foo &#39;bar&#39;");
});

Deno.test("escapeHtml - multiple special characters", () => {
  assertEquals(
    escapeHtml('<script>alert("XSS & more")</script>'),
    "&lt;script&gt;alert(&quot;XSS &amp; more&quot;)&lt;/script&gt;",
  );
});

Deno.test("escapeHtml - no special characters unchanged", () => {
  assertEquals(escapeHtml("plain text"), "plain text");
});

// toPrompt tests

Deno.test("toPrompt - empty array returns empty block", () => {
  const result = toPrompt([]);
  assertEquals(result, "<available_skills>\n</available_skills>");
});

Deno.test("toPrompt - single skill", () => {
  const skills: Skill[] = [
    {
      metadata: {
        name: "pdf-reader",
        description: "Read and extract text from PDF files",
      },
      location: "/path/to/pdf-reader/SKILL.md",
    },
  ];

  const result = toPrompt(skills);

  expect(result).toContain("<available_skills>");
  expect(result).toContain("</available_skills>");
  expect(result).toContain("<skill>");
  expect(result).toContain("</skill>");
  expect(result).toContain("<name>");
  expect(result).toContain("pdf-reader");
  expect(result).toContain("</name>");
  expect(result).toContain("<description>");
  expect(result).toContain("Read and extract text from PDF files");
  expect(result).toContain("</description>");
  expect(result).toContain("<location>");
  expect(result).toContain("/path/to/pdf-reader/SKILL.md");
  expect(result).toContain("</location>");
});

Deno.test("toPrompt - multiple skills", () => {
  const skills: Skill[] = [
    {
      metadata: {
        name: "skill-one",
        description: "First skill",
      },
      location: "/path/to/skill-one/SKILL.md",
    },
    {
      metadata: {
        name: "skill-two",
        description: "Second skill",
      },
      location: "/path/to/skill-two/SKILL.md",
    },
  ];

  const result = toPrompt(skills);

  // Should have both skills
  expect(result).toContain("skill-one");
  expect(result).toContain("First skill");
  expect(result).toContain("skill-two");
  expect(result).toContain("Second skill");

  // Count skill blocks
  const skillMatches = result.match(/<skill>/g);
  assertEquals(skillMatches?.length, 2);
});

Deno.test("toPrompt - escapes special characters in name", () => {
  const skills: Skill[] = [
    {
      metadata: {
        name: "skill<with>special&chars",
        description: "A skill",
      },
      location: "/path/SKILL.md",
    },
  ];

  const result = toPrompt(skills);

  expect(result).toContain("skill&lt;with&gt;special&amp;chars");
  expect(result).not.toContain("skill<with>special&chars");
});

Deno.test("toPrompt - escapes special characters in description", () => {
  const skills: Skill[] = [
    {
      metadata: {
        name: "my-skill",
        description: 'Handle "quotes" & <tags>',
      },
      location: "/path/SKILL.md",
    },
  ];

  const result = toPrompt(skills);

  expect(result).toContain("&quot;quotes&quot; &amp; &lt;tags&gt;");
});

Deno.test("toPrompt - preserves location path as-is", () => {
  const skills: Skill[] = [
    {
      metadata: {
        name: "my-skill",
        description: "A skill",
      },
      location: "/path/with spaces/SKILL.md",
    },
  ];

  const result = toPrompt(skills);

  // Location should not be escaped
  expect(result).toContain("/path/with spaces/SKILL.md");
});

Deno.test("toPrompt - expected XML structure", () => {
  const skills: Skill[] = [
    {
      metadata: {
        name: "test",
        description: "desc",
      },
      location: "/loc",
    },
  ];

  const result = toPrompt(skills);

  // Verify the structure matches expected format
  const expected = `<available_skills>
<skill>
<name>
test
</name>
<description>
desc
</description>
<location>
/loc
</location>
</skill>
</available_skills>`;

  assertEquals(result, expected);
});
