---
slug: 20260825-063944-typescript-eslint-functional-linting
title: typescript-eslint and eslint-plugin-functional linting
branch: feature/typescript-eslint-functional-linting
target_branch: main
current_phase: done
phases:
  planning: done
  code: done
  test: done
  review: done
  ship: skipped
gate_policy:
  planning: auto
  code: auto
  test: auto
  review: auto
  ship: skip
model_routing:
  default: frontier
  aliases:
    frontier: [opencode/x-preview-f-free, muse-spark-1.2-contributor-free, opencode/muse-spark-1.2-contributor-free]
  phases:
    planning: frontier
---

# typescript-eslint and eslint-plugin-functional linting

## Problem Statement

The Referee Console's linting uses only the non-type-checked typescript-eslint
`recommended` preset. Type-aware rules cannot run, so whole classes of defects
pass lint. There are no functional-programming rules at all, so mutation-heavy
patterns enter the Match State domain unchecked. Additionally, test files sit
inside application folders (`src/`), violating the repository standard that
tests never coexist with application code, and nothing enforces that standard
mechanically.

## Solution

Upgrade ESLint to type-checked typescript-eslint rules, add
`eslint-plugin-functional` at its recommended preset, relocate all colocated
tests into a top-level `tests/` tree, fix every resulting violation outright,
and enforce the test-location standard in the lint configuration itself.
Lint passes clean on merge with no suppressions.

## User Stories

1. As a maintainer of the Referee Console, I want type-checked lint rules active, so that type-level defects are caught before review.
2. As a maintainer of the Referee Console, I want functional-programming rules active, so that mutation-heavy patterns in Match State handling surface during development.
3. As a maintainer of the Referee Console, I want all lint violations fixed rather than suppressed, so that the lint configuration stays honest about code health.
4. As a contributor, I want tests separated from application folders, so that I can distinguish shipped modules from test infrastructure at a glance.
5. As a contributor, I want an automated guard against colocating new tests, so that the separation standard survives future work without manual vigilance.
6. As a referee using the Console, I want this refactor to change no behavior, so that my Matches, persistence, and rules reference work exactly as before.
7. As a maintainer, I want the focused-test command to keep running after relocation, so that quick verification workflows remain intact.
8. As a reviewer, I want lint as a single trustworthy gate, so that I can rely on `pnpm run lint` passing meaningfully clean.

## Implementation Decisions

- Upgrade the flat ESLint config from `tseslint.configs.recommended` to
  `tseslint.configs.recommendedTypeChecked`, wiring typed linting through the
  project's TypeScript configuration (project service or equivalent) and
  covering `src/`, `tests/`, and config files appropriately.
- Add `eslint-plugin-functional` using a curated immutability-first rule set
  (`immutable-data`, `prefer-immutable-types`, `prefer-readonly-type`,
  `no-let`, `no-mixed-types`) rather than the blanket `recommended` preset.
  Measurement during the first implementation attempt showed `recommended`
  enforces whole-paradigm functional programming (1816 violations across 41
  files, including bans on bare call statements, `throw`, `void` returns,
  parameterless functions, conditionals-as-statements, and loops), which is
  irreconcilable with zero suppressions and zero behavior change. The omitted
  paradigm rules and their violation counts are recorded here as evidence for
  future tightening: `no-expression-statements` 905, `no-throw-statements`
  238, `immutable-data` 210, `no-return-void` 168, `no-conditional-statements`
  111, `no-loop-statements` 70, `functional-parameters` 44, plus residual
  counts inside the retained rules that fixes must clear outright.
- Adopt `immer` where it makes immutability fixes cleaner, particularly for
  Match State updates, instead of hand-refactoring every mutation site. Immer
  is an additive runtime dependency; behavior at each update site is preserved
  by its frozen-copy semantics and proven by the unchanged test suite.
- Fix all violations surfaced by the enabled rules directly; no
  rule suppressions, file-level disables, or ignored paths.
- Relocate every `src/**/*.test.ts` file (16 files) into a top-level `tests/`
  tree mirroring its previous structure: `tests/domain/`,
  `tests/storage/`, `tests/rules-reference/`, plus root-level test files,
  alongside the existing `tests/contract/` and `tests/browser/`.
- Move the two test-only support modules (`match-test-support`,
  `match-store.test-helpers`) with the tests; they have no importers in
  application code.
- Update all relative imports in relocated files, the `test:focused` script
  paths in the package manifest, and any tsconfig/vitest coverage so the moved
  files remain type-checked and runnable.
- Fix all violations surfaced by the upgraded rules directly; no
  rule suppressions, file-level disables, or ignored paths.
- Add an ESLint-based restriction that fails lint when a test file appears
  inside an application folder, enforcing the repository standard recorded in
  `.codebox/standards.md`.
- No runtime behavior changes; the build output must be identical in shape.

## Testing Decisions

- Tests verify behavior through existing public seams only: exported domain
  functions, storage interfaces, rules-reference builders, contract surfaces,
  and Playwright browser flows. This feature introduces no new seams.
- The full vitest suite and the Playwright suite must pass unchanged after
  relocation; expected values come from the existing assertions, which act as
  the regression net proving behavior did not change.
- Prior art: existing vitest unit tests under `src/` (moving), contract tests
  under `tests/contract/`, and browser specs under `tests/browser/`.
- Lint itself is part of verification: `pnpm run lint` must pass with zero
  errors and zero suppressions after each stage.

## Out of Scope

- The functional paradigm rules that make side effects inexpressible
  (`no-expression-statements`, `no-throw-statements`, `no-return-void`,
  `no-loop-statements`, `no-conditional-statements`, `functional-parameters`);
  their measured violation counts are recorded in Implementation Decisions as
  evidence for a possible future adoption effort.
- Rewriting the codebase toward a functional style beyond what the enabled
  rules require.
- Changing any gameplay semantics, Ruleset content, or Referee Console
  behavior.
- CI pipeline changes; the constitution commands remain the verification gates.

## Further Notes

- The repository standard "Tests never coexist with application code" was
  recorded in `.codebox/standards.md` at feature start.
- Ticket order follows the user's explicit instruction: relocation completes
  before any lint-rule fixes begin, so fixes never churn files mid-move.
