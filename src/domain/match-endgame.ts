import { MATCH_CONFIGURATION } from "./match-configuration";
import { cryptoRandomSource, nextBounded } from "./match-random";
import type {
  ActiveMatchState,
  CharacterId,
  CommandResult,
  EndedMatchState,
  EndGamePreview,
  FinalTeamCounts,
  MatchEndedEvent,
  MatchOutcome,
  MatchReopenedEvent,
  RandomSource,
  Team,
} from "./match-types";

export function teamOfCharacter(characterId: CharacterId): Team {
  const character = MATCH_CONFIGURATION.characters.find(
    ({ id }) => id === characterId,
  );
  if (!character) throw new Error("The Match references an unknown character.");
  return character.team;
}

function computeFinalTallies(state: ActiveMatchState): {
  readonly finalCounts: FinalTeamCounts;
  readonly finalHpTotals: FinalTeamCounts;
} {
  const tallies = state.characters.reduce<{
    readonly drowCount: number;
    readonly duergarCount: number;
    readonly drowHp: number;
    readonly duergarHp: number;
  }>(
    (totals, { characterId, hp }) => {
      if (hp === 0) return totals;
      const team = teamOfCharacter(characterId);
      if (team === "Drow") {
        return {
          ...totals,
          drowCount: totals.drowCount + 1,
          drowHp: totals.drowHp + hp,
        };
      }
      return {
        ...totals,
        duergarCount: totals.duergarCount + 1,
        duergarHp: totals.duergarHp + hp,
      };
    },
    { drowCount: 0, duergarCount: 0, drowHp: 0, duergarHp: 0 },
  );
  return {
    finalCounts: { Drow: tallies.drowCount, Duergar: tallies.duergarCount },
    finalHpTotals: { Drow: tallies.drowHp, Duergar: tallies.duergarHp },
  };
}

export function getEndGamePreview(
  state: ActiveMatchState,
  random: RandomSource = cryptoRandomSource,
): EndGamePreview {
  const { finalCounts, finalHpTotals } = computeFinalTallies(state);
  if (state.eliminatedTeams.length === 1) {
    const outcome: Exclude<MatchOutcome, null> =
      state.eliminatedTeams[0] === "Drow" ? "Duergar" : "Drow";
    if (state.outcome !== null && state.outcome !== outcome) {
      throw new Error(
        "End Game elimination outcome does not match Match State.",
      );
    }
    return {
      outcome,
      decisionBasis: "elimination",
      finalCounts,
      finalHpTotals,
    };
  }
  if (state.eliminatedTeams.length === 2) {
    if (state.outcome === null) {
      throw new Error("End Game needs a resolved Team Elimination result.");
    }
    const basisOutcome = state.outcome;
    return {
      outcome: basisOutcome,
      decisionBasis: "elimination",
      finalCounts,
      finalHpTotals,
    };
  }
  if (state.eliminatedTeams.length !== 0) {
    throw new Error("End Game Team Elimination state is invalid.");
  }
  if (finalCounts.Drow !== finalCounts.Duergar) {
    return {
      outcome: finalCounts.Drow > finalCounts.Duergar ? "Drow" : "Duergar",
      decisionBasis: "activeCount",
      finalCounts,
      finalHpTotals,
    };
  }
  if (finalHpTotals.Drow !== finalHpTotals.Duergar) {
    return {
      outcome: finalHpTotals.Drow > finalHpTotals.Duergar ? "Drow" : "Duergar",
      decisionBasis: "activeHpTotal",
      finalCounts,
      finalHpTotals,
    };
  }
  const coinFlipResult = nextBounded(random, 2) === 0 ? "Drow" : "Duergar";
  return {
    outcome: coinFlipResult,
    decisionBasis: "coinFlip",
    finalCounts,
    finalHpTotals,
    coinFlipResult,
  };
}

export function endMatch(
  state: ActiveMatchState,
  command: {
    readonly occurredAt: string;
    readonly confirmed: boolean;
    readonly random?: RandomSource;
  },
): CommandResult<EndedMatchState, MatchEndedEvent> {
  const { occurredAt, confirmed } = command;
  const random = command.random ?? cryptoRandomSource;
  if (!confirmed) throw new Error("End Game confirmation is required.");
  const preview = getEndGamePreview(state, random);
  const sequence = state.sequence + 1;
  return {
    state: {
      ...state,
      phase: "ended",
      sequence,
      outcome: preview.outcome,
      endedAt: occurredAt,
      endedSequence: sequence,
      decisionBasis: preview.decisionBasis,
      finalCounts: preview.finalCounts,
      finalHpTotals: preview.finalHpTotals,
      coinFlipResult: preview.coinFlipResult ?? null,
    },
    event: {
      type: "MatchEnded",
      matchId: state.matchId,
      sequence,
      configurationVersion: state.configurationVersion,
      occurredAt,
      outcome: preview.outcome,
      eliminatedTeams: [...state.eliminatedTeams],
      decisionBasis: preview.decisionBasis,
      finalCounts: preview.finalCounts,
      finalHpTotals: preview.finalHpTotals,
      coinFlipResult: preview.coinFlipResult ?? null,
    },
  };
}

export function reopenMatch(
  state: EndedMatchState,
  occurredAt: string,
): CommandResult<ActiveMatchState, MatchReopenedEvent> {
  const sequence = state.sequence + 1;
  const active: ActiveMatchState = {
    schemaVersion: state.schemaVersion,
    configurationVersion: state.configurationVersion,
    matchId: state.matchId,
    phase: "active",
    sequence,
    characters: state.characters,
    initiative: state.initiative,
    round: state.round,
    activeSlot: state.activeSlot,
    spentReactionIds: state.spentReactionIds,
    spentAbilityIds: state.spentAbilityIds,
    movementPaces: state.movementPaces,
    remainingMovementPaces: state.remainingMovementPaces,
    ...(state.actionsUsed === undefined
      ? {}
      : { actionsUsed: state.actionsUsed }),
    majorActionUsed: state.majorActionUsed,
    eliminatedTeams: state.eliminatedTeams,
    acknowledgedEliminations: state.acknowledgedEliminations,
    outcome: null,
    activeEffects: state.activeEffects,
    // Display Names live inside the Match record, so a reopened Match keeps
    // the referee's Setup names (rules glossary).
    displayNames: state.displayNames,
  };
  return {
    state: active,
    event: {
      type: "MatchReopened",
      matchId: state.matchId,
      sequence,
      configurationVersion: state.configurationVersion,
      occurredAt,
      endedSequence: state.endedSequence,
    },
  };
}
