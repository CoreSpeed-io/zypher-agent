import type { Message } from "../message.ts";

/**
 * Prints a message from the agent's conversation to the console with proper formatting.
 * Handles different types of message blocks including text, tool use, and tool results.
 *
 * @param {MessageParam} message - The message to print
 *
 * @example
 * printMessage({
 *   role: 'assistant',
 *   content: 'Hello, how can I help you?'
 * });
 *
 * printMessage({
 *   role: 'user',
 *   content: [{
 *     type: 'tool_result',
 *     tool_use_id: '123',
 *     content: 'Tool execution result'
 *   }]
 * });
 */
export function printMessage(message: Message): void {
  console.log(`\n🗣️ Role: ${message.role}`);
  console.log("════════════════════");

  const content = Array.isArray(message.content)
    ? message.content
    : [{ type: "text", text: message.content, citations: [] }];

  for (const block of content) {
    if (block.type === "text") {
      console.log(block.text);
    } else if (
      block.type === "tool_use" &&
      "name" in block &&
      "input" in block
    ) {
      console.log(`🔧 Using tool: ${block.name}`);
      console.log("Parameters:", JSON.stringify(block.input, null, 2));
    } else if (block.type === "tool_result" && "content" in block) {
      console.log("📋 Tool result:");
      console.log(block.content);
    } else {
      console.log("Unknown block type:", block);
    }
    console.log("---");
  }
}
