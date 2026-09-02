import type {
  AbilityId,
  BasicAttackId,
  CharacterId,
  ReactionId,
  Team,
} from "../match-types";

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
  | "Hold the Line"
  | "Shield Wall"
  | "Brutal Shove"
  | "Rampage"
  | "Hex"
  | "Eldritch Blast"
  | "Blessing of Battle"
  | "Revivify";

export type BasicAttackType = "melee" | "ranged";
export type BasicAttackUse = "unlimited";
export type CharacterRole =
  "Striker" | "Skirmisher" | "Tank" | "Controller" | "Spellcaster" | "Support";
export type AbilityActionType = "standard" | "powerful" | "reaction";
export type AbilityAttackType = "None" | "Ability Attack" | "Melee" | "Ranged";
export type AbilityInteraction =
  "physical-attack" | "targeted-attack" | "self" | "ally" | "enemy" | "utility";
export type AbilityTargetRelation = "self" | "ally" | "enemy" | "any";
export type AbilityTargetCardinality = "one" | "all-in-range" | "self";
export type AbilityTargetLifeState = "active" | "downed" | "either";
export type PhysicalAttackCheck =
  "range" | "line-of-sight" | "legal-bottle-contact" | "terrain-contact";
export type ReactionTrigger =
  "attack-would-affect" | "physical-ball-hits-owner";
export type ReactionOperationType =
  "prevent-damage-and-effects" | "manual-movement" | "redirect-physical-attack";
export type ReactionMovementCharacter = "owner";
export type ReactionRedirectTarget = "original-thrower";
export type AbilityOperation =
  | "apply-effect"
  | "deal-damage"
  | "add-damage"
  | "prevent-damage-and-effects"
  | "reduce-remaining-damage"
  | "heal"
  | "revive"
  | "change-max-hp"
  | "set-movement-cap"
  | "prohibit-action-type"
  | "ignore-physical-attack"
  | "redirect-physical-attack"
  | "manual-movement-instruction";
export type ConfigurationOperation = AbilityOperation | ReactionOperationType;

export type MatchConfigurationCharacter = {
  readonly id: CharacterId;
  readonly name: string;
  readonly role: CharacterRole;
  readonly team: Team;
  readonly baseHp: number;
  readonly initiativeModifier: number;
};

export type MatchConfigurationBasicAttack = {
  readonly id: BasicAttackId;
  readonly characterId: CharacterId;
  readonly attackType: BasicAttackType;
  readonly rangePaces: 2 | 6;
  readonly damage: 1;
  readonly use: BasicAttackUse;
  readonly physicalChecks: readonly PhysicalAttackCheck[];
};

export type AbilityTargetPolicy = {
  readonly relation: AbilityTargetRelation;
  readonly cardinality: AbilityTargetCardinality;
  readonly lifeState: AbilityTargetLifeState;
};

export type MatchConfigurationAbility = {
  readonly id: AbilityId;
  readonly name: AbilityName;
  readonly ownerCharacterId: CharacterId;
  readonly actionType: AbilityActionType;
  readonly attackType: AbilityAttackType;
  readonly interaction: AbilityInteraction;
  readonly targetPolicy: AbilityTargetPolicy;
  readonly range: string;
  readonly lineOfSight: string;
  readonly ballRequired: string;
  readonly rulesText: string;
  readonly duration: string;
  readonly manualChecks: readonly PhysicalAttackCheck[];
  readonly operations: readonly AbilityOperation[];
};

export type ReactionOperationDeclaration =
  | { readonly type: "prevent-damage-and-effects" }
  | { readonly type: "reduce-remaining-damage" }
  | {
      readonly type: "manual-movement";
      readonly character: ReactionMovementCharacter;
      readonly maxPaces: 2;
    }
  | {
      readonly type: "redirect-physical-attack";
      readonly toward: ReactionRedirectTarget;
    };

export type MatchConfigurationReaction = {
  readonly id: ReactionId;
  readonly ownerCharacterId: CharacterId;
  readonly name: AbilityName;
  readonly trigger: ReactionTrigger;
  readonly target: string;
  readonly range: string;
  readonly lineOfSight: string;
  readonly ballRequired: string;
  readonly rulesText: string;
  readonly duration: string;
  readonly operations: readonly ReactionOperationDeclaration[];
};

export type MatchConfigurationLabels = {
  readonly basicAttack: string;
  readonly ability: string;
  readonly initiative: string;
  readonly turn: string;
  readonly endGame: string;
  readonly undo: string;
  readonly standardAbility: string;
  readonly powerfulAbility: string;
  readonly reaction: string;
  readonly physicalChecks: Readonly<Record<PhysicalAttackCheck, string>>;
};

export type MatchConfigurationRefereeInstructions = {
  readonly secondMajorAction: string;
  readonly stateInvalidAbility: string;
  readonly stateInvalidReaction: string;
  readonly manualPhysicalConfirmations: string;
};

export type MatchConfigurationVersion = "BB20260902A3";

export type MatchConfiguration = {
  readonly version: MatchConfigurationVersion;
  readonly roster: readonly MatchConfigurationCharacter[];
  readonly characters: readonly MatchConfigurationCharacter[];
  readonly basicAttacks: readonly MatchConfigurationBasicAttack[];
  readonly abilities: readonly MatchConfigurationAbility[];
  readonly reactions: readonly MatchConfigurationReaction[];
  readonly labels: MatchConfigurationLabels;
  readonly refereeInstructions: MatchConfigurationRefereeInstructions;
  readonly operationDeclarations: Readonly<
    Record<ConfigurationOperation, string>
  >;
};
