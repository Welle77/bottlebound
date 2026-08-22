---
id: W09
type: task
status: closed
blocked_by: [W06, W08]
claimed_by: active-wayfinder
---

# Define the first Codebox feature boundary

## Question

What is the smallest implementation-ready feature that proves the Referee Console can support a live BOTTLEBOUND Match?

## Resolution

The first Codebox feature is **Offline initiative and turn tracking**.

It proves that the Referee Console can load fixed rules data, persist a live
Match, restore it offline, and reverse referee input safely. It does not
implement partial combat rules.

### In scope

- Create the static PWA shell, manifest, root service worker, versioned app
  shell, and offline-readiness status.
- Block Match creation when the browser cannot write canonical IndexedDB data.
- Bundle the versioned fixed 12-character Ruleset. This feature reads its
  stable identifiers, `rulesVersion`, base HP, and initiative modifiers.
- Create a Setup Match with the fixed roster at full HP.
- Generate all 12 d20 rolls, modifiers, totals, and exact tie results in one
  action. Show the complete ordered result immediately.
- Confirm a full initiative reroll, Start Match, or Discard Match.
- Start Round 1 with the first initiative slot active.
- Use the selected Turn Command layout for the Active Match. Show the active
  character, next character, full order, round, team, HP, and slot.
- Provide Finish Turn as the only live Match command in this feature. Process
  all 12 fixed slots and increment the round after the final slot.
- Persist each initiative generation, reroll, Start Match, Finish Turn, and
  Undo as the applicable atomic Match Event and snapshot.
- Discard Match needs deliberate confirmation and removes the saved Match. It
  is final and does not support Undo.
- Restore the exact Setup or Active Match after a browser or device restart.
- Provide confirmed Undo for the newest effective reversible Match Event. Keep
  the append-only Match Event history through restore.
- Use large touch targets, high contrast, responsive phone and tablet layouts,
  and no decorative animation.

### Out of scope

- Basic Attacks, Action Drafts, HP changes, abilities, Reactions, effects,
  Downed-state skipping, revival, team elimination, and End Game.
- Contextual rules help and full rules search.
- Match summaries, Reopen Match, and export.
- Custom rosters, online synchronization, accounts, a Match clock, and a
  digital battlefield map.

The limited Active screen does not show unavailable combat controls. It states
that this feature tracks initiative only. The authoritative rules remain
unchanged, and the referee handles all combat state outside this feature.

### Acceptance boundary

- A referee can create, reroll, discard, and start a fixed-roster Match.
- An offline cold launch restores the last complete Setup or Active Match.
- Finish Turn advances exactly one fixed initiative slot and the correct round.
- Confirmed Undo restores the complete pre-event state and remains in history.
- Failed or interrupted writes never expose a partial event or snapshot.
- Phone and tablet checks cover offline restart, Finish Turn, Undo, sunlight
  readability, one-hand use, damp-finger use, and Match-duration device heat.

Codebox must select the smallest maintainable web toolchain during Planning.
It must also add real build, lint, format, focused-test, and full-suite commands
to the Codebox constitution. The Wayfinder does not select implementation
tickets.
