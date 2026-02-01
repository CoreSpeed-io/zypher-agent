/**
 * Test: AnthropicModelProvider directly
 */

import { AnthropicModelProvider, createZypherAgent } from "@zypher/agent";

const GATEWAY_BASE_URL = "https://gateway.ai.c7d.dev/anthropic";
const USER_ID = "test-user-123";

const provider = new AnthropicModelProvider({
  model: "claude-3-haiku-20240307",
  apiKey: USER_ID,
  baseUrl: GATEWAY_BASE_URL,
  anthropicClientOptions: {
    defaultHeaders: { "User-Agent": "ZypherAgent/1.0" },
  },
});

const agent = await createZypherAgent({
  model: provider,
  config: { maxTokens: 1024 },
});

console.log("Testing AnthropicModelProvider directly...\n");

const task = agent.runTask("Say hello and tell me a short joke");

task.subscribe({
  next: (event) => {
    if (event.type === "text") {
      Deno.stdout.writeSync(new TextEncoder().encode(event.content));
    } else if (event.type === "completed") {
      console.log("\n\n✓ Test passed!");
      if (event.totalUsage) {
        console.log(
          `Tokens: ${event.totalUsage.inputTokens} in / ${event.totalUsage.outputTokens} out`,
        );
      }
    }
  },
  error: (err) => {
    console.error("\n✗ Test failed:", err.message);
  },
});
