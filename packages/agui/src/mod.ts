/**
 * AG-UI Protocol Adapter for ZypherAgent
 *
 * Transport-agnostic event streaming with RxJS Observable.
 *
 * @module
 */

// Core adapter and types
export {
  createAguiEventStream,
  createEventContext,
  parseRunAgentInput,
} from "./adapter.ts";
export type { AguiEventStreamOptions, EventContext } from "./adapter.ts";

// Message conversion utilities
export {
  convertAguiMessagesToZypher,
  convertZypherMessagesToAgui,
  extractTaskDescription,
} from "./messages.ts";

// Event conversion utilities
export {
  convertTaskEvent,
  createMessagesSnapshotEvent,
  createRunErrorEvent,
  createRunFinishedEvent,
  createRunStartedEvent,
  createStateSnapshotEvent,
} from "./events.ts";
