import { IDBFactory } from "fake-indexeddb";

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
} from "../../src/domain/match";

function createQueueCursor(values: readonly number[]) {
  let position = 0;
  return {
    take(): number | undefined {
      const value = values[position];
      position += 1;
      return value;
    },
  };
}

export function randomQueue(values: readonly number[]) {
  const cursor = createQueueCursor(values);
  return {
    nextUint32: () => {
      const value = cursor.take();
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

export function rewriteStoredRulesVersion(
  factory: IDBFactory,
  databaseName: string,
  rulesVersion: string,
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
        const rewriteAll = (storeName: string) => {
          const store = transaction.objectStore(storeName);
          const request = store.getAll();
          request.addEventListener("success", () => {
            for (const value of request.result as readonly Record<
              string,
              unknown
            >[]) {
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
        snapshotRequest.addEventListener("success", () => {
          // Retired schema-2 combat keys are omitted by rebuilding instead of
          // mutating the parsed record.
          const retiredKeys: ReadonlySet<string> = new Set([
            "spentReactionIds",
            "majorActionUsed",
            "eliminatedTeams",
            "acknowledgedEliminations",
            "outcome",
          ]);
          for (const rawSnapshot of snapshotRequest.result) {
            const source = rawSnapshot as Record<string, unknown>;
            const retiredSchemaSnapshot: Record<string, unknown> =
              Object.fromEntries(
                Object.entries(source).filter(([key]) => !retiredKeys.has(key)),
              );
            snapshots.put({ ...retiredSchemaSnapshot, schemaVersion: 2 });
          }
        });
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
            const results = requests.map(({ result }): unknown => result);
            resolve(results);
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
