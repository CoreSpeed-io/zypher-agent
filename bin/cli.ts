import { ZypherAgent } from '../src/ZypherAgent';
import { ReadFileTool, ListDirTool, EditFileTool } from '../src/tools';
import dotenv from 'dotenv';
import readline from 'readline';
import { stdin as input, stdout as output } from 'process';

const rl = readline.createInterface({ input, output });

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

async function main() {
  dotenv.config();

  try {
    // Initialize the agent
    const agent = new ZypherAgent();

    // Register the default tools
    agent.registerTool(ReadFileTool);
    agent.registerTool(ListDirTool);
    agent.registerTool(EditFileTool);

    console.log('\n🤖 Welcome to Zypher Agent CLI!\n');
    console.log('Type your task or command below. Use "exit" or Ctrl+C to quit.\n');

    while (true) {
      const task = await prompt('🔧 Enter your task: ');
      
      if (task.toLowerCase() === 'exit') {
        console.log('\nGoodbye! 👋\n');
        break;
      }

      if (task.trim()) {
        console.log('\n🚀 Starting task execution...\n');
        try {
          await agent.runTaskLoop(task);
          console.log('\n✅ Task completed.\n');
        } catch (error) {
          console.error('\n❌ Error:', error instanceof Error ? error.message : error);
          console.log('\nReady for next task.\n');
        }
      }
    }
  } catch (error) {
    console.error('Fatal Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    rl.close();
  }
}

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log('\n\nGoodbye! 👋\n');
  process.exit(0);
});

// Run the CLI
main();
