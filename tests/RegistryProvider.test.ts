import { assertEquals, assertThrows } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import type { ServerDetail } from "@corespeed/mcp-store-client";
import { convertServerDetailToEndpoint } from "../src/mcp/utils.ts";

// Helper to create minimal ServerDetail
const createServerDetail = (
  overrides: Partial<ServerDetail>,
): ServerDetail => ({
  id: "test-server",
  scope: "test-scope",
  packageName: "test-package",
  displayName: "Test Server",
  description: "Test description",
  repository: {
    url: "https://github.com/test/server",
    source: "github",
  },
  version: "1.0.0",
  updatedAt: "2024-01-01T00:00:00Z",
  remotes: [],
  packages: [],
  ...overrides,
});

describe("RegistryProvider - Data Conversion", () => {
  describe("convertServerDetailToEndpoint", () => {
    it("should convert remote server configuration", () => {
      const serverDetail = createServerDetail({
        id: "remote-server",
        displayName: "Remote MCP Server",
        remotes: [
          {
            url: "https://api.example.com/mcp",
            transportType: "sse",
            headers: [
              { name: "Authorization", value: "Bearer token123" },
              { name: "X-Custom-Header", value: "custom-value" },
            ],
          },
        ],
      });

      const result = convertServerDetailToEndpoint(serverDetail);

      assertEquals(result, {
        id: "test-scope/test-package",
        displayName: "Remote MCP Server",
        type: "remote",
        remote: {
          url: "https://api.example.com/mcp",
          headers: {
            "Authorization": "Bearer token123",
            "X-Custom-Header": "custom-value",
          },
        },
      });
    });

    it("should convert remote server without headers", () => {
      const serverDetail = createServerDetail({
        id: "remote-server",
        displayName: "Remote MCP Server",
        remotes: [
          {
            url: "https://api.example.com/mcp",
            transportType: "sse",
          },
        ],
      });

      const result = convertServerDetailToEndpoint(serverDetail);

      assertEquals(result, {
        id: "test-scope/test-package",
        displayName: "Remote MCP Server",
        type: "remote",
        remote: {
          url: "https://api.example.com/mcp",
          headers: undefined,
        },
      });
    });

    it("should convert NPM package server", () => {
      const serverDetail = createServerDetail({
        id: "npm-server",
        displayName: "NPM MCP Server",
        packages: [
          {
            registryName: "npm",
            name: "@modelcontextprotocol/server-github",
            version: "1.0.0",
            packageArguments: [
              { type: "positional", value: "--arg1" },
            ],
            runtimeArguments: [
              { type: "positional", value: "--runtime-arg" },
            ],
            environmentVariables: [
              { name: "GITHUB_TOKEN", value: "token123" },
              { name: "DEBUG", value: "true" },
            ],
          },
        ],
      });

      const result = convertServerDetailToEndpoint(serverDetail);

      assertEquals(result, {
        id: "test-scope/test-package",
        displayName: "NPM MCP Server",
        type: "command",
        command: {
          command: "npx",
          args: [
            "-y",
            "@modelcontextprotocol/server-github@1.0.0",
            "--arg1",
            "--runtime-arg",
          ],
          env: {
            "GITHUB_TOKEN": "token123",
            "DEBUG": "true",
          },
        },
      });
    });

    it("should convert NPM package server without version", () => {
      const serverDetail = createServerDetail({
        id: "npm-server",
        displayName: "NPM MCP Server",
        packages: [
          {
            registryName: "npm",
            name: "@modelcontextprotocol/server-github",
            version: "latest",
          },
        ],
      });

      const result = convertServerDetailToEndpoint(serverDetail);

      assertEquals(result.type, "command");
      if (result.type === "command") {
        assertEquals(result.command.command, "npx");
        assertEquals(result.command.args?.[0], "-y");
      }
    });

    it("should convert PyPI package server", () => {
      const serverDetail = createServerDetail({
        id: "pypi-server",
        displayName: "Python MCP Server",
        packages: [
          {
            registryName: "pypi",
            name: "mcp-server-python",
            version: "1.0.0",
          },
        ],
      });

      const result = convertServerDetailToEndpoint(serverDetail);

      assertEquals(result, {
        id: "test-scope/test-package",
        displayName: "Python MCP Server",
        type: "command",
        command: {
          command: "python",
          args: ["-m", "mcp-server-python"],
          env: undefined,
        },
      });
    });

    it("should convert uv package server", () => {
      const serverDetail = createServerDetail({
        id: "uv-server",
        displayName: "UV MCP Server",
        packages: [
          {
            registryName: "uv",
            name: "mcp-server-uv",
            version: "1.0.0",
          },
        ],
      });

      const result = convertServerDetailToEndpoint(serverDetail);

      assertEquals(result, {
        id: "test-scope/test-package",
        displayName: "UV MCP Server",
        type: "command",
        command: {
          command: "uvx",
          args: ["mcp-server-uv@1.0.0"],
          env: undefined,
        },
      });
    });

    it("should convert docker package server", () => {
      const serverDetail = createServerDetail({
        id: "docker-server",
        displayName: "Docker MCP Server",
        packages: [
          {
            registryName: "docker",
            name: "mcp-server-image",
            version: "latest",
          },
        ],
      });

      const result = convertServerDetailToEndpoint(serverDetail);

      assertEquals(result, {
        id: "test-scope/test-package",
        displayName: "Docker MCP Server",
        type: "command",
        command: {
          command: "docker",
          args: ["run", "mcp-server-image:latest"],
          env: undefined,
        },
      });
    });

    it("should prefer remote over package configuration", () => {
      const serverDetail = createServerDetail({
        id: "hybrid-server",
        displayName: "Hybrid Server",
        remotes: [
          {
            url: "https://api.example.com/mcp",
            transportType: "sse",
          },
        ],
        packages: [
          {
            registryName: "npm",
            name: "some-package",
            version: "1.0.0",
          },
        ],
      });

      const result = convertServerDetailToEndpoint(serverDetail);

      assertEquals(result.type, "remote");
    });

    it("should throw error when no valid configuration exists", () => {
      const serverDetail = createServerDetail({
        id: "invalid-server",
        displayName: "Invalid Server",
      });

      assertThrows(
        () => convertServerDetailToEndpoint(serverDetail),
        Error,
        "has no valid remote or package configuration",
      );
    });
  });
});
