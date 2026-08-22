---
id: W01
type: grilling
status: closed
blocked_by: []
claimed_by: active-wayfinder
---

# Define the Match lifecycle

## Question

Which Match states, transitions, invariants, and referee overrides must the Referee Console own from initiative generation through End Game?

## Resolution

### Match phases

- A Match moves through No Match, Setup, Active, and Ended.
- Setup loads the fixed roster at full HP, with unused abilities and no effects.
- Initiative generation produces the full order immediately. The result shows each d20 roll, fixed modifier, and total.
- The Referee Console resolves exact initiative ties immediately without decorative animation.
- Setup permits a confirmed full reroll, Start Match, or Discard Match.
- Start Match opens Round 1 with the first initiative slot active.
- Starting a replacement Match while one is Active needs deliberate confirmation through End Match or Discard Match.

### Turn and round transitions

- Only Finish Turn advances the active initiative slot.
- Finish Turn processes end-of-slot effects, then selects the next Active character.
- A Downed character has no visible turn, but its scheduled slot still processes effect expiry.
- A character that becomes Downed during its own turn remains the active slot until the referee selects Finish Turn.
- The last processed initiative slot ends the round. The next eligible slot starts the next round.
- Revival restores the character to its fixed initiative slot under the authoritative rules.

### Action resolution

- A targeted ability starts with ability selection, then shows targets that match its ally, enemy, self, or Downed requirements.
- The Referee Console checks known Match State. The referee confirms physical range, Line of Sight, hits, and timing.
- A physical attack starts with attack selection. After the throw, the referee selects every legally hit bottle, including allies or the attacker when permitted.
- An area ability lets the referee select every affected character before activation.
- After targets or hits are known, the Referee Console shows state-eligible Reactions. The referee chooses all legal Reactions before resolution.
- Valid targets appear first. State-invalid targets remain available behind an Override control with a clear warning.
- Attack, target, hit, and Reaction selections remain in an Action Draft until final confirmation.
- Final confirmation applies the complete Action Resolution and saves it as one atomic Match Event.
- Only Finish Turn advances initiative after an Action Resolution.
- A one-use ability becomes spent at activation confirmation. Canceling later does not restore it.
- Undo handles a mistaken confirmed activation.
- If the browser closes before final confirmation, the Referee Console discards the Action Draft and restores the last complete Match Event.

### Invariants and overrides

- Normal Active-state changes use defined attacks, abilities, Reactions, Finish Turn, Undo, and End Game. The Referee Console does not expose unrestricted state editing.
- HP stays between zero and the character's current maximum.
- A character is Downed exactly when its HP is zero.
- A legal revive sets HP to one.
- Only a defined ability effect changes maximum HP.
- The Referee Console preserves one active initiative slot and one ordered initiative list.
- A warning never blocks a referee override of a game rule. Each override records its warning in the Match Event.
- Structural invariants do not permit corrupt Match State, such as negative HP or two active initiative slots.

### End Game

- When all six characters on one team become Downed, the Referee Console marks that team permanently eliminated and shows the End Game result.
- The referee can confirm End Game, undo the last change, or continue through an explicit recorded override.
- End Game shows the calculated result before confirmation. It uses elimination first, then Active characters, then current HP among Active characters.
- The Referee Console resolves a remaining coin-flip tie immediately without decorative animation.
- An Ended Match is read-only.
- Reopen Match restores the exact pre-End Game Match State and records the transition.
- Until a new Match starts, the referee can reopen or remove the complete saved Match.
