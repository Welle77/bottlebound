# Tickets

Tracer-bullet vertical slices for playable console completeness. Tickets run
sequentially; they share UI shell files, so no parallel groups are declared.

## T01: Character Display Names in Setup and every display

**What to build:** In Setup (before Start Match), the referee can edit an
optional Display Name for each of the twelve fixed characters. Names persist
inside the Match record as a reversible append-only event, survive offline
restarts, restore exactly under Undo, and render everywhere the character
appears — initiative order, HP tables, drafts, reviews, undo panels — with the
Ruleset name still visible beside it.

**Blocked by:** None (can start immediately).

- [x] Setup panel offers an editable Display Name per character; editing records one atomic reversible event per save batch
- [x] Editing is possible only while `phase === "setup"`; after Start Match names are read-only
- [x] Undo of a naming event restores the previous name map exactly; persistence round-trip preserves names across store reopen
- [x] Every character display shows Display Name primary and Ruleset name secondary; empty Display Name falls back to Ruleset name alone
- [x] Focused domain tests cover event application, undo, and validation (length/emptiness/duplicates allowed but trimmed); browser test covers edit → generate initiative → visible names

## T02: Manual physical confirmations toggle

**What to build:** One persisted device-local console setting, default ON,
controls whether Action Drafts require the four manual physical confirmations.
When OFF, drafts mark all four checks satisfied and hide that fieldset. The
toggle applies to Basic Attack drafts and stays available for physical-attack
ability drafts added in T03. Destructive confirmation panels are unchanged.

**Blocked by:** T01.

- [x] A toggle control exists on the setup/match screen header area and persists across page reloads via device-local storage
- [x] With the setting OFF, a Basic Attack draft reaches Review with zero manual check taps and commits successfully
- [x] With the setting ON, existing behavior is byte-for-byte preserved
- [x] Undo, End Game, reroll, discard, remove, remove-summary, start-new confirmations remain untouched in both modes
- [x] Browser test covers both modes; unit coverage for setting load/save fallback when storage is unavailable

## T03: Use Ability command with guided ability drafts

**What to build:** The Active-turn screen gains **Use Ability** beside Basic
Attack. It lists the active character's unspent abilities and guides each
through a draft shaped by its interaction: targeted-attack (one target +
Reactions + review), physical-attack (ordered contacts reusing the Basic Attack
flow), self (single confirm), and ally/enemy/utility (policy-filtered target
selection). Domain errors surface as explicit Override recordings; Spent
abilities never appear; second Major Action requires the existing override;
resolutions integrate with Undo, persistence, elimination, and summaries.

**Blocked by:** T02.

- [x] Ability list shows only the active character's unspent abilities with name, range, and rules anchor link; Downed active character cannot open it
- [x] Targeted-attack ability resolves exactly one target through Reactions and review, producing one atomic ActionResolved event identical in shape to domain tests' expectations
- [x] Physical-attack ability reuses ordered contacts, Deflecting Palm redirection legs, and the physical confirmations (respecting the T02 toggle)
- [x] Self and utility abilities resolve with policy-filtered target selection; invalid relation/life-state choices prompt Override recording rather than silent failure
- [x] Wrong-active-character and already-Spent attempts require recorded overrides; Spent state renders after resolution and survives undo/replay
- [x] Second Major Action this turn triggers the majorActionOverride checkbox exactly as Basic Attack does
- [x] Ability resolutions appear correctly in Undo preview/restore, match persistence round-trip, and elimination flow; browser tests cover one ability per interaction type end to end

## T04: Rules coverage audit and small gap fixes

**What to build:** Verify implemented Match behavior against
`bottlebound_rules_final.md` end to end: setup, initiative/tiebreak, turn flow,
Basic Attack, all 24 abilities, reactions, effects/expiry, elimination, End
Game decision basis, summary, undo/reopen. Close small rule-fidelity gaps found
inside this feature; record larger gaps as documented follow-ups.

**Blocked by:** T03.

- [x] Each rules section relevant to running a game is checked against implemented behavior with recorded evidence
- [x] Small gaps found are fixed with focused tests; larger gaps are listed with rule citation and suggested boundary in the feature report
- [x] Full vitest suite passes once after gap fixes
