import {
  createSetup,
  finishTurn,
  generateInitiative,
  resolveBasicAttack,
  startMatch,
  type ActiveMatchState,
  type CharacterId,
  type MatchEvent,
  type MatchState,
  type RandomSource,
} from "../../src/domain/match";

function createQueueCursor(values: readonly number[]) {
  let position = 0;
  return {
    take(): number | undefined {
      const value = values[position];
      position += 1;
      return value;
    },
  };
}

export function queuedRandom(...values: readonly number[]): RandomSource {
  const cursor = createQueueCursor(values);
  return {
    nextUint32: () => {
      const value = cursor.take();
      if (value === undefined) {
        throw new Error("The test random queue is empty.");
      }
      return value;
    },
  };
}

/** Narrowed initiative lookup for tests; the roster always fills the order. */
export function initiativeCharacterId(
  state: ActiveMatchState,
  index: number,
): CharacterId {
  const entry = state.initiative.at(index);
  if (entry === undefined) {
    throw new Error("The test Match has no such initiative entry.");
  }
  return entry.characterId;
}

export function simultaneousEliminationRun(matchId: string): {
  readonly steps: ReadonlyArray<{
    readonly event: MatchEvent;
    readonly state: MatchState;
  }>;
  readonly finalState: ActiveMatchState;
} {
  const setup = createSetup(matchId, "2026-08-22T14:00:00.000Z");
  const generated = generateInitiative(
    setup.state,
    queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
    "2026-08-22T14:01:00.000Z",
  );
  const started = startMatch(generated.state, "2026-08-22T14:02:00.000Z");
  const confirmations = {
    range: true,
    lineOfSight: true,
    legalBottleContact: true,
    terrainContact: true,
  };
  const characterIds = started.state.characters.map(
    ({ characterId }) => characterId,
  );
  const everywhere = (exceptCharacterId: CharacterId): readonly CharacterId[] =>
    characterIds.filter((characterId) => characterId !== exceptCharacterId);
  const sources: readonly CharacterId[] = [
    "drow-rogue",
    "drow-druid",
    "drow-paladin",
    "duergar-monk",
    "duergar-fighter",
    "duergar-barbarian",
  ];
  const affectedLists: readonly (readonly CharacterId[])[] = [
    everywhere("drow-rogue"),
    everywhere("drow-druid"),
    everywhere("drow-paladin"),
    ["drow-paladin", "duergar-barbarian"] as const,
    ["drow-rogue", "drow-druid", "duergar-fighter", "drow-paladin"] as const,
    ["drow-paladin", "duergar-monk", "duergar-barbarian"] as const,
  ];
  const initialSteps: ReadonlyArray<{
    readonly event: MatchEvent;
    readonly state: MatchState;
  }> = [setup, generated, started];
  const { steps, current } = affectedLists.reduce<{
    readonly steps: ReadonlyArray<{
      readonly event: MatchEvent;
      readonly state: MatchState;
    }>;
    readonly current: ActiveMatchState;
  }>(
    (progress, affectedCharacterIds, index) => {
      const sourceCharacterId = sources.at(index);
      if (sourceCharacterId === undefined) {
        throw new Error("Missing test attack source.");
      }
      const attacked = resolveBasicAttack(
        progress.current,
        {
          sourceCharacterId,
          affectedCharacterIds,
          physicalConfirmations: confirmations,
          majorActionOverride: null,
        },
        `2026-08-22T14:${String(3 + index * 2).padStart(2, "0")}:00.000Z`,
      );
      const attackedSteps = [...progress.steps, attacked];
      if (index < affectedLists.length - 1) {
        const turned = finishTurn(
          attacked.state,
          `2026-08-22T14:${String(4 + index * 2).padStart(2, "0")}:00.000Z`,
        );
        return {
          steps: [...attackedSteps, turned],
          current: turned.state,
        };
      }
      return { steps: attackedSteps, current: attacked.state };
    },
    { steps: initialSteps, current: started.state },
  );
  return { steps, finalState: current };
}
