import { AbortError } from "../../../src/error.ts";

export class Completor<T> {
  readonly #promise: Promise<T>;
  #resolve!: (value: T) => void;
  #reject!: (error?: Error) => void;

  constructor() {
    this.#promise = new Promise((res, rej) => {
      this.#resolve = res;
      this.#reject = rej;
    });
  }

  wait(options: { signal?: AbortSignal }): Promise<T> {
    const { signal } = options;
    if (signal) {
      if (signal.aborted) {
        this.#reject(new AbortError("Operation aborted"));
        return this.#promise;
      }

      signal.addEventListener("abort", () => {
        this.#reject(new AbortError("Operation aborted"));
      });
    }
    return this.#promise;
  }

  resolve(value: T) {
    this.#resolve(value);
  }

  reject(error: Error) {
    this.#reject(error);
  }
}
