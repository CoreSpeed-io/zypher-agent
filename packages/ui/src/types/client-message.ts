export type ClientMessage =
  | StartTaskMessage
  | ResumeTaskMessage
  | CancelTaskMessage
  | ApproveToolMessage;

export interface StartTaskMessage {
  action: "startTask";
  task: string;
  fileAttachments?: string[];
}

export interface ResumeTaskMessage {
  action: "resumeTask";
  lastEventId?: string;
}

export interface CancelTaskMessage {
  action: "cancelTask";
}

export interface ApproveToolMessage {
  action: "approveTool";
  approved: boolean;
}
