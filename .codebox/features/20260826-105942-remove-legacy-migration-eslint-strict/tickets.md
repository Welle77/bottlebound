# Tickets — Remove legacy match migration subsystem and adopt typescript-eslint strict

Sequential tracer-bullet chain. Each ticket is one bounded fresh-agent
assignment; no parallel groups (tickets share domain/storage files).

Revision note: the originally approved T01/T02 split could not compile
independently — deleting domain migration symbols breaks
`src/storage/match-store.ts` and its focused tests in the same commit. The
former T01 and T02 are merged into one atomic ticket.

## T01: Remove legacy migration subsystem (domain + store)

**Blocked by:** None (can start immediately).

Delete atomically across layers: `LEGACY_MATCH_SCHEMA_VERSION`,
`LegacySetupMatchState`, `LegacyActiveMatchState`, `LegacyMatchState`, the
legacy `assertMatchStateStructure` overload, `migrateLegacyMatch`, and
`MatchMigratedEvent` (interface, union membership, replay arm,
canonical-event validation, canonical-commit allowances) from
`match-types.ts`, `match-history.ts`, `match-replay.ts`,
`match-store-canonical-event.ts`, `match-store-canonical-commit.ts`, and the
domain facade. Remove the schema-2 branch and its atomic migration write from
`IndexedDbMatchStore.restore()`; restore validates only the current schema and
rejects anything else through the existing incompatible-data error path. Add a
store test proving foreign-schema persisted data is rejected via the public
API. Rewrite `tests/domain/match.test.ts` against the single schema; delete
`rewriteCurrentSnapshotAsLegacy`, `rewritePersistedMatchAsSchema2`, and all
migration store/E2E tests.

- [ ] `pnpm run build` passes with no dangling legacy references
- [ ] Focused tests pass; store rejection-of-foreign-schema test present
- [ ] Browser E2E suite passes without migration helpers
- [ ] Facade exports contain no Legacy aliases or migration functions
- [ ] `rg -n "MatchMigrated|migrateLegacyMatch|LegacyMatchState|LegacySetupMatchState|LegacyActiveMatchState|LEGACY_MATCH_SCHEMA_VERSION|rewriteCurrentSnapshotAsLegacy|rewritePersistedMatchAsSchema2" src tests` returns nothing

## T02: Make within-version compat fields required

**Blocked by:** T01 (shares replay/canonical-event/commit files).

Remove optionality from `ActionResolvedEvent.abilityOverride`,
`TurnFinishedEvent.expiredEffects`, `MatchEndedEvent.decisionBasis`,
`finalCounts`, `finalHpTotals`, `coinFlipResult`, and mirrored
`EndedMatchState` fields. Replace the legacy-ended replay branch and
possibly-undefined canonical comparisons with total handling. End snapshot
tolerance for absent `displayNames`/`spentAbilityIds`. Update contract and
audit tests.

- [ ] Contract/audit/store tests pass with required-field contracts
- [ ] Replay handles ended events without optional-field branches
- [ ] `pnpm run build` passes

## T03: Convert ESLint to strict presets

**Blocked by:** T02 (lint must judge final code).

Swap `eslint.configs.recommended` → `strict` and
`tseslint.configs.recommendedTypeChecked` → `strictTypeChecked` in
`eslint.config.js`. Keep scope, Svelte layer, functional block, style
overrides, and guard unchanged. Fix every surfaced violation in source; zero
new suppressions, disables, or weakened overrides.

- [ ] `pnpm run lint` exits 0 with zero errors/warnings/suppressions
- [ ] Full suite `pnpm run test` passes
- [ ] Config diff limited to preset swap plus required source fixes
