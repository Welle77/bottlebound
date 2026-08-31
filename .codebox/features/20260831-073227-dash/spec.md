---
slug: 20260831-073227-dash
title: Dash action
branch: feature/dash
target_branch: main
current_phase: review
phases:
  planning: done
  code: done
  test: done
  review: running
  ship: skipped
gate_policy:
  planning: auto
  code: auto
  test: auto
  review: auto
  ship: skip
model_routing:
  default: lightweight
  aliases:
    lightweight: [opencode/muse-spark-1.2-contributor-free, gpt-5.6-luna, copilot/gpt-5.6-luna]
    general: [gpt-5.6-terra]
    frontier: [gpt-5.6-sol, copilot/gpt-5.6-sol, opencode/muse-spark-1.2-contributor-free]
  phases:
    planning: frontier
---

## Problem Statement

The Referee Console cannot record a character choosing to use both movement
points to run instead of taking movement and a Major Action separately.

## Solution

Add Dash as a dedicated non-attack action. A Dash spends the active character's
full two-paces movement allowance, records that the character may take no
further normal action during the turn, and remains undoable and replayable
through the existing canonical event path. Expose Dash in the active-match
controls.

## User Stories

1. As a referee, I want to record an active character dashing, so that the
   character's full movement is represented as one deliberate choice.
2. As a referee, I want Dash to consume both movement points, so that the
   character cannot receive additional normal movement in that turn.
3. As a referee, I want Dash to prevent a Basic Attack or Ability afterward,
   so that the turn economy matches the running rule.
4. As a referee, I want Dash to be unavailable to Downed or inactive
   characters, so that invalid turns cannot be recorded accidentally.
5. As a referee, I want Dash to reset when I finish the turn, so that the next
   active character starts with a fresh movement allowance.
6. As a referee, I want Dash to survive reload, replay, and undo, so that the
   canonical Match history remains trustworthy.
7. As a referee, I want a visible Dash control in an active Match, so that I
   can use the rule without manually editing Match data.

## Implementation Decisions

- Extend active Match State with an explicit two-paces movement allowance and
  remaining movement value. A fresh active turn starts with two remaining
  paces; Dash reduces it to zero and marks the normal action economy as
  consumed.
- Add a dedicated Dash Match Event and public domain command beside the
  existing Basic Attack and Ability commands. Dash carries the active source,
  the full two-paces expenditure, and the resulting no-further-action state;
  it is not represented as an attack-shaped ActionResolved event.
- Update event validation, canonical persistence, replay, and undo so the new
  event is part of the single current schema. Existing historical attack
  events retain their current interpretation.
- Keep ordinary physical movement referee-managed. This feature tracks the
  expenditure required to establish Dash, not the bottle's battlefield
  coordinates or path legality.
- Add an active-match Dash control using the existing command commit path. The
  control is disabled when the active Match is unavailable, the active
  character is Downed, or the movement/action economy has already been used.
- Reactions remain governed by their existing out-of-turn rules because they
  do not consume the reacting character's normal movement or Major Action.

## Testing Decisions

- Domain tests will verify successful Dash state and event results, invalid
  source/turn cases, repeated Dash rejection, and the inability to resolve a
  Basic Attack or Ability afterward.
- Turn tests will verify movement reset at `finishTurn()` and preservation of
  initiative behavior.
- Replay, canonical storage, and undo tests will verify the Dash event can be
  restored and safely rejected when malformed.
- A browser acceptance test will verify the visible Dash control, its disabled
  state after use, and the resulting turn status through the public UI.
- Tests will assert observable domain, persistence, and UI behavior rather
  than private helper implementation details.

## Out of Scope

- Tracking physical bottle coordinates or validating movement paths.
- Adding partial ordinary movement commands or a movement editor.
- Changing Reaction rules or the behavior of existing attacks and abilities.
- Changing the authoritative Markdown Ruleset in this feature.

## Further Notes

The existing Ruleset permits up to two normal paces and one Major Action in
either order. Dash is the explicit full-movement choice requested here; its
application state is authoritative for the action economy while physical
movement remains a referee judgment.
