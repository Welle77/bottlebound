import { describe, expect, it } from "vitest";

import {
  acknowledgeElimination,
  createSetup,
  endMatch,
  finishTurn,
  getUndoPreview,
  getProtectiveReactionChoices,
  generateInitiative,
  migrateLegacyMatch,
  reopenMatch,
  rerollInitiative,
  resolveBasicAttack,
  ruleSimultaneousElimination,
  restoreStateFromEvents,
  startMatch,
  undoLastEvent,
  type ActiveMatchState,
  type MatchEvent,
  type MatchState,
  type RandomSource,
} from "./match";
import { RULESET, RULES_VERSION } from "./ruleset";

function queuedRandom(...values: number[]): RandomSource {
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

function simultaneousEliminationRun(matchId: string): {
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

describe("Setup Match commands", () => {
  it("creates the authoritative fixed roster at full HP without initiative", () => {
    const result = createSetup("match-1", "2026-08-22T14:00:00.000Z");

    expect(RULES_VERSION).toHaveLength(12);
    expect(RULESET.characters).toEqual([
      {
        id: "drow-rogue",
        name: "Rogue",
        team: "Drow",
        baseHp: 3,
        initiativeModifier: 3,
      },
      {
        id: "drow-druid",
        name: "Druid",
        team: "Drow",
        baseHp: 3,
        initiativeModifier: 1,
      },
      {
        id: "drow-paladin",
        name: "Paladin",
        team: "Drow",
        baseHp: 5,
        initiativeModifier: 1,
      },
      {
        id: "drow-wizard",
        name: "Wizard",
        team: "Drow",
        baseHp: 3,
        initiativeModifier: 0,
      },
      {
        id: "drow-sorcerer",
        name: "Sorcerer",
        team: "Drow",
        baseHp: 3,
        initiativeModifier: 0,
      },
      {
        id: "drow-bard",
        name: "Bard",
        team: "Drow",
        baseHp: 3,
        initiativeModifier: 2,
      },
      {
        id: "duergar-ranger",
        name: "Ranger",
        team: "Duergar",
        baseHp: 3,
        initiativeModifier: 3,
      },
      {
        id: "duergar-monk",
        name: "Monk",
        team: "Duergar",
        baseHp: 4,
        initiativeModifier: 3,
      },
      {
        id: "duergar-fighter",
        name: "Fighter",
        team: "Duergar",
        baseHp: 4,
        initiativeModifier: 1,
      },
      {
        id: "duergar-barbarian",
        name: "Barbarian",
        team: "Duergar",
        baseHp: 5,
        initiativeModifier: 1,
      },
      {
        id: "duergar-warlock",
        name: "Warlock",
        team: "Duergar",
        baseHp: 3,
        initiativeModifier: 0,
      },
      {
        id: "duergar-cleric",
        name: "Cleric",
        team: "Duergar",
        baseHp: 3,
        initiativeModifier: 0,
      },
    ]);
    expect(result.state).toMatchObject({
      matchId: "match-1",
      phase: "setup",
      sequence: 1,
      initiative: null,
    });
    expect(result.state.characters.map(({ hp }) => hp)).toEqual([
      3, 3, 5, 3, 3, 3, 3, 4, 4, 5, 3, 3,
    ]);
    expect(result.event).toMatchObject({
      type: "SetupCreated",
      sequence: 1,
      rulesVersion: RULES_VERSION,
    });
  });

  it("stores all d20 results, totals, slots, and tied-group order", () => {
    const setup = createSetup("match-1", "2026-08-22T14:00:00.000Z");
    const result = generateInitiative(
      setup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-22T14:01:00.000Z",
    );

    expect(result.state.sequence).toBe(2);
    expect(
      result.state.initiative?.map(
        ({ characterId, roll, modifier, total, slot }) => ({
          characterId,
          roll,
          modifier,
          total,
          slot,
        }),
      ),
    ).toEqual([
      { characterId: "drow-rogue", roll: 20, modifier: 3, total: 23, slot: 1 },
      { characterId: "drow-druid", roll: 20, modifier: 1, total: 21, slot: 2 },
      {
        characterId: "drow-paladin",
        roll: 19,
        modifier: 1,
        total: 20,
        slot: 3,
      },
      { characterId: "drow-wizard", roll: 19, modifier: 0, total: 19, slot: 4 },
      {
        characterId: "drow-sorcerer",
        roll: 18,
        modifier: 0,
        total: 18,
        slot: 5,
      },
      { characterId: "drow-bard", roll: 15, modifier: 2, total: 17, slot: 6 },
      {
        characterId: "duergar-ranger",
        roll: 13,
        modifier: 3,
        total: 16,
        slot: 7,
      },
      {
        characterId: "duergar-monk",
        roll: 12,
        modifier: 3,
        total: 15,
        slot: 8,
      },
      {
        characterId: "duergar-fighter",
        roll: 13,
        modifier: 1,
        total: 14,
        slot: 9,
      },
      {
        characterId: "duergar-barbarian",
        roll: 12,
        modifier: 1,
        total: 13,
        slot: 10,
      },
      {
        characterId: "duergar-warlock",
        roll: 12,
        modifier: 0,
        total: 12,
        slot: 11,
      },
      {
        characterId: "duergar-cleric",
        roll: 11,
        modifier: 0,
        total: 11,
        slot: 12,
      },
    ]);
    expect(result.event).toMatchObject({
      type: "InitiativeGenerated",
      sequence: 2,
      results: result.state.initiative,
      tieOrder: expect.any(Array),
    });
  });

  it("uses and stores fair digital coin flips to order a tie of three", () => {
    const setup = createSetup("match-1", "2026-08-22T14:00:00.000Z");
    const result = generateInitiative(
      setup.state,
      queuedRandom(6, 8, 8, 19, 18, 15, 13, 12, 13, 12, 12, 11, 1, 1, 0, 1, 1),
      "2026-08-22T14:01:00.000Z",
    );

    expect(result.event.tieOrder).toEqual([
      {
        total: 10,
        initialCharacterIds: ["drow-rogue", "drow-druid", "drow-paladin"],
        steps: [
          {
            position: 2,
            upperExclusive: 3,
            attempts: [
              {
                flips: ["heads", "heads"],
                candidate: 3,
                accepted: false,
              },
              {
                flips: ["tails", "heads"],
                candidate: 1,
                accepted: true,
              },
            ],
            selectedIndex: 1,
          },
          {
            position: 1,
            upperExclusive: 2,
            attempts: [{ flips: ["heads"], candidate: 1, accepted: true }],
            selectedIndex: 1,
          },
        ],
        characterIds: ["drow-rogue", "drow-paladin", "drow-druid"],
      },
    ]);
    expect(
      result.state.initiative
        ?.filter(({ total }) => total === 10)
        .map(({ characterId }) => characterId),
    ).toEqual(["drow-rogue", "drow-paladin", "drow-druid"]);
  });

  it("requires confirmation before it replaces the complete initiative result", () => {
    const setup = createSetup("match-1", "2026-08-22T14:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      queuedRandom(
        ...Array.from({ length: 12 }, (_, index) => index),
        ...Array.from({ length: 20 }, () => 0),
      ),
      "2026-08-22T14:01:00.000Z",
    );

    expect(() =>
      rerollInitiative(
        generated.state,
        queuedRandom(...Array.from({ length: 12 }, () => 19)),
        "2026-08-22T14:02:00.000Z",
        false,
      ),
    ).toThrow("Reroll confirmation is required.");

    const rerolled = rerollInitiative(
      generated.state,
      queuedRandom(
        ...Array.from({ length: 12 }, () => 19),
        ...Array.from({ length: 20 }, () => 0),
      ),
      "2026-08-22T14:02:00.000Z",
      true,
    );
    expect(rerolled.event.type).toBe("InitiativeRerolled");
    expect(rerolled.state.sequence).toBe(3);
    expect(rerolled.state.initiative).toHaveLength(12);
    expect(rerolled.state.initiative?.every(({ roll }) => roll === 20)).toBe(
      true,
    );
  });
});

describe("combat-ready Match migration", () => {
  it("migrates a Setup Match with one atomic event and initialized combat state", () => {
    const setup = createSetup("match-migrate", "2026-08-22T14:00:00.000Z");
    const legacy = {
      ...setup.state,
      schemaVersion: 2,
      spentReactionIds: undefined,
      majorActionUsed: undefined,
      eliminatedTeams: undefined,
      acknowledgedEliminations: undefined,
      outcome: undefined,
    };
    for (const key of [
      "spentReactionIds",
      "majorActionUsed",
      "eliminatedTeams",
      "acknowledgedEliminations",
      "outcome",
    ]) {
      delete (legacy as Record<string, unknown>)[key];
    }

    const migrated = migrateLegacyMatch(legacy, "2026-08-22T14:00:00.000Z");

    expect(migrated.state).toEqual({
      ...legacy,
      schemaVersion: 3,
      sequence: 2,
      spentReactionIds: [],
      majorActionUsed: false,
      eliminatedTeams: [],
      acknowledgedEliminations: [],
      outcome: null,
    });
    expect(migrated.event).toEqual({
      type: "MatchMigrated",
      matchId: "match-migrate",
      sequence: 2,
      rulesVersion: RULES_VERSION,
      occurredAt: "2026-08-22T14:00:00.000Z",
      fromSchemaVersion: 2,
      toSchemaVersion: 3,
    });
    expect(restoreStateFromEvents([setup.event, migrated.event])).toEqual(
      migrated.state,
    );
  });
});

describe("Active Match commands", () => {
  it("needs a complete initiative order and starts Round 1 at slot 1", () => {
    const setup = createSetup("match-1", "2026-08-22T14:00:00.000Z");

    expect(() => startMatch(setup.state, "2026-08-22T14:01:00.000Z")).toThrow(
      "A complete 12-slot initiative result is required.",
    );

    const generated = generateInitiative(
      setup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-22T14:01:00.000Z",
    );
    const firstEntry = generated.state.initiative?.[0];
    if (!firstEntry || !generated.state.initiative) {
      throw new Error("The test expected complete initiative.");
    }
    const initiative = generated.state.initiative;
    expect(() =>
      startMatch(
        {
          ...generated.state,
          initiative: initiative.map((entry, index) =>
            index === 1 ? { ...firstEntry, slot: 2 } : entry,
          ),
        },
        "2026-08-22T14:02:00.000Z",
      ),
    ).toThrow("A complete 12-slot initiative result is required.");

    const result = startMatch(generated.state, "2026-08-22T14:02:00.000Z");

    expect(result.state).toMatchObject({
      phase: "active",
      sequence: 3,
      round: 1,
      activeSlot: 1,
    });
    expect(result.event).toMatchObject({
      type: "MatchStarted",
      sequence: 3,
      round: 1,
      activeSlot: 1,
    });
  });

  it("advances one fixed slot and increments the round once after slot 12", () => {
    const setup = createSetup("match-1", "2026-08-22T14:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-22T14:01:00.000Z",
    );
    let currentState = startMatch(
      generated.state,
      "2026-08-22T14:02:00.000Z",
    ).state;

    for (let expectedSlot = 2; expectedSlot <= 12; expectedSlot += 1) {
      const result = finishTurn(
        currentState,
        `2026-08-22T14:${String(expectedSlot + 1).padStart(2, "0")}:00.000Z`,
      );
      expect(result.state).toMatchObject({
        round: 1,
        activeSlot: expectedSlot,
      });
      expect(result.event).toMatchObject({
        type: "TurnFinished",
        fromRound: 1,
        fromSlot: expectedSlot - 1,
        round: 1,
        activeSlot: expectedSlot,
      });
      currentState = result.state;
    }

    const wrapped = finishTurn(currentState, "2026-08-22T14:14:00.000Z");
    expect(wrapped.state).toMatchObject({ round: 2, activeSlot: 1 });
    expect(wrapped.event).toMatchObject({
      type: "TurnFinished",
      fromRound: 1,
      fromSlot: 12,
      round: 2,
      activeSlot: 1,
    });
  });

  it("keeps a newly Downed active character until Finish Turn skips Downed slots and wraps", () => {
    const setup = createSetup("match-skip", "2026-08-22T14:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-22T14:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-22T14:02:00.000Z");
    const activeId = started.state.initiative[0]!.characterId;
    const downed = {
      ...started.state,
      activeSlot: 11,
      majorActionUsed: true,
      characters: started.state.characters.map((character) =>
        [
          started.state.initiative[10]!.characterId,
          started.state.initiative[11]!.characterId,
          started.state.initiative[0]!.characterId,
        ].includes(character.characterId)
          ? { ...character, hp: 0 }
          : character,
      ),
    };

    expect(
      resolveBasicAttack(
        {
          ...started.state,
          characters: started.state.characters.map((character) =>
            character.characterId === activeId
              ? { ...character, hp: 1 }
              : character,
          ),
        },
        {
          sourceCharacterId: activeId,
          affectedCharacterIds: [activeId],
          physicalConfirmations: {
            range: true,
            lineOfSight: true,
            legalBottleContact: true,
            terrainContact: true,
          },
          majorActionOverride: null,
        },
        "2026-08-22T14:03:00.000Z",
      ).state,
    ).toMatchObject({ activeSlot: 1 });

    const advanced = finishTurn(downed, "2026-08-22T14:04:00.000Z");
    expect(advanced.state).toMatchObject({
      round: 2,
      activeSlot: 2,
      majorActionUsed: false,
    });
    expect(advanced.event).toMatchObject({
      fromRound: 1,
      fromSlot: 11,
      round: 2,
      activeSlot: 2,
      skippedSlots: [12, 1],
    });
  });

  it("records normal Team Elimination and supports Continue, End Game, and Reopen", () => {
    const setup = createSetup("match-elimination", "2026-08-22T14:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-22T14:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-22T14:02:00.000Z");
    const sourceCharacterId = started.state.initiative[0]!.characterId;
    const nearlyEliminated = {
      ...started.state,
      characters: started.state.characters.map((character) =>
        character.characterId.startsWith("duergar-")
          ? {
              ...character,
              hp: character.characterId === "duergar-ranger" ? 1 : 0,
            }
          : character,
      ),
    };
    const attack = resolveBasicAttack(
      nearlyEliminated,
      {
        sourceCharacterId,
        affectedCharacterIds: ["duergar-ranger"],
        physicalConfirmations: {
          range: true,
          lineOfSight: true,
          legalBottleContact: true,
          terrainContact: true,
        },
        majorActionOverride: null,
      },
      "2026-08-22T14:03:00.000Z",
    );

    expect(attack.state).toMatchObject({
      eliminatedTeams: ["Duergar"],
      outcome: "Drow",
      phase: "active",
    });
    const continued = acknowledgeElimination(
      attack.state,
      "Duergar",
      "2026-08-22T14:04:00.000Z",
    );
    expect(continued.state).toMatchObject({
      phase: "active",
      acknowledgedEliminations: ["Duergar"],
      eliminatedTeams: ["Duergar"],
      outcome: "Drow",
    });
    expect(continued.event).toMatchObject({
      type: "EliminationContinued",
      eliminatedTeam: "Duergar",
      outcome: "Drow",
    });

    const ended = endMatch(attack.state, "2026-08-22T14:05:00.000Z", true);
    expect(ended.state).toMatchObject({
      phase: "ended",
      outcome: "Drow",
      endedAt: "2026-08-22T14:05:00.000Z",
    });
    const reopened = reopenMatch(ended.state, "2026-08-22T14:06:00.000Z");
    expect(reopened.state).toEqual({ ...attack.state, sequence: 6 });
    expect(reopened.event).toMatchObject({
      type: "MatchReopened",
      endedSequence: 5,
    });
  });

  it("replays and repeatedly undoes elimination acknowledgement and reopening exactly", () => {
    const setup = createSetup(
      "match-elimination-replay",
      "2026-08-22T14:00:00.000Z",
    );
    const generated = generateInitiative(
      setup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-22T14:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-22T14:02:00.000Z");
    const sourceCharacterId = started.state.initiative[0]!.characterId;
    const history: MatchEvent[] = [setup.event, generated.event, started.event];
    let current = started.state;
    for (let attackIndex = 0; attackIndex < 5; attackIndex += 1) {
      const attack = resolveBasicAttack(
        current,
        {
          sourceCharacterId,
          affectedCharacterIds: RULESET.characters
            .filter(({ team }) => team === "Duergar")
            .map(({ id }) => id),
          physicalConfirmations: {
            range: true,
            lineOfSight: true,
            legalBottleContact: true,
            terrainContact: true,
          },
          majorActionOverride:
            attackIndex === 0 ? null : "Referee confirmed repeated attack.",
        },
        `2026-08-22T14:0${attackIndex + 3}:00.000Z`,
      );
      current = attack.state;
      history.push(attack.event);
    }
    expect(current).toMatchObject({
      eliminatedTeams: ["Duergar"],
      outcome: "Drow",
    });

    const continued = acknowledgeElimination(
      current,
      "Duergar",
      "2026-08-22T14:08:00.000Z",
    );
    history.push(continued.event);
    expect(restoreStateFromEvents(history)).toEqual(continued.state);
    const undoContinue = undoLastEvent(
      continued.state,
      history,
      "2026-08-22T14:09:00.000Z",
      true,
    );
    history.push(undoContinue.event);
    expect(undoContinue.state).toEqual({ ...current, sequence: 10 });

    const ended = endMatch(
      undoContinue.state as typeof current,
      "2026-08-22T14:10:00.000Z",
      true,
    );
    history.push(ended.event);
    const reopened = reopenMatch(ended.state, "2026-08-22T14:11:00.000Z");
    history.push(reopened.event);
    expect(restoreStateFromEvents(history)).toEqual(reopened.state);
    const undoReopen = undoLastEvent(
      reopened.state,
      history,
      "2026-08-22T14:12:00.000Z",
      true,
    );
    expect(undoReopen.state).toEqual({ ...ended.state, sequence: 13 });
  });

  it("records simultaneous elimination without using contact order as a tiebreak", () => {
    const setup = createSetup(
      "match-simultaneous-elimination",
      "2026-08-22T14:00:00.000Z",
    );
    const generated = generateInitiative(
      setup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-22T14:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-22T14:02:00.000Z");
    const sourceCharacterId = started.state.initiative[0]!.characterId;
    const finalCharacters = ["drow-paladin", "duergar-ranger"];
    const nearlyEliminated = {
      ...started.state,
      characters: started.state.characters.map((character) => ({
        ...character,
        hp:
          character.characterId === sourceCharacterId ||
          finalCharacters.includes(character.characterId)
            ? 1
            : 0,
      })),
    };

    const drowFirst = resolveBasicAttack(
      nearlyEliminated,
      {
        sourceCharacterId,
        affectedCharacterIds: [...finalCharacters, sourceCharacterId],
        physicalConfirmations: {
          range: true,
          lineOfSight: true,
          legalBottleContact: true,
          terrainContact: true,
        },
        majorActionOverride: null,
      },
      "2026-08-22T14:03:00.000Z",
    );
    const duergarFirst = resolveBasicAttack(
      nearlyEliminated,
      {
        sourceCharacterId,
        affectedCharacterIds: [
          sourceCharacterId,
          ...[...finalCharacters].reverse(),
        ],
        physicalConfirmations: {
          range: true,
          lineOfSight: true,
          legalBottleContact: true,
          terrainContact: true,
        },
        majorActionOverride: null,
      },
      "2026-08-22T14:03:00.000Z",
    );

    expect(drowFirst.state).toMatchObject({
      eliminatedTeams: ["Drow", "Duergar"],
      outcome: null,
    });
    expect(duergarFirst.state).toMatchObject({
      eliminatedTeams: ["Drow", "Duergar"],
      outcome: null,
    });
    expect(drowFirst.event.eliminatedTeams).toEqual(["Drow", "Duergar"]);
    expect(duergarFirst.event.eliminatedTeams).toEqual(["Drow", "Duergar"]);
    expect(() =>
      endMatch(drowFirst.state, "2026-08-22T14:04:00.000Z", true),
    ).toThrow("resolved Team Elimination");
    expect(() =>
      acknowledgeElimination(
        drowFirst.state,
        "Drow",
        "2026-08-22T14:04:00.000Z",
      ),
    ).toThrow("one normal Team Elimination");
  });

  it.each(["Drow", "Duergar", "draw"] as const)(
    "records a %s simultaneous-elimination ruling and restores it exactly",
    (outcome) => {
      const { steps, finalState } = simultaneousEliminationRun(
        `match-simultaneous-${outcome}`,
      );
      expect(finalState).toMatchObject({
        eliminatedTeams: ["Drow", "Duergar"],
        outcome: null,
      });
      const evidence =
        "The authoritative rules do not define simultaneous Team Elimination; the referee selected the recorded result.";
      const ruled = ruleSimultaneousElimination(
        finalState,
        outcome,
        evidence,
        "2026-08-22T14:20:00.000Z",
      );

      expect(ruled.state).toMatchObject({
        eliminatedTeams: ["Drow", "Duergar"],
        outcome,
      });
      expect(ruled.event).toMatchObject({
        type: "SimultaneousEliminationRuled",
        eliminatedTeams: ["Drow", "Duergar"],
        outcome,
        overrideEvidence: evidence,
      });
      const ended = endMatch(ruled.state, "2026-08-22T14:21:00.000Z", true);
      expect(ended.state).toMatchObject({
        phase: "ended",
        eliminatedTeams: ["Drow", "Duergar"],
        outcome,
      });
      expect(
        reopenMatch(ended.state, "2026-08-22T14:22:00.000Z").state,
      ).toEqual({ ...ruled.state, sequence: ended.state.sequence + 1 });

      const history: MatchEvent[] = [
        ...steps.map(({ event }) => event),
        ruled.event,
      ];
      expect(restoreStateFromEvents(history)).toEqual(ruled.state);
      const undoRuling = undoLastEvent(
        ruled.state,
        history,
        "2026-08-22T14:23:00.000Z",
        true,
      );
      history.push(undoRuling.event);
      expect(undoRuling.state).toEqual({
        ...finalState,
        sequence: ruled.state.sequence + 1,
      });
      const undoAttack = undoLastEvent(
        undoRuling.state,
        history,
        "2026-08-22T14:24:00.000Z",
        true,
      );
      expect(undoAttack.state).toMatchObject({
        phase: "active",
        eliminatedTeams: [],
        outcome: null,
      });
    },
  );

  it("resolves one ordered Basic Attack as one reversible Match Event", () => {
    const setup = createSetup("match-1", "2026-08-22T14:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-22T14:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-22T14:02:00.000Z");
    const sourceId = started.state.initiative[0]?.characterId;
    if (!sourceId) throw new Error("The test needs an active character.");

    const result = resolveBasicAttack(
      started.state,
      {
        sourceCharacterId: sourceId,
        affectedCharacterIds: ["drow-paladin", "duergar-ranger", sourceId],
        physicalConfirmations: {
          range: true,
          lineOfSight: true,
          legalBottleContact: true,
          terrainContact: true,
        },
        majorActionOverride: null,
      },
      "2026-08-22T14:03:00.000Z",
    );

    expect(result.state).toMatchObject({ sequence: 4, majorActionUsed: true });
    expect(result.state.characters).toEqual(
      started.state.characters.map((character) => ({
        ...character,
        hp: ["drow-paladin", "duergar-ranger", sourceId].includes(
          character.characterId,
        )
          ? Math.max(0, character.hp - 1)
          : character.hp,
      })),
    );
    expect(result.event).toMatchObject({
      type: "ActionResolved",
      sequence: 4,
      sourceCharacterId: sourceId,
      attackLegs: [
        {
          sequence: 1,
          affectedCharacterIds: ["drow-paladin", "duergar-ranger", sourceId],
        },
      ],
      majorActionOverride: null,
    });
    expect(result.event.effects).toEqual([
      {
        characterId: "drow-paladin",
        damage: 1,
        hpBefore: 5,
        hpAfter: 4,
        downedBefore: false,
        downedAfter: false,
      },
      {
        characterId: "duergar-ranger",
        damage: 1,
        hpBefore: 3,
        hpAfter: 2,
        downedBefore: false,
        downedAfter: false,
      },
      {
        characterId: sourceId,
        damage: 1,
        hpBefore: 3,
        hpAfter: 2,
        downedBefore: false,
        downedAfter: false,
      },
    ]);
    expect(
      restoreStateFromEvents([
        setup.event,
        generated.event,
        started.event,
        result.event,
      ]),
    ).toEqual(result.state);
  });

  it("rejects duplicate contacts, missing checks, and a second attack without an override", () => {
    const setup = createSetup("match-1", "2026-08-22T14:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-22T14:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-22T14:02:00.000Z");
    const sourceCharacterId = started.state.initiative[0]!.characterId;
    const input = {
      sourceCharacterId,
      affectedCharacterIds: ["duergar-ranger"],
      physicalConfirmations: {
        range: true,
        lineOfSight: true,
        legalBottleContact: true,
        terrainContact: true,
      },
      majorActionOverride: null,
    } as const;

    expect(() =>
      resolveBasicAttack(
        started.state,
        {
          ...input,
          affectedCharacterIds: ["duergar-ranger", "duergar-ranger"],
        },
        "2026-08-22T14:03:00.000Z",
      ),
    ).toThrow("unique");
    expect(() =>
      resolveBasicAttack(
        started.state,
        {
          ...input,
          physicalConfirmations: {
            ...input.physicalConfirmations,
            range: false,
          },
        },
        "2026-08-22T14:03:00.000Z",
      ),
    ).toThrow("physical confirmation");

    const first = resolveBasicAttack(
      started.state,
      input,
      "2026-08-22T14:03:00.000Z",
    );
    expect(() =>
      resolveBasicAttack(first.state, input, "2026-08-22T14:04:00.000Z"),
    ).toThrow("override");
    const second = resolveBasicAttack(
      first.state,
      { ...input, majorActionOverride: "Referee confirmed a second attack." },
      "2026-08-22T14:04:00.000Z",
    );
    expect(second.event.majorActionOverride).toBe(
      "Referee confirmed a second attack.",
    );
    expect(
      finishTurn(second.state, "2026-08-22T14:05:00.000Z").state,
    ).toMatchObject({ majorActionUsed: false, activeSlot: 2 });
  });

  it("rejects a Basic Attack from a Downed active character", () => {
    const setup = createSetup(
      "match-downed-source",
      "2026-08-22T14:00:00.000Z",
    );
    const generated = generateInitiative(
      setup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-22T14:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-22T14:02:00.000Z");
    const sourceCharacterId = started.state.initiative[0]!.characterId;

    expect(() =>
      resolveBasicAttack(
        {
          ...started.state,
          characters: started.state.characters.map((character) =>
            character.characterId === sourceCharacterId
              ? { ...character, hp: 0 }
              : character,
          ),
        },
        {
          sourceCharacterId,
          affectedCharacterIds: ["duergar-ranger"],
          physicalConfirmations: {
            range: true,
            lineOfSight: true,
            legalBottleContact: true,
            terrainContact: true,
          },
          majorActionOverride: null,
        },
        "2026-08-22T14:03:00.000Z",
      ),
    ).toThrow("Downed");
  });

  it("replays an unavailable-version Action Resolution from its recorded evidence", () => {
    const setup = createSetup("match-historical", "2026-08-22T14:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-22T14:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-22T14:02:00.000Z");
    const attack = resolveBasicAttack(
      started.state,
      {
        sourceCharacterId: started.state.initiative[0]!.characterId,
        affectedCharacterIds: ["duergar-ranger"],
        physicalConfirmations: {
          range: true,
          lineOfSight: true,
          legalBottleContact: true,
          terrainContact: true,
        },
        majorActionOverride: null,
      },
      "2026-08-22T14:03:00.000Z",
    );
    const historicalVersion = "BB-prior-release";
    const history = [setup.event, generated.event, started.event].map(
      (event) => ({ ...event, rulesVersion: historicalVersion }) as MatchEvent,
    );
    const resolvedEvent = {
      ...attack.event,
      rulesVersion: historicalVersion,
    } as MatchEvent;
    const expectedState = { ...attack.state, rulesVersion: historicalVersion };

    expect(restoreStateFromEvents([...history, resolvedEvent])).toEqual(
      expectedState,
    );

    const corruptedEffects = attack.event.effects.map((effect) => ({
      ...effect,
      hpBefore: effect.hpBefore + 1,
    }));
    expect(() =>
      restoreStateFromEvents([
        ...history,
        { ...resolvedEvent, effects: corruptedEffects } as MatchEvent,
      ]),
    ).toThrow("does not follow Match State");
  });

  it("applies several protective Reactions only to their selected characters", () => {
    const setup = createSetup("match-reactions", "2026-08-22T14:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-22T14:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-22T14:02:00.000Z");
    const result = resolveBasicAttack(
      started.state,
      {
        sourceCharacterId: started.state.initiative[0]!.characterId,
        affectedCharacterIds: [
          "duergar-ranger",
          "drow-wizard",
          "drow-sorcerer",
          "drow-paladin",
          "duergar-warlock",
        ],
        physicalConfirmations: {
          range: true,
          lineOfSight: true,
          legalBottleContact: true,
          terrainContact: true,
        },
        reactions: [
          {
            reactionId: "drow-paladin-divine-shield",
            protectedCharacterId: "duergar-ranger",
            override: null,
          },
          {
            reactionId: "drow-wizard-misty-escape",
            protectedCharacterId: "drow-wizard",
            override: null,
          },
          {
            reactionId: "drow-sorcerer-mirror-veil",
            protectedCharacterId: "drow-sorcerer",
            override: null,
          },
          {
            reactionId: "duergar-fighter-shield-wall",
            protectedCharacterId: "drow-paladin",
            override: null,
          },
        ],
        majorActionOverride: null,
      },
      "2026-08-22T14:03:00.000Z",
    );

    expect(
      result.event.effects.map(({ characterId, damage }) => [
        characterId,
        damage,
      ]),
    ).toEqual([
      ["duergar-ranger", 0],
      ["drow-wizard", 0],
      ["drow-sorcerer", 0],
      ["drow-paladin", 0],
      ["duergar-warlock", 1],
    ]);
    expect(result.state.spentReactionIds).toEqual([
      "drow-paladin-divine-shield",
      "drow-wizard-misty-escape",
      "drow-sorcerer-mirror-veil",
      "duergar-fighter-shield-wall",
    ]);
    expect(result.event.reactions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reactionId: "drow-paladin-divine-shield",
          ownerCharacterId: "drow-paladin",
          protectedCharacterId: "duergar-ranger",
          warnings: [],
          override: null,
          operations: [
            {
              type: "prevent-damage-and-effects",
              characterId: "duergar-ranger",
            },
          ],
        }),
        expect.objectContaining({
          reactionId: "drow-wizard-misty-escape",
          operations: [
            {
              type: "prevent-damage-and-effects",
              characterId: "drow-wizard",
            },
            {
              type: "manual-movement",
              characterId: "drow-wizard",
              maxPaces: 2,
              instruction:
                "Move Misty Escape's owner up to 2 paces immediately.",
            },
          ],
        }),
      ]),
    );
    expect(
      restoreStateFromEvents([
        setup.event,
        generated.event,
        started.event,
        result.event,
      ]),
    ).toEqual(result.state);
  });

  it("continues Deflecting Palm as one redirected physical attack", () => {
    const setup = createSetup("match-redirect", "2026-08-22T14:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-22T14:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-22T14:02:00.000Z");
    const sourceCharacterId = started.state.initiative[0]!.characterId;
    const attack = RULESET.basicAttacks.find(
      ({ characterId }) => characterId === sourceCharacterId,
    )!;
    const result = resolveBasicAttack(
      started.state,
      {
        sourceCharacterId,
        attackLegs: [
          { affectedCharacterIds: ["duergar-monk"] },
          {
            affectedCharacterIds: [sourceCharacterId, "drow-paladin"],
          },
        ],
        physicalConfirmations: {
          range: true,
          lineOfSight: true,
          legalBottleContact: true,
          terrainContact: true,
        },
        reactions: [
          {
            reactionId: "duergar-monk-deflecting-palm",
            protectedCharacterId: "duergar-monk",
            override: null,
          },
        ],
        majorActionOverride: null,
      },
      "2026-08-22T14:03:00.000Z",
    );

    expect(result.event.attackLegs).toEqual([
      {
        sequence: 1,
        kind: "initial",
        sourceCharacterId,
        attackId: attack.id,
        rangePaces: attack.rangePaces,
        redirectedByReactionId: null,
        towardCharacterId: null,
        affectedCharacterIds: ["duergar-monk"],
      },
      {
        sequence: 2,
        kind: "redirected",
        sourceCharacterId,
        attackId: attack.id,
        rangePaces: attack.rangePaces,
        redirectedByReactionId: "duergar-monk-deflecting-palm",
        towardCharacterId: sourceCharacterId,
        affectedCharacterIds: [sourceCharacterId, "drow-paladin"],
      },
    ]);
    expect(result.event.reactions[0]).toMatchObject({
      reactionId: "duergar-monk-deflecting-palm",
      protectedCharacterId: "duergar-monk",
      operations: [
        {
          type: "prevent-damage-and-effects",
          characterId: "duergar-monk",
        },
        {
          type: "redirect-physical-attack",
          fromCharacterId: "duergar-monk",
          towardCharacterId: sourceCharacterId,
        },
      ],
    });
    expect(
      result.event.effects.map(({ characterId, damage }) => [
        characterId,
        damage,
      ]),
    ).toEqual([
      ["duergar-monk", 0],
      [sourceCharacterId, 1],
      ["drow-paladin", 1],
    ]);
    expect(result.state.spentReactionIds).toContain(
      "duergar-monk-deflecting-palm",
    );
    expect(
      restoreStateFromEvents([
        setup.event,
        generated.event,
        started.event,
        result.event,
      ]),
    ).toEqual(result.state);
  });

  it("offers Deflecting Palm only for an eligible unspent Monk hit", () => {
    const setup = createSetup("match-palm-choice", "2026-08-22T14:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-22T14:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-22T14:02:00.000Z");

    expect(
      getProtectiveReactionChoices(started.state, ["drow-paladin"]).some(
        ({ reactionId }) => reactionId === "duergar-monk-deflecting-palm",
      ),
    ).toBe(false);
    expect(
      getProtectiveReactionChoices(started.state, ["duergar-monk"]).find(
        ({ reactionId }) => reactionId === "duergar-monk-deflecting-palm",
      ),
    ).toMatchObject({
      ownerCharacterId: "duergar-monk",
      protectedCharacterId: "duergar-monk",
      eligible: true,
    });
    expect(
      getProtectiveReactionChoices(
        {
          ...started.state,
          spentReactionIds: ["duergar-monk-deflecting-palm"],
        },
        ["duergar-monk"],
      ).some(({ reactionId }) => reactionId === "duergar-monk-deflecting-palm"),
    ).toBe(false);
  });

  it("rejects duplicate contacts across the initial and redirected legs", () => {
    const setup = createSetup(
      "match-redirect-duplicate",
      "2026-08-22T14:00:00.000Z",
    );
    const generated = generateInitiative(
      setup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-22T14:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-22T14:02:00.000Z");
    expect(() =>
      resolveBasicAttack(
        started.state,
        {
          sourceCharacterId: started.state.initiative[0]!.characterId,
          attackLegs: [
            { affectedCharacterIds: ["duergar-monk", "drow-paladin"] },
            { affectedCharacterIds: ["drow-paladin"] },
          ],
          physicalConfirmations: {
            range: true,
            lineOfSight: true,
            legalBottleContact: true,
            terrainContact: true,
          },
          reactions: [
            {
              reactionId: "duergar-monk-deflecting-palm",
              protectedCharacterId: "duergar-monk",
              override: null,
            },
          ],
          majorActionOverride: null,
        },
        "2026-08-22T14:03:00.000Z",
      ),
    ).toThrow("unique");
  });

  it("keeps spent and Downed-owner Reactions behind a recorded Override", () => {
    const setup = createSetup(
      "match-reaction-override",
      "2026-08-22T14:00:00.000Z",
    );
    const generated = generateInitiative(
      setup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-22T14:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-22T14:02:00.000Z");
    const state = {
      ...started.state,
      spentReactionIds: ["drow-paladin-divine-shield"],
      characters: started.state.characters.map((character) =>
        character.characterId === "drow-paladin"
          ? { ...character, hp: 0 }
          : character,
      ),
    };
    const choice = getProtectiveReactionChoices(state, ["duergar-ranger"]).find(
      ({ reactionId }) => reactionId === "drow-paladin-divine-shield",
    );
    expect(choice).toMatchObject({
      eligible: false,
      warnings: [
        "Divine Shield is already spent.",
        "Divine Shield's owner is Downed.",
      ],
    });
    const input = {
      sourceCharacterId: state.initiative[0]!.characterId,
      affectedCharacterIds: ["duergar-ranger"],
      physicalConfirmations: {
        range: true,
        lineOfSight: true,
        legalBottleContact: true,
        terrainContact: true,
      },
      reactions: [
        {
          reactionId: "drow-paladin-divine-shield",
          protectedCharacterId: "duergar-ranger",
          override: null,
        },
      ],
      majorActionOverride: null,
    } as const;
    expect(() =>
      resolveBasicAttack(state, input, "2026-08-22T14:03:00.000Z"),
    ).toThrow("Override");
    const result = resolveBasicAttack(
      state,
      {
        ...input,
        reactions: [
          {
            ...input.reactions[0],
            override: "Referee allowed the state-invalid Reaction.",
          },
        ],
      },
      "2026-08-22T14:03:00.000Z",
    );
    expect(result.event.reactions[0]).toMatchObject({
      warnings: [
        "Divine Shield is already spent.",
        "Divine Shield's owner is Downed.",
      ],
      override: "Referee allowed the state-invalid Reaction.",
    });
  });

  it("rejects two selections from one reacting character", () => {
    const setup = createSetup(
      "match-reaction-limit",
      "2026-08-22T14:00:00.000Z",
    );
    const generated = generateInitiative(
      setup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-22T14:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-22T14:02:00.000Z");
    expect(() =>
      resolveBasicAttack(
        started.state,
        {
          sourceCharacterId: started.state.initiative[0]!.characterId,
          affectedCharacterIds: ["duergar-ranger", "duergar-warlock"],
          physicalConfirmations: {
            range: true,
            lineOfSight: true,
            legalBottleContact: true,
            terrainContact: true,
          },
          reactions: [
            {
              reactionId: "drow-paladin-divine-shield",
              protectedCharacterId: "duergar-ranger",
              override: null,
            },
            {
              reactionId: "drow-paladin-divine-shield",
              protectedCharacterId: "duergar-warlock",
              override: null,
            },
          ],
          majorActionOverride: null,
        },
        "2026-08-22T14:03:00.000Z",
      ),
    ).toThrow("One character");
  });

  it("bounds damage at zero and records the Downed transition", () => {
    const setup = createSetup("match-1", "2026-08-22T14:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-22T14:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-22T14:02:00.000Z");
    const atOneHp = {
      ...started.state,
      characters: started.state.characters.map((character) =>
        character.characterId === "duergar-ranger"
          ? { ...character, hp: 1 }
          : character,
      ),
    };
    const resolved = resolveBasicAttack(
      atOneHp,
      {
        sourceCharacterId: atOneHp.initiative[0]!.characterId,
        affectedCharacterIds: ["duergar-ranger"],
        physicalConfirmations: {
          range: true,
          lineOfSight: true,
          legalBottleContact: true,
          terrainContact: true,
        },
        majorActionOverride: null,
      },
      "2026-08-22T14:03:00.000Z",
    );
    expect(resolved.event.effects[0]).toMatchObject({
      hpBefore: 1,
      hpAfter: 0,
      downedBefore: false,
      downedAfter: true,
    });
  });
});

describe("Undo commands", () => {
  it("rejects InitiativeRerolled before initiative exists during restore", () => {
    const setup = createSetup("match-1", "2026-08-22T14:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-22T14:01:00.000Z",
    );

    expect(() =>
      restoreStateFromEvents([
        setup.event,
        { ...generated.event, type: "InitiativeRerolled" },
      ]),
    ).toThrow("Initiative Reroll needs an existing initiative result.");
  });

  it("rejects InitiativeGenerated after initiative exists during restore", () => {
    const setup = createSetup("match-1", "2026-08-22T14:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-22T14:01:00.000Z",
    );
    const rerolled = rerollInitiative(
      generated.state,
      queuedRandom(18, 18, 17, 17, 16, 13, 11, 10, 11, 10, 10, 9),
      "2026-08-22T14:02:00.000Z",
      true,
    );

    expect(() =>
      restoreStateFromEvents([
        setup.event,
        generated.event,
        { ...rerolled.event, type: "InitiativeGenerated" },
      ]),
    ).toThrow("Initiative Generate needs an empty initiative result.");
  });

  it("previews and restores the complete state before the newest reversible event", () => {
    const setup = createSetup("match-1", "2026-08-22T14:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-22T14:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-22T14:02:00.000Z");
    const advanced = finishTurn(started.state, "2026-08-22T14:03:00.000Z");
    const events = [
      setup.event,
      generated.event,
      started.event,
      advanced.event,
    ];

    const preview = getUndoPreview(advanced.state, events);

    expect(preview).toEqual({
      target: advanced.event,
      currentState: advanced.state,
      restoredState: { ...started.state, sequence: 5 },
    });
    expect(() =>
      undoLastEvent(advanced.state, events, "2026-08-22T14:04:00.000Z", false),
    ).toThrow("Undo confirmation is required.");

    const undone = undoLastEvent(
      advanced.state,
      events,
      "2026-08-22T14:04:00.000Z",
      true,
    );
    expect(undone.state).toEqual({ ...started.state, sequence: 5 });
    expect(undone.event).toMatchObject({
      type: "UndoApplied",
      sequence: 5,
      targetSequence: 4,
      targetType: "TurnFinished",
    });
  });

  it("moves backward through effective events without changing prior history", () => {
    const setup = createSetup("match-1", "2026-08-22T14:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-22T14:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-22T14:02:00.000Z");
    const originalEvents = [setup.event, generated.event, started.event];
    const undoStart = undoLastEvent(
      started.state,
      originalEvents,
      "2026-08-22T14:03:00.000Z",
      true,
    );
    const eventsAfterStartUndo = [...originalEvents, undoStart.event];

    expect(getUndoPreview(undoStart.state, eventsAfterStartUndo)?.target).toBe(
      generated.event,
    );
    const undoInitiative = undoLastEvent(
      undoStart.state,
      eventsAfterStartUndo,
      "2026-08-22T14:04:00.000Z",
      true,
    );

    expect(undoStart.state).toMatchObject({
      phase: "setup",
      initiative: generated.state.initiative,
    });
    expect(undoInitiative.state).toEqual({ ...setup.state, sequence: 5 });
    expect(undoInitiative.event).toMatchObject({
      type: "UndoApplied",
      targetSequence: 2,
      targetType: "InitiativeGenerated",
    });
    expect(eventsAfterStartUndo).toEqual([...originalEvents, undoStart.event]);
    expect(
      getUndoPreview(undoInitiative.state, [
        ...eventsAfterStartUndo,
        undoInitiative.event,
      ]),
    ).toBeNull();
  });

  it("restores the prior complete initiative result when it undoes a reroll", () => {
    const setup = createSetup("match-1", "2026-08-22T14:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-22T14:01:00.000Z",
    );
    const rerolled = rerollInitiative(
      generated.state,
      queuedRandom(
        ...Array.from({ length: 12 }, () => 19),
        ...Array.from({ length: 20 }, () => 0),
      ),
      "2026-08-22T14:02:00.000Z",
      true,
    );
    const events = [setup.event, generated.event, rerolled.event];

    const undone = undoLastEvent(
      rerolled.state,
      events,
      "2026-08-22T14:03:00.000Z",
      true,
    );

    expect(undone.state).toEqual({ ...generated.state, sequence: 4 });
    expect(undone.event).toMatchObject({
      targetSequence: 3,
      targetType: "InitiativeRerolled",
    });
  });
});
