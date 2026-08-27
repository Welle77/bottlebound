import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";

import {
  createSetup,
  finishTurn,
  generateInitiative,
  resolveBasicAttack,
  startMatch,
  undoLastEvent,
  type MatchState,
} from "../../src/domain/match";
import { createIndexedDbMatchStore } from "../../src/storage/match-store";
import {
  overwriteStoredEvent,
  randomQueue,
  readRawMatch,
  rewriteCurrentSnapshotAsRetiredSchema,
  rewriteStoredRulesVersion,
} from "./match-store.test-helpers";

describe("IndexedDbMatchStore", () => {
  it("atomically restores and undoes one redirected Action Resolution", async () => {
    const store = createIndexedDbMatchStore(new IDBFactory(), "restore-redirect");
    const setup = createSetup("match-redirect", "2026-08-22T14:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      randomQueue([19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10]),
      "2026-08-22T14:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-22T14:02:00.000Z");
    const firstInitiativeEntry = started.state.initiative.at(0);
    if (firstInitiativeEntry === undefined) {
      throw new Error("The test Match has no initiative entries.");
    }
    const sourceCharacterId = firstInitiativeEntry.characterId;
    const action = resolveBasicAttack(
      started.state,
      {
        sourceCharacterId,
        attackLegs: [
          { affectedCharacterIds: ["duergar-monk"] },
          { affectedCharacterIds: [sourceCharacterId, "drow-paladin"] },
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
    for (const result of [setup, generated, started]) {
      await store.commit(result.event, result.state);
    }
    const interruptedState = {
      ...action.state,
      interruptedWrite: () => undefined,
    };
    await expect(
      store.commit(action.event, interruptedState),
    ).rejects.toThrow();
    await expect(store.restore()).resolves.toEqual({
      state: started.state,
      events: [setup.event, generated.event, started.event],
      summary: null,
    });
    await store.commit(action.event, action.state);

    await expect(store.restore()).resolves.toEqual({
      state: action.state,
      events: [setup.event, generated.event, started.event, action.event],
      summary: null,
    });
    const undo = undoLastEvent(
      action.state,
      [setup.event, generated.event, started.event, action.event],
      { occurredAt: "2026-08-22T14:04:00.000Z", confirmed: true },
    );
    await store.commit(undo.event, undo.state);
    await expect(store.restore()).resolves.toEqual({
      state: undo.state,
      events: [
        setup.event,
        generated.event,
        started.event,
        action.event,
        undo.event,
      ],
      summary: null,
    });
  });

  it("atomically restores and repeatedly undoes an Action Resolution", async () => {
    const store = createIndexedDbMatchStore(new IDBFactory(), "restore-action");
    const setup = createSetup("match-1", "2026-08-22T14:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      randomQueue([19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10]),
      "2026-08-22T14:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-22T14:02:00.000Z");
    const firstInitiativeEntry = started.state.initiative.at(0);
    if (firstInitiativeEntry === undefined) {
      throw new Error("The test Match has no initiative entries.");
    }
    const action = resolveBasicAttack(
      started.state,
      {
        sourceCharacterId: firstInitiativeEntry.characterId,
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
      },
      "2026-08-22T14:03:00.000Z",
    );
    for (const result of [setup, generated, started, action]) {
      await store.commit(result.event, result.state);
    }

    await expect(store.restore()).resolves.toEqual({
      state: action.state,
      events: [setup.event, generated.event, started.event, action.event],
      summary: null,
    });
    expect(action.state.spentReactionIds).toEqual([
      "drow-paladin-divine-shield",
    ]);
    const firstUndo = undoLastEvent(
      action.state,
      [setup.event, generated.event, started.event, action.event],
      { occurredAt: "2026-08-22T14:04:00.000Z", confirmed: true },
    );
    await store.commit(firstUndo.event, firstUndo.state);
    expect(firstUndo.state).toEqual({ ...started.state, sequence: 5 });
    expect(firstUndo.state.spentReactionIds).toEqual([]);
    const secondUndo = undoLastEvent(
      firstUndo.state,
      [
        setup.event,
        generated.event,
        started.event,
        action.event,
        firstUndo.event,
      ],
      { occurredAt: "2026-08-22T14:05:00.000Z", confirmed: true },
    );
    await store.commit(secondUndo.event, secondUndo.state);
    await expect(store.restore()).resolves.toEqual({
      state: secondUndo.state,
      events: [
        setup.event,
        generated.event,
        started.event,
        action.event,
        firstUndo.event,
        secondUndo.event,
      ],
      summary: null,
    });
  });

  it("keeps the prior Action Resolution state when the next atomic write fails", async () => {
    const store = createIndexedDbMatchStore(new IDBFactory(), "failed-action");
    const setup = createSetup("match-1", "2026-08-22T14:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      randomQueue([19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10]),
      "2026-08-22T14:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-22T14:02:00.000Z");
    const firstInitiativeEntry = started.state.initiative.at(0);
    if (firstInitiativeEntry === undefined) {
      throw new Error("The test Match has no initiative entries.");
    }
    for (const result of [setup, generated, started])
      await store.commit(result.event, result.state);
    const action = resolveBasicAttack(
      started.state,
      {
        sourceCharacterId: firstInitiativeEntry.characterId,
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
    const interruptedState = {
      ...action.state,
      interruptedWrite: () => undefined,
    };
    await expect(
      store.commit(action.event, interruptedState),
    ).rejects.toThrow();
    await expect(store.restore()).resolves.toEqual({
      state: started.state,
      events: [setup.event, generated.event, started.event],
      summary: null,
    });
  });

  it("commits and restores the exact Setup snapshot and event sequence", async () => {
    const store = createIndexedDbMatchStore(new IDBFactory(), "restore-setup");
    const setup = createSetup("match-1", "2026-08-22T14:00:00.000Z");
    await store.commit(setup.event, setup.state);
    const generated = generateInitiative(
      setup.state,
      randomQueue([19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10]),
      "2026-08-22T14:01:00.000Z",
    );
    await store.commit(generated.event, generated.state);

    await expect(store.restore()).resolves.toEqual({
      state: generated.state,
      events: [setup.event, generated.event],
      summary: null,
    });
  });

  it("restores an internally consistent Match with an unavailable saved rules version", async () => {
    const factory = new IDBFactory();
    const databaseName = "restore-prior-rules";
    const store = createIndexedDbMatchStore(factory, databaseName);
    const setup = createSetup("match-1", "2026-08-22T14:00:00.000Z");
    await store.commit(setup.event, setup.state);
    await rewriteStoredRulesVersion(factory, databaseName, "BB-prior-release");

    const restored = await store.restore();

    expect(restored?.state.rulesVersion).toBe("BB-prior-release");
    expect(restored?.events).toHaveLength(1);
    expect(restored?.events[0]?.rulesVersion).toBe("BB-prior-release");
    expect(restored?.state).toEqual({
      ...setup.state,
      rulesVersion: "BB-prior-release",
    } satisfies MatchState);
  });

  it("restores an unavailable-version Match with combat history from recorded evidence", async () => {
    const factory = new IDBFactory();
    const databaseName = "restore-prior-rules-combat";
    const store = createIndexedDbMatchStore(factory, databaseName);
    const setup = createSetup("match-1", "2026-08-22T14:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      randomQueue([19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10]),
      "2026-08-22T14:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-22T14:02:00.000Z");
    const firstInitiativeEntry = started.state.initiative.at(0);
    if (firstInitiativeEntry === undefined) {
      throw new Error("The test Match has no initiative entries.");
    }
    const action = resolveBasicAttack(
      started.state,
      {
        sourceCharacterId: firstInitiativeEntry.characterId,
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
    for (const result of [setup, generated, started, action])
      await store.commit(result.event, result.state);
    await rewriteStoredRulesVersion(factory, databaseName, "BB-prior-release");

    const restored = await store.restore();
    if (!restored) throw new Error("The Match did not restore.");

    expect(restored.state.rulesVersion).toBe("BB-prior-release");
    expect(restored.events).toHaveLength(4);
    expect(
      restored.events.every(
        ({ rulesVersion }) => rulesVersion === "BB-prior-release",
      ),
    ).toBe(true);
    expect(restored.state).toEqual({
      ...action.state,
      rulesVersion: "BB-prior-release",
    });

    const undone = undoLastEvent(restored.state, restored.events, {
      occurredAt: "2026-08-22T14:04:00.000Z",
      confirmed: true,
    });
    await store.commit(undone.event, undone.state);
    await expect(store.restore()).resolves.toEqual({
      state: undone.state,
      events: [...restored.events, undone.event],
      summary: null,
    });
    expect(undone.state).toMatchObject({
      phase: "active",
      majorActionUsed: false,
      spentReactionIds: [],
      characters: started.state.characters.map(({ characterId, hp }) => ({
        characterId,
        hp,
      })),
    });

    const turned = finishTurn(
      undone.state as Extract<MatchState, { readonly phase: "active" }>,
      "2026-08-22T14:05:00.000Z",
    );
    await store.commit(turned.event, turned.state);
    await expect(store.restore()).resolves.toEqual({
      state: turned.state,
      events: [...restored.events, undone.event, turned.event],
      summary: null,
    });
  });

  it("rejects retired-schema persisted data through the public restore API without altering records", async () => {
    const factory = new IDBFactory();
    const databaseName = "retired-schema";
    const store = createIndexedDbMatchStore(factory, databaseName);
    const setup = createSetup("match-1", "2026-08-22T14:00:00.000Z");
    await store.commit(setup.event, setup.state);
    await rewriteCurrentSnapshotAsRetiredSchema(factory, databaseName);
    const before = await readRawMatch(factory, databaseName);

    await expect(store.restore()).rejects.toThrow(/canonical/i);
    await expect(readRawMatch(factory, databaseName)).resolves.toEqual(before);
  });

  it("keeps the last committed sequence when an atomic commit fails", async () => {
    const store = createIndexedDbMatchStore(new IDBFactory(), "failed-commit");
    const setup = createSetup("match-1", "2026-08-22T14:00:00.000Z");
    await store.commit(setup.event, setup.state);

    const generated = generateInitiative(
      setup.state,
      randomQueue([19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10]),
      "2026-08-22T14:01:00.000Z",
    );
    const uncloneableState = {
      ...generated.state,
      interruptedWrite: () => undefined,
    };
    await expect(
      store.commit(generated.event, uncloneableState),
    ).rejects.toThrow();
    await expect(store.restore()).resolves.toEqual({
      state: setup.state,
      events: [setup.event],
      summary: null,
    });
  });

  it("rejects incompatible, structurally invalid, and partial canonical data", async () => {
    const store = createIndexedDbMatchStore(new IDBFactory(), "invalid-data");
    const setup = createSetup("match-1", "2026-08-22T14:00:00.000Z");
    await store.commit(setup.event, setup.state);

    await expect(
      store.commit(
        { ...setup.event, sequence: 3 },
        { ...setup.state, sequence: 3 },
      ),
    ).rejects.toThrow();
    await expect(
      store.commit(setup.event, {
        ...setup.state,
        rulesVersion: "unsupported",
      }),
    ).rejects.toThrow("Match Event");
    await expect(
      store.commit(setup.event, {
        ...setup.state,
        characters: setup.state.characters.slice(1),
      }),
    ).rejects.toThrow("roster");
    const tied = generateInitiative(
      setup.state,
      randomQueue([
        ...Array.from({ length: 12 }, () => 19),
        ...Array.from({ length: 20 }, () => 0),
      ]),
      "2026-08-22T14:01:00.000Z",
    );
    await expect(
      store.commit({ ...tied.event, tieOrder: [] }, tied.state),
    ).rejects.toThrow("tied-group order");
    const firstTie = tied.event.tieOrder[0];
    const firstStep = firstTie?.steps[0];
    const firstAttempt = firstStep?.attempts[0];
    if (!firstTie || !firstStep || !firstAttempt) {
      throw new Error("The test expected a stored digital coin flip.");
    }
    await expect(
      store.commit(
        {
          ...tied.event,
          tieOrder: [
            {
              ...firstTie,
              steps: [
                {
                  ...firstStep,
                  attempts: [
                    {
                      ...firstAttempt,
                      flips: [
                        firstAttempt.flips[0] === "heads" ? "tails" : "heads",
                        ...firstAttempt.flips.slice(1),
                      ],
                    },
                    ...firstStep.attempts.slice(1),
                  ],
                },
                ...firstTie.steps.slice(1),
              ],
            },
            ...tied.event.tieOrder.slice(1),
          ],
        },
        tied.state,
      ),
    ).rejects.toThrow("digital coin-flip order");

    await expect(store.restore()).resolves.toEqual({
      state: setup.state,
      events: [setup.event],
      summary: null,
    });
  });

  it("rejects stored initiative history with corrupted digital coin flips", async () => {
    const factory = new IDBFactory();
    const databaseName = "corrupted-coin-flip";
    const store = createIndexedDbMatchStore(factory, databaseName);
    const setup = createSetup("match-1", "2026-08-22T14:00:00.000Z");
    await store.commit(setup.event, setup.state);
    const tied = generateInitiative(
      setup.state,
      randomQueue([
        ...Array.from({ length: 12 }, () => 19),
        ...Array.from({ length: 20 }, () => 0),
      ]),
      "2026-08-22T14:01:00.000Z",
    );
    await store.commit(tied.event, tied.state);
    const firstTie = tied.event.tieOrder[0];
    const firstStep = firstTie?.steps[0];
    const firstAttempt = firstStep?.attempts[0];
    if (!firstTie || !firstStep || !firstAttempt) {
      throw new Error("The test expected a stored digital coin flip.");
    }
    await overwriteStoredEvent(factory, databaseName, {
      ...tied.event,
      tieOrder: [
        {
          ...firstTie,
          steps: [
            {
              ...firstStep,
              attempts: [
                { ...firstAttempt, candidate: firstAttempt.candidate + 1 },
                ...firstStep.attempts.slice(1),
              ],
            },
            ...firstTie.steps.slice(1),
          ],
        },
        ...tied.event.tieOrder.slice(1),
      ],
    });

    await expect(store.restore()).rejects.toThrow("digital coin-flip order");
  });
});
