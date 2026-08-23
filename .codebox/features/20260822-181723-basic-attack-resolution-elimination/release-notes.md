# Release notes - Basic Attack resolution and elimination

Change: Added
Maturity: Experimental
Audience: Referees running BOTTLEBOUND Matches with the Referee Console
Action required: No
Finalized: 2026-08-23

## Summary

The Referee Console now guides Basic Attack resolution end to end. The referee drafts an attack, records hits and Reactions including redirected Attack Legs, confirms one atomic Action Resolution per attack, and sees HP, Downed state, used Reactions, and Team Elimination update immediately. Confirmed Undo reverses the newest effective event, and the full Match State restores offline after a reload or app restart.

## User and operator impact

The referee no longer tracks combat on paper during a Match. Attacks, Reaction redirections, HP loss, Downed characters, Team Elimination, elimination End Game, and Reopen Match are recorded as Match Events in local IndexedDB storage. Everything works without a network connection on phone or tablet. Historical Action Resolutions restore from their stored immutable evidence even when the bundled Ruleset version is unavailable.

## Action required

None.

## Known issues

Outdoor field validation remains outstanding: offline recovery, sunlight visibility, touch use, and Match-duration heat still need phone-and-tablet checks before live-Match reliance (Wayfinder ticket W08).

## References

- Feature specification: `.codebox/features/20260822-181723-basic-attack-resolution-elimination/spec.md`
- Wayfinder map: `.codebox/wayfinders/referee-console/map.md` (tickets W05, W11)
- Merged work on `main`: commit `83386b4`
