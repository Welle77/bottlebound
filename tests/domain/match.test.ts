import { describe, expect, it } from "vitest";

import {
  createSetup,
  generateInitiative,
  rerollInitiative,
  restoreStateFromEvents,
  startMatch,
} from "../../src/domain/match";
import {
  MATCH_CONFIGURATION,
  MATCH_CONFIGURATION_VERSION,
} from "../../src/domain/match-configuration";
import { queuedRandom } from "./match-test-support";

describe("Setup Match commands", () => {
  it("creates the authoritative fixed roster at full HP without initiative", () => {
    const result = createSetup("match-1", "2026-08-22T14:00:00.000Z");

    expect(MATCH_CONFIGURATION_VERSION).toHaveLength(12);
    expect(
      MATCH_CONFIGURATION.characters.map(
        ({ id, name, team, baseHp, initiativeModifier }) => ({
          id,
          name,
          team,
          baseHp,
          initiativeModifier,
        }),
      ),
    ).toEqual([
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
      configurationVersion: MATCH_CONFIGURATION_VERSION,
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
    });
    expect(result.event.tieOrder).toEqual(expect.any(Array));
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
        { occurredAt: "2026-08-22T14:02:00.000Z", confirmed: false },
      ),
    ).toThrow("Reroll confirmation is required.");

    const rerolled = rerollInitiative(
      generated.state,
      queuedRandom(
        ...Array.from({ length: 12 }, () => 19),
        ...Array.from({ length: 20 }, () => 0),
      ),
      { occurredAt: "2026-08-22T14:02:00.000Z", confirmed: true },
    );
    expect(rerolled.event.type).toBe("InitiativeRerolled");
    expect(rerolled.state.sequence).toBe(3);
    expect(rerolled.state.initiative).toHaveLength(12);
    expect(rerolled.state.initiative?.every(({ roll }) => roll === 20)).toBe(
      true,
    );
  });
});

describe("single-schema Match replay", () => {
  it("replays the complete recorded event history into the identical current-schema state", () => {
    const setup = createSetup("match-replay", "2026-08-22T14:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      queuedRandom(19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10),
      "2026-08-22T14:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-22T14:02:00.000Z");

    const replayed = restoreStateFromEvents([
      setup.event,
      generated.event,
      started.event,
    ]);

    expect(replayed).toEqual(started.state);
    expect(setup.event.type).toBe("SetupCreated");
    expect([generated.event, started.event].map(({ type }) => type)).toEqual([
      "InitiativeGenerated",
      "MatchStarted",
    ]);
  });
});
