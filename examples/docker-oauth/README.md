# Docker OAuth Example

This example demonstrates how to run Zypher Agent in a Docker container with
OAuth authentication for MCP servers.

## Quick Start

### Method 1: Device Code Flow (Recommended)

This method uses OAuth 2.0 Device Authorization Grant, which works great in
containers:

```bash
# 1. Start the container
docker-compose up

# 2. Watch the logs for authentication instructions
# You'll see something like:
# ================================================================================
# 🔐 CONTAINER OAUTH AUTHENTICATION REQUIRED  
# ================================================================================
# 
# To authenticate this container with https://github-mcp-server.com:
# 
# 1. Open a web browser on your host machine
# 2. Navigate to: https://github.com/login/device
# 3. Enter this code: ABCD-EFGH
# 
# Waiting for authorization... (expires in 5 minutes)
# ================================================================================

# 3. Open your browser and follow the instructions
# 4. The container will automatically continue once you authorize
```

### Method 2: Environment Variables

If you have OAuth tokens already:

```bash
# 1. Copy the environment template
cp env.example .env

# 2. Edit .env with your actual tokens
# For GitHub, get tokens from: https://github.com/settings/tokens

# 3. Update docker-compose.yml to use environment variables:
# Uncomment the MCP_GITHUB_ACCESS_TOKEN lines

# 4. Start the container
docker-compose up
```

## Authentication Methods

### Device Code Flow

**Pros:**

- Works in any container environment
- No need to manage tokens manually
- Secure - uses standard OAuth 2.0 flow
- Automatic token refresh

**Cons:**

- Requires manual interaction on first run
- Needs internet access for OAuth server

**Configuration:**

```yaml
environment:
  - MCP_GITHUB_AUTH_STRATEGY=device_code
  - MCP_GITHUB_DEVICE_CODE_TIMEOUT=600 # 10 minutes
```

### Environment Variables

**Pros:**

- Fully automated - no manual interaction
- Works in CI/CD pipelines
- Can use secrets management systems

**Cons:**

- Need to obtain and manage tokens manually
- Tokens may expire and need renewal

**Configuration:**

```yaml
environment:
  - MCP_GITHUB_ACCESS_TOKEN=ghp_xxxxxxxxxxxx
  - MCP_GITHUB_REFRESH_TOKEN=ghr_xxxxxxxxxxxx
  - MCP_GITHUB_AUTH_STRATEGY=env_vars
```

## Server Configuration

The example assumes you have MCP servers configured. Add servers to your
`mcp.json`:

```json
{
  "servers": {
    "github": {
      "url": "https://your-github-mcp-server.com",
      "description": "GitHub MCP Server"
    }
  }
}
```

## Multiple Servers

For multiple OAuth-enabled servers:

```yaml
environment:
  # GitHub server
  - MCP_GITHUB_ACCESS_TOKEN=${GITHUB_ACCESS_TOKEN}
  - MCP_GITHUB_AUTH_STRATEGY=env_vars

  # Anthropic server
  - MCP_ANTHROPIC_CLAUDE_ACCESS_TOKEN=${ANTHROPIC_ACCESS_TOKEN}
  - MCP_ANTHROPIC_CLAUDE_AUTH_STRATEGY=device_code

  # Custom server
  - MCP_API_EXAMPLE_COM_ACCESS_TOKEN=${CUSTOM_ACCESS_TOKEN}
```

## Volume Persistence

OAuth tokens are stored in the `oauth_data` volume to persist between container
restarts:

```yaml
volumes:
  - oauth_data:/app/data/oauth
```

To reset authentication (force re-authentication):

```bash
docker volume rm docker-oauth_oauth_data
```

## Environment Variables Reference

### Container Detection

- `CONTAINER=true` - Force container mode (usually auto-detected)

### Authentication Strategy

- `MCP_{SERVER}_AUTH_STRATEGY` - Force strategy: `auto`, `device_code`,
  `env_vars`, `manual`

### OAuth Tokens

- `MCP_{SERVER}_ACCESS_TOKEN` - OAuth access token
- `MCP_{SERVER}_REFRESH_TOKEN` - OAuth refresh token (optional)
- `MCP_{SERVER}_TOKEN_TYPE` - Token type (default: Bearer)
- `MCP_{SERVER}_EXPIRES_IN` - Token expiration in seconds

### Device Code Flow

- `MCP_{SERVER}_DEVICE_CODE_TIMEOUT` - Timeout in seconds (default: 300)
- `MCP_{SERVER}_DEVICE_CODE_POLLING_INTERVAL` - Polling interval in seconds
  (default: 5)

### Debugging

- `DEBUG=oauth` - Enable OAuth debug logging

## Troubleshooting

### Container Not Detected

```bash
# Force container mode
export CONTAINER=true
```

### Authentication Fails

```bash
# Check logs
docker-compose logs -f

# Reset authentication
docker volume rm docker-oauth_oauth_data
docker-compose up
```

### Token Expired

```bash
# If using environment variables, update your tokens
# If using device code flow, it will auto-refresh or prompt for re-auth
```

### Multiple Server Issues

```bash
# Test individual servers
export MCP_GITHUB_AUTH_STRATEGY=device_code
export MCP_OTHER_SERVER_AUTH_STRATEGY=env_vars
```

## Production Considerations

1. **Use Secrets Management:**
   ```yaml
   # Kubernetes example
   envFrom:
     - secretRef:
         name: mcp-oauth-secrets
   ```

2. **Monitor Token Expiration:**
   - Set up alerts for token expiration
   - Use refresh tokens when available
   - Implement automated token rotation

3. **Network Security:**
   - Use secure networks for OAuth flows
   - Consider using private OAuth servers
   - Implement proper firewall rules

4. **Backup OAuth Data:**
   ```bash
   # Backup OAuth volume
   docker run --rm -v docker-oauth_oauth_data:/data -v $(pwd):/backup ubuntu tar czf /backup/oauth-backup.tar.gz /data
   ```
