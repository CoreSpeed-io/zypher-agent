import { Context } from "hono";
import { StatusCode } from "hono/utils/http-status";
import { z } from "zod";
import { formatError } from "#src/utils/error.ts";

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

  // Default to internal server error
  return c.json({
    code: 500,
    type: "internal_server_error",
    message: "Internal server error",
    error: formatError(err),
  });
}
