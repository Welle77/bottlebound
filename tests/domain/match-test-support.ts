import {
  createSetup,
  finishTurn,
  generateInitiative,
  resolveBasicAttack,
  startMatch,
  type ActiveMatchState,
  type MatchEvent,
  type MatchState,
  type RandomSource,
} from "../../src/domain/match";

class QueueCursor {
  private readonly values: readonly number[];
  #position = 0;
  constructor(values: readonly number[]) {
    this.values = values;
  }
  take(): number | undefined {
    const value = this.values[this.#position];
    this.#position += 1;
    return value;
  }
}

export function queuedRandom(...values: readonly number[]): RandomSource {
  const cursor = new QueueCursor(values);
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
): string {
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
  const everywhere = (exceptCharacterId: string) =>
    characterIds.filter((characterId) => characterId !== exceptCharacterId);
  const sources = [
    "drow-rogue",
    "drow-druid",
    "drow-paladin",
    "duergar-monk",
    "duergar-fighter",
    "duergar-barbarian",
  ];
  const affectedLists = [
    everywhere("drow-rogue"),
    everywhere("drow-druid"),
    everywhere("drow-paladin"),
    ["drow-paladin", "duergar-barbarian"],
    ["drow-rogue", "drow-druid", "duergar-fighter", "drow-paladin"],
    ["drow-paladin", "duergar-monk", "duergar-barbarian"],
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
