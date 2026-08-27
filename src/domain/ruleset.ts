import { RULES_REFERENCE } from "virtual:rules-reference";
import {
  isAbilityId,
  isBasicAttackId,
  isCharacterId,
  isReactionId,
} from "./match-types";
import type {
  AbilityId,
  BasicAttackId,
  CharacterId,
  ReactionId,
  Team,
} from "./match-types";

export type { Team, CharacterId, AbilityId, BasicAttackId, ReactionId };
export type AbilityName =
  | "Backstab"
  | "Vanish"
  | "Shapeshift"
  | "Nature’s Renewal"
  | "Lay on Hands"
  | "Divine Shield"
  | "Frostbind"
  | "Misty Escape"
  | "Arcane Bolt"
  | "Mirror Veil"
  | "Inspiring Words"
  | "Battle Hymn"
  | "Hunter’s Mark"
  | "Deadeye"
  | "Stunning Strike"
  | "Deflecting Palm"
  | "Second Wind"
  | "Shield Wall"
  | "Brutal Shove"
  | "Rage"
  | "Hex"
  | "Eldritch Blast"
  | "Blessing of Battle"
  | "Revivify";

const ABILITY_NAMES: readonly AbilityName[] = [
  "Backstab",
  "Vanish",
  "Shapeshift",
  "Nature’s Renewal",
  "Lay on Hands",
  "Divine Shield",
  "Frostbind",
  "Misty Escape",
  "Arcane Bolt",
  "Mirror Veil",
  "Inspiring Words",
  "Battle Hymn",
  "Hunter’s Mark",
  "Deadeye",
  "Stunning Strike",
  "Deflecting Palm",
  "Second Wind",
  "Shield Wall",
  "Brutal Shove",
  "Rage",
  "Hex",
  "Eldritch Blast",
  "Blessing of Battle",
  "Revivify",
];

export function isAbilityName(value: string): value is AbilityName {
  return (ABILITY_NAMES as readonly string[]).includes(value);
}

export type {
  AttackKind,
  Phase,
  MatchEventType,
  ActionKind,
} from "./match-types";
export { isCharacterId, isTeam } from "./match-types";

export interface RulesetAbility {
  readonly name: AbilityName;
  readonly sourceAnchor: string;
  readonly type: string;
  readonly target: string;
  readonly attackType: string;
  readonly range: string;
  readonly lineOfSight: string;
  readonly ballRequired: string;
  readonly effect: string;
  readonly duration: string;
}

export interface RulesetCharacter {
  readonly id: CharacterId;
  readonly name: string;
  readonly team: Team;
  readonly baseHp: number;
  readonly initiativeModifier: number;
}

export type PhysicalAttackCheck =
  "range" | "line-of-sight" | "legal-bottle-contact" | "terrain-contact";

export interface RulesetBasicAttack {
  readonly id: BasicAttackId;
  readonly characterId: CharacterId;
  readonly attackType: "melee" | "ranged";
  readonly rangePaces: 2 | 6;
  readonly damage: 1;
  readonly use: "unlimited";
  readonly physicalChecks: readonly PhysicalAttackCheck[];
  readonly sourceAnchor: string;
}

export type ReactionOperation =
  | { readonly type: "prevent-damage-and-effects" }
  | {
      readonly type: "manual-movement";
      readonly character: "owner";
      readonly maxPaces: 2;
    }
  | {
      readonly type: "redirect-physical-attack";
      readonly toward: "original-thrower";
    };

export interface RulesetReaction {
  readonly id: ReactionId;
  readonly ownerCharacterId: CharacterId;
  readonly name: AbilityName;
  readonly trigger: "attack-would-affect" | "physical-ball-hits-owner";
  readonly target: string;
  readonly range: string;
  readonly lineOfSight: string;
  readonly operations: readonly ReactionOperation[];
  readonly sourceAnchor: string;
  readonly source: RulesetAbility;
}

export interface RulesetReferenceCharacter extends RulesetCharacter {
  readonly role: string;
  readonly basicAttack: string;
  readonly sourceAnchor: string;
  readonly abilities: readonly RulesetAbility[];
}

export interface StructuredAbility {
  readonly id: AbilityId;
  readonly name: AbilityName;
  readonly ownerCharacterId: CharacterId;
  readonly actionType: "standard" | "powerful" | "reaction";
  readonly attackType: StructuredAbilityAttackType;
  readonly interaction:
    | "physical-attack"
    | "targeted-attack"
    | "self"
    | "ally"
    | "enemy"
    | "utility";
  readonly targetPolicy: {
    readonly relation: "self" | "ally" | "enemy" | "any";
    readonly cardinality: "one" | "all-in-range" | "self";
    readonly lifeState: "active" | "downed" | "either";
  };
  // Free-text card display fields intentionally remain string (out-of-scope for union narrowing):
  // effect/target/range presentation strings are not branching keys.
  readonly range: string;
  readonly lineOfSight: string;
  readonly ballRequired: string;
  readonly reactionTrigger: string;
  readonly manualChecks: readonly string[];
  readonly operations: readonly string[];
  readonly rulesText: string;
  readonly sourceAnchor: string;
}

/** Printed Attack Type values retained exactly from the authoritative cards. */
export type StructuredAbilityAttackType =
  "None" | "Ability Attack" | "Melee" | "Ranged";

export interface Ruleset {
  readonly version: string;
  readonly characters: readonly RulesetCharacter[];
  readonly referenceCharacters: readonly RulesetReferenceCharacter[];
  readonly basicAttacks: readonly RulesetBasicAttack[];
  readonly reactions: readonly RulesetReaction[];
  readonly abilities: readonly StructuredAbility[];
}

export const RULES_VERSION = "BB20260822A1";

if (RULES_REFERENCE.version !== RULES_VERSION) {
  throw new Error(
    `Bundled Ruleset version ${RULES_REFERENCE.version} does not match ${RULES_VERSION}.`,
  );
}

function requiredCharacterId(value: string): CharacterId {
  if (!isCharacterId(value)) {
    throw new Error(
      `Bundled Ruleset roster has an invalid character id: ${value}.`,
    );
  }
  return value;
}

const referenceCharacters = RULES_REFERENCE.characters.map((character) => {
  const characterId = requiredCharacterId(character.id);
  const abilities = character.abilities.map((ability) => {
    if (!isAbilityName(ability.name)) {
      throw new Error(
        `Bundled Ruleset has an invalid ability name: ${ability.name}.`,
      );
    }
    return Object.freeze({
      name: ability.name,
      sourceAnchor: ability.anchor,
      type: ability.fields.Type,
      target: ability.fields.Target,
      attackType: ability.fields["Attack Type"],
      range: ability.fields.Range,
      lineOfSight: ability.fields["Line of Sight"],
      ballRequired: ability.fields["Ball Required"],
      effect: ability.fields.Effect,
      duration: ability.fields.Duration,
    });
  });
  return Object.freeze({
    id: characterId,
    name: character.name,
    team: character.team,
    role: character.role,
    baseHp: character.baseHp,
    initiativeModifier: character.initiativeModifier,
    basicAttack: character.basicAttack,
    sourceAnchor: character.anchor,
    abilities: Object.freeze(abilities),
  });
});

const characters = referenceCharacters.map((character) =>
  Object.freeze({
    id: character.id,
    name: character.name,
    team: character.team,
    baseHp: character.baseHp,
    initiativeModifier: character.initiativeModifier,
  }),
);

const physicalChecks = Object.freeze([
  "range",
  "line-of-sight",
  "legal-bottle-contact",
  "terrain-contact",
] as const);

const basicAttacks = referenceCharacters.map((character) => {
  const match = character.basicAttack.match(/^(Melee|Ranged) — (2|6) paces$/);
  if (!match) {
    throw new Error(
      `Character ${character.name} has an unsupported Basic Attack contract.`,
    );
  }
  const attackType = match[1]?.toLowerCase();
  const rangePaces = Number(match[2]);
  if (
    (attackType !== "melee" && attackType !== "ranged") ||
    (rangePaces !== 2 && rangePaces !== 6) ||
    (attackType === "melee" ? rangePaces !== 2 : rangePaces !== 6)
  ) {
    throw new Error(
      `Character ${character.name} has an incompatible Basic Attack contract.`,
    );
  }
  return Object.freeze({
    id: basicAttackId(character.id),
    characterId: character.id,
    attackType: attackType,
    rangePaces: rangePaces,
    damage: 1 as const,
    use: "unlimited" as const,
    physicalChecks,
    sourceAnchor: `${character.sourceAnchor}-roster`,
  });
});

function basicAttackId(characterId: CharacterId): BasicAttackId {
  const id = `${characterId}-basic-attack`;
  if (!isBasicAttackId(id)) {
    throw new Error(`Unsupported Basic Attack id: ${id}`);
  }
  return id;
}

const reactionConfigurations = [
  {
    ownerCharacterId: "drow-paladin",
    name: "Divine Shield",
    trigger: "attack-would-affect",
    operations: [{ type: "prevent-damage-and-effects" }],
  },
  {
    ownerCharacterId: "drow-wizard",
    name: "Misty Escape",
    trigger: "attack-would-affect",
    operations: [
      { type: "prevent-damage-and-effects" },
      { type: "manual-movement", character: "owner", maxPaces: 2 },
    ],
  },
  {
    ownerCharacterId: "drow-sorcerer",
    name: "Mirror Veil",
    trigger: "attack-would-affect",
    operations: [{ type: "prevent-damage-and-effects" }],
  },
  {
    ownerCharacterId: "duergar-monk",
    name: "Deflecting Palm",
    trigger: "physical-ball-hits-owner",
    operations: [
      { type: "prevent-damage-and-effects" },
      { type: "redirect-physical-attack", toward: "original-thrower" },
    ],
  },
  {
    ownerCharacterId: "duergar-fighter",
    name: "Shield Wall",
    trigger: "attack-would-affect",
    operations: [{ type: "prevent-damage-and-effects" }],
  },
] as const satisfies readonly {
  readonly ownerCharacterId: CharacterId;
  readonly name: AbilityName;
  readonly trigger: RulesetReaction["trigger"];
  readonly operations: readonly ReactionOperation[];
}[];

const reactions = reactionConfigurations.map((configuration) => {
  const owner = referenceCharacters.find(
    ({ id }) => id === configuration.ownerCharacterId,
  );
  const source = owner?.abilities.find(
    ({ name }) => name === configuration.name,
  );
  if (!owner || !source || source.type !== "Reaction") {
    throw new Error(
      `Required Reaction ${configuration.name} is missing from the authoritative Ruleset.`,
    );
  }
  if (
    source.attackType !== "None" ||
    source.ballRequired !== "No" ||
    source.duration !== "Immediate."
  ) {
    throw new Error(
      `Reaction ${configuration.name} has an incompatible automation contract.`,
    );
  }
  return Object.freeze({
    id: reactionId(owner.id, configuration.name),
    ownerCharacterId: owner.id,
    name: configuration.name,
    trigger: configuration.trigger,
    target: source.target,
    range: source.range,
    lineOfSight: source.lineOfSight,
    operations: Object.freeze(
      configuration.operations.map((operation) => Object.freeze(operation)),
    ),
    sourceAnchor: source.sourceAnchor,
    source,
  });
});

function slugAbility(value: string): string {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "");
}

function reactionId(characterId: CharacterId, name: AbilityName): ReactionId {
  const id = `${characterId}-${slugAbility(name)}`;
  if (!isReactionId(id)) {
    throw new Error(`Unsupported Reaction id: ${id}`);
  }
  return id;
}

function abilityId(characterId: CharacterId, name: AbilityName): AbilityId {
  const id = `${characterId}-${slugAbility(name)}`;
  if (!isAbilityId(id)) {
    throw new Error(`Unsupported Ability id: ${id}`);
  }
  return id;
}

function inferActionType(
  ability: RulesetAbility,
): StructuredAbility["actionType"] {
  if (ability.type === "Powerful") {
    return "powerful";
  }
  if (ability.type === "Reaction") {
    return "reaction";
  }
  return "standard";
}

function inferInteraction(
  ability: RulesetAbility,
): StructuredAbility["interaction"] {
  if (ability.ballRequired === "Yes") {
    return "physical-attack";
  }
  if (ability.attackType === "Ability Attack") {
    return "targeted-attack";
  }
  if (ability.target === "Self") {
    return "self";
  }
  if (ability.target.includes("ally")) {
    return "ally";
  }
  if (ability.target.includes("enemy")) {
    return "enemy";
  }
  return "utility";
}

function inferTargetRelation(
  target: string,
): StructuredAbility["targetPolicy"]["relation"] {
  if (target === "Self") {
    return "self";
  }
  if (target.includes("ally") && target.includes("enemy")) {
    return "any";
  }
  if (target.includes("ally")) {
    return "ally";
  }
  if (target.includes("enemy")) {
    return "enemy";
  }
  return "any";
}

function inferTargetCardinality(
  target: string,
): StructuredAbility["targetPolicy"]["cardinality"] {
  if (target.includes("All living") || target.includes("All")) {
    return "all-in-range";
  }
  if (target === "Self" || target === "None — physical throw") {
    return "self";
  }
  return "one";
}

function inferTargetLifeState(
  target: string,
  effect: string,
): StructuredAbility["targetPolicy"]["lifeState"] {
  // Target life-state policy read from the printed cards: a Downed target
  // requirement appears in the Target field ("1 Downed ally"), revive
  // capability in phrases like "restore a Downed ally", and healing cards
  // state their prohibition explicitly ("A Downed character cannot be
  // targeted").
  const targetLower = target.toLowerCase();
  const effectLower = effect.toLowerCase();
  if (targetLower.includes("downed")) {
    return "downed";
  }
  if (
    effectLower.includes("restore a downed") ||
    effectLower.includes("stand their bottle")
  ) {
    return "either";
  }
  if (effectLower.includes("a downed character cannot be targeted")) {
    return "active";
  }
  return effectLower.includes("downed") ? "either" : "active";
}

function inferTargetPolicy(
  ability: RulesetAbility,
): StructuredAbility["targetPolicy"] {
  return Object.freeze({
    relation: inferTargetRelation(ability.target),
    cardinality: inferTargetCardinality(ability.target),
    lifeState: inferTargetLifeState(ability.target, ability.effect),
  });
}

function inferManualChecks(ability: RulesetAbility): readonly string[] {
  return [
    ...(ability.range !== "Self" && ability.range !== "N/A" ? ["range"] : []),
    ...(ability.lineOfSight === "Yes" ? ["lineOfSight"] : []),
    ...(ability.ballRequired === "Yes"
      ? ["legalBottleContact", "terrainContact"]
      : []),
  ];
}

function foldApostrophes(value: string): string {
  return value.replaceAll(/['’]/g, "");
}

function inferDamageOperations(
  ability: RulesetAbility,
  effectLower: string,
): readonly string[] {
  const addsDamage =
    effectLower.includes("+1 damage") ||
    effectLower.includes("add-damage") ||
    foldApostrophes(ability.name) === "Hunters Mark" ||
    ability.name === "Hex";
  return [
    ...(effectLower.includes("takes 1 damage") ? ["deal-damage"] : []),
    ...(addsDamage ? ["add-damage"] : []),
    ...(effectLower.includes("prevent all damage")
      ? ["prevent-damage-and-effects"]
      : []),
    ...(effectLower.includes("reduce") ? ["reduce-remaining-damage"] : []),
  ];
}

function inferRecoveryOperations(effectLower: string): readonly string[] {
  return [
    ...(effectLower.includes("restores 1 hp") || effectLower.includes("heal")
      ? ["heal"]
      : []),
    ...(effectLower.includes("revive") ||
    effectLower.includes("restore a downed")
      ? ["revive"]
      : []),
    ...(effectLower.includes("maximum hp") ? ["change-max-hp"] : []),
  ];
}

function inferRestrictionOperations(effectLower: string): readonly string[] {
  return [
    ...(effectLower.includes("movement") && effectLower.includes("maximum of 1")
      ? ["set-movement-cap"]
      : []),
    ...(effectLower.includes("movement") && effectLower.includes("3 paces")
      ? ["set-movement-cap"]
      : []),
    ...(effectLower.includes("cannot use a powerful ability")
      ? ["prohibit-action-type"]
      : []),
    ...(effectLower.includes("cannot be affected by physically")
      ? ["ignore-physical-attack"]
      : []),
  ];
}

function inferPhysicalOperations(effectLower: string): readonly string[] {
  return [
    ...(effectLower.includes("redirect") ? ["redirect-physical-attack"] : []),
    ...(effectLower.includes("move") && effectLower.includes("paces")
      ? ["manual-movement-instruction"]
      : []),
  ];
}

function inferOperations(ability: RulesetAbility): readonly string[] {
  const effectLower = ability.effect.toLowerCase();
  const inferred = [
    ...inferDamageOperations(ability, effectLower),
    ...inferRecoveryOperations(effectLower),
    ...inferRestrictionOperations(effectLower),
    ...inferPhysicalOperations(effectLower),
  ];
  return inferred.length === 0 ? ["apply-effect"] : inferred;
}

function structuredAbilityAttackType(
  rawAttackType: string,
): StructuredAbilityAttackType {
  if (
    rawAttackType !== "None" &&
    rawAttackType !== "Ability Attack" &&
    rawAttackType !== "Melee" &&
    rawAttackType !== "Ranged"
  ) {
    throw new Error(`Unsupported ability attackType: ${rawAttackType}`);
  }
  return rawAttackType;
}

function inferAbilityStructure(
  characterId: CharacterId,
  ability: RulesetAbility,
): StructuredAbility {
  return Object.freeze({
    id: abilityId(characterId, ability.name),
    name: ability.name,
    ownerCharacterId: characterId,
    actionType: inferActionType(ability),
    attackType: structuredAbilityAttackType(ability.attackType),
    interaction: inferInteraction(ability),
    targetPolicy: inferTargetPolicy(ability),
    range: ability.range,
    lineOfSight: ability.lineOfSight,
    ballRequired: ability.ballRequired,
    reactionTrigger: ability.type === "Reaction" ? "attack-would-affect" : "",
    manualChecks: Object.freeze(inferManualChecks(ability)),
    operations: Object.freeze(inferOperations(ability)),
    rulesText: ability.effect,
    sourceAnchor: ability.sourceAnchor,
  });
}

const abilities = Object.freeze(
  referenceCharacters.flatMap((character) =>
    character.abilities.map((ability) =>
      inferAbilityStructure(character.id, ability),
    ),
  ),
);

if (abilities.length !== 24) {
  throw new Error(
    `Expected 24 structured abilities; found ${String(abilities.length)}.`,
  );
}

export const RULESET: Ruleset = Object.freeze({
  version: RULES_VERSION,
  characters: Object.freeze(characters),
  referenceCharacters: Object.freeze(referenceCharacters),
  basicAttacks: Object.freeze(basicAttacks),
  reactions: Object.freeze(reactions),
  abilities: Object.freeze(abilities),
});
