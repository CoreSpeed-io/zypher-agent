import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import deno from "@deno/vite-plugin";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    deno(),
    react(),
  ],
});
