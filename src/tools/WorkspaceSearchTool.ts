
import { z } from 'zod';
import { defineTool } from './index';
import { IndexingClient, WorkspaceIndexingManager } from '../WorkspaceIndexingManager';
import { getCurrentUserInfo } from '../utils';

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
      const clinet = new IndexingClient(process.env.CODEBASE_INDEXING_SERVICE_ENDPOINT);
      const manager = await WorkspaceIndexingManager.create(getCurrentUserInfo().workspacePath, clinet)
      if (manager.runningStatus === 'running') {
        return "workspace_search tool is still under initialization, please try again later."
      }
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
          project_id: manager.project_id // TODO: get project id of current workspace
        }),
      });
      const data: SearchResponse = await response.json();
      if (data.code !== 0) {
        return "Tool call failed, casused by codebase_search tool internal error."
      } else if (data.data.results.length === 0) {
        return "No relevant content found."
      } else {
        return ["Found following revelant content" ,...data.data.results.map(formatSearchResult)].join("\n")
      }
    } catch (error) {
      return "Tool call failed."
    }
  },
});
