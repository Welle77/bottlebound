import eslint from "@eslint/js";
import functional from "eslint-plugin-functional";
import sveltePlugin from "eslint-plugin-svelte";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

// Shared file groups – single source of truth for tsconfig and lint scopes.
const srcTs = ["src/**/*.ts"];
const testSupport = [
  "tests/*.test.ts",
  "tests/*.svelte.ts",
  "tests/domain/**/*.ts",
  "tests/storage/**/*.ts",
  "tests/rules-reference/**/*.ts",
];

const typeCheckedFiles = [...srcTs, ...testSupport, "vite.config.ts"];
const functionalFiles = [...srcTs, ...testSupport];

const misplacedTestFiles = ["src", "build"].flatMap((folder) => [
  `${folder}/**/*.test.ts`,
  `${folder}/**/*.test-helpers.ts`,
  `${folder}/**/*.test-support.ts`,
  `${folder}/**/*.spec.ts`,
]);

const immutableDataOptions = {
  ignoreAccessorPattern: [
    "*.innerHTML",
    "*.hidden",
    "*.scrollTop",
    "draft",
    "draft.**",
  ],
};

export default defineConfig(
  globalIgnores(["dist", "playwright-report", "test-results"]),

  // Enforce project policy: no inline disable comments and warnings are errors.
  {
    name: "linter/enforce-no-inline-disable",
    linterOptions: {
      noInlineConfig: true,
      reportUnusedDisableDirectives: "error",
    },
  },

  // Core correctness: ESLint recommended + typescript-eslint strict.
  eslint.configs.recommended,
  tseslint.configs.strict,
  tseslint.configs.stylistic,
  {
    name: "style/type-definitions",
    rules: {
      "@typescript-eslint/consistent-type-definitions": ["error", "type"],
    },
  },

  // Project-wide size and complexity limits.
  {
    name: "limits/complexity",
    rules: { complexity: "error" },
  },

  // Svelte – plugin must come after TS presets so its parser wins for .svelte.
  sveltePlugin.configs["flat/recommended"],
  {
    name: "svelte/parser",
    files: ["**/*.svelte"],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { parser: tseslint.parser },
    },
  },
  // Type-aware rules for all TS surfaces listed in tsconfig.json.
  {
    name: "typescript/type-checked",
    files: typeCheckedFiles,
    extends: [tseslint.configs.strictTypeChecked],
    languageOptions: { parserOptions: { projectService: true } },
  },

  // Runtime globals.
  {
    name: "globals/app",
    files: ["src/**/*.ts", "vite.config.ts"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    name: "globals/service-worker",
    files: ["public/sw.js"],
    languageOptions: { globals: globals.serviceworker },
  },
  {
    name: "globals/tests",
    files: ["tests/browser/**/*.ts", "tests/contract/**/*.ts"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },

  // Style and size guards.
  {
    name: "style/limits",
    files: ["src/**/*.ts", "tests/**/*.ts"],
    rules: {
      "max-lines": ["error", { max: 800 }],
      "max-params": "error",
      "prefer-const": "error",
    },
  },

  // Functional / immutable-data discipline.
  {
    name: "functional/base",
    files: functionalFiles,
    plugins: { functional },
    rules: {
      "functional/immutable-data": ["error", immutableDataOptions],
      "functional/prefer-immutable-types": [
        "error",
        {
          enforcement: "None",
          overrides: [
            {
              specifiers: { from: "file" },
              options: {
                ignoreInferredTypes: true,
                parameters: { enforcement: "ReadonlyDeep" },
              },
            },
          ],
        },
      ],
      "functional/no-mixed-types": "error",
    },
  },
  {
    name: "functional/shell-state",
    files: ["src/ui/shell-state.svelte.ts"],
    rules: {
      "functional/immutable-data": [
        "error",
        {
          ...immutableDataOptions,
          ignoreAccessorPattern: [
            ...immutableDataOptions.ignoreAccessorPattern,
            "*Cell.value",
            "*Revision.n",
          ],
        },
      ],
    },
  },

  // Testing standard: no test file under application folders.
  {
    name: "standards/no-misplaced-tests",
    files: misplacedTestFiles,
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
