---
id: W04
type: grilling
status: closed
blocked_by: [W01]
claimed_by: active-wayfinder
---

# Define undo behavior

## Question

Which Undo rules keep Match State accurate and make each change explainable to the referee?

## Resolution

The first version provides one Undo button. It provides no Correct State or
Redo action.

- Undo targets the newest effective reversible Match Event during Setup or an
  Active Match.
- Reversible events include initiative generation, Start Match, Action
  Resolutions, Finish Turn, and referee overrides.
- Repeated Undo actions move backward by one effective event at a time.
- Before it applies an Undo, the Referee Console shows the complete state
  change and asks the referee to confirm it.
- Undo restores the exact pre-event Match State as one atomic change. This
  includes HP, maximum HP state, spent abilities, effects, expiry, Downed
  status, initiative state, and team elimination.
- Each Undo appends a Match Event that references its target. It does not
  remove or rewrite the target event.
- An Undo Event needs no reason or note. The event log keeps undone events
  visible.
- Local save and restore preserve the complete Undo history.
- An Ended Match uses Reopen Match instead of Undo. Discard Match is final.
