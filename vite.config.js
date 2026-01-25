import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  base: "/CompositionToolbox/",
  resolve: {
    alias: [
      {
        find: /^lucide$/,
        replacement: fileURLToPath(
          new URL("./node_modules/lucide/dist/esm/lucide/src/lucide.js", import.meta.url)
        )
      }
    ]
  },
  server: {
    open: true
  },
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});
