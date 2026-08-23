---
slug: 20260823-134840-manual-end-game-tiebreak-summary
title: Manual End Game, tiebreak, and Match summary
branch: feature/manual-end-game-tiebreak-summary
target_branch: main
current_phase: done
phases:
  planning: done
  code: done
  test: done
  review: done
  ship: skipped
gate_policy:
  planning: auto
  code: auto
  test: auto
  review: auto
  ship: skip
model_routing:
  default: frontier
  aliases:
    lightweight: [gpt-5.6-luna, claude-haiku-4.5]
    general: [gpt-5.6-terra, claude-sonnet-5]
    frontier: [x-preview-f-free, muse-spark-1.2-contributor-free, opencode/muse-spark-1.2-contributor-free, opencode/x-preview-f-free]
  phases:
    planning: frontier
---

# Manual End Game, tiebreak, and Match summary

Planning context: Wayfinder map `referee-console`, decisions W01 (Match
lifecycle), W04 (Undo), W07 (Match summary lifecycle), W11 (Basic Attack
resolution and elimination), and W12 (fourth Codebox boundary).

## Problem Statement

The Referee Console tracks combat state but has no way for the referee to end a
Match deliberately. Team elimination already offers End Game, but a Match that
ends by decision or time called by the referee cannot be closed. There is no
calculated winner for non-elimination endings, no read-only Ended Match view,
and no compact local record of the last result.

## Solution

The referee selects End Game during an Active Match after closing any open
Action Draft. The console shows the calculated winner and Decision Basis for
confirmation; one confirmed action atomically transitions to an Ended Match.
The Decision Basis applies permanent Team Elimination first, then
Active-character counts, then Active-character HP totals, then one recorded
digital Coin Flip. The Ended Match is read-only until Reopen Match restores the
exact pre-End Game state. The console keeps one compact local Match Summary
with W07 replacement and confirmed removal.

## User Stories

1. As a referee, I want to select End Game during an Active Match, so that I can close a Match decided by my judgment or by time rather than only by Team Elimination.
2. As a referee, I want End Game to stay unavailable while an Action Draft is open, so that no Match ends in the middle of an unfinished action.
3. As a referee, I want to see the calculated winner before confirming End Game, so that I can check the result against my physical judgment.
4. As a referee, I want to see the Decision Basis next to the calculated winner, so that I know which rule selected the result.
5. As a referee, I want permanent Team Elimination to decide the outcome first, so that an eliminated team never wins on counts or HP.
6. As a referee, I want Active-character counts to break a no-elimination tie, so that the team with more fighting characters leads.
7. As a referee, I want Active-character HP totals to break an equal-count tie, so that remaining strength decides before chance.
8. As a referee, I want one immediate digital Coin Flip when HP totals also tie, so that every Match reaches a recorded result without decorative delay.
9. As a referee, I want the Coin Flip result recorded with the End Game result, so that the deciding chance event is part of the permanent record.
10. As a referee, I want a preview-time Coin Flip discarded when I cancel End Game, so that canceling never locks in a flip result.
11. As a referee, I want End Game confirmation to be one atomic transition, so that a crash or browser restart can never leave a half-ended Match.
12. As a referee, I want the Ended Match to be read-only, so that I cannot accidentally change state after the result is final.
13. As a referee, I want Reopen Match to restore the exact pre-End Game Match State, so that I can resume play as if End Game never happened.
14. As a referee, I want Undo to be inert while the Match is Ended, so that there is exactly one explicit path back into play.
15. As a referee, I want the outcome cleared on Reopen, so that the reopened Match recomputes its result from live state.
16. As a referee, I want a compact Match Summary of the latest Ended Match kept on this device, so that I can recall the last result at any time.
17. As a referee, I want the prior Match Summary to remain visible while a new Match runs, so that I can reference it mid-Match.
18. As a referee, I want each new Ended Match to replace the prior Match Summary, so that exactly one latest summary exists.
19. As a referee, I want summary removal to always require deliberate confirmation, so that I cannot lose the last result by accident.
20. As a referee, I want removing the current Ended Match to remove its snapshot, history, and summary together, so that removal is complete and predictable.
21. As a referee, I want removing a prior Match Summary not to affect the Active Match, so that cleanup is safe during play.
22. As a referee, I want save and restore checked across End Game, Reopen, the Coin Flip, and the summary, so that recovery after a restart shows consistent data.
23. As a referee, I want older stored Matches ended under the elimination-only flow to remain readable, so that updating the app loses nothing.
24. As a referee, I want all controls large-target, high-contrast, and responsive on phone and tablet, so that the flow works outdoors like the rest of the console.

## Implementation Decisions

- One unified End Game command replaces the current elimination-only precondition. It computes the Decision Basis at confirm time and emits one `MatchEnded` Match Event carrying the outcome, Decision Basis, final team Active-character counts, final team HP totals, `rulesVersion`, and end time.
- Decision Basis order: permanent Team Elimination, then Active-character count comparison, then total current HP among Active characters, then one digital Coin Flip between Drow and Duergar. A Coin Flip never yields a draw.
- The Coin Flip result is embedded in the atomic `MatchEnded` event. A flip performed during preview is discarded if the referee cancels; re-entering the preview flips again. Randomness is injected so tests are deterministic.
- An open Action Draft blocks End Game until the referee confirms or cancels it.
- Reopen Match restores the exact pre-End Game Match State: computed outcome returns to null, `endedAt` and `endedSequence` are dropped, and pre-existing elimination flags and acknowledgments remain as they were before End Game. The reopen transition itself is recorded as a Match Event.
- Undo is retained but inert while the Match is Ended; Reopen Match is the only path back to an Active Match.
- The Ended Match view is read-only and shows outcome winner, Decision Basis (including any Coin Flip result), final team Active-character counts and HP totals, `rulesVersion`, end time, plus confirmed Reopen Match and confirmed Remove Match actions.
- The Match Summary is a dedicated device-local latest-summary record in IndexedDB, written transactionally alongside the `MatchEnded` transition. Each new End Game replaces it; it has no time-based expiry and no export.
- Summary fields follow W07: outcome, Decision Basis, final team Active-character counts, final team HP totals, `rulesVersion`, end time. No player names or personal data.
- Removing the current Ended Match removes its summary, snapshot, Match Event history, Reopen availability, and Undo history together. Removing the compact prior summary does not touch the Active Match. Both paths require confirmation.
- A compact prior Match Summary card is reachable from the Setup and Active screens.
- The End Game control sits visually separated below the active-turn main actions, opening the result-preview confirmation.
- Legacy persisted Matches keep their existing `MatchEnded` events readable; `decisionBasis` is optional for legacy events and always written for new ones, following the repository's existing schema-migration pattern if a version bump proves necessary.

## Testing Decisions

Good tests verify external behavior through agreed public seams with expected
values from independent sources — worked literals, known-good states, or the
spec — never implementation details.

Three seams, highest first:

1. Domain commands: pure functions returning state-plus-event results. They carry the Decision Basis order, Coin Flip embedding, exact reopen restoration, read-only Ended validation, and structural checks.
2. Match store: transactional persistence across End Game, Reopen, Coin Flip, and summary writes, including failed-transaction and restart-recovery cases.
3. Browser tests: the referee-visible flows — preview, confirm, read-only Ended view, reopen, and summary retention, replacement, and both removal paths.

Prior art: the existing domain command tests, match-store persistence tests,
and browser tests added by the Basic Attack resolution feature.

## Acceptance criteria

Refined from the W12 acceptance boundary:

- From any Active Match with no open Action Draft, the referee can open the End Game preview showing the calculated winner and Decision Basis, and confirm one atomic transition to an Ended Match.
- An open Action Draft prevents End Game until confirmed or canceled.
- Elimination, Active-character count, Active-character HP, and a recorded Coin Flip select the result in that defined order; a full tie resolves via the flip with no draw.
- Canceling the preview discards any preview-time Coin Flip result.
- The Ended Match is read-only; no turn, attack, or correction commands apply.
- Reopen Match restores the exact pre-End Game Match State, including a null outcome, and records the reopen transition.
- Undo does nothing while the Match is Ended and works normally after Reopen.
- The latest Match Summary contains exactly the W07 fields and updates transactionally with End Game.
- Starting another Match retains the prior summary; ending the new Match replaces it.
- Both removal paths require confirmation and produce their distinct W07 effects.
- Restore after a failed transaction or browser restart never exposes a partial End Game, Reopen, Coin Flip, or summary change.
- Legacy ended Matches load without error and display without a Decision Basis line.
- Phone and tablet browser checks cover result preview, confirmation, Ended state, Reopen, summary retention, replacement, and both removals.

## Out of Scope

Per W12: Standard and Powerful Ability activation; general buffs, debuffs,
healing, revival, maximum-HP changes, and effect expiry; a Match clock or Final
Round mode; summary export, multiple-summary history, player names, and other
personal data; automated physical judgments; changes to authoritative rules;
online synchronization.

## Further Notes

The referee owns the physical clock and Final Round announcement; the console
records only the objective final result. Browser storage remains best-effort
and is not a backup; the summary exists only on the current device.
