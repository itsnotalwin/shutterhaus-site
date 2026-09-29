import { defineConfig } from "vite";
import { resolve } from "node:path";

/**
 * Base path for asset URLs.
 *
 * - Cloudflare Pages (custom domain or *.pages.dev): "/" — the default.
 * - GitHub Pages project site: "/shutterhaus-site/", set BASE_PATH in CI.
 *
 * The router is hash-based (`/#/photo`), so a wrong base only ever breaks
 * asset URLs, never deep links.
 */
const base = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base,
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
