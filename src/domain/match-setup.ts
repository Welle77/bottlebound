import { RULESET, RULES_VERSION } from "./ruleset";
import { nextBounded, orderByCoinFlips } from "./match-random";
import { initialCombatState, MATCH_SCHEMA_VERSION } from "./match-types";
import type {
  ActiveMatchState,
  CoinFlipTieBreakStep,
  CommandResult,
  InitiativeEntry,
  InitiativeEvent,
  MatchStartedEvent,
  RandomSource,
  SetupCreatedEvent,
  SetupMatchState,
  TieOrder,
} from "./match-types";

export function createSetupForRulesVersion(
  matchId: string,
  occurredAt: string,
  rulesVersion: string,
): CommandResult<SetupMatchState, SetupCreatedEvent> {
  if (matchId.length === 0) {
    throw new Error("A Match identifier is required.");
  }
  const state: SetupMatchState = {
    schemaVersion: MATCH_SCHEMA_VERSION,
    rulesVersion,
    matchId,
    phase: "setup",
    sequence: 1,
    characters: RULESET.characters.map(({ id, baseHp }) => ({
      characterId: id,
      hp: baseHp,
      currentMaxHp: baseHp,
    })),
    initiative: null,
    ...initialCombatState,
  };
  return {
    state,
    event: {
      type: "SetupCreated",
      matchId,
      sequence: 1,
      rulesVersion,
      occurredAt,
    },
  };
}

export function createSetup(
  matchId: string,
  occurredAt: string,
): CommandResult<SetupMatchState, SetupCreatedEvent> {
  return createSetupForRulesVersion(matchId, occurredAt, RULES_VERSION);
}

function rollInitiative(
  state: SetupMatchState,
  random: RandomSource,
): {
  readonly results: readonly InitiativeEntry[];
  readonly tieOrder: readonly TieOrder[];
} {
  const unsorted = RULESET.characters.map((character) => {
    const roll = nextBounded(random, 20) + 1;
    return {
      characterId: character.id,
      roll,
      modifier: character.initiativeModifier,
      total: roll + character.initiativeModifier,
    };
  });
  const totals = [...new Set(unsorted.map(({ total }) => total))].sort(
    (left, right) => right - left,
  );
  const grouped = totals.map((total) => {
    const group = unsorted.filter((entry) => entry.total === total);
    const tieBreak =
      group.length > 1
        ? orderByCoinFlips(group, random)
        : { ordered: group, steps: [] as readonly CoinFlipTieBreakStep[] };
    return { total, group, tieBreak };
  });
  const ordered = grouped.flatMap(({ tieBreak }) => tieBreak.ordered);
  const tieOrder: readonly TieOrder[] = grouped
    .filter(({ group }) => group.length > 1)
    .map(({ total, group, tieBreak }) => ({
      total,
      initialCharacterIds: group.map(({ characterId }) => characterId),
      steps: tieBreak.steps,
      characterIds: tieBreak.ordered.map(({ characterId }) => characterId),
    }));
  const results = ordered.map((entry, index) => ({
    ...entry,
    slot: index + 1,
  }));

  if (state.characters.length !== RULESET.characters.length) {
    throw new Error("The Setup roster is incomplete.");
  }
  return { results, tieOrder };
}

function initiativeCommand(
  state: SetupMatchState,
  random: RandomSource,
  command: {
    readonly occurredAt: string;
    readonly type: InitiativeEvent["type"];
  },
): CommandResult<SetupMatchState, InitiativeEvent> {
  const { occurredAt, type } = command;
  const { results, tieOrder } = rollInitiative(state, random);
  const sequence = state.sequence + 1;
  const nextState: SetupMatchState = {
    ...state,
    sequence,
    initiative: results,
  };
  return {
    state: nextState,
    event: {
      type,
      matchId: state.matchId,
      sequence,
      rulesVersion: state.rulesVersion,
      occurredAt,
      results,
      tieOrder,
    },
  };
}

export function generateInitiative(
  state: SetupMatchState,
  random: RandomSource,
  occurredAt: string,
): CommandResult<SetupMatchState, InitiativeEvent> {
  if (state.initiative !== null) {
    throw new Error(
      "Initiative already exists. Use the confirmed reroll command.",
    );
  }
  return initiativeCommand(state, random, {
    occurredAt,
    type: "InitiativeGenerated",
  });
}

export function rerollInitiative(
  state: SetupMatchState,
  random: RandomSource,
  command: { readonly occurredAt: string; readonly confirmed: boolean },
): CommandResult<SetupMatchState, InitiativeEvent> {
  const { occurredAt, confirmed } = command;
  if (!confirmed) {
    throw new Error("Reroll confirmation is required.");
  }
  if (state.initiative === null) {
    throw new Error("Initiative must exist before a reroll.");
  }
  return initiativeCommand(state, random, {
    occurredAt,
    type: "InitiativeRerolled",
  });
}

export function startMatch(
  state: SetupMatchState,
  occurredAt: string,
): CommandResult<ActiveMatchState, MatchStartedEvent> {
  const characterIds = new Set(
    state.initiative?.map(({ characterId }) => characterId),
  );
  if (
    state.initiative?.length !== RULESET.characters.length ||
    characterIds.size !== RULESET.characters.length ||
    state.initiative.some(
      (entry, index) =>
        entry.slot !== index + 1 ||
        !RULESET.characters.some(({ id }) => id === entry.characterId),
    )
  ) {
    throw new Error("A complete 12-slot initiative result is required.");
  }
  const sequence = state.sequence + 1;
  return {
    state: {
      ...state,
      phase: "active",
      sequence,
      initiative: state.initiative,
      round: 1,
      activeSlot: 1,
    },
    event: {
      type: "MatchStarted",
      matchId: state.matchId,
      sequence,
      rulesVersion: state.rulesVersion,
      occurredAt,
      round: 1,
      activeSlot: 1,
    },
  };
}
