/**
 * Example: ACP Server
 *
 * Demonstrates how to create an ACP-compatible agent using Zypher Agent.
 * Uses the official ACP SDK and Deno's native stdin/stdout streams.
 *
 * Run:
 *   deno run --allow-read --allow-write --allow-env --allow-net --allow-run --allow-sys ./acp.ts
 *
 * Or via deno task:
 *   deno task example:acp
 *
 * To use with Zed, configure in settings.json:
 * {
 *   "agent": {
 *     "profiles": {
 *       "zypher": {
 *         "type": "custom",
 *         "command": "deno",
 *         "args": ["run", "--allow-read", "--allow-write", "--allow-env", "--allow-net", "--allow-run", "--allow-sys", "/path/to/examples/acp/acp.ts"],
 *         "env": {
 *           "OPENAI_API_KEY": "your-api-key"
 *         }
 *       }
 *     }
 *   }
 * }
 *
 * Environment variables (checked in order):
 *   - OPENAI_API_KEY: Use OpenAI as the model provider (default model: gpt-4o-2024-11-20)
 *   - ANTHROPIC_API_KEY: Use Anthropic as the model provider (default model: claude-sonnet-4-20250514)
 *   - ZYPHER_MODEL: Optional: override the default model (e.g., "gpt-4o", "claude-sonnet-4-20250514")
 */

import "@std/dotenv/load";
import {
  AnthropicModelProvider,
  createZypherAgent,
  type ModelProvider,
  OpenAIModelProvider,
} from "@zypher/agent";
import { runAcpServer } from "@zypher/acp";
import { createTool } from "@zypher/agent/tools";
import { z } from "zod";

function extractModelProvider(): { provider: ModelProvider; model: string } {
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (openaiKey) {
    return {
      provider: new OpenAIModelProvider({ apiKey: openaiKey }),
      model: Deno.env.get("ZYPHER_MODEL") || "gpt-4o-2024-11-20",
    };
  }

  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (anthropicKey) {
    return {
      provider: new AnthropicModelProvider({ apiKey: anthropicKey }),
      model: Deno.env.get("ZYPHER_MODEL") || "claude-sonnet-4-20250514",
    };
  }

  console.error(
    "Error: Set OPENAI_API_KEY or ANTHROPIC_API_KEY environment variable",
  );
  Deno.exit(1);
}

const { provider: modelProvider, model } = extractModelProvider();

const getWeather = createTool({
  name: "get_weather",
  description: "Get the current weather for a city",
  schema: z.object({
    city: z.string().describe("The city name, e.g. 'Tokyo'"),
  }),
  outputSchema: z.object({
    city: z.string().describe("The city name"),
    temperature: z.number().describe("Temperature in Celsius"),
    condition: z.string().describe(
      "Weather condition (e.g., Sunny, Cloudy, Rainy)",
    ),
    unit: z.literal("celsius").describe("Temperature unit"),
  }),
  execute: ({ city }: { city: string }) => {
    const MOCK_WEATHER: Record<string, { temp: number; condition: string }> = {
      tokyo: { temp: 22, condition: "Sunny" },
      london: { temp: 15, condition: "Cloudy" },
      "new york": { temp: 18, condition: "Partly Cloudy" },
      beijing: { temp: 20, condition: "Hazy" },
      shanghai: { temp: 24, condition: "Clear" },
      paris: { temp: 8, condition: "Cloudy" },
      berlin: { temp: 3, condition: "Snowy" },
      rome: { temp: 14, condition: "Sunny" },
      madrid: { temp: 12, condition: "Partly Cloudy" },
      sydney: { temp: 28, condition: "Hot" },
    };

    const key = city.toLowerCase();
    const data = MOCK_WEATHER[key];
    if (!data) {
      throw new Error(`Weather data not available for ${city}`);
    }

    return Promise.resolve({
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
    });
  },
});

await runAcpServer(async (cwd, mcpServers) => {
  return await createZypherAgent({
    modelProvider,
    tools: [getWeather],
    workingDirectory: cwd,
    mcpServers,
  });
}, model);
