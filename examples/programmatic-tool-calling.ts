/**
 * Example: Programmatic Tool Calling
 *
 * Demonstrates programmatic tool calling where the LLM can use
 * execute_code to call tools like tools.get_weather() and
 * tools.calculator() and process the results efficiently.
 *
 * Uses the `programmatic()` wrapper which returns an `execute_code` tool
 * with the wrapped tools embedded inside.
 *
 * Run:
 *   deno run -A --unstable-worker-options examples/programmatic-tool-calling.ts
 */

import "@std/dotenv/load";
import {
  AnthropicModelProvider,
  createZypherAgent,
  runAgentInTerminal,
} from "@corespeed/zypher";
import { createTool, programmatic } from "@corespeed/zypher/tools";
import { z } from "zod";

const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
if (!apiKey) {
  console.error("Error: Set ANTHROPIC_API_KEY environment variable");
  Deno.exit(1);
}

// Create a calculator tool
const calculator = createTool({
  name: "calculator",
  description:
    "Perform basic arithmetic operations: add, subtract, multiply, divide",
  schema: z.object({
    operation: z
      .enum(["add", "subtract", "multiply", "divide"])
      .describe("The arithmetic operation to perform"),
    a: z.number().describe("First operand"),
    b: z.number().describe("Second operand"),
  }),
  execute: ({ operation, a, b }) => {
    let result: number;
    switch (operation) {
      case "add":
        result = a + b;
        break;
      case "subtract":
        result = a - b;
        break;
      case "multiply":
        result = a * b;
        break;
      case "divide":
        if (b === 0) {
          return Promise.resolve(
            JSON.stringify({ error: "Division by zero is not allowed" }),
          );
        }
        result = a / b;
        break;
    }
    return Promise.resolve(
      JSON.stringify({ operation, a, b, result }),
    );
  },
});

// Create a simple weather tool
const getWeather = createTool({
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
    return Promise.resolve(
      {
        city,
        temperature: data.temp,
        condition: data.condition,
        unit: "celsius",
      },
    );
  },
});

// Create agent with programmatic tool calling
const agent = await createZypherAgent({
  modelProvider: new AnthropicModelProvider({ apiKey }),
  tools: [
    getWeather,
    programmatic(getWeather, calculator),
  ],
  hooks: {
    onBeforeToolCall: (toolName, args) => {
      console.log(`\nTool Logger: ${toolName}\n${JSON.stringify(args)}`);
    },
  },
});

console.log("Tools:", Array.from(agent.mcp.tools.keys()).join(", "));
console.log(
  "\nTry: Get weather of London and Paris",
);
console.log("Or: calculate 10005 + 10001 for me.\n");

await runAgentInTerminal(agent, "claude-sonnet-4-20250514");
