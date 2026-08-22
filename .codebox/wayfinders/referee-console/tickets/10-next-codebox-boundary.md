---
id: W10
type: task
status: closed
blocked_by: [W09]
claimed_by: active-wayfinder
---

# Define the second Codebox feature boundary

## Question

What is the smallest implementation-ready feature after offline initiative
and turn tracking?

## Resolution

The second Codebox feature is **Offline rules reference and search**.

This feature gives the referee fast rules help without changing Match State.
It also proves that the application can bind help content to the saved Match's
immutable `rulesVersion`. Combat is not the next safe slice because one Basic
Attack can trigger Reactions, Downed-slot rules, and permanent team
elimination.

### In scope

- Add a Rules control to the Setup and Active Match headers. Keep the control
  available when the device has no network connection.
- Open rules help over the current Match. Use a bottom sheet on a phone and a
  side panel on a tablet.
- Keep the current Match view and any confirmation state intact when the
  referee opens or closes rules help.
- Embed the complete authoritative rules reference in the production app
  shell. Bind its content and search index to the active Match's
  `rulesVersion`.
- Search core terms, universal rules, character names, roles, Basic Attacks,
  abilities, and the referee quick reference.
- Ignore case and punctuation during search. Require every entered term to
  match a result.
- Rank exact section titles, character names, and ability names first. Rank an
  ability card before a broader section for the same ability name.
- Show each result's title, source section, and a short matching excerpt.
- Open a result at its source anchor with nearby section context. Keep the
  rules version visible.
- Add direct help links for initiative generation, tie breaks, turns, rounds,
  and Undo where those concepts appear in the current interface.
- Add a consistency check between structured Ruleset records and the roster
  and card fields in `bottlebound_rules_final.md`.
- Include the rules content and search index in offline shell checks. Restore
  the exact active search or source view after a temporary close within the
  same page lifetime.
- Use the existing high-contrast, large-target, phone, and tablet interaction
  standards.

### Out of scope

- Action Draft help, target warnings, Reaction prompts, active-effect details,
  and Finish Turn effect-expiry previews.
- Basic Attack resolution, HP changes, abilities, Reactions, effects, Downed
  characters, team elimination, and End Game.
- Match summaries, Reopen Match, export, custom rules, and online rules data.
- Changes to the authoritative gameplay rules.

### Acceptance boundary

- A referee can open, search, read, and close the full rules reference during
  Setup or an Active Match without changing the committed Match State.
- Search follows the W06 matching and ranking rules for exact names, card
  fields, and broader rules sections.
- Each result opens version-bound source content with its title, anchor,
  nearby context, and rules version.
- The rules surface and search work after an offline cold launch.
- Phone and tablet checks cover the bottom-sheet and side-panel layouts,
  keyboard focus, scroll containment, and return to the unchanged Match view.
- A contract check fails when structured roster or ability-card fields drift
  from `bottlebound_rules_final.md`.

Codebox decides the smallest maintainable parser and search-index design during
Planning. The Wayfinder does not create implementation tickets.
