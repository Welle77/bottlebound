---
slug: 20260902-063717-reaction-damage-mitigation
title: Reaction damage mitigation
branch: feature/reaction-damage-mitigation
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
  default: lightweight
  aliases:
    lightweight: [opencode/muse-spark-1.2-contributor-free, gpt-5.6-luna, copilot/gpt-5.6-luna]
    general: [gpt-5.6-terra]
    frontier: [gpt-5.6-sol, copilot/gpt-5.6-sol, opencode/muse-spark-1.2-contributor-free]
  phases:
    planning: frontier
---

## Problem Statement

The Referee Console treats every protective Reaction as complete damage and
effect prevention. This lets one ally-protection Reaction negate any stacked
damage total and makes additional Reactions against the same character useful
only as accidentally spent resources. The model also does not distinguish a
Damage Block from Attack Avoidance, although physical contact, attached
effects, and projectile redirection need different outcomes.

## Solution

Separate Damage Blocks from Attack Avoidance. Divine Shield and Shield Wall
each reduce one point of remaining damage without erasing the legal hit or its
attached effects. Misty Escape, Mirror Veil, and Deflecting Palm prevent the
attack's damage and attached effects from resolving against their owner.
Deflecting Palm still records the triggering physical contact and redirects
the same attack.

Calculate damage increases before Reactions. Permit only Damage Blocks that
can each reduce one point of damage. Keep avoidance exclusive with every other
protective Reaction against the same character. Enforce these rules in the
domain and show the same limits in the Action Draft. Update the authoritative
Ruleset, Match Configuration, event contract, persistence checks, replay
coverage, and generated Rules Reference together.

## User Stories

1. As a referee, I want Divine Shield to block one damage, so that one Reaction
   cannot negate an entire damage combo.
2. As a referee, I want Shield Wall to block one damage, so that its protection
   follows the same rule as Divine Shield.
3. As a referee, I want two different characters to block two incoming damage
   against one ally, so that combined defense can answer combined offense.
4. As a referee, I want the number of useful Damage Blocks to include Hunter's
   Mark and Hex, so that the Action Draft reflects the actual incoming damage.
5. As a referee, I want each bottle's damage calculated separately, so that a
   multi-bottle throw receives no shared or cross-target Reaction allowance.
6. As a referee, I want a Damage Block to preserve the legal hit and attached
   effects, so that blocking damage does not rewrite physical events.
7. As a referee, I want Misty Escape to avoid all damage and attached effects,
   so that its escape remains distinct from a shield.
8. As a referee, I want Mirror Veil to avoid all damage and attached effects,
   so that its illusion remains distinct from a shield.
9. As a referee, I want Deflecting Palm to avoid all damage and attached
   effects against the Monk, so that its redirection remains complete.
10. As a referee, I want Deflecting Palm to retain the physical contact that
    triggered it, so that the recorded Attack Leg matches the observed throw.
11. As a referee, I want avoidance to exclude other protective Reactions
    against the same character, so that the Match cannot spend redundant
    defenses.
12. As a referee, I want Rage to resolve after selected Reactions, so that I
    can choose whether extra useful Damage Blocks preserve Rage.
13. As a referee, I want Vanish to suppress Reaction choices for ignored
    physical attacks, so that an unaffected character cannot spend protection.
14. As a referee, I want redundant or conflicting Reaction input rejected even
    when it bypasses the UI, so that saved Match history stays canonical.
15. As a referee, I want the review preview to match the confirmed result, so
    that I can trust the displayed HP and effects before committing.
16. As a referee, I want restored and replayed Matches to preserve the new
    Reaction evidence, so that reload and undo remain trustworthy.
17. As a player, I want the Rules Reference and ability cards to describe the
    implemented behavior, so that play does not depend on hidden application
    rules.

## Acceptance Criteria

- Divine Shield and Shield Wall each reduce remaining damage by exactly one.
- A Damage Block does not remove the legal hit or attached effects, including
  the non-damage effects of physical Ability Attacks.
- Damage Block capacity is calculated independently for each affected
  character from base damage plus every applicable increase, before Damage
  Blocks and Rage resolve.
- Hunter's Mark and Hex can raise one character's useful Damage Block capacity
  to two or three. Finalized zero damage does not consume either pending
  effect under its existing trigger rule.
- Rage resolves after Damage Blocks. Every selected Damage Block must reduce
  one point, even when that choice preserves Rage.
- Current HP and overkill do not reduce Damage Block capacity.
- Misty Escape, Mirror Veil, and Deflecting Palm prevent all damage and
  attached effects against their owner regardless of the calculated damage.
- Deflecting Palm records its triggering contact, redirects the same physical
  attack, and preserves the attack's source, range, and attached effects for
  later legal contacts.
- Vanish prevents a physically ignored character from receiving a protective
  Reaction selection for that attack.
- One character still uses at most one Reaction against one attack.
- Attack Avoidance and any other protective Reaction against the same
  character are mutually exclusive and cannot use an Override.
- A Damage Block beyond the calculated useful capacity is rejected and cannot
  use an Override.
- The Action Draft disables conflicting and redundant choices. The referee
  must deselect the current choice before selecting a conflicting type.
- Review previews and confirmed Action Resolutions show the same damage,
  effects, spent Reactions, and expired or retained effects.
- The current event schema records whether each Reaction reduced one damage or
  avoided the attack. Replay, undo, canonical validation, and Match Store
  restore preserve that evidence.
- The Match Configuration version changes. Saved Matches with the prior
  version may use the existing incompatibility path without a migration.
- The universal rules, five Reaction cards, relevant damage and effect cards,
  referee quick reference, executable Match Configuration, and generated
  Rules Reference use consistent terms and behavior.

## Implementation Decisions

- Add separate executable Reaction operations for a one-point Damage Block
  and complete Attack Avoidance. Do not keep the current operation name for
  both meanings.
- Resolve one character through one shared attack-damage pipeline used by
  Basic Attacks, Ability Attacks, Action Draft availability, and review
  previews.
- Calculate Hunter's Mark and Hex before Reactions. Apply selected Damage
  Blocks next, then Rage, then finalize damage and damage-triggered effect
  consumption.
- Treat each selected Damage Block as useful when it reduces the pre-Rage
  remaining damage by one. A second block against two damage is therefore
  valid even when Rage could otherwise remove the last point.
- Calculate the limit from incoming damage, not current HP. Preventing overkill
  remains a legal use of Damage Blocks.
- Preserve attached effects after a Damage Block, including when final damage
  becomes zero. Effects that explicitly require finalized damage still follow
  their own trigger conditions.
- Treat Attack Avoidance as complete prevention against one character after
  its trigger. A physical contact can remain recorded even though resolution
  against that character is avoided.
- Keep Deflecting Palm's redirect as a second operation beside Attack
  Avoidance. Later Attack Legs retain the original attack context.
- Make redundant capacity and avoidance conflicts absolute validation errors.
  Existing referee Overrides remain limited to state-invalid Reaction
  conditions.
- Disable conflicts in the Action Draft rather than silently replacing a
  selected Reaction. The referee explicitly deselects before switching.
- Change the current event and storage schema without a migration, consistent
  with the repository's single-schema persistence decision.
- Bump the Match Configuration version and update all current-version contract
  assertions and fixtures.
- Keep `bottlebound_rules_final.md` authoritative. The build continues to
  embed that Markdown into the generated Rules Reference; no generated file is
  committed.

## Testing Decisions

- Test combat behavior through the public `resolveBasicAttack()` and
  `resolveAbility()` commands.
- Cover one-damage Basic Attacks, multi-bottle physical attacks, targeted
  Ability Attacks, physical Ability Attacks, Hunter's Mark, Hex, their stacked
  three-damage case, Rage, Vanish, and overkill.
- Check that Backstab, Stunning Strike, and Brutal Shove attached effects
  survive Damage Blocks, while all attached effects stop after Attack
  Avoidance.
- Check Misty Escape movement and Deflecting Palm Attack Legs with full
  avoidance totals of one, two, and three damage.
- Test Reaction availability and preview parity through the application
  interface and the Action Draft browser flow.
- Test malformed, redundant, conflicting, and stale input through public
  commands rather than private validators.
- Test the changed canonical event through Match Store restore, replay, undo,
  schema validation, and contract fixtures.
- Test the built Rules Reference through its existing contract seam and inspect
  all duplicated Ruleset card and quick-reference text for consistency.
- Use integration-style tests and known expected outcomes. Do not test private
  helpers or reproduce the damage algorithm inside assertions.

## Out of Scope

- Changing base character HP, attack range, movement, initiative, or action
  economy.
- Adding new abilities, Reactions, damage-over-time effects, or a universal
  damage cap.
- Tracking bottle coordinates or automating physical legality judgments.
- Migrating saved Matches from the prior Match Configuration version.
- Changing how a Reaction's range, Line of Sight, owner state, or once-per-Match
  availability receives a referee Override.
- Committing a generated Rules Reference artifact.

## Further Notes

The Ruleset term `hit` remains physical and observable: legal ball contact is
still a hit. Damage Block and Attack Avoidance describe later resolution
stages. This distinction prevents defensive rules from rewriting the physical
throw while preserving complete escape and redirection abilities.
