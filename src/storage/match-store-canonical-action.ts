import {
  isAbilityId,
  isActionKind,
  isAttackKind,
  isCharacterId,
} from "../domain/match";
import { assertActiveEffectStructure } from "../domain/match-history";
import { RULESET } from "../domain/ruleset";

const invalidActionResolution = () =>
  new Error("The canonical Action Resolution Event is invalid.");

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function matchesCurrentBasicAttack(value: Record<string, unknown>): boolean {
  const attack = RULESET.basicAttacks.find(({ id }) => id === value.attackId);
  return (
    attack !== undefined &&
    value.sourceCharacterId === attack.characterId &&
    value.attackType === attack.attackType &&
    value.rangePaces === attack.rangePaces &&
    value.damage === attack.damage &&
    value.rulesSourceAnchor === attack.sourceAnchor
  );
}

function assertBasicAttackMetadata(
  value: Record<string, unknown>,
  historicalRuleset: boolean,
): void {
  if (historicalRuleset || value.actionType !== "Basic Attack") return;
  if (!matchesCurrentBasicAttack(value)) throw invalidActionResolution();
}

function hasValidOptionalAbilityId(
  abilityId: unknown,
  attackId: unknown,
  historicalRuleset: boolean,
): boolean {
  return (
    abilityId === undefined ||
    abilityId === null ||
    (isNonEmptyString(abilityId) &&
      (historicalRuleset || isAbilityId(abilityId)) &&
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
    hasValidOptionalAbilityId(value.abilityId, value.attackId, false) &&
    isNonEmptyString(value.rulesSourceAnchor)
  );
}

function hasHistoricalAbilityMetadata(value: Record<string, unknown>): boolean {
  return (
    isNonEmptyString(value.attackId) &&
    isNonEmptyString(value.rulesSourceAnchor) &&
    hasValidOptionalAbilityId(value.abilityId, value.attackId, true)
  );
}

function assertAbilityMetadata(
  value: Record<string, unknown>,
  historicalRuleset: boolean,
): void {
  if (value.actionType !== "Ability") return;
  const metadataIsValid = historicalRuleset
    ? hasHistoricalAbilityMetadata(value)
    : hasCurrentAbilityMetadata(value);
  if (!metadataIsValid) throw invalidActionResolution();
}

export function assertActionResolutionMetadata(
  value: Record<string, unknown>,
  historicalRuleset: boolean,
): void {
  if (typeof value.actionType !== "string" || !isActionKind(value.actionType)) {
    throw invalidActionResolution();
  }
  assertBasicAttackMetadata(value, historicalRuleset);
  assertAbilityMetadata(value, historicalRuleset);
}

function activeEffectCollectionIsValid(
  value: unknown,
  historicalRuleset: boolean,
): boolean {
  if (!Array.isArray(value)) return false;
  try {
    value.forEach((effect) => {
      assertActiveEffectStructure(effect, historicalRuleset);
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

function effectCollectionsAreValid(
  value: Record<string, unknown>,
  historicalRuleset: boolean,
): boolean {
  const targetCharacterIdsAreValid =
    value.targetCharacterIds === undefined ||
    everyEntryIs(value.targetCharacterIds, isCharacterId);
  const spentAbilityIdsAreValid =
    value.spentAbilityIds === undefined ||
    everyEntryIs(
      value.spentAbilityIds,
      historicalRuleset ? isNonEmptyString : isAbilityId,
    );
  const appliedEffectsAreValid =
    value.appliedEffects === undefined ||
    activeEffectCollectionIsValid(value.appliedEffects, historicalRuleset);
  return (
    targetCharacterIdsAreValid &&
    spentAbilityIdsAreValid &&
    appliedEffectsAreValid &&
    activeEffectCollectionIsValid(value.expiredEffects, historicalRuleset)
  );
}

export function assertActionResolutionEffectCollections(
  value: Record<string, unknown>,
  historicalRuleset: boolean,
): void {
  if (!effectCollectionsAreValid(value, historicalRuleset)) {
    throw invalidActionResolution();
  }
}

export function assertExpiredEffectCollection(
  value: unknown,
  historicalRuleset: boolean,
): void {
  if (!activeEffectCollectionIsValid(value, historicalRuleset)) {
    throw new Error("The canonical Finish Turn Event is invalid.");
  }
}
