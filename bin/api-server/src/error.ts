import type { Context } from "hono";
import type { StatusCode } from "hono/utils/http-status";
import { z } from "zod";
import { formatError } from "../../../src/error.ts";
import { McpServerError } from "../../../src/mcp/McpServerManager.ts";

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly type: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function errorHandler(err: Error, c: Context) {
  console.error(`Error processing request: ${formatError(err)}`);

  if (err instanceof ApiError) {
    c.status(err.statusCode as StatusCode);
    return c.json({
      code: err.statusCode,
      type: err.type,
      message: err.message,
      details: err.details,
    });
  }

  if (err instanceof z.ZodError) {
    c.status(400);
    return c.json({
      code: 400,
      type: "invalid_request",
      message: "Validation error",
      details: err.errors,
    });
  }

  if (err instanceof McpServerError) {
    let statusCode = 500;
    if (err.code === "already_exists") {
      statusCode = 409;
    } else if (err.code === "auth_failed") {
      statusCode = 401;
    }

    c.status(statusCode as StatusCode);
    return c.json({
      code: statusCode,
      type: err.code,
      message: err.message,
      details: err.details,
    });
  }

  // Default to internal server error
  return c.json({
    code: 500,
    type: "internal_server_error",
    message: "Internal server error",
    error: formatError(err),
  });
}
