# Tickets

Tracer-bullet vertical slices for Ability activation and effect expiry (W13).
Development approach: TDD at the domain and store seams; browser tests carry the referee-visible acceptance boundary. Follow the W03 closed automation vocabularies and the fixed-rules contract.

## T01: Ability roster, Spent state, and activation envelope

**Blocked by:** None (can start immediately)

**What it delivers:** The immutable Ruleset exposes structured Ability records for the full roster (24 abilities). The Active Match gains permanent `spentAbilityIds`, per-character `currentMaxHp`, and `activeEffects` with duration triggers. One generalized `ActionResolved` event records spent abilities, HP/maxHP changes, applied effects, and expiries atomically. The console shows `ability-already-spent` as an overridable warning and blocks invalid declarations without spending.

### Acceptance criteria

- [ ] The bundled Ruleset exposes immutable structured Ability records for all 24 abilities plus existing Basic Attacks and Reactions; fields match the contract (actionType, attackType, interaction, targetPolicy, range, lineOfSight, ballRequired, reactionTrigger, manualChecks, operations, rulesText, sourceAnchor).
- [ ] Contract checks from `bottlebound_rules_final.md` fail when structured ability data drifts from the roster and card fields.
- [ ] Match State adds `spentAbilityIds: string[]`, `currentMaxHp` per character, and `activeEffects[]` with `until-boundary | until-trigger | until-trigger-or-boundary | while-condition` durations.
- [ ] `ActionResolved` generalizes to `actionType: "Basic Attack" | "Ability"` with optional `abilityId`, `targetCharacterIds`, `spentAbilityIds`, `appliedEffects`, `expiredEffects`, and remains replayable for legacy Basic-Attack events.
- [ ] A Spent ability stays Spent for the Match, survives Revival, and survives its own effect expiry; an invalid declaration never spends.
- [ ] `ability-already-spent` appears with a recorded override path; structural invariants remain non-overridable.
- [ ] Migration from schema 3 preserves prior Matches (spent abilities empty, maxHP at base, no active effects) via one atomic `MatchMigrated` event; failed migration leaves prior records unchanged; unavailable-version Matches restore read-only.
- [ ] One ability draft saves one atomic Match Event + snapshot + sequence in one IndexedDB transaction; failed transaction leaves the last committed Match visible; restore after restart shows the exact state.

## T02: Targeted Ability Attacks through the guided flow

**Blocked by:** T01

**What it delivers:** Arcane Bolt, Deadeye, and Eldritch Blast reuse the Basic Attack guided flow without ball physics: one Active-enemy target selection, the existing Reaction window, universal damage/finalize sequence, final damage, HP, Downed, elimination, and atomic save.

### Acceptance criteria

- [ ] The ability draft for each targeted Ability Attack shows the owner's ability, attack type, range/LoS source, and target policy (enemy, active, one target).
- [ ] The referee selects exactly one legal Active enemy; invalid relation or Downed targets show `invalid-target-*` behind Override.
- [ ] Physical hit selection is absent; no range/Line-of-Sight/hit/terrain checks are required beyond the single target declaration (the card's range and LoS remain as source text, not calculated geometry).
- [ ] State-eligible Reactions appear for the affected target; the universal sequence (add-damage from prior marks, prevention, final damage) produces per-character results.
- [ ] Each attack contributes its `deal-damage: 1` before Reactions; final damage below 0 is clamped to 0 and does not trigger successful-damage consumers.
- [ ] Confirmation records one atomic `ActionResolved` with `abilityId`, `targetCharacterIds`, `spentAbilityIds`, warnings/overrides, effects, HP/Downed/elimination deltas, and spent state.
- [ ] A second ability or Basic Attack in the same turn needs the existing Major Action override; Powerful abilities respect 0 normal movement.
- [ ] Undo, restore, and failed-transaction behavior matches Basic Attack atomicity.

## T03: Physical ability attacks with per-hit effects

**Blocked by:** T01

**What it delivers:** Backstab, Stunning Strike, and Brutal Shove run the physical throw-resolution flow. Every legal bottle hit takes 1 damage plus the card's prohibition or forced movement, including allies and the attacker. Deflecting Palm can redirect the same ability attack.

### Acceptance criteria

- [ ] Each physical ability attack draft requires ordered legal bottle contacts across one initial Attack Leg, with manual range, Line of Sight, legal-bottle-contact, and terrain confirmations.
- [ ] The affected-character set rejects duplicates across the complete physical attack (including across redirected legs).
- [ ] Allies and the attacker can be included as legal hits when within hard range and Line of Sight.
- [ ] Backstab hits prohibit Powerful on each hit character until the end of that character's next turn; Stunning Strike does the same per-hit.
- [ ] Brutal Shove shows manual movement instructions before the Downed check, per the contract's out-of-sequence position.
- [ ] Selecting Deflecting Palm prevents the Monk's damage and opens exactly one redirected Attack Leg with later legal contacts under the original range and source.
- [ ] Confirmation applies per-hit damage and per-hit `prohibit-action-type` / manual-movement operations, records `activeEffects` for each hit, and commits one atomic `ActionResolved`.
- [ ] Undo checks per-hit damage, prohibition effects, and redirected-leg structure round-trip.

## T04: Utility abilities — heal, revive, maxHP, and movement caps

**Blocked by:** T01

**What it delivers:** Self and ally-targeted non-attack abilities apply their objective operations directly: heal, revive, maximum-HP change, movement caps, Powerful prohibition, ignore-physical-attack, and manual movement instructions. Lay on Hands offers a heal-or-revive choice.

### Acceptance criteria

- [ ] Vanish: self manual movement + `ignore-physical-attack` until the beginning of the Rogue's next turn; does not protect against non-physical Ability Attacks.
- [ ] Shapeshift: self `change-max-hp` to 4 and `heal` 1; while-condition expiry returns maxHP to 3 when HP drops below 3 or affected becomes Downed.
- [ ] Nature's Renewal, Inspiring Words, Second Wind: heal 1 on Active self/ally or self, capped at currentMaxHp.
- [ ] Lay on Hands: one Active self/ally heal 1 OR revive one legal Downed ally at 1 HP (team eliminated blocks revive).
- [ ] Revivify: revive one legal Downed ally at 1 HP unless that team is permanently eliminated.
- [ ] Rage: self `reduce-remaining-damage` 1 on the first qualifying positive damage, consumed on use.
- [ ] Frostbind, Battle Hymn, Blessing of Battle: `set-movement-cap` to 1 or 3 for each selected target until the end of each affected character's next turn (Battle Hymn covers selected living Drow allies).
- [ ] All operations respect HP bounds (never below 0, never above currentMaxHp), Downed derived from zero HP, and permanent Team Elimination.
- [ ] Each activation records spent state, warnings/overrides, applied effects with durations, movement/movement-instruction evidence, and commits atomically.

## T05: Automatic effect expiry — scheduled slots, turn boundaries, and Downed cleanup

**Blocked by:** T02, T03, T04

**What it delivers:** Temporary effects expire automatically inside the atomic event that triggers them. Finish Turn fires scheduled-slot and turn-boundary expiries — including for Downed skipped slots — and Downed cleanup removes the affected character's effects. Source Downed does not remove effects on other characters. Every expiry is recorded in that same Match Event so Undo restores the exact pre-event state.

### Acceptance criteria

- [ ] Hunter's Mark expires at the Ranger's next scheduled slot or is consumed on the first successful damaging attack against the marked enemy (whichever first); Hex the same at the Warlock's next scheduled slot and chained to a movement cap after its first trigger.
- [ ] Rage expires at the beginning of the Barbarian's next turn or on first positive-damage reduction (whichever first).
- [ ] Vanish expires at the beginning of the Rogue's next turn.
- [ ] Backstab/Stunning Strike prohibit-Powerful, Frostbind, Battle Hymn, and Blessing expire at the end of each affected character's next turn.
- [ ] `beginning-of-next-scheduled-slot` and `end-of-next-scheduled-slot` triggers fire for the processed slot(s) during `TurnFinished`, including when that slot's character is Downed and has no visible turn.
- [ ] `beginning-of-next-turn` and `end-of-next-turn` triggers fire only when the affected character's own turn boundary is processed.
- [ ] Downed cleanup runs after HP changes in `ActionResolved` and after expiries: every active effect whose `affectedCharacterId` is now Downed is removed; an already-expired effect is not kept.
- [ ] Downing the source never removes an applied effect whose affected character is different.
- [ ] Successful-damage consumption (`after-successful-damaging-attack`) fires only when final damage is at least 1.
- [ ] Every expiry and consumption is embedded in the causing Match Event (`expiredEffects` / consumptions) and survives replay; Undo reverses applied and expired effects together with spent state, HP/maxHP, and elimination.

## T06: Full acceptance-boundary browser verification

**Blocked by:** T05

**What it delivers:** Phone and tablet browser tests close the W13 acceptance boundary end to end: ability selection, targeted and physical attack flows, Reactions including redirection of an ability throw, heal/revive/maxHP/movement-cap flows, expiry on next turn and next scheduled slot including Downed-slot cases, Downed cleanup, whole-resolution Undo, atomic failure and offline restore, and read-only Ended Match after the new ability state.

### Acceptance criteria

- [ ] Every W13 ability path is exercised through the referee-visible interface on phone and tablet viewports, including at least one targeted, one physical, one heal/revive, one movement-cap, and one maxHP ability.
- [ ] Expiry-boundary flows show correct behavior: Hunter's Mark/Hex after the source's next scheduled slot (including a Downed source slot), Rage/Vanish at the next turn beginning, prohibition/movement-cap at the next turn end, and Shapeshift below-3-HP return.
- [ ] Downed cleanup after an ability activation shows removed effects for the newly Downed character and retained effects for others sharing the same source.
- [ ] Whole-resolution Undo reverses spent state, HP/maxHP, applied effects, and expiries together and can be repeated.
- [ ] Atomic failure and offline cold launch never expose a partial ability activation, expiry, or spent/maxHP change.
- [ ] High-contrast, large-target, responsive behavior holds on the new ability screens.

Parallel group: None (all tickets run sequentially in dependency order).
