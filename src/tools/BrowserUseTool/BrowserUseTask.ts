const DEFAULT_BASE_URL = "https://api.browser-use.com/api/v1";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class BrowserUseTask {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(options?: { apiKey?: string; baseUrl?: string }) {
    this.apiKey = options?.apiKey ?? Deno.env.get("BROWSERUSEIO_KEY") ??
      (() => {
        throw new Error(
          "API_KEY must be provided via constructor or environment variable",
        );
      })();

    this.baseUrl = options?.baseUrl ?? DEFAULT_BASE_URL;
  }

  private get headers() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    } as const;
  }

  /**
   * Submit a task to Browser‑Use.
   * @param instructions Natural‑language instructions for the browser agent.
   * @returns The task ID assigned by the service.
   */
  async createTask(instructions: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/run-task`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ task: instructions }),
    });

    if (!res.ok) {
      throw new Error(
        `Failed to create task: ${res.status} ${res.statusText} – ${(await res
          .text())}`,
      );
    }

    const data: { id: string } = await res.json();
    return data.id;
  }

  /**
   * Repeatedly poll `GET /task/:id/status` until the task reaches `finished`.
   * Throws if the task ends in `failed` or `stopped`.
   */
  async waitForTaskCompletion(
    taskId: string,
    pollIntervalMs = 5000,
  ): Promise<void> {
    for (;;) {
      const res = await fetch(`${this.baseUrl}/task/${taskId}/status`, {
        headers: this.headers,
      });

      if (!res.ok) {
        throw new Error(
          `Failed to get status for task ${taskId}: ${res.status} ${res.statusText}`,
        );
      }

      const status: string = await res.json();

      if (status === "finished") return;
      if (status === "failed" || status === "stopped") {
        throw new Error(`Task ${taskId} ended with status: ${status}`);
      }

      await sleep(pollIntervalMs);
    }
  }

  /** Retrieve the raw task output as a string. */
  async fetchTaskOutput(taskId: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/task/${taskId}`, {
      headers: this.headers,
    });

    if (!res.ok) {
      throw new Error(
        `Failed to fetch task ${taskId}: ${res.status} ${res.statusText}`,
      );
    }

    const data: { output: string } = await res.json();
    return data.output;
  }

  /**
   * Convenience helper: create → wait → get output.
   * @returns The raw output string.
   */
  async runTask(
    instructions: string,
    pollIntervalMs = 5000,
  ): Promise<string> {
    const taskId = await this.createTask(instructions);
    await this.waitForTaskCompletion(taskId, pollIntervalMs);
    return this.fetchTaskOutput(taskId);
  }
}
