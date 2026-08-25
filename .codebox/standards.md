# Repository Standards

## Repository scope

- `bottlebound_rules_final.md` is the authoritative game-rules contract.
- `README.md` is the concise repository summary and must remain consistent with the rules contract.
- Treat gameplay terminology, values, timing, targeting, and resolution order as normative content.

## Rules integrity

- Do not silently change gameplay semantics during editorial or layout work.
- Make semantic rule changes explicit and verify all affected summaries, roster entries, ability cards, and quick-reference material for consistency.
- Preserve the document's established terminology and capitalization unless an approved change intentionally replaces a term everywhere it applies.
- Safety rules take precedence over game positioning and presentation concerns.

## Rules document changes

- Preserve the established Markdown heading hierarchy, tables, lists, emphasis, and overall rules structure unless the approved work explicitly changes them.
- Keep Markdown tables structurally valid and readable in rendered form.
- After every material rules edit, inspect the affected sections and all duplicated summaries or card fields for internal consistency.
- Reject changes that introduce malformed Markdown, broken tables, inconsistent heading levels, or ambiguous formatting.
- Keep ability-card fields and the referee quick reference consistent with the universal rules and roster.

## README changes

- Keep the README short and descriptive.
- Update its game summary when an approved rules change makes the existing summary inaccurate.

## Testing

- Tests never coexist with application code in the same folder. Test files live in a separate location from the modules they exercise.

## Tooling

- This repository currently has no configured build, lint, format, focused-test, or full-suite command.
- Do not invent or assume executable repository commands. Update `.codebox/constitution.md` when durable tooling is added.
