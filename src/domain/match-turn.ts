import { MATCH_CONFIGURATION } from "./match-configuration";
import { isTeam, nextActionCount } from "./match-types";
import type {
  ActiveEffect,
  ActiveMatchState,
  EndedMatchState,
  CharacterId,
  CommandResult,
  DashedEvent,
  EliminationContinuedEvent,
  MatchCharacter,
  MatchOutcome,
  SimultaneousEliminationRuledEvent,
  Team,
  TurnFinishedEvent,
} from "./match-types";

type TurnPosition = {
  readonly activeSlot: number;
  readonly round: number;
  readonly skippedSlots: readonly number[];
  readonly stopped: boolean;
};

type EffectBoundaryContext = {
  readonly activeSlot: number;
  readonly fromSlot: number;
  readonly skippedSlots: readonly number[];
  readonly pathSlots: readonly number[];
  readonly slotToCharacter: ReadonlyMap<number, CharacterId>;
  readonly stateSequence: number;
};

function isSimultaneousEliminationOutcome(value: unknown): boolean {
  return value === "draw" || (typeof value === "string" && isTeam(value));
}

/** Records the active character's full-movement choice for this turn. */
export function dash(
  state: ActiveMatchState | EndedMatchState,
  sourceCharacterId: CharacterId,
  occurredAt: string,
): CommandResult<ActiveMatchState, DashedEvent> {
  if (state.phase === "ended") {
    throw new Error("The Ended Match is read-only.");
  }
  const activeCharacterId = state.initiative[state.activeSlot - 1]?.characterId;
  if (sourceCharacterId !== activeCharacterId) {
    throw new Error("Dash needs the active character as its source.");
  }
  const activeCharacter = state.characters.find(
    ({ characterId }) => characterId === sourceCharacterId,
  );
  if (!activeCharacter || activeCharacter.hp === 0) {
    throw new Error("A Downed character cannot Dash.");
  }
  if ((state.actionsUsed ?? (state.majorActionUsed ? 1 : 0)) >= 2) {
    throw new Error("Move needs an unused action.");
  }
  const sequence = state.sequence + 1;
  return {
    state: {
      ...state,
      sequence,
      remainingMovementPaces: 0,
      actionsUsed: nextActionCount(state.actionsUsed, state.majorActionUsed),
      majorActionUsed: true,
    },
    event: {
      type: "Dashed",
      matchId: state.matchId,
      sequence,
      configurationVersion: state.configurationVersion,
      occurredAt,
      sourceCharacterId,
      movementPaces: 2,
      remainingMovementPaces: 0,
    },
  };
}

function nextTurnPosition(state: ActiveMatchState): TurnPosition {
  const hpByCharacter = new Map(
    state.characters.map(({ characterId, hp }) => [characterId, hp]),
  );
  const eliminatedTeams = new Set(state.eliminatedTeams);
  return state.initiative.reduce<TurnPosition>(
    (position) => {
      if (position.stopped) return position;
      const wraps = position.activeSlot === state.initiative.length;
      const activeSlot = wraps ? 1 : position.activeSlot + 1;
      const round = wraps ? position.round + 1 : position.round;
      const entry = state.initiative[activeSlot - 1];
      const character = MATCH_CONFIGURATION.characters.find(
        ({ id }) => id === entry?.characterId,
      );
      if (
        entry &&
        character &&
        hpByCharacter.get(entry.characterId) !== 0 &&
        !eliminatedTeams.has(character.team)
      ) {
        return { ...position, activeSlot, round, stopped: true };
      }
      return {
        ...position,
        activeSlot,
        round,
        skippedSlots: [...position.skippedSlots, activeSlot],
      };
    },
    {
      activeSlot: state.activeSlot,
      round: state.round,
      skippedSlots: [],
      stopped: false,
    },
  );
}

function characterSlot(
  slotToCharacter: ReadonlyMap<number, CharacterId>,
  characterId: CharacterId,
): number | undefined {
  return [...slotToCharacter.entries()].find(
    ([, candidateId]) => candidateId === characterId,
  )?.[0];
}

function effectExpiresAtBoundary(
  effect: ActiveEffect,
  context: EffectBoundaryContext,
): boolean {
  const {
    activeSlot,
    fromSlot,
    skippedSlots,
    pathSlots,
    slotToCharacter,
    stateSequence,
  } = context;
  const trigger = effect.duration.boundaryTrigger;
  const anchorId =
    effect.duration.anchor === "source"
      ? effect.anchorCharacterId
      : effect.affectedCharacterId;
  const anchorSlot = characterSlot(slotToCharacter, anchorId);
  if (!trigger) return false;
  if (
    trigger === "beginning-of-next-turn" &&
    effect.duration.anchor === "affected"
  ) {
    return (
      characterSlot(slotToCharacter, effect.affectedCharacterId) === activeSlot
    );
  }
  if (trigger === "end-of-next-turn" && effect.duration.anchor === "affected") {
    const affectedSlot = characterSlot(
      slotToCharacter,
      effect.affectedCharacterId,
    );
    // The effect outlives the turn in which it was applied and expires at the
    // end of the affected character's NEXT turn. A self-hit or self-buff
    // therefore survives this finish.
    const appliedInThisTurn =
      effect.appliedSequence === stateSequence && affectedSlot === fromSlot;
    return affectedSlot === fromSlot && !appliedInThisTurn;
  }
  if (
    trigger === "beginning-of-next-scheduled-slot" &&
    effect.duration.anchor === "source"
  ) {
    return anchorSlot !== undefined && pathSlots.includes(anchorSlot);
  }
  if (
    trigger === "end-of-next-scheduled-slot" &&
    effect.duration.anchor === "source"
  ) {
    // Hunter's Mark and Hex expire when the source's next scheduled position
    // ends or is skipped, never during the turn in which they were applied.
    const appliedInThisTurn =
      effect.appliedSequence === stateSequence && fromSlot === anchorSlot;
    const positionEnds =
      anchorSlot !== undefined &&
      (fromSlot === anchorSlot || skippedSlots.includes(anchorSlot));
    return positionEnds && !appliedInThisTurn;
  }
  return false;
}

function partitionEffectsAtBoundary(
  effects: readonly ActiveEffect[],
  context: EffectBoundaryContext,
): {
  readonly expired: readonly ActiveEffect[];
  readonly kept: readonly ActiveEffect[];
} {
  return effects.reduce<{
    readonly expired: readonly ActiveEffect[];
    readonly kept: readonly ActiveEffect[];
  }>(
    (partition, effect) =>
      effectExpiresAtBoundary(effect, context)
        ? { ...partition, expired: [...partition.expired, effect] }
        : { ...partition, kept: [...partition.kept, effect] },
    { expired: [], kept: [] },
  );
}

function restoreExpiredShapeshifts(
  characters: readonly MatchCharacter[],
  expiredEffects: readonly ActiveEffect[],
): readonly MatchCharacter[] {
  return expiredEffects
    .filter((effect) => effect.kind === "shapeshift")
    .reduce<readonly MatchCharacter[]>(
      (currentCharacters, expired) =>
        currentCharacters.map((character) =>
          character.characterId === expired.affectedCharacterId
            ? { ...character, currentMaxHp: 3, hp: Math.min(character.hp, 3) }
            : character,
        ),
      characters,
    );
}

export function finishTurn(
  state: ActiveMatchState | EndedMatchState,
  occurredAt: string,
): CommandResult<ActiveMatchState, TurnFinishedEvent> {
  if (state.phase === "ended") {
    throw new Error("The Ended Match is read-only.");
  }
  const sequence = state.sequence + 1;
  const walk = nextTurnPosition(state);
  const { activeSlot } = walk;
  const { round } = walk;
  const { skippedSlots } = walk;
  if (skippedSlots.length === state.initiative.length) {
    throw new Error("Finish Turn needs one non-Downed character.");
  }
  // Expiry handling for scheduled and turn boundaries
  const slotToCharacter = new Map<number, CharacterId>(
    state.initiative.map((entry) => [entry.slot, entry.characterId]),
  );
  const pathSlots = [...skippedSlots, activeSlot];
  const fromSlot = state.activeSlot;
  const { expired: boundaryExpired, kept: remaining } =
    partitionEffectsAtBoundary(state.activeEffects, {
      activeSlot,
      fromSlot,
      skippedSlots,
      pathSlots,
      slotToCharacter,
      stateSequence: state.sequence,
    });
  // Downed cleanup after expiry (if any character is Downed, remove its effects)
  const downedCleanup = applyDownedCleanup(state.characters, remaining);
  const finalActiveEffects = downedCleanup.cleaned;
  const pendingExpired = [...boundaryExpired, ...downedCleanup.expired];
  // Handle while-condition shapeshift expiry that may have been triggered by previous HP changes but also need to revert maxHP
  // If any shapeshift expired, revert maxHP to 3 (as in resolveAbility)
  const finalCharacters = restoreExpiredShapeshifts(
    state.characters,
    pendingExpired,
  );
  return {
    state: {
      ...state,
      sequence,
      round,
      activeSlot,
      remainingMovementPaces: 2,
      actionsUsed: 0,
      majorActionUsed: false,
      characters: finalCharacters,
      activeEffects: finalActiveEffects,
    },
    event: {
      type: "TurnFinished",
      matchId: state.matchId,
      sequence,
      configurationVersion: state.configurationVersion,
      occurredAt,
      fromRound: state.round,
      fromSlot: state.activeSlot,
      round,
      activeSlot,
      skippedSlots,
      expiredEffects: pendingExpired,
    },
  };
}

export function acknowledgeElimination(
  state: ActiveMatchState,
  eliminatedTeam: Team,
  occurredAt: string,
): CommandResult<ActiveMatchState, EliminationContinuedEvent> {
  if (
    state.eliminatedTeams.length !== 1 ||
    state.eliminatedTeams[0] !== eliminatedTeam ||
    state.outcome === null ||
    state.outcome === "draw"
  ) {
    throw new Error("Continue needs one normal Team Elimination.");
  }
  if (state.acknowledgedEliminations.includes(eliminatedTeam)) {
    throw new Error("This Team Elimination is already acknowledged.");
  }
  const sequence = state.sequence + 1;
  return {
    state: {
      ...state,
      sequence,
      acknowledgedEliminations: [
        ...state.acknowledgedEliminations,
        eliminatedTeam,
      ],
    },
    event: {
      type: "EliminationContinued",
      matchId: state.matchId,
      sequence,
      configurationVersion: state.configurationVersion,
      occurredAt,
      eliminatedTeam,
      outcome: state.outcome,
    },
  };
}

export function ruleSimultaneousElimination(
  state: ActiveMatchState | EndedMatchState,
  outcome: Exclude<MatchOutcome, null>,
  ruling: { readonly overrideEvidence: string; readonly occurredAt: string },
): CommandResult<ActiveMatchState, SimultaneousEliminationRuledEvent> {
  const { overrideEvidence, occurredAt } = ruling;
  if (state.phase === "ended") {
    throw new Error("The Ended Match is read-only.");
  }
  if (
    !isSimultaneousEliminationOutcome(outcome) ||
    state.eliminatedTeams.length !== 2 ||
    !state.eliminatedTeams.includes("Drow") ||
    !state.eliminatedTeams.includes("Duergar") ||
    state.outcome !== null
  ) {
    throw new Error(
      "A simultaneous-elimination ruling needs both teams eliminated and no existing outcome.",
    );
  }
  if (overrideEvidence.trim().length === 0) {
    throw new Error(
      "A simultaneous-elimination ruling needs override evidence.",
    );
  }
  const sequence = state.sequence + 1;
  const eliminatedTeams = ["Drow", "Duergar"] as const;
  return {
    state: { ...state, sequence, outcome },
    event: {
      type: "SimultaneousEliminationRuled",
      matchId: state.matchId,
      sequence,
      configurationVersion: state.configurationVersion,
      occurredAt,
      eliminatedTeams,
      outcome,
      overrideEvidence,
    },
  };
}

export function applyDownedCleanup(
  characters: readonly MatchCharacter[],
  effects: readonly ActiveEffect[],
): {
  readonly cleaned: readonly ActiveEffect[];
  readonly expired: readonly ActiveEffect[];
} {
  const downedIds = new Set(
    characters
      .filter((character) => character.hp === 0)
      .map((character) => character.characterId),
  );
  const expired = effects.filter(
    (effect) =>
      effect.duration.removeWhenAffectedDowned &&
      downedIds.has(effect.affectedCharacterId),
  );
  const cleaned = effects.filter(
    (effect) =>
      !(
        effect.duration.removeWhenAffectedDowned &&
        downedIds.has(effect.affectedCharacterId)
      ),
  );
  return { cleaned, expired };
}
