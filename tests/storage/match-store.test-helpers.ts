import * as z from "zod";

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

const persistedRecordSchema = z.record(z.string(), z.unknown());
type UnknownValueList = readonly unknown[];

function rewriteStoreRecords(
  transaction: IDBTransaction,
  storeName: string,
  configurationVersion: string,
): void {
  const store = transaction.objectStore(storeName);
  const request = store.getAll();
  request.addEventListener("success", () => {
    for (const value of persistedRecordSchema.array().parse(request.result)) {
      const rewritten = { ...value, configurationVersion };
      if (storeName === "metadata") store.put(rewritten, "current-match");
      else store.put(rewritten);
    }
  });
}

function rewriteRetiredSnapshots(
  store: IDBObjectStore,
  request: IDBRequest,
): void {
  request.addEventListener("success", () => {
    const retiredKeys = new Set([
      "spentReactionIds",
      "majorActionUsed",
      "eliminatedTeams",
      "acknowledgedEliminations",
      "outcome",
    ]);
    const snapshots = request.result as UnknownValueList;
    for (const rawSnapshot of snapshots) {
      const source = rawSnapshot as Record<string, unknown>;
      const retiredSchemaSnapshot = Object.fromEntries(
        Object.entries(source).filter(([key]) => !retiredKeys.has(key)),
      );
      store.put({ ...retiredSchemaSnapshot, schemaVersion: 2 });
    }
  });
}

function requestResults(
  requests: readonly { readonly result: unknown }[],
): readonly unknown[] {
  return requests.map((request) => {
    const { result } = request;
    return result;
  });
}

function createQueueCursor(values: readonly number[]) {
  let position = 0;
  return {
    take(): number {
      const value = values[position];
      if (value === undefined) throw new Error("Missing test random value.");
      position += 1;
      return value;
    },
  };
}

export function randomQueue(values: readonly number[]): RandomSource {
  const cursor = createQueueCursor(values);
  return {
    nextUint32: () => {
      return cursor.take();
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
    open.addEventListener(
      "error",
      () => {
        reject(open.error ?? new Error("The Match database could not open."));
      },
      { once: true },
    );
    open.addEventListener(
      "success",
      () => {
        const transaction = open.result.transaction("events", "readwrite");
        transaction.objectStore("events").put(event);
        transaction.addEventListener(
          "complete",
          () => {
            resolve();
          },
          {
            once: true,
          },
        );
        transaction.addEventListener(
          "error",
          () => {
            reject(
              transaction.error ??
                new Error("The IndexedDB transaction failed."),
            );
          },
          { once: true },
        );
      },
      { once: true },
    );
  });
}

export function rewriteStoredConfigurationVersion(
  factory: IDBFactory,
  databaseName: string,
  configurationVersion: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const open = factory.open(databaseName);
    open.addEventListener(
      "error",
      () => {
        reject(open.error ?? new Error("The Match database could not open."));
      },
      { once: true },
    );
    open.addEventListener(
      "success",
      () => {
        const database = open.result;
        const transaction = database.transaction(
          ["metadata", "snapshots", "events"],
          "readwrite",
        );
        rewriteStoreRecords(transaction, "metadata", configurationVersion);
        rewriteStoreRecords(transaction, "snapshots", configurationVersion);
        rewriteStoreRecords(transaction, "events", configurationVersion);
        transaction.addEventListener(
          "complete",
          () => {
            resolve();
          },
          {
            once: true,
          },
        );
        transaction.addEventListener(
          "error",
          () => {
            reject(
              transaction.error ??
                new Error("The IndexedDB transaction failed."),
            );
          },
          { once: true },
        );
      },
      { once: true },
    );
  });
}

/**
 * Rewrites the persisted Match into the retired schema-2 on-disk shape:
 * schema version 2 in metadata and snapshot with the combat-state keys the
 * retired format did not store. Used to prove restore() rejects it.
 */
export function rewriteCurrentSnapshotAsRetiredSchema(
  factory: IDBFactory,
  databaseName: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const open = factory.open(databaseName);
    open.addEventListener(
      "error",
      () => {
        reject(open.error ?? new Error("The Match database could not open."));
      },
      { once: true },
    );
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
        rewriteRetiredSnapshots(snapshots, snapshotRequest);
        transaction.addEventListener(
          "complete",
          () => {
            resolve();
          },
          {
            once: true,
          },
        );
        transaction.addEventListener(
          "error",
          () => {
            reject(
              transaction.error ??
                new Error("The IndexedDB transaction failed."),
            );
          },
          { once: true },
        );
      },
      { once: true },
    );
  });
}

/** Rewrites current records to the immediately prior T02 schema number. */
export function rewriteCurrentSnapshotAsPriorConfigurationSchema(
  factory: IDBFactory,
  databaseName: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const open = factory.open(databaseName);
    open.addEventListener(
      "error",
      () => {
        reject(open.error ?? new Error("The Match database could not open."));
      },
      { once: true },
    );
    open.addEventListener(
      "success",
      () => {
        const transaction = open.result.transaction(
          ["metadata", "snapshots"],
          "readwrite",
        );
        for (const storeName of ["metadata", "snapshots"]) {
          const store = transaction.objectStore(storeName);
          const request = store.getAll();
          request.addEventListener("success", () => {
            for (const value of persistedRecordSchema
              .array()
              .parse(request.result)) {
              const rewritten = { ...value, schemaVersion: 3 };
              if (storeName === "metadata") {
                store.put(rewritten, "current-match");
              } else {
                store.put(rewritten);
              }
            }
          });
        }
        transaction.addEventListener(
          "complete",
          () => {
            resolve();
          },
          {
            once: true,
          },
        );
        transaction.addEventListener(
          "error",
          () => {
            reject(
              transaction.error ??
                new Error("The IndexedDB transaction failed."),
            );
          },
          { once: true },
        );
      },
      { once: true },
    );
  });
}

export function readRawMatch(
  factory: IDBFactory,
  databaseName: string,
): Promise<readonly unknown[]> {
  return new Promise((resolve, reject) => {
    const open = factory.open(databaseName);
    open.addEventListener(
      "error",
      () => {
        reject(open.error ?? new Error("The Match database could not open."));
      },
      { once: true },
    );
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
          () => {
            resolve(requestResults(requests));
          },
          { once: true },
        );
        transaction.addEventListener(
          "error",
          () => {
            reject(
              transaction.error ??
                new Error("The IndexedDB transaction failed."),
            );
          },
          { once: true },
        );
      },
      { once: true },
    );
  });
}

export function simultaneousEliminationRun(matchId: string): {
  readonly results: readonly {
    readonly event: MatchEvent;
    readonly state: MatchState;
  }[];
  readonly finalState: ActiveMatchState;
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
  const initialResults: readonly {
    readonly event: MatchEvent;
    readonly state: MatchState;
  }[] = [setup, generated, started];
  const { results, current } = affectedLists.reduce<{
    readonly results: readonly {
      readonly event: MatchEvent;
      readonly state: MatchState;
    }[];
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
      const attackedResults = [...progress.results, attacked];
      if (index < affectedLists.length - 1) {
        const turned = finishTurn(
          attacked.state,
          `2026-08-22T14:${String(4 + index * 2).padStart(2, "0")}:00.000Z`,
        );
        return { results: [...attackedResults, turned], current: turned.state };
      }
      return { results: attackedResults, current: attacked.state };
    },
    { results: initialResults, current: started.state },
  );
  return { results, finalState: current };
}
