# Release notes - Enforce max-lines 800 and split oversized modules

Change: Changed
Maturity: N/A
Audience: Developers working on the BOTTLEBOUND Referee Console repository
Action required: No
Finalized: 2026-08-23

## Summary

ESLint now enforces `max-lines` (800), `max-params` (default maximum 3), and
`prefer-const` across the source and test surface. The five previously
oversized files — the match engine and its suite, the match store and its
suite, and the application entry point — are split into focused modules, each
under 800 lines.

The full configured suite passes: vitest 16 files / 90 tests, Playwright 76
tests with zero failures. Eighteen previously failing browser tests were also
fixed in this change.

## User and operator impact

Referee Console behavior is unchanged. The refactor is behavior-preserving:
public module exports are preserved, contract-test callers migrated only in
argument shape, no gameplay semantics changed, and the rules document is
untouched.

Developer workflow changes:

- Files over 800 lines, functions over 3 parameters, and `let` bindings that
  are never reassigned now fail lint.
- Public domain commands (`endMatch`, `rerollInitiative`,
  `undoLastEvent`, `ruleSimultaneousElimination`, and four others) accept a
  trailing options/command object instead of separate positional parameters;
  all callers in the repository are already migrated.
- New dev tooling is part of the toolchain: the `@playwright/cli`
  dev dependency with its lockfile entries, Playwright CLI skill assets under
  `.opencode/skills/playwright-cli/`, and ignore entries for local
  `.playwright-cli/` and `.playwright/` state directories.

## Action required

None

## Known issues

None known

## References

- Lint configuration: `eslint.config.js`
- Split modules: `src/domain/`, `src/storage/`, `src/ui/`, `src/app/`
- Playwright CLI skill: `.opencode/skills/playwright-cli/SKILL.md`
