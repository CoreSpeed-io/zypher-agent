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
 * Extract text content from XML tag
 */
function extractTagContent(xml: string, tagName: string): string {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\/${tagName}>`, "i");
  const match = xml.match(regex);
  return match ? match[1].trim().replace(/\s+/g, " ") : "";
}

/**
 * Extract all matching tags
 */
function extractAllTags(xml: string, tagName: string): string[] {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\/${tagName}>`, "gi");
  const matches = xml.matchAll(regex);
  return Array.from(matches).map((m) => m[1].trim());
}

/**
 * Extract attribute from tag
 */
function extractAttribute(tag: string, attrName: string): string {
  const regex = new RegExp(`${attrName}="([^"]*)"`, "i");
  const match = tag.match(regex);
  return match ? match[1] : "";
}

/**
 * Parse arXiv API XML response using regex (Deno-compatible)
 */
function parseArXivResponse(xmlText: string): ArXivPaper[] {
  const papers: ArXivPaper[] = [];

  // Extract all <entry> blocks
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  const entryMatches = xmlText.matchAll(entryRegex);

  for (const entryMatch of entryMatches) {
    const entryXml = entryMatch[1];

    // Extract basic fields
    const id = extractTagContent(entryXml, "id");
    const title = extractTagContent(entryXml, "title");
    const summary = extractTagContent(entryXml, "summary");
    const published = extractTagContent(entryXml, "published");
    const updated = extractTagContent(entryXml, "updated");

    // Extract authors
    const authorBlocks = entryXml.matchAll(/<author>([\s\S]*?)<\/author>/g);
    const authors: string[] = [];
    for (const authorBlock of authorBlocks) {
      const name = extractTagContent(authorBlock[1], "name");
      if (name) authors.push(name);
    }

    // Extract categories
    const categoryMatches = entryXml.matchAll(/<category\s+([^>]*?)>/g);
    const categories: string[] = [];
    for (const catMatch of categoryMatches) {
      const term = extractAttribute(catMatch[1], "term");
      if (term) categories.push(term);
    }

    // Extract links
    const linkMatches = entryXml.matchAll(/<link\s+([^>]*?)\/>/g);
    let pdfUrl = "";
    let arxivUrl = "";

    for (const linkMatch of linkMatches) {
      const linkAttrs = linkMatch[1];
      const title = extractAttribute(linkAttrs, "title");
      const href = extractAttribute(linkAttrs, "href");

      if (title === "pdf") {
        pdfUrl = href;
      } else if (href.includes("arxiv.org/abs/")) {
        arxivUrl = href;
      }
    }

    // Only add if we have at least a title
    if (title) {
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
    }
  }

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
