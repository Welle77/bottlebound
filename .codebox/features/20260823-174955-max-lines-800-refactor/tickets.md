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
- [ ] `max-lines` rule active with strict default counting, max 800.
- [ ] No extracted module exceeds 800 lines; `src/main.ts` entry point stays.
- [ ] Build and focused tests pass.

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
- [ ] Every file in the domain scope is under 800 lines.
- [ ] Existing public surface of the match engine preserved (imports keep working).
- [ ] Focused tests pass unchanged in assertions.

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
- [ ] Every file in the storage scope is under 800 lines.
- [ ] Existing exports of match-store preserved for importers.
- [ ] Storage tests pass unchanged in assertions.

## Parallel groups

- T01, T02, T03 own disjoint file scopes (`eslint.config.js` + `src/main.ts`;
  `src/domain/match*`; `src/storage/match*`) and may run in parallel group A.
- Final full-suite gate (lint fully green, `pnpm run test`, format check)
  belongs to the Test phase after all tickets complete.
