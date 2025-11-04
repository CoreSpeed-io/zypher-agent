/**
 * Registry provider for CoreSpeed MCP Store
 * This is the default registry provider for discovering MCP servers
 */
import { McpStoreClient } from "@corespeed/mcp-store-client";
import type { McpServerEndpoint } from "../mod.ts";
import { convertServerDetailToEndpoint } from "./utils.ts";

export class RegistryProvider {
  #client: McpStoreClient;

  constructor() {
    this.#client = new McpStoreClient({
      baseURL: Deno.env.get("MCP_STORE_BASE_URL"),
    });
  }

  /**
   * List servers from CoreSpeed registry
   * Pagination is enforced with default limit of 20 and offset of 0
   */
  async list(options?: {
    limit?: number;
    offset?: number;
    search?: string;
  }): Promise<RegistryListResult> {
    const response = await this.#client.v1.servers.list({
      limit: options?.limit ?? 20,
      offset: options?.offset ?? 0,
      search: options?.search,
    });

    const servers = response.data.map((serverDetail) =>
      convertServerDetailToEndpoint(serverDetail)
    );

    return {
      servers,
      hasNextPage: response.hasNextPage() ?? false,
    };
  }

  /**
   * Get a specific server by ID
   */
  async get(serverId: string): Promise<McpServerEndpoint> {
    const response = await this.#client.v1.servers.retrieve(serverId);
    return convertServerDetailToEndpoint(response.server);
  }
}

export interface RegistryListResult {
  servers: McpServerEndpoint[];
  hasNextPage?: boolean;
  cursor?: string;
}
