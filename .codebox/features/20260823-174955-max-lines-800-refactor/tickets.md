# Tickets

Tracer-bullet slices. Each slice leaves the repository verifiable. The
`max-lines` rule lands in T01, so intermediate lint output will still show the
known remaining violations until T02/T03 complete; each ticket documents which
errors are expected at its checkpoint.

## T01: Enable max-lines 800 and split src/main.ts

**Blocked by:** None (can start immediately)

**What to deliver:** ESLint enforces `max-lines` with `max: 800` across the
linted TypeScript surface (src and tests), and `src/main.ts` (1403 lines) is
split into behavior-preserving focused modules each under 800 lines.

**Scope ownership:** `eslint.config.js`, `src/main.ts`, new modules extracted
from it only.

**Verification:** `pnpm run build`; focused tests; `pnpm run lint` reporting
only the four known remaining violations (match.ts, match.test.ts,
match-store.ts, match-store.test.ts).

**Acceptance criteria:**
- [x] `max-lines` rule active with strict default counting, max 800.
- [x] No extracted module exceeds 800 lines; `src/main.ts` entry point stays.
- [x] Build and focused tests pass.

## T02: Split domain match engine and its test suite

**Blocked by:** None (can start immediately; independent of T01)

**What to deliver:** `src/domain/match.ts` (2933 lines) is decomposed into
cohesive behavior-preserving domain modules (e.g. by existing internal concern:
state transitions, combat resolution, effects/abilities, turn structure) each
under 800 lines, with `match.ts` re-exporting or composing them so existing
importers are unaffected where practical. `src/domain/match.test.ts` (1737
lines) is split into multiple test files under 800 lines each with no assertion
weakened or deleted.

**Scope ownership:** `src/domain/match*.ts` only.

**Verification:** `pnpm run build`; `pnpm run test:focused` (includes
domain/match.test.ts); lint reports only remaining known violations outside
the domain scope.

**Acceptance criteria:**
- [x] Every file in the domain scope is under 800 lines.
- [x] Existing public surface of the match engine preserved (imports keep working).
- [x] Focused tests pass unchanged in assertions.

## T03: Split match store and its test suite

**Blocked by:** None (can start immediately; independent of T01/T02)

**What to deliver:** `src/storage/match-store.ts` (1352 lines) is split into
behavior-preserving storage modules each under 800 lines, preserving its
existing exports. `src/storage/match-store.test.ts` (1087 lines) is split into
multiple test files under 800 lines each without weakening assertions.

**Scope ownership:** `src/storage/match-store*.ts` only.

**Verification:** `pnpm run build`; relevant vitest suites
(match-store, canonical-storage-probe); lint reports no violations in the
storage scope.

**Acceptance criteria:**
- [x] Every file in the storage scope is under 800 lines.
- [x] Existing exports of match-store preserved for importers.
- [x] Storage tests pass unchanged in assertions.

## T04: Enable max-params 4 and prefer-const

**Blocked by:** None (config-only; independent of T01–T03 outcomes but runs
after them so lint is green at its checkpoint)

**What to deliver:** ESLint enforces core `max-params` with `max: 4` and core
`prefer-const` across the whole linted TypeScript surface (src and tests,
including Playwright specs). Both rules measured at zero existing violations
before enabling, so no source refactors are expected; if a violation appears,
fix it behavior-preservingly within this ticket's scope.

**Scope ownership:** `eslint.config.js`, plus minimal behavior-preserving
fixes only if one of the two new rules reports a violation.

**Verification:** `pnpm run build`; `pnpm run test:focused`; `pnpm run lint`
fully green.

**Acceptance criteria:**
- [x] `max-params` active with its default configuration (`max: 3`).
- [x] `prefer-const` active for src and tests including Playwright specs.
- [x] Lint, build, and focused tests pass with zero violations from both rules.

## T05: Fix 18 pre-existing Playwright failures

**Blocked by:** None (independent of T01–T04; added after Test exposed
pre-existing red)

**What to deliver:** The full configured suite passes: the 18 Playwright
failures proven to reproduce identically at merge-base `577250c` are fixed.
Known signatures:

1. Ten failures in `acceptance.spec.ts` and `rules-reference.spec.ts`: both
   open IndexedDB database `"bottlebound-match"` at version 1 while production
   uses version 2 (see `manual-end-game.spec.ts` for the working pattern).
2. Eight failures in `elimination-workflow.spec.ts`: the test expects the
   elimination winner heading after Reopen Match but the page shows Active
   state plus Prior Match Summary. Diagnose first: if this is a stale spec,
   correct the expectation; if it is a genuine application bug, stop and
   return one precise blocker instead of changing production behavior.

**Scope ownership:** `tests/browser/acceptance.spec.ts`,
`tests/browser/rules-reference.spec.ts`, `tests/browser/elimination-workflow.spec.ts`.
Production changes require returning a blocker for user guidance.

**Verification:** targeted Playwright specs green; full `pnpm run test`
(vitest + Playwright) green; no assertion weakened to mask a real defect.

**Acceptance criteria:**
- [x] All 18 previously failing Playwright tests pass.
- [x] Full configured suite passes end to end.
- [x] No assertion weakened or deleted to hide a real defect; any suspected
      application bug is reported as a blocker, not papered over.

## T06: Include Playwright CLI tooling in the feature change set

**Blocked by:** None (independent; added on user resume direction
2026-08-23)

**What to deliver:** The Playwright CLI tooling changes are part of this
feature rather than out-of-band residue: `@playwright/cli` dev dependency with
its regenerated lockfile, the `.opencode/skills/playwright-cli/` skill assets,
and `.gitignore` entries for `.playwright-cli/` and `.playwright/`. The skill
Markdown files and `pnpm-lock.yaml` are formatted so the repository format
check passes. No documentation beyond the existing skill assets is written.

**Scope ownership:** `package.json` dependency entry, `pnpm-lock.yaml`,
`.opencode/skills/playwright-cli/**`, `.gitignore`.

**Verification:** `pnpm run format:check`; `pnpm run lint`; confirm
dependency installs and Playwright suite still runs via `pnpm run test`.

**Acceptance criteria:**
- [x] `@playwright/cli` present in `package.json` and installable from the
      committed lockfile.
- [x] Skill assets under `.opencode/skills/playwright-cli/` pass the format
      check.
- [x] `pnpm run format:check`, `pnpm run lint`, and `pnpm run test` all green.

## Parallel groups

- T01, T02, T03 own disjoint file scopes (`eslint.config.js` + `src/main.ts`;
  `src/domain/match*`; `src/storage/match*`) and may run in parallel group A.
- Final full-suite gate (lint fully green, `pnpm run test`, format check)
  belongs to the Test phase after all tickets complete.
