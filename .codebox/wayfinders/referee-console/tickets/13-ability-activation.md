---
id: W13
type: task
status: closed
blocked_by: [W12]
claimed_by: active-wayfinder
---

# Define the fifth Codebox boundary

## Question

What does the next Codebox feature automate for ability activation and
temporary effects, given the closed automation vocabulary from W03?

## Resolution

Automate all 23 abilities in one feature:

1. Targeted Ability Attacks (Arcane Bolt, Deadeye, Eldritch Blast) reuse the
   Basic Attack guided flow — Action Draft, Reaction window, universal
   damage/finalize sequence — without ball physics.
2. Physical ability attacks (Backstab, Stunning Strike, Brutal Shove) run the
   existing throw-resolution flow with their effect attached to every legal
   bottle hit, including accidental allies.
3. Each ability becomes Spent on legal activation only (never on an invalid
   declaration). Spending is permanent for the Match, survives Revival, and
   raises the overridable `ability-already-spent` warning.
4. Temporary effects expire automatically during event resolution:
   initiative advance fires scheduled-slot triggers, and Downed cleanup
   removes the affected character's effects. Every expiry is recorded inside
   that atomic Match Event.
5. Confirmed Undo reverses one whole ability activation — spent state,
   applied effects, HP changes, and expiries — as one atomic reversal,
   consistent with W04.
