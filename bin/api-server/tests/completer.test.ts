import { assertEquals, assertRejects } from "@std/assert";
import { Completer } from "../src/completer.ts";

// Test that a completer can be resolved
Deno.test(
  "testCompleter",
  async (_t) => {
    const completer = new Completer<boolean>();
    setTimeout(() => completer.resolve(true), 10); // Simulate async resolve
    const result = await completer.wait({});
    assertEquals(result, true);
  },
);

// Test that a completer can be rejected
Deno.test(
  "testCompleterReject",
  async (_t) => {
    const completer = new Completer<boolean>();
    completer.reject(new Error("Test error"));
    await assertRejects(
      () => completer.wait({}),
      Error,
      "Test error",
    );
  },
);

// Test that a completer can be resolved with an abort signal
Deno.test(
  "testCompleterAbort",
  async (_t) => {
    const completer = new Completer<boolean>();
    const signal = AbortSignal.timeout(100); // Use a short timeout for the test
    await assertRejects(
      () => completer.wait({ signal }),
      Error,
      "Operation aborted",
    );
  },
);

// Test that a completer can be resolved multiple times
Deno.test("double resolve", async () => {
  const completer = new Completer<number>();
  completer.resolve(1);
  completer.resolve(2);
  const result = await completer.wait({});
  assertEquals(result, 1);
});

// Test that a completer can be rejected after being resolved
Deno.test("resolve after reject", async () => {
  const completer = new Completer<number>();
  completer.reject(new Error("fail"));
  completer.resolve(1);
  await assertRejects(() => completer.wait({}), Error, "fail");
});

// Test that a completer can be aborted after being resolved
Deno.test("abort after resolve", async () => {
  const completer = new Completer<number>();
  const controller = new AbortController();
  completer.resolve(1);
  controller.abort();
  const result = await completer.wait({ signal: controller.signal });
  assertEquals(result, 1);
});

// Test that a completer can be aborted immediately
Deno.test("immediate abort", async () => {
  const completer = new Completer<number>();
  const controller = new AbortController();
  controller.abort();
  await assertRejects(
    () => completer.wait({ signal: controller.signal }),
    Error,
    "Operation aborted",
  );
});

// Test that a completer can be resolved multiple times
Deno.test("multiple waiters", async () => {
  const completer = new Completer<number>();
  const p1 = completer.wait({});
  const p2 = completer.wait({});
  completer.resolve(42);
  assertEquals(await p1, 42);
  assertEquals(await p2, 42);
});
