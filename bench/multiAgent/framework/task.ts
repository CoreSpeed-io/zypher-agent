

export class Task {
  overall_task: string;
  content: string;
  context: TaskResult[];
  constructor(content: string, overall_task: string, context: TaskResult[]) {
    this.content = content;
    this.context = context;
    this.overall_task = overall_task
  }
}

export class TaskResult {
  task_content: string;
  final_answer: string;
  constructor(task_content: string, final_answer: string) {
    this.final_answer = final_answer;
    this.task_content = task_content;
  }
}
