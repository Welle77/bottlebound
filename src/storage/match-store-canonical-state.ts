import {
  assertMatchStateStructure,
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
  if (
    typeof value.rulesVersion !== "string" ||
    value.rulesVersion.length === 0 ||
    (expectedRulesVersion !== undefined &&
      value.rulesVersion !== expectedRulesVersion)
  ) {
    throw new Error("The canonical snapshot rules version is incompatible.");
  }
  // Widened phase view keeps every literal comparison live for persisted
  // snapshots without collapsing the modeled phase union downstream.
  const snapshotPhase: string = value.phase;
  if (
    typeof value.matchId !== "string" ||
    value.matchId.length === 0 ||
    (snapshotPhase !== "setup" &&
      snapshotPhase !== "active" &&
      snapshotPhase !== "ended") ||
    !Number.isSafeInteger(value.sequence) ||
    value.sequence < 1
  ) {
    throw new Error("The canonical snapshot is structurally invalid.");
  }
  if (
    !Array.isArray(value.characters) ||
    value.characters.length !== RULESET.characters.length
  ) {
    throw new Error("The canonical snapshot roster is invalid.");
  }
  for (const [index, rulesCharacter] of RULESET.characters.entries()) {
    const matchCharacter: unknown = value.characters[index];
    if (
      !isRecord(matchCharacter) ||
      matchCharacter.characterId !== rulesCharacter.id ||
      !Number.isInteger(matchCharacter.hp) ||
      (matchCharacter.hp as number) < 0 ||
      (matchCharacter.hp as number) > rulesCharacter.baseHp
    ) {
      throw new Error("The canonical snapshot roster is invalid.");
    }
  }
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
  value.initiative.reduce<{
    readonly seen: ReadonlySet<string>;
    readonly previousTotal: number;
  }>(
    (state, entry, index) => {
      if (!isRecord(entry))
        throw new Error(
          "The canonical initiative result is structurally invalid.",
        );
      const rulesCharacter = RULESET.characters.find(
        ({ id }) => id === entry.characterId,
      );
      if (
        !rulesCharacter ||
        state.seen.has(rulesCharacter.id) ||
        entry.slot !== index + 1 ||
        !Number.isInteger(entry.roll) ||
        (entry.roll as number) < 1 ||
        (entry.roll as number) > 20 ||
        entry.modifier !== rulesCharacter.initiativeModifier ||
        entry.total !==
          (entry.roll as number) + rulesCharacter.initiativeModifier ||
        entry.total > state.previousTotal
      ) {
        throw new Error(
          "The canonical initiative result is structurally invalid.",
        );
      }
      return {
        seen: new Set([...state.seen, rulesCharacter.id]),
        previousTotal: entry.total,
      };
    },
    { seen: new Set<string>(), previousTotal: Number.POSITIVE_INFINITY },
  );
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
  if (
    value.phase === "ended" &&
    (typeof value.endedAt !== "string" ||
      value.endedAt.length === 0 ||
      !Number.isSafeInteger(value.endedSequence) ||
      value.endedSequence < 2 ||
      value.endedSequence > value.sequence)
  ) {
    throw new Error("The Ended Match is structurally invalid.");
  }
  if (value.phase === "ended") {
    const ended = value as Record<string, unknown>;
    if (
      ended.decisionBasis !== "elimination" &&
      ended.decisionBasis !== "activeCount" &&
      ended.decisionBasis !== "activeHpTotal" &&
      ended.decisionBasis !== "coinFlip"
    ) {
      throw new Error("The Ended Match is structurally invalid.");
    }
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
    if (
      ended.coinFlipResult !== null &&
      ended.coinFlipResult !== "Drow" &&
      ended.coinFlipResult !== "Duergar"
    ) {
      throw new Error("The Ended Match is structurally invalid.");
    }
    if (
      (ended.decisionBasis === "coinFlip") !==
      (ended.coinFlipResult !== null)
    ) {
      throw new Error("The Ended Match is structurally invalid.");
    }
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
    readonly initialCharacterIds: readonly string[];
    readonly finalCharacterIds: readonly string[];
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
      replayed[selectedIndex] as string,
      replayed[position] as string,
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
