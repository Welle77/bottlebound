import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";

import {
  createSetup,
  finishTurn,
  generateInitiative,
  resolveAbility,
  resolveBasicAttack,
  restoreStateFromEvents,
  startMatch,
  undoLastEvent,
  type MatchEvent,
} from "../../src/domain/match";
import { createIndexedDbMatchStore } from "../../src/storage/match-store";
import {
  overwriteStoredEvent,
  randomQueue,
  readRawMatch,
  rewriteCurrentSnapshotAsPriorConfigurationSchema,
  rewriteCurrentSnapshotAsRetiredSchema,
  rewriteStoredConfigurationVersion,
} from "./match-store.test-helpers";
import {
  cast,
  CONFIRMATIONS,
  startedAuditMatch,
} from "../domain/match-rules-audit-fixtures";

describe("IndexedDbMatchStore", () => {
  it("restores, replays, and undoes an Attack Avoidance event", async () => {
    const store = createIndexedDbMatchStore(
      new IDBFactory(),
      "restore-avoidance",
    );
    const setup = createSetup("match-avoidance", "2026-08-22T14:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      randomQueue([19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10]),
      "2026-08-22T14:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-22T14:02:00.000Z");
    const sourceCharacterId = started.state.initiative[0]?.characterId;
    if (!sourceCharacterId) throw new Error("The test needs an active source.");
    const avoidance = resolveBasicAttack(
      started.state,
      {
        sourceCharacterId,
        affectedCharacterIds: ["drow-wizard"],
        physicalConfirmations: {
          range: true,
          lineOfSight: true,
          legalBottleContact: true,
          terrainContact: true,
        },
        reactions: [
          {
            reactionId: "drow-wizard-misty-escape",
            protectedCharacterId: "drow-wizard",
            override: null,
          },
        ],
        majorActionOverride: null,
      },
      "2026-08-22T14:03:00.000Z",
    );
    expect(avoidance.event.reactions[0]?.operations).toContainEqual({
      type: "prevent-damage-and-effects",
      characterId: "drow-wizard",
    });
    const history = [
      setup.event,
      generated.event,
      started.event,
      avoidance.event,
    ];
    expect(restoreStateFromEvents(history)).toEqual(avoidance.state);
    for (const result of [setup, generated, started, avoidance]) {
      await store.commit(result.event, result.state);
    }
    await expect(store.restore()).resolves.toEqual({
      state: avoidance.state,
      events: history,
      summary: null,
    });
    const undone = undoLastEvent(avoidance.state, history, {
      occurredAt: "2026-08-22T14:04:00.000Z",
      confirmed: true,
    });
    await store.commit(undone.event, undone.state);
    await expect(store.restore()).resolves.toEqual({
      state: undone.state,
      events: [...history, undone.event],
      summary: null,
    });
  });

  it("restores and undoes a Powerful Ability with its two-action cost", async () => {
    const store = createIndexedDbMatchStore(
      new IDBFactory(),
      "restore-powerful-action-cost",
    );
    const setup = createSetup(
      "match-powerful-action-cost",
      "2026-09-03T09:00:00.000Z",
    );
    const generated = generateInitiative(
      setup.state,
      randomQueue([10, 19, 11, 8, 7, 14, 11, 12, 10, 9, 6, 5]),
      "2026-09-03T09:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-09-03T09:02:00.000Z");
    let current = started.state;
    const events: MatchEvent[] = [setup.event, generated.event, started.event];
    while (
      current.initiative[current.activeSlot - 1]?.characterId !== "drow-rogue"
    ) {
      const finished = finishTurn(current, "2026-09-03T09:03:00.000Z");
      events.push(finished.event);
      current = finished.state;
    }
    const vanished = resolveAbility(
      current,
      { abilityId: "drow-rogue-vanish" },
      "2026-09-03T09:04:00.000Z",
    );
    const history = [...events, vanished.event];

    expect(vanished.event.actionCost).toBe(2);
    for (const [index, event] of history.entries()) {
      await store.commit(
        event,
        restoreStateFromEvents(history.slice(0, index + 1)),
      );
    }
    const restored = await store.restore();
    if (!restored) throw new Error("The Powerful Ability Match must restore.");
    expect(restored.state.actionsUsed).toBe(2);

    const undone = undoLastEvent(restored.state, restored.events, {
      occurredAt: "2026-09-03T09:05:00.000Z",
      confirmed: true,
    });
    await store.commit(undone.event, undone.state);
    await expect(store.restore()).resolves.toMatchObject({
      state: { actionsUsed: 0 },
    });
  });

  it("atomically restores and undoes one redirected Action Resolution", async () => {
    const store = createIndexedDbMatchStore(
      new IDBFactory(),
      "restore-redirect",
    );
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

  it("restores a physical Ability redirect when a Damage Block precedes Deflecting Palm", async () => {
    const store = createIndexedDbMatchStore(
      new IDBFactory(),
      "restore-ability-redirect-order",
    );
    const run = startedAuditMatch("match-ability-redirect-order");
    cast(run, "duergar-monk", {
      abilityName: "Stunning Strike",
      input: {
        attackLegs: [
          { affectedCharacterIds: ["duergar-monk", "drow-sorcerer"] },
          { affectedCharacterIds: ["drow-paladin"] },
        ],
        physicalConfirmations: CONFIRMATIONS,
        reactions: [
          {
            reactionId: "duergar-fighter-shield-wall",
            protectedCharacterId: "drow-sorcerer",
            override: null,
          },
          {
            reactionId: "duergar-monk-deflecting-palm",
            protectedCharacterId: "duergar-monk",
            override: null,
          },
        ],
      },
      step: 1,
    });
    const event = run.events.at(-1);
    if (!event || event.type !== "ActionResolved") {
      throw new Error("The test expected a physical Ability resolution.");
    }
    expect(event.attackLegs[1]?.redirectedByReactionId).toBe(
      "duergar-monk-deflecting-palm",
    );

    for (const [index, historyEvent] of run.events.entries()) {
      await store.commit(
        historyEvent,
        restoreStateFromEvents(run.events.slice(0, index + 1)),
      );
    }
    await expect(store.restore()).resolves.toMatchObject({
      events: run.events,
      state: run.state,
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

  it("restores a Match with a historical saved configuration version", async () => {
    const factory = new IDBFactory();
    const databaseName = "restore-prior-rules";
    const store = createIndexedDbMatchStore(factory, databaseName);
    const setup = createSetup("match-1", "2026-08-22T14:00:00.000Z");
    await store.commit(setup.event, setup.state);
    await rewriteStoredConfigurationVersion(
      factory,
      databaseName,
      "BB-prior-release",
    );

    await expect(store.restore()).resolves.toEqual({
      state: { ...setup.state, configurationVersion: "BB-prior-release" },
      events: [{ ...setup.event, configurationVersion: "BB-prior-release" }],
      summary: null,
    });
  });

  it("restores a historical-version Match with combat history from recorded evidence", async () => {
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
    await rewriteStoredConfigurationVersion(
      factory,
      databaseName,
      "BB-prior-release",
    );

    await expect(store.restore()).resolves.toEqual({
      state: { ...action.state, configurationVersion: "BB-prior-release" },
      events: [setup.event, generated.event, started.event, action.event].map(
        (event) => ({ ...event, configurationVersion: "BB-prior-release" }),
      ),
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

    await expect(store.restore()).rejects.toThrow(/validated/i);
    await expect(readRawMatch(factory, databaseName)).resolves.toEqual(before);
  });

  it("rejects the immediately prior persistence schema through the incompatibility path", async () => {
    const factory = new IDBFactory();
    const databaseName = "prior-configuration-schema";
    const store = createIndexedDbMatchStore(factory, databaseName);
    const setup = createSetup("match-1", "2026-08-22T14:00:00.000Z");
    await store.commit(setup.event, setup.state);
    await rewriteCurrentSnapshotAsPriorConfigurationSchema(
      factory,
      databaseName,
    );
    const before = await readRawMatch(factory, databaseName);

    await expect(store.restore()).rejects.toThrow(/validated/i);
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

  it("rejects incompatible, structurally invalid, and partial validated data", async () => {
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
        configurationVersion: "unsupported",
        characters: setup.state.characters.slice(1),
      }),
    ).rejects.toThrow("configuration version is incompatible");
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
    const [firstTie] = tied.event.tieOrder;
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
    const [firstTie] = tied.event.tieOrder;
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
