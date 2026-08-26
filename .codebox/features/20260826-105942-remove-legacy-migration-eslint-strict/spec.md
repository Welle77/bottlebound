---
slug: 20260826-105942-remove-legacy-migration-eslint-strict
title: Remove legacy match migration subsystem and adopt typescript-eslint strict
branch: feature/remove-legacy-eslint-strict
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

# Remove legacy match migration subsystem and adopt typescript-eslint strict

## Problem Statement

The Referee Console carries a legacy match migration subsystem for a schema-2
persistence format that no released user ever produced. Its code paths
(`Legacy` type aliases, `migrateLegacyMatch`, `MatchMigrated` events, the
store's legacy restore branch, and backward-compatibility optional fields)
add surface area every contributor must understand and preserve, and they
contradict the decision that match persistence is single-schema. Separately,
ESLint runs the non-typed `recommended` preset plus
`recommendedTypeChecked`; the stricter `strict` / `strictTypeChecked`
presets are not enabled, so classes of defects they catch pass silently.

## Solution

Delete the entire legacy migration subsystem and all backward-compatibility
optional fields so persisted matches support exactly one schema version,
then convert ESLint to the typescript-eslint `strict` and
`strictTypeChecked` presets on the unchanged type-checked file scope,
fixing every surfaced violation outright under the standing zero-suppression
rule. Old on-device data that no longer validates is rejected through the
existing restore error path; there is no migration fallback.

Decisions recorded in `.codebox/adr/0001-single-schema-match-persistence.md`.

## User Stories

1. As a referee, I want Match State restored from storage to follow one
   canonical schema, so that saved Matches behave identically every session.
2. As a referee, I want incompatible old saved data rejected with a clear
   error, so that I understand why a Match did not restore instead of seeing
   silently altered state.
3. As a referee, I want the console free of unused compatibility machinery,
   so that Match behavior is predictable and defects in dead paths cannot
   affect me.
4. As a developer, I want legacy migration types removed from the domain
   facade, so that the domain language shows one Match State shape.
5. As a developer, I want `migrateLegacyMatch` deleted, so that no caller can
   accidentally produce `MatchMigrated` events again.
6. As a developer, I want the `MatchMigrated` event type removed from replay,
   canonical-event validation, commit rules, and persistence, so that the
   event vocabulary matches what the system actually records.
7. As a developer, I want the store's schema-2 restore branch deleted, so
   that `restore()` has one validation path for the one supported schema.
8. As a developer, I want within-version compatibility optional fields
   (`abilityOverride?`, `expiredEffects?`, legacy `MatchEndedEvent` optionals,
   snapshot tolerance for missing `displayNames`/`spentAbilityIds`) made
   required and their special-case replay branches deleted, so that event
   contracts are total rather than partially optional.
9. As a developer, I want tests for migrated and legacy-shaped data removed
   or rewritten against the single schema, so that the suite proves current
   behavior only.
10. As a developer, I want ESLint extended to the `strict` non-typed preset,
    so that base-level TypeScript hazards are flagged everywhere ESLint runs.
11. As a developer, I want ESLint extended to `strictTypeChecked` on the
    existing typed file scope, so that unsafe-any usage, nullish handling,
    and confusing void expressions are compile-lint enforced.
12. As a developer, I want every new strict-mode violation fixed outright,
    so that the lint gate stays at zero errors, warnings, and suppressions.
13. As a developer, I want the lint scope left unchanged, so that this
    feature's diff stays reviewable as a preset conversion, not a coverage
    expansion.
14. As a maintainer, I want the removal sequenced before the strict
    conversion, so that lint strictness is judged against final code.
15. As an operator, I want the build (`tsc --noEmit && svelte-check`) green
    after both changes, so that deployment artifacts stay valid.

## Implementation Decisions

- **Single-schema persistence** (ADR 0001): remove
  `LEGACY_MATCH_SCHEMA_VERSION`, all `Legacy*State` aliases, the legacy
  overload of `assertMatchStateStructure`, `migrateLegacyMatch`, and the
  `MatchMigratedEvent` interface with its entries in the `MatchEvent` union,
  replay, canonical-event validation, canonical-commit allowances, and the
  store's atomic migration write. The facade re-exports shrink accordingly.
- **Store restore**: `IndexedDbMatchStore.restore()` loses its
  `schemaVersion === LEGACY_MATCH_SCHEMA_VERSION` branch; it validates only
  the current schema and rejects everything else via the existing
  "Saved canonical data is incompatible…" shell error path. IndexedDB
  `DATABASE_VERSION` and object-store layout do not change.
- **Layer B optionals become required**: `ActionResolvedEvent.abilityOverride`,
  `TurnFinishedEvent.expiredEffects`, `MatchEndedEvent.decisionBasis`,
  `finalCounts`, `finalHpTotals`, `coinFlipResult`, and the mirrored
  `EndedMatchState` fields lose their optionality; the legacy-ended replay
  branch and possibly-undefined comparisons are replaced by total handling;
  snapshot tolerance for absent `displayNames`/`spentAbilityIds` ends.
  Note: `toMatchSummary` currently throws on states lacking these fields;
  after this change such states cannot exist.
- **Prior spec superseded**: the earlier feature spec prescribing the
  `MatchMigrated` pattern for future schema bumps no longer applies; ADR 0001
  governs future format changes.
- **ESLint presets**: swap `eslint.configs.recommended` → `strict` and
  `tseslint.configs.recommendedTypeChecked` → `strictTypeChecked`. The
  Svelte layer, globals blocks, style overrides (`max-lines`, `max-params`,
  `prefer-const`), functional-plugin block, shell-state exemptions, and the
  misplaced-test guard keep their current shape and order.
- **Lint scope unchanged**: same `typeCheckedFiles`, same ignores. `.svelte`
  script contents remain outside the typed layer.
- **Zero suppressions carry over**: no new errors, warnings, file-level
  disables, rule overrides that weaken strict rules, or ignored paths; every
  violation is fixed in source.
- **Sequencing**: legacy removal lands before the preset conversion so lint
  strictness applies to final code.

## Testing Decisions

- Good tests verify behavior at public seams with independently derived
  expectations; implementation-detail tests, internal mocks, and tautological
  assertions are out.
- Seams (existing, no new seams):
  1. `IndexedDbMatchStore` restore/commit behavior through its store tests —
     proves single-schema restore accepts current data and rejects foreign
     schemas.
  2. The domain facade (`src/domain/match.ts`) and replay/commit modules
     through existing domain tests — proves event vocabulary and replay
     totals after optional-field removal.
  3. Repository commands as contract gates: `pnpm run build` (tsc +
     svelte-check), `pnpm run lint` (zero errors/warnings/suppressions),
     full suite `pnpm run test`.
- Migration-specific tests and E2E helpers
  (`rewriteCurrentSnapshotAsLegacy`, `rewritePersistedMatchAsSchema2`) are
  deleted; any replacement test asserts rejection of unknown schema versions
  through the store's public API.
- Prior art: existing `tests/storage/match-store.test.ts` patterns and the
  prior linting feature's zero-suppression gate definition.

## Out of Scope

- Widening type-aware lint coverage (Svelte script contents, contract/browser
  test directories, config files).
- Adopting additional eslint-plugin-functional paradigm rules.
- Any data-recovery or export path for pre-existing on-device legacy data.
- Changes to IndexedDB database versioning or object-store layout.
- CI pipeline changes.

## Further Notes

- Exploration evidence: legacy subsystem map gathered during Planning;
  lint baseline was clean (105 files, 0 errors/warnings) before conversion.
- `.codebox/standards.md` Tooling section claims no configured commands while
  the constitution and package.json define them; treat the constitution as
  authoritative. Flagged for separate correction, not part of this feature.
