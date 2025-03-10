import { exec } from 'child_process';
import { promisify } from 'util';
import { access, constants, mkdir } from 'fs/promises';
import { join } from 'path';
import { getWorkspaceDataDir } from './utils';

const execAsync = promisify(exec);

/**
 * Checkpoint information
 */
export interface Checkpoint {
  /**
   * Unique identifier for the checkpoint (Git commit hash)
   */
  id: string;

  /**
   * User-friendly name for the checkpoint
   */
  name: string;

  /**
   * When the checkpoint was created
   */
  timestamp: string;

  /**
   * Files changed in this checkpoint
   */
  files?: string[];
}

/**
 * Check if a path exists
 *
 * @param path - Path to check
 * @returns Promise resolving to true if the path exists, false otherwise
 */
async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Gets the path to the checkpoints directory for the current workspace
 *
 * @returns Promise resolving to the path to the checkpoints directory
 */
async function getWorkspaceCheckpointsDir(): Promise<string> {
  const workspaceDir = await getWorkspaceDataDir();
  const checkpointsDir = join(workspaceDir, 'checkpoints');

  // Create checkpoints directory if it doesn't exist
  if (!(await pathExists(checkpointsDir))) {
    await mkdir(checkpointsDir, { recursive: true });
  }

  return checkpointsDir;
}

/**
 * Get the Git command with the proper git-dir and work-tree flags
 *
 * @returns Promise resolving to the Git command prefix
 */
async function getGitCommand(): Promise<string> {
  const checkpointsDir = await getWorkspaceCheckpointsDir();
  return `git --git-dir=${checkpointsDir} --work-tree=${process.cwd()}`;
}

/**
 * Initialize the checkpoint repository if it doesn't exist
 */
async function initCheckpointRepo(): Promise<void> {
  const checkpointsDir = await getWorkspaceCheckpointsDir();

  // Check if Git repository already exists and is valid
  try {
    const git = await getGitCommand();
    await execAsync(`${git} status`);
    return; // It's a valid Git repository, so we're done
  } catch {
    // Not a valid Git repository or doesn't exist, continue with initialization
  }

  // Initialize a new git repository (non-bare)
  await execAsync(`GIT_DIR=${checkpointsDir} git init`);

  // Get the Git command now that the repository is initialized
  const git = await getGitCommand();

  // Configure the repository
  await execAsync(`${git} config user.name "ZypherAgent"`);
  await execAsync(`${git} config user.email "zypher@corespeed.io"`);

  // Create an initial empty commit
  try {
    await execAsync(`${git} commit --allow-empty -m "Initial checkpoint repository"`);
  } catch (error) {
    console.error('Failed to initialize checkpoint repository:', error);
  }
}

/**
 * Creates a new checkpoint using Git
 *
 * @param name - User-friendly name for the checkpoint
 * @returns Promise resolving to the checkpoint ID (Git commit hash) or undefined if creation failed
 */
export async function createCheckpoint(name: string): Promise<string | undefined> {
  try {
    // Initialize the checkpoint repository if needed
    await initCheckpointRepo();

    const git = await getGitCommand();

    // Add all files to the index
    await execAsync(`${git} add -A`);

    // Check if there are any changes
    const { stdout: status } = await execAsync(`${git} status --porcelain`);
    const hasChanges = status.trim().length > 0;

    // Create checkpoint commit with appropriate message
    let commitMessage = `CHECKPOINT: ${name}`;
    if (!hasChanges) {
      commitMessage = `CHECKPOINT: ${name} (advice-only)`;
    }

    // Create the commit (using --allow-empty to handle cases with no changes)
    await execAsync(`${git} commit --allow-empty -m "${commitMessage}"`);

    // Get the commit hash
    const { stdout: commitHash } = await execAsync(`${git} rev-parse HEAD`);

    return commitHash.trim();
  } catch (error) {
    console.error('Failed to create checkpoint:', error);
    return undefined;
  }
}

/**
 * Gets details about a specific checkpoint
 *
 * @param checkpointId - The ID of the checkpoint (Git commit hash)
 * @returns Promise resolving to checkpoint details or undefined if not found
 */
export async function getCheckpointDetails(checkpointId: string): Promise<Checkpoint | undefined> {
  try {
    const git = await getGitCommand();

    // Get commit details
    const { stdout: commitInfo } = await execAsync(
      `${git} show --no-patch --format="%H%n%B%n%aI" ${checkpointId}`,
    );

    const lines = commitInfo.trim().split('\n');
    const id = lines[0];
    const timestamp = lines[lines.length - 1];

    // Extract name from commit message
    let name = '';

    // Find the checkpoint prefix
    const checkpointLine = lines.find((line) => line.startsWith('CHECKPOINT: '));
    if (checkpointLine) {
      name = checkpointLine.substring('CHECKPOINT: '.length);
      // Remove advice-only suffix if present
      if (name.endsWith(' (advice-only)')) {
        name = name.substring(0, name.length - ' (advice-only)'.length);
      }
    }

    // Get files changed in this commit
    const { stdout: filesChanged } = await execAsync(
      `${git} diff-tree --no-commit-id --name-only -r ${checkpointId}`,
    );

    const files = filesChanged.trim().split('\n').filter(Boolean);

    return {
      id,
      name,
      timestamp,
      files,
    };
  } catch (error) {
    console.error('Failed to get checkpoint details:', error);
    return undefined;
  }
}

/**
 * Lists all available checkpoints
 *
 * @returns Promise resolving to an array of checkpoints
 */
export async function listCheckpoints(): Promise<Checkpoint[]> {
  try {
    // Get the Git command
    const git = await getGitCommand();

    // Check if it's a valid Git repository using git status
    try {
      await execAsync(`${git} status`);
    } catch {
      return []; // Not a valid Git repository or doesn't exist
    }

    // Get all checkpoint commits with a custom delimiter between commits
    // Using a unique delimiter "###COMMIT###" that won't appear in commit messages
    const { stdout } = await execAsync(`${git} log --pretty=format:"###COMMIT###%n%H%n%aI%n%s"`);

    if (!stdout.trim()) {
      return [];
    }

    // Parse commits into checkpoints
    const checkpoints: Checkpoint[] = [];

    // Split by the delimiter, remove the first empty entry if it exists
    const commitEntries = stdout.split('###COMMIT###').filter(Boolean);

    for (const entry of commitEntries) {
      const lines = entry.trim().split('\n');

      // Each commit should have at least 3 lines (hash, date, subject)
      if (lines.length < 3) continue;

      const id = lines[0];
      const timestamp = lines[1];
      const subject = lines[2];

      // Skip non-checkpoint commits (except for the initial repository commit)
      if (!subject.startsWith('CHECKPOINT:') && !subject.includes('Initial checkpoint')) continue;

      // Extract name from commit message
      const name = subject.startsWith('CHECKPOINT:')
        ? subject.substring('CHECKPOINT: '.length)
        : subject;

      // Get files for this checkpoint
      const { stdout: filesChanged } = await execAsync(
        `${git} diff-tree --no-commit-id --name-only -r ${id}`,
      );

      const files = filesChanged.trim().split('\n').filter(Boolean);

      checkpoints.push({
        id,
        name,
        timestamp,
        files,
      });
    }

    return checkpoints;
  } catch (error) {
    console.error('Failed to list checkpoints:', error);
    return [];
  }
}

/**
 * Applies a checkpoint to restore the workspace to that state
 *
 * @param checkpointId - The ID of the checkpoint to apply
 * @returns Promise resolving to true if successful, false otherwise
 */
export async function applyCheckpoint(checkpointId: string): Promise<boolean> {
  try {
    const git = await getGitCommand();

    // Verify the checkpoint exists
    await execAsync(`${git} cat-file -e ${checkpointId}`);

    // Get checkpoint details
    const checkpoint = await getCheckpointDetails(checkpointId);

    // If this is an advice-only checkpoint (no files), warn that there are no changes to apply
    if (checkpoint && (!checkpoint.files || checkpoint.files.length === 0)) {
      console.warn(`Checkpoint "${checkpoint.name}" contains no file changes.`);
      return true; // Return success but no changes were made
    }

    // Create a backup of the current state (optional)
    const backupName = `backup-before-applying-${checkpointId.substring(0, 8)}`;
    await createCheckpoint(backupName);

    // Reset the working directory to the checkpoint state
    // Use checkout to avoid changing the HEAD
    await execAsync(`${git} checkout ${checkpointId} -- .`);

    return true;
  } catch (error) {
    console.error('Failed to apply checkpoint:', error);
    return false;
  }
}
