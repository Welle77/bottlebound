---
slug: 20260822-162623-offline-rules-reference-search
title: Offline rules reference and search
branch: feature/offline-initiative-turn-tracking
target_branch: main
current_phase: done
phases:
  planning: done
  code: done
  test: done
  review: done
  ship: done
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
  phases:
    planning: frontier
---

# Offline rules reference and search

## Problem Statement

The referee needs fast access to the complete BOTTLEBOUND Ruleset before and
during a Match. The current Referee Console gives no rules help. A referee must
leave the console or use another document, which is unreliable during offline
outdoor play.

The help content must match the Ruleset for the active Match. Opening help must
not change committed Match State or remove a pending confirmation.

## Solution

Add one global Rules control and a version-bound rules surface to the static
PWA. The surface opens as a modal bottom sheet on a phone and a modal side
panel on a tablet. It contains the complete authoritative Ruleset, a section
contents list, full-text search, contextual links, stable source anchors, and
the visible rules version.

Generate the reference and search records from the authoritative Markdown at
build time. Use a maintained CommonMark parser and a strict sanitization
allowlist. Bundle the generated artifact in the existing application shell so
the complete surface works after an offline cold launch.

## User Stories

1. As a referee, I want to open Rules before Match creation, so that I can prepare without another document.
2. As a referee, I want to open Rules during Setup, so that I can check initiative and roster rules.
3. As a referee, I want to open Rules during an Active Match, so that I can answer a rules question without leaving live control.
4. As a referee, I want the current bundled Ruleset before Match creation, so that the content has an explicit version.
5. As a referee, I want help bound to the active Match's `rulesVersion`, so that the console never mixes Rulesets.
6. As a referee, I want a clear version error when matching content is unavailable, so that the console never substitutes different rules.
7. As a referee, I want Rules to leave Match State unchanged, so that reading help cannot affect play.
8. As a referee, I want Rules to preserve an open confirmation, so that I can check a rule before I decide.
9. As a referee, I want the phone surface at the bottom, so that it remains usable with one hand.
10. As a referee, I want the tablet surface at the side, so that I retain useful Match context.
11. As a keyboard user, I want focus kept inside Rules, so that the modal has predictable navigation.
12. As a keyboard user, I want focus returned to the opening control, so that I can continue from the same place.
13. As a referee, I want Close and Escape to dismiss Rules, so that dismissal remains deliberate and accessible.
14. As a referee, I want backdrop taps ignored, so that an outdoor touch mistake does not close Rules.
15. As a referee, I want a section contents list before search, so that I can browse the complete Ruleset.
16. As a referee, I want direct access to the roster, abilities, universal rules, and quick reference, so that common destinations need few steps.
17. As a referee, I want search to ignore case and punctuation, so that exact typing is unnecessary.
18. As a referee, I want every query term in each result, so that each result answers the complete query.
19. As a referee, I want exact titles and names first, so that named rules and cards appear immediately.
20. As a referee, I want an ability card before broader sections with the same name, so that the specific card wins.
21. As a referee, I want deterministic result order, so that repeated searches remain predictable.
22. As a referee, I want all results without pagination, so that the small fixed Ruleset remains easy to scan.
23. As a referee, I want matching terms highlighted in excerpts, so that I can see why each result matched.
24. As a referee, I want a result to open the complete document at its source anchor, so that nearby context remains visible.
25. As a referee, I want the rules version visible while reading, so that I can check the source identity.
26. As a referee, I want initiative, tie-break, turn, round, and Undo links in context, so that current controls open the relevant rule.
27. As a referee, I want my query and selected source retained after temporary closure, so that I can return to the same question.
28. As a referee, I want the rules scroll position retained after temporary closure, so that I can continue reading.
29. As a referee, I want all retained help state reset when `rulesVersion` changes, so that state never crosses Rulesets.
30. As a referee, I want Rules and search after an offline cold launch, so that network loss does not remove help.
31. As a maintainer, I want malformed rules structure to stop the build, so that the application never omits content silently.
32. As a maintainer, I want structured Ruleset data checked against the authoritative Markdown, so that roster and card data cannot drift.

## Implementation Decisions

- Treat `rulesVersion` as the identity of the complete Ruleset. It covers universal rules, roster data, ability cards, and quick reference.
- Use the current bundled `rulesVersion` when no Match exists. Use the saved Match's `rulesVersion` when a Match exists.
- Never fall back to another Ruleset. A missing version produces a rules-surface error and leaves the Match unchanged.
- Add one global Rules control. Keep it available before Match creation, during Setup, and during an Active Match.
- Use one semantic modal component. CSS changes it from a bottom sheet to a side panel at the existing responsive breakpoint.
- Keep modal state outside Match State and IndexedDB. It contains open state, query, selected anchor, scroll position, and the opening control.
- Preserve modal state for the current page lifetime. Reset it only when the applicable `rulesVersion` changes.
- Preserve any active reroll, discard, or Undo confirmation beneath Rules. Restore the confirmation and prior focus after Rules closes.
- Trap focus inside Rules. Close it through the Close control or Escape. Ignore backdrop taps.
- Show a section contents list for an empty query. Give direct access to the roster, abilities, universal rules, and quick reference.
- Open a selected result in the complete Ruleset at a deterministic source anchor. Keep nearby content and the rules version visible.
- Add contextual source links for initiative generation, exact tie breaks, turns, rounds, and Undo. Do not add future combat help.
- Generate one immutable, versioned reference artifact from `bottlebound_rules_final.md` during the build.
- Use a maintained CommonMark parser during the build. Sanitize generated HTML through a strict allowlist before bundling it.
- Do not ship a runtime Markdown parser or fetch rules content at runtime.
- Generate deterministic anchors and typed search records for universal sections, roster entries, ability cards, and quick-reference content.
- Stop the build on malformed card fields, duplicate anchors, unsupported required structure, or incomplete source coverage.
- Build the search index from the same generated records as the rendered reference. Do not maintain a second rules summary.
- Normalize case and punctuation into query terms. Remove empty and repeated terms.
- Require every normalized query term to match within one result record.
- Rank exact normalized titles and names first. Rank ability cards before broader sections for the same query.
- Use stable source order as the final rank key. Show every result because the fixed Ruleset is small.
- Show a short matching excerpt and highlight every matched term without changing the source text.
- Extend the immutable structured Ruleset with source anchors, roles, Basic Attacks, and verbatim ability-card fields needed by reference and drift checks.
- Do not add combat automation, target policies, Match commands, or objective operation execution in this feature.
- Check structured roster and ability-card fields against the parsed authoritative Markdown.
- Bundle the reference artifact and search index into the existing application asset. Bump the service-worker cache version.
- Keep the existing app-shell readiness check as the offline boundary because it covers the bundled application asset.
- Use only current stable direct dependencies when Review starts. Regenerate the lockfile after dependency changes.

## Testing Decisions

- Test behavior through three public seams: the pure rules search API, the Ruleset contract, and browser workflows.
- Unit-test source parsing, sanitization, deterministic anchors, query normalization, all-term matching, rank tiers, source ordering, excerpts, highlights, and version mismatch.
- Test build failures for malformed card fields, duplicate anchors, unsupported required structure, and incomplete source coverage.
- Extend the Ruleset contract test to compare roles, HP, initiative, Basic Attacks, and every searchable ability-card field with the authoritative Markdown.
- Test the modal through Playwright in both configured phone and tablet projects.
- Check layout mode, focus trap, Escape, ignored backdrop taps, scroll containment, and focus restoration.
- Check access before Match creation, during Setup, and during an Active Match.
- Check that Rules preserves committed Match State, Match Events, and each supported confirmation.
- Check query, selected anchor, scroll position, and opening-control restoration within one page lifetime.
- Check that a version change resets retained help state and that an unavailable version never falls back.
- Extend offline cold-launch coverage to open, search, and read the complete bundled Ruleset without a network connection.
- Run focused checks during Code. Test owns acceptance coverage and one configured full-suite run.

## Acceptance Criteria

1. [x] A Rules control remains available before Match creation, during Setup, and during an Active Match.
2. [x] Without a Match, Rules uses the current bundled `rulesVersion`.
3. [x] With a Match, Rules uses only the Match's saved `rulesVersion`.
4. [x] Missing matching content produces a clear version error and never substitutes another Ruleset.
5. [x] Opening, using, and closing Rules never changes committed Match State or Match Events.
6. [x] Rules preserves each supported open confirmation and restores it unchanged after close.
7. [x] Rules renders as a modal bottom sheet on the phone layout and a modal side panel on the tablet layout.
8. [x] The modal traps focus and returns focus to the exact opening control after close.
9. [x] The Close control and Escape dismiss Rules. Backdrop taps do not dismiss it.
10. [x] An empty query shows section contents and direct links to the roster, abilities, universal rules, and quick reference.
11. [x] The bundled reference contains every authoritative rules section, roster entry, ability card, and quick-reference row.
12. [x] Every reference source has a unique deterministic anchor.
13. [x] A selected contents item, contextual link, or search result opens the complete document at its source anchor.
14. [x] The source view keeps nearby context and the applicable rules version visible.
15. [x] Search ignores case and punctuation and removes empty or repeated terms.
16. [x] Every returned record matches every normalized query term within that record.
17. [x] Exact titles and names rank before partial matches.
18. [x] Ability cards rank before broader sections for the same ability-name query.
19. [x] Stable source order resolves all remaining ranking ties.
20. [x] Search shows every result with a short excerpt and highlighted matching terms.
21. [x] Contextual links cover initiative generation, exact tie breaks, turns, rounds, and Undo.
22. [x] The query, selected source, scroll position, and opening control survive temporary close within one page lifetime.
23. [x] A changed `rulesVersion` resets all retained help state.
24. [x] The complete rules surface and search work after an offline cold launch.
25. [x] The production build bundles the sanitized reference and search index without a runtime Markdown parser or runtime rules fetch.
26. [x] The build fails with a precise source error for malformed required fields, duplicate anchors, unsupported required structure, or incomplete coverage.
27. [x] Contract checks fail when structured roster, Basic Attack, or ability-card fields drift from `bottlebound_rules_final.md`.
28. [x] Main controls retain at least a 48-pixel target, strong contrast, visible focus, and scroll containment in phone and tablet layouts.
29. [x] The configured build, lint, format-check, focused-test, and full-suite commands pass.
30. [x] Every direct dependency uses the latest stable release available when Review starts, with a regenerated lockfile.

## Out of Scope

- Action Draft help, target warnings, Reaction prompts, active-effect details, and Finish Turn effect-expiry previews.
- Basic Attack resolution, HP changes, abilities, Reactions, effects, Downed characters, team elimination, and End Game.
- Combat automation operations, target policies, warning evaluation, and effect triggers.
- Match summaries, Reopen Match, export, custom Rulesets, and online rules data.
- Persistent rules-search history across page reloads or browser restarts.
- Changes to authoritative gameplay semantics.

## Further Notes

The authoritative gameplay contract remains `bottlebound_rules_final.md`.
W03, W06, and W10 in the referee-console Wayfinder supply the feature boundary
and prior decisions. This feature runs on the existing
`feature/offline-initiative-turn-tracking` branch because Codebox entered from
that non-target branch and preserved the dirty worktree.
