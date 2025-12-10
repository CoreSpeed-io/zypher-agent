/**
 * Example: Programmatic Tool Calling
 *
 * Demonstrates programmatic tool calling where the LLM can use
 * execute_code to call tools like tools.get_weather() and process
 * the results efficiently.
 *
 * Also demonstrates tool approval handling - requiring user confirmation
 * before executing tools.
 *
 * Run:
 *   deno run -A --unstable-worker-options examples/ptc.ts
 */

import "@std/dotenv/load";
import {
  AnthropicModelProvider,
  createZypherContext,
  McpServerManager,
  ZypherAgent,
} from "@zypher/mod.ts";
import { createExecuteCodeTool, createTool } from "@zypher/tools/mod.ts";
import { z } from "zod";
import { eachValueFrom } from "rxjs-for-await";

const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
if (!apiKey) {
  console.error("Error: Set ANTHROPIC_API_KEY environment variable");
  Deno.exit(1);
}

// Create a simple weather tool
const getWeather = createTool({
  name: "get_weather",
  description: "Get the current weather for a city",
  schema: z.object({
    city: z.string().describe("City name"),
  }),
  // Note: outputSchema is optional but highly RECOMMENDED for tools used with PTC.
  // It documents the structure of result.structuredContent, which helps the agent to
  // generate correct code for accessing and manipulating tool results.
  outputSchema: z.object({
    city: z.string().describe("The city name"),
    temperature: z.number().describe("Temperature in Celsius"),
    condition: z.string().describe(
      "Weather condition (e.g., Sunny, Cloudy, Rainy)",
    ),
    unit: z.literal("celsius").describe("Temperature unit"),
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
      throw new Error(`Weather data not available for ${city}`);
    }
    return Promise.resolve(
      {
        content: [{
          type: "text",
          text:
            `The weather in ${city} is ${data.condition} with a temperature of ${data.temp}°C`,
        }],
        structuredContent: {
          city,
          temperature: data.temp,
          condition: data.condition,
          unit: "celsius",
        },
      },
    );
  },
});

// Create context and MCP server manager with tool approval handler
const context = await createZypherContext(Deno.cwd());
const mcpServerManager = new McpServerManager(context, {
  // toolApprovalHandler: async (toolName, input) => {
  //   console.log(`\n🔧 Tool approval requested: ${toolName}`);
  //   console.log(`   Input: ${JSON.stringify(input)}`);

  //   const rl = readline.createInterface({
  //     input: process.stdin,
  //     output: process.stdout,
  //   });
  //   const response = await rl.question("   Approve? (y/n): ");
  //   rl.close();

  //   const approved = response.toLowerCase() === "y";
  //   console.log(approved ? "   ✅ Approved\n" : "   ❌ Rejected\n");
  //   return approved;
  // },
});

// Register tools
mcpServerManager.registerTool(getWeather);
mcpServerManager.registerTool(createExecuteCodeTool(mcpServerManager));

// Create the agent with the custom MCP server manager
const agent = new ZypherAgent(
  context,
  new AnthropicModelProvider({ apiKey }),
  {
    overrides: {
      mcpServerManager,
    },
  },
);

const events$ = agent.runTask(
  `In the following cities:
- paris
- london
- berlin
- rome
- madrid
- amsterdam
- vienna
- prague
- barcelona
- lisbon

get two cities with the most similar weather and the city with the highest temperature`,
  "claude-sonnet-4-5-20250929",
);

for await (const event of eachValueFrom(events$)) {
  console.log(event);
}
