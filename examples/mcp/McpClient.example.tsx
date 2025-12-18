/**
 * High-Level McpClient Example
 *
 * This example demonstrates how to use the high-level `McpClient` API to connect
 * to MCP servers. McpClient wraps the MCP SDK's `Client` with a state machine that
 * manages connection lifecycle, OAuth, reconnection, and exposes a simple
 * `desiredEnabled` API for control.
 *
 * This is the recommended approach for most use cases. For fine-grained control
 * over the connection and OAuth flow, see `connectToRemoteServer.example.ts`.
 *
 * Features demonstrated:
 * - State-aware connection controls (connect, disconnect, retry)
 * - Real-time status updates via RxJS observable
 * - Support for both local (command) and remote (HTTP/SSE) servers
 * - OAuth support for remote servers
 * - Interactive tool listing and execution
 */

import { Command } from "@cliffy/command";
import { useEffect, useState } from "react";
import { Box, render, Text, useApp, useInput, useStdout } from "ink";
import SelectInput from "ink-select-input";
import TextInput from "ink-text-input";
import { renderToStaticMarkup } from "react-dom/server";
import type { OAuthClientMetadata } from "@modelcontextprotocol/sdk/shared/auth.js";
import { matchesState, type StateValue } from "xstate";
import {
  Completer,
  createZypherContext,
  InMemoryOAuthProvider,
  McpClient,
  type McpClientStatus,
  type McpServerEndpoint,
  type OAuthCallbackHandler,
  type OAuthOptions,
} from "@zypher/agent";

// --- HTTP Server OAuth Provider ---

// OAuth callback page styles
const pageStyle: React.CSSProperties = {
  fontFamily: "system-ui",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  height: "100vh",
  margin: 0,
};

function OAuthSuccessPage() {
  return (
    <html>
      <head>
        <title>Authorization Successful</title>
      </head>
      <body style={pageStyle}>
        <div style={{ textAlign: "center" }}>
          <h1>✅ Authorization Successful</h1>
          <p>You can close this window and return to the terminal.</p>
        </div>
      </body>
    </html>
  );
}

function OAuthErrorPage({ error }: { error: string }) {
  return (
    <html>
      <head>
        <title>Authorization Failed</title>
      </head>
      <body style={pageStyle}>
        <div style={{ textAlign: "center" }}>
          <h1>❌ Authorization Failed</h1>
          <p>{error}</p>
          <p>You can close this window and return to the terminal.</p>
        </div>
      </body>
    </html>
  );
}

function renderHtmlResponse(element: React.ReactElement): Response {
  return new Response(`<!DOCTYPE html>${renderToStaticMarkup(element)}`, {
    headers: { "Content-Type": "text/html" },
  });
}

class HttpServerOAuthProvider extends InMemoryOAuthProvider
  implements OAuthCallbackHandler {
  #serverPortCompleter?: Completer<number>;

  constructor(clientMetadata: OAuthClientMetadata) {
    super({
      clientMetadata,
    });
  }

  override async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    this.#serverPortCompleter = new Completer<number>();
    const port = await this.#serverPortCompleter.wait(); // defer redirection until server is ready
    if (port === 0) {
      throw new Error("Failed to start OAuth callback server.");
    }
    const originalRedirectUri = authorizationUrl.searchParams.get(
      "redirect_uri",
    );
    if (!originalRedirectUri) {
      throw new Error("No redirect URI found in authorization URL.");
    }

    const redirectUri = new URL(
      "http://localhost:" + port,
      originalRedirectUri,
    );
    authorizationUrl.searchParams.set("redirect_uri", redirectUri.toString());

    // Open the authorization URL in the default browser
    const command = new Deno.Command("open", {
      args: [authorizationUrl.toString()],
    });
    await command.output();
  }

  async waitForCallback(): Promise<string> {
    const codeCompleter = new Completer<string>();
    const server = Deno.serve(
      {
        port: 0, // Let OS assign available port
        onListen: ({ port }) => {
          this.#serverPortCompleter?.resolve(port);
        },
      },
      (req) => {
        const url = new URL(req.url);

        if (url.pathname !== "/oauth/callback") {
          return new Response("Not Found", { status: 404 });
        }

        const code = url.searchParams.get("code");
        const error = url.searchParams.get("error");

        if (code) {
          codeCompleter.resolve(code);
          return renderHtmlResponse(<OAuthSuccessPage />);
        } else if (error) {
          const errorDesc = url.searchParams.get("error_description") ?? error;
          codeCompleter.reject(
            new Error(`OAuth authorization failed: ${errorDesc}`),
          );
          return renderHtmlResponse(<OAuthErrorPage error={errorDesc} />);
        } else {
          codeCompleter.reject(
            new Error("No authorization code found in callback"),
          );
          return new Response("Bad Request", { status: 400 });
        }
      },
    );

    try {
      return await codeCompleter.wait();
    } finally {
      await server.shutdown();
    }
  }
}

// --- Utility functions ---

function formatStatus(status: StateValue): string {
  if (typeof status === "string") {
    return status;
  }
  // For nested states, format as "parent.child"
  return Object.entries(status)
    .map(([key, value]) => `${key}.${formatStatus(value!)}`)
    .join(", ");
}

function getStatusColor(status: McpClientStatus): string {
  if (
    matchesState("disconnected", status) || matchesState("disposed", status)
  ) return "gray";
  if (matchesState("error", status)) return "red";
  if (matchesState("connecting", status)) return "yellow";
  if (matchesState("connected", status)) return "green";
  return "white";
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", { hour12: false });
}

type UserCommand =
  | "connect"
  | "disconnect"
  | "retry"
  | "list-tools"
  | "call-tool"
  | "quit";

interface UserCommandItem {
  label: string;
  value: UserCommand;
}

const USER_COMMANDS: Record<UserCommand, UserCommandItem> = {
  connect: { label: "🔌 Connect", value: "connect" },
  disconnect: { label: "🔌 Disconnect", value: "disconnect" },
  retry: { label: "🔄 Retry", value: "retry" },
  "list-tools": { label: "🔧 List tools", value: "list-tools" },
  "call-tool": { label: "⚡ Call tool", value: "call-tool" },
  quit: { label: "👋 Quit", value: "quit" },
};

function getAvailableCommands(status: McpClientStatus): UserCommandItem[] {
  const pick = (...keys: UserCommand[]) => keys.map((k) => USER_COMMANDS[k]);

  if (matchesState("disconnected", status)) return pick("connect", "quit");
  if (matchesState("error", status)) return pick("retry", "connect", "quit");
  if (matchesState("disposed", status)) return [];
  if (matchesState("connecting", status)) return pick("disconnect", "quit");
  if (matchesState("connected", status)) {
    return pick("disconnect", "list-tools", "call-tool", "quit");
  }
  return pick("quit");
}

// --- Log entry type ---

interface LogEntry {
  timestamp: Date;
  message: string;
  type: "info" | "warn" | "error" | "debug";
}

// --- Console hijacker hook ---

function useConsoleCapture(maxLogs = 100) {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const addLog = (type: LogEntry["type"], ...args: unknown[]) => {
    const message = args
      .map((arg) =>
        typeof arg === "string" ? arg : JSON.stringify(arg, null, 2)
      )
      .join(" ");
    setLogs((prev) =>
      [...prev, { timestamp: new Date(), message, type }].slice(-maxLogs)
    );
  };

  useEffect(() => {
    const originalConsole = {
      log: console.log,
      info: console.info,
      warn: console.warn,
      error: console.error,
      debug: console.debug,
    };

    console.log = (...args) => addLog("info", ...args);
    console.info = (...args) => addLog("info", ...args);
    console.warn = (...args) => addLog("warn", ...args);
    console.error = (...args) => addLog("error", ...args);
    console.debug = (...args) => addLog("debug", ...args);

    return () => {
      console.log = originalConsole.log;
      console.info = originalConsole.info;
      console.warn = originalConsole.warn;
      console.error = originalConsole.error;
      console.debug = originalConsole.debug;
    };
  }, []);

  return logs;
}

// --- View modes ---

type ViewMode =
  | { type: "menu" }
  | { type: "tools" }
  | { type: "call-tool-select" }
  | { type: "call-tool-input"; toolName: string }
  | { type: "oauth-waiting" };

// --- Main App Component ---

interface AppProps {
  client: McpClient;
  serverName: string;
}

function App({ client, serverName }: AppProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const logs = useConsoleCapture();
  const [status, setStatus] = useState<McpClientStatus>(client.status);
  const [viewMode, setViewMode] = useState<ViewMode>({ type: "menu" });
  const [toolInput, setToolInput] = useState("{}");

  // Derive OAuth waiting state from client status
  const isAwaitingOAuth = matchesState({ connecting: "awaitingOAuth" }, status);

  // Log initial state
  useEffect(() => {
    console.log(`Server: ${serverName}`);
    console.log(`Initial status: ${formatStatus(client.status)}`);
  }, [client, serverName]);

  // Switch view mode based on OAuth status
  useEffect(() => {
    if (isAwaitingOAuth) {
      setViewMode({ type: "oauth-waiting" });
    } else if (viewMode.type === "oauth-waiting") {
      setViewMode({ type: "menu" });
    }
  }, [isAwaitingOAuth, viewMode.type]);

  // Subscribe to status changes
  useEffect(() => {
    const subscription = client.status$.subscribe((newStatus) => {
      const prevFormatted = formatStatus(status);
      const newFormatted = formatStatus(newStatus);
      if (prevFormatted !== newFormatted) {
        console.log(`<status> ${prevFormatted} → ${newFormatted}`);
      }
      setStatus(newStatus);
    });
    return () => subscription.unsubscribe();
  }, [client, status]);

  // Handle escape key to go back
  useInput((_input, key) => {
    if (key.escape && viewMode.type !== "menu") {
      setViewMode({ type: "menu" });
    }
  });

  const handleCommand = async (item: UserCommandItem) => {
    switch (item.value) {
      case "connect":
        console.log("Connecting...");
        client.desiredEnabled = true;
        break;

      case "disconnect":
        console.log("Disconnecting...");
        client.desiredEnabled = false;
        break;

      case "retry":
        console.log("Retrying...");
        client.retry();
        break;

      case "list-tools":
        setViewMode({ type: "tools" });
        break;

      case "call-tool":
        if (client.tools.length === 0) {
          console.error("No tools available");
        } else {
          setViewMode({ type: "call-tool-select" });
        }
        break;

      case "quit":
        if (client.status !== "disposed") {
          console.log("Disposing client...");
          await client.dispose();
        }
        exit();
        break;
    }
  };

  const handleToolSelect = (item: { label: string; value: string }) => {
    setToolInput("{}");
    setViewMode({ type: "call-tool-input", toolName: item.value });
  };

  const handleToolCall = async (toolName: string) => {
    try {
      const input = JSON.parse(toolInput);
      console.log(`Calling ${toolName}...`);
      const result = await client.executeToolCall({ name: toolName, input });
      console.log(`Result: ${JSON.stringify(result, null, 2)}`);
    } catch (e) {
      console.error(`Error: ${e instanceof Error ? e.message : e}`);
    }
    setViewMode({ type: "menu" });
  };

  const commands = getAvailableCommands(status);
  const tools = client.tools;

  return (
    <Box flexDirection="column" padding={1} height={stdout.rows}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold>🔗 MCP Client Example</Text>
        <Text></Text>
        <Text color={getStatusColor(status)}>[{formatStatus(status)}]</Text>
      </Box>

      {/* Logs */}
      <Box
        flexDirection="column"
        flexGrow={1}
        minHeight={10}
        borderStyle="single"
        borderColor="gray"
        paddingX={1}
        marginBottom={1}
        overflow="hidden"
      >
        {logs.slice(-50).map((log: LogEntry, i: number) => (
          <Box key={i}>
            <Text
              color={log.type === "error"
                ? "red"
                : log.type === "warn"
                ? "yellow"
                : log.type === "debug"
                ? "gray"
                : "white"}
            >
              <Text dimColor>[{formatTime(log.timestamp)}]</Text> {log.message}
            </Text>
          </Box>
        ))}
      </Box>

      {/* Menu */}
      {viewMode.type === "menu" && (
        <Box flexDirection="column">
          <Text dimColor>Select action (↑↓ to navigate, Enter to select):</Text>
          <SelectInput items={commands} onSelect={handleCommand} />
        </Box>
      )}

      {/* Tools list */}
      {viewMode.type === "tools" && (
        <Box flexDirection="column">
          <Text bold>🔧 Tools ({tools.length}):</Text>
          {tools.length === 0 ? <Text dimColor>No tools available</Text> : (
            tools.map((tool, i) => (
              <Box key={i}>
                <Text>
                  {i + 1}. {tool.name} - {tool.description ?? ""}
                </Text>
              </Box>
            ))
          )}
          <Box marginTop={1}>
            <Text dimColor>Press ESC to go back</Text>
          </Box>
        </Box>
      )}

      {/* Tool selection */}
      {viewMode.type === "call-tool-select" && (
        <Box flexDirection="column">
          <Text>Select tool to call:</Text>
          <SelectInput
            items={tools.map((t) => ({
              label: `${t.name} - ${t.description ?? ""}`,
              value: t.name,
            }))}
            onSelect={handleToolSelect}
          />
          <Text dimColor>Press ESC to go back</Text>
        </Box>
      )}

      {/* Tool input */}
      {viewMode.type === "call-tool-input" && (
        <Box flexDirection="column">
          <Text>Enter JSON input for {viewMode.toolName}:</Text>
          <Box>
            <Text>{">"}</Text>
            <TextInput
              value={toolInput}
              onChange={setToolInput}
              onSubmit={() => handleToolCall(viewMode.toolName)}
            />
          </Box>
          <Text dimColor>Press Enter to call, ESC to cancel</Text>
        </Box>
      )}

      {/* OAuth waiting */}
      {viewMode.type === "oauth-waiting" && (
        <Box flexDirection="column">
          <Text bold color="yellow">🌐 AUTHORIZATION REQUIRED</Text>
          <Text>
            A browser window should have opened. If not, please visit this URL:
          </Text>
          <Box marginY={1}>
            <Text color="cyan">{client.pendingOAuthUrl}</Text>
          </Box>
          <Text>Waiting for authorization callback...</Text>
        </Box>
      )}
    </Box>
  );
}

// --- Main ---

interface RunOptions {
  command?: string;
  url?: string;
}

async function run({ command, url }: RunOptions) {
  // Build server endpoint
  let serverEndpoint: McpServerEndpoint;
  let serverName: string;

  if (command) {
    const parts = command.split(" ");
    serverEndpoint = {
      id: "test-server",
      displayName: "Test Server",
      type: "command",
      command: {
        command: parts[0],
        args: parts.slice(1),
      },
    };
    serverName = command;
  } else {
    serverEndpoint = {
      id: "test-server",
      displayName: "Test Server",
      type: "remote",
      remote: {
        url: url!,
      },
    };
    serverName = url!;
  }

  // Create context
  const context = await createZypherContext(Deno.cwd());

  // Create OAuth handler for remote servers
  let oauthOptions: OAuthOptions | undefined;
  if (serverEndpoint.type === "remote") {
    const httpServerOAuthProvider = new HttpServerOAuthProvider({
      redirect_uris: ["http://localhost/mcp/oauth/callback"],
      token_endpoint_auth_method: "client_secret_post",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      client_name: "MCP Client Example",
      client_uri: "https://github.com/anthropics/zypher-agent",
      software_id: "zypher-mcp-client-example",
      software_version: "1.0.0",
    });
    oauthOptions = {
      authProvider: httpServerOAuthProvider,
      callbackHandler: httpServerOAuthProvider,
    };
  }

  // Create client with OAuth support for remote servers
  const client = new McpClient(context, serverEndpoint, {
    oauth: oauthOptions,
  });

  // Render the Ink app
  render(<App client={client} serverName={serverName} />);
}

if (import.meta.main) {
  await new Command()
    .name("McpClient")
    .version("1.0.0")
    .description("Interactive MCP client with Ink UI")
    .option("--command <cmd:string>", "Command to run local MCP server")
    .option("--url <url:string>", "URL for remote MCP server")
    .example(
      "Local server",
      'deno run --allow-all McpClient.example.tsx --command "npx -y @modelcontextprotocol/server-memory"',
    )
    .example(
      "Remote server",
      "deno run --allow-all McpClient.example.tsx --url https://mcp-server.com/mcp",
    )
    .action((options) => {
      if (options.command && options.url) {
        throw new Error("Cannot specify both --command and --url");
      }
      if (!options.command && !options.url) {
        throw new Error("Either --command or --url is required");
      }
      if (options.url) {
        try {
          new URL(options.url);
        } catch {
          throw new Error("Invalid server URL");
        }
      }
      return run(options);
    })
    .parse(Deno.args);
}
