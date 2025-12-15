/**
 * AG-UI Protocol Adapter for ZypherAgent
 *
 * @example
 * ```typescript
 * import { createAGUIStream } from "@corespeed/zypher/agui";
 *
 * const stream = createAGUIStream(await request.json(), { agent });
 * return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });
 * ```
 *
 * @module
 */

// Core adapter, types, and SSE encoder
export {
  createAGUIStream,
  createEventContext,
  encodeSSEStream,
  formatSSEMessage,
  parseRunAgentInput,
} from "./adapter.ts";
export type { CreateAGUIStreamOptions, EventContext } from "./adapter.ts";

// Message conversion utilities
export {
  convertAGUIMessagesToZypher,
  convertZypherMessagesToAGUI,
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
