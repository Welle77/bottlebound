# Tickets — String union types

Vertical slices through `match-types` / `ruleset` / domain helpers / storage validators. Each slice defines its union once and propagates it end-to-end so `tsc` rejects invalid literals after that slice. No Parallel groups — each slice builds on the narrow types of the previous one.

## T01: Centralize Team, CharacterId, Phase, and event/action unions

**Blocked by:** None (can start immediately).

**Status:** complete

Define the closed domain unions once and re-export them via the domain facade. Keep all persisted data and runtime behavior identical; only the static types narrow.

- [x] `Team`, `CharacterId` (12 roster ids), `Phase`, `MatchEventType` (12 event types), `ActionKind`, `AttackKind`, `DecisionBasis`/`MatchOutcome` wiring, and `EffectDurationKind` are each defined once (prefer `src/domain/match-types.ts` for match-level literals and `src/domain/ruleset.ts` for ability/reaction ids; extract `src/domain/literals.ts` only if a circular import would otherwise occur) and re-exported via `src/domain/match.ts`
- [x] `CharacterId` is written as the explicit 12-literal union so `tsc` rejects `"not-a-character"`; a private `isCharacterId` guard exists for narrowing untyped canonical-record inputs without an unchecked cast
- [x] `tsc --noEmit` and `pnpm run build` still pass; a compile-only `// @ts-expect-error` probe assigning `"not-a-character"` to `CharacterId` correctly errors
- [x] No roster, ability, or stored-record change; `RULESET.characters` remains the single runtime source

## T02: Propagate CharacterId/Team through Match State, roster, and display names

**Blocked by:** T01.

**Status:** complete

Narrow every Match State field that carries a character or team literal. Replace `Record<string, string>` keyed by character with `CharacterId`-keyed maps. Keep persistence compatibility.

- [x] `MatchCharacter.characterId`, `InitiativeEntry.characterId`, `TieOrder.initialCharacterIds/characterIds`, `ActiveEffect.anchorCharacterId/affectedCharacterId`, `DisplayNames`, `spentReactionIds/spentAbilityIds` element types, and `teamOfCharacter(characterId: CharacterId): Team` use the centralized unions. Evidence: `pnpm run tsc` passed.
- [x] `DisplayNames` is `Partial<Record<CharacterId, string>>` (or equivalent `Readonly` form) rather than `Record<string,string>`; every helper that reads or writes it uses `CharacterId` as key and no signature widens back to `string`. Evidence: display-name domain/storage suites passed (8 tests); `pnpm exec svelte-check --tsconfig ./tsconfig.json` passed.
- [x] `RulesetCharacter.id`, `RulesetBasicAttack.characterId`, and `RulesetReferenceCharacter` roster ids use `CharacterId`; `Team` imports replace ad-hoc `"Drow"|"Duergar"` literals. Evidence: `pnpm run tsc` passed.
- [x] `tsc --noEmit`, `svelte-check`, `pnpm run lint`, `pnpm run test:focused`, and the canonical storage probe focused suite pass; existing persisted records still validate. Evidence: `src/storage/match-store-canonical-event.ts` is now 755 lines; T02 rerun passed tsc, svelte-check, lint, 37 focused tests, 2 canonical storage probes, and 8 display-name domain/storage tests.

## T03: Propagate unions through Match Events, combat inputs, and ability inputs

**Blocked by:** T02.

**Status:** complete

Narrow event payloads and the inputs that produce them so invalid literals fail at the call site. Keep runtime branch coverage exhaustive and persistence-compatible.

- [x] `ActionResolvedEvent`, `AttackLeg`, `ActionEffect`, `ProtectiveReaction*`, `BasicAttackInput`, `AbilityInput` (and `match-abilities`/`match-combat`/`match-ability-utility` signatures) use `CharacterId`/`AbilityId`/`ReactionId`/`AttackKind`/`ActionKind` and narrow `rangePaces` / `rulesSourceAnchor` handling where it carries type weight; `Started`/`Ended` phase discriminants use `Phase`. Evidence: `./node_modules/.bin/tsc --noEmit` passed.
- [x] `attackType` on `StructuredAbility` narrows to `AttackKind | "None"` (since Reactions use `"None"`) rather than `string`; free-text card fields (`effect/target/range` display strings) are explicitly left as `string` and noted as out-of-scope. Evidence: scoped format and ESLint checks passed.
- [x] Exhaustive switches/guards cover the new unions without a fallback `string` arm; no helper return type or map key re-widens to `string`. Evidence: `match-replay` dispatch remains an exhaustive discriminated `MatchEvent` switch; the replay contact set now uses `ReadonlySet<CharacterId>`; `tsc --noEmit` and scoped ESLint passed.
- [x] Focused domain suites (`tests/domain/match.test.ts`, ability/combat/turn/endgame) and `tsc --noEmit` pass; a `// @ts-expect-error` probe assigning `"not-a-character"` to `BasicAttackInput.sourceCharacterId` correctly errors. Evidence: `./node_modules/.bin/vitest run` passed 8 files / 54 tests; the included type probe is verified by `tsc --noEmit`.

### Review remediation — 2026-08-27

- [x] `AbilityId` and `ReactionId` are exact closed unions for the 24 Ability cards and 5 Reaction cards; `BasicAttackId`/`AttackId` keep Basic Attacks separate, and compile-only probes reject invented and cross-typed ids. Evidence: `./node_modules/.bin/tsc --noEmit` passed.
- [x] `ActiveEffect.kind`, `duration.boundaryTrigger`, and `operations` use centralized exact unions. Runtime Ruleset construction, effect expiry/consumption, and canonical Match-state validation use the same values. Evidence: 15 targeted domain/storage suites passed (91 tests).
- [x] Removed the four added `@ts-nocheck` directives from Ability Draft, Basic Attack Draft, contacts, and reactions components; their character/reaction values are now narrowly typed. Evidence: `./node_modules/.bin/svelte-check --tsconfig ./tsconfig.json` passed with zero errors/warnings.
- [x] Canonical Action Resolution effects retain `CharacterId` from attack-leg contact validation through per-effect validation; the Display Name key guard still rejects non-roster DOM keys. Evidence: display-name domain/storage suites and canonical-event/storage suites passed.
- [x] `recordSimultaneousRuling` uses canonical `Team | "draw"` rather than an ad-hoc team union. Evidence: repository-wide lint passed.

## T04: Tighten canonical storage validators without breaking persisted data

**Blocked by:** T03.

**Status:** complete

Make the single-schema canonical validators aware of the new narrow types while preserving acceptance of every previously-persisted record.

- [x] `src/storage/match-store-canonical-state.ts`, `match-store-canonical-event.ts`, and `match-store-canonical-commit.ts` import central guards and narrow persisted strings after `typeof === "string"`; attack-leg contact ids now remain `CharacterId` downstream. Evidence: scoped Prettier and `./node_modules/.bin/tsc --noEmit` passed.
- [x] No validator rejects a previously-accepted persisted record; `MATCH_SCHEMA_VERSION` remains `3`, and serialization round-trips are unchanged. Evidence: storage audit passed 6 files / 31 tests and persistence contracts passed 2 files / 12 tests.
- [x] Storage audit suites (`canonical-storage-probe`, `match-store`, `match-store-completeness`, canonical-event, display-name, lifecycle) and contract persistence tests pass; `pnpm run lint` and `pnpm run build` pass. Evidence: direct Vitest runs above plus Corepack pnpm static commands on 2026-08-27.
- [x] `pnpm run test` (Vitest + Playwright) is Test-owned and intentionally not run during Code, per the approved phase boundary; this slice has focused storage, contract, lint, TypeScript, and build evidence.

## F01: Narrow structured ability names

**Follow-up to:** T03

Introduce one exact `AbilityName` union for the 24 structured Ability card names and propagate it through `RulesetAbility`, `StructuredAbility`, `RulesetReaction`, and name-based ability helpers. Keep the rules-reference parser boundary and printed-card free-text fields as `string`; preserve runtime and persisted values.

- [x] `AbilityName` contains all 24 authoritative names, has a runtime guard for untyped rules-reference input, and is re-exported through `src/domain/match.ts`
- [x] Structured ability and reaction names plus name-based helper parameters use `AbilityName`; compile-only probes reject an invented ability name
- [x] `tsc --noEmit`, `svelte-check`, scoped lint/format, and ability/domain tests pass with no runtime or persistence behavior changes

## F02: Resolve stylistic type-definition diagnostics

**Follow-up to:** F01

Adopt the newly enabled stylistic ESLint rules by changing object-shaped interfaces to type aliases and replacing forbidden `Array<T>`/`ReadonlyArray<T>` syntax throughout the reported application and test files. Preserve test semantics and runtime behavior.

- [x] All `@typescript-eslint/consistent-type-definitions` diagnostics use `type` aliases
- [x] All reported `@typescript-eslint/array-type` and `@typescript-eslint/no-empty-function` diagnostics are resolved without inline disables or behavior changes
- [x] Lint, build, focused tests, and formatting checks pass
