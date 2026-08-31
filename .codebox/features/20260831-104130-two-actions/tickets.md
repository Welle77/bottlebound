# Approved tickets

## 01: Implement two-action turn economy

**What to build:** Allow the referee to record any two valid actions per turn, including Move → Move, Basic Attack → Basic Attack, two valid Abilities, and mixed action sequences. Update the authoritative ruleset and keep replay, undo, persistence, turn reset, and the action controls consistent.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [x] Each active turn starts with two available actions.
- [x] Move, Basic Attack, and Ability each spend exactly one action.
- [x] Any second valid action succeeds without a Major Action override.
- [x] A third action fails until Finish Turn resets the allowance, unless the referee records an explicit legacy override.
- [x] Move is the visible label for the full-movement action.
- [ ] Replay, undo, persistence, and browser behavior preserve the new economy. Browser acceptance remains unrun because the local preview server could not start.
- [x] The ruleset and referee quick reference describe the same two-action economy.
- [x] A Powerful Ability uses one action and does not grant normal movement unless its card says so.
- [x] Ability-specific spending, targeting, restrictions, and explicit movement grants remain unchanged.
