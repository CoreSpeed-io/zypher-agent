import { useState, useMemo } from "react";
import type {
  ToolUseBlock,
  ToolResultBlock,
  TextBlock,
  ImageBlock,
} from "@zypher/ui";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  ChevronRightIcon,
  CheckCircle2Icon,
  XCircleIcon,
  WrenchIcon,
  Loader2Icon,
} from "lucide-react";
import { MultiFileDiff, File as CodeFile } from "@pierre/diffs/react";
import type { FileContents } from "@pierre/diffs";

// Unified tool card that combines tool_use and tool_result
interface ToolCardProps {
  toolUse: ToolUseBlock;
  toolResult?: ToolResultBlock;
  streaming?: boolean;
}

export function ToolCard({ toolUse, toolResult, streaming }: ToolCardProps) {
  const [open, setOpen] = useState(false);

  // Determine status: streaming, success, or error
  const isComplete = !!toolResult;
  const isSuccess = toolResult?.success ?? true;

  // Status-based styling
  const getStatusStyle = () => {
    if (streaming) {
      return "border-blue-500/30 bg-blue-500/5";
    }
    if (!isComplete) {
      return "border-border/50 bg-muted/30";
    }
    return isSuccess
      ? "border-green-500/30 bg-green-500/5"
      : "border-red-500/30 bg-red-500/5";
  };

  const getStatusIcon = () => {
    if (streaming) {
      return <Loader2Icon className="size-4 animate-spin text-blue-500 shrink-0" />;
    }
    if (!isComplete) {
      return <WrenchIcon className="size-4 text-muted-foreground shrink-0" />;
    }
    return isSuccess ? (
      <CheckCircle2Icon className="size-4 text-green-600 dark:text-green-400 shrink-0" />
    ) : (
      <XCircleIcon className="size-4 text-red-600 dark:text-red-400 shrink-0" />
    );
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div
        className={cn(
          "rounded-lg border overflow-hidden transition-colors",
          getStatusStyle()
        )}
      >
        {/* Header - always visible */}
        <CollapsibleTrigger className="w-full">
          <div
            className={cn(
              "flex items-center gap-2 px-3 py-2.5",
              "hover:bg-black/5 dark:hover:bg-white/5 transition-colors",
              "cursor-pointer select-none"
            )}
          >
            <ChevronRightIcon
              className={cn(
                "size-4 text-muted-foreground transition-transform shrink-0",
                open && "rotate-90"
              )}
            />
            {getStatusIcon()}
            <span className="font-medium text-sm truncate flex-1 text-left">
              {toolUse.name}
            </span>
            {streaming && (
              <span className="text-xs shrink-0 text-blue-500">
                Running...
              </span>
            )}
          </div>
        </CollapsibleTrigger>

        {/* Expandable content */}
        <CollapsibleContent>
          <div className="border-t border-border/30">
            {/* Input section */}
            <div className="py-1">
              <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground border-b border-border/30 bg-muted/10">
                Input
              </div>
              <JsonRenderer content={toolUse.input} />
            </div>

            {/* Result section - only if we have a result */}
            {toolResult && (
              <div className="border-t border-border/30 py-1">
                <div
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium border-b border-border/30 bg-muted/10",
                    toolResult.success
                      ? "text-green-600 dark:text-green-400"
                      : "text-red-600 dark:text-red-400"
                  )}
                >
                  {toolResult.success ? "Result" : "Error"}
                </div>
                <div className="space-y-2">
                  {toolResult.content.map((item, i) => (
                    <ToolResultContent
                      key={i}
                      content={item}
                      toolName={toolUse.name}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

// Legacy components for backward compatibility
interface ToolUseCardProps {
  block: ToolUseBlock;
  streaming?: boolean;
}

export function ToolUseCard({ block, streaming }: ToolUseCardProps) {
  return <ToolCard toolUse={block} streaming={streaming} />;
}

interface ToolResultCardProps {
  block: ToolResultBlock;
}

export function ToolResultCard({ block }: ToolResultCardProps) {
  // This is a standalone result card - create a minimal toolUse for display
  const toolUse: ToolUseBlock = {
    type: "tool_use",
    toolUseId: block.toolUseId,
    name: block.name,
    input: block.input,
  };
  return <ToolCard toolUse={toolUse} toolResult={block} />;
}

interface ToolResultContentProps {
  content: TextBlock | ImageBlock;
  toolName?: string;
}

function ToolResultContent({ content, toolName }: ToolResultContentProps) {
  if (content.type === "text") {
    return <TextResultContent text={content.text} toolName={toolName} />;
  }

  if (content.type === "image") {
    return (
      <div className="rounded-lg overflow-hidden border border-border/50">
        <img
          src={`data:${content.source.media_type};base64,${content.source.data}`}
          alt=""
          className="max-w-full"
        />
      </div>
    );
  }

  return null;
}

interface TextResultContentProps {
  text: string;
  toolName?: string;
}

function TextResultContent({ text, toolName }: TextResultContentProps) {
  const diffInfo = useMemo(() => parseDiffContent(text), [text]);

  // Render diff if detected
  if (diffInfo) {
    return (
      <DiffRenderer oldFile={diffInfo.oldFile} newFile={diffInfo.newFile} />
    );
  }

  // Try to parse as JSON for syntax highlighting
  const jsonContent = useMemo(() => {
    try {
      JSON.parse(text);
      return text; // It's valid JSON
    } catch {
      return null;
    }
  }, [text]);

  if (jsonContent) {
    return <JsonRenderer content={JSON.parse(jsonContent)} />;
  }

  // Render as code if it looks like code
  const codeInfo = useMemo(
    () => parseCodeContent(text, toolName),
    [text, toolName]
  );

  if (codeInfo) {
    return <CodeRenderer file={codeInfo} />;
  }

  // Default: render as plain text with basic styling
  return (
    <div className="overflow-hidden">
      <CodeFile
        file={{ name: "output.txt", contents: text }}
        options={{
          theme: { dark: "github-dark", light: "github-light" },
          overflow: "scroll",
          disableFileHeader: true,
        }}
        className="text-xs max-h-[300px]"
      />
    </div>
  );
}

// JSON renderer with syntax highlighting
function JsonRenderer({ content }: { content: unknown }) {
  const jsonString = useMemo(
    () => JSON.stringify(content, null, 2),
    [content]
  );

  return (
    <div className="overflow-hidden">
      <CodeFile
        file={{ name: "data.json", contents: jsonString }}
        options={{
          theme: { dark: "github-dark", light: "github-light" },
          overflow: "scroll",
          disableFileHeader: true,
        }}
        className="text-xs max-h-[300px]"
      />
    </div>
  );
}

interface DiffInfo {
  oldFile: FileContents;
  newFile: FileContents;
}

function parseDiffContent(text: string): DiffInfo | null {
  // Check for unified diff format
  if (text.includes("--- ") && text.includes("+++ ")) {
    const lines = text.split("\n");
    let oldFileName = "file";
    let newFileName = "file";

    for (const line of lines) {
      if (line.startsWith("--- ")) {
        oldFileName = line.slice(4).replace(/^a\//, "").trim();
      } else if (line.startsWith("+++ ")) {
        newFileName = line.slice(4).replace(/^b\//, "").trim();
      }
    }

    // Extract old and new content from diff
    const { oldContent, newContent } = extractDiffContents(text);

    if (oldContent !== null && newContent !== null) {
      return {
        oldFile: { name: oldFileName, contents: oldContent },
        newFile: { name: newFileName, contents: newContent },
      };
    }
  }

  // Check for simple before/after markers
  const beforeAfterMatch = text.match(
    /<<<\s*BEFORE\s*>>>\n([\s\S]*?)\n<<<\s*AFTER\s*>>>\n([\s\S]*?)(?:\n<<<\s*END\s*>>>|$)/i
  );
  if (beforeAfterMatch) {
    return {
      oldFile: { name: "file", contents: beforeAfterMatch[1] },
      newFile: { name: "file", contents: beforeAfterMatch[2] },
    };
  }

  return null;
}

function extractDiffContents(diffText: string): {
  oldContent: string | null;
  newContent: string | null;
} {
  const lines = diffText.split("\n");
  const oldLines: string[] = [];
  const newLines: string[] = [];
  let inHunk = false;

  for (const line of lines) {
    if (line.startsWith("@@")) {
      inHunk = true;
      continue;
    }

    if (!inHunk) continue;

    if (line.startsWith("-") && !line.startsWith("---")) {
      oldLines.push(line.slice(1));
    } else if (line.startsWith("+") && !line.startsWith("+++")) {
      newLines.push(line.slice(1));
    } else if (!line.startsWith("\\")) {
      // Context line (no prefix or space prefix)
      const contextLine = line.startsWith(" ") ? line.slice(1) : line;
      oldLines.push(contextLine);
      newLines.push(contextLine);
    }
  }

  if (oldLines.length === 0 && newLines.length === 0) {
    return { oldContent: null, newContent: null };
  }

  return {
    oldContent: oldLines.join("\n"),
    newContent: newLines.join("\n"),
  };
}

function parseCodeContent(
  text: string,
  toolName?: string
): FileContents | null {
  // Check for code blocks with language
  const codeBlockMatch = text.match(/^```(\w+)?\n([\s\S]*?)\n```$/);
  if (codeBlockMatch) {
    const lang = codeBlockMatch[1] || "text";
    return {
      name: `code.${getExtensionForLang(lang)}`,
      contents: codeBlockMatch[2],
    };
  }

  // For read_file tool results, detect language from file extension
  if (
    toolName?.toLowerCase().includes("read") ||
    toolName?.toLowerCase().includes("file")
  ) {
    // Try to detect if it's code
    if (looksLikeCode(text)) {
      return {
        name: "file.txt",
        contents: text,
      };
    }
  }

  return null;
}

function getExtensionForLang(lang: string): string {
  const langMap: Record<string, string> = {
    typescript: "ts",
    javascript: "js",
    python: "py",
    rust: "rs",
    go: "go",
    java: "java",
    cpp: "cpp",
    c: "c",
    ruby: "rb",
    php: "php",
    swift: "swift",
    kotlin: "kt",
    scala: "scala",
    html: "html",
    css: "css",
    json: "json",
    yaml: "yaml",
    yml: "yml",
    markdown: "md",
    md: "md",
    sql: "sql",
    shell: "sh",
    bash: "sh",
    zsh: "sh",
  };
  return langMap[lang.toLowerCase()] || lang;
}

function looksLikeCode(text: string): boolean {
  // Simple heuristics to detect if text looks like code
  const codeIndicators = [
    /^(import|export|const|let|var|function|class|interface|type)\s/m,
    /^(def|class|import|from|if|else|for|while)\s/m,
    /^(fn|let|mut|pub|use|mod|struct|impl)\s/m,
    /[{};]\s*$/m,
    /^\s*(\/\/|#|\/\*|\*)/m,
  ];

  return codeIndicators.some((pattern) => pattern.test(text));
}

interface DiffRendererProps {
  oldFile: FileContents;
  newFile: FileContents;
}

function DiffRenderer({ oldFile, newFile }: DiffRendererProps) {
  return (
    <div className="rounded-md border border-border/50 overflow-hidden [&_*]:!font-mono">
      <MultiFileDiff
        oldFile={oldFile}
        newFile={newFile}
        options={{
          theme: { dark: "github-dark", light: "github-light" },
          diffStyle: "unified",
          overflow: "scroll",
          disableFileHeader: false,
          hunkSeparators: "line-info",
          lineDiffType: "word-alt",
        }}
        className="text-xs"
      />
    </div>
  );
}

interface CodeRendererProps {
  file: FileContents;
}

function CodeRenderer({ file }: CodeRendererProps) {
  return (
    <div className="rounded-md border border-border/50 overflow-hidden [&_*]:!font-mono">
      <CodeFile
        file={file}
        options={{
          theme: { dark: "github-dark", light: "github-light" },
          overflow: "scroll",
          disableFileHeader: true,
        }}
        className="text-xs"
      />
    </div>
  );
}
