"use client";
import { useClipboard } from "foxact/use-clipboard";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { CheckIcon } from "@/components/icons/check";
import { CopyIcon } from "@/components/icons/copy";

const text = "deno add jsr:@zypher/agent";

export function CopyButton() {
  const { copy } = useClipboard({
    timeout: 1000,
    usePromptAsFallback: false,
    promptFallbackText:
      "Failed to copy to clipboard automatically, please manually copy the text below.",
    onCopyError() {},
  });
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const handleCopy = async () => {
    await copy(text);
    setCopied(true);

    // Clear existing timer if any
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    // Set new timer
    timerRef.current = setTimeout(() => {
      setCopied(false);
      timerRef.current = null;
    }, 3000);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return (
    <button
      className="cursor-pointer relative"
      type="button"
      onClick={handleCopy}
    >
      <motion.div
        className="size-3.5 text-text-base"
        initial={false}
        animate={{
          opacity: copied ? 0 : 1,
          scale: copied ? 0.8 : 1,
        }}
        transition={{
          duration: 0.2,
          ease: "easeInOut",
        }}
      >
        <CopyIcon className="size-full" />
      </motion.div>
      <motion.div
        className="size-3.5 text-text-base absolute inset-0"
        initial={false}
        animate={{
          opacity: copied ? 1 : 0,
          scale: copied ? 1 : 0.8,
        }}
        transition={{
          duration: 0.2,
          ease: "easeInOut",
        }}
      >
        <CheckIcon className="size-full" />
      </motion.div>
    </button>
  );
}
