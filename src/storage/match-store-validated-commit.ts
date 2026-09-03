import {
  MATCH_SCHEMA_VERSION,
  validatedMatchRecordsEqual,
  isCharacterId,
  isMatchEventType,
  isTeam,
  restoreStateFromEvents,
  type MatchEvent,
  type MatchStartedEvent,
  type MatchState,
  type DashedEvent,
  type TurnFinishedEvent,
} from "../domain/match";
import { assertValidatedEvent } from "./match-store-validated-event";
import {
  assertValidatedState,
  isRecord,
  sameInitiative,
} from "./match-store-validated-state";

/**
 * Runtime check against a widened event-type view so persisted values that
 * bypass the typed event contract still fail, while keeping the compile-time
 * narrowing for the live-event comparisons below.
 */
function isLiveCommittedEvent(
  event: MatchEvent,
): event is MatchStartedEvent | TurnFinishedEvent {
  const eventType: unknown = event.type;
  return (
    typeof eventType === "string" &&
    isMatchEventType(eventType) &&
    (eventType === "MatchStarted" || eventType === "TurnFinished")
  );
}

type SetupCreatedEvent = Extract<MatchEvent, { readonly type: "SetupCreated" }>;
type InitiativeEvent = Extract<
  MatchEvent,
  { readonly type: "InitiativeGenerated" | "InitiativeRerolled" }
>;
type DisplayNamesAssignedEvent = Extract<
  MatchEvent,
  { readonly type: "DisplayNamesAssigned" }
>;
type ActionResolvedEvent = Extract<
  MatchEvent,
  { readonly type: "ActionResolved" }
>;
type EliminationContinuedEvent = Extract<
  MatchEvent,
  { readonly type: "EliminationContinued" }
>;
type SimultaneousEliminationRuledEvent = Extract<
  MatchEvent,
  { readonly type: "SimultaneousEliminationRuled" }
>;
type MatchEndedEvent = Extract<MatchEvent, { readonly type: "MatchEnded" }>;
type MatchReopenedEvent = Extract<
  MatchEvent,
  { readonly type: "MatchReopened" }
>;

function assertSetupCommit(event: SetupCreatedEvent, state: MatchState): void {
  if (
    event.sequence !== 1 ||
    state.phase !== "setup" ||
    state.initiative !== null
  ) {
    throw new Error("The Setup creation record is structurally invalid.");
  }
}

function assertInitiativeCommit(
  event: InitiativeEvent,
  state: MatchState,
): void {
  if (
    state.phase !== "setup" ||
    state.initiative === null ||
    event.results.length !== state.initiative.length ||
    !sameInitiative(event.results, state.initiative)
  ) {
    throw new Error("The initiative event and snapshot do not match.");
  }
}

function assertDisplayNamesCommit(
  event: DisplayNamesAssignedEvent,
  state: MatchState,
): void {
  if (
    state.phase !== "setup" ||
    !validatedMatchRecordsEqual(state.displayNames, event.displayNames)
  ) {
    throw new Error("The Display Name event and snapshot do not match.");
  }
}

function assertActionResolvedEffects(
  event: ActionResolvedEvent,
  state: MatchState,
): void {
  for (const effect of event.effects) {
    const effectCharacterId: unknown = effect.characterId;
    const effectCharacterIsValid =
      typeof effectCharacterId === "string" && isCharacterId(effectCharacterId);
    if (!effectCharacterIsValid) {
      throw new Error("The Action Resolution Event and snapshot do not match.");
    }
    const character = state.characters.find(
      ({ characterId }) => characterId === effectCharacterId,
    );
    if (!character || character.hp !== effect.hpAfter) {
      throw new Error("The Action Resolution Event and snapshot do not match.");
    }
  }
}

function assertActionResolvedCommit(
  event: ActionResolvedEvent,
  state: MatchState,
): void {
  const actionsUsed = state.actionsUsed ?? (state.majorActionUsed ? 1 : 0);
  if (state.phase !== "active" || actionsUsed < event.actionCost) {
    throw new Error("The Action Resolution Event and snapshot do not match.");
  }
  const activeSource = state.initiative[state.activeSlot - 1]?.characterId;
  if (event.sourceCharacterId !== activeSource) {
    throw new Error("The Action Resolution source is not active.");
  }
  assertActionResolvedEffects(event, state);
  if (
    event.reactions.some(
      ({ reactionId }) => !state.spentReactionIds.includes(reactionId),
    )
  ) {
    throw new Error("The Action Resolution Reaction state does not match.");
  }
  if (
    !validatedMatchRecordsEqual(event.eliminatedTeams, state.eliminatedTeams)
  ) {
    throw new Error(
      "The Action Resolution Team Elimination state does not match.",
    );
  }
}

function assertEliminationContinuedCommit(
  event: EliminationContinuedEvent,
  state: MatchState,
): void {
  const { eliminatedTeam } = event;
  const eliminatedTeamIsValid =
    typeof eliminatedTeam === "string" && isTeam(eliminatedTeam);
  if (!eliminatedTeamIsValid) {
    throw new Error("The Continue Event and snapshot do not match.");
  }
  if (
    state.phase !== "active" ||
    !state.acknowledgedEliminations.includes(eliminatedTeam) ||
    state.outcome !== event.outcome
  ) {
    throw new Error("The Continue Event and snapshot do not match.");
  }
}

function assertSimultaneousEliminationCommit(
  event: SimultaneousEliminationRuledEvent,
  state: MatchState,
): void {
  if (
    state.phase !== "active" ||
    state.outcome !== event.outcome ||
    !validatedMatchRecordsEqual(state.eliminatedTeams, event.eliminatedTeams)
  ) {
    throw new Error(
      "The simultaneous-elimination ruling and snapshot do not match.",
    );
  }
}

function assertMatchEndedCommit(
  event: MatchEndedEvent,
  state: MatchState,
): void {
  if (
    state.phase !== "ended" ||
    state.outcome !== event.outcome ||
    !validatedMatchRecordsEqual(state.eliminatedTeams, event.eliminatedTeams) ||
    state.endedSequence !== event.sequence ||
    state.endedAt !== event.occurredAt
  ) {
    throw new Error("The End Game Event and snapshot do not match.");
  }
  if (
    event.decisionBasis !== state.decisionBasis ||
    !validatedMatchRecordsEqual(event.finalCounts, state.finalCounts) ||
    !validatedMatchRecordsEqual(event.finalHpTotals, state.finalHpTotals) ||
    event.coinFlipResult !== state.coinFlipResult
  ) {
    throw new Error("The End Game Event and snapshot do not match.");
  }
}

function assertMatchReopenedCommit(
  _event: MatchReopenedEvent,
  state: MatchState,
): void {
  if (state.phase !== "active") {
    throw new Error("The Reopen Match Event and snapshot do not match.");
  }
}

function assertLiveCommittedCommit(
  event: MatchStartedEvent | TurnFinishedEvent,
  state: MatchState,
): void {
  if (
    state.phase !== "active" ||
    event.round !== state.round ||
    event.activeSlot !== state.activeSlot
  ) {
    throw new Error("The live Match Event and snapshot do not match.");
  }
}

function assertDashCommit(event: DashedEvent, state: MatchState): void {
  if (
    state.phase !== "active" ||
    state.initiative[state.activeSlot - 1]?.characterId !==
      event.sourceCharacterId ||
    state.remainingMovementPaces !== event.remainingMovementPaces ||
    (state.actionsUsed ?? (state.majorActionUsed ? 1 : 0)) < 1
  ) {
    throw new Error("The Dash Event and snapshot do not match.");
  }
}

export function assertCommit(
  event: MatchEvent,
  state: MatchState,
  expectedConfigurationVersion?: string,
): void {
  if (event.configurationVersion !== state.configurationVersion) {
    throw new Error(
      "The Match Event configuration version is incompatible with the validated snapshot.",
    );
  }
  assertValidatedState(state, expectedConfigurationVersion);
  assertValidatedEvent(event, expectedConfigurationVersion);
  if (event.matchId !== state.matchId || event.sequence !== state.sequence) {
    throw new Error(
      "The Match Event and snapshot do not describe one sequence.",
    );
  }
  if (event.type === "SetupCreated") {
    assertSetupCommit(event, state);
    return;
  }
  if (
    event.type === "InitiativeGenerated" ||
    event.type === "InitiativeRerolled"
  ) {
    assertInitiativeCommit(event, state);
    return;
  }
  if (event.type === "DisplayNamesAssigned") {
    assertDisplayNamesCommit(event, state);
    return;
  }
  if (event.type === "UndoApplied") {
    return;
  }
  if (event.type === "ActionResolved") {
    assertActionResolvedCommit(event, state);
    return;
  }
  if (event.type === "Dashed") {
    assertDashCommit(event, state);
    return;
  }
  if (event.type === "EliminationContinued") {
    assertEliminationContinuedCommit(event, state);
    return;
  }
  if (event.type === "SimultaneousEliminationRuled") {
    assertSimultaneousEliminationCommit(event, state);
    return;
  }
  if (event.type === "MatchEnded") {
    assertMatchEndedCommit(event, state);
    return;
  }
  if (event.type === "MatchReopened") {
    assertMatchReopenedCommit(event, state);
    return;
  }
  if (!isLiveCommittedEvent(event)) {
    throw new Error("The validated Match Event is structurally invalid.");
  }
  assertLiveCommittedCommit(event, state);
}

export function assertRestoredMatch(
  metadata: unknown,
  state: unknown,
  events: readonly unknown[],
): { readonly state: MatchState; readonly events: readonly MatchEvent[] } {
  if (!isRecord(metadata))
    throw new Error("Saved validated metadata is invalid.");
  const { configurationVersion } = metadata;
  if (
    typeof configurationVersion !== "string" ||
    configurationVersion.length === 0
  ) {
    throw new Error("Saved validated metadata is invalid.");
  }
  assertValidatedState(state, configurationVersion);
  if (
    metadata.matchId !== state.matchId ||
    metadata.sequence !== state.sequence ||
    metadata.schemaVersion !== MATCH_SCHEMA_VERSION ||
    metadata.configurationVersion !== state.configurationVersion ||
    events.length !== state.sequence
  ) {
    throw new Error("Saved validated data has a partial sequence.");
  }
  const validatedEvents = events.reduce<readonly MatchEvent[]>(
    (validated, event, index) => {
      assertValidatedEvent(event, state.configurationVersion);
      if (
        event.matchId !== state.matchId ||
        event.sequence !== index + 1 ||
        (index === 0 && event.type !== "SetupCreated") ||
        (index === 1 &&
          event.type !== "InitiativeGenerated" &&
          event.type !== "DisplayNamesAssigned")
      ) {
        throw new Error("Saved validated data has a partial sequence.");
      }
      return [...validated, event];
    },
    [],
  );
  const lastEvent = validatedEvents.at(-1);
  if (lastEvent === undefined)
    throw new Error("Saved validated data has no Match Event.");
  assertValidatedEvent(lastEvent, state.configurationVersion);
  assertCommit(lastEvent, state, configurationVersion);
  if (
    !validatedMatchRecordsEqual(restoreStateFromEvents(validatedEvents), state)
  ) {
    throw new Error("Saved validated data does not match its event history.");
  }
  return { state, events: validatedEvents };
}
