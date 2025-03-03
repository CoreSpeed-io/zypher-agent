import { ZypherAgent } from '../src/ZypherAgent';
import { ReadFileTool, ListDirTool, EditFileTool } from '../src/tools';
import dotenv from 'dotenv';

async function main() {
  dotenv.config();

  try {
    // Initialize the agent
    const agent = new ZypherAgent();

    // Register the default tools
    agent.registerTool(new ReadFileTool());
    agent.registerTool(new ListDirTool());
    agent.registerTool(new EditFileTool());

    // Example task that uses multiple tools
    const task = `
      I need help with the following tasks:
      1. List the contents of the src directory
      2. Read the package.json file
      3. Create a new file called 'hello.txt' in the root directory with the content "Hello, World!"
      Please execute these tasks in order.
    `;

    console.log('Starting task execution...\n');
    console.log('Task:', task, '\n');

    // Run the task loop
    const messages = await agent.runTaskLoop(task);

    console.log('Task completed. Results:');
    console.log('Messages:', messages);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Run the demo
main(); 