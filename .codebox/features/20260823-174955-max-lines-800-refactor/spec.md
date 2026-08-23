---
slug: 20260823-174955-max-lines-800-refactor
title: Enforce max-lines 800 and split oversized modules
branch: feature/max-lines-800-refactor
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

# Spec: Enforce max-lines 800 and split oversized modules

## Problem Statement

Several source files have grown far beyond a maintainable size. The largest,
`src/domain/match.ts`, is 2933 lines. Without an enforced size ceiling the
codebase keeps accreting into monolith modules that are hard to navigate,
review, and safely change.

## Solution

Add the ESLint `max-lines` core rule with `max: 800` (default strict counting:
every physical line counts) so lint fails on any file over the limit, then
behavior-preserving refactor every violating file below the limit.

## Decisions (from Planning)

1. Rule configuration: strict default — all physical lines count, including
   blanks and comments.
2. Scope: the rule applies to both production sources (`src/**`) and tests
   (`tests/**`, co-located `*.test.ts`). The two oversized test suites are in
   scope.
3. Refactor depth: behavior-preserving splits at existing module seams with
   minimal signature changes. No deliberate reshaping of public APIs; existing
   tests are the regression safety net.
4. Verification: each refactor step is gated by the full configured suite —
   `pnpm run lint && pnpm run build && pnpm run test`.
5. Additional lint rules (added 2026-08-23 after T01–T03, user-approved):
   core `max-params` with its default configuration (`max: 3`) and core
   `prefer-const` across the whole linted surface including Playwright specs.
   The `no-comments` idea was skipped by user decision.
   `eslint-plugin-playwright` is not installed: it has no `prefer-const` rule
   and its other rules were not requested.
6. Approved exception to Out-of-Scope (user-authorized during Code): meeting
   `max-params` max 3 regrouped trailing parameters of eight public commands
   into options/command objects (`endMatch`, `rerollInitiative`,
   `undoLastEvent`, `ruleSimultaneousElimination`, `initiativeCommand`,
   `buildAbilityEffects`, `assertCoinFlipTieOrder`, `anchorSource`), with all
   callers — including contract tests under `tests/contract/`, which sit
   outside the `tsconfig.json` include — migrated mechanically. No assertions
   were weakened.
7. Playwright CLI tooling included (user-directed on resume, 2026-08-23): the
   out-of-band changes that arrived between T04 and T05 are part of this
   feature's change set, not residue to exclude. That covers the
   `@playwright/cli` dev dependency in `package.json` with its
   `pnpm-lock.yaml` regeneration, the `.opencode/skills/playwright-cli/`
   skill assets, and the `.gitignore` entries for `.playwright-cli/` and
   `.playwright/`. The skill assets must pass `pnpm run format:check`.
   No documentation about the CLI is written beyond these assets.

## Current violations (measured 2026-08-23)

| File | Lines |
| --- | --- |
| src/domain/match.ts | 2933 |
| src/domain/match.test.ts | 1737 |
| src/main.ts | 1403 |
| src/storage/match-store.ts | 1352 |
| src/storage/match-store.test.ts | 1087 |

## Acceptance criteria

1. `eslint.config.js` enables `max-lines` with `max: 800` for linted TS files
   covering src and tests.
2. `pnpm run lint` passes with zero errors after refactoring.
3. Every previously violating file is split into focused modules under 800
   lines each; no file over 800 lines remains in the linted surface.
4. `pnpm run build` passes (type check + vite build).
5. Full suite (`pnpm run test`: vitest + Playwright) passes unchanged in
   behavior; no test was edited to weaken an assertion to make a split pass.
6. No gameplay semantics changed; rules contract untouched.
7. `max-params` active with its default configuration (`max: 3`); zero
   violations in the linted surface.
8. `prefer-const` active across src and tests including Playwright specs;
   zero violations.
9. Playwright CLI tooling is part of the feature change set: dependency,
   lockfile, skill assets, and ignore entries present; `pnpm run format:check`
   passes with them included.

## Out of Scope

- Renaming domain concepts or reshaping public module APIs.
- Any change to `bottlebound_rules_final.md` or game semantics.
- Performance optimization beyond what extraction naturally provides.
- Configuring other complexity rules (max-lines-per-function etc.).

## Further Notes

- The `tests/browser/manual-end-game.spec.ts` (683 lines) and contract tests
  are currently under the limit but must stay under it going forward since the
  rule now covers them.
