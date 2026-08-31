import {
  assertMatchStateStructure,
  isDecisionBasis,
  isReactionId,
  isTeam,
} from "../domain/match";
import type {
  CharacterId,
  EndedMatchState,
  InitiativeEntry,
  MatchCharacter,
  MatchState,
} from "../domain/match-types";
import { MATCH_CONFIGURATION } from "../domain/match-configuration";
import { matchStateSchema, tieOrderSchema } from "./match-store-schemas";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseValidatedState(
  value: unknown,
  expectedConfigurationVersion?: string,
): MatchState {
  const parsed = matchStateSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("The validated snapshot is structurally invalid.");
  }
  const state = parsed.data;
  assertValidatedConfigurationVersion(state, expectedConfigurationVersion);
  assertMatchStateStructure(state);
  assertValidatedSnapshotHeader(state);
  assertValidatedRoster(state);
  assertValidatedInitiative(state);
  assertValidatedTurn(state);
  assertValidatedEndedState(state);
  return state;
}

export function assertValidatedState(
  value: unknown,
  expectedConfigurationVersion?: string,
): asserts value is MatchState {
  const parsed = matchStateSchema.safeParse(value);
  if (!parsed.success) {
    if (isRecord(value)) {
      if (
        Array.isArray(value.spentReactionIds) &&
        value.spentReactionIds.some(
          (reactionId) =>
            typeof reactionId !== "string" || !isReactionId(reactionId),
        )
      ) {
        throw new Error(
          "The validated spent Reactions is structurally invalid.",
        );
      }
      if (Array.isArray(value.activeEffects)) {
        throw new Error(
          "The validated active effects are structurally invalid.",
        );
      }
    }
    throw new Error("The validated snapshot is structurally invalid.");
  }
  parseValidatedState(value, expectedConfigurationVersion);
}

function assertValidatedConfigurationVersion(
  value: MatchState,
  expectedConfigurationVersion: string | undefined,
): void {
  const { configurationVersion } = value;
  if (
    typeof configurationVersion !== "string" ||
    configurationVersion.length === 0 ||
    (expectedConfigurationVersion === undefined
      ? configurationVersion !== MATCH_CONFIGURATION.version
      : configurationVersion !== expectedConfigurationVersion)
  ) {
    throw new Error(
      "The validated snapshot configuration version is incompatible.",
    );
  }
}

function assertValidatedSnapshotHeader(value: MatchState): void {
  const { sequence } = value;
  if (value.matchId.length === 0 || sequence < 1) {
    throw new Error("The validated snapshot is structurally invalid.");
  }
}

function assertValidatedRoster(value: MatchState): void {
  const { characters } = value;
  if (characters.length !== MATCH_CONFIGURATION.characters.length) {
    throw new Error("The validated snapshot roster is invalid.");
  }
  for (const [
    index,
    rulesCharacter,
  ] of MATCH_CONFIGURATION.characters.entries()) {
    const matchCharacter = characters[index];
    if (matchCharacter === undefined) {
      throw new Error("The validated snapshot roster is invalid.");
    }
    assertValidatedRosterEntry(
      matchCharacter,
      rulesCharacter.id,
      rulesCharacter.baseHp,
    );
  }
}

function assertValidatedRosterEntry(
  matchCharacter: MatchCharacter,
  characterId: CharacterId,
  baseHp: number,
): void {
  if (
    matchCharacter.characterId !== characterId ||
    matchCharacter.hp < 0 ||
    matchCharacter.hp > baseHp
  ) {
    throw new Error("The validated snapshot roster is invalid.");
  }
}

function assertValidatedInitiative(value: MatchState): void {
  if (value.initiative === null) {
    if (value.phase === "active") {
      throw new Error("The Active Match initiative result is incomplete.");
    }
    return;
  }
  if (
    !Array.isArray(value.initiative) ||
    value.initiative.length !== MATCH_CONFIGURATION.characters.length
  ) {
    throw new Error("The validated initiative result is structurally invalid.");
  }
  value.initiative.reduce<InitiativeValidationState>(
    assertValidatedInitiativeEntry,
    { seen: new Set<CharacterId>(), previousTotal: Number.POSITIVE_INFINITY },
  );
}

type InitiativeValidationState = {
  readonly seen: ReadonlySet<CharacterId>;
  readonly previousTotal: number;
};

function assertValidatedInitiativeEntry(
  state: InitiativeValidationState,
  entry: InitiativeEntry,
  index: number,
): InitiativeValidationState {
  const { characterId } = entry;
  const rulesCharacter = MATCH_CONFIGURATION.characters.find(
    ({ id }) => id === characterId,
  );
  if (
    !rulesCharacter ||
    state.seen.has(rulesCharacter.id) ||
    entry.slot !== index + 1 ||
    entry.roll < 1 ||
    entry.roll > 20 ||
    entry.modifier !== rulesCharacter.initiativeModifier ||
    entry.total !== entry.roll + rulesCharacter.initiativeModifier ||
    entry.total > state.previousTotal
  ) {
    throw new Error("The validated initiative result is structurally invalid.");
  }
  return {
    seen: new Set([...state.seen, rulesCharacter.id]),
    previousTotal: entry.total,
  };
}

function assertValidatedTurn(value: MatchState): void {
  if (
    (value.phase === "active" || value.phase === "ended") &&
    (!Number.isInteger(value.round) ||
      value.round < 1 ||
      !Number.isInteger(value.activeSlot) ||
      value.activeSlot < 1 ||
      value.activeSlot > MATCH_CONFIGURATION.characters.length)
  ) {
    throw new Error("The Active Match turn is structurally invalid.");
  }
}

function assertValidatedEndedState(value: MatchState): void {
  if (value.phase !== "ended") return;
  assertValidatedEndedMetadata(value);
  assertValidatedEndedDecision(value);
}

function assertValidatedEndedMetadata(value: EndedMatchState): void {
  const { endedAt, endedSequence, sequence } = value;
  if (
    typeof endedAt !== "string" ||
    endedAt.length === 0 ||
    !Number.isInteger(endedSequence) ||
    endedSequence < 2 ||
    !Number.isInteger(sequence) ||
    endedSequence > sequence
  ) {
    throw new Error("The Ended Match is structurally invalid.");
  }
}

function assertValidatedEndedDecision(value: EndedMatchState): void {
  assertValidatedDecisionBasis(value.decisionBasis);
  assertValidatedFinalTallies(value);
  assertValidatedCoinFlipResult(value);
}

function assertValidatedDecisionBasis(decisionBasis: unknown): void {
  if (typeof decisionBasis !== "string" || !isDecisionBasis(decisionBasis)) {
    throw new Error("The Ended Match is structurally invalid.");
  }
}

function assertValidatedFinalTallies(ended: EndedMatchState): void {
  if (
    !isRecord(ended.finalCounts) ||
    !Number.isInteger(ended.finalCounts.Drow) ||
    !Number.isInteger(ended.finalCounts.Duergar) ||
    ended.finalCounts.Drow < 0 ||
    ended.finalCounts.Duergar < 0 ||
    !isRecord(ended.finalHpTotals) ||
    !Number.isInteger(ended.finalHpTotals.Drow) ||
    !Number.isInteger(ended.finalHpTotals.Duergar) ||
    ended.finalHpTotals.Drow < 0 ||
    ended.finalHpTotals.Duergar < 0
  ) {
    throw new Error("The Ended Match is structurally invalid.");
  }
}

function assertValidatedCoinFlipResult(ended: EndedMatchState): void {
  const { coinFlipResult } = ended;
  const coinFlipIsValid =
    coinFlipResult === null ||
    (typeof coinFlipResult === "string" && isTeam(coinFlipResult));
  if (!coinFlipIsValid) {
    throw new Error("The Ended Match is structurally invalid.");
  }
  if (
    (ended.decisionBasis === "coinFlip") !==
    (ended.coinFlipResult !== null)
  ) {
    throw new Error("The Ended Match is structurally invalid.");
  }
}

export function sameInitiative(
  left: readonly InitiativeEntry[],
  right: readonly InitiativeEntry[],
): boolean {
  return left.every((entry, index) => {
    const other = right[index];
    return (
      other !== undefined &&
      entry.characterId === other.characterId &&
      entry.roll === other.roll &&
      entry.modifier === other.modifier &&
      entry.total === other.total &&
      entry.slot === other.slot
    );
  });
}

export function assertCoinFlipTieOrder(
  value: unknown,
  total: number,
  ids: {
    readonly initialCharacterIds: readonly CharacterId[];
    readonly finalCharacterIds: readonly CharacterId[];
  },
): void {
  const { initialCharacterIds, finalCharacterIds } = ids;
  const parsed = tieOrderSchema.safeParse(value);
  if (
    !parsed.success ||
    parsed.data.total !== total ||
    parsed.data.initialCharacterIds.length !== initialCharacterIds.length ||
    !parsed.data.initialCharacterIds.every(
      (characterId, index) => characterId === initialCharacterIds[index],
    ) ||
    parsed.data.characterIds.length !== finalCharacterIds.length
  ) {
    throw new Error("The validated digital coin-flip order is invalid.");
  }
  const tieOrder = parsed.data;
  const replayed = [...initialCharacterIds];
  if (tieOrder.steps.length !== replayed.length - 1) {
    throw new Error("The validated digital coin-flip order is invalid.");
  }
  tieOrder.steps.forEach((step, stepIndex) => {
    const position = replayed.length - 1 - stepIndex;
    const upperExclusive = position + 1;
    const bitCount = Math.ceil(Math.log2(upperExclusive));
    if (
      !isRecord(step) ||
      step.position !== position ||
      step.upperExclusive !== upperExclusive ||
      !Array.isArray(step.attempts) ||
      step.attempts.length === 0
    ) {
      throw new Error("The validated digital coin-flip order is invalid.");
    }
    const { attempts } = step;
    attempts.forEach((attempt, attemptIndex) => {
      if (attempt.flips.length !== bitCount) {
        throw new Error("The validated digital coin-flip order is invalid.");
      }
      const { flips } = attempt;
      const candidate = flips.reduce<number>(
        (result, flip) => result * 2 + (flip === "heads" ? 1 : 0),
        0,
      );
      const accepted = candidate < upperExclusive;
      const isLast = attemptIndex === attempts.length - 1;
      if (
        attempt.candidate !== candidate ||
        attempt.accepted !== accepted ||
        accepted !== isLast ||
        (isLast && step.selectedIndex !== candidate)
      ) {
        throw new Error("The validated digital coin-flip order is invalid.");
      }
    });
    const { selectedIndex } = step;
    if (!Number.isInteger(selectedIndex)) {
      throw new Error("The validated digital coin-flip order is invalid.");
    }
    const promoted = replayed[selectedIndex];
    const displaced = replayed[position];
    if (promoted === undefined || displaced === undefined) {
      throw new Error("The validated digital coin-flip order is invalid.");
    }
    [replayed[position], replayed[selectedIndex]] = [promoted, displaced];
  });
  if (
    !tieOrder.characterIds.every(
      (characterId, index) =>
        characterId === replayed[index] &&
        characterId === finalCharacterIds[index],
    )
  ) {
    throw new Error("The validated digital coin-flip order is invalid.");
  }
}
