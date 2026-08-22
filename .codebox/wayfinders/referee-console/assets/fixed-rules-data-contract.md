# Fixed rules data contract

## Decision

Represent the first ruleset as versioned, immutable data. Use a closed set of
target, trigger, duration, warning, and objective-effect values. Do not embed
arbitrary executable scripts in ability data.

The Markdown rules remain authoritative. The application data repeats only the
structure that the Referee Console needs for selection, warnings, resolution,
and rules help. Each record carries a stable source anchor and the applicable
rules version.

## Data boundaries

Keep four data boundaries separate:

1. `Ruleset` contains immutable teams, characters, attacks, abilities, text, and automation definitions.
2. `Match State` contains the current initiative, HP, spent abilities, effects, slots, teams, and outcome.
3. `Action Draft` contains unconfirmed action, target, hit, and Reaction selections.
4. `Match Event` contains one confirmed state transition under a specific rules version.

W04 defines the final Match Event and Undo Event envelopes. This contract
defines the rules references and objective operations that those events use.

## Ruleset envelope

```text
Ruleset
  schemaVersion: integer
  rulesVersion: string
  sourceDocument: "bottlebound_rules_final.md"
  teams: Team[]
  characters: Character[]
  abilities: Ability[]
  universalRules: UniversalRule[]
```

Every identifier uses stable lowercase kebab-case. Display names remain
separate from identifiers. A saved Match stores `rulesVersion`; it never
silently adopts a different rules version.

## Team and character records

```text
Team
  id: team-id
  name: display text
  characterIds: character-id[6]

Character
  id: character-id
  teamId: team-id
  className: display text
  role: striker | skirmisher | tank | controller | spellcaster | support
  baseMaxHp: 3 | 4 | 5
  initiativeModifier: integer
  basicAttack: BasicAttack
  abilityIds: ability-id[2]
  sourceAnchor: string

BasicAttack
  attackType: melee | ranged
  rangePaces: 2 | 6
  interaction: physical-hits
  damage: 1
  usage: unlimited
  manualChecks: [range, line-of-sight, physical-hit, terrain-contact]
```

Roles are descriptive values. The rules engine never derives bonuses or
permissions from a role.

## Ability record

```text
Ability
  id: ability-id
  characterId: character-id
  name: display text
  actionType: standard | powerful | reaction
  usage: once-per-match
  attackType: none | melee | ability-attack
  interaction: self | single-target | multi-target | physical-hits | reaction
  targetPolicy: TargetPolicy
  range: self | { paces: integer }
  lineOfSight: yes | no | not-applicable
  ballRequired: boolean
  reactionTrigger: Trigger | none
  manualChecks: ManualCheck[]
  operations: Operation[]
  rulesText: RulesText
  sourceAnchor: string

RulesText
  target: verbatim card text
  effect: verbatim card text
  duration: verbatim card text
```

`rulesText` explains the complete rule. `operations` automate only objective
state. A missing automation operation never authorizes the application to
infer a physical result from prose.

## Target policy

```text
TargetPolicy
  relation: none | self | ally | enemy | same-team
  cardinality: zero | one | one-or-more | all-selected
  lifeState: active | downed | any
  includeSelf: boolean
  fixedTeam: team-id | none
```

The Referee Console uses this policy to order target choices and show warnings.
It does not use range or Line of Sight to hide a character. An invalid target
remains available through the W01 Override control.

## Manual checks

Use these closed values:

- `range`
- `line-of-sight`
- `physical-hit`
- `terrain-contact`
- `safe-movement`
- `bottle-placement`
- `reaction-timing`
- `forced-movement-destination`

These values create prompts for the referee. They never store an automatic
physical judgment. The Match Event records the referee's confirmed selection,
not a calculated distance or battlefield position.

## Objective operation vocabulary

Process operations in listed order. Each operation has an explicit subject,
value, condition, and duration where applicable.

| Operation | Objective result |
| --- | --- |
| `deal-damage` | Add a fixed damage contribution before Reactions and finalization. |
| `add-damage` | Add a fixed conditional modifier to a qualifying attack. |
| `prevent-damage-and-effects` | Set one affected character's damage to zero and remove that attack's attached effects for that character. |
| `reduce-remaining-damage` | Reduce positive remaining damage by a fixed amount. |
| `heal` | Increase current HP without exceeding current maximum HP. |
| `revive` | Change a legal Downed character to Active at 1 HP. |
| `change-max-hp` | Change current maximum HP through a named ability effect. |
| `apply-effect` | Add a typed temporary effect to one or more characters. |
| `consume-effect` | Remove an effect after its trigger succeeds. |
| `set-movement-cap` | Record the maximum movement for the affected character's next turn. |
| `prohibit-action-type` | Record that the affected character cannot use the named action type on its next turn. |
| `ignore-physical-attack` | Prevent physical-ball damage and effects against one character for a duration. |
| `redirect-physical-attack` | Continue the same physical attack toward its source after prevention. |
| `manual-movement-instruction` | Show required movement text without storing a battlefield position. |

The resolver always performs the universal sequence from the rules: damage
increases, Reactions and reductions, final damage, HP change, Downed cleanup,
then team-elimination detection. `manual-movement-instruction` can declare a
different card-specific position in that sequence, as Brutal Shove does.

## Trigger vocabulary

Use these closed trigger values:

- `on-activation`
- `attack-would-affect`
- `physical-ball-hits`
- `before-damage-finalized`
- `after-successful-damaging-attack`
- `hp-below-threshold`
- `character-downed`
- `beginning-of-next-turn`
- `end-of-next-turn`
- `beginning-of-next-scheduled-slot`
- `end-of-next-scheduled-slot`

A scheduled-slot trigger fires even when its character is Downed and has no
visible turn. A successful-damage trigger fires only when final damage is at
least one.

## Duration vocabulary

```text
Duration
  kind: immediate | until-boundary | until-trigger | until-trigger-or-boundary | while-condition
  boundary: trigger value | none
  anchor: source | affected
  condition: Condition | none
  removeWhenAffectedDowned: boolean
```

Temporary effects attach to each affected character. Downing that character
removes its temporary effects. Downing the source does not remove an applied
effect unless the card says so.

## Warning contract

Rule checks return stable warning codes with referee-facing text. They do not
return permission booleans.

Initial warning codes cover:

- `ability-already-spent`
- `wrong-active-character`
- `invalid-target-relation`
- `invalid-target-life-state`
- `eliminated-team`
- `reaction-trigger-unconfirmed`
- `powerful-action-movement-reminder`
- `manual-range-check`
- `manual-line-of-sight-check`
- `manual-hit-check`

The referee can accept a warning through Override. Structural checks remain
separate and cannot be overridden. Structural checks cover identifier
references, unique initiative slots, HP bounds, one active slot, operation
shape, event sequence, and rules-version compatibility.

## Current ability coverage

| Ability | Interaction and objective automation |
| --- | --- |
| Backstab | Physical hits; deal 1 damage; prohibit Powerful on each hit character's next turn. |
| Vanish | Self; show movement instruction; ignore physical attacks until the Rogue's next turn begins. |
| Shapeshift | Self; set maximum HP to 4; heal 1; end below 3 HP or when Downed; return maximum HP to 3. |
| Nature’s Renewal | Active self or ally; heal 1. |
| Lay on Hands | Self or ally; choose heal 1 or revive a Downed ally at 1 HP. |
| Divine Shield | Reaction for self or ally; prevent that attack's damage and effects for the chosen character. |
| Frostbind | Active enemy; set movement cap to 1 for the target's next turn. |
| Misty Escape | Self Reaction; prevent damage and effects; show an immediate movement instruction. |
| Arcane Bolt | Active enemy; targeted Ability Attack; deal 1 damage. |
| Mirror Veil | Self Reaction; prevent that attack's damage and effects for the Sorcerer. |
| Inspiring Words | Active self or ally; heal 1. |
| Battle Hymn | Selected living Drow allies; set movement cap to 3 for each affected character's next turn. |
| Hunter’s Mark | Active enemy; add 1 damage to the first successful damaging attack; consume on success or expire at the Ranger's next scheduled slot. |
| Deadeye | Active enemy; targeted Ability Attack; deal 1 damage. |
| Stunning Strike | Physical hits; deal 1 damage; prohibit Powerful on each hit character's next turn. |
| Deflecting Palm | Self Reaction to a physical hit; prevent damage and effects; redirect the same attack toward its source. |
| Second Wind | Self; heal 1. |
| Shield Wall | Reaction for self or ally; prevent that attack's damage and effects for the chosen character. |
| Brutal Shove | Physical hits; deal 1 damage; show forced movement before the Downed check. |
| Rage | Self; reduce the first qualifying positive damage by 1; consume when used or expire when the Barbarian's next turn begins. |
| Hex | Active enemy; add 1 damage to the first successful damaging attack; then set movement cap to 1; consume or expire at the Warlock's next scheduled slot. |
| Eldritch Blast | Active enemy; targeted Ability Attack; deal 1 damage. |
| Blessing of Battle | Ally; set movement cap to 3 for the target's next turn. |
| Revivify | Downed ally; revive at 1 HP unless that team is eliminated. |

## Integrity and version rules

- The application checks every team, character, ability, target, trigger, duration, and operation reference before Setup.
- The application stops Match creation when it finds an unknown operation or an incompatible rules version.
- A Match keeps its original `rulesVersion` through restore, Undo, Reopen Match, and End Game.
- The application keeps fixed rules data separate from saved Match State.
- The application stores source anchors so rules help can open the matching section of the authoritative Markdown content.
- A later feature must add a consistency check between the structured records and the roster and card fields in `bottlebound_rules_final.md`.

## Consequences for later tickets

- W04 defines the Match Event envelope, inverse operations, and Undo references.
- W05 prototypes action, target, hit, Reaction, warning, and confirmation flows from this contract.
- W06 uses `rulesText`, source anchors, manual checks, and warning codes for contextual help and search.
- W09 chooses the smallest subset of records and operations for the first Codebox feature.
