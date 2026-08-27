import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";

import {
  MATCH_SCHEMA_VERSION,
  createSetup,
  finishTurn,
  generateInitiative,
  rerollInitiative,
  startMatch,
  undoLastEvent,
  type MatchEvent,
  type MatchState,
} from "../../src/domain/match";
import { createIndexedDbMatchStore } from "../../src/storage/match-store";

function randomQueue(values: number[]) {
  let index = 0;
  return {
    nextUint32: () => {
      const value = values[index];
      index += 1;
      if (value === undefined) throw new Error("Missing test random value.");
      return value;
    },
  };
}

describe("Match command persistence contract", () => {
  it("commits one matching event and snapshot for every Match command", async () => {
    const factory = new IDBFactory();
    const store = createIndexedDbMatchStore(factory, "all-command-persistence");
    const setup = createSetup("match-1", "2026-08-22T14:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      randomQueue([19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10]),
      "2026-08-22T14:01:00.000Z",
    );
    const rerolled = rerollInitiative(
      generated.state,
      randomQueue([
        ...Array.from({ length: 12 }, () => 19),
        ...Array.from({ length: 20 }, () => 0),
      ]),
      { occurredAt: "2026-08-22T14:02:00.000Z", confirmed: true },
    );
    const started = startMatch(rerolled.state, "2026-08-22T14:03:00.000Z");
    const finished = finishTurn(started.state, "2026-08-22T14:04:00.000Z");
    const committed: { state: MatchState; event: MatchEvent }[] = [];

    for (const result of [setup, generated, rerolled, started, finished]) {
      await store.commit(result.event, result.state);
      committed.push(result);
      await expect(store.restore()).resolves.toEqual({
        state: result.state,
        events: committed.map(({ event }) => event),
        summary: null,
      });
    }

    const undone = undoLastEvent(
      finished.state,
      committed.map(({ event }) => event),
      { occurredAt: "2026-08-22T14:05:00.000Z", confirmed: true },
    );
    await store.commit(undone.event, undone.state);

    const restarted = createIndexedDbMatchStore(
      factory,
      "all-command-persistence",
    );
    await expect(restarted.restore()).resolves.toEqual({
      state: undone.state,
      events: [...committed.map(({ event }) => event), undone.event],
      summary: null,
    });
    expect(undone.state.schemaVersion).toBe(MATCH_SCHEMA_VERSION);
    expect(MATCH_SCHEMA_VERSION).toBe(3);
    expect(generated.event.type).toBe("InitiativeGenerated");
    expect(rerolled.event.type).toBe("InitiativeRerolled");
  });

  it("records and replay-checks digital coin flips for a tied group larger than two", async () => {
    const factory = new IDBFactory();
    const databaseName = "recorded-coin-flip-contract";
    const store = createIndexedDbMatchStore(factory, databaseName);
    const setup = createSetup("match-coin-flips", "2026-08-22T14:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      randomQueue([
        6,
        8,
        8,
        9,
        9,
        7,
        6,
        6,
        8,
        8,
        9,
        9,
        ...Array.from({ length: 40 }, () => 0),
      ]),
      "2026-08-22T14:01:00.000Z",
    );

    expect(generated.event.tieOrder).toHaveLength(1);
    expect(generated.event.tieOrder[0]).toMatchObject({
      total: 10,
    });
    expect(generated.event.tieOrder[0]?.initialCharacterIds).toHaveLength(12);
    expect(generated.event.tieOrder[0]?.steps).toHaveLength(11);
    expect(generated.event.tieOrder[0]?.characterIds).toHaveLength(12);
    expect(
      generated.event.tieOrder[0]?.steps.every((step) =>
        step.attempts.every(
          (attempt) =>
            attempt.flips.length > 0 &&
            attempt.flips.every((flip) => flip === "heads" || flip === "tails"),
        ),
      ),
    ).toBe(true);

    await store.commit(setup.event, setup.state);
    await store.commit(generated.event, generated.state);

    const restarted = createIndexedDbMatchStore(factory, databaseName);
    await expect(restarted.restore()).resolves.toEqual({
      state: generated.state,
      events: [setup.event, generated.event],
      summary: null,
    });
  });

  it("returns recovery errors for both corrupted initiative transition directions", async () => {
    const factory = new IDBFactory();
    const setup = createSetup(
      "match-reroll-before-generate",
      "2026-08-22T14:00:00.000Z",
    );
    const generated = generateInitiative(
      setup.state,
      randomQueue([19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10]),
      "2026-08-22T14:01:00.000Z",
    );
    const rerollFirstStore = createIndexedDbMatchStore(
      factory,
      "reroll-before-generate-contract",
    );
    await rerollFirstStore.commit(setup.event, setup.state);
    await rerollFirstStore.commit(
      { ...generated.event, type: "InitiativeRerolled" },
      generated.state,
    );
    await expect(rerollFirstStore.restore()).rejects.toThrow(
      "Saved canonical data has a partial sequence.",
    );

    const secondSetup = createSetup(
      "match-generate-after-generate",
      "2026-08-22T14:00:00.000Z",
    );
    const secondGenerated = generateInitiative(
      secondSetup.state,
      randomQueue([19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10]),
      "2026-08-22T14:01:00.000Z",
    );
    const rerolled = rerollInitiative(
      secondGenerated.state,
      randomQueue([
        ...Array.from({ length: 12 }, () => 19),
        ...Array.from({ length: 20 }, () => 0),
      ]),
      { occurredAt: "2026-08-22T14:02:00.000Z", confirmed: true },
    );
    const generatedTwiceStore = createIndexedDbMatchStore(
      factory,
      "generate-after-generate-contract",
    );
    await generatedTwiceStore.commit(secondSetup.event, secondSetup.state);
    await generatedTwiceStore.commit(
      secondGenerated.event,
      secondGenerated.state,
    );
    await generatedTwiceStore.commit(
      { ...rerolled.event, type: "InitiativeGenerated" },
      rerolled.state,
    );
    await expect(generatedTwiceStore.restore()).rejects.toThrow(
      "Initiative Generate needs an empty initiative result.",
    );
  });
});
