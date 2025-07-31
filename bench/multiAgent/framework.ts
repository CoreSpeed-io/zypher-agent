export interface Job {
  id: string;
  payload: unknown;
  assignedWorkerId?: string;
}

export interface JobResult {
  jobId: string;
  data: unknown;
}

export interface Worker {
  id: string;
  description: string;
  execute(job: Job): Promise<JobResult>;
}

export interface Summarizer {
  summarize(results: JobResult[]): Promise<string>;
}

export interface StatefulPlanner {
  bootstrap(prompt: string): Job[];
  assign(jobs: Job[], workers: Worker[]): Map<string, Job[]>;
  next(summary: string): Job[];
  isComplete(): boolean;
}

export class MultiAgentEngine {
  constructor(
    private readonly planner: StatefulPlanner,
    private readonly workers: Worker[],
    private readonly summarizer: Summarizer
  ) {}

  async run(prompt: string): Promise<string> {
    let jobs = this.planner.bootstrap(prompt);
    let latestSummary = '';

    while (!this.planner.isComplete()) {
      const assignment = this.planner.assign(jobs, this.workers);

      const tasks: Promise<JobResult>[] = [];
      for (const worker of this.workers) {
        const myJobs = assignment.get(worker.id) ?? [];
        for (const job of myJobs) {
          job.assignedWorkerId = worker.id;
          tasks.push(worker.execute(job));
        }
      }

      const results = await Promise.all(tasks);
      latestSummary = await this.summarizer.summarize(results);

      jobs = this.planner.next(latestSummary);

      if (jobs.length === 0 && this.planner.isComplete()) break;
    }

    return latestSummary;
  }
}
