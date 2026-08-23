import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "playwright-report", "test-results"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts", "vite.config.ts"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    files: ["public/sw.js"],
    languageOptions: {
      globals: globals.serviceworker,
    },
  },
  {
    files: ["src/**/*.ts", "tests/**/*.ts"],
    rules: {
      // Strict default counting: every physical line counts, including blanks
      // and comments.
      "max-lines": ["error", { max: 800 }],
      "max-params": "error",
      "prefer-const": "error",
    },
  },
);
