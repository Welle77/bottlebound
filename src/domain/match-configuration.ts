import { abilities } from "./match-configuration/abilities";
import type {
  AbilityId,
  BasicAttackId,
  CharacterId,
  ReactionId,
} from "./match-types";
import type {
  AbilityName,
  ConfigurationOperation,
  MatchConfiguration,
  MatchConfigurationBasicAttack,
  MatchConfigurationCharacter,
  MatchConfigurationLabels,
  MatchConfigurationReaction,
  MatchConfigurationRefereeInstructions,
  MatchConfigurationVersion,
  PhysicalAttackCheck,
} from "./match-configuration/types";

export type {
  AbilityName,
  AbilityOperation,
  AbilityActionType,
  AbilityAttackType,
  AbilityInteraction,
  AbilityTargetCardinality,
  AbilityTargetLifeState,
  AbilityTargetPolicy,
  AbilityTargetRelation,
  BasicAttackType,
  BasicAttackUse,
  CharacterRole,
  ConfigurationOperation,
  MatchConfiguration,
  MatchConfigurationAbility,
  MatchConfigurationBasicAttack,
  MatchConfigurationCharacter,
  MatchConfigurationLabels,
  MatchConfigurationReaction,
  MatchConfigurationRefereeInstructions,
  MatchConfigurationVersion,
  PhysicalAttackCheck,
  ReactionMovementCharacter,
  ReactionOperationDeclaration,
  ReactionOperationType,
  ReactionRedirectTarget,
  ReactionTrigger,
} from "./match-configuration/types";

export type {
  AbilityId,
  BasicAttackId,
  CharacterId,
  ReactionId,
  Team,
} from "./match-types";

export type MatchConfigurationIdentifier =
  AbilityId | AbilityName | BasicAttackId | CharacterId | ReactionId;

export function isAbilityName(value: string): value is AbilityName {
  return MATCH_CONFIGURATION.abilities.some(({ name }) => name === value);
}

export const MATCH_CONFIGURATION_VERSION: MatchConfigurationVersion =
  "BB20260822A1";

const physicalChecks: readonly PhysicalAttackCheck[] = [
  "range",
  "line-of-sight",
  "legal-bottle-contact",
  "terrain-contact",
];

const attackManualChecks: readonly PhysicalAttackCheck[] = physicalChecks;

const roster = [
  {
    id: "drow-rogue",
    name: "Rogue",
    role: "Striker",
    team: "Drow",
    baseHp: 3,
    initiativeModifier: 3,
  },
  {
    id: "drow-druid",
    name: "Druid",
    role: "Skirmisher",
    team: "Drow",
    baseHp: 3,
    initiativeModifier: 1,
  },
  {
    id: "drow-paladin",
    name: "Paladin",
    role: "Tank",
    team: "Drow",
    baseHp: 5,
    initiativeModifier: 1,
  },
  {
    id: "drow-wizard",
    name: "Wizard",
    role: "Controller",
    team: "Drow",
    baseHp: 3,
    initiativeModifier: 0,
  },
  {
    id: "drow-sorcerer",
    name: "Sorcerer",
    role: "Spellcaster",
    team: "Drow",
    baseHp: 3,
    initiativeModifier: 0,
  },
  {
    id: "drow-bard",
    name: "Bard",
    role: "Support",
    team: "Drow",
    baseHp: 3,
    initiativeModifier: 2,
  },
  {
    id: "duergar-ranger",
    name: "Ranger",
    role: "Striker",
    team: "Duergar",
    baseHp: 3,
    initiativeModifier: 3,
  },
  {
    id: "duergar-monk",
    name: "Monk",
    role: "Skirmisher",
    team: "Duergar",
    baseHp: 4,
    initiativeModifier: 3,
  },
  {
    id: "duergar-fighter",
    name: "Fighter",
    role: "Tank",
    team: "Duergar",
    baseHp: 4,
    initiativeModifier: 1,
  },
  {
    id: "duergar-barbarian",
    name: "Barbarian",
    role: "Controller",
    team: "Duergar",
    baseHp: 5,
    initiativeModifier: 1,
  },
  {
    id: "duergar-warlock",
    name: "Warlock",
    role: "Spellcaster",
    team: "Duergar",
    baseHp: 3,
    initiativeModifier: 0,
  },
  {
    id: "duergar-cleric",
    name: "Cleric",
    role: "Support",
    team: "Duergar",
    baseHp: 3,
    initiativeModifier: 0,
  },
] as const satisfies readonly MatchConfigurationCharacter[];

const basicAttacks = [
  {
    id: "drow-rogue-basic-attack",
    characterId: "drow-rogue",
    attackType: "melee",
    rangePaces: 2,
    damage: 1,
    use: "unlimited",
    physicalChecks: attackManualChecks,
  },
  {
    id: "drow-druid-basic-attack",
    characterId: "drow-druid",
    attackType: "melee",
    rangePaces: 2,
    damage: 1,
    use: "unlimited",
    physicalChecks: attackManualChecks,
  },
  {
    id: "drow-paladin-basic-attack",
    characterId: "drow-paladin",
    attackType: "melee",
    rangePaces: 2,
    damage: 1,
    use: "unlimited",
    physicalChecks: attackManualChecks,
  },
  {
    id: "drow-wizard-basic-attack",
    characterId: "drow-wizard",
    attackType: "ranged",
    rangePaces: 6,
    damage: 1,
    use: "unlimited",
    physicalChecks: attackManualChecks,
  },
  {
    id: "drow-sorcerer-basic-attack",
    characterId: "drow-sorcerer",
    attackType: "ranged",
    rangePaces: 6,
    damage: 1,
    use: "unlimited",
    physicalChecks: attackManualChecks,
  },
  {
    id: "drow-bard-basic-attack",
    characterId: "drow-bard",
    attackType: "ranged",
    rangePaces: 6,
    damage: 1,
    use: "unlimited",
    physicalChecks: attackManualChecks,
  },
  {
    id: "duergar-ranger-basic-attack",
    characterId: "duergar-ranger",
    attackType: "ranged",
    rangePaces: 6,
    damage: 1,
    use: "unlimited",
    physicalChecks: attackManualChecks,
  },
  {
    id: "duergar-monk-basic-attack",
    characterId: "duergar-monk",
    attackType: "melee",
    rangePaces: 2,
    damage: 1,
    use: "unlimited",
    physicalChecks: attackManualChecks,
  },
  {
    id: "duergar-fighter-basic-attack",
    characterId: "duergar-fighter",
    attackType: "melee",
    rangePaces: 2,
    damage: 1,
    use: "unlimited",
    physicalChecks: attackManualChecks,
  },
  {
    id: "duergar-barbarian-basic-attack",
    characterId: "duergar-barbarian",
    attackType: "melee",
    rangePaces: 2,
    damage: 1,
    use: "unlimited",
    physicalChecks: attackManualChecks,
  },
  {
    id: "duergar-warlock-basic-attack",
    characterId: "duergar-warlock",
    attackType: "ranged",
    rangePaces: 6,
    damage: 1,
    use: "unlimited",
    physicalChecks: attackManualChecks,
  },
  {
    id: "duergar-cleric-basic-attack",
    characterId: "duergar-cleric",
    attackType: "ranged",
    rangePaces: 6,
    damage: 1,
    use: "unlimited",
    physicalChecks: attackManualChecks,
  },
] as const satisfies readonly MatchConfigurationBasicAttack[];

const reactions = [
  {
    id: "drow-paladin-divine-shield",
    ownerCharacterId: "drow-paladin",
    name: "Divine Shield",
    trigger: "attack-would-affect",
    target: "Self or 1 ally",
    range: "3 paces",
    lineOfSight: "No",
    ballRequired: "No",
    rulesText:
      "When an attack would affect the chosen character, prevent all damage and effects from that attack against that character. The same attack may still affect other characters normally.",
    duration: "Immediate.",
    operations: [{ type: "prevent-damage-and-effects" }],
  },
  {
    id: "drow-wizard-misty-escape",
    ownerCharacterId: "drow-wizard",
    name: "Misty Escape",
    trigger: "attack-would-affect",
    target: "Self",
    range: "Self",
    lineOfSight: "N/A",
    ballRequired: "No",
    rulesText:
      "When an attack would affect the Wizard, prevent all damage and effects from that attack against the Wizard. The Wizard may then immediately move up to 2 paces. This is ability-granted movement and does not consume the Wizard’s next turn movement, but existing movement restrictions still apply unless explicitly overridden.",
    duration: "Immediate.",
    operations: [
      { type: "prevent-damage-and-effects" },
      { type: "manual-movement", character: "owner", maxPaces: 2 },
    ],
  },
  {
    id: "drow-sorcerer-mirror-veil",
    ownerCharacterId: "drow-sorcerer",
    name: "Mirror Veil",
    trigger: "attack-would-affect",
    target: "Self",
    range: "Self",
    lineOfSight: "N/A",
    ballRequired: "No",
    rulesText:
      "When an attack would affect the Sorcerer, prevent all damage and effects from that attack against the Sorcerer. The attack may still affect other characters normally.",
    duration: "Immediate.",
    operations: [{ type: "prevent-damage-and-effects" }],
  },
  {
    id: "duergar-monk-deflecting-palm",
    ownerCharacterId: "duergar-monk",
    name: "Deflecting Palm",
    trigger: "physical-ball-hits-owner",
    target: "Self",
    range: "Self",
    lineOfSight: "N/A",
    ballRequired: "No",
    rulesText:
      "When a physical ball hits the Monk, prevent all damage and effects from that attack against the Monk. The same ball is immediately redirected toward the original thrower’s current bottle position. It remains the same attack: all attached ball effects remain attached, each bottle may still be affected at most once, and the attack keeps its original source and hard maximum range.",
    duration: "Immediate.",
    operations: [
      { type: "prevent-damage-and-effects" },
      { type: "redirect-physical-attack", toward: "original-thrower" },
    ],
  },
  {
    id: "duergar-fighter-shield-wall",
    ownerCharacterId: "duergar-fighter",
    name: "Shield Wall",
    trigger: "attack-would-affect",
    target: "Self or 1 ally",
    range: "2 paces",
    lineOfSight: "No",
    ballRequired: "No",
    rulesText:
      "When an attack affects the chosen character, reduce all damage from that attack against that character to 0 and prevent its attached effects against that character. Other characters affected by the same attack resolve normally.",
    duration: "Immediate.",
    operations: [{ type: "prevent-damage-and-effects" }],
  },
] as const satisfies readonly MatchConfigurationReaction[];

const labels = {
  basicAttack: "Basic Attack",
  ability: "Ability",
  initiative: "Initiative",
  turn: "Turn",
  endGame: "End Game",
  undo: "Undo",
  standardAbility: "Standard Ability",
  powerfulAbility: "Powerful Ability",
  reaction: "Reaction",
  physicalChecks: {
    range: "Range is legal",
    "line-of-sight": "Line of Sight is legal",
    "legal-bottle-contact": "Every selected bottle was physically hit",
    "terrain-contact": "Terrain contact was resolved",
  },
} as const satisfies MatchConfigurationLabels;

const refereeInstructions = {
  secondMajorAction: "Referee confirmed a second Major Action this turn.",
  stateInvalidAbility:
    "The referee recorded an Override for this state-invalid ability choice.",
  stateInvalidReaction: "Referee allowed a state-invalid Reaction.",
  manualPhysicalConfirmations: "Manual physical confirmations",
} as const satisfies MatchConfigurationRefereeInstructions;

const operationDeclarations = {
  "apply-effect": "Apply the declared ability effect.",
  "deal-damage": "Apply the attack's damage to each legal affected character.",
  "add-damage":
    "Add the declared damage increase to the first qualifying attack.",
  "prevent-damage-and-effects":
    "Prevent damage and attached effects for the protected character.",
  "reduce-remaining-damage": "Reduce remaining damage by the declared amount.",
  heal: "Restore the declared HP without exceeding the current maximum.",
  revive: "Restore a Downed character to 1 HP.",
  "change-max-hp": "Change the character's current maximum HP.",
  "set-movement-cap": "Apply the declared movement limit for its duration.",
  "prohibit-action-type": "Prohibit the declared action type for its duration.",
  "ignore-physical-attack": "Ignore physically thrown ball attacks.",
  "redirect-physical-attack":
    "Redirect the same physical attack toward the original thrower.",
  "manual-movement-instruction":
    "Instruct the referee to resolve ability-granted movement.",
  "manual-movement": "Instruct the referee to resolve Reaction movement.",
} as const satisfies Readonly<Record<ConfigurationOperation, string>>;

function deeplyFreeze<T extends object>(value: T): T {
  Object.freeze(value);
  for (const child of Object.values(value)) {
    if (
      typeof child === "object" &&
      child !== null &&
      !Object.isFrozen(child)
    ) {
      deeplyFreeze(child);
    }
  }
  return value;
}

const configuration = {
  version: MATCH_CONFIGURATION_VERSION,
  roster,
  characters: roster,
  basicAttacks,
  abilities,
  reactions,
  labels,
  refereeInstructions,
  operationDeclarations,
} satisfies MatchConfiguration;

export const MATCH_CONFIGURATION: MatchConfiguration =
  deeplyFreeze(configuration);
