/**
 * Example: Agent with Code Execution Tool
 *
 * Demonstrates getting weather for multiple cities using PTC.
 * The LLM can use execute_code to call tools.builtin.get_weather()
 * and process the results efficiently.
 *
 * Run:
 *   deno run -A --unstable-worker-options examples/code-execution-agent.ts
 */

import "@std/dotenv/load";
import { z } from "zod";
import {
  createZypherContext,
  getSystemPrompt,
  OpenAIModelProvider,
  runAgentInTerminal,
  ZypherAgent,
} from "@zypher/mod.ts";
import { createCodeExecutionTool, createTool } from "@zypher/tools/mod.ts";

// Custom instructions for code execution
const CODE_EXECUTION_INSTRUCTIONS = `
<code_execution>
You have access to the \`execute_code\` tool which lets you write and run TypeScript/JavaScript code
that can orchestrate multiple tool calls efficiently.

**When to use execute_code:**
- When you need to call the same tool multiple times (e.g., get weather for 10 cities)
- When you need to process/aggregate results from multiple tool calls
- When you need to perform calculations or data transformations on tool results

**How it works:**
- Write the BODY of an async function (no function declaration needed)
- Access tools via: \`await tools.builtin.toolName({ arg: value })\`
- Use \`return\` to send the final result back
- Console.log output is captured for debugging

**Example - Get weather for multiple cities:**
\`\`\`typescript
const cities = ["Paris", "London", "Berlin", "Rome", "Madrid"];
const results = [];

for (const city of cities) {
  const weather = await tools.builtin.get_weather({ city });
  results.push(JSON.parse(weather));
}

// Find the warmest city
const warmest = results.reduce((a, b) => a.temperature > b.temperature ? a : b);
return { allCities: results, warmest };
\`\`\`

**Benefits:**
- Reduces back-and-forth: one execute_code call instead of 10 separate tool calls
- Process data in code instead of asking the LLM to analyze raw results
- Return only the summary/result you need
</code_execution>
`;

// Create a simple weather tool
const WeatherTool = createTool({
  name: "get_weather",
  description: "Get the current weather for a city",
  schema: z.object({
    city: z.string().describe("City name"),
  }),
  execute: ({ city }) => {
    // Mock weather data for European cities
    const MOCK_WEATHER: Record<string, { temp: number; condition: string }> = {
      paris: { temp: 8, condition: "Cloudy" },
      london: { temp: 6, condition: "Rainy" },
      berlin: { temp: 3, condition: "Snowy" },
      rome: { temp: 14, condition: "Sunny" },
      madrid: { temp: 12, condition: "Partly Cloudy" },
      amsterdam: { temp: 5, condition: "Windy" },
      vienna: { temp: 4, condition: "Foggy" },
      prague: { temp: 2, condition: "Cloudy" },
      barcelona: { temp: 16, condition: "Sunny" },
      lisbon: { temp: 18, condition: "Clear" },
    };
    const key = city.toLowerCase();
    const data = MOCK_WEATHER[key];
    if (!data) {
      return Promise.resolve(`Weather data not available for ${city}`);
    }
    return Promise.resolve(JSON.stringify({
      city,
      temperature: data.temp,
      condition: data.condition,
      unit: "celsius",
    }));
  },
});

const apiKey = Deno.env.get("OPENAI_API_KEY");
if (!apiKey) {
  console.error("Error: Set OPENAI_API_KEY environment variable");
  Deno.exit(1);
}

const context = await createZypherContext(Deno.cwd());
const agent = new ZypherAgent(
  context,
  new OpenAIModelProvider({ apiKey }),
  {
    overrides: {
      systemPromptLoader: () =>
        getSystemPrompt(context.workingDirectory, {
          customInstructions: CODE_EXECUTION_INSTRUCTIONS,
        }),
    },
  },
);

// Register weather tool
agent.mcp.registerTool(WeatherTool);

// Register code execution tool
agent.mcp.registerTool(createCodeExecutionTool(agent.mcp, { timeout: 30_000 }));

console.log("Tools:", Array.from(agent.mcp.tools.keys()).join(", "));
console.log("\nTry: Get weather for all European cities and find the warmest one");
console.log("(In execute_code, use: tools.builtin.get_weather({ city }))\n");

await runAgentInTerminal(agent, "gpt-4o");
