---
slug: 20260902-123003-ability-system-rebalance
title: Ability system rebalance
branch: main
target_branch: main
current_phase: code
phases:
  planning: done
  code: done
  test: running
  review: pending
  ship: pending
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
    frontier: [gpt-5.6-sol, copilot/gpt-5.6-sol, opencode/muse-spark-1.2-contributor-free]
  phases:
    planning: frontier
---

# Ability system rebalance

## Problem Statement

The Ruleset labels abilities as Standard or Powerful, but both types currently
cost one action. The labels therefore do not tell players how the action
economy works. Vanish also grants exceptional movement and physical immunity
while leaving another action available. Battle Hymn and Blessing of Battle
provide short movement bonuses that do not match their intended strategic,
formation-based use.

The Duergar Fighter and Barbarian have less valuable ability combinations than
the other Duergar characters. Their current Second Wind and Rage abilities do
not provide a signature full-turn decision that can balance the Drow's Vanish
and Battle Hymn.

## Solution

Keep the Standard and Powerful labels and give each label one clear action
cost. A Standard Ability costs one action. A Powerful Ability costs both
actions. A Reaction costs no actions. Give each team exactly two Powerful
Abilities.

Make Vanish and Battle Hymn the Drow Powerful Abilities. Replace Second Wind
with Hold the Line and replace Rage with Rampage. Make those two new abilities
the Duergar Powerful Abilities. Reclassify Arcane Bolt, Deadeye, Eldritch
Blast, and Revivify as Standard Abilities.

Make Battle Hymn and Blessing of Battle grant persistent movement bonuses to
the characters that receive them at activation. Each bonus ends when its
recipient becomes Downed and does not return after Revival. Keep Vanish's
movement formula, but make Vanish consume both actions. Make Hold the Line a
fixed-recipient defensive formation effect. Make Rampage combine enhanced
movement with the Barbarian's physical control identity.

## User Stories

1. As a player, I want Standard and Powerful to state an action cost, so that I
   can understand the difference before I choose an ability.
2. As a referee, I want a Standard Ability to consume one action, so that the
   Active Character can use a second valid action.
3. As a referee, I want a Powerful Ability to consume both actions, so that the
   Active Character cannot use another action on that turn.
4. As a referee, I want a Powerful Ability to be unavailable after one action
   is spent, so that action order cannot bypass its cost.
5. As a referee, I want Reactions to stay outside the action economy, so that
   this change does not alter their trigger timing.
6. As a player, I want each team to have two Powerful Abilities, so that the
   action-cost system is faction-balanced.
7. As a Rogue player, I want Vanish to retain its current movement formula and
   immunity, so that it remains distinctive after its action-cost nerf.
8. As a Rogue player, I want Battle Hymn to increase Vanish movement, so that
   the two Drow abilities keep their planned combination.
9. As a Bard player, I want Battle Hymn to reward allies who gather within its
   range at activation, so that timing and formation matter.
10. As a Bard player, I want Battle Hymn recipients to keep their movement
    bonus until they become Downed, so that the successful formation has
    lasting value.
11. As a Cleric player, I want Blessing of Battle to grant one ally the same
    persistent movement increase, so that Duergar receive a reliable focused
    alternative.
12. As a referee, I want later movement restrictions to use the more
    restrictive allowance, so that Frostbind and triggered Hex still limit
    enhanced characters to one pace.
13. As a Fighter player, I want Hold the Line to protect a fixed nearby
    formation, so that positioning matters when I use the ability.
14. As a Fighter player, I want each recipient to reduce the first attack's
    damage against them, so that Hold the Line can protect several allies
    without erasing attached effects.
15. As a Barbarian player, I want Rampage to combine movement and a physical
    shove, so that the Barbarian gains an aggressive full-turn choice.
16. As a Barbarian player, I want movement bonuses and restrictions to affect
    Rampage, so that the shared movement rules remain consistent.
17. As a Rogue or Monk player, I want Backstab and Stunning Strike to continue
    prohibiting Powerful Abilities, so that their control effect keeps a clear
    purpose.
18. As a referee, I want Downing to remove every movement or protection
    effect, so that Revival never restores previous effects.
19. As a referee, I want the Active Character controls to show unavailable
    actions correctly, so that I cannot accidentally record an illegal turn.
20. As a player, I want the application, Ruleset, quick reference, and
    character sheets to use the same classifications and ability text.

## Acceptance Criteria

- Every non-Reaction ability is classified as Standard or Powerful. Every
  Standard Ability costs one action, and every Powerful Ability costs both
  actions.
- A Powerful Ability is legal only when the Active Character has spent no
  actions. Its Action Resolution records both actions as spent.
- Reactions keep their current triggers and consume no actions.
- Vanish and Battle Hymn are the only Drow Powerful Abilities.
- Hold the Line and Rampage are the only Duergar Powerful Abilities.
- Arcane Bolt, Deadeye, Eldritch Blast, and Revivify are Standard Abilities.
- Backstab and Stunning Strike prohibit Powerful Abilities on each affected
  character's next turn.
- Vanish moves the Rogue up to twice its current Move allowance plus 2 paces.
  It retains its physical immunity until the beginning of the Rogue's next
  turn.
- Battle Hymn gives every living Drow ally within 4 paces at activation,
  including the Bard, +1 Move. The recipients are fixed at activation.
- Blessing of Battle gives one living Duergar ally within 4 paces +1 Move.
- Battle Hymn and Blessing of Battle last for the rest of the Match for each
  recipient unless that recipient becomes Downed.
- Downing removes these movement effects. Revival does not restore them.
- Frostbind and a triggered Hex limit an affected character's current Move to
  one pace even when Battle Hymn or Blessing of Battle also applies.
- Hold the Line affects the Fighter and every living Duergar ally within 2
  paces at activation. Recipients are fixed at activation.
- Until the beginning of the Fighter's next turn, each Hold the Line recipient
  reduces the first attack's remaining damage against them by 1. Legal hits
  and attached effects still resolve.
- Hold the Line ends for an individual recipient when that character becomes
  Downed. It does not return after Revival.
- Rampage moves the Barbarian up to twice its current Move allowance, then
  makes one physical melee throw from the new position.
- Each legal Rampage hit deals 1 damage and pushes that bottle up to 2 paces
  directly away from the Barbarian under the existing Brutal Shove movement
  rules. A Rampage with no legal bottle hit remains valid and spent.
- The referee Override path remains available for observed action-economy
  exceptions and records its reason under the existing contract.
- The Match Configuration version changes. Saved Matches from the prior
  version may use the existing incompatibility path without migration.
- The authoritative Ruleset, referee quick reference, executable Match
  Configuration, generated Rules Reference, application labels, and character
  DOCX use consistent ability classifications, costs, durations, and effects.
- The changed DOCX renders without clipped, overlapping, or malformed content.

## Implementation Decisions

- Keep Standard Ability, Powerful Ability, and Reaction as canonical Ruleset
  terms. Do not add role labels.
- Derive action cost from the ability classification. Do not create a separate
  player-facing power tier or action-slot vocabulary.
- Keep the existing two-action turn model. A Powerful Ability atomically uses
  both actions through one Action Resolution.
- Keep every ability's current once-per-Match use limit.
- Keep existing referee Override behavior for illegal observed actions. Do not
  add a new Override type for Powerful Abilities.
- Snapshot Battle Hymn and Hold the Line recipients at activation. Characters
  who enter range later do not receive the effect.
- Model the Battle Hymn and Blessing of Battle bonuses as persistent effects
  that have no turn boundary expiry. The standard Downed cleanup removes them.
- Resolve the current Move allowance from persistent bonuses and temporary
  restrictions. The most restrictive one-pace limit wins.
- Calculate Vanish as `current Move × 2 + 2` and Rampage movement as
  `current Move × 2`.
- Apply Hold the Line as a one-point Damage Block against the first damaging
  attack for each recipient. Keep the hit and attached effects.
- Reuse the existing physical attack and forced-movement rules for Rampage.
  Measure its melee range and Line of Sight from the Barbarian's position after
  the ability-granted movement.
- Replace Second Wind and Rage rather than add third abilities. Each character
  still has two abilities.
- Change the current Match Configuration and persisted schema without a
  migration, consistent with the repository's single-schema decision.
- Keep the Ruleset authoritative and update the duplicated executable and
  character-sheet text explicitly.

## Testing Decisions

- Test action costs through public Match commands and restored Match history.
- Check a Powerful Ability from zero actions, after one action, after two
  actions, and through the existing referee Override path.
- Check Standard Ability combinations and confirm that reclassified abilities
  still permit a second action.
- Test Vanish movement with base Move, Battle Hymn, and a one-pace movement
  restriction.
- Test Battle Hymn and Blessing of Battle through activation, multiple turns,
  Downing, Revival, replay, Undo, and Match Store restore.
- Test Hold the Line against separate attacks on separate recipients, stacked
  damage, attached effects, Downing, expiry, replay, Undo, and restore.
- Test Rampage through its complete movement, physical throw, Reaction,
  damage, forced movement, empty-contact, replay, Undo, and restore paths.
- Test classification labels and disabled action controls through existing
  phone and tablet browser flows.
- Test Match Configuration and generated Rules Reference text through their
  existing contract seams.
- Render both pages of the character DOCX and inspect every changed card.
- Run the canonical repository gate after focused checks pass.

## Out of Scope

- Changing base HP, initiative, Basic Attack range, or normal Move values.
- Adding role labels or an action-slot term.
- Adding a third ability to any character.
- Changing the once-per-Match ability limit.
- Changing Reaction triggers or making a Reaction consume actions.
- Changing Hunter's Mark, Hex, Shapeshift, healing values, or revival values.
- Migrating saved Matches from the previous Match Configuration version.
- Tracking physical coordinates or automating range, Line of Sight, path, or
  bottle-contact judgments.

## Further Notes

This feature makes Powerful a concrete cost classification. It does not claim
that every Powerful Ability has the same effect magnitude. The two-action cost
and each card's written effect define its value.
