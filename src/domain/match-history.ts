import { RULESET } from "./ruleset";
import { MATCH_SCHEMA_VERSION } from "./match-types";
import type {
  EndedMatchState,
  FinalTeamCounts,
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

export function canonicalMatchRecordsEqual(
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
): asserts value is readonly string[] {
  if (
    !Array.isArray(value) ||
    !value.every((entry) => typeof entry === "string")
  ) {
    throw new Error(`The canonical ${label} is structurally invalid.`);
  }
}

/** Shared structural boundary used by domain replay and canonical storage. */
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
    typeof value.rulesVersion !== "string" ||
    value.rulesVersion.length === 0 ||
    typeof value.matchId !== "string" ||
    value.matchId.length === 0 ||
    (value.phase !== "setup" &&
      value.phase !== "active" &&
      value.phase !== "ended") ||
    !Number.isSafeInteger(value.sequence) ||
    (value.sequence as number) < 1
  ) {
    throw new Error("The canonical Match State is structurally invalid.");
  }
}

function assertMatchStateRoster(value: MatchState): void {
  if (
    !Array.isArray(value.characters) ||
    value.characters.length !== RULESET.characters.length
  ) {
    throw new Error("The canonical Match State roster is invalid.");
  }
  value.characters.forEach((entry, index) => {
    const rulesCharacter = RULESET.characters[index];
    if (
      !rulesCharacter ||
      !isRecord(entry) ||
      entry.characterId !== rulesCharacter.id ||
      !Number.isInteger(entry.hp) ||
      (entry.hp as number) < 0
    ) {
      throw new Error("The canonical Match State roster is invalid.");
    }
    const currentMaxHp = entry.currentMaxHp as number | undefined;
    const effectiveMax = Number.isInteger(currentMaxHp)
      ? (currentMaxHp as number)
      : rulesCharacter.baseHp;
    if (
      (entry.hp as number) > effectiveMax ||
      (currentMaxHp !== undefined &&
        (!Number.isInteger(currentMaxHp) ||
          currentMaxHp < 1 ||
          currentMaxHp > 10))
    ) {
      throw new Error("The canonical Match State roster is invalid.");
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
    value.initiative.length !== RULESET.characters.length
  ) {
    throw new Error("The canonical initiative result is structurally invalid.");
  }
}

function assertMatchStateTurn(value: MatchState): void {
  const state = value as unknown as Record<string, unknown>;
  const round: unknown = state.round;
  const activeSlot: unknown = state.activeSlot;
  if (
    (value.phase === "active" || value.phase === "ended") &&
    (!Number.isSafeInteger(round) ||
      (round as number) < 1 ||
      !Number.isSafeInteger(activeSlot) ||
      (activeSlot as number) < 1 ||
      (activeSlot as number) > RULESET.characters.length)
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
  const endedAt: unknown = value.endedAt;
  const endedSequence: unknown = value.endedSequence;
  const sequence: unknown = value.sequence;
  const outcome: unknown = value.outcome;
  if (
    typeof endedAt !== "string" ||
    endedAt.length === 0 ||
    !Number.isSafeInteger(endedSequence) ||
    (endedSequence as number) < 2 ||
    !Number.isSafeInteger(sequence) ||
    (endedSequence as number) > (sequence as number) ||
    outcome === null
  ) {
    throw new Error("The Ended Match state is structurally invalid.");
  }
}

function assertEndedMatchDecision(value: EndedMatchState): void {
  // Widened views keep every literal comparison live so persisted values
  // outside the contract still fail validation exactly as before.
  const decisionBasis: string = value.decisionBasis;
  if (
    decisionBasis !== "elimination" &&
    decisionBasis !== "activeCount" &&
    decisionBasis !== "activeHpTotal" &&
    decisionBasis !== "coinFlip"
  ) {
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
  const coinFlipResult: string | null = value.coinFlipResult;
  if (
    coinFlipResult !== null &&
    coinFlipResult !== "Drow" &&
    coinFlipResult !== "Duergar"
  ) {
    throw new Error("The Ended Match coin flip result is invalid.");
  }
  if ((decisionBasis === "coinFlip") !== (coinFlipResult !== null)) {
    throw new Error("The Ended Match coin flip result is invalid.");
  }
}

function assertMatchStatePersistence(value: MatchState): void {
  // Single-schema persistence (ADR 0001): the parameter type is the one
  // current version, so these canonical checks apply unconditionally.
  const state = value as unknown as Record<string, unknown>;
  assertStringArray(state.spentAbilityIds, "spent Abilities");
  if (!Array.isArray(state.activeEffects)) {
    throw new Error("The canonical active effects are structurally invalid.");
  }
  const names = state.displayNames;
  if (
    !isRecord(names) ||
    !Object.keys(names).every(
      (characterId) =>
        typeof names[characterId] === "string" &&
        names[characterId].length > 0 &&
        names[characterId].trim() === names[characterId] &&
        RULESET.characters.some(({ id }) => id === characterId),
    )
  ) {
    throw new Error("The canonical Match display names are invalid.");
  }
  assertStringArray(state.spentReactionIds, "spent Reactions");
  assertStringArray(state.eliminatedTeams, "Team Elimination state");
  assertStringArray(
    state.acknowledgedEliminations,
    "acknowledged Team Elimination state",
  );
  if (
    typeof state.majorActionUsed !== "boolean" ||
    !state.eliminatedTeams.every(
      (team) => team === "Drow" || team === "Duergar",
    ) ||
    new Set(state.eliminatedTeams).size !== state.eliminatedTeams.length ||
    !state.acknowledgedEliminations.every(
      (team) => team === "Drow" || team === "Duergar",
    ) ||
    (state.outcome !== null &&
      state.outcome !== "Drow" &&
      state.outcome !== "Duergar" &&
      state.outcome !== "draw")
  ) {
    throw new Error("The canonical combat state is structurally invalid.");
  }
}

function assertFinalTeamTallies(
  value: unknown,
  message: string,
): asserts value is FinalTeamCounts {
  if (
    !isRecord(value) ||
    !Number.isInteger(value.Drow) ||
    !Number.isInteger(value.Duergar) ||
    (value.Drow as number) < 0 ||
    (value.Duergar as number) < 0
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
  const outcome: unknown = value.outcome;
  const decisionBasis: unknown = value.decisionBasis;
  const rulesVersion: unknown = value.rulesVersion;
  const endedAt: unknown = value.endedAt;
  if (
    !isValidOutcome(outcome) ||
    !isValidDecisionBasis(decisionBasis) ||
    typeof rulesVersion !== "string" ||
    rulesVersion.length === 0 ||
    typeof endedAt !== "string" ||
    endedAt.length === 0
  ) {
    throw new Error("The Match Summary is structurally invalid.");
  }
}

function isValidOutcome(value: unknown): boolean {
  return value === "Drow" || value === "Duergar" || value === "draw";
}

function isValidDecisionBasis(value: unknown): boolean {
  return (
    value === "elimination" ||
    value === "activeCount" ||
    value === "activeHpTotal" ||
    value === "coinFlip"
  );
}

function assertMatchSummaryCoinFlip(value: MatchSummary): void {
  const coinFlipResult: unknown = value.coinFlipResult;
  const decisionBasis: unknown = value.decisionBasis;
  if (
    coinFlipResult !== undefined &&
    coinFlipResult !== "Drow" &&
    coinFlipResult !== "Duergar"
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
    rulesVersion: state.rulesVersion,
    endedAt: state.endedAt,
    ...(state.coinFlipResult ? { coinFlipResult: state.coinFlipResult } : {}),
  };
  assertMatchSummaryStructure(summary);
  return summary;
}
