export interface Message {
  role: "user" | "assistant";
  content: ContentBlock[];
  timestamp: string;
  checkpointId?: string;
}

export type ContentBlock =
  | TextBlock
  | ImageBlock
  | ToolUseBlock
  | ToolResultBlock;

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ImageBlock {
  type: "image";
  source: {
    type: "base64";
    media_type: string;
    data: string;
  };
}

export interface ToolUseBlock {
  type: "tool_use";
  toolUseId: string;
  name: string;
  input: unknown;
}

export interface ToolResultBlock {
  type: "tool_result";
  toolUseId: string;
  name: string;
  input: unknown;
  success: boolean;
  content: (TextBlock | ImageBlock)[];
}
