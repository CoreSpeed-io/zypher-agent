import { z } from "zod";
import { defineTool } from "../mod.ts";

/**
 * WebsiteInfoSearchTool
 * ----------------
 * Given a website URL and a natural‑language description of the desired information,
 * this tool spins up a Browser‑Use headless browsing session to navigate to the site and
 * extract exactly that information. It returns the raw text scraped from the page.
 */
export const WebsiteInfoSearchTool = defineTool({
  name: "website_info_search_tool",
  description:
    `The tool can surf a website for you and extract information you want`,
  parameters: z.object({
    url: z.string().url().describe("The website URL to visit"),
    targetInfo: z.string().describe(
      "description of what information you want to pull from the page",
    )
  }),
  execute: async ({ url, targetInfo }) => {
    try {
      const response = await fetch('https://api.browser-use.com/api/v1/search-url', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get("BROWSERUSEIO_KEY")!}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url: url,
          query: targetInfo,
          depth: 3
        })
      });

      const result = await response.json();
      console.log("website_info_search_tool", JSON.stringify(result, null, 2))
      return JSON.stringify(result, null, 2);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`WebsiteAgentTool failed: ${message}`);
    }
  },
});
