import { IDBFactory } from "fake-indexeddb";

import {
  createSetup,
  finishTurn,
  generateInitiative,
  resolveBasicAttack,
  startMatch,
  type ActiveMatchState,
  type MatchEvent,
  type MatchState,
} from "../domain/match";

export function randomQueue(values: number[]) {
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

export function overwriteStoredEvent(
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

export function rewriteStoredRulesVersion(
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

export function rewriteCurrentSnapshotAsLegacy(
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

export function readRawMatch(
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

export function simultaneousEliminationRun(matchId: string): {
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
