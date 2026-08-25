# Tickets

## T01: Relocate colocated tests into `tests/`

**Blocked by:** None (can start immediately)
**Parallel group:** None

**What to build:** Every test file that currently sits inside `src/` moves to a
top-level `tests/` tree mirroring its previous structure, so no test file or
test-only helper coexists with application code. The full vitest suite and the
focused-test script pass from the new locations with updated import paths and
configuration coverage.

- [x] No `*.test.ts` file remains under `src/`
- [x] Test-only helpers (`match-test-support`, `match-store.test-helpers`) live under `tests/` with their consumers
- [x] All imports in relocated files resolve; vitest suite passes in full (16 files / 90 tests)
- [x] The `test:focused` script runs its five suites from the new locations (5 suites / 32 tests)
- [x] Relocated files remain covered by TypeScript checking (build passes; `tsc --listFiles` confirms)

## T02: Upgrade to typescript-eslint recommendedTypeChecked

**Blocked by:** T01
**Parallel group:** None

**What to build:** Type-aware linting is active across the repository through
the flat config, using the `recommendedTypeChecked` preset with typed-lint
project wiring covering application code, tests, and relevant config files.
Every violation it surfaces is fixed outright.

- [x] Flat config uses `recommendedTypeChecked` with a working type-aware parser setup
- [x] `pnpm run lint` passes with zero errors (zero warnings, zero suppressions)
- [x] No rule suppressions, file-level disables, or ignored paths were added to make lint pass
- [x] `pnpm run build` passes after the fixes

## T03: Add eslint-plugin-functional with curated immutability rules

**Blocked by:** T02
**Parallel group:** None

**What to build:** Functional-programming linting is active via a curated
immutability-first rule set from `eslint-plugin-functional` (`immutable-data`,
`prefer-immutable-types`, `prefer-readonly-type`, `no-let`,
`no-mixed-types`), adopted per the revised spec decision after the blanket
`recommended` preset proved irreconcilable with zero suppressions and zero
behavior change. Immer may be adopted where it makes immutability fixes
cleaner. Every violation of the enabled rules is fixed outright, without
suppressions, keeping behavior identical.

- [x] Flat config enables the curated eslint-plugin-functional rule set from the spec
- [x] Every violation of enabled rules is fixed; zero errors and zero suppressions
- [x] Full vitest suite passes after the fixes (no behavior change)

## T04: Enforce test-location standard in ESLint

**Blocked by:** T03
**Parallel group:** None

**What to build:** Lint fails mechanically if any test file is ever added back
inside an application folder, enforcing the repository standard that tests
never coexist with application code.

- [x] ESLint configuration rejects test files placed inside application folders
- [x] `pnpm run lint` passes clean on the relocated tree
- [x] A deliberately misplaced test file causes a lint failure (verified, then removed)

## T05: Restore constitution format gate on feature-touched files

**Blocked by:** None (remediation target for the Test-phase blocker)
**Parallel group:** None

**What to build:** `pnpm run format:check` passes again on every file this
feature touched. Test attributed 28 formatting violations to this feature's
edits (all prettier-clean at merge-base df4b4ab); `wrangler.jsonc` is
pre-existing drift outside this feature and must not be touched by it.

- [x] All 28 feature-touched files from the Test blocker list are Prettier-clean (`wrangler.jsonc` excluded as foreign pre-existing drift) — `format:check` lists only `wrangler.jsonc`
- [x] `pnpm run lint`, `pnpm run build`, full vitest suite, and Playwright suite re-verified after the formatting pass — lint exit 0, build exit 0 (35 modules), `test` green once (vitest 16 files / 90 tests; Playwright 76/76), `test:focused` 5 files / 32 tests
