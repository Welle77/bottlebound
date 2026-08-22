---
id: W12
type: grilling
status: closed
blocked_by: []
claimed_by: Codex
---

# Define the fourth Codebox feature boundary

## Question

Which smallest coherent product capability should follow Basic Attack
resolution and elimination?

## Resolution

The fourth Codebox feature is **Manual End Game, tiebreak, and Match
summary**.

This feature completes the Match lifecycle after the Referee Console gains HP,
Downed state, and team elimination. The referee owns the physical clock and
Final Round announcement. The Referee Console calculates and records the final
objective result.

### In scope

- Add a manual End Game command during an Active Match.
- Require the referee to confirm or cancel an open Action Draft before End Game
  becomes available. The Referee Console does not end a Match during an
  unfinished action.
- Do not add a Match clock or Final Round mode. The referee selects End Game
  after the applicable action and round finish under the authoritative rules.
- Show the calculated winner and decision basis before final confirmation.
- Use permanent team elimination first. Otherwise, compare Active-character
  counts, then total current HP among Active characters.
- Resolve a remaining tie with one immediate digital coin flip. Record the coin
  flip result without decorative animation.
- Save confirmed End Game as one atomic Match Event. Record the result,
  decision basis, final team counts, final team HP totals, `rulesVersion`, and
  end time.
- Make the Ended Match read-only.
- Provide Reopen Match. It restores the exact pre-End Game Match State and
  records the transition.
- Create the compact local Match Summary from W07. Keep one latest summary on
  the current device without time-based expiry.
- Keep the prior Match Summary when a replacement Match starts. Replace it when
  the new Match ends.
- Require confirmation before removing the current Ended Match or a compact
  prior Match Summary. Apply the distinct removal effects from W07.
- Extend local save, restore, and recovery checks across End Game, Reopen Match,
  the digital coin flip, and Match Summary storage.
- Keep the existing offline, responsive, high-contrast, large-target, phone,
  tablet, storage, rules-help, and event-history behavior.

### Out of scope

- Standard Ability and Powerful Ability activation.
- General buffs, debuffs, healing, revival, maximum-HP changes, and effect
  expiry.
- A Match clock or Final Round mode.
- Match Summary export, multiple-summary history, player names, and other
  personal data.
- Automated physical judgments or changes to the authoritative gameplay rules.

### Acceptance boundary

- A referee can select End Game after any unfinished Action Draft closes, check
  the calculated result, and confirm one atomic transition to an Ended Match.
- Elimination, Active-character count, Active-character HP, and a recorded
  digital coin flip select the result in the defined order.
- An Ended Match stays read-only. Reopen Match restores the exact pre-End Game
  state and records the transition.
- The latest Match Summary contains only the fields that W07 defines. Its
  replacement and confirmed-removal behavior matches W07.
- Restore never exposes a partial End Game, Reopen Match, or Match Summary
  change after a failed transaction or browser restart.
- Phone and tablet checks cover result preview, confirmation, Ended state,
  Reopen Match, summary retention, summary replacement, and both removal paths.

Codebox decides the smallest maintainable result-calculation, event, and
storage design during Planning. The Wayfinder does not create implementation
tickets.
