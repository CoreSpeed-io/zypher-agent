/**
 * Test: Billing - tracks token usage
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
  config: { maxTokens: 100 },
});

let input = 0,
  output = 0,
  cacheRead = 0;

const task = agent.runTask("Say hi in 5 words");
task.subscribe({
  next: (event) => {
    if (event.type === "usage") {
      input = event.usage.input?.total ?? 0;
      output = event.usage.output?.total ?? 0;
      cacheRead = event.usage.input?.cacheRead ?? 0;
    }
    if (event.type === "text") {
      Deno.stdout.writeSync(new TextEncoder().encode(event.content));
    }
    if (event.type === "completed") {
      console.log(`  [in: ${input}, out: ${output}, cache: ${cacheRead}]`);
    }
  },
  error: (e) => console.error("Error:", e.message),
});
