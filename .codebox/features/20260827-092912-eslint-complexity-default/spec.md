---
slug: 20260827-092912-eslint-complexity-default
title: Enable ESLint complexity with default values
branch: feature/eslint-complexity-default
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
  default: lightweight
  aliases:
    lightweight: [gpt-5.6-luna, claude-haiku-4.5]
    general: [gpt-5.6-terra, claude-sonnet-5]
    frontier: [gpt-5.6-luna, gpt-5.6-sol, claude-opus-4.8]
  phases:
    planning: frontier
---

# Enable ESLint complexity with default values

## Problem Statement

The repository does not limit cyclomatic complexity. Large functions can add
many independent control-flow paths while the lint gate still passes. This
makes domain rules, persistence validation, and Referee Console behavior harder
to understand and change safely.

## Solution

Enable ESLint's core `complexity` rule at error severity with no option value.
This uses ESLint's documented defaults: a maximum complexity of 20 and the
classic McCabe variant. Apply the rule to every file that ESLint checks.

Refactor every current violation into smaller, named units. Preserve all
observable behavior. Do not add suppressions, file exceptions, scoped rule
disables, or a higher threshold.

## User Stories

1. As a developer, I want ESLint to reject functions above the default
   complexity limit, so that new control-flow growth stops at the lint gate.
2. As a developer, I want the rule to cover TypeScript and Svelte code, so
   that the same maintainability contract applies across the repository.
3. As a developer, I want complex domain operations split into clear units,
   so that I can change Match behavior with less regression risk.
4. As a developer, I want persistence validators split without weaker checks,
   so that stored Match State stays strict and single-schema.
5. As a referee, I want the Referee Console behavior to stay unchanged, so
   that the tooling change does not disrupt a Match.
6. As a maintainer, I want no complexity suppressions or exceptions, so that
   the configured limit remains meaningful.
7. As a maintainer, I want all existing checks to pass after each refactor, so
   that the branch stays usable throughout implementation.

## Implementation Decisions

- Configure the core rule as `"complexity": "error"`. Omitted options are
  intentional and use ESLint's documented default values.
- Apply the rule without a file selector, so every file in the existing ESLint
  scope receives the same limit.
- Refactor all 17 known violations across 13 production files before the final
  configuration ticket enables the rule.
- Preserve behavior through extraction and simpler control flow. Do not change
  Match rules, persistence formats, user interactions, or rendered content.
- Keep the single-schema persistence decision intact. Refactored validators
  must accept and reject the same values as before.
- Add no rule suppression, disable comment, file exception, alternate variant,
  or custom maximum.
- Keep dependency versions and the existing ESLint scope unchanged.

## Testing Decisions

- Good tests check public behavior and independently observable results. They
  do not assert helper structure or extraction details.
- Use the existing Ruleset, Match domain, canonical storage, and browser seams
  for focused checks after the related refactors.
- Add a focused test only when an extraction exposes behavior that the current
  suite does not cover.
- Use ESLint's resolved configuration for representative TypeScript and Svelte
  files to prove that `complexity` is enabled without custom options.
- `pnpm run lint` is the feature acceptance gate for zero complexity
  violations. Test owns one complete `pnpm run test` execution.

## Acceptance Criteria

1. ESLint enables core `complexity` at error severity for every linted file.
2. The rule uses `max: 20` and `variant: "classic"` through omitted options.
3. `pnpm run lint` reports no complexity violations.
4. No complexity suppression, exception, or custom threshold exists.
5. All refactors preserve Match, storage, Ruleset, and Referee Console
   behavior under the existing tests.
6. The configured build, format, focused-test, and full-suite checks pass in
   their owning phases.

## Out of Scope

- A custom complexity threshold or modified complexity variant.
- New lint dependencies, broader lint discovery, or dependency upgrades.
- Gameplay, persistence-schema, interface, or content changes.
- Unrelated cleanup in functions that already satisfy the default limit.
- Changes to repository standards or the Ship workflow.

## Further Notes

- ESLint documents `max: 20` and `variant: "classic"` as the rule defaults:
  <https://eslint.org/docs/latest/rules/complexity>
- Planning measured 17 violations: 16 TypeScript functions and one Svelte
  derived-view function.
- The repository standards still contain an unrelated stale Tooling note.
  This feature does not change it.
