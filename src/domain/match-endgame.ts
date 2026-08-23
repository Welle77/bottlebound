import { RULESET } from "./ruleset";
import { cryptoRandomSource, nextBounded } from "./match-random";
import type {
  ActiveMatchState,
  CommandResult,
  EndedMatchState,
  EndGamePreview,
  FinalTeamCounts,
  MatchEndedEvent,
  MatchOutcome,
  MatchReopenedEvent,
  RandomSource,
} from "./match-types";

export function teamOfCharacter(characterId: string): "Drow" | "Duergar" {
  const character = RULESET.characters.find(({ id }) => id === characterId);
  if (!character) throw new Error("The Match references an unknown character.");
  return character.team;
}

function computeFinalTallies(state: ActiveMatchState): {
  finalCounts: FinalTeamCounts;
  finalHpTotals: FinalTeamCounts;
} {
  let drowCount = 0;
  let duergarCount = 0;
  let drowHp = 0;
  let duergarHp = 0;
  for (const { characterId, hp } of state.characters) {
    if (hp === 0) continue;
    const team = teamOfCharacter(characterId);
    if (team === "Drow") {
      drowCount += 1;
      drowHp += hp;
    } else {
      duergarCount += 1;
      duergarHp += hp;
    }
  }
  return {
    finalCounts: { Drow: drowCount, Duergar: duergarCount },
    finalHpTotals: { Drow: drowHp, Duergar: duergarHp },
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
    const basisOutcome = state.outcome as Exclude<MatchOutcome, null>;
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
    occurredAt: string;
    confirmed: boolean;
    random?: RandomSource;
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
      ...(preview.coinFlipResult
        ? { coinFlipResult: preview.coinFlipResult }
        : {}),
    },
    event: {
      type: "MatchEnded",
      matchId: state.matchId,
      sequence,
      rulesVersion: state.rulesVersion,
      occurredAt,
      outcome: preview.outcome,
      eliminatedTeams: [...state.eliminatedTeams],
      decisionBasis: preview.decisionBasis,
      finalCounts: preview.finalCounts,
      finalHpTotals: preview.finalHpTotals,
      ...(preview.coinFlipResult
        ? { coinFlipResult: preview.coinFlipResult }
        : {}),
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
    rulesVersion: state.rulesVersion,
    matchId: state.matchId,
    phase: "active",
    sequence,
    characters: state.characters,
    initiative: state.initiative,
    round: state.round,
    activeSlot: state.activeSlot,
    spentReactionIds: state.spentReactionIds,
    spentAbilityIds:
      (state as unknown as ActiveMatchState).spentAbilityIds ?? [],
    majorActionUsed: state.majorActionUsed,
    eliminatedTeams: state.eliminatedTeams,
    acknowledgedEliminations: state.acknowledgedEliminations,
    outcome: null,
    activeEffects: (state as unknown as ActiveMatchState).activeEffects ?? [],
  };
  return {
    state: active,
    event: {
      type: "MatchReopened",
      matchId: state.matchId,
      sequence,
      rulesVersion: state.rulesVersion,
      occurredAt,
      endedSequence: state.endedSequence,
    },
  };
}
