import { z } from "zod";
import { createTool } from "./mod.ts";

/**
 * CrossRef paper metadata
 */
interface CrossRefPaper {
  doi: string;
  title: string;
  authors: string[];
  abstract?: string;
  published: string;
  publisher: string;
  journal?: string;
  type: string;
  url: string;
  citations: number;
  references: number;
}

/**
 * Parse CrossRef API JSON response
 */
function parseCrossRefResponse(data: any): CrossRefPaper[] {
  const papers: CrossRefPaper[] = [];

  if (!data.message || !data.message.items) {
    return papers;
  }

  for (const item of data.message.items) {
    try {
      // Extract title
      const title = Array.isArray(item.title) && item.title.length > 0
        ? item.title[0]
        : "";

      // Extract authors
      const authors: string[] = [];
      if (Array.isArray(item.author)) {
        for (const author of item.author) {
          const name = [author.given, author.family]
            .filter(Boolean)
            .join(" ");
          if (name) authors.push(name);
        }
      }

      // Extract publication date
      let published = "";
      if (item["published-print"]?.["date-parts"]?.[0]) {
        const dateParts = item["published-print"]["date-parts"][0];
        published = dateParts.join("-");
      } else if (item["published-online"]?.["date-parts"]?.[0]) {
        const dateParts = item["published-online"]["date-parts"][0];
        published = dateParts.join("-");
      }

      // Extract abstract (if available)
      const abstract = item.abstract || undefined;

      // Extract journal name
      const journal = Array.isArray(item["container-title"]) &&
          item["container-title"].length > 0
        ? item["container-title"][0]
        : undefined;

      papers.push({
        doi: item.DOI || "",
        title,
        authors,
        abstract,
        published,
        publisher: item.publisher || "",
        journal,
        type: item.type || "unknown",
        url: item.URL || `https://doi.org/${item.DOI}`,
        citations: item["is-referenced-by-count"] || 0,
        references: item["references-count"] || 0,
      });
    } catch (error) {
      console.error("Error parsing CrossRef item:", error);
      continue;
    }
  }

  return papers;
}

/**
 * Format search results for LLM consumption
 */
function formatSearchResults(papers: CrossRefPaper[]): string {
  if (papers.length === 0) {
    return "No papers found matching the search criteria.";
  }

  let result = `Found ${papers.length} papers from CrossRef:\n\n`;

  papers.forEach((paper, index) => {
    result += `## Paper ${index + 1}\n\n`;
    result += `**Title**: ${paper.title}\n\n`;
    result += `**Authors**: ${paper.authors.join(", ")}\n\n`;
    result += `**Published**: ${paper.published}\n\n`;

    if (paper.journal) {
      result += `**Journal**: ${paper.journal}\n\n`;
    }

    result += `**Publisher**: ${paper.publisher}\n\n`;
    result += `**Type**: ${paper.type}\n\n`;
    result += `**Citations**: ${paper.citations}\n\n`;

    if (paper.abstract) {
      result += `**Abstract**: ${paper.abstract}\n\n`;
    }

    result += `**DOI**: ${paper.doi}\n\n`;
    result += `**URL**: ${paper.url}\n\n`;
    result += `---\n\n`;
  });

  return result;
}

/**
 * Tool for searching academic papers on CrossRef (cross-publisher database)
 */
export const CrossRefSearchTool = createTool({
  name: "search_crossref_papers",
  description:
    "Search for academic papers across all major publishers using CrossRef. Covers journals, books, and conference proceedings from all fields. Returns papers with DOI, citations, and metadata. Use this for comprehensive cross-publisher searches.",
  schema: z.object({
    query: z.string().describe(
      "Search query keywords (e.g., 'climate change', 'machine learning', 'cancer treatment')",
    ),
    max_results: z.number().optional().default(10).describe(
      "Maximum number of papers to return (default: 10, max: 100)",
    ),
    sort: z.enum(["relevance", "published", "citations"]).optional().default(
      "relevance",
    ).describe("Sort order for results"),
    filter_year: z.number().optional().describe(
      "Filter papers published after this year (e.g., 2020)",
    ),
  }),
  execute: async ({ query, max_results = 10, sort = "relevance", filter_year }) => {
    try {
      // Validate max_results
      const limit = Math.min(Math.max(1, max_results), 100);

      // Build CrossRef API URL
      const baseUrl = "https://api.crossref.org/works";
      const params = new URLSearchParams({
        query: query,
        rows: limit.toString(),
      });

      // Add sorting
      if (sort === "published") {
        params.append("sort", "published");
        params.append("order", "desc");
      } else if (sort === "citations") {
        params.append("sort", "is-referenced-by-count");
        params.append("order", "desc");
      } else {
        params.append("sort", "relevance");
      }

      // Add year filter if provided
      if (filter_year) {
        params.append("filter", `from-pub-date:${filter_year}`);
      }

      const apiUrl = `${baseUrl}?${params}`;

      console.log(
        `Searching CrossRef for: "${query}" (max: ${limit} results, sort: ${sort})`,
      );

      // Fetch from CrossRef API
      const response = await fetch(apiUrl, {
        headers: {
          "User-Agent": "Zypher-Agent/1.0 (mailto:research@example.com)",
        },
      });

      if (!response.ok) {
        throw new Error(
          `CrossRef API request failed: ${response.status} ${response.statusText}`,
        );
      }

      const data = await response.json();

      // Parse JSON response
      const papers = parseCrossRefResponse(data);

      console.log(`Found ${papers.length} papers`);

      // Format results
      const formattedResults = formatSearchResults(papers);

      return formattedResults;
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      console.error("Error searching CrossRef:", errorMessage);
      return `Error searching CrossRef: ${errorMessage}`;
    }
  },
});
