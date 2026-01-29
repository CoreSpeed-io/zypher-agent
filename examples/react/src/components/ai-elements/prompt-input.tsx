import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group.tsx";
import { cn } from "@/lib/utils.ts";
import { CornerDownLeftIcon, Loader2Icon, SquareIcon } from "lucide-react";
import type {
  ComponentProps,
  FormEventHandler,
  HTMLAttributes,
  KeyboardEventHandler,
} from "react";
import { useRef, useState } from "react";

// --------------------------------------------------------------------------
// PromptInput
// --------------------------------------------------------------------------

export type PromptInputMessage = {
  text: string;
};

export type PromptInputProps =
  & Omit<HTMLAttributes<HTMLFormElement>, "onSubmit">
  & {
    onSubmit: (
      message: PromptInputMessage,
      event: React.FormEvent<HTMLFormElement>,
    ) => void | Promise<void>;
  };

export const PromptInput = ({
  className,
  onSubmit,
  children,
  ...props
}: PromptInputProps) => {
  const formRef = useRef<HTMLFormElement | null>(null);

  const handleSubmit: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const text = (formData.get("message") as string) || "";
    if (!text.trim()) return;
    event.currentTarget.reset();
    onSubmit({ text }, event);
  };

  return (
    <form
      className={cn("w-full", className)}
      onSubmit={handleSubmit}
      ref={formRef}
      {...props}
    >
      <InputGroup className="overflow-hidden">{children}</InputGroup>
    </form>
  );
};

// --------------------------------------------------------------------------
// PromptInputBody
// --------------------------------------------------------------------------

export type PromptInputBodyProps = HTMLAttributes<HTMLDivElement>;

export const PromptInputBody = (
  { className, ...props }: PromptInputBodyProps,
) => <div className={cn("contents", className)} {...props} />;

// --------------------------------------------------------------------------
// PromptInputTextarea
// --------------------------------------------------------------------------

export type PromptInputTextareaProps = ComponentProps<
  typeof InputGroupTextarea
>;

export const PromptInputTextarea = ({
  onKeyDown,
  className,
  placeholder = "What would you like to know?",
  ...props
}: PromptInputTextareaProps) => {
  const [isComposing, setIsComposing] = useState(false);

  const handleKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = (e) => {
    onKeyDown?.(e);
    if (e.defaultPrevented) return;

    if (e.key === "Enter") {
      if (isComposing || e.nativeEvent.isComposing) return;
      if (e.shiftKey) return;
      e.preventDefault();

      const form = e.currentTarget.form;
      const submitButton = form?.querySelector(
        'button[type="submit"]',
      ) as HTMLButtonElement | null;
      if (submitButton?.disabled) return;

      form?.requestSubmit();
    }
  };

  return (
    <InputGroupTextarea
      className={cn("field-sizing-content max-h-48 min-h-16", className)}
      name="message"
      onCompositionEnd={() => setIsComposing(false)}
      onCompositionStart={() => setIsComposing(true)}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      {...props}
    />
  );
};

// --------------------------------------------------------------------------
// PromptInputFooter
// --------------------------------------------------------------------------

export type PromptInputFooterProps = Omit<
  ComponentProps<typeof InputGroupAddon>,
  "align"
>;

export const PromptInputFooter = (
  { className, ...props }: PromptInputFooterProps,
) => (
  <InputGroupAddon
    align="block-end"
    className={cn("justify-between gap-1", className)}
    {...props}
  />
);

// --------------------------------------------------------------------------
// PromptInputSubmit
// --------------------------------------------------------------------------

export type PromptInputStatus = "ready" | "streaming" | "submitted" | "error";

export type PromptInputSubmitProps =
  & ComponentProps<typeof InputGroupButton>
  & {
    status?: PromptInputStatus;
    onStop?: () => void;
  };

export const PromptInputSubmit = ({
  className,
  variant = "default",
  size = "icon-sm",
  status,
  onStop,
  onClick,
  children,
  ...props
}: PromptInputSubmitProps) => {
  const isGenerating = status === "submitted" || status === "streaming";

  let Icon = <CornerDownLeftIcon className="size-4" />;

  if (status === "submitted") {
    Icon = <Loader2Icon className="size-4 animate-spin" />;
  } else if (status === "streaming") {
    Icon = <SquareIcon className="size-4" />;
  }

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (isGenerating && onStop) {
      e.preventDefault();
      onStop();
      return;
    }
    onClick?.(e);
  };

  return (
    <InputGroupButton
      aria-label={isGenerating ? "Stop" : "Submit"}
      className={cn(className)}
      onClick={handleClick}
      size={size}
      type={isGenerating && onStop ? "button" : "submit"}
      variant={variant}
      {...props}
    >
      {children ?? Icon}
    </InputGroupButton>
  );
};
