# Tickets — Decouple rules guide from runtime

This wide refactor uses an expand–migrate–contract sequence. Each ticket keeps the repository testable. No Parallel groups are approved because the tickets share configuration, persistence, and Rules Reference boundaries.

## T01: Add application-owned Match Configuration

**Blocked by:** None (can start immediately).

**Status:** complete

Add immutable Match Configuration beside the current guide-derived runtime path. Preserve the current roster, attacks, abilities, Reactions, labels, instructions, and operation declarations through application-owned literals.

- [x] Match Configuration contains all runtime values that current Match behavior and Match UI need without importing Rules Reference data
- [x] Every closed identifier, kind, policy, trigger, check, and operation declaration uses one centralized explicit union type
- [x] True free-form labels and referee instructions remain strings and do not become speculative unions
- [x] Public configuration contract tests use known application literals and prove immutability without comparing against the Ruleset
- [x] Focused type, configuration, format, and lint checks pass

## T02: Run Match behavior from Match Configuration

**Blocked by:** T01.

**Status:** complete

Move Match domain, application, storage validation inputs, and Match UI consumers to Match Configuration while the old guide-derived structures remain temporarily available for the Rules Reference.

- [x] Match setup, turns, combat, abilities, effects, elimination, replay, undo, and End Game consume Match Configuration
- [x] Match UI roster, attack, ability, and Reaction controls consume application-owned values and text
- [x] Closed union types remain narrow through helpers, state, events, and UI adapters without widening to bare strings
- [x] Existing gameplay behavior and visible Match information remain unchanged
- [x] Focused domain, application, UI, type, format, and lint checks pass

## T03: Persist configuration identity and replace guide anchors

**Blocked by:** T02.

**Status:** complete

Make Match persistence identify Match Configuration and replace fixed guide anchors with application-owned Rules Reference searches.

- [x] Runtime and persisted records use `configurationVersion` instead of `rulesVersion`
- [x] The persistence schema increments and prior records fail through the established incompatibility path without migration or compatibility code
- [x] Runtime, Match Events, canonical records, histories, and summaries contain no guide source-anchor field
- [x] Contextual Rules controls open the Rules Reference with an application-owned search query
- [x] Version, schema, search, and operation values retain explicit closed union types where their value sets are closed
- [x] Focused persistence, replay, Rules control, browser, type, format, and lint checks pass

## T04: Make the Rules Reference structure-agnostic

**Blocked by:** T03.

**Status:** complete

Render and search the current bundled Ruleset as safe generic Markdown content without interpreting its document structure as an application contract.

- [x] Rules Reference generation requires no fixed heading text, level, numbering, position, order, roster table, ability-card field, or generated anchor
- [x] Rules Reference rendering keeps the existing content-safety boundary
- [x] Search remains usable when fixtures change heading levels, numbering, positions, and order
- [x] The Rules Reference has no Match Configuration version lookup or Match State dependency
- [x] Contextual search queries remain useful without exact guide anchors
- [x] Focused Rules Reference contract, search, browser, build, type, format, and lint checks pass

## T05: Remove the guide-derived runtime contract

**Blocked by:** T01, T02, T03, and T04.

**Status:** complete

Remove the obsolete runtime derivation, structured guide parity checks, and compatibility aliases after every consumer uses the new boundaries.

- [x] `MATCH_CONFIGURATION` is the only runtime configuration surface and the obsolete `RULESET` runtime surface is removed
- [x] No Match Configuration, Match domain, application, storage, or Match UI module imports guide-derived structured data
- [x] No test compares Match Configuration values or behavior with the Ruleset
- [x] Static dependency evidence rejects a restored guide-to-runtime dependency
- [x] Closed semantic values use centralized unions and no remaining runtime branch depends on an avoidable bare string
- [x] Existing gameplay, persistence rejection, Rules Reference, build, lint, format, and focused checks pass

## F1: Remove historical configuration compatibility validation

**Follow-up to Review:** Canonical persistence validation must accept only the
current Match Configuration version and must not relax validation for retired
identifiers or metadata.

- [x] Canonical state and event validation reject non-current configuration versions through the incompatibility path
- [x] Persistence tests reject retired identifiers, metadata, and unavailable configuration versions
- [x] Runtime-facing Ruleset terminology is removed from the affected domain and UI surfaces
- [x] Focused persistence/domain tests, TypeScript, ESLint, Prettier, and `git diff --check` pass
