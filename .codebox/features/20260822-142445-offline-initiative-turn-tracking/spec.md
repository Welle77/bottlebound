---
slug: 20260822-142445-offline-initiative-turn-tracking
title: Offline initiative and turn tracking
branch: feature/offline-initiative-turn-tracking
target_branch: main
current_phase: ship
phases:
  planning: done
  code: done
  test: done
  review: done
  ship: blocked
gate_policy:
  planning: gate
  code: auto
  test: auto
  review: auto
  ship: gate
model_routing:
  default: frontier
  aliases:
    lightweight: [gpt-5.6-luna, claude-haiku-4.5]
    general: [gpt-5.6-terra, claude-sonnet-5]
    frontier: [gpt-5.6-sol, claude-opus-4.8]
---

# Offline initiative and turn tracking

## Problem Statement

The referee needs one reliable view of initiative during an outdoor BOTTLEBOUND Match. The rules document does not generate, order, save, or restore initiative. A browser restart must not lose the active slot or expose a partly saved command.

## Solution

Build a Chrome-only static PWA for one referee on one phone or tablet. The Referee Console loads the fixed 12-character Ruleset and creates a Setup Match at full HP. It generates the complete initiative result, starts Round 1, advances one slot per Finish Turn, and restores the last committed Match State offline.

Each confirmed command appends one Match Event and saves its resulting snapshot in one IndexedDB transaction. Confirmed Undo appends an Undo Event and restores the complete pre-event Match State. Discard Match removes the saved Match after deliberate confirmation and does not support Undo.

This feature tracks initiative only. The referee handles combat, HP changes, abilities, effects, Downed characters, and all physical judgments outside the Referee Console.

## User Stories

1. As a referee, I want Chrome to show when the app shell is ready offline, so that I can prepare before a Match.
2. As a referee, I want Match creation blocked when IndexedDB cannot complete a canonical write, so that I do not start without safe storage.
3. As a referee, I want the fixed 12-character roster loaded at full HP, so that Setup matches the authoritative rules.
4. As a referee, I want all initiative rolls generated in one action, so that Setup stays fast.
5. As a referee, I want each roll, modifier, total, and tie order visible, so that I can explain the result.
6. As a referee, I want exact ties resolved immediately, so that I do not need a separate physical tie procedure.
7. As a referee, I want a deliberate full reroll, so that an accidental reroll cannot replace the result.
8. As a referee, I want to discard Setup after confirmation, so that I can abandon it without saved residue.
9. As a referee, I want Start Match to open Round 1 at slot 1, so that the live order is unambiguous.
10. As a referee, I want the active character and next character emphasized, so that I can guide play quickly.
11. As a referee, I want the complete order, round, team, HP, and slot visible, so that I can check context without leaving the live view.
12. As a referee, I want Finish Turn as the only live Match command, so that unavailable combat controls do not distract me.
13. As a referee, I want Finish Turn to advance exactly one fixed slot, so that the digital order matches the physical Match.
14. As a referee, I want the round to increment after slot 12, so that each full pass has the correct round number.
15. As a referee, I want every confirmed command saved before the UI reports success, so that a restart restores a complete result.
16. As a referee, I want Setup and Active Matches restored after Chrome restarts, so that an interruption does not end the Match.
17. As a referee, I want Undo to preview the exact state change, so that I can check the correction before confirmation.
18. As a referee, I want repeated Undo commands to move backward through effective events, so that I can correct several mistakes.
19. As a referee, I want undone events to remain in history, so that the correction stays explainable.
20. As a referee, I want a failed save to leave the last committed state visible, so that the UI never claims an unsaved change.
21. As a referee, I want large, high-contrast controls without decorative animation, so that the console remains usable outdoors.
22. As a referee, I want responsive phone and tablet layouts, so that I can use the available Chrome device.

## Implementation Decisions

- Use pnpm, TypeScript, Vite, native DOM APIs, and CSS. Do not add a UI framework.
- Target current stable Chrome. Support Android phone and tablet layouts. Use desktop Chrome or Chromium for development and automated browser checks.
- Build a static same-origin PWA with a root service worker, a web app manifest, and a versioned app shell.
- Report offline readiness after the service worker controls the page and the required app shell is cached.
- Do not add special update deferral or activation code. Use the normal service-worker lifecycle.
- Do not add multi-tab coordination. Concurrent writable tabs are outside the supported operating model.
- Keep the immutable fixed Ruleset separate from Match State. Store stable team and character identifiers, `rulesVersion`, base HP, and initiative modifiers.
- Use browser cryptographic randomness for 12 d20 rolls and recorded digital coin flips inside equal-total groups.
- Record every roll, modifier, total, digital coin-flip result, and final tie order in the applicable initiative Match Event.
- Keep Match commands in a pure domain module. Inject the random source and current time where deterministic tests need them.
- Store Match metadata, append-only Match Events, and current snapshots in IndexedDB.
- Commit each event, snapshot, and sequence update in one read-write transaction.
- Change the visible Match State only after the transaction completes. On failure, keep the last committed state and show a blocking retryable error.
- Treat initiative generation, reroll, Start Match, Finish Turn, and Undo as atomic Match Events.
- Represent Undo as a new event that references the newest effective reversible event. Never change or remove prior event records.
- Make Discard Match a confirmed final deletion. It removes the saved Match and its event history.
- Restore only a complete compatible snapshot whose sequence, schema, rules version, and structural invariants pass checks.
- Show a recovery error instead of silently starting a new Match when saved canonical data is invalid.
- Use Vitest for domain and storage tests. Use Playwright for critical Chrome workflows.
- Use ESLint and Prettier. Add real build, lint, format-check, focused-test, and full-suite commands to the Codebox constitution.
- Before Review starts, update every declared dependency to the latest stable registry release and regenerate the lockfile.

## Match State and Event Rules

- A Match in this feature has Setup or Active phase. No Match represents the absence of saved Match data.
- Setup starts with the fixed roster at full HP and no initiative result.
- Start Match needs a complete 12-slot initiative order. It creates Round 1 with slot 1 active.
- Finish Turn advances to the next fixed slot. Finishing slot 12 increments the round and activates slot 1.
- This feature does not skip Downed characters because it does not change HP or implement Downed state.
- One Match Event has one increasing sequence number and one `rulesVersion`.
- The current snapshot records the sequence through which it is valid.
- `InitiativeGenerated` is valid only when Setup has no initiative result. `InitiativeRerolled` is valid only when Setup already has one.
- Undo ignores ineffective target events and prior Undo Events when it finds the newest effective reversible event.
- Repeated Undo commands move backward by one effective event at a time.
- Undo can move an Active Match back to its pre-Start Setup state.
- Undo of initiative generation restores Setup without an initiative result.
- Discard Match is not reversible and leaves no saved Match to restore.

## Testing Decisions

- Test the pure domain-command seam through its observable Match State and Match Events.
- Test fixed roster integrity, 12-result initiative generation, modifiers, total ordering, tied-group ordering, and stored random outcomes.
- Test recorded digital coin flips for exact ties and reject corrupted Generate or Reroll event transitions during restore.
- Test Setup transitions, confirmed reroll behavior, Start Match, every slot transition, and the round boundary.
- Test Undo previews, repeated Undo, event references, restored Match State, and retained append-only history.
- Test the storage adapter with real IndexedDB behavior in an isolated browser or compatible test environment.
- Test atomic commit, transaction failure, interrupted writes, restore, invalid snapshots, incompatible versions, and final deletion.
- Test the full referee paths in Playwright: offline readiness, create, generate, reroll, discard, start, Finish Turn, restart, restore, and Undo.
- Test responsive layouts at representative phone and tablet viewports. Check keyboard focus, contrast, and touch target size.
- Do not replace physical checks with browser simulation. Keep sunlight, one-hand, damp-finger, and Match-duration heat checks in the manual release checklist.

## Acceptance Criteria

1. The production build contains a manifest, a root service worker, and every asset needed for an offline cold launch after initial installation.
2. The UI distinguishes online status, service-worker control, offline readiness, and canonical-storage readiness.
3. Match creation remains unavailable when the canonical IndexedDB write probe fails.
4. The fixed Ruleset contains exactly the 12 authoritative characters with correct teams, HP, and initiative modifiers.
5. Generate Initiative creates exactly 12 d20 values between 1 and 20 and applies each fixed modifier.
6. The complete order sorts by descending total and uses recorded fair digital coin flips for every equal-total group.
7. The Setup view shows every roll, modifier, total, slot, team, and character.
8. Reroll and Discard Match need deliberate confirmation.
9. Reroll replaces the complete initiative result through one committed Match Event.
10. Start Match needs a complete initiative result and opens Round 1 with slot 1 active.
11. The Active view shows the active character, next character, complete order, round, team, HP, and slot.
12. The Active view shows Finish Turn as its only live Match command and states that the feature tracks initiative only.
13. Each Finish Turn advances exactly one slot. Slot 12 advances to slot 1 and increments the round once.
14. Initiative generation, reroll, Start Match, Finish Turn, and Undo each commit one event and one matching snapshot atomically.
15. A failed transaction leaves the visible and stored Match State at the last completed sequence.
16. A Chrome restart restores the exact last committed Setup or Active Match without network access.
17. Undo shows the complete pending state change and needs confirmation.
18. Confirmed Undo restores the exact pre-event Match State and appends a referencing Undo Event.
19. Repeated Undo moves backward through effective reversible events without removing history.
20. Confirmed Discard Match removes the saved Match and event history and cannot be undone.
21. Invalid or incompatible saved data produces a recovery error and does not create replacement Match data.
22. Main controls have at least a 48-pixel target size, strong contrast, visible focus, and no decorative animation.
23. The layout remains usable at representative Chrome phone and tablet viewports.
24. The repository provides working pnpm commands for build, lint, format-check, focused tests, and the full suite.
25. The manual release checklist covers offline restart, sunlight, one-hand use, damp-finger use, and Match-duration device heat.
26. Every declared dependency uses the latest stable registry release available when Review starts, and the regenerated lockfile resolves that dependency set.

## Out of Scope

- Basic Attacks, Action Drafts, HP changes, abilities, Reactions, effects, Downed-state skipping, revival, team elimination, and End Game.
- Contextual rules help, rules search, Match summaries, Reopen Match, and export.
- Custom rosters, player names, accounts, online synchronization, analytics, and remote APIs.
- A Match clock, Final Round mode, digital battlefield map, and automated physical judgments.
- Multi-tab coordination and special service-worker update deferral.
- Firefox, Safari, Edge, and non-Chrome browser support.

## Further Notes

The authoritative gameplay rules remain in `bottlebound_rules_final.md`. The Referee Console does not change those rules. W01, W02, W03, W04, W05, W08, and W09 in the referee-console Wayfinder supply the planning evidence.
