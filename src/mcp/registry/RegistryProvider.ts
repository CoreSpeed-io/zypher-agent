/**
 * Interface that all registry providers must implement
 */
import type { McpServerEndpoint } from "../mod.ts";

export interface RegistryProvider {
  /** Unique identifier for this registry */
  readonly id: string;

  /** Human-readable name */
  readonly name: string;

  /**
   * List servers from this registry
   */
  list(options?: {
    limit?: number;
  }): Promise<RegistryListResult>;

  /**
   * Get full details for a specific server
   */
  get(serverId: string): Promise<McpServerEndpoint>;
}

export interface RegistryListResult {
  servers: McpServerEndpoint[];
  hasNextPage?: boolean;
  cursor?: string;
}
