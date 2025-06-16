import { assertEquals, assertExists } from "@std/assert";
import {
  type CursorConfig,
  CursorConfigSchema,
  parseLocalServers,
} from "../src/mcp/types/cursor.ts";
import { LocalServerSchema } from "../src/mcp/types/local.ts";
import { ArgumentType } from "../src/mcp/types/store.ts";

Deno.test("CursorConfigSchema validates CLI configuration", () => {
  const cliConfig = {
    mcpServers: {
      "test-cli": {
        command: "npx",
        args: ["-y", "@smithery/cli@latest", "run", "exa"],
        env: {
          "API_KEY": "test-key",
        },
      },
    },
  };

  const validation = CursorConfigSchema.safeParse(cliConfig);
  assertEquals(validation.success, true);
});

Deno.test("CursorConfigSchema validates Remote configuration", () => {
  const remoteConfig = {
    mcpServers: {
      "test-remote": {
        url: "https://api.example.com/mcp/my-server",
        headers: {
          "Authorization": "Bearer token123",
        },
        env: {
          "DATABASE_URL": "postgresql://localhost:5432/db",
        },
      },
    },
  };

  const validation = CursorConfigSchema.safeParse(remoteConfig);
  assertEquals(validation.success, true);
});

Deno.test("CursorConfigSchema rejects invalid configuration", () => {
  const invalidConfig = {
    mcpServers: {
      "invalid": {
        // Missing both command+args and url
      },
    },
  };

  const validation = CursorConfigSchema.safeParse(invalidConfig);
  assertEquals(validation.success, false);
});

Deno.test("CursorConfigSchema rejects malformed URL", () => {
  const malformedUrlConfig = {
    mcpServers: {
      "bad-url": {
        url: "not-a-valid-url",
      },
    },
  };

  const validation = CursorConfigSchema.safeParse(malformedUrlConfig);
  assertEquals(validation.success, false);
});

Deno.test("CursorConfigSchema rejects empty command", () => {
  const emptyCommandConfig = {
    mcpServers: {
      "empty-cmd": {
        command: "",
        args: ["test"],
      },
    },
  };

  const validation = CursorConfigSchema.safeParse(emptyCommandConfig);
  assertEquals(validation.success, false);
});

Deno.test("parseLocalServers converts CLI configuration correctly", async () => {
  const cliConfig: CursorConfig = {
    mcpServers: {
      "test-cli": {
        command: "npx",
        args: ["-y", "@smithery/cli@latest", "run", "exa", "--key", "abc123"],
        env: {
          "API_KEY": "test-key",
          "NODE_ENV": "development",
        },
      },
    },
  };

  const servers = await parseLocalServers(cliConfig);

  assertEquals(servers.length, 1);

  const server = servers[0];
  assertEquals(server.name, "test-cli");
  assertEquals(server.description, "user-defined MCP server");
  assertEquals(server.packages?.[0]?.registryName, "npx");
  assertEquals(server.packages?.[0]?.packageArguments?.length, 6);
  assertEquals(
    server.packages?.[0]?.packageArguments?.[0]?.type,
    ArgumentType.POSITIONAL,
  );
  assertEquals(server.packages?.[0]?.environmentVariables?.length, 2);

  // Validate output conforms to LocalServer schema
  const validation = LocalServerSchema.safeParse(server);
  assertEquals(validation.success, true);
});

Deno.test("parseLocalServers converts Remote configuration correctly", async () => {
  const remoteConfig: CursorConfig = {
    mcpServers: {
      "test-remote": {
        url: "https://api.example.com/mcp/my-server",
        headers: {
          "Authorization": "Bearer token123",
          "Content-Type": "application/json",
        },
        env: {
          "DATABASE_URL": "postgresql://localhost:5432/db",
        },
      },
    },
  };

  const servers = await parseLocalServers(remoteConfig);

  assertEquals(servers.length, 1);

  const server = servers[0];
  assertEquals(server.name, "test-remote");
  assertEquals(server.description, "user-defined MCP server");
  assertEquals(
    server.packages?.[0]?.registryName,
    "https://api.example.com/mcp/my-server",
  );
  assertEquals(server.packages?.[0]?.packageArguments?.length, 0); // Remote should have no args
  assertEquals(server.packages?.[0]?.environmentVariables?.length, 1);

  // Validate output conforms to LocalServer schema
  const validation = LocalServerSchema.safeParse(server);
  assertEquals(validation.success, true);
});

Deno.test("parseLocalServers handles mixed CLI and Remote configurations", async () => {
  const mixedConfig: CursorConfig = {
    mcpServers: {
      "cli-server": {
        command: "python",
        args: ["mcp-server.py", "--port", "3000"],
        env: {
          "PYTHON_PATH": "/usr/local/bin/python",
        },
      },
      "remote-server": {
        url: "http://localhost:8080/mcp",
        headers: {
          "X-API-Key": "secret",
        },
      },
    },
  };

  const servers = await parseLocalServers(mixedConfig);

  assertEquals(servers.length, 2);

  const cliServer = servers.find((s) => s.name === "cli-server");
  const remoteServer = servers.find((s) => s.name === "remote-server");

  assertExists(cliServer);
  assertExists(remoteServer);

  // Validate CLI server
  assertEquals(cliServer.packages?.[0]?.registryName, "python");
  assertEquals(cliServer.packages?.[0]?.packageArguments?.length, 3);

  // Validate Remote server
  assertEquals(
    remoteServer.packages?.[0]?.registryName,
    "http://localhost:8080/mcp",
  );
  assertEquals(remoteServer.packages?.[0]?.packageArguments?.length, 0);

  // Validate both outputs conform to LocalServer schema
  for (const server of servers) {
    const validation = LocalServerSchema.safeParse(server);
    assertEquals(
      validation.success,
      true,
      `Server ${server.name} should be valid LocalServer`,
    );
  }
});

Deno.test("parseLocalServers generates unique IDs for each server", async () => {
  const config: CursorConfig = {
    mcpServers: {
      "server1": {
        command: "python",
        args: ["script1.py"],
      },
      "server2": {
        command: "node",
        args: ["script2.js"],
      },
    },
  };

  const servers = await parseLocalServers(config);

  assertEquals(servers.length, 2);

  const ids = servers.map((s) => s._id);
  assertEquals(new Set(ids).size, 2, "All server IDs should be unique");

  // Validate ID format (should be UUID)
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  for (const id of ids) {
    assertEquals(uuidRegex.test(id), true, `ID should be valid UUID: ${id}`);
  }
});

Deno.test("parseLocalServers handles configurations without environment variables", async () => {
  const config: CursorConfig = {
    mcpServers: {
      "minimal-cli": {
        command: "echo",
        args: ["hello"],
      },
      "minimal-remote": {
        url: "https://example.com/mcp",
      },
    },
  };

  const servers = await parseLocalServers(config);

  assertEquals(servers.length, 2);

  for (const server of servers) {
    assertEquals(server.packages?.[0]?.environmentVariables?.length, 0);

    const validation = LocalServerSchema.safeParse(server);
    assertEquals(validation.success, true);
  }
});

Deno.test("parseLocalServers handles empty args array", async () => {
  const config: CursorConfig = {
    mcpServers: {
      "no-args": {
        command: "python",
        args: [],
      },
    },
  };

  const servers = await parseLocalServers(config);

  assertEquals(servers.length, 1);
  assertEquals(servers[0].packages?.[0]?.packageArguments?.length, 0);

  const validation = LocalServerSchema.safeParse(servers[0]);
  assertEquals(validation.success, true);
});
