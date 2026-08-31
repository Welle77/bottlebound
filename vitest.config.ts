import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vitest/config";

import { rulesReferencePlugin } from "./build/rules-reference-plugin.ts";

export default defineConfig({
  // The Svelte plugin compiles runes modules (*.svelte.ts, e.g. the shell
  // store) for unit tests; it is inert for every plain-TS test module.
  plugins: [
    rulesReferencePlugin(),
    svelte({
      // Vitest runs files through a server-consumer pipeline, which makes the
      // plugin emit server runes where $effect.root is ignored by design.
      // The store tests observe real effect scheduling, so compile runes
      // modules for the client runtime during tests only.
      dynamicCompileOptions: ({ filename }) =>
        process.env.VITEST && filename.endsWith(".svelte.ts")
          ? { generate: "client" }
          : undefined,
    }),
  ],
  resolve: {
    // Match the client compilation above so the public "svelte" entry point
    // resolves to the same client runtime the runes modules bind against.
    conditions: ["browser"],
  },
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: [
      "tests/browser/**",
      "node_modules/**",
      ".opencode/**",
      ".worktrees/**",
      "dist/**",
    ],
  },
});
