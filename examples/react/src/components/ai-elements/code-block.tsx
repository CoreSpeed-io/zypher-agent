import { cn } from "@/lib/utils.ts";
import { Button } from "@/components/ui/button.tsx";
import { CheckIcon, CopyIcon } from "lucide-react";
import type { HTMLAttributes } from "react";
import { useRef, useState } from "react";

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
  const [isCopied, setIsCopied] = useState(false);
  const timeoutRef = useRef<number>(0);

  const copyToClipboard = async () => {
    if (!navigator?.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(code);
      setIsCopied(true);
      globalThis.clearTimeout(timeoutRef.current);
      timeoutRef.current = globalThis.setTimeout(
        () => setIsCopied(false),
        2000,
      );
    } catch {
      // ignore
    }
  };

  const Icon = isCopied ? CheckIcon : CopyIcon;

  return (
    <Button
      className={cn(
        "absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100",
        className,
      )}
      onClick={copyToClipboard}
      size="icon-xs"
      type="button"
      variant="ghost"
    >
      <Icon size={14} />
    </Button>
  );
}
