import { z } from "zod";
import { defineTool } from "./mod.ts";
import FirecrawlApp from "@mendable/firecrawl-js";

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
      // Scrape with HTML format
      const scrape = await app.scrapeUrl(url, {
        formats: ["html"],
        onlyMainContent: true,
        removeBase64Images: true,
        blockAds: true,
      });

      if (!scrape.success) {
        return `Firecrawl scrape failed: ${scrape.error}`;
      }

      if (!scrape.html) {
        return "Error: Firecrawl did not return HTML for this URL.";
      }

      // Parse HTML and extract text content
      const textContent = extractTextFromHtml(scrape.html);
      
      return textContent;
    } catch (err) {
      return `Error scraping ${url}: ${
        err instanceof Error ? err.message : String(err)
      }`;
    }

    // try {
    //   const scrape = await app.scrapeUrl(url, {
    //     formats: ["markdown"],
    //     onlyMainContent: true,
    //     removeBase64Images: true,
    //     blockAds: true,
    //   });

    //   if (!scrape.success) {
    //     return `Firecrawl scrape failed: ${scrape.error}`;
    //   }
    //   // Normalise possible response shapes

    //   if (!scrape.markdown) {
    //     return "Error: Firecrawl did not return markdown for this URL.";
    //   }

    //   console.log(scrape.markdown);
    //   await Deno.writeTextFile("scrape.md", scrape.markdown);
    //   return scrape.markdown;
    // } catch (err) {
    //   return `Error scraping ${url}: ${
    //     err instanceof Error ? err.message : String(err)
    //   }`;
    // }
  },
});

/**
 * Extracts plain text content from HTML string
 * Removes HTML tags, scripts, styles, and extra whitespace
 */
function extractTextFromHtml(html: string): string {
  try {
    let text = html;

    // Remove script and style tags with their content
    text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
    
    // Remove HTML comments
    text = text.replace(/<!--[\s\S]*?-->/g, '');
    
    // Remove all HTML tags
    text = text.replace(/<[^>]*>/g, '');
    
    // Decode common HTML entities
    text = text.replace(/&amp;/g, '&');
    text = text.replace(/&lt;/g, '<');
    text = text.replace(/&gt;/g, '>');
    text = text.replace(/&quot;/g, '"');
    text = text.replace(/&#39;/g, "'");
    text = text.replace(/&nbsp;/g, ' ');
    
    // Clean up whitespace
    text = text.replace(/\s+/g, ' ');  // Replace multiple whitespace with single space
    text = text.replace(/\n\s*\n/g, '\n');  // Remove empty lines
    text = text.trim();

    return text;
  } catch (err) {
    return `Error extracting text from HTML: ${
      err instanceof Error ? err.message : String(err)
    }`;
  }
}
