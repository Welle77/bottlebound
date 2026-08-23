# Tickets

Tracer-bullet vertical slices for Manual End Game, tiebreak, and Match summary.
Development approach: TDD at the domain and store seams; browser tests carry
the referee-visible acceptance boundary.

## T01: Unified End Game with ordered Decision Basis

**What to build:** From any Active Match without an open Action Draft, the
referee opens an End Game preview showing the calculated winner and Decision
Basis (permanent Team Elimination first, then Active-character counts, then
Active-character HP totals), confirms one atomic transition to a read-only
Ended Match, and sees the outcome, basis, final team counts and HP totals,
`rulesVersion`, and end time. Legacy persisted Matches ended under the
elimination-only flow remain readable without a basis line.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [x] End Game is blocked while an Action Draft is open and available once it closes.
- [x] Preview shows winner plus which Decision Basis level selected it.
- [x] Confirmation emits one atomic `MatchEnded` event carrying outcome, Decision Basis, final counts and HP totals, `rulesVersion`, and end time; elimination-first order preserved.
- [x] The Ended Match rejects turn, attack, and correction commands.
- [x] Legacy `MatchEnded` events without a basis load and display correctly.
- [x] Store save/restore covers the new ending across restart.

## T02: Coin Flip tie resolution

**What to build:** When Active-character counts and HP totals both tie, the
preview performs one immediate digital Coin Flip between Drow and Duergar with
no decorative animation. Confirming embeds the recorded flip result in the
atomic `MatchEnded` event; canceling discards the flip so re-entering flips
again. Randomness is injected so tests are deterministic.

**Blocked by:** T01

**Status:** ready-for-agent

- [x] A full tie resolves via exactly one flip; the flip never yields a draw.
- [x] The recorded flip result appears in the Ended view's Decision Basis line.
- [x] Canceling the preview discards the flip result entirely.
- [x] Deterministic injection makes tie outcomes testable at the domain seam.

## T03: Reopen Match with exact restoration

**What to build:** Reopen Match on an Ended Match restores the exact pre-End
Game Match State — computed outcome back to null, `endedAt` and `endedSequence`
dropped, pre-existing elimination flags and acknowledgments unchanged — records
the reopen Match Event, and returns to live play. Undo stays inert while Ended
and works normally after Reopen.

**Blocked by:** T01

**Status:** ready-for-agent

- [x] Reopen produces the exact pre-End Game Active state, including a null outcome for both manual and elimination endings.
- [x] The reopen transition is one recorded Match Event.
- [x] Undo does nothing on the Ended Match and reverses normally after Reopen.
- [x] Save/restore recovery checks cover end and reopen across restarts with no partial state exposure.

## T04: Match Summary lifecycle per W07

**What to build:** One compact device-local Match Summary record in IndexedDB
is written transactionally alongside each confirmed End Game, containing
outcome, Decision Basis, final team Active-character counts and HP totals,
`rulesVersion`, and end time. A compact prior-summary card is visible from
Setup and Active screens. Each new ending replaces the prior summary; removing
the current Ended Match removes summary, snapshot, history, and Undo together;
removing the prior summary never touches the Active Match; both removals need
deliberate confirmation. No expiry, no export, no personal data.

**Blocked by:** T01

**Status:** ready-for-agent

- [x] Summary fields match W07 exactly and update atomically with End Game.
- [x] Starting another Match retains the prior summary during play.
- [x] Ending the new Match replaces the prior summary.
- [x] Both removal paths require confirmation and produce their distinct effects.
- [x] Restore after failure or restart never exposes a partial summary change.

## T05: Full acceptance-boundary browser verification

**What to build:** Phone/tablet browser tests close the W12 acceptance
boundary end to end: result preview, confirmation, read-only Ended state,
Reopen, coin-flip flow, summary retention, replacement, and both removal
paths, plus restore consistency after restart.

**Blocked by:** T02, T03, T04

**Status:** ready-for-agent

- [x] Every W12 acceptance-boundary flow is exercised through the referee-visible interface on phone and tablet viewports.
- [x] High-contrast, large-target, responsive behavior holds on the new screens.
