# Release notes - Enable ESLint complexity with default values

Change: Changed
Maturity: N/A
Audience: Developers and maintainers of the Referee Console repository
Action required: No
Finalized: 2026-08-27

## Summary

ESLint now enforces its core cyclomatic-complexity rule across the repository
with the documented default limit of 20. Existing complex code was split into
smaller behavior-preserving units.

## User and operator impact

The Referee Console behavior, Match rules, persistence behavior, and rendered
content remain unchanged. Future functions above the default complexity limit
fail the lint gate.

## Action required

None

## Known issues

None known

## References

ESLint complexity rule documentation: https://eslint.org/docs/latest/rules/complexity
