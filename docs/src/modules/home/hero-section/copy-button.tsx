"use client";
import { useClipboard } from "foxact/use-clipboard";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

const text = "deno add jsr:@zypher/agent";

const COPY_PATH =
  "M4.66667 0C4.31305 0 3.97391 0.140476 3.72386 0.390524C3.47381 0.640573 3.33333 0.979711 3.33333 1.33333V2.66667H4.66667V1.33333H12V8.66667H10.6667V10H12C12.3536 10 12.6928 9.85952 12.9428 9.60948C13.1929 9.35943 13.3333 9.02029 13.3333 8.66667V1.33333C13.3333 0.979711 13.1929 0.640573 12.9428 0.390524C12.6928 0.140476 12.3536 0 12 0H4.66667ZM1.33333 3.33333C0.979711 3.33333 0.640573 3.47381 0.390524 3.72386C0.140476 3.97391 0 4.31305 0 4.66667V12C0 12.3536 0.140476 12.6928 0.390524 12.9428C0.640573 13.1929 0.979711 13.3333 1.33333 13.3333H8.66667C9.02029 13.3333 9.35943 13.1929 9.60948 12.9428C9.85952 12.6928 10 12.3536 10 12V4.66667C10 4.31305 9.85952 3.97391 9.60948 3.72386C9.35943 3.47381 9.02029 3.33333 8.66667 3.33333H1.33333ZM1.33333 4.66667H8.66667V12H1.33333V4.66667Z";

const CHECK_PATH =
  "M12.348 3.095c.195.195.195.512 0 .707l-6.6 6.6a.647.647 0 0 1-.915 0L1.511 7.08a.5.5 0 1 1 .708-.708l2.908 2.908 6.513-6.513a.5.5 0 0 1 .708 0Z";

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
    <button type="button" onClick={handleCopy}>
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="size-3.5 text-text-base"
      >
        <motion.path
          fillRule="evenodd"
          clipRule="evenodd"
          fill="currentColor"
          animate={{
            d: copied ? CHECK_PATH : COPY_PATH,
          }}
          transition={{
            duration: 0.2,
            ease: "easeInOut",
          }}
        />
      </svg>
    </button>
  );
}
