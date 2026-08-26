import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

import { rulesReferencePlugin } from "./build/rules-reference-plugin.ts";

export default defineConfig({
  plugins: [rulesReferencePlugin(), svelte()],
  build: {
    rollupOptions: {
      output: {
        entryFileNames: "assets/app.js",
        assetFileNames: (asset) =>
          asset.names.some((name) => name.endsWith(".css"))
            ? "assets/style.css"
            : "assets/[name][extname]",
      },
    },
  },
});
