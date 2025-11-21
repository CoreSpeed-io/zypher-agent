import { z } from "zod";
import { createTool } from "./mod.ts";

/**
 * PubMed paper metadata
 */
interface PubMedPaper {
  pmid: string;
  title: string;
  authors: string[];
  abstract: string;
  journal: string;
  pubDate: string;
  doi?: string;
  pmcid?: string;
  url: string;
}

/**
 * Search PubMed and get PMIDs
 */
async function searchPubMed(
  query: string,
  maxResults: number,
  sortBy: string,
): Promise<string[]> {
  const searchUrl =
    `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${
      encodeURIComponent(query)
    }&retmax=${maxResults}&retmode=json&sort=${sortBy}`;

  const response = await fetch(searchUrl);

  if (!response.ok) {
    throw new Error(
      `PubMed search API error: ${response.status} ${response.statusText}`,
    );
  }

  const data = await response.json();
  return data.esearchresult?.idlist || [];
}

/**
 * Fetch paper details from PubMed
 */
async function fetchPubMedDetails(pmids: string[]): Promise<PubMedPaper[]> {
  if (pmids.length === 0) return [];

  const fetchUrl =
    `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${
      pmids.join(",")
    }&retmode=xml`;

  const response = await fetch(fetchUrl);

  if (!response.ok) {
    throw new Error(
      `PubMed fetch API error: ${response.status} ${response.statusText}`,
    );
  }

  const xmlText = await response.text();
  return parsePubMedXML(xmlText);
}

/**
 * Parse PubMed XML response
 */
function parsePubMedXML(xmlText: string): PubMedPaper[] {
  const papers: PubMedPaper[] = [];

  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "text/xml");

  const articles = doc.querySelectorAll("PubmedArticle");

  articles.forEach((article) => {
    try {
      const pmid = article.querySelector("PMID")?.textContent?.trim() || "";

      const titleNode = article.querySelector("ArticleTitle");
      const title = titleNode?.textContent?.trim() || "No title";

      // Extract authors
      const authorNodes = article.querySelectorAll("Author");
      const authors = Array.from(authorNodes).map((author) => {
        const lastName = author.querySelector("LastName")?.textContent?.trim() ||
          "";
        const foreName = author.querySelector("ForeName")?.textContent?.trim() ||
          "";
        return `${foreName} ${lastName}`.trim();
      }).filter((name) => name.length > 0);

      // Extract abstract
      const abstractNodes = article.querySelectorAll("AbstractText");
      const abstract = Array.from(abstractNodes)
        .map((node) => node.textContent?.trim() || "")
        .join(" ")
        .replace(/\s+/g, " ") || "No abstract available";

      // Extract journal
      const journal = article.querySelector("Title")?.textContent?.trim() ||
        "Unknown Journal";

      // Extract publication date
      const pubDateNode = article.querySelector("PubDate");
      const year = pubDateNode?.querySelector("Year")?.textContent || "";
      const month = pubDateNode?.querySelector("Month")?.textContent || "";
      const day = pubDateNode?.querySelector("Day")?.textContent || "";
      const pubDate = [year, month, day].filter(Boolean).join("-");

      // Extract DOI
      const doiNode = Array.from(article.querySelectorAll("ArticleId")).find(
        (node) => node.getAttribute("IdType") === "doi",
      );
      const doi = doiNode?.textContent?.trim();

      // Extract PMC ID
      const pmcNode = Array.from(article.querySelectorAll("ArticleId")).find(
        (node) => node.getAttribute("IdType") === "pmc",
      );
      const pmcid = pmcNode?.textContent?.trim();

      const url = `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;

      papers.push({
        pmid,
        title,
        authors,
        abstract,
        journal,
        pubDate,
        doi,
        pmcid,
        url,
      });
    } catch (error) {
      console.error("Error parsing PubMed article:", error);
    }
  });

  return papers;
}

/**
 * Format PubMed search results
 */
function formatPubMedResults(papers: PubMedPaper[]): string {
  if (papers.length === 0) {
    return "No papers found matching the search criteria.";
  }

  let result = `Found ${papers.length} papers on PubMed:\n\n`;

  papers.forEach((paper, index) => {
    result += `## Paper ${index + 1}\n\n`;
    result += `**Title**: ${paper.title}\n\n`;
    result += `**Authors**: ${paper.authors.join(", ")}\n\n`;
    result += `**Journal**: ${paper.journal}\n\n`;
    result += `**Published**: ${paper.pubDate}\n\n`;
    result += `**PMID**: ${paper.pmid}\n\n`;

    if (paper.doi) {
      result += `**DOI**: ${paper.doi}\n\n`;
    }

    if (paper.pmcid) {
      result += `**PMC ID**: ${paper.pmcid}\n\n`;
    }

    result += `**Abstract**: ${paper.abstract}\n\n`;
    result += `**URL**: ${paper.url}\n\n`;
    result += `---\n\n`;
  });

  return result;
}

/**
 * Tool for searching biomedical papers on PubMed
 */
export const PubMedSearchTool = createTool({
  name: "search_pubmed_papers",
  description:
    "Search for biomedical and life sciences papers on PubMed (NCBI). Returns recent papers with titles, authors, abstracts, and publication details. Use this for medical, biological, and health-related research topics.",
  schema: z.object({
    query: z.string().describe(
      "Search query keywords (e.g., 'CRISPR gene editing', 'COVID-19 vaccine', 'cancer immunotherapy')",
    ),
    max_results: z.number().optional().default(10).describe(
      "Maximum number of papers to return (default: 10, max: 50)",
    ),
    sort_by: z.enum(["relevance", "pub_date"]).optional().default("relevance")
      .describe("Sort order: relevance or pub_date (publication date)"),
  }),
  execute: async ({ query, max_results = 10, sort_by = "relevance" }) => {
    try {
      const limit = Math.min(Math.max(1, max_results), 50);

      console.log(
        `Searching PubMed for: "${query}" (max: ${limit} results, sort: ${sort_by})`,
      );

      // Convert sort_by to PubMed API format
      const sortParam = sort_by === "pub_date" ? "pub+date" : "relevance";

      // Search PubMed
      const pmids = await searchPubMed(query, limit, sortParam);

      if (pmids.length === 0) {
        return "No papers found matching the search criteria.";
      }

      console.log(`Found ${pmids.length} papers, fetching details...`);

      // Fetch details
      const papers = await fetchPubMedDetails(pmids);

      console.log(`Successfully fetched details for ${papers.length} papers`);

      // Format results
      const formattedResults = formatPubMedResults(papers);

      return formattedResults;
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      console.error("Error searching PubMed:", errorMessage);
      return `Error searching PubMed: ${errorMessage}`;
    }
  },
});
