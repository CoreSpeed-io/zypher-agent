import { assertEquals } from "@std/assert";
import { Subject } from "rxjs";
import type { Message } from "../message.ts";
import type { TaskEvent } from "../task_events.ts";
import type { ZypherContext } from "../zypher_agent.ts";
import { continueOnMaxTokens } from "./continue_on_max_tokens.ts";
import type { InterceptorContext } from "./interface.ts";

// Helper to create a minimal ZypherContext for testing (no file system access)
function createTestContext(): ZypherContext {
  return {
    workingDirectory: "/tmp/zypher/working",
    zypherDir: "/tmp/zypher",
    workspaceDataDir: "/tmp/zypher/workspaceData",
    fileAttachmentCacheDir: "/tmp/zypher/cache",
    skillsDir: "/tmp/zypher/skills",
  };
}

// Helper to create a minimal InterceptorContext for testing
function createTestInterceptorContext(
  overrides: Partial<InterceptorContext> = {},
): InterceptorContext {
  const messages: Message[] = [{
    role: "assistant",
    content: [{ type: "text", text: "Hello world" }],
    timestamp: new Date(),
  }];

  return {
    messages,
    lastResponse: "Hello world",
    tools: [],
    zypherContext: createTestContext(),
    signal: new AbortController().signal,
    eventSubject: new Subject<TaskEvent>(),
    ...overrides,
  };
}

Deno.test("continueOnMaxTokens - returns complete: true when stop reason is not max_tokens", async () => {
  const interceptor = continueOnMaxTokens();

  const ctx = createTestInterceptorContext({ stopReason: "end_turn" });
  const result = await interceptor.intercept(ctx);

  assertEquals(result.complete, true);
});

Deno.test("continueOnMaxTokens - returns complete: false when stop reason is max_tokens", async () => {
  const interceptor = continueOnMaxTokens();

  const ctx = createTestInterceptorContext({ stopReason: "max_tokens" });
  const result = await interceptor.intercept(ctx);

  assertEquals(result.complete, false);
  assertEquals(result.reason, "Continue");
});

Deno.test("continueOnMaxTokens - respects maxContinuations parameter", async () => {
  const interceptor = continueOnMaxTokens(2);

  const ctx = createTestInterceptorContext({ stopReason: "max_tokens" });

  // First continuation
  let result = await interceptor.intercept(ctx);
  assertEquals(result.complete, false);

  // Second continuation
  result = await interceptor.intercept(ctx);
  assertEquals(result.complete, false);

  // Third should complete (max reached)
  result = await interceptor.intercept(ctx);
  assertEquals(result.complete, true);
});

Deno.test("continueOnMaxTokens - has correct name", () => {
  const interceptor = continueOnMaxTokens();

  assertEquals(interceptor.name, "continue-on-max-tokens");
});
