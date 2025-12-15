/**
 * AG-UI Server Example
 *
 * Run: deno run --env --allow-all ./server.ts
 */

import "@std/dotenv/load";
import { z } from "zod";
import {
  AnthropicModelProvider,
  createZypherAgent,
  getSystemPrompt,
} from "@corespeed/zypher";
import { createTool } from "@corespeed/zypher/tools";
import { createAGUIStream } from "@corespeed/zypher/agui";

// Example: Weather tool
const getWeatherTool = createTool({
  name: "get_weather",
  description: "Get the current weather for a given location",
  schema: z.object({
    location: z.string().describe("The city name, e.g., 'San Francisco'"),
    unit: z
      .enum(["celsius", "fahrenheit"])
      .optional()
      .default("celsius")
      .describe("Temperature unit"),
  }),
  execute: ({ location, unit }) => {
    // Simulated weather data - replace with actual API call
    const temp = unit === "fahrenheit" ? 72 : 22;
    console.log(`Fetching weather for ${location} in ${unit}...`);
    // Return CallToolResult with JSON string for backend_tool_rendering
    return Promise.resolve({
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          location,
          temperature: temp,
          conditions: "sunny",
          humidity: 45,
          wind_speed: 10,
          feels_like: temp + 2,
        }),
      }],
    });
  },
});

const agent = await createZypherAgent({
  modelProvider: new AnthropicModelProvider({
    apiKey: Deno.env.get("ANTHROPIC_API_KEY")!,
  }),
  tools: [getWeatherTool],
  overrides: {
    // Don't load custom rules (like CLAUDE.md) which may contain XML tool-calling
    // instructions that conflict with native tool use
    systemPromptLoader: () =>
      getSystemPrompt(Deno.cwd(), { customInstructions: "" }),
  },
});

Deno.serve({ port: 8000 }, async (request) => {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const stream = createAGUIStream(await request.json(), { agent });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream" },
  });
});

console.log("AG-UI server running on http://localhost:8000");
