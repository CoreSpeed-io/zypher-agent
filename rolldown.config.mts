import { defineConfig } from "rolldown";
import denoPlugin from "@deno/rolldown-plugin";

export default defineConfig({
  plugins: [denoPlugin()],
  platform: "node",
  input: "bin/api-server/src/index.ts",
  treeshake: true,
  output: {
    minify: true,
    sourcemap: true,
    format: "esm",
    dir: "dist",
    // Newer version of rolldown seems to have this removed
    // target: "esnext",
    inlineDynamicImports: true,
  },
});
