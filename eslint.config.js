import eslint from "@eslint/js";
import sonarjs from "eslint-plugin-sonarjs";
import sveltePlugin from "eslint-plugin-svelte";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

// Shared file groups – single source of truth for lint scopes.
const typescriptFiles = ["{src,tests,build}/**/*.ts", "*.config.ts"];
const sonarjsFiles = ["{src,tests}/**/*.ts", "*.config.ts"];

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
    ...sonarjs.configs.recommended,
    files: sonarjsFiles,
  },
  {
    name: "sonarjs/project-conventions",
    files: sonarjsFiles,
  },
  {
    name: "project/base",
    linterOptions: {
      noInlineConfig: true,
      reportUnusedDisableDirectives: "error",
    },
    rules: {
      "@typescript-eslint/consistent-type-definitions": ["error", "type"],
      "no-nested-ternary": "error",
      "no-var": "error",
      "prefer-const": "error",
    },
  },

  // Prefer named type references over inline type assertions.
  {
    name: "style/no-inline-type-assertions",
    files: ["{src,tests,build}/**/*.{ts,svelte}", "*.config.ts"],
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
  // Type-aware rules cover source, tests, build tooling, and TS config files.
  {
    name: "typescript/type-checked",
    files: typescriptFiles,
    extends: [tseslint.configs.strictTypeChecked],
    languageOptions: { parserOptions: { projectService: true } },
  },
  {
    name: "typescript/contracts",
    files: typescriptFiles,
    rules: {
      "@typescript-eslint/explicit-module-boundary-types": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      complexity: ["error", 20],
      "max-depth": ["error", 4],
      "max-params": ["error", 3],
      "max-lines": ["error", { max: 800 }],
      "max-statements": ["error", 40],
    },
  },
  {
    name: "application/contracts",
    files: ["src/app/**/*.ts"],
    rules: {
      complexity: ["error", 10],
      "max-statements": ["error", 40],
    },
  },
  {
    name: "svelte/contracts",
    files: ["src/**/*.svelte"],
    rules: {
      complexity: ["error", 10],
      "max-depth": ["error", 4],
      "max-params": ["error", 3],
      "max-lines": ["error", { max: 800 }],
      "max-statements": ["error", 40],
    },
  },
  // Runtime globals.
  {
    name: "globals/browser-node",
    files: ["{src,tests/browser,tests/contract}/**/*.ts", "*.config.ts"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    name: "globals/service-worker",
    files: ["public/sw.js"],
    languageOptions: { globals: globals.serviceworker },
  },
  {
    name: "globals/commonjs-configuration",
    files: [".dependency-cruiser.cjs"],
    languageOptions: { globals: globals.node },
  },

  // Style guards apply to maintained source, tests, build tooling, and TS configs.
  {
    name: "style/limits",
    files: [...typescriptFiles, "src/**/*.svelte"],
    rules: {
      "prefer-destructuring": "error",
    },
  },
  {
    name: "style/test-statement-limit",
    files: ["tests/**/*.ts"],
    rules: {
      complexity: ["error", 70],
      "max-statements": ["error", 70],
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
