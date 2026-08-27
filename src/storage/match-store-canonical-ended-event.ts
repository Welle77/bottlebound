import { isDecisionBasis, isTeam } from "../domain/match";
import { isRecord } from "./match-store-canonical-state";

function assertEndedTeamsAndOutcome(value: Record<string, unknown>): void {
  const outcome = value.outcome;
  const outcomeIsValid =
    (typeof outcome === "string" && isTeam(outcome)) || outcome === "draw";
  if (
    !outcomeIsValid ||
    !Array.isArray(value.eliminatedTeams) ||
    !value.eliminatedTeams.every(
      (team: unknown) => typeof team === "string" && isTeam(team),
    ) ||
    new Set(value.eliminatedTeams).size !== value.eliminatedTeams.length ||
    (value.eliminatedTeams.length === 0 && value.outcome === "draw") ||
    (value.eliminatedTeams.length === 1 &&
      (value.outcome === "draw" ||
        value.eliminatedTeams[0] === value.outcome)) ||
    (value.eliminatedTeams.length === 2 &&
      (value.eliminatedTeams[0] !== "Drow" ||
        value.eliminatedTeams[1] !== "Duergar"))
  ) {
    throw new Error("The canonical End Game Event is invalid.");
  }
}

function assertEndedDecisionBasis(value: Record<string, unknown>): void {
  if (
    typeof value.decisionBasis !== "string" ||
    !isDecisionBasis(value.decisionBasis)
  ) {
    throw new Error("The canonical End Game Event is invalid.");
  }
}

function assertEndedFinalTotals(value: Record<string, unknown>): void {
  if (
    !isRecord(value.finalCounts) ||
    !Number.isInteger(value.finalCounts.Drow) ||
    !Number.isInteger(value.finalCounts.Duergar) ||
    (value.finalCounts.Drow as number) < 0 ||
    (value.finalCounts.Duergar as number) < 0 ||
    !isRecord(value.finalHpTotals) ||
    !Number.isInteger(value.finalHpTotals.Drow) ||
    !Number.isInteger(value.finalHpTotals.Duergar) ||
    (value.finalHpTotals.Drow as number) < 0 ||
    (value.finalHpTotals.Duergar as number) < 0
  ) {
    throw new Error("The canonical End Game Event is invalid.");
  }
}

function assertEndedCoinFlip(value: Record<string, unknown>): void {
  const coinFlipResult = value.coinFlipResult;
  const coinFlipIsValid =
    coinFlipResult === null ||
    (typeof coinFlipResult === "string" && isTeam(coinFlipResult));
  if (
    !coinFlipIsValid ||
    (value.decisionBasis === "coinFlip") !== (value.coinFlipResult !== null)
  ) {
    throw new Error("The canonical End Game Event is invalid.");
  }
}

export function assertMatchEndedEvent(value: Record<string, unknown>): void {
  assertEndedTeamsAndOutcome(value);
  assertEndedDecisionBasis(value);
  assertEndedFinalTotals(value);
  assertEndedCoinFlip(value);
}
