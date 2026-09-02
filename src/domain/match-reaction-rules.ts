import type { MatchConfigurationReaction } from "./match-configuration/types";
import type { ActiveMatchState, CharacterId } from "./match-types";

export function isDamageBlockReaction(
  reaction: MatchConfigurationReaction,
): boolean {
  return reaction.operations.some(
    ({ type }) => type === "reduce-remaining-damage",
  );
}

export function isAttackAvoidanceReaction(
  reaction: MatchConfigurationReaction,
): boolean {
  return reaction.operations.some(
    ({ type }) => type === "prevent-damage-and-effects",
  );
}

export function isVanishProtected(
  state: ActiveMatchState,
  characterId: CharacterId,
): boolean {
  return state.activeEffects.some(
    (effect) =>
      effect.kind === "vanish" && effect.affectedCharacterId === characterId,
  );
}

export function damageBlockCapacity(
  state: ActiveMatchState,
  protectedCharacterId: CharacterId,
): number {
  return (
    1 +
    state.activeEffects.filter(
      (effect) =>
        (effect.kind === "hunters-mark" || effect.kind === "hex") &&
        effect.affectedCharacterId === protectedCharacterId,
    ).length
  );
}
