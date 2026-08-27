---
slug: 20260827-130610-string-union-types
title: String union types
branch: feature/string-union-types
target_branch: main
current_phase: ship
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
  default: lightweight
  aliases:
    lightweight: [opencode/muse-spark-1.2-contributor-free, gpt-5.6-luna, copilot/gpt-5.6-luna]
    general: [gpt-5.6-terra]
    frontier: [gpt-5.6-luna, gpt-5.6-sol, copilot/gpt-5.6-sol, opencode/muse-spark-1.2-contributor-free]
  phases:
    planning: frontier
---

# String union types

## Problem Statement

Loose `string` types on core domain fields allow invalid values (mistyped character ids, team names, ability ids, effect kinds, event types) to pass `tsc --noEmit` and reach runtime. The Referee Console domain already treats many of these values as closed sets (12 roster characters, 2 teams, fixed event vocabularies, fixed effect duration kinds), but the type surface still widens them to `string` in Match State, Match Events, and helper signatures. This removes compile-time safety without adding flexibility.

## Solution

Introduce centralized explicit string-union types for the closed domain literals and propagate them through Match State, Match Events, Ruleset types, and the helpers that read or write those fields. Keep runtime and persistence behavior identical: IndexedDB, canonical validators, and the single-schema storage contract continue to accept the same serialized values, only the static types narrow. Centralize each union once and reuse it; avoid widening a narrow literal to `string` through a helper signature, a record index, or a generic `Record<string, string>` that should be keyed by the union.

## User Stories

1. As a developer, I want `CharacterId` to reject `characterId: "oops"` at compile time, so that a mistyped roster id never reaches a Match command.
2. As a developer, I want `Team` (`"Drow" | "Duergar"`) to be the single source for team literals, so that a `teamOfCharacter` helper cannot return a stray string.
3. As a developer, I want Match Event `type` and `actionType` / `attackType` / `phase` / `decisionBasis` to be closed unions, so that an exhaustive switch is checked by the compiler.
4. As a developer, I want `AbilityId` and `ReactionId` (and their `spent*` collections) typed as narrow strings, so that a spent check cannot silently accept an invented id.
5. As a developer, I want `EffectDurationKind` and active-effect `kind` / effect `operations` narrowed from bare `string`, so that duration handling and operation dispatch stay exhaustive.
6. As a maintainer, I want every union defined once (in `match-types` / `ruleset`) and re-exported through the domain facade, so that a new character or ability requires one addition.
7. As a maintainer, I want storage and canonical validation to stay compatible with already-persisted Matches, so that narrowing never forces a migration.
8. As a referee, I want no observable change in Match rules, UI text, or stored data, so that the console behaves identically after the type change.

## Implementation Decisions

- Seams and ownership: the existing seams are `src/domain/match-types.ts` (canonical Match types), `src/domain/ruleset.ts` (Roster and structured abilities), `src/storage/match-store-canonical-*` (validators), and the composed facade `src/domain/match.ts`. Prefer these four seams; add a small `src/domain/literals.ts` only if a circular import would otherwise occur between `match-types` and `ruleset`.
- Central unions (exact sets at this roster):
  - `Team = "Drow" | "Duergar"` (already exists, keep as canonical and remove any ad-hoc `"Drow"| "Duergar"` literals elsewhere via import).
  - `CharacterId = "drow-rogue" | "drow-druid" | "drow-paladin" | "drow-wizard" | "drow-sorcerer" | "drow-bard" | "duergar-ranger" | "duergar-monk" | "duergar-fighter" | "duergar-barbarian" | "duergar-warlock" | "duergar-cleric"` derived from the authoritative roster in `bottlebound_rules_final.md` and the generated `RULESET.characters`.
  - `Phase = "setup" | "active" | "ended"`.
  - `MatchEventType` union for `MatchEvent["type"]` (`SetupCreated`, `DisplayNamesAssigned`, `InitiativeGenerated`, `InitiativeRerolled`, `MatchStarted`, `TurnFinished`, `ActionResolved`, `EliminationContinued`, `SimultaneousEliminationRuled`, `MatchEnded`, `MatchReopened`, `UndoApplied`).
  - `ActionKind = "Basic Attack" | "Ability"` and `AttackKind = "melee" | "ranged" | "ability"` (collapse the current free `attackType: string` in `StructuredAbility`/`RulesetReaction` to this union where it carries semantics).
  - `AbilityId` and `ReactionId` unions for the 24 abilities / 5 reactions (`${characterId}-${slug}`), generated from the structured ability id scheme already in `ruleset.ts`.
  - `EffectId` / narrow effect `kind` and operation literals where the current `string` governs branching (e.g., `ActiveEffect.kind`, `operations`, `boundaryTrigger`, `duration.kind` stays as `EffectDurationKind` and `anchor: "source" | "affected"` is already narrow — keep it imported, not re-declared).
- Propagation targets (no runtime change):
  - Match State: `MatchCharacter.characterId`, `InitiativeEntry.characterId`, `TieOrder.initialCharacterIds / characterIds`, `AttackLeg.sourceCharacterId / affectedCharacterIds / redirectedByReactionId / towardCharacterId`, `ActionEffect.characterId`, `ActiveEffect.anchorCharacterId / affectedCharacterId / abilityId / effectId`, `ProtectiveReaction*` ids, `BasicAttackInput` / `AbilityInput` character fields, `DisplayNames` keys (`Record<CharacterId, string>` intersected with `Partial` to preserve optional refereed names), `spentReactionIds / spentAbilityIds` element types.
  - Match Events: every `characterId`-bearing field on `ActionResolvedEvent`, `TurnFinishedEvent` is already slot-based and stays `number`, but the event `type` and embedded `attackLegs / reactions / effects` character fields narrow.
  - Helpers: `teamOfCharacter(characterId: CharacterId): Team`, `match-abilities`, `match-combat`, `match-turn`, `match-endgame`, `match-replay`, `match-history`, `match-setup`, and the canonical validators' internal record checks — their signatures accept the narrow types and their runtime `isRecord` string checks remain permissive so persisted data validates unchanged.
- Authoritative source for literals: at type level, `CharacterId` is written as the 12-literal union (so `tsc` errors on unknown ids without evaluating a runtime array). At value level, `RULESET.characters` remains the single runtime source; validators and helpers that today do `RULESET.characters.some(id === characterId)` keep that check, now with the narrowed parameter.
- Persistence compatibility: `match-store-canonical-state` / `match-store-canonical-event` / `match-store-canonical-commit` keep their `isRecord` / `typeof === "string"` guards permissive (they already reject non-strings); they add an explicit `CharacterId`/`Team` inclusion check only when narrowing is safe, and never reject a previously-accepted persisted record whose serialized string is in the union. IndexedDB serialization is unchanged; `toMatchSummary` / `toMatchHistory` etc. keep their string outputs but return narrow `decisionBasis / outcome / coinFlipResult` types.
- No widening: helpers that return or accept a domain literal return the union, not `string`. Where a map is keyed by character, key it by `CharacterId` (`Record<CharacterId, string>` or `Map<CharacterId, …>`) rather than `Record<string, string>`. If a function must bridge to an untyped `string` (e.g., canonical-record `unknown` input), narrow via a user-defined type guard (`isCharacterId(value: string): value is CharacterId`) rather than an unchecked cast, preserving `no-unnecessary-condition` hygiene.
- Ruleset: `RulesetCharacter.id`, `RulesetBasicAttack.characterId`, `RulesetReaction.ownerCharacterId`, `StructuredAbility.ownerCharacterId / id` narrow to `CharacterId` / `AbilityId` / `ReactionId` as appropriate; `StructuredAbility.attackType` narrows to `AttackKind | "None"` (since reactions use `"None"` today) rather than bare `string`, and `RulesetAbility.type/target/range` etc. remain printed-card `string` because they are display text, not branching keys — narrowing them is intentionally deferred.
- Import discipline: unions live in one canonical module (prefer `match-types.ts` for `CharacterId/Team/Phase/MatchEventType` and `ruleset.ts` for `AbilityId/ReactionId`) and are re-exported via `src/domain/match.ts` so UI and storage import narrow types without circular imports. No duplicate literal lists.
- Formatting / lint: no new eslint rule is added; satisfy existing `typescript-eslint` strict, `functional`, and complexity constraints. Use immutable `readonly` arrays/records as today.

## Testing Decisions

- A good test checks observable Match, persistence, and UI behavior, not the existence of a type alias. Type narrowing is checked by `tsc --noEmit` and by the compiler rejecting a deliberately mistyped literal in a type-check-only assignment.
- Seams for focused checks:
  - `tsc --noEmit` and `pnpm run build` (which composes `tsc` + `svelte-check` + `vite build`) must pass with zero new errors; a negative type check is added as a compile-fail probe (`// @ts-expect-error` assignment of `"not-a-character"` to `CharacterId`) in the focused type probe, not as a runtime expectation.
  - Domain: `tests/domain/match.test.ts` and ability/combat/turn/endgame suites — behavior unchanged; they also surface widening if a helper still takes `string` because the probe assignment to the helper would no longer error.
  - Storage: `tests/storage/canonical-storage-probe.test.ts` + `tests/storage/match-store.test.ts` + contract persistence tests — prove canonical validation still accepts every previously-persisted record and rejects the same invalid records as before.
  - UI / browser: `tests/shell-state.test.ts` and `readiness` — smoke that the narrowing did not change rendered state transitions.
- No new persistent-storage migration is tested; the feature must pass the existing storage audit suites unchanged.
- Full suite `pnpm run test` (vitest + playwright) is the pre-ship gate; Code phase owns focused `tsc / svelte-check / vitest run <seam>` and format/lint, Test owns the complete suite.

## Acceptance Criteria

1. Centralized unions exist for `Team`, `CharacterId` (all 12 roster ids), `Phase`, `MatchEventType`, `ActionKind`/`AttackKind`, `AbilityId`/`ReactionId`, `AbilityName` (all 24 structured ability names), and effect-duration/anchor kinds where the current code uses bare `string` for branching, each defined once and re-exported via `src/domain/match.ts`.
2. Match State, Initiative, Attack Legs, Effects, Protective Reactions, and Match Event payloads use those unions for every character-/team-/ability-/reaction-/event-type-bearing field; `DisplayNames` is keyed by `CharacterId`, and `spentReactionIds / spentAbilityIds` are typed by the corresponding id unions.
3. `teamOfCharacter` and every helper that branches on a narrowed field accepts the union (not `string`) and an exhaustive `switch` or guard covers the union without a fallback `string` arm that would re-widen it.
4. No helper widens a narrowed literal back to `string` in its return type or map key; generic `Record<string,string>` keyed by character is replaced by a `CharacterId`-keyed type where a character key is intended.
5. `tsc --noEmit`, `svelte-check`, `pnpm run lint`, and `pnpm run build` pass with zero new errors or warnings; an explicit `// @ts-expect-error` probe assigning `"not-a-character"` to `CharacterId` and to a `BasicAttackInput.sourceCharacterId` parameter correctly errors.
6. `pnpm run test:focused` (and the per-ticket focused domain/storage seams) passes unchanged; persisted-record compatibility is preserved — all existing storage-contract and canonical-audit tests pass without snapshot migration.
7. No runtime, roster, ability, persistence-schema, or UI behavior change: the 12-character roster, 24 abilities, 5 reactions, HP, initiative, elimination, and summary outputs remain byte-for-byte the same as at `c3d77b6`.

## Out of Scope

- Narrowing printed-card display strings (`RulesetAbility.effect/target/range` free text) to unions — they are presentation, not branching keys.
- Adding a runtime migration, bumping `MATCH_SCHEMA_VERSION`, or changing the IndexedDB schema; persistence compatibility is read-only narrowing.
- Widening any union to `string & {}` or `string` to accept ad-hoc values; the point is strictness.
- New lint rules, dependency upgrades, Ship workflow changes, or gameplay / roster / ability semantics changes.
- Splitting `src/domain/match-types.ts` into multiple files beyond a minimal `literals.ts` if import cycles demand it.

## Further Notes

- Roster source of truth remains `bottlebound_rules_final.md` §2 and `RULESET.characters` at runtime; the 12 `CharacterId` literals mirror those ids verbatim.
- Prior learnings require: reuse the repository-local pnpm store / writable `node_modules` in linked worktrees, install the pinned Playwright browsers before browser suites, and keep `tsc` include explicit so previously-unchecked test trees are not newly swept into coverage wholesale.
- Gate policy and model routing are locked snapshots from `.codebox/constitution.md` and must not be edited during phase progression.
