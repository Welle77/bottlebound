import {
  MATCH_CONFIGURATION,
  type AbilityName,
  type MatchConfigurationAbility,
} from "./match-configuration";
import type { ProtectiveReactionInput } from "./match-types";
import type {
  AbilityId,
  ActiveEffect,
  ActiveMatchState,
  CharacterId,
} from "./match-types";
import { teamOfCharacter } from "./match-endgame";

/**
 * Compares an ability against its printed card name while folding the
 * apostrophe variants (U+2019 versus U+0027). The authoritative rules document
 * prints typographic apostrophes ("Hunter's Mark", "Nature's Renewal"), so
 * byte-equality against source-level ASCII strings silently fails.
 */
export function isAbilityNamed(
  ability: { readonly name: AbilityName },
  printedName: AbilityName,
): boolean {
  const fold = (value: string): string => value.replaceAll(/['’]/g, "");
  return fold(ability.name) === fold(printedName);
}

function abilityWarnings(
  state: ActiveMatchState,
  abilityId: AbilityId,
): readonly string[] {
  return state.spentAbilityIds.includes(abilityId)
    ? ["ability-already-spent"]
    : [];
}

function getAbilityOrThrow(abilityId: AbilityId): MatchConfigurationAbility {
  const ability = MATCH_CONFIGURATION.abilities.find(
    (entry) => entry.id === abilityId,
  );
  if (!ability) throw new Error("The ability is unknown.");
  return ability;
}

function buildAbilityEffects(
  ability: MatchConfigurationAbility,
  context: {
    readonly affectedIds: readonly CharacterId[];
    readonly sequence: number;
    readonly anchorId: CharacterId;
  },
): readonly ActiveEffect[] {
  if (isAbilityNamed(ability, "Hunter’s Mark") || ability.name === "Hex") {
    return buildMarkEffects(ability, context);
  }
  return buildNamedAbilityEffects(ability, context);
}

function buildNamedAbilityEffects(
  ability: MatchConfigurationAbility,
  context: {
    readonly affectedIds: readonly CharacterId[];
    readonly sequence: number;
    readonly anchorId: CharacterId;
  },
): readonly ActiveEffect[] {
  const { affectedIds, sequence, anchorId } = context;
  const { name } = ability;
  const abilityName: string = name;
  switch (abilityName) {
    case "Hold the Line": {
      return affectedIds.map((targetId) => ({
        effectId: `${ability.id}-${targetId}-${String(sequence)}`,
        abilityId: ability.id,
        kind: "hold-the-line",
        anchorCharacterId: anchorId,
        affectedCharacterId: targetId,
        duration: {
          kind: "until-boundary",
          boundaryTrigger: "beginning-of-next-turn",
          anchor: "source",
          removeWhenAffectedDowned: true,
        },
        operations: ["reduce-remaining-damage"],
        appliedSequence: sequence,
      }));
    }
    case "Vanish": {
      return [
        {
          effectId: `${ability.id}-${anchorId}-${String(sequence)}`,
          abilityId: ability.id,
          kind: "vanish",
          anchorCharacterId: anchorId,
          affectedCharacterId: anchorId,
          duration: {
            kind: "until-boundary",
            boundaryTrigger: "beginning-of-next-turn",
            anchor: "affected",
            removeWhenAffectedDowned: true,
          },
          operations: ["ignore-physical-attack"],
          appliedSequence: sequence,
        },
      ];
    }
    case "Shapeshift": {
      return [
        {
          effectId: `${ability.id}-${anchorId}-${String(sequence)}`,
          abilityId: ability.id,
          kind: "shapeshift",
          anchorCharacterId: anchorId,
          affectedCharacterId: anchorId,
          duration: {
            kind: "while-condition",
            anchor: "affected",
            removeWhenAffectedDowned: true,
          },
          operations: ["change-max-hp"],
          appliedSequence: sequence,
        },
      ];
    }
    // Physical prohibit effects
    case "Backstab":
    case "Stunning Strike": {
      return affectedIds.map((targetId) => ({
        effectId: `${ability.id}-${targetId}-${String(sequence)}`,
        abilityId: ability.id,
        kind: "prohibit-powerful",
        anchorCharacterId: anchorId,
        affectedCharacterId: targetId,
        duration: {
          kind: "until-boundary",
          boundaryTrigger: "end-of-next-turn",
          anchor: "affected",
          removeWhenAffectedDowned: true,
        },
        operations: ["prohibit-action-type"],
        appliedSequence: sequence,
      }));
    }
    // Movement caps
    case "Frostbind":
    case "Battle Hymn":
    case "Blessing of Battle": {
      const persistentMovementBlessing =
        abilityName === "Battle Hymn" || abilityName === "Blessing of Battle";
      return affectedIds.map((targetId) => ({
        effectId: `${ability.id}-${targetId}-${String(sequence)}`,
        abilityId: ability.id,
        kind: "movement-cap",
        anchorCharacterId: anchorId,
        affectedCharacterId: targetId,
        duration: {
          kind: persistentMovementBlessing
            ? "while-condition"
            : "until-boundary",
          ...(persistentMovementBlessing
            ? {}
            : { boundaryTrigger: "end-of-next-turn" as const }),
          anchor: "affected",
          removeWhenAffectedDowned: true,
        },
        operations: ["set-movement-cap"],
        appliedSequence: sequence,
      }));
    }
    default:
      return [];
  }
}

function buildMarkEffects(
  ability: MatchConfigurationAbility,
  context: {
    readonly affectedIds: readonly CharacterId[];
    readonly sequence: number;
    readonly anchorId: CharacterId;
  },
): readonly ActiveEffect[] {
  const { affectedIds, sequence, anchorId } = context;
  return affectedIds.map((targetId) => ({
    effectId: `${ability.id}-${targetId}-${String(sequence)}`,
    abilityId: ability.id,
    kind: isAbilityNamed(ability, "Hunter’s Mark") ? "hunters-mark" : "hex",
    anchorCharacterId: anchorId,
    affectedCharacterId: targetId,
    duration: {
      kind: "until-trigger-or-boundary",
      boundaryTrigger: "end-of-next-scheduled-slot",
      anchor: "source",
      removeWhenAffectedDowned: true,
    },
    operations: ["add-damage"],
    appliedSequence: sequence,
  }));
}

type AbilityTargetInput = {
  readonly targetCharacterIds?: readonly CharacterId[];
  readonly attackLegs?: readonly Readonly<{
    readonly affectedCharacterIds: readonly CharacterId[];
  }>[];
  readonly physicalConfirmations?: Readonly<{
    readonly range: boolean;
    readonly lineOfSight: boolean;
    readonly legalBottleContact: boolean;
    readonly terrainContact: boolean;
  }>;
  readonly reactions?: readonly ProtectiveReactionInput[];
};

type AbilityTargetContext = {
  readonly state: ActiveMatchState;
  readonly ability: MatchConfigurationAbility;
  readonly input: AbilityTargetInput;
  readonly abilityOverride: string | null;
};

function resolveTargetedAttackTargetIds(
  context: AbilityTargetContext,
): readonly CharacterId[] {
  const { state, ability, input, abilityOverride } = context;
  const targetIds = input.targetCharacterIds ?? [];
  const [targetId] = targetIds;
  if (targetIds.length !== 1 || targetId === undefined) {
    throw new Error("A targeted Ability Attack needs exactly one target.");
  }
  const targetCharacter = state.characters.find(
    (character) => character.characterId === targetId,
  );
  if (!targetCharacter) {
    throw new Error("The ability references an unknown target.");
  }
  assertTargetRelation(ability, targetId, abilityOverride);
  assertTargetLifeState(ability, targetCharacter.hp, abilityOverride);
  return [targetId];
}

function assertTargetRelation(
  ability: MatchConfigurationAbility,
  targetId: CharacterId,
  abilityOverride: string | null,
): void {
  const sourceTeam = teamOfCharacter(ability.ownerCharacterId);
  const targetTeam = teamOfCharacter(targetId);
  if (targetTeam === sourceTeam && abilityOverride === null) {
    throw new Error("invalid-target-relation");
  }
}

function assertTargetLifeState(
  ability: MatchConfigurationAbility,
  targetHp: number,
  abilityOverride: string | null,
): void {
  if (targetHp === 0 && abilityOverride === null) {
    throw new Error("invalid-target-life-state");
  }
  if (
    ability.targetPolicy.lifeState === "active" &&
    targetHp === 0 &&
    abilityOverride === null
  ) {
    throw new Error("invalid-target-life-state");
  }
}

function hasDeflectingPalm(
  selections: readonly ProtectiveReactionInput[],
): boolean {
  return selections.some((selection) => {
    const reaction = MATCH_CONFIGURATION.reactions.find(
      ({ id }) => id === selection.reactionId,
    );
    return reaction?.name === "Deflecting Palm";
  });
}

function validatePhysicalTargets(
  state: ActiveMatchState,
  targetIds: readonly CharacterId[],
): void {
  if (new Set(targetIds).size !== targetIds.length) {
    throw new Error("Basic Attack contacts must be unique.");
  }
  for (const characterId of targetIds) {
    const known = state.characters.some(
      (character) => character.characterId === characterId,
    );
    if (!known) {
      throw new Error(
        "Physical ability references an unknown affected character.",
      );
    }
  }
}

function resolvePhysicalAttackTargetIds(
  context: AbilityTargetContext,
): readonly CharacterId[] {
  const { state, input } = context;
  const { attackLegs } = input;
  if (!attackLegs || attackLegs.length === 0) {
    throw new Error("A physical ability needs ordered bottle contacts.");
  }
  const confirmations = input.physicalConfirmations;
  if (!confirmations || Object.values(confirmations).some((value) => !value)) {
    throw new Error("Every manual physical confirmation is required.");
  }
  const targetIds = attackLegs.flatMap(
    ({ affectedCharacterIds }) => affectedCharacterIds,
  );
  validatePhysicalTargets(state, targetIds);
  const redirected = hasDeflectingPalm(input.reactions ?? []);
  if (redirected && attackLegs.length !== 2) {
    throw new Error("Deflecting Palm needs exactly one redirected Attack Leg.");
  }
  if (!redirected && attackLegs.length !== 1) {
    throw new Error("A redirected Attack Leg needs Deflecting Palm.");
  }
  return targetIds;
}

function selfDefaultTargetIds(
  ability: MatchConfigurationAbility,
): readonly CharacterId[] {
  if (
    ability.name === "Hold the Line" ||
    ability.name === "Vanish" ||
    ability.name === "Shapeshift"
  ) {
    return [ability.ownerCharacterId];
  }
  throw new Error("Utility ability needs target selection.");
}

function validateAbsoluteUtilityLifeState(
  state: ActiveMatchState,
  ability: MatchConfigurationAbility,
  targetIds: readonly CharacterId[],
): void {
  if (
    isAbilityNamed(ability, "Nature’s Renewal") ||
    ability.name === "Inspiring Words"
  ) {
    for (const targetId of targetIds) {
      const targetCharacter = state.characters.find(
        (character) => character.characterId === targetId,
      );
      if (targetCharacter?.hp === 0) {
        throw new Error(
          "A Downed character cannot be targeted by this healing ability.",
        );
      }
    }
  }
  if (ability.name === "Revivify") {
    for (const targetId of targetIds) {
      const targetCharacter = state.characters.find(
        (character) => character.characterId === targetId,
      );
      if (targetCharacter && targetCharacter.hp !== 0) {
        throw new Error("Revivify needs one Downed ally as its target.");
      }
    }
  }
}

function validateHealingCapacity(
  state: ActiveMatchState,
  ability: MatchConfigurationAbility,
  targetIds: readonly CharacterId[],
): void {
  if (
    !ability.operations.includes("heal") ||
    ability.operations.includes("change-max-hp")
  ) {
    return;
  }
  for (const targetId of targetIds) {
    const targetCharacter = state.characters.find(
      (character) => character.characterId === targetId,
    );
    if (
      targetCharacter &&
      targetCharacter.hp === targetCharacter.currentMaxHp
    ) {
      throw new Error(
        "A character at full HP cannot receive a healing effect.",
      );
    }
  }
}

function validateUtilityTarget(context: {
  readonly state: ActiveMatchState;
  readonly ability: MatchConfigurationAbility;
  readonly targetId: CharacterId;
  readonly abilityOverride: string | null;
}): void {
  const { state, ability, targetId, abilityOverride } = context;
  const targetCharacter = state.characters.find(
    (character) => character.characterId === targetId,
  );
  if (!targetCharacter) {
    throw new Error("Utility ability references unknown target.");
  }
  assertUtilityTargetRelation(ability, targetId, abilityOverride);
  assertUtilityTargetLifeState(ability, targetCharacter.hp, abilityOverride);
}

function assertUtilityTargetRelation(
  ability: MatchConfigurationAbility,
  targetId: CharacterId,
  abilityOverride: string | null,
): void {
  const sourceTeam = teamOfCharacter(ability.ownerCharacterId);
  const targetTeam = teamOfCharacter(targetId);
  const { relation } = ability.targetPolicy;
  if (
    ((relation === "ally" && targetTeam !== sourceTeam) ||
      (relation === "enemy" && targetTeam === sourceTeam)) &&
    abilityOverride === null
  ) {
    throw new Error("invalid-target-relation");
  }
}

function assertUtilityTargetLifeState(
  ability: MatchConfigurationAbility,
  targetHp: number,
  abilityOverride: string | null,
): void {
  const { lifeState } = ability.targetPolicy;
  if (
    ((lifeState === "active" && targetHp === 0) ||
      (lifeState === "downed" && targetHp !== 0)) &&
    abilityOverride === null
  ) {
    throw new Error("invalid-target-life-state");
  }
}

function validateEliminatedTeamRevival(
  state: ActiveMatchState,
  ability: MatchConfigurationAbility,
  targetIds: readonly CharacterId[],
): void {
  if (ability.name !== "Revivify" && ability.name !== "Lay on Hands") {
    return;
  }
  for (const targetId of targetIds) {
    const targetCharacter = state.characters.find(
      (character) => character.characterId === targetId,
    );
    if (targetCharacter?.hp !== 0) continue;
    const team = teamOfCharacter(targetId);
    if (state.eliminatedTeams.includes(team)) {
      throw new Error("eliminated-team");
    }
  }
}

function resolveUtilityTargetIds(
  context: AbilityTargetContext,
): readonly CharacterId[] {
  const { state, ability, input, abilityOverride } = context;
  const targetIds = input.targetCharacterIds ?? [];
  const resolvedTargetIds =
    targetIds.length === 0 ? selfDefaultTargetIds(ability) : [...targetIds];
  validateHealingCapacity(state, ability, resolvedTargetIds);
  if (targetIds.length === 0) return resolvedTargetIds;

  // Absolute card prohibitions precede the overridable policy gates.
  validateAbsoluteUtilityLifeState(state, ability, resolvedTargetIds);
  for (const targetId of resolvedTargetIds) {
    validateUtilityTarget({ state, ability, targetId, abilityOverride });
  }
  validateEliminatedTeamRevival(state, ability, resolvedTargetIds);
  return resolvedTargetIds;
}

function resolveAffectedCharacterIds(
  context: AbilityTargetContext,
): readonly CharacterId[] {
  if (context.ability.interaction === "targeted-attack") {
    return resolveTargetedAttackTargetIds(context);
  }
  if (context.ability.interaction === "physical-attack") {
    return resolvePhysicalAttackTargetIds(context);
  }
  if (context.ability.interaction === "self") {
    const targetIds = [context.ability.ownerCharacterId];
    validateHealingCapacity(context.state, context.ability, targetIds);
    return targetIds;
  }
  // Ally, enemy, and utility interactions all use card target selection.
  return resolveUtilityTargetIds(context);
}

/**
 * Builds the 1-pace movement restriction that a successfully triggered Hex
 * attaches to the affected character for that character's next turn.
 */
function hexTriggeredMovementCap(
  hex: ActiveEffect,
  sequence: number,
): ActiveEffect {
  return {
    effectId: `${hex.abilityId}-hex-movement-${hex.affectedCharacterId}-${String(sequence)}`,
    abilityId: hex.abilityId,
    kind: "movement-cap",
    anchorCharacterId: hex.anchorCharacterId,
    affectedCharacterId: hex.affectedCharacterId,
    duration: {
      kind: "until-boundary",
      boundaryTrigger: "end-of-next-turn",
      anchor: "affected",
      removeWhenAffectedDowned: true,
    },
    operations: ["set-movement-cap"],
    appliedSequence: sequence,
  };
}

export type AttackDamageInput = {
  readonly baseDamage: number;
  readonly affectedCharacterId: CharacterId;
  /** Physical throws cannot affect a Vanish-protected character. */
  readonly physicalAttack: boolean;
  /** A protective Reaction prevented all damage and effects for the character. */
  readonly prevented: boolean;
  /** Number of selected one-point Damage Blocks for this character. */
  readonly damageBlocks?: number;
  readonly activeEffects: readonly ActiveEffect[];
  readonly sequence: number;
};

export type AttackDamageResolution = {
  readonly finalDamage: number;
  readonly expired: readonly ActiveEffect[];
  readonly applied: readonly ActiveEffect[];
};

/**
 * Resolves one attack against one affected character following rules §10(4):
 * calculate all applicable damage increases first (character-based effects
 * such as Hunter's Mark or Hex add their written +1 each and stack, §11),
 * then apply legal Reactions, reductions, and prevention, then finalize.
 * Hunter's Mark and Hex are consumed by the first successful
 * damaging attack and survive an attack finalized at 0 damage.
 */
function resolveAttackDamageAgainstCharacter(
  input: AttackDamageInput,
): AttackDamageResolution {
  const {
    baseDamage,
    affectedCharacterId,
    physicalAttack,
    prevented,
    damageBlocks = 0,
    activeEffects,
    sequence,
  } = input;
  const marks = activeEffects.filter(
    (effect) =>
      (effect.kind === "hunters-mark" || effect.kind === "hex") &&
      effect.affectedCharacterId === affectedCharacterId,
  );
  const vanished =
    !prevented &&
    physicalAttack &&
    activeEffects.some(
      (effect) =>
        effect.kind === "vanish" &&
        effect.affectedCharacterId === affectedCharacterId,
    );
  const holdTheLine = activeEffects.find(
    (effect) =>
      effect.kind === "hold-the-line" &&
      effect.affectedCharacterId === affectedCharacterId,
  );
  const unmitigated = prevented || vanished ? 0 : baseDamage + marks.length;
  const afterBlocks = Math.max(0, unmitigated - damageBlocks);
  const afterHoldTheLine = holdTheLine
    ? Math.max(0, afterBlocks - 1)
    : afterBlocks;
  const finalDamage = afterHoldTheLine;
  const expiredHoldTheLine =
    holdTheLine && afterBlocks >= 1 ? [holdTheLine] : [];
  if (finalDamage >= 1) {
    return {
      finalDamage,
      expired: [...expiredHoldTheLine, ...marks],
      applied: marks
        .filter((mark) => mark.kind === "hex")
        .map((mark) => hexTriggeredMovementCap(mark, sequence)),
    };
  }
  return {
    finalDamage,
    expired: [...expiredHoldTheLine],
    applied: [],
  };
}

export {
  abilityWarnings,
  getAbilityOrThrow,
  buildAbilityEffects,
  resolveAffectedCharacterIds,
  resolveAttackDamageAgainstCharacter,
};
