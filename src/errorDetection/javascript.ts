import type { ErrorDetector } from './interface';
import { execAsync, readPackageJson, getRunCommand } from './utils';
import { fileExists } from '../utils';

/**
 * Detector for ESLint errors in JavaScript/TypeScript projects
 */
export class ESLintErrorDetector implements ErrorDetector {
  name = 'ESLint';
  description = 'Detects code style and potential issues using ESLint';
  
  async isApplicable(): Promise<boolean> {
    try {
      const packageJson = await readPackageJson();
      if (!packageJson) return false;
      
      // Check if eslint is in dependencies or devDependencies
      const hasEslint = !!(
        (packageJson.devDependencies && packageJson.devDependencies.eslint) ||
        (packageJson.dependencies && packageJson.dependencies.eslint)
      );
      
      // Also check if there are lint scripts
      const hasLintScript = !!(
        packageJson.scripts && 
        (packageJson.scripts.lint || 
         packageJson.scripts.eslint || 
         Object.keys(packageJson.scripts).some(script => script.includes('lint')))
      );
      
      return hasEslint || hasLintScript;
    } catch {
      return false;
    }
  }
  
  async detect(): Promise<string | null> {
    try {
      // Determine the command to run
      const command = await this.determineCommand();
      
      // Execute the command
      try {
        const { stdout, stderr } = await execAsync(command);
        // If we get here, the command succeeded (no errors)
        return null;
      } catch (error: any) {
        // Command failed, which likely means it found errors
        let errorOutput = '';
        
        if (error.stdout) {
          const filteredStdout = this.filterNonErrors(error.stdout);
          if (filteredStdout) errorOutput += filteredStdout;
        }
        
        if (error.stderr) {
          const filteredStderr = this.filterNonErrors(error.stderr);
          if (filteredStderr) {
            errorOutput += (errorOutput ? '\n' : '') + filteredStderr;
          }
        }
        
        if (!errorOutput && error.message) {
          const filteredMessage = this.filterNonErrors(error.message);
          if (filteredMessage) errorOutput = filteredMessage;
        }
        
        if (errorOutput) {
          return `ESLint errors detected:\n${errorOutput}`;
        }
      }
      
      return null;
    } catch (error) {
      console.warn('Error running ESLint check:', error);
      return null;
    }
  }
  
  /**
   * Determines the command to run for ESLint
   * 
   * @returns {Promise<string>} The command to execute
   * @private
   */
  private async determineCommand(): Promise<string> {
    const packageJson = await readPackageJson();
    
    // If package.json has a lint script, use it
    if (packageJson?.scripts) {
      // Find the appropriate script name
      let scriptName: string | undefined;
      
      if (packageJson.scripts.lint) {
        scriptName = 'lint';
      } else if (packageJson.scripts.eslint) {
        scriptName = 'eslint';
      } else {
        scriptName = Object.keys(packageJson.scripts).find(script => 
          script.includes('lint')
        );
      }
      
      if (scriptName) {
        return await getRunCommand(scriptName);
      }
    }
    
    // For direct commands, we'll use the eslint binary directly
    // but still respect the package manager via getRunCommand
    return await getRunCommand('eslint . --ext .js,.jsx,.ts,.tsx');
  }

  /**
   * Filters out npm notices and other non-error output
   * 
   * @param {string} output - The command output to filter
   * @returns {string} Filtered output containing only actual errors
   */
  private filterNonErrors(output: string): string {
    // Split by lines
    const lines = output.split('\n');
    
    // Filter out npm notices and empty lines
    const errorLines = lines.filter(line => {
      // Skip npm notices
      if (line.trim().startsWith('npm notice')) return false;
      // Skip empty lines
      if (line.trim() === '') return false;
      // Skip npm warnings that aren't related to the code
      if (line.includes('npm WARN')) return false;
      return true;
    });
    
    return errorLines.join('\n');
  }
}

/**
 * Detector for TypeScript compiler errors
 */
export class TypeScriptErrorDetector implements ErrorDetector {
  name = 'TypeScript';
  description = 'Detects type errors using the TypeScript compiler';
  
  async isApplicable(): Promise<boolean> {
    try {
      // Check package.json first
      const packageJson = await readPackageJson();
      if (packageJson) {
        // Check if typescript is in dependencies
        const hasTypeScript = !!(
          (packageJson.devDependencies && packageJson.devDependencies.typescript) ||
          (packageJson.dependencies && packageJson.dependencies.typescript)
        );
        
        // Check if there are type-check scripts
        const hasTypeCheckScript = !!(
          packageJson.scripts && 
          (packageJson.scripts['type-check'] || 
           packageJson.scripts.typecheck || 
           packageJson.scripts.tsc || 
           Object.keys(packageJson.scripts).some(script => 
             script.includes('type') || script.includes('tsc')
           ))
        );
        
        if (hasTypeScript || hasTypeCheckScript) {
          return true;
        }
      }
      
      // Fallback to checking for tsconfig.json
      return await fileExists('tsconfig.json');
    } catch {
      return false;
    }
  }
  
  async detect(): Promise<string | null> {
    try {
      // Determine the command to run
      const command = await this.determineCommand();
      
      // Execute the command
      try {
        await execAsync(command);
        // If we get here, the command succeeded (no errors)
        return null;
      } catch (error: any) {
        // Command failed, which likely means it found errors
        let errorOutput = '';
        
        if (error.stdout) {
          const filteredStdout = this.filterNonErrors(error.stdout);
          if (filteredStdout) errorOutput += filteredStdout;
        }
        
        if (error.stderr) {
          const filteredStderr = this.filterNonErrors(error.stderr);
          if (filteredStderr) {
            errorOutput += (errorOutput ? '\n' : '') + filteredStderr;
          }
        }
        
        if (!errorOutput && error.message) {
          const filteredMessage = this.filterNonErrors(error.message);
          if (filteredMessage) errorOutput = filteredMessage;
        }
        
        if (errorOutput) {
          return `TypeScript errors detected:\n${errorOutput}`;
        }
      }
      
      return null;
    } catch (error) {
      console.warn('Error running TypeScript check:', error);
      return null;
    }
  }
  
  /**
   * Determines the command to run for TypeScript
   * 
   * @returns {Promise<string>} The command to execute
   * @private
   */
  private async determineCommand(): Promise<string> {
    const packageJson = await readPackageJson();
    
    // If package.json has a type-check script, use it
    if (packageJson?.scripts) {
      // Find the appropriate script name
      let scriptName: string | undefined;
      
      if (packageJson.scripts['type-check']) {
        scriptName = 'type-check';
      } else if (packageJson.scripts.typecheck) {
        scriptName = 'typecheck';
      } else if (packageJson.scripts.tsc) {
        scriptName = 'tsc';
      } else {
        scriptName = Object.keys(packageJson.scripts).find(script => 
          script.includes('type') || script.includes('tsc')
        );
      }
      
      if (scriptName) {
        return await getRunCommand(scriptName);
      }
    }
    
    // For direct commands, we'll use the tsc binary directly
    // but still respect the package manager via getRunCommand
    return await getRunCommand('tsc --noEmit');
  }

  /**
   * Filters out npm notices and other non-error output
   * 
   * @param {string} output - The command output to filter
   * @returns {string} Filtered output containing only actual errors
   */
  private filterNonErrors(output: string): string {
    // Split by lines
    const lines = output.split('\n');
    
    // Filter out npm notices and empty lines
    const errorLines = lines.filter(line => {
      // Skip npm notices
      if (line.trim().startsWith('npm notice')) return false;
      // Skip empty lines
      if (line.trim() === '') return false;
      // Skip npm warnings that aren't related to the code
      if (line.includes('npm WARN')) return false;
      return true;
    });
    
    return errorLines.join('\n');
  }
} 