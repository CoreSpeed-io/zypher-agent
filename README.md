# Zypher Agent

An AI-powered coding assistant that helps you with code editing, file
management, and development tasks through natural language interaction.

## Features

- 🤖 Interactive CLI interface for natural language coding tasks
- 🌐 RESTful API server for integration with other applications
- ✨ Smart code editing
- 📁 File and directory management
- 🔍 Semantic code search
- 🛠️ Multiple tool integrations
- 📝 Checkpoint system for tracking and reverting changes

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/zypher-agent.git
cd zypher-agent

# Install dependencies
bun install

# Set up environment variables
cp .env.example .env
# Edit .env with your API keys and configuration
```

## Usage

### CLI

Start the CLI:

```bash
bun start
```

Or specify a workspace directory:

```bash
bun start -w /path/to/your/project
```

### API Server

Start the API server:

```bash
bun start:api
```

Configuration options:

```bash
# Set the port (default: 3000)
bun start:api -p 8080

# Set the workspace directory
bun start:api -w /path/to/your/project
```

## API Documentation

The API server provides the following endpoints:

- `GET /health` - Health check
- `GET /agent/messages` - Get all messages in the agent's history
- `DELETE /agent/messages` - Clear all messages in the agent's history
- `POST /agent/tasks` - Run a task using the agent (SSE endpoint)
- `GET /agent/checkpoints` - List all available checkpoints
- `POST /agent/checkpoints/{checkpointId}/apply` - Apply a checkpoint
- `GET /mcp/servers` - List all registered MCP servers
- `POST /mcp/register` - Register a new MCP server
- `DELETE /mcp/servers/{serverName}` - Deregister a MCP server by name
- `PUT /mcp/servers/{serverName}` - Update MCP server configuration by name
- `GET /mcp/reload` - Reload MCP server configurations (5s cooldown)
- `GET /mcp/tools` - List all available tools from MCP servers

### OAuth Authentication Endpoints

For MCP servers that require OAuth authentication:

- `POST /mcp/registry/{id}` - Register MCP server from central registry (may
  return OAuth authorization details)
- `GET /mcp/servers/{id}/oauth/callback` - OAuth callback handler (called by
  OAuth provider)
- `GET /mcp/servers/{id}/oauth/status` - Check OAuth authentication status
- `DELETE /mcp/servers/{id}/oauth` - Clear stored OAuth tokens and
  authentication data

See the [API Specification](./api-spec.yaml) for detailed documentation.

## OAuth Authentication Flow

Some MCP servers require OAuth authentication before they can be registered. The
API handles this with a streamlined flow:

### 1. Attempt Registration

When registering an MCP server (either via `/mcp/register` or
`/mcp/registry/{id}`), if the server requires OAuth, you'll receive a response
like:

```json
{
  "success": false,
  "requiresOAuth": true,
  "oauth": {
    "authUrl": "https://provider.com/oauth/authorize?client_id=...",
    "state": "csrf-protection-state",
    "instructions": "Please open the authUrl in a browser to complete OAuth authentication"
  },
  "error": {
    "code": "oauth_required",
    "message": "Server requires OAuth authentication. Please complete OAuth flow first.",
    "details": {
      "serverId": "server-id",
      "serverUrl": "https://server.com/api",
      "requiresOAuth": true
    }
  }
}
```

### 2. User Authorization

Direct the user to open the `authUrl` in their browser. This can be done by:

- Opening a popup window
- Redirecting in the current tab
- Displaying the URL for manual opening

### 3. OAuth Callback

After user authorization, the OAuth provider redirects to:
`/mcp/servers/{serverId}/oauth/callback?code=...&state=...`

The API automatically:

- Validates the OAuth response
- Exchanges the authorization code for access tokens
- Stores the tokens securely
- Attempts to register the server again

### 4. Frontend Handling

The callback returns JSON (not HTML) for frontend processing:

```json
{
  "success": true,
  "message": "OAuth authentication completed successfully",
  "serverId": "server-id",
  "serverRegistered": true
}
```

### 5. Status Checking

You can check OAuth status anytime:

```bash
GET /mcp/servers/{serverId}/oauth/status
```

Returns:

```json
{
  "success": true,
  "authenticated": true,
  "hasTokens": true
}
```

### Frontend Implementation Example

```javascript
async function registerServer(registryId) {
  try {
    // Note: registryId should be the UUID from the MCP registry (e.g., "ffa12db9-460f-4049-b32a-fa19d90ca27e")
    // NOT the friendly name (e.g., "atlassian")
    const response = await fetch(`/mcp/registry/${registryId}`, {
      method: "POST",
      headers: { "Authorization": "Bearer your-token" },
    });

    const data = await response.json();

    if (data.requiresOAuth && data.oauth.authUrl) {
      // Open OAuth authorization in popup
      const authWindow = window.open(
        data.oauth.authUrl,
        "oauth",
        "width=600,height=700",
      );

      // Poll for completion or listen for postMessage
      const checkStatus = setInterval(async () => {
        try {
          // After registration, the server will be available with its friendly name
          // Extract friendly name from OAuth callback or use the registryId for now
          const statusResponse = await fetch(
            `/mcp/servers/${registryId}/oauth/status`,
          );
          const status = await statusResponse.json();

          if (status.authenticated) {
            clearInterval(checkStatus);
            authWindow.close();
            showSuccess("Server registered successfully!");
          }
        } catch (error) {
          // Continue polling
        }
      }, 2000);
    }
  } catch (error) {
    showError("Registration failed:", error);
  }
}

// Example usage:
// registerServer("ffa12db9-460f-4049-b32a-fa19d90ca27e"); // ✅ Correct - registry UUID
// registerServer("atlassian"); // ❌ Wrong - this will cause 404
```

## Docker OAuth Configuration

When deploying the API server in Docker containers, OAuth redirect URIs need
special configuration since `localhost` won't work for external OAuth providers.
The system provides multiple ways to configure the correct redirect URIs:

### Method 1: Environment Variables (Recommended)

```bash
docker run \
  -e OAUTH_HOST=myapp.example.com \
  -e OAUTH_PORT=443 \
  -e OAUTH_USE_HTTPS=true \
  -p 443:3000 \
  zypher-agent bun start:api
```

### Method 2: Docker Compose

```yaml
version: "3.8"
services:
  zypher-agent:
    image: zypher-agent
    ports:
      - "443:3000"
    environment:
      - OAUTH_HOST=myapp.example.com
      - OAUTH_PORT=443
      - OAUTH_USE_HTTPS=true
      - NODE_ENV=production
    command: bun start:api
```

### Method 3: Direct Configuration

```typescript
// In your application code
const provider = new RemoteOAuthProvider({
  serverId: "github",
  serverUrl: "https://github.com",
  oauthBaseDir: "/app/oauth",
  clientName: "My App",
  host: "myapp.example.com", // Your actual domain
  callbackPort: 443, // Your port
  useHttps: true, // Use HTTPS in production
});
```

### Method 4: Direct Redirect URI

```typescript
const provider = new RemoteOAuthProvider({
  serverId: "github",
  redirectUri: "https://myapp.example.com/mcp/servers/github/oauth/callback",
});
```

### Supported Environment Variables

| Variable          | Description                                  | Example                     |
| ----------------- | -------------------------------------------- | --------------------------- |
| `OAUTH_HOST`      | Domain/host for redirect URI                 | `myapp.example.com`         |
| `OAUTH_PORT`      | Port for redirect URI                        | `443`                       |
| `OAUTH_USE_HTTPS` | Set to "true" to use HTTPS                   | `true`                      |
| `PUBLIC_URL`      | Full base URL (host extracted automatically) | `https://myapp.example.com` |
| `NODE_ENV`        | Auto-enables HTTPS if set to "production"    | `production`                |

### Example Production Setup

```bash
# Production deployment with reverse proxy
docker run -d \
  --name zypher-agent \
  -e OAUTH_HOST=api.mycompany.com \
  -e OAUTH_USE_HTTPS=true \
  -e NODE_ENV=production \
  -p 3000:3000 \
  zypher-agent bun start:api
```

The system will automatically construct redirect URIs like:
`https://api.mycompany.com/mcp/servers/{serverId}/oauth/callback`

## Development

### Local Development

```bash
# Run tests
bun test

# Type checking
bun type-check

# Linting
bun lint

# Format code
bun lint:fix
```

### Docker Development (Recommended)

Basic usage:

```bash
# Build the image
docker build -t zypher-agent .

# Start the agent
docker run -it --rm zypher-agent
```

For development/debugging:

```bash
# Run with source code mounting (for development)
docker run -it --rm \
  -v "$(pwd):/app" \
  -v zypher_modules:/app/node_modules \
  --name zypher-agent \
  zypher-agent

# Run unit tests
docker run -it --rm \
  -v "$(pwd):/app" \
  -v zypher_modules:/app/node_modules \
  zypher-agent bun test
```

#### Test Workspace

The Docker container includes a dedicated workspace at `/workspace` containing a
real Next.js project from CoreSpeed's template. This workspace serves as a safe
testing ground where the AI agent can:

- Make and test code changes
- Search and analyze code
- Refactor and experiment
- Create new features

The workspace is built into the Docker image and resets on each container start,
providing a clean, isolated environment for testing the agent's capabilities.

When you start the agent, it automatically operates in the `/workspace`
directory. Example tasks:

```
🔧 "Create a new utility function for date formatting"
🔧 "Refactor the authentication logic"
🔧 "Add error handling to the API routes"
🔧 "Create a new component for user profiles"
```

## Project Structure

```
src/
├── tools/          # Tool implementations
│   ├── EditFileTool.ts
│   ├── SearchTool.ts
│   └── ...
├── ZypherAgent.ts  # Main agent implementation
├── prompt.ts       # System prompts and instructions
└── utils.ts        # Utility functions

bin/
└── cli.ts         # CLI entry point and command handling
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Environment Variables

Required environment variables:

- `ANTHROPIC_API_KEY`: Your Anthropic API key for Claude

Optional environment variables:

- `MCP_SERVER_REGISTRY_URL`: Base URL for the MCP server registry (for
  `/mcp/registry/{id}` endpoints)
- `MCP_USE_DYNAMIC_REGISTRATION`: Enable dynamic OAuth client registration
  (default: true)
- `MCP_{SERVER_ID}_CLIENT_ID`: OAuth client ID for specific MCP server
  (uppercase server ID)
- `MCP_{SERVER_ID}_CLIENT_SECRET`: OAuth client secret for specific MCP server
  (uppercase server ID)
- `MCP_{SERVER_ID}_AUTH_SERVER_URL`: Custom OAuth authorization server URL for
  specific MCP server

### OAuth Configuration Examples

For a server with ID `atlassian-mcp`:

```bash
# Use pre-registered OAuth client credentials
MCP_ATLASSIAN_MCP_CLIENT_ID=your_client_id
MCP_ATLASSIAN_MCP_CLIENT_SECRET=your_client_secret

# Use custom OAuth authorization server
MCP_ATLASSIAN_MCP_AUTH_SERVER_URL=https://custom-auth.example.com

# Disable dynamic registration (requires above credentials)
MCP_USE_DYNAMIC_REGISTRATION=false
```

## License

Proprietary - All rights reserved
