import type {
  AbilityId,
  AbilityInput,
  CharacterId,
  PhysicalAttackCheck,
  ProtectiveReactionInput,
} from "../domain/match";
import { MATCH_CONFIGURATION } from "../domain/match";

export type AbilityDraftInput = {
  readonly abilityId: AbilityId;
  readonly targetCharacterIds?: readonly CharacterId[];
  readonly attackLegs?: readonly {
    readonly affectedCharacterIds: readonly CharacterId[];
  }[];
  readonly physicalConfirmations?: Readonly<
    Record<PhysicalAttackCheck, boolean>
  >;
  readonly reactions?: readonly ProtectiveReactionInput[];
  readonly majorActionOverride: boolean;
  readonly abilityOverride: boolean;
};

function physicalConfirmationsOf(
  confirmations: Readonly<Record<PhysicalAttackCheck, boolean>>,
): NonNullable<AbilityInput["physicalConfirmations"]> {
  return {
    range: confirmations.range,
    lineOfSight: confirmations["line-of-sight"],
    legalBottleContact: confirmations["legal-bottle-contact"],
    terrainContact: confirmations["terrain-contact"],
  };
}

function abilityOf(abilityId: AbilityId) {
  const ability = MATCH_CONFIGURATION.abilities.find(
    ({ id }) => id === abilityId,
  );
  if (!ability)
    throw new Error("The Action Draft references an unknown ability.");
  return ability;
}

export function abilityInputFromDraft(input: AbilityDraftInput): AbilityInput {
  const ability = abilityOf(input.abilityId);
  return {
    abilityId: ability.id,
    ...(ability.interaction === "self"
      ? {}
      : { targetCharacterIds: [...(input.targetCharacterIds ?? [])] }),
    ...(ability.interaction === "physical-attack"
      ? {
          attackLegs: (input.attackLegs ?? []).map(
            ({ affectedCharacterIds }) => ({
              affectedCharacterIds: [...affectedCharacterIds],
            }),
          ),
          ...(input.physicalConfirmations
            ? {
                physicalConfirmations: physicalConfirmationsOf(
                  input.physicalConfirmations,
                ),
              }
            : {}),
        }
      : {}),
    ...(input.reactions === undefined
      ? {}
      : { reactions: input.reactions.map((reaction) => ({ ...reaction })) }),
    majorActionOverride: input.majorActionOverride
      ? MATCH_CONFIGURATION.refereeInstructions.secondMajorAction
      : null,
    abilityOverride: input.abilityOverride
      ? MATCH_CONFIGURATION.refereeInstructions.stateInvalidAbility
      : null,
  };
}
