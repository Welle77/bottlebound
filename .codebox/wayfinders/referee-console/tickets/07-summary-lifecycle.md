---
id: W07
type: grilling
status: closed
blocked_by: []
claimed_by: active-wayfinder
---

# Define the Match summary lifecycle

## Question

How long does the Referee Console retain local Match summaries, how does the referee remove them, and does the first version export them?

## Resolution

Keep one latest Match summary. The summary contains the outcome, decision
basis, final team Active-character counts, final team HP totals, `rulesVersion`,
and end time. It contains no player names or other personal data.

- An Ended Match keeps its complete snapshot and Match Event history while
  Reopen Match remains available.
- Starting another Match removes that snapshot and history. It keeps the prior
  result as the compact latest summary.
- The compact prior summary remains available during the new Match.
- When the new Match ends, its summary replaces the prior summary.
- A summary has no time-based expiry.
- Remove Summary always needs deliberate confirmation.
- Removing the current Ended Match removes its summary, snapshot, Match Event
  history, Reopen Match, and Undo history.
- Removing a compact prior summary does not affect the Active Match.
- The first version provides no summary export.

The Referee Console states that the summary exists only on the current device.
Browser storage remains best-effort and is not a backup.
