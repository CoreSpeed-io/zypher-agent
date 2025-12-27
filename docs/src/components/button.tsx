"use client";
import { motion } from "motion/react";
import type { ComponentProps } from "react";
import { tv, type VariantProps } from "tailwind-variants";

const button = tv({
  base: [
    "relative z-10",
    "flex items-center justify-center",
    "gap-3",
    "px-4 py-3",
    "whitespace-nowrap",
    "text-2xl font-semibold font-mono tracking-tight",
    "cursor-pointer",
    "shrink-0 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-6",
  ],
  slots: {
    decorator:
      "pointer-events-none absolute inset-0 -bottom-1 -left-2.5 bg-[repeating-linear-gradient(315deg,var(--decorator-color)_0px,var(--decorator-color)_0.5px,transparent_1px,transparent_4px)] opacity-30",
  },
  variants: {
    variant: {
      primary: {
        base: "bg-btn-primary text-text-white",
        decorator: "[--decorator-color:var(--color-btn-primary)]",
      },
      secondary: {
        base: "bg-btn-secondary text-text-white",
        decorator: "[--decorator-color:var(--color-btn-secondary)]",
      },
      plain: {
        base: "bg-text-white text-black",
        decorator: "[--decorator-color:var(--color-btn-secondary)]",
      },
    },
  },
  defaultVariants: {
    variant: "primary",
  },
});

export function Button({
  className,
  children,
  variant,
  ...props
}: ComponentProps<"button"> & VariantProps<typeof button>) {
  const { base, decorator } = button({ variant });
  return (
    <motion.div className="relative inline-block" whileHover="hover">
      <button className={base({ className })} type="button" {...props}>
        {children}
      </button>
      <motion.div
        className={decorator()}
        variants={{ hover: { opacity: 0, transition: { duration: 0.1 } } }}
      />
    </motion.div>
  );
}
