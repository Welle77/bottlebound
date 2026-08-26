# Release notes - Remove legacy match migration subsystem and adopt typescript-eslint strict

Change: Removed
Maturity: N/A
Audience: Maintainers and contributors of the Referee Console repository, and referees with persisting Matches
Action required: No
Finalized: 2026-08-26

## Summary

The legacy match migration subsystem for the unreleased schema-2 persistence format was removed. `LEGACY_MATCH_SCHEMA_VERSION`, `Legacy*State` aliases, `migrateLegacyMatch`, and the `MatchMigrated` event were deleted from the domain, store, and facade, and `IndexedDbMatchStore.restore()` now validates only the single current schema. Within-version compatibility optional fields (`abilityOverride`, `expiredEffects`, `decisionBasis`, `finalCounts`, `finalHpTotals`, `coinFlipResult`, `displayNames`) are now required. ESLint was converted to `typescript-eslint` `strict` and `strictTypeChecked` on the unchanged typed file scope, and every surfaced violation was fixed in source with zero new suppressions. Build, focused tests, and the full suite remain green.

## User and operator impact

Referees see one observable Match behavior change: persisted data that does not match the single current schema is now rejected through the existing restore error path ("Saved canonical data is incompatible…") with records left untouched; there is no migration fallback and no data-recovery path for pre-existing legacy data on device. Current-schema Matches restore, commit, undo, and End Game unchanged. Contributors see stricter lint feedback for unsafe any, nullish handling, and confusing void expressions; the lint scope, ignores, Svelte layer, functional-plugin block, and test-location guard are unchanged, and `.svelte` script contents remain outside the typed layer. The build output shape is unchanged (`app.js`, `style.css`, `index.html`; 163 modules).

## Action required

None.

## Known issues

None known.

## References

- Feature spec: `.codebox/features/20260826-105942-remove-legacy-migration-eslint-strict/spec.md`
- Decision: `.codebox/adr/0001-single-schema-match-persistence.md`
- Report: `.codebox/features/20260826-105942-remove-legacy-migration-eslint-strict/report.jsonl`
