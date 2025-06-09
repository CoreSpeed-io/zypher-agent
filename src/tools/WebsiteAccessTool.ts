import { z } from "zod";
import { defineTool } from "./mod.ts";
import FirecrawlApp from "npm:@mendable/firecrawl-js";

/**
 * Agent tool: **WebsiteAccessTool**
 *
 * Retrieves any publicly accessible web page and returns its contents as clean
 * Markdown using Firecrawl. Intended for LLM agents that need page text for
 * RAG, summarisation, or question‑answering steps.
 *
 * Example use inside a reasoning chain:
 *
 * ```text
 * Thought: I should read the target article to answer the question.
 * Action: website_access[{ "url": "https://example.com", "explanation": "Need article content." }]
 * Observation: "# Example Domain\n..."
 * ```
 */
export const WebsiteAccessTool = defineTool({
  name: "website_access",
  description:
    "Fetch a web page and return its contents as Markdown via Firecrawl.",
  parameters: z.object({
    url: z
      .string()
      .describe("Fully‑qualified URL including https:// or http://"),
    explanation: z
      .string()
      .describe("Brief reason the agent is invoking this tool."),
  }),

  execute: async ({ url }) => {
    // ── Validate input ─────────────────────────────────────────────────────────
    if (!/^https?:\/\//i.test(url)) {
      return "Error: URL must include protocol (e.g. https://example.com).";
    }

    // ── API key resolution ─────────────────────────────────────────────────────
    const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
    if (!apiKey) {
      return "Error: FIRECRAWL_API_KEY environment variable not set.";
    }

    // ── Firecrawl call ─────────────────────────────────────────────────────────
    const app = new FirecrawlApp({ apiKey });
    try {
      const scrape = await app.scrapeUrl(url, { formats: ["markdown"] });

      if (!scrape.success) {
        return `Firecrawl scrape failed: ${scrape.error}`;
      }
      // Normalise possible response shapes
      
      if (!scrape.markdown) {
        return "Error: Firecrawl did not return markdown for this URL.";
      }

      return scrape.markdown;
    } catch (err) {
      return `Error scraping ${url}: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
});
