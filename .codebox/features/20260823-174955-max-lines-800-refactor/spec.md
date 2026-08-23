---
slug: 20260823-174955-max-lines-800-refactor
title: Enforce max-lines 800 and split oversized modules
branch: feature/max-lines-800-refactor
target_branch: main
current_phase: code
phases:
  planning: done
  code: running
  test: pending
  review: pending
  ship: pending
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

## Out of Scope

- Renaming domain concepts or reshaping public module APIs.
- Any change to `bottlebound_rules_final.md` or game semantics.
- Performance optimization beyond what extraction naturally provides.
- Configuring other complexity rules (max-lines-per-function etc.).

## Further Notes

- The `tests/browser/manual-end-game.spec.ts` (683 lines) and contract tests
  are currently under the limit but must stay under it going forward since the
  rule now covers them.
