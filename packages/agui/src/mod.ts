/**
 * AG-UI Protocol Adapter for ZypherAgent
 *
 * @example
 * ```typescript
 * import { createAguiStream } from "@zypher/agui";
 *
 * const stream = createAguiStream(await request.json(), { agent });
 * return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });
 * ```
 *
 * @module
 */

// Core adapter, types, and SSE encoder
export {
  createAguiStream,
  createEventContext,
  encodeSSEStream,
  formatSSEMessage,
  parseRunAgentInput,
} from "./adapter.ts";
export type { CreateAguiStreamOptions, EventContext } from "./adapter.ts";

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
