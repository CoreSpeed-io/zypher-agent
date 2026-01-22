import { assertEquals } from "@std/assert";
import { Subject } from "rxjs";
import type { Message } from "../message.ts";
import type { TaskEvent } from "../task_events.ts";
import type { ZypherContext } from "../zypher_agent.ts";
import { continueOnMaxTokens } from "./continue_on_max_tokens.ts";
import { type InterceptorContext, LoopDecision } from "./interface.ts";

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

Deno.test("continueOnMaxTokens - returns COMPLETE when stop reason is not max_tokens", async () => {
  const interceptor = continueOnMaxTokens();

  const ctx = createTestInterceptorContext({ stopReason: "end_turn" });
  const result = await interceptor.intercept(ctx);

  assertEquals(result.decision, LoopDecision.COMPLETE);
});

Deno.test("continueOnMaxTokens - returns CONTINUE when stop reason is max_tokens", async () => {
  const interceptor = continueOnMaxTokens();

  const ctx = createTestInterceptorContext({ stopReason: "max_tokens" });
  const result = await interceptor.intercept(ctx);

  assertEquals(result.decision, LoopDecision.CONTINUE);
});

Deno.test("continueOnMaxTokens - respects maxContinuations parameter", async () => {
  const interceptor = continueOnMaxTokens(2);

  const ctx = createTestInterceptorContext({ stopReason: "max_tokens" });

  // First continuation
  let result = await interceptor.intercept(ctx);
  assertEquals(result.decision, LoopDecision.CONTINUE);

  // Second continuation
  result = await interceptor.intercept(ctx);
  assertEquals(result.decision, LoopDecision.CONTINUE);

  // Third should complete (max reached)
  result = await interceptor.intercept(ctx);
  assertEquals(result.decision, LoopDecision.COMPLETE);
});

Deno.test("continueOnMaxTokens - injects continue message", async () => {
  const interceptor = continueOnMaxTokens();

  const ctx = createTestInterceptorContext({ stopReason: "max_tokens" });
  await interceptor.intercept(ctx);

  const lastMessage = ctx.messages[ctx.messages.length - 1];
  const firstBlock = lastMessage.content[0];
  if (firstBlock.type === "text") {
    assertEquals(firstBlock.text, "Continue");
  } else {
    throw new Error("Expected text block");
  }
});

Deno.test("continueOnMaxTokens - has correct name and description", () => {
  const interceptor = continueOnMaxTokens();

  assertEquals(interceptor.name, "continue-on-max-tokens");
  assertEquals(
    interceptor.description,
    "Auto-continue when response is truncated due to max tokens",
  );
});
