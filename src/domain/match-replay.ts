import { MATCH_CONFIGURATION } from "./match-configuration";
import {
  isAbilityId,
  isActionKind,
  isTeam,
  consumeActionCount,
} from "./match-types";
import { resolveAbility } from "./match-abilities";
import { resolveBasicAttack } from "./match-combat";
import { getEndGamePreview, reopenMatch } from "./match-endgame";
import {
  assertMatchStateStructure,
  validatedMatchRecordsEqual,
} from "./match-history";
import { createSetupForConfigurationVersion } from "./match-setup";
import {
  acknowledgeElimination,
  dash,
  finishTurn,
  ruleSimultaneousElimination,
} from "./match-turn";
import type {
  ActionResolvedEvent,
  ActiveMatchState,
  CharacterId,
  CommandResult,
  EndGamePreview,
  MatchEndedEvent,
  MatchEvent,
  MatchOutcome,
  MatchState,
  RandomSource,
  ReversibleMatchEvent,
  UndoAppliedEvent,
  UndoPreview,
  Team,
} from "./match-types";

function applyHistoricalActionResolution(
  state: ActiveMatchState,
  event: ActionResolvedEvent,
): ActiveMatchState {
  validateHistoricalActionResolution(state, event);
  const withAppliedHp = applyHistoricalHp(state, event);
  const characters = applyHistoricalShapeshift(withAppliedHp, event);
  const spentAbilityIds = applyHistoricalSpentAbilities(state, event);
  const appliedEffects = event.appliedEffects ?? [];
  const expiredIds = new Set(
    event.expiredEffects.map((effect) => effect.effectId),
  );
  const retained = state.activeEffects.filter(
    (effect) => !expiredIds.has(effect.effectId),
  );
  const nextActiveEffects = [...retained, ...appliedEffects].filter(
    (effect) => !expiredIds.has(effect.effectId),
  );
  let outcome: MatchOutcome = null;
  if (event.eliminatedTeams.length === 1) {
    const [eliminatedTeam] = event.eliminatedTeams;
    if (eliminatedTeam === "Drow") outcome = "Duergar";
    if (eliminatedTeam === "Duergar") outcome = "Drow";
  }
  return {
    ...state,
    sequence: event.sequence,
    actionsUsed: consumeActionCount(
      state.actionsUsed,
      state.majorActionUsed,
      event.actionCost,
    ),
    majorActionUsed: true,
    spentReactionIds: [
      ...new Set([
        ...state.spentReactionIds,
        ...event.reactions.map(({ reactionId }) => reactionId),
      ]),
    ],
    spentAbilityIds: spentAbilityIds,
    characters,
    eliminatedTeams: [...event.eliminatedTeams],
    outcome,
    activeEffects: nextActiveEffects,
  };
}

function validateHistoricalActionResolution(
  state: ActiveMatchState,
  event: ActionResolvedEvent,
): void {
  if (event.configurationVersion !== state.configurationVersion) {
    throw new Error(
      "The Action Resolution configuration version does not follow Match State.",
    );
  }
  if (!isActionKind(event.actionType)) {
    throw new Error("The historical Action Resolution is unsupported.");
  }
  const activeCharacterId = state.initiative[state.activeSlot - 1]?.characterId;
  if (event.sourceCharacterId !== activeCharacterId) {
    throw new Error("The Action Resolution source is not active.");
  }
  if (
    (state.actionsUsed ?? (state.majorActionUsed ? 1 : 0)) >= 2 &&
    event.majorActionOverride === null
  ) {
    throw new Error(
      "The Action Resolution needs an unused action or a recorded referee override.",
    );
  }
  const contactIds = event.attackLegs.flatMap((leg) => [
    ...leg.affectedCharacterIds,
  ]);
  const affected = new Set(contactIds);
  if (affected.size !== contactIds.length) {
    throw new Error("The Action Resolution contacts must be unique.");
  }
  event.effects.forEach((effect) => {
    validateHistoricalEffect(state, affected, effect);
  });
  const eliminatedTeamIds: readonly unknown[] = event.eliminatedTeams;
  if (
    !eliminatedTeamIds.every(
      (team): team is Team => typeof team === "string" && isTeam(team),
    ) ||
    new Set(eliminatedTeamIds).size !== eliminatedTeamIds.length
  ) {
    throw new Error("The Action Resolution eliminations are invalid.");
  }
}

function validateHistoricalEffect(
  state: ActiveMatchState,
  contacts: ReadonlySet<CharacterId>,
  effect: ActionResolvedEvent["effects"][number],
): void {
  if (!contacts.has(effect.characterId)) {
    throw new Error("The Action Resolution effect references no contact.");
  }
  const character = state.characters.find(
    ({ characterId }) => characterId === effect.characterId,
  );
  if (!character || character.hp !== effect.hpBefore) {
    throw new Error("The Action Resolution does not follow Match State.");
  }
  if (effect.hpAfter < 0 || effect.hpAfter > character.currentMaxHp) {
    throw new Error("The Action Resolution damage evidence is invalid.");
  }
}

function applyHistoricalHp(
  state: ActiveMatchState,
  event: ActionResolvedEvent,
): ActiveMatchState["characters"] {
  return state.characters.map((character) => {
    const effect = event.effects.find(
      ({ characterId }) => characterId === character.characterId,
    );
    return effect ? { ...character, hp: effect.hpAfter } : character;
  });
}

function applyHistoricalShapeshift(
  characters: ActiveMatchState["characters"],
  event: ActionResolvedEvent,
): ActiveMatchState["characters"] {
  const adjustments = [
    ...(event.actionType === "Ability" && event.appliedEffects
      ? event.appliedEffects
          .filter((applied) => applied.kind === "shapeshift")
          .map((applied) => ({
            characterId: applied.affectedCharacterId,
            toMaxHp: 4 as const,
          }))
      : []),
    ...(event.actionType === "Ability"
      ? event.expiredEffects
          .filter((expired) => expired.kind === "shapeshift")
          .map((expired) => ({
            characterId: expired.affectedCharacterId,
            toMaxHp: 3 as const,
          }))
      : []),
  ];
  return adjustments.reduce(
    (updated, adjustment) =>
      updated.map((character) => {
        if (character.characterId !== adjustment.characterId) return character;
        if (adjustment.toMaxHp === 4) {
          return { ...character, currentMaxHp: 4 };
        }
        return {
          ...character,
          currentMaxHp: 3,
          hp: Math.min(character.hp, 3),
        };
      }),
    characters,
  );
}

function applyHistoricalSpentAbilities(
  state: ActiveMatchState,
  event: ActionResolvedEvent,
): ActiveMatchState["spentAbilityIds"] {
  return event.actionType === "Ability" && event.spentAbilityIds
    ? [...new Set([...state.spentAbilityIds, ...event.spentAbilityIds])]
    : state.spentAbilityIds;
}

function isReversibleEvent(event: MatchEvent): event is ReversibleMatchEvent {
  return (
    event.type === "DisplayNamesAssigned" ||
    event.type === "InitiativeGenerated" ||
    event.type === "InitiativeRerolled" ||
    event.type === "MatchStarted" ||
    event.type === "TurnFinished" ||
    event.type === "Dashed" ||
    event.type === "ActionResolved" ||
    event.type === "EliminationContinued" ||
    event.type === "SimultaneousEliminationRuled" ||
    event.type === "MatchReopened"
  );
}

/** @returns The latest reversible event, or null when none remains. */
function findUndoTarget(
  events: readonly MatchEvent[],
): ReversibleMatchEvent | null {
  const ineffective = new Set(
    events
      .filter(
        (event): event is UndoAppliedEvent => event.type === "UndoApplied",
      )
      .map(({ targetSequence }) => targetSequence),
  );
  for (const index of [...events.keys()].reverse()) {
    const event = events[index];
    if (event && isReversibleEvent(event) && !ineffective.has(event.sequence)) {
      return event;
    }
  }
  return null;
}

function coinFlipEndGamePreviewOrThrow(
  current: ActiveMatchState,
  event: MatchEndedEvent,
): EndGamePreview {
  const { coinFlipResult } = event;
  if (typeof coinFlipResult !== "string" || !isTeam(coinFlipResult)) {
    throw new Error("End Game does not follow Match State.");
  }
  const deterministicRandom: RandomSource = {
    nextUint32: () => (coinFlipResult === "Drow" ? 0 : 1),
  };
  return getEndGamePreview(current, deterministicRandom);
}

function requireActiveState(
  current: MatchState,
  message: string,
): ActiveMatchState {
  if (current.phase !== "active") throw new Error(message);
  return current;
}

function applyInitiativeGenerated(
  current: MatchState,
  event: Extract<
    MatchEvent,
    { readonly type: "InitiativeGenerated" | "InitiativeRerolled" }
  >,
): MatchState {
  if (current.phase !== "setup") {
    throw new Error("The initiative event cannot apply to this Match State.");
  }
  if (current.initiative !== null) {
    throw new Error("Initiative Generate needs an empty initiative result.");
  }
  return { ...current, sequence: event.sequence, initiative: event.results };
}

function applyInitiativeRerolled(
  current: MatchState,
  event: Extract<
    MatchEvent,
    { readonly type: "InitiativeGenerated" | "InitiativeRerolled" }
  >,
): MatchState {
  if (current.phase !== "setup") {
    throw new Error("The initiative event cannot apply to this Match State.");
  }
  if (current.initiative === null) {
    throw new Error("Initiative Reroll needs an existing initiative result.");
  }
  return { ...current, sequence: event.sequence, initiative: event.results };
}

function applyDisplayNamesAssigned(
  current: MatchState,
  event: Extract<MatchEvent, { readonly type: "DisplayNamesAssigned" }>,
): MatchState {
  if (current.phase !== "setup") {
    throw new Error(
      "The Display Name assignment cannot apply to this Match State.",
    );
  }
  return {
    ...current,
    sequence: event.sequence,
    displayNames: event.displayNames,
  };
}

function applyMatchStarted(
  current: MatchState,
  event: Extract<MatchEvent, { readonly type: "MatchStarted" }>,
): MatchState {
  if (current.phase !== "setup" || current.initiative === null) {
    throw new Error("The Start Match Event cannot apply to this Match State.");
  }
  return {
    ...current,
    phase: "active",
    sequence: event.sequence,
    initiative: current.initiative,
    round: event.round,
    activeSlot: event.activeSlot,
  };
}

function applyTurnFinished(
  current: MatchState,
  event: Extract<MatchEvent, { readonly type: "TurnFinished" }>,
): MatchState {
  const active = requireActiveState(
    current,
    "The Finish Turn Event cannot apply to this Match State.",
  );
  const expected = finishTurn(active, event.occurredAt);
  if (!validatedMatchRecordsEqual(expected.event, event)) {
    throw new Error("The Finish Turn Event does not follow Match State.");
  }
  return expected.state;
}

function applyDash(
  current: MatchState,
  event: Extract<MatchEvent, { readonly type: "Dashed" }>,
): MatchState {
  const active = requireActiveState(
    current,
    "The Dash Event cannot apply to this Match State.",
  );
  const expected = dash(active, event.sourceCharacterId, event.occurredAt);
  if (!validatedMatchRecordsEqual(expected.event, event)) {
    throw new Error("The Dash Event does not follow Match State.");
  }
  return expected.state;
}

function applyAbilityResolution(
  current: ActiveMatchState,
  event: Extract<MatchEvent, { readonly type: "ActionResolved" }>,
): ActiveMatchState {
  const abilityId = event.abilityId ?? event.attackId;
  if (!isAbilityId(abilityId)) {
    throw new Error("The Ability Resolution Event omits its Ability id.");
  }
  const expected = resolveAbility(
    current,
    {
      abilityId,
      targetCharacterIds:
        event.targetCharacterIds ??
        event.attackLegs.flatMap((leg) => leg.affectedCharacterIds),
      attackLegs: event.attackLegs.map(({ affectedCharacterIds }) => ({
        affectedCharacterIds: [...affectedCharacterIds],
      })),
      physicalConfirmations: event.physicalConfirmations,
      reactions: event.reactions.map(
        ({ reactionId, protectedCharacterId, override }) => ({
          reactionId,
          protectedCharacterId,
          override,
        }),
      ),
      majorActionOverride: event.majorActionOverride,
      abilityOverride: event.abilityOverride,
    },
    event.occurredAt,
  );
  return validatedMatchRecordsEqual(expected.event, event)
    ? expected.state
    : applyHistoricalActionResolution(current, event);
}

function applyBasicAttackResolution(
  current: ActiveMatchState,
  event: Extract<MatchEvent, { readonly type: "ActionResolved" }>,
): ActiveMatchState {
  const expected = resolveBasicAttack(
    current,
    {
      sourceCharacterId: event.sourceCharacterId,
      attackLegs: event.attackLegs.map(({ affectedCharacterIds }) => ({
        affectedCharacterIds,
      })),
      physicalConfirmations: event.physicalConfirmations,
      reactions: event.reactions.map(
        ({ reactionId, protectedCharacterId, override }) => ({
          reactionId,
          protectedCharacterId,
          override,
        }),
      ),
      majorActionOverride: event.majorActionOverride,
    },
    event.occurredAt,
  );
  if (!validatedMatchRecordsEqual(expected.event, event)) {
    throw new Error("The Action Resolution does not follow Match State.");
  }
  return expected.state;
}

function applyActionResolved(
  current: MatchState,
  event: ActionResolvedEvent,
): MatchState {
  const active = requireActiveState(
    current,
    "The Action Resolution cannot apply to this Match State.",
  );
  if (active.configurationVersion !== MATCH_CONFIGURATION.version) {
    return applyHistoricalActionResolution(active, event);
  }
  if (event.actionType === "Ability") {
    return applyAbilityResolution(active, event);
  }
  return applyBasicAttackResolution(active, event);
}

function applyEliminationContinued(
  current: MatchState,
  event: Extract<MatchEvent, { readonly type: "EliminationContinued" }>,
): MatchState {
  const active = requireActiveState(
    current,
    "Continue cannot apply to this Match State.",
  );
  const expected = acknowledgeElimination(
    active,
    event.eliminatedTeam,
    event.occurredAt,
  );
  if (!validatedMatchRecordsEqual(expected.event, event)) {
    throw new Error("Continue does not follow Match State.");
  }
  return expected.state;
}

function applySimultaneousEliminationRuling(
  current: MatchState,
  event: Extract<MatchEvent, { readonly type: "SimultaneousEliminationRuled" }>,
): MatchState {
  const active = requireActiveState(
    current,
    "A simultaneous-elimination ruling cannot apply to this Match State.",
  );
  const expected = ruleSimultaneousElimination(active, event.outcome, {
    overrideEvidence: event.overrideEvidence,
    occurredAt: event.occurredAt,
  });
  if (!validatedMatchRecordsEqual(expected.event, event)) {
    throw new Error(
      "The simultaneous-elimination ruling does not follow Match State.",
    );
  }
  return expected.state;
}

function applyMatchEnded(
  current: MatchState,
  event: MatchEndedEvent,
): MatchState {
  const active = requireActiveState(
    current,
    "End Game cannot apply to this Match State.",
  );
  const preview =
    event.decisionBasis === "coinFlip"
      ? coinFlipEndGamePreviewOrThrow(active, event)
      : getEndGamePreview(active);
  if (
    preview.outcome !== event.outcome ||
    preview.decisionBasis !== event.decisionBasis ||
    !validatedMatchRecordsEqual(preview.finalCounts, event.finalCounts) ||
    !validatedMatchRecordsEqual(preview.finalHpTotals, event.finalHpTotals) ||
    (preview.coinFlipResult ?? null) !== event.coinFlipResult ||
    !validatedMatchRecordsEqual(
      [...active.eliminatedTeams],
      event.eliminatedTeams,
    )
  ) {
    throw new Error("End Game does not follow Match State.");
  }
  return {
    ...active,
    phase: "ended",
    sequence: event.sequence,
    outcome: preview.outcome,
    endedAt: event.occurredAt,
    endedSequence: event.sequence,
    decisionBasis: preview.decisionBasis,
    finalCounts: preview.finalCounts,
    finalHpTotals: preview.finalHpTotals,
    coinFlipResult: preview.coinFlipResult ?? null,
  };
}

function applyMatchReopened(
  current: MatchState,
  event: Extract<MatchEvent, { readonly type: "MatchReopened" }>,
): MatchState {
  if (current.phase !== "ended") {
    throw new Error("Reopen Match cannot apply to this Match State.");
  }
  const expected = reopenMatch(current, event.occurredAt);
  if (!validatedMatchRecordsEqual(expected.event, event)) {
    throw new Error("Reopen Match does not follow Match State.");
  }
  return expected.state;
}

function applyUndoApplied(
  event: UndoAppliedEvent,
  events: readonly MatchEvent[],
  eventIndex: number,
): MatchState {
  const expectedTarget = findUndoTarget(events.slice(0, eventIndex));
  if (
    expectedTarget === null ||
    expectedTarget.sequence !== event.targetSequence ||
    expectedTarget.type !== event.targetType
  ) {
    throw new Error(
      "The Undo Event does not reference the newest effective event.",
    );
  }
  const targetIndex = events.findIndex(
    ({ sequence }) => sequence === event.targetSequence,
  );
  if (targetIndex < 1 || targetIndex >= event.sequence - 1) {
    throw new Error("The Undo Event target is invalid.");
  }
  return {
    ...restoreStateFromEvents(events.slice(0, targetIndex)),
    sequence: event.sequence,
  };
}

function applyReplayEvent(
  current: MatchState,
  event: MatchEvent,
  context: {
    readonly events: readonly MatchEvent[];
    readonly eventIndex: number;
  },
): MatchState {
  switch (event.type) {
    case "InitiativeGenerated":
      return applyInitiativeGenerated(current, event);
    case "InitiativeRerolled":
      return applyInitiativeRerolled(current, event);
    case "DisplayNamesAssigned":
      return applyDisplayNamesAssigned(current, event);
    case "MatchStarted":
      return applyMatchStarted(current, event);
    case "TurnFinished":
      return applyTurnFinished(current, event);
    case "Dashed":
      return applyDash(current, event);
    case "ActionResolved":
      return applyActionResolved(current, event);
    case "EliminationContinued":
      return applyEliminationContinued(current, event);
    case "SimultaneousEliminationRuled":
      return applySimultaneousEliminationRuling(current, event);
    case "MatchEnded":
      return applyMatchEnded(current, event);
    case "MatchReopened":
      return applyMatchReopened(current, event);
    case "UndoApplied":
      return applyUndoApplied(event, context.events, context.eventIndex);
    case "SetupCreated":
      throw new Error("Setup creation can only be the first Match Event.");
  }
}

export function restoreStateFromEvents(
  events: readonly MatchEvent[],
): MatchState {
  const [first] = events;
  if (!first || first.type !== "SetupCreated") {
    throw new Error("Undo needs a complete Match Event history.");
  }
  const initial: MatchState = createSetupForConfigurationVersion(
    first.matchId,
    first.occurredAt,
    first.configurationVersion,
  ).state;
  const current: MatchState = events
    .slice(1)
    .reduce(
      (current: MatchState, event: MatchEvent, offset: number): MatchState => {
        const eventIndex = offset + 1;
        if (event.sequence !== eventIndex + 1) {
          throw new Error("Undo needs a complete Match Event sequence.");
        }
        if (event.matchId !== current.matchId) {
          throw new Error("Undo needs one complete Match Event history.");
        }
        return applyReplayEvent(current, event, { events, eventIndex });
      },
      initial,
    );
  assertMatchStateStructure(current);
  return current;
}

/** @returns The undo preview, or null when undo is unavailable. */
export function getUndoPreview(
  state: MatchState,
  events: readonly MatchEvent[],
): UndoPreview | null {
  if (state.phase === "ended") return null;
  const target = findUndoTarget(events);
  if (target === null) return null;
  if (events.length !== state.sequence) {
    throw new Error("Undo needs the complete committed Match Event history.");
  }
  if (!validatedMatchRecordsEqual(restoreStateFromEvents(events), state)) {
    throw new Error("Undo needs the exact committed Match State and history.");
  }
  const targetIndex = events.findIndex(
    ({ sequence }) => sequence === target.sequence,
  );
  const restored = restoreStateFromEvents(events.slice(0, targetIndex));
  return {
    target,
    currentState: state,
    restoredState: { ...restored, sequence: state.sequence + 1 },
  };
}

export function undoLastEvent(
  state: MatchState,
  events: readonly MatchEvent[],
  command: { readonly occurredAt: string; readonly confirmed: boolean },
): CommandResult<MatchState, UndoAppliedEvent> {
  const { occurredAt, confirmed } = command;
  if (!confirmed) throw new Error("Undo confirmation is required.");
  const preview = getUndoPreview(state, events);
  if (preview === null) throw new Error("No reversible Match Event remains.");
  return {
    state: preview.restoredState,
    event: {
      type: "UndoApplied",
      matchId: state.matchId,
      sequence: state.sequence + 1,
      configurationVersion: state.configurationVersion,
      occurredAt,
      targetSequence: preview.target.sequence,
      targetType: preview.target.type,
    },
  };
}
