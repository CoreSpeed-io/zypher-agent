import { z } from "zod";
import { createTool } from "./mod.ts";

/**
 * OpenAlex paper metadata
 */
interface OpenAlexPaper {
  id: string;
  doi?: string;
  title: string;
  authors: Array<{ name: string; institution?: string }>;
  abstract?: string;
  published: string;
  journal?: string;
  type: string;
  openAccessUrl?: string;
  citations: number;
  concepts: Array<{ name: string; score: number }>;
  url: string;
}

/**
 * Parse OpenAlex API JSON response
 */
function parseOpenAlexResponse(data: any): OpenAlexPaper[] {
  const papers: OpenAlexPaper[] = [];

  if (!data.results || !Array.isArray(data.results)) {
    return papers;
  }

  for (const item of data.results) {
    try {
      // Extract title
      const title = item.title || "";

      // Extract authors with institutions
      const authors: Array<{ name: string; institution?: string }> = [];
      if (Array.isArray(item.authorships)) {
        for (const authorship of item.authorships) {
          const name = authorship.author?.display_name || "";
          const institution = authorship.institutions?.[0]?.display_name;
          if (name) {
            authors.push({ name, institution });
          }
        }
      }

      // Extract publication date
      const published = item.publication_date || "";

      // Extract abstract (inverted index format)
      let abstract: string | undefined;
      if (item.abstract_inverted_index) {
        abstract = reconstructAbstract(item.abstract_inverted_index);
      }

      // Extract journal/venue
      const journal = item.primary_location?.source?.display_name;

      // Extract DOI
      const doi = item.doi?.replace("https://doi.org/", "");

      // Extract Open Access URL
      const openAccessUrl = item.open_access?.oa_url ||
        item.primary_location?.pdf_url ||
        item.best_oa_location?.pdf_url;

      // Extract concepts (topics)
      const concepts: Array<{ name: string; score: number }> = [];
      if (Array.isArray(item.concepts)) {
        for (const concept of item.concepts.slice(0, 5)) {
          concepts.push({
            name: concept.display_name || "",
            score: concept.score || 0,
          });
        }
      }

      papers.push({
        id: item.id || "",
        doi,
        title,
        authors,
        abstract,
        published,
        journal,
        type: item.type || "unknown",
        openAccessUrl,
        citations: item.cited_by_count || 0,
        concepts,
        url: item.id || `https://openalex.org/${item.id}`,
      });
    } catch (error) {
      console.error("Error parsing OpenAlex item:", error);
      continue;
    }
  }

  return papers;
}

/**
 * Reconstruct abstract from inverted index
 */
function reconstructAbstract(invertedIndex: Record<string, number[]>): string {
  const words: Array<[string, number]> = [];

  for (const [word, positions] of Object.entries(invertedIndex)) {
    for (const pos of positions) {
      words.push([word, pos]);
    }
  }

  // Sort by position
  words.sort((a, b) => a[1] - b[1]);

  // Join words (limit to first 500 words for brevity)
  const abstract = words.slice(0, 500).map((w) => w[0]).join(" ");

  return abstract.length > 1000 ? abstract.substring(0, 1000) + "..." : abstract;
}

/**
 * Format search results for LLM consumption
 */
function formatSearchResults(papers: OpenAlexPaper[]): string {
  if (papers.length === 0) {
    return "No papers found matching the search criteria.";
  }

  let result = `Found ${papers.length} papers from OpenAlex:\n\n`;

  papers.forEach((paper, index) => {
    result += `## Paper ${index + 1}\n\n`;
    result += `**Title**: ${paper.title}\n\n`;

    // Format authors with institutions
    const authorStrings = paper.authors.map((a) =>
      a.institution ? `${a.name} (${a.institution})` : a.name
    );
    result += `**Authors**: ${authorStrings.join(", ")}\n\n`;

    result += `**Published**: ${paper.published}\n\n`;

    if (paper.journal) {
      result += `**Journal/Venue**: ${paper.journal}\n\n`;
    }

    result += `**Citations**: ${paper.citations}\n\n`;

    // Add concepts/topics
    if (paper.concepts.length > 0) {
      const conceptStrings = paper.concepts.map((c) =>
        `${c.name} (${(c.score * 100).toFixed(0)}%)`
      );
      result += `**Topics**: ${conceptStrings.join(", ")}\n\n`;
    }

    if (paper.abstract) {
      result += `**Abstract**: ${paper.abstract}\n\n`;
    }

    if (paper.doi) {
      result += `**DOI**: ${paper.doi}\n\n`;
    }

    if (paper.openAccessUrl) {
      result += `**Open Access PDF**: ${paper.openAccessUrl}\n\n`;
    }

    result += `**OpenAlex URL**: ${paper.url}\n\n`;
    result += `---\n\n`;
  });

  return result;
}

/**
 * Tool for searching academic papers on OpenAlex (comprehensive scholarly graph)
 */
export const OpenAlexSearchTool = createTool({
  name: "search_openalex_papers",
  description:
    "Search the OpenAlex scholarly graph for academic papers across all disciplines. Includes citation counts, author institutions, research topics, and open access links. Best for comprehensive research across all fields with rich metadata.",
  schema: z.object({
    query: z.string().describe(
      "Search query keywords (e.g., 'neural networks', 'climate modeling', 'gene therapy')",
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
    open_access_only: z.boolean().optional().default(false).describe(
      "Only return papers with open access PDFs available",
    ),
  }),
  execute: async (
    { query, max_results = 10, sort = "relevance", filter_year, open_access_only },
  ) => {
    try {
      // Validate max_results
      const limit = Math.min(Math.max(1, max_results), 100);

      // Build OpenAlex API URL
      const baseUrl = "https://api.openalex.org/works";
      const params = new URLSearchParams({
        search: query,
        per_page: limit.toString(),
      });

      // Add sorting
      if (sort === "published") {
        params.append("sort", "publication_date:desc");
      } else if (sort === "citations") {
        params.append("sort", "cited_by_count:desc");
      }
      // Default is relevance (no sort param needed)

      // Build filter string
      const filters: string[] = [];

      if (filter_year) {
        filters.push(`from_publication_date:${filter_year}-01-01`);
      }

      if (open_access_only) {
        filters.push("is_oa:true");
      }

      if (filters.length > 0) {
        params.append("filter", filters.join(","));
      }

      const apiUrl = `${baseUrl}?${params}`;

      console.log(
        `Searching OpenAlex for: "${query}" (max: ${limit} results, sort: ${sort})`,
      );

      // Fetch from OpenAlex API
      const response = await fetch(apiUrl, {
        headers: {
          "User-Agent": "Zypher-Agent/1.0 (mailto:research@example.com)",
        },
      });

      if (!response.ok) {
        throw new Error(
          `OpenAlex API request failed: ${response.status} ${response.statusText}`,
        );
      }

      const data = await response.json();

      // Parse JSON response
      const papers = parseOpenAlexResponse(data);

      console.log(`Found ${papers.length} papers`);

      // Format results
      const formattedResults = formatSearchResults(papers);

      return formattedResults;
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      console.error("Error searching OpenAlex:", errorMessage);
      return `Error searching OpenAlex: ${errorMessage}`;
    }
  },
});
