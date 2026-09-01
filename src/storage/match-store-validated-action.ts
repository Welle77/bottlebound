import {
  isAbilityId,
  isActionKind,
  isAttackKind,
  isCharacterId,
} from "../domain/match";
import {
  assertActiveEffectStructure,
  MATCH_CONFIGURATION,
} from "../domain/match";

const invalidActionResolution = () =>
  new Error("The validated Action Resolution Event is invalid.");

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function matchesCurrentBasicAttack(value: Record<string, unknown>): boolean {
  const attack = MATCH_CONFIGURATION.basicAttacks.find(
    ({ id }) => id === value.attackId,
  );
  return (
    attack !== undefined &&
    value.sourceCharacterId === attack.characterId &&
    value.attackType === attack.attackType &&
    value.rangePaces === attack.rangePaces &&
    value.damage === attack.damage
  );
}

function assertBasicAttackMetadata(value: Record<string, unknown>): void {
  if (value.actionType !== "Basic Attack") return;
  if (!matchesCurrentBasicAttack(value)) throw invalidActionResolution();
}

function hasValidOptionalAbilityId(
  abilityId: unknown,
  attackId: unknown,
): boolean {
  return (
    abilityId === undefined ||
    abilityId === null ||
    (isNonEmptyString(abilityId) &&
      isAbilityId(abilityId) &&
      abilityId === attackId)
  );
}

function hasCurrentAbilityMetadata(value: Record<string, unknown>): boolean {
  return (
    isNonEmptyString(value.attackId) &&
    isAbilityId(value.attackId) &&
    isNonEmptyString(value.attackType) &&
    isAttackKind(value.attackType) &&
    value.attackType === "ability" &&
    hasValidOptionalAbilityId(value.abilityId, value.attackId)
  );
}

function assertAbilityMetadata(value: Record<string, unknown>): void {
  if (value.actionType !== "Ability") return;
  if (!hasCurrentAbilityMetadata(value)) throw invalidActionResolution();
}

export function assertActionResolutionMetadata(
  value: Record<string, unknown>,
): void {
  if (typeof value.actionType !== "string" || !isActionKind(value.actionType)) {
    throw invalidActionResolution();
  }
  assertBasicAttackMetadata(value);
  assertAbilityMetadata(value);
}

function activeEffectCollectionIsValid(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  try {
    value.forEach((effect) => {
      assertActiveEffectStructure(effect);
    });
    return true;
  } catch {
    return false;
  }
}

function everyEntryIs(
  value: unknown,
  isAllowed: (entry: string) => boolean,
): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      (entry: unknown) => typeof entry === "string" && isAllowed(entry),
    )
  );
}

function effectCollectionsAreValid(value: Record<string, unknown>): boolean {
  const targetCharacterIdsAreValid =
    value.targetCharacterIds === undefined ||
    everyEntryIs(value.targetCharacterIds, isCharacterId);
  const spentAbilityIdsAreValid =
    value.spentAbilityIds === undefined ||
    everyEntryIs(value.spentAbilityIds, isAbilityId);
  const appliedEffectsAreValid =
    value.appliedEffects === undefined ||
    activeEffectCollectionIsValid(value.appliedEffects);
  return (
    targetCharacterIdsAreValid &&
    spentAbilityIdsAreValid &&
    appliedEffectsAreValid &&
    activeEffectCollectionIsValid(value.expiredEffects)
  );
}

export function assertActionResolutionEffectCollections(
  value: Record<string, unknown>,
): void {
  if (!effectCollectionsAreValid(value)) {
    throw invalidActionResolution();
  }
}

export function assertExpiredEffectCollection(value: unknown): void {
  if (!activeEffectCollectionIsValid(value)) {
    throw new Error("The validated Finish Turn Event is invalid.");
  }
}
