import { assertEquals, assertThrows } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import type { ServerDetail } from "@corespeed/mcp-store-client/types";
import {
  buildArgs,
  buildCommand,
  buildEnv,
  convertServerDetailToEndpoint,
} from "../src/mcp/utils.ts";

// Helper to create minimal ServerDetail
const createServerDetail = (
  overrides: Partial<ServerDetail>,
): ServerDetail => ({
  id: "test-server",
  name: "Test Server",
  description: "Test description",
  repository: {
    id: "test-repo",
    url: "https://github.com/test/server",
    source: "github",
  },
  versionDetail: {
    version: "1.0.0",
    isLatest: true,
    releaseDate: "2024-01-01",
  },
  ...overrides,
});

describe("RegistryProvider - Data Conversion", () => {
  describe("convertServerDetailToEndpoint", () => {
    it("should convert remote server configuration", () => {
      const serverDetail = createServerDetail({
        id: "remote-server",
        name: "Remote MCP Server",
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
        id: "remote-server",
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
        name: "Remote MCP Server",
        remotes: [
          {
            url: "https://api.example.com/mcp",
            transportType: "sse",
          },
        ],
      });

      const result = convertServerDetailToEndpoint(serverDetail);

      assertEquals(result, {
        id: "remote-server",
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
        name: "NPM MCP Server",
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
        id: "npm-server",
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
        name: "NPM MCP Server",
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
        name: "Python MCP Server",
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
        id: "pypi-server",
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
        name: "UV MCP Server",
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
        id: "uv-server",
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
        name: "Docker MCP Server",
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
        id: "docker-server",
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
        name: "Hybrid Server",
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
        name: "Invalid Server",
      });

      assertThrows(
        () => convertServerDetailToEndpoint(serverDetail),
        Error,
        "has no valid remote or package configuration",
      );
    });
  });

  describe("buildCommand", () => {
    it("should return npx for npm registry", () => {
      const result = buildCommand({
        registryName: "npm",
        name: "test-package",
      });
      assertEquals(result, "npx");
    });

    it("should return python for pypi registry", () => {
      const result = buildCommand({
        registryName: "pypi",
        name: "test-package",
      });
      assertEquals(result, "python");
    });

    it("should return uvx for uv registry", () => {
      const result = buildCommand({
        registryName: "uv",
        name: "test-package",
      });
      assertEquals(result, "uvx");
    });

    it("should return docker for docker registry", () => {
      const result = buildCommand({
        registryName: "docker",
        name: "test-image",
      });
      assertEquals(result, "docker");
    });

    it("should throw error for unknown registry", () => {
      assertThrows(
        () =>
          buildCommand({
            registryName: "unknown",
            name: "test-package",
          }),
        Error,
        "Unsupported registry: unknown",
      );
    });

    it("should throw error when no registry specified", () => {
      assertThrows(
        () =>
          buildCommand({
            name: "test-package",
          }),
        Error,
        "Unsupported registry: undefined",
      );
    });
  });

  describe("buildArgs", () => {
    it("should build NPM args with version", () => {
      const result = buildArgs({
        registryName: "npm",
        name: "test-package",
        version: "1.0.0",
      });
      assertEquals(result, ["-y", "test-package@1.0.0"]);
    });

    it("should build NPM args without version", () => {
      const result = buildArgs({
        registryName: "npm",
        name: "test-package",
        version: "latest",
      });
      assertEquals(result, ["-y", "test-package@latest"]);
    });

    it("should build PyPI args", () => {
      const result = buildArgs({
        registryName: "pypi",
        name: "test-package",
        version: "1.0.0",
      });
      assertEquals(result, ["-m", "test-package"]);
    });

    it("should build uv args with version", () => {
      const result = buildArgs({
        registryName: "uv",
        name: "test-package",
        version: "1.0.0",
      });
      assertEquals(result, ["test-package@1.0.0"]);
    });

    it("should build uv args without version", () => {
      const result = buildArgs({
        registryName: "uv",
        name: "test-package",
        version: "latest",
      });
      assertEquals(result, ["test-package@latest"]);
    });

    it("should build docker args with tag", () => {
      const result = buildArgs({
        registryName: "docker",
        name: "test-image",
        version: "1.0.0",
      });
      assertEquals(result, ["run", "test-image:1.0.0"]);
    });

    it("should build docker args without tag", () => {
      const result = buildArgs({
        registryName: "docker",
        name: "test-image",
        version: "latest",
      });
      assertEquals(result, ["run", "test-image:latest"]);
    });

    it("should include package arguments", () => {
      const result = buildArgs({
        registryName: "npm",
        name: "test-package",
        version: "1.0.0",
        packageArguments: [
          { type: "positional", value: "--arg1" },
          { type: "positional", value: "--arg2" },
        ],
      });
      assertEquals(result, ["-y", "test-package@1.0.0", "--arg1", "--arg2"]);
    });

    it("should include runtime arguments", () => {
      const result = buildArgs({
        registryName: "npm",
        name: "test-package",
        version: "1.0.0",
        runtimeArguments: [
          { type: "positional", value: "--runtime1" },
          { type: "positional", value: "--runtime2" },
        ],
      });
      assertEquals(result, [
        "-y",
        "test-package@1.0.0",
        "--runtime1",
        "--runtime2",
      ]);
    });

    it("should filter out undefined argument values", () => {
      const result = buildArgs({
        registryName: "npm",
        name: "test-package",
        version: "1.0.0",
        packageArguments: [
          { type: "positional", value: "--arg1" },
          { type: "positional", value: undefined },
        ],
      });
      assertEquals(result, ["-y", "test-package@1.0.0", "--arg1"]);
    });
  });

  describe("buildEnv", () => {
    it("should build environment variables", () => {
      const result = buildEnv({
        registryName: "npm",
        name: "test-package",
        version: "1.0.0",
        environmentVariables: [
          { name: "VAR1", value: "value1" },
          { name: "VAR2", value: "value2" },
        ],
      });
      assertEquals(result, {
        "VAR1": "value1",
        "VAR2": "value2",
      });
    });

    it("should return undefined when no env vars", () => {
      const result = buildEnv({
        registryName: "npm",
        name: "test-package",
        version: "1.0.0",
      });
      assertEquals(result, undefined);
    });

    it("should return undefined for empty env vars array", () => {
      const result = buildEnv({
        registryName: "npm",
        name: "test-package",
        version: "1.0.0",
        environmentVariables: [],
      });
      assertEquals(result, undefined);
    });
  });
});
