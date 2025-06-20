import { AbortError } from "../error.ts";

export class Completer<T> {
  readonly #promise: Promise<T>;
  #resolve!: (value: T) => void;
  #reject!: (error?: Error) => void;

  constructor() {
    this.#promise = new Promise((res, rej) => {
      this.#resolve = res;
      this.#reject = rej;
    });
  }

  wait(options?: { signal?: AbortSignal }): Promise<T> {
    if (options?.signal) {
      if (options.signal.aborted) {
        this.#reject(new AbortError("Operation aborted"));
        return this.#promise;
      }

      options.signal.addEventListener("abort", () => {
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
