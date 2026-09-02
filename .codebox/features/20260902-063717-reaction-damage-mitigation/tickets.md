# T01: Balance Damage Blocks end to end

**What to build:** Make Divine Shield and Shield Wall each block exactly one
point of damage through the complete Referee Console path, while preserving
legal hits, attached effects, deterministic damage ordering, canonical Match
history, and consistent Ruleset guidance.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [x] Divine Shield and Shield Wall each reduce one point after Hunter's Mark
      and Hex increases and before Rage resolves.
- [x] Each affected character receives an independent Damage Block capacity;
      current HP and overkill do not reduce that capacity.
- [x] Redundant Damage Blocks are unavailable in the Action Draft and rejected
      without an Override through public Match commands.
- [x] Damage Blocks preserve legal physical hits and attached effects, while
      damage-triggered effects still follow finalized-damage conditions.
- [x] Action Draft choices and review previews match confirmed Basic Attack,
      targeted Ability Attack, and physical Ability Attack results.
- [x] The changed Reaction operation, Match Configuration version, canonical
      event validation, replay, undo, and Match Store restore remain
      consistent under the single current schema.
- [x] The universal rules, relevant ability cards, quick reference, executable
      Match Configuration, and generated Rules Reference describe Damage
      Blocks consistently.
- [x] Focused domain, application, browser, persistence, replay, and Rules
      Reference checks pass.

# T02: Make Attack Avoidance complete and exclusive

**What to build:** Make Misty Escape, Mirror Veil, and Deflecting Palm avoid
all damage and attached effects against their owner, exclude redundant
protection against that character, and preserve Deflecting Palm's observed
contact and same-attack redirection.

**Blocked by:** T01: Balance Damage Blocks end to end

**Status:** ready-for-agent

- [x] Misty Escape, Mirror Veil, and Deflecting Palm prevent every point of
      damage and every attached effect against their owner for one-, two-, and
      three-damage attacks.
- [x] Attack Avoidance and every other protective Reaction against the same
      character are mutually exclusive in the Action Draft and public Match
      commands, without an Override path.
- [x] Vanish suppresses protective Reaction choices when a physical attack
      cannot affect its protected character.
- [x] Misty Escape retains its immediate movement instruction after avoiding
      an attack.
- [x] Deflecting Palm records its triggering legal contact and redirects the
      same physical attack with its source, range, and attached effects intact
      for later legal contacts.
- [x] Review previews, confirmed Action Resolutions, canonical events, replay,
      undo, and Match Store restore preserve Attack Avoidance evidence.
- [x] The universal rules, three avoidance cards, quick reference, executable
      Match Configuration, and generated Rules Reference describe Attack
      Avoidance consistently.
- [x] Focused domain, application, browser, persistence, replay, and Rules
      Reference checks pass.
