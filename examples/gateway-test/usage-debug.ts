/**
 * Test: Usage debug - shows raw usage event data
 */

import { cloudflareGateway, createZypherAgent } from "@zypher/agent";

const GATEWAY_BASE_URL = "https://gateway.ai.c7d.dev";
const USER_ID = "test-user-123";

const provider = cloudflareGateway("anthropic/claude-3-haiku-20240307", {
  gatewayBaseUrl: GATEWAY_BASE_URL,
  apiToken: USER_ID,
  headers: { "User-Agent": "ZypherAgent/1.0" },
});

const agent = await createZypherAgent({
  model: provider,
  config: { maxTokens: 50 },
});

const task = agent.runTask("Say hi");
task.subscribe({
  next: (event) => {
    if (event.type === "usage") {
      console.log("Zypher usage event:");
      console.log(JSON.stringify(event, null, 2));
    }
  },
  error: (e) => console.error("Error:", e.message),
});
