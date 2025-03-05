import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EditFileTool } from './EditFileTool';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('EditFileTool', () => {
  const testDir = path.join(process.cwd(), 'test-files');
  const testFile = path.join(testDir, 'test.ts');

  beforeEach(async () => {
    // Create test directory and file
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Cleanup test files
    await fs.rm(testDir, { recursive: true, force: true });
  });

  async function createTestFile(content: string) {
    await fs.writeFile(testFile, content);
  }

  it('should generate correct diff for a simple line addition', async () => {
    const originalContent = `function test() {
  const x = 1;
  return x;
}`;
    await createTestFile(originalContent);

    const result = await EditFileTool.execute({
      targetFile: testFile,
      instructions: 'Add console.log',
      codeEdit: `function test() {
  const x = 1;
  console.log(x);
  return x;
}`
    });

    expect(result).toContain('diff --git');
    expect(result).toContain('+  console.log(x);');
    expect(result).not.toContain('-  console.log(x);');
  });

  it('should handle multiple sections with existing code comment', async () => {
    const originalContent = `import { x } from './x';
import { y } from './y';

function test() {
  const a = 1;
  const b = 2;
  return a + b;
}

export { test };`;
    await createTestFile(originalContent);

    const result = await EditFileTool.execute({
      targetFile: testFile,
      instructions: 'Add new import and modify function',
      codeEdit: `import { x } from './x';
import { z } from './z';
// ... existing code ...
function test() {
  const a = 1;
  const b = 2;
  const c = 3;
  return a + b + c;
}
// ... existing code ...`
    });

    expect(result).toContain('+import { z } from \'./z\';');
    expect(result).toContain('+  const c = 3;');
    expect(result).toContain('+  return a + b + c;');
    expect(result).toContain('-  return a + b;');
  });

  it('should preserve context lines around changes', async () => {
    const originalContent = `line1
line2
line3
line4
line5
line6
line7
line8`;
    await createTestFile(originalContent);

    const result = await EditFileTool.execute({
      targetFile: testFile,
      instructions: 'Modify middle lines',
      codeEdit: `// ... existing code ...
line3
modified line4
modified line5
line6
// ... existing code ...`
    });

    // Should include context lines
    expect(result).toContain(' line3');
    expect(result).toContain(' line6');
    expect(result).toContain('+modified line4');
    expect(result).toContain('+modified line5');
    expect(result).toContain('-line4');
    expect(result).toContain('-line5');
  });

  it('should handle edge case with changes at file boundaries', async () => {
    const originalContent = `line1
line2
line3`;
    await createTestFile(originalContent);

    const result = await EditFileTool.execute({
      targetFile: testFile,
      instructions: 'Modify first and last lines',
      codeEdit: `modified line1
line2
modified line3`
    });

    expect(result).toContain('+modified line1');
    expect(result).toContain('-line1');
    expect(result).toContain(' line2');
    expect(result).toContain('+modified line3');
    expect(result).toContain('-line3');
  });

  it('should handle empty or invalid files gracefully', async () => {
    await createTestFile('');

    const result = await EditFileTool.execute({
      targetFile: testFile,
      instructions: 'Add content to empty file',
      codeEdit: `new content`
    });

    expect(result).toContain('+new content');
  });

  it('should handle whitespace differences correctly', async () => {
    const originalContent = `function test() {
    const x = 1;
    return x;
}`;
    await createTestFile(originalContent);

    const result = await EditFileTool.execute({
      targetFile: testFile,
      instructions: 'Add line with different indentation',
      codeEdit: `function test() {
  const x = 1;
  const y = 2;
  return x;
}`
    });

    expect(result).toContain('+  const y = 2;');
  });
}); 