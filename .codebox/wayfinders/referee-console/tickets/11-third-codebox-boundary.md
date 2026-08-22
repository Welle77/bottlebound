---
id: W11
type: grilling
status: closed
blocked_by: []
claimed_by: Codex
---

# Define the third Codebox feature boundary

## Question

What is the smallest coherent combat-state feature that should follow the
offline initiative tracker and rules reference?

## Resolution

The third Codebox feature is **Basic Attack resolution and elimination**.

This feature gives the Referee Console ownership of the smallest complete
combat path. The referee judges physical hits, range, Line of Sight, Reaction
timing, and Reaction legality. The Referee Console records those judgments and
automates their objective Match State results.

### In scope

- Add Basic Attack to the Active Match commands. Use the active character and
  its fixed melee or ranged attack profile from the active Ruleset.
- Open an Action Draft over the Active Match. Keep all draft choices temporary
  until final confirmation.
- Prompt the referee to confirm range, Line of Sight, physical hits, terrain
  contact, and Reaction timing. Never calculate those physical facts.
- Let the referee select every legal bottle hit, including an ally or the
  attacker. Record each affected character at most once per physical attack.
- Show every state-eligible, unspent Reaction from the fixed Ruleset. Let the
  referee confirm the legal reacting character and protected character.
- Support multiple legal Reactions against one attack while enforcing at most
  one Reaction per reacting character.
- Apply each selected Reaction's known objective operations. These operations
  include damage prevention, spent-ability state, manual movement prompts, and
  physical-attack redirection.
- For a redirection, continue the same Basic Attack. Let the referee record all
  later legal hits before final confirmation.
- Calculate each affected character's final Basic Attack damage after the
  selected Reactions. Apply HP loss, enforce HP bounds, and mark zero-HP
  characters Downed.
- Mark the active character's Major Action as used after confirmation. A second
  Basic Attack in the same turn shows an override warning and remains available
  through a recorded referee override.
- Save the complete Action Resolution as one atomic Match Event. Include hits,
  selected Reactions, warnings, overrides, final damage, HP changes, Downed
  changes, spent Reactions, Major Action state, and elimination changes.
- Discard an unconfirmed Action Draft after cancellation or page closure.
- Extend restore and confirmed Undo across all new Match State and Match Event
  fields.
- Keep a character that becomes Downed during its turn as the active slot until
  Finish Turn. Finish Turn then skips Downed characters while preserving the
  fixed initiative order and round rules.
- When one team becomes fully Downed, mark it permanently eliminated and show
  the elimination result. Allow confirmed End Game, Undo, or a recorded Continue
  override.
- Make an elimination-ended Match read-only. Reopen Match restores the exact
  pre-End Game Match State and records the transition.
- Keep the existing offline, responsive, high-contrast, large-target, phone,
  tablet, storage, and rules-help behavior.

### Out of scope

- Standard and Powerful Ability activation.
- Persistent buffs, debuffs, healing, revival, maximum-HP changes, and general
  effect expiry.
- Manual HP correction or unrestricted Match State editing.
- Automated judgments about range, Line of Sight, hits, terrain, Reaction
  timing, movement, bottle placement, or safety.
- Manual End Game, tiebreak calculation, Match summaries, export, and long-term
  history.
- Changes to the authoritative gameplay rules.

### Acceptance boundary

- A referee can record a single-hit or multi-hit Basic Attack, select legal
  Reactions, check the calculated result, and confirm one atomic Action
  Resolution.
- Prevention and physical-attack redirection produce the correct per-character
  damage, HP, Downed state, ability state, and recorded evidence.
- A second Basic Attack in one turn needs a recorded override. Finish Turn
  resets Major Action state for the next Active character.
- Downed characters remain in the fixed order but have no visible turn. Round
  transitions remain correct when the console skips one or more Downed slots.
- Restore and repeated Undo preserve the exact attack, Reaction, HP, Downed,
  Major Action, elimination, and End Game state.
- Team elimination offers End Game, Undo, and Continue override. Reopen Match
  restores the exact state before End Game.
- Cancellation, page closure, or a failed transaction never exposes or saves a
  partial Action Draft or Action Resolution.
- Phone and tablet checks cover the Action Draft, Reaction selection,
  redirection, confirmation, Downed skipping, elimination, and Reopen Match.

Codebox decides the smallest maintainable state and resolver design during
Planning. The Wayfinder does not create implementation tickets.
