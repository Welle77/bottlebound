import { RULESET } from "./ruleset";
import {
  initialCombatState,
  LEGACY_MATCH_SCHEMA_VERSION,
  MATCH_SCHEMA_VERSION,
} from "./match-types";
import type {
  CommandResult,
  EndedMatchState,
  FinalTeamCounts,
  LegacyMatchState,
  MatchMigratedEvent,
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
  schemaVersion?: typeof MATCH_SCHEMA_VERSION,
): asserts value is MatchState;
export function assertMatchStateStructure(
  value: unknown,
  schemaVersion: typeof LEGACY_MATCH_SCHEMA_VERSION,
): asserts value is LegacyMatchState;
export function assertMatchStateStructure(
  value: unknown,
  schemaVersion: number = MATCH_SCHEMA_VERSION,
): void {
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
  if (
    (value.phase === "active" || value.phase === "ended") &&
    (!Number.isSafeInteger(value.round) ||
      (value.round as number) < 1 ||
      !Number.isSafeInteger(value.activeSlot) ||
      (value.activeSlot as number) < 1 ||
      (value.activeSlot as number) > RULESET.characters.length)
  ) {
    throw new Error("The Active Match turn is structurally invalid.");
  }
  if (
    value.phase === "ended" &&
    (typeof value.endedAt !== "string" ||
      value.endedAt.length === 0 ||
      !Number.isSafeInteger(value.endedSequence) ||
      (value.endedSequence as number) < 2 ||
      (value.endedSequence as number) > (value.sequence as number) ||
      value.outcome === null)
  ) {
    throw new Error("The Ended Match state is structurally invalid.");
  }
  if (value.phase === "ended" && schemaVersion === MATCH_SCHEMA_VERSION) {
    const ended = value as unknown as EndedMatchState;
    if (
      ended.decisionBasis !== undefined &&
      ended.decisionBasis !== "elimination" &&
      ended.decisionBasis !== "activeCount" &&
      ended.decisionBasis !== "activeHpTotal" &&
      ended.decisionBasis !== "coinFlip"
    ) {
      throw new Error("The Ended Match decision basis is invalid.");
    }
    if (
      (ended.decisionBasis !== undefined ||
        ended.finalCounts !== undefined ||
        ended.finalHpTotals !== undefined) &&
      (!isRecord(ended.finalCounts) ||
        !Number.isInteger((ended.finalCounts as FinalTeamCounts).Drow) ||
        !Number.isInteger((ended.finalCounts as FinalTeamCounts).Duergar) ||
        (ended.finalCounts as FinalTeamCounts).Drow < 0 ||
        (ended.finalCounts as FinalTeamCounts).Duergar < 0 ||
        !isRecord(ended.finalHpTotals) ||
        !Number.isInteger((ended.finalHpTotals as FinalTeamCounts).Drow) ||
        !Number.isInteger((ended.finalHpTotals as FinalTeamCounts).Duergar) ||
        (ended.finalHpTotals as FinalTeamCounts).Drow < 0 ||
        (ended.finalHpTotals as FinalTeamCounts).Duergar < 0)
    ) {
      throw new Error("The Ended Match final team tallies are invalid.");
    }
    if (
      ended.coinFlipResult !== undefined &&
      ended.coinFlipResult !== "Drow" &&
      ended.coinFlipResult !== "Duergar"
    ) {
      throw new Error("The Ended Match coin flip result is invalid.");
    }
    if (
      ended.decisionBasis === "coinFlip" &&
      ended.coinFlipResult === undefined
    ) {
      throw new Error("The Ended Match coin flip result is invalid.");
    }
    if (
      ended.coinFlipResult !== undefined &&
      ended.decisionBasis !== "coinFlip"
    ) {
      throw new Error("The Ended Match coin flip result is invalid.");
    }
  }
  if (schemaVersion === MATCH_SCHEMA_VERSION) {
    // Backwards compat: older snapshots may lack ability fields
    if (value.spentAbilityIds !== undefined) {
      assertStringArray(value.spentAbilityIds, "spent Abilities");
    }
    if (
      value.activeEffects !== undefined &&
      !Array.isArray(value.activeEffects)
    ) {
      throw new Error("The canonical active effects are structurally invalid.");
    }
    assertStringArray(value.spentReactionIds, "spent Reactions");
    assertStringArray(value.eliminatedTeams, "Team Elimination state");
    assertStringArray(
      value.acknowledgedEliminations,
      "acknowledged Team Elimination state",
    );
    if (
      typeof value.majorActionUsed !== "boolean" ||
      !value.eliminatedTeams.every(
        (team) => team === "Drow" || team === "Duergar",
      ) ||
      new Set(value.eliminatedTeams).size !== value.eliminatedTeams.length ||
      !value.acknowledgedEliminations.every(
        (team) => team === "Drow" || team === "Duergar",
      ) ||
      (value.outcome !== null &&
        value.outcome !== "Drow" &&
        value.outcome !== "Duergar" &&
        value.outcome !== "draw")
    ) {
      throw new Error("The canonical combat state is structurally invalid.");
    }
  }
}

export function assertMatchSummaryStructure(
  value: unknown,
): asserts value is MatchSummary {
  if (
    !isRecord(value) ||
    (value.outcome !== "Drow" &&
      value.outcome !== "Duergar" &&
      value.outcome !== "draw") ||
    (value.decisionBasis !== "elimination" &&
      value.decisionBasis !== "activeCount" &&
      value.decisionBasis !== "activeHpTotal" &&
      value.decisionBasis !== "coinFlip") ||
    !isRecord(value.finalCounts) ||
    !Number.isInteger((value.finalCounts as unknown as FinalTeamCounts).Drow) ||
    !Number.isInteger(
      (value.finalCounts as unknown as FinalTeamCounts).Duergar,
    ) ||
    (value.finalCounts as unknown as FinalTeamCounts).Drow < 0 ||
    (value.finalCounts as unknown as FinalTeamCounts).Duergar < 0 ||
    !isRecord(value.finalHpTotals) ||
    !Number.isInteger(
      (value.finalHpTotals as unknown as FinalTeamCounts).Drow,
    ) ||
    !Number.isInteger(
      (value.finalHpTotals as unknown as FinalTeamCounts).Duergar,
    ) ||
    (value.finalHpTotals as unknown as FinalTeamCounts).Drow < 0 ||
    (value.finalHpTotals as unknown as FinalTeamCounts).Duergar < 0 ||
    typeof value.rulesVersion !== "string" ||
    value.rulesVersion.length === 0 ||
    typeof value.endedAt !== "string" ||
    value.endedAt.length === 0
  ) {
    throw new Error("The Match Summary is structurally invalid.");
  }
  if (
    value.coinFlipResult !== undefined &&
    value.coinFlipResult !== "Drow" &&
    value.coinFlipResult !== "Duergar"
  ) {
    throw new Error("The Match Summary coin flip result is invalid.");
  }
  if (
    value.decisionBasis === "coinFlip" &&
    value.coinFlipResult === undefined
  ) {
    throw new Error("The Match Summary coin flip result is invalid.");
  }
  if (
    value.coinFlipResult !== undefined &&
    value.decisionBasis !== "coinFlip"
  ) {
    throw new Error("The Match Summary coin flip result is invalid.");
  }
}

export function toMatchSummary(state: EndedMatchState): MatchSummary {
  if (
    state.decisionBasis === undefined ||
    state.finalCounts === undefined ||
    state.finalHpTotals === undefined
  ) {
    throw new Error("The Ended Match does not contain summary fields.");
  }
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

export function migrateLegacyMatch(
  value: unknown,
  occurredAt: string,
): CommandResult<MatchState, MatchMigratedEvent> {
  assertMatchStateStructure(value, LEGACY_MATCH_SCHEMA_VERSION);
  const legacy = value;
  const sequence = legacy.sequence + 1;
  const state = {
    ...legacy,
    schemaVersion: MATCH_SCHEMA_VERSION,
    sequence,
    ...initialCombatState,
  } as MatchState;
  return {
    state,
    event: {
      type: "MatchMigrated",
      matchId: legacy.matchId,
      sequence,
      rulesVersion: legacy.rulesVersion,
      occurredAt,
      fromSchemaVersion: LEGACY_MATCH_SCHEMA_VERSION,
      toSchemaVersion: MATCH_SCHEMA_VERSION,
    },
  };
}
