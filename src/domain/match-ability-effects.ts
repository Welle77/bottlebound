import { RULESET, type AbilityName, type StructuredAbility } from "./ruleset";
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

function getAbilityOrThrow(abilityId: AbilityId): StructuredAbility {
  const ability = RULESET.abilities.find((entry) => entry.id === abilityId);
  if (!ability) throw new Error("The ability is unknown.");
  return ability;
}

function buildAbilityEffects(
  ability: StructuredAbility,
  context: {
    readonly affectedIds: readonly CharacterId[];
    readonly sequence: number;
    readonly anchorId: CharacterId;
  },
): readonly ActiveEffect[] {
  const { affectedIds, sequence, anchorId } = context;
  const name = ability.name;
  // Hunter's Mark / Hex (add-damage until the end of the source's next
  // scheduled initiative position; rules §15 card durations)
  if (isAbilityNamed(ability, "Hunter’s Mark") || name === "Hex") {
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
  if (name === "Rage") {
    return [
      {
        effectId: `${ability.id}-${anchorId}-${String(sequence)}`,
        abilityId: ability.id,
        kind: "rage",
        anchorCharacterId: anchorId,
        affectedCharacterId: anchorId,
        duration: {
          kind: "until-trigger-or-boundary",
          boundaryTrigger: "beginning-of-next-turn",
          anchor: "affected",
          removeWhenAffectedDowned: true,
        },
        operations: ["reduce-remaining-damage"],
        appliedSequence: sequence,
      },
    ];
  }
  if (name === "Vanish") {
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
  if (name === "Shapeshift") {
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
  if (name === "Backstab" || name === "Stunning Strike") {
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
  if (
    name === "Frostbind" ||
    name === "Battle Hymn" ||
    name === "Blessing of Battle"
  ) {
    return affectedIds.map((targetId) => ({
      effectId: `${ability.id}-${targetId}-${String(sequence)}`,
      abilityId: ability.id,
      kind: "movement-cap",
      anchorCharacterId: anchorId,
      affectedCharacterId: targetId,
      duration: {
        kind: "until-boundary",
        boundaryTrigger: "end-of-next-turn",
        anchor: "affected",
        removeWhenAffectedDowned: true,
      },
      operations: ["set-movement-cap"],
      appliedSequence: sequence,
    }));
  }
  return [];
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
}

type AbilityTargetContext = {
  readonly state: ActiveMatchState;
  readonly ability: StructuredAbility;
  readonly input: AbilityTargetInput;
  readonly abilityOverride: string | null;
}

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
  const sourceTeam = teamOfCharacter(ability.ownerCharacterId);
  const targetTeam = teamOfCharacter(targetId);
  if (targetTeam === sourceTeam && abilityOverride === null) {
    throw new Error("invalid-target-relation");
  }
  if (targetCharacter.hp === 0 && abilityOverride === null) {
    throw new Error("invalid-target-life-state");
  }
  if (
    ability.targetPolicy.lifeState === "active" &&
    targetCharacter.hp === 0 &&
    abilityOverride === null
  ) {
    throw new Error("invalid-target-life-state");
  }
  return [targetId];
}

function hasDeflectingPalm(
  selections: readonly ProtectiveReactionInput[],
): boolean {
  return selections.some((selection) => {
    const reaction = RULESET.reactions.find(
      ({ id }) => id === selection.reactionId,
    );
    return reaction?.name === "Deflecting Palm";
  });
}

function validatePhysicalTargets(
  state: ActiveMatchState,
  targetIds: readonly CharacterId[],
): void {
  if (targetIds.length === 0) {
    throw new Error(
      "A physical ability needs at least one affected character.",
    );
  }
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
  const attackLegs = input.attackLegs;
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
  ability: StructuredAbility,
): readonly CharacterId[] {
  if (
    ability.name === "Second Wind" ||
    ability.name === "Rage" ||
    ability.name === "Vanish" ||
    ability.name === "Shapeshift"
  ) {
    return [ability.ownerCharacterId];
  }
  throw new Error("Utility ability needs target selection.");
}

function validateAbsoluteUtilityLifeState(
  state: ActiveMatchState,
  ability: StructuredAbility,
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

function validateUtilityTarget(context: {
  readonly state: ActiveMatchState;
  readonly ability: StructuredAbility;
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
  const sourceTeam = teamOfCharacter(ability.ownerCharacterId);
  const targetTeam = teamOfCharacter(targetId);
  const relation = ability.targetPolicy.relation;
  if (
    ((relation === "ally" && targetTeam !== sourceTeam) ||
      (relation === "enemy" && targetTeam === sourceTeam)) &&
    abilityOverride === null
  ) {
    throw new Error("invalid-target-relation");
  }
  const lifeState = ability.targetPolicy.lifeState;
  if (
    ((lifeState === "active" && targetCharacter.hp === 0) ||
      (lifeState === "downed" && targetCharacter.hp !== 0)) &&
    abilityOverride === null
  ) {
    throw new Error("invalid-target-life-state");
  }
}

function validateEliminatedTeamRevival(
  state: ActiveMatchState,
  ability: StructuredAbility,
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
  if (targetIds.length === 0) return selfDefaultTargetIds(ability);

  // Absolute card prohibitions precede the overridable policy gates.
  validateAbsoluteUtilityLifeState(state, ability, targetIds);
  for (const targetId of targetIds) {
    validateUtilityTarget({ state, ability, targetId, abilityOverride });
  }
  validateEliminatedTeamRevival(state, ability, targetIds);
  return [...targetIds];
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
    return [context.ability.ownerCharacterId];
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
  readonly activeEffects: readonly ActiveEffect[];
  readonly sequence: number;
}

export type AttackDamageResolution = {
  readonly finalDamage: number;
  readonly expired: readonly ActiveEffect[];
  readonly applied: readonly ActiveEffect[];
}

/**
 * Resolves one attack against one affected character following rules §10(4):
 * calculate all applicable damage increases first (character-based effects
 * such as Hunter's Mark or Hex add their written +1 each and stack, §11),
 * then apply legal Reactions, reductions, and prevention, then finalize.
 * Rage reduces remaining damage by exactly 1 and is consumed only when it was
 * actually needed; Hunter's Mark and Hex are consumed by the first successful
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
  const rage = activeEffects.find(
    (effect) =>
      effect.kind === "rage" &&
      effect.affectedCharacterId === affectedCharacterId,
  );
  const unmitigated = prevented || vanished ? 0 : baseDamage + marks.length;
  const finalDamage = rage && unmitigated >= 1 ? unmitigated - 1 : unmitigated;
  const expiredRage: readonly ActiveEffect[] =
    rage && unmitigated >= 1 ? [rage] : [];
  if (finalDamage >= 1) {
    return {
      finalDamage,
      expired: [...expiredRage, ...marks],
      applied: marks
        .filter((mark) => mark.kind === "hex")
        .map((mark) => hexTriggeredMovementCap(mark, sequence)),
    };
  }
  return { finalDamage, expired: expiredRage, applied: [] };
}

export {
  abilityWarnings,
  getAbilityOrThrow,
  buildAbilityEffects,
  resolveAffectedCharacterIds,
  resolveAttackDamageAgainstCharacter,
};
