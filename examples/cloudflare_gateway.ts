/**
 * Example: Cloudflare AI Gateway
 *
 * Demonstrates using Cloudflare AI Gateway as a model provider proxy.
 * CF AI Gateway allows you to route requests to different AI providers
 * (Anthropic, OpenAI, and others via compat endpoint) through a single gateway.
 *
 * Environment variables:
 *   CF_AIG_BASE_URL  - (required) Your CF AI Gateway URL (e.g., https://gateway.ai.cloudflare.com/v1/{account}/{gateway})
 *   CF_AIG_API_TOKEN - (required) Your Cloudflare API token
 *   ZYPHER_MODEL     - (optional) Model to use, defaults to "anthropic/claude-sonnet-4-5"
 *
 * Model format: "provider/model" - the provider prefix determines the endpoint:
 *   - "anthropic/claude-sonnet-4-5" → routes to /anthropic endpoint
 *   - "openai/gpt-4o"               → routes to /openai endpoint
 *   - "grok/grok-3"                 → routes to /compat endpoint (for other providers)
 *
 * Run:
 *   deno run --env --allow-read --allow-net --allow-env --allow-sys ./cloudflare_gateway.ts
 */

import { cloudflareGateway, createZypherAgent } from "@zypher/agent";
import { createTool } from "@zypher/agent/tools";
import { runAgentInTerminal } from "@zypher/cli";
import { getRequiredEnv } from "@zypher/utils/env";
import { z } from "zod";

// Simple calculator tool to demonstrate tool use through CF Gateway
const calculator = createTool({
  name: "calculator",
  description: "Perform basic arithmetic operations",
  schema: z.object({
    operation: z.enum(["add", "subtract", "multiply", "divide"]),
    a: z.number().describe("First number"),
    b: z.number().describe("Second number"),
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
        if (b === 0) throw new Error("Division by zero");
        result = a / b;
        break;
    }
    return Promise.resolve({
      content: [{ type: "text", text: `${a} ${operation} ${b} = ${result}` }],
      structuredContent: { result },
    });
  },
});

// Get configuration from environment
const gatewayBaseUrl = getRequiredEnv("CF_AIG_BASE_URL");
const apiToken = getRequiredEnv("CF_AIG_API_TOKEN");

const model = Deno.env.get("ZYPHER_MODEL") ?? "anthropic/claude-sonnet-4-5";

console.log(`Using Cloudflare AI Gateway: ${gatewayBaseUrl}`);
console.log(`Model: ${model}\n`);

// Create the model provider using Cloudflare AI Gateway
const modelProvider = cloudflareGateway(model, {
  gatewayBaseUrl,
  apiToken,
  headers: {
    "User-Agent": "ZypherAgent/1.0",
  },
});

// Create the agent with the Cloudflare AI Gateway provider
const agent = await createZypherAgent({
  model: modelProvider,
  tools: [calculator],
});

// Run the agent in an interactive terminal session
await runAgentInTerminal(agent);
