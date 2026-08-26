# Match persistence is single-schema with no migration layer

BOTTLEBOUND match data persists only in each referee's browser (IndexedDB,
device-local), the package is private, and there are no released users. We
removed the legacy schema-2→3 migration subsystem (`LegacyMatchState` aliases,
`migrateLegacyMatch`, `MatchMigrated` events, and the store's legacy restore
branch) together with all within-version backward-compatibility optional
fields. Match persistence now supports exactly one schema version at a time.

Consequence: any future change to the persisted match format is breaking by
design. Old on-device data that no longer validates is rejected by `restore()`
through the existing "Saved canonical data is incompatible…" error path, and
the referee starts a new Match. Do not reintroduce migration code, legacy type
aliases, or compatibility optional fields without a new decision.
