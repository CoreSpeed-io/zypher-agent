import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import os from 'os';
import process from 'process';

export interface UserInfo {
  osVersion: string;
  workspacePath: string;
  shell: string;
}

export function getCurrentUserInfo(): UserInfo {
  return {
    osVersion: `${os.platform()} ${os.release()}`,
    workspacePath: process.cwd(),
    shell: process.env.SHELL || '/bin/bash',
  };
}

export function printMessage(message: MessageParam): void {
  console.log(`\n🗣️ Role: ${message.role}`);
  console.log('════════════════════');
  
  const content = Array.isArray(message.content) ? message.content : [{ type: 'text', text: message.content, citations: [] }];
  
  for (const block of content) {
    if (block.type === 'text') {
      console.log(block.text);
    } else if (block.type === 'tool_use' && 'name' in block && 'input' in block) {
      console.log(`🔧 Using tool: ${block.name}`);
      console.log('Parameters:', JSON.stringify(block.input, null, 2));
    } else if (block.type === 'tool_result' && 'content' in block) {
      console.log('📋 Tool result:');
      console.log(block.content);
    } else {
      console.log('Unknown block type:', block);
    }
    console.log('---');
  }
} 