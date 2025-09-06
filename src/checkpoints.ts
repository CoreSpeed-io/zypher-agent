import * as path from "@std/path";
import { ensureDir } from "@std/fs";
import { getWorkspaceDataDir, runCommand } from "./utils/mod.ts";

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

export class CheckpointManager {
  private workingDirectory: string;
  private static _gitEnvCache: Map<string, Record<string, string>> | undefined;

  constructor(workingDirectory?: string) {
    this.workingDirectory = workingDirectory ?? Deno.cwd();
  }

  private async getWorkspaceCheckpointsDir(): Promise<string> {
    const workspaceDir = await getWorkspaceDataDir(this.workingDirectory);
    const checkpointsDir = path.join(workspaceDir, "checkpoints");
    await ensureDir(checkpointsDir);
    return checkpointsDir;
  }

  private async getGitEnv(): Promise<Record<string, string>> {
    const checkpointsDir = await this.getWorkspaceCheckpointsDir();
    const workTree = this.workingDirectory;

    if (!CheckpointManager._gitEnvCache) {
      CheckpointManager._gitEnvCache = new Map();
    }

    const cacheKey = `${checkpointsDir}::${workTree}`;
    const cached = CheckpointManager._gitEnvCache.get(cacheKey);
    if (cached) return cached;

    const env = { GIT_DIR: checkpointsDir, GIT_WORK_TREE: workTree };
    CheckpointManager._gitEnvCache.set(cacheKey, env);

    return env;
  }

  async initRepo(): Promise<void> {
    try {
      await runCommand("git", {
        args: ["status"],
        env: await this.getGitEnv(),
      });
      return;
    } catch {
      // not a repo, continue init
    }

    await runCommand("git", { args: ["init"], env: await this.getGitEnv() });
    await runCommand("git", {
      args: ["config", "user.name", "ZypherAgent"],
      env: await this.getGitEnv(),
    });
    await runCommand("git", {
      args: ["config", "user.email", "zypher@corespeed.io"],
      env: await this.getGitEnv(),
    });
    await runCommand("git", {
      args: ["commit", "--allow-empty", "-m", "Initial checkpoint repository"],
      env: await this.getGitEnv(),
    });
  }

  async createCheckpoint(name: string): Promise<string> {
    await this.initRepo();

    await runCommand("git", {
      args: ["add", "-A"],
      env: await this.getGitEnv(),
    });

    // Check if there are any changes
    const { stdout: status } = await runCommand("git", {
      args: ["status", "--porcelain"],
      env: await this.getGitEnv(),
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
      env: await this.getGitEnv(),
    });

    // Get the commit hash
    const { stdout: commitHash } = await runCommand("git", {
      args: ["rev-parse", "HEAD"],
      env: await this.getGitEnv(),
    });

    return new TextDecoder().decode(commitHash).trim();
  }

  async getCheckpointDetails(checkpointId: string): Promise<Checkpoint> {
    const { stdout: commitInfo } = await runCommand("git", {
      args: ["show", "--no-patch", "--format=%H%n%B%n%aI", checkpointId],
      env: await this.getGitEnv(),
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
      args: ["diff-tree", "--no-commit-id", "--name-only", "-r", checkpointId],
      env: await this.getGitEnv(),
    });

    const files = new TextDecoder().decode(filesChanged).trim().split("\n")
      .filter(Boolean);

    return { id, name, timestamp, files };
  }

  async listCheckpoints(): Promise<Checkpoint[]> {
    await this.initRepo();

    // Get all checkpoint commits with a custom delimiter between commits
    // Using a unique delimiter "###COMMIT###" that won't appear in commit messages
    const { stdout } = await runCommand("git", {
      args: ["log", "--pretty=format:###COMMIT###%n%H%n%aI%n%s"],
      env: await this.getGitEnv(),
    });

    if (!new TextDecoder().decode(stdout).trim()) {
      throw new Error("Failed to list checkpoints: no checkpoints found.");
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
      const { stdout: filesChanged } = await runCommand("git", {
        args: ["diff-tree", "--no-commit-id", "--name-only", "-r", id],
        env: await this.getGitEnv(),
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
  }

  async applyCheckpoint(checkpointId: string): Promise<void> {
    await runCommand("git", {
      args: ["cat-file", "-e", checkpointId],
      env: await this.getGitEnv(),
    });

    const checkpoint = await this.getCheckpointDetails(checkpointId);
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
      env: await this.getGitEnv(),
    });
  }
}

export async function createCheckpoint(
  name: string,
  workingDirectory?: string,
) : Promise<string> {
  return await new CheckpointManager(workingDirectory).createCheckpoint(name);
}

export async function getCheckpointDetails(
  checkpointId: string,
  workingDirectory?: string,
): Promise<Checkpoint> {
  return await new CheckpointManager(workingDirectory).getCheckpointDetails(
    checkpointId,
  );
}

export async function listCheckpoints(workingDirectory?: string): Promise<Checkpoint[]> {
  return await new CheckpointManager(workingDirectory).listCheckpoints();
}

export async function applyCheckpoint(
  checkpointId: string,
  workingDirectory?: string,
): Promise<void> {
  return await new CheckpointManager(workingDirectory).applyCheckpoint(
    checkpointId,
  );
}
