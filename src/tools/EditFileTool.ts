import { z } from 'zod';
import { defineTool } from './index';
import * as fs from 'fs/promises';

export const EditFileTool = defineTool({
  name: 'edit_file',
  description: 'Use this tool to propose an edit to an existing file.\n\nThis will be read by a less intelligent model, which will quickly apply the edit. You should make it clear what the edit is, while also minimizing the unchanged code you write.\nWhen writing the edit, you should specify each edit in sequence, with the special comment `// ... existing code ...` to represent unchanged code in between edited lines.\n\nFor example:\n\n```\n// ... existing code ...\nFIRST_EDIT\n// ... existing code ...\nSECOND_EDIT\n// ... existing code ...\nTHIRD_EDIT\n// ... existing code ...\n```\n\nYou should still bias towards repeating as few lines of the original file as possible to convey the change.\nBut, each edit should contain sufficient context of unchanged lines around the code you\'re editing to resolve ambiguity.\nDO NOT omit spans of pre-existing code (or comments) without using the `// ... existing code ...` comment to indicate its absence. If you omit the existing code comment, the model may inadvertently delete these lines.\nMake sure it is clear what the edit should be, and where it should be applied.',
  parameters: z.object({
    targetFile: z.string().describe('The target file to modify. Always specify the target file as the first argument and use the relative path in the workspace of the file to edit'),
    instructions: z.string().describe('A single sentence instruction describing what you are going to do for the sketched edit. This is used to assist the less intelligent model in applying the edit.'),
    codeEdit: z.string().describe('Specify ONLY the precise lines of code that you wish to edit. **NEVER specify or write out unchanged code**. Instead, represent all unchanged code using the comment of the language you\'re editing in - example: `// ... existing code ...`'),
  }),
  execute: async ({ targetFile, instructions, codeEdit }) => {
    try {
      // Read the original file
      const originalContent = await fs.readFile(targetFile, 'utf-8');
      const originalLines = originalContent.split('\n');
      
      // Split the code edit into sections based on the special comment
      const editSections = codeEdit
        .split('// ... existing code ...')
        .map(section => section.trim())
        .filter(section => section.length > 0);

      // Special handling for empty files
      if (originalContent.trim() === '') {
        const newContent = codeEdit.trim();
        const diffOutput = [
          `diff --git a/${targetFile} b/${targetFile}`,
          `--- a/${targetFile}`,
          `+++ b/${targetFile}`,
          `@@ -0,0 +1,${newContent.split('\n').length} @@ ${instructions}`,
          ...newContent.split('\n').map(line => `+${line}`)
        ];
        return diffOutput.join('\n');
      }

      // Find edit locations and context
      const changes = [];
      let lastMatchEnd = -1;

      for (const section of editSections) {
        const sectionLines = section.split('\n');
        let bestMatchIndex = -1;
        let bestMatchScore = 0;

        // Find best matching position for this section
        for (let i = lastMatchEnd + 1; i < originalLines.length; i++) {
          let matchScore = 0;
          for (let j = 0; j < sectionLines.length && i + j < originalLines.length; j++) {
            if (sectionLines[j].trim() === originalLines[i + j].trim()) {
              matchScore++;
            }
          }
          if (matchScore > bestMatchScore) {
            bestMatchScore = matchScore;
            bestMatchIndex = i;
          }
        }

        if (bestMatchIndex !== -1) {
          // Calculate context lines
          const contextBefore = Math.min(3, bestMatchIndex);
          const contextAfter = Math.min(3, originalLines.length - (bestMatchIndex + sectionLines.length));

          changes.push({
            startLine: bestMatchIndex - contextBefore + 1,
            lineCount: sectionLines.length + contextBefore + contextAfter,
            originalLines: originalLines.slice(
              bestMatchIndex - contextBefore,
              bestMatchIndex + sectionLines.length + contextAfter
            ),
            newLines: [
              ...originalLines.slice(bestMatchIndex - contextBefore, bestMatchIndex),
              ...sectionLines,
              ...originalLines.slice(bestMatchIndex + sectionLines.length, bestMatchIndex + sectionLines.length + contextAfter)
            ]
          });

          lastMatchEnd = bestMatchIndex + sectionLines.length;
        }
      }

      // Generate diff output
      const normalizedPath = targetFile.replace(/\\/g, '/');
      const diffOutput = [
        `diff --git a/${normalizedPath} b/${normalizedPath}`,
        `--- a/${normalizedPath}`,
        `+++ b/${normalizedPath}`
      ];

      // Add hunks for actual changes only
      for (const change of changes) {
        // Add hunk header
        diffOutput.push(
          `@@ -${change.startLine},${change.originalLines.length} +${change.startLine},${change.newLines.length} @@ ${instructions}`
        );

        // Compare and add lines with proper markers
        const maxLines = Math.max(change.originalLines.length, change.newLines.length);
        for (let i = 0; i < maxLines; i++) {
          const originalLine = change.originalLines[i];
          const newLine = change.newLines[i];

          if (originalLine === newLine) {
            diffOutput.push(` ${originalLine}`);
          } else {
            if (originalLine !== undefined) {
              diffOutput.push(`-${originalLine}`);
            }
            if (newLine !== undefined) {
              diffOutput.push(`+${newLine}`);
            }
          }
        }
      }

      return diffOutput.join('\n');

    } catch (error) {
      if (error instanceof Error) {
        return `Error editing file: ${error.message}`;
      }
      return 'Error editing file: Unknown error';
    }
  },
});
