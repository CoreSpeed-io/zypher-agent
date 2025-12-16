/**
 * Integration tests for MCP transport functions
 *
 * These tests verify that the transport functions can successfully create
 * connections to MCP servers and handle various scenarios including errors
 * and cancellation.
 *
 * CLI Server Tests:
 * - Tests connection to real MCP servers via stdio transport
 * - Uses @modelcontextprotocol/server-everything for realistic testing
 * - Verifies error handling and abort signal support
 *
 * Remote Server Tests:
 * - Tests connection to MCP HTTP servers (when available)
 * - Set MCP_TEST_SERVER_URL environment variable to test against real server
 * - Example: MCP_TEST_SERVER_URL="http://localhost:8080/mcp" deno task test
 * - Includes error handling and abort signal tests
 */

import { afterEach, describe, test } from "@std/testing/bdd";
import { expect } from "@std/expect";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  connectToCliServer,
  connectToRemoteServer,
} from "@zypher/mcp/connect.ts";
import type { McpCommandConfig, McpRemoteConfig } from "@zypher/mcp/mod.ts";

describe("Transport Integration Tests", () => {
  let client: Client;

  afterEach(async () => {
    // Clean up client
    await client.close();
  });

  describe("connectToCliServer", () => {
    test("should connect to MCP server successfully", async () => {
      client = new Client({
        name: "test-client",
        version: "1.0.0",
      });

      const commandConfig: McpCommandConfig = {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-everything"],
      };

      await connectToCliServer(
        Deno.cwd(),
        client,
        commandConfig,
      );

      const toolResult = await client.listTools();
      expect(toolResult.tools.length).toBeGreaterThan(0);
    });

    test("should throw error for nonexistent command", async () => {
      client = new Client({
        name: "test-client",
        version: "1.0.0",
      });

      const commandConfig: McpCommandConfig = {
        command: "nonexistent-command-that-will-fail",
        args: [],
      };

      await expect(
        connectToCliServer(Deno.cwd(), client, commandConfig),
      ).rejects.toThrow();
    });

    test("should handle abort signal", async () => {
      client = new Client({
        name: "test-client",
        version: "1.0.0",
      });

      const commandConfig: McpCommandConfig = {
        command: "sleep",
        args: ["10"],
      };

      const abortController = new AbortController();

      // Abort after a short delay
      setTimeout(() => abortController.abort(), 100);

      await expect(
        connectToCliServer(Deno.cwd(), client, commandConfig, {
          signal: abortController.signal,
        }),
      ).rejects.toThrow("abort");
    });
  });

  describe("connectToRemoteServer", () => {
    test("should connect to MCP HTTP server when URL provided", {
      ignore: !Deno.env.get("MCP_TEST_SERVER_URL"),
    }, async () => {
      const testServerUrl = Deno.env.get("MCP_TEST_SERVER_URL")!;

      client = new Client({
        name: "test-client",
        version: "1.0.0",
      });

      const remoteConfig: McpRemoteConfig = {
        url: testServerUrl,
      };

      await connectToRemoteServer(client, remoteConfig);

      // Verify we can list tools from the connected server
      const toolResult = await client.listTools();
      expect(toolResult.tools.length).toBeGreaterThan(0);
    });

    test("should throw error for invalid URL", async () => {
      client = new Client({
        name: "test-client",
        version: "1.0.0",
      });

      const remoteConfig: McpRemoteConfig = {
        url: "http://localhost:9999/nonexistent-server",
      };

      await expect(
        connectToRemoteServer(client, remoteConfig),
        //match any error message that contains both "error" and "connection" words, regardless of order or case
      ).rejects.toThrow(/(?=.*error)(?=.*connection)/i);
    });

    test("should handle abort signal", async () => {
      client = new Client({
        name: "test-client",
        version: "1.0.0",
      });

      const remoteConfig: McpRemoteConfig = {
        url: "http://localhost:9999/mcp",
      };

      const abortController = new AbortController();

      // Abort immediately since we don't have a real server
      abortController.abort();

      await expect(
        connectToRemoteServer(client, remoteConfig, {
          signal: abortController.signal,
        }),
      ).rejects.toThrow("abort");
    });
  });
});
