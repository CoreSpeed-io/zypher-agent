
import { z } from 'zod';
import { defineTool } from './index';

type SearchResult = {
  file_path: string,
  text: string,
  score: number
}

type SearchResponse = {
  msg: string,
  data: {
    results: SearchResult[]
  }
  code: number
}

function formatSearchResult(result: SearchResult) {
  return `
    - file_path: ${result.file_path}
      content: ${result.text}
  `
}

export const WorkspaceSearchTool = defineTool({
  name: 'workspace_search',
  description:
    "Search the workspace with the query. Returen revelant content",
  parameters: z.object({
    query: z
      .string()
      .describe('The content you want to search in the workspace'),
  }),
  execute: async ({ query }) => {
    try {
      const url = `${process.env.CODEBASE_INDEXING_ENDPOINT}/v1/search`
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'User-Agent': 'ZypherAgent',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          top_k: 5,
          project_id: '' // TODO: get project id of current workspace
        }),
      });
      const data: SearchResponse = await response.json();
      if (data.code !== 0) {
        return "Tool call failed, casused by codebase_search tool internal error."
      } else if (data.data.results.length === 0) {
        return "No relevant content found."
      } else {
        return ["Found following revele" ,...data.data.results.map(formatSearchResult)].join("")
      }
    } catch (error) {
      return "Tool call failed."
    }
  },
});
