/**
 * Async utilities for managing promises and asynchronous control flow.
 *
 * @example
 * ```ts
 * import { Completer } from "@zypher/utils/async";
 *
 * const completer = new Completer<string>();
 * // Resolve from elsewhere
 * completer.resolve("done");
 * const result = await completer.wait();
 * ```
 *
 * @module
 */

import { createAbortError } from "./error.ts";

/**
 * A Promise wrapper that allows external resolution/rejection.
 * Useful for bridging callback-based APIs with async/await.
 *
 * @example
 * ```ts
 * const completer = new Completer<string>();
 *
 * // Somewhere else in the code
 * completer.resolve("done");
 *
 * // Wait for the result
 * const result = await completer.wait();
 * ```
 */
export class Completer<T> {
  readonly #promise: Promise<T>;
  #resolve!: (value: T) => void;
  #reject!: (reason?: unknown) => void;

  constructor() {
    this.#promise = new Promise((res, rej) => {
      this.#resolve = res;
      this.#reject = rej;
    });
  }

  /**
   * Wait for the completer to be resolved or rejected.
   *
   * @param options - Optional configuration
   * @param options.signal - AbortSignal to cancel the wait
   * @returns The resolved value
   */
  wait(options?: { signal?: AbortSignal }): Promise<T> {
    if (options?.signal) {
      if (options.signal.aborted) {
        this.#reject(createAbortError("Operation aborted"));
        return this.#promise;
      }

      options.signal.addEventListener("abort", () => {
        this.#reject(createAbortError("Operation aborted"));
      });
    }
    return this.#promise;
  }

  /**
   * Resolve the completer with a value.
   */
  resolve(value: T) {
    this.#resolve(value);
  }

  /**
   * Reject the completer with a reason.
   */
  reject(reason?: unknown) {
    this.#reject(reason);
  }
}
