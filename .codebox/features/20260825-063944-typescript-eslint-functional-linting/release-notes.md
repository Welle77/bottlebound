# Release notes - typescript-eslint and eslint-plugin-functional linting

Change: Changed
Maturity: N/A
Audience: Maintainers and contributors of the Referee Console repository
Action required: No
Finalized: 2026-08-25

## Summary

ESLint now runs type-checked typescript-eslint rules plus a curated immutability rule set from eslint-plugin-functional, and lint fails mechanically if any test file is placed inside an application folder. All colocated unit tests moved from `src/` into a mirroring `tests/` tree, and every surfaced violation was fixed outright with no suppressions.

## User and operator impact

Referee-facing behavior is unchanged. The full vitest suite (17 files / 92 tests) and the Playwright suite (76/76) pass against the final tree, and the build output keeps its shape (`app.js`, `style.css`, `index.html`). Contributors see stricter lint feedback during development; type-level defects such as floating promises and mutation-heavy patterns in Match State handling now surface at lint time instead of review time. The runtime dependency set grew by one pinned package (`immer`), used for Match State updates.

## Action required

None.

## Known issues

None known.

## References

- Feature spec: `.codebox/features/20260825-063944-typescript-eslint-functional-linting/spec.md`
- Repository standards including the enforced test-location rule: `.codebox/standards.md`
