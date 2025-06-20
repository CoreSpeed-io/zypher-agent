# @zypher/server

RESTful API server for Zypher Agent - integrate AI-powered coding assistance
into your applications via HTTP API.

## Installation

This package is part of the Zypher Agent monorepo. To use the API server:

```bash
# From the repository root
deno task start:api

# Or directly from this package
deno task -c packages/server/deno.json start

# For development with auto-reload
deno task dev:api
```

To build a standalone executable:

```bash
# Build the API server executable
deno task build:api
```

## Usage

### Starting the Server

```bash
# Start with default settings (port 3000)
deno task start:api

# Specify a custom port
deno task start:api -- -p 8080

# Specify a workspace directory
deno task start:api -- -w /path/to/project
```

### Command-Line Options

- `-p, --port` - Server port (default: 3000)
- `-w, --workspace` - Working directory for the agent
- `-u, --user-id` - User ID for tracking usage
- `-b, --base-url` - Custom Anthropic API base URL
- `-k, --api-key` - API key (overrides environment variable)

## Environment Variables

Required:

- `ANTHROPIC_API_KEY` - Your Anthropic API key

Optional:

- `ANTHROPIC_BASE_URL` - Custom base URL for Anthropic API
- `ZYPHER_USER_ID` - Default user ID for tracking
- `S3_BUCKET_NAME` - S3 bucket for file storage (default: "zypher-storage")
- `S3_REGION` - AWS region (default: "us-east-1")
- `S3_ENDPOINT` - Custom S3 endpoint for S3-compatible services
- `S3_ACCESS_KEY_ID` - AWS access key ID
- `S3_SECRET_ACCESS_KEY` - AWS secret access key

## Development

```bash
# Run in development mode with auto-reload
deno task -c packages/server/deno.json dev

# Build the executable
deno task -c packages/server/deno.json build

# Bundle for distribution
deno task -c packages/server/deno.json bundle

# Run tests
deno task -c packages/server/deno.json test
```

## API Specification

For detailed API documentation, see the
[OpenAPI specification](./api-spec.yaml).
