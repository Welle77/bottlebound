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
  const skippedSlots: number[] = [];
  let activeSlot = state.activeSlot;
  let round = state.round;
  for (let checked = 0; checked < state.initiative.length; checked += 1) {
    if (activeSlot === state.initiative.length) {
      activeSlot = 1;
      round += 1;
    } else {
      activeSlot += 1;
    }
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
      break;
    }
    skippedSlots.push(activeSlot);
  }
  if (skippedSlots.length === state.initiative.length) {
    throw new Error("Finish Turn needs one non-Downed character.");
  }
  // Expiry handling for scheduled and turn boundaries
  const slotToCharacter = new Map<number, string>(
    state.initiative.map((entry) => [entry.slot, entry.characterId]),
  );
  const pathSlots = [...skippedSlots, activeSlot];
  const fromSlotValue = state.activeSlot;
  const pendingExpired: ActiveEffect[] = [];
  const remaining: ActiveEffect[] = [];
  for (const effect of state.activeEffects) {
    const trigger = effect.duration.boundaryTrigger;
    const anchorId =
      effect.duration.anchor === "source"
        ? effect.anchorCharacterId
        : effect.affectedCharacterId;
    const anchorSlot = [...slotToCharacter.entries()].find(
      ([, characterId]) => characterId === anchorId,
    )?.[0];
    if (!trigger) {
      remaining.push(effect);
      continue;
    }
    if (
      trigger === "beginning-of-next-turn" &&
      effect.duration.anchor === "affected"
    ) {
      const affectedSlot = [...slotToCharacter.entries()].find(
        ([, characterId]) => characterId === effect.affectedCharacterId,
      )?.[0];
      if (affectedSlot === activeSlot) {
        pendingExpired.push(effect);
        continue;
      }
    }
    if (
      trigger === "end-of-next-turn" &&
      effect.duration.anchor === "affected"
    ) {
      const affectedSlot = [...slotToCharacter.entries()].find(
        ([, characterId]) => characterId === effect.affectedCharacterId,
      )?.[0];
      // The effect outlives the turn in which it was applied and expires at
      // the end of the affected character's NEXT turn; an effect applied to
      // the acting character itself (a self-hit or a self-buff) therefore
      // survives this finish.
      const appliedInThisTurn =
        effect.appliedSequence === state.sequence &&
        affectedSlot === fromSlotValue;
      if (affectedSlot === fromSlotValue && !appliedInThisTurn) {
        pendingExpired.push(effect);
        continue;
      }
    }
    if (
      trigger === "beginning-of-next-scheduled-slot" &&
      effect.duration.anchor === "source"
    ) {
      if (anchorSlot !== undefined && pathSlots.includes(anchorSlot)) {
        pendingExpired.push(effect);
        continue;
      }
    }
    if (
      trigger === "end-of-next-scheduled-slot" &&
      effect.duration.anchor === "source"
    ) {
      // "Until the end of the source's next scheduled initiative position"
      // (Hunter's Mark, Hex): the effect expires when that position ends or
      // is skipped, never during the turn in which the effect was applied.
      const appliedInThisTurn =
        effect.appliedSequence === state.sequence &&
        fromSlotValue === anchorSlot;
      const positionEnds =
        anchorSlot !== undefined &&
        (fromSlotValue === anchorSlot || skippedSlots.includes(anchorSlot));
      if (positionEnds && !appliedInThisTurn) {
        pendingExpired.push(effect);
        continue;
      }
    }
    remaining.push(effect);
  }
  // Downed cleanup after expiry (if any character is Downed, remove its effects)
  const downedCleanup = applyDownedCleanup(state.characters, remaining);
  const finalActiveEffects = downedCleanup.cleaned;
  pendingExpired.push(...downedCleanup.expired);
  // Handle while-condition shapeshift expiry that may have been triggered by previous HP changes but also need to revert maxHP
  let finalCharacters = state.characters;
  // If any shapeshift expired, revert maxHP to 3 (as in resolveAbility)
  for (const expired of pendingExpired) {
    if (expired.kind === "shapeshift") {
      finalCharacters = finalCharacters.map((character) =>
        character.characterId === expired.affectedCharacterId
          ? { ...character, currentMaxHp: 3, hp: Math.min(character.hp, 3) }
          : character,
      );
    }
  }
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
  ruling: { overrideEvidence: string; occurredAt: string },
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
): { cleaned: readonly ActiveEffect[]; expired: readonly ActiveEffect[] } {
  const downedIds = new Set(
    characters
      .filter((character) => character.hp === 0)
      .map((character) => character.characterId),
  );
  const kept: ActiveEffect[] = [];
  const expired: ActiveEffect[] = [];
  for (const effect of effects) {
    if (
      effect.duration.removeWhenAffectedDowned &&
      downedIds.has(effect.affectedCharacterId)
    ) {
      expired.push(effect);
    } else {
      kept.push(effect);
    }
  }
  return { cleaned: kept, expired };
}
