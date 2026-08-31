# Ruleset guides application-owned Match Configuration

The human-authored Ruleset guides Referee Console behavior but does not supply executable data. The application owns immutable Match Configuration, while the Rules Reference treats the bundled Markdown as informational content. This duplicates some values, but it prevents editorial document structure from changing or breaking Match behavior and makes every runtime change explicit in application code.

## Consequences

- Match Configuration changes need explicit application review and tests.
- The application does not run automated parity checks against the Ruleset.
- The Rules Reference can change its headings, numbering, order, and positions without changing Match behavior.
