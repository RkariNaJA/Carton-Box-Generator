import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  root: "src",
  base: "./",
  server: { host: '0.0.0.0', port: 5174 },
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: "../dist",
    emptyOutDir: true
  }
});
