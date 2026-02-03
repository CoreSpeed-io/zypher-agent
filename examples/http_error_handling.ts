/**
 * Example: HTTP Error Handling
 *
 * Demonstrates using the `onError` callback in WebSocket options to control
 * what error information is sent to clients.
 *
 * Uses a mock model provider that throws errors based on the task message,
 * allowing you to test different error handling behaviors.
 *
 * The `onError` callback allows you to:
 * - Return an object → send custom error data to client
 * - Return void → suppress error (handle silently)
 * - Throw → propagate error (falls back to `exposeErrors` behavior)
 *
 * Environment variables:
 *   PORT - (optional) Port to listen on, defaults to 8080
 *
 * Run:
 *   deno run --env -A examples/http_error_handling.ts
 *
 * Test with WebSocket client:
 *   wscat -c ws://localhost:8080/task/ws -s zypher.v1
 *   > {"action":"startTask","task":"payment"}      # Returns custom 402 error
 *   > {"action":"startTask","task":"rate_limit"}   # Returns custom 429 error
 *   > {"action":"startTask","task":"type_error"}   # Suppressed (no client error)
 *   > {"action":"startTask","task":"unexpected"}   # Propagates to exposeErrors
 *   > {"action":"startTask","task":"hello"}        # Normal response
 */

import {
  createZypherAgent,
  type FinalMessage,
  type ModelProvider,
  type ModelStream,
  type StreamChatParams,
} from "@zypher/agent";
import { createZypherHandler } from "@zypher/http";
import { parsePort } from "@zypher/utils/env";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { of } from "rxjs";

// Custom error classes
class PaymentRequiredError extends Error {
  status = 402;
  code = "payment_required";
  constructor(message: string) {
    super(message);
    this.name = "PaymentRequiredError";
  }
}

class RateLimitError extends Error {
  status = 429;
  retryAfter: number;
  constructor(retryAfter: number) {
    super("Rate limit exceeded");
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
  }
}

/**
 * Mock model provider that throws errors based on the task message.
 * This simulates real API errors that would trigger the `onError` callback.
 */
const mockModelProvider: ModelProvider = {
  get modelId() {
    return "mock-model";
  },
  get info() {
    return { name: "mock", version: "1.0.0", capabilities: [] };
  },
  streamChat(params: StreamChatParams): ModelStream {
    const lastMessage = params.messages[params.messages.length - 1];
    const content = lastMessage.content;
    const text = typeof content === "string"
      ? content
      : content.map((c) => c.type === "text" ? c.text : "").join("");

    // Throw different errors based on task content
    if (text.includes("payment")) {
      throw new PaymentRequiredError("API quota exceeded");
    }
    if (text.includes("rate_limit")) {
      throw new RateLimitError(60);
    }
    if (text.includes("type_error")) {
      throw new TypeError("Invalid request format");
    }
    if (text.includes("unexpected")) {
      throw new Error("Something unexpected happened");
    }

    // Normal response
    const message: FinalMessage = {
      role: "assistant",
      content: [{ type: "text", text: `Hello! You said: ${text}` }],
      timestamp: new Date(),
      stop_reason: "end_turn",
      usage: {
        input: { total: 10 },
        output: { total: 20 },
        total: 30,
      },
    };

    return {
      get events() {
        return of({ type: "message" as const, message });
      },
      finalMessage: () => Promise.resolve(message),
    };
  },
};

const port = parsePort(Deno.env.get("PORT"), 8080);

const agent = await createZypherAgent({ model: mockModelProvider });

const app = new Hono()
  .use(cors())
  .route(
    "/",
    createZypherHandler({
      agent,
      websocket: {
        /**
         * Error callback for graceful error handling.
         *
         * This example demonstrates handling different error types:
         * - PaymentRequiredError: Send structured error for client upgrade UI
         * - RateLimitError: Send retry information for client backoff
         * - TypeError: Suppress (log server-side only)
         * - Other errors: Propagate to exposeErrors
         */
        onError: (error, { endpoint }) => {
          console.error(`[${endpoint}]`, error);

          // Payment required - send structured error for client upgrade UI
          if (error instanceof PaymentRequiredError) {
            return {
              status: error.status,
              code: error.code,
              message: error.message,
              upgradeUrl: "/billing",
            };
          }

          // Rate limit - send retry information
          if (error instanceof RateLimitError) {
            return {
              status: error.status,
              code: "rate_limited",
              retryAfter: error.retryAfter,
            };
          }

          // Suppress expected errors (log only, don't send to client)
          if (error instanceof TypeError) {
            return; // void - suppress
          }

          // Propagate unexpected errors (falls back to exposeErrors behavior)
          throw error;
        },

        /**
         * When enabled, errors that propagate (not handled by onError)
         * will send name, message, and stack trace to the client.
         *
         * WARNING: May leak sensitive information. Only enable in development.
         */
        exposeErrors: true,
      },
    }),
  );

Deno.serve({ port }, app.fetch);

console.log(`Zypher HTTP server listening on http://localhost:${port}`);
console.log(`WebSocket endpoint: ws://localhost:${port}/task/ws`);
console.log(
  `\nTest with: wscat -c ws://localhost:${port}/task/ws -s zypher.v1`,
);
console.log(`\nTry these tasks:`);
console.log(`  {"action":"startTask","task":"payment"}      → 402 error`);
console.log(`  {"action":"startTask","task":"rate_limit"}   → 429 error`);
console.log(`  {"action":"startTask","task":"type_error"}   → suppressed`);
console.log(`  {"action":"startTask","task":"unexpected"}   → exposeErrors`);
console.log(`  {"action":"startTask","task":"hello"}        → normal response`);
