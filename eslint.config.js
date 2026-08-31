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
    "no-tests-in-application-folders": {
      meta: {
        type: "problem",
        docs: {
          description: "Keep test files outside application folders",
        },
        schema: [],
      },
      create(context) {
        return {
          Program(node) {
            context.report({
              node,
              message:
                "Test files must not live under an application folder (src/, build/): move this file into the tests/ tree.",
            });
          },
        };
      },
    },
  },
};

export default defineConfig(
  globalIgnores(["dist", "playwright-report", "test-results", ".worktrees"]),

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

  // Prefer named type references over inline type assertions.
  {
    name: "style/no-inline-type-assertions",
    files: [
      "src/**/*.ts",
      "src/**/*.svelte",
      "tests/**/*.ts",
      "tests/**/*.svelte",
      "build/**/*.ts",
      "vite.config.ts",
    ],
    plugins: { project: projectEslintPlugin },
    rules: { "project/no-inline-type-assertions": "error" },
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
      "prefer-destructuring": "error",
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
    name: "standards/no-tests-in-application-folders",
    files: misplacedTestFiles,
    plugins: { project: projectEslintPlugin },
    rules: { "project/no-tests-in-application-folders": "error" },
  },
);
