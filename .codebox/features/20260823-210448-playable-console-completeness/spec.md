---
slug: 20260823-210448-playable-console-completeness
title: Playable console completeness
branch: feature/playable-console-completeness
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
    frontier: [opencode/x-preview-f-free, muse-spark-1.2-contributor-free, opencode/muse-spark-1.2-contributor-free]
  phases:
    planning: frontier
  agents: {}
---

# Playable console completeness

## Problem Statement

A referee cannot run a full BOTTLEBOUND Match from the Referee Console today.
The Active-turn screen offers only Basic Attack, so none of the 24 automated
abilities can be chosen even though the domain layer resolves them. Characters
carry only their fixed Ruleset names, so the referee cannot match the console
to the physical miniatures on the table. Every Action Draft demands the four
manual physical confirmations even when the referee does not want them.

## Solution

The referee names each of the twelve fixed characters once during Setup; those
Display Names appear everywhere that character appears for the rest of the
Match. The Active-turn screen gains a Use Ability command beside Basic Attack.
It lists the active character's unspent abilities and guides each ability
through a draft shaped by its interaction type. A persisted console setting
lets the referee turn the four manual physical confirmations off or back on;
destructive confirmations (Undo, End Game, deletions) always stay.

## User Stories

1. As a referee, I want to choose one of the active character's abilities during its turn, so that I can resolve spells and special actions without paper notes.
2. As a referee, I want targeted Ability Attacks guided like Basic Attacks, so that damage, Reactions, and Downed state stay auditable.
3. As a referee, I want physical-attack abilities to reuse ordered bottle contacts, so that multi-hit ability throws resolve exactly like thrown attacks.
4. As a referee, I want self-abilities to confirm in one step, so that no-turnbook abilities cost me no extra taps.
5. As a referee, I want ally and enemy utility abilities to offer legal targets with relation and life-state guidance, so that invalid picks are visible before I commit.
6. As a referee, I want Spent abilities hidden from my choices, so that I cannot accidentally reuse an ability this Match.
7. As a referee, I want state-invalid ability choices to record an explicit Override, so that every referee judgment stays in the event log.
8. As a referee, I want a second Major Action to require the same recorded override as Basic Attack, so that turn discipline stays consistent across action types.
9. As a referee, I want ability resolutions to appear in Undo previews and restore exactly, so that mistakes never trap me.
10. As a referee, I want confirmed ability resolutions to survive an offline restart as saved Match state, so that a crash loses nothing already decided.
11. As a referee, I want to give each of the twelve characters a Display Name during Setup, so that the console matches the miniatures on my table.
12. As a referee, I want Display Names shown in initiative order, HP tables, drafts, reviews, undo panels, and summaries' team context, so that I never cross-reference two naming systems mid-play.
13. As a referee, I want the Ruleset name still visible beside each Display Name, so that contextual rules links keep pointing at the right rules text.
14. As a referee, I want Display Name edits recorded as reversible events before Start Match, so that Undo and restore behave exactly like every other setup change.
15. As a referee, I want Display Names stored inside the Match record, so that they survive an offline restart and never leak between Matches.
16. As a referee, I want a single console setting that disables the four manual physical confirmations, so that fast casual Matches need fewer taps.
17. As a referee, I want the setting persisted on this device, so that my preference survives restarts.
18. As a referee, I want destructive confirmations (Undo, End Game, discard, removal) to always remain, so that speed settings cannot weaken safety rails.
19. As a referee, I want the toggle to apply equally to Basic Attack and physical-attack ability drafts, so that behavior is predictable.
20. As a referee, I want the console validated against the authoritative rules document after these changes, so that everything needed to run a game is confirmed working or listed as a known gap.

## Implementation Decisions

- Ability entry: a **Use Ability** secondary button sits beside Basic Attack on
  the Active-turn screen. It opens an ability list of the active character's
  unspent, non-Reaction abilities from the immutable Ruleset.
- Ability drafts are shaped by `interaction`:
  - `targeted-attack`: pick exactly one target, then Reactions, then review —
    reusing the existing draft/review/confirm machinery where possible.
  - `physical-attack`: reuse the ordered-contact flow of Basic Attack,
    including Deflecting Palm redirection legs.
  - `self`: single confirm step.
  - `ally` / `enemy` / `utility`: target selection filtered by the ability's
    target policy (relation, life state), with self-defaults where the domain
    already defaults them.
- Domain commands (`resolveAbility`) remain the only mutation path; the UI
  supplies inputs and surfaces domain errors as Override prompts rather than
  duplicating validation.
- Wrong-active-character and already-Spent states surface as explicit override
  recordings, matching the existing warning/override vocabulary.
- Character Display Names: an editable name field per character in Setup phase
  only (before Start Match). Stored as a new reversible append-only event
  carrying the full display-name map, so Undo restores the prior map atomically
  and persistence/restore work unchanged through existing storage paths.
  Rendering shows Display Name primary and Ruleset name secondary.
- Physical-confirmation setting: one boolean persisted in device-local storage
  (console-level, not per-Match), default ON. When OFF, drafts mark all four
  checks satisfied automatically and hide the fieldset. The domain contract
  (confirmations must be true for physical attacks) is preserved by supplying
  satisfied confirmations. Destructive confirmation panels are untouched.
- Rules coverage audit: after implementation, implemented behavior is checked
  against `bottlebound_rules_final.md`; small gaps close within this feature,
  larger gaps become documented follow-ups in the report and release note.

## Testing Decisions

- Tests verify observable behavior at existing public seams: domain commands
  (`resolveAbility`, setup/lifecycle commands) and browser flows via Playwright.
  No tests against internal render helpers.
- Expected values come from independent sources: literal HP outcomes, the rules
  document, and the Ruleset data — never recomputed from implementation.
- Prior art: `src/domain/match-abilities` usage patterns in existing domain
  tests, `tests/browser/action-draft.spec.ts`, `tests/browser/setup.spec.ts`,
  and persistence tests under `src/storage/`.
- The full configured vitest suite runs once in Test; Playwright specs cover
  the three new user-facing flows end to end.

## Out of Scope

- Renaming characters after Start Match.
- Persistent nicknames shared across Matches.
- Custom teams, custom characters, or custom ability cards.
- Any automation of physical judgments (range, Line of Sight, movement, cover).
- Weakening or removing Undo/End Game/delete confirmations.
- Online sync, exports, or player-facing devices.

## Further Notes

- The glossary gained **Display Name** in `.codebox/context.md`.
- All 24 abilities are already domain-automated by the previous feature; this
  feature exposes and guides them, it does not add new automation semantics
  except where the audit finds small rule-fidelity gaps.
- Clarification: Action Drafts (Basic Attack and ability) are intentionally
  transient and live in memory only, matching the console's pre-existing
  design. Persistence covers committed Match Events and Match State; an
  unfinished draft is discarded on restart by design.
