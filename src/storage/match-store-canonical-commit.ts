import {
  MATCH_SCHEMA_VERSION,
  canonicalMatchRecordsEqual,
  restoreStateFromEvents,
  type MatchEvent,
  type MatchState,
} from "../domain/match";
import { assertCanonicalEvent } from "./match-store-canonical-event";
import {
  assertCanonicalState,
  isRecord,
  sameInitiative,
} from "./match-store-canonical-state";

export function assertCommit(event: MatchEvent, state: MatchState): void {
  assertCanonicalState(state);
  assertCanonicalEvent(event, state.rulesVersion);
  if (
    event.matchId !== state.matchId ||
    event.sequence !== state.sequence ||
    event.rulesVersion !== state.rulesVersion
  ) {
    throw new Error(
      "The Match Event and snapshot do not describe one sequence.",
    );
  }
  if (event.type === "SetupCreated") {
    if (
      event.sequence !== 1 ||
      state.phase !== "setup" ||
      state.initiative !== null
    ) {
      throw new Error("The Setup creation record is structurally invalid.");
    }
    return;
  }
  if (
    event.type === "InitiativeGenerated" ||
    event.type === "InitiativeRerolled"
  ) {
    if (
      state.phase !== "setup" ||
      state.initiative === null ||
      event.results.length !== state.initiative.length ||
      !sameInitiative(event.results, state.initiative)
    ) {
      throw new Error("The initiative event and snapshot do not match.");
    }
    return;
  }
  if (event.type === "UndoApplied") {
    return;
  }
  if (event.type === "MatchMigrated") {
    return;
  }
  if (event.type === "ActionResolved") {
    if (state.phase !== "active" || !state.majorActionUsed) {
      throw new Error("The Action Resolution Event and snapshot do not match.");
    }
    const activeSource = state.initiative[state.activeSlot - 1]?.characterId;
    if (event.sourceCharacterId !== activeSource) {
      throw new Error("The Action Resolution source is not active.");
    }
    for (const effect of event.effects) {
      const character = state.characters.find(
        ({ characterId }) => characterId === effect.characterId,
      );
      if (!character || character.hp !== effect.hpAfter) {
        throw new Error(
          "The Action Resolution Event and snapshot do not match.",
        );
      }
    }
    if (
      event.reactions.some(
        ({ reactionId }) => !state.spentReactionIds.includes(reactionId),
      )
    ) {
      throw new Error("The Action Resolution Reaction state does not match.");
    }
    if (
      !canonicalMatchRecordsEqual(event.eliminatedTeams, state.eliminatedTeams)
    ) {
      throw new Error(
        "The Action Resolution Team Elimination state does not match.",
      );
    }
    return;
  }
  if (event.type === "EliminationContinued") {
    if (
      state.phase !== "active" ||
      !state.acknowledgedEliminations.includes(event.eliminatedTeam) ||
      state.outcome !== event.outcome
    ) {
      throw new Error("The Continue Event and snapshot do not match.");
    }
    return;
  }
  if (event.type === "SimultaneousEliminationRuled") {
    if (
      state.phase !== "active" ||
      state.outcome !== event.outcome ||
      !canonicalMatchRecordsEqual(state.eliminatedTeams, event.eliminatedTeams)
    ) {
      throw new Error(
        "The simultaneous-elimination ruling and snapshot do not match.",
      );
    }
    return;
  }
  if (event.type === "MatchEnded") {
    if (
      state.phase !== "ended" ||
      state.outcome !== event.outcome ||
      !canonicalMatchRecordsEqual(
        state.eliminatedTeams,
        event.eliminatedTeams,
      ) ||
      state.endedSequence !== event.sequence ||
      state.endedAt !== event.occurredAt
    ) {
      throw new Error("The End Game Event and snapshot do not match.");
    }
    if (
      (event as unknown as Record<string, unknown>).decisionBasis !==
        (state as unknown as Record<string, unknown>).decisionBasis ||
      !canonicalMatchRecordsEqual(
        (event as unknown as Record<string, unknown>).finalCounts,
        (state as unknown as Record<string, unknown>).finalCounts,
      ) ||
      !canonicalMatchRecordsEqual(
        (event as unknown as Record<string, unknown>).finalHpTotals,
        (state as unknown as Record<string, unknown>).finalHpTotals,
      ) ||
      (event as unknown as Record<string, unknown>).coinFlipResult !==
        (state as unknown as Record<string, unknown>).coinFlipResult
    ) {
      throw new Error("The End Game Event and snapshot do not match.");
    }
    return;
  }
  if (event.type === "MatchReopened") {
    if (state.phase !== "active") {
      throw new Error("The Reopen Match Event and snapshot do not match.");
    }
    return;
  }
  if (event.type !== "MatchStarted" && event.type !== "TurnFinished") {
    throw new Error("The canonical Match Event is structurally invalid.");
  }
  if (
    state.phase !== "active" ||
    event.round !== state.round ||
    event.activeSlot !== state.activeSlot
  ) {
    throw new Error("The live Match Event and snapshot do not match.");
  }
}

export function assertRestoredMatch(
  metadata: unknown,
  state: unknown,
  events: unknown[],
): asserts state is MatchState {
  if (!isRecord(metadata))
    throw new Error("Saved canonical metadata is invalid.");
  assertCanonicalState(state);
  if (
    metadata.matchId !== state.matchId ||
    metadata.sequence !== state.sequence ||
    metadata.schemaVersion !== MATCH_SCHEMA_VERSION ||
    metadata.rulesVersion !== state.rulesVersion ||
    events.length !== state.sequence
  ) {
    throw new Error("Saved canonical data has a partial sequence.");
  }
  events.forEach((event, index) => {
    assertCanonicalEvent(event, state.rulesVersion);
    if (
      event.matchId !== state.matchId ||
      event.sequence !== index + 1 ||
      (index === 0 && event.type !== "SetupCreated") ||
      (index === 1 &&
        event.type !== "InitiativeGenerated" &&
        event.type !== "MatchMigrated")
    ) {
      throw new Error("Saved canonical data has a partial sequence.");
    }
  });
  const lastEvent = events.at(-1);
  if (lastEvent === undefined)
    throw new Error("Saved canonical data has no Match Event.");
  assertCanonicalEvent(lastEvent, state.rulesVersion);
  assertCommit(lastEvent, state);
  if (
    !canonicalMatchRecordsEqual(
      restoreStateFromEvents(events as MatchEvent[]),
      state,
    )
  ) {
    throw new Error("Saved canonical data does not match its event history.");
  }
}
