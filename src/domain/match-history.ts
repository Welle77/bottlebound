import { MATCH_CONFIGURATION } from "./match-configuration";
import {
  MATCH_SCHEMA_VERSION,
  isAbilityId,
  isActiveEffectKind,
  isCharacterId,
  isEffectBoundaryTrigger,
  isEffectDurationKind,
  isEffectOperation,
  isInteger,
  isDecisionBasis,
  isReactionId,
  isTeam,
} from "./match-types";
import type {
  DecisionBasis,
  EndedMatchState,
  FinalTeamCounts,
  MatchOutcome,
  MatchState,
  MatchSummary,
} from "./match-types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function orderedJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(orderedJsonValue);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, orderedJsonValue(value[key])]),
    );
  }
  return value;
}

export function validatedMatchRecordsEqual(
  left: unknown,
  right: unknown,
): boolean {
  return (
    JSON.stringify(orderedJsonValue(left)) ===
    JSON.stringify(orderedJsonValue(right))
  );
}

function assertStringArray(
  value: unknown,
  label: string,
  isAllowed?: (entry: string) => boolean,
): asserts value is readonly string[] {
  if (
    !Array.isArray(value) ||
    !value.every(
      (entry) => typeof entry === "string" && (isAllowed?.(entry) ?? true),
    )
  ) {
    throw new Error(`The validated ${label} is structurally invalid.`);
  }
}

function isHistoricalAbilityId(value: string): boolean {
  return value.length > 0;
}

function hasValidActiveEffectIdentity(
  effect: Record<string, unknown>,
  isValidAbilityId: (value: string) => boolean = isAbilityId,
): boolean {
  return (
    typeof effect.effectId === "string" &&
    effect.effectId.length > 0 &&
    typeof effect.abilityId === "string" &&
    isValidAbilityId(effect.abilityId) &&
    typeof effect.anchorCharacterId === "string" &&
    isCharacterId(effect.anchorCharacterId) &&
    typeof effect.affectedCharacterId === "string" &&
    isCharacterId(effect.affectedCharacterId) &&
    isInteger(effect.appliedSequence) &&
    effect.appliedSequence >= 1
  );
}

function hasValidEffectBranch(
  value: unknown,
  isCurrentValue: (branch: string) => boolean,
): boolean {
  return typeof value === "string" && isCurrentValue(value);
}

function hasValidActiveEffectDuration(
  duration: Record<string, unknown>,
): boolean {
  const { boundaryTrigger } = duration;
  const boundaryTriggerIsValid =
    boundaryTrigger === undefined ||
    hasValidEffectBranch(boundaryTrigger, isEffectBoundaryTrigger);
  return (
    hasValidEffectBranch(duration.kind, isEffectDurationKind) &&
    boundaryTriggerIsValid &&
    (duration.anchor === "source" || duration.anchor === "affected") &&
    typeof duration.removeWhenAffectedDowned === "boolean"
  );
}

function hasValidActiveEffectOperations(operations: unknown): boolean {
  return (
    Array.isArray(operations) &&
    operations.every(
      (operation) =>
        typeof operation === "string" && isEffectOperation(operation),
    )
  );
}

export function assertActiveEffectStructure(
  effect: unknown,
  isValidAbilityId: (value: string) => boolean = isAbilityId,
): void {
  if (!isRecord(effect) || !isRecord(effect.duration)) {
    throw new Error("The validated active effects are structurally invalid.");
  }
  if (
    !hasValidActiveEffectIdentity(effect, isValidAbilityId) ||
    !hasValidEffectBranch(effect.kind, isActiveEffectKind) ||
    !hasValidActiveEffectDuration(effect.duration) ||
    !hasValidActiveEffectOperations(effect.operations)
  ) {
    throw new Error("The validated active effects are structurally invalid.");
  }
}

/** Shared structural boundary used by domain replay and validated storage. */
export function assertMatchStateStructure(
  value: unknown,
  schemaVersion: typeof MATCH_SCHEMA_VERSION = MATCH_SCHEMA_VERSION,
): asserts value is MatchState {
  assertMatchStateHeader(value, schemaVersion);
  assertMatchStateRoster(value);
  assertMatchStateInitiative(value);
  assertMatchStateTurn(value);
  assertEndedMatchState(value);
  assertMatchStatePersistence(value);
}

function assertMatchStateHeader(
  value: unknown,
  schemaVersion: typeof MATCH_SCHEMA_VERSION,
): asserts value is MatchState {
  if (
    !isRecord(value) ||
    value.schemaVersion !== schemaVersion ||
    typeof value.configurationVersion !== "string" ||
    value.configurationVersion.length === 0 ||
    typeof value.matchId !== "string" ||
    value.matchId.length === 0 ||
    (value.phase !== "setup" &&
      value.phase !== "active" &&
      value.phase !== "ended") ||
    !isInteger(value.sequence) ||
    value.sequence < 1
  ) {
    throw new Error("The validated Match State is structurally invalid.");
  }
}

function assertMatchStateRoster(value: MatchState): void {
  if (
    !Array.isArray(value.characters) ||
    value.characters.length !== MATCH_CONFIGURATION.characters.length
  ) {
    throw new Error("The validated Match State roster is invalid.");
  }
  value.characters.forEach((entry, index) => {
    const rulesCharacter = MATCH_CONFIGURATION.characters[index];
    if (
      !rulesCharacter ||
      !isRecord(entry) ||
      entry.characterId !== rulesCharacter.id ||
      !isInteger(entry.hp) ||
      entry.hp < 0
    ) {
      throw new Error("The validated Match State roster is invalid.");
    }
    const currentMaxHp = isInteger(entry.currentMaxHp)
      ? entry.currentMaxHp
      : undefined;
    const effectiveMax = currentMaxHp ?? rulesCharacter.baseHp;
    if (
      entry.hp > effectiveMax ||
      (currentMaxHp !== undefined &&
        (!isInteger(currentMaxHp) || currentMaxHp < 1 || currentMaxHp > 10))
    ) {
      throw new Error("The validated Match State roster is invalid.");
    }
  });
}

function assertMatchStateInitiative(value: MatchState): void {
  if (value.initiative === null) {
    if (value.phase !== "setup") {
      throw new Error("The Active Match initiative result is incomplete.");
    }
  } else if (
    !Array.isArray(value.initiative) ||
    value.initiative.length !== MATCH_CONFIGURATION.characters.length
  ) {
    throw new Error("The validated initiative result is structurally invalid.");
  }
}

function assertMatchStateTurn(value: MatchState): void {
  if (value.phase === "setup") return;
  const { round, activeSlot } = value;
  if (
    !isInteger(round) ||
    round < 1 ||
    !isInteger(activeSlot) ||
    activeSlot < 1 ||
    activeSlot > MATCH_CONFIGURATION.characters.length
  ) {
    throw new Error("The Active Match turn is structurally invalid.");
  }
}

function assertEndedMatchState(value: MatchState): void {
  if (value.phase !== "ended") return;
  assertEndedMatchMetadata(value);
  assertEndedMatchDecision(value);
}

function assertEndedMatchMetadata(value: EndedMatchState): void {
  const { endedAt } = value;
  const { endedSequence } = value;
  const { sequence } = value;
  if (
    typeof endedAt !== "string" ||
    endedAt.length === 0 ||
    !isInteger(endedSequence) ||
    endedSequence < 2 ||
    !isInteger(sequence) ||
    endedSequence > sequence
  ) {
    throw new Error("The Ended Match state is structurally invalid.");
  }
}

function assertEndedMatchDecision(value: EndedMatchState): void {
  const { decisionBasis } = value;
  if (typeof decisionBasis !== "string" || !isDecisionBasis(decisionBasis)) {
    throw new Error("The Ended Match decision basis is invalid.");
  }
  assertFinalTeamTallies(
    value.finalCounts,
    "The Ended Match final team tallies are invalid.",
  );
  assertFinalTeamTallies(
    value.finalHpTotals,
    "The Ended Match final team tallies are invalid.",
  );
  const { coinFlipResult } = value;
  if (
    coinFlipResult !== null &&
    (typeof coinFlipResult !== "string" || !isTeam(coinFlipResult))
  ) {
    throw new Error("The Ended Match coin flip result is invalid.");
  }
  if ((decisionBasis === "coinFlip") !== (coinFlipResult !== null)) {
    throw new Error("The Ended Match coin flip result is invalid.");
  }
}

function isValidCombatEconomy(state: Record<string, unknown>): boolean {
  const { remainingMovementPaces } = state;
  const actionsUsed = (() => {
    if (typeof state.actionsUsed === "number") return state.actionsUsed;
    if (state.majorActionUsed) return 1;
    return 0;
  })();
  return (
    typeof state.majorActionUsed === "boolean" &&
    isInteger(actionsUsed) &&
    actionsUsed >= 0 &&
    actionsUsed <= 2 &&
    state.movementPaces === 2 &&
    typeof remainingMovementPaces === "number" &&
    isInteger(remainingMovementPaces) &&
    remainingMovementPaces >= 0 &&
    remainingMovementPaces <= state.movementPaces
  );
}

function assertMatchStatePersistence(value: MatchState): void {
  const state = value;
  const isValidAbilityId =
    value.configurationVersion === MATCH_CONFIGURATION.version
      ? isAbilityId
      : isHistoricalAbilityId;
  assertStringArray(state.spentAbilityIds, "spent Abilities", isValidAbilityId);
  if (!Array.isArray(state.activeEffects)) {
    throw new Error("The validated active effects are structurally invalid.");
  }
  state.activeEffects.forEach((effect) => {
    assertActiveEffectStructure(effect, isValidAbilityId);
  });
  const names = state.displayNames;
  if (
    !isRecord(names) ||
    !Object.keys(names).every(
      (characterId) =>
        isCharacterId(characterId) &&
        typeof names[characterId] === "string" &&
        names[characterId].length > 0 &&
        names[characterId].trim() === names[characterId] &&
        MATCH_CONFIGURATION.characters.some(({ id }) => id === characterId),
    )
  ) {
    throw new Error("The validated Match display names are invalid.");
  }
  assertStringArray(state.spentReactionIds, "spent Reactions", isReactionId);
  assertStringArray(state.eliminatedTeams, "Team Elimination state", isTeam);
  assertStringArray(
    state.acknowledgedEliminations,
    "acknowledged Team Elimination state",
    isTeam,
  );
  if (
    !isValidCombatEconomy(state) ||
    !state.eliminatedTeams.every((team) => isTeam(team)) ||
    new Set(state.eliminatedTeams).size !== state.eliminatedTeams.length ||
    !state.acknowledgedEliminations.every((team) => isTeam(team)) ||
    (state.outcome !== null && !isMatchOutcome(state.outcome))
  ) {
    throw new Error("The validated combat state is structurally invalid.");
  }
}

function assertFinalTeamTallies(
  value: unknown,
  message: string,
): asserts value is FinalTeamCounts {
  if (
    !isRecord(value) ||
    !isInteger(value.Drow) ||
    !isInteger(value.Duergar) ||
    value.Drow < 0 ||
    value.Duergar < 0
  ) {
    throw new Error(message);
  }
}

export function assertMatchSummaryStructure(
  value: unknown,
): asserts value is MatchSummary {
  assertMatchSummaryHeader(value);
  assertFinalTeamTallies(
    value.finalCounts,
    "The Match Summary is structurally invalid.",
  );
  assertFinalTeamTallies(
    value.finalHpTotals,
    "The Match Summary is structurally invalid.",
  );
  assertMatchSummaryCoinFlip(value);
}

function assertMatchSummaryHeader(
  value: unknown,
): asserts value is MatchSummary {
  if (!isRecord(value)) {
    throw new Error("The Match Summary is structurally invalid.");
  }
  const { outcome } = value;
  const { decisionBasis } = value;
  const { configurationVersion } = value;
  const { endedAt } = value;
  if (
    !isValidOutcome(outcome) ||
    !isValidDecisionBasis(decisionBasis) ||
    typeof configurationVersion !== "string" ||
    configurationVersion.length === 0 ||
    typeof endedAt !== "string" ||
    endedAt.length === 0
  ) {
    throw new Error("The Match Summary is structurally invalid.");
  }
}

function isMatchOutcome(value: unknown): value is Exclude<MatchOutcome, null> {
  return value === "draw" || (typeof value === "string" && isTeam(value));
}

function isValidOutcome(value: unknown): value is Exclude<MatchOutcome, null> {
  return isMatchOutcome(value);
}

function isValidDecisionBasis(value: unknown): value is DecisionBasis {
  return typeof value === "string" && isDecisionBasis(value);
}

function assertMatchSummaryCoinFlip(value: MatchSummary): void {
  const { coinFlipResult } = value;
  const { decisionBasis } = value;
  if (
    coinFlipResult !== undefined &&
    (typeof coinFlipResult !== "string" || !isTeam(coinFlipResult))
  ) {
    throw new Error("The Match Summary coin flip result is invalid.");
  }
  if (decisionBasis === "coinFlip" && coinFlipResult === undefined) {
    throw new Error("The Match Summary coin flip result is invalid.");
  }
  if (coinFlipResult !== undefined && decisionBasis !== "coinFlip") {
    throw new Error("The Match Summary coin flip result is invalid.");
  }
}

export function toMatchSummary(state: EndedMatchState): MatchSummary {
  const summary: MatchSummary = {
    outcome: state.outcome,
    decisionBasis: state.decisionBasis,
    finalCounts: state.finalCounts,
    finalHpTotals: state.finalHpTotals,
    configurationVersion: state.configurationVersion,
    endedAt: state.endedAt,
    ...(state.coinFlipResult ? { coinFlipResult: state.coinFlipResult } : {}),
  };
  assertMatchSummaryStructure(summary);
  return summary;
}
