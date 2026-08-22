# Offline initiative and turn tracking tickets

## T01: Installable offline Referee Console shell

**What to build:** Create the maintainable Chrome PWA foundation. A referee can load the shell, see offline and storage readiness, and understand why Match creation is unavailable.

**Blocked by:** None. This ticket can start immediately.

**Status:** done

- [x] Configure pnpm, TypeScript, Vite, native DOM APIs, CSS, ESLint, Prettier, Vitest, and Playwright.
- [x] Add a static app shell, web app manifest, root service worker, and versioned offline cache.
- [x] Show distinct network, service-worker, offline-readiness, and canonical-storage states.
- [x] Run a canonical IndexedDB write and removal probe before Match creation becomes available.
- [x] Keep the last safe UI state and show a blocking retryable error when the storage probe fails.
- [x] Establish responsive phone and tablet layout tokens, visible focus, high contrast, and 48-pixel main controls.
- [x] Add working build, lint, format-check, focused-test, and full-suite commands to the Codebox constitution.
- [x] Check the shell and readiness behavior with focused tests.

## T02: Create and restore initiative Setup

**What to build:** A referee can create the fixed-roster Setup, generate or reroll the complete initiative result, discard it, and restore the last committed Setup offline.

**Blocked by:** T01: Installable offline Referee Console shell.

**Status:** done

- [x] Bundle an immutable versioned Ruleset with the 12 authoritative character identifiers, teams, base HP values, and initiative modifiers.
- [x] Create Setup Match State with the fixed roster at full HP and no initiative result.
- [x] Generate 12 cryptographic d20 results and apply every fixed modifier in one command.
- [x] Resolve each exact-total group with recorded fair digital coin flips.
- [x] Show every roll, modifier, total, final slot, team, and character immediately.
- [x] Store the rolls, digital coin-flip results, and final tie order in the initiative Match Event.
- [x] Require confirmation before a full reroll or Discard Match.
- [x] Commit each initiative result, snapshot, and sequence update in one IndexedDB transaction.
- [x] Restore the exact last committed Setup after an offline Chrome restart.
- [x] Remove the Match and event history after confirmed Discard Match.
- [x] Reject incompatible rules data, invalid snapshots, and partial sequences without silent replacement.
- [x] Check Setup commands, initiative ordering, tied groups, transaction failure, restore, and deletion.

## T03: Start and advance an Active Match

**What to build:** A referee can start Round 1, see the selected Turn Command view, advance one fixed slot, cross round boundaries, and restore the Active Match offline.

**Blocked by:** T02: Create and restore initiative Setup.

**Status:** done

- [x] Require a complete 12-slot initiative result before Start Match becomes available.
- [x] Start Round 1 with slot 1 active through one atomic Match Event and snapshot.
- [x] Show the active character, next character, complete order, round, team, HP, and slot.
- [x] Show Finish Turn as the only live Match command.
- [x] State that this feature tracks initiative only and that the referee handles combat state.
- [x] Advance exactly one fixed slot for each confirmed Finish Turn.
- [x] Advance slot 12 to slot 1 and increment the round exactly once.
- [x] Commit each Finish Turn event, snapshot, and sequence update in one transaction.
- [x] Keep the last committed screen state when a transaction fails.
- [x] Restore the exact last committed Active Match after an offline Chrome restart.
- [x] Check every slot transition, the round boundary, failed writes, responsive layouts, and the critical Playwright path.

## T04: Undo committed Match Events

**What to build:** A referee can preview and confirm reversal of the newest effective event. Repeated Undo commands restore earlier states while all Match Events remain available after restart.

**Blocked by:** T02: Create and restore initiative Setup; T03: Start and advance an Active Match.

**Status:** done

- [x] Find the newest effective reversible initiative, Start Match, or Finish Turn event.
- [x] Ignore prior Undo Events and ineffective target events when the next Undo target is selected.
- [x] Show the complete Match State change before Undo confirmation.
- [x] Restore the exact pre-event Match State and append a referencing Undo Event atomically.
- [x] Support repeated Undo through effective events without removing or changing history.
- [x] Support Undo from Active back to Setup and from generated initiative back to empty Setup.
- [x] Persist the complete event history and restored snapshot through an offline restart.
- [x] Keep the last committed Match State when an Undo transaction fails.
- [x] Check target selection, preview data, repeated Undo, event references, exact restoration, failed writes, restart, and the critical Playwright path.

## Test and release boundary

The Codebox Test phase owns acceptance evidence, integration checks, Playwright checks, and the configured full suite. The manual release checklist covers sunlight, one-hand use, damp-finger use, and Match-duration device heat. Those physical checks remain outside automated tests.
