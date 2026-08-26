import { RULES_REFERENCE } from "virtual:rules-reference";

export type Team = "Drow" | "Duergar";

export interface RulesetAbility {
  readonly name: string;
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
  readonly id: string;
  readonly name: string;
  readonly team: Team;
  readonly baseHp: number;
  readonly initiativeModifier: number;
}

export type PhysicalAttackCheck =
  "range" | "line-of-sight" | "legal-bottle-contact" | "terrain-contact";

export interface RulesetBasicAttack {
  readonly id: string;
  readonly characterId: string;
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
  readonly id: string;
  readonly ownerCharacterId: string;
  readonly name: string;
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
  readonly id: string;
  readonly name: string;
  readonly ownerCharacterId: string;
  readonly actionType: "standard" | "powerful" | "reaction";
  readonly attackType: string;
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
  readonly range: string;
  readonly lineOfSight: string;
  readonly ballRequired: string;
  readonly reactionTrigger: string;
  readonly manualChecks: readonly string[];
  readonly operations: readonly string[];
  readonly rulesText: string;
  readonly sourceAnchor: string;
}

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

const referenceCharacters = RULES_REFERENCE.characters.map((character) => {
  const abilities = character.abilities.map((ability) =>
    Object.freeze({
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
    }),
  );
  return Object.freeze({
    id: character.id,
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
    id: `${character.id}-basic-attack`,
    characterId: character.id,
    attackType,
    rangePaces,
    damage: 1 as const,
    use: "unlimited" as const,
    physicalChecks,
    sourceAnchor: `${character.sourceAnchor}-roster`,
  });
});

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
  readonly ownerCharacterId: string;
  readonly name: string;
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
    id: `${owner.id}-${configuration.name
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, "-")}`,
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

function inferAbilityStructure(
  characterId: string,
  ability: RulesetAbility,
): StructuredAbility {
  const actionType =
    ability.type === "Powerful"
      ? ("powerful" as const)
      : ability.type === "Reaction"
        ? ("reaction" as const)
        : ("standard" as const);
  const interaction: StructuredAbility["interaction"] =
    ability.ballRequired === "Yes"
      ? "physical-attack"
      : ability.attackType === "Ability Attack"
        ? "targeted-attack"
        : ability.target === "Self"
          ? "self"
          : ability.target.includes("ally")
            ? "ally"
            : ability.target.includes("enemy")
              ? "enemy"
              : "utility";
  const relation: StructuredAbility["targetPolicy"]["relation"] =
    ability.target === "Self"
      ? "self"
      : ability.target.includes("ally") && ability.target.includes("enemy")
        ? "any"
        : ability.target.includes("ally")
          ? "ally"
          : ability.target.includes("enemy")
            ? "enemy"
            : "any";
  const cardinality: StructuredAbility["targetPolicy"]["cardinality"] =
    ability.target.includes("All living") || ability.target.includes("All")
      ? "all-in-range"
      : ability.target === "Self" || ability.target === "None — physical throw"
        ? "self"
        : "one";
  // Target life-state policy read from the printed cards: a Downed target
  // requirement appears in the Target field ("1 Downed ally"), revive
  // capability in phrases like "restore a Downed ally", and healing cards
  // state their prohibition explicitly ("A Downed character cannot be
  // targeted").
  const effectLower = ability.effect.toLowerCase();
  const targetLower = ability.target.toLowerCase();
  const lifeState: StructuredAbility["targetPolicy"]["lifeState"] =
    targetLower.includes("downed")
      ? "downed"
      : effectLower.includes("restore a downed") ||
          effectLower.includes("stand their bottle")
        ? "either"
        : effectLower.includes("a downed character cannot be targeted")
          ? "active"
          : effectLower.includes("downed")
            ? "either"
            : "active";
  const manualChecks: readonly string[] = [
    ...(ability.range !== "Self" && ability.range !== "N/A" ? ["range"] : []),
    ...(ability.lineOfSight === "Yes" ? ["lineOfSight"] : []),
    ...(ability.ballRequired === "Yes"
      ? ["legalBottleContact", "terrainContact"]
      : []),
  ];
  const foldApostrophes = (value: string): string =>
    value.replaceAll(/['’]/g, "");
  const operationsBeforeFallback: readonly string[] = [
    ...(effectLower.includes("takes 1 damage") ? ["deal-damage"] : []),
    ...(effectLower.includes("+1 damage") ||
    effectLower.includes("add-damage") ||
    foldApostrophes(ability.name) === "Hunters Mark" ||
    ability.name === "Hex"
      ? ["add-damage"]
      : []),
    ...(effectLower.includes("prevent all damage")
      ? ["prevent-damage-and-effects"]
      : []),
    ...(effectLower.includes("reduce") ? ["reduce-remaining-damage"] : []),
    ...(effectLower.includes("restores 1 hp") || effectLower.includes("heal")
      ? ["heal"]
      : []),
    ...(effectLower.includes("revive") ||
    effectLower.includes("restore a downed")
      ? ["revive"]
      : []),
    ...(effectLower.includes("maximum hp") ? ["change-max-hp"] : []),
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
    ...(effectLower.includes("redirect") ? ["redirect-physical-attack"] : []),
    ...(effectLower.includes("move") && effectLower.includes("paces")
      ? ["manual-movement-instruction"]
      : []),
  ];
  const operations: readonly string[] =
    operationsBeforeFallback.length === 0
      ? ["apply-effect"]
      : operationsBeforeFallback;
  return Object.freeze({
    id: `${characterId}-${slugAbility(ability.name)}`,
    name: ability.name,
    ownerCharacterId: characterId,
    actionType,
    attackType: ability.attackType,
    interaction,
    targetPolicy: Object.freeze({ relation, cardinality, lifeState }),
    range: ability.range,
    lineOfSight: ability.lineOfSight,
    ballRequired: ability.ballRequired,
    reactionTrigger: ability.type === "Reaction" ? "attack-would-affect" : "",
    manualChecks: Object.freeze(manualChecks),
    operations: Object.freeze(operations),
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
