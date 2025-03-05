import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EditFileTool, TEST_MODE } from './EditFileTool';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('EditFileTool', () => {
  const testDir = path.join(process.cwd(), 'test-files');
  const testFile = path.join(testDir, 'test.ts');

  beforeEach(async () => {
    // Enable test mode
    TEST_MODE.enabled = true;
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

  async function fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  it('should create a new file if it does not exist', async () => {
    const newFilePath = path.join(testDir, 'new-file.ts');
    const result = await EditFileTool.execute({
      targetFile: newFilePath,
      instructions: 'Create a new TypeScript file',
      codeEdit: `export function hello() {
  return 'world';
}`
    });

    // Check diff format
    expect(result).toContain('diff --git');
    expect(result).toContain('--- /dev/null');
    expect(result).toContain(`+++ b/${path.relative(process.cwd(), newFilePath)}`);
    expect(result).toContain('@@ -0,0 +1,3 @@');
    expect(result).toContain('+export function hello() {');
  });

  it('should create a new file in nested directories', async () => {
    const nestedDir = path.join(testDir, 'nested', 'dirs');
    const newFilePath = path.join(nestedDir, 'deep-file.ts');
    
    const result = await EditFileTool.execute({
      targetFile: newFilePath,
      instructions: 'Create a new file in nested directory',
      codeEdit: `import { something } from '../other';

export function nested() {
  return something();
}`
    });

    // Verify directory was created
    const dirExists = await fileExists(nestedDir);
    expect(dirExists).toBe(true);

    // Check diff format
    expect(result).toContain('diff --git');
    expect(result).toContain('--- /dev/null');
    expect(result).toContain(`+++ b/${path.relative(process.cwd(), newFilePath)}`);
    expect(result).toContain('+import { something }');
  });

  it('should handle creating a new file with multiple lines and empty lines', async () => {
    const newFilePath = path.join(testDir, 'multi-line.ts');
    const codeEdit = `import { foo } from './foo';

interface Config {
  name: string;
  value: number;
}

export function configure(config: Config) {
  return foo(config);
}`;

    const result = await EditFileTool.execute({
      targetFile: newFilePath,
      instructions: 'Create a new file with interface and function',
      codeEdit
    });

    // Check line count in diff header
    const lineCount = codeEdit.split('\n').length;
    expect(result).toContain(`@@ -0,0 +1,${lineCount} @@`);
    
    // Verify each line is prefixed with +
    const lines = result.split('\n');
    const contentLines = lines.slice(4); // Skip diff header
    contentLines.forEach(line => {
      expect(line.startsWith('+')).toBe(true);
    });
  });

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