import { assertEquals, assertRejects } from "@std/assert";
import { Completer } from "./mod.ts";

Deno.test(
  "completer resolves with correct value",
  async (_t) => {
    const completer = new Completer<boolean>();
    setTimeout(() => completer.resolve(true), 10); // Simulate async resolve
    const result = await completer.wait({});
    assertEquals(result, true);
  },
);

Deno.test(
  "completer rejects with provided error",
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

Deno.test(
  "completer aborts when abort signal is triggered",
  async (_t) => {
    const completer = new Completer<boolean>();
    const signal = AbortSignal.timeout(100); // Use a short timeout for the test
    await assertRejects(
      () => completer.wait({ signal }),
      DOMException,
      "Operation aborted",
    );
  },
);

Deno.test("completer only honors first resolution", async () => {
  const completer = new Completer<number>();
  completer.resolve(1);
  completer.resolve(2); // This should have no effect
  const result = await completer.wait({});
  assertEquals(result, 1);
});

Deno.test("completer ignores resolution after rejection", async () => {
  const completer = new Completer<number>();
  completer.reject(new Error("fail"));
  completer.resolve(1); // This should have no effect
  await assertRejects(() => completer.wait({}), Error, "fail");
});

Deno.test("completer ignores abort signal after resolution", async () => {
  const completer = new Completer<number>();
  const controller = new AbortController();
  completer.resolve(1);
  controller.abort(); // This should have no effect
  const result = await completer.wait({ signal: controller.signal });
  assertEquals(result, 1);
});

Deno.test("completer rejects immediately with pre-aborted signal", async () => {
  const completer = new Completer<number>();
  const controller = new AbortController();
  controller.abort();
  await assertRejects(
    () => completer.wait({ signal: controller.signal }),
    DOMException,
    "Operation aborted",
  );
});

Deno.test("completer delivers same resolution to multiple waiters", async () => {
  const completer = new Completer<number>();
  const p1 = completer.wait({});
  const p2 = completer.wait({});
  completer.resolve(42);
  assertEquals(await p1, 42);
  assertEquals(await p2, 42);
});

Deno.test("completer only honors first rejection", async () => {
  const completer = new Completer<number>();
  completer.reject(new Error("first error"));
  completer.reject(new Error("second error"));
  await assertRejects(() => completer.wait({}), Error, "first error");
});

Deno.test("completer maintains state for late waiters after resolution", async () => {
  const completer = new Completer<number>();
  completer.resolve(42);
  // Call wait() after it's already been resolved
  const result = await completer.wait({});
  assertEquals(result, 42);
});

Deno.test("completer maintains state for late waiters after rejection", async () => {
  const completer = new Completer<number>();
  completer.reject(new Error("already rejected"));
  // Call wait() after it's already been rejected
  await assertRejects(
    () => completer.wait({}),
    Error,
    "already rejected",
  );
});

Deno.test("completer maintains same promise identity across wait calls", () => {
  const completer = new Completer<number>();
  const p1 = completer.wait({});
  const p2 = completer.wait({});
  // The promises returned by wait() should be the same object
  assertEquals(p1, p2);
});
