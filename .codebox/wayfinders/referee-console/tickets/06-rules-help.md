---
id: W06
type: task
status: closed
blocked_by: [W03]
claimed_by: active-wayfinder
---

# Define rules help

## Question

Which contextual reminders and search behavior give the referee useful rules help without obstructing live Match control?

## Resolution

Use one offline rules-help surface with two entry paths: contextual help and
full rules search. Both paths use the immutable Ruleset for the Match. They do
not use a separate summary as a rules source.

### Contextual help

- A Rules control remains available from the live Match header.
- An Action Draft shows the selected attack or ability's verbatim Target,
  Effect, and Duration fields.
- Manual checks appear at the step where the referee must make the physical
  judgment. Examples include range, Line of Sight, hits, Reaction timing, and
  safe movement.
- Known-state warnings appear beside the affected selection. They link to the
  rule that caused the warning and keep the W01 Override control available.
- The Reaction step shows each eligible character's trigger and effect before
  the referee selects a Reaction.
- Each active-effect badge opens its source ability, objective effect, expiry
  boundary, and source character.
- Finish Turn shows the effects that will expire or trigger before the referee
  confirms the turn change.

Contextual help opens as a bottom sheet on a phone and a side panel on a
tablet. Opening or closing help does not remove the Action Draft or change
Match State. Help never covers the Action Draft confirmation controls.

### Rules search

- Search works without a network connection and uses the saved Match's
  `rulesVersion`.
- Search covers core terms, universal rules, character names, roles, attacks,
  abilities, and the referee quick reference.
- Matching ignores case and punctuation. It matches all entered terms against
  titles, defined terms, card fields, and rules text.
- Results rank exact titles and names first. Ability cards come before broader
  rules sections when both match the same ability name.
- Each result shows a short matching excerpt, its section or card title, and a
  source anchor into the complete embedded rules reference.
- Opening a result shows the verbatim rule and nearby section context. It does
  not navigate away from the live Match.
- The rules version remains visible in the full reference. The Referee Console
  never mixes content from another rules version into an active Match.
