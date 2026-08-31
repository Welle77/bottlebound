---
slug: 20260831-104130-two-actions
title: Allow two free actions per turn
branch: feature/two-actions
target_branch: main
current_phase: review
phases:
  planning: done
  code: done
  test: done
  review: done
  ship: pending
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

The active Match and authoritative ruleset currently allow one Major Action per turn. The UI labels the full-movement action as Dash and blocks any second action. This prevents valid sequences such as Basic Attack → Basic Attack, Basic Attack → Ability, and Move → Move.

## Solution

Give every active character two actions per turn. Basic Attack, Ability, and Move each spend one action. Any two actions may combine in either order. Move keeps the existing full two-pace movement result, and its button label becomes Move. A second action needs no referee override.

## User Stories

1. As a referee, I want each active character to have two actions per turn, so that the turn matches the intended rules.
2. As a referee, I want to use two Basic Attacks in one turn, so that a character can attack twice without an override.
3. As a referee, I want to use a Basic Attack and an Ability in one turn, so that mixed action sequences work.
4. As a referee, I want to use two different Abilities in one turn when their normal ability rules allow it, so that the action pool does not restrict action type.
5. As a referee, I want to use Move twice in one turn, so that Move → Move remains a valid two-action sequence.
6. As a referee, I want to use Move before or after an attack or Ability, so that movement and action order remain flexible.
7. As a referee, I want the old Dash control to read Move, so that the interface matches the rules vocabulary.
8. As a referee, I want the action availability state to update after each action, so that I can see when the two-action allowance is spent.
9. As a referee, I want replay, undo, and persistence to preserve both actions, so that the match history remains deterministic.

## Implementation Decisions

- Replace the one-bit Major Action gate with a two-action turn allowance in the active Match state.
- Keep the existing full-movement command and event compatibility where practical, but expose it as Move in the UI and user-facing history labels.
- Remove the need for a second-Major-Action override for Basic Attacks and Abilities. Preserve unrelated ability overrides for invalid ability choices.
- Update command validation, replay validation, state reconstruction, and turn reset together so every action consumes one action and Finish Turn restores two.
- Keep ability spending rules unchanged. A second Ability must still obey each Ability card’s spent and targeting rules.
- Update action drafts, controls, undo state text, and browser coverage to describe the two-action allowance.
- Update the authoritative ruleset, duplicated ability wording, and referee quick reference to describe two actions and Move.

## Testing Decisions

- Test external command behavior at the domain seam for all representative action pairs.
- Test Move twice and mixed action sequences through replay and undo paths.
- Test that a third action fails and that Finish Turn restores the full allowance.
- Update browser tests to use the Move label and to check that controls remain available after one action.
- Run the repository’s configured test command if available; otherwise run the package scripts that exist in `package.json` and record the result.

## Out of Scope

- Changing movement distance, terrain rules, ability card effects, or ability spending rules.
- Adding partial movement or a separate movement editor.
- Changing the event name used by existing persisted Dash history unless compatibility requires it.

## Further Notes

The user confirmed that Move always spends one action and uses the full normal movement, making Move → Move the former Dash behavior.
