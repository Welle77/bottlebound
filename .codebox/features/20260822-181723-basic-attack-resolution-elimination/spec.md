---
slug: 20260822-181723-basic-attack-resolution-elimination
title: Basic Attack resolution and elimination
branch: feature/offline-initiative-turn-tracking
target_branch: main
current_phase: done
phases:
  planning: done
  code: done
  test: done
  review: done
  ship: done
gate_policy:
  planning: gate
  code: auto
  test: auto
  review: auto
  ship: gate
model_routing:
  default: frontier
  aliases:
    lightweight: [gpt-5.6-luna, claude-haiku-4.5]
    general: [gpt-5.6-terra, claude-sonnet-5]
    frontier: [gpt-5.6-sol, claude-opus-4.8, Ox Alpha Free]
  phases:
    planning: frontier
---

# Basic Attack resolution and elimination

## Problem Statement

The Referee Console tracks initiative but leaves all combat state outside the
application. The referee must track HP, Downed characters, used Reactions, and
team outcomes separately during an outdoor Match.

A Basic Attack can hit several bottles, trigger several Reactions, redirect
the same physical attack, and Down either team. A partial or unsaved result can
make the digital Match State disagree with physical play.

## Solution

Add a guided Action Draft for the active character's Basic Attack. The referee
records ordered physical hits and selects each legal Reaction. The Referee
Console calculates objective damage and shows the complete result before final
confirmation.

One confirmation saves the complete Action Resolution atomically. It includes
HP, spent Reactions, Major Action state, Downed state, Team Elimination, and
every recorded warning or override.

The feature also completes the elimination path. The referee can confirm End
Game, Undo, or Continue after one team becomes eliminated. An Ended Match can
be reopened or removed.

## User Stories

1. As a referee, I want Basic Attack beside Finish Turn, so that combat uses the active-turn workflow.
2. As a referee, I want the active character's fixed attack profile visible, so that I can check range quickly.
3. As a referee, I want an Action Draft to remain temporary, so that an unfinished attack cannot change Match State.
4. As a referee, I want to record legal bottle contacts in order, so that the event matches the physical attack.
5. As a referee, I want to include allies and the attacker, so that accidental legal hits remain accurate.
6. As a referee, I want duplicate contacts rejected, so that one attack cannot damage one bottle twice.
7. As a referee, I want prompts for physical checks, so that the console does not make battlefield judgments.
8. As a referee, I want state-eligible Reactions shown after hits, so that I can record legal responses quickly.
9. As a referee, I want spent Reactions hidden from the normal choices, so that availability matches the Match.
10. As a referee, I want an override path for rule warnings, so that I retain final judgment.
11. As a referee, I want one Reaction per reacting character, so that one attack follows the universal limit.
12. As a referee, I want several characters to react, so that ally protection works as written.
13. As a referee, I want prevention calculated per affected character, so that other legal hits still take damage.
14. As a referee, I want movement instructions shown but not tracked, so that I can update physical bottle positions.
15. As a referee, I want Deflecting Palm to continue the same attack, so that later redirected hits remain accurate.
16. As a referee, I want the redirected contacts recorded as another Attack Leg, so that their order stays explainable.
17. As a referee, I want final damage shown before confirmation, so that I can catch a selection mistake.
18. As a referee, I want HP bounded between zero and maximum HP, so that combat cannot corrupt character state.
19. As a referee, I want zero HP to mean Downed, so that all Match views use one state rule.
20. As a referee, I want a confirmed Basic Attack to use the Major Action, so that the turn state stays accurate.
21. As a referee, I want a second Basic Attack to need an override, so that an accidental duplicate is visible.
22. As a referee, I want Finish Turn to skip Downed characters, so that initiative follows the rules.
23. As a referee, I want a newly Downed active character to remain current, so that only Finish Turn advances initiative.
24. As a referee, I want one atomic Match Event per Basic Attack, so that save and restore never expose partial combat.
25. As a referee, I want Undo to restore all attack changes, so that corrections remain exact and explainable.
26. As a referee, I want repeated Undo to include Action Resolutions and overrides, so that several mistakes remain correctable.
27. As a referee, I want existing saved Matches migrated, so that this application update does not discard a Match.
28. As a referee, I want an unavailable Ruleset Match restored, so that I can still inspect and correct its saved state.
29. As a referee, I want Basic Attack disabled without exact combat data, so that current rules never change an older Match.
30. As a referee, I want Team Elimination detected immediately, so that the result reflects the finalized attack.
31. As a referee, I want End Game, Undo, and Continue after normal elimination, so that I control the Match transition.
32. As a referee, I want a simultaneous elimination ruling recorded, so that an undefined outcome never becomes a hidden assumption.
33. As a referee, I want Continue acknowledged once, so that the same elimination prompt does not interrupt every later command.
34. As a referee, I want an Ended Match read-only, so that later input cannot change a confirmed result.
35. As a referee, I want Reopen Match to restore the exact pre-End Game state, so that I can correct an ending mistake.
36. As a referee, I want confirmed removal after End Game, so that I can clear the local Match and start another.
37. As a referee, I want the workflow usable on a phone and tablet, so that it remains practical outdoors.

## Implementation Decisions

- Keep the current framework-free TypeScript PWA, native DOM interface,
  service-worker shell, and transactional IndexedDB store.
- Keep the active model on the existing fixed Ruleset. Do not change gameplay
  rules or infer automation operations from card prose at runtime.
- Add structured Basic Attack data with stable identifiers, attack type, range,
  one damage, unlimited use, and the four manual physical checks.
- Add structured automation only for Divine Shield, Misty Escape, Mirror Veil,
  Deflecting Palm, and Shield Wall. Standard and Powerful Abilities remain
  unavailable.
- Model prevention, a manual movement instruction, and physical redirection as
  closed objective operations. Keep full card text and source anchors beside
  the structured data.
- Check generated structured combat data against the authoritative rules
  source. Reject unknown identifiers, operations, or incompatible references.
- Bump the Match schema. Add deterministic migration from the current schema
  before the interface reports a restored Match.
- Record migration as one atomic Match Event. Preserve prior state and history,
  then initialize no spent Reactions, no eliminated teams, and unused Major
  Action state.
- Leave prior canonical data unchanged when migration fails. Show a recovery
  error instead of a partly migrated Match.
- Restore an internally consistent Match whose exact Ruleset combat bundle is
  unavailable. Allow Finish Turn, rules status, and Undo for that saved state.
- Disable Basic Attack when exact-version combat data is unavailable. Show a
  clear version error and never substitute the bundled Ruleset.
- Derive Downed state from zero HP. Do not store a second mutable Downed flag.
- Store spent Reaction identifiers, the current turn's Major Action state,
  eliminated team identifiers, acknowledged elimination prompts, and the Match
  outcome in canonical Match State.
- Add Setup, Active, and Ended canonical Match phases. An Ended Match stays
  read-only until Reopen Match or final removal.
- Keep Action Draft state in page memory only. Never write a draft to canonical
  storage or recover it after page closure.
- Record physical contacts as ordered Attack Legs. The initial throw creates
  the first leg, and Deflecting Palm creates one redirected leg.
- Keep one affected-character set across all Attack Legs. A character cannot
  appear twice in one physical attack.
- Let the referee confirm range, Line of Sight, physical hits, terrain contact,
  Reaction timing, movement, and bottle placement. Store the confirmations but
  never calculate those facts.
- Rank Active, unspent, state-eligible Reactions first. Keep warning cases
  available through an explicit Override control.
- Record each selected Reaction's owner, protected character, trigger evidence,
  warning codes, accepted overrides, and objective operations.
- Permit at most one Reaction from one character against one attack. Permit
  several different characters to react to the same attack.
- Calculate one base damage for each unique legal hit. Apply selected prevention
  separately for each affected character before HP loss.
- Deflecting Palm prevents the Monk's damage and starts a redirected Attack Leg.
  The referee records its later legal contacts before result confirmation.
- Show manual movement instructions from Misty Escape. Do not store battlefield
  positions or claim that movement occurred.
- Mark the active character's Major Action as used after a confirmed Basic
  Attack. A later Basic Attack in that turn needs a recorded override.
- Reset Major Action state only when Finish Turn selects the next Active
  character. Undo restores the exact prior turn state.
- Save one `ActionResolved` Match Event with all draft evidence, calculated
  deltas, spent Reactions, warnings, overrides, and elimination changes.
- Commit the Action Resolution event, resulting snapshot, and sequence update
  in one IndexedDB transaction. Change visible Match State only after success.
- Keep an active character that becomes Downed as the active slot. Finish Turn
  processes later slots until it finds the next non-Downed character.
- Keep the fixed initiative order. Increment the round only when processing
  crosses the final fixed slot, including skipped Downed slots.
- Mark a team eliminated when all six of its characters become Downed. Undo can
  restore the pre-event state, but forward play cannot revive that team.
- After normal Team Elimination, show the calculated winner and offer End Game,
  Undo, or Continue. Continue records one reversible acknowledgement event.
- After Continue, keep the Match Active and skip the eliminated team's slots.
  Do not show the same elimination prompt again.
- When one Action Resolution eliminates both teams, store both eliminations and
  request a recorded referee ruling of Drow, Duergar, or draw.
- Do not apply contact order as an elimination tiebreak. Do not reject the real
  physical outcome.
- After the simultaneous ruling, offer confirmed End Game or Undo. Do not offer
  normal Continue when no Active character remains.
- Confirm End Game through one Match Event. Store the winning team or draw and
  the elimination evidence that produced the result.
- Reopen Match through a recorded transition that restores the exact state
  before End Game. Use Reopen instead of Undo on an Ended Match.
- Remove an Ended Match and its event history only after deliberate
  confirmation. Removal remains final and does not create an Undo Event.
- Keep Rules help available over an Action Draft. Closing Rules restores the
  exact draft view and choices within the same page lifetime.
- Preserve high contrast, keyboard focus, 48-pixel targets, responsive phone
  and tablet layouts, and the lack of decorative animation.
- Prefactor shared domain event application and canonical structural checks
  before the event union grows. Keep storage validation and Undo replay on the
  same public domain rules.

## Testing Decisions

- Test behavior through the pure domain resolver and public event replay seam.
  Do not test private helper structure.
- Test schema migration, atomic commits, restore, corruption rejection, failed
  transactions, and Undo through the existing IndexedDB adapter seam.
- Test structured Basic Attack and Reaction data through the generated Ruleset
  contract against the authoritative Markdown source.
- Test the rendered Active Match and Ended Match workflows through the existing
  phone and tablet browser seam.
- Extend focused domain evidence for single-hit, multi-hit, ally-hit,
  self-hit, duplicate rejection, prevention, multiple Reactions, and
  redirection.
- Test every included Reaction. Check spent state, invalid state warnings,
  manual movement instructions, and accepted overrides.
- Test Major Action use, second-attack override, Downed active-slot retention,
  consecutive skipped slots, and round wrap.
- Test normal and simultaneous Team Elimination, Continue acknowledgement, End
  Game, Reopen Match, removal, and repeated Undo.
- Test deterministic migration from the current schema. Check that a failed
  migration leaves the old canonical records unchanged.
- Test an unavailable exact Ruleset after restore. Check that Basic Attack stays
  disabled while Finish Turn and Undo remain safe.
- Test draft cancellation, page closure, Rules help round-trips, transaction
  failure, offline restart, and exact restore.
- Update prior browser evidence that intentionally requires an initiative-only
  interface and no combat controls.
- Run focused checks during Code. Test owns acceptance evidence and one full
  configured suite.

## Acceptance Criteria

1. The bundled Ruleset exposes immutable structured Basic Attack records for all 12 characters.
2. The bundled Ruleset exposes immutable structured records for the five included Reactions.
3. Contract checks fail when structured combat data drifts from the authoritative rules source.
4. A current saved Match migrates atomically to the new schema without changing its prior gameplay state.
5. A migration failure preserves the complete prior canonical record set.
6. A restored Match with unavailable combat data remains visible and never uses another Ruleset for Basic Attack.
7. Basic Attack opens an ephemeral Action Draft for the active character and exact Ruleset.
8. The draft records ordered Attack Legs and every unique affected character, including allies and the attacker.
9. The draft rejects duplicate affected characters across the complete physical attack.
10. The draft records every manual physical confirmation without calculating a battlefield fact.
11. The draft shows state-eligible Reactions and retains warning cases behind Override.
12. One character cannot use two Reactions against one attack, while different characters can react.
13. Divine Shield and Shield Wall prevent damage only for their selected protected character.
14. Misty Escape and Mirror Veil prevent their owner's damage, and Misty Escape shows its movement instruction.
15. Deflecting Palm prevents the Monk's damage and continues the same attack through one redirected Attack Leg.
16. Each selected Reaction becomes spent only after final Action Resolution confirmation.
17. The review step shows every hit, Reaction, warning, override, final damage, and resulting state change.
18. Cancellation or page closure discards the Action Draft without changing Match State or Match Events.
19. Final confirmation commits one complete Action Resolution event and matching snapshot atomically.
20. A failed Action Resolution transaction leaves the last committed visible and stored Match unchanged.
21. Final damage cannot reduce HP below zero, and zero HP always means Downed.
22. A confirmed Basic Attack marks the active character's Major Action as used.
23. A second Basic Attack in the same turn needs a recorded referee override.
24. Only Finish Turn advances initiative and resets Major Action state for the next Active character.
25. A character Downed during its turn remains active until Finish Turn.
26. Finish Turn skips consecutive Downed slots and increments the round at the fixed-order boundary.
27. Restore and repeated Undo preserve exact attack, Reaction, HP, Major Action, Downed, and elimination state.
28. Downing all six characters on one team marks that team eliminated and shows its winner result once.
29. Normal elimination offers confirmed End Game, Undo, and a reversible Continue override.
30. Continue keeps the Match Active, skips eliminated-team slots, and suppresses the acknowledged prompt.
31. Simultaneous elimination records both eliminated teams and needs a referee winner-or-draw override.
32. An Ended Match is read-only and shows its recorded result.
33. Reopen Match restores the exact state before End Game through a recorded transition.
34. Confirmed removal deletes the Ended Match and its history and permits a new Match.
35. Rules help opens and closes without losing the current Action Draft during one page lifetime.
36. The complete workflow works after an offline cold launch on representative Chrome phone and tablet viewports.
37. Main controls retain strong contrast, visible keyboard focus, 48-pixel targets, and no decorative animation.
38. The configured build, lint, format, focused-test, and full-suite commands pass.

## Out of Scope

- Standard and Powerful Ability activation.
- Persistent buffs, debuffs, healing, revival, maximum-HP changes, and general
  effect expiry.
- Manual HP correction or unrestricted Match State editing.
- Automated judgments about range, Line of Sight, hits, terrain, Reaction
  timing, movement, bottle placement, cover, or safety.
- Manual End Game without Team Elimination and the normal Final Round tiebreak.
- Match summaries, export, long-term history, accounts, and online
  synchronization.
- Custom teams, characters, Rulesets, or gameplay-rule changes.
- Multi-tab coordination and browser support outside current stable Chrome.

## Further Notes

The authoritative gameplay rules remain in `bottlebound_rules_final.md`. The
Referee Console does not change those rules.

The BOTTLEBOUND Referee Console Wayfinder and its W01, W03, W04, W05, and W11
decisions supply the fixed planning context. The current Turn Command prototype
supplies the selected live-screen structure, not production code.
