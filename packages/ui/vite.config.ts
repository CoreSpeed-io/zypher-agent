import { defineConfig } from "vite";
import { resolve } from "path";
import dts from "vite-plugin-dts";

export default defineConfig({
  plugins: [
    dts({
      insertTypesEntry: true,
    }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "AgentClient",
      formats: ["es"],
      fileName: "index",
    },
    rollupOptions: {
      // Only externalize peer dependencies
      external: ["react", "react-dom", "swr"],
      output: {
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
          swr: "SWR",
        },
      },
    },
  },
});
