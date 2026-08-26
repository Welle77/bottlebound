# Release notes - Convert the Referee Console UI to Svelte

Change: Changed
Maturity: N/A
Audience: Referee Console users (the referee) and contributors to the BOTTLEBOUND support app
Action required: No
Finalized: 2026-08-26

## Summary

The Referee Console now renders its entire interface through Svelte 5 components
backed by a reactive runes store instead of hand-managed string templates and
manual re-renders. The legacy renderer was fully removed, so exactly one
rendering path remains.

## User and operator impact

Referee behavior is unchanged. Match display, Action Draft flows, confirmations,
Overrides, Reactions, Match lifecycle controls, Display Names, prior Match
Summary, and the Rules reference modal all behave as before. The full existing
Playwright browser suite passes without modification, offline restart behavior
is preserved through the unchanged service worker, and build and lint commands
keep their same entry points (`pnpm run build` now also runs `svelte-check`).
Contributors can change one panel component without reasoning about the whole
DOM.

## Action required

None

## Known issues

None known

## References

- Feature specification: `.codebox/features/20260825-142937-convert-ui-to-svelte/spec.md`
- Execution outcomes: `.codebox/features/20260825-142937-convert-ui-to-svelte/report.jsonl`
