import {
  assertMatchStateStructure,
  isCharacterId,
  isDecisionBasis,
  isPhase,
  isTeam,
  type CharacterId,
  type InitiativeEntry,
  type MatchState,
} from "../domain/match";
import { RULESET } from "../domain/ruleset";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function assertCanonicalState(
  value: unknown,
  expectedRulesVersion?: string,
): asserts value is MatchState {
  assertMatchStateStructure(value);
  if (!isRecord(value))
    throw new Error("The canonical snapshot is structurally invalid.");
  assertCanonicalRulesVersion(value, expectedRulesVersion);
  assertCanonicalSnapshotHeader(value);
  assertCanonicalRoster(value);
  assertCanonicalInitiative(value);
  assertCanonicalTurn(value);
  assertCanonicalEndedState(value);
}

function assertCanonicalRulesVersion(
  value: Record<string, unknown>,
  expectedRulesVersion: string | undefined,
): void {
  if (
    typeof value.rulesVersion !== "string" ||
    value.rulesVersion.length === 0 ||
    (expectedRulesVersion !== undefined &&
      value.rulesVersion !== expectedRulesVersion)
  ) {
    throw new Error("The canonical snapshot rules version is incompatible.");
  }
}

function assertCanonicalSnapshotHeader(value: Record<string, unknown>): void {
  const snapshotPhase: unknown = value.phase;
  const sequence: unknown = value.sequence;
  const phaseIsValid =
    typeof snapshotPhase === "string" && isPhase(snapshotPhase);
  if (
    typeof value.matchId !== "string" ||
    value.matchId.length === 0 ||
    !phaseIsValid ||
    !Number.isSafeInteger(sequence) ||
    (sequence as number) < 1
  ) {
    throw new Error("The canonical snapshot is structurally invalid.");
  }
}

function assertCanonicalRoster(value: MatchState): void {
  if (
    !Array.isArray(value.characters) ||
    value.characters.length !== RULESET.characters.length
  ) {
    throw new Error("The canonical snapshot roster is invalid.");
  }
  for (const [index, rulesCharacter] of RULESET.characters.entries()) {
    assertCanonicalRosterEntry(
      value.characters[index],
      rulesCharacter.id,
      rulesCharacter.baseHp,
    );
  }
}

function assertCanonicalRosterEntry(
  matchCharacter: unknown,
  characterId: CharacterId,
  baseHp: number,
): void {
  if (
    !isRecord(matchCharacter) ||
    matchCharacter.characterId !== characterId ||
    !Number.isInteger(matchCharacter.hp) ||
    (matchCharacter.hp as number) < 0 ||
    (matchCharacter.hp as number) > baseHp
  ) {
    throw new Error("The canonical snapshot roster is invalid.");
  }
}

function assertCanonicalInitiative(value: MatchState): void {
  if (value.initiative === null) {
    if (value.phase === "active") {
      throw new Error("The Active Match initiative result is incomplete.");
    }
    return;
  }
  if (
    !Array.isArray(value.initiative) ||
    value.initiative.length !== RULESET.characters.length
  ) {
    throw new Error("The canonical initiative result is structurally invalid.");
  }
  value.initiative.reduce<InitiativeValidationState>(
    assertCanonicalInitiativeEntry,
    { seen: new Set<CharacterId>(), previousTotal: Number.POSITIVE_INFINITY },
  );
}

type InitiativeValidationState = {
  readonly seen: ReadonlySet<CharacterId>;
  readonly previousTotal: number;
};

function assertCanonicalInitiativeEntry(
  state: InitiativeValidationState,
  entry: InitiativeEntry,
  index: number,
): InitiativeValidationState {
  if (!isRecord(entry))
    throw new Error("The canonical initiative result is structurally invalid.");
  const characterIdValue: unknown = entry.characterId;
  const characterIdIsValid =
    typeof characterIdValue === "string" && isCharacterId(characterIdValue);
  if (!characterIdIsValid) {
    throw new Error("The canonical initiative result is structurally invalid.");
  }
  const characterId = characterIdValue;
  const rulesCharacter = RULESET.characters.find(
    ({ id }) => id === characterId,
  );
  if (
    !rulesCharacter ||
    state.seen.has(rulesCharacter.id) ||
    entry.slot !== index + 1 ||
    !Number.isInteger(entry.roll) ||
    entry.roll < 1 ||
    entry.roll > 20 ||
    entry.modifier !== rulesCharacter.initiativeModifier ||
    entry.total !== entry.roll + rulesCharacter.initiativeModifier ||
    entry.total > state.previousTotal
  ) {
    throw new Error("The canonical initiative result is structurally invalid.");
  }
  return {
    seen: new Set([...state.seen, rulesCharacter.id]),
    previousTotal: entry.total,
  };
}

function assertCanonicalTurn(value: MatchState): void {
  if (
    (value.phase === "active" || value.phase === "ended") &&
    (!Number.isSafeInteger(value.round) ||
      value.round < 1 ||
      !Number.isSafeInteger(value.activeSlot) ||
      value.activeSlot < 1 ||
      value.activeSlot > RULESET.characters.length)
  ) {
    throw new Error("The Active Match turn is structurally invalid.");
  }
}

function assertCanonicalEndedState(value: MatchState): void {
  if (value.phase !== "ended") return;
  assertCanonicalEndedMetadata(value);
  assertCanonicalEndedDecision(value);
}

function assertCanonicalEndedMetadata(value: MatchState): void {
  const ended = value as unknown as Record<string, unknown>;
  const endedAt: unknown = ended.endedAt;
  const endedSequence: unknown = ended.endedSequence;
  const sequence: unknown = ended.sequence;
  if (
    typeof endedAt !== "string" ||
    endedAt.length === 0 ||
    !Number.isSafeInteger(endedSequence) ||
    (endedSequence as number) < 2 ||
    !Number.isSafeInteger(sequence) ||
    (endedSequence as number) > (sequence as number)
  ) {
    throw new Error("The Ended Match is structurally invalid.");
  }
}

function assertCanonicalEndedDecision(value: MatchState): void {
  const ended = value as unknown as Record<string, unknown>;
  assertCanonicalDecisionBasis(ended.decisionBasis);
  assertCanonicalFinalTallies(ended);
  assertCanonicalCoinFlipResult(ended);
}

function assertCanonicalDecisionBasis(decisionBasis: unknown): void {
  if (typeof decisionBasis !== "string" || !isDecisionBasis(decisionBasis)) {
    throw new Error("The Ended Match is structurally invalid.");
  }
}

function assertCanonicalFinalTallies(ended: Record<string, unknown>): void {
  if (
    !isRecord(ended.finalCounts) ||
    !Number.isInteger(ended.finalCounts.Drow) ||
    !Number.isInteger(ended.finalCounts.Duergar) ||
    (ended.finalCounts.Drow as number) < 0 ||
    (ended.finalCounts.Duergar as number) < 0 ||
    !isRecord(ended.finalHpTotals) ||
    !Number.isInteger(ended.finalHpTotals.Drow) ||
    !Number.isInteger(ended.finalHpTotals.Duergar) ||
    (ended.finalHpTotals.Drow as number) < 0 ||
    (ended.finalHpTotals.Duergar as number) < 0
  ) {
    throw new Error("The Ended Match is structurally invalid.");
  }
}

function assertCanonicalCoinFlipResult(ended: Record<string, unknown>): void {
  const coinFlipResult: unknown = ended.coinFlipResult;
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
  if (
    !isRecord(value) ||
    value.total !== total ||
    !Array.isArray(value.initialCharacterIds) ||
    !Array.isArray(value.steps) ||
    !Array.isArray(value.characterIds) ||
    value.initialCharacterIds.length !== initialCharacterIds.length ||
    !value.initialCharacterIds.every(
      (characterId, index) => characterId === initialCharacterIds[index],
    ) ||
    value.characterIds.length !== finalCharacterIds.length
  ) {
    throw new Error("The canonical digital coin-flip order is invalid.");
  }
  const replayed = [...initialCharacterIds];
  if (value.steps.length !== replayed.length - 1) {
    throw new Error("The canonical digital coin-flip order is invalid.");
  }
  value.steps.forEach((step, stepIndex) => {
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
      throw new Error("The canonical digital coin-flip order is invalid.");
    }
    const attempts = step.attempts;
    attempts.forEach((attempt, attemptIndex) => {
      if (
        !isRecord(attempt) ||
        !Array.isArray(attempt.flips) ||
        attempt.flips.length !== bitCount ||
        !attempt.flips.every((flip) => flip === "heads" || flip === "tails")
      ) {
        throw new Error("The canonical digital coin-flip order is invalid.");
      }
      const flips: readonly unknown[] = attempt.flips;
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
        throw new Error("The canonical digital coin-flip order is invalid.");
      }
    });
    const selectedIndex = step.selectedIndex as number;
    [replayed[position], replayed[selectedIndex]] = [
      replayed[selectedIndex] as CharacterId,
      replayed[position] as CharacterId,
    ];
  });
  if (
    !value.characterIds.every(
      (characterId, index) =>
        characterId === replayed[index] &&
        characterId === finalCharacterIds[index],
    )
  ) {
    throw new Error("The canonical digital coin-flip order is invalid.");
  }
}
