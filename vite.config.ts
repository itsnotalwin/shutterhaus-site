import { defineConfig } from "vite";
import { resolve } from "node:path";

/**
 * GitHub Pages deploys a project site under /<repo>/ — set `base` to that path
 * (repo "shutterhaus-site" → "/shutterhaus-site/"). For a user site at
 * itsnotalwin.github.io, set base to "/" instead.
 */
export default defineConfig({
  base: "/shutterhaus-site/",
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        admin: resolve(__dirname, "admin.html"),
      },
    },
  },
});
