import { defineConfig } from "vitest/config";

import { rulesReferencePlugin } from "./build/rules-reference-plugin.ts";

export default defineConfig({
  plugins: [rulesReferencePlugin()],
  test: {
    exclude: ["tests/browser/**", "node_modules/**", "dist/**"],
  },
});
