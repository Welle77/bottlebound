# Tickets — Enable ESLint complexity with default values

Sequential tracer-bullet chain. Each ticket leaves the existing lint gate
green. The final ticket enables the new rule after every known violation is
removed. There are no Parallel groups.

## T01: Simplify Ruleset ability inference

**Blocked by:** None (can start immediately).

**Status:** done

Split ability-structure inference into named, behavior-preserving decisions.
Keep every derived action type, interaction, target policy, manual check, and
operation unchanged.

- [x] The Ruleset contract tests pass.
- [x] The affected functions have default complexity at or below 20.
- [x] No rule suppression or Ruleset data change exists.

## T02: Simplify application actions and the Active Match board

**Blocked by:** T01.

**Status:** done

Split confirmation dispatch and derived Active Match view construction into
small named operations. Preserve all controls, confirmation behavior, text,
focus, and rendered Match information.

- [x] Focused shell and browser checks pass.
- [x] The affected TypeScript and Svelte functions have complexity at or below
      20.
- [x] No rendered behavior or rule suppression changes.

## T03: Simplify ability resolution and target selection

**Blocked by:** T02.

**Status:** done

Split ability validation, target selection, reaction handling, effect
application, and result construction into named operations. Preserve every
ability, Override, Reaction, attack leg, effect, and elimination result.

- [x] Focused ability and Reaction tests pass.
- [x] The affected functions have complexity at or below 20.
- [x] No gameplay behavior or rule suppression changes.

## T04: Simplify Basic Attack and turn resolution

**Blocked by:** T03.

**Status:** done

Split Basic Attack resolution and turn progression into named operations.
Preserve initiative, attack contacts, Reactions, damage, effects, skipped
slots, rounds, and elimination behavior.

- [x] Focused attack, turn, and elimination tests pass.
- [x] The affected functions have complexity at or below 20.
- [x] No gameplay behavior or rule suppression changes.

## T05: Simplify Match history validation and replay

**Blocked by:** T04.

**Status:** done

Split Match State and Match Summary structure checks plus historical replay
into smaller validators and event handlers. Preserve accepted data, rejected
data, replay results, Undo behavior, and summary output.

- [x] Focused history, replay, and Match tests pass.
- [x] The affected functions have complexity at or below 20.
- [x] No persistence compatibility or rule suppression changes.

## T06: Simplify canonical Match Event validation

**Blocked by:** T05.

**Status:** done

Split canonical Match Event validation into event-specific checks. Preserve
the exact event vocabulary, field checks, sequence rules, accepted records,
and rejection behavior.

- [x] Canonical-event audit and contract tests pass.
- [x] Every affected validator has complexity at or below 20.
- [x] No validation weakening or rule suppression exists.

## T07: Simplify canonical state, commit, and store validation

**Blocked by:** T06.

**Status:** done

Split canonical state checks, commit invariants, restore checks, and store
control flow into named operations. Preserve transaction behavior and the
single-schema persistence contract.

- [x] Focused canonical-state, commit, and store tests pass.
- [x] Every affected function has complexity at or below 20.
- [x] No schema, transaction, error-contract, or suppression change exists.

## T08: Enable the repository-wide complexity rule

**Blocked by:** T07.

**Status:** done

Enable core `complexity` at error severity without options. Prove the rule
uses ESLint's defaults across representative TypeScript and Svelte files and
reports no repository violations.

- [x] Resolved configs enable `complexity` without custom options.
- [x] `pnpm run lint` exits successfully with zero violations.
- [x] No suppression, file exception, alternate variant, or custom maximum
      exists.
