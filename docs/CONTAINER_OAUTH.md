# Container-Friendly OAuth Authentication

This document explains how to use OAuth authentication with MCP servers when
running Zypher Agent in a Docker container or other containerized environments.

## Problem

Traditional OAuth flows require opening a web browser for user authentication,
which doesn't work in containerized environments where:

- No browser is available inside the container
- The user cannot interact with GUI applications
- Port forwarding and callback URLs are complex to set up

## Solution

Zypher Agent automatically detects when it's running in a container and switches
to container-friendly authentication methods:

### 1. **Device Code Flow** (Recommended)

Uses OAuth 2.0 Device Authorization Grant where the user authenticates on their
host machine while the container polls for completion.

### 2. **Environment Variable Authentication**

Pre-configured tokens passed via environment variables.

### 3. **Manual Token Input**

Provides instructions for manual token configuration.

## Container Detection

The system automatically detects container environments by checking:

- `DOCKER_CONTAINER=true` environment variable
- Kubernetes service host (`KUBERNETES_SERVICE_HOST`)
- Generic container indicator (`CONTAINER=true`)
- Presence of `/.dockerenv` file (Docker)
- Container runtime in `/proc/1/cgroup`

## Authentication Methods

### Device Code Flow (OAuth 2.0 Device Authorization Grant)

When a container needs authentication, you'll see output like:

```
================================================================================
🔐 CONTAINER OAUTH AUTHENTICATION REQUIRED
================================================================================

To authenticate this container with https://your-mcp-server.com:

1. Open a web browser on your host machine
2. Navigate to: https://your-mcp-server.com/device
3. Enter this code: ABCD-EFGH

Alternatively, you can use this direct link:
https://your-mcp-server.com/device?user_code=ABCD-EFGH

Waiting for authorization... (expires in 5 minutes)
================================================================================
```

**Steps:**

1. Copy the verification URL and code
2. Open your browser on the host machine
3. Navigate to the URL and enter the code
4. Complete the authorization
5. The container will automatically continue once authorized

### Environment Variable Authentication

Set tokens directly via environment variables:

```bash
# For a server named "github"
export MCP_GITHUB_ACCESS_TOKEN="your_access_token"
export MCP_GITHUB_REFRESH_TOKEN="your_refresh_token"  # optional
export MCP_GITHUB_TOKEN_TYPE="Bearer"               # optional
export MCP_GITHUB_EXPIRES_IN="3600"                 # optional

# Start container
docker run -e MCP_GITHUB_ACCESS_TOKEN="$MCP_GITHUB_ACCESS_TOKEN" your-image
```

**Environment Variable Naming:**

- Format: `MCP_{SERVER_ID}_{TOKEN_FIELD}`
- Server ID is normalized: uppercase, non-alphanumeric characters become
  underscores
- Examples:
  - Server `github` → `MCP_GITHUB_*`
  - Server `anthropic-claude` → `MCP_ANTHROPIC_CLAUDE_*`
  - Server `api.example.com` → `MCP_API_EXAMPLE_COM_*`

### Manual Token Input

If other methods aren't available, the system provides manual instructions:

```
================================================================================
🔐 MANUAL TOKEN INPUT REQUIRED
================================================================================

To authenticate this container with https://your-mcp-server.com:

1. Obtain an access token through your OAuth provider
2. Set the following environment variables:
   MCP_GITHUB_ACCESS_TOKEN=your_access_token
   MCP_GITHUB_REFRESH_TOKEN=your_refresh_token (optional)

3. Restart the container with these environment variables
================================================================================
```

## Docker Usage Examples

### Docker Run with Environment Variables

```bash
# Method 1: Direct environment variables
docker run \
  -e MCP_GITHUB_ACCESS_TOKEN="ghp_xxxxxxxxxxxx" \
  -e MCP_GITHUB_REFRESH_TOKEN="ghr_xxxxxxxxxxxx" \
  your-zypher-agent-image

# Method 2: From host environment
docker run \
  -e MCP_GITHUB_ACCESS_TOKEN \
  -e MCP_GITHUB_REFRESH_TOKEN \
  your-zypher-agent-image

# Method 3: Environment file
docker run --env-file oauth.env your-zypher-agent-image
```

### Docker Compose

```yaml
version: "3.8"
services:
  zypher-agent:
    image: your-zypher-agent-image
    environment:
      - MCP_GITHUB_ACCESS_TOKEN=${MCP_GITHUB_ACCESS_TOKEN}
      - MCP_GITHUB_REFRESH_TOKEN=${MCP_GITHUB_REFRESH_TOKEN}
      # Force device code flow if preferred
      - MCP_GITHUB_AUTH_STRATEGY=device_code
    volumes:
      - oauth_data:/app/data/oauth
volumes:
  oauth_data:
```

### Kubernetes

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: mcp-oauth-tokens
stringData:
  MCP_GITHUB_ACCESS_TOKEN: "ghp_xxxxxxxxxxxx"
  MCP_GITHUB_REFRESH_TOKEN: "ghr_xxxxxxxxxxxx"
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: zypher-agent
spec:
  template:
    spec:
      containers:
        - name: zypher-agent
          image: your-zypher-agent-image
          envFrom:
            - secretRef:
                name: mcp-oauth-tokens
          volumeMounts:
            - name: oauth-storage
              mountPath: /app/data/oauth
      volumes:
        - name: oauth-storage
          emptyDir: {}
```

## Configuration Options

You can control authentication behavior with environment variables:

```bash
# Force a specific authentication strategy
export MCP_GITHUB_AUTH_STRATEGY="device_code"  # or "env_vars"

# Custom environment variable prefix
export MCP_GITHUB_ENV_PREFIX="CUSTOM_PREFIX"

# Device code flow timeouts
export MCP_GITHUB_DEVICE_CODE_TIMEOUT="600"        # 10 minutes
export MCP_GITHUB_DEVICE_CODE_POLLING_INTERVAL="3" # 3 seconds
```

## Troubleshooting

### Container Not Detected

If container detection fails, manually set:

```bash
export CONTAINER=true
```

### Authentication Strategy Override

Force a specific strategy:

```bash
# Use environment variables even if device code is available
export MCP_GITHUB_AUTH_STRATEGY="env_vars"

# Use device code even if env vars are set
export MCP_GITHUB_AUTH_STRATEGY="device_code"
```

### Debug Information

Enable verbose OAuth logging:

```bash
export DEBUG=oauth
```

### Token Refresh Issues

If refresh tokens aren't working:

1. Check token expiration
2. Verify refresh token is valid
3. Ensure server supports refresh token grant
4. Clear stored tokens and re-authenticate:
   ```bash
   # Clear OAuth data volume/directory
   docker volume rm oauth_data
   ```

## Security Best Practices

1. **Use Secrets Management:**
   - Store tokens in Kubernetes secrets, Docker secrets, or HashiCorp Vault
   - Never put tokens in Dockerfiles or public repositories

2. **Token Rotation:**
   - Use refresh tokens when available
   - Implement token rotation in your CI/CD pipeline
   - Monitor token expiration

3. **Least Privilege:**
   - Use tokens with minimal required scopes
   - Create service-specific tokens rather than personal access tokens

4. **Secure Storage:**
   - Use encrypted volumes for OAuth data
   - Set appropriate file permissions
   - Regularly clean up old tokens

## Server Requirements

For device code flow support, MCP servers must:

1. Support OAuth 2.0 Device Authorization Grant (RFC 8628)
2. Provide `device_authorization_endpoint` in OAuth metadata
3. Accept `urn:ietf:params:oauth:grant-type:device_code` grant type

If device code flow isn't supported, the system falls back to environment
variable authentication.
