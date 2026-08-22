# Offline rules reference and search tickets

## T01: Open the complete Ruleset offline

**What to build:** A referee can open the complete, version-bound Ruleset
before or during a Match and read it offline in the responsive Rules modal.

**Blocked by:** None. This ticket can start immediately.

**Status:** done

- [x] Generate one immutable Ruleset reference from the authoritative Markdown during the build.
- [x] Use maintained CommonMark tooling and a strict sanitization allowlist without shipping a runtime parser.
- [x] Stop the build on malformed required fields, duplicate anchors, unsupported required structure, or incomplete coverage.
- [x] Generate unique deterministic anchors for all universal sections, roster entries, ability cards, and quick-reference content.
- [x] Extend the structured Ruleset with roles, Basic Attacks, source anchors, and searchable verbatim ability-card fields.
- [x] Check the structured roster and ability-card fields against the authoritative Markdown.
- [x] Add a global Rules control before Match creation, during Setup, and during an Active Match.
- [x] Use the current bundled Ruleset without a Match and the saved Match's Ruleset during a Match.
- [x] Show a clear version error without fallback when matching rules content is unavailable.
- [x] Show section contents and direct links for the roster, abilities, universal rules, and quick reference.
- [x] Render one accessible modal as a bottom sheet on phones and a side panel on tablets.
- [x] Bundle the reference in the existing application asset and bump the service-worker cache version.
- [x] Check complete source coverage, version binding, responsive layout, and offline cold-launch reading.

## T02: Search and navigate the Ruleset

**What to build:** A referee can search the complete Ruleset, understand why
results matched, and open the full reference at a stable source anchor.

**Blocked by:** T01: Open the complete Ruleset offline.

**Status:** done

- [x] Add a pure search boundary over the same records that render the reference.
- [x] Normalize case and punctuation and remove empty or repeated query terms.
- [x] Require every normalized query term to match within one result record.
- [x] Rank exact titles and names before partial matches.
- [x] Rank an ability card before broader sections for the same ability-name query.
- [x] Use stable source order as the final deterministic ranking key.
- [x] Show all results without pagination.
- [x] Show a short excerpt and highlight every matching term without changing source text.
- [x] Open contents items and search results in the complete reference at their source anchors.
- [x] Check normalization, matching, ranking, excerpts, highlights, anchors, and nearby source context.

## T03: Preserve live context around Rules

**What to build:** A referee can consult contextual rules help and return to
the exact live control, confirmation, search, and reading position.

**Blocked by:** T02: Search and navigate the Ruleset.

**Status:** done

- [x] Keep Rules state outside Match State and IndexedDB.
- [x] Preserve the query, selected anchor, scroll position, and opening control for the current page lifetime.
- [x] Reset all retained Rules state only when the applicable `rulesVersion` changes.
- [x] Preserve reroll, discard, and Undo confirmations beneath Rules.
- [x] Trap focus inside Rules and return focus to the exact opening control after close.
- [x] Close Rules through its Close control and Escape.
- [x] Ignore backdrop taps.
- [x] Add contextual links for initiative generation, exact tie breaks, turns, rounds, and Undo.
- [x] Keep the applicable Ruleset version visible while the referee reads contextual content.
- [x] Keep committed Match State and Match Events unchanged through every Rules interaction.
- [x] Check phone and tablet focus, scroll containment, confirmation preservation, and retained help state.
- [x] Check contextual links and version-reset behavior through browser workflows.

## Test and release boundary

The Codebox Test phase owns acceptance evidence, browser integration checks,
dependency freshness, and one configured full-suite run. Code tickets run only
focused checks for their owned behavior.
