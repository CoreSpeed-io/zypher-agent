import { z } from "zod";
import { defineTool } from "./mod.ts";

/**
 * WebSearchTool
 * -------------
 * A tool that uses Google Custom Search JSON/REST API to perform a web search.
 * It returns a concise plaintext list of the top results (title and URL),
 * capped to 10 as per Google API limits. You must set two environment
 * variables for this to work:
 *   - `GOOGLE_CLOUD_API_KEY` : Your Google Custom Search API key
 *   - `GOOGLE_CUSTOM_SEARCH_ENGINE_ID` : The search engine ID (CX) configured in Google CSE
 *
 * The implementation follows the response structure described in the Google
 * documentation: https://developers.google.com/custom-search/v1/using_rest#response_data
 */
export const WebSearchTool = defineTool({
  name: "web_search",
  description:
    "Performs a Google Custom Search against the public web. Use this to fetch up‑to‑date information. Returns a plaintext list of results capped to 10.",
  parameters: z.object({
    query: z.string().describe("Search query string"),
    numResults: z
      .number()
      .int()
      .min(1)
      .max(10)
      .optional()
      .describe("Number of search results to return (1‑10). Defaults to 5."),
    explanation: z
      .string()
      .describe(
        "One sentence explanation as to why this tool is being used, and how it contributes to the goal.",
      ),
  }),
  execute: async ({ query, numResults = 5 }) => {
    // --- Validate environment ------------------------------------------------
    const GOOGLE_CLOUD_API_KEY = Deno.env.get("GOOGLE_CLOUD_API_KEY")!;
    const GOOGLE_CUSTOM_SEARCH_ENGINE_ID = Deno.env.get("GOOGLE_CUSTOM_SEARCH_ENGINE_ID")!;

    if (!GOOGLE_CLOUD_API_KEY || !GOOGLE_CUSTOM_SEARCH_ENGINE_ID) {
      return "Error: GCSE_API_KEY or GCSE_CX environment variables are not set.";
    }

    // --- Build the request ---------------------------------------------------
    const params = new URLSearchParams({
      key: GOOGLE_CLOUD_API_KEY,
      cx: GOOGLE_CUSTOM_SEARCH_ENGINE_ID,
      q: query,
      num: String(Math.min(numResults, 10)), // Google API allows up to 10 per request
    });

    const endpoint = `https://www.googleapis.com/customsearch/v1?${params.toString()}`;

    try {
      const res = await fetch(endpoint);

      if (!res.ok) {
        return `Search request failed with status ${res.status}: ${res.statusText}`;
      }

      const data: any = await res.json();

      // The "items" array holds individual search results according to the
      // documented response structure.
      if (!data.items || data.items.length === 0) {
        return "No results found.";
      }

      const results = data.items
        .slice(0, numResults)
        .map(
          (item: any, idx: number) =>
            `${idx + 1}. ${item.title}\n   ${item.link}`,
        )
        .join("\n\n");

      return `Top ${Math.min(numResults, data.items.length)} result(s):\n${results}`;
    } catch (error) {
      if (error instanceof Error) {
        return `Error while searching the web: ${error.message}`;
      }

      return "Unknown error occurred while searching the web.";
    }
  },
});
