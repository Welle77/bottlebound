# Release notes - Playable console completeness

Change: Added
Maturity: Experimental
Audience: Referees running BOTTLEBOUND Matches with the Referee Console
Action required: No
Finalized: 2026-08-24

## Summary

The referee can now run complete Matches from the console. A new Use Ability
command lists the active character's unspent abilities and guides each through
a draft shaped by its type: targeted attacks, physical bottle-contact attacks,
self abilities, and ally/enemy utility abilities. During Setup the referee can
give each of the twelve characters an optional Display Name that appears in
every roster, draft, review, and undo panel while the ruleset name stays
visible beside it. A device setting turns the four manual physical
confirmations in Action Drafts off and back on; destructive confirmations such
as Undo and End Game always stay.

## User and operator impact

Referees no longer need paper notes for spells and special actions. All 24
ability automations are reachable from the Active-turn screen, resolutions
commit as one atomic event, undo restores them exactly, and referee overrides
for state-invalid choices are recorded in the event log. Display Names are
stored inside the Match, survive offline restarts, and never change the
immutable rules data. The confirmation toggle persists per device with safe
fallbacks when storage is blocked. A rules audit against the authoritative
rules document closed small fidelity gaps: Shapeshift's immediate expiry now
also fires on the Basic Attack path, and Reopen Match preserves Display Names.

## Action required

None.

## Known issues

- Protective Reactions such as Divine Shield or Shield Wall can still protect
  an enemy character without a warning. Fixing this needs its own approved
  change because it rewrites deliberate existing behavior.
- Unfinished Action Drafts (Basic Attack and ability) are discarded on restart
  by design; only confirmed Action Resolutions persist.
- Physical judgments stay manual: forced movement distances, range, Line of
  Sight, cover, and the Powerful zero-movement constraint cannot be validated
  by the console.
- The Final Round clock remains referee-owned; there is no countdown banner.
- Both medium review findings were remediated and re-verified: Basic Attack
  review rows now preview effect-modified damage (Hunter's Mark, Hex, Rage,
  Vanish) through the shared pipeline, and the self-ability browser test is
  deterministic across repeated runs.

## References

- Authoritative rules: `bottlebound_rules_final.md`
- Feature record: `.codebox/features/20260823-210448-playable-console-completeness/`
