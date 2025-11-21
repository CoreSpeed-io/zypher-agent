#!/usr/bin/env -S deno run -A

/**
 * Simple Test for Academic Assistant
 *
 * This is a simplified test that doesn't require network access.
 * It demonstrates how the tool works with mock data.
 */

import { ArXivSearchTool } from "../src/tools/ArXivSearchTool.ts";

async function testArXivSearch() {
  console.log("🧪 Testing ArXiv Search Tool...\n");

  try {
    const result = await ArXivSearchTool.execute(
      {
        query: "large language models",
        max_results: 3,
        sort_by: "relevance",
      },
      { workingDirectory: Deno.cwd() }
    );

    console.log("✅ Tool executed successfully!\n");
    console.log("📄 Results:\n");
    console.log(result);
  } catch (error) {
    console.error("❌ Error:", error.message);
    console.log("\n💡 Note: This test requires network access to arXiv API");
    console.log("   If running in a sandboxed environment, you may see network errors.");
  }
}

if (import.meta.main) {
  await testArXivSearch();
}
