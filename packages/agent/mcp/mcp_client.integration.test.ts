import { expect } from "@std/expect";
import { afterEach, beforeAll, describe, test } from "@std/testing/bdd";
import { createZypherContext } from "../utils/mod.ts";
import type { ZypherContext } from "../zypher_agent.ts";
import { McpClient } from "./mcp_client.ts";
import type { McpServerEndpoint } from "./mod.ts";

describe("McpClient Integration Tests", () => {
  let client: McpClient;
  let context: ZypherContext;

  beforeAll(async () => {
    context = await createZypherContext(Deno.cwd());
  });

  afterEach(async () => {
    // Clean up client after each test
    await client.dispose();
  });

  test("should initialize client with correct initial state", () => {
    const endpoint: McpServerEndpoint = {
      id: "echo-server",
      displayName: "Echo Server",
      type: "command",
      command: {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-everything"],
      },
    };

    client = new McpClient(context, endpoint);

    expect(client.status).toBe("disconnected");
    expect(client.desiredEnabled).toBe(false);
    expect(client.connected).toBe(false);
    expect(client.toolCount).toBe(0);
    expect(client.tools).toEqual([]);
    expect(client.getTool("nonexistent")).toBeUndefined();
  });

  test("should handle desired state pattern correctly", async () => {
    const endpoint: McpServerEndpoint = {
      id: "test-server",
      type: "command",
      command: {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-everything"],
      },
    };

    client = new McpClient(context, endpoint);

    // Initially disconnected
    expect(client.status).toBe("disconnected");
    expect(client.desiredEnabled).toBe(false);

    // Set desired enabled - should be immediate
    client.desiredEnabled = true;
    expect(client.desiredEnabled).toBe(true);

    // Status should change to connecting, then connected
    expect(client.status).toBe("connecting");

    // Wait for connection to complete
    await client.waitForConnection();

    // Should eventually be connected
    expect(client.status).toBe("connected");
    expect(client.toolCount).toBeGreaterThan(0);
    expect(client.connected).toBe(true);
    expect(client.desiredEnabled).toBe(true);
  });

  test("should handle connection failure gracefully", async () => {
    const endpoint: McpServerEndpoint = {
      id: "failing-server",
      type: "command",
      command: {
        command: "nonexistent-command-that-will-fail",
        args: [],
      },
    };

    client = new McpClient(context, endpoint);

    // Enable the client
    client.desiredEnabled = true;
    expect(client.desiredEnabled).toBe(true);

    // Wait for connection attempt to fail
    await expect(client.waitForConnection()).rejects.toThrow(
      "nonexistent-command-that-will-fail",
    );

    // Should be in error state due to failure
    expect(client.status).toBe("error");
    expect(client.toolCount).toBe(0);
    expect(client.connected).toBe(false);
    expect(client.desiredEnabled).toBe(true);
  });

  test("should handle invalid empty command gracefully", async () => {
    const endpoint: McpServerEndpoint = {
      id: "invalid-command",
      type: "command",
      command: {
        command: "", // Invalid empty command
        args: [],
      },
    };

    client = new McpClient(context, endpoint);

    // This should not throw immediately
    client.desiredEnabled = true;

    // Wait for background reconciliation to fail
    await expect(client.waitForConnection()).rejects.toThrow(
      "The argument 'file' cannot be empty",
    );

    // Should be in error state due to failure
    expect(client.status).toBe("error");
  });

  test("should disable client correctly and clear tools", async () => {
    const endpoint: McpServerEndpoint = {
      id: "disable-test",
      type: "command",
      command: {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-everything"],
      },
    };

    client = new McpClient(context, endpoint);

    // Enable first
    client.desiredEnabled = true;
    expect(client.desiredEnabled).toBe(true);
    expect(client.status).toBe("connecting");

    await client.waitForConnection();

    expect(client.status).toBe("connected");
    expect(client.toolCount).toBeGreaterThan(0);
    expect(client.connected).toBe(true);

    // Then disable
    client.desiredEnabled = false;
    expect(client.desiredEnabled).toBe(false);

    // Wait for disconnection
    await new Promise((resolve) => setTimeout(resolve, 1000));

    expect(client.status).toBe("disconnected");
    expect(client.connected).toBe(false);
    expect(client.toolCount).toBe(0);
    expect(client.desiredEnabled).toBe(false);
  });

  test("should not change state when setting same desired enabled value", async () => {
    const endpoint: McpServerEndpoint = {
      id: "no-change-test",
      type: "command",
      command: {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-everything"],
      },
    };

    client = new McpClient(context, endpoint);

    // Initially false
    expect(client.desiredEnabled).toBe(false);
    expect(client.status).toBe("disconnected");

    // Set to false again - should be no-op
    client.desiredEnabled = false;
    expect(client.desiredEnabled).toBe(false);
    expect(client.status).toBe("disconnected");

    // Set to true
    client.desiredEnabled = true;
    expect(client.desiredEnabled).toBe(true);
    expect(client.status).toBe("connecting");

    // Set to true again (connecting state) - should be no-op
    client.desiredEnabled = true;
    expect(client.desiredEnabled).toBe(true);
    expect(client.status).toBe("connecting");

    // Wait for connection to complete
    await client.waitForConnection();

    // Connection should complete
    expect(client.status).toBe("connected");
    expect(client.toolCount).toBeGreaterThan(0);
    expect(client.connected).toBe(true);
    expect(client.desiredEnabled).toBe(true);

    // Set to true again (connected state) - should be no-op
    client.desiredEnabled = true;
    expect(client.desiredEnabled).toBe(true);
    expect(client.status).toBe("connected");

    // Wait a bit longer
    await new Promise((resolve) => setTimeout(resolve, 1000));

    expect(client.status).toBe("connected");
    expect(client.desiredEnabled).toBe(true);
  });
});
