import { z } from "zod";
import { createTool } from "./mod.ts";

/**
 * Semantic Scholar paper metadata
 */
interface SemanticScholarPaper {
  paperId: string;
  title: string;
  authors: Array<{ name: string; authorId?: string }>;
  abstract: string | null;
  year: number | null;
  venue: string | null;
  citationCount: number;
  referenceCount: number;
  influentialCitationCount: number;
  fieldsOfStudy: string[];
  url: string;
  openAccessPdf?: { url: string };
}

/**
 * Search papers on Semantic Scholar
 */
async function searchSemanticScholar(
  query: string,
  maxResults: number,
  fieldsOfStudy?: string[],
): Promise<SemanticScholarPaper[]> {
  const params = new URLSearchParams({
    query,
    limit: String(maxResults),
    fields: [
      "paperId",
      "title",
      "authors",
      "abstract",
      "year",
      "venue",
      "citationCount",
      "referenceCount",
      "influentialCitationCount",
      "fieldsOfStudy",
      "url",
      "openAccessPdf",
    ].join(","),
  });

  if (fieldsOfStudy && fieldsOfStudy.length > 0) {
    params.append("fieldsOfStudy", fieldsOfStudy.join(","));
  }

  const searchUrl = `https://api.semanticscholar.org/graph/v1/paper/search?${params}`;

  const response = await fetch(searchUrl, {
    headers: {
      "Accept": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Semantic Scholar API error: ${response.status} ${response.statusText}`,
    );
  }

  const data = await response.json();
  return data.data || [];
}

/**
 * Search papers by author
 */
async function searchPapersByAuthor(
  authorName: string,
  maxResults: number,
): Promise<SemanticScholarPaper[]> {
  // First, search for the author
  const authorSearchUrl = `https://api.semanticscholar.org/graph/v1/author/search?query=${
    encodeURIComponent(authorName)
  }&limit=1`;

  const authorResponse = await fetch(authorSearchUrl);

  if (!authorResponse.ok) {
    throw new Error(
      `Semantic Scholar author search error: ${authorResponse.status}`,
    );
  }

  const authorData = await authorResponse.json();
  const authors = authorData.data || [];

  if (authors.length === 0) {
    return [];
  }

  const authorId = authors[0].authorId;

  // Get author's papers
  const papersUrl =
    `https://api.semanticscholar.org/graph/v1/author/${authorId}/papers?limit=${maxResults}&fields=paperId,title,authors,abstract,year,venue,citationCount,referenceCount,influentialCitationCount,fieldsOfStudy,url,openAccessPdf`;

  const papersResponse = await fetch(papersUrl);

  if (!papersResponse.ok) {
    throw new Error(
      `Semantic Scholar papers fetch error: ${papersResponse.status}`,
    );
  }

  const papersData = await papersResponse.json();
  return papersData.data || [];
}

/**
 * Format Semantic Scholar search results
 */
function formatSemanticScholarResults(
  papers: SemanticScholarPaper[],
): string {
  if (papers.length === 0) {
    return "No papers found matching the search criteria.";
  }

  let result = `Found ${papers.length} papers on Semantic Scholar:\n\n`;

  papers.forEach((paper, index) => {
    result += `## Paper ${index + 1}\n\n`;
    result += `**Title**: ${paper.title}\n\n`;

    const authorNames = paper.authors.map((a) => a.name).join(", ");
    result += `**Authors**: ${authorNames}\n\n`;

    if (paper.year) {
      result += `**Year**: ${paper.year}\n\n`;
    }

    if (paper.venue) {
      result += `**Venue**: ${paper.venue}\n\n`;
    }

    if (paper.fieldsOfStudy && paper.fieldsOfStudy.length > 0) {
      result += `**Fields**: ${paper.fieldsOfStudy.join(", ")}\n\n`;
    }

    result += `**Citations**: ${paper.citationCount} (${paper.influentialCitationCount} influential)\n\n`;
    result += `**References**: ${paper.referenceCount}\n\n`;

    if (paper.abstract) {
      result += `**Abstract**: ${paper.abstract}\n\n`;
    } else {
      result += `**Abstract**: Not available\n\n`;
    }

    if (paper.openAccessPdf?.url) {
      result += `**PDF**: ${paper.openAccessPdf.url}\n\n`;
    }

    result += `**URL**: ${paper.url}\n\n`;
    result += `---\n\n`;
  });

  return result;
}

/**
 * Tool for searching papers on Semantic Scholar
 */
export const SemanticScholarSearchTool = createTool({
  name: "search_semantic_scholar",
  description:
    "Search for academic papers across all fields on Semantic Scholar. Returns papers with citation counts, influential citations, and open access PDFs when available. Covers computer science, biology, medicine, economics, and more.",
  schema: z.object({
    query: z.string().describe(
      "Search query keywords (e.g., 'neural networks', 'climate change', 'machine learning')",
    ),
    max_results: z.number().optional().default(10).describe(
      "Maximum number of papers to return (default: 10, max: 100)",
    ),
    fields_of_study: z.array(z.string()).optional().describe(
      "Filter by fields (e.g., ['Computer Science', 'Medicine', 'Biology'])",
    ),
  }),
  execute: async ({ query, max_results = 10, fields_of_study }) => {
    try {
      const limit = Math.min(Math.max(1, max_results), 100);

      console.log(
        `Searching Semantic Scholar for: "${query}" (max: ${limit} results)`,
      );

      if (fields_of_study && fields_of_study.length > 0) {
        console.log(`Filtering by fields: ${fields_of_study.join(", ")}`);
      }

      // Search Semantic Scholar
      const papers = await searchSemanticScholar(
        query,
        limit,
        fields_of_study,
      );

      console.log(`Found ${papers.length} papers`);

      // Format results
      const formattedResults = formatSemanticScholarResults(papers);

      return formattedResults;
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      console.error("Error searching Semantic Scholar:", errorMessage);
      return `Error searching Semantic Scholar: ${errorMessage}`;
    }
  },
});

/**
 * Tool for tracking specific author's papers
 */
export const TrackAuthorTool = createTool({
  name: "track_author_papers",
  description:
    "Track papers by a specific researcher/author on Semantic Scholar. Returns their recent publications with citation metrics. Use this to follow specific researchers you're interested in.",
  schema: z.object({
    author_name: z.string().describe(
      "Full name of the researcher (e.g., 'Geoffrey Hinton', 'Yoshua Bengio')",
    ),
    max_results: z.number().optional().default(10).describe(
      "Maximum number of papers to return (default: 10, max: 100)",
    ),
  }),
  execute: async ({ author_name, max_results = 10 }) => {
    try {
      const limit = Math.min(Math.max(1, max_results), 100);

      console.log(
        `Tracking papers by author: "${author_name}" (max: ${limit} results)`,
      );

      // Search by author
      const papers = await searchPapersByAuthor(author_name, limit);

      if (papers.length === 0) {
        return `No papers found for author "${author_name}". The author may not be in Semantic Scholar database, or the name might be spelled differently.`;
      }

      console.log(`Found ${papers.length} papers by ${author_name}`);

      // Format results
      let result =
        `Papers by ${author_name} (${papers.length} results):\n\n`;
      result += formatSemanticScholarResults(papers);

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      console.error("Error tracking author:", errorMessage);
      return `Error tracking author: ${errorMessage}`;
    }
  },
});
