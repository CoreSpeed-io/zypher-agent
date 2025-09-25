import type { Message } from "../message.ts";
import type { Subject } from "rxjs";
import type { TaskEvent } from "../TaskEvents.ts";

/**
 * Creates a type-safe proxy around a Message array that automatically emits
 * task events when new messages are added via push().
 *
 * Auto-emission behavior:
 * - push() -> Emits TaskMessageEvent for each new message
 * - All other operations (unshift, splice, pop, shift, index assignment) -> No auto-emission
 *
 * History modifications should be handled manually by interceptors using
 * context.eventSubject.next() with TaskHistoryChangedEvent when needed.
 *
 * @param wrappedArray The existing Message array to wrap
 * @param eventSubject Subject to emit events through
 * @returns A proxied Message array with automatic emission for push() only
 */
export function createEmittingMessageArray(
  wrappedArray: Message[],
  eventSubject: Subject<TaskEvent>,
): Message[] {
  return new Proxy(wrappedArray, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);

      // Override push - adds new messages (only auto-emit case)
      if (prop === "push") {
        return function (...messages: Message[]): number {
          const result = target.push(...messages);
          messages.forEach((message) => {
            eventSubject.next({ type: "message", message });
          });
          return result;
        };
      }

      // Default behavior for all other properties/methods
      // History modifications (unshift, splice, pop, shift, index assignment)
      // are handled manually by interceptors when needed
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
