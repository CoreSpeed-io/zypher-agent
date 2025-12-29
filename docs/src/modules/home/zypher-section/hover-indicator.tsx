"use client";

import { motion } from "motion/react";

export function HoverIndicator() {
  return (
    <motion.div
      variants={{
        initial: {},
        // hover: { transition: { staggerChildren: 0.08 } },
      }}
      className="text-brand-base pointer-events-none absolute inset-5 text-lg font-bold"
    >
      <motion.div
        variants={{
          initial: { opacity: 0, x: 5, y: 5 },
          hover: { opacity: [0.95, 1], x: 0, y: 0 },
        }}
        transition={{ duration: 0.15, ease: "easeOut" }}
        className="absolute top-0 left-0"
      >
        ⌜
      </motion.div>
      <motion.div
        variants={{
          initial: { opacity: 0, x: -5, y: 5 },
          hover: { opacity: [0.95, 1], x: 0, y: 0 },
        }}
        transition={{ duration: 0.15, ease: "easeOut" }}
        className="absolute top-0 right-0"
      >
        ⌝
      </motion.div>
      <motion.div
        variants={{
          initial: { opacity: 0, x: -5, y: -5 },
          hover: { opacity: [0.95, 1], x: 0, y: 0 },
        }}
        transition={{ duration: 0.15, ease: "easeOut" }}
        className="absolute right-0 bottom-0"
      >
        ⌟
      </motion.div>
      <motion.div
        variants={{
          initial: { opacity: 0, x: 5, y: -5 },
          hover: { opacity: [0.95, 1], x: 0, y: 0 },
        }}
        transition={{ duration: 0.15, ease: "easeOut" }}
        className="absolute bottom-0 left-0"
      >
        ⌞
      </motion.div>
    </motion.div>
  );
}
