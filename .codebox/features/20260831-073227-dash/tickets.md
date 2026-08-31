# T01: Record and use Dash

**What to build:** Add an end-to-end Dash action that the referee can select
in an active Match, which spends both movement points, prevents further normal
action in that turn, persists through the canonical event history, and resets
on the next turn.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [x] An active, non-Downed character can Dash exactly once per turn; the
      resulting state records zero remaining movement and no further normal
      action.
- [x] Dash is rejected when the source is inactive, Downed, already dashed, or
      otherwise has consumed the turn economy; existing action rules remain
      intact.
- [x] `finishTurn()` resets Dash movement state for the next active turn.
- [x] Dash events pass canonical validation, replay, persistence, and undo
      behavior without changing existing historical action semantics.
- [x] The active-match UI exposes Dash and reflects its disabled/used state.
- [x] Focused domain, storage/replay, and browser acceptance checks pass.
