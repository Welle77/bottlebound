import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import functional from "eslint-plugin-functional";

// Surfaces covered by tsconfig.json; type-aware rules require this wiring.
const typeCheckedFiles = [
  "src/**/*.ts",
  "tests/*.test.ts",
  "tests/domain/**/*.ts",
  "tests/storage/**/*.ts",
  "tests/rules-reference/**/*.ts",
  "vite.config.ts",
];

// Application code plus the relocated unit-test locations.
const functionalFiles = [
  "src/**/*.ts",
  "tests/*.test.ts",
  "tests/domain/**/*.ts",
  "tests/storage/**/*.ts",
  "tests/rules-reference/**/*.ts",
];

// Test files must live in the tests/ tree (.codebox/standards.md). These
// patterns cover every test-file convention this repository uses: vitest unit
// and contract tests (`*.test.ts`), their support modules
// (`*.test-helpers.ts`, `*.test-support.ts`), and vitest/playwright specs
// (`*.spec.ts`). Scoped to application folders only, so no application file
// can ever match.
const misplacedTestFiles = ["src", "build"].flatMap((applicationFolder) => [
  `${applicationFolder}/**/*.test.ts`,
  `${applicationFolder}/**/*.test-helpers.ts`,
  `${applicationFolder}/**/*.test-support.ts`,
  `${applicationFolder}/**/*.spec.ts`,
]);

export default tseslint.config(
  { ignores: ["dist", "playwright-report", "test-results"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: typeCheckedFiles,
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
  },
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
    files: ["tests/browser/**/*.ts", "tests/contract/**/*.ts"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
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
  {
    files: functionalFiles,
    plugins: { functional },
    rules: {
      "functional/immutable-data": [
        "error",
        // Plugin-sanctioned exemption (used by its own `lite` preset): class
        // instances may encapsulate internal mutability behind methods; every
        // non-class object/array/map/set stays fully protected.
        //
        // The accessor pattern enumerates the only DOM write properties this
        // app uses — rendering is an unavoidable effect boundary, while all
        // application/domain state stays immutable. The `draft` patterns
        // scope the same allowance to immer recipe parameters: updates run
        // inside produce(), so the written objects are drafts, never real
        // state.
        {
          ignoreClasses: "fieldsOnly",
          ignoreAccessorPattern: [
            "*.innerHTML",
            "*.hidden",
            "*.scrollTop",
            "draft",
            "draft.**",
          ],
        },
      ],
      // Option sets below are the plugin's own `recommended` preset choices
      // for these rules: parameter immutability enforced by declaration
      // origin, inferred types ignored, for-loop counters exempted. Only the
      // rule selection is curated; the paradigm rules stay off per spec.
      "functional/prefer-immutable-types": [
        "error",
        {
          enforcement: "None",
          overrides: [
            {
              // Project-owned types must be deeply immutable; third-party
              // declarations (DOM/lib) are outside this codebase's control
              // and stay unchecked, matching the plugin's scoping intent.
              specifiers: { from: "file" },
              options: {
                ignoreInferredTypes: true,
                parameters: { enforcement: "ReadonlyDeep" },
              },
            },
          ],
        },
      ],
      "functional/prefer-readonly-type": [
        "error",
        { ignoreClass: "fieldsOnly" },
      ],
      "functional/no-let": ["error", { allowInForLoopInit: true }],
      "functional/no-mixed-types": "error",
    },
  },
  {
    // Enforces the testing standard in .codebox/standards.md: tests never
    // coexist with application code in the same folder. Every parsed file's
    // AST root is a Program node, so this reports exactly once per misplaced
    // test file, regardless of its contents.
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
