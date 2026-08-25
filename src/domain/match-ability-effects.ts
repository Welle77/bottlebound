import { RULESET, type StructuredAbility } from "./ruleset";
import type { ActiveEffect, ActiveMatchState } from "./match-types";

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

function abilityWarnings(state: ActiveMatchState, abilityId: string): string[] {
  const warnings: string[] = [];
  if (state.spentAbilityIds.includes(abilityId)) {
    warnings.push("ability-already-spent");
  }
  return warnings;
}

function getAbilityOrThrow(abilityId: string) {
  const ability = RULESET.abilities.find((entry) => entry.id === abilityId);
  if (!ability) throw new Error("The ability is unknown.");
  return ability;
}

function buildAbilityEffects(
  ability: StructuredAbility,
  context: {
    affectedIds: readonly string[];
    sequence: number;
    anchorId: string;
  },
): ActiveEffect[] {
  const { affectedIds, sequence, anchorId } = context;
  const effects: ActiveEffect[] = [];
  const name = ability.name;
  // Hunter's Mark / Hex (add-damage until the end of the source's next
  // scheduled initiative position; rules §15 card durations)
  if (isAbilityNamed(ability, "Hunter’s Mark") || name === "Hex") {
    for (const targetId of affectedIds) {
      effects.push({
        effectId: `${ability.id}-${targetId}-${sequence}`,
        abilityId: ability.id,
        kind: isAbilityNamed(ability, "Hunter’s Mark")
          ? "hunters-mark"
          : "hex",
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
      });
    }
    return effects;
  }
  if (name === "Rage") {
    effects.push({
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
    });
    return effects;
  }
  if (name === "Vanish") {
    effects.push({
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
    });
    return effects;
  }
  if (name === "Shapeshift") {
    effects.push({
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
    });
    return effects;
  }
  // Physical prohibit effects
  if (name === "Backstab" || name === "Stunning Strike") {
    for (const targetId of affectedIds) {
      effects.push({
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
      });
    }
    return effects;
  }
  // Movement caps
  if (
    name === "Frostbind" ||
    name === "Battle Hymn" ||
    name === "Blessing of Battle" ||
    name === "Hex"
  ) {
    // Hex movement is handled via consumption, not initial
    if (name !== "Hex") {
      for (const targetId of affectedIds) {
        effects.push({
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
        });
      }
      return effects;
    }
  }
  return effects;
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
  const expired: ActiveEffect[] = [];
  const applied: ActiveEffect[] = [];
  const marks = activeEffects.filter(
    (effect) =>
      (effect.kind === "hunters-mark" || effect.kind === "hex") &&
      effect.affectedCharacterId === affectedCharacterId,
  );
  let pending = baseDamage + marks.length;
  if (prevented) pending = 0;
  if (
    !prevented &&
    physicalAttack &&
    activeEffects.some(
      (effect) =>
        effect.kind === "vanish" &&
        effect.affectedCharacterId === affectedCharacterId,
    )
  ) {
    pending = 0;
  }
  const rage = activeEffects.find(
    (effect) =>
      effect.kind === "rage" &&
      effect.affectedCharacterId === affectedCharacterId,
  );
  if (rage && pending >= 1) {
    pending -= 1;
    expired.push(rage);
  }
  const finalDamage = Math.max(0, pending);
  if (finalDamage >= 1) {
    for (const mark of marks) {
      expired.push(mark);
      if (mark.kind === "hex") {
        applied.push(hexTriggeredMovementCap(mark, sequence));
      }
    }
  }
  return { finalDamage, expired, applied };
}

export { abilityWarnings, getAbilityOrThrow, buildAbilityEffects, resolveAttackDamageAgainstCharacter };
