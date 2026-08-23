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
} from "./match";

export function queuedRandom(...values: number[]): RandomSource {
  let offset = 0;
  return {
    nextUint32: () => {
      const value = values[offset];
      offset += 1;
      if (value === undefined) {
        throw new Error("The test random queue is empty.");
      }
      return value;
    },
  };
}

export function simultaneousEliminationRun(matchId: string): {
  steps: Array<{ event: MatchEvent; state: MatchState }>;
  finalState: ActiveMatchState;
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
  const steps: Array<{ event: MatchEvent; state: MatchState }> = [
    setup,
    generated,
    started,
  ];
  let current = started.state;
  affectedLists.forEach((affectedCharacterIds, index) => {
    const attacked = resolveBasicAttack(
      current,
      {
        sourceCharacterId: sources[index]!,
        affectedCharacterIds,
        physicalConfirmations: confirmations,
        majorActionOverride: null,
      },
      `2026-08-22T14:${String(3 + index * 2).padStart(2, "0")}:00.000Z`,
    );
    steps.push(attacked);
    current = attacked.state;
    if (index < affectedLists.length - 1) {
      const turned = finishTurn(
        current,
        `2026-08-22T14:${String(4 + index * 2).padStart(2, "0")}:00.000Z`,
      );
      steps.push(turned);
      current = turned.state;
    }
  });
  return { steps, finalState: current };
}
