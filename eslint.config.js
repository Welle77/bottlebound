import eslint from "@eslint/js";
import functional from "eslint-plugin-functional";
import sveltePlugin from "eslint-plugin-svelte";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

// Shared file groups – single source of truth for lint scopes.
const typescriptFiles = ["{src,tests}/**/*.ts"];

const projectEslintPlugin = {
  rules: {
    "no-inline-type-assertions": {
      meta: {
        type: "problem",
        docs: {
          description:
            "Require named type references for TypeScript assertions",
        },
        schema: [],
      },
      create(context) {
        return {
          TSAsExpression(node) {
            if (node.typeAnnotation.type !== "TSTypeReference") {
              context.report({
                node,
                message:
                  "Use a named type reference for type assertions; `as const` is allowed.",
              });
            }
          },
        };
      },
    },
  },
};

export default defineConfig(
  globalIgnores(["dist", "playwright-report", "test-results", ".worktrees"]),

  // Core correctness: ESLint recommended + typescript-eslint strict.
  eslint.configs.recommended,
  tseslint.configs.strict,
  tseslint.configs.stylistic,
  {
    name: "project/base",
    linterOptions: {
      noInlineConfig: true,
      reportUnusedDisableDirectives: "error",
    },
    rules: {
      "@typescript-eslint/consistent-type-definitions": ["error", "type"],
      complexity: "error",
      "no-nested-ternary": "error",
      "no-var": "error",
      "prefer-const": "error",
    },
  },

  // Prefer named type references over inline type assertions.
  {
    name: "style/no-inline-type-assertions",
    files: ["{src,tests}/**/*.{ts,svelte}", "build/**/*.ts", "vite.config.ts"],
    plugins: { project: projectEslintPlugin },
    rules: { "project/no-inline-type-assertions": "error" },
  },

  // Svelte needs its parser, with TypeScript delegated for script blocks.
  {
    name: "svelte/recommended",
    files: ["**/*.svelte"],
    extends: [sveltePlugin.configs["flat/recommended"]],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { parser: tseslint.parser },
    },
  },
  // Type-aware rules for all selected TypeScript surfaces.
  {
    name: "typescript/type-checked",
    files: [...typescriptFiles, "vite.config.ts"],
    extends: [tseslint.configs.strictTypeChecked],
    languageOptions: { parserOptions: { projectService: true } },
  },
  // Runtime globals.
  {
    name: "globals/browser-node",
    files: ["{src,tests/browser,tests/contract}/**/*.ts", "vite.config.ts"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    name: "globals/service-worker",
    files: ["public/sw.js"],
    languageOptions: { globals: globals.serviceworker },
  },

  // Style and size guards.
  {
    name: "style/limits",
    files: [...typescriptFiles, "src/**/*.svelte"],
    rules: {
      "max-lines": ["error", { max: 800 }],
      "max-params": "error",
      "prefer-destructuring": "error",
    },
  },

  // Functional type discipline.
  {
    name: "functional/base",
    files: typescriptFiles,
    plugins: { functional },
    rules: {
      "functional/no-mixed-types": "error",
    },
  },
  // Testing standard: no test file under application folders.
  {
    name: "standards/no-tests-in-application-folders",
    files: [
      "{src,build}/**/*.{test,spec}.ts",
      "{src,build}/**/*.test-{helpers,support}.ts",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Program",
          message:
            "Test files must not live under an application folder (src/, build/): move this file into the tests/ tree.",
        },
      ],
    },
  },
);
