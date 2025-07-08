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

  get statusCode(): number {
    switch (this.code) {
      case "already_exists":
        return 409;
      case "server_error":
        return 500;
      case "oauth_required":
        return 401;
      case "invalid_config":
        return 400;
      case "not_found":
        return 404;
      default:
        return 500;
    }
  }
}
