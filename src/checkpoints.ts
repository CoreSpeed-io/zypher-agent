import * as path from "@std/path";
import { ensureDir } from "@std/fs";
import { getWorkspaceDataDir, runCommand } from "./utils/mod.ts";

export interface Checkpoint {
  id: string;
  name: string;
  timestamp: string;
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

    const { stdout: status } = await runCommand("git", {
      args: ["status", "--porcelain"],
      env: await this.getGitEnv(),
    });
    const hasChanges = new TextDecoder().decode(status).trim().length > 0;

    let commitMessage = `CHECKPOINT: ${name}`;
    if (!hasChanges) commitMessage = `CHECKPOINT: ${name} (advice-only)`;

    await runCommand("git", {
      args: ["commit", "--allow-empty", "-m", commitMessage],
      env: await this.getGitEnv(),
    });

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
      throw new Error(`Invalid commit info for checkpoint ${checkpointId}`);
    }

    const id = lines[0];
    const timestamp = lines[lines.length - 1];

    let name = "Unknown checkpoint";
    const checkpointLine = lines.find((line) =>
      line.startsWith("CHECKPOINT: ")
    );
    if (checkpointLine) {
      name = checkpointLine.substring("CHECKPOINT: ".length);
      if (name.endsWith(" (advice-only)")) {
        name = name.slice(0, -" (advice-only)".length).trim();
      }
    }

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

    const { stdout } = await runCommand("git", {
      args: ["log", "--pretty=format:###COMMIT###%n%H%n%aI%n%s"],
      env: await this.getGitEnv(),
    });

    const content = new TextDecoder().decode(stdout).trim();
    if (!content) return [];

    const checkpoints: Checkpoint[] = [];
    const commitEntries = content.split("###COMMIT###").filter(Boolean);

    for (const entry of commitEntries) {
      const lines = entry.trim().split("\n");
      if (lines.length < 3) continue;

      const [id, timestamp, ...subjectLines] = lines;
      const subject = subjectLines.join("\n");

      if (
        !subject.startsWith("CHECKPOINT:") &&
        !subject.includes("Initial checkpoint")
      ) {
        continue;
      }

      const name = subject.startsWith("CHECKPOINT:")
        ? subject.substring("CHECKPOINT: ".length).replace(
          / \(advice-only\)$/,
          "",
        )
        : subject;

      const { stdout: filesChanged } = await runCommand("git", {
        args: ["diff-tree", "--no-commit-id", "--name-only", "-r", id],
        env: await this.getGitEnv(),
      });

      const files = new TextDecoder().decode(filesChanged).trim().split("\n")
        .filter(Boolean);

      checkpoints.push({ id, name, timestamp, files });
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

    const backupName = `backup-before-applying-${checkpointId.substring(0, 8)}`;
    await this.createCheckpoint(backupName);

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
