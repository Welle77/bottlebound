import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";

import {
  acknowledgeElimination,
  createSetup,
  endMatch,
  finishTurn,
  generateInitiative,
  reopenMatch,
  resolveBasicAttack,
  ruleSimultaneousElimination,
  startMatch,
  undoLastEvent,
  type ActiveMatchState,
  type MatchEvent,
  type MatchState,
} from "../domain/match";
import { IndexedDbMatchStore } from "./match-store";

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

function overwriteStoredEvent(
  factory: IDBFactory,
  databaseName: string,
  event: MatchEvent,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const open = factory.open(databaseName);
    open.addEventListener("error", () => reject(open.error), { once: true });
    open.addEventListener(
      "success",
      () => {
        const transaction = open.result.transaction("events", "readwrite");
        transaction.objectStore("events").put(event);
        transaction.addEventListener("complete", () => resolve(), {
          once: true,
        });
        transaction.addEventListener("error", () => reject(transaction.error), {
          once: true,
        });
      },
      { once: true },
    );
  });
}

function rewriteStoredRulesVersion(
  factory: IDBFactory,
  databaseName: string,
  rulesVersion: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const open = factory.open(databaseName);
    open.addEventListener("error", () => reject(open.error), { once: true });
    open.addEventListener(
      "success",
      () => {
        const database = open.result;
        const transaction = database.transaction(
          ["metadata", "snapshots", "events"],
          "readwrite",
        );
        const rewriteAll = (storeName: string) => {
          const store = transaction.objectStore(storeName);
          const request = store.getAll();
          request.addEventListener("success", () => {
            for (const value of request.result as Array<
              Record<string, unknown>
            >) {
              const rewritten = { ...value, rulesVersion };
              if (storeName === "metadata") {
                store.put(rewritten, "current-match");
              } else {
                store.put(rewritten);
              }
            }
          });
        };
        rewriteAll("metadata");
        rewriteAll("snapshots");
        rewriteAll("events");
        transaction.addEventListener("complete", () => resolve(), {
          once: true,
        });
        transaction.addEventListener("error", () => reject(transaction.error), {
          once: true,
        });
      },
      { once: true },
    );
  });
}

function rewriteCurrentSnapshotAsLegacy(
  factory: IDBFactory,
  databaseName: string,
  mutate: (snapshot: Record<string, unknown>) => void = () => undefined,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const open = factory.open(databaseName);
    open.addEventListener("error", () => reject(open.error), { once: true });
    open.addEventListener(
      "success",
      () => {
        const transaction = open.result.transaction(
          ["metadata", "snapshots"],
          "readwrite",
        );
        const metadata = transaction.objectStore("metadata");
        const metadataRequest = metadata.get("current-match");
        metadataRequest.addEventListener("success", () => {
          metadata.put(
            { ...metadataRequest.result, schemaVersion: 2 },
            "current-match",
          );
        });
        const snapshots = transaction.objectStore("snapshots");
        const snapshotRequest = snapshots.getAll();
        snapshotRequest.addEventListener("success", () => {
          const snapshot = { ...snapshotRequest.result[0], schemaVersion: 2 };
          for (const key of [
            "spentReactionIds",
            "majorActionUsed",
            "eliminatedTeams",
            "acknowledgedEliminations",
            "outcome",
          ]) {
            delete snapshot[key];
          }
          mutate(snapshot);
          snapshots.put(snapshot);
        });
        transaction.addEventListener("complete", () => resolve(), {
          once: true,
        });
        transaction.addEventListener("error", () => reject(transaction.error), {
          once: true,
        });
      },
      { once: true },
    );
  });
}

function readRawMatch(
  factory: IDBFactory,
  databaseName: string,
): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const open = factory.open(databaseName);
    open.addEventListener("error", () => reject(open.error), { once: true });
    open.addEventListener(
      "success",
      () => {
        const transaction = open.result.transaction(
          ["metadata", "snapshots", "events"],
          "readonly",
        );
        const requests = [
          transaction.objectStore("metadata").get("current-match"),
          transaction.objectStore("snapshots").getAll(),
          transaction.objectStore("events").getAll(),
        ];
        transaction.addEventListener(
          "complete",
          () => resolve(requests.map(({ result }) => result)),
          { once: true },
        );
        transaction.addEventListener("error", () => reject(transaction.error), {
          once: true,
        });
      },
      { once: true },
    );
  });
}

function simultaneousEliminationRun(matchId: string): {
  results: Array<{ event: MatchEvent; state: MatchState }>;
  finalState: ActiveMatchState;
} {
  const setup = createSetup(matchId, "2026-08-22T14:00:00.000Z");
  const generated = generateInitiative(
    setup.state,
    randomQueue([19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10]),
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
  const results: Array<{ event: MatchEvent; state: MatchState }> = [
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
    results.push(attacked);
    current = attacked.state;
    if (index < affectedLists.length - 1) {
      const turned = finishTurn(
        current,
        `2026-08-22T14:${String(4 + index * 2).padStart(2, "0")}:00.000Z`,
      );
      results.push(turned);
      current = turned.state;
    }
  });
  return { results, finalState: current };
}

describe("IndexedDbMatchStore", () => {
  it("atomically restores and undoes one redirected Action Resolution", async () => {
    const store = new IndexedDbMatchStore(new IDBFactory(), "restore-redirect");
    const setup = createSetup("match-redirect", "2026-08-22T14:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      randomQueue([19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10]),
      "2026-08-22T14:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-22T14:02:00.000Z");
    const sourceCharacterId = started.state.initiative[0]!.characterId;
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
    });
    await store.commit(action.event, action.state);

    await expect(store.restore()).resolves.toEqual({
      state: action.state,
      events: [setup.event, generated.event, started.event, action.event],
    });
    const undo = undoLastEvent(
      action.state,
      [setup.event, generated.event, started.event, action.event],
      "2026-08-22T14:04:00.000Z",
      true,
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
    });
  });

  it("atomically restores and repeatedly undoes an Action Resolution", async () => {
    const store = new IndexedDbMatchStore(new IDBFactory(), "restore-action");
    const setup = createSetup("match-1", "2026-08-22T14:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      randomQueue([19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10]),
      "2026-08-22T14:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-22T14:02:00.000Z");
    const action = resolveBasicAttack(
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
    });
    expect(action.state.spentReactionIds).toEqual([
      "drow-paladin-divine-shield",
    ]);
    const firstUndo = undoLastEvent(
      action.state,
      [setup.event, generated.event, started.event, action.event],
      "2026-08-22T14:04:00.000Z",
      true,
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
      "2026-08-22T14:05:00.000Z",
      true,
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
    });
  });

  it("keeps the prior Action Resolution state when the next atomic write fails", async () => {
    const store = new IndexedDbMatchStore(new IDBFactory(), "failed-action");
    const setup = createSetup("match-1", "2026-08-22T14:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      randomQueue([19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10]),
      "2026-08-22T14:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-22T14:02:00.000Z");
    for (const result of [setup, generated, started])
      await store.commit(result.event, result.state);
    const action = resolveBasicAttack(
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
    });
  });

  it("commits and restores the exact Setup snapshot and event sequence", async () => {
    const store = new IndexedDbMatchStore(new IDBFactory(), "restore-setup");
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
    });
  });

  it("restores an internally consistent Match with an unavailable saved rules version", async () => {
    const factory = new IDBFactory();
    const databaseName = "restore-prior-rules";
    const store = new IndexedDbMatchStore(factory, databaseName);
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
    const store = new IndexedDbMatchStore(factory, databaseName);
    const setup = createSetup("match-1", "2026-08-22T14:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      randomQueue([19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10]),
      "2026-08-22T14:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-22T14:02:00.000Z");
    const action = resolveBasicAttack(
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
    for (const result of [setup, generated, started, action])
      await store.commit(result.event, result.state);
    await rewriteStoredRulesVersion(factory, databaseName, "BB-prior-release");

    const restored = await store.restore();

    expect(restored?.state.rulesVersion).toBe("BB-prior-release");
    expect(restored?.events).toHaveLength(4);
    expect(
      restored?.events.every(
        ({ rulesVersion }) => rulesVersion === "BB-prior-release",
      ),
    ).toBe(true);
    expect(restored?.state).toEqual({
      ...action.state,
      rulesVersion: "BB-prior-release",
    });

    const undone = undoLastEvent(
      restored!.state,
      restored!.events,
      "2026-08-22T14:04:00.000Z",
      true,
    );
    await store.commit(undone.event, undone.state);
    await expect(store.restore()).resolves.toEqual({
      state: undone.state,
      events: [...restored!.events, undone.event],
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
      undone.state as Extract<MatchState, { phase: "active" }>,
      "2026-08-22T14:05:00.000Z",
    );
    await store.commit(turned.event, turned.state);
    await expect(store.restore()).resolves.toEqual({
      state: turned.state,
      events: [...restored!.events, undone.event, turned.event],
    });
  });

  it("atomically migrates Setup and Active schema-2 Matches without losing state or history", async () => {
    for (const phase of ["setup", "active"] as const) {
      const factory = new IDBFactory();
      const databaseName = `migrate-${phase}`;
      const store = new IndexedDbMatchStore(factory, databaseName);
      const setup = createSetup("match-1", "2026-08-22T14:00:00.000Z");
      const generated = generateInitiative(
        setup.state,
        randomQueue([19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10]),
        "2026-08-22T14:01:00.000Z",
      );
      const results =
        phase === "active"
          ? [
              setup,
              generated,
              startMatch(generated.state, "2026-08-22T14:02:00.000Z"),
            ]
          : [setup, generated];
      for (const result of results)
        await store.commit(result.event, result.state);
      await rewriteCurrentSnapshotAsLegacy(factory, databaseName);

      const restored = await store.restore();

      expect(restored?.state).toMatchObject({
        schemaVersion: 3,
        phase,
        sequence: results.length + 1,
        spentReactionIds: [],
        majorActionUsed: false,
        eliminatedTeams: [],
        acknowledgedEliminations: [],
        outcome: null,
      });
      expect(restored?.events.slice(0, results.length)).toEqual(
        results.map(({ event }) => event),
      );
      expect(restored?.events.at(-1)).toMatchObject({
        type: "MatchMigrated",
        sequence: results.length + 1,
        fromSchemaVersion: 2,
        toSchemaVersion: 3,
      });
      await expect(store.restore()).resolves.toEqual(restored);
    }
  });

  it("leaves every schema-2 record unchanged when migration validation fails", async () => {
    const factory = new IDBFactory();
    const databaseName = "failed-migration";
    const store = new IndexedDbMatchStore(factory, databaseName);
    const setup = createSetup("match-1", "2026-08-22T14:00:00.000Z");
    await store.commit(setup.event, setup.state);
    await rewriteCurrentSnapshotAsLegacy(factory, databaseName, (snapshot) => {
      snapshot.characters = [];
    });
    const before = await readRawMatch(factory, databaseName);

    await expect(store.restore()).rejects.toThrow("Match State");
    await expect(readRawMatch(factory, databaseName)).resolves.toEqual(before);
  });

  it("keeps the last committed sequence when an atomic commit fails", async () => {
    const store = new IndexedDbMatchStore(new IDBFactory(), "failed-commit");
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
    });
  });

  it("rejects incompatible, structurally invalid, and partial canonical data", async () => {
    const store = new IndexedDbMatchStore(new IDBFactory(), "invalid-data");
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
    });
  });

  it("rejects stored initiative history with corrupted digital coin flips", async () => {
    const factory = new IDBFactory();
    const databaseName = "corrupted-coin-flip";
    const store = new IndexedDbMatchStore(factory, databaseName);
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

  it("needs confirmation and then removes the Match and all history", async () => {
    const store = new IndexedDbMatchStore(new IDBFactory(), "delete-match");
    const setup = createSetup("match-1", "2026-08-22T14:00:00.000Z");
    await store.commit(setup.event, setup.state);

    await expect(store.deleteMatch("match-1", false)).rejects.toThrow(
      "Discard confirmation is required.",
    );
    await expect(store.restore()).resolves.not.toBeNull();

    await store.deleteMatch("match-1", true);
    await expect(store.restore()).resolves.toBeNull();
  });

  it("atomically commits and restores the exact Active Match", async () => {
    const store = new IndexedDbMatchStore(new IDBFactory(), "restore-active");
    const setup = createSetup("match-1", "2026-08-22T14:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      randomQueue([19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10]),
      "2026-08-22T14:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-22T14:02:00.000Z");
    const advanced = finishTurn(started.state, "2026-08-22T14:03:00.000Z");

    for (const result of [setup, generated, started, advanced]) {
      await store.commit(result.event, result.state);
    }

    await expect(store.restore()).resolves.toEqual({
      state: advanced.state,
      events: [setup.event, generated.event, started.event, advanced.event],
    });
  });

  it("restores Continue, End Game, Reopen, Undo, and confirmed Ended Match removal exactly", async () => {
    const factory = new IDBFactory();
    const store = new IndexedDbMatchStore(factory, "elimination-lifecycle");
    const setup = createSetup("match-elimination", "2026-08-22T14:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      randomQueue([19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10]),
      "2026-08-22T14:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-22T14:02:00.000Z");
    const results: Array<{ event: MatchEvent; state: MatchState }> = [
      setup,
      generated,
      started,
    ];
    let current = started.state;
    for (let attackIndex = 0; attackIndex < 5; attackIndex += 1) {
      const attack = resolveBasicAttack(
        current,
        {
          sourceCharacterId: started.state.initiative[0]!.characterId,
          affectedCharacterIds: started.state.characters
            .filter(({ characterId }) => characterId.startsWith("duergar-"))
            .map(({ characterId }) => characterId),
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
      results.push(attack);
    }
    for (const result of results)
      await store.commit(result.event, result.state);

    const continued = acknowledgeElimination(
      current,
      "Duergar",
      "2026-08-22T14:08:00.000Z",
    );
    await store.commit(continued.event, continued.state);
    await expect(store.restore()).resolves.toEqual({
      state: continued.state,
      events: [...results.map(({ event }) => event), continued.event],
    });
    const undone = undoLastEvent(
      continued.state,
      [...results.map(({ event }) => event), continued.event],
      "2026-08-22T14:09:00.000Z",
      true,
    );
    await store.commit(undone.event, undone.state);
    const ended = endMatch(
      undone.state as typeof current,
      "2026-08-22T14:10:00.000Z",
      true,
    );
    await store.commit(ended.event, ended.state);
    const reopened = reopenMatch(ended.state, "2026-08-22T14:11:00.000Z");
    await store.commit(reopened.event, reopened.state);
    const endedAgain = endMatch(
      reopened.state,
      "2026-08-22T14:12:00.000Z",
      true,
    );
    await store.commit(endedAgain.event, endedAgain.state);
    await expect(store.restore()).resolves.toEqual({
      state: endedAgain.state,
      events: [
        ...results.map(({ event }) => event),
        continued.event,
        undone.event,
        ended.event,
        reopened.event,
        endedAgain.event,
      ],
    });
    await store.deleteMatch(endedAgain.state.matchId, true);
    await expect(store.restore()).resolves.toBeNull();
  });

  it.each(["Drow", "Duergar", "draw"] as const)(
    "atomically restores a %s simultaneous ruling, End Game, Reopen, and Undo",
    async (outcome) => {
      const factory = new IDBFactory();
      const store = new IndexedDbMatchStore(factory, `simultaneous-${outcome}`);
      const { results, finalState } = simultaneousEliminationRun(
        `match-simultaneous-${outcome}`,
      );
      for (const result of results)
        await store.commit(result.event, result.state);
      expect(finalState).toMatchObject({
        eliminatedTeams: ["Drow", "Duergar"],
        outcome: null,
      });

      const ruled = ruleSimultaneousElimination(
        finalState,
        outcome,
        "The authoritative rules do not define simultaneous Team Elimination; the referee selected this override.",
        "2026-08-22T14:20:00.000Z",
      );
      await store.commit(ruled.event, ruled.state);
      await expect(store.restore()).resolves.toEqual({
        state: ruled.state,
        events: [...results.map(({ event }) => event), ruled.event],
      });

      const ended = endMatch(ruled.state, "2026-08-22T14:09:00.000Z", true);
      await store.commit(ended.event, ended.state);
      const reopened = reopenMatch(ended.state, "2026-08-22T14:10:00.000Z");
      await store.commit(reopened.event, reopened.state);
      const history = [
        ...results.map(({ event }) => event),
        ruled.event,
        ended.event,
        reopened.event,
      ];
      const undone = undoLastEvent(
        reopened.state,
        history,
        "2026-08-22T14:11:00.000Z",
        true,
      );
      await store.commit(undone.event, undone.state);
      await expect(store.restore()).resolves.toEqual({
        state: undone.state,
        events: [...history, undone.event],
      });
    },
  );

  it("keeps the unresolved simultaneous result when ruling storage fails", async () => {
    const store = new IndexedDbMatchStore(
      new IDBFactory(),
      "failed-simultaneous-ruling",
    );
    const { results, finalState: current } = simultaneousEliminationRun(
      "match-failed-simultaneous",
    );
    expect(current).toMatchObject({
      eliminatedTeams: ["Drow", "Duergar"],
      outcome: null,
    });
    for (const result of results)
      await store.commit(result.event, result.state);
    const ruled = ruleSimultaneousElimination(
      current,
      "draw",
      "The referee selected draw because the rules do not define this outcome.",
      "2026-08-22T14:04:00.000Z",
    );
    const interruptedState = {
      ...ruled.state,
      interruptedWrite: () => undefined,
    };

    await expect(store.commit(ruled.event, interruptedState)).rejects.toThrow();
    await expect(store.restore()).resolves.toEqual({
      state: current,
      events: results.map(({ event }) => event),
    });
  });

  it("keeps the last committed Active Match when Finish Turn fails", async () => {
    const store = new IndexedDbMatchStore(new IDBFactory(), "failed-finish");
    const setup = createSetup("match-1", "2026-08-22T14:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      randomQueue([19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10]),
      "2026-08-22T14:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-22T14:02:00.000Z");
    for (const result of [setup, generated, started]) {
      await store.commit(result.event, result.state);
    }
    const advanced = finishTurn(started.state, "2026-08-22T14:03:00.000Z");

    const interruptedState = {
      ...advanced.state,
      interruptedWrite: () => undefined,
    };
    await expect(
      store.commit(advanced.event, interruptedState),
    ).rejects.toThrow();
    await expect(store.restore()).resolves.toEqual({
      state: started.state,
      events: [setup.event, generated.event, started.event],
    });
  });

  it("atomically appends Undo history and restores its exact snapshot", async () => {
    const factory = new IDBFactory();
    const store = new IndexedDbMatchStore(factory, "restore-undo");
    const setup = createSetup("match-1", "2026-08-22T14:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      randomQueue([19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10]),
      "2026-08-22T14:01:00.000Z",
    );
    const started = startMatch(generated.state, "2026-08-22T14:02:00.000Z");
    const history = [setup.event, generated.event, started.event];
    for (const result of [setup, generated, started]) {
      await store.commit(result.event, result.state);
    }
    const undone = undoLastEvent(
      started.state,
      history,
      "2026-08-22T14:03:00.000Z",
      true,
    );

    await store.commit(undone.event, undone.state);

    const restarted = new IndexedDbMatchStore(factory, "restore-undo");
    await expect(restarted.restore()).resolves.toEqual({
      state: undone.state,
      events: [...history, undone.event],
    });
  });

  it("keeps the last committed Match when the Undo transaction fails", async () => {
    const store = new IndexedDbMatchStore(new IDBFactory(), "failed-undo");
    const setup = createSetup("match-1", "2026-08-22T14:00:00.000Z");
    const generated = generateInitiative(
      setup.state,
      randomQueue([19, 19, 18, 18, 17, 14, 12, 11, 12, 11, 11, 10]),
      "2026-08-22T14:01:00.000Z",
    );
    const history = [setup.event, generated.event];
    for (const result of [setup, generated]) {
      await store.commit(result.event, result.state);
    }
    const undone = undoLastEvent(
      generated.state,
      history,
      "2026-08-22T14:02:00.000Z",
      true,
    );
    const uncloneableEvent = {
      ...undone.event,
      interruptedWrite: () => undefined,
    };

    await expect(
      store.commit(uncloneableEvent, undone.state),
    ).rejects.toThrow();
    await expect(store.restore()).resolves.toEqual({
      state: generated.state,
      events: history,
    });
  });
});
