import { defineConfig } from "rolldown";
import denoPlugin from "@deno/rolldown-plugin";

export default defineConfig({
  plugins: [denoPlugin()],
  platform: "node",
  input: "src/main.ts",
  treeshake: true,
  output: {
    minify: true,
    sourcemap: true,
    format: "esm",
    dir: "dist",
    inlineDynamicImports: true,
  },
});
