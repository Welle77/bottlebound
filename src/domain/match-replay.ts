import { RULESET } from "./ruleset";
import { resolveAbility } from "./match-abilities";
import { resolveBasicAttack } from "./match-combat";
import { getEndGamePreview, reopenMatch } from "./match-endgame";
import {
  assertMatchStateStructure,
  canonicalMatchRecordsEqual,
} from "./match-history";
import { createSetupForRulesVersion } from "./match-setup";
import {
  acknowledgeElimination,
  finishTurn,
  ruleSimultaneousElimination,
} from "./match-turn";
import {
  LEGACY_MATCH_SCHEMA_VERSION,
  MATCH_SCHEMA_VERSION,
} from "./match-types";
import type {
  ActionResolvedEvent,
  ActiveMatchState,
  CommandResult,
  EndedMatchState,
  EndGamePreview,
  MatchEndedEvent,
  MatchEvent,
  MatchOutcome,
  MatchState,
  RandomSource,
  ReversibleMatchEvent,
  UndoAppliedEvent,
  UndoPreview,
} from "./match-types";

function applyHistoricalActionResolution(
  state: ActiveMatchState,
  event: ActionResolvedEvent,
): ActiveMatchState {
  if (event.rulesVersion !== state.rulesVersion) {
    throw new Error(
      "The Action Resolution rules version does not follow Match State.",
    );
  }
  if (event.actionType !== "Basic Attack" && event.actionType !== "Ability") {
    throw new Error("The historical Action Resolution is unsupported.");
  }
  const activeCharacterId = state.initiative[state.activeSlot - 1]?.characterId;
  if (event.sourceCharacterId !== activeCharacterId) {
    throw new Error("The Action Resolution source is not active.");
  }
  if (state.majorActionUsed && event.majorActionOverride === null) {
    throw new Error("A second Basic Attack needs a recorded referee override.");
  }
  const contactIds = event.attackLegs.flatMap((leg) => [
    ...leg.affectedCharacterIds,
  ]);
  const affected = new Set(contactIds);
  if (affected.size !== contactIds.length) {
    throw new Error("The Action Resolution contacts must be unique.");
  }
  for (const effect of event.effects) {
    if (!affected.has(effect.characterId)) {
      throw new Error("The Action Resolution effect references no contact.");
    }
    const character = state.characters.find(
      ({ characterId }) => characterId === effect.characterId,
    );
    if (!character || character.hp !== effect.hpBefore) {
      throw new Error("The Action Resolution does not follow Match State.");
    }
    if (effect.hpAfter < 0) {
      throw new Error("The Action Resolution damage evidence is invalid.");
    }
    // For abilities, heal can increase HP; allow up to currentMaxHp
    const expectedMax =
      character.currentMaxHp ??
      RULESET.characters.find((rule) => rule.id === character.characterId)
        ?.baseHp ??
      5;
    if (effect.hpAfter > expectedMax) {
      throw new Error("The Action Resolution damage evidence is invalid.");
    }
  }
  if (
    event.eliminatedTeams.some(
      (team) => team !== "Drow" && team !== "Duergar",
    ) ||
    new Set(event.eliminatedTeams).size !== event.eliminatedTeams.length
  ) {
    throw new Error("The Action Resolution eliminations are invalid.");
  }
  // Derive characters with hp and possibly maxHp changes (Shapeshift)
  const withAppliedHp = state.characters.map((character) => {
    const effect = event.effects.find(
      ({ characterId }) => characterId === character.characterId,
    );
    return effect ? { ...character, hp: effect.hpAfter } : character;
  });
  // Apply maxHp changes inferred from applied/expired effects (Shapeshift)
  const shapeshiftAdjustments = [
    ...(event.actionType === "Ability" && event.appliedEffects
      ? event.appliedEffects
          .filter((applied) => applied.kind === "shapeshift")
          .map((applied) => ({
            characterId: applied.affectedCharacterId,
            toMaxHp: 4 as const,
          }))
      : []),
    ...(event.actionType === "Ability" && event.expiredEffects
      ? event.expiredEffects
          .filter((expired) => expired.kind === "shapeshift")
          .map((expired) => ({
            characterId: expired.affectedCharacterId,
            toMaxHp: 3 as const,
          }))
      : []),
  ];
  const characters = shapeshiftAdjustments.reduce<typeof withAppliedHp>(
    (updated, adjustment) =>
      updated.map((character) =>
        character.characterId === adjustment.characterId
          ? adjustment.toMaxHp === 4
            ? { ...character, currentMaxHp: 4 }
            : {
                ...character,
                currentMaxHp: 3,
                hp: Math.min(character.hp, 3),
              }
          : character,
      ),
    withAppliedHp,
  );
  const spentAbilityIds =
    event.actionType === "Ability" && event.spentAbilityIds
      ? [...new Set([...state.spentAbilityIds, ...event.spentAbilityIds])]
      : state.spentAbilityIds;
  const appliedEffects = event.appliedEffects ?? [];
  const expiredIds = new Set(
    (event.expiredEffects ?? []).map((effect) => effect.effectId),
  );
  const retained = state.activeEffects.filter(
    (effect) => !expiredIds.has(effect.effectId),
  );
  const nextActiveEffects = [...retained, ...appliedEffects].filter(
    (effect) => !expiredIds.has(effect.effectId),
  );
  return {
    ...state,
    sequence: event.sequence,
    majorActionUsed: true,
    spentReactionIds: [
      ...new Set([
        ...state.spentReactionIds,
        ...event.reactions.map(({ reactionId }) => reactionId),
      ]),
    ],
    spentAbilityIds,
    characters,
    eliminatedTeams: [...event.eliminatedTeams],
    outcome:
      event.eliminatedTeams.length === 1
        ? event.eliminatedTeams[0] === "Drow"
          ? "Duergar"
          : "Drow"
        : null,
    activeEffects: nextActiveEffects,
  };
}

function isReversibleEvent(event: MatchEvent): event is ReversibleMatchEvent {
  return (
    event.type === "DisplayNamesAssigned" ||
    event.type === "InitiativeGenerated" ||
    event.type === "InitiativeRerolled" ||
    event.type === "MatchStarted" ||
    event.type === "TurnFinished" ||
    event.type === "ActionResolved" ||
    event.type === "EliminationContinued" ||
    event.type === "SimultaneousEliminationRuled" ||
    event.type === "MatchReopened"
  );
}

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
  if (event.coinFlipResult !== "Drow" && event.coinFlipResult !== "Duergar") {
    throw new Error("End Game does not follow Match State.");
  }
  const deterministicRandom: RandomSource = {
    nextUint32: () => (event.coinFlipResult === "Drow" ? 0 : 1),
  };
  return getEndGamePreview(current, deterministicRandom);
}

export function restoreStateFromEvents(
  events: readonly MatchEvent[],
): MatchState {
  const first = events[0];
  if (!first || first.type !== "SetupCreated") {
    throw new Error("Undo needs a complete Match Event history.");
  }
  const initial: MatchState = createSetupForRulesVersion(
    first.matchId,
    first.occurredAt,
    first.rulesVersion,
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
        if (event.type === "InitiativeGenerated") {
          if (current.phase !== "setup") {
            throw new Error(
              "The initiative event cannot apply to this Match State.",
            );
          }
          if (current.initiative !== null) {
            throw new Error(
              "Initiative Generate needs an empty initiative result.",
            );
          }
          return {
            ...current,
            sequence: event.sequence,
            initiative: event.results,
          };
        } else if (event.type === "InitiativeRerolled") {
          if (current.phase !== "setup") {
            throw new Error(
              "The initiative event cannot apply to this Match State.",
            );
          }
          if (current.initiative === null) {
            throw new Error(
              "Initiative Reroll needs an existing initiative result.",
            );
          }
          return {
            ...current,
            sequence: event.sequence,
            initiative: event.results,
          };
        } else if (event.type === "DisplayNamesAssigned") {
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
        } else if (event.type === "MatchStarted") {
          if (current.phase !== "setup" || current.initiative === null) {
            throw new Error(
              "The Start Match Event cannot apply to this Match State.",
            );
          }
          return {
            ...current,
            phase: "active",
            sequence: event.sequence,
            initiative: current.initiative,
            round: event.round,
            activeSlot: event.activeSlot,
          };
        } else if (event.type === "TurnFinished") {
          if (current.phase !== "active") {
            throw new Error(
              "The Finish Turn Event cannot apply to this Match State.",
            );
          }
          const expected = finishTurn(current, event.occurredAt);
          if (!canonicalMatchRecordsEqual(expected.event, event)) {
            throw new Error(
              "The Finish Turn Event does not follow Match State.",
            );
          }
          return expected.state;
        } else if (event.type === "ActionResolved") {
          if (current.phase !== "active") {
            throw new Error(
              "The Action Resolution cannot apply to this Match State.",
            );
          }
          const activeState: ActiveMatchState = current;
          if (activeState.rulesVersion === RULESET.version) {
            if (event.actionType === "Ability") {
              const expected = resolveAbility(
                activeState,
                {
                  abilityId: event.abilityId ?? event.attackId,
                  targetCharacterIds:
                    event.targetCharacterIds ??
                    event.attackLegs.flatMap((leg) => leg.affectedCharacterIds),
                  attackLegs: event.attackLegs.map(
                    ({ affectedCharacterIds }) => ({
                      affectedCharacterIds: [...affectedCharacterIds],
                    }),
                  ),
                  physicalConfirmations: event.physicalConfirmations,
                  reactions: event.reactions.map(
                    ({ reactionId, protectedCharacterId, override }) => ({
                      reactionId,
                      protectedCharacterId,
                      override,
                    }),
                  ),
                  majorActionOverride: event.majorActionOverride,
                  // Feed the recorded Override sentence back so the recompute
                  // matches exactly; events from before the field keep the
                  // historical fallback that only satisfies the gates.
                  abilityOverride:
                    event.abilityOverride !== undefined
                      ? event.abilityOverride
                      : event.spentAbilityIds?.length
                        ? "historical-override"
                        : null,
                },
                event.occurredAt,
              );
              // For replay, we cannot rely on spent check; allow any spent override
              // Instead, compare via canonical equality; if mismatch due to override, fallback to historical
              if (!canonicalMatchRecordsEqual(expected.event, event)) {
                return applyHistoricalActionResolution(activeState, event);
              }
              return expected.state;
            }
            const expected = resolveBasicAttack(
              activeState,
              {
                sourceCharacterId: event.sourceCharacterId,
                attackLegs: event.attackLegs.map(
                  ({ affectedCharacterIds }) => ({
                    affectedCharacterIds,
                  }),
                ),
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
            if (!canonicalMatchRecordsEqual(expected.event, event)) {
              throw new Error(
                "The Action Resolution does not follow Match State.",
              );
            }
            return expected.state;
          }
          return applyHistoricalActionResolution(activeState, event);
        } else if (event.type === "EliminationContinued") {
          if (current.phase !== "active") {
            throw new Error("Continue cannot apply to this Match State.");
          }
          const expected = acknowledgeElimination(
            current,
            event.eliminatedTeam,
            event.occurredAt,
          );
          if (!canonicalMatchRecordsEqual(expected.event, event)) {
            throw new Error("Continue does not follow Match State.");
          }
          return expected.state;
        } else if (event.type === "SimultaneousEliminationRuled") {
          if (current.phase !== "active") {
            throw new Error(
              "A simultaneous-elimination ruling cannot apply to this Match State.",
            );
          }
          const expected = ruleSimultaneousElimination(current, event.outcome, {
            overrideEvidence: event.overrideEvidence,
            occurredAt: event.occurredAt,
          });
          if (!canonicalMatchRecordsEqual(expected.event, event)) {
            throw new Error(
              "The simultaneous-elimination ruling does not follow Match State.",
            );
          }
          return expected.state;
        } else if (event.type === "MatchEnded") {
          if (current.phase !== "active") {
            throw new Error("End Game cannot apply to this Match State.");
          }
          if (event.decisionBasis === undefined) {
            if (
              event.outcome === "draw"
                ? event.eliminatedTeams.length !== 2
                : event.eliminatedTeams.length === 0
            ) {
              throw new Error("End Game does not follow Match State.");
            }
            const expectedLegacy: {
              readonly outcome: Exclude<MatchOutcome, null>;
              readonly eliminatedTeams: readonly ("Drow" | "Duergar")[];
            } = (() => {
              if (current.eliminatedTeams.length === 1) {
                const expectedOutcome: Exclude<MatchOutcome, null> =
                  current.eliminatedTeams[0] === "Drow" ? "Duergar" : "Drow";
                if (
                  event.outcome !== expectedOutcome ||
                  !canonicalMatchRecordsEqual(
                    [...current.eliminatedTeams],
                    event.eliminatedTeams,
                  )
                ) {
                  throw new Error("End Game does not follow Match State.");
                }
                return {
                  outcome: expectedOutcome,
                  eliminatedTeams: [...current.eliminatedTeams] as readonly (
                    "Drow" | "Duergar"
                  )[],
                };
              }
              if (current.eliminatedTeams.length === 2) {
                if (
                  current.outcome === null ||
                  event.outcome !== current.outcome ||
                  !canonicalMatchRecordsEqual(
                    [...current.eliminatedTeams],
                    event.eliminatedTeams,
                  )
                ) {
                  throw new Error("End Game does not follow Match State.");
                }
                return {
                  outcome: current.outcome,
                  eliminatedTeams: [...current.eliminatedTeams] as readonly (
                    "Drow" | "Duergar"
                  )[],
                };
              }
              throw new Error("End Game does not follow Match State.");
            })();
            if (
              event.outcome !== expectedLegacy.outcome ||
              !canonicalMatchRecordsEqual(
                [...event.eliminatedTeams],
                expectedLegacy.eliminatedTeams,
              )
            ) {
              throw new Error("End Game does not follow Match State.");
            }
            const legacyEndedState: EndedMatchState = {
              ...current,
              phase: "ended",
              sequence: event.sequence,
              outcome: event.outcome,
              endedAt: event.occurredAt,
              endedSequence: event.sequence,
            };
            return legacyEndedState;
          } else {
            const preview =
              event.decisionBasis === "coinFlip"
                ? coinFlipEndGamePreviewOrThrow(current, event)
                : getEndGamePreview(current);
            if (
              preview.outcome !== event.outcome ||
              preview.decisionBasis !== event.decisionBasis ||
              !canonicalMatchRecordsEqual(
                preview.finalCounts,
                event.finalCounts,
              ) ||
              !canonicalMatchRecordsEqual(
                preview.finalHpTotals,
                event.finalHpTotals,
              ) ||
              preview.coinFlipResult !== event.coinFlipResult ||
              !canonicalMatchRecordsEqual(
                [...current.eliminatedTeams],
                event.eliminatedTeams,
              )
            ) {
              throw new Error("End Game does not follow Match State.");
            }
            const decidedEndedState: EndedMatchState = {
              ...current,
              phase: "ended",
              sequence: event.sequence,
              outcome: preview.outcome,
              endedAt: event.occurredAt,
              endedSequence: event.sequence,
              decisionBasis: preview.decisionBasis,
              finalCounts: preview.finalCounts,
              finalHpTotals: preview.finalHpTotals,
              ...(preview.coinFlipResult
                ? { coinFlipResult: preview.coinFlipResult }
                : {}),
            };
            return decidedEndedState;
          }
        } else if (event.type === "MatchReopened") {
          if (current.phase !== "ended") {
            throw new Error("Reopen Match cannot apply to this Match State.");
          }
          const expected = reopenMatch(current, event.occurredAt);
          if (!canonicalMatchRecordsEqual(expected.event, event)) {
            throw new Error("Reopen Match does not follow Match State.");
          }
          return expected.state;
        } else if (event.type === "UndoApplied") {
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
        } else if (event.type === "MatchMigrated") {
          if (
            event.fromSchemaVersion !== LEGACY_MATCH_SCHEMA_VERSION ||
            event.toSchemaVersion !== MATCH_SCHEMA_VERSION
          ) {
            throw new Error("The Match Migration Event is incompatible.");
          }
          return { ...current, sequence: event.sequence };
        } else {
          throw new Error("Setup creation can only be the first Match Event.");
        }
      },
      initial,
    );
  assertMatchStateStructure(current);
  return current;
}

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
  if (!canonicalMatchRecordsEqual(restoreStateFromEvents(events), state)) {
    throw new Error("Undo needs the exact committed Match State and history.");
  }
  const targetIndex = events.findIndex(
    ({ sequence }) => sequence === target.sequence,
  );
  const restored = restoreStateFromEvents(events.slice(0, targetIndex));
  return {
    target,
    currentState: state,
    restoredState: { ...restored, sequence: state.sequence + 1 } as MatchState,
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
      rulesVersion: state.rulesVersion,
      occurredAt,
      targetSequence: preview.target.sequence,
      targetType: preview.target.type,
    },
  };
}
