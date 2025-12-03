import { assertEquals } from "@std/assert";
import { generateCodeExecutionToolsPrompt } from "./tool-definition-builder.ts";
import type { ToolDefinitions } from "./programmatic-tool-calling-protocol.ts";

const generateCodeExecutionToolsPromptCases: {
  name: string;
  input: ToolDefinitions;
  expected: string;
}[] = [
  {
    name: "empty tools returns empty string",
    input: [],
    expected: "",
  },
  {
    name: "single tool with required params",
    input: [
      {
        name: "get_weather",
        description: "Get weather for a city",
        parameters: {
          type: "object",
          properties: { city: { type: "string" } },
          required: ["city"],
        },
      },
    ],
    expected: `## Available Tools for Code Execution

### tools.get_weather(input: inputSchema)
Get weather for a city
inputSchema:
\`\`\`json
{
  "type": "object",
  "properties": {
    "city": {
      "type": "string"
    }
  },
  "required": [
    "city"
  ]
}
\`\`\`
`,
  },
  {
    name: "tool with nested object",
    input: [
      {
        name: "create_user",
        description: "Create a new user",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string" },
            address: {
              type: "object",
              properties: {
                city: { type: "string" },
                zip: { type: "string" },
              },
            },
          },
          required: ["name"],
        },
      },
    ],
    expected: `## Available Tools for Code Execution

### tools.create_user(input: inputSchema)
Create a new user
inputSchema:
\`\`\`json
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string"
    },
    "address": {
      "type": "object",
      "properties": {
        "city": {
          "type": "string"
        },
        "zip": {
          "type": "string"
        }
      }
    }
  },
  "required": [
    "name"
  ]
}
\`\`\`
`,
  },
];

for (const tc of generateCodeExecutionToolsPromptCases) {
  Deno.test(`generateCodeExecutionToolsPrompt - ${tc.name}`, () => {
    assertEquals(generateCodeExecutionToolsPrompt(tc.input), tc.expected);
  });
}
