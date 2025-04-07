import * as path from "jsr:@std/path";
import { getWorkspaceDataDir } from "./utils/index.ts";
import { fileExists as pathExists } from "./utils/index.ts";

let gitEnv: Record<string, string> = {};

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
 * Gets the path to the checkpoints directory for the current workspace
 *
 * @returns Promise resolving to the path to the checkpoints directory
 */
async function getWorkspaceCheckpointsDir(): Promise<string> {
  const workspaceDir = await getWorkspaceDataDir();
  const checkpointsDir = path.join(workspaceDir, "checkpoints");

  // Create checkpoints directory if it doesn't exist
  if (!(await pathExists(checkpointsDir))) {
    await Deno.mkdir(checkpointsDir, { recursive: true });
  }

  return checkpointsDir;
}

/**
 * Get the Git command with the proper git-dir and work-tree flags
 *
 * @returns Promise resolving to the Git command prefix
 */
async function getGitEnv(): Promise<Record<string, string>> {
  const checkpointsDir = await getWorkspaceCheckpointsDir();

  return gitEnv ??= {
    GIT_DIR: checkpointsDir,
    GIT_WORK_TREE: Deno.cwd(),
  };
}

/**
 * Initialize the checkpoint repository if it doesn't exist
 */
async function initCheckpointRepo(): Promise<void> {
  // Check if Git repository already exists and is valid
  try {
    await new Deno.Command("git", {
      args: ["status"],
      env: await getGitEnv(),
    }).output();
    return; // It's a valid Git repository, so we're done
  } catch {
    // Not a valid Git repository or doesn't exist, continue with initialization
  }

  // Initialize a new git repository (non-bare)
  await new Deno.Command("git", {
    args: ["init"],
    env: await getGitEnv(),
  }).output();

  // Configure the repository
  await new Deno.Command("git", {
    args: ["config", "user.name", "ZypherAgent"],
    env: await getGitEnv(),
  }).output();
  await new Deno.Command("git", {
    args: ["config", "user.email", "zypher@corespeed.io"],
    env: await getGitEnv(),
  }).output();

  // Create an initial empty commit
  try {
    await new Deno.Command("git", {
      args: ["commit", "--allow-empty", "-m", "Initial checkpoint repository"],
      env: await getGitEnv(),
    }).output();
  } catch (error) {
    console.error("Failed to initialize checkpoint repository:", error);
  }
}

/**
 * Creates a new checkpoint using Git
 *
 * @param name - User-friendly name for the checkpoint
 * @returns Promise resolving to the checkpoint ID (Git commit hash) or undefined if creation failed
 */
export async function createCheckpoint(
  name: string,
): Promise<string | undefined> {
  try {
    // Initialize the checkpoint repository if needed
    await initCheckpointRepo();

    // Add all files to the index
    await new Deno.Command("git", {
      args: ["add", "-A"],
      env: await getGitEnv(),
    }).output();

    // Check if there are any changes
    const { stdout: status } = await new Deno.Command("git", {
      args: ["status", "--porcelain"],
      env: await getGitEnv(),
    }).output();
    const hasChanges = new TextDecoder().decode(status).trim().length > 0;

    // Create checkpoint commit with appropriate message
    let commitMessage = `CHECKPOINT: ${name}`;
    if (!hasChanges) {
      commitMessage = `CHECKPOINT: ${name} (advice-only)`;
    }

    // Create the commit (using --allow-empty to handle cases with no changes)
    await new Deno.Command("git", {
      args: ["commit", "--allow-empty", "-m", commitMessage],
      env: await getGitEnv(),
    }).output();

    // Get the commit hash
    const { stdout: commitHash } = await new Deno.Command("git", {
      args: ["rev-parse", "HEAD"],
      env: await getGitEnv(),
    }).output();

    return new TextDecoder().decode(commitHash).trim();
  } catch (error) {
    console.error("Failed to create checkpoint:", error);
    return undefined;
  }
}

/**
 * Gets details about a specific checkpoint
 *
 * @param checkpointId - The ID of the checkpoint (Git commit hash)
 * @returns Promise resolving to checkpoint details
 * @throws Error if checkpoint cannot be found or is invalid
 */
export async function getCheckpointDetails(
  checkpointId: string,
): Promise<Checkpoint> {
  try {
    // Get commit details
    const { stdout: commitInfo } = await new Deno.Command("git", {
      args: ["show", "--no-patch", "--format=%H%n%B%n%aI", checkpointId],
      env: await getGitEnv(),
    }).output();

    const lines = new TextDecoder().decode(commitInfo).trim().split("\n");
    if (lines.length < 2) {
      throw new Error(
        `Invalid commit info format for checkpoint ${checkpointId}`,
      );
    }

    const id = lines[0];
    const timestamp = lines[lines.length - 1];

    // Validate required fields
    if (!id || !timestamp) {
      throw new Error(
        `Missing required commit information for checkpoint ${checkpointId}`,
      );
    }

    // Extract name from commit message
    let name = "";

    // Find the checkpoint prefix
    const checkpointLine = lines.find((line) =>
      line.startsWith("CHECKPOINT: ")
    );

    if (checkpointLine) {
      name = checkpointLine.substring("CHECKPOINT: ".length);
      // Remove advice-only suffix if present
      if (name.endsWith(" (advice-only)")) {
        name = name.substring(0, name.length - " (advice-only)".length);
      }
    } else {
      // If no checkpoint line found, use a default name
      name = "Unknown checkpoint";
    }

    // Get files changed in this commit
    const { stdout: filesChanged } = await new Deno.Command("git", {
      args: ["diff-tree", "--no-commit-id", "--name-only", "-r", checkpointId],
      env: await getGitEnv(),
    }).output();

    const files = new TextDecoder().decode(filesChanged).trim().split("\n")
      .filter(Boolean);

    return {
      id,
      name,
      timestamp,
      files,
    };
  } catch (error) {
    // Convert any error to a consistent error format
    if (error instanceof Error) {
      throw error; // Re-throw if it's already an Error
    }
    throw new Error(`Failed to get checkpoint details: ${String(error)}`);
  }
}

/**
 * Lists all available checkpoints
 *
 * @returns Promise resolving to an array of checkpoints
 */
export async function listCheckpoints(): Promise<Checkpoint[]> {
  try {
    // Check if it's a valid Git repository using git status
    try {
      await new Deno.Command("git", {
        args: ["status"],
        env: await getGitEnv(),
      }).output();
    } catch {
      return []; // Not a valid Git repository or doesn't exist
    }

    // Get all checkpoint commits with a custom delimiter between commits
    // Using a unique delimiter "###COMMIT###" that won't appear in commit messages
    const { stdout } = await new Deno.Command("git", {
      args: ["log", "--pretty=format:%H%n%aI%n%s"],
      env: await getGitEnv(),
    }).output();

    if (!new TextDecoder().decode(stdout).trim()) {
      return [];
    }

    // Parse commits into checkpoints
    const checkpoints: Checkpoint[] = [];

    // Split by the delimiter, remove the first empty entry if it exists
    const commitEntries = new TextDecoder().decode(stdout).split("###COMMIT###")
      .filter(Boolean);

    for (const entry of commitEntries) {
      const lines = entry.trim().split("\n");

      // Each commit should have at least 3 lines (hash, date, subject)
      if (lines.length < 3) continue;

      const [id, timestamp, ...subjectLines] = lines;

      // Skip if we don't have valid id or timestamp
      if (!id || !timestamp) {
        console.warn("Invalid commit entry, missing id or timestamp");
        continue;
      }

      const subject = subjectLines.join("\n");

      // Skip non-checkpoint commits (except for the initial repository commit)
      if (
        !subject.startsWith("CHECKPOINT:") &&
        !subject.includes("Initial checkpoint")
      ) {
        continue;
      }

      // Extract name from commit message
      const name = subject.startsWith("CHECKPOINT:")
        ? subject
          .substring("CHECKPOINT: ".length)
          .replace(/ \(advice-only\)$/, "")
        : subject;

      // Get files for this checkpoint
      const { stdout: filesChanged } = await new Deno.Command("git", {
        args: ["diff-tree", "--no-commit-id", "--name-only", "-r", id],
        env: await getGitEnv(),
      }).output();

      const files = new TextDecoder().decode(filesChanged).trim().split("\n")
        .filter(Boolean);

      checkpoints.push({
        id,
        name,
        timestamp,
        files,
      });
    }

    return checkpoints;
  } catch (error) {
    console.error("Failed to list checkpoints:", error);
    return [];
  }
}

/**
 * Applies a checkpoint to restore the workspace to that state
 *
 * @param checkpointId - The ID of the checkpoint to apply
 * @returns Promise resolving to true if successful
 * @throws Error if checkpoint cannot be found or applied
 */
export async function applyCheckpoint(checkpointId: string): Promise<void> {
  try {
    // Verify the checkpoint exists
    await new Deno.Command("git", {
      args: ["cat-file", "-e", checkpointId],
      env: await getGitEnv(),
    }).output();

    // Get checkpoint details
    const checkpoint = await getCheckpointDetails(checkpointId);

    // If this is an advice-only checkpoint (no files), warn that there are no changes to apply
    if (!checkpoint.files || checkpoint.files.length === 0) {
      console.warn(`Checkpoint "${checkpoint.name}" contains no file changes.`);
      return;
    }

    // Create a backup of the current state (optional)
    const backupName = `backup-before-applying-${checkpointId.substring(0, 8)}`;
    await createCheckpoint(backupName);

    // Reset the working directory to the checkpoint state
    // Use checkout to avoid changing the HEAD
    await new Deno.Command("git", {
      args: ["checkout", checkpointId, "--", "."],
      env: await getGitEnv(),
    }).output();
  } catch (error) {
    // Convert any error to a consistent error format
    if (error instanceof Error) {
      throw error; // Re-throw if it's already an Error
    }
    throw new Error(`Failed to apply checkpoint: ${String(error)}`);
  }
}
