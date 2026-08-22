# Implementation Tickets

## T01: Migrate Matches to the combat-ready contract

**Blocked by:** None.

**What it delivers:** Existing saved Matches move to the combat-ready schema
without gameplay changes or data loss. The Referee Console exposes exact-version
structured Basic Attack and Reaction data. It restores an unavailable-version
Match but disables combat commands for that Match.

### Acceptance criteria

- [x] The immutable Ruleset exposes structured Basic Attack data for all 12 characters.
- [x] The immutable Ruleset exposes structured data for the five included Reactions.
- [x] Contract checks detect drift from the authoritative roster and ability cards.
- [x] Shared domain replay and structural checks support both canonical restore and storage checks.
- [x] A current Setup or Active Match migrates through one atomic Match Event.
- [x] Migration preserves all prior gameplay state and Match Events.
- [x] Migration initializes unused Reactions, no Team Elimination, and unused Major Action state.
- [x] A failed migration leaves the prior canonical records unchanged.
- [x] A Match with unavailable exact-version combat data restores without substitution.
- [x] Basic Attack stays disabled for unavailable combat data while Finish Turn and Undo remain available.
- [x] Focused domain, contract, storage, and browser checks cover migration and exact-version gating.

## T02: Record an unreactioned Basic Attack

**Blocked by:** T01.

**What it delivers:** The referee records one complete Basic Attack without
Reactions. The Action Draft supports ordered single or multiple hits, manual
physical confirmations, calculated damage, Major Action state, atomic save,
restore, and Undo.

### Acceptance criteria

- [x] Basic Attack opens an ephemeral Action Draft for the active character.
- [x] The draft shows the fixed attack type, range, damage, and rules source.
- [x] The referee can record allies, enemies, or the attacker as legal hits.
- [x] The draft records ordered contacts and rejects a duplicate affected character.
- [x] The draft records range, Line of Sight, physical-hit, and terrain confirmations.
- [x] The review step shows each hit, final damage, HP change, and Downed change.
- [x] Cancellation, page closure, or Rules help never commits a partial draft.
- [x] Confirmation applies one damage to each unique hit and never reduces HP below zero.
- [x] Confirmation marks the active character's Major Action as used.
- [x] A second Basic Attack in one turn needs a recorded referee override.
- [x] One Action Resolution event, snapshot, and sequence update commit atomically.
- [x] A failed transaction leaves the last committed Match visible and stored.
- [x] Restore and repeated Undo preserve the exact attack, HP, Downed, and Major Action state.
- [x] Phone and tablet workflows cover single-hit, multi-hit, cancel, failure, restore, and Undo.

## T03: Resolve protective Reactions

**Blocked by:** T02.

**What it delivers:** The referee selects state-eligible protective Reactions
inside the Action Draft. The Referee Console calculates per-character
prevention, records spent abilities and overrides, and shows manual movement
instructions.

### Acceptance criteria

- [x] The draft shows unspent, state-eligible Divine Shield, Misty Escape, Mirror Veil, and Shield Wall choices.
- [x] State-invalid or spent choices remain available only through a clear Override path.
- [x] One character cannot use two Reactions against one attack.
- [x] Different characters can use legal Reactions against the same attack.
- [x] Divine Shield and Shield Wall prevent damage only for the selected protected character.
- [x] Misty Escape and Mirror Veil prevent damage only for their owner.
- [x] Misty Escape shows its immediate movement instruction without storing a position.
- [x] Each selected Reaction becomes spent only after final confirmation.
- [x] The Action Resolution records Reaction owners, protected characters, warnings, overrides, and objective operations.
- [x] Cancellation, failed save, restore, and Undo preserve exact Reaction availability.
- [x] Focused and browser checks cover every included protective Reaction and multiple-Reaction attacks.

## T04: Continue a redirected physical attack

**Blocked by:** T03.

**What it delivers:** Deflecting Palm prevents the Monk's damage and redirects
the same physical attack. The referee records later contacts as a second Attack
Leg before one atomic Action Resolution.

### Acceptance criteria

- [x] Deflecting Palm appears only for an eligible, unspent Monk affected by the physical attack.
- [x] Selecting Deflecting Palm prevents the Monk's damage and spends the Reaction on confirmation.
- [x] The draft closes the initial Attack Leg and opens one redirected Attack Leg.
- [x] The redirected leg keeps the original attacker, attack profile, and range evidence.
- [x] The referee can record every later legal contact before final confirmation.
- [x] One affected-character set rejects duplicates across both Attack Legs.
- [x] The review step shows the ordered legs, prevention, later hits, and final per-character damage.
- [x] The complete redirected attack commits as one Action Resolution.
- [x] Cancellation, failed save, restore, and Undo preserve the exact redirect state.
- [x] Phone and tablet workflows cover redirection to the source, later hits, and duplicate rejection.

## T05: Handle Downed turns and normal Team Elimination

**Blocked by:** T02.

**What it delivers:** Finish Turn follows the fixed initiative order while it
skips Downed characters. Normal Team Elimination gives the referee End Game,
Undo, or one recorded Continue override. An Ended Match can be reopened or
removed.

### Acceptance criteria

- [x] A character Downed during its turn remains the active slot until Finish Turn.
- [x] Finish Turn skips one or more consecutive Downed slots.
- [x] Round increments remain correct when skipped slots cross the fixed-order boundary.
- [x] Major Action state resets only when Finish Turn selects the next Active character.
- [x] Downing all six characters on one team records permanent Team Elimination.
- [x] Normal Team Elimination shows the calculated winner and offers End Game, Undo, and Continue.
- [x] Continue appends one reversible acknowledgement and keeps the Match Active.
- [x] An acknowledged elimination does not show the same prompt again.
- [x] Continue keeps the eliminated team eliminated and skips all its initiative slots.
- [x] Confirmed End Game creates an Ended Match with a read-only result.
- [x] Reopen Match restores the exact state before End Game through a recorded transition.
- [x] Confirmed removal deletes the Ended Match and history and permits a new Match.
- [x] Restore and repeated Undo preserve Downed slots, elimination, acknowledgement, and outcome state.
- [x] Phone and tablet workflows cover skip, round wrap, Continue, End Game, Reopen, and removal.

## T06: Resolve simultaneous Team Elimination

**Blocked by:** T05.

**What it delivers:** One multi-hit Action Resolution can record both teams as
eliminated. The referee chooses Drow, Duergar, or draw through a recorded
override without using contact order as a hidden tiebreak.

### Acceptance criteria

- [x] One Action Resolution can record both teams as eliminated at the same finalized state boundary.
- [x] Contact order does not select a winner or reject the physical result.
- [x] The interface explains that the authoritative rules do not define the simultaneous outcome.
- [x] The referee must select Drow, Duergar, or draw through a recorded override.
- [x] The ruling records both eliminations, the selected outcome, and the override evidence.
- [x] The simultaneous result offers confirmed End Game or Undo and does not offer normal Continue.
- [x] The Ended Match shows the selected outcome and remains read-only.
- [x] Reopen Match and repeated Undo restore the exact state before the ruling and Action Resolution.
- [x] Atomic failure and offline restore never expose a partial simultaneous ruling.
- [x] Phone and tablet workflows cover all three outcomes, End Game, Reopen, and Undo.
