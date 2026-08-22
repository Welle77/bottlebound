---
slug: referee-console
status: clear
---

# BOTTLEBOUND Referee Console

## Destination

Produce a clear route to an implementation-ready feature for a referee-only,
offline-first web console that manages the objective state of one BOTTLEBOUND
Match. The referee retains all physical judgments.

## Notes

- One referee uses one phone or tablet without a reliable internet connection.
- One action generates the complete initiative order immediately, without decorative animation.
- The first version uses the fixed 12-character ruleset.
- The Referee Console tracks only state that affects later play.
- The Referee Console automates objective state changes and effect expiry.
- A warning never blocks a referee override.
- A local event log supports undo.
- The Referee Console saves and restores the active Match locally.
- The referee selects End Game. The Referee Console has no clock or Final Round mode.
- The Referee Console detects team elimination and calculates tiebreak results.
- Local summaries contain no player names or other personal data.
- The Referee Console provides contextual help and a searchable rules reference.

## Decisions so far

- `Define the Match lifecycle` ([W01](tickets/01-match-lifecycle.md)) — Use four Match phases, explicit initiative movement, atomic Action Resolutions, strict structural invariants, and reversible End Game.
- `Choose the offline web architecture` ([W02](tickets/02-offline-web-architecture.md)) — Use a static PWA, a service-worker app shell, and transactional IndexedDB Match storage.
- `Define the fixed rules data contract` ([W03](tickets/03-rules-data-contract.md)) — Use immutable versioned rules data and a closed automation vocabulary that leaves physical judgments to the referee.
- `Define undo behavior` ([W04](tickets/04-event-corrections.md)) — Provide one confirmed, append-only Undo action that atomically reverses the newest effective event; omit correction and redo.
- `Prototype the live referee workflow` ([W05](tickets/05-live-workflow-prototype.md)) — Use an active-turn command screen with three main actions, compact team status, guided Action Drafts, and confirmed Undo.
- `Define rules help` ([W06](tickets/06-rules-help.md)) — Use offline contextual help and version-bound rules search from one immutable Ruleset without leaving the live Match.
- `Define the Match summary lifecycle` ([W07](tickets/07-summary-lifecycle.md)) — Keep one compact local summary until replacement or confirmed removal; retain full history only while Reopen Match remains available.
- `Test outdoor operation` ([W08](tickets/08-outdoor-validation.md)) — Accept the workflow as prototype-viable and require phone-and-tablet field checks for offline recovery, sunlight, touch use, and Match-duration heat.
- `Define the first Codebox feature boundary` ([W09](tickets/09-codebox-boundary.md)) — Start with an offline fixed-roster initiative and turn tracker that proves persistence, restore, live state, and confirmed Undo.
- `Define the second Codebox feature boundary` ([W10](tickets/10-next-codebox-boundary.md)) — Add an offline, version-bound rules reference and search before the application takes ownership of combat state.
- `Define the third Codebox feature boundary` ([W11](tickets/11-third-codebox-boundary.md)) — Add guided Basic Attack resolution, objective Reaction effects, HP and Downed state, elimination End Game, and exact Undo and restore.
- `Define the fourth Codebox feature boundary` ([W12](tickets/12-fourth-codebox-boundary.md)) — Complete the Match lifecycle with manual End Game, ordered tiebreak calculation, Reopen Match, and one local Match Summary.

## Not yet specified

None for the fourth Codebox feature boundary. Ability activation and general
effect work remain outside this boundary.

## Out of scope

- A Match clock or Final Round mode.
- A digital battlefield map.
- Automated judgments about hits, range, Line of Sight, movement, cover, timing, or safety.
- Player accounts or player-operated devices.
- Online synchronization.
- Custom teams, characters, or rules.
- Long-term player statistics.

## Codebox handoff

After **Basic Attack resolution and elimination** completes, start a fresh
`/codebox` invocation for **Manual End Game, tiebreak, and Match summary**. Use
this map, W01, W04, W07, W11, and W12 as planning context. Codebox performs its
own Grill and creates canonical feature artifacts before implementation.
