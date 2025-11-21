import { z } from "zod";
import { createTool } from "./mod.ts";

/**
 * ArXiv paper metadata
 */
interface ArXivPaper {
  id: string;
  title: string;
  authors: string[];
  summary: string;
  published: string;
  updated: string;
  categories: string[];
  pdfUrl: string;
  arxivUrl: string;
}

/**
 * Parse arXiv API XML response
 */
function parseArXivResponse(xmlText: string): ArXivPaper[] {
  const papers: ArXivPaper[] = [];

  // Simple XML parsing using DOMParser
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "text/xml");

  const entries = doc.querySelectorAll("entry");

  entries.forEach((entry) => {
    const id = entry.querySelector("id")?.textContent?.trim() || "";
    const title = entry.querySelector("title")?.textContent?.trim().replace(/\s+/g, " ") || "";
    const summary = entry.querySelector("summary")?.textContent?.trim().replace(/\s+/g, " ") || "";
    const published = entry.querySelector("published")?.textContent?.trim() || "";
    const updated = entry.querySelector("updated")?.textContent?.trim() || "";

    // Extract authors
    const authorNodes = entry.querySelectorAll("author name");
    const authors = Array.from(authorNodes).map((node) =>
      node.textContent?.trim() || ""
    );

    // Extract categories
    const categoryNodes = entry.querySelectorAll("category");
    const categories = Array.from(categoryNodes).map((node) =>
      node.getAttribute("term") || ""
    );

    // Extract links
    const links = entry.querySelectorAll("link");
    let pdfUrl = "";
    let arxivUrl = "";

    links.forEach((link) => {
      const title = link.getAttribute("title");
      const href = link.getAttribute("href") || "";

      if (title === "pdf") {
        pdfUrl = href;
      } else if (!title && href.includes("arxiv.org/abs/")) {
        arxivUrl = href;
      }
    });

    papers.push({
      id,
      title,
      authors,
      summary,
      published,
      updated,
      categories,
      pdfUrl,
      arxivUrl,
    });
  });

  return papers;
}

/**
 * Format search results for LLM consumption
 */
function formatSearchResults(papers: ArXivPaper[]): string {
  if (papers.length === 0) {
    return "No papers found matching the search criteria.";
  }

  let result = `Found ${papers.length} papers:\n\n`;

  papers.forEach((paper, index) => {
    result += `## Paper ${index + 1}\n\n`;
    result += `**Title**: ${paper.title}\n\n`;
    result += `**Authors**: ${paper.authors.join(", ")}\n\n`;
    result += `**Published**: ${paper.published.split("T")[0]}\n\n`;
    result += `**Categories**: ${paper.categories.join(", ")}\n\n`;
    result += `**Summary**: ${paper.summary}\n\n`;
    result += `**PDF**: ${paper.pdfUrl}\n\n`;
    result += `**ArXiv URL**: ${paper.arxivUrl}\n\n`;
    result += `---\n\n`;
  });

  return result;
}

/**
 * Tool for searching academic papers on arXiv
 */
export const ArXivSearchTool = createTool({
  name: "search_arxiv_papers",
  description: "Search for academic papers on arXiv by keywords. Returns recent papers with titles, authors, abstracts, and publication dates. Use this to find research papers on specific topics.",
  schema: z.object({
    query: z.string().describe("Search query keywords (e.g., 'machine learning', 'quantum computing', 'climate change')"),
    max_results: z.number().optional().default(10).describe("Maximum number of papers to return (default: 10, max: 50)"),
    sort_by: z.enum(["relevance", "lastUpdatedDate", "submittedDate"]).optional().default("relevance").describe("Sort order for results"),
  }),
  execute: async ({ query, max_results = 10, sort_by = "relevance" }) => {
    try {
      // Validate max_results
      const limit = Math.min(Math.max(1, max_results), 50);

      // Build arXiv API URL
      const searchQuery = encodeURIComponent(query);
      const sortByParam = sort_by === "relevance" ? "relevance" : sort_by;
      const apiUrl = `http://export.arxiv.org/api/query?search_query=all:${searchQuery}&start=0&max_results=${limit}&sortBy=${sortByParam}&sortOrder=descending`;

      console.log(`Searching arXiv for: "${query}" (max: ${limit} results, sort: ${sort_by})`);

      // Fetch from arXiv API
      const response = await fetch(apiUrl);

      if (!response.ok) {
        throw new Error(`arXiv API request failed: ${response.status} ${response.statusText}`);
      }

      const xmlText = await response.text();

      // Parse XML response
      const papers = parseArXivResponse(xmlText);

      console.log(`Found ${papers.length} papers`);

      // Format results
      const formattedResults = formatSearchResults(papers);

      return formattedResults;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("Error searching arXiv:", errorMessage);
      return `Error searching arXiv: ${errorMessage}`;
    }
  },
});
