# OAuth Integration with MCP Server Registration

This document shows how OAuth authentication is seamlessly integrated into MCP
server registration.

## How It Works

When you try to register an SSE MCP server that requires OAuth:

1. **Registration Attempt**: System tries to connect to the server
2. **401 Detection**: Detects authentication failure (401 error)
3. **OAuth Check**: Checks if server supports OAuth
   (`.well-known/oauth-authorization-server`)
4. **OAuth URL Generation**: Automatically generates OAuth auth URL and returns
   it in the response
5. **User Authentication**: User completes OAuth flow via returned URL
6. **Retry**: Automatically retries registration with OAuth tokens

## API Server Flow

### 1. Registration Attempt with OAuth URL Generation

```bash
POST /mcp/register
{
  "atlassian": {
    "url": "https://mcp.atlassian.com/v1/sse",
    "enabled": true
  }
}
```

### 2. OAuth Required Response with Auth URL

```bash
HTTP 202 Accepted
{
  "success": false,
  "requiresOAuth": true,
  "code": "oauth_required",
  "message": "Server atlassian requires OAuth authentication. Please complete OAuth flow first.",
  "authUrl": "https://auth.atlassian.com/oauth/authorize?client_id=xyz&redirect_uri=http%3A%2F%2Flocalhost%3A3001%2Foauth%2Fcallback&response_type=code&scope=&state=abc123&code_challenge=xyz&code_challenge_method=S256",
  "state": "abc123",
  "details": {
    "serverId": "atlassian",
    "serverUrl": "https://mcp.atlassian.com/v1/sse",
    "requiresOAuth": true
  }
}
```

### 3. User Completes OAuth in Browser

User opens the `authUrl` and completes authentication. OAuth provider redirects
to:

```
http://localhost:3001/oauth/callback?code=xyz&state=abc123
```

### 4. Process OAuth Callback

```bash
POST /oauth/atlassian/callback
{
  "code": "xyz",
  "state": "abc123"
}
```

**Response (Success):**

```json
{
  "success": true,
  "message": "OAuth authentication completed and server registered successfully",
  "registered": true
}
```

**Response (OAuth Success, Registration Failed):**

```json
{
  "success": true,
  "message": "OAuth authentication completed successfully, but server registration failed. You can retry registration manually.",
  "registered": false,
  "registrationError": "Connection timeout"
}
```

### 5. Server Registration Complete

The server is now automatically registered and ready to use! No additional steps
needed in most cases.

## Benefits of Automatic Registration

1. **Seamless Experience**: OAuth callback automatically completes server
   registration
2. **Error Resilience**: If registration fails, OAuth tokens are still saved for
   manual retry
3. **Single Request Flow**: No need for separate retry endpoints in typical
   usage
4. **Graceful Degradation**: Falls back to manual retry if automatic
   registration fails

## CLI Flow

### 1. Automatic OAuth Detection

When CLI tries to load servers from `mcp.json` and encounters OAuth-required
servers:

```bash
$ deno run -A bin/cli/cli.ts

🔧 Loading MCP servers...
Registering tools for server: atlassian
Connection mode: SSE
⚠️  Server atlassian requires OAuth authentication
🔐 Starting OAuth flow for atlassian...
```

### 2. Automatic Browser Opening

```bash
🌐 Opening browser for authentication...
Please visit: https://auth.atlassian.com/oauth/authorize?...
🔍 Starting callback server on port 8080...
```

### 3. User Completes Authentication

User authenticates in browser, system captures callback automatically.

### 4. Automatic Retry

```bash
✅ OAuth authentication successful!
🔄 Retrying server registration...
✅ Server atlassian registered successfully
🔧 Registered tools: list-projects, create-issue, search-issues
```

## Error Handling

### OAuth Not Supported

If server returns 401 but doesn't support OAuth:

```json
{
  "success": false,
  "code": "auth_failed",
  "message": "Server authentication failed and OAuth is not supported"
}
```

### OAuth Still Required

If OAuth flow hasn't been completed yet:

```json
{
  "success": false,
  "requiresOAuth": true,
  "code": "oauth_required",
  "message": "OAuth authentication still required"
}
```

## Benefits

1. **Streamlined UX**: OAuth URL generated immediately upon registration failure
2. **Automatic Detection**: System detects OAuth requirements automatically
3. **Security First**: Can't use OAuth servers without proper authentication
4. **Cross-Platform**: Works in both CLI and API server environments
5. **Error Recovery**: Clear guidance when authentication fails
6. **Single Request**: No separate OAuth initiation endpoint needed

## Frontend Integration

For web frontends using the API server:

```javascript
async function registerServer(serverId, config) {
  // 1. Try to register server
  const response = await fetch("/mcp/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ [serverId]: config }),
  });

  const result = await response.json();

  // 2. Handle OAuth requirement - auth URL is already included!
  if (result.requiresOAuth && result.authUrl) {
    // Open OAuth popup with the provided URL
    const popup = window.open(result.authUrl, "oauth", "width=500,height=600");

    // Wait for OAuth completion - server registers automatically
    const oauthResult = await waitForOAuthCompletion(popup);

    if (oauthResult.registered) {
      console.log("✅ Server registered successfully!");
      return { success: true, message: "Server registered with OAuth" };
    } else {
      // OAuth succeeded but registration failed - retry manually
      console.warn("OAuth succeeded but registration failed, retrying...");
      const retryResponse = await fetch(
        `/mcp/servers/${serverId}/retry-oauth`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(config),
        },
      );
      return retryResponse.json();
    }
  }

  return result;
}
```
