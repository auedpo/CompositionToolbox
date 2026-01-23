import { defineConfig } from "vite";

export default defineConfig({
  base: "/CompositionToolbox/",
  server: {
    open: true
  },
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});
