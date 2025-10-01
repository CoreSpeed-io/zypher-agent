import * as path from "@std/path";
import { ensureDir } from "@std/fs";
import { runCommand } from "./utils/mod.ts";
import type { ZypherContext } from "./ZypherAgent.ts";

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
export class CheckpointManager {
  readonly #gitEnv: Record<string, string>;
  readonly #checkpointsDir: string;

  constructor(readonly context: ZypherContext) {
    this.#checkpointsDir = path.join(
      this.context.workspaceDataDir,
      "checkpoints",
    );
    this.#gitEnv = {
      GIT_DIR: this.#checkpointsDir,
      GIT_WORK_TREE: this.context.workingDirectory,
    };
  }

  /**
   * Initialize the checkpoint repository if it doesn't exist
   */
  async #initCheckpointRepo(): Promise<void> {
    await ensureDir(this.#checkpointsDir);

    // Check if Git repository already exists and is valid
    try {
      await runCommand("git", {
        args: ["status"],
        env: this.#gitEnv,
      });
      return; // It's a valid Git repository, so we're done
    } catch {
      // Not a valid Git repository or doesn't exist, continue with initialization
    }

    // Initialize a new git repository (non-bare)
    await runCommand("git", {
      args: ["init"],
      env: this.#gitEnv,
    });

    // Configure the repository
    await runCommand("git", {
      args: ["config", "user.name", "ZypherAgent"],
      env: this.#gitEnv,
    });
    await runCommand("git", {
      args: ["config", "user.email", "zypher@corespeed.io"],
      env: this.#gitEnv,
    });

    // Create an initial empty commit
    await runCommand("git", {
      args: ["commit", "--allow-empty", "-m", "Initial checkpoint repository"],
      env: this.#gitEnv,
    });
  }

  /**
   * Creates a new checkpoint using Git
   *
   * @param name - User-friendly name for the checkpoint
   * @returns Promise resolving to the checkpoint ID (Git commit hash)
   */
  async createCheckpoint(name: string): Promise<string> {
    try {
      // Initialize the checkpoint repository if needed
      await this.#initCheckpointRepo();

      // Add all files to the index
      await runCommand("git", {
        args: ["add", "-A"],
        env: this.#gitEnv,
      });

      // Check if there are any changes
      const { stdout: status } = await runCommand("git", {
        args: ["status", "--porcelain"],
        env: this.#gitEnv,
      });
      const hasChanges = new TextDecoder().decode(status).trim().length > 0;

      // Create checkpoint commit with appropriate message
      let commitMessage = `CHECKPOINT: ${name}`;
      if (!hasChanges) {
        commitMessage = `CHECKPOINT: ${name} (advice-only)`;
      }

      // Create the commit (using --allow-empty to handle cases with no changes)
      await runCommand("git", {
        args: ["commit", "--allow-empty", "-m", commitMessage],
        env: this.#gitEnv,
      });

      // Get the commit hash
      const { stdout: commitHash } = await runCommand("git", {
        args: ["rev-parse", "HEAD"],
        env: this.#gitEnv,
      });

      const checkpointId = new TextDecoder().decode(commitHash).trim();
      if (!checkpointId) {
        throw new Error("Git returned an empty commit hash");
      }

      return checkpointId;
    } catch (error) {
      throw new Error("Failed to create checkpoint.", { cause: error });
    }
  }

  /**
   * Gets details about a specific checkpoint
   *
   * @param checkpointId - The ID of the checkpoint (Git commit hash)
   * @returns Promise resolving to checkpoint details
   * @throws Error if checkpoint cannot be found or is invalid
   */
  async getCheckpointDetails(checkpointId: string): Promise<Checkpoint> {
    try {
      // Get commit details
      const { stdout: commitInfo } = await runCommand("git", {
        args: ["show", "--no-patch", "--format=%H%n%B%n%aI", checkpointId],
        env: this.#gitEnv,
      });

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
      const { stdout: filesChanged } = await runCommand("git", {
        args: [
          "diff-tree",
          "--no-commit-id",
          "--name-only",
          "-r",
          checkpointId,
        ],
        env: this.#gitEnv,
      });

      const files = new TextDecoder().decode(filesChanged).trim().split("\n")
        .filter(Boolean);

      return {
        id,
        name,
        timestamp,
        files,
      };
    } catch (error) {
      throw new Error("Failed to get checkpoint details.", { cause: error });
    }
  }

  /**
   * Lists all available checkpoints
   *
   * @returns Promise resolving to an array of checkpoints
   */

  async listCheckpoints(): Promise<Checkpoint[]> {
    try {
      // Ensure the checkpoint repository is initialized

      await this.#initCheckpointRepo();

      // Get all checkpoint commits with a custom delimiter between commits
      // Using a unique delimiter "###COMMIT###" that won't appear in commit messages
      const { stdout } = await runCommand("git", {
        args: ["log", "--pretty=format:###COMMIT###%n%H%n%aI%n%s"],
        env: this.#gitEnv,
      });

      if (!new TextDecoder().decode(stdout).trim()) {
        throw new Error("Failed to list checkpoints: no checkpoints found.");
      }

      // Parse commits into checkpoints
      const checkpoints: Checkpoint[] = [];

      // Split by the delimiter, remove the first empty entry if it exists
      const commitEntries = new TextDecoder().decode(stdout).split(
        "###COMMIT###",
      )
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
        const { stdout: filesChanged } = await runCommand("git", {
          args: ["diff-tree", "--no-commit-id", "--name-only", "-r", id],
          env: this.#gitEnv,
        });

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
      throw new Error("Failed to list checkpoints.", { cause: error });
    }
  }

  /**
   * Applies a checkpoint to restore the workspace to that state
   *
   * @param checkpointId - The ID of the checkpoint to apply
   * @returns Promise resolving to true if successful
   * @throws Error if checkpoint cannot be found or applied
   */

  async applyCheckpoint(checkpointId: string): Promise<void> {
    await runCommand("git", {
      args: ["cat-file", "-e", checkpointId],
      env: this.#gitEnv,
    });

    // Get checkpoint details
    const checkpoint = await this.getCheckpointDetails(checkpointId);

    // If this is an advice-only checkpoint (no files), warn that there are no changes to apply
    if (!checkpoint.files || checkpoint.files.length === 0) {
      console.warn(`Checkpoint "${checkpoint.name}" contains no file changes.`);
      return;
    }

    // Create a backup of the current state (optional)
    const backupName = `backup-before-applying-${checkpointId.substring(0, 8)}`;
    await this.createCheckpoint(backupName);

    // Reset the working directory to the checkpoint state
    // Use checkout to avoid changing the HEAD
    await runCommand("git", {
      args: ["checkout", checkpointId, "--", "."],
      env: this.#gitEnv,
    });
  }
  catch(error: Error) {
    throw new Error("Failed to apply checkpoint.", { cause: error });
  }
}
