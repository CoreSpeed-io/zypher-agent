import { ZypherAgent } from "../../../src/ZypherAgent.ts";
import { Task } from "./task.ts";


const WORKER_PROMPT_TMPLATE = `We are solving a complex task, and we have split the task into several subtasks.
    
You need to process one given task. Don't assume that the problem is unsolvable. The answer does exist. If you can't solve the task, please describe the reason and the result you have achieved in detail.
The content of the task that you need to do is:

<task>
{content}
</task>
    
Here is the overall task for reference, which contains some helpful information that can help you solve the task:

<overall_task>
{overall_task}
</overall_task>

Here are results of some prerequisite results that you can refer to (empty if there are no prerequisite results):

<dependency_results_info>
{dependency_tasks_info}
</dependency_results_info>

Here are some additional information about the task (only for reference, and may be empty):
<additional_info>
{additional_info}
</additional_info>

Now please fully leverage the information above, try your best to leverage the existing results and your available tools to solve the current task.

If you need to write code, never generate code like "example code", your code should be completely runnable and able to fully solve the task. After writing the code, you must execute the code.
If you are going to process local files, you should explicitly mention all the processed file path (especially extracted files in zip files) in your answer to let other workers know where to find the file.
If you find the subtask is of no help to complete the overall task based on the information you collected, you should make the subtask failed, and return your suggestion for the next step. (e.g. you are asked to extract the content of the document, but the document is too long. It is better to write python code to process it)
`

class Worker {
  id: string;
  descriptiopn: string;
  agent: ZypherAgent

  constructor(id: string, descriptiopn: string, agent: ZypherAgent) {
    this.id = id;
    this.descriptiopn = descriptiopn;
    this.agent = agent
  }
  
  run_task(task: Task) {
    this.agent.runTaskWithStreaming(task.content)
  }
}
