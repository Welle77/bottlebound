import { RULESET, type StructuredAbility } from "./ruleset";
import type { ActiveEffect, ActiveMatchState } from "./match-types";

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
  // Hunter's Mark / Hex (add-damage until next scheduled slot)
  if (name === "Hunter's Mark" || name === "Hex") {
    for (const targetId of affectedIds) {
      effects.push({
        effectId: `${ability.id}-${targetId}-${sequence}`,
        abilityId: ability.id,
        kind: name === "Hunter's Mark" ? "hunters-mark" : "hex",
        anchorCharacterId: anchorId,
        affectedCharacterId: targetId,
        duration: {
          kind: "until-trigger-or-boundary",
          boundaryTrigger: "beginning-of-next-scheduled-slot",
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

export { abilityWarnings, getAbilityOrThrow, buildAbilityEffects };
