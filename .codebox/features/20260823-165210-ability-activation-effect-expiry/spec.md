---
slug: 20260823-165210-ability-activation-effect-expiry
title: Ability activation and effect expiry
branch: feature/ability-activation-effect-expiry
target_branch: main
current_phase: done
phases:
  planning: done
  code: done
  test: done
  review: done
  ship: skipped
  review: pending
  ship: pending
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

# Ability activation and effect expiry

Planning context: Wayfinder map `referee-console`, resolutions W01, W03, W04, W05, W11, W12, W13, and the fixed rules data contract (`.codebox/wayfinders/referee-console/assets/fixed-rules-data-contract.md`).

## Problem Statement

The Referee Console resolves Basic Attacks, Reactions, HP, Downed state, and Team Elimination but leaves all Standard and Powerful abilities outside the application. The referee must track spent abilities, temporary effects, healing, revival, movement caps, Powerful-action prohibition, maximum-HP changes, and expiry separately. Without automation the digital Match State diverges from physical play as soon as an ability is used.

## Solution

Automate the complete closed ability roster through the existing Action Draft and universal resolution sequence. Targeted Ability Attacks reuse the Basic Attack guided flow without ball physics. Physical ability attacks run the throw-resolution flow and attach their effect to every legal bottle hit. Self, ally, and enemy utility abilities resolve through a direct target-selection draft. Each legally activated ability becomes Spent permanently, survives Revival, and raises the overridable `ability-already-spent` warning. Temporary effects expire automatically during atomic event resolution — scheduled-slot triggers on initiative advance and Downed cleanup that removes the affected character's effects — and every expiry is recorded inside that same Match Event. Confirmed Undo reverses one whole ability activation — spent state, HP changes, applied effects, and expiries — as one atomic reversal.

## User Stories

1. As a referee, I want to select a Standard or Powerful ability for the active character, so that the console tracks the same action economy as the rules.
2. As a referee, I want an ability to be available only from its owner, so that I cannot activate the wrong character's ability by mistake.
3. As a referee, I want the console to show `ability-already-spent` when an ability is already Spent, so that I know the state before I override.
4. As a referee, I want a Spent ability to stay Spent for the rest of the Match even after Revival, so that one-use remains permanent.
5. As a referee, I want an invalid ability declaration to leave the ability unspent, so that a mistaken tap does not consume state.
6. As a referee, I want to use Arcane Bolt, Deadeye, and Eldritch Blast through the guided flow, so that targeted Ability Attacks use the same confirmation path as Basic Attacks.
7. As a referee, I want targeted Ability Attacks to require an Active enemy target, so that Downed targets are rejected unless the ability explicitly allows them.
8. As a referee, I want targeted Ability Attacks to create one Action Draft with a Reaction window, so that legal Reactions protect before final damage.
9. As a referee, I want to record Backstab, Stunning Strike, and Brutal Shove as physical throws, so that accidental ally or self hits apply their effects.
10. As a referee, I want each legal hit of a physical ability attack to take its 1 damage and its card-specific prohibition or forced movement, so that the ball carries the effect.
11. As a referee, I want to record ordered bottle contacts and have duplicates rejected, so that one physical ability attack cannot hit one bottle twice.
12. As a referee, I want to activate self abilities such as Vanish, Shapeshift, Second Wind, and Rage on the active character without a target list, so that the draft stays minimal.
13. As a referee, I want to heal with Nature's Renewal and Inspiring Words on an Active self or ally, so that I can restore 1 HP within maximum-HP bounds.
14. As a referee, I want Lay on Hands to offer heal-or-revive, so that I can handle a Downed ally at 1 HP.
15. As a referee, I want to revive with Revivify on a Downed ally at 1 HP unless that team is already eliminated, so that the contract's team-eliminated guard applies.
16. As a referee, I want Frostbind to cap the target's next turn movement to 1, so that the console enforces the card's limit on that turn.
17. As a referee, I want Battle Hymn and Blessing of Battle to cap selected allies' next turn movement to 3, so that the chosen targets carry the buff.
18. As a referee, I want Brutal Shove to show forced-movement instructions before the Downed check, so that the card's specific sequence is explainable.
19. As a referee, I want Misty Escape and Deflecting Palm movement instructions shown but not tracked as positions, so that I handle bottle placement physically.
20. As a referee, I want Shapeshift to set maximum HP to 4 and heal 1, then return maximum HP to 3 when the affected character drops below 3 HP or becomes Downed, so that the while-condition expiry matches the card.
21. As a referee, I want Vanish to ignore physical-ball damage and effects until the Rogue's next turn begins, so that the duration matches the card.
22. As a referee, I want to see Hunter's Mark, Hex, and Rage attach to their target or self, add or reduce 1 damage on the first qualifying attack, and then expire or be consumed, so that the one-shot modifier is visible.
23. As a referee, I want Hex to also cap movement to 1 on its first triggering attack, so that its chained effect is recorded.
24. As a referee, I want scheduled-slot expiries (Hunter's Mark, Hex) to fire when the source's next scheduled slot is processed — even if that source is Downed and skipped — so that the trigger matches W03.
25. As a referee, I want beginning-of-next-turn expiries (Rage, Vanish) to fire on the affected character's next turn entry, so that the boundary is exact.
26. As a referee, I want end-of-next-turn expiries (Backstab and Stunning Strike prohibition, Frostbind, Battle Hymn, Blessing) to clear after the affected character's next turn finishes, so that the debuff does not leak.
27. As a referee, I want any Downed character to lose all its temporary effects immediately, so that Downed cleanup matches the universal rule.
28. As a referee, I want a Downed source to leave already-applied effects on other characters intact, so that source loss does not incorrectly remove buffs or debuffs.
29. As a referee, I want every expiry to be recorded inside the atomic Match Event that caused it, so that Undo can reverse the exact pre-event state.
30. As a referee, I want confirmed Undo to reverse one whole ability activation — spent state, HP changes, applied effects, and expiries — as one atomic reversal, so that corrections remain explainable.
31. As a referee, I want the complete ability activation available offline, persisted transactionally, restored after restart, and usable on phone and tablet like the prior console flows.

## Implementation Decisions

- Keep the current framework-free TypeScript PWA, native DOM interface, service-worker shell, and transactional IndexedDB store. Keep the single `RULES_VERSION` (`BB20260822A1`) authority and do not change gameplay rules.
- Extend the immutable Ruleset to expose structured Ability records for all abilities in the contract's coverage table (24 abilities) plus their closed vocabularies: `actionType` (standard | powerful | reaction), `attackType`, `interaction`, `targetPolicy` (relation, cardinality, lifeState), `range`, `lineOfSight`, `ballRequired`, `reactionTrigger`, `manualChecks`, `operations`, `rulesText`, and `sourceAnchor`. Keep the five existing structured Reactions; do not restructure them.
- Define the objective operation vocabulary exactly as in W03: `deal-damage`, `add-damage`, `prevent-damage-and-effects`, `reduce-remaining-damage`, `heal`, `revive`, `change-max-hp`, `apply-effect`, `consume-effect`, `set-movement-cap`, `prohibit-action-type`, `ignore-physical-attack`, `redirect-physical-attack`, `manual-movement-instruction`. Map per-ability coverage: Backstab (deal 1 + prohibit Powerful), Vanish (manual movement + ignore physical), Shapeshift (change-max-hp to 4 + heal 1, while-condition below 3 HP or Downed), Nature's Renewal / Inspiring Words / Second Wind (heal 1), Lay on Hands (heal 1 or revive), Revivify (revive), Frostbind / Battle Hymn / Blessing of Battle / Hex-movement (set-movement-cap), Stunning Strike (deal 1 + prohibit Powerful), Brutal Shove (deal 1 + manual movement before Downed), Rage (reduce-remaining-damage 1), Hunter's Mark / Hex (add-damage 1 + consume-effect + apply-effect), Arcane Bolt / Deadeye / Eldritch Blast (deal 1), Divine Shield / Shield Wall / Mirror Veil / Misty Escape / Deflecting Palm remain as Reaction prevention operations.
- Define the trigger vocabulary exactly as in W03: `on-activation`, `attack-would-affect`, `physical-ball-hits`, `before-damage-finalized`, `after-successful-damaging-attack`, `hp-below-threshold`, `character-downed`, `beginning-of-next-turn`, `end-of-next-turn`, `beginning-of-next-scheduled-slot`, `end-of-next-scheduled-slot`. Define durations as `immediate | until-boundary | until-trigger | until-trigger-or-boundary | while-condition` with explicit boundary trigger, anchor (source | affected), condition, and `removeWhenAffectedDowned`.
- Persist per-character Match State extensions: `spentAbilityIds` (permanent, survives Revival, distinct from `spentReactionIds`), `currentMaxHp` (per-character, defaults to baseMaxHp, mutated only by `change-max-hp`), `activeEffects` (typed effects with `effectId`, `abilityId`, `kind`, `anchorCharacterId`, `affectedCharacterId`, `duration`, `operations`, `appliedSequence`). Do not store battlefield positions, distances, or calculated hit geometry.
- An ability becomes Spent at legal activation confirmation, not at draft open or preview. An invalid declaration (structural failure, unknown target, missing confirmation) never spends the ability. Spending is permanent and survives Revival; it is not removed by effect expiry or Downed cleanup.
- Warnings use the closed contract: `ability-already-spent` (overridable), plus `wrong-active-character`, `invalid-target-relation`, `invalid-target-life-state`, `eliminated-team`, `reaction-trigger-unconfirmed`, `powerful-action-movement-reminder`, manual range/line-of-sight/hit checks. Each accepted override warning is recorded in the Match Event. Structural invariants (unknown identifiers, duplicate hits, HP bounds, duplicate active slots, operation shape, event sequence, rules-version compatibility) remain non-overridable.
- Model the Action Draft for abilities: `abilityId`, `sourceCharacterId`, `attackType`, `interaction`, `targetPolicy`, ordered `AttackLeg`s for physical interactions, `affectedCharacterIds` / `targetCharacterIds`, `physicalConfirmations` where ballRequired, eligible Reaction choices with warnings, selected Reactions, and manual movement confirmations. Keep draft state in page memory only, as with Basic Attack. A Powerful ability draft inherits the existing Major Action guard (0 normal movement; already consumed through `majorActionUsed`); a Standard ability respects the same one-Major-Action per turn rule as Basic Attack.
- Targeted Ability Attacks (Arcane Bolt, Deadeye, Eldritch Blast) reuse the Basic Attack guided flow: Active character check, single target selection per `targetPolicy`, Reaction window (defensive Reactions can protect that target), universal resolution sequence (damage increases, Reaction prevention/reduction, final damage, HP, Downed, elimination), effect application (`deal-damage`, `add-damage` from prior marks), one atomic `ActionResolved` Match Event. No physical hit selection, no ball physics, no Attack Legs beyond a single logical leg.
- Physical ability attacks (Backstab, Stunning Strike, Brutal Shove) run the existing throw-resolution flow: manual confirmations (range, Line of Sight, legal-bottle-contact, terrain-contact), ordered Attack Legs, at most once per affected character including allies and self, each legal hit takes the attack's deal-damage and card-specific effect (Backstab/Stunning Strike prohibit Powerful, Brutal Shove manual movement before Downed). Later redirection from a Reaction continues the same ability attack as a second Attack Leg, identical to Basic Attack Deflecting Palm handling.
- Non-attack activations apply their operations directly at confirmation: `heal` (cap at currentMaxHp), `revive` (legal Downed character to 1 HP, blocked when that team is permanently eliminated), `change-max-hp` (Shapeshift to 4, restore to 3 on expiry), `set-movement-cap` (1 or 3), `prohibit-action-type` (Powerful), `ignore-physical-attack` (Vanish), plus manual-movement instructions. Apply Downed cleanup after HP changes: every temporary effect whose `affectedCharacterId` is now Downed is removed.
- Effect expiry runs automatically inside atomic event resolution and is recorded as expiries within that same Match Event. Two expiry paths: (a) Turn-driven: `Finish Turn` processes `beginning-of-next-turn`, `end-of-next-turn`, `beginning-of-next-scheduled-slot`, and `end-of-next-scheduled-slot` boundaries for the processed slot(s) — including Downed slots that have no visible turn — and removes or consumes matching active effects. Spirit slot processing during `Finish Turn` skipping must still fire `*scheduled-slot` triggers. (b) Conditional/triggered: after-successful-damaging-attack consumes the triggering Hunter's Mark/Hex, Eldritch Blast add-damage consumption, Rage reduction consumption, Shapeshift while-condition check on HP change, and immediate Downed cleanup. Never expire an effect by wall-clock time.
- The `MatchEnded` Decision Basis path does not add dummy expiry. If a Match ends with active temporary effects, they remain on the Ended snapshot and are not replayed.
- Generalize `ActionResolved` to carry abilities: `actionType: "Basic Attack" | "Ability"`, `abilityId` when ability, `targetCharacterIds` when targeted, `spentAbilityIds` delta, `appliedEffects`, `expiredEffects`, `consumptions`, plus existing `attackLegs`, `reactions`, `effects`, `majorActionOverride`, `eliminatedTeams`. Keep legacy `ActionResolved` events with `actionType: "Basic Attack"` replayable; assert version compatibility during restore.
- Bump `MATCH_SCHEMA_VERSION` only if the new Match State shape requires it, following the existing migration pattern (`MatchMigrated` event, deterministic migration before interface reports restore, failed migration preserves prior records, unavailable-version Matches restore read-only).
- Maintain atomicity: each ability activation, each `Finish Turn` with expiries, each `End Game`, `Reopen`, and `Undo` commits one Match Event plus resulting snapshot plus `lastEventSequence` and summary (when applicable) in one IndexedDB `readwrite` transaction. Change visible Match State only after `complete`. A failed transaction leaves the last committed Match unchanged.
- Keep the existing offline guarantee: one atomic write per referee-confirmed change, restore of the exact Setup/Active/Ended Match after browser/device restart, validated schema/rulesVersion, replay only when needed. Keep large touch targets (48 px), high contrast, responsive phone and tablet layouts, and no decorative animation (Coin Flip remains the only digital flip).

## Testing Decisions

Good tests verify external behavior through agreed public seams with expected values from independent sources — the authored card text and the fixed contract table — never implementation details.

Three seams, highest first:

1. Domain commands: pure functions returning state-plus-event results. They carry Spent permanence, target-policy enforcement, per-hit damage and prohibition, heal/revive/maxHP/movement-cap logic, conditional effect consumption, universal resolution order, expiry boundaries, Downed cleanup, and structural checks.
2. Match store: transactional persistence across ability activation, Finish Turn expiry, End Game/Reopen/Undo, and summary-like invariants, including failed-transaction and restart-recovery cases.
3. Browser tests: the referee-visible flows — draft open, target or hit selection, Reaction window, confirmation, expiry on next turn/slot, Downed cleanup, Undo, and read-only Ended view — on phone and tablet viewports.

Prior art: the domain command tests, match-store persistence tests, and browser tests added by the Basic Attack and End Game features.

## Acceptance criteria

Refined from the W13 acceptance boundary and the fixed contract:

- The bundled Ruleset exposes immutable structured Ability records for the full roster (24 abilities) and the existing structured Basic Attacks and Reactions. Contract checks fail when structured ability data drifts from `bottlebound_rules_final.md` roster and card fields.
- From an Active Match with no open Action Draft, the referee can open an ability draft for any unspent ability owned by the active character. A spent ability shows `ability-already-spent` and remains activatable only through a recorded override; an invalid declaration never spends the ability.
- A Spent ability remains Spent after Revival and after its temporary effects expire; only new Match creation resets it.
- Targeted Ability Attacks (Arcane Bolt, Deadeye, Eldritch Blast) reuse the guided flow with one target selection, the same Reaction window and universal damage/finalize sequence, and no ball physics.
- Physical ability attacks (Backstab, Stunning Strike, Brutal Shove) require ordered physical hit selection, manual range/Line-of-Sight/hit/terrain confirmations, reject duplicate hits including across Attack Legs, allow ally and self hits within range and Line of Sight, and apply per-hit damage plus card-specific prohibition or forced movement.
- Brutal Shove forced movement is shown before the Downed check, consistent with the contract's out-of-sequence position.
- Self and targeted utility abilities apply their objective operations on confirmation: Vanish ignores physical attacks until the next turn begins; Shapeshift changes maximum HP and heals 1; Nature's Renewal / Inspiring Words / Second Wind heal 1 within current maximum HP; Lay on Hands heals or revives; Revivify revives at 1 HP unless that team is eliminated; Frostbind / Battle Hymn / Blessing set movement caps; Backstab / Stunning Strike prohibit Powerful.
- Hunter's Mark and Hex add 1 damage to the first successful damaging attack against the marked character, then consume and set the post-hit effect (Hex movement cap 1). Rage reduces the first qualifying positive damage by 1 and consumes on use or expires at the Barbarian's next turn entry. Successful-damage triggers fire only when final damage is at least 1.
- Shapeshift expiry fires when HP drops below 3 or the affected character becomes Downed; expiry returns maximum HP to 3 without changing current HP except through normal damage rules. Vanish expiry fires at the beginning of the Rogue's next turn. Hunter's Mark and Hex expire at the Ranger/Warlock's next scheduled slot even while Downed. Prohibition and movement-cap effects expire at the end of the affected character's next turn. All expiries are recorded inside the atomic event that fired them.
- Downed cleanup removes every temporary effect whose affected character is now Downed; Downing the source never removes an already-applied effect on another character.
- A redirection Reaction (Deflecting Palm) continues the same physical ability attack with one redirected Attack Leg under the original range and source.
- One ability activation saves exactly one atomic `ActionResolved` Match Event carrying hits/targets, Reactions, warnings/overrides, final damage, HP and Downed changes, spent abilities, applied effects, and expiries.
- Finish Turn advances the fixed initiative order, skips Downed characters while preserving slot order and round rules, fires all due scheduled-slot and turn-boundary expiries including for skipped slots, and resets Major Action state for the next Active character. Undo restores the exact prior turn and expiry state.
- Restore after a failed transaction or browser restart never exposes a partial ability activation, expiry, spent-ability, maximum-HP, or Downed change. Migration from prior schemas preserves existing Matches; an unavailable-version Match restores read-only without substituting the bundled Ruleset.
- The complete ability workflow works after an offline cold launch on representative Chrome phone and tablet viewports. Main controls retain strong contrast, visible keyboard focus, 48-pixel targets, and no decorative animation.

## Out of Scope

Per W13 and the Wayfinder: a Match clock or Final Round mode; a digital battlefield map; automated judgments about hits, range, Line of Sight, movement, cover, timing, or safety; player accounts or devices; online synchronization; custom teams, characters, or rules; long-term player statistics; changes to authoritative gameplay rules. Standard and Powerful ability automation is the in-scope addition — Basic Attack, Reactions, Downed, elimination, and manual End Game remain as implemented.

## Further Notes

All temporary buffs and debuffs end when the affected character becomes Downed. The character that created the effect becoming Downed does not remove an already-applied effect unless the card says so. If a temporary effect is written to expire on the source's next turn, it expires at the end of that source's next scheduled initiative position even if the source is Downed and therefore skipped.
