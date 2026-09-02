# Release notes - Reaction damage mitigation

Change: Changed
Maturity: GA
Audience: Referees and players
Action required: Yes
Finalized: 2026-09-02

## Summary

Divine Shield and Shield Wall now block one damage each. Misty Escape, Mirror
Veil, and Deflecting Palm now use complete Attack Avoidance. The Referee
Console prevents redundant or conflicting Reaction choices and accounts for
Hunter's Mark, Hex, Rage, Vanish, attached effects, and multi-bottle attacks.

## User and operator impact

Several characters can combine Damage Blocks against stacked incoming damage.
Each useful block spends one Reaction and reduces one damage. Attack Avoidance
still prevents all damage and attached effects against its owner. The Rules
Reference and Match Configuration version are now `BB20260902A1`. Saved Matches
from the prior version can use the existing incompatibility path.

## Action required

If the Referee Console reports that a saved Match is incompatible, start a new
Match.

## Known issues

Some in-console guidance for Attack Avoidance still uses the older prevention
wording. The underlying behavior is unchanged.

## References

- `bottlebound_rules_final.md`
- Feature Spec and ticket evidence under
  `.codebox/features/20260902-063717-reaction-damage-mitigation/`
