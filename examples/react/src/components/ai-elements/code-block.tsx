import { cn } from "@/lib/utils.ts";
import { Button } from "@/components/ui/button.tsx";
import { useClipboard } from "foxact/use-clipboard";
import { CheckIcon, CopyIcon } from "lucide-react";
import type { HTMLAttributes } from "react";

type CodeBlockProps = HTMLAttributes<HTMLDivElement> & {
  code: string;
  language?: string;
};

export const CodeBlock = (
  { code, language, className, ...props }: CodeBlockProps,
) => (
  <div
    className={cn(
      "group relative w-full overflow-hidden rounded-md",
      className,
    )}
    data-language={language}
    {...props}
  >
    <div className="relative overflow-auto">
      <pre className="m-0 p-4 text-sm">
        <code className="font-mono text-sm whitespace-pre-wrap break-all">
          {code}
        </code>
      </pre>
    </div>
    <CodeBlockCopyButton code={code} />
  </div>
);

function CodeBlockCopyButton(
  { code, className }: { code: string; className?: string },
) {
  const { copied, copy } = useClipboard({ timeout: 2000 });
  const Icon = copied ? CheckIcon : CopyIcon;

  return (
    <Button
      className={cn(
        "absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100",
        className,
      )}
      onClick={() => copy(code)}
      size="icon-xs"
      type="button"
      variant="ghost"
    >
      <Icon size={14} />
    </Button>
  );
}
