# Release notes - Manual End Game, tiebreak, and Match summary

Change: Added
Maturity: Experimental
Audience: Referees running BOTTLEBOUND Matches with the Referee Console
Action required: No
Finalized: 2026-08-23

## Summary

The Referee Console now provides a manual End Game from any Active Match with no open Action Draft. The referee opens a preview that shows the calculated winner and Decision Basis, then confirms one atomic transition to a read-only Ended Match. The Decision Basis applies in order: permanent Team Elimination, then Active-character counts, then Active-character HP totals, then one recorded digital Coin Flip between Drow and Duergar. Reopen Match restores the exact pre-End Game Active state. A compact device-local Match Summary (outcome, Decision Basis, final counts and HP, rulesVersion, end time) is written transactionally with each End Game, replaces the prior summary, and supports two confirmed removal paths. Legacy elimination-only Ended Matches remain readable without a Decision Basis line.

## User and operator impact

The referee can close a Match by judgment or time, not only by Team Elimination, and see which rule selected the result before confirmation. The Coin Flip resolves a remaining tie immediately with no animation and is recorded in the MatchEnded event; canceling the preview discards the flip. The Ended Match is read-only (no turn, attack, or correction commands), Undo is inert while Ended, and Reopen restores outcome to null with pre-existing elimination flags unchanged. The prior Match Summary stays visible during play, is replaced on the next End Game, and is removed either with the current Ended Match or alone without affecting the Active Match. Save and restore after a failed transaction or browser restart never shows a partial End Game, Reopen, Coin Flip, or summary change. All controls are large-target, high-contrast, and responsive on phone and tablet. Storage remains device-local IndexedDB, offline, with no export or personal data.

## Action required

None.

## Known issues

None known.

## References

- Feature specification: `.codebox/features/20260823-134840-manual-end-game-tiebreak-summary/spec.md`
- Wayfinder map: `.codebox/wayfinders/referee-console/map.md` (tickets W01, W04, W07, W11, W12)
- Verified state: `report.jsonl` (90 vitest, 14 Playwright, build/lint/format clean)
