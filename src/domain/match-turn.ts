import { RULESET } from "./ruleset";
import type {
  ActiveEffect,
  ActiveMatchState,
  CommandResult,
  EliminationContinuedEvent,
  MatchCharacter,
  MatchOutcome,
  MatchState,
  SimultaneousEliminationRuledEvent,
  TurnFinishedEvent,
} from "./match-types";

export function finishTurn(
  state: ActiveMatchState,
  occurredAt: string,
): CommandResult<ActiveMatchState, TurnFinishedEvent> {
  if ((state as MatchState).phase === "ended") {
    throw new Error("The Ended Match is read-only.");
  }
  const sequence = state.sequence + 1;
  const hpByCharacter = new Map(
    state.characters.map(({ characterId, hp }) => [characterId, hp]),
  );
  const eliminatedTeams = new Set(state.eliminatedTeams);
  const walk = state.initiative.reduce<{
    readonly activeSlot: number;
    readonly round: number;
    readonly skippedSlots: readonly number[];
    readonly stopped: boolean;
  }>(
    (position) => {
      if (position.stopped) return position;
      const wraps = position.activeSlot === state.initiative.length;
      const activeSlot = wraps ? 1 : position.activeSlot + 1;
      const round = wraps ? position.round + 1 : position.round;
      const entry = state.initiative[activeSlot - 1];
      const character = RULESET.characters.find(
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
  const activeSlot = walk.activeSlot;
  const round = walk.round;
  const skippedSlots = walk.skippedSlots;
  if (skippedSlots.length === state.initiative.length) {
    throw new Error("Finish Turn needs one non-Downed character.");
  }
  // Expiry handling for scheduled and turn boundaries
  const slotToCharacter = new Map<number, string>(
    state.initiative.map((entry) => [entry.slot, entry.characterId]),
  );
  const pathSlots = [...skippedSlots, activeSlot];
  const fromSlotValue = state.activeSlot;
  const { expired: boundaryExpired, kept: remaining } =
    state.activeEffects.reduce<{
      readonly expired: readonly ActiveEffect[];
      readonly kept: readonly ActiveEffect[];
    }>(
      (partition, effect) => {
        const trigger = effect.duration.boundaryTrigger;
        const anchorId =
          effect.duration.anchor === "source"
            ? effect.anchorCharacterId
            : effect.affectedCharacterId;
        const anchorSlot = [...slotToCharacter.entries()].find(
          ([, characterId]) => characterId === anchorId,
        )?.[0];
        if (!trigger) {
          return { ...partition, kept: [...partition.kept, effect] };
        }
        if (
          trigger === "beginning-of-next-turn" &&
          effect.duration.anchor === "affected"
        ) {
          const affectedSlot = [...slotToCharacter.entries()].find(
            ([, characterId]) => characterId === effect.affectedCharacterId,
          )?.[0];
          if (affectedSlot === activeSlot) {
            return { ...partition, expired: [...partition.expired, effect] };
          }
        }
        if (
          trigger === "end-of-next-turn" &&
          effect.duration.anchor === "affected"
        ) {
          const affectedSlot = [...slotToCharacter.entries()].find(
            ([, characterId]) => characterId === effect.affectedCharacterId,
          )?.[0];
          if (affectedSlot === fromSlotValue) {
            return { ...partition, expired: [...partition.expired, effect] };
          }
        }
        if (
          (trigger === "beginning-of-next-scheduled-slot" ||
            trigger === "end-of-next-scheduled-slot") &&
          effect.duration.anchor === "source"
        ) {
          if (anchorSlot !== undefined && pathSlots.includes(anchorSlot)) {
            return { ...partition, expired: [...partition.expired, effect] };
          }
        }
        return { ...partition, kept: [...partition.kept, effect] };
      },
      { expired: [], kept: [] },
    );
  // Downed cleanup after expiry (if any character is Downed, remove its effects)
  const downedCleanup = applyDownedCleanup(state.characters, remaining);
  const finalActiveEffects = downedCleanup.cleaned;
  const pendingExpired = [...boundaryExpired, ...downedCleanup.expired];
  // Handle while-condition shapeshift expiry that may have been triggered by previous HP changes but also need to revert maxHP
  // If any shapeshift expired, revert maxHP to 3 (as in resolveAbility)
  const finalCharacters = pendingExpired
    .filter((expired) => expired.kind === "shapeshift")
    .reduce<readonly MatchCharacter[]>(
      (characters, expired) =>
        characters.map((character) =>
          character.characterId === expired.affectedCharacterId
            ? { ...character, currentMaxHp: 3, hp: Math.min(character.hp, 3) }
            : character,
        ),
      state.characters,
    );
  return {
    state: {
      ...state,
      sequence,
      round,
      activeSlot,
      majorActionUsed: false,
      characters: finalCharacters,
      activeEffects: finalActiveEffects,
    },
    event: {
      type: "TurnFinished",
      matchId: state.matchId,
      sequence,
      rulesVersion: state.rulesVersion,
      occurredAt,
      fromRound: state.round,
      fromSlot: state.activeSlot,
      round,
      activeSlot,
      skippedSlots,
      ...(pendingExpired.length > 0 ? { expiredEffects: pendingExpired } : {}),
    },
  };
}

export function acknowledgeElimination(
  state: ActiveMatchState,
  eliminatedTeam: "Drow" | "Duergar",
  occurredAt: string,
): CommandResult<ActiveMatchState, EliminationContinuedEvent> {
  if ((state as MatchState).phase === "ended") {
    throw new Error("The Ended Match is read-only.");
  }
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
      rulesVersion: state.rulesVersion,
      occurredAt,
      eliminatedTeam,
      outcome: state.outcome,
    },
  };
}

export function ruleSimultaneousElimination(
  state: ActiveMatchState,
  outcome: Exclude<MatchOutcome, null>,
  ruling: { readonly overrideEvidence: string; readonly occurredAt: string },
): CommandResult<ActiveMatchState, SimultaneousEliminationRuledEvent> {
  const { overrideEvidence, occurredAt } = ruling;
  if ((state as MatchState).phase === "ended") {
    throw new Error("The Ended Match is read-only.");
  }
  if (
    (outcome !== "Drow" && outcome !== "Duergar" && outcome !== "draw") ||
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
      rulesVersion: state.rulesVersion,
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
