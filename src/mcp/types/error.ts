export class McpError extends Error {
  constructor(
    public code:
      | "already_exists"
      | "server_error"
      | "oauth_required"
      | "invalid_config"
      | "not_found",
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "McpError";
  }
}
