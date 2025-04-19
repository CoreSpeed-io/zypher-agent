import { defineConfig } from "npm:rolldown";
import denoPlugin from "https://raw.githubusercontent.com/CoreSpeed-io/rolldown-deno-loader-plugin/refs/heads/main/mod.ts";
import * as fs from "node:fs";
import * as path from "node:path";
import process from "node:process";

// Read and parse the deno.json file to get the import map
const denoConfigPath = path.resolve("deno.json");
const denoConfig = JSON.parse(fs.readFileSync(denoConfigPath, "utf8"));
const importMap = { imports: denoConfig.imports };

export default defineConfig({
  plugins: [denoPlugin({
    importMap: importMap,
    importMapBaseUrl: `file://${process.cwd()}`,
  })],
  platform: "node",
  input: "bin/api-server.ts",
  external: ["node-fetch"],
  treeshake: true,
  output: {
    minify: true,
    sourcemap: true,
    format: "esm",
    dir: "dist",
    target: "esnext",
    inlineDynamicImports: true,
  },
});
