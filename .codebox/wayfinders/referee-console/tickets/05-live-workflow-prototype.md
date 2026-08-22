---
id: W05
type: prototype
status: closed
blocked_by: [W01, W03, W04]
claimed_by: active-wayfinder
---

# Prototype the live referee workflow

## Question

Which screen flow lets one referee advance turns and record state changes quickly during physical outdoor play?

## Resolution

Use Variant A, the Turn Command flow, as the live Match structure.

- The header shows the Match phase, round, Rules, and Undo.
- The active character is the main focus. Its team, initiative slot, HP,
  attack profile, available abilities, and effects remain visible.
- Basic Attack, Use Ability, and Finish Turn are the three main controls.
- The screen names the next character and states that only Finish Turn moves
  initiative.
- Compact team sections show every character's HP, Downed state, effects, and
  active-turn status.
- An Action Draft opens over the live screen. It shows the action, affected
  characters, warnings, Reactions, the calculated result, and final
  confirmation before it changes Match State.
- Undo opens a confirmation view that shows the complete state change before
  it restores the prior Match State.
- The layout uses high contrast, large touch targets, and a responsive
  single-column phone layout for outdoor use.

The [throwaway workflow prototype](../assets/live-referee-workflow-prototype.html)
contains the selected flow and the two rejected comparison variants.
