import {
  MATCH_CONFIGURATION,
  type MatchConfigurationReaction,
} from "./match-configuration";
import type {
  ActiveMatchState,
  CharacterId,
  ProtectiveReactionInput,
} from "./match-types";

type ProtectiveReaction = (typeof MATCH_CONFIGURATION.reactions)[number];

export function isAvoidanceConflict(context: {
  readonly selection: ProtectiveReactionInput;
  readonly protectedCharacterId: CharacterId;
  readonly alreadySelected: boolean;
  readonly reaction: ProtectiveReaction;
}): boolean {
  const { selection, protectedCharacterId, alreadySelected, reaction } =
    context;
  if (selection.protectedCharacterId !== protectedCharacterId) return false;
  const selectedReaction = MATCH_CONFIGURATION.reactions.find(
    ({ id }) => id === selection.reactionId,
  );
  return (
    !alreadySelected &&
    selectedReaction !== undefined &&
    isAttackAvoidanceReaction(reaction) !==
      isAttackAvoidanceReaction(selectedReaction)
  );
}

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
