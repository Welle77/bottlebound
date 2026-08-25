import { RULESET, type StructuredAbility } from "./ruleset";
import type { ProtectiveReactionInput } from "./match-types";
import type { ActiveEffect, ActiveMatchState } from "./match-types";
import { teamOfCharacter } from "./match-endgame";

/**
 * Compares an ability against its printed card name while folding the
 * apostrophe variants (U+2019 versus U+0027). The authoritative rules document
 * prints typographic apostrophes ("Hunter's Mark", "Nature's Renewal"), so
 * byte-equality against source-level ASCII strings silently fails.
 */
export function isAbilityNamed(
  ability: { readonly name: string },
  printedName: string,
): boolean {
  const fold = (value: string): string => value.replaceAll(/['’]/g, "");
  return fold(ability.name) === fold(printedName);
}

function abilityWarnings(
  state: ActiveMatchState,
  abilityId: string,
): readonly string[] {
  return state.spentAbilityIds.includes(abilityId)
    ? ["ability-already-spent"]
    : [];
}

function getAbilityOrThrow(abilityId: string) {
  const ability = RULESET.abilities.find((entry) => entry.id === abilityId);
  if (!ability) throw new Error("The ability is unknown.");
  return ability;
}

function buildAbilityEffects(
  ability: StructuredAbility,
  context: {
    readonly affectedIds: readonly string[];
    readonly sequence: number;
    readonly anchorId: string;
  },
): readonly ActiveEffect[] {
  const { affectedIds, sequence, anchorId } = context;
  const name = ability.name;
  // Hunter's Mark / Hex (add-damage until the end of the source's next
  // scheduled initiative position; rules §15 card durations)
  if (isAbilityNamed(ability, "Hunter’s Mark") || name === "Hex") {
    return affectedIds.map((targetId) => ({
      effectId: `${ability.id}-${targetId}-${sequence}`,
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
        effectId: `${ability.id}-${anchorId}-${sequence}`,
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
        effectId: `${ability.id}-${anchorId}-${sequence}`,
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
        effectId: `${ability.id}-${anchorId}-${sequence}`,
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
      effectId: `${ability.id}-${targetId}-${sequence}`,
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
      effectId: `${ability.id}-${targetId}-${sequence}`,
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

function resolveAffectedCharacterIds(context: {
  readonly state: ActiveMatchState;
  readonly ability: StructuredAbility;
  readonly input: {
    readonly targetCharacterIds?: readonly string[];
    readonly attackLegs?: readonly Readonly<{
      readonly affectedCharacterIds: readonly string[];
    }>[];
    readonly physicalConfirmations?: Readonly<{
      readonly range: boolean;
      readonly lineOfSight: boolean;
      readonly legalBottleContact: boolean;
      readonly terrainContact: boolean;
    }>;
    readonly reactions?: readonly ProtectiveReactionInput[];
  };
  readonly abilityOverride: string | null;
}): readonly string[] {
  const { state, ability, input, abilityOverride } = context;
  const attackLegsInput = input.attackLegs;
  const targetIds = input.targetCharacterIds ?? [];

  if (ability.interaction === "targeted-attack") {
    if (targetIds.length !== 1) {
      throw new Error("A targeted Ability Attack needs exactly one target.");
    }
    const targetId = targetIds[0]!;
    const targetChar = state.characters.find(
      (character) => character.characterId === targetId,
    );
    if (!targetChar)
      throw new Error("The ability references an unknown target.");
    const sourceTeam = teamOfCharacter(ability.ownerCharacterId);
    const targetTeam = teamOfCharacter(targetId);
    if (targetTeam === sourceTeam) {
      const override = abilityOverride;
      if (override === null) throw new Error("invalid-target-relation");
    }
    if (targetChar.hp === 0) {
      const override = abilityOverride;
      if (override === null) throw new Error("invalid-target-life-state");
    }
    // Enforce targetPolicy lifeState active unless either
    if (ability.targetPolicy.lifeState === "active" && targetChar.hp === 0) {
      const override = abilityOverride;
      if (override === null) throw new Error("invalid-target-life-state");
    }
    return [targetId];
  } else if (ability.interaction === "physical-attack") {
    if (!attackLegsInput || attackLegsInput.length === 0) {
      throw new Error("A physical ability needs ordered bottle contacts.");
    }
    const confirmations = input.physicalConfirmations;
    if (
      !confirmations ||
      Object.values(confirmations).some((value) => value !== true)
    ) {
      throw new Error("Every manual physical confirmation is required.");
    }
    const flat = attackLegsInput.flatMap(
      ({ affectedCharacterIds }) => affectedCharacterIds,
    );
    if (flat.length === 0)
      throw new Error(
        "A physical ability needs at least one affected character.",
      );
    if (new Set(flat).size !== flat.length)
      throw new Error("Basic Attack contacts must be unique.");
    for (const characterId of flat) {
      if (
        !state.characters.some(
          (character) => character.characterId === characterId,
        )
      ) {
        throw new Error(
          "Physical ability references an unknown affected character.",
        );
      }
    }
    // Deflecting Palm handling for physical ability (reuse)
    const selectedReactions = input.reactions ?? [];
    const redirectReaction = selectedReactions.find((selection) => {
      const reaction = RULESET.reactions.find(
        ({ id }) => id === selection.reactionId,
      );
      return reaction?.name === "Deflecting Palm";
    });
    if (redirectReaction && attackLegsInput.length !== 2) {
      throw new Error(
        "Deflecting Palm needs exactly one redirected Attack Leg.",
      );
    }
    if (!redirectReaction && attackLegsInput.length !== 1) {
      throw new Error("A redirected Attack Leg needs Deflecting Palm.");
    }
    return flat;
  } else if (ability.interaction === "self") {
    return [ability.ownerCharacterId];
  } else if (
    ability.interaction === "ally" ||
    ability.interaction === "enemy" ||
    ability.interaction === "utility"
  ) {
    // For utility: use provided targetCharacterIds or default to self for self-targeting heals
    if (targetIds.length === 0) {
      // Some utilities are self (Second Wind, Rage) – default to owner
      if (
        ability.name === "Second Wind" ||
        ability.name === "Rage" ||
        ability.name === "Vanish" ||
        ability.name === "Shapeshift"
      ) {
        return [ability.ownerCharacterId];
      } else {
        throw new Error("Utility ability needs target selection.");
      }
    } else {
      // Card-level life-state gates with unambiguous rules text (rules §12
      // and §15): ordinary healing cannot affect a Downed character, Nature's
      // Renewal and Inspiring Words cannot target one, and Revivify needs a
      // Downed ally. These absolute card prohibitions are checked before the
      // overridable policy gates below.
      if (
        isAbilityNamed(ability, "Nature’s Renewal") ||
        ability.name === "Inspiring Words"
      ) {
        for (const targetId of targetIds) {
          const targetChar = state.characters.find(
            (character) => character.characterId === targetId,
          );
          if (targetChar?.hp === 0) {
            throw new Error(
              "A Downed character cannot be targeted by this healing ability.",
            );
          }
        }
      }
      if (ability.name === "Revivify") {
        for (const targetId of targetIds) {
          const targetChar = state.characters.find(
            (character) => character.characterId === targetId,
          );
          if (targetChar && targetChar.hp !== 0) {
            throw new Error("Revivify needs one Downed ally as its target.");
          }
        }
      }
      // Validate each target relation and lifeState
      for (const targetId of targetIds) {
        const targetChar = state.characters.find(
          (character) => character.characterId === targetId,
        );
        if (!targetChar)
          throw new Error("Utility ability references unknown target.");
        const sourceTeam = teamOfCharacter(ability.ownerCharacterId);
        const targetTeam = teamOfCharacter(targetId);
        const relation = ability.targetPolicy.relation;
        if (relation === "ally" && targetTeam !== sourceTeam) {
          const override = abilityOverride;
          if (override === null) throw new Error("invalid-target-relation");
        }
        if (relation === "enemy" && targetTeam === sourceTeam) {
          const override = abilityOverride;
          if (override === null) throw new Error("invalid-target-relation");
        }
        // lifeState
        if (
          ability.targetPolicy.lifeState === "active" &&
          targetChar.hp === 0
        ) {
          const override = abilityOverride;
          if (override === null) throw new Error("invalid-target-life-state");
        }
        if (
          ability.targetPolicy.lifeState === "downed" &&
          targetChar.hp !== 0
        ) {
          const override = abilityOverride;
          if (override === null) throw new Error("invalid-target-life-state");
        }
      }
      // Specific guards: Revivify and Lay on Hands revive blocked when the
      // target's team is eliminated.
      if (
        (ability.name === "Revivify" || ability.name === "Lay on Hands") &&
        targetIds.some((targetId) => {
          const targetChar = state.characters.find(
            (character) => character.characterId === targetId,
          );
          return targetChar?.hp === 0;
        })
      ) {
        for (const targetId of targetIds) {
          const targetChar = state.characters.find(
            (character) => character.characterId === targetId,
          );
          if (targetChar?.hp === 0) {
            const team = teamOfCharacter(targetId);
            if (state.eliminatedTeams.includes(team)) {
              throw new Error("eliminated-team");
            }
          }
        }
      }
      return [...targetIds];
    }
  }
  return [];
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
    effectId: `${hex.abilityId}-hex-movement-${hex.affectedCharacterId}-${sequence}`,
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

export interface AttackDamageInput {
  readonly baseDamage: number;
  readonly affectedCharacterId: string;
  /** Physical throws cannot affect a Vanish-protected character. */
  readonly physicalAttack: boolean;
  /** A protective Reaction prevented all damage and effects for the character. */
  readonly prevented: boolean;
  readonly activeEffects: readonly ActiveEffect[];
  readonly sequence: number;
}

export interface AttackDamageResolution {
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
