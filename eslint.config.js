import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import functional from "eslint-plugin-functional";
import sveltePlugin from "eslint-plugin-svelte";

// Surfaces covered by tsconfig.json; type-aware rules require this wiring.
const typeCheckedFiles = [
  "src/**/*.ts",
  "tests/*.test.ts",
  "tests/*.svelte.ts",
  "tests/domain/**/*.ts",
  "tests/storage/**/*.ts",
  "tests/rules-reference/**/*.ts",
  "vite.config.ts",
];

// Application code plus the relocated unit-test locations.
const functionalFiles = [
  "src/**/*.ts",
  "tests/*.test.ts",
  "tests/*.svelte.ts",
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

// Shared option set for the functional/immutable-data gate: plugin-sanctioned
// exemptions (used by its own `lite` preset) plus the accessor patterns this
// repository declares as write boundaries.
const immutableDataOptions = {
  ignoreClasses: "fieldsOnly",
  ignoreAccessorPattern: [
    // The DOM write properties this app uses — rendering is an unavoidable
    // effect boundary, while all application/domain state stays immutable.
    "*.innerHTML",
    "*.hidden",
    "*.scrollTop",
    // The same allowance scoped to immer recipe parameters: updates run
    // inside produce(), so the written objects are drafts, never real state.
    "draft",
    "draft.**",
  ],
};

export default tseslint.config(
  { ignores: ["dist", "playwright-report", "test-results"] },
  // Base core rules for every parsed file (.svelte scripts, public/sw.js).
  // @eslint/js v10 no longer exports its own `strict` preset, so the strict
  // conversion rides the typescript-eslint presets below (see feature spec:
  // "typescript-eslint strict").
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  {
    rules: {
      complexity: "error",
    },
  },
  // Svelte-aware linting for .svelte files. Spread after the TypeScript
  // presets so the svelte-eslint-parser takes precedence for .svelte over
  // the typescript-eslint parser set above.
  ...sveltePlugin.configs["flat/recommended"],
  {
    files: ["**/*.svelte"],
    languageOptions: {
      globals: { ...globals.browser },
      // svelte-eslint-parser delegates <script lang="ts"> contents to this
      // parser; without it, TypeScript syntax inside components fails to
      // parse as plain JavaScript.
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },
  {
    files: typeCheckedFiles,
    extends: [...tseslint.configs.strictTypeChecked],
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
        // Option set above; see the shared `immutableDataOptions` notes.
        immutableDataOptions,
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
    // The runes shell store's cell writes (shellCell.value = …,
    // shellRevision.n += 1) are the reactive replacement boundary that
    // succeeded the deleted Ref class discipline; every other non-class
    // object stays fully protected.
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
