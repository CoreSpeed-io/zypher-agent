/**
 * Example: Agent with Code Execution Tool
 *
 * Demonstrates getting weather for multiple cities using PTC.
 * The LLM can use execute_code to call tools.get_weather()
 * and process the results efficiently.
 *
 * The system prompt is automatically generated with available tools
 * for code execution when tools have `allowed_callers: ["code_execution"]`.
 *
 * Run:
 *   deno run -A --unstable-worker-options examples/code-execution-agent.ts
 */

import "@std/dotenv/load";
import { z } from "zod";
import {
  AnthropicModelProvider,
  createZypherContext,
  runAgentInTerminal,
  ZypherAgent,
} from "@zypher/mod.ts";
import { createCodeExecutionTool, createTool } from "@zypher/tools/mod.ts";

// Create a simple weather tool
const WeatherTool = createTool({
  name: "get_weather",
  description: "Get the current weather for a city",
  schema: z.object({
    city: z.string().describe("City name"),
  }),
  allowed_callers: ["code_execution"],
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
      unit: "celsius-degreesd",
    }));
  },
});

const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
if (!apiKey) {
  console.error("Error: Set ANTHROPIC_API_KEY environment variable");
  Deno.exit(1);
}

const context = await createZypherContext(Deno.cwd());
const agent = new ZypherAgent(
  context,
  new AnthropicModelProvider({ apiKey }),
);

// Register weather tool
agent.mcp.registerTool(WeatherTool);

// Register code execution tool with callback to show tool calls from runner
agent.mcp.registerTool(
  createCodeExecutionTool(agent.mcp, {
    timeout: 30_000,
    onToolUse: (toolName, args) => {
      console.log(
        `\n🔧 Using tool: ${toolName} [code_execution]\n${
          JSON.stringify(args)
        }`,
      );
    },
  }),
);

console.log("Tools:", Array.from(agent.mcp.tools.keys()).join(", "));
console.log(
  "\nTry: Get weather for all European cities and find the warmest one",
);
console.log("(In execute_code, use: tools.get_weather({ city }))\n");

await runAgentInTerminal(agent, "claude-sonnet-4-20250514");
