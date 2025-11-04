import { assertEquals, assertExists } from "@std/assert";
import {
  type CursorConfig,
  CursorConfigSchema,
  parseLocalServers,
} from "../src/mcp/types/cursor.ts";
import { extractConfigFromEndpoint } from "../src/mcp/utils/config.ts";

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

Deno.test("parseLocalServers converts CLI configuration correctly", () => {
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

  const servers = parseLocalServers(cliConfig);

  assertEquals(servers.length, 1);

  const server = servers[0];
  assertEquals(server.id, "test-cli");
  assertEquals(server.displayName, "test-cli");
  assertEquals(server.type, "command");

  if (server.type === "command") {
    assertEquals(server.command.command, "npx");
    assertEquals(server.command.args, [
      "-y",
      "@smithery/cli@latest",
      "run",
      "exa",
      "--key",
      "abc123",
    ]);
    assertEquals(server.command.env, {
      "API_KEY": "test-key",
      "NODE_ENV": "development",
    });
  }
});

Deno.test("parseLocalServers converts Remote configuration correctly", () => {
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

  const servers = parseLocalServers(remoteConfig);

  assertEquals(servers.length, 1);

  const server = servers[0];
  assertEquals(server.id, "test-remote");
  assertEquals(server.displayName, "test-remote");
  assertEquals(server.type, "remote");

  if (server.type === "remote") {
    assertEquals(server.remote.url, "https://api.example.com/mcp/my-server");
    assertEquals(server.remote.headers, {
      "Authorization": "Bearer token123",
      "Content-Type": "application/json",
    });
  }
});

Deno.test("parseLocalServers handles mixed CLI and Remote configurations", () => {
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

  const servers = parseLocalServers(mixedConfig);

  assertEquals(servers.length, 2);

  const cliServer = servers.find((s) => s.id === "cli-server");
  const remoteServer = servers.find((s) => s.id === "remote-server");

  assertExists(cliServer);
  assertExists(remoteServer);

  // Validate CLI server
  assertEquals(cliServer.type, "command");
  if (cliServer.type === "command") {
    assertEquals(cliServer.command.command, "python");
    assertEquals(cliServer.command.args, ["mcp-server.py", "--port", "3000"]);
  }

  // Validate Remote server
  assertEquals(remoteServer.type, "remote");
  if (remoteServer.type === "remote") {
    assertEquals(remoteServer.remote.url, "http://localhost:8080/mcp");
  }
});

Deno.test("parseLocalServers generates unique IDs for each server", () => {
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

  const servers = parseLocalServers(config);

  assertEquals(servers.length, 2);

  const ids = servers.map((s) => s.id);
  assertEquals(new Set(ids).size, 2, "All server IDs should be unique");
});

Deno.test("parseLocalServers handles configurations without environment variables", () => {
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

  const servers = parseLocalServers(config);

  assertEquals(servers.length, 2);

  for (const server of servers) {
    // Check CLI server
    if (server.id === "minimal-cli") {
      assertEquals(server.type, "command");
      if (server.type === "command") {
        assertEquals(server.command.command, "echo");
        assertEquals(server.command.args, ["hello"]);
      }
    }
    // Check Remote server
    if (server.id === "minimal-remote") {
      assertEquals(server.type, "remote");
      if (server.type === "remote") {
        assertEquals(server.remote.url, "https://example.com/mcp");
      }
    }
  }
});

Deno.test("parseLocalServers handles empty args array", () => {
  const config: CursorConfig = {
    mcpServers: {
      "no-args": {
        command: "python",
        args: [],
      },
    },
  };

  const servers = parseLocalServers(config);

  assertEquals(servers.length, 1);
  const server = servers[0];
  assertEquals(server.type, "command");
  if (server.type === "command") {
    assertEquals(server.command.args, []);
  }
});

Deno.test("extractConfigFromEndpoint converts CLI endpoint back to CursorServerConfig", () => {
  const endpoint = {
    id: "test-cli",
    displayName: "test-cli",
    type: "command" as const,
    command: {
      command: "npx",
      args: ["-y", "@smithery/cli@latest", "run", "exa"],
      env: {
        "API_KEY": "test-key",
        "NODE_ENV": "development",
      },
    },
  };

  const config = extractConfigFromEndpoint(endpoint);

  assertEquals("command" in config, true);
  if ("command" in config) {
    assertEquals(config.command, "npx");
    assertEquals(config.args, ["-y", "@smithery/cli@latest", "run", "exa"]);
    assertEquals(config.env?.API_KEY, "test-key");
    assertEquals(config.env?.NODE_ENV, "development");
  }
});

Deno.test("extractConfigFromEndpoint converts Remote endpoint back to CursorServerConfig", () => {
  const endpoint = {
    id: "test-remote",
    displayName: "test-remote",
    type: "remote" as const,
    remote: {
      url: "https://api.example.com/mcp/my-server",
      headers: {
        "Authorization": "Bearer token123",
      },
    },
  };

  const config = extractConfigFromEndpoint(endpoint);

  assertEquals("url" in config, true);
  if ("url" in config) {
    assertEquals(config.url, "https://api.example.com/mcp/my-server");
    assertEquals(config.headers?.Authorization, "Bearer token123");
  }
});

Deno.test("extractConfigFromEndpoint handles endpoint without environment variables", () => {
  const endpoint = {
    id: "minimal-cli",
    displayName: "minimal-cli",
    type: "command" as const,
    command: {
      command: "echo",
      args: ["hello"],
    },
  };

  const config = extractConfigFromEndpoint(endpoint);

  assertEquals("command" in config, true);
  if ("command" in config) {
    assertEquals(config.command, "echo");
    assertEquals(config.args, ["hello"]);
    assertEquals(config.env, undefined);
  }
});

Deno.test("Round-trip conversion: CursorConfig -> McpServerEndpoint -> CursorServerConfig", () => {
  const originalConfig = {
    mcpServers: {
      "test-cli": {
        command: "python",
        args: ["script.py", "--verbose"],
        env: {
          "PYTHON_PATH": "/usr/local/bin/python",
          "DEBUG": "true",
        },
      },
    },
  };

  // Forward conversion
  const endpoints = parseLocalServers(originalConfig);
  assertEquals(endpoints.length, 1);

  // Reverse conversion
  const extractedConfig = extractConfigFromEndpoint(endpoints[0]);

  // Verify round-trip
  assertEquals("command" in extractedConfig, true);
  if ("command" in extractedConfig) {
    assertEquals(extractedConfig.command, "python");
    assertEquals(extractedConfig.args, ["script.py", "--verbose"]);
    assertEquals(extractedConfig.env?.PYTHON_PATH, "/usr/local/bin/python");
    assertEquals(extractedConfig.env?.DEBUG, "true");
  }
});
